# Advisor Visual Tests

Visual tests are tests, but they are not BDD E2E. They use deterministic fixtures and focused captures to validate Advisor Overlay rendering.

## Automated Overlay Checks

Run snapshot and geometry checks:

```bash
npm run test:visual:snapshot
```

These checks render the Advisor Overlay directly from deterministic transcript states and assert:

- panel borders are closed;
- rendered lines stay inside the configured width;
- required user-visible sections are present;
- stable overlay layouts match Vitest snapshots.

## Review Artifacts

Generate TUI review artifacts:

```bash
npm run test:visual:capture
```

Artifacts are written under `test-results/visual/`:

```text
test-results/visual/
├── index.html
└── <scenario>/
    ├── index.html
    ├── whole.html
    ├── whole.txt
    ├── overlay.html
    ├── overlay.txt
    ├── checklist.md
    └── manifest.json
```

Use `index.html` as the human/agent entrypoint. Review against each scenario checklist and `docs/prd.md`; do not treat prior output as the oracle.
