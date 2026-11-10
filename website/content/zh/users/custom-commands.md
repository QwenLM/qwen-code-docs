# 自定义命令

自定义命令把重复使用的提示词变成斜杠命令。简短指令可以使用单个 Markdown 文件；需要脚本和参考资料的任务适合使用 [Skill](/zh/users/skills/)。

## 创建命令

创建 `.qwen/commands/review-change.md`：

```markdown
---
description: 审查变更的正确性和缺失的测试。
argument-hint: "[路径]"
disable-model-invocation: true
---
审查影响 $ARGUMENTS 的变更。
阅读差异和附近的实现。
报告可操作的问题，附上文件路径并说明影响。
没有发现问题时直接说明，同时指出尚未验证的行为。
不要修改文件。
```

在交互会话中输入 `/review-change src/`。命令向模型提供指令，不是独立可执行程序。指令要求使用的工具仍然受会话权限规则约束。

## 位置和命名

| 文件 | 命令 |
| --- | --- |
| `.qwen/commands/review-change.md` | `/review-change` |
| `.qwen/commands/team/review-change.md` | `/team:review-change` |
| `~/.qwen/commands/review-change.md` | 个人 `/review-change` |
| 插件的 `commands/review-change.md` | `/plugin-name:review-change` |

目录段用冒号连接成命名空间，命令名段的字符原样保留。标识来自相对文件路径。项目命令能否加载取决于当前项目资源的信任策略。使用 `--config-dir` 时，用户目录随之变化。

使用 `/commands` 浏览命令，使用 `/skills` 检查共享的资源状态。避免与内置命令或其他扩展重名，必要时使用界面显示的完整名称。

## 参数

`$ARGUMENTS` 插入完整参数字符串。`$0` 和 `$ARGUMENTS[0]` 插入第一个参数，`$1` 插入第二个参数。引号包围的内容作为一个参数解析。这些占位符构造的是提示词，本身不会执行 Shell 命令。

命名参数示例：

```markdown
---
description: 比较两个模块。
arguments:
  - name: source
    description: 第一个模块
    required: true
  - name: target
    description: 第二个模块
    required: true
---
比较 $source 和 $target，说明各自职责及依赖关系。
```

参数元数据用于提示，不应被当作完整输入校验系统；建议在正文中说明参数缺失时如何处理。正文没有占位符且参数非空时，参数会被追加到提示词末尾。其他支持的 frontmatter 字段见 [Skills](/zh/users/skills/)。

## 维护和故障排查

一个命令聚焦一个可重复的结果，明确需要的证据和输出。共享命令提交到仓库，个人或特定环境的指令放入用户目录。不要在提交的命令文件中嵌入凭据。

命令与 Skill 共用发现和调用机制。`user-invocable: false` 会隐藏用户斜杠入口；`disable-model-invocation: true` 将调用保留给显式操作。文件变化会被监听；新文件或命名空间没有出现时，可重启会话。

调用失败时，检查 YAML 语法、项目是否受信任、禁用状态及真实相对路径。将文件移入子目录也会改变命令名。指令中提及一个不可用工具，不会让该工具自动可用。
