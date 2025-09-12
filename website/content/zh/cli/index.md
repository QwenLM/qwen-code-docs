# Qwen Code CLI

在 Qwen Code 中，`packages/cli` 是用户与 Qwen 及其他 AI 模型及其相关工具进行交互的前端界面。关于 Qwen Code 的整体介绍，请参见[主文档页面](../index.md)。

## 导航本节内容

- **[Authentication](./authentication.md):** 关于如何使用 Qwen OAuth 和兼容 OpenAI 的 providers 设置认证的指南。
- **[Commands](./commands.md):** Qwen Code CLI 命令参考（例如 `/help`、`/tools`、`/theme`）。
- **[Configuration](./configuration.md):** 通过配置文件自定义 Qwen Code CLI 行为的指南。
- **[Token Caching](./token-caching.md):** 通过 token caching 优化 API 成本。
- **[Themes](./themes.md)**: 自定义 CLI 外观主题的指南。
- **[Tutorials](tutorials.md)**: 教程展示如何使用 Qwen Code 自动化开发任务。
- **[Welcome Back](./welcome-back.md)**: 了解“Welcome Back”功能，帮助你在不同会话间无缝恢复工作。

## 非交互模式

Qwen Code 可以在非交互模式下运行，这对于脚本编写和自动化非常有用。在此模式下，你可以通过管道将输入传递给 CLI，它会执行命令然后退出。

以下示例展示了如何从终端通过管道将命令传递给 Qwen Code：

```bash
echo "What is fine tuning?" | qwen
```

Qwen Code 会执行该命令并将输出打印到你的终端。注意，你也可以通过使用 `--prompt` 或 `-p` 参数来实现相同的行为。例如：

```bash
qwen -p "What is fine tuning?"
```