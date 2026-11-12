---
inclusion: auto
name: workflow-gsd
description: Structured delivery workflow (discuss, plan, execute, verify) for non-trivial features, milestones, phases, debugging sessions, and shipping.
---

# Delivery Workflow (GSD-style)

Use for any non-trivial change. Skip for one-line fixes.

1. Discuss: clarify goal, constraints, and success criteria. Ask only what blocks progress.
2. Plan: break work into small, ordered tasks. Note files touched and how each task is verified.
3. Execute: implement incrementally. One task at a time, keep the build green between steps.
4. Verify: run build, type check (`npx tsc --noEmit`), and relevant tests. Re-read the original request and confirm each criterion.

## Supporting practices
- Debugging: reproduce, form a hypothesis, test it, fix the root cause. After two failed attempts, step back and re-diagnose.
- Code review: check correctness, edge cases, security, and style consistency before calling work done.
- Ship: clean diff, Conventional Commit message, linked issue, CHANGELOG entry for user-facing changes.
- Pause/resume: leave a short status note (done, next, blockers) in `docs/process/AGENT_HANDOFF.md` when stopping mid-task.
- Long tasks: keep a running checklist and update it as items complete.
- Codebase mapping: before editing unfamiliar areas, read entry points and trace data flow first.
