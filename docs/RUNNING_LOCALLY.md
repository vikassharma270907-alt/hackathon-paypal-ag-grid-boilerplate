# Running RestockPilot locally

Everything runs against the **PayPal Sandbox only**. A hard guard (`assertSandboxBaseUrl`) refuses any other PayPal host.

## 1. Prerequisites

- Node.js 22 or newer. CI runs on 22.x.
- npm. Install with `npm ci`, which uses the committed `package-lock.json`. Don't mix package managers.
- Optional: Python 3.11, only for the separate `ml_service/` benchmark.

## 2. Install and check

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # full Vitest suite (no network: Gemini calls are blocked in tests)
npm run eval        # 24-case adversarial policy benchmark
npm run build       # production build
```

All of these run without any credentials. Payments fall back to clearly labelled **SIMULATION** mode.

## 3. Environment variables

Copy `.env.example` to `.env.local`. Never commit `.env.local`, because `.gitignore` already excludes `.env*`.

| Variable | Needed for | Notes |
|---|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` | Live Sandbox payments | From developer.paypal.com > Apps & Credentials (Sandbox). Without them the app runs in SIMULATION and every PayPal id is prefixed `SIMULATED_`. |
| `PAYPAL_WEBHOOK_ID` | Verified webhooks | Webhooks fail closed (401) without it. |
| `RECEIPT_SIGNING_SECRET` | **Required in production** | `RUN_CYCLE` and `/api/receipt` refuse to sign with the public fallback key when `NODE_ENV=production`. |
| `AUTH_SECRET` | **Required in production** (sign-in) | At least 16 characters. |
| `OPERATOR_API_KEY` | Operator-only actions in production | Escrow capture/void, above-threshold holds, dispute execution. |
| `ALLOW_PUBLIC_DEMO_WRITES` | Hosted judge demo | `true` lets same-origin browser requests use the sandbox demo writes without the operator key. |
| `CRON_SECRET` | `/api/cron/morning-run` | The endpoint is disabled (503) when unset. |
| `GEMINI_API_KEY`, `CHANNEL3_API_KEY` | Live AI and catalog | Optional; deterministic fallbacks are used without them. |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## 4. Run the app

```bash
npm run dev                      # http://localhost:3000 (development)
# or, production mode:
npm run build && npm start       # needs RECEIPT_SIGNING_SECRET and AUTH_SECRET
```

The judge path is `/judges`, then `/demo`, then `/evidence`.

## 5. Smoke-test a running server

```bash
npm run smoke                                         # against http://localhost:3000
npm run smoke -- --base-url=https://your-app.onrender.com
```

This resets the in-memory demo state. Point it only at a demo instance.

- **SIMULATION:** it walks the whole journey and exits non-zero on the first failure:
  - the cycle runs;
  - orders are refused before owner approval, then created after;
  - premature reconcile is refused;
  - capture happens once, and a replay is a no-op;
  - read-back is honest, and a bad id is rejected;
  - the signed receipt verifies;
  - the refund restores the budget;
  - a cross-origin write is refused.
- **SANDBOX:** it stops after creating the order, because capture needs a human buyer to approve on PayPal.

## 6. Live PayPal Sandbox verification (one real checkout, capture and refund)

1. Put **Sandbox** `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` in `.env.local`, then run `npm run dev`.
2. In a second terminal, run `npm run sandbox:verify`. Add `-- --no-refund` to keep the capture.
3. Open the printed PayPal link. Log in with a **Sandbox buyer** account (developer.paypal.com > Testing Tools > Sandbox Accounts) and approve.
4. The script then:
   - waits until PayPal reports the order `APPROVED`;
   - captures it and reads it back (`COMPLETED`);
   - refunds it;
   - appends one row to `docs/evidence/live-sandbox-runs.md`.

It refuses to run in SIMULATION mode. It also refuses to record any id that is simulated, missing, or not PayPal-shaped, so the evidence file only ever contains real Sandbox ids. Paste any of them into `/evidence` to read them back yourself.

## 7. Deployment constraint: one instance

Restock state, payment claims and the per-order payment lock live in the server process's memory.

- `render.yaml` pins `numInstances: 1`.
- `/api/health` reports `stateModel.supportedInstances: 1`.
- A second instance would not see the first one's lock, so do not scale out until that state moves to a database with a row lock.
- State also resets on every restart or deploy.
