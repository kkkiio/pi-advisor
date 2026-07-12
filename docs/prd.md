# Advisor PRD

## 背景

Primary Agent 在执行复杂开发任务时，用户常常需要第二视角来发现遗漏、提醒风险或给出更快的做法。Advisor 提供一个依附 Primary Agent 的会话内第二 agent，让审查和建议在主流程旁边异步发生。

Advisor 的价值是让用户获得 Second Opinion 和持续的旁路审查，同时不把 Primary Agent 从当前工作中拉走。

## 目标

### Advisor 目标

- **Review**：发现 Primary Agent 工作中的 bug、设计问题、流程问题和它们的根因，向用户提供独立 reviewer 的 Second Opinion。Advisor 作为 reviewer，不承担实现功能的职责。
- **Guide**：引导可能陷入 tunnel effect 的 Primary Agent，用高效率事实、关键文件、API、约束和顺序提示帮助它越过障碍，并用 review 视角帮助它在工作结束前检查和修正工作。

### 产品体验目标

- 保持旁路审查安静、相关、可追溯、可观察，避免破坏 Primary Agent 的工作节奏；用户能看到 Advisor 正在做什么，并能随时取消或重置它。

## 用户

目标用户是正在使用 Primary Agent 处理开发任务的人，尤其是需要在实现、重构、调试、评审和架构判断中获得第二视角的用户。

## 核心场景

### Ask Advisor

用户有一个明确问题时，可以直接询问 Advisor 并获得 Second Opinion。Ask Advisor 在 Primary Agent 进入新的用户对话轮次后自动附带 Ask Context，并告诉 Advisor 当前 Primary Transcript 位置；Advisor 可以按需 Pull 更多内容，不要求用户手动复制上下文。

Advisor 已经在执行 Ask Advisor 或 Watch Run 时，用户可以继续通过 `/advisor <消息>` 发送消息，及时补充信息、纠正理解或对齐方向。这条消息直接 Steer 当前运行，只包含用户输入，不附带新的 Ask Context。

### Second Opinion Handoff

用户认可某个 Ask Advisor 的 Second Opinion 时，可以将最近一次完成的 Second Opinion 显式转交给 Primary Agent。这个转交是用户动作，Primary Agent 收到的是普通 user message。

### Watch Run

用户希望有人持续旁观当前任务时，可以启动一次 Watch Run。Advisor 应跟随 Primary Agent 的进展，自行判断什么时候已经完成本次审查，也允许用户提前取消。

### Advice Delivery

Advisor 在 Watch Run 期间可以主动向 Primary Agent 送达 Advice，用户也可以直接要求 Advisor 发送特定观点。加速信息是 Hint，应尽快影响当前工作；风险或疑虑是 Concern，应在 Primary Agent 完成当前工作后再处理。

### Advisor Overlay

用户需要知道 Advisor 是否在工作、看到了什么、形成了什么 Second Opinion 或 Advice。Advisor Overlay 是用户进入 Advisor 的完整工作视图；它显示时直接承接用户的注意力和键盘输入。

`Alt+/` 是用户在 Advisor 和 Primary Agent 之间快速切换的核心交互：按一次进入 Advisor，打开 Overlay 并聚焦其输入框；再按一次离开 Advisor，关闭 Overlay 并将焦点归还 Primary。关闭只离开视图，Advisor Transcript、输入草稿和正在运行的 Watch Run 都继续保留。

Overlay 是 Advisor 的旁路工作视图。它展示的是用户可理解的 Advisor 轨迹：用户问了什么、这次 Ask 实际附带了什么 Ask Context、Advisor 通过 Pull 读取了哪些 Primary Transcript 范围、Advisor 调用了哪些工具、Advisor 输出了什么内容。

目标形态：

```text
╭ Advisor · thinking · ctx 0.1%/128k · ↑2 ↓0 ────────╮
│                                                     │
│ Review the current change.                          │
│                                                     │
│ Context                                             │
│ User → Primary                                      │
│ Review the cache design.                            │
│ Primary                                             │
│ The cache now owns request deduplication.           │
│                                                     │
│ Pull [12,18) · 4.2s                                 │
│                                                     │
│ Hint The main risk is the overlay opening           │
│ before user intent.                                 │
│                                                     │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│Ask Advisor a follow-up…                              │
╰─────────────────────────────────────────────────────╯
```

Overlay 是 top-center 的独立面板。用户可在 Overlay 中直接向 Advisor 提问或输入控制命令，也可以随时通过 `Alt+/` 返回 Primary Agent。

Overlay 使用 **prefixed transcript blocks**：每个活动是连续 transcript 中的一个紧凑 block，通过 prefix/badge、颜色、背景和空行表达类型，不使用固定的 role 列。`Context` block 的角色标签和正文都从 block 内的第一列开始，不额外缩进。

## 需求

