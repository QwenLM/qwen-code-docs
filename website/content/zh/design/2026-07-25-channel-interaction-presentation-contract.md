# Channel 交互呈现契约

## 状态

为 PR #6930 实现了 channel 中立的契约。DingTalk 专属的投影和运维细节仍在
`2026-07-15-dingtalk-interactive-cards.md` 中。

## 问题

先前的实现在 run 级别的 `started` 事件上创建 DingTalk 状态卡片。如果模型随后
调用 `ask_user_question`，适配器会创建第二个表单卡片，并把第一张卡片改为
`Waiting for input`。即使模型没有产出任何可见回答，用户也会看到两张活跃卡片。

这不是 DingTalk 的渲染竞态，而是所有权错误：

- run 级别的事件被当作可见输出事件对待；
- 输出和输入的呈现是各自独立的适配器状态机；
- 对可见输出段（segment）没有共享的定义；
- 输入请求不会结束活跃的输出呈现。

只修复 DingTalk 卡片的删除或撤回会保留这个所有权错误，也无法给 Feishu 或
未来的 IM 适配器提供稳定的交互契约。

## 目标

- 只在存在用户可见输出时才创建输出呈现。
- 当模型在产出可见输出之前请求输入时，让原生输入卡片成为唯一活跃的呈现。
- 输入卡片就地更新直到终态；正常生命周期内不删除它。
- 恢复原始的权限和模型上下文，不注入合成的用户消息。
- 给每个输出段和输入请求提供精确的 run、session、target 和 owner 关联。
- 让 DingTalk、Feishu 和未来的 IM 适配器在不共享平台卡片 API 或模板
  schema 的情况下选择加入同一套语义。
- 对未选择加入的适配器保留现有行为。

## 非目标

- 通用的跨平台 `createCard`、`updateCard` 或 `deleteCard` API。
- 用自由文本解析替代原生结构化输入。
- 要求每个 IM 都支持流式输出、表单或按钮。
- 把 DingTalk 或 Feishu 的平台句柄移入 `ChannelBase`。
- 让实时回调跨进程重启持久化。
- 改变 Core、ACP 或 `ask_user_question` 的应答契约。
- 在 DingTalk 修复中重构现有的 Feishu 卡片实现。

## 设计原则

### 共享语义，本地投影

`ChannelBase` 拥有上下文、顺序和结算语义。IM 适配器拥有原生渲染、回调
transport、平台句柄、限流和投影失败。

共享层从不提及卡片。它引用的是：

- 一次 prompt run；
- 一个可见输出段；
- 一个结构化输入请求；
- 这些对象的终态结果。

### 上下文被捕获，而不是重新发现

权威的关联链是：

```text
SessionTarget(chatId/threadId) -> sessionId -> runId -> segmentId/requestId
```

适配器在创建原生呈现时捕获这条链。回调解析被捕获的记录。它不得在会话中
搜索最新的卡片、最新的 run 或最新的 session。

当平台暴露线程时，`SessionTarget.threadId` 仍是线程分区。没有线程语义的
平台使用 `chatId`。平台回调不会独立推导出新的 target。

### 事务与投影分离

权限响应是事务。卡片更新是 UI 投影。成功的权限响应绝不会因为随后的原生
卡片更新失败而回滚。

## 共享语义模型

### Prompt run

`runId` 标识一次 Channel 拥有的 prompt 执行。它保留现有的精确 run 取消和
owner 规则。

`started` 生命周期事件表示 run 已被接受。它不会打开输出呈现。

### 输出段

输出段是一个 run 内一段连续的用户可见助手文本序列。`ChannelBase` 只在该段
的第一个可见文本到达时分配一个不透明的 `segmentId`。

段在以下任一情况首次发生时结束：

- 响应边界；
- 结构化输入请求的呈现；
- 最终响应成功投递；
- run 失败；
- run 取消。

在结构化输入请求结算之后，同一 run 中的后续文本会以新的 `segmentId` 打开
一个新段。它绝不重新打开或覆盖提问前的段。

### 输入请求

`requestId` 标识一个原始的待处理 `ask_user_question` 权限请求。一个请求可以
包含该工具调用的全部归一化问题。呈现所有权的作用域是
`sessionId + owner.id`。不同用户或会话可以同时拥有活跃的输入呈现。在一个
run 内，同一作用域的第二个请求返回 `unsupported`，保持第一个原生呈现可应答，
并使用现有的文本权限回退。

适配器内部的输入状态机是：

```text
reserved -> pending -> claimed -> terminal
```

