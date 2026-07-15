# Pull Transcript Tool

## Current Design

Advisor 使用 Pull 模型读取 Primary Agent 的工作进展。Runtime 不按 Primary turn 主动推送 transcript delta；Advisor 根据当前任务、Primary Agent loop state 和已有 cursor，自行决定何时调用 `pull_transcript`。

`pull_transcript` 读取 [Primary Transcript](primary-transcript.md) 的指定范围。Advisor 收到的内容选择、markdown 表示和 `<primary-transcript>` 外层统一由 Primary Transcript 内容契约定义。

## Tool Contract

```text
pull_transcript(since_index?, timeout_ms?, count?)
```

- `since_index` 是 Primary Transcript 的绝对索引。返回 payload 的 `end` 可直接作为下一次 Pull 的 cursor。
- 负数 `since_index` 从尾部定位；例如 `-20` 表示读取最近 20 条记录。
- 不传 `since_index` 时从开头读取，适合 Watch Run 首次建立上下文。
- `count` 限制本次最大返回条数，默认 100。
- `timeout_ms` 默认 0；非零时等待新记录、Primary loop state 变化、Watch Run 取消或超时，最大等待 20 秒。
- `wait` 为 `new_messages`、`state_changed`、`watch_cancelled` 或 `timeout`。
- `state` 为 `running`、`idle` 或 `aborted`，描述完整 agent loop，注意跟单个 turn 和 token streaming 区分。

如果 `since_index` 因 compaction 或 tree 切换而越界，工具按照 Primary Transcript 内容契约从 index 0 恢复，继续受 `count` 限制，并报告 `since-index-out-of-bounds="true"`。

## Waiting and Overlay State

Overlay 的 `Pulling… Ns` 从 `tool_execution_start` 开始计时。模型流式生成 tool call arguments 的时间不属于 Pull 等待时间；完成态使用 result details 的 `waitedMs`。

Tool result details 携带与 Advisor 所读文本同源的 display items，供 Overlay 折叠预览使用。Overlay 展开后直接呈现 Advisor 收到的完整 tool-result text；具体渲染行为由 [Advisor Overlay](overlay.md) 定义。

## Runtime Integration

Primary runtime 事件只用于更新 loop state、刷新当前 streaming assistant snapshot 和唤醒正在等待的 Pull。事件不会直接向 Advisor transcript 注入 Primary 内容。

Watch Run 通过带 `timeout_ms` 的 Pull 持续观察进展。Primary Agent 进入 idle 不会强制结束 Watch Run；Advisor 根据已读取内容和运行状态判断继续等待、发送 Advice 或自然结束。

## Alternatives Considered

### 在 Primary turn 结束时 Push Delta

Push 需要 runtime 维护发送 cursor、pending queue、drain loop、重复上下文去重和 backlog 策略，并会在每个 turn 强制唤醒 Advisor。Pull 把读取频率与范围交给 Advisor，同时让无有效 Advice 的周期自然保持安静。

### 把 Primary Messages 直接注入 Advisor Transcript

直接注入会混合两套会话的消息边界，并让 cursor 语义分散到多个写入路径。当前方案把 Primary 内容作为格式稳定的 tool result 返回。
