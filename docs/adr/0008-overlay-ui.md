# ADR-0008: Overlay UI 交互

## Status

Accepted

## Context

用户需要实时感知 advisor 的审查活动和输出。需要决定 UI 载体和交互方式。Overlay 上展示的具体内容和视觉验收标准由 `docs/prd.md` 定义。

## Decision

Advisor Overlay 提供独立输入框，采用 pi-btw 的交互模式：

- Overlay 底部有一个输入框，用户可直接向 Advisor 提问或输入控制命令
- `Alt+/` 在主输入框和 Overlay 输入框之间切换焦点。`Ctrl+Alt+W` 作为备选快捷键
- Overlay 输入框聚焦时，`Esc` 关闭 Overlay 并将焦点归还主输入框
- 切换到主输入框时，Overlay 输入框的草稿保留不丢失
- Overlay 输入框识别以下控制命令：`/advisor:watch`、`/advisor:watch-off`、`/advisor:handoff`、`/advisor:new`、`/advisor:clear`、`/advisor:model`、`/advisor:thinking`
- 以上命令同时注册在主输入框中，行为和 Overlay 内一致。用户可从任一入口执行（与 pi-btw 的 `/btw:*` 双路径模式对齐）
- 普通文本（非斜杠前缀）作为 Ask Advisor 消息提交

Overlay 仍使用 `nonCapturing: true` 创建，需要聚焦时通过 handle 显式调用 `focus()` / `unfocus()`。默认状态下键盘输入进入主输入框；仅在 `/advisor` 无参数或 `Alt+/` 时显式将焦点切换到 Overlay 输入框。

### Esc 关闭语义

Overlay 输入框聚焦时 `Esc` 仅关闭 Overlay（归还焦点到主输入框），不改变以下状态：

- Advisor Session 和 Advisor Transcript 保留
- 正在运行的 Watch Run 继续运行
- 输入框草稿保留，下次打开 Overlay 时恢复

### 输入排队与并发

pi 自身的输入模型：`isStreaming` 覆盖整个 agent run（含工具调用），`steer()`/`followUp()` 在 run 期间排队。pi-btw 直接调用 `session.prompt()` 未传 `streamingBehavior`，并发提交时会抛错并 dispose sub-session。

Advisor 的 Ask Context 注入（`sendCustomMessage` → `session.prompt()`）存在一个毫秒级的启动窗口，此窗口内 `isStreaming` 尚未变为 true。该窗口极其罕见，不值得引入状态机或队列。

方案：简单的 transient guard：

```
dispatchAsk(text):
  if isStreaming → sendUserMessage(text, { deliverAs: "steer" })
  else if askCompletion || activeWatchRun → 恢复输入到原输入框（瞬态 guard，毫秒级窗口）
  else → 启动新 ask
```

- 正常运行期间：走 pi 的 steer 通道
- 极罕见的启动竞态：输入不丢失，恢复到原输入框供用户重试
- 不增加 `askQueue`、`pendingSteer` 或额外状态机

产品层不向用户暴露任何 "Advisor is busy" 或拒绝语义。

Overlay 通过订阅 advisor 的 `AgentSessionEvent` 驱动实时更新（pi-btw 已验证的 `session.subscribe()` 模式）：

```
advisor subscribe → AgentSessionEvent → applyTranscriptEvent → buildOverlayTranscript → render
```

Ask Advisor 和 Watch Run 使用同一 overlay。Overlay 的内容结构遵循 `docs/prd.md` 的 Advisor Overlay UI 规范。

### 用户通知

Overlay 输入框聚焦时用户注意力在 Overlay 上。Concern 产生时额外通过 `ctx.ui.notify()` 发送 toast 提醒，确保主输入框聚焦时仍能感知。

### Chrome 约束

本次变更从 pi-btw 迁入交互模型（position、输入框、焦点切换、Esc、鼠标滚动、斜杠命令、草稿保留），不迁入 BTW 的 chrome 结构。Overlay 保留 Advisor 现有的两行 chrome（header border + bottom border，使用 `╭╮╰╯` 圆角），以及现有的 prefixed transcript blocks 内容结构。不新增 mode、summary、status、hints、rule 分隔线等展示行。

## Consequences

**正面：**

- 用户通过 `Alt+/` 明确表达与 Advisor 交互的意图，无需记忆 `/advisor` 前缀来区分消息目标
- 聚焦 overlay 时滚动操作（↑↓ PgUp/PgDn、鼠标滚轮）独立于主输入框
- Overlay 内命令就近可用，减少上下文切换
- 草稿保留让用户可以中途查看主对话后再回来继续编辑

**负面：**

- 比纯 nonCapturing 方案多一个输入框的 UI 元素
- 需要用户学习 `Alt+/` 快捷键

## Alternatives Considered

- **纯 nonCapturing overlay（无输入框）**：所有交互走主输入框 `/advisor` 命令。问题：隐式交互、缺少焦点切换、滚动与主输入框冲突、控制命令需要退回主输入框执行。
- **底部 widget**：占用空间小但展示能力有限，无法充分呈现 advisor 的审查过程。
