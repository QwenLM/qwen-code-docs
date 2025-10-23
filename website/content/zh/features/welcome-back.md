# 欢迎回来功能

欢迎回来（Welcome Back）功能通过自动检测你何时返回到一个已有对话历史的项目，并提供从上次中断的地方继续工作的选项，帮助你无缝恢复工作。

## 概述

当你在包含先前生成的项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目目录中启动 Qwen Code 时，欢迎回来对话框将自动出现，你可以选择重新开始或继续之前的对话。

## 工作原理

### 自动检测

欢迎回来功能会自动检测以下内容：

- **项目摘要文件：** 在当前项目目录中查找 `.qwen/PROJECT_SUMMARY.md`
- **对话历史：** 检查是否存在有意义的对话历史可供恢复
- **设置：** 遵循你的 `enableWelcomeBack` 设置（默认启用）

### 欢迎回来对话框

当找到项目摘要时，你会看到一个对话框，其中包含：

- **最后更新时间：** 显示摘要上次生成的时间
- **总体目标：** 显示你上一次会话中的主要目标
- **当前计划：** 显示任务进度和状态指示器：
  - `[DONE]` - 已完成的任务
  - `[IN PROGRESS]` - 正在进行中
  - `[TODO]` - 计划中的任务
- **任务统计：** 总任务数、已完成、正在进行和待处理任务的摘要

### 选项

当欢迎回来对话框出现时，你有两个选择：

1. **开始新的聊天会话**
   - 关闭对话框并开始全新的对话
   - 不加载之前的上下文

2. **继续之前的对话**
   - 自动在输入框中填充：`@.qwen/PROJECT_SUMMARY.md, Based on our previous conversation, Let's continue?`
   - 将项目摘要作为上下文加载给 AI
   - 允许你无缝地从上次中断的地方继续

## 配置

### 启用/禁用 Welcome Back

你可以通过设置来控制 Welcome Back 功能：

**通过设置对话框：**

1. 在 Qwen Code 中运行 `/settings`
2. 在 UI 分类中找到 "Enable Welcome Back"
3. 切换该设置的开启/关闭状态

**通过设置文件：**
在你的 `.qwen/settings.json` 中添加：

```json
{
  "enableWelcomeBack": true
}
```

**设置位置：**

- **用户设置：** `~/.qwen/settings.json`（影响所有项目）
- **项目设置：** `.qwen/settings.json`（仅当前项目）

### 键盘快捷键

- **Escape：** 关闭 Welcome Back 对话框（默认为"开始新的聊天会话"）

## 与其他功能的集成

### 项目摘要生成

Welcome Back 功能与 `/chat summary` 命令无缝协作：

1. **生成摘要：** 使用 `/chat summary` 创建项目摘要
2. **自动检测：** 下次在此项目中启动 Qwen Code 时，Welcome Back 将自动检测到摘要
3. **继续工作：** 选择继续，摘要将作为上下文加载

### 退出确认

当使用 `/quit-confirm` 命令并选择 "Generate summary and quit" 时：

1. 系统会自动生成项目摘要
2. 下一次会话将触发 Welcome Back 对话框
3. 你可以无缝继续之前的工作

## 文件结构

Welcome Back 功能会创建并使用以下文件：

```
your-project/
├── .qwen/
│   └── PROJECT_SUMMARY.md    # 生成的项目摘要
```

### PROJECT_SUMMARY.md 格式

生成的摘要遵循以下结构：

```markdown

# Project Summary

## Overall Goal

<!-- 单句简洁描述项目的高层次目标 -->
```

## 核心知识

<!-- 关键事实、约定和限制条件 -->
<!-- 包括：技术选型、架构决策、用户偏好 -->

## 最近行动

<!-- 重要近期工作和成果摘要 -->
<!-- 包括：完成事项、新发现、最近变更 -->

## 当前计划

<!-- 当前开发路线图和下一步行动 -->
<!-- 使用状态标记：[DONE]、[IN PROGRESS]、[TODO] -->

---

## 摘要元数据

**更新时间**：2025-01-10T15:30:00.000Z