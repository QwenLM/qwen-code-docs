# Agent 技能

> 创建、管理和共享技能，以扩展 Qwen Code 的能力。

本指南将介绍如何在 **Qwen Code** 中创建、使用和管理 Agent 技能。技能是模块化的功能单元，通过包含指令（以及可选的脚本/资源）的结构化文件夹来增强模型的能力。

## 前提条件

- Qwen Code（较新版本）
- 对 Qwen Code 有基本了解（[快速入门](../quickstart.md)）

## 什么是 Agent 技能？

Agent 技能将专业知识封装为可发现的功能。每个技能均由一个 `SKILL.md` 文件构成，其中包含模型在相关场景下可加载的指令；此外还可包含脚本、模板等可选支持文件。

### 技能的调用方式

技能是**由模型调用的**——模型会根据你的请求及技能的描述，自主决定是否调用该技能。这与斜杠命令（slash command）不同，后者是**由用户调用的**（你需要显式输入 `/command`）。

如需显式调用某个技能，请使用 `/skills` 斜杠命令：

```bash
/skills <skill-name>
```

可利用自动补全功能浏览当前可用的技能及其描述。

### 优势

- 扩展 Qwen Code 以适配你的工作流  
- 通过 Git 在团队内共享专业知识  
- 减少重复性提示词编写  
- 组合多个技能完成复杂任务  

## 创建一个技能

技能以目录形式存储，每个目录中需包含一个 `SKILL.md` 文件。

### 个人技能

个人技能在你所有的项目中均可使用，应存放在 `~/.qwen/skills/` 目录下：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

适用于以下场景：

- 你个人的工作流和偏好设置  
- 正在开发中的技能  
- 个人提效辅助工具

### 项目技能

项目技能可供团队成员共享。请将它们存放在项目目录下的 `.qwen/skills/` 文件夹中：

```bash
mkdir -p .qwen/skills/my-skill-name
```

项目技能适用于以下场景：

- 团队工作流与规范  
- 项目专属的专业知识  
- 共享的工具与脚本  

项目技能可提交至 Git 仓库，团队成员将自动获得这些技能。

## 编写 `SKILL.md`

创建一个包含 YAML 前置元数据和 Markdown 内容的 `SKILL.md` 文件：

```yaml
---
name: your-skill-name
description: 简要说明该技能的作用及适用场景
---

# 你的技能名称

## 使用说明
为 Qwen Code 提供清晰、分步的操作指引。

## 示例
展示该技能的具体使用示例。
```

### 字段要求

Qwen Code 当前验证以下字段：

- `name` 为非空字符串
- `description` 为非空字符串

推荐的命名规范（目前尚未强制执行）：

- `name` 中仅使用小写字母、数字和短横线（`-`）
- `description` 应具体明确：需同时说明该 Skill **做什么**，以及 **何时使用**（即用户自然会提及的关键字）

## 添加辅助文件

在 `SKILL.md` 同级目录下创建其他辅助文件：

```text
my-skill/
├── SKILL.md（必需）
├── reference.md（可选文档）
├── examples.md（可选示例）
├── scripts/
│   └── helper.py（可选工具脚本）
└── templates/
    └── template.txt（可选模板）
```

在 `SKILL.md` 中引用这些文件：

````markdown
高级用法请参阅 [reference.md](reference.md)。

运行辅助脚本：

```bash
python scripts/helper.py input.txt
```
````

## 查看可用的技能

Qwen Code 会从以下位置发现技能：

- 个人技能：`~/.qwen/skills/`
- 项目技能：`.qwen/skills/`
- 扩展技能：由已安装扩展提供的技能

### 扩展技能

扩展可以提供自定义技能，当该扩展启用时，这些技能即可使用。这些技能存放在扩展的 `skills/` 目录中，其格式与个人技能和项目技能相同。

扩展技能会在扩展安装并启用后自动被发现并加载。

要查看哪些扩展提供了技能，请检查该扩展的 `qwen-extension.json` 文件中是否存在 `skills` 字段。

要查看当前可用的技能，可直接向 Qwen Code 提问：

```text
有哪些可用的技能？
```

或者手动检查文件系统：

```bash

# 列出个人技能
ls ~/.qwen/skills/

# 列出项目技能（需位于项目目录内）
ls .qwen/skills/

# 查看某个具体技能的内容
cat ~/.qwen/skills/my-skill/SKILL.md
```

## 测试技能

创建技能后，可通过提出与技能描述相匹配的问题来测试它。

例如：如果您的描述中提到了“PDF 文件”：

```text
你能帮我从这个 PDF 中提取文本吗？
```

模型会自主判断是否调用您的技能——您无需显式触发它。

## 调试技能

如果 Qwen Code 未使用您的技能，请检查以下常见问题：

### 描述需具体明确

过于笼统：

```yaml
description: 帮助处理文档
```

具体明确：

```yaml
description: 从 PDF 文件中提取文本和表格、填写表单、合并文档。当处理 PDF、表单或文档提取任务时使用。
```

### 验证文件路径

- 个人技能：`~/.qwen/skills/<skill-name>/SKILL.md`
- 项目技能：`.qwen/skills/<skill-name>/SKILL.md`

```bash

# 个人技能
ls ~/.qwen/skills/my-skill/SKILL.md

# 项目技能
ls .qwen/skills/my-skill/SKILL.md
```

### 检查 YAML 语法

无效的 YAML 会导致 Skill 元数据无法正确加载。

```bash
cat SKILL.md | head -n 15
```

请确保：

- 第 1 行以 `---` 开头  
- 在 Markdown 内容之前以 `---` 结束  
- YAML 语法有效（不使用制表符，缩进正确）

### 查看错误

以调试模式运行 Qwen Code，以查看 Skill 加载错误：

```bash
qwen --debug
```

## 与团队共享 Skills

可通过项目仓库共享 Skills：

1. 将 Skill 添加到 `.qwen/skills/` 目录下  
2. 提交并推送更改  
3. 团队成员拉取更新  

```bash
git add .qwen/skills/
git commit -m "为 PDF 处理添加团队 Skill"
git push
```

## 更新一个 Skill

直接编辑 `SKILL.md` 文件：

```bash

# 个人 Skill
code ~/.qwen/skills/my-skill/SKILL.md

# 项目 Skill
code .qwen/skills/my-skill/SKILL.md
```

更改将在下次启动 Qwen Code 时生效。如果 Qwen Code 已在运行，请重启它以加载更新。

## 移除一个 Skill

删除 Skill 对应的目录：  

```bash

# 个人
rm -rf ~/.qwen/skills/my-skill

# 项目
rm -rf .qwen/skills/my-skill
git commit -m "移除未使用的 Skill"
```

## 最佳实践

### 让 Skill 聚焦明确

一个 Skill 应仅实现一项能力：

- 聚焦明确：例如“PDF 表单填写”、“Excel 数据分析”、“生成 Git 提交信息”
- 过于宽泛：例如“文档处理”（应拆分为多个更小的 Skill）

### 编写清晰的描述

通过在描述中包含具体触发条件，帮助模型判断何时调用该 Skill：

```yaml
description: 分析 Excel 表格、创建数据透视表并生成图表。当处理 Excel 文件、电子表格或 .xlsx 格式数据时使用。
```

### 与团队共同测试

- 该 Skill 是否在预期场景下被正确激活？
- 指令是否清晰易懂？
- 是否遗漏了某些示例或边界情况？