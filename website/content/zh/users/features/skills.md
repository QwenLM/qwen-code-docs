# Agent Skills

> 创建、管理和共享 Skills 以扩展 Qwen Code 的功能。

本指南介绍如何在 **Qwen Code** 中创建、使用和管理 Agent Skills。Skills 是模块化的功能，通过包含指令（以及可选的脚本/资源）的有序文件夹来扩展模型的能力。

## 前提条件

- Qwen Code（最新版本）
- 熟悉 Qwen Code 的基本使用（[快速入门](../quickstart.md)）

## 什么是 Agent Skills？

Agent Skills 将专业知识打包为可发现的功能。每个 Skill 由一个包含指令的 `SKILL.md` 文件组成，模型可以在相关时加载这些指令，此外还可以包含脚本和模板等可选的支持文件。

### Skills 的调用方式

Skills 是**由模型调用**的 —— 模型会根据你的请求和 Skill 的描述自主决定何时使用它们。这与斜杠命令不同，斜杠命令是**由用户调用**的（你需要显式输入 `/command`）。

如果你想显式调用某个 Skill，可以使用 Skill 的名称将其作为斜杠命令输入：

```bash
/<skill-name>
```

开始输入 `/` 即可自动补全并浏览可用的 Skills 及其描述。`/skills` 命令会打开 Skills 面板，你可以在其中交互式地浏览、搜索、切换和启动 Skills。

> **注意：** 如果你之前使用 `/skills <skill-name>` 运行过 Skill，该语法现在只会打开 Skills 面板并忽略尾部参数。请使用 `/<skill-name>` 直接运行 Skill。

### 优势

- 针对你的工作流扩展 Qwen Code
- 通过 git 在团队中共享专业知识
- 减少重复的提示词编写
- 组合多个 Skills 以处理复杂任务

## 创建 Skill

Skills 以包含 `SKILL.md` 文件的目录形式存储。

### 使用 `/learn` 生成项目 Skill

使用 `/learn` 将现有知识源提炼为可复用的项目 Skill：

```text
/learn https://docs.example.com/api
/learn ~/projects/acme-sdk
/learn Our deploy process: run migrate, deploy the service, then check health
```

该命令作为普通 agent 轮次运行，并在 `.qwen/skills/learned-skill-<name>/SKILL.md` 下创建结果，frontmatter 中包含 `source: learned`。在使用或分享生成的指令之前，请先审查它们。

`/learn` 还接受本地或直链的 `.mp4`、`.webm`、`.mov` 和 `.m4v` 视频。在路径或 URL 后添加文本，可将生成的 Skill 聚焦于教程的某一部分：

```text
/learn ./tutorial.mp4 focus on the deployment workflow
```

视频学习需要兼容 OpenAI 的提供商提供的支持视频的模型。YouTube 页面 URL 不是直接视频输入；请将视频下载到工作区并传递其本地路径。

### 个人 Skills

个人 Skills 在所有项目中均可用。将它们存储在 `~/.qwen/skills/` 中：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

个人 Skills 适用于：

- 你个人的工作流和偏好
- 你正在开发的 Skills
- 个人效率辅助工具

### 项目 Skills

项目 Skills 与你的团队共享。将它们存储在项目中的 `.qwen/skills/` 目录下：

```bash
mkdir -p .qwen/skills/my-skill-name
```

项目 Skills 适用于：

- 团队工作流和规范
- 项目特定的专业知识
- 共享的实用工具和脚本

项目 Skills 可以提交到 git，并自动对团队成员可用。

### 维护自动生成的项目 Skills

Qwen Code 在本地跟踪生成的项目 Skills 的成功使用情况，包括在 Auto Skill 生成被禁用期间也是如此，因此重新启用维护不会将最近使用的 skill 误判为不活跃的。当 **Auto Skill** 启用时，它会周期性地将不活跃的生成 Skills 移出活跃库。仅管理名为 `.qwen/skills/auto-skill-*` 且 `SKILL.md` frontmatter 包含 `source: auto-skill` 的目录；个人、扩展、内置和手工编写的 Skills 永远不会被选中。

