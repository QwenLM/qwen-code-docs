# Qwen Code CLI

在 Qwen Code 中，`packages/cli` 是用户与 Qwen 以及其他 AI 模型和相关工具进行交互的前端界面。关于 Qwen Code 的整体概述，

## 本章节内容导航

- **[Authentication](./authentication.md)：** 关于如何使用 Qwen OAuth 和兼容 OpenAI 的 provider 设置认证的指南。
- **[Commands](./commands.md)：** Qwen Code CLI 命令参考（例如 `/help`、`/tools`、`/theme`）。
- **[Configuration](./configuration.md)：** 通过配置文件自定义 Qwen Code CLI 行为的指南。
- **[Themes](./themes.md)：** 使用不同主题自定义 CLI 外观的指南。
- **[Tutorials](tutorials.md)：** 教程：如何使用 Qwen Code 自动化开发任务。

## 非交互模式

Qwen Code 可以在非交互模式下运行，这对于脚本编写和自动化非常有用。在此模式下，你可以将输入通过管道传递给 CLI，它会执行命令然后退出。

以下示例展示了如何从终端向 Qwen Code 传递命令：

```bash
echo "What is fine tuning?" | qwen
```

你也可以使用 `--prompt` 或 `-p` 标志：

```bash
qwen -p "What is fine tuning?"
```

有关无头模式使用、脚本编写、自动化以及高级示例的完整文档，请参阅 **[Headless Mode](../headless.md)** 指南。