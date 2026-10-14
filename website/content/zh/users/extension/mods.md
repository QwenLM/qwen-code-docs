# 实验性 Mods

Qwen Code 可以在无头会话中运行 Claude Code Mod API 的一个小子集。
此功能为 opt-in，需要 trusted workspace 以及已启用的 Claude 或
原生 Qwen 扩展。Agent Plugins v1 包将继续忽略 hook。

在 Qwen 设置中添加以下配置：

```json
{
  "experimental": { "mods": true }
}
```

创建一个包含以下文件的插件目录：

```text
hello-mod/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.js
```

`.claude-plugin/plugin.json`：

```json
{ "name": "hello-mod", "version": "1.0.0" }
```

`hooks/hooks.json`（模块路径相对于此文件）：

```json
{ "modules": ["./register.js"] }
```

`hooks/register.js`：

```javascript
let calls = 0;

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hello',
      description: 'Say hello without a model request',
    });
    return next(e);
  });

  on('command.run', { command: 'hello' }, ($, e) => ({
    text: `Hello ${e.args || 'world'}! Call ${++calls}.`,
  }));

  on('session.end', ($, e, next) => {
    $.ui.log(`Finished ${e.sessionId}`, { to: 'debug' });
    return next(e);
  });
}
```

安装插件并运行其命令：

```bash
qwen extensions install ./hello-mod --consent
qwen -p '/hello Qwen' --output-format json
```

启动时仍需要正常的 CLI 身份验证配置。Mod
命令本身不会发起模型请求。支持 Text、JSON 和 stream-json 无头输出。
stream-json 进程在轮次之间保留模块变量。

## 支持的子集

| 层面    | 行为                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 打包  | 一个 `.js`、`.mjs`、`.cjs`、`.ts`、`.mts` 或 `.cts` ESM 入口；已安装插件内的相对静态 import 和 re-export                                                        |
| 入口      | `register(on, options)`；异步注册会被等待；类型化的非 secret options 会被复制并深度冻结                                                                           |
| 生命周期  | 所有模块在初始 `session.start` 链之前注册；退出和会话替换时触发 `session.end`；clear/resume 不会重新加载模块                                   |
| 命令   | 在 `session.start` 期间使用 name、description 和可选的 argumentHint 进行注册；跨插件拦截已注册的 Mod 命令；返回 `{text}` 或 `{}`                            |
| 工具      | 使用 `tool.call` 拦截现有的主会话工具；使用 `tool.check` 检查和限制原生权限决策                                                              |
| 中间件 | 模式和递归匹配器；显式、可重复的 `next(e)`；`.catch` 和按插件的故障恢复；冻结的输入和宿主身份                                               |
| API 事件 | `command.register` 和 `ui.log` 调用通过中间件链传递，并附带宿主提供的 origin                                                                                       |
| 日志    | `$.ui.log` 返回 void 并排队传递；transcript 日志在 text 模式下使用 stderr，在 JSON 模式下使用 `system/ui_log`；debug 日志保留在 debug logger 中；两者都不会成为模型输入 |
| 隔离  | 每个插件在会话 worker 内拥有独立的 QuickJS 环境；无 Node、文件系统或网络 API；内存、栈、源码/输出和执行限制                                 |

这是一个受支持的子集，并非与现有 Claude Mods 的完全兼容。
JSX/TSX、运行时包导入、内置命令拦截、工具注册和活跃的 `$.tool` API、context、
state/store、渲染、流式事件和热重载均未实现。
命令尚不能返回 `context`、`exitCode` 或引擎引用。

两个 Mod 不能注册相同的命令名：后注册的会被拒绝。
与 Qwen 内置命令的冲突仍使用 Qwen 的命令冲突策略：
扩展命令会被重命名为 `extensionName.commandName`。已禁用的斜杠命令
名称会与重命名后的名称进行匹配。

## 中间件与恢复

模式在 `session.start`、`session.end`、`command.run`、
`command.register`、`ui.log`、`tool.call` 和 `tool.check` 之间进行选择。使用精确名称、`command.*` 这样的前缀、
`*`、或单个否定如 `!session.*`。其他具体事件以及
`!*` 和 `!!...` 模式会被拒绝。

匹配器是部分对象。所有指定字段必须匹配；数组表示
备选值，嵌套对象匹配其自身字段，正则表达式
测试字段的字符串表示。匹配器在注册时被复制。
它们最多允许八层和 256 个节点。有状态的 `g`/`y` 正则表达式和嵌套
量词会被拒绝；超过 65,536 个字符的正则输入会保守匹配，
将决定权留给 hook。嵌套对象是数据，而非
`startsWith` 之类的操作符。

