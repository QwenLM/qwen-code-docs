# 智能体技能

> 创建、管理和共享技能，以扩展 Qwen Code 的能力。

本指南将介绍如何在 **Qwen Code** 中创建、使用和管理智能体技能。技能是通过包含指令（以及可选的脚本/资源）的文件夹来模块化扩展模型能力的组件。

## 前提条件

- Qwen Code（最新版本）
- 熟悉 Qwen Code 的基本使用（[快速入门](../quickstart.md)）

## 什么是智能体技能？

智能体技能将专业知识封装为可发现的能力。每个技能包含一个 `SKILL.md` 文件，其中包含模型在相关时可以加载的指令，以及可选的辅助文件（如脚本和模板）。

### 技能如何被调用

技能是**模型调用的**——模型会根据你的请求和技能描述自主决定何时使用它们。这与斜杠命令不同，斜杠命令是**用户调用的**（你显式输入 `/command`）。

如果你想显式调用某个技能，可以使用 `/skills` 斜杠命令：

```bash
/skills <技能名称>
```

使用自动补全功能浏览可用的技能及其描述。

### 优势

- 为你的工作流程扩展 Qwen Code
- 通过 git 在团队间共享专业知识
- 减少重复性提示
- 组合多个技能以完成复杂任务

## 创建技能

技能以包含 `SKILL.md` 文件的目录形式存储。

### 个人技能

个人技能在你的所有项目中都可使用。将它们存储在 `~/.qwen/skills/` 目录下：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

个人技能的用途：

- 你自己的专属工作流程和偏好
- 正在开发的技能
- 个人效率工具

### 项目技能

项目技能可与你的团队共享。将它们存储在你的项目中的 `.qwen/skills/` 目录下：

```bash
mkdir -p .qwen/skills/my-skill-name
```

项目技能的用途：

- 团队工作流程和规范
- 项目特定的专业知识
- 共享的实用工具和脚本

项目技能可以提交到 git 仓库，并自动提供给团队成员使用。

## 编写 `SKILL.md`

创建一个包含 YAML 前置内容和 Markdown 内容的 `SKILL.md` 文件：

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

- `name` 是一个非空字符串，匹配正则表达式 `/^[\p{L}\p{N}_:.-]+$/u`——Unicode 字母和数字（中文字符、西里尔字母、带重音拉丁字母均可用），以及 `_`、`:`、`.`、`-`。空格、斜杠、方括号和其他结构上不安全的字符将在解析时被拒绝。
- `description` 是一个非空字符串
- `priority` 是可选的。如果存在，必须是有限数值。值越大，在 `/skills` 列表中排序越靠前——这仅影响 `/skills` 命令的列出顺序。斜杠命令的补全（输入 `/`）和 `/help` 自定义命令视图保持字母顺序，因此高优先级技能不会重新排序内置命令。省略或无效的值被视为未设置，行为类似于 `0`。

推荐约定：

- 对于可共享的名称，优先使用小写 ASCII 字母和连字符（例如 `tsx-helper`）
- 使 `description` 具体：同时包含技能**做什么**和**何时使用**（用户自然会提到的关键词）
- 谨慎使用 `priority`，仅用于那些希望在 `/skills` 中可靠地出现在默认字母顺序之前的技能。允许使用负优先级，它们将排在未设置优先级的技能之后。

### 可选：根据文件路径限制技能（`paths:`）

对于仅与代码库中特定部分相关的技能，添加一个 `paths:` 列表，包含 glob 模式。在工具调用访问到匹配的文件之前，该技能不会出现在模型的可用技能列表中：

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

