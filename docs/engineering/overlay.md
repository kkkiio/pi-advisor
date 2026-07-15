# Advisor Overlay

## Current Design

Advisor Overlay 是 top-center 的完整工作视图，产品行为遵循 `docs/prd.md`。它只有两种用户可见状态：

- **Closed**：Overlay 不显示，Primary 输入框持有焦点。
- **Open**：Overlay 显示，其输入框持有焦点。

完整 Overlay 不存在可见但未聚焦的稳定状态。底层使用 `nonCapturing: true` 创建 Overlay，Controller 在每次打开时显式调用 handle `focus()`。

`Alt+/` 是快速进入或离开 Advisor 的核心交互。关闭时按下会打开并聚焦 Overlay；打开时按下会关闭 Overlay 并将焦点归还 Primary。`Esc` 也会离开 Advisor。

`/advisor`、`/advisor <消息>`、`/advisor:watch` 和 `/advisor:new` 都会打开并聚焦 Overlay。关闭 Overlay 只改变 UI 状态，保留 Advisor Session、Advisor Transcript、输入草稿和正在运行的 Watch Run。

## Input and Commands

Overlay 底部输入框接收普通 Ask Advisor 消息，也识别以下控制命令：

- `/advisor:watch`
- `/advisor:watch-off`
- `/advisor:handoff`
- `/advisor:new`
- `/advisor:model`
- `/advisor:thinking`

其他 `/` 前缀输入透传给 Advisor Session。Overlay 打开时，方向键、Page Up/Page Down、鼠标滚轮和触控板滚动只操作 Overlay transcript。

Overlay transcript 使用 Pi TUI 的 `Container`、`Box`、`Text` 和 `Spacer` 组合渲染。用户消息、Context、Pull、普通工具和 Advice Block 的全宽背景由 `Box` 负责，颜色直接使用 Pi theme token；这些 Block 与 Pi 官方消息和工具组件一样使用 `Box(1, 1, ...)` 的水平与垂直内边距，条目之间保留一行 `Spacer(1)`。Advice 使用现有错误背景作为视觉别名，标题和正文使用 `text`。Context 与 Pull 默认各展示前 5 个视觉行，长单条内容换行后仍受同一高度上限约束；Overlay 通过注入的 KeybindingsManager 监听 `app.tools.expand`，统一切换所有 Context 与 Pull Block 的展开状态，并在关闭、重新打开期间保留该状态。切换前记录当前 viewport 中的 transcript 行锨点，重建内容后定位同一条目，避免完整 payload 变长时强制跳到 transcript 底部。用户解绑该 action 时，折叠提示只报告剩余视觉行数，不展示不可用的快捷键。

Overlay Component 直接服从 Pi 传入的实际宽度与终端可用高度。Transcript viewport 可以缩小到 0 行，优先保留 Header、输入分隔线、输入框和底部边框，避免 Pi 对过大的 component 从底部裁剪后隐藏输入区域。

## Streaming and Events

Overlay 订阅 Advisor `AgentSessionEvent`，把 thinking、text、tool calls、tool results 和 notices 增量投影到 UI state。Ask Advisor 与 Watch Run 使用同一个 Overlay 和同一份 Advisor Transcript。

折叠的 Pull Block 使用 `pull_transcript` tool result details 中的 display items，不解析返回给 Advisor 模型的 markdown。Display item 与 markdown 由同一次 Primary Transcript View slice 序列化产生，tool call 与 tool result 合并为一个 item，因此 Pull header 的 `N msgs` 表示 Overlay 最终展示的逻辑条目数。Context header 只显示 `Context`，避免重复已在预览中可见的数量信息。展开的 Pull Block 直接呈现保留的完整 `<primary-transcript>` tool-result text；展开的 Context Block 直接呈现发送给 Advisor 的完整 `<primary-context>` hidden custom message。两者使用 `Text` 保留模型实际收到的 XML 边界、markdown marker 和正文字符。

Advisor 正在 streaming 时，新消息通过 Steer 排队。Ask Context 注入与 `session.prompt()` 之间的短暂启动窗口使用 transient guard：如果新的提交遇到尚未进入 streaming 的活动 Ask 或 Watch Run，把输入恢复到 Overlay draft，避免丢失输入，不引入额外消息队列状态机。

Overlay 关闭期间 Ask Advisor 完成或 Watch Run 自然结束时发送通知。Concern 保持额外 warning 通知。异步输出不会自动重新打开 Overlay。

## Alternatives Considered

### Overlay 可见但焦点留在 Primary

完整 Overlay 会遮挡 Primary transcript 和输入区域。可见面板与键盘目标分离会造成注意力错位，用户仍需关闭 Overlay 才能有效操作 Primary。当前设计让可见性与焦点保持一致。

### 纯 Non-Capturing Overlay，不提供输入框

所有交互都需要回到 Primary 输入框输入 `/advisor` 命令，滚动与消息目标也缺少明确边界。独立输入框让用户进入 Advisor 后可以直接追问和控制。

### 底部 Widget

Widget 占用空间更小，但无法完整呈现 Ask Context、Pull、工具轨迹和 Second Opinion。当前产品使用可关闭的完整 Overlay。

### 同时提供多个显示、隐藏和清理命令

`/advisor:show`、`/advisor:hide` 和 `/advisor:clear` 与 `/advisor`、`Alt+/`、`Esc` 和 `/advisor:new` 的组合语义重叠。当前命令面只保留具有独立用户意图的入口。
