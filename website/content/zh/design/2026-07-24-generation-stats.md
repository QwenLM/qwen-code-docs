# `/stats` 中的 generation 耗时指标

> 后续的一次 GenAI 对齐在现有私有 `ttft_ms` 之外，新增了独立的
> `gen_ai.response.time_to_first_chunk` Span 属性。本文档的
> `ApiResponseEvent.ttft_ms` 数据流和首个用户可见输出的语义保持不变；
> `/stats` 不消费标准的首 chunk 属性。

## 背景

Issue #4252 要求 `/stats` 把 generation 耗时与会话墙钟时间、端到端 API
延迟分开展示。底层的耗时数据已经存在：

- `LoggingContentGenerator` 测量从请求发出到第一个用户可见流式 chunk 的
  `ttftMs`。
- `endLLMRequestSpan` 推导出 `sampling_ms` 和
  `output_tokens_per_second`。
- `ApiResponseEvent` 已经把请求时长、模型、prompt id 和输出 token 数带入
  `UiTelemetryService`。

缺失的一环是让现有的 TTFT 值能够被 `/stats` 使用的无内容会话指标获取。

## 范围

本变更为以下位置增加实时的、会话作用域的 generation 指标：

- 交互式 `/stats` 的 Session 标签页；
- 非交互式 `/stats` 的文本响应。

它不新增第二个计时器，不在日/月 token 用量文件中持久化耗时，不改变导出，
也不改变 daemon/Web Shell 的 stats schema。

## 数据流

```text
LoggingContentGenerator.loggingStreamWrapper
  -> ApiResponseEvent(ttft_ms)
  -> logApiResponse
  -> UiTelemetryService
  -> SessionMetrics.generation
  -> SessionContext
  -> /stats
```

`ttft_ms` 是可选的。非流式响应以及在没有用户可见内容的情况下结束的流保持
当前行为，不创建 generation 样本。

## 指标与语义

对每个带 TTFT 的成功流式响应：

- **TTFT** 是现有的 `ttftMs` 测量值。
- **Generation 时长** 是 `max(0, duration_ms - ttft_ms)`，从第一个用户可见
  流式内容开始计到完成。
- **TPS** 是 `output_token_count / generation_time_seconds`。当 generation
  时长为零时不可用。

`SessionMetrics.generation` 惰性创建，包含：

- 最近一次完成请求的模型、TTFT、generation 时长和输出 token 数；
- 有耗时统计的请求总数和 TTFT 总和，以及符合吞吐统计条件请求的 generation
  时长总和与输出 token 总和。

会话平均 TTFT 是有耗时统计请求的算术平均值。会话 TPS 是加权吞吐：输出
token 总数除以 generation 时长总和。generation 时长为零的请求计入 TTFT
统计，但不计入会话 TPS 计算的分子和分母。这避免了除零，也避免短请求被
过度加权。

内部辅助 prompt 不计入 generation 指标。它们不会记录在可恢复的会话记录中，
包含它们既会让用户意外，也会让实时会话和恢复会话的数值不一致。主对话和
子代理请求仍然计入，与现有的会话级模型统计保持一致。

## 兼容性

- `ApiResponseEvent.ttft_ms` 和 `SessionMetrics.generation` 是增量且可选的。
- 已记录的事件和调用方保持有效。
- 现有的日/月记录继续只包含 token 和 API 时长数据，保持
  `issue-4479-token-usage-stats-coordination.md` 中记录的所有权边界。
- Session context 的 clone/equality 逻辑会复制并比较可选的 generation
  对象，使交互式仪表盘在每个完成的计时请求后更新。

## 验证

- 核心测试证明聚合、内部 prompt 排除、零 generation 处理、会话隔离和重置
  行为。
- LoggingContentGenerator 测试证明捕获的 TTFT 到达 `ApiResponseEvent`，
  且对不可见的流保持缺席。
- CLI 测试证明非交互式输出和交互式 Session 标签页渲染。
- i18n 测试覆盖所有内置语言的新高可见度标签。