它是回调仲裁，不是平台卡片状态。DingTalk 只暴露 `pending`、`submitted`、
`cancelled` 和 `expired`：被接受的提交映射到 `submitted`，被接受的用户取消
映射到 `cancelled`，超时、外部解决或不可用的应答者映射到 `expired`。每个
终态转换都就地更新现有的原生输入呈现，绝不删除它。

共享的结算标签是 `resolved_outside_presenter`。该契约由原生表单和其他交互
面共享，因此平台特定的名词不会成为公开 API。

## 共享契约

现有的 hook 仍然是扩展面。它们获得更强的语义上下文，而不是平台操作。

```ts
interface ChannelOutputSegmentContext {
  channelName: string;
  sessionId: string;
  runId: string;
  segmentId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  messageId?: string;
}

type ChannelOutputSegmentEndReason =
  | 'response_boundary'
  | 'input_requested'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

chunk 和 completion hook 获得一个可选的末尾上下文参数以保持源码兼容。段的
终止使用专门的 hook，使适配器能够区分响应边界与输入请求及终态原因：

```ts
protected onResponseChunk(
  chatId: string,
  chunk: string,
  sessionId: string,
  segment?: ChannelOutputSegmentContext,
): void;

protected onOutputSegmentEnd(
  chatId: string,
  sessionId: string,
  segment: ChannelOutputSegmentContext,
  reason: ChannelOutputSegmentEndReason,
): void | Promise<void>;

protected onResponseBoundary(
  chatId: string,
  sessionId: string,
): void | Promise<void>;

protected onResponseComplete(
  chatId: string,
  text: string,
  sessionId: string,
  segment?: ChannelOutputSegmentContext,
): Promise<void>;
```

接受更少参数的现有重写保持有效且不变。`ChannelBase` 总是为有人值守的
Channel 所有的 run 向响应 hook 提供段上下文，并在该段关闭时调用
`onOutputSegmentEnd`。其默认实现只把 `response_boundary` 委托给旧版的
`onResponseBoundary` hook。Loop、webhook 和旧版合成路径仍然不具备原生交互
呈现资格。

`ChannelUserInputRequestContext` 保留其现有的请求应答者和结算订阅。它额外
携带捕获的交互作用域：

```ts
interface ChannelUserInputRequestContext {
  requestId: string;
  sessionId: string;
  runId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  precedingSegmentId?: string;
  // 现有的归一化问题、提交选项、onSettled 和 respond
}
```

其结算原因联合类型使用 `resolved_outside_presenter`、`cancelled` 和
`run_cancelled`。

在调用 `presentUserInputRequest` 之前，`ChannelBase` 关闭共享的段身份并把
其 ID 作为 `precedingSegmentId` 传入，但不投影平台响应边界。支持的适配器在
呈现原生输入之前以自己的 `input_requested` 关闭自身呈现。这防止不支持的
适配器清除或以其他方式改动其现有的流式状态。关闭是幂等的，因此先到达或后
到达的平台响应边界事件不会关闭两个不同的段。

不需要共享的能力标志。能力通过行为表达：

- 输出 hook 是可选的，默认为现有投递；
- 当原生结构化输入不可用时，`presentUserInputRequest` 返回 `unsupported`；
- 平台特定的配置保留在适配器内部。

这避免了全局布尔值的无效组合，并允许适配器支持流式输出但不支持表单，或者
支持表单但不支持流式输出。

## 每个适配器内部的 presenter 契约

适配器可以组合一个内部 presenter，而不是把平台状态加到主适配器类上。该
presenter 拥有：

- `segmentId -> 原生输出句柄`；
- `requestId/outTrackId/messageId -> 原生输入句柄`；
- 每个 `runId` 一个串行化的投影队列；
- 有界的输出快照和更新合并；
- 回调 owner 校验和一次性认领；
- 原生 API 超时和错误日志；
- 紧凑的终态墓碑。

每个 run 的投影队列保证这个顺序：

```text
结束旧的输出段
  -> 创建输入呈现
  -> 更新输入终态
  -> 在下一个输出段的首个可见文本时创建它
```

中间输出的追加入队一个可替换的全量快照，不阻塞模型生成。边界、输入呈现和
最终投递进入同一个队列，因此它们不会越过更早的写入。

## 必需的交互序列

### 正常回答

```text
run started
  -> 无原生输出
首个可见文本
  -> 分配 segment-1
  -> 惰性创建原生输出呈现
后续 chunk
  -> 更新 segment-1
run completed
  -> 就地更新 segment-1 为 completed
