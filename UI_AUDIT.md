# BrokerPad — Integral UI / Frontend Audit

## Scope

This audit covers the complete BrokerPad frontend baseline and every maintained runtime module on branch `dev`.

The verified source package contains 19 canonical source pages:

`Dashboard · Customers · Leads · Quotes · Quote Calculator · Orders · Dispatch · Carriers · Compliance · Communications · Documents · Finance · Risk & Fraud · Reports · Automations · Integrations · Users & Roles · Audit Log · Settings`

The baseline also creates or transforms workspaces at runtime, notably CRM and pricing configuration. Those generated surfaces are included in the global design-system selectors and browser audit.

## Architecture finding

BrokerPad is not currently a conventional component-framework application. The approved benchmark is preserved as a checksum-verified HTML package and enhanced by `src/runtime/`.

The consolidation strategy is therefore:

1. preserve the baseline package byte-for-byte as evidence and rollback source;
2. keep maintained behavior in version-controlled runtime modules;
3. load one canonical design-system layer after baseline styles;
4. load one UI normalization/accessibility layer after runtime modules;
5. test the rendered DOM, not only static source.

This avoids a destructive rewrite while preventing new visual drift.

## Problems found

The preserved baseline contains 52 embedded style blocks, 34 font-size variants, 28 border-radius variants, 10 font-weight variants including arbitrary 650/750/850 values, 22 responsive max-width breakpoints and 172 inline style attributes. It also contains many owner-specific modal, card, KPI, tab, table, form, pagination and empty-state implementations.

The main practical problems were:

- equivalent controls ranged roughly from 28px to 42px in height;
- equivalent labels and metadata used several neighboring type sizes;
- card radius, border, header and body padding varied by module;
- table header/body spacing and responsive behavior varied by owner;
- page and modal breakpoints were scattered and overlapping;
- mobile legacy rules could hide the sidebar without a canonical replacement navigation control;
- short-page viewport fill and sidebar height were not governed by one shell rule;
- focus, keyboard navigation, icon accessible names and table semantics were inconsistent;
- User Menu copy and branding were not consistently normalized;
- the previous build could succeed without proving that the dynamically referenced baseline/runtime assets were packaged into the deploy output.

## Canonical design system

The maintained frontend now uses a single `--bp-*` token namespace based on the predominant existing BrokerPad language rather than a redesign.

### Typography

- 9px — micro metadata, compact badges and table headings
- 10px — labels and secondary compact text
- 11px — controls and compact UI
- 12px — default body and descriptions
- 14px — compact section emphasis
- 16px — modal/strong section heading
- 22px — page heading

Maintained UI uses canonical emphasis weights instead of arbitrary intermediate values.

### Spacing

`4 · 8 · 12 · 16 · 20 · 24 · 32px`

### Radius

`4 · 6 · 8 · 10px · pill`

### Control sizes

`30 · 34 · 38px`, with 34px as the normal desktop control height and a touch-friendly mobile adjustment.

### Layout

- sidebar: 235px desktop
- topbar: 62px
- content max width: 1550px
- viewport fill: `100vh` fallback + `100dvh`
- maintained breakpoints: `1280 · 1024 · 800 · 520px`

### Color/surface system

The existing palette remains the source of truth: accent `#0f6b67`, sidebar `#111827`, primary text `#111827/#1f2937`, secondary text `#667085`, border `#dfe3e8`, strong border `#cbd1d8`, plus standardized success/warning/danger/info surfaces derived from colors already present in the project.

## Consolidated component families

The global layer now governs:

- shell, viewport and content container;
- sidebar, brand and nav states;
- topbar, breadcrumbs, notifications and Account Menu;
- page headers and actions;
- buttons and variants;
- inputs, selects, textareas, check/radio controls and labels;
- hover, focus, active, selected, disabled, error and success states;
- toolbars, search and filter rows;
- cards and KPI cards;
- tables and scroll wrappers;
- badges/chips and semantic states;
- CRM/carrier/order/pricing/module tab families;
- dropdowns and menus;
- runtime and legacy modal families;
- form grids;
- pagination;
- empty states, notices, alerts and toasts;
- mobile off-canvas sidebar;
- reduced-motion behavior.

## Responsive standard

Desktop keeps a sticky full-viewport sidebar and constrained content area. Notebook/tablet progressively collapse large grids and workspaces. Tables remain semantic tables and scroll inside their wrapper instead of forcing document overflow. On mobile the sidebar becomes an off-canvas panel with a topbar toggle, forms collapse to one column, KPI grids collapse progressively, modal geometry is constrained to the viewport and the document itself must not have horizontal overflow.

## Accessibility normalization

`src/runtime/ui-system.js` applies and reapplies semantics to dynamic UI:

- page heading association with `aria-labelledby`;
- `aria-hidden` on inactive pages;
- `aria-current="page"` on active navigation;
- `scope="col"` on table headings;
- keyboard-focusable overflow table regions with labels;
- inferred accessible names for controls where safe;
- accessible names for icon-only Close/More/Help actions;
- polite live regions for feedback;
- modal focus trapping and Escape behavior;
- MutationObserver-based normalization for runtime-inserted elements;
- canonical mobile navigation with `aria-expanded`.

## Maintained-code cleanup

`src/runtime/app.css` is now structural only. Visual decisions live in `design-system.css` and its ordered design partials, eliminating a second maintained set of colors, radii, spacing and control sizes.

The checksum baseline is deliberately not rewritten just to reduce source duplication metrics. It remains an immutable imported artifact. New frontend work must use the `--bp-*` tokens or existing base component patterns instead of adding page-specific visual constants.

## Build and validation

`tools/build_static.py` reconstructs and verifies the approved baseline, injects maintained runtime/design assets and writes a complete static `dist/`. This closes the former gap where compilation could succeed while deployment assets remained incomplete.

`tools/ui_audit.py` validates page inventory, design tokens, asset load order, responsive rules and UI normalization. `tools/check-js.mjs` syntax-checks maintained JavaScript.

Playwright tests navigate every rendered sidebar route at desktop (1440), notebook (1280), tablet (768) and mobile (390), checking active-page semantics, horizontal overflow, sidebar geometry, mobile navigation, Account Menu/table semantics and modal viewport geometry. Representative page screenshots are retained as CI evidence.

## Important limitation

The baseline contains legacy visual code by design because it is preserved under checksum. The project is now visually governed by the maintained canonical layer, but a future full framework migration would be required to physically eliminate all legacy inline/style duplication from the imported artifact itself without preserving byte-for-byte rollback evidence.
