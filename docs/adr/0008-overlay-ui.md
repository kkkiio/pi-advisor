# ADR-0008: Overlay UI 交互

## Status

Accepted

## Context

用户需要实时感知 advisor 的审查活动和输出（思考过程、工具调用、advise 内容）。需要决定 UI 载体和交互方式。

## Decision

采用 **`nonCapturing` overlay（bordered dialog）** 作为 advisor 可视化载体：

- 通过 `ctx.ui.custom(component, { overlay: true, overlayOptions: { nonCapturing: true, ... } })` 创建
- `nonCapturing: true` 确保 overlay 保持可见但不抢占键盘焦点——用户打字仍发给 primary agent
- overlay 中**不放 input box**，所有用户与 advisor 的交互走主输入框里的 `/advisor` 命令

### 实时更新

Overlay 通过订阅 advisor 的 `AgentSessionEvent` 驱动实时更新（pi-btw 已验证的 `session.subscribe()` 模式）：

```
advisor subscribe → AgentSessionEvent → applyTranscriptEvent → buildOverlayTranscript → render
```

Overlay 展示 advisor 的完整 transcript：thinking、text、tool calls、tool results。Ask Advisor 和 Watch Run 使用同一 overlay。

### 用户通知

由于 `nonCapturing` overlay 不抢焦点，concern 产生时用户可能未注意到 overlay 内容更新。需要额外通过 `ctx.ui.notify()` 发送 toast 提醒用户，由用户决定何时查看。

## Consequences

**正面：**

- 用户可随时看到 advisor 的工作状态，无需手动切换视图
- 不干扰用户与 primary agent 的正常交互
- 单一入口（`/advisor`）降低 UI 复杂度

**负面：**

- nonCapturing 下用户可能忽略 overlay 更新，依赖 notify toast 提示
- overlay 占用屏幕空间，在终端尺寸较小时影响体验

## Alternatives Considered

- **自带 input box 的 overlay**（pi-btw 模式）：适合"用户在侧边对话中追问"的互动场景。Advisor 的用户交互点少且明确（`/advisor`、`/advisor:watch`、`/advisor:watch-off`），不需要第二个输入入口。
- **底部 widget**：占用空间小但展示能力有限，无法充分呈现 advisor 的完整审查过程。
