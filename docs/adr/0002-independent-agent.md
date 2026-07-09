# ADR-0002: 独立 Agent 实例

## Status

Accepted

## Context

Advisor 和 Primary Agent 都需要各自维护对话状态、工具调用和系统提示。需要决定两者之间的关系。

## Decision

Advisor 拥有**完全独立的 Agent 实例**：

- 自己的 model
- 自己的 tools
- 自己的 transcript
- 自己的系统提示

与 Primary Agent 不共享任何状态。

### 实现

Pi 提供 `createAgentSession` API 创建独立 sub-session（pi-btw 已验证）：

```ts
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  model,
  modelRegistry,
  thinkingLevel,
  tools,
  resourceLoader,
});
```

返回的 `AgentSession` 提供完整生命周期 API：

| 方法                             | 用途                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| `session.prompt(text, options?)` | 向 Advisor 发送 prompt                                              |
| `session.subscribe(fn)`          | 订阅 AgentSessionEvent，用于驱动 overlay 和 pull_transcript timeout |
| `session.isStreaming`            | 判断 Advisor session 当前是否有活跃调用                             |
| `session.abort()`                | 中断当前 LLM 调用                                                   |
| `session.dispose()`              | 销毁 agent                                                          |

### Abort 边界

两个 Agent 各自持有独立的 `AbortController`。Primary Agent 被 abort 时，Advisor 通过 Primary Transcript View 观察到该状态，Advisor 实例不会被自动销毁。

- **用户 Esc → Primary Agent abort**：Advisor 实例保留，Advisor Transcript 不丢失；Watch Run 可通过 `primary_agent_loop_state=aborted` 自行收尾
- **`/advisor:watch-off`**：取消当前 Watch Run，可中断 Advisor 正在等待或运行的当前调用，但不销毁 Advisor 实例
- **`/advisor:new` 或 session shutdown**：dispose Advisor
- **Primary Agent abort 不会销毁 Advisor**：两个实例生命周期独立

## Consequences

**正面：**

- 状态隔离，不会互相污染
- Advisor 的 tool call 和 Primary Agent 的 tool call 完全独立
- 两者可以配置不同的 model 和 thinking level

**负面：**

- 资源开销翻倍（两个 agent 实例并行运行）
- Advisor 不能直接访问 Primary Agent 的内存状态，需通过 `pull_transcript` 获取
