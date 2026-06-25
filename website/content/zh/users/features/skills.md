# Agent Skills

> 创建、管理和共享 Skills，扩展 Qwen Code 的能力。

本指南介绍如何在 **Qwen Code** 中创建、使用和管理 Agent Skills。Skills 是模块化的能力单元，通过包含指令（以及可选的脚本/资源）的有组织目录来增强模型的效能。

## 前提条件

- Qwen Code（最新版本）
- 熟悉 Qwen Code 基础用法（[快速入门](../quickstart.md)）

## 什么是 Agent Skills？

Agent Skills 将专业知识打包成可发现的能力单元。每个 Skill 由一个 `SKILL.md` 文件组成，其中包含模型在适当时机可加载的指令，以及可选的脚本和模板等支持文件。

### Skills 的调用方式

Skills 是**模型调用**的 — 模型根据你的请求和 Skill 的描述自主决定何时使用它。这与 slash 命令不同，slash 命令是**用户调用**的（你需要显式输入 `/command`）。

如果你想显式调用某个 Skill，可以使用 `/skills` slash 命令：

```bash
/skills <skill-name>
```

使用自动补全浏览可用的 Skills 和描述。

### 优势

- 为你的工作流扩展 Qwen Code
- 通过 git 在团队中共享专业知识
- 减少重复性提示
- 组合多个 Skills 完成复杂任务

## 创建 Skill

Skills 以包含 `SKILL.md` 文件的目录形式存储。

### 个人 Skills

个人 Skills 在你所有的项目中均可使用。将它们存储在 `~/.qwen/skills/`：

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

个人 Skills 适用于：

- 你个人的工作流和偏好
- 正在开发中的 Skills
- 个人生产力辅助工具

### 项目 Skills

项目 Skills 与团队共享。将它们存储在项目根目录下的 `.qwen/skills/`：

```bash
mkdir -p .qwen/skills/my-skill-name
```

项目 Skills 适用于：

- 团队工作流和规范
- 项目专属知识
- 共享工具和脚本

项目 Skills 可以提交到 git，并自动对团队成员生效。

## 编写 `SKILL.md`

创建包含 YAML frontmatter 和 Markdown 内容的 `SKILL.md` 文件：

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

Qwen Code 目前验证以下内容：

- `name` 是非空字符串，需匹配 `/^[\p{L}\p{N}_:.-]+$/u` — 支持 Unicode 字母和数字（CJK / 西里尔 / 带重音的拉丁字母均可），以及 `_`、`:`、`.`、`-`。空格、斜杠、括号及其他结构上不安全的字符在解析时会被拒绝。
- `description` 是非空字符串
- `priority` 是可选的。如果存在，必须是有限数字。较大的值仅在 `/skills` 列表中排序靠前 — slash 命令补全（输入 `/`）和 `/help` 自定义命令视图保持字母顺序，因此高优先级 Skill 不会改变内置命令的排序。省略或无效值视为未设置，行为等同于 `0`。

推荐约定：

- 对于可共享的名称，优先使用小写 ASCII 字母加连字符（如 `tsx-helper`）
- 使 `description` 具体化：同时包含 Skill **做什么**和**何时使用**（用户自然会提到的关键词）
- 谨慎使用 `priority`，仅用于需要在 `/skills` 默认字母排序之前可靠出现的 Skills。允许负优先级，排序低于未设置的 Skills。

### 可选：通过文件路径限制 Skill（`paths:`）

对于只与代码库特定部分相关的 Skills，可以添加 `paths:` glob 模式列表。在工具调用触及匹配文件之前，该 Skill 不会出现在模型的可用 Skills 列表中：

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

