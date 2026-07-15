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
- visible full-width background rows are grouped into readable theme-color blocks in generated snapshots, including wrapped rows;
- Context, Pull, tool, thinking, and Advice content use Pi's foreground, bold, and italic theme semantics;
- Context and Pull previews show at most five visual lines and expand through the configured `app.tools.expand` action;
- expanded Context and Pull blocks preserve the exact text payload sent to Advisor, including literal markdown markers;
- the real-model fixture in `fixtures/real-plan-review.json` keeps the Primary payload captured from a local DeepSeek V4 Pro and GPT-5.6 Advisor plan review;
- stable overlay layouts match Vitest snapshots.
- visible Overlay inputs retain the reverse-video software cursor because an open Overlay always owns focus.

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
    ├── whole.png
    ├── overlay.html
    ├── overlay.txt
    ├── overlay.png
    ├── checklist.md
    └── manifest.json
```

Use `index.html` as the human entrypoint. It embeds PNG captures rendered from tmux ANSI cells by ghostty-web's Ghostty VT engine and Canvas renderer in headless Chromium, including foreground colors, backgrounds, text emphasis, and grapheme-aware cell widths. The manifest records the renderer, browser, font, and scale used for the run.

Regenerate the project README screenshot with `npm run docs:readme-image`.

The capture command uses Playwright's installed Chromium when available, then checks common Chrome and Chromium locations. Run `npx playwright-core install chromium` when no compatible browser is installed, or set `PI_ADVISOR_VISUAL_BROWSER` to an executable path.

The PNG files are review artifacts. `.txt`, deterministic overlay snapshots, and geometry assertions remain the automated references. Review the images against each scenario checklist and `docs/prd.md`; do not treat prior pixels as the oracle.
