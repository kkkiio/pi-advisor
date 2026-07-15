# Advisor Runtime

## Current Design

Advisor 使用独立的 `AgentSession`，拥有自己的 model、thinking level、system prompt、tools 和 transcript。Session 通过 `createAgentSession` 与 `SessionManager.inMemory()` 创建，不与 Primary Agent 共享内部状态。

整个 Primary session 只维护一个 Advisor 实例。Ask Advisor 和 Watch Run 复用该实例及连续的 Advisor Transcript；两种入口只改变发送给 Advisor 的任务消息和 Watch Run runtime 状态。`/advisor:new` 是统一的重建入口。

Advisor Transcript 只在当前进程内存中保存。Overlay 关闭、Primary Agent 中断或 Watch Run 取消都不会销毁 Advisor；`/advisor:new` 和 Primary session shutdown 会 dispose 当前实例。

## Tool Boundary

Advisor 从 Primary Agent 当前启用的工具名中继承工具，移除 `write` 和 `edit`，再加入 `pull_transcript` 与 `advise`。System prompt 同时要求 Advisor 保持 reviewer 角色，需要修改时通过 Second Opinion、Advice 或 handoff 交给 Primary Agent。

这条边界允许 Advisor 使用 read、grep、ls 和 bash 等工具理解、搜索和验证代码，同时阻止它通过 Pi 的文件写入工具直接承担实现工作。

## Lifecycle and Abort Boundaries

- Primary Agent 与 Advisor 分别维护运行和中断状态。
- Primary Agent 被中断时，Advisor 实例和 Advisor Transcript 保留；Watch Run 通过 Pull 观察 `aborted` 状态并自行收尾。
- `/advisor:watch-off` 取消当前 Watch Run，必要时中断 Advisor 当前调用，但保留实例和 transcript。
- `/advisor:new` 取消 Watch Run、销毁当前实例、清空 Advisor UI 状态，并打开一个新的 Advisor 对话入口。
- Model 或 thinking level 变化后重建 Advisor 实例，使新配置对后续调用生效。

## Alternatives Considered

### 与 Primary Agent 共用 Session

共用 Session 会让两套 system prompt、tool calls 和 transcript 相互污染，也无法独立配置 model 与 thinking level。Advisor 因此保持独立实例。

### 多个并行 Advisor

多个实例可以分别审查安全、性能或风格，但会扩展配置、资源、生命周期和 UI 协调面。当前产品只提供一个 Advisor。

### Ask Advisor 与 Watch Run 使用不同实例

分离实例会丢失两种入口之间积累的审查上下文，并重复维护资源和配置。两种场景因此共享一个实例。

### 开放全部 Primary 工具

只依赖 system prompt 无法形成可靠的 reviewer 边界，因此不向 Advisor 暴露 `write` 和 `edit`。

### 只开放静态只读工具

只提供 read、grep 和 ls 会阻止 Advisor 运行检查命令验证判断。当前方案保留非文件写入工具，并通过 system prompt 约束 reviewer 职责。
