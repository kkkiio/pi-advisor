# Primary Transcript View

## Current Design

Primary Transcript View 是 Advisor 读取 Primary Agent 工作进展的唯一 transcript 边界。`pull_transcript` 的索引、切片、compaction 恢复和 markdown 渲染都基于这个 View；Ask Context 也从同一个 View 选择。

View 包含：

- 用户发给 Primary Agent 的普通 text message
- Primary Agent 的 assistant text 与 thinking
- Primary Agent 的 tool call、tool result、错误和状态摘要
- 与 Primary 当前任务直接相关且来源不属于 Advisor 的可见 custom message

View 过滤：

- Advisor 自己的 transcript、thinking、tool calls 和 tool results
- `/advisor` 系列命令的配置与生命周期副作用
- Advisor 送达的 Hint 和 Concern 原文
- Overlay UI 状态、toast 和 hidden persistence entries
- 与当前 Primary branch 无关的历史内容

## Provenance and Omitted Markers

Advisor Advice 必须携带可识别的 provenance。View 可以用短 marker 替代被过滤的 Advice：

```text
[advisor hint omitted: deliverAs=steer]
```

Marker 只保留时间线因果信息，不包含 Advice 原文。Advisor 已在自己的 transcript 中保存 Advice 内容。

## Index and Redaction Contract

`pull_transcript` 的 `[start, end)` 与 `since_index` 都基于过滤后的 View，过滤 Advisor 内容不会造成 cursor 跳动。Compaction 或 tree 切换导致 cursor 越界时，从当前 View index 0 恢复。

Secret redaction 在 View 构造阶段完成，并早于 markdown rendering。Raw tool output 不能因为 Advisor 与 Primary Agent 可能使用相同 provider 而绕过脱敏。

## Alternatives Considered

### 直接读取 Raw Primary Session

Raw session 会把 Advisor 自己送达的 Advice、控制命令副作用和 UI entries 再次暴露给 Advisor，形成反馈循环，也会让索引随着过滤结果跳动。专用 View 提供稳定的来源与索引边界。

### 把过滤责任交给 Advisor 模型

模型无法可靠区分所有 custom message 来源，也无法保证 secret 不进入上下文。Runtime 必须在数据进入 tool result 前完成 provenance filtering 和 redaction。

### 完全删除被过滤 Advice 的时间线痕迹

完全删除会让 Primary Agent 的后续行为缺少可解释原因。Omitted marker 保留事件存在性，同时避免 Advice 正文回流。
