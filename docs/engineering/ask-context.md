# Ask Context

## Current Design

Advisor 空闲时，`/advisor <消息>` 启动一次 Ask Advisor。Runtime 在请求到达时构造 Primary Transcript 快照，并向 Advisor Session 写入两条边界独立的消息：

1. 隐藏 custom message：使用 [Primary Transcript](primary-transcript.md) 定义的 Ask Context payload，携带 `<primary-context>` opening-only metadata header、Primary Transcript 区间 `[start, end)`、Primary Agent loop state 和可选近期对话。正文延伸到该 custom message 末尾。
2. User message：只包含用户向 Advisor 提出的原始问题。

Ask Context 的 markdown body 与 Pull Transcript 使用同一 slice renderer 生成，格式完全一致（含 tool call/result、edit diff、custom message 等）。正文不做 XML text escaping，保持原始 Markdown。`start` 为最新 Primary user message index，`end` 为快照总长度，`end` 可直接作为后续 `pull_transcript` 的 `since_index`。

同一 Primary user turn 内重复 Ask 时，不重复注入 body，仅发送 position-only `<primary-head at="..." state="..." />`。Advisor 应使用上一次有 body 的 `<primary-context>` 的 `end` 或最近 Pull 的 `end`（取较大者）作为续拉起点。

## Automatic Selection

`selectAskContext` 确定 `[start, end)` 区间：`start` 为最新 Primary user message index，`end` 为快照总长度。Runtime 在当前 Advisor Session 内记录最近一次注入的 `primaryUserMessageIndex`（即 `start`）：

1. 快照没有 Primary user message 时，不附带 body。
2. 最新 `start` 与记录不同，slice `[start, end)` 通过共享 renderer 生成完整 markdown body，并更新记录。
3. 最新 `start` 与记录相同，不重复注入 body，仅发送 position-only payload。

`/advisor:new`、model 变化或 thinking level 变化重建 Advisor Session 时，清空注入记录。

Advisor 正在运行时，新的 `/advisor <消息>` 作为 Steer 进入当前 Ask Advisor 或 Watch Run，只包含用户输入，不创建新快照、不附带 Ask Context，也不更新注入记录。需要最新 Primary 进展时，Advisor 使用 `pull_transcript`。

每次空闲 Ask 写入 hidden custom message 时，Overlay 同时记录同一个完整文本 payload。Context Block 的预览、展开和折叠行为由 [Advisor Overlay](overlay.md) 定义。

## Alternatives Considered

### 每次 Ask 固定附带最近一段 Primary Transcript

固定附带会在同一个 Primary user turn 中反复复制相同内容。按 Primary user message index 去重：同一 turn 只注入一次，后续 Ask 发送 position-only payload，Advisor 需要最新进展时主动 pull。

### 完全不自动附带上下文

常见 Second Opinion 会多一次 Pull 才能理解用户正在讨论的 Primary 工作。精简的 Ask Context 覆盖近期文本，完整历史仍由 Pull 获取。

### 把 Ask Context 与用户问题拼成一条 Prompt

拼接会模糊“Primary 来源内容”和“用户对 Advisor 的意图”之间的消息边界。隐藏 custom message 与 user message 分开保存这两个语义。

### 使用独立 Revision 或 Opaque Cursor

Primary Transcript 已提供稳定数字索引。复用数字右开边界可以直接衔接 Pull，并避免额外 cursor 状态。
