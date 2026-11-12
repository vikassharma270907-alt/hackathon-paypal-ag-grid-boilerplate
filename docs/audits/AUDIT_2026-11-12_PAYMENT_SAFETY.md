# Payment-Safety Audit, 2026-11-12

Branch `fix/payment-safety-audit-2026-11-12`. It was first stacked on `feat/hardening-and-demo-updates`; after that merged (PR #8), `origin/main` was merged in and the PR now targets `main`.
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

## Follow-up pass (same day)

| ID | Sev | Item | Resolution | Status |
|---|---|---|---|---|
| AUD-018 | P2 | `/demo` basket panel `call()` crashed on non-JSON errors and cleared the selection even when the hold was refused. | Safe JSON parse plus catch; returns success; selection cleared only when the server accepted the hold. | FIXED (manual-check pending) |
| AUD-019 | P3 | `/evidence` Verify could show an earlier row's result. | Request token (latest click wins), safe JSON, buttons disabled while a check runs, SIMULATION-aware heading, labelled input. | FIXED (manual-check pending) |
| AUD-020 | P2 | Single-instance limit was documentation only. | `render.yaml` pins `numInstances: 1`; `/api/health` reports `stateModel.supportedInstances: 1`. A database lock is still required before scaling out. | MITIGATED |
| AUD-021 | P1 | Live Sandbox run was unverified, with no repeatable way to produce real evidence. | `npm run sandbox:verify`: one buyer-approved checkout, capture, read-back and refund. Appends real ids to `docs/evidence/live-sandbox-runs.md` and refuses simulated or malformed ids (`tests/live-evidence.test.ts`). | TOOLING DONE; **run pending your Sandbox keys** |
| AUD-022 | P2 | The judge journey had no automated runtime check. | `npm run smoke`: 20 HTTP checks against a running server, exit 1 on failure. | VERIFIED (20/20 on `next start`) |
| AUD-023 | P3 | `smoke` and `sandbox:verify` returned crash code `-1073740791` instead of `1` on Windows. | No `process.exit()` while fetch sockets close; `process.exitCode` instead. | VERIFIED |

## Still open

- **Database-backed state.** Required before more than one instance. Tracked by AUD-020.
- **Live Sandbox evidence.** No PayPal credentials exist in this environment. Run `npm run sandbox:verify` (see `docs/RUNNING_LOCALLY.md`, section 6).
- **Moderate advisories.** 7 remaining, all one `minimatch` ReDoS inside the ESLint toolchain. `npm ls --omit=dev` is empty, so it is dev-only and never shipped.
- **Production configuration.** `RECEIPT_SIGNING_SECRET` and `AUTH_SECRET` must be set; without them the app fails closed by design. `render.yaml` provides both.
## Verification matrix (exact branch state)

| Gate | Command | Result |
|---|---|---|
| Clean install | `npm ci` | PASS |
| Types | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `npm run lint` | PASS (exit 0) |
| Unit and integration | `npm test` | PASS, 269/269 in 25 files (after merging `origin/main`) |
| Regression proof | `vitest run tests/audit-regressions.test.ts` with `src` stashed | 19/21 fail before, 21/21 pass after |
| Eval | `npm run eval` | 24/24, $0.00 unsafe spend |
| Build | `npm run build` | PASS (50 static pages) |
| Dependency audit | `npm audit` | 0 critical, 0 high, 7 moderate (dev-only) |
| Runtime smoke | `npm run smoke` against `next start` | PASS, 20/20 |
| Browser E2E / axe | n/a | **NOT RUN.** No browser automation in this repo or environment; UI fixes need a manual check. |
| Live PayPal Sandbox | `npm run sandbox:verify` | **NOT RUN.** No Sandbox credentials in this environment. Verified that it refuses SIMULATION mode with exit 1 and writes nothing. |