```

如果 provider 返回最终响应但没有发出 chunk，最终投递会分配段并创建一个
completed 的输出呈现。

### 直接提问

```text
run started
  -> 无原生输出
ask_user_question 请求
  -> 创建 request-1 输入呈现
```

不存在输出段，因此用户只看到输入呈现。在它待处理期间，没有单独的 run 状态
呈现。输入呈现的待处理状态就是 run 正在等待用户的可见指示。

### 文本后跟提问

```text
首个可见文本
  -> 创建 segment-1 输出呈现
ask_user_question 请求
  -> 就地完成 segment-1
  -> 创建 request-1 输入呈现
```

已完成的输出保留为会话历史，但只有输入呈现是活跃的。

### 问题提交与继续

```text
有效回调
  -> 关联 request-1 并校验 owner
  -> 原子地认领 request-1
  -> 确认回调
  -> 应答原始权限
  -> 就地更新 request-1 为 submitted
同一 run 中的下一个可见模型文本
  -> 分配 segment-2
  -> 创建新的输出呈现
```

应答恢复原始的模型上下文。适配器不注入合成的入站消息。

### 并发提问

同一 `sessionId + owner.id + runId` 至多有一个活跃的原生输入呈现。该作用域
中的第二个请求返回 `unsupported`；`ChannelBase` 发送其语义文本回退，同时
第一个原生呈现保持有效。这避免了不可达的待处理请求，而无需合成取消或入站
消息。不同用户和会话保持独立，run 终止会关闭该 run 拥有的所有呈现。

## DingTalk 投影

DingTalk presenter 映射：

- 一个输出段到一个状态卡片模板实例；
- 一个输入请求到一个问题卡片模板实例。

与当前实现的差异：

- 不在 `started` 时创建状态卡片；
- 在段的首个 chunk 或最终响应时创建它；
- 状态记录以 `segmentId` 为键，同时保留 `runId` 用于 Stop；
- 在创建问题卡片之前关闭活跃段；
- 当同一 run 请求另一个问题时保持第一个问题卡片活跃，让较新的请求使用文本
  回退；
- 绝不把旧的状态卡片改为 `Waiting for input`；
- 就地更新问题卡片为 submitted、cancelled、expired 或外部解决；
- 只在提交后的文本开始时创建新的状态卡片。

正常路径不撤回也不删除任何一张卡片。如果部分失败的原生投递留下了无法更新
的无用孤儿卡片，平台清理可以作为最后手段的错误路径删除或撤回它；那不是
业务状态转换。

Stop 动作保持绑定到段捕获的精确 `runId` 和 owner。从任何活跃输出段停止只
取消该 run。终态的历史段不能停止更晚的 run。

问题卡片的 Cancel 动作把原始输入请求解决为 cancelled。现有的
`ask_user_question` 取消语义随后决定 run 是否终止；适配器不会发出第二个
会话级取消。

首个元数据投影刻意限定为配置的模型和已耗费的墙钟时间。DingTalk 从现有的
Channel 配置读取可选的模型，并渲染一行运行中的文本，例如
`Running · qwen3.7-max · 12s`。当现有的合并模型文本流冲刷且显示的秒数发生
变化时，它刷新已耗时数值，因此状态更新每秒至多增加一次，且没有独立的计时
器。因此静默的思考或工具执行在下一次文本冲刷之前不会推进可见计数器。终态
更新总是写入精确的已耗时值，例如 `Stopped · qwen3.7-max · 18s`。如果
Channel 配置没有选择模型，该行省略模型而不是推断一个。

本增量不暴露 token 用量。当前的 Channel bridge 或生命周期契约中不存在精确
的每轮次 token 数，从可见文本推导的估计会产生误导。后续变更只有在共享运行
时提供权威的每轮次快照之后才可以添加 token 元数据。缺失的元数据绝不延迟
或改变段状态。

## Feishu 扩展

现有的 Feishu 实现已经在响应 chunk 上惰性创建流式卡片，并且可以更新或删除
交互式消息。它不需要在 DingTalk 修正中改变。

后续的 Feishu 交互变更可以采用相同的上下文：

- `segmentId` 替换输出卡片隐式的 `inboundMsgId` 所有权；
- `runId` 继续保护 Stop 不取消更晚的 run；
- 原生交互式表单或按钮实现 `presentUserInputRequest`；
- 回调解析捕获的 `requestId`，而不是会话中最新的卡片；
- 同一条输入消息被修补到其终态；
- 不支持的字段类型返回 `unsupported`，或以可读的平台本地失败取消，而不是
  解析任意文本。

Telegram、WeCom、Weixin、QQ 和插件适配器可以独立地消费输出上下文、输入
上下文、两者或都不用。默认 hook 保留它们当前的行为。

## 失败与降级规则

| 失败                                                     | 必需行为                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 输出呈现创建失败                                         | 保留有界文本并使用现有的等待文本投递路径。                                                                          |
| 中间输出更新失败                                         | 停止该段的进一步原生流式；保留最终文本用于回退。                                                                    |
| 输出终态更新失败                                         | 通过现有回退发送最终文本并标记原生投影不可用。                                                                      |
| 输入呈现返回 `unsupported`                               | 使用现有的语义权限消息；不解析之后的自由格式回复。                                                                  |
| 选择加入后原生输入创建失败                               | 告知用户原生提问失败，取消原始请求，并允许显式重试。                                                                |
| 权限响应成功但输入卡片更新失败                           | 保持权限已解决，保留终态墓碑，并记录投影失败。                                                                      |
| 回调重复、过期、外来或格式错误                           | 在同步校验后确认，不做任何状态变更。                                                                                |
| Run 结束时仍有待处理输入                                 | 就地更新那些输入呈现为 cancelled。                                                                                  |
| 进程重启时仍有活跃卡片                                   | 将回调视为不再待处理，并在平台关联允许时更新为 expired/不可用。持久化恢复是单独的工作。                             |

## 状态与资源边界

- 输出内容保持每段 20,000 个可见字符的有界限制。
- 每个段允许一个在途的原生写入和一个可替换的待处理快照。
- 原生 API 调用保留显式超时。
- 活跃的 run、段、请求和回调映射保持插入有序且有界。
- 终态墓碑只包含关联和终态；它们不保留应答者、问题、应答、计时器或内容。
- 所有清理都检查精确的对象身份，因此晚到的异步完成不能用相同的会话改动更新
  的记录。

## 迁移计划

修正应保持小而有序：

1. 向 `ChannelBase` 添加输出段上下文和幂等的段边界，通过可选的末尾参数保留
   现有 hook 签名。
2. 为惰性段分配、边界顺序、直接提问、续接段、并发提问和上下文隔离添加共享
   测试。
3. 用拥有段作用域输出记录和请求作用域输入记录的 run presenter 替换 DingTalk
   的 run 作用域状态控制器。
4. 移除急切的状态卡片创建和 `Waiting for input` 投影。
5. 保留现有的最终内容 V2 字段和结构化问题结算逻辑。
6. 用真机验证 DingTalk 的直接提问、文本后提问、提交续接、Stop、超时和失败
   场景。
7. 保持 Feishu 生产代码不变；只在共享签名变更需要时添加兼容性证据。

本地修正只有在真机验收与上述序列一致后才能提交。在获得明确批准之前保持不
推送。

## 验收标准

### 共享 Channel

- `started` 绝不分配输出段。
- 首个可见文本恰好分配一个段 ID。
- 响应边界或输入请求恰好关闭该段一次。
- 问题结算后的文本在同一 run 和会话中获得不同的段 ID。
- `chatId/threadId`、session、run、request、segment 和 owner 的关联不能在
  并发上下文之间串线。
- 没有交互支持的现有适配器保留其行为。

### DingTalk

- 直接的 `ask_user_question` 显示一个问题卡片且没有状态卡片。
- 问题卡片在提交、取消、过期和外部解决时就地更新。
- 同一 run 中的第二个问题使用文本回退，同时第一个原生卡片保持可应答。
- 不同用户和会话保留独立的活跃问题卡片。
- 提问前的文本保留在已完成的历史状态卡片中。
- 提交后的文本出现在新的状态卡片中。
- 没有状态卡片显示 `Waiting for input`。
- Stop 只取消精确捕获的 run。
- 最终完成的内容通过 V2 的 `blockList`、`content` 和 `copy_content` 字段保持
  可见。

### 跨 IM 兼容性

- Feishu 构建及其现有的流式卡片和 Stop 测试在不采用新 presenter 的情况下
  保持绿色。
- 适配器可以实现原生输入而不支持流式输出。
- 适配器可以实现流式输出而不支持原生输入。
- 两者都不支持的适配器继承现有的文本行为。

## 决策摘要

共享抽象是交互呈现契约，不是卡片框架。`ChannelBase` 拥有上下文和段/请求
语义。每个 IM 拥有其原生 presenter。输出卡片是惰性的且段作用域；输入卡片
是请求作用域且就地更新。这消除了 DingTalk 的双活跃卡片行为，同时为 Feishu
和未来的适配器提供了稳定的、平台中立的扩展路径。
