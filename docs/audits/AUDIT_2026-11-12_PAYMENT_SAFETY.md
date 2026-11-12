# Payment-Safety Audit, 2026-11-12

Branch `fix/payment-safety-audit-2026-11-12`, stacked on `feat/hardening-and-demo-updates` (`d4c929f`, which sits on `main` `8ff3e6a`).
Every money path stays **PayPal Sandbox only**. No live PayPal call was made during this audit. Payment flows were exercised in SIMULATION mode, and against a mocked `fetch` where a real PayPal response shape was needed.

## Method

1. **Baseline.** Checked out `origin/main` in a separate git worktree, so the parallel agent's uncommitted work was never touched. Ran the gates there first: all green, 209 tests.
2. **Review.** Two read-only specialist reviews ran in parallel, one on payments/API/security and one on frontend/UX. I verified each finding against the code before acting on it. Findings I could not reproduce were dropped.
3. **Regression tests.** Every fix has a test in `tests/audit-regressions.test.ts`. I ran that file against the original code by stashing `src`: 19 of 21 fail before the fixes and 21 of 21 pass after. Two pass before the fix, for documented reasons: see AUD-001 and AUD-011.
4. **Runtime check.** Built the app and ran `next start` in production mode. I then walked the judge journey over HTTP with `ALLOW_PUBLIC_DEMO_WRITES=true` and a throwaway `RECEIPT_SIGNING_SECRET`, which mirrors what `render.yaml` provides.

## Findings and fixes

| ID | Sev | Area | Defect (reproduced) | Root cause | Fix | Status |
|---|---|---|---|---|---|---|
| AUD-001 | P1 | Payments | Morning-run **ALLOW** drafts (`approvedByOwner:false`) could be ordered and captured without the owner. | `createOrderForRestock` checked approval only for `ASK` lines. | Every PO needs `approvedByOwner`; capture re-checks. `/demo` shows Owner Approve for any unapproved, non-BLOCK draft. | VERIFIED |
| AUD-002 | P1 | Payments | Two overlapping `CAPTURE_ORDER` calls both counted spend and on-order stock. | Status checked before `await`, mutated after; no serialization. | Per-PO `withPaymentLock` (second caller gets HTTP 409); a single `applyCapture()` counts spend only on the transition into CAPTURED. | VERIFIED |
| AUD-003 | P1 | Payments | `RECONCILE` marked any claim CAPTURED (an unpaid order, or a REFUNDED one) without counting spend. A REFUNDED claim could be re-captured and refunded twice. | No state precondition; simulated branch set the status blindly. | Only `UNKNOWN` and `CAPTURE_PENDING` can be reconciled; uses `applyCapture()` and a ledger row labelled SIMULATION. | VERIFIED |
| AUD-004 | P2 | Payments | An `UNKNOWN` claim (PayPal outcome not known) could be replaced by a fresh order, losing a possible capture. | Double-create guard omitted `UNKNOWN`. | `UNKNOWN` added: reconcile instead of re-create. | VERIFIED |
| AUD-005 | P1 | Evidence integrity | Simulated read-back returned an invented `status: COMPLETED`, a hard-coded `$868.00` and a fresh timestamp for **any** id. | Fixture response instead of local state. | Returns the stored local claim, labelled `mode: SIMULATION`, `paypalReadBack: false`; unknown id gives `NOT_FOUND`. | VERIFIED |
| AUD-006 | P1 | Authorization | Escrow `CAPTURE`/`VOID` and above-threshold (`NEEDS_APPROVAL`) holds were reachable on the public sandbox-demo path. | Route only blocked `!allowed`; `NEEDS_APPROVAL` treated as allowed. | Strict `api-guard` (operator key in production) for settlement and `NEEDS_APPROVAL`. | VERIFIED |
| AUD-007 | P1 | Authorization | Dispute `ACCEPT_CLAIM`/`MAKE_OFFER` executed with no human approval. | Default action executed. | Execution requires the operator; `TRIAGE_ONLY` stays public. | VERIFIED |
| AUD-008 | P2 | Integrity | A client-supplied `SIM-` id switched a real-token call into fabricated "success". | `isSimulated` derived from the id prefix. | Simulation is decided from the server's token only. | VERIFIED |
| AUD-009 | P2 | Payments | Escrow capture skipped the authorized-amount cap when PayPal's authorization read failed (fail-open). | Cap was conditional on a successful read. | Fails closed with HTTP 502; no capture. | VERIFIED |
| AUD-010 | P1 | Evidence integrity | Judge test bar showed invented PayPal ids (`ORD-2026-LIVE`, `SANDBOX-DEBUG-ID-OK`, `AUTH-2026-78901`, `CAP-2026-44321`, `DEBUG-CERT-PROOF-9921`), claimed host `api-m.sandbox.paypal.com` for no call, defaulted to `HTTP 201`, and reported SUCCESS regardless of status. | Placeholder fallbacks. | Only values PayPal returned; `mode` field; status follows HTTP result; certificate says "none (simulation, no PayPal call)". | VERIFIED |
| AUD-011 | P1 | Judge journey | Every "Verify with PayPal GET" button on `/demo` and `/evidence` returned a **404 page**. | `src/app/api/restock/verify/route.ts` was lost in the recovery-baseline commit. | Restored, with id validation (`^[A-Za-z0-9_-]{1,64}$`) and no upstream error echo. | VERIFIED |
| AUD-012 | P3 | API contract | Payment-rule refusals (no approval, wrong state, budget) returned HTTP 500. | Generic `Error`. | `PaymentRuleError` maps to 409. | VERIFIED |
| AUD-013 | P2 | UI honesty | Simulated capture card said "Settled via PayPal Sandbox"; read-back modal said "Authoritative PayPal Sandbox Read-Back" for local records. | Text ignored mode. | Mode-aware text. | FIXED (manual-check pending) |
| AUD-014 | P2 | UI reliability | Create, capture, refund and receipt handlers threw unhandled rejections on non-JSON error bodies; receipt button could be double-submitted. | `res.json()` without catch; no busy flag. | Safe JSON parse, catch with message, `receiptBusy` guard. | FIXED (manual-check pending) |
| AUD-015 | P3 | Accessibility | Status shown in one colour; filter input unlabeled; filter pills lacked pressed state; read-back modal had no dialog semantics; `/judges` reset failed silently. | n/a | Status colour by state (text always present), `aria-label`, `aria-pressed`, `role="dialog"` + Escape, reset error `role="alert"`. | FIXED (manual-check pending) |
| AUD-016 | P2 | Docs honesty | `/judges` claimed "PayPal Server SDK & Agent Toolkit"; neither is imported. | Stale copy. | States "PayPal REST APIs (direct, Sandbox only)". | FIXED |
| AUD-017 | P1 | Supply chain | `npm audit`: 6 high (LangChain secret extraction, langsmith, mathjs, jsondiffpatch XSS), all via unused `@paypal/agent-toolkit`. | Dead dependency. | Removed on the base branch (`d4c929f`, along with zod 4.6.7). This branch now audits at **0 critical / 0 high**. | VERIFIED |

