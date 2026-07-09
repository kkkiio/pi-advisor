# ADR-0001: Pull 模型与 pull_transcript 工具

## Status

Accepted

## Context

Advisor 需要获取 Primary Agent 的对话历史以进行审查。现有实现（oh-my-pi、pi-omplike-advisor）采用 Push 模型：在 Primary Agent 的 `turn_end` 事件中回调 Advisor，被动推送 delta。

Push 模型带来的复杂性（来自 oh-my-pi `AdvisorRuntime` 的实际实现）：

- 需要维护 `#lastCount` 光标跟踪已推送位置
- 需要 `#pending` 队列缓冲异步到达的消息
- 需要 drain loop 在 advisor 准备好时消费队列
- 需要 `#seenContext` 去重 primary 的重复注入（plan mode rules 等每 turn 重入 ~1k tokens）
- 需要 `obfuscateAdvisorDelta` 在每个消息类型上做 secret 脱敏
- Advisor 无法控制接收频率，每个 turn 都触发审查，产生 "Stop." / "Done." 噪音

## Decision

采用 **Pull 模型**：Advisor 通过 `pull_transcript` 工具主动拉取 Primary Transcript View。核心变化：

1. 不依赖 `turn_end` 事件回调
2. cursor 由 Advisor 模型自己管理（通过 `since_index` 参数）
3. Advisor 自行决定拉取频率和范围
4. 多个 turn 自然积累，一次拉取合并审查
5. Advisor 可跳过纯探索性 turn，只在 meaningful turn 出现时审查

### 实现路径

Advisor agent 通过 `createAgentSession` + `SessionManager.inMemory()` 创建独立 agent 实例（pi-btw 已验证此路径）：

```ts
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  model: advisorModel,
  modelRegistry: ctx.modelRegistry,
  thinkingLevel: advisorThinkingLevel,
  tools: advisorToolNames,    // 复用 primary 工具名列表，但过滤 write/edit
  resourceLoader: ...,
});
```

### pull_transcript 工具设计

```
pull_transcript(since_index?, timeout_ms?, count?)
```

**输出格式：**

参考 oh-my-pi `AdvisorRuntime.#renderDelta` 的做法——不将 primary 的 `AgentMessage[]` 构造为 advisor LLM 上下文消息，而是格式化为 **markdown 文本**返回：

1. 按 ADR-0009 构造 `primary_transcript_view`，过滤 advisor-originated 内容并完成 redaction
2. 取 view 的 delta 切片（`[since_index, 最新)`）
3. 调用 `formatSessionHistoryMarkdown(delta, { watchedRoles: true, ... })`，输出为 `**agent**:` / `**user**:` 等角色的内联格式
4. 返回 markdown 文本作为 tool 输出。Advisor 模型自然从 tool output 中阅读 Primary Agent 的进展

这与 oh-my-pi 完全一致：`formatSessionHistoryMarkdown` → `"### Session update\n\n{md}"` → advisor 的 user message。

**索引管理：**

- `since_index`：从上次拉取的最后一条 view 索引继续。支持负数（参考 Python `list[-N:]`），`since_index=-N` 表示从倒数第 N 条开始
- 首次调用不传 `since_index`，默认返回 `[0, count)` 范围的消息
- `count`：最大返回条数，默认 100
- 返回格式在开头注明本次返回的 index 范围、primary 运行状态和等待结果，使用 **[start, end) 左闭右开**区间。`end` 直接作为下次调用的 `since_index`

```
[5, 11) primary_agent_loop_state=running wait_result=new_messages waited_ms=842

**agent**:
我先看一下现有的 auth 模块。
```

**Primary agent loop 状态：**

`pull_transcript` 返回 `primary_agent_loop_state`，让 Advisor 在 Watch Run 中自行判断是否继续等待、继续拉取、发送 Advice 或结束 Watch Run。extension 不因为 Primary Agent 进入 idle 就强制结束 Watch Run。

- `running`：Primary Agent 的 agent loop 正在运行，可能正在生成文本或执行工具
- `idle`：Primary Agent 当前没有活跃 agent loop，且最近一次 loop 正常结束
- `aborted`：Primary Agent 当前没有活跃 agent loop，且最近一次 loop 被 abort

名称不用 `primary_turn_state`：pi 的 turn 是一次 assistant response 加上它触发的 tool calls/results；一个 agent loop 可以包含多个 turn。Advisor 需要知道 Primary Agent 的 agent loop 是否仍在运行，注意跟 turn 边界区分。名称不用 `is_streaming`：它暴露实现细节，且容易被理解成只表示 token streaming。名称不用 `stopped`：它无法区分正常完成和 abort。

**阻塞等待：**

- `timeout_ms` 默认 0（不阻塞），非零时监听 Primary Agent 的新消息和状态变化，有新记录、状态变化、Watch Run 取消或超时才返回
- 最大值限制为 **20 秒**，传入更大值不报错，按 20 秒处理
- 实现方式：在 tool 外部 subscribe primary agent 的 AgentSessionEvent（pi-btw 的 `session.subscribe()` 模式），维护 promise+resolver，tool 内部 await
- 返回的 `wait_result` 用于解释本次返回原因：`new_messages`、`timeout`、`state_changed` 或 `watch_cancelled`

**Compaction 感知：**

- 如果 `since_index` 越界（超过当前 view 长度），说明 Primary Agent 发生了 compaction 或 view 被重建
- 返回从 view index 0 开始的当前 view 内容（受 `count` 限制），并在结果中注明越界原因

## Consequences

**正面：**

- 消除了 `#lastCount`、`#pending`、drain loop、`#seenContext` 去重等 Push 模型下的维护负担；secret redaction 收敛到 Primary Transcript View 构造阶段
- Advisor 批量审查，更接近人类 code review 节奏
- 无 Advice 时 Advisor 自然静默，无需额外过滤器处理噪音

**负面：**

- Advisor 的审查天然滞后于 Primary Agent 进度（异步性）
- Advisor 需主动管理自己的拉取策略
- Advisor 长期运行自身 context 会溢出，需要自我 compaction 机制（首版标注风险，后续解决）

## Alternatives Considered

- **Push 模型（turn_end 事件）**：oh-my-pi `AdvisorRuntime` 和 pi-omplike-advisor 的现有方式。oh-my-pi 的实现超过 300 行仅用于 delta 管理、drain loop、backlog 控制。Pull 模型消除了这些。
