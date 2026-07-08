# Advisor

Advisor 是一个依附 Primary Agent 的会话内持久化第二 agent，用于异步审查 Primary Agent 的工作并给出 Advice。

## 功能

### 两种入口

| 命令 | 说明 |
|------|------|
| `/advisor <消息>` | Ask Advisor：向 Advisor 提问，附带最近 Primary Transcript View 作为上下文 |
| `/advisor:watch` | 启动一次 Watch Run，由 Advisor 根据 Primary Agent 的工作进展自行判断何时结束 |

Ask Advisor 和 Watch Run 复用同一个 Advisor，Advisor Transcript 保持连续。

### 智能送达

根据建议的**意图**自动选择送达通道：

- **Hint**（加速信息）：正确的 API 用法、更好的算法 → 通过 Steer 尽快送达，减少浪费时间
- **Concern**（风险/质疑）：可能的 bug、架构疑虑 → 通过 Follow-up 等 Primary Agent 完成当前工作后再处理，不打断连贯性

### 审查能力

- **自主拉取**：Advisor 自己决定何时查看 Primary Transcript View、查看多少，无需等待被动推送
- **异步审查**：review 自然滞后于 Primary Agent 进度，不阻塞主流程
- **完整工具集**：Advisor 拥有 read、grep、glob、edit 等全部工具，可深入理解代码

### 可视化

- Advisor 的思考过程通过 Advisor Overlay 实时展示，用户可随时查看其输入输出

### 生命周期控制

| 命令 | 说明 |
|------|------|
| `/advisor:watch-off` | 取消当前 Watch Run，保留 Advisor 实例和上下文 |
| `/advisor:new` | 清空 Advisor Transcript，重置上下文 |
| `/advisor:model <model>` | 设置 Advisor 使用的模型 |
| `/advisor:thinking <level>` | 设置 Advisor 的 thinking level |

### 健壮性

- **中断保护**：用户按 Esc 中断 Primary Agent 后，Advisor 不会自动唤醒它
- **无噪音**：无 Advice 时 Advisor 保持静默，不会产生无意义的 "Stop." / "Done."

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

这是用户级配置，对同一用户的所有项目生效。Advisor model 需要用户通过 `/advisor:model <model>` 显式设置；未设置时 Advisor 不启动，并提示用户先设置 model。`thinking` 可通过 `/advisor:thinking <level>` 设置，未设置时使用 Advisor 的固定默认值。

## 产品与架构

产品需求详见 [`docs/prd.md`](docs/prd.md)。架构决策详见 [`docs/adr/`](docs/adr/)，记录了所有关键技术决策及其理由。