- 在 30 天内没有成功使用或 `SKILL.md` 编辑的 auto-skill 会被标记为 stale。
- 在 90 天后，其完整目录会被移动到 `.qwen/archived-skills/`。不会永久删除任何内容。
- 自动维护在可信工作区中最多每 7 天运行一次。每个新观察到的 auto-skill 在维护开始前会获得完整的宽限期。
- 被 pin 的 auto-skill 会被排除在自动 stale 和归档转换之外，直到它被 unpin。
- 归档的目录名称保持保留，已存在的归档目标仅跳过该冲突，而不会停止其他 skills 的维护。

使用 `/curator` 查看 active、stale、archived 和 pinned 的 auto-skills。运行 `/curator run --dry-run` 预览维护过程，`/curator run` 立即应用，`/curator pin <directory>` 或 `/curator unpin <directory>` 控制每个 skill 的维护，或 `/curator restore <directory>` 将归档的 auto-skill 移回活跃库。

状态和 dry-run 预览在安全模式和不可信工作区中可用。应用维护、更改 pin 和恢复归档的 auto-skills 需要可信工作区且不在安全模式下。

## 编写 SKILL.md

创建一个包含 YAML frontmatter 和 Markdown 内容的 `SKILL.md` 文件：

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
priority: 10
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### 字段要求

Qwen Code 目前会验证以下内容：

- `name` 必须是非空字符串，且匹配 `/^[\p{L}\p{N}_:.-]+$/u` —— 支持 Unicode 字母和数字（中日韩/西里尔/带音标的拉丁字母均可），以及 `_`、`:`、`.`、`-`。空格、斜杠、括号和其他结构上不安全的字符会在解析时被拒绝。
- `description` 必须是非空字符串
- `priority` 是可选的。如果存在，它必须是一个有限数字。较高的值仅在 `/skills` 列表中排序靠前 —— 斜杠命令补全（输入 `/`）和 `/help` 自定义命令视图保持字母顺序，因此高优先级的 Skill 永远不会重新排序内置命令。省略或无效的值将被视为未设置，其行为类似于 `0`。

推荐的命名规范：

- 对于可共享的名称，优先使用带连字符的小写 ASCII 字符（例如 `tsx-helper`）
- 使 `description` 具体化：同时包含 Skill 的**功能**和**使用时机**（用户自然会提到的关键词）
- 谨慎使用 `priority`，仅用于那些需要可靠地出现在 `/skills` 默认字母顺序之前的 Skills。允许使用负优先级，它们会排在未设置优先级的 Skill 之后。

### 可选：通过文件路径限制 Skill (`paths:`)

对于仅与代码库特定部分相关的 Skills，添加一个 `paths:` glob 模式列表。在工具调用触及匹配的文件之前，该 Skill 不会出现在模型的可用 Skills 列表中：

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

注意事项：

