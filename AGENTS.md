# AGENTS.md

## Domain Language

- **Primary Agent** — 用户在 Pi 主会话中直接交互并负责实现任务的 agent。
- **Advisor** — 与 Primary Agent 隔离、面向用户提供审查视角的单一会话内 agent。
- **Ask Advisor** — 用户向 Advisor 发起问题并获得 Second Opinion 的交互。
- **Ask Context** — Ask Advisor 自动附带的近期 Primary user text 与 assistant text。
- **Second Opinion** — Advisor 针对 Ask Advisor 直接呈现给用户的独立审查回答。
- **Watch Run** — Advisor 持续旁观当前 Primary Agent 任务的一次异步审查运行。
- **Pull** — Advisor 主动读取 Primary Agent 工作进展的动作。
- **Primary Transcript View** — 经过来源过滤和脱敏、专供 Advisor Pull 与 Ask Context 使用的 Primary transcript 视图。
- **Advice** — Advisor 送达 Primary Agent 的具体指导信息。
- **Hint** — 通过 Steer 尽快送达 Primary Agent 的加速型 Advice。
- **Concern** — 通过 Follow-up 在当前工作完成后处理的风险型 Advice。
- **Advisor Overlay** — 用户查看和操作 Advisor 的 top-center 完整工作视图。

## Policies & Mandatory Rules

### Architecture Boundaries

When changing Advisor runtime code under `extensions/`, read the relevant living engineering documents before editing:

- Read `docs/engineering/advisor-runtime.md`, `docs/engineering/pull-transcript.md`, and `docs/engineering/advice-delivery.md` when changing session lifecycle, tools, Watch Run, Pull, or Advice Delivery.
- Read `docs/engineering/primary-transcript-view.md` and `docs/engineering/ask-context.md` when changing transcript filtering, serialization, indexing, redaction, or Ask Context.
- Read `docs/engineering/overlay.md` when changing Overlay state, focus, input, commands, scrolling, or notifications.
- Use the Pull model; do not push Primary transcript deltas into Advisor turns.
- Keep one Advisor instance shared by Ask Advisor and Watch Run.

Skip this reading requirement for changes outside `extensions/` unless the change modifies an engineering contract described by those documents.

### UI Design Policy

Advisor Overlay 的对用户可见 UI 对齐 Pi 官方 UI 设计：

- Overlay 的 Block（Context、Pull、Hint）、thinking、工具调用等元素的渲染语义对齐 Pi 官方 theme token（`userMessageBg`/`userMessageText`、`thinkingText`+italic、`toolSuccessBg`/`toolPendingBg`/`toolErrorBg`、`toolTitle`/`toolOutput`、`customMessageBg`）。
- Overlay 的折叠/展开行为复用 Pi 的 `app.tools.expand` keybinding（默认 Ctrl+O），使用同一 action 名称。
- 视觉设计以 [`docs/ui.html`](docs/ui.html) 为权威参考，以 Pi 的实际渲染行为和 theme token 为最终裁定。
- 不发明自有 UI 模式；新增的视觉元素优先复用 Pi 已有组件（Box、背景色块、截断提示等）。

### Compatibility Policy

When changing public APIs, persisted data, config files, CLI flags, plugin contracts, or user-facing workflows, follow this project's compatibility policy.

- Project at 0.x: zero stability guarantees.
- Prefer direct migrations and simple current-state code over compatibility layers.
- When changing Pi-dependent code or dependencies, keep all `@earendil-works/pi-*` packages aligned and upgrade them to the latest published version when available.
- Document intentional breaking changes in the final response; update release notes only when the project adds a changelog.

### Testing Policy

When changing Advisor behavior, cover it through BDD E2E or visual tests. Do not add runtime unit tests.

- Use `tests/advisor/session-history-format.test.ts` only for markdown transcript serialization, because this dense deterministic format benefits from direct unit coverage.
- Write `e2e/features/*.feature` in Advisor domain and user-observable business language. Keep RPC sessions, faux providers, test scripts, snapshots, tmux, and harnesses out of scenario text.
- Use deterministic Overlay snapshots for stable TUI layout checks. Use generated HTML artifacts for visual review against `docs/prd.md`.
- Do not use whole-TUI exact text snapshots as the default E2E oracle.
- Run the visual test flow when changing Advisor Overlay layout or TUI visual behavior; skip it for non-visual changes.

## Project Structure Guide

### Overview

This package provides a Pi extension that runs a session-persistent Advisor beside the Primary Agent. Runtime code follows the Advisor domain model defined above, and `docs/engineering/` records current engineering intent as living documentation.

### Repo Structure & Important Files

```text
.
├── AGENTS.md                         # Developer-agent rules, terminology, structure, and workflows
├── CONTEXT.md                        # Extended Advisor domain glossary
├── README.md                         # User-facing overview, installation, and usage
├── docs/
│   ├── prd.md                        # Product requirements and user-visible behavior
│   ├── ui.html                       # Advisor Overlay visual design reference
│   └── engineering/                  # Current engineering intent — living docs
│       ├── advisor-runtime.md        # Independent shared Advisor session, tools, lifecycle, abort boundaries
│       ├── pull-transcript.md        # Pull model, cursor contract, waiting, Primary loop state
│       ├── advice-delivery.md        # Hint/Concern routing, provenance, abort protection
│       ├── primary-transcript-view.md # Source filtering, indexing, omitted markers, redaction
│       ├── ask-context.md            # Ask Context injection, deduplication, message boundaries
│       └── overlay.md                # Overlay visibility, focus, input, events, notifications
├── extensions/
│   ├── advisor.ts                    # Thin Pi entrypoint: runtime composition and registrations
│   └── advisor/
│       ├── constants.ts              # Custom IDs, names, defaults, and system prompt
│       ├── settings.ts               # User-level Advisor model and thinking settings
│       ├── session.ts                # Advisor session lifecycle, Ask Advisor, Watch Run, Pull runtime
│       ├── primary-transcript.ts     # Primary Transcript View filtering, indexing, redaction, rendering
│       ├── transcript-state.ts       # Advisor Overlay transcript projection
│       ├── messages.ts               # Pi message-role type bridge
│       ├── session-history-format.ts # Markdown serialization for Primary Transcript View
│       ├── tools.ts                  # pull_transcript and advise tool definitions
│       ├── overlay.ts                # Focused Overlay component and controller
│       ├── delivery.ts               # Advice channel routing and provenance
│       └── types.ts                  # Shared domain and runtime port types
├── tests/
│   ├── advisor/
│   │   └── session-history-format.test.ts # Only allowed unit test
│   └── visual/                       # Overlay snapshots and HTML artifact capture
├── e2e/
│   ├── features/                     # Advisor BDD feature files
│   ├── steps/                        # Cucumber step definitions
│   ├── support/                      # Real Pi RPC and tmux TUI harnesses
│   └── fixtures/                     # Deterministic faux provider and fixtures
├── test-results/                     # Gitignored generated test and visual artifacts
├── package.json                      # Package metadata, Pi entrypoint, npm scripts
├── package-lock.json                 # Locked dependencies
├── justfile                          # Submit-ready verification recipes
├── tsconfig.json                     # TypeScript configuration
└── vitest.config.ts                  # Vitest configuration
```

## Operation Guide

Before committing or handing work back, run the submit-ready verification flow:

```bash
just fmt
just check
just test
just test-e2e
```

When changing Advisor Overlay layout or TUI visual behavior, also run:

```bash
npm run test:visual
```

Review generated visual artifacts from `test-results/visual/index.html`.