- glob 模式相对于项目根目录进行匹配（使用 [picomatch](https://github.com/micromatch/picomatch)）；项目根目录之外的文件永远不会触发激活。
- 一旦访问到匹配的文件，路径限制的技能**在当前会话的剩余时间内保持激活状态**。新会话或编辑任何技能文件触发的 `refreshCache` 会重置激活状态。
- `paths:` 仅限制**模型**的发现，且仅在 SkillTool 列出层面。除非设置了 `user-invocable: false`，你始终可以通过 `/<skill-name>` 或 `/skills` 选择器自行调用路径限制的技能——用户路径会无视激活状态执行技能内容。但模型端仍然保持受限，直到访问到匹配的文件：斜杠调用**不会**解锁模型端的激活，因此如果你希望模型在你调用后进行链式调用（自己调用 `Skill { skill: ... }`），还需要先访问一个匹配技能 `paths:` 的文件。
- 允许同时使用 `paths:` 和 `disable-model-invocation: true`，但限制条件无效——无论如何技能都不会对模型可见，因此路径激活不会将其公开。

### 可选：控制用户和模型调用

默认情况下，技能对用户可调用。要隐藏技能使其不能通过直接斜杠命令使用，但保持对模型可调用，设置 `user-invocable: false`：

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

这会将技能从 `/<skill-name>` 调用和 `/skills` 选择器结果中移除。但它不会对模型隐藏技能。

要隐藏技能使其不被模型调用，但保持对用户直接调用可用，设置 `disable-model-invocation: true`：

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

你可以同时使用这两个字段，但此时技能无法通过正常的用户或模型调用路径访问。

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

在 `SKILL.md` 中引用这些文件：

````markdown
关于高级用法，请参阅 [reference.md](reference.md)。

运行辅助脚本：

```bash
python scripts/helper.py input.txt
```
````

## 查看可用技能

Qwen Code 从以下位置发现技能：

- 个人技能：`~/.qwen/skills/`
- 项目技能：`.qwen/skills/`
- 扩展技能：已安装的扩展提供的技能

### 扩展技能

扩展可以提供自定义技能，当扩展启用时这些技能变为可用。这些技能存储在扩展的 `skills/` 目录中，遵循与个人和项目技能相同的格式。

扩展技能在扩展安装并启用后自动被发现和加载。

要查看哪些扩展提供技能，请检查扩展的 `qwen-extension.json` 文件中是否有 `skills` 字段。

要查看可用技能，可以直接向 Qwen Code 提问：

```text
有哪些技能可用？
```

> **注意——模型视角与用户视角不同。** 向模型提问只会显示模型当前能看到的技能。如果某个技能使用了 `paths:`（见上文“可选：根据文件路径限制技能”），则在访问到匹配文件之前，该技能不会出现在列表中。`/skills` 斜杠命令显示你可以直接调用的技能；`user-invocable: false` 的技能在磁盘上仍然可见，并且可能仍然对模型可见。

或者使用斜杠命令浏览用户可调用的列表（包括尚未激活的路径限制技能）：

```text
/skills
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

创建一个技能后，通过提出与你的描述相匹配的问题来测试它。

例如，如果你的描述提到了“PDF 文件”：

```text
你能帮我从这个 PDF 中提取文本吗？
```

如果请求匹配，模型会自主决定使用你的技能——你不需要显式调用它。

## 调试技能

如果 Qwen Code 没有使用你的技能，请检查以下常见问题：

### 使描述更具体

过于模糊：

```yaml
description: Helps with documents
```

具体的描述：

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
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

无效 YAML 会导致技能元数据无法正确加载。

```bash
cat SKILL.md | head -n 15
```

确保：

- 第 1 行有开头的 `---`
- 在 Markdown 内容之前有结束的 `---`
- YAML 语法有效（无制表符，正确缩进）

### 查看错误

以调试模式运行 Qwen Code，查看技能加载时的错误：

```bash
qwen --debug
```

## 与你的团队共享技能

你可以通过项目仓库共享技能：

1. 将技能添加到 `.qwen/skills/` 目录下
2. 提交并推送
3. 团队成员拉取变更

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## 更新技能

直接编辑 `SKILL.md` 文件：

```bash
# 个人技能
code ~/.qwen/skills/my-skill/SKILL.md

# 项目技能
code .qwen/skills/my-skill/SKILL.md
```

更改将在下次启动 Qwen Code 时生效。如果 Qwen Code 正在运行，请重启以加载更新。

## 删除技能

删除技能目录：

```bash
# 个人技能
rm -rf ~/.qwen/skills/my-skill

# 项目技能
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## 最佳实践

### 保持技能聚焦

每个技能应该关注一个能力：

- 聚焦的：“PDF 表单填写”、“Excel 分析”、“Git 提交信息”
- 过于宽泛的：“文档处理”（应拆分为更小的技能）

### 编写清晰的描述

帮助模型发现何时使用技能，包含具体的触发词：

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### 与团队一起测试

- 技能是否在预期情况下激活？
- 指令是否清晰？
- 是否缺少示例或边缘情况？