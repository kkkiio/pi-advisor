# Advice Delivery

## Current Design

Advice 按意图区分为 Hint 和 Concern，并映射到 Primary Agent 的两种 Delivery Channel：

- **Hint → Steer**：正确 API、关键文件、更好算法等加速信息，在 Primary Agent 当前 tool batch 结束后的下一次模型调用前注入。
- **Concern → Follow-up**：潜在 bug、架构疑虑和风险质疑，在 Primary Agent 完成当前工作后作为后续消息处理。

Advisor 只在 Watch Run 期间主动调用 `advise`。Watch Run 之外，只有用户当前消息明确要求送达某个观点时才允许 Advice。Ask Advisor 的普通输出是给用户的 Second Opinion；`/advisor:handoff` 是用户确认后转交 Second Opinion 的独立动作。

## Provenance and Feedback Prevention

每条 Advice 都携带来源、类型和 delivery channel 元数据：

```ts
{
  origin: "advisor",
  advisorAdviceKind: "hint" | "concern",
  deliverAs: "steer" | "followUp",
}
```

Primary Transcript 根据 provenance 排除 Advice 原文，避免 Advisor 在后续 Pull 中重新读取并解释自己的建议。内容中可以保留不含正文的 omitted marker，说明 Primary Agent 后续行为可能受到 Advisor 影响。

## Primary Abort Protection

用户中断 Primary Agent 后，runtime 设置 `autoResumeSuppressed`。该状态下送达的 Advice 不触发新的 Primary turn；用户下一次主动发送消息时清除抑制状态。

## Alternatives Considered

### 按 Severity 路由

Nit、concern、blocker 等线性严重度无法区分“尽快提供加速信息”和“完成后审查风险”这两种干预意图，通常还需要 hold、reconfirm 和 catch-up 机制处理异步过期。当前方案直接按意图选择通道。

### 所有 Advice 都使用 Steer

风险质疑会在 Primary rollout 中途改变方向，增加不必要的打断和错误引导。Steer 仅用于 Hint。

### 所有 Advice 都使用 Follow-up

关键 API 或实现事实如果只能在任务结束后送达，会放大可避免的返工。Hint 因此走 Steer。

### Advice 触发时自动唤醒被中断的 Primary Agent

自动唤醒违背用户明确中断的意图。Runtime 在用户恢复交互前抑制 Advice 触发新 turn。