一个精确事件可以有一个不带匹配器的注册和多个
带匹配器的注册，包括相同的匹配器。每个通配符或否定
模式只能注册一次。在插件内部，注册顺序决定
链的顺序；消费者在其声明的依赖提供者之前运行。一个 handler
可以提前响应，包括在 `session.start` 时，阻止后续 handler 运行。
在 `command.run` 上只有命令 `args` 可以被重写；生命周期和
命令身份字段保持不变。

## 工具拦截

`tool.call` 以扁平字段的形式接收 Qwen 工具的参数， alongside `tool`
和 `tool_use_id`。名称、参数 schema 和输出记录使用 Qwen 的原生
约定，因此为 Claude 内置工具编写的 Mod 可能需要适配。
没有单独的 `tool.result` 事件；检查或修改
`await next(e)` 返回的值：

```javascript
export function register(on) {
  on('tool.call', { tool: 'write_file' }, async ($, e, next) => {
    if (!e.file_path.endsWith('.txt'))
      return { deny: 'Only text files are allowed' };
    return next({ ...e, content: e.content.trim() });
  });

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e);
    if (e.tool === 'run_shell_command') {
      return { decision: 'deny', reason: 'Shell is disabled by this Mod' };
    }
    return verdict;
  });
}
```

每次普通的 `tool.call` next 都会启动一次新的原生工具尝试：验证、
经典 hook、权限、审批和调用守卫仍然全部适用。
额外的尝试计入 `--max-tool-calls`；catch 重放不增加
尝试次数。带有工具中间件的会话会序列化工具调用，包括并行的
next 调用，因为重写的参数可能引入副作用。一个根
调用最多允许 64 次原生尝试和 32 个未完成的宿主操作。
60 秒的根限制包括原生执行和等待审批的时间。
在未完成的 next 完成之前返回会取消该工作并
等待其结束。

`tool.check` 在原生验证和
经典输入重写之后接收 `{tool, input, tool_use_id}`。所有字段都被固定。其 next 返回声明式的
`{decision: 'allow' | 'ask' | 'deny', reason?}`，不执行工具。
Qwen 以限制性方式合并结果：Mod 不能将原生的 deny 或
ask 升级为 allow。Mod 的 ask 遵循当前审批模式的现有决策
流程；需要的人工交互和经典的强制 ask 仍然具有权威性。
这有意比 Claude 的消费者权限覆盖更严格。
如果原生 PermissionRequest hook 重建了参数，它们会被再次
检查。Mod 编写的 `rule`、`hook` 或 `ceiling` 不能创建宿主权限。

返回 `{deny: reason}` 以阻止，或 `{result: value}` 以提供 JSON 结果
而不执行。原生 next 返回 `{ref, result, text, isError?}`。
`result` 是原生函数响应记录，通常是 `{output: ...}` 或
`{error: ...}`。返回的 ref 如果 result 未变则保留原始
输出，包括图像和输出元数据；更改该引用旁边的 text 或 error 标志
不会改变它。宿主执行事实会在
所有尝试中保留，即使选择了更早的结果。要更改输出，
返回新的 result：
`{result: {output: 'Replacement text'}}`。仅包含字符串
`output`/`error` 字段的记录保留该结构；其他 JSON 会完整序列化到
`output` 字符串中，因此原生输出预算仍然适用。宿主拥有
函数响应：JSON 不会被解释为 ID、媒体部分或执行事实。
未知的 ref 和 `isReadOnly` 声明不授予来源。结果过大
无法放入 Mod payload 时会包含省略通知和 ref；保持该对
不变可以保留完整的原生响应。

原生错误、审批要求和取消不能通过更改 Mod 结果变为
成功执行。next 之后的 deny 不能
撤销工具的效果：Qwen 会报告工具已经运行。同样的情况适用
于当更早的尝试已运行而后续尝试被拒绝时。不支持上下文注入
和请求元数据。

工具身份、调用 ID、consent 和宿主元数据都被固定。与 `tool`、`tool_use_id`、`agentId`、`consent`、
`requestMeta` 或 `$shadowed` 冲突的原生
参数名会被保存在宿主创建的、固定的 `$shadowed`
记录中，并在执行时恢复。有效的延迟 `tool_call` 请求会暴露
已解析目标的名称和参数，同时保留包装器的原生
权限门控。无效的包装器、未知的工具、固定策略的调用和
合成的 `structured_output` 终端工具保持其原始路径。
`tool_search` 和 `search_memory` 也保持原生，因此 guest 编写的结果不能
继承其原生输出预算豁免。
Goal 工具调用也保持原生路径：此阶段不允许 Mod 编写的
结果作为外部证据进入 Goal 的目录。
子代理和嵌套的代码模式调度器不继承此中间件。

