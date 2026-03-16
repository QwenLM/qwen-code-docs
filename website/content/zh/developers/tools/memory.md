# 记忆工具（`save_memory`）

本文档介绍 Qwen Code 的 `save_memory` 工具。

## 描述

使用 `save_memory` 可在不同 Qwen Code 会话间保存并回忆信息。借助 `save_memory`，你可以指示 CLI 在多个会话中记住关键细节，从而提供个性化且有针对性的协助。

### 参数

`save_memory` 接受一个参数：

- `fact`（字符串，必需）：需记住的具体事实或信息。该参数应为一条清晰、自包含的自然语言语句。

## 如何在 Qwen Code 中使用 `save_memory`

该工具会将提供的 `fact` 追加到用户主目录下的上下文文件中（默认路径为 `~/.qwen/QWEN.md`）。此文件名可通过 `contextFileName` 配置项进行自定义。

添加后，所有事实均存储在 `## Qwen Added Memories` 小节下。该文件会在后续会话中作为上下文自动加载，使 CLI 能够回忆已保存的信息。

用法示例：

```
save_memory(fact="你的事实内容。")
```

### `save_memory` 示例

记住用户的偏好：

```
save_memory(fact="我偏好的编程语言是 Python。")
```

存储项目特定的细节：

```
save_memory(fact="我当前正在开发的项目名为 'qwen-code'。")
```

## 重要说明

- **通用用法：** 此工具应仅用于保存简洁且重要的事实，不适用于存储大量数据或对话历史。
- **记忆文件：** 记忆文件是一个纯文本 Markdown 文件，因此如有需要，你可以手动查看和编辑它。