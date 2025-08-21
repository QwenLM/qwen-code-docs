# Memory Tool (`save_memory`)

本文档介绍了 Qwen Code 的 `save_memory` 工具。

## 描述

使用 `save_memory` 可以在你的 Qwen Code 会话之间保存和回忆信息。通过 `save_memory`，你可以指示 CLI 跨会话记住关键细节，从而提供个性化和有针对性的帮助。

### 参数

`save_memory` 接受一个参数：

- `fact` (string, 必填): 需要记住的具体事实或信息片段。这应该是一个清晰、独立的自然语言陈述。

## 如何在 Qwen Code 中使用 `save_memory`

该工具会将提供的 `fact` 追加到用户主目录下的上下文文件中（默认为 `~/.qwen/QWEN.md`）。此文件名可以通过 `contextFileName` 进行配置。

添加后，这些 facts 会被存储在 `## Qwen Added Memories` 部分下。该文件会在后续会话中作为上下文加载，使 CLI 能够回忆起保存的信息。

用法：

```
save_memory(fact="Your fact here.")
```

### `save_memory` 使用示例

记住用户偏好：

```
save_memory(fact="My preferred programming language is Python.")
```

存储项目特定信息：

```
save_memory(fact="The project I'm currently working on is called 'gemini-cli'.")
```

## 重要说明

- **一般用法：** 此工具应用于存储简洁、重要的事实。不适用于存储大量数据或对话历史。
- **Memory 文件：** memory 文件是一个纯文本 Markdown 文件，因此你可以根据需要手动查看和编辑它。