## 命令恢复

```javascript
export function register(on) {
  on('command.run', { command: /^hello/ }, async ($, e, next) => {
    const result = await next({ ...e, args: e.args.trim() });
    return { text: `[wrapped] ${result.text || ''}` };
  }).catch(($, e, next) => next(e));
}
```

普通的 `next` 在每次调用时执行下游。一个插件的注册构成
一层，共享一个故障记录和时间预算。在抛出、超时或
无效结果时，其 catch 按注册顺序尝试，直到一个返回
非 undefined 的答案或调用 `next`。返回 undefined 或抛出
而不调用 `next` 的 catch 允许下一个匹配的 catch 运行。与 Claude Code
2.1.296 一样，无效的答案或 `next` 之后的故障会结束 catch 选择并使用
共享的回退记录；不会尝试后续的 catch。catch 中的 `next.called`
表示插件在恢复开始之前已进入下一个插件，而不仅仅是
进入自身的另一个注册。

如果插件已经调用了下游，恢复会等待并重放最后
启动的调用，包括其拒绝，忽略重放参数。如果没有，
catch 的第一次 `next` 运行下游一次，后续调用会重放它。一个
失败的 catch 使用相同的记录。没有成功的 catch 时，插件会被
跳过或保留其记录的结果。无人响应的已注册命令
会显式失败；不会发送给模型。

`next` 暴露 `event`、`is(pattern)`、冻结的 `origin`、`signal`，以及带有 `ms` 和 `remainingMs` 的新冻结
`budget` 快照。Catch 额外接收 `called`
和 `error.kind`（`throw`、`timeout` 或 `re-entry`）。引擎事件使用 origin
`{ plugin: 'engine', tier: 'core' }`；Mod API 事件以 tier `user` 标识调用插件。
Managed-tier 的 `next.to`、tracing 和自定义命名空间的 `lent`
恢复不可用。

API 事件从链头开始。其输入是命令规格或
`{text, to}` 日志 payload。返回 `next(e)`、`{value}` 以响应，或 `{deny: reason}`
以拒绝 API 调用。立即的自重入会跳过该注册；活跃的
祖先注册可以使用其 catch。重入 catch 不能调用
API、
其 `next` 只能重用原始事件一次。`ui.log` 保持为 void 通知：
`await $.ui.log(...)` 不等待拦截器。无头边界在
返回输出之前 drain 排队的通知。

一个普通的插件层有 10 秒的自有时间，不包括等待跨插件
`next` 或 API 调用的时间。待处理的 void `ui.log` 通知不会暂停
调用者的预算。Catch 和重入恢复使用一秒的预算。
重入派发与该插件中的其他注册共享这个更短的预算。Qwen 还限制每个根派发为 60 秒，每个
不间断的 guest 执行片段为 10 秒。所有 `session.end` 工作共享
1.5 秒。提前完成的外部 handler 会放弃待处理的下游
工作；取消永远不会启动回退操作。保留的 next/API 函数
在其调用结束后不能执行工作。无法在 250 毫秒内确认
取消的 worker 会被终止，需要新会话。

最多有 32 个 Mod 环境、64 个已注册命令、每个插件 128 个注册、
以及每个根调用 4,096 个根/API 事件链。穿过另一个
插件不会消耗额外的事件。每个环境有 64 MiB
内存限制。日志和消息 payload 也有边界。注册、编译
和配置故障仍然会拒绝初始化；普通的 hook 故障
可以在不重置模块状态的情况下恢复。Guest promise job 仅在宿主
请求活跃时运行，包括其排队的通知 drain。

在此版本中，Mod 不在 TUI、ACP、managed/SSH、沙箱或会话代理入口点中
运行。安全模式、裸模式和 `disableAllHooks` 也会阻止加载。
更改插件代码、options 或扩展激活后需要重启。已加载的
命令在执行前会重新检查每个参与的插件，并拒绝已更改
或禁用的中间件链。外部设置编辑在重启后生效。
具有绝对或外部 hooks manifest 路径的原生 Qwen 扩展继续
仅使用经典 hook 加载器。转换已经忽略的 Claude hooks 路径（因为它们是绝对的或在扩展外部）也会被
Mod 发现跳过。Mod manifest 必须是扩展内的相对路径。

## TypeScript 与相对导入

