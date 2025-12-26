# Agent 技能（实验性）

> 创建、管理和共享技能以扩展 Qwen Code 的功能。

本指南展示了如何在 **Qwen Code** 中创建、使用和管理 Agent 技能。技能是模块化的能力，通过包含指令（以及可选的脚本/资源）的组织化文件夹来扩展模型的有效性。

> [!note]
>
> 技能目前是 **实验性** 的，必须使用 `--experimental-skills` 启用。

## 先决条件

- Qwen Code（最新版本）
- 使用实验标志启用运行：

```bash
qwen --experimental-skills
```

- 基本熟悉 Qwen Code（[快速开始](../quickstart.md)）

## 什么是 Agent 技能？

Agent 技能将专业知识打包成可发现的能力。每个技能由一个 `SKILL.md` 文件组成，包含模型在相关时可以加载的指令，以及可选的脚本和模板等支持文件。

### Skills 如何被调用

Skills 是**模型调用的** —— 模型根据你的请求和 Skill 的描述自主决定何时使用它们。这与 slash 命令不同，slash 命令是**用户调用的**（你明确输入 `/command`）。

### 优势

- 扩展 Qwen Code 以适应你的工作流程
- 通过 git 在团队中分享专业知识
- 减少重复的提示
- 组合多个 Skills 来处理复杂任务

## 创建一个 Skill

Skills 以包含 `SKILL.md` 文件的目录形式存储。

### 个人 Skills

个人 Skills 在你的所有项目中都可用。将它们存储在 `~/.qwen/skills/` 中：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

在以下情况下使用个人 Skills：

- 你的个人工作流程和偏好
- 你正在开发的实验性 Skills
- 个人生产力助手

### 项目技能

项目技能与你的团队共享。将它们存储在项目中的 `.qwen/skills/` 目录下：

```bash
mkdir -p .qwen/skills/my-skill-name
```

使用项目技能来：

- 团队工作流程和规范
- 项目特定的专业知识
- 共享的工具和脚本

项目技能可以提交到 git 中，并自动对团队成员可用。

## 编写 `SKILL.md`

创建一个包含 YAML frontmatter 和 Markdown 内容的 `SKILL.md` 文件：

```yaml
---
name: your-skill-name
description: 简要描述此技能的作用以及何时使用它
---

# 你的技能名称

## 指令
为 Qwen Code 提供清晰的逐步指导。

## 示例
展示使用此技能的具体示例。
```

### 字段要求

Qwen Code 目前验证以下内容：

- `name` 是非空字符串
- `description` 是非空字符串

推荐约定（尚未严格强制执行）：

- 在 `name` 中使用小写字母、数字和连字符
- 使 `description` 具体化：包含技能**做什么**以及**何时**使用它（用户自然会提到的关键词）

## 添加支持文件

在 `SKILL.md` 旁边创建其他文件：

```text
my-skill/
├── SKILL.md (必需)
├── reference.md (可选文档)
├── examples.md (可选示例)
├── scripts/
│   └── helper.py (可选工具)
└── templates/
    └── template.txt (可选模板)
```

从 `SKILL.md` 中引用这些文件：

````markdown
有关高级用法，请参见 [reference.md](reference.md)。

运行辅助脚本：

```bash
python scripts/helper.py input.txt
```
````

## 查看可用的 Skills

当启用 `--experimental-skills` 时，Qwen Code 会从以下位置发现 Skills：

- 个人 Skills：`~/.qwen/skills/`
- 项目 Skills：`.qwen/skills/`

要查看可用的 Skills，直接询问 Qwen Code：

```text
有哪些 Skills 可用？
```

或者检查文件系统：

```bash

# 列出个人 Skills
ls ~/.qwen/skills/

# 列出项目 Skills（如果在项目目录中）
ls .qwen/skills/

# 查看特定 Skill 的内容
cat ~/.qwen/skills/my-skill/SKILL.md
```

## 测试一个 Skill

创建 Skill 后，通过提出与你的描述匹配的问题来测试它。

示例：如果你的描述中提到了"PDF 文件"：

```text
你能帮我从这个 PDF 中提取文本吗？
```

如果匹配请求，模型会自主决定使用你的 Skill — 你不需要显式调用它。

## 调试一个 Skill

如果 Qwen Code 没有使用你的 Skill，请检查这些常见问题：

### 使描述具体化

过于模糊：

```yaml
description: Helps with documents
```

具体化：

```yaml
description: 从 PDF 文件中提取文本和表格，填写表单，合并文档。在处理 PDF、表单或文档提取时使用。
```

### 验证文件路径

- 个人技能: `~/.qwen/skills/<skill-name>/SKILL.md`
- 项目技能: `.qwen/skills/<skill-name>/SKILL.md`

```bash

# 个人
ls ~/.qwen/skills/my-skill/SKILL.md

# 项目
ls .qwen/skills/my-skill/SKILL.md
```

### 检查 YAML 语法

无效的 YAML 会导致技能元数据无法正确加载。

```bash
cat SKILL.md | head -n 15
```

确保：

- 第 1 行有开头的 `---`
- Markdown 内容之前有结尾的 `---`
- 有效的 YAML 语法（无制表符，正确的缩进）

### 查看错误

使用调试模式运行 Qwen Code 以查看技能加载错误：

```bash
qwen --experimental-skills --debug
```

## 与团队共享 Skills

你可以通过项目仓库共享 Skills：

1. 在 `.qwen/skills/` 下添加 Skill
2. 提交并推送
3. 团队成员拉取更改并使用 `--experimental-skills` 运行

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## 更新 Skill

直接编辑 `SKILL.md`：

```bash

# 个人 Skill
code ~/.qwen/skills/my-skill/SKILL.md

# 项目 Skill
code .qwen/skills/my-skill/SKILL.md
```

更改在下次启动 Qwen Code 时生效。如果 Qwen Code 已在运行，请重启以加载更新。

## 移除 Skill

删除 Skill 目录：

```bash

# 个人
rm -rf ~/.qwen/skills/my-skill

# 项目
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## 最佳实践

### 保持 Skills 专注

一个 Skill 应该专注于一个能力：

- 专注： "PDF 表单填写"、"Excel 分析"、"Git 提交信息"
- 过于宽泛： "文档处理"（拆分为更小的 Skills）

### 编写清晰的描述

通过包含特定触发条件来帮助模型发现何时使用 Skills：

```yaml
description: 分析 Excel 电子表格，创建数据透视表，生成图表。在处理 Excel 文件、电子表格或 .xlsx 数据时使用。
```

### 与团队进行测试

- Skill 是否在预期时激活？
- 指令是否清晰？
- 是否缺少示例或边界情况？