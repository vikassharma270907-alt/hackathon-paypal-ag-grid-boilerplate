---
inclusion: manual
---

# Project Memory: PayPal AI Hackathon 2026
RestockPilot AI / VeriSettle AI. Imported conversation history from the previous IDE (22 sessions, Nov 11-12, 2026).

Use this file via `#project-memory` in chat when resuming work.

## Project Identity

| Field | Value |
|---|---|
| Product | RestockPilot AI / VeriSettle AI |
| Hackathon | PayPal AI Hackathon 2026 |
| Deadline | Nov 12, 2026 12:00 PM PST / Nov 13, 2026 1:30 AM IST |
| Stack | Next.js (App Router), TypeScript, Tailwind CSS, PayPal SDK, Python ML |
| ML service | Python FastAPI (`ml_service/`), LayoutLMv3 invoice extraction |
| Submission doc | `DEVPOST_SUBMISSION.md` |
| GitHub | `vikassharma270907-alt/hackathon-paypal-ag-grid-boilerplate` |
| Deploy | Render (`paypal-ag-grid-boilerplate`) |
| Project path | `d:\paypal ai hackathon` |

## Session Timeline (summary)

1. Kickoff: built VeriSettle AI scaffold, AGENT_HANDOFF.md, README, core architecture.
2. API config and full audit: PayPal OAuth2, OpenAI, Render webhook, `render.yaml`, GitHub push.
3. PayPal Sandbox integration: payment/escrow routes, webhook verification.
4. Workflow guide and Render debugging: build errors, webhook config, left-panel UI fix.
5. UI fixes from screenshots.
6. GitHub push and verification.
7. VeriSettle Ultimate Upgrade: evidence gating, autonomous reconciliation, dispute defense, `WINNING_HACKATHON_BLUEPRINT.md`.
8. Empty session (no response).
9. Gemini share link analysis and implementation.
10. Deep analyse and implement from docs/blueprints.
11. Biggest build session (362 steps): implemented the winning blueprint end to end.
12. Implement from references.
13. Staff Engineer role: reverse-engineered a YouTube tutorial project into RestockPilot.
14. UI blueprint and component integration.
15. Feature ideas and innovation for judges.
16. Black and grey theme overhaul (Magic MCP / 21st.dev components, animations).
17. Analyse, create and integrate new features.
18. Final hardening: typecheck, automated tests, `AGENT_WORKLOG.md`, feature checklist.
19-20. Quick fixes.
21. Git commit help (no response).
22. Agents/skills export and this memory doc.

## Key Decisions

1. Name evolved: VeriSettle AI to RestockPilot (or dual-branded).
2. Theme: black and grey with animations.
3. ML: LayoutLMv3 for multimodal invoice parsing.
4. Deploy target: Render, not Vercel.
5. PayPal: Sandbox with `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET` (keep secrets in `.env.local`, never commit).
6. Core differentiator: evidence gating, so disputes are prevented before they happen.
7. Master execution doc: `docs/blueprints/WINNING_HACKATHON_BLUEPRINT.md`.

## Current State

- Root: package.json, next.config.ts, tsconfig.json, vitest.config.ts, render.yaml, .env.example, AGENTS.md, CLAUDE.md, DEVPOST_SUBMISSION.md, README.md, PAYPAL.md
- Docs: `docs/EVIDENCE.md`, `docs/PROOFLINE_GUIDE.md`, `docs/audits/`, `docs/blueprints/`, `docs/process/`
- ML: `ml_service/main.py`, `extractor_layoutlmv3.py`, `ev_controller.py`
- Testing: Vitest; eval in `eval/results.md`
- UI: Magic MCP / 21st.dev, black/grey theme

## Known Issues

- Commit `e7a4d55` is "recovery baseline after D: incident"; something was lost and recovered.
- Sessions 8 and 21 had no model responses (server restarts).
- Render app name comes from the boilerplate and may not match the product name.
- Only one commit visible in git log; verify full history.

## Resume Prompt

```
You are helping me finish my PayPal AI Hackathon 2026 project: RestockPilot AI / VeriSettle AI.

Project: d:\paypal ai hackathon
GitHub: vikassharma270907-alt/hackathon-paypal-ag-grid-boilerplate
Deploy: Render (paypal-ag-grid-boilerplate)
Stack: Next.js App Router + TypeScript + Tailwind + PayPal Sandbox + Python ML (LayoutLMv3)
Theme: Black & grey with animations
Deadline: Nov 12, 2026 12:00 PM PST / Nov 13, 2026 1:30 AM IST

Key docs:
- docs/blueprints/WINNING_HACKATHON_BLUEPRINT.md (master plan)
- docs/process/AGENT_HANDOFF.md (agent context)
- docs/process/AGENT_WORKLOG.md (what's been done)
- DEVPOST_SUBMISSION.md (submission writeup)

Read AGENT_HANDOFF.md first, then tell me current status and what still needs to be done.
```
