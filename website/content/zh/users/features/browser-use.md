# Browser Use

Browser Use 让 Qwen Code 能够操作你 Chrome 浏览器中的页面，使用你现有的标签页和已登录的会话。

## 使用方法

使用 macOS 或 Linux，Chrome 版本 125 或更高，Qwen Code 版本 0.24.2 或更高（可通过 `qwen --version` 检查）。**在你想要使用的 Chrome 配置文件中安装 [Chrome Web Store 中的 Qwen Code 扩展](https://chromewebstore.google.com/detail/qwen-code/hdhmmjclhibojdddmancfgbkleahfaph)。** 该扩展是必需的，但不会随 Qwen Code 包一起安装。Chrome 会在安装后自动保持其更新。

**每个配置文件只使用一份扩展副本。** 如果你之前以未打包方式加载过该扩展，请在使用商店版本之前，在 `chrome://extensions` 中移除或禁用该副本。如果两者同时启用，Qwen 会为同一配置文件看到两个浏览器，并可能连接到其中任意一个。

如果 Chrome Web Store 提示该扩展在你所在地区不可用，请改为从源代码构建：按照 Qwen Code 仓库中 `packages/chrome-extension` 目录的
[README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme)
进行构建，然后打开 `chrome://extensions`，启用开发者模式，选择**加载已解压的扩展程序**，并选择构建好的 `dist/extension` 目录。

直接描述你的浏览器任务，例如：

> 读取我打开的仪表板并总结今天的订单。

Qwen 会在合适的时候选择 Browser Use skill。首次浏览器任务会自动在你的用户目录下注册一个小型本地连接程序；后续任务会复用它。Qwen 在操作页面之前会先与扩展确认连接。如果无法连接，请打开 Chrome 并检查 Qwen Code 版本是否为 0.24.2 或更高，且该扩展已在目标配置文件中启用，然后重试。如果某个运行时依赖项在首次使用时需要配置，Qwen 会引导你完成，并可能要求你重启。不需要单独的 Browser Use Qwen 扩展或 `qwen serve` 进程。

## 禁用

使用 `/skills` 来禁用 **browser-use**。这会向模型隐藏该 skill，但不会断开已有的浏览器会话，也不会移除对话中已加载的指令。
