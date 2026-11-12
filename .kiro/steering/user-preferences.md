# User Profile and Working Preferences

## User
- Name: Vikas Sharma
- OS: Windows 11 (PowerShell)
- Languages: TypeScript / JavaScript (Node.js >= 22), Python
- Timezone: IST (UTC+5:30)
- Active project: PayPal AI hackathon (Next.js app in this workspace, `ml_service/` for ML)

## Working style
- Think carefully before acting; verify work before declaring it done.
- Follow the flow: discuss, plan, execute, verify.
- Use `plan` style breakdowns for complex multi-step work.
- Commands normally fine to run without asking: git, node, npm, npx, python, pytest, `npx tsc --noEmit`, `npm run build`, `npm test`.
- Do not run dev servers or watchers in the foreground; give the command to the user instead.
- Pushing, deploying (`vercel --prod`), and destructive operations still need confirmation.

## Pre-approved URLs for fetching
localhost, 127.0.0.1, calendly.com, vercel.com, example.com, opencode.ai, docs.mobbin.com, restockpilot.vercel.app, flowguard-treasury.vercel.app

## Coding rules
- Node.js >= 22.
- JavaScript: CommonJS where the project uses it, strict mode, 2-space indent, semicolons, `const`/`let`, `node:` imports.
- TypeScript: strict, ESM/NodeNext where applicable.
- Filenames: kebab-case.
- No unrelated formatting changes. No unnecessary dependencies.
- Tests: match the project's runner (`node:test` + `node:assert/strict` for root JS, Vitest for TS SDK code). Do not introduce Jest/Mocha/Chai.
- Commits: Conventional Commits (`fix(#123): description`, `feat:`, `ci:`). PRs link an issue (`Closes #123`). Update `CHANGELOG.md` for user-facing changes.

## UI rules
- Do not hand-write generic UI from scratch. Search the 21st.dev catalog first (21st MCP: search, get_component, generate), then adapt to the project's design system.
- Use `search_logo` for official brand SVGs.
- Match existing `components/ui`, the `cn()` helper from `@/lib/utils`, and the Tailwind config.
- Figma MCP is available for design-to-code.

## Security
- Never commit secrets, local config, or generated worktree artifacts.
- API keys come from environment variables (for example `API_KEY_21ST`), never inline in config.
- Run secret, base64, and prompt-injection scans before release if the scripts exist.

## Available MCP servers (configured in `.kiro/settings/mcp.json`)
laya, figma, 21st, magic, skillspector, context7, playwright, sequential-thinking, memory, chrome-devtools.
Use context7 for up-to-date library docs.
