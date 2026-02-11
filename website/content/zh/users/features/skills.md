# 代理技能

> 创建、管理和共享技能以扩展 Qwen Code 的功能。

本指南将向你展示如何在 **Qwen Code** 中创建、使用和管理代理技能。技能是模块化的功能，通过包含指令（以及可选的脚本/资源）的组织化文件夹来扩展模型的有效性。

## 先决条件

- Qwen Code（最新版本）
- 基本熟悉 Qwen Code（[快速开始](../quickstart.md)）

## 什么是代理技能？

代理技能将专业知识打包成可发现的功能。每个技能包含一个 `SKILL.md` 文件，其中包含模型在相关时可以加载的指令，以及可选的脚本和模板等支持文件。

### 技能如何被调用

技能是**模型调用的**——模型根据你的请求和技能描述自主决定何时使用它们。这与斜杠命令不同，斜杠命令是**用户调用的**（你明确输入 `/command`）。

如果你想显式调用某个技能，请使用 `/skills` 斜杠命令：

```bash
/skills <skill-name>
```

使用自动补全来浏览可用的技能和描述。

### 优势

- 扩展 Qwen Code 以适应你的工作流程
- 通过 git 在团队间共享专业知识
- 减少重复的提示
- 组合多个技能处理复杂任务

## 创建技能

技能存储为包含 `SKILL.md` 文件的目录。

### 个人技能

个人技能在所有项目中都可用。将它们存储在 `~/.qwen/skills/` 中：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

个人技能适用于：

- 你的个人工作流程和偏好
- 你正在开发的技能
- 个人生产力助手

### 项目技能

项目技能与你的团队共享。将它们存储在项目内的 `.qwen/skills/` 目录中：

```bash
mkdir -p .qwen/skills/my-skill-name
```

使用项目技能来：

- 团队工作流程和规范
- 项目特定的专业知识
- 共享的工具和脚本

项目技能可以提交到 git 中，并自动对团队成员可用。

## 编写 `SKILL.md`

创建一个包含 YAML 前置内容和 Markdown 内容的 `SKILL.md` 文件：

```yaml
---
name: your-skill-name
description: 简要描述此技能的作用以及何时使用它
---

# 你的技能名称

## 指令
为 Qwen Code 提供清晰、逐步的指导。

## 示例
展示使用此技能的具体示例。
```

### 字段要求

Qwen Code 目前验证以下内容：

- `name` 是非空字符串
- `description` 是非空字符串

推荐约定（尚未严格强制执行）：

- 在 `name` 中使用小写字母、数字和连字符
- 使 `description` 具体化：包括技能的**功能**以及**何时**使用它（用户自然会提到的关键词）

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

从 `SKILL.md` 引用这些文件：

````markdown
有关高级用法，请参见 [reference.md](reference.md)。

运行辅助脚本：

```bash
python scripts/helper.py input.txt
```
````

## 查看可用的技能

Qwen Code 从以下位置发现技能：

- 个人技能：`~/.qwen/skills/`
- 项目技能：`.qwen/skills/`
- 扩展技能：由已安装扩展提供的技能

### 扩展技能

扩展可以提供自定义技能，在扩展启用时变得可用。这些技能存储在扩展的 `skills/` 目录中，并遵循与个人和项目技能相同的格式。

当扩展安装并启用时，扩展技能会被自动发现和加载。

要查看哪些扩展提供技能，请检查扩展的 `qwen-extension.json` 文件中的 `skills` 字段。

要查看可用的技能，直接询问 Qwen Code：

```text
有哪些可用的技能？
```

或者检查文件系统：

```bash

# 列出个人技能
ls ~/.qwen/skills/

# 列出项目技能（如果在项目目录中）
ls .qwen/skills/

# 查看特定技能的内容
cat ~/.qwen/skills/my-skill/SKILL.md
```

## 测试技能

创建技能后，通过提出与描述匹配的问题来测试它。

例如：如果您的描述中提到了“PDF 文件”：

```text
你能帮我从这个 PDF 中提取文本吗？
```

模型会自主决定是否使用您的技能（如果与请求匹配）——您无需显式调用它。

## 调试技能

如果 Qwen Code 没有使用您的技能，请检查这些常见问题：

### 使描述具体化

过于模糊：

```yaml
description: 帮助处理文档
```

具体：

```yaml
description: 从 PDF 文件中提取文本和表格、填写表单、合并文档。在处理 PDF、表单或文档提取时使用。
```

### 验证文件路径

- 个人技能：`~/.qwen/skills/<skill-name>/SKILL.md`
- 项目技能：`.qwen/skills/<skill-name>/SKILL.md`

```bash

# 个人
ls ~/.qwen/skills/my-skill/SKILL.md

# 项目
ls .qwen/skills/my-skill/SKILL.md
```

### 检查 YAML 语法

无效的 YAML 会导致 Skill 元数据无法正确加载。

```bash
cat SKILL.md | head -n 15
```

确保：

- 第 1 行有开头的 `---`
- Markdown 内容之前有结尾的 `---`
- 有效的 YAML 语法（无制表符，正确的缩进）

### 查看错误

以调试模式运行 Qwen Code 来查看 Skill 加载错误：

```bash
qwen --debug
```

## 与团队共享 Skills

你可以通过项目仓库共享 Skills：

1. 在 `.qwen/skills/` 下添加 Skill
2. 提交并推送
3. 团队成员拉取更改

```bash
git add .qwen/skills/
git commit -m "为 PDF 处理添加团队 Skill"
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

更改在下次启动 Qwen Code 时生效。如果 Qwen Code 已在运行，请重启它来加载更新。

## 移除 Skill

删除 Skill 目录：

```bash

# 个人
rm -rf ~/.qwen/skills/my-skill

# 项目
rm -rf .qwen/skills/my-skill
git commit -m "移除未使用的技能"
```

## 最佳实践

### 让技能保持专注

一个技能应该专注于一种能力：

- 专注： "PDF 表单填写"、"Excel 分析"、"Git 提交信息"
- 过于宽泛： "文档处理"（拆分为更小的技能）

### 编写清晰的描述

通过包含特定触发器来帮助模型发现何时使用技能：

```yaml
description: 分析 Excel 电子表格，创建透视表并生成图表。在处理 Excel 文件、电子表格或 .xlsx 数据时使用。
```

### 与团队进行测试

- 技能在预期情况下激活吗？
- 指令是否清晰？
- 是否缺少示例或边界情况？