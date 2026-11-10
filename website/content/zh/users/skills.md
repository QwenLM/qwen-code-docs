# Skills

Skill 是面向特定任务的可复用指令及配套文件。你可以通过斜杠命令选择 Skill，也可以让模型根据描述选择合适的 Skill。安装只让 Skill 可被发现，不会立即执行其中的脚本。

## 创建项目 Skill

创建 `.qwen/skills/review-tests/SKILL.md`：

```markdown
---
name: review-tests
description: 审查代码变更是否缺少测试，并说明最重要的覆盖缺口。
argument-hint: "[文件或目录]"
disable-model-invocation: true
---
审查与 $ARGUMENTS 相关的测试。
先阅读实现和现有测试，再提出建议。
指出具体缺失的测试场景并附文件路径，不修改文件。
```

在项目中启动 Qwen Code，输入 `/review-tests src/`。使用 `/skills` 查看可用 Skill 和启用状态。此 Skill 的命令标识由目录名决定；建议 `name` 与目录名保持一致。

配套资料放在 `SKILL.md` 旁，例如 `references/checklist.md` 或 `scripts/check.py`，并在正文中说明何时读取或执行。脚本需要相应解释器和依赖。Skill 是指令，不是执行沙箱。

## 位置与可见性

| 位置 | 用途 |
| --- | --- |
| `~/.qwen/skills/<name>/SKILL.md` | 跨项目使用的个人 Skill |
| `.qwen/skills/<name>/SKILL.md` | 与受信任项目共享的 Skill |
| 插件的 `skills/` 目录 | 已启用插件提供的 Skill |

配置 `--config-dir` 后，用户目录随之改变。附加工作区目录也可能提供项目 Skill。项目信任、禁用状态、管理设置和同名冲突都会影响可用列表。兼容目录 `.agents/skills` 由配置开关控制，不是使用 Qwen Code Skill 的必要条件。

建议使用不冲突的命令名。`skills/` 下的分类目录会被扫描，但 Skill 以自身所在目录命名：`.qwen/skills/team/review-tests/SKILL.md` 对应 `/review-tests`。冒号形式的名称只用于 `.qwen/commands/` 下的文件和插件 Skill（带插件名前缀）。存在多个同名来源时，以 `/skills` 显示的完整名称为准。

## Frontmatter 字段

| 字段 | 含义 |
| --- | --- |
| `description` | 描述适用任务，建议明确触发场景 |
| `argument-hint` | 输入参数时显示的提示 |
| `arguments` | `{name, description, required}` 对象数组，描述参数 |
| `disable-model-invocation: true` | 禁止模型自主选择，适合必须显式触发的流程 |
| `user-invocable: false` | 不提供用户斜杠调用入口；模型选择由独立字段控制 |
| `allowed-tools` | Skill 执行策略使用的工具名称或规则 |
| `model` | 模型覆盖；必须是当前会话配置中可用的模型 |
| `effort` | `none`、`low`、`medium`、`high`、`xhigh`、`max` 或正整数；实际支持取决于模型 |
| `context: fork` | 在独立 Agent 上下文中执行 |
| `agent` | fork 执行使用的 Agent |
| `hooks` | 与 Skill 执行关联的 Hook |
| `paths` | 用于上下文可见性筛选的文件模式 |
| `shell` | Shell 预处理使用 `bash` 或 `powershell` |

不需要的字段可以省略。工具许可不会取消项目信任或更高层限制。模型选择与用户调用是独立控制项，同时关闭两种入口后，常规入口将无法调用该 Skill。

正文中，`$ARGUMENTS` 表示完整参数字符串；`$ARGUMENTS[0]` 或 `$0` 表示第一个参数，后续索引从零递增。引号包围的参数保持为一项，缺失的索引参数替换为空字符串。正文没有占位符且参数非空时，参数追加到正文末尾。`${QWEN_SKILL_DIR}` 表示 Skill 所在目录，可用于定位配套文件。

## 安装和管理

```bash
qwen skills list
qwen skills list --all
qwen skills install ./review-tests --scope project
qwen skills link ./review-tests --scope user
qwen skills disable review-tests --scope project
qwen skills enable review-tests
qwen skills uninstall review-tests --scope project
```

安装来源可以是 Git 仓库 URL、HTTPS ZIP URL、本地目录或本地 `.skill`/`.zip` 归档。通过 `--path` 选择仓库或归档中的子目录。安装和链接默认使用 `user`；`project` 与 `workspace` 表示同一 Skill 作用域。禁用默认写入工作区；启用命令没有作用域参数，会清除适用的禁用记录。

开发本地 Skill 时可以使用链接，它引用源目录。确认安装前应阅读指令及脚本；`--consent` 跳过安装确认，仅应在完成审阅后使用。

## 故障排查

- **`/skills` 中没有出现：**检查 `SKILL.md` 文件名、YAML 语法、项目信任、作用域和加载诊断；`SKILL.md` 必须位于自己的命名目录中。
- **列表中存在但斜杠补全不显示：**检查 `user-invocable`、禁用状态和完整命名空间。
- **模型不会自动选择：**检查 `disable-model-invocation`、描述和 `paths` 筛选，先验证显式调用。
- **修改后未生效：**Skill 文件会被监听，但深层配套文件修改可能不触发刷新；修改这类文件后重启会话。
- **工具或模型不可用：**先在会话中独立验证；frontmatter 不会安装工具或授予账号模型权限。

另见[自定义命令](/zh/users/custom-commands/)、[插件](/zh/users/plugins/)和 [Hooks](/zh/users/hooks/)。
