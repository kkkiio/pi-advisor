# AGENTS.md

Developer-agent guide for implementing the Pi Advisor extension.

## Policies & Mandatory Rules

### Architecture Boundaries

When implementing Advisor runtime code under `extensions/`, follow the accepted ADRs in `docs/adr/`.

- Use the Pull model from `docs/adr/0001-pull-not-push.md`.
- Keep one Advisor instance shared by Ask Advisor and Watch Run.

### Compatibility Policy

When changing public APIs, persisted data, config files, CLI flags, plugin contracts, or user-facing workflows, follow this project's compatibility policy.

- Project at 0.x: zero stability guarantees.
- Prefer direct migrations and simple current-state code over compatibility layers.
- When changing Pi-dependent code or dependencies, keep all `@earendil-works/pi-*` packages aligned and upgrade them to the latest published version when available.
- Document intentional breaking changes in the final response; update release notes only when the project adds a changelog.

### Testing Policy

- Do not add runtime/unit tests for Advisor behavior. Cover behavior through BDD E2E or visual tests instead.
- The only allowed unit test is `tests/advisor/session-history-format.test.ts`, because markdown transcript serialization is dense, deterministic, and valuable to pin directly.
- Write `.feature` files in Advisor domain and user-observable business language. Keep implementation details such as RPC sessions, faux providers, test scripts, snapshots, tmux, and harnesses out of BDD scenario text.
- Use deterministic overlay snapshots for stable TUI layout checks. Use generated HTML artifacts for visual review against `docs/prd.md`.
- Do not use whole-TUI exact text snapshots as the default E2E oracle.

## Project Structure Guide

### Overview

This package provides a Pi extension that runs a session-persistent Advisor agent beside the Primary Agent. Runtime code is organized around the Advisor domain model: Ask Advisor, Watch Run, Pull, Advise, Primary Transcript View, Advice Delivery, and Advisor Overlay.

### Repo Structure & Important Files

```text
.
├── AGENTS.md                       # Developer-agent guide
├── CONTEXT.md                      # Advisor domain glossary
├── README.md                       # User-facing overview and usage
├── docs/
│   ├── prd.md                      # Product requirements and user-visible behavior
│   └── adr/                        # Accepted architecture decisions
├── extensions/
│   ├── advisor.ts                  # Thin Pi entrypoint: compose runtime, register commands/renderers, bind lifecycle events
│   ├── advisor/                    # Advisor runtime package organized by Advisor domain language
│   │   ├── constants.ts            # Custom message/entry IDs, command/tool names, overlay constants, defaults, system prompt
│   │   ├── settings.ts             # Read/write ~/.pi/agent/advisor.json, parse model refs, validate thinking levels
│   │   ├── session.ts              # Long-lived Advisor AgentSession, Primary lifecycle binding, Watch Run reset/cancel, disposal
│   │   ├── primary-transcript.ts   # Primary Transcript View filtering, redaction, compaction boundaries, index normalization, rendering
│   │   ├── transcript-state.ts     # Advisor transcript UI state: turn boundaries, thinking/text streams, tool calls/results, notices
│   │   ├── messages.ts             # Bridge missing Pi message role types until Pi exports them publicly
│   │   ├── session-history-format.ts # Reusable markdown transcript serialization for Primary Transcript View
│   │   ├── tools.ts                # pull_transcript and advise custom tool definitions using typebox schemas
│   │   ├── overlay.ts              # Advisor Overlay with input box, focus toggle, mouse scroll, and transcript rendering
│   │   ├── delivery.ts             # Hint-to-Steer and Concern-to-Follow-up routing, provenance metadata, abort auto-resume suppression
│   │   └── types.ts                # Shared Advisor domain types and runtime port interfaces
├── tests/
│   ├── advisor/
│   │   └── session-history-format.test.ts # The only allowed unit test; transcript formatter tests
│   └── visual/                       # TUI visual tests: overlay snapshots plus HTML artifact capture
├── e2e/
│   ├── features/                    # Advisor BDD feature files
│   ├── steps/                       # Cucumber step definitions
│   ├── support/                     # Real pi RPC and tmux TUI E2E harnesses
│   └── fixtures/                    # Faux provider and E2E fixtures
├── test-results/                    # Gitignored generated visual artifacts and test outputs
├── package.json                    # Package metadata, Pi entrypoints, scripts, dependencies
├── package-lock.json               # npm lockfile
├── tsconfig.json                   # TypeScript project config
└── vitest.config.ts                # Vitest config
```

## Operation Guide

Before committing or handing work back, run the local verification flow through `just`:

```bash
just fmt
just check
just test
just test-e2e
```

That sequence is the default submit-ready check. Run extra commands only when the user asks for them or the change clearly needs them.

When changing Advisor Overlay layout or TUI visual behavior, run the visual test flow:

```bash
npm run test:visual
```

Use `test-results/visual/index.html` as the review entrypoint for generated visual artifacts.
