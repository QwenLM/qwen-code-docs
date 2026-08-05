# DSW SWE-bench Verified 发布流水线

该流水线是以下链路的隔离实现：

`GitHub Release -> self-hosted DSW runner -> short run submission -> persistent Coordinator + 10 Executors -> Publisher -> Release result`

它不使用也不修改 PR #7584 的工作流、服务、状态或结果标记。

## 生产行为

- 一个稳定的 `vX.Y.0` Release 从 Release tag 的目标提交启动工作流。补丁
  版本、prerelease 和无关的 tag 系列被跳过。
- Release tag 被解析为其不可变的 Git 提交。
- 完整的 500 实例 SWE-bench Verified manifest 在分发之前被冻结。
- Self-hosted runner 通过其出站 GitHub 连接接收 Actions job。一次性
  dispatch 脚本冻结 manifest 并调用 `qwen-benchmark-pool submit` 创建
  run 和初始任务。
- Action 记录池的 `run_id` 并结束，不等待基准测试。
- 一个常驻 Coordinator 和十个常驻 Executor 处理该 run。每个 Executor 原
  子地认领一个任务，一次运行一个 Harbor/Docker trial。
- Harbor 的实时 trial 目录保留在本地 NVMe 上。已完成的尝试 artifact 被
  复制到 OSS，不依赖 OSS POSIX 权限操作。
- Executor 为其租约发送心跳并原子地提交结果。可重试的基础设施错误最多
  获得四次尝试，退避为 60、120 和 240 秒。
- Coordinator 恢复过期的租约，调和 run 计数器，并应用 manifest 完成和
  发布闸门。孤立的终态失败不会取消剩余任务。
- 一个常驻 DSW publisher 监视终态 run，并用公开结果 JSON 和逐 case 的
  trajectory 归档主动更新触发的 Release。
- 分数只在所有 500 个实例都到达唯一终态、没有任务被取消且
  `EXECUTION_ERROR + INFRA_FAILED < 10` 时才写入。分数为
  `RESOLVED / (RESOLVED + UNRESOLVED)`，分母只使用有效的 grader 结
  果。
- 十个或更多终态错误、被取消的任务、缺失的结果，或可计分的 case 缺失
  trajectory，会使该 run 变为 `QUARANTINED`；写入状态和计数但不写入分
  数。

## 隔离边界

- Runner label：`qwen-benchmark-dsw`
- 工作流：`.github/workflows/dsw-swe-verified-release.yml`
- Suite：`dsw_release_swe_verified_v1`
- PostgreSQL 数据库：`qwen_benchmark_dsw_release_v1`
- 运行时：`/mnt/workspace/qwen-benchmark-dsw-release-v1`
- 模型凭据：`/mnt/workspace/qwen-benchmark-dsw-release-v1/config/model.key`
  （`root:github-runner`，模式 `0640`）
- OSS：`/mnt/data/qwen-benchmark/dsw-release-v1`
- Release 标记：`qwen-code-dsw-swe-verified`

Docker 镜像层可以使用 DSW 宿主缓存，但实验状态和 artifact 不与另一个基
准测试流水线共享路径或表。

## 分支验证

从本分支使用 `workflow_dispatch`，并以一个隔离的 prerelease 为目标。自
动的 `release.published` 运行有意限定为稳定的 `vX.Y.0` 版本。

对于手动 dispatch 的测试 prerelease，一行 body 如
`Benchmark-Qwen-Ref: v0.20.0-nightly.20260722.b98306b7e` 可以选择一个
已发布的 Qwen npm 版本，同时把结果保留在隔离的 POC Release 上。此覆盖
只被 prerelease 接受。普通 Release 总是评估自己的 tag。

`workflow_dispatch` 仍可用于显式诊断和重跑。手动验证默认为一个实例，以
限制时间和模型成本；5 实例和 500 实例运行不转发单 case 的
`instance_id`。两个触发器都是异步的：Actions 记录 dispatch 回执，但不
在基准测试持续期间保持存活。

## 组件边界

- GitHub self-hosted runner：长生命周期的 GitHub job 接收器。
- Dispatch / pool submit：一次性的 run 和任务创建器。
- PostgreSQL：共享的持久状态存储，不是调度器。
- Coordinator：过期租约恢复、run 调和和完成闸门。
- Executor：任务认领、Harbor/Qwen Code/grader 执行、心跳和结果提交。
- Publisher：终态 run 验证、公开结果和 trajectory 打包生成，以及主动的
  GitHub Release 回写。

DSW 实现在内部 `qwen-code-benchmark-dsw` 仓库中单独维护。本 PR 只包含
GitHub 触发器、manifest、dispatch 适配器和公开设计契约。

## 全套验证

隔离的 prerelease 验证于 2026-07-25 完成：

- 测试 Release：
  `dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3`
- GitHub Actions run：`30079405895`
- 池 run：`pool-31a24bc8acca49d2`
- 数据集：`swe-bench/swe-bench-verified@2`，500 个冻结实例
- 执行：10 个常驻 Executor，每个实例最多两次尝试
- Qwen Code：`v0.20.0-nightly.20260722.b98306b7e`
- 模型：`qwen3.7-max`
- 墙钟时间：约 12 小时 27 分钟
- 结果：332 个 `RESOLVED`，107 个 `UNRESOLVED`，56 个
  `EXECUTION_ERROR`，5 个 `INFRA_FAILED`
- 有效 grader 覆盖：439/500（87.8%）
- 有效 grader 结果中的诊断 resolved 率：332/439（75.6%）
- Run 状态：`QUARANTINED`；未发布官方分数
- 公开 JSON：500 条记录和 500 个唯一 instance ID

证据：

- https://github.com/QwenLM/qwen-code/releases/tag/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3
- https://github.com/QwenLM/qwen-code/actions/runs/30079405895
- https://github.com/QwenLM/qwen-code/releases/download/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3/swe-bench-verified-dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3.json

完整链路已验证，包括异步 dispatch、任务池执行、严格隔离和 Publisher 回
写。该 run 不是官方模型分数：61 个实例缺少有效的 grader 结果，且运行中
的 Executor 池在源码热更新后保留了较旧的错误分类器。一次干净的全量重跑
需要固定的 worker commit/digest 以及重启过、经过版本检查的 Executor。