将 hooks 入口改为 `./register.ts` 以使用 TypeScript。Import 和
re-export 可以使用相对路径、无扩展名路径、目录 `index` 文件、
或 TypeScript 文件的 JavaScript 拼写（`./helper.js` 可以解析到
`helper.ts`）。精确文件优先。接下来是 `.js` → `.ts`、`.mjs` → `.mts`、以及
`.cjs` → `.cts` 替换，然后是 `.ts`、`.js`、`.mjs`、`.cjs`、`.mts`、
`.cts` 候选，依次尝试每个文件然后是其目录 index。所有六个
后缀都使用 ESM，包括 `.cjs` 和 `.cts`。支持模块循环和一个插件内的共享导入
状态。

编译在可取消的 worker 内使用固定选项；不会
类型检查或加载 `tsconfig.json`、包解析器或构建插件。Type-only
import，包括来自 `claude-code` 的类型，会被擦除。来自 `claude-code` 的运行时值 import
需要此子集之外的 API，会被拒绝，
包/Node/URL import、动态 import、`require`、JSX 和导入的顶层
`await` 也是如此。Guest 代码继续仅在 QuickJS 中执行。

## 插件 options

在插件 manifest 中声明 `userConfig`：

```json
{
  "name": "hello-mod",
  "version": "1.0.0",
  "userConfig": {
    "greeting": {
      "type": "string",
      "title": "Greeting",
      "description": "Greeting used by /hello",
      "default": "Hello"
    }
  }
}
```

在用户或系统设置中配置 options，然后从 `register` 的
第二个参数中读取 `options.greeting`：

```json
{
  "experimental": { "mods": true },
  "pluginConfigs": {
    "hello-mod": { "options": { "greeting": "Welcome" } }
  }
}
```

字段需要 `type`、`title` 和 `description`。支持的类型有 `string`、
`number`、`boolean`、`directory` 和 `file`。可选约束包括
`required`、`default`、数值 `min`/`max`、字符串 `multiple`、以及字符串
`options` 选项。文件和目录值是字符串，不进行存在性
检查或增加文件系统访问。`sensitive: true` 明确不受支持，
即使提供了默认值；没有 secret 存储或配置 UI。

Qwen 使用 SystemDefaults → User → System 优先级，合并各个 option
键。即使在 trusted workspace 中也会忽略 workspace 设置。Qwen 将
没有 marketplace 来源的扩展映射到 inline 身份。它们接受
`name` 和 `name @inline`；后者在每个设置源中优先。
Marketplace 插件使用其实际的 `name @marketplace` 身份。更高
优先级源会胜过来自较低优先级源的任一本地别名。

与检查的 Claude 实现一样，缺失的可选值变为 `''`
除非有默认值；可选的 `''` 也会绕过类型检查。必需
值会拒绝缺失或 `''`，而 `false` 和 `0` 仍然有效。无效的已存储
字符串选项会回退到默认值。在非空 schema 下，未知的 option
键也会传递，仅限于字符串、数字、布尔值或字符串数组。
空或空的 schema 会接收 `{}`。Options 在重启前保持冻结。

## 已安装的依赖

Manifest 的 `dependencies` 接受插件名、`name @marketplace`、或对象
如 `{ "name": "base", "marketplace": "team", "version": "^1.0.0" }`。
裸名引用消费者的 marketplace。同名的已安装 inline 插件可以
覆盖 marketplace 依赖，不进行版本检查。
否则，版本范围会与已安装扩展的
manifest 版本进行检查。没有 Mod 的普通扩展可以满足依赖。
当从选定的 Mod 可达时会检查其传递依赖；
不相关的普通扩展的依赖声明不参与。

依赖必须已安装、启用并为此调用选定。
Qwen 不会自动获取、安装或启用它们。选定的 Mod 会
以稳定的消费者在依赖之前的顺序注册，用于 Mod 之间的直接依赖；
普通提供者不是注册节点。每个 Mod 有独立的
realm；事件按此顺序穿过其 handler，允许
跨插件拦截而不共享模块变量。

缺失、模糊、不兼容或循环依赖会在
任何 Mod worker 启动之前拒绝启动。无效的 Mod options 也会拒绝启动。这不同于
Claude 的选择性依赖降级和循环顺序回退；Qwen
保留了实验性子集的全会话启动失败策略。

## 资源限制

读取器接受已安装扩展内最大 256 KiB 的常规文件，并
拒绝该根内的符号链接。图限制为 64 个文件、1 MiB
输入和 1 MiB 编译代码。这些边界和符号链接拒绝比
Claude 的更严格。每个 guest 有 64 MiB 内存限制和 1 MiB 栈限制。
上述执行预算包括所有
worker 初始化、编译和启动 hook 的 60 秒启动限制。Guest 内存
限制不包括编译器的宿主内存。

作者 API 基于 Claude Code 2.1.296 声明和
[官方 Mod 文档](https://code.claude.com/docs/en/plugins/mods/create)。