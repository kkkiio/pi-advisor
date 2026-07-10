# ADR-0010: Ask Context 自动注入

## Status

Accepted

## Context

Ask Advisor 需要理解用户与 Primary Agent 的近期对话，同时用户需要知道自己实际向 Advisor 发送了什么。每次 Ask 固定附带最近一段 Primary Transcript View 会反复发送相同内容，而完全不附带近期对话又会让常见的 Second Opinion 请求多一次 Pull。

## Decision

Ask Advisor 只在 Advisor Agent Session 空闲时接受。一次被接受的 Ask 使用两条独立 session message：

1. 一条隐藏 custom message，包含 `primary_transcript_end_index`、Primary Agent loop state 和可选的 Ask Context。
2. 一条 user message，只包含用户传给 `/advisor` 的原始问题。

Runtime 先将 custom message 加入 Advisor Transcript，再由 user message 触发同一次 Advisor turn。这使 Ask Context 的来源和用户意图在消息模型中保持独立，无需把两者拼成一条 prompt 文本。

Ask Advisor 在请求到达时构造 Primary Transcript View 快照。`primary_transcript_end_index` 直接取 `PrimaryTranscriptView.messages.length`，表示 `[0, end)` 的右开边界，可以直接用作后续 `pull_transcript` 的 `since_index`。它在每次 Ask 时计算，runtime 不额外持久化该位置。

Runtime 只在当前 Advisor Agent Session 内记录上一次自动注入使用的 Primary user message index。每次 Ask 按以下规则构造 Ask Context：

1. 查找快照中最新的 Primary user text message。
2. 快照中没有 Primary user text message 时，不附带 Ask Context。
3. 它的 index 与上次自动注入使用的 user index 不同时，附带该 user message，以及它之后当前可见的 Primary assistant text，然后记录该 user index。已经可见的 streaming text 也属于这次 Ask Context。
4. 它的 index 与上次相同时，不再附带 Ask Context。
5. Ask Context 的自动选择只包含 user text 和 assistant text，不包含 thinking、tool call、tool result 或 custom message。

Ask Context 的去重只取决于上一次自动注入的 Primary user message index。Advisor 是否已经通过 Pull 读取过相同内容不影响该规则。`/advisor:new`、Advisor model 或 thinking 变更导致的 Agent Session 重建都会清空该 index。

Ask Context 只是默认附带的精简文本。Advisor 在信息不完整、Primary Agent 仍在运行、或用户问题需要工具过程和更多历史时，通过 `pull_transcript` 主动读取 Primary Transcript View。自动注入不改变 ADR-0001 的 Pull 模型和 cursor 契约。

Primary Transcript 位置和 Pull 一样使用数字 index，不引入额外的 revision 或 opaque cursor。极少数 compaction 或 tree 切换造成的上下文偏差，由 Advisor 按需使用负数 `since_index` 重新 Pull 最近内容来恢复。

Pi 当前的公开 API 无法在 Advisor streaming 时把 custom message 和 user message 作为一个原子 queued prompt 提交。此时 `/advisor` 立即拒绝请求，显示 busy 提示，并把完整命令恢复到 Primary 主输入框。被拒绝的请求不创建 Ask turn、不写入 Advisor Transcript，也不更新上一次自动注入的 Primary user message index。

## Consequences

- 同一个 Primary user turn 中的多次 Ask 不会重复注入相同的 Ask Context。
- 在 Ask Context 已注入后继续到达的 streaming text 不会被自动追加；Advisor 依据 Primary Transcript 位置、运行状态和用户问题决定是否 Pull。
- 自动注入保持精简，Pull 仍保留完整、经过来源过滤和 redaction 的 Primary Transcript View。
- Ask Advisor 不会打断、排队到或隐式混入正在运行的 Watch Run；用户保留未提交的命令，可在 Advisor 空闲后直接重试。
