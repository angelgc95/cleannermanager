# Cleaner Manager Design System Rules

These rules define how Figma-driven UI work should be translated into this codebase.

## Stack And Structure

- Framework: React 18 + TypeScript + Vite.
- Styling: Tailwind CSS backed by CSS custom properties.
- UI primitives: prefer existing shadcn/Radix components in `src/components/ui/`.
- App shell and shared navigation live in `src/components/AppLayout.tsx`, `src/components/AppSidebar.tsx`, and `src/components/PageHeader.tsx`.
- Feature-heavy host components live in `src/components/admin/`.
- Checklist-specific components live in `src/components/checklist/`.
- Route surfaces live in `src/pages/`.
- Use the `@` alias for imports from `src` as configured in `vite.config.ts`.

## Design Tokens

- Core tokens are defined in `src/index.css` as HSL CSS variables.
- Tailwind maps those tokens in `tailwind.config.ts`.
- Never hardcode production colors when an existing token exists.
- Reuse semantic tokens:
  - surfaces: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`
  - actions: `bg-primary`, `text-primary`, `bg-accent`
  - status: `status-todo`, `status-in-progress`, `status-done`, `status-cancelled`
  - shell: `sidebar-*`
- Role-specific themes are already encoded through `.host-theme` and `.cleaner-theme`; preserve that model instead of introducing page-local palettes.

## Layout Rules

- Default to operational product UI, not marketing UI.
- Use `PageHeader` for every major route surface.
- Prefer broad layout sections, metric rails, tables, and task lists over dense card mosaics.
- Avoid introducing decorative hero cards on normal workflow pages unless they materially improve orientation.
- Use restrained atmosphere only:
  - subtle gradients
  - low-contrast borders
  - limited accent color
- Mobile behavior matters. The shared shell already accounts for safe areas and the bottom navigation; do not add fixed UI that conflicts with that.

## Component Reuse

- Before creating a new primitive, check `src/components/ui/`.
- Reuse `StatusBadge` for statuses instead of rolling new pills.
- Reuse `PageHeader` for title/action framing.
- Prefer `Card`, `Button`, `Input`, `Select`, `Sheet`, `Dialog`, and existing form controls from `src/components/ui/`.
- If a new reusable pattern appears across more than one route, extract it into `src/components/` rather than duplicating page-local markup.

## Copy And Product Tone

- Keep copy short and operational.
- Headings should orient the user to work, status, or next action.
- Avoid aspirational marketing language on host or cleaner workflow pages.
- Helper text should explain what the section controls, what is automated, or what changes after an action.

## Icons And Assets

- Icon system: `lucide-react`.
- Prefer existing Lucide icons already used in nearby code before adding new icon ideas.
- Do not add a new icon package.
- Static product/marketing assets live under `docs/assets/` or platform-specific docs folders; app runtime UI should generally rely on code-native UI, not ad hoc image assets.

## Data And Interaction Patterns

- Data fetching uses Supabase and React Query.
- Keep page-level reads in the page unless there is an existing hook for the concern.
- Use optimistic UI sparingly; favor explicit invalidation after mutations.
- Preserve the current routing style with `react-router-dom`.
- Follow existing mutation patterns:
  - run the mutation
  - toast on success/failure
  - invalidate or refetch the affected query

## Figma MCP Workflow

For Figma-driven implementation work in this repo:

1. Fetch the node with `get_design_context`.
2. Fetch a screenshot with `get_screenshot` when fidelity matters.
3. Translate the resulting structure into this project’s existing patterns instead of copying raw output.
4. Replace raw utility-heavy markup with the nearest existing `src/components/ui/` primitives where possible.
5. Use tokens from `src/index.css` and Tailwind mappings from `tailwind.config.ts`.
6. Preserve host/cleaner theme behavior and mobile-safe layout behavior.

## Hard Constraints

- Do not hardcode one-off hex values when the token system can express the same intent.
- Do not replace the existing shell or role themes with a generic SaaS palette.
- Do not introduce multiple competing accent colors on the same surface.
- Do not add unnecessary card nesting.
- Do not break the cleaner mobile experience to improve the host desktop view.

## Verification

- Verify desktop and mobile layouts after UI changes.
- Run `npm run build` after meaningful UI edits.
- If a page is payout- or automation-related, also verify the copy matches the actual backend behavior.
