<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-agent-rules -->

# Project Rules

## Environment
- Node.js >= 22 required. CommonJS at the repo root; ESM/TypeScript under `sdk/`.

## Git & PRs
- Conventional Commits with issue references (e.g. `Closes #123`).
- PRs require a linked, approved issue and a matching PR template.

## UI
- Use Magic MCP / 21st.dev for all UI components — never write generic UI from scratch.

## Workflow
- Follow the GSD workflow: discuss → plan → execute → verify.

## Firebase
- Use Firebase MCP (or `firebase` skills + CLI) for all Firebase operations.

## Security
- Security scans must pass before release: `secret-scan.sh`, `base64-scan.sh`, `prompt-injection-scan.sh`.
  ⚠ These scripts are not yet ported to this repo (they exist in the Gemini/Antigravity setup only). Port them to `scripts/` before relying on this rule.

<!-- END:project-agent-rules -->
