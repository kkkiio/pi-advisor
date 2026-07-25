# Primary Transcript

## Advisor-visible Content Contract

Primary Transcript 是 Primary Agent 提供给 Advisor 的内容契约。Runtime 从当前 Primary branch 建立稳定、可索引的消息序列，再生成两种 Advisor 输入；所有内容选择、文本表示和 XML 外层都以本文档为权威。

两种输入使用相同的 markdown 序列化格式，共享 `[start, end)` 右开区间。Ask Context 的 `end` 可以直接作为后续 `pull_transcript` 的 `since_index`。

| 输入            | 用途                         | Advisor 收到的内容                                                                  |
| --------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| Ask Context     | Ask Advisor 自动附带近期对话 | 与 Pull Transcript 格式相同，区间 `[start, end)`，由去重逻辑自动选择                |
| Pull Transcript | Advisor 主动读取指定范围     | user/developer text、assistant text、工具与执行摘要、相关 custom message 和状态摘要 |

两种输入都不包含 Primary assistant thinking。Advisor 需要判断工作过程时，依赖 assistant text、工具意图、工具状态和可见变更，避免把高体量 thinking 注入 Advisor context。

## 共享序列化

Ask Context 与 Pull Transcript 的 markdown body 由同一个 slice renderer 生成，使用相同的 `formatSessionHistoryMarkdown` 参数：

- `watchedRoles: true`
- `includeToolIntent: true`
- `expandPrimaryContext: true`
- `expandEditDiffs: true`
- `displayItems`（同步生成，供 Overlay 使用）

两者的差异仅在 XML 外层和区间来源：

- Ask Context：区间 `[start, end)` 由 `selectAskContext` 决定，`start` 为最新 Primary user message index。
- Pull Transcript：区间 `[start, end)` 由 Advisor 通过 `since_index` 和 `count` 指定。
- 同一 `primaryUserMessageIndex` 不重复注入 body，仅发送 position-only `<primary-head at="..." state="..." />`。

来源处理保持简洁：只读取当前 Primary branch；Advisor 自己的 transcript、Advice 原文、`/advisor` 控制消息、Overlay 状态和 persistence entries 不进入 Advisor 输入。被过滤的 Advice 可以保留不含正文的短 marker，例如 `[advisor hint omitted: deliverAs=steer]`，用于解释后续 Primary 行为。

## Ask Context Projection

Ask Context 把选定的 `[start, end)` 消息范围渲染成与 Pull Transcript 相同的紧凑 markdown。包含 body 时：

```text
<primary-context start="9" end="12" state="idle">
**user**:
请审查这个实现计划。

**agent**:
我先看一下现有的 auth 模块。
→ read(src/auth.ts) ⇒ ok · 80 lines
</primary-context>
```

同一 Primary user turn 内重复 Ask 时，不重复注入 body，仅发送 position-only payload，通过 `at` 指明当前 Primary Transcript 进展：

```text
<primary-head at="14" state="idle" />
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

两种输入的 markdown body 通过同一个 slice renderer 生成，外层标签不同（`<primary-context>` 与 `<primary-transcript>`）。Advisor 收到的完整 tool result 示例：

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