- Glob 使用 [picomatch](https://github.com/micromatch/picomatch) 相对于项目根目录进行匹配；项目根目录之外的文件不会触发激活。
- 路径限制的 Skill 一旦有匹配文件被触及，**在整个会话期间保持激活状态**。新会话或编辑任意 Skill 文件触发的 `refreshCache` 会重置激活状态。
- `paths:` 仅限制**模型**发现，且仅在 SkillTool 列表层面生效。除非设置了 `user-invocable: false`，你始终可以通过 `/<skill-name>` 或 `/skills` 选择器自行调用路径限制的 Skill — 该用户路径会直接运行 Skill 内容，不受激活状态影响。但模型侧在匹配文件被触及之前仍处于限制状态：slash 调用**不会**解锁模型侧激活，因此如果你希望模型在你调用后继续链式调用（自行调用 `Skill { skill: ... }`），还需要先访问一个匹配该 Skill `paths:` 的文件。
- 将 `paths:` 与 `disable-model-invocation: true` 组合是允许的，但限制门控不会生效 — Skill 本就对模型隐藏，路径激活不会向模型公布它。

### 可选：控制用户和模型的调用方式

Skills 默认对用户可调用。若要对直接 slash 命令调用隐藏某个 Skill，同时保持模型可调用，设置 `user-invocable: false`：

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

这会将该 Skill 从 `/<skill-name>` 调用和 `/skills` 选择器结果中移除，但不会对模型隐藏。

若要对模型调用隐藏某个 Skill，同时保持用户直接调用可用，设置 `disable-model-invocation: true`：

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

你可以同时设置两个字段，但这样该 Skill 将无法通过正常的用户或模型调用路径访问。

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
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## 查看可用 Skills

Qwen Code 从以下位置发现 Skills：

- 个人 Skills：`~/.qwen/skills/`
- 项目 Skills：`.qwen/skills/`
- 扩展 Skills：已安装扩展提供的 Skills

### 扩展 Skills

扩展可以提供自定义 Skills，在扩展启用时自动可用。这些 Skills 存储在扩展的 `skills/` 目录中，格式与个人和项目 Skills 相同。

扩展 Skills 在安装并启用扩展时自动被发现和加载。

要查看哪些扩展提供了 Skills，检查扩展的 `qwen-extension.json` 文件中的 `skills` 字段。

直接询问 Qwen Code 查看可用 Skills：

```text
What Skills are available?
```

> **注意 — 模型视图与用户视图的区别。** 询问模型只会显示模型当前能看到的 Skills。如果某个 Skill 使用了 `paths:`（见上方”可选：通过文件路径限制 Skill”），在匹配文件被触及之前不会出现在该列表中。`/skills` slash 命令显示你可以直接调用的 Skills；设置了 `user-invocable: false` 的 Skills 在磁盘上仍然可见，且模型可能仍能看到。

或使用 slash 命令浏览用户可调用列表（包括尚未激活的路径限制 Skills）：

```text
/skills
```

或直接检查文件系统：

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills (if in a project directory)
ls .qwen/skills/

# View a specific Skill's content
cat ~/.qwen/skills/my-skill/SKILL.md
```

## 测试 Skill

创建 Skill 后，通过提问与描述匹配的问题来测试它。

示例：如果你的描述中提到”PDF 文件”：

```text
Can you help me extract text from this PDF?
```

如果请求与 Skill 匹配，模型会自主决定使用你的 Skill — 无需显式调用。

## 调试 Skill

如果 Qwen Code 没有使用你的 Skill，检查以下常见问题：

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

无效的 YAML 会导致 Skill 元数据无法正确加载。

```bash
cat SKILL.md | head -n 15
```

确保：

- 第 1 行有开头的 `---`
- Markdown 内容前有结尾的 `---`
- 有效的 YAML 语法（无 tab，正确缩进）

### 查看错误

以 debug 模式运行 Qwen Code 查看 Skill 加载错误：

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
git commit -m “Add team Skill for PDF processing”
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

更改将在下次启动 Qwen Code 时生效。如果 Qwen Code 已在运行，重启以加载更新。

## 删除 Skill

删除 Skill 目录：

```bash
# Personal
rm -rf ~/.qwen/skills/my-skill

# Project
rm -rf .qwen/skills/my-skill
git commit -m “Remove unused Skill”
```

## 最佳实践

### 保持 Skills 聚焦

每个 Skill 应只处理一种能力：

- 聚焦：”PDF 表单填写”、”Excel 分析”、”Git commit 消息”
- 过于宽泛：”文档处理”（拆分为更小的 Skills）

### 编写清晰的描述

通过包含具体触发词帮助模型发现何时使用 Skills：

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### 与团队测试

- Skill 是否在预期时机激活？
- 指令是否清晰？
- 是否缺少示例或边缘情况？