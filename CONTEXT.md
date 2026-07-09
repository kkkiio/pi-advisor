# Advisor

Advisor 是依附 Primary Agent 的会话内持久化第二 agent，用于异步审查 Primary Agent 的工作并给出 Advice。这个上下文定义 Advisor 领域内的通用语言。

## Language

### Actors

**Advisor**:
依附 Primary Agent 的会话内持久化第二 agent。它以审查和建议为职责，并拥有自己的对话历史。

**Primary Agent**:
用户主要交互和执行工作的 agent。Advisor 观察 Primary Agent 的工作，并向它送达 Advice。

### Second Opinions

**Second Opinion**:
Advisor 面向用户给出的独立审查回答。Second Opinion 用于回应 Ask Advisor，让用户获得对 Primary Agent 当前工作的第二视角、判断和解释。

### Advice

**Advice**:
Advisor 给 Primary Agent 的一条建议。Advice 用于帮助当前工作更快推进，或提醒当前工作中可能存在的风险。

**Hint**:
一种 Advice，表达可以加速 Primary Agent 的信息。Hint 通常指向更合适的方向、事实或做法。

**Concern**:
一种 Advice，表达 Advisor 对当前工作的风险、错误或设计疑虑。

**Delivery Channel**:
Advice 到达 Primary Agent 的通道。不同 Delivery Channel 表示 Advice 对 Primary Agent 工作节奏的不同影响方式。

**Steer**:
用于送达 Hint 的 Delivery Channel。Steer 表示这条 Advice 适合尽快影响 Primary Agent 的当前工作。

**Follow-up**:
用于送达 Concern 的 Delivery Channel。Follow-up 表示这条 Advice 适合在 Primary Agent 完成当前工作后再处理。

### Activities

**Ask Advisor**:
用户直接向 Advisor 索取 Second Opinion 的动作。Ask Advisor 使用同一个 Advisor，并保留已有 Advisor Transcript。

**Watch Run**:
一次由用户启动的 Advisor 审查运行。Watch Run 由 Advisor 根据 Primary Agent 的工作进展自行结束，也可以由用户取消。

**Pull**:
Advisor 主动取得 Primary Transcript View 的动作。Pull 表示 Advisor 自己决定何时查看 Primary Agent 的工作进展。

**Advise**:
Advisor 形成并送达 Advice 的动作。Advise 的结果是一条进入某个 Delivery Channel 的 Advice。

### Transcripts

**Advisor Transcript**:
Advisor 自己的对话历史。它记录 Ask Advisor 和 Watch Run 中属于 Advisor 的上下文。

**Primary Transcript View**:
Advisor 用来理解 Primary Agent 工作进展的 transcript 视图。它只呈现 Advisor 审查 Primary Agent 所需要的内容。

### UI

**Advisor Overlay**:
用户看到 Advisor 工作过程的可视界面。它让用户感知 Advisor 的审查活动和输出。
