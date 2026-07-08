# Resolve 命令设计

## 目标

添加一个由维护者触发的 `@qwen-code /resolve` 命令，用于处理因与默认分支存在合并冲突而受阻的 pull request。

## 范围

第一个版本的设计刻意保持保守：

- 该命令仅在 `QwenLM/qwen-code` 中运行。
- 请求者必须具有 `write`、`maintain` 或 `admin` 权限。
- 目标必须是一个处于 open 状态的 pull request。
- pull request 分支必须位于基础仓库中。
- 来自 fork 的 pull request 会被标记为不支持，而不会进行推送。
- Agent 不会接收任何 GitHub token，只能在本地进行编辑和提交。
- 一个独立的 publish 步骤会注入 `CI_DEV_BOT_PAT` 以执行推送和评论操作。

## 工作流

1. 现有的 PR 命令工作流处理 `issue_comment` 或 `workflow_dispatch` 事件，并定位目标 pull request。
2. 授权任务使用 `CI_BOT_PAT` 检查请求者的协作者权限。
3. resolve 任务通过添加 `eyes` reaction 来确认评论触发。
4. 任务读取 pull request 元数据，并拒绝已关闭、处于 draft 状态、无冲突或来自 fork 的 pull request。
5. 对于符合条件的 pull request，任务会在禁用持久化凭证的情况下 checkout pull request 分支，fetch 基础分支，并验证该分支是否仍指向预期的 head SHA。
6. Qwen Code 在没有 GitHub 凭证的情况下运行，合并 `origin/<base>`，解决冲突，验证结果，提交更改，并写入一个 summary artifact。
7. 确定性的验证步骤会在存在未解决冲突、缺少 summary 或 checks 失败时判定为失败。
8. publish 步骤使用 `--force-with-lease` 针对原始 head SHA 进行推送，并评论冲突解决 summary。

## 范围之外

- 自动推送到 fork 的 pull request。
- 为外部贡献者创建替代 pull request。
- 定时扫描长期存在冲突的 pull request。
- 解决除直接合并冲突之外的其他不可合并状态。