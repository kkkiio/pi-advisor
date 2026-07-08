# ADR-0004: 意图驱动的双通道送达策略

## Status

Accepted

## Context

Advisor 向 Primary Agent 发送 Advice 时，需要决定两件事：1）用什么维度区分不同类型的 Advice；2）不同类型的 Advice 走什么 Delivery Channel。

Pi 的 agent loop 提供两种送达机制：
- **Steer**：注入到 Primary Agent 的 rollout 中，可能改变其当前行为路径
- **Follow-up**：在 Primary Agent 完成当前工作后作为后续消息呈现

现有方案 pi-omplike-advisor 使用 **severity** 作为路由依据，分为三层：
- **nit** → 立即 steer + triggerTurn（但也可能滞后，需 tag 标注"raised about earlier step"）
- **concern / blocker** → 先 hold（异步审查下 advice 到达时 primary 已完成后续工作，advice 已 stale），下一轮 review 时 reconfirm（只保留仍然有效的），terminal turn 时 catch-up block 等待 Advisor 追上
- nits 在 terminal turn 时也受特殊处理：同样不立即送，需通过 reconfirm preamble 存活验证

这套 hold + reconfirm + catch-up block 机制增加了约 200 行实现复杂度。

## Decision

使用 **意图（intent）** 作为送达路由维度，并将意图映射到通道。severity 只用于旧方案对比，不参与本方案路由：

- **Hint → Steer**：正确的 API 用法、更好的算法、可参考的文件。这些是加速信息，值得尽快送达 Primary Agent（但 Steer 并非即刻送达，实际在 Primary Agent 当前 tool batch 完成后、下次 LLM 调用前注入）。
- **Concern → Follow-up**：可能的 bug、架构疑虑。这是风险质疑，不中途改变 rollout 方向，等 Primary Agent 完成当前工作后再 review，更接近人类 code review 的节奏。

### 送达 API

Advisor 的 `advise` 工具实现中，通过 pi 的扩展 API 将 Advice 注入 Primary Agent：

```ts
// Hint → Steer
pi.sendUserMessage(content, { deliverAs: "steer" });

// Concern → Follow-up
pi.sendUserMessage(content, { deliverAs: "followUp" });
```

## Consequences

**正面：**
- 区分"帮助加速"和"指出风险"两种本质不同的干预
- Steer 仅用于 Hint，不会因风险质疑而打断 agent 连贯性
- 不需要 hold / reconfirm / catch-up block 等 Push 模型下的复杂机制

**负面：**
- Advisor 模型需要正确判断意图类型，可能存在误判
- Concern 在 Follow-up 中可能被 Primary Agent 忽略
- Steer 并非即刻送达——Primary Agent 当前 tool batch 执行完才会注入

## 安全考量

Steer 会改变 agent 的 rollout 路径，将此权力交给一个没有 alignment 保证的模型是危险的。将 Concern 排除在 Steer 之外是一项保守的安全决策。

## Alternatives Considered

- **Severity 维度（pi-omplike-advisor）**：三层 severity（nit/concern/blocker）配合 hold+reconfirm+catch-up。问题是 severity 是线性标度，无法区分"快改 API 用法"和"这里有潜在架构问题"两种性质不同的干预。且异步审查下 hold/reconfirm 机制本身证明了 Push 模型的固有矛盾——advice 到达时已经 stale。
