# 插件与市场

插件把相关 Skill、命令、Agent、Hook、MCP 服务器或输出风格打包。市场是用于发现和安装插件的目录。添加市场不会自动安装其中所有插件。

## 安装和管理

使用 `/plugins` 打开交互管理器，使用 `/marketplace` 浏览市场。也可以在会话外运行：

```bash
qwen plugins marketplace add ./team-marketplace
qwen plugins marketplace list
qwen plugins install review-kit@team-marketplace --scope project
qwen plugins list
qwen plugins disable review-kit@team-marketplace --scope project
qwen plugins enable review-kit@team-marketplace --scope project
qwen plugins update review-kit@team-marketplace --scope project
qwen plugins uninstall review-kit@team-marketplace --scope project
```

示例中的市场和插件名需要替换为真实条目。市场来源支持本地路径、URL、Git URL 或 `owner/repo`。插件安装支持市场中的名称、`name@marketplace`、本地插件目录或 HTTPS ZIP URL。本地插件可用 `qwen plugins install ./review-kit` 安装。

| 作用域 | 用途 |
| --- | --- |
| `user` | 跨项目使用的个人插件；安装默认值 |
| `project` | 通过仓库共享的配置 |
| `local` | 当前项目的个人配置 |

项目和本地声明分别写入 `.qwen/settings.json` 与 `.qwen/settings.local.json`；本地文件应排除在版本控制之外。安装文件与安装记录由用户插件存储管理。共享插件声明不等于把安装文件提交到仓库，其他用户仍需具备源地址访问权限及必要凭据。

启用和禁用在省略作用域时可以自动识别；同一插件存在多个作用域时，建议显式指定。`qwen plugins list --json` 提供机器可读结果。`qwen plugins marketplace update <name>` 更新市场元数据，`qwen plugins marketplace remove <name>` 移除市场。更新插件与更新市场是两个独立操作。

## 创建本地插件

创建目录：

```text
review-kit/
  .qwen-plugin/
    plugin.json
  commands/
    review.md
  skills/
    check-tests/
      SKILL.md
```

`.qwen-plugin/plugin.json`：

```json
{
  "name": "review-kit",
  "version": "0.1.0",
  "description": "Review instructions and test coverage checks"
}
```

`commands/review.md`：

```markdown
---
description: 审查变更，不修改文件。
disable-model-invocation: true
---
审查 $ARGUMENTS，阅读相关差异并报告具体问题。
不要修改文件。
```

命令使用插件命名空间，例如 `/review-kit:review`。资源目录放在插件根目录，与 `.qwen-plugin` 并列，而不是放进元数据目录。约定目录包括 `commands`、`skills`、`agents`、`output-styles`、`workflows` 和 `hooks`；manifest 显式声明某类资源路径时，可以替代该类资源的约定目录发现。不能把解析器接受的所有字段都理解为已具备运行行为。

校验并加载开发目录：

```bash
qwen plugins validate ./review-kit
qwen plugins validate ./review-kit --json
qwen --plugin-dir ./review-kit
```

`--plugin-dir` 为本次运行提供插件目录，适合持久安装前测试。校验检查目录和声明结构，不代表脚本、远程服务或模型任务都能执行成功。

## 信任与配置

插件可能包含可执行 Hook，也可能启动 MCP 进程。启用前应检查来源和配置。项目信任及各资源类型的限制仍然生效。检查外部程序依赖，并通过支持的环境变量或配置方式提供凭据，不要提交密钥。

更新插件时，除了版本，也要检查新增能力。禁用会停止该配置下插件能力的提供，不会撤销工具已经完成的修改。需要移除已安装插件时应明确卸载，不能用移除市场代替。

## 故障排查

- **找不到插件：**列出市场，检查准确的 `name@marketplace`，更新市场元数据。
- **已安装但缺少命令：**检查启用状态、作用域、项目信任、命名空间与校验输出；修改插件元数据后重启。
- **认证或网络失败：**独立验证源地址的访问权限；市场条目不会授予私有仓库或服务的访问权限。
- **Skill 或 Hook 已加载但执行失败：**检查解释器、路径、环境变量，再查阅 [Skills](/zh/users/skills/)、[Hooks](/zh/users/hooks/)或 [MCP](/zh/users/mcp/) 指南。

各命令详细选项见 `qwen plugins <command> --help`。
