# Advisor PRD

## 背景

Primary Agent 在执行复杂开发任务时，用户常常需要第二视角来发现遗漏、提醒风险或给出更快的做法。Advisor 提供一个依附 Primary Agent 的会话内第二 agent，让审查和建议在主流程旁边异步发生。

Advisor 的价值是让用户获得 Second Opinion 和持续的旁路审查，同时不把 Primary Agent 从当前工作中拉走。

## 目标

### Advisor 目标

- **Review**：发现 Primary Agent 工作中的 bug、设计问题、流程问题和它们的根因，向用户提供独立 reviewer 的 Second Opinion。Advisor 作为 reviewer，不承担实现功能的职责。
- **Guide**：引导可能陷入 tunnel effect 的 Primary Agent，用高效率事实、关键文件、API、约束和顺序提示帮助它越过障碍，并用 review 视角帮助它在工作结束前检查和修正工作。

### 产品体验目标

- 保持旁路审查安静、相关、可追溯、可观察，避免破坏 Primary Agent 的工作节奏；用户能看到 Advisor 正在做什么，并能随时取消或重置它。

## 用户

目标用户是正在使用 Primary Agent 处理开发任务的人，尤其是需要在实现、重构、调试、评审和架构判断中获得第二视角的用户。

## 核心场景

### Ask Advisor

用户有一个明确问题时，可以直接询问 Advisor 并获得 Second Opinion。Advisor 应理解当前 Primary Agent 的近期工作，不要求用户手动复制上下文。

### Watch Run

用户希望有人持续旁观当前任务时，可以启动一次 Watch Run。Advisor 应跟随 Primary Agent 的进展，自行判断什么时候已经完成本次审查，也允许用户提前取消。

### Advice Delivery

Advisor 送达 Primary Agent 的内容是 Advice。加速信息是 Hint，应尽快影响 Primary Agent 当前工作。风险或疑虑是 Concern，应在 Primary Agent 完成当前工作后再处理，避免中途打断。

### Advisor Overlay

用户需要知道 Advisor 是否在工作、看到了什么、形成了什么 Second Opinion 或 Advice。Advisor Overlay 应展示 Advisor 的审查活动和输出，但不抢占用户正在与 Primary Agent 交互的输入焦点。

## 需求

以下命令都是用户在主输入框触发的产品入口。Advisor 不通过这些命令操作自身；Advisor 的审查行为由它自己的 Pull 和 Advise 能力完成。

### PRD-001 Ask Advisor

用户可以通过 `/advisor <消息>` 向 Advisor 提问。Advisor 应复用同一个会话内实例，并保留已有 Advisor Transcript。

验收标准：

- 用户发起 Ask Advisor 后，Advisor 能基于 Primary Agent 的近期工作给出 Second Opinion。
- 多次 Ask Advisor 之间，Advisor 能延续自己的上下文。
- Ask Advisor 不会创建与 Watch Run 分离的第二套 Advisor 记忆。

### PRD-002 Watch Run

用户可以通过 `/advisor:watch` 启动一次 Watch Run。Advisor 应异步观察 Primary Agent 的工作进展，并自行结束本次审查。

验收标准：

- Watch Run 不阻塞 Primary Agent 的执行。
- Watch Run 可以在 Advisor 判断审查完成后自然结束。
- 用户可以通过 `/advisor:watch-off` 取消当前 Watch Run。
- 取消 Watch Run 后，Advisor 实例和已有 Advisor Transcript 仍然保留。

### PRD-003 Advice 类型

Advisor 的建议分为 Hint 和 Concern。

验收标准：

- Hint 表达加速当前工作的建议，例如更合适的 API、文件、做法或事实。
- Concern 表达风险、错误或设计疑虑。
- Hint 应尽快影响当前工作。
- Concern 应作为后续审查意见到达，减少对当前工作节奏的破坏。

### PRD-004 可视化

用户可以通过 Advisor Overlay 看到 Advisor 的工作过程。

验收标准：

- Overlay 展示 Advisor 的思考、文本输出、工具活动和建议。
- Overlay 保持可见时不抢占 Primary Agent 的输入焦点。
- 重要 Concern 出现时，用户能获得额外提醒。

### PRD-005 生命周期控制

用户可以控制 Advisor 的当前运行和上下文。

验收标准：

- `/advisor:new` 清空 Advisor Transcript，并开始新的 Advisor 上下文。
- `/advisor:watch-off` 只取消当前 Watch Run，不清空 Advisor Transcript。
- 用户中断 Primary Agent 后，Advisor 不会自动唤醒 Primary Agent。

### PRD-006 偏好设置

用户可以设置 Advisor 使用的模型和 thinking level。

验收标准：

- 用户可以查看或更新 Advisor 的模型偏好。
- 用户可以查看或更新 Advisor 的 thinking 偏好。
- Advisor 偏好保存在用户级配置文件 `~/.pi/agent/advisor.json`。
- Advisor 偏好对同一用户的所有项目生效。
- Advisor model 需要用户显式设置，未设置时应提示用户完成设置。
- 未设置 thinking 偏好时，Advisor 使用自己的固定默认值。
- 偏好不承担启停语义，Advisor 是否运行由用户命令决定。

### PRD-007 安静与相关性

Advisor 只在有实际 Advice 时打扰 Primary Agent。

验收标准：

- 没有 Advice 时，Advisor 保持静默。
- Advisor 不应重复消费自己刚送达的 Advice。
- Advisor 不应因为自己的 Advice 形成反馈循环。
- Advisor 应只读取审查 Primary Agent 当前工作所需的 transcript 视图。

## 非目标

- 首版不支持多个 Advisor 同时工作。
- 首版不支持外部 agent 接入。
- 首版不做 Advisor Transcript 的磁盘持久化。
- Advisor 不承担替代 Primary Agent 执行任务的产品职责。
- Advisor Overlay 不提供独立输入框，用户交互仍通过主输入框完成。

## 成功标准

- 用户能在复杂任务中获得有用的第二视角，而 Primary Agent 的主流程保持连贯。
- Hint 能减少明显的返工或等待。
- Concern 能暴露风险，同时不会频繁打断正在进行的工作。
- 用户能理解 Advisor 当前状态，并能放心取消或重置。
- Advisor 的输出中没有常规性的无意义消息或自我重复。

## 发布边界

首版发布应覆盖 Ask Advisor、Second Opinion、Watch Run、Advice 类型、Advisor Overlay、生命周期控制、模型和 thinking 偏好、安静输出，以及 Advisor Advice 的来源过滤。
