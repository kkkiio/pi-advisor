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

## Streaming and Events

Overlay 订阅 Advisor `AgentSessionEvent`，把 thinking、text、tool calls、tool results 和 notices 增量投影到 UI state。Ask Advisor 与 Watch Run 使用同一个 Overlay 和同一份 Advisor Transcript。

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
