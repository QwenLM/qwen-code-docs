# Issue #4479 token 用量统计协调方案

## 背景

Issue #4479 希望为 Qwen Code 提供每日 token 消耗可视化能力。在 issue 讨论中，需求范围被进一步明确：优先提供 CLI 命令、导出支持、月度汇总以及按模型划分的 token 消耗。维护者评论中也提出需要与相关统计工作协调：

- #4252：在 `/stats` 中加入生成时序指标，如 TTFT、生成耗时和 TPS。
- #4182：用于内存诊断的不含内容的会话级计数器。

## 协调决策

1. **使用 `/stats`，不新增顶层命令。**
   Token 用量通过 `/stats daily`、`/stats monthly` 和 `/stats export` 暴露，与现有统计命令（会话统计及未来的生成指标）共享同一命令入口。

2. **将 token 计数器以本地 JSONL 格式持久化。**
   每次 API 响应后，向运行时目录下的 `usage/token-usage-YYYY-MM.jsonl` 追加一条不含内容的记录。这样可以满足每日/月度聚合需求，无需引入 SQLite 作为新依赖。

3. **保持 #4252 时序语义独立。**
   Token 用量汇总中可包含 `apiDurationMs`，即遥测中现有的端到端 API 响应耗时。该字段明确命名为 API 耗时，不得将其呈现为生成耗时、TTFT 或 TPS。生成时序指标的所有权仍归属 #4252。

4. **保持 #4182 的隐私和内存诊断边界。**
   用量记录仅存储聚合计数器和稳定维度：本地日期、月份、session id、model、auth type、source、token 计数器和 API 耗时。不存储 prompt 文本、响应文本、tool 内容、项目路径、prompt id 或 response id。

5. **导出仅限聚合数据。**
   CSV 和 JSON 导出均为汇总数据，不是原始记录导出。按总量、model、auth type、model/auth type 以及 source 分组聚合。

## 非目标

- 不在此处实现 #4252 的 TTFT/TPS/生成耗时埋点。
- 不扩展 `/doctor memory` 或在此变更中实现 #4182。
- 不新增独立的 token 用量顶层 slash 命令。
