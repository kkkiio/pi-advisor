# ADR-0009: Primary Transcript View 与来源过滤

## Status

Accepted

## Context

Advisor 通过 `pull_transcript` 阅读 Primary Agent 的工作进展。primary session 中会同时出现多类内容：

- 用户发给 Primary Agent 的真实消息
- Primary Agent 的 assistant 输出、thinking、tool call 和 tool result
- extension 写入的 custom entries
- Advisor 通过 `advise()` 注入 Primary Agent 的 Hint / Concern
- `/advisor`、`/advisor:watch`、`/advisor:model` 等控制命令产生的副作用

如果 `pull_transcript` 直接读取 raw session history，Advisor 会在后续拉取中读到自己刚刚通过 `advise()` 注入 Primary Agent 的 Advice。这样可能导致重复建议、解释自己的建议，或形成 feedback loop。

## Decision

`pull_transcript` 读取的是 **Primary Transcript View**：一个专门给 Advisor 审查使用的、带来源过滤的 primary session 视图。索引、`since_index`、`count`、compaction 越界判断和 markdown 渲染都基于这个 view；raw session entries 不直接作为 Advisor 的读取对象。

Ask Context 也从 Primary Transcript View 中选择，因此共享相同的来源过滤和 redaction 边界。Ask Context 的自动注入规则由 ADR-0010 定义。

### View 构造规则

包含以下内容：

- 用户发给 Primary Agent 的普通 text message
- Primary Agent 的 assistant text / thinking
- Primary Agent 执行的 tool call、tool result、错误和状态摘要
- 与 Primary Agent 当前任务直接相关的可见 custom message，前提是来源不属于 Advisor

过滤以下内容：

- Advisor 自己的 transcript、thinking、tool call、tool result
- `/advisor` 系列控制命令的配置和生命周期副作用
- Advisor 通过 `advise()` 注入 Primary Agent 的 Hint / Concern 原文
- overlay UI 状态、toast、hidden persistence entries
- 与当前 primary branch 无关的历史分支内容

### 来源标记

`advise(advice, kind)` 在向 Primary Agent 送达 Advice 时必须附带来源元数据：

```ts
{
  origin: "advisor",
  advisorAdviceKind: "hint" | "concern",
  deliverAs: "steer" | "followUp"
}
```

实际 API 形状以 pi extension 能力为准，但必须能在 `primary_transcript_view` 构造时识别并过滤 advisor-originated message。

### Omitted Advice Marker

为了保留时间线可解释性，view 可以用短 marker 替代被过滤的 Advisor Advice 原文：

```text
[advisor hint omitted: deliverAs=steer]
```

marker 不包含 Advice 原文。Advisor 已经在自己的 transcript 中知道 Advice 内容；marker 只说明 Primary Agent 后续行为可能受 Advisor Advice 影响。

### 索引语义

`pull_transcript` 的 `[start, end)` 索引基于 Primary Transcript View。这保证 Advisor 不会因为过滤掉自己的 Advice 而看到索引跳动，也不会在下次拉取中重新消费同一段 Primary Agent 内容。

如果 raw session compaction 导致 view 重建后 `since_index` 越界，按 ADR-0001 的 compaction 规则处理：从 view index 0 重新返回，受 `count` 限制，并在结果头部注明越界原因。

### Redaction

view 构造阶段负责做 secret redaction。即使 Advisor 和 Primary Agent 使用同一个 provider，也不能假设 raw tool output 可以无处理交给 Advisor model。

Redaction 发生在 markdown render 之前，避免 secret 同时出现在正文和工具摘要中。

## Consequences

**正面：**

- 阻断 Advisor Advice 回流造成的 feedback loop
- `pull_transcript` 的索引契约稳定，过滤规则不会泄漏给模型自行猜测
- future persistence / compaction / branch switching 都有统一的 view 边界

**负面：**

- 需要为 Advisor 注入消息建立可靠 provenance
- Primary Agent 后续响应可能引用被 omitted 的 Advice，view 需要 marker 保持时间线可解释
- 过滤和 redaction 成为 `pull_transcript` 的核心行为，需要专门测试

## Tests

需要覆盖：

- Advisor Hint / Concern 送达 Primary Agent 后，不会在下一次 `pull_transcript` 中以原文返回
- omitted marker 不包含 Advice 原文
- `since_index` 基于 view 递增，过滤 advisor-originated message 后仍然稳定
- visible non-advisor custom message 保留，advisor hidden/custom entries 过滤
- compaction 后 view 越界会从 0 返回并注明原因
- redaction 在 tool result 和 markdown render 前生效
