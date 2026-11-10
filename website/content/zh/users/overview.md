# Qwen Code 1.0 Preview

Qwen Code 是终端中的编程 Agent。你可以在项目内提问或描述修改需求，检查待执行的工具操作，并审阅最终代码差异与验证结果。

交互式 CLI 提供项目指令、模型选择、文件与 Shell 工具、权限控制、持久化会话和扩展能力；打印模式支持脚本调用。具体可用能力取决于模型、账号、项目可信状态及配置。

## 从一个任务开始

获得 Preview 可执行程序后，在项目中启动：

```sh
cd my-project
qwen
```

通过 `/auth` 连接账号或提供商，再用 `/model` 选择模型。可以先提问：“解释项目入口和测试命令，先不要修改文件。”随后提出一个范围明确的小改动，并要求执行对应验证。批准工具操作前阅读权限提示，通过 `/diff` 查看改动。

安装命令见[安装与更新](/zh/users/installation/)，首次使用步骤见[快速开始](/zh/users/quickstart/)。

## 按需要查阅

| 需求 | 文档 |
| --- | --- |
| 连接账号、API 和模型 | [登录认证](/zh/users/authentication/)、[模型配置](/zh/users/models/) |
| 设置项目行为与操作权限 | [设置](/zh/users/settings/)、[权限](/zh/users/permissions/) |
| 提高终端使用效率 | [终端交互](/zh/users/terminal/)、[上下文与记忆](/zh/users/context-memory/) |
| 恢复、分支与回退 | [会话](/zh/users/sessions/)、[工作目录](/zh/users/workspaces/) |
| 规划与委派任务 | [规划](/zh/users/planning/)、[子 Agent](/zh/users/subagents/)、[后台任务](/zh/users/tasks-workflows/) |
| 增加可复用能力 | [Skills](/zh/users/skills/)、[自定义命令](/zh/users/custom-commands/)、[插件](/zh/users/plugins/) |
| 连接工具与事件自动化 | [MCP](/zh/users/mcp/)、[Hooks](/zh/users/hooks/) |
| 从脚本调用 CLI | [非交互模式](/zh/users/headless/) |
| 查找准确语法 | [CLI 参考](/zh/users/cli-reference/)、[设置参考](/zh/users/settings-reference/)、[Hook 参考](/zh/users/hooks-reference/) |
| 排查问题与检查本地数据 | [排错](/zh/users/troubleshooting/)、[数据与隐私](/zh/users/data-privacy/) |

## Preview 范围

这些文档覆盖终端 CLI。已注册的命令仍可能要求启用相应功能或满足特定会话状态。当前安装的 `/help`、子命令帮助及交互界面显示实际可用选项。实验性设置不代表稳定的集成接口承诺。

合并改动前应检查生成代码和测试结果。会话回退可以帮助恢复操作，但不替代 Git 或备份，也不保证恢复 Agent 跟踪的文件工具以外产生的修改。

参与代码开发请阅读[贡献指南](/zh/developers/contributing/)。