以下命令都是用户在主输入框触发的产品入口。Advisor 不通过这些命令操作自身；Advisor 的审查行为由它自己的 Pull 和 Advise 能力完成。`/advisor:handoff` 是用户确认后的转交动作，注意跟 Watch Run 期间 Advisor 自主送达的 Advice 区分开。

### PRD-001 Ask Advisor

用户可以通过 `/advisor <消息>` 向 Advisor 提问，也可以在 Advisor 运行时继续发送消息。Advisor 应复用同一个会话内实例，保留已有 Advisor Transcript，并以克制、可理解的方式附带 Primary Agent 上下文。

验收标准：

- Ask Advisor 被接受后，Advisor 能基于 Primary Agent 的近期工作给出 Second Opinion。
- `/advisor` 无参数时打开 Overlay 并将焦点置于 Overlay 输入框。
- Overlay 输入框中提交普通文本（非斜杠命令），行为与主输入框的 `/advisor <消息>` 相同：Advisor 空闲时启动新 Ask，运行时作为 Steer 送入当前运行。
- 运行中发送的消息只包含用户输入，不创建 Ask Context custom message，不构造新的 Primary Transcript 位置，也不消耗 Ask Context 注入记录。
- 这条消息在当前 assistant turn 的工具调用结束后、下一次模型调用前送达，让用户可以及时补充、纠正或对齐 Advisor。
- 每次 Ask Advisor 都会告诉 Advisor 当前 Primary Transcript 的右开边界位置和 Primary Agent 运行状态，Advisor 可以用该位置判断进展变化并按需 Pull。
- 当最新 Primary user message 还没有用于当前 Advisor Agent Session 的自动注入时，Ask Advisor 附带 Ask Context：该 user text message，以及它之后当前可见的 Primary assistant text。
- Ask Context 可以包含当前可见的 streaming assistant text，不包含 thinking、tool call、tool result 或 custom message。
- 当最新 Primary user message 已经用于当前 Advisor Agent Session 的自动注入时，后续 Ask 不重复附带 Ask Context。Advisor 之前的 Pull 不参与这个去重判断。
- Ask Context 不完整或用户问题需要更多历史、工具过程时，Advisor 能通过 Pull 主动补充 Primary Transcript View。
- 多次 Ask Advisor 之间，Advisor 能延续自己的上下文。
- Ask Advisor 不会创建与 Watch Run 分离的第二套 Advisor 记忆。
- 用户明确要求把特定观点送达 Primary Agent 时，Advisor 应直接执行，无需启动 Watch Run。

### PRD-002 Second Opinion Handoff

用户可以通过 `/advisor:handoff [instructions]` 将最近一次完成的 Ask Advisor Second Opinion 转交给 Primary Agent。

转交消息格式：

```text
Here is the latest Advisor Second Opinion I want you to use. <instructions>

Original Advisor request:
<Ask Advisor prompt>

Advisor Second Opinion:
<latest completed Ask Advisor answer>
```

未提供 `instructions` 时，首句使用：

```text
Here is the latest Advisor Second Opinion I want you to use as supporting context.
```

验收标准：

- handoff 只使用最近一次完成的 Ask Advisor 可见回答。
- handoff 不包含完整 Primary Transcript 原文、tool result 明细、Watch Run 的 Advice 记录。
- Primary Agent 空闲时，handoff 立即作为 user message 送达。
- Primary Agent 正忙时，handoff 作为 follow-up 排队。
- 没有完成过 Ask Advisor Second Opinion 时，用户收到明确提示。

### PRD-003 Watch Run

用户可以通过 `/advisor:watch` 启动一次 Watch Run。Advisor 应异步观察 Primary Agent 的工作进展，并自行结束本次审查。

验收标准：

- Watch Run 不阻塞 Primary Agent 的执行。
- Watch Run 可以在 Advisor 判断审查完成后自然结束。
- 用户可以通过 `/advisor:watch-off` 取消当前 Watch Run。
- 取消 Watch Run 后，Advisor 实例和已有 Advisor Transcript 仍然保留。

### PRD-004 Advice 类型

Advisor 的建议分为 Hint 和 Concern。

验收标准：

- Hint 表达加速当前工作的建议，例如更合适的 API、文件、做法或事实。
- Concern 表达风险、错误或设计疑虑。
- Hint 应尽快影响当前工作。
- Concern 应作为后续审查意见到达，减少对当前工作节奏的破坏。
- Advisor 只能在 Watch Run 期间主动发送 Advice。

### PRD-005 可视化

用户可以通过 Advisor Overlay 看到 Advisor 的工作过程。

UI 内容契约：

