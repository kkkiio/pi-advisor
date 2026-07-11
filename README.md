# Advisor

Advisor 是一个依附 Primary Agent 的会话内持久化第二 agent，用于异步审查 Primary Agent 的工作，向用户提供 Second Opinion，并在用户确认或 Watch Run 期间把有效观点送达 Primary Agent。

## 安装

```bash
# npm 安装
pi install npm:@kkkiio/pi-advisor

# 或本地路径安装
pi install ./path/to/pi-advisor
```

安装后需设置 Advisor model（否则不会启动）：

```
/advisor:model openai/gpt-5.5
```

详见[配置](#配置)。

## 目标

### Advisor 目标

- **Review**：发现 bug、设计问题、流程问题和它们的根因，向用户提供独立 reviewer 的 Second Opinion。Advisor 作为 reviewer，不承担实现功能的职责。
- **Guide**：引导可能陷入 tunnel effect 的 Primary Agent，用高效率事实、关键文件、API、约束和顺序提示帮助它越过障碍，并用 review 视角帮助它在工作结束前检查和修正工作。

### 产品体验目标

- 保持旁路审查安静、相关、可追溯、可观察，避免破坏 Primary Agent 的工作节奏。

## 功能

### `/advisor [<消息>]` — Ask Advisor

- **无参数**：打开 Advisor Overlay 并将焦点置于 Overlay 输入框，用户可直接输入消息。
- **有参数**：打开 Advisor Overlay 并立即以该消息发起 Ask Advisor。

消息行为取决于 Advisor 当前状态：

- **Advisor 空闲**：启动一次新的 Ask Advisor。当用户在 Primary Agent 进入新的用户对话轮次后首次使用时，自动附带 **Ask Context**：该 Primary user text message，以及它之后当前可见的 Primary assistant text（包含 streaming 文本，不包含 thinking、tool call、tool result 或 custom message）。同一个 Primary 用户对话轮次中的后续 Ask 不会重复附带 Ask Context。
- **Advisor 正在运行**（Ask Advisor 或 Watch Run 期间）：消息作为 Steer 送入当前运行，只包含用户输入，不附带 Ask Context。

每次 Ask（空闲时启动的）都会告诉 Advisor 当前 Primary Transcript 的位置和 Primary Agent 运行状态。当用户的问题需要更多历史、工具过程或更新的进展时，Advisor 可以自行 Pull Primary Transcript View，无需用户手动复制上下文。

Ask Context 实际发送的内容会显示在 Advisor Overlay 的 `Context` block 中；没有附带 Ask Context 时，Overlay 不显示空 `Context` block。

Ask Advisor 和 Watch Run 复用同一个 Advisor，Advisor Transcript 保持连续。Second Opinion 是 Advisor 面向用户的第二视角；Advice 是 Watch Run 期间 Advisor 送达 Primary Agent 的 Hint 或 Concern。Advisor 不获得 `write` 和 `edit` 写入工具，需要修改时代码通过 Second Opinion 或 Advice 交给 Primary Agent 处理。

### `/advisor:handoff [instructions]` — 转交 Second Opinion

将最近一次完成的 Ask Advisor Second Opinion 作为用户消息转交给 Primary Agent。未提供 `instructions` 时，默认要求 Primary Agent 使用该 Second Opinion 作为参考上下文。

Primary Agent 空闲时立即收到；Primary Agent 正忙时，这条消息会排为 follow-up。

转交消息格式：

```text
Here is the latest Advisor Second Opinion I want you to use. <instructions>

Original Advisor request:
<Ask Advisor prompt>

Advisor Second Opinion:
<latest completed Ask Advisor answer>
```

如果 Advisor 正在处理上一次 Ask，handoff 会等待其完成后再转交。没有完成过 Ask Advisor Second Opinion 时，用户收到明确提示。handoff 不清空 Advisor Transcript。

### `/advisor:watch` — 启动 Watch Run

启动一次异步 Watch Run。Advisor 跟随 Primary Agent 的工作进展，自行判断何时完成本次审查。用户可以通过 `/advisor:watch-off` 提前取消。

Watch Run 期间，Advisor 根据 Advice 的意图自动选择送达通道：

- **Hint**（加速信息）：正确的 API 用法、更好的算法等，通过 Steer 尽快送达，减少浪费时间
- **Concern**（风险/质疑）：可能的 bug、架构疑虑等，通过 Follow-up 等 Primary Agent 完成当前工作后再处理，不打断连贯性

Watch Run 外，Advisor 不会自行向 Primary Agent 发送 Advice。用户认可某个 Second Opinion 时，用 `/advisor:handoff` 显式转交。没有实质性 Advice 时 Advisor 保持静默。

### `/advisor:watch-off` — 取消 Watch Run

取消当前 Watch Run，保留 Advisor 实例和已有 Advisor Transcript。

### `/advisor:new` — 重置 Advisor

执行完整重置（清空 Advisor Transcript、Ask Context 自动注入记录、Second Opinion 记录、输入框草稿；如果 Watch Run 正在运行则先取消），Overlay 保持打开。

### `/advisor:clear` — 清空并关闭

执行与 `/advisor:new` 完全相同的重置，然后关闭 Overlay。

### `/advisor:model [model]` — 设置模型

打开可移动、可搜索的模型选择器，或直接通过参数设置 Advisor 使用的模型。修改后会自动重置 Advisor 会话。偏好保存在 `~/.pi/agent/advisor.json`，对同一用户的所有项目生效。未设置时 Advisor 不启动，并提示用户先设置 model。

### `/advisor:thinking [level]` — 设置 Thinking Level

打开 thinking 级别选择器，或直接设置 Advisor 的 thinking level。可用级别：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`，默认为 `medium`。修改后会自动重置 Advisor 会话。未设置时使用 Advisor 的固定默认值。

### `/advisor:hide` — 隐藏 Overlay

隐藏 Advisor Overlay，不清空 Advisor Transcript。可随时通过 `/advisor:show` 重新显示。

### `/advisor:show` — 显示 Overlay

重新显示 Advisor Overlay，恢复已有的 Advisor Transcript 视图。

### Advisor Overlay

接受 `/advisor` 或 `/advisor:watch` 后 Overlay 自动打开。Overlay 采用 top-center 面板形态，以 prefixed transcript blocks 实时展示 Advisor 的审查轨迹：用户消息、Ask Context、工具调用（Pull、Hint、Concern 等）和 Advisor 回答。Overlay header 显示 Advisor 状态和 context window 用量（如 `Advisor · thinking · ctx 0.1%/128k`），内容超出可视区域时显示 `↑N ↓M` 滚动指示器。

Overlay 底部有独立输入框，用户可直接输入消息或控制命令。主输入框保留全部公开命令（包括 `/advisor`、`/advisor:hide`、`/advisor:show`），Overlay 输入框复用以下七个控制命令：`/advisor:watch`、`/advisor:watch-off`、`/advisor:handoff`、`/advisor:new`、`/advisor:clear`、`/advisor:model`、`/advisor:thinking`。

**Overlay 控制：**

- `Alt+/`：在 Overlay 输入框和主输入框之间切换焦点（备选：`Ctrl+Alt+W`）
- Overlay 输入框聚焦时，`Esc` 关闭 Overlay 并将焦点归还主输入框
- 切换到主输入框时，Overlay 输入框的草稿保留不丢失
- 聚焦 Overlay 时，↑↓ PgUp/PgDn 和鼠标滚轮可滚动 transcript

用户中断 Primary Agent 后，Advisor 不会自动唤醒 Primary Agent。

## 限制

- **暂无 Advisor Transcript 磁盘持久化**：Advisor Transcript 仅在当前 session 内存中保留，关闭后不保存。这是出于首版简洁性考虑，Transcript 磁盘持久化方案尚未确定。

## 配置

配置文件位于 `~/.pi/agent/advisor.json`：

```json
{
  "model": "openai/gpt-5.5",
  "thinking": "xhigh"
}
```

这是用户级配置，对同一用户的所有项目生效。Advisor model 需要用户通过 `/advisor:model` 选择或 `/advisor:model <model>` 显式设置；未设置时 Advisor 不启动，并提示用户先设置 model。`thinking` 可通过 `/advisor:thinking` 选择或 `/advisor:thinking <level>` 设置，未设置时使用 Advisor 的固定默认值。

## 产品与架构

产品需求详见 [`docs/prd.md`](docs/prd.md)。架构决策详见 [`docs/adr/`](docs/adr/)，记录了所有关键技术决策及其理由。

灵感致谢：本项目受到 pi-btw、oh-my-pi 和 pi-omplike-advisor 的启发。
