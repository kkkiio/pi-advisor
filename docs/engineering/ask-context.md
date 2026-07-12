# Ask Context

## Current Design

Advisor 空闲时，`/advisor <消息>` 启动一次 Ask Advisor。Runtime 在请求到达时构造 Primary Transcript View 快照，并向 Advisor Session 写入两条边界独立的消息：

1. 隐藏 custom message：包含 `primary_transcript_end_index`、Primary Agent loop state 和可选 Ask Context。
2. User message：只包含用户向 Advisor 提出的原始问题。

`primary_transcript_end_index` 是快照长度，使用 `[0, end)` 右开边界，可直接作为后续 `pull_transcript` 的 `since_index`。

## Automatic Selection

Runtime 在当前 Advisor Session 内记录最近一次自动注入的 Primary user message index：

1. 快照没有 Primary user text 时，不附带 Ask Context。
2. 最新 Primary user index 与记录不同，附带该 user text 及其后当前可见的 Primary assistant text，并更新记录。
3. 最新 Primary user index 与记录相同，不重复附带 Ask Context。
4. Ask Context 不包含 thinking、tool calls、tool results 或 custom messages。

`/advisor:new`、model 变化或 thinking level 变化重建 Advisor Session 时，清空自动注入记录。

Advisor 正在运行时，新的 `/advisor <消息>` 作为 Steer 进入当前 Ask Advisor 或 Watch Run，只包含用户输入，不创建新快照、不附带 Ask Context，也不更新自动注入记录。需要最新 Primary 进展时，Advisor 使用 `pull_transcript`。

## Alternatives Considered

### 每次 Ask 固定附带最近一段 Primary Transcript

固定附带会在同一个 Primary user turn 中反复复制相同内容，浪费 Advisor context。按 Primary user index 去重只在用户进入新一轮 Primary 对话时自动注入。

### 完全不自动附带上下文

常见 Second Opinion 会多一次 Pull 才能理解用户正在讨论的 Primary 工作。精简的 Ask Context 覆盖近期文本，完整历史仍由 Pull 获取。

### 把 Ask Context 与用户问题拼成一条 Prompt

拼接会模糊“Primary 来源内容”和“用户对 Advisor 的意图”之间的消息边界。隐藏 custom message 与 user message 分开保存这两个语义。

### 使用独立 Revision 或 Opaque Cursor

Primary Transcript View 已提供稳定数字索引。复用数字右开边界可以直接衔接 Pull，并避免额外 cursor 状态。