| 区域            | 内容                                                | 说明                                                                               |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Header          | `Advisor · <status> · ctx <used>/<window>`          | 展示 Advisor 当前状态和 context window 使用情况。                                  |
| 用户消息        | 用户传给 Advisor 的原始提问或任务                   | 使用 `userMessageBg` 背景色 + `userMessageText` 前景色，与 pi 主 transcript 一致。 |
| `Context` block | 这次 Ask 实际发送的 Ask Context                     | 只在附带 Ask Context 时出现，展示 user text 和 Primary assistant text 的实际内容。 |
| 工具轨迹        | `Pull`、`Hint`/`Concern`、`read`、`grep` 等工具轨迹 | 工具名直接作为行首标签（不使用 "Tool" badge），单行展示 call + result。            |
| Advisor 回答    | Advisor chat 内容                                   | 不设 badge，直接以 `text` 颜色展示。                                               |

不进入 Overlay 的内容：Ask Context 之外的完整 Primary Transcript 原文、冗长 tool result 明细、重复 footer hints、仅供实现调试的状态噪音。

验收标准：

- 启动时 Overlay 默认关闭；`Alt+/` 可以随时快速进入 Advisor，或离开 Advisor 返回 Primary。
- Overlay 只有关闭和打开且聚焦两种状态。打开时键盘、滚动和触控板输入归 Overlay；关闭时 Advisor Transcript、输入草稿和 Watch Run 保留。
- `Esc` 与打开状态下的 `Alt+/` 都会离开 Advisor。
- `/advisor`、`/advisor <消息>`、`/advisor:watch` 和 `/advisor:new` 是带具体意图的进入入口，执行后打开并聚焦 Overlay。
- Overlay 使用 top-center 面板，宽度约为终端的 78%，底部提供可输入消息和 Advisor 控制命令的独立输入框。
- Overlay 内容符合上方 UI 内容契约；Ask Context 只在实际附带时展示，内部文本不额外缩进。
- Pull 运行时显示 `Pulling…` 和超过 3 秒后的等待时间；完成后原位显示读取范围及达到 3 秒时的总耗时。
- Overlay 关闭期间 Ask Advisor 完成、Watch Run 自然结束或产生重要 Concern 时，用户收到提醒，并能通过 `Alt+/` 快速查看。

### PRD-006 生命周期控制

用户可以控制 Advisor 的当前运行和上下文。

验收标准：

- `/advisor:new` 执行完整重置（清空 Advisor Transcript、Ask Context 自动注入记录、Second Opinion 记录、输入框草稿；如果 Watch Run 正在运行则先取消），然后打开并聚焦 Overlay。
- `/advisor:watch-off` 只取消当前 Watch Run，不清空 Advisor Transcript。
- `/advisor:handoff` 不清空 Advisor Transcript，也不结束当前 Advisor 实例。
- 用户中断 Primary Agent 后，Advisor 不会自动唤醒 Primary Agent。

### PRD-007 偏好设置

用户可以设置 Advisor 使用的模型和 thinking level。

验收标准：

- 用户可以通过支持键盘移动和模糊搜索的交互选择器或命令参数更新 Advisor 的模型偏好。
- 用户可以通过交互选择器或命令参数更新 Advisor 的 thinking 偏好。
- Advisor 偏好保存在用户级配置文件 `~/.pi/agent/advisor.json`。
- Advisor 偏好对同一用户的所有项目生效。
- Advisor model 需要用户显式设置，未设置时应提示用户完成设置。
- 未设置 thinking 偏好时，Advisor 使用自己的固定默认值。
- 偏好不承担启停语义，Advisor 是否运行由用户命令决定。

### PRD-008 安静与相关性

Advisor 只在有实际 Advice 时打扰 Primary Agent。

验收标准：

- 没有 Advice 时，Advisor 保持静默。
- Watch Run 外，Advisor 不主动发送 Advice。
- Advisor 不应重复消费自己刚送达的 Advice。
- Advisor 不应因为自己的 Advice 形成反馈循环。
- Advisor 应只读取审查 Primary Agent 当前工作所需的 transcript 视图。
- Advisor 不获得 `write` 和 `edit` 文件写入工具；需要修改时，通过 Advice、Second Opinion 或 handoff 交给 Primary Agent 处理。

## 非目标

- 首版不支持多个 Advisor 同时工作。
- 首版不支持外部 agent 接入。
- 首版不做 Advisor Transcript 的磁盘持久化。
- Advisor 不承担替代 Primary Agent 执行任务的产品职责。

## 成功标准

- 用户能在复杂任务中获得有用的第二视角，而 Primary Agent 的主流程保持连贯。
- Hint 能减少明显的返工或等待。
- Concern 能暴露风险，同时不会频繁打断正在进行的工作。
- 用户能理解 Advisor 当前状态和 Ask Advisor 实际附带的上下文，并能放心取消或重置。
- Advisor 的输出中没有常规性的无意义消息或自我重复。

## 发布边界

首版发布应覆盖 Ask Advisor、Ask Context、Second Opinion、Second Opinion Handoff、Watch Run、Advice 类型、Advisor Overlay、生命周期控制、模型和 thinking 偏好、安静输出，以及 Advisor Advice 的来源过滤。
