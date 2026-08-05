# ToolSearch 预加载阈值

## 问题

延迟工具（`shouldDefer=true`）被无条件地隐藏在 ToolSearch 之后：每个
MCP 工具（在 `DiscoveredMCPTool` 中硬编码）加上一组捆绑的内置工具
（web_search、web_fetch、cron、monitor、worktree 等）。当延迟集合很大时，
延迟加载可以节省 prompt token，但它并非没有代价：每次会话中途的揭示都会
重写函数声明列表，而该列表位于 tools→system→messages 前缀的前部，因此
一次 ToolSearch 加载就会使整个 prompt KV 缓存失效。对于较小的延迟集合，
延迟加载节省得很少，而缓存损坏加上额外的 ToolSearch 往返使其净收益为负。

Claude Code 用 `ENABLE_TOOL_SEARCH=auto` / `auto:N` 来建模这一权衡：
“如果工具能放进上下文窗口的 10% 以内就预加载，否则延迟加载”
（code.claude.com/docs/en/agent-sdk/tool-search）。本改动添加等价的门控。

## 设计

新设置 `tools.toolSearch.threshold`（数值，百分比，默认 `10`）。

在会话开始时（`GeminiClient.startChat`，在延迟工具提醒被解析之前），当
ToolSearch 已注册且阈值大于 0 时：

- 估算每个延迟工具 schema 的合计 token 占用——捆绑内置工具和 MCP 一视
  同仁（`JSON.stringify(tool.schema).length / CHARS_PER_TOKEN`）。
- 如果总量能放进上下文窗口的 `threshold`% 以内
  （`contentGeneratorConfig.contextWindowSize`，回退到
  `tokenLimit(model)`），则通过现有的 `revealDeferredTool` 机制把它们全部
  揭示。全有或全无——部分揭示会在 ToolSearch 之后留下一个任意的子集，
  而任何仍被延迟的工具在首次使用时仍可能击穿缓存。
- 否则所有工具保持延迟（先前行为）。`threshold: 0` 无条件恢复旧行为。

因此，预加载的工具会进入初始声明列表，从启动时的延迟工具提醒中被过滤
掉，并且声明列表在整个会话期间保持稳定。

## 决策

- **仅在会话开始时执行，绝不在 `setTools()` 时执行。** 揭示一个启动提醒
  已经宣告过的工具，会使 `queueAddedMcpToolsReminder` 把它标记为“已移
  除”，而会话中途的声明变更会击穿预加载本来要保护的缓存。来自较晚连接
  的服务器的工具保持延迟（通过新增工具提醒宣告，可经 ToolSearch 到达），
  直到下一次会话开始。`/clear` 会清除已揭示集合并重新运行该决策。
- **对整个延迟集合使用一个预算，包含捆绑工具。** Claude Code 的自动阈值
  只覆盖 MCP/SDK 工具（其内置工具被单独管理），但它承担得起这种拆分：
  延迟工具在计算缓存键之前就从 prompt 前缀中剥离，并且被发现的工具的定
  义通过 `tool_reference` 块内联展开——“前缀未被触碰，因此 prompt 缓存
  得以保留”（platform.claude.com/docs/en/agents-and-tools/tool-use/
  tool-search-tool）。在这里，每次揭示——无论是捆绑工具还是 MCP——都会
  经过 `setTools()` 并重写声明列表。排除约 14 个捆绑的延迟工具
  （web_search、web_fetch 等）会让前缀距离完全击穿缓存只差一次常见的
  工具加载，正好丧失了预加载所换来的稳定性。当并集超过预算时，所有工具
  保持延迟，这与捆绑工具在引入阈值之前的基线一致。
- **阈值默认为 10（自动模式开启），与 Claude Code 的默认值不同。**
  Claude Code 的未设置默认值使 MCP 工具始终延迟，并使 `auto` 成为选择
  启用——在那里承担得起，因为延迟工具的首次使用不产生缓存失效代价。在
  这里它的代价是整个前缀重建，因此自动式门控默认开启；`threshold: 0`
  复现 Claude Code 的始终延迟默认值。
- **已揭示的工具计入预算**，使重复的会话开始（压缩也会经过
  `startChat`）不会随着服务器来来去去而把已揭示集合棘轮式地推过预算。
- **ToolSearch 不可用时不预加载** ——
  `resolveDeferredToolsForReminder` 中现有的急切揭示分支已经暴露了一切。
