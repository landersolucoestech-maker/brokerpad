# BrokerPad

BrokerPad is the development workspace for the Auto Transport Broker platform.

## Branch policy

- All development work must be performed exclusively on `dev`.
- `dev` is the active development and default branch.
- Do not create or use `main` unless explicitly requested by the project owner.
- New features, fixes, refactors, integrations, documentation, and repository changes belong on `dev`.

## Current architecture

The approved consolidated prototype is preserved as a checksum-verified source package under `bootstrap/source/`. The root `index.html` reconstructs that approved baseline and then loads BrokerPad-owned runtime code from `src/runtime/`.

This gives the project two explicit layers:

1. **Verified baseline** — the exact prototype imported from the approved benchmark package.
2. **BrokerPad runtime** — normal version-controlled code where new behavior, persistence rules, migrations, auditing and future production integrations are implemented without rewriting the baseline archive.

## Runtime foundation

`src/runtime/app.js` currently provides:

- tenant-scoped runtime storage;
- schema/runtime version metadata;
- an application event bus;
- runtime audit recording;
- versioned settings storage;
- health snapshots for module/sidebar verification;
- defensive BrokerPad branding normalization.

`src/runtime/app.css` adds baseline focus visibility and reduced-motion handling without changing the approved visual system.

## Development

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run verify:source
npm run materialize:source
npm run build
npm run preview
```

`npm run verify:source` reconstructs the source archive and verifies both the archive and approved `index.html` SHA-256 values. `npm run materialize:source` extracts the verified baseline into `.brokerpad-materialized/` for local inspection; that directory is intentionally ignored by Git.

## Product direction

BrokerPad is being developed as an Auto Transport Broker System / CRM, consolidating the strongest relevant workflows from specialized broker platforms while keeping load boards and external TMS products as integrations rather than first-class BrokerPad modules.
