# Primary Transcript

## Advisor-visible Content Contract

Primary Transcript 是 Primary Agent 提供给 Advisor 的内容契约。Runtime 从当前 Primary branch 建立稳定、可索引的消息序列，再生成两种 Advisor 输入；所有内容选择、文本表示和 XML 外层都以本文档为权威。

两种输入共享同一个右开位置：Ask Context 的 `end` 表示快照总长度，可以直接作为后续 `pull_transcript` 的 `since_index`。

| 输入            | 用途                         | Advisor 收到的内容                                                                  |
| --------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| Ask Context     | Ask Advisor 自动附带近期对话 | 最新 Primary user text，以及它之后当前可见的 Primary assistant text                 |
| Pull Transcript | Advisor 主动读取指定范围     | user/developer text、assistant text、工具与执行摘要、相关 custom message 和状态摘要 |

两种输入都不包含 Primary assistant thinking。Advisor 需要判断工作过程时，依赖 assistant text、工具意图、工具状态和可见变更，避免把高体量 thinking 注入 Advisor context。

来源处理保持简洁：只读取当前 Primary branch；Advisor 自己的 transcript、Advice 原文、`/advisor` 控制消息、Overlay 状态和 persistence entries 不进入 Advisor 输入。被过滤的 Advice 可以保留不含正文的短 marker，例如 `[advisor hint omitted: deliverAs=steer]`，用于解释后续 Primary 行为。

## Ask Context Projection

Ask Context 只保留 text，不包含 tool call、tool result、custom message 或状态摘要。包含文本时，Advisor 收到：

正文作为 XML text node 转义后写入外层；Primary 原文里的 `<`、`>`、`&`、`'` 和 `"` 不会改变 payload 边界。

```text
<primary-context end="12" state="idle">
**user**:
请审查这个实现计划。

**primary**:
我会先检查现有实现。
</primary-context>
```

没有需要自动附带的新文本时，payload 仍提供位置和 Primary Agent loop state：

```text
<primary-context end="12" state="idle" />
```

## Pull Transcript Projection

Pull Transcript 把选定的 `[start, end)` 消息范围渲染成紧凑 markdown：

- 完整 markdown body 作为 XML text node 转义后写入 `<primary-transcript>`；正文里的 XML 字面量不会改变 transcript 边界。

- user、developer 和 assistant text 分别使用 `**user**:`、`**developer**:` 和 `**agent**:` role marker；连续同角色消息复用同一个 marker。
- tool call 与对应 result 合并成一条 `→ tool(args) ⇒ status` 摘要，保留工具意图、成功/错误状态和输出行数，不附带完整 tool output。
- edit tool result 携带 diff 时，在工具摘要后附带完整 unified diff。
- Primary 发起的 bash/python execution 使用单行命令、状态和输出行数摘要。
- plan-mode constraints 与 approved plan 使用 `<primary-context kind="…">` 保留全文；其他 custom message、branch、compaction 和 file mention 使用单行摘要。
- Primary assistant thinking 始终省略。

Advisor 收到的完整 tool result 使用 `<primary-transcript>` 外层：

```text
<primary-transcript start="5" end="11" total="11" state="running" wait="new_messages" waited-ms="842">
**agent**:
我先看一下现有的 auth 模块。
→ read(src/auth.ts) ⇒ ok · 80 lines
</primary-transcript>
```

`start`、`end` 和 `total` 基于同一个过滤后消息序列。Markdown 与 Overlay 使用的结构化 display items 必须从同一个消息 slice 同步生成；display items 只服务 Overlay，Advisor 模型读取上面的完整文本 tool result。

## Index Recovery

过滤 Advisor 来源内容不会产生额外 cursor。Compaction 或 tree 切换导致 `since_index` 超过当前消息序列长度时，Pull 从 index 0 恢复；tool result 通过 `since-index-out-of-bounds="true"` 明确报告恢复行为。