- Glob 模式使用 [picomatch](https://github.com/micromatch/picomatch) 相对于项目根目录进行匹配；项目根目录之外的文件永远不会触发激活。
- 路径限制的 Skill 一旦触及匹配文件，就会在**当前会话的剩余时间内保持激活状态**。新会话，或通过编辑任何 Skill 文件触发的 `refreshCache`，会重置激活状态。
- `paths:` 仅限制**模型**的发现，且仅在 SkillTool 列表级别生效。除非设置了 `user-invocable: false`，否则你始终可以通过 `/<skill-name>` 或 `/skills` 选择器自己调用路径限制的 Skill —— 该用户路径会无视激活状态直接运行 Skill 主体。然而，模型端会保持限制，直到触及匹配文件：斜杠调用**不会**解锁模型端的激活，因此如果你希望模型在你的调用之后进行链式调用（自己调用 `Skill { skill: ... }`），请先访问一个匹配该 Skill `paths:` 的文件。
- 将 `paths:` 与 `disable-model-invocation: true` 结合使用是允许的，但限制不生效 —— 无论如何该 Skill 都对模型隐藏，因此路径激活永远不会宣传它。

### 可选：控制用户和模型调用

Skills 默认允许用户调用。要将 Skill 从直接的斜杠命令使用中隐藏，同时保持其对模型调用可用，请设置 `user-invocable: false`：

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

这会从 `/<skill-name>` 调用和 `/skills` 选择器结果中移除该 Skill。它不会向模型隐藏该 Skill。

要向模型隐藏 Skill 同时保持直接的用户调用可用，请设置 `disable-model-invocation: true`：

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

你可以结合这两个字段，但这样该 Skill 就无法通过正常的用户或模型调用路径访问了。

## 添加支持文件

在 `SKILL.md` 旁边创建其他文件：

```text
my-skill/
├── SKILL.md (required)
├── reference.md (optional documentation)
├── examples.md (optional examples)
├── scripts/
│   └── helper.py (optional utility)
└── templates/
    └── template.txt (optional template)
```

从 `SKILL.md` 中引用这些文件：

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## 查看可用的 Skills

Qwen Code 从以下位置发现 Skills：

- 个人 Skills：`~/.qwen/skills/`
- 项目 Skills：`.qwen/skills/`
- 扩展 Skills：由已安装扩展提供的 Skills

### 扩展 Skills

扩展可以提供自定义 Skills，在启用扩展时变得可用。这些 Skills 存储在扩展的 `skills/` 目录中，并遵循与个人和项目 Skills 相同的格式。

在安装并启用扩展时，会自动发现和加载扩展 Skills。

要查看哪些扩展提供了 Skills，请检查扩展的 `qwen-extension.json` 文件中的 `skills` 字段。

要查看可用的 Skills，请直接询问 Qwen Code：

```text
What Skills are available?
```

> **注意 —— 模型视图与用户视图的区别。** 询问模型只会显示模型当前能看到的 Skills。如果 Skill 使用了 `paths:`（参见上文“可选：通过文件路径限制 Skill”），在触及匹配文件之前，它不会出现在该列表中。`/skills` 斜杠命令显示你可以直接调用的 Skills；设置了 `user-invocable: false` 的 Skills 在磁盘上仍然可见，并且可能对模型仍然可见。

或者使用斜杠命令浏览用户可调用的列表（包括尚未激活的路径限制 Skills）：

```text
/skills
```

或者检查文件系统：

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## 测试 Skill

创建 Skill 后，通过提出与你的描述相匹配的问题来测试它。

示例：如果你的描述提到了“PDF 文件”：

```text
Can you help me extract text from this PDF?
```

如果匹配请求，模型会自主决定使用你的 Skill —— 你不需要显式调用它。

## 调试 Skill

如果 Qwen Code 没有使用你的 Skill，请检查以下常见问题：

### 使描述更具体

过于模糊：

```yaml
description: Helps with documents
```

具体：

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### 验证文件路径

- 个人 Skills：`~/.qwen/skills/<skill-name>/SKILL.md`
- 项目 Skills：`.qwen/skills/<skill-name>/SKILL.md`

```bash
# Personal
ls ~/.qwen/skills/my-skill/SKILL.md

# Project
ls .qwen/skills/my-skill/SKILL.md
```

### 检查 YAML 语法

无效的 YAML 会阻止 Skill 元数据正确加载。

```bash
cat SKILL.md | head -n 15
```

确保：

- 第 1 行以 `---` 开头
- 在 Markdown 内容之前以 `---` 闭合
- 有效的 YAML 语法（无制表符，缩进正确）

### 查看错误

使用调试模式运行 Qwen Code 以查看 Skill 加载错误：

```bash
qwen --debug
```

## 与团队共享 Skills

你可以通过项目仓库共享 Skills：

1. 将 Skill 添加到 `.qwen/skills/` 下
2. 提交并推送
3. 团队成员拉取更改

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## 更新 Skill

直接编辑 `SKILL.md`：

```bash
# Personal Skill
code ~/.qwen/skills/my-skill/SKILL.md

# Project Skill
code .qwen/skills/my-skill/SKILL.md
```

在正常会话期间，Qwen Code 会监视个人和项目 Skill 目录。添加、编辑或删除 Skill 会在短暂延迟后自动刷新 Skill 列表和调用状态。Bare 模式不会启动这些监视器，因此在该模式下需要重启 Qwen Code 以加载 Skill 更改。

## 移除 Skill

删除 Skill 目录：

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## 最佳实践

### 保持 Skill 专注

一个 Skill 应该只解决一种能力：

- 专注：“PDF 表单填充”、“Excel 分析”、“Git 提交信息”
- 过于宽泛：“文档处理”（拆分为更小的 Skills）

### 编写清晰的描述

通过包含特定的触发条件，帮助模型发现何时使用 Skills：

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### 与团队一起测试

- Skill 是否在预期时激活？
- 指令是否清晰？
- 是否缺少示例或边缘情况？