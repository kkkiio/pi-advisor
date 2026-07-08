# ADR-0006: autoResumeSuppressed 中断保护

## Status

Accepted

## Context

用户按 Esc 中断 Primary Agent 时，Advisor 的 Advice 可能通过 `triggerTurn` 自动唤醒它，违背用户中断的意图。

## Decision

设置 `autoResumeSuppressed` 标志：
- 用户按 Esc 中断 Primary Agent 时置为 true
- Advisor 在此期间送达的 Advice 不会触发 `triggerTurn`
- 用户发送下一条消息时标志清除

## Consequences

**正面：**
- 用户中断后 Advisor 不会意外唤醒 Primary Agent
- 符合用户"我想停下来"的预期

**负面：**
- 中断期间 Advisor 的 Hint 可能被延迟送达
