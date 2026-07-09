# ADR-0003: 单一 Advisor 架构

## Status

Accepted

## Context

可能的使用场景需要多个 advisor 实例（如各自审查不同维度：安全、性能、风格）。oh-my-pi 通过 WATCHDOG.yml 支持多 advisor 配置。

## Decision

首版只支持 **一个 advisor 实例**。多 advisor 和外部 agent 标注为"可后续扩展"。

## Consequences

**正面：**

- 实现复杂度大幅降低
- 用户界面简单：一个 overlay 展示一个 advisor 的输出

**负面：**

- 无法同时进行多维度审查
- 用户若需要不同的审查视角，需切换配置

## Alternatives Considered

- **多 advisor（WATCHDOG 模式）**：oh-my-pi 方案。复杂度高，首版不必要。
