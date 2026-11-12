---
inclusion: auto
name: engineering-practices
description: General engineering standards for API design, testing, performance, git, documentation, and agentic or LLM pipeline work.
---

# Engineering Practices

- Spec first for large features: requirements, design, then tasks. Implement incrementally and keep each step shippable.
- API design: consistent resource naming, clear error shapes, versioning when breaking, typed request/response.
- TypeScript: strict mode, no `any` without reason, explicit return types on exported functions.
- Python (`ml_service/`): type hints, small pure functions, pytest for tests (`pytest -q`).
- Testing: write tests for new behavior and bug fixes when asked; follow the project's runner. Prefer test-first for logic-heavy code.
- Simplicity: smallest change that solves the problem. No speculative abstractions.
- Performance: measure before optimizing. For Next.js/React, avoid unnecessary client components and re-renders, split heavy bundles, cache deliberately.
- Observability: structured logs at boundaries, meaningful error messages, no secrets in logs.
- Git: small commits, Conventional Commits, branch per change, never push to main unprompted.
- Docs: record decisions in short ADR-style notes in `docs/` when a choice is non-obvious.
- LLM/agent features: keep prompts versioned, cap context and cost, add evals (see `scripts/eval.ts`, `eval/results.md`), and handle model failure gracefully.
- Deploy (Vercel/Firebase): build and type check pass locally first; confirm with the user before production deploys.
