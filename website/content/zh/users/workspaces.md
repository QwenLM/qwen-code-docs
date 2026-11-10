# 工作目录与 Git worktree

工作目录决定初始项目上下文。可以在项目内启动 Qwen Code，也可以明确指定：

```bash
qwen --cwd /path/to/project
```

`--config-dir` 改变用户级配置根目录，不用于选择项目。选择项目请使用 `--cwd`。

## 添加其他目录

任务涉及关联仓库时，可以运行：

```text
/add-dir ../shared-library
/add-dir list
```

路径必须存在且为目录，相对路径按当前目标目录解析。直接输入 `/add-dir` 可打开目录选择器。命令会询问仅在本次会话信任该目录，还是将它保存在项目本地设置中。

| 选择 | 生效范围 |
| --- | --- |
| 仅本次会话 | 加入当前工作区与权限上下文，清空会话后移除 |
| 持久保存 | 写入 `.qwen/settings.local.json` 的 `permissions.additionalDirectories`，后续会话重新加载 |

本地设置只读时，例如工作区为用户主目录，命令可能退回仅本次会话访问，请阅读结果提示。添加可信目录后会刷新资源；刷新失败时，目录可能已经获得信任，应单独处理资源刷新错误。

启动时可重复指定 `--add-dir`：

```bash
qwen --cwd /path/to/app --add-dir /path/to/library --add-dir /path/to/tests
```

添加目录扩展工作区访问范围，不会跳过各工具的权限检查。信任目录之前，请检查其中的指令及可执行资源。

## 使用独立检出目录

在 Git 仓库中运行：

```bash
qwen --worktree preview-fix
```

省略可选名称时由 Qwen Code 生成。Worktree 创建在仓库的 `.qwen/worktrees/` 下，并有对应 Git 分支，可为任务提供独立的检出文件。它不是操作系统沙箱，不隔离网络、凭据、外部服务或所有运行时状态。

名称建议使用字母、数字、点、下划线和连字符，避免 `..` 等路径穿越片段。创建失败时，检查 Git 仓库状态、写权限，以及名称是否已被占用。不要为解决重名问题直接删除包含待保留变更的 worktree；应检查现有目录或换一个名称。

离开或移除 worktree 前，检查 `git status` 并保存所需变更。仅创建会话分支不会生成 worktree。子 Agent 也可在定义中请求 worktree 隔离，见[子 Agent](/zh/users/subagents/)。
