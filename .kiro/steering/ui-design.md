---
inclusion: auto
name: ui-design
description: Rules for building or changing UI, components, pages, layouts, styling, animation, and Figma-to-code work.
---

# UI and Design Rules

- Search the 21st.dev catalog first (21st MCP: `search`, `get_component`) before writing a component. Use `generate` for novel layouts. Use `search_logo` for brand SVGs.
- Adapt everything to the project: existing `components/ui`, the `cn()` helper from `@/lib/utils`, Tailwind config, and design tokens.
- Read neighboring components before adding new ones; match naming, props style, and file layout (kebab-case filenames).
- Design quality: consistent spacing scale, clear type hierarchy, restrained palette, real empty/loading/error states. Avoid generic template look.
- Dense dashboards: tight spacing, tabular numbers, clear status colors, scannable tables.
- Motion: subtle and purposeful (150-300ms), respect `prefers-reduced-motion`.
- Accessibility: semantic HTML, labels on inputs, visible focus, sufficient contrast, keyboard operable.
- Figma: use the Figma MCP to read frames and tokens, then implement with project components rather than pixel-copying generated markup.
- Verify visually with Playwright or chrome-devtools MCP when a running app is available.
