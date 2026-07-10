# ADR-0005: 过滤写入工具 + 系统提示约束

## Status

Accepted

## Context

advisor 的定位是"审查者"。注意跟"执行者"区分：需要决定是否限制 advisor 可以使用的工具（如禁用 edit/write/bash 等修改性工具）。如果只依赖系统提示，advisor 在没有遵守角色边界时仍可能尝试直接修改文件。

## Decision

**复用 Primary 工具集，但过滤 `write` 和 `edit`**。advisor 从 Primary Agent 当前启用的工具名列表继承读取、搜索和命令类工具，再移除文件写入工具，最后加入 advisor 自己的 `pull_transcript` 与 `advise`。

```ts
const { session } = await createAgentSession({
  tools: advisorToolNames, // primary tools minus ["edit", "write"], plus advisor tools
  // ...
});
```

系统提示继续约束行为："你是 reviewer，职责是审查和建议。注意跟 primary agent 区分：不要代替 primary agent 完成任务，不要主动修改文件。`write` 和 `edit` 工具不可用，需要变更时写成 Advice 或 Second Opinion。"

## Consequences

**正面：**

- advisor 可以继续用 read、grep、glob/ls、bash 等工具深入理解和验证代码
- primary 新增非写入工具时，advisor 会自动继承，减少配置维护
- 如果 advisor 试图调用 `write` 或 `edit`，工具目录层会阻断并返回 tool-not-found 类错误，促使它回到审查职责

**负面：**

- advisor 无法直接替 Primary Agent 做小修复，需要通过 Advice、Second Opinion 或 handoff 传达修改建议
- 写入工具名需要随 Pi 内置工具命名保持同步

## Alternatives Considered

- **全工具集开放 + 系统提示约束**：advisor 与 Primary Agent 拥有同一套工具。理解能力最强，但安全性完全依赖模型遵守系统提示。
- **只读工具集**（pi-omplike-advisor）：仅开放 `["read", "grep", "glob"]`，无 edit/write/bash。安全性最高，但限制了 advisor 的理解深度，advisor 无法通过执行代码来验证自己的假设。
