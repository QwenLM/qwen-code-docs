# Agent Skills

> 创建、管理和共享 Skill，以扩展 Qwen Code 的功能。

本指南介绍如何在 **Qwen Code** 中创建、使用和管理 Agent Skills。Skill 是一种模块化能力，通过包含指令（以及可选的脚本/资源）的有序文件夹来扩展模型的有效性。

## 前置条件

- Qwen Code（最新版本）
- 熟悉 Qwen Code 的基本操作（[快速入门](../quickstart.md)）

## 什么是 Agent Skills？

Agent Skills 将专业知识打包为可发现的能力。每个 Skill 包含一个 `SKILL.md` 文件，其中包含模型在相关时可加载的指令，以及可选的辅助文件（如脚本和模板）。

### Skill 的调用方式

Skill 采用**模型调用**机制——模型会根据你的请求和 Skill 的描述自主决定何时使用。这与斜杠命令不同，斜杠命令是**用户调用**的（你需要显式输入 `/command`）。

如果你想显式调用某个 Skill，请使用 `/skills` 斜杠命令：

```bash
/skills <skill-name>
```

使用自动补全功能浏览可用的 Skill 及其描述。

### 优势

- 针对你的工作流扩展 Qwen Code
- 通过 git 在团队内共享专业知识
- 减少重复的提示词输入
- 组合多个 Skill 以处理复杂任务

## 创建 Skill

Skill 以包含 `SKILL.md` 文件的目录形式存储。

### 个人 Skill

个人 Skill 可在你的所有项目中使用。将它们存储在 `~/.qwen/skills/` 中：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

个人 Skill 适用于：

- 个人工作流和偏好
- 正在开发中的 Skill
- 个人效率辅助工具

### 项目 Skill

项目 Skill 可与你的团队共享。将它们存储在项目的 `.qwen/skills/` 目录中：

```bash
mkdir -p .qwen/skills/my-skill-name
```

项目 Skill 适用于：

- 团队工作流和规范
- 项目特定的专业知识
- 共享的工具和脚本

项目 Skill 可以提交到 git，并自动对团队成员可用。

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

- `name` 为非空字符串
- `description` 为非空字符串

推荐规范（目前非强制）：

- `name` 使用小写字母、数字和连字符
- `description` 需具体明确：同时包含 Skill 的**功能**以及**使用场景**（用户自然会提及的关键词）

## 添加辅助文件

在 `SKILL.md` 同级创建其他文件：

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

## 查看可用的 Skill

Qwen Code 会从以下位置发现 Skill：

- 个人 Skill：`~/.qwen/skills/`
- 项目 Skill：`.qwen/skills/`
- 扩展 Skill：由已安装的扩展提供的 Skill

### 扩展 Skill

扩展可以提供自定义 Skill，在启用扩展后即可使用。这些 Skill 存储在扩展的 `skills/` 目录中，格式与个人和项目 Skill 相同。

安装并启用扩展后，扩展 Skill 会被自动发现并加载。

要查看哪些扩展提供了 Skill，请检查扩展的 `qwen-extension.json` 文件中的 `skills` 字段。

要查看可用的 Skill，可以直接询问 Qwen Code：

```text
What Skills are available?
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

如果请求匹配，模型会自主决定使用你的 Skill——你无需显式调用它。

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

- 个人 Skill：`~/.qwen/skills/<skill-name>/SKILL.md`
- 项目 Skill：`.qwen/skills/<skill-name>/SKILL.md`

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

- 第 1 行为开头的 `---`
- Markdown 内容前有结尾的 `---`
- 有效的 YAML 语法（不使用制表符，缩进正确）

### 查看错误信息

以调试模式运行 Qwen Code 以查看 Skill 加载错误：

```bash
qwen --debug
```

## 与团队共享 Skill

你可以通过项目仓库共享 Skill：

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
- 过于宽泛：“文档处理”（应拆分为更小的 Skill）

### 编写清晰的描述

通过包含具体的触发词，帮助模型发现何时该使用 Skill：

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### 与团队共同测试

- Skill 是否在预期情况下被触发？
- 指令是否清晰？
- 是否缺少示例或边界情况？