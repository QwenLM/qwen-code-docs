# Browser Use

Browser Use 让 Qwen Code 能够操作你 Chrome 浏览器中的页面，使用你现有的标签页和已登录的会话。

## 使用方法

使用 macOS 或 Linux，Chrome 版本 125 或更高。**在你想要使用的 Chrome 配置文件中安装并启用 Qwen Chrome 扩展。** 该扩展是必需的，但不会随 Qwen Code 包一起安装。目前尚无 Chrome Web Store 上架页面。请从 Qwen Code 仓库的 `packages/chrome-extension` 目录按照其
[README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme)
进行构建，然后打开 `chrome://extensions`，启用开发者模式，选择**加载已解压的扩展程序**，并选择构建好的 `dist/extension` 目录。

直接描述你的浏览器任务，例如：

> 读取我打开的仪表板并总结今天的订单。

Qwen 会在合适的时候选择 Browser Use skill。如果某个运行时依赖项在首次使用时需要配置，Qwen 会引导你完成，并可能要求你重启。不需要单独的 Browser Use Qwen 扩展或 `qwen serve` 进程。

## 禁用

使用 `/skills` 来禁用 **browser-use**。这会向模型隐藏该 skill，但不会断开已有的浏览器会话，也不会移除对话中已加载的指令。
