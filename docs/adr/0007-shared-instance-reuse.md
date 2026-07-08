# ADR-0007: 同一实例复用

## Status

Accepted

## Context

Ask Advisor（`/advisor <消息>`）和 Watch Run（`/advisor:watch`）是两种不同的使用场景。需要决定是为每种入口创建独立的 agent 实例，还是共享同一个。

## Decision

**共享同一个 Advisor 实例**。Advisor 只有一个稳定的 system prompt。两种触发方式的区别体现在唤醒方式、任务消息和 runtime 状态：
- Ask Advisor：由用户的 `/advisor <消息>` prompt 驱动，附带最近 Primary Transcript View 作为上下文。初始上下文至少包含最近 10 条 text message，并确保至少包含 1 条 user text message
- Watch Run：extension 向同一个 Advisor 发送 Watch Run 任务消息，并记录 Watch Run active 状态。Advisor 通过 `pull_transcript` 返回的 `primary_agent_loop_state` 和 transcript 内容自行判断 Primary Agent 当前任务是否完成

切换入口时，Advisor Transcript 和上下文保持连续；system prompt 不随入口变化。

### 参考模式

pi-btw 已验证同一 AgentSession 跨多次调用的复用模式——每次 `/btw` 使用同一个 `AgentSession`，transcript 连续累积，`pendingMode` 变量切换 contextual / tangent 行为而不重建实例。

### 持久化路径

首版 Advisor Transcript 仅在内存中保留。如需未来持久化，pi 提供 `pi.appendEntry()` API（pi-btw 用于隐藏 thread 状态、跨 reload 恢复）。Advisor 的审查历史和配置可以通过此 API 写入 session 的隐藏 custom entries，在 `session_start` 时恢复。

## Consequences

**正面：**
- 用户可以在 Ask Advisor 中积累的审查上下文在 Watch Run 中继续有效
- 资源开销减少（只需维护一个 advisor 实例）
- `/advisor:new` 作为统一的上下文重置入口

**负面：**
- runtime 需要显式维护当前 Watch Run 状态和 `/advisor:watch-off` 取消信号，避免 Watch Run 结束后继续影响 Ask Advisor
