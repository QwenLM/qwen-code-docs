# Checkpointing

Qwen Code 包含一个 Checkpointing 功能，该功能会在 AI 驱动的工具对项目文件进行任何修改之前，自动保存项目状态的快照。这样你可以安全地试验和应用代码变更，并且知道可以立即回滚到工具运行之前的状态。

## 工作原理

当你批准一个修改文件系统的工具（如 `write_file` 或 `replace`）时，CLI 会自动创建一个“检查点”。该检查点包括：

1.  **Git 快照：** 在你主目录下的一个特殊的影子 Git 仓库中创建一个 commit（`~/.qwen/history/<project_hash>`）。这个快照会完整记录项目文件在那一刻的状态。它**不会**干扰你自己项目中的 Git 仓库。
2.  **对话历史：** 截至当时的完整对话记录会被保存。
3.  **工具调用：** 即将执行的具体工具调用也会被存储。

如果你想撤销更改或只是想回退，可以使用 `/restore` 命令。恢复一个检查点将会：

- 将项目中的所有文件恢复到快照中记录的状态。
- 在 CLI 中恢复对话历史。
- 重新提出原始的工具调用，允许你再次运行它、修改它或直接忽略。

所有检查点数据，包括 Git 快照和对话历史，都存储在你本地机器上。Git 快照保存在影子仓库中，而对话历史和工具调用则保存在项目临时目录中的一个 JSON 文件里，通常位于 `~/.qwen/tmp/<project_hash>/checkpoints`。

## 启用 Checkpointing 功能

Checkpointing 功能默认是关闭的。要启用它，你可以使用命令行 flag，或者编辑你的 `settings.json` 文件。

### 使用命令行 Flag

你可以在启动 Qwen Code 时使用 `--checkpointing` flag 来为当前 session 启用 checkpointing：

```bash
qwen --checkpointing
```

### 使用 `settings.json` 文件

要为所有 session 默认启用 checkpointing，你需要编辑你的 `settings.json` 文件。

在你的 `settings.json` 中添加以下 key：

```json
{
  "checkpointing": {
    "enabled": true
  }
}
```

## 使用 `/restore` 命令

启用后，checkpoint 会自动创建。要管理这些 checkpoint，你可以使用 `/restore` 命令。

### 查看可用的 Checkpoint

要查看当前项目所有已保存的 checkpoint 列表，只需运行：

```
/restore
```

CLI 将显示所有可用的 checkpoint 文件列表。这些文件名通常由时间戳、被修改文件的名称以及即将运行的工具名称组成（例如：`2025-06-22T10-00-00_000Z-my-file.txt-write_file`）。

### 恢复到指定 Checkpoint

要将项目恢复到某个特定的 checkpoint，请使用列表中的 checkpoint 文件：

```
/restore <checkpoint_file>
```

例如：

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

执行该命令后，你的文件和对话将立即恢复到创建该 checkpoint 时的状态，并且原始的工具提示会重新出现。