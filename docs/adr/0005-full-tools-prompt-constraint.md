# ADR-0005: 全工具集开放 + 系统提示约束

## Status

Accepted

## Context

advisor 的定位是"审查者"。注意跟"执行者"区分：需要决定是否限制 advisor 可以使用的工具（如禁用 edit/write/bash 等修改性工具）。

## Decision

**不限制工具种类**。advisor 直接复用 primary agent 的工具名列表，拥有与 primary agent 相同的完整工具集。

```ts
const { session } = await createAgentSession({
  tools: primaryToolNames,  // ["read", "bash", "edit", "write", ...]
  // ...
});
```

通过系统提示约束行为："你是 reviewer，职责是审查和建议。注意跟 primary agent 区分：不要代替 primary agent 完成任务，不要主动修改文件。"

## Consequences

**正面：**
- advisor 可以深入理解代码（read、grep、glob），进行更精准的审查
- 无需维护两套不同的工具注册表；primary 新增工具 advisor 自动获得
- 无需单独声明工具列表，减少配置

**负面：**
- 存在 advisor 越权修改文件的风险（依赖模型遵循系统提示的能力）
- 如果系统提示约束失效，advisor 可能产生误操作

## Alternatives Considered

- **只读工具集**（pi-omplike-advisor）：仅开放 `["read", "grep", "glob"]`，无 edit/write/bash。安全但限制了 advisor 的理解深度——advisor 无法通过执行代码来验证自己的假设。
