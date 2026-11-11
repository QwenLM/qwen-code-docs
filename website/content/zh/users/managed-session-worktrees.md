# 托管会话 worktree


在支持的本地托管部署中，创建会话时选择 Git 项目。点击工作区下方 composer 旁边的 Git 分支按钮，选择 **Worktree**。选择器关闭；发送第一条消息时会自动从当前 HEAD 创建一个隔离的 checkout，位于其自己的分支上。无需填写分支或目录表单。未提交的文件、被忽略的配置和已安装的依赖项保留在源目录中。

发送前，选择 **Current branch** 或清除 Worktree chip 以直接在源分支上工作。当未选择隔离时，chip 显示实际的源分支，例如 **main**。

会话会报告准备状态，并可能等待使用相同存储的其他工具。worktree 就绪后，文件引用和工作区上传将变为可用。项目指令来自目标目录；托管模型、审批、Skills、MCP 和扩展设置保留其会话 pin。

在 Home chat 中，会话的更多信息卡片包含 worktree 状态、分支和基础提交。就绪的 worktree 详情不再占据对话顶部；准备和错误消息在需要时仍可见。

关闭、归档或删除聊天会保留 checkout 和分支。从同一工作区的新任务 composer 弹出菜单中打开 **会话 worktree** 以检查保留的目录。清理前请关闭会话并完成其后台工作。先提交或以其他方式保存跟踪/未跟踪/被忽略的内容。清理仅移除干净的 checkout 并保留所有分支；不会将更改合并到源中。

部署启用 `qwen.managed-agent.runtime-broker.session-worktrees-enabled`。默认关闭；`qwen serve --managed` 为符合条件的本地主机启用。此版本支持 LOCAL macOS/Linux 存储、会话隔离的持久本地进程工作者和 Git 2.40 或更高版本。仓库及其 Git 公共目录必须位于注册的存储根目录内。对于 Git 元数据位于其他位置的现有链接 checkout，选择原始 checkout 或请管理员注册包含两者的根。此版本不支持 SSH 和 CSI。

重启就绪的会话会重用其原始 checkout。缺失或被替换的目录会阻止执行。如果服务器在 Git 创建或移除 worktree 时被终止，未验证的原始 Git 进程会使操作保持阻止状态，其维护锁保持完整。重新检查不会强制恢复；此情况下的 macOS 自动恢复不在此版本范围内。保留目录和分支，直到原始执行可以调和。

公共会话创建请求添加 `worktree: {"base_ref":"main"}`；`worktree: {}` 选择 HEAD，省略则使用当前目录。发送显式授权的 `workspace` 并在重试时保留相同的 Idempotency-Key。在发送后续输入之前查询返回的会话的 `worktree.state`。

此开发版本更新共享 V1 架构基线。使用该基线重新创建的开发目录；不包含旧目录的升级迁移。