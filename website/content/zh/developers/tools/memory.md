# 记忆工具 (`save_memory`)

本文档介绍了 Qwen Code 的 `save_memory` 工具。

## 描述

使用 `save_memory` 可在不同的 Qwen Code 会话之间保存和检索信息。借助 `save_memory`，你可以指示 CLI 在会话间记住关键细节，从而提供个性化和针对性的辅助。

### 参数

`save_memory` 接受一个参数：

- `fact`（string，必填）：需要记住的具体事实或信息片段。应为使用自然语言编写的清晰、独立的陈述句。

## 如何在 Qwen Code 中使用 `save_memory`

该工具会将提供的 `fact` 追加到用户主目录下的上下文文件中（默认为 `~/.qwen/QWEN.md`）。该文件名可通过 `contextFileName` 进行配置。

添加后，这些事实将存储在 `## Qwen Added Memories` 章节下。在后续会话中，该文件会作为上下文加载，使 CLI 能够检索已保存的信息。

用法：

```
save_memory(fact="Your fact here.")
```

### `save_memory` 示例

记住用户偏好：

```
save_memory(fact="My preferred programming language is Python.")
```

存储项目特定细节：

```
save_memory(fact="The project I'm currently working on is called 'qwen-code'.")
```

## 重要说明

- **常规用法：** 该工具应用于记录简洁、重要的事实。不适用于存储大量数据或对话历史。
- **记忆文件：** 记忆文件为纯文本 Markdown 文件，如有需要，你可以手动查看和编辑它。