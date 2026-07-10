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

### 入口与转交

| 命令                              | 说明                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `/advisor <消息>`                 | Advisor 空闲时索取 Second Opinion；运行时直接发送不带 Ask Context 的消息     |
| `/advisor:handoff [instructions]` | 把最近一次完成的 Ask Advisor Second Opinion 作为用户消息转交给 Primary Agent |
| `/advisor:watch`                  | 启动一次 Watch Run，由 Advisor 根据 Primary Agent 的工作进展自行判断何时结束 |

Ask Advisor 和 Watch Run 复用同一个 Advisor，Advisor Transcript 保持连续。Second Opinion 是 Advisor 面向用户的第二视角；Advice 是 Watch Run 期间 Advisor 送达 Primary Agent 的 Hint 或 Concern。Watch Run 外，Advisor 不会自行向 Primary Agent 发送 Advice；用户认可某个 Second Opinion 时，用 `/advisor:handoff` 显式转交。

### Ask Context

Advisor 空闲时，当用户在 Primary Agent 进入新的用户对话轮次后首次使用 `/advisor`，Ask Advisor 会自动附带该 Primary 用户消息，以及它之后当前可见的 Primary Agent 文本回复。当前可见的 streaming 文本也可以进入这段 Ask Context。

同一个 Primary 用户对话轮次中的后续 Ask 不会重复附带 Ask Context。每次 Ask 都会让 Advisor 知道 Primary Transcript 当前到了哪里；当用户的问题需要更多历史、工具过程或更新的进展时，Advisor 可以自行 Pull Primary Transcript View。

Ask Context 只包含 Primary user text 和 assistant text。它实际发送的内容会显示在 Advisor Overlay 的 `Context` block 中；这次 Ask 没有附带 Ask Context 时，Overlay 不显示空 `Context` block。

Advisor 正在处理 Ask Advisor 或 Watch Run 时，`/advisor` 会把用户输入直接 Steer 给当前运行。这条消息不会附带新的 Primary Transcript 位置或 Ask Context，也不会消耗 Ask Context 注入记录；它会在当前工具调用结束后、Advisor 下一次模型调用前送达。

handoff 会把最近一次完成的 Ask Advisor 回答格式化为普通用户消息。Primary Agent 空闲时立即收到；Primary Agent 正忙时，这条消息会排为 follow-up。

```text
/advisor:handoff Please verify this concern and fix it if it is real.
```

Primary Agent 收到的内容形如：

```text
Here is the latest Advisor Second Opinion I want you to use. Please verify this concern and fix it if it is real.

Original Advisor request:
review the current change

Advisor Second Opinion:
...
```

### 智能送达

Watch Run 根据 Advice 的**意图**自动选择送达通道：

- **Hint**（加速信息）：正确的 API 用法、更好的算法 → 通过 Steer 尽快送达，减少浪费时间
- **Concern**（风险/质疑）：可能的 bug、架构疑虑 → 通过 Follow-up 等 Primary Agent 完成当前工作后再处理，不打断连贯性

### 审查能力

- **自主拉取**：Advisor 自己决定何时查看 Primary Transcript View、查看多少，无需等待被动推送
- **异步审查**：review 自然滞后于 Primary Agent 进度，不阻塞主流程
- **受限工具集**：Advisor 复用 Primary Agent 的读取、搜索和命令类工具以理解代码，但不会获得 `write` 和 `edit` 写入工具

### 可视化

- Advisor 的思考过程通过 Advisor Overlay 实时展示，用户可随时查看其输入输出和实际附带的 Ask Context

### 生命周期控制

| 命令                        | 说明                                            |
| --------------------------- | ----------------------------------------------- |
| `/advisor:watch-off`        | 取消当前 Watch Run，保留 Advisor 实例和上下文   |
| `/advisor:handoff [text]`   | 转交最近一次 Ask Advisor Second Opinion         |
| `/advisor:new`              | 清空 Advisor Transcript 和 Ask Context 注入记录 |
| `/advisor:model [model]`    | 打开可移动、可搜索的模型选择器，或直接设置模型  |
| `/advisor:thinking [level]` | 打开 thinking 选择器，或直接设置 thinking       |

### 健壮性

- **中断保护**：用户按 Esc 中断 Primary Agent 后，Advisor 不会自动唤醒它
- **无噪音**：无 Advice 时 Advisor 保持静默，不会产生无意义的 "Stop." / "Done."

## 限制

- **暂无 Advisor Transcript 磁盘持久化**：Advisor Transcript 仅在当前 session 内存中保留，关闭后不保存。这是出于首版简洁性考虑，Transcript 磁盘持久化方案尚未确定。
- **Advisor Overlay 当前无法滚动查看历史内容**：Overlay 采用 Pi TUI 的 `nonCapturing` 形态，保持右侧 split panel 可见，同时让键盘输入继续进入 Primary Agent。当前 `pi-tui` 还没有面向这种旁路面板的滚动输入通道，长内容会自动跟随最新输出；后续等 Pi TUI 支持后再接入滚动。

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
