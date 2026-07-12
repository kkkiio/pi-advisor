# Pull Transcript

## Current Design

Advisor 使用 Pull 模型读取 Primary Agent 的工作进展。Runtime 不按 Primary turn 主动推送 transcript delta；Advisor 根据当前任务、Primary Agent loop state 和已有 cursor，自行决定何时调用 `pull_transcript`。

`pull_transcript` 读取经过过滤和脱敏的 Primary Transcript View，并把选定范围序列化成 markdown tool result。Advisor 模型通过 tool output 阅读 Primary Agent 的 user message、assistant output、thinking、tool calls 和 tool results。

## Tool Contract

```text
pull_transcript(since_index?, timeout_ms?, count?)
```

- `since_index` 是 Primary Transcript View 的绝对索引。返回 header 使用 `[start, end)` 左闭右开范围，`end` 可直接作为下一次 Pull 的 cursor。
- 负数 `since_index` 从 View 尾部定位；例如 `-20` 表示读取最近 20 条记录。
- 不传 `since_index` 时从 View 开头读取，适合 Watch Run 首次建立上下文。
- `count` 限制本次最大返回条数，默认 100。
- `timeout_ms` 默认 0；非零时等待新记录、Primary loop state 变化、Watch Run 取消或超时，最大等待 20 秒。
- `wait_result` 为 `new_messages`、`state_changed`、`watch_cancelled` 或 `timeout`。
- `primary_agent_loop_state` 为 `running`、`idle` 或 `aborted`，描述完整 agent loop，注意跟单个 turn 和 token streaming 区分。

返回值以状态 header 开始，随后是 markdown transcript：

```text
[5, 11) primary_agent_loop_state=running wait_result=new_messages waited_ms=842

**agent**:
我先看一下现有的 auth 模块。
```

如果 compaction 或 tree 切换使 `since_index` 超过当前 View 长度，Pull 从 View index 0 恢复读取，继续受 `count` 限制，并在 header 中注明 cursor 越界。

## Runtime Integration

Primary runtime 事件只用于更新 loop state、刷新当前 streaming assistant snapshot 和唤醒正在等待的 Pull。事件不会直接向 Advisor transcript 注入 Primary 内容。

Watch Run 通过带 `timeout_ms` 的 Pull 持续观察进展。Primary Agent 进入 idle 不会强制结束 Watch Run；Advisor 根据已读取内容和运行状态判断继续等待、发送 Advice 或自然结束。

## Alternatives Considered

### 在 Primary turn 结束时 Push Delta

Push 需要 runtime 维护发送 cursor、pending queue、drain loop、重复上下文去重和 backlog 策略，并会在每个 turn 强制唤醒 Advisor。Pull 把读取频率与范围交给 Advisor，同时让无有效 Advice 的周期自然保持安静。

### 把 Primary Messages 直接注入 Advisor Transcript

直接注入会混合两套会话的消息边界，并让来源过滤、redaction 和 cursor 语义分散到多个写入路径。当前方案把 Primary 内容作为格式稳定的 tool result 返回。
