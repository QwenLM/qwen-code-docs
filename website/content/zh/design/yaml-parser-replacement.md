# YAML 解析器替换 — 调研结果

内部设计文档，用于将 `packages/core/src/utils/yaml-parser.ts` 中手写的 192 行 YAML 解析器替换为真正的库，以便 Claude Code 声明式 agent schema 中延迟处理的 `mcpServers` 和 `hooks` 字段能够安全地通过 subagent / skill / converter 代码路径进行往返解析。

配套文档：[`docs/design/declarative-agents-port.md`](./declarative-agents-port.md)。
Issue: [#4821](https://github.com/QwenLM/qwen-code/issues/4821)。[PR #4842](https://github.com/QwenLM/qwen-code/pull/4842) 后续工作的前置条件。

## 阶段 0 — 已验证的来源

| 来源                                                  | 版本 / 日期                         | 权威性原因                                                                                                               |
| ------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                  | 较旧的 CC 快照 (pre-2.1.168)        | 直接来源 — 15 行的包装器，指明了所使用的库                                                                          |
| `~/code/claude-code/src/utils/frontmatterParser.ts`     | 同一快照                          | 直接来源 — 370 行的 frontmatter 分割器 + 2 次解析恢复机制                                                                 |
| `/private/tmp/cc-2.1.168/claude.strings`                | 提取自 CC 2.1.168              | 当前行为的权威依据 — 字符串包含混淆后的符号名，但包含 JSON schema 和错误消息文本   |
| `packages/core/src/utils/yaml-parser.ts` (本仓库)    | `lazzy/gifted-hamilton-684741` 的 HEAD | 被替换的解析器                                                                                                       |
| 针对本仓库中 `yaml@2.8.1` 的实时 `node -e` 探测 | 2026-06-08                             | 经验性安全行为 — anchors, merge keys, `!!js/function`, billion-laughs, `maxAliasCount` (结果内联在阶段 4 中) |

置信度标签：**C** 直接证据确认；**I** 从多个确认事实推断；**O** 未决问题。

## 阶段 1 — CC 使用了哪个 YAML 库？

**答案：[`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml)，而不是 `js-yaml`。** 通过逐字阅读 `~/code/claude-code/src/utils/yaml.ts` 确认：

```ts
export function parseYaml(input: string): unknown {
  if (typeof Bun !== 'undefined') {
    return Bun.YAML.parse(input);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('yaml') as typeof import('yaml')).parse(input);
}
```

- **库**：`yaml` npm 包。**C**
- **API**：顶层 `.parse(input)`。使用包的默认 schema（即 YAML 1.2 `core` — JSON 超集，无 JS 扩展）。**C**
- **Bun 快捷方式**：在 Bun 下运行时，CC 使用 `Bun.YAML.parse()` 以避免打包约 270 KB 的 YAML 解析器。**C** 与 qwen-code 无关（我们不针对 Bun 运行时）。
- **Schema 模式**：CC 中未在任何地方显式设置。依赖 `yaml` 包的默认行为，加上消费层的 zod 验证（根据 `docs/design/declarative-agents-port.md` 中的 `DL7`、`gS8`、`TKO`/`_u`）。**C**

### 为什么选择 `yaml` 而不是 `js-yaml`

| 维度                | `js-yaml` 4.x                                                                              | `yaml` (eemeli) 2.x                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 默认 schema           | `DEFAULT_SAFE_SCHEMA` (自 4.x 起) — 安全；旧版本使用带有 JS 扩展的 `DEFAULT_FULL_SCHEMA` | `core` (YAML 1.2 规范) — 仅限 JSON 类型             |
| `!!js/function` 标签      | 4.x 中不支持 (3.x 中支持)                                                          | 从未支持                                      |
| Billion-laughs 防护     | 无 (需手动负责)                                                               | 内置 `maxAliasCount: 100` 默认值                |
| Merge keys (`<<`)        | 支持 (必须通过 `MERGE_SCHEMA` 或过滤来禁用)                                   | 默认禁用，通过 `{ merge: true }` 启用    |
| 已经是 qwen-code 的依赖？ | `js-yaml@4.1.1` ✓                                                                          | `yaml@2.8.1` ✓ (已被 `skill-manager` 导入) |

在 2026 年两者都是合理的选择，但**原始任务简报推荐了 `js-yaml` 的 `FAILSAFE_SCHEMA` / `CORE_SCHEMA`**。我们出于以下三个具体原因偏离了该指导：

1. **CC 一致性**。移植 CC 的 frontmatter schema 的核心目的是让用户将 CC agent 文件放入 `.qwen/agents/` 并能完全一致地解析。使用 CC 相同的解析器可以最大限度地减少边缘 YAML 结构（多文档流、flow 与 block 标量、标签处理）上的差异。
2. **`yaml` 已经是 `skill-manager.ts` 中的直接使用者** — 参见 `packages/core/src/skills/skill-manager.ts:13` (`import * as yaml from 'yaml'`)。统一使用 `yaml` 可以消除同一包中两个重复的 YAML 技术栈之一。**C** (grep 结果记录在阶段 6 中)。
3. **比 `js-yaml` 更安全的默认值**。`yaml` 内置的 `maxAliasCount` 无需手动配置即可阻止 billion-laughs 攻击；merge keys 默认禁用；任意标签会变成带有 `YAMLWarning` 的字面量字符串，而不是触发可调用的解析器。阶段 4 中有经验证据。

如果未来的维护者想要放弃 `yaml` 依赖并统一使用 `js-yaml`，迁移是机械性的：将 `yaml.parse` / `yaml.stringify` 替换为 `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump`。对于 CC 和 qwen-code 实际使用的 100% 子集（键值对、列表、嵌套 map、标量布尔值/数字），这两个库的输出是一致的。如果未来出现这种情况，请单独跟踪该决策。

## 阶段 2 — Frontmatter 解析管道 (CC)

`~/code/claude-code/src/utils/frontmatterParser.ts` 有 370 行。主要发现：

| 步骤                | 逻辑                                                                                                                     | 来源                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 分隔符匹配     | 正则 `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — 在第 0 列开始，body 是非贪婪的，闭合的 `---` 必须独占一行   | `frontmatterParser.ts:~123` (行号来自旧快照；视为近似值) **C**                      |
| 第 1 次解析        | 调用 `parseYaml(body)`。如果成功 → 返回解析后的对象 + 剩余内容。                                            | 同一文件，try 块顶部 **C**                                                                             |
| 第 2 次恢复     | 遇到 `YAMLException` 时，逐行遍历，自动为看起来像日期/冒号/特殊字符的值加引号，重试一次 `parseYaml`。           | 旧快照中的 ~85–121 行 **C** (`tab → 2 spaces` 规范化，ISO 日期启发式，冒号陷阱)          |
| 失败回退 | 两次解析均失败 → 通过 `logForDebugging` 记录日志，返回 `{ data: {}, content: text }`。Agent 以空的 frontmatter 加载。 | 函数末尾 **C**                                                                                         |
| 遥测           | 在上游进一步包装 — `tengu_frontmatter_shadow_unknown_key` / `_mismatch` 事件从 `ug5.agent` (Ig5 schema) 触发 | `claude.strings:308120`, `309074`, `309076` (在 `docs/design/declarative-agents-port.md` 阶段 1 中交叉引用) |

**对 qwen-code 的启示**：我们不需要克隆 2 次解析恢复机制。qwen-code 的 `subagent-manager.ts` 已经为其加载器强制执行了更严格的“在顶层遇到格式错误的 frontmatter 时抛出异常”语义（参见 `parseSubagentContent`），而 2 次解析恢复机制专门用于宽容旧的、手动编辑的 CC agent 文件。移植更严格的策略是没问题的；我们只需要确保**在嵌套字段格式错误时不会导致整个加载器崩溃**。关于 warn-and-drop（警告并丢弃）策略，请参见阶段 5。

## 阶段 3 — 通过 zod 进行嵌套验证 (CC)

根据 `docs/design/declarative-agents-port.md` 阶段 1 + 二进制字符串交叉检查，相关的 CC 验证器如下：

### `mcpServers` (CC 符号 `gS8` / JSON-shadow `jL7`)

```
mcpServers: z.union([
  z.string(),                                            // server name reference
  z.record(z.string(), McpServerConfigSchema()),         // inline { name: spec }
])
```

`McpServerConfigSchema()` (来自 `claude.strings:124–135` 参考) 是基于 `type` 的**判别联合类型 (discriminated union)**：

| `type`             | 必填字段                      | 备注                                              |
| ------------------ | ------------------------------------ | -------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]` | 加上 `env?: Record<string,string>`, `cwd?: string` |
| `"sse"`            | `url: string`                        | 加上 `headers?: Record<string,string>`             |
| `"http"`           | `url: string`                        | 加上 `headers?`, `method?`                         |
| `"websocket"`      | `url: string`                        | qwen-code 一致性未知 — 视需要推迟      |
| `"sdk"`            | 视情况而定                               | CC 内部使用；我们不需要支持         |
| `"claudeai-proxy"` | 视情况而定                               | CC 内部使用；我们不需要支持         |

**对于 qwen-code v1**：验证为 `Record<string, unknown>`（宽松的 DL7 风格），并让下游合并到 `Config.getMcpServers()` 中进行形状强制转换。`qwen-code` 已经有带有 `type` 判别的 `MCPServerConfig` 类 — 我们复用该转换器而不是复制 zod schema。请参见 `docs/design/declarative-agents-port.md` 中运行时连接计划的阶段 4。

### `hooks` (CC 符号 `TKO` / `_u`)

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig (discriminated union on `type`):
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

根据字符串交叉检查，hook-event 键与 qwen-code 已经支持的集合相同：`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `Notification` — 加上几个 qwen 独有的事件（`TodoCreated`, `TodoCompleted`），CC 没有这些事件。

**对于 qwen-code v1**：验证为 `Record<string, unknown>`（宽松），然后交给 qwen-code 现有的 `SessionHooksManager` 验证器，该验证器已经实现了每个事件的 `HookDefinition[]` 形状（参见根据阶段 1 运行时映射的 `packages/core/src/hooks/types.ts:207–211`）。

### 为什么在 Ig5 shadow 级别这两个验证器都是 `z.unknown()`

`Ig5` 是**遥测 shadow schema** — 当 YAML 键不在已知集合中时，它会触发 `tengu_frontmatter_shadow_unknown_key` 事件，当已知键类型错误时触发 `_mismatch` 事件。它故意对 `mcpServers` 和 `hooks` 使用 `z.unknown()`，因为 **`Ig5` 在解析时运行**，并且会为每个内联的 mcpServers 规范发出虚假的 mismatch 事件。真正的验证被委托给：

- `gS8` (用于 `mcpServers`) — 在 **agent 注册时**从 `DL7` 逐项 `safeParse` 调用
- `TKO` (用于 `hooks`) — 在 **hook 触发时**从 `_u().safeParse` 调用
这种**延迟验证（lazy validation）** 是 qwen-code 应该效仿的模式：保持 frontmatter 解析器的宽松（相当于 TS 中的 `z.unknown()`），在使用时再进行验证。如果试图将完整的 zod 树提前引入 `SubagentConfig`，将迫使我们把 qwen 的 `MCPServerConfig` 类和 `HookDefinition` 类型导入到它们目前不存在的层级，并且还需要我们为实际上并不支持的 `type: 'sdk'` / `type: 'claudeai-proxy'` 编造虚假的验证器。

## Phase 4 — 安全态势

在 qwen-code 仓库中对 `yaml@2.8.1` 的默认行为进行实证验证：

### 探测结果

```
$ node -e "const y=require('yaml'); console.log(y.parse('a: 1').constructor.name, y.parseDocument('a: 1').schema?.name)"
Object core
```

→ 默认 schema 为 `'core'`（YAML 1.2 JSON 超集）。**C**

```
$ node -e "const y=require('yaml'); console.log(y.parse('!!js/function \"function(){}\"'))"
function(){}
(node:18525) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: tag:yaml.org,2002:js/function
```

→ `!!js/function` 标签**不会**执行。该值会被解析为**字面量字符串** `"function(){}"`（而不是可调用的函数对象），并抛出一个非致命的 `YAMLWarning`。攻击者无法通过此途径实现 RCE（远程代码执行）。**C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ 别名展开 / billion-laughs 攻击在**默认情况下会被拒绝**。该库内置了 `maxAliasCount: 100`（解析失败是因为计算了 1+10+100 = 111 个别名）。**C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ 合并键（`<<`）默认被解析为**字面量键字符串**，而**不会**被展开。`<<` 解析器需要通过 `{ merge: true }` 显式启用。我们**不会**启用它。**C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ CC 格式的嵌套 `mcpServers` 能够正确解析为深层嵌套的 object/array。**C**

### 安全性总结

| 攻击途径 | `yaml@2.8.1` 默认行为 | qwen-code 中需要采取的操作 |
| --- | --- | --- |
| 任意 JS 执行 | 不可能 — 无 eval | 无 |
| `!!js/function` 标签 | 变为字面量字符串 + 警告 | 无 |
| Billion laughs 攻击 | 被拒绝（`maxAliasCount: 100`） | 无 — 保持默认 |
| 合并键（`<<`） | 视为字面量键 | 无 — 保持默认（**不要**传递 `merge: true`） |
| 锚点 / 别名（常规使用） | 允许，对 CC 格式数据很有用 | 无 |
| 任意未知标签 | 字符串 + `YAMLWarning` | 可选：将警告重定向到 logger（见 Phase 6） |

**结论**：`yaml` 包的默认行为已经比原始任务简报中要求通过 `js-yaml` 的 `FAILSAFE_SCHEMA` 实现的行为更安全。不需要进行 schema 锁定调用。

## Phase 5 — 恢复语义

CC 在每一层都选择了**优雅地警告并丢弃（warn-and-drop）** 策略：

1. YAML 解析器抛出异常 → frontmatter 解析器记录日志并返回 `{}`（空数据）
2. 字段结构错误（例如，`mcpServers: "this is a string"`） → `safeParse` 失败 → 该字段从生成的配置中被丢弃
3. 字段结构_几乎_错误（例如，当 schema 期望 object 时，单个 `mcpServers` 项是 string） → 针对单项的 `safeParse` 仅丢弃该项，保留其余项

qwen-code 已经为 `permissionMode`、`maxTurns`、`color`、`effort` 实现了按字段警告并丢弃的策略（参见 `packages/core/src/subagents/agent-frontmatter-schema.ts`）。我们将同样的模式扩展到 `mcpServers` 和 `hooks`。

我们**不会**从 CC 中克隆以下内容：

- **带自动引号的 2-pass YAML 恢复**。这对 qwen-code 来说是累赘 — 我们是一个新项目，没有需要宽容对待的历史遗留手写 frontmatter 文件。清晰的报错比猜测性的重新解释更有用。
- **`tengu_*` 遥测事件**。替换为 qwen-code 自己的 logger / 加载器其余部分使用的任何遥测层。

## Phase 6 — 对 qwen-code 的建议

### 库的选择

- **使用 `yaml@^2.8.1`**（已经是间接依赖 — 将其提升为 `packages/core/package.json` 中的直接依赖，以免在更严格的依赖解析模式下崩溃；同时允许我们锁定大版本）。
- **使用默认 schema**（`core`），不传 schema 标志。
- **不要**传递 `{ merge: true }`。不要启用任何非默认选项。
- 为了获得确定性的 stringify 输出（用于测试快照），向 `yaml.stringify` 传递 `{ lineWidth: 0, defaultStringType: 'PLAIN' }`，这样库就不会根据内容长度自动换行或随意切换到块标量引号。

### 需要保留的 API 接口

当前 `packages/core/src/utils/yaml-parser.ts` 导出：

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

替换后的实现保持这两个签名**完全一致**，这样 5 个调用方（`subagent-manager.ts`、`claude-converter.ts`、`rulesDiscovery.ts`、`skill-manager.ts`、`skill-load.ts`）以及 `index.ts` 的重新导出都不需要修改调用处。

实现草图：

```ts
import * as yaml from 'yaml';

export function parse(yamlString: string): Record<string, unknown> {
  const parsed = yaml.parse(yamlString);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string {
  return yaml.stringify(obj, {
    lineWidth: options?.lineWidth ?? 0,
    minContentWidth: options?.minContentWidth ?? 20,
  });
}
```

**为什么将非 object 的顶层结果强制转换为 `{}`**：现有的每个调用方都假定结果是一个 record。如果 YAML 文件解析为 `null`（空文件）、`["foo"]`（列表）或 `"hello"`（裸标量），目前会导致下游的解构操作崩溃。返回 `{}` 保留了旧版手写解析器在相同输入下的行为。请在单行注释中将此记录为有意的防护机制。

### 无需修改的调用方

| 文件 | 用法 | 是否兼容？ |
| --- | --- | --- |
| `packages/core/src/index.ts:360` | 从 yaml-parser 重新导出 `*` | 是 — 名称相同 |
| `packages/core/src/subagents/subagent-manager.ts:15` | `parse`, `stringify` | 是 |
| `packages/core/src/extension/claude-converter.ts:26` | `parse`, `stringify` | 是 — 现在对 `mcpServers` + `hooks` 的往返转换是安全的（见 Phase 3） |
| `packages/core/src/utils/rulesDiscovery.ts:20` | `parse as parseYaml` | 是 |
| `packages/core/src/skills/skill-manager.ts:13` | `parse as parseYaml`（并单独 `import * as yaml from 'yaml'`） | 是 — 重复的 `import * as yaml` 可以在后续跟进中移除 |
| `packages/core/src/skills/skill-load.ts:11` | `parse as parseYaml` | 是 |

### 需要的测试 fixtures

三个具体的 YAML 代码片段，当前的手写解析器无法处理，而替换后的实现必须能够处理（每种嵌套结构各一个）：

```yaml
# Fixture 1 — mcpServers (record of records)
mcpServers:
  filesystem:
    type: stdio
    command: node
    args:
      - /path/to/server.js
    env:
      DEBUG: '1'
  github:
    type: http
    url: https://mcp.example.com/github
    headers:
      Authorization: 'Bearer xxx'
```

```yaml
# Fixture 2 — hooks (record of arrays of records, two levels of nesting under the event name)
hooks:
  PreToolUse:
    - matcher: 'Read|Write'
      hooks:
        - type: command
          command: echo before
          timeout: 5000
  PostToolUse:
    - matcher: '*'
      hooks:
        - type: command
          command: echo after
```

```yaml
# Fixture 3 — mixed shallow + deep, plus everything PR #4842 already supports
name: agent-x
description: test
permissionMode: acceptEdits
maxTurns: 5
color: cyan
tools:
  - Read
  - Write
mcpServers:
  filesystem:
    type: stdio
    command: node
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: log
```

### 必须修改的测试

`packages/core/src/utils/yaml-parser.test.ts` 底部有 2 个“固定测试”（第 200–227 行），标题为 `known limitations — nested YAML (pin until js-yaml lands)`。替换后的实现**必须**将它们翻转为正向的嵌套解析断言：

```ts
it('parses array-of-records', () => {
  const yaml =
    'mcpServers:\n  - filesystem:\n      type: stdio\n      command: node';
  expect(parse(yaml)).toEqual({
    mcpServers: [{ filesystem: { type: 'stdio', command: 'node' } }],
  });
});

it('parses record-of-records', () => {
  const yaml = 'hooks:\n  PreToolUse:\n    - matcher: Read';
  expect(parse(yaml)).toEqual({
    hooks: { PreToolUse: [{ matcher: 'Read' }] },
  });
});
```

这两个断言加上上面的三个 fixtures 是实现计划 Phase 2 的**验收门槛**。其他任何内容（转义边缘情况、带引号与不带引号的布尔值、数字字符串）都是现有测试套件中的回归覆盖，应该保持不变并通过。

### 往返一致性检查

现有测试 `should maintain round-trip integrity for escaped strings`（第 111-129 行）通过 `stringify → parse` 测试了 7 个字符串。`yaml` 的默认 `stringify` 产生的输出与手写格式化器略有不同（在某些情况下引号使用更激进，转义序列不同）。有两种可接受的结果：

1. **调整测试 fixtures** 以断言新解析器下的行为 — 重要的是往返属性（`parse(stringify(x)) === x`），而不是字节完全相同的 YAML 输出。
2. **保留字节级相同的断言**，让它们明显失败，然后更新它们以逐字反映 `yaml` 的输出。这样更容易 review diff。

建议：**选项 1** — 将断言更改为基于属性的（`expect(parse(stringify(obj))).toEqual(obj)`），因为字节级相同的 YAML 输出并不是该模块文档中约定的契约。

### 对调用方的破坏性变更 — 预计没有，但需验证

- `subagent-manager.ts` 在 `saveSubagent` 路径中会将解析后的对象重新序列化为 YAML。使用新解析器后，`mcpServers` 和 `hooks` 将能够干净地往返转换。更新 `claude-converter.ts` 中的 `NESTED_FIELDS_NOT_ROUND_TRIPPABLE`（实现的 Phase 3）以移除这两个字段名。
- `skill-manager.ts` 已经直接导入了 `yaml`（独立于手写解析器）。一旦 `yaml-parser.ts` 也开始使用 `yaml`，重复的导入就可以作为一个小跟进任务移除 — 这不在当前范围内。
### 迁移风险

低。5 个调用方都解构了 `Record<string, unknown>` —— 返回
类型相同。2 个故意制造“乱码”的 pin 测试是预期中仅有的失败项；
这些是已知的，我们故意将其翻转。更广泛的回归覆盖来自
`packages/core/src/subagents/`、
`packages/core/src/skills/` 和 `packages/core/src/extension/` 中的现有测试套件。

## 待解决问题

| #   | 问题                                                                                                                                              | 是否阻塞？                                                               | 解决路径                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `yaml.parse` 是否需要显式的 logger 来将 `YAMLWarning`（例如 `Unresolved tag`）重定向到 qwen-code 的 logger，而不是 `process.emitWarning`？  | 否 —— 推迟                                                              | 如果 CI 中日志过多，可传入 `{ logLevel: 'silent' }` 或自定义 `onWarning` 回调。对 v1 并非关键依赖。                                                      |
| Q2  | 对于空字符串 / null 文档的 YAML，`parse()` 应该继续返回 `{}` 还是抛出异常？                                                             | 否 —— 保持当前行为                                          | 当前手写实现返回 `{}`；我们保持该行为。添加一个回归测试来固定此选择。                                                                               |
| Q3  | 当 `mcpServers` 在顶层格式错误时（例如 `mcpServers: "string"`），应该让整个 agent 加载失败，还是丢弃该字段并继续加载？ | 是 —— 驱动实现第 3 阶段中“警告并丢弃”的策略 | **解决方案**：丢弃该字段，并输出 console 警告（根据 `docs/design/declarative-agents-port.md` 第 3 阶段，与 CC `DL7` 保持一致）。                                  |
| Q4  | 与 Q3 相同，但针对 `hooks`：是丢弃该字段、该事件，还是仅丢弃单个 matcher？                                                                | 是 —— 驱动“警告并丢弃”策略                                  | **解决方案**：在顶层结构失败时丢弃整个 `hooks` 字段。每个事件 / 每个 matcher 的细粒度处理将推迟到未来的 PR，前提是真实用户提出了需求。 |
| Q5  | CC helper 中的 `Bun.YAML.parse` 快捷方式是否适用于 qwen-code？                                                                               | 否                                                                      | qwen-code 不针对 Bun 运行时。跳过。                                                                                                                            |

---

**状态**：调研完成，准备根据 `docs/design/declarative-agents-port.md` 实现第 2 阶段（替换
`yaml-parser.ts`）和第 3 阶段（在 `SubagentConfig` 上重新暴露
`mcpServers` + `hooks`）。