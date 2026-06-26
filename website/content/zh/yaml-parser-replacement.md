# YAML 解析器替换 — 调研结论

针对位于 `packages/core/src/utils/yaml-parser.ts` 的手写 192 行 YAML 解析器的内部设计文档，旨在用真正的库进行替换，以便来自 Claude Code 声明式代理 schema 的延迟 `mcpServers` 和 `hooks` 字段能够安全地通过 subagent / skill / converter 代码路径进行往返传递。

配套文档：[`docs/declarative-agents-port.md`](./declarative-agents-port.md)。  
Issue：[#4821](https://github.com/QwenLM/qwen-code/issues/4821)。  
[PR #4842](https://github.com/QwenLM/qwen-code/pull/4842) 后续工作的前置条件。

## 阶段 0 — 已验证的来源

| 来源                                                     | 版本 / 日期                       | 权威性原因                                                                                        |
| -------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                   | 较旧的 CC 快照（2.1.168 之前）     | 直接来源 — 15 行的封装器，指明了所使用的库                                                        |
| `~/code/claude-code/src/utils/frontmatterParser.ts`      | 同一快照                           | 直接来源 — 370 行的 frontmatter 拆分器 + 2 阶段恢复                                                |
| `/private/tmp/cc-2.1.168/claude.strings`                 | 从 CC 2.1.168 提取                 | 对当前行为具有权威性 — 字符串包含混淆后的符号名称，但包含 JSON schema 和错误消息文本                |
| `packages/core/src/utils/yaml-parser.ts`（此仓库）       | `lazzy/gifted-hamilton-684741` 的 HEAD | 正在被替换的解析器                                                                               |
| 针对此树中 `yaml@2.8.1` 的实时 `node -e` 探针           | 2026-06-08                         | 经验性安全行为 — 锚点、合并键、`!!js/function`、十亿笑攻击、`maxAliasCount`（结果内嵌在阶段 4 中） |

置信度标签：**C** 通过直接证据确认；**I** 从多个已确认事实推断得出；**O** 未解决的问题。

## 阶段 1 — CC 使用哪个 YAML 库？

**答案：[`yaml`](https://www.npmjs.com/package/yaml)（eemeli/yaml），不是 `js-yaml`。** 通过直接阅读 `~/code/claude-code/src/utils/yaml.ts` 确认：

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
- **API**：顶层 `.parse(input)`。使用包的默认 schema（YAML 1.2 `core` — JSON 超集，无 JS 扩展）。**C**
- **Bun 快捷方式**：当在 Bun 下运行时，CC 使用 `Bun.YAML.parse()` 以避免打包约 270 KB 的 YAML 解析器。**C** 与 qwen-code 无关（我们不针对 Bun 运行时）。
- **Schema 模式**：CC 中未在任何地方显式设置。依赖 `yaml` 包的默认行为，并在消费者层通过 zod 验证（`DL7`、`gS8`、`TKO`/`_u`，详见 `docs/declarative-agents-port.md`）。**C**

### 为什么选择 `yaml` 而不是 `js-yaml`

| 维度                    | `js-yaml` 4.x                                                                              | `yaml` (eemeli) 2.x                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 默认 schema             | `DEFAULT_SAFE_SCHEMA`（自 4.x 起）— 安全；旧版本有 `DEFAULT_FULL_SCHEMA` 含 JS 扩展          | `core`（YAML 1.2 规范）— 仅 JSON 类型               |
| `!!js/function` 标签    | 4.x 不支持（3.x 中有）                                                                      | 从未支持                                             |
| 十亿笑攻击防护           | 无（需手动负责）                                                                           | 内置默认 `maxAliasCount: 100`                        |
| 合并键 (`<<`)           | 支持（必须通过 `MERGE_SCHEMA` 或过滤退出）                                                  | 默认禁用，通过 `{ merge: true }` 选择加入             |
| 已是 qwen-code 依赖？   | `js-yaml@4.1.1` ✓                                                                          | `yaml@2.8.1` ✓（已由 `skill-manager` 导入）          |

在 2026 年两者都是合理的选择，但**原始任务简报推荐使用 `js-yaml` 的 `FAILSAFE_SCHEMA` / `CORE_SCHEMA`**。我们基于三个具体原因偏离该建议：

1. **CC 对等性**。移植 CC 的 frontmatter schema 的全部意义在于让用户可以将 CC agent 文件放入 `.qwen/agents/` 并使其解析结果完全相同。使用与 CC 相同的解析器可以最大限度地减少边缘情况 YAML 构造（多文档流、流式 vs 块标量、标签处理）上的差异。
2. **`yaml` 已经是 `skill-manager.ts` 中的直接用户** — 请参见 `packages/core/src/skills/skill-manager.ts:13`（`import * as yaml from 'yaml'`）。统一使用 `yaml` 可以消除同一包中两个重复的 YAML 栈之一。**C**（grep 结果记录在阶段 6 中）。
3. **比 `js-yaml` 更安全的默认值**。`yaml` 内置的 `maxAliasCount` 无需手动配置即可阻止十亿笑攻击；合并键默认禁用；任意标签变为字面量字符串并附带 `YAMLWarning`，而非触发可调用解析器。经验性证据见阶段 4。

如果未来的维护者想放弃 `yaml` 依赖并统一使用 `js-yaml`，迁移是机械性的：将 `yaml.parse` / `yaml.stringify` 替换为 `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump`。对于 CC 和 qwen-code 实际使用的 100% 子集（键值对、列表、嵌套映射、标量布尔值/数字），这两个库的输出一致。如果遇到此问题，请单独跟踪该决策。

## 阶段 2 — Frontmatter 解析管道（CC）

`~/code/claude-code/src/utils/frontmatterParser.ts` 共 370 行。关键发现：

| 步骤               | 逻辑                                                                                                                     | 来源                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 定界符匹配          | 正则 `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — 从第 0 列开始，正文非贪婪，闭合 `---` 必须单独占一行                            | `frontmatterParser.ts:~123`（来自旧快照的行号；仅供参考）**C**                                        |
| 第一遍解析          | 调用 `parseYaml(body)`。如果成功 → 返回解析后的对象 + 剩余内容。                                                           | 同一文件，try 块顶部 **C**                                                                            |
| 第二遍恢复          | 发生 `YAMLException` 时，逐行处理，自动引用看起来像日期/冒号/特殊字符的值，然后重试 `parseYaml` 一次。                      | 旧快照中约 85–121 行 **C**（`tab → 2空格` 标准化、ISO 日期启发式、冒号陷阱）                           |
| 失败兜底            | 两遍都失败 → 通过 `logForDebugging` 记录日志，返回 `{ data: {}, content: text }`。Agent 以空 frontmatter 加载。            | 函数末尾 **C**                                                                                        |
| 遥测                | 进一步在上层包装 — `tengu_frontmatter_shadow_unknown_key` / `_mismatch` 事件从 `ug5.agent`（Ig5 schema）触发                | `claude.strings:308120`、`309074`、`309076`（交叉引用在 `docs/declarative-agents-port.md` 阶段 1 中） |

**对 qwen-code 的影响**：我们不需要克隆 2 阶段恢复逻辑。qwen-code 的 `subagent-manager.ts` 已经对其加载器强制执行更严格的“格式错误的 frontmatter 在顶层抛出异常”语义（见 `parseSubagentContent`），而 2 阶段恢复专门用于容忍旧的、手动编辑的 CC agent 文件。移植更严格的行为是可以接受的；我们只需要在嵌套字段格式错误时**不要使整个加载器崩溃**。关于警告并丢弃的行为，请参见阶段 5。

## 阶段 3 — 通过 zod 进行嵌套验证（CC）

相关 CC 验证器，根据 `docs/declarative-agents-port.md` 阶段 1 + 二进制字符串交叉检查：

### `mcpServers`（CC 符号 `gS8` / JSON 影子 `jL7`）

```
mcpServers: z.union([
  z.string(),                                            // 服务器名称引用
  z.record(z.string(), McpServerConfigSchema()),         // 内联 { name: spec }
])
```

`McpServerConfigSchema()`（来自 `claude.strings:124–135` 引用）是一个基于 `type` 的**鉴别联合**：

| `type`              | 必需字段                             | 备注                                                |
| ------------------- | ------------------------------------ | -------------------------------------------------- |
| `"stdio"`           | `command: string`，`args?: string[]` | 另外：`env?: Record<string,string>`，`cwd?: string` |
| `"sse"`             | `url: string`                        | 另外：`headers?: Record<string,string>`             |
| `"http"`            | `url: string`                        | 另外：`headers?`，`method?`                         |
| `"websocket"`       | `url: string`                        | qwen-code 对等性未知 — 推迟到需要时                 |
| `"sdk"`             | 可变                                 | CC 内部使用；我们不需要支持                          |
| `"claudeai-proxy"`  | 可变                                 | CC 内部使用；我们不需要支持                          |

**对于 qwen-code v1**：验证为 `Record<string, unknown>`（宽松的 DL7 风格），然后让下游合并到 `Config.getMcpServers()` 中进行形状强制转换。qwen-code 已经有带 `type` 鉴别的 `MCPServerConfig` 类 — 我们重用该转换器，而不是重复编写 zod schema。请参见 `docs/declarative-agents-port.md` 中运行时连接计划的阶段 4。

### `hooks`（CC 符号 `TKO` / `_u`）

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig（基于 `type` 的鉴别联合）：
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

根据字符串交叉检查，hook 事件键与 qwen-code 已经支持的事件集相同：`PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`SessionStart`、`SessionEnd`、`Stop`、`SubagentStart`、`SubagentStop`、`Notification` — 另外还有一些 qwen 独有的事件（`TodoCreated`、`TodoCompleted`），CC 没有这些事件。

**对于 qwen-code v1**：验证为 `Record<string, unknown>`（宽松），然后交给 qwen-code 现有的 `SessionHooksManager` 验证器，该验证器已实现每个事件的 `HookDefinition[]` 形状（参见 `packages/core/src/hooks/types.ts:207–211`，根据阶段 1 运行时映射）。

### 为什么两个验证器在 `Ig5` 影子层次中使用 `z.unknown()`

`Ig5` 是**遥测影子 schema** — 当 YAML 键不在已知集合中时，它会触发 `tengu_frontmatter_shadow_unknown_key` 事件；当已知键类型错误时，触发 `_mismatch` 事件。它故意对 `mcpServers` 和 `hooks` 使用 `z.unknown()`，因为 **`Ig5` 在解析时运行**，并且会对每个内联的 mcpServers 规范发出虚假的 `_mismatch` 事件。真正的验证委托给：

- `gS8`（用于 `mcpServers`）— 在 **agent 注册时**从 `DL7` 每个项目的 `safeParse` 调用
- `TKO`（用于 `hooks`）— 在 **hook 触发时**从 `_u().safeParse` 调用

这种**惰性验证**是 qwen-code 应效仿的模型：保持 frontmatter 解析器宽松（TS 中等效于 `z.unknown()`），在使用点进行验证。试图将完整的 zod 树提前引入 `SubagentConfig` 将迫使我们也将 qwen 的 `MCPServerConfig` 类和 `HookDefinition` 类型导入到它们当前不存在的层中，并且需要为 `type: 'sdk'` / `type: 'claudeai-proxy'` 这些我们实际不支持的验证器编造虚假的验证器。

## 阶段 4 — 安全状态

针对此 qwen-code 树中 `yaml@2.8.1` 默认值的经验性验证：

### 探针结果

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

→ `!!js/function` 标签**不会执行**。该值解析为**字面量字符串** `"function(){}"`（不是可调用的函数对象），并发出一个非致命的 `YAMLWarning`。攻击者无法通过此向量实现 RCE。**C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ 别名扩展 / 十亿笑攻击**默认被拒绝**。该库内置 `maxAliasCount: 100`（失败的解析计数为 1+10+100 = 111 个别名）。**C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ 合并键 (`<<`) 默认被解析为**字面量键字符串**，不会扩展。`<<` 解析器需要通过 `{ merge: true }` 选择加入。我们**不会**启用它。**C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ CC 形状的嵌套 mcpServers 正确解析为深度嵌套的对象/数组。**C**

### 安全性总结

| 向量                           | `yaml@2.8.1` 默认值                 | qwen-code 中需要采取的措施                           |
| ------------------------------ | ----------------------------------- | ---------------------------------------------------- |
| 任意 JS 执行                    | 不可能 — 无 eval                    | 无                                                   |
| `!!js/function` 标签           | 变为字面量字符串 + 警告             | 无                                                   |
| 十亿笑攻击                     | 已拒绝（`maxAliasCount: 100`）      | 无 — 保留默认值                                      |
| 合并键 (`<<`)                  | 视为字面量键                        | 无 — 保留默认值（不要传递 `merge: true`）            |
| 锚点 / 别名（正常使用）         | 允许，对 CC 形状数据有用            | 无                                                   |
| 任意未知标签                   | 字符串 + `YAMLWarning`              | 可选：将警告重定向到日志记录器（见阶段 6）           |

**结论**：`yaml` 包的默认行为已经比原始任务简报通过 `js-yaml` 的 `FAILSAFE_SCHEMA` 所要求的行为更安全。无需进行 schema 锁定调用。

## 阶段 5 — 恢复语义

CC 在每一层都选择**优雅的警告并丢弃**：

1. YAML 解析器抛出异常 → frontmatter 解析器记录日志并返回 `{}`（空数据）
2. 字段形状错误（例如 `mcpServers: "this is a string"`）→ `safeParse` 失败 → 该字段从发出的配置中丢弃
3. 字段形状**几乎**错误（例如，当 schema 需要对象时，单个 `mcpServers` 项目是字符串）→ 每个项目的 `safeParse` 仅丢弃该项目，保留其余部分

qwen-code 已经为 `permissionMode`、`maxTurns`、`color`、`effort` 实现了逐个字段的警告并丢弃策略（参见 `packages/core/src/subagents/agent-frontmatter-schema.ts`）。我们将相同的模式扩展到 `mcpServers` 和 `hooks`。

我们**不会**从 CC 克隆的内容：

- **带自动引用的 2 阶段 YAML 恢复**。这对 qwen-code 来说是多余的 — 我们是一个新项目，没有遗留的手动编辑的 frontmatter 文件需要容忍。清晰的错误比猜测的重新解释更有用。
- **`tengu_*` 遥测事件**。替换为 qwen-code 自己的日志记录器 / 加载器其他部分使用的任何遥测层。

## 阶段 6 — 对 qwen-code 的建议

### 库选择

- **使用 `yaml@^2.8.1`**（已经是传递依赖 — 提升为直接的 `packages/core/package.json` 依赖，以便在更严格的解析模式下不会损坏；也可以让我们锁定主版本）。
- **使用默认 schema**（`core`），无需 schema 标志。
- **不要**传递 `{ merge: true }`。不要启用任何非默认选项。
- 对于确定性 stringify 输出（测试快照），向 `yaml.stringify` 传递 `{ lineWidth: 0, defaultStringType: 'PLAIN' }`，这样库就不会根据内容长度换行或随意切换到块标量引用。

### 要保留的 API 接口

当前 `packages/core/src/utils/yaml-parser.ts` 导出的内容：

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

替换后保持两个签名**完全相同**，以便 5 个调用方（`subagent-manager.ts`、`claude-converter.ts`、`rulesDiscovery.ts`、`skill-manager.ts`、`skill-load.ts`）和 `index.ts` 的重新导出无需任何调用处更改。

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

**为什么将非对象的顶层强制转换为 `{}`**：每个现有的调用方都假设是一个记录。一个解析为 `null`（空文件）、`["foo"]`（列表）或 `"hello"`（裸标量）的 YAML 文件目前会导致下游解构崩溃。返回 `{}` 保留了旧手写解析器在相同输入上的行为。在一行注释中将其记录为有意的防护栏。

### 无需更改的调用方

| 文件                                                  | 用法                                                                | 兼容性？                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/core/src/index.ts:360`                      | 从 yaml-parser 重新导出 `*`                                         | 是 — 相同名称                                                           |
| `packages/core/src/subagents/subagent-manager.ts:15`  | `parse`，`stringify`                                                 | 是                                                                      |
| `packages/core/src/extension/claude-converter.ts:26`  | `parse`，`stringify`                                                 | 是 — 现在 `mcpServers` + `hooks` 的往返传递是安全的（见阶段 3）         |
| `packages/core/src/utils/rulesDiscovery.ts:20`        | `parse as parseYaml`                                                 | 是                                                                      |
| `packages/core/src/skills/skill-manager.ts:13`        | `parse as parseYaml`（以及分别 `import * as yaml from 'yaml'`）      | 是 — 并且可以在后续工作中删除重复的 `import * as yaml`                   |
| `packages/core/src/skills/skill-load.ts:11`           | `parse as parseYaml`                                                 | 是                                                                      |
### 所需的测试夹具

当前手工编写的解析器无法处理而替换版本必须支持的三个具体 YAML 片段（每种嵌套形状一个）：

```yaml
# 夹具 1 — mcpServers（记录的记录）
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
# 夹具 2 — hooks（记录的数组的记录，在事件名称下有两层嵌套）
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
# 夹具 3 — 浅层和深层混合，加上 PR #4842 已支持的所有内容
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

`packages/core/src/utils/yaml-parser.test.ts` 底部（第 200–227 行）有 2 个“固定测试”，标题为 `known limitations — nested YAML (pin until js-yaml lands)`。替换版本**必须**将这些测试转换为正向嵌套解析断言：

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

这两个断言加上上面的三个夹具是实施计划第二阶段**验收门**。其他内容（转义边界情况、引号 vs 无引号布尔值、数字字符串）是现有测试套件中的回归覆盖，应该保持不变。

### 往返完整性检查

现有测试 `should maintain round-trip integrity for escaped strings`（第 111-129 行）通过 `stringify → parse` 对 7 个字符串进行了测试。`yaml` 的默认 `stringify` 产生的输出与手工编写的格式化器略有不同（在某些情况下引用更积极，转义序列不同）。两种可接受的结果：

1. **调整测试夹具**以断言新解析器下的行为——重要的是往返属性（`parse(stringify(x)) === x`），而非字节相同的 YAML 输出。
2. **保留逐字节相同的断言**并让它们明显失败，然后更新它们以反映 `yaml` 的输出原样。这样更容易审查差异。

建议：**选项 1** — 将断言改为基于属性（`expect(parse(stringify(obj))).toEqual(obj)`），因为逐字节相同的 YAML 输出并不是该模块的文档化契约。

### 对调用者的破坏性变更——预计无，但需验证

- `subagent-manager.ts` 将解析后的对象重新序列化为 YAML 以用于 `saveSubagent` 路径。使用新解析器后，`mcpServers` 和 `hooks` 将能够干净地往返。更新 `claude-converter.ts` 中的 `NESTED_FIELDS_NOT_ROUND_TRIPPABLE`（实施第三阶段），以删除这两个字段名称。
- `skill-manager.ts` 已直接导入 `yaml`（与手工编写的解析器分开）。一旦 `yaml-parser.ts` 也使用 `yaml`，就可以作为一个小后续步骤移除重复导入——此处不涉及。

### 迁移风险

低。5 个调用者都解构了一个 `Record<string, unknown>` —— 相同的返回类型。2 个故意的“乱码”固定测试是唯一预期的失败；它们已知，我们故意翻转它们。更广泛的回归覆盖来自 `packages/core/src/subagents/`、`packages/core/src/skills/` 和 `packages/core/src/extension/` 中的现有测试套件。

## 开放问题

| #   | 问题                                                                                                                                             | 阻塞？ | 解决路径                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `yaml.parse` 是否需要显式记录器来将 `YAMLWarning`（例如 `Unresolved tag`）重定向到 qwen-code 的记录器而不是 `process.emitWarning`？                 | 否 — 推迟 | 如果 CI 中日志噪音过大，可以设置 `{ logLevel: 'silent' }` 或自定义 `onWarning` 回调。对于 v1 来说不是承载关键。                                          |
| Q2  | `parse()` 应该继续为空字符串 / 空文档 YAML 返回 `{}`，还是抛出异常？                                                                             | 否 — 保留当前行为 | 当前手工编写的解析器返回 `{}`；我们保留此行为。添加一个回归测试来固定这个选择。                                                                           |
| Q3  | 当 `mcpServers` 在顶层格式错误时（例如 `mcpServers: "string"`），整个 agent 应该加载失败，还是加载时丢弃该字段？                                  | 是 — 驱动实施第三阶段的告警并丢弃策略 | **决议**：丢弃该字段，发出 console 警告（与 `docs/declarative-agents-port.md` 第三阶段中的 CC `DL7` 保持一致）。                                           |
| Q4  | 与 Q3 相同但针对 `hooks`：丢弃该字段、该事件还是仅丢弃单个匹配器？                                                                                | 是 — 驱动告警并丢弃策略 | **决议**：顶层形状失败时丢弃整个 `hooks` 字段。按事件 / 按匹配器的粒度推迟到未来 PR，如果真实用户提出需求。                                                |
| Q5  | CC 辅助函数中的 `Bun.YAML.parse` 快捷方式是否适用于 qwen-code？                                                                                     | 否 | qwen-code 不针对 Bun 运行时。跳过。                                                                                                                      |

---

**状态**：研究完成，准备实施第二阶段（替换 `yaml-parser.ts`）和第三阶段（在 `SubagentConfig` 上重新暴露 `mcpServers` + `hooks`），按照 `docs/declarative-agents-port.md`。