Note on AUD-001: the first AUD-001 test is behavioural, because the seeded morning-run drafts are ASK. The ALLOW regression itself is pinned by the second test.

Note on AUD-011: the bad-id test passes "before" only because `git stash -- src` does not stash the new, untracked route file.

## Deferred and handed off (not fixed here)

- **`/demo` basket panel** (`src/app/demo/basket-panel.tsx`, owned by the parallel agent's branch).
  - `call()` throws on a non-JSON error and clears the selection even when the hold was refused.
  - Fix: `res.json().catch(() => ({}))` and clear the selection only on success.
- **`/evidence` verify** can show a stale result if two rows are verified quickly. Low impact (P3).
- **Moderate advisories.** 7 remaining, all one `minimatch` ReDoS inside the ESLint toolchain. `npm ls --omit=dev` is empty, so it is dev-only and never shipped.
- **In-memory store.** The per-PO lock protects one Node process. A multi-instance deployment needs a database row lock or unique constraint. Deploy a single always-on instance.
- **Not exercised against live PayPal Sandbox.** Order/capture/refund were exercised against a mocked `fetch` and in SIMULATION mode. Run one real Sandbox checkout before quoting live results.
- **Production configuration.** `next start` without `RECEIPT_SIGNING_SECRET` fails closed on `RUN_CYCLE` and `/api/receipt` by design. `render.yaml` generates the secret; any other host must set it.

## Verification matrix (exact branch state)

| Gate | Command | Result |
|---|---|---|
| Clean install | `npm ci` | PASS |
| Types | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `npm run lint` | PASS (exit 0) |
| Unit and integration | `npm test` | PASS, 254/254 in 23 files |
| Regression proof | `vitest run tests/audit-regressions.test.ts` with `src` stashed | 19/21 fail before, 21/21 pass after |
| Eval | `npm run eval` | 24/24, $0.00 unsafe spend |
| Build | `npm run build` | PASS (50 static pages) |
| Dependency audit | `npm audit` | 0 critical, 0 high, 7 moderate (dev-only) |
| Runtime smoke | `next start` + HTTP walk of the judge journey | PASS (see method, step 4) |
| Browser E2E / axe | n/a | **NOT RUN.** No browser automation in this repo or environment; UI fixes need a manual check. |
| Live PayPal Sandbox | n/a | **NOT RUN.** No sandbox credentials used, by policy. |
