---
description: "学习 Qwen Code Agent Skills 的创建、管理和共享方法，把常用流程封装成可复用能力，提升 AI 编程助手在项目中的命中率和执行效果。"
---

# Agent Skills

> 创建、管理和共享 Skills，以扩展 Qwen Code 的功能。

本指南介绍如何在 **Qwen Code** 中创建、使用和管理 Agent Skills。Skills 是模块化能力，通过包含指令（以及可选的脚本/资源）的组织化文件夹来扩展模型的有效性。

## 前置条件

- Qwen Code（最新版本）
- 基本熟悉 Qwen Code（[快速入门](../quickstart.md)）

## 什么是 Agent Skills？

Agent Skills 将专业知识打包为可发现的能力。每个 Skill 包含一个 `SKILL.md` 文件，其中包含模型在相关时可加载的指令，以及可选的辅助文件（如脚本和模板）。

### Skills 的调用方式

Skills 由**模型调用**——模型会根据你的请求和 Skill 的描述自主决定何时使用它们。这与斜杠命令不同，斜杠命令是**用户调用**的（你需要显式输入 `/command`）。

如果你想显式调用某个 Skill，请使用 `/skills` 斜杠命令：

```bash
/skills <skill-name>
```

使用自动补全功能浏览可用的 Skills 及其描述。

### 优势

- 针对你的工作流扩展 Qwen Code
- 通过 git 在团队间共享专业知识
- 减少重复性提示词编写
- 组合多个 Skills 处理复杂任务

## 创建 Skill

Skills 以包含 `SKILL.md` 文件的目录形式存储。

### 个人 Skills

个人 Skills 在所有项目中均可用。将它们存储在 `~/.qwen/skills/` 中：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

个人 Skills 适用于：

- 你的个人工作流和偏好
- 正在开发中的 Skills
- 个人效率辅助工具

### 项目 Skills

项目 Skills 可与你的团队共享。将它们存储在项目的 `.qwen/skills/` 中：

```bash
mkdir -p .qwen/skills/my-skill-name
```

项目 Skills 适用于：

- 团队工作流和规范
- 项目专属的专业知识
- 共享的实用工具和脚本

项目 Skills 可以提交到 git，并自动对团队成员可用。

## 编写 `SKILL.md`

创建一个包含 YAML frontmatter 和 Markdown 内容的 `SKILL.md` 文件：

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### 字段要求

Qwen Code 当前会验证以下内容：

- `name` 必须是非空字符串，且匹配 `/^[\p{L}\p{N}_:.-]+$/u` —— 支持 Unicode 字母和数字（中文/西里尔字母/带音标的拉丁字母均可），以及 `_`、`:`、`.`、`-`。空格、斜杠、括号及其他结构不安全的字符将在解析时被拒绝。
- `description` 必须是非空字符串

推荐规范：

- 可共享的名称建议使用小写 ASCII 字符加连字符（例如 `tsx-helper`）
- 让 `description` 具体明确：同时包含 Skill **做什么**以及**何时**使用它（用户自然会提到的关键词）

### 可选：按文件路径限制 Skill（`paths:`）

对于仅对代码库特定部分相关的 Skill，可添加 `paths:` 字段列出 glob 模式。在工具调用触及匹配的文件之前，该 Skill 不会出现在模型的可用 Skills 列表中：

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

注意：

- Glob 模式相对于项目根目录使用 [picomatch](https://github.com/micromatch/picomatch) 进行匹配；项目根目录之外的文件永远不会触发激活。
- 路径限制的 Skill 一旦触及匹配的文件，**将在当前会话的剩余时间内保持激活状态**。新建会话，或编辑任意 Skill 文件触发的 `refreshCache`，会重置激活状态。
- `paths:` 仅限制**模型**的发现，且仅在 SkillTool 列表级别生效。你始终可以通过 `/<skill-name>` 或 `/skills` 选择器自行调用路径限制的 Skill —— 该用户路径会直接运行 Skill 主体，不受激活状态影响。但模型侧仍会保持限制，直到触及匹配的文件：斜杠调用**不会**解锁模型侧的激活，因此如果你希望模型在你的调用后继续链式执行（自行调用 `Skill { skill: ... }`），请先访问一个匹配该 Skill `paths:` 的文件。
- 允许将 `paths:` 与 `disable-model-invocation: true` 结合使用，但此时限制无效 —— 无论如何该 Skill 都对模型隐藏，因此路径激活永远不会将其展示给模型。

## 添加辅助文件

在 `SKILL.md` 旁创建其他文件：

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

在 `SKILL.md` 中引用这些文件：

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## 查看可用的 Skills

Qwen Code 会从以下位置发现 Skills：

- 个人 Skills：`~/.qwen/skills/`
- 项目 Skills：`.qwen/skills/`
- 扩展 Skills：由已安装扩展提供的 Skills

### 扩展 Skills

扩展可以提供自定义 Skills，在启用扩展后即可使用。这些 Skills 存储在扩展的 `skills/` 目录中，格式与个人和项目 Skills 相同。

安装并启用扩展后，扩展 Skills 会被自动发现并加载。

要查看哪些扩展提供了 Skills，请检查扩展的 `qwen-extension.json` 文件中的 `skills` 字段。

要查看可用的 Skills，可以直接询问 Qwen Code：

```text
What Skills are available?
```

> **注意 —— 模型视图与用户视图的区别。** 询问模型只会显示模型当前可见的 Skills。如果某个 Skill 使用了 `paths:`（见上文“可选：按文件路径限制 Skill”），在触及匹配文件之前，它不会出现在该列表中。完整列表始终可通过 `/skills` 斜杠命令和磁盘文件查看。

或者使用斜杠命令浏览完整列表（始终显示所有 Skills，包括尚未激活的路径限制 Skills）：

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

创建 Skill 后，通过提出与描述匹配的问题来测试它。

例如：如果你的描述中提到了“PDF 文件”：

```text
Can you help me extract text from this PDF?
```

如果请求匹配，模型会自主决定使用你的 Skill —— 你无需显式调用它。

## 调试 Skill

如果 Qwen Code 没有使用你的 Skill，请检查以下常见问题：

### 确保描述具体明确

过于模糊：

```yaml
description: Helps with documents
```

具体明确：

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

无效的 YAML 会导致 Skill 元数据无法正确加载。

```bash
cat SKILL.md | head -n 15
```

确保：

- 第 1 行为起始 `---`
- Markdown 内容前有结束 `---`
- YAML 语法正确（不使用制表符，缩进正确）

### 查看错误

以调试模式运行 Qwen Code 以查看 Skill 加载错误：

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

更改将在下次启动 Qwen Code 时生效。如果 Qwen Code 已在运行，请重启它以加载更新。

## 删除 Skill

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

一个 Skill 应只解决一项能力：

- 专注：“PDF 表单填写”、“Excel 分析”、“Git 提交信息”
- 过于宽泛：“文档处理”（应拆分为更小的 Skills）

### 编写清晰的描述

通过包含具体的触发词，帮助模型发现何时使用 Skills：

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### 与团队一起测试

- Skill 是否在预期时激活？
- 指令是否清晰？
- 是否缺少示例或边界情况？
