# Visual Studio Code

> VS Code 扩展（Beta）通过原生图形界面直接集成到你的 IDE 中，让你能够实时查看 Qwen 的更改，更方便地访问和与 Qwen Code 进行交互。

<br/>

<video src="https://cloud.video.taobao.com/vod/IKKwfM-kqNI3OJjM_U8uMCSMAoeEcJhs6VNCQmZxUfk.mp4" controls width="800">
  你的浏览器不支持 video 标签。
</video>

### 功能特性

- **原生 IDE 体验**：通过 Qwen 图标访问专用的 Qwen Code 侧边栏面板
- **自动接受编辑模式**：在 Qwen 做出更改时自动应用这些更改
- **文件管理**：使用 @ 提及文件或通过系统文件选择器附加文件和图像
- **对话历史记录**：可访问过去的对话内容
- **多会话支持**：同时运行多个 Qwen Code 会话

### 系统要求

- VS Code 1.98.0 或更高版本

### 安装

1. 安装 Qwen Code CLI：

   ```bash
   npm install -g qwen-code
   ```

2. 从 [Visual Studio Code 扩展市场](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) 下载并安装扩展。

## 故障排除

### 扩展无法安装

- 确保你使用的是 VS Code 1.98.0 或更高版本
- 检查 VS Code 是否有权限安装扩展
- 尝试直接从市场网站安装

### Qwen Code 无响应

- 检查你的网络连接
- 开始新的对话，看问题是否仍然存在
- 如果问题持续，请在 GitHub 上 [提交 issue](https://github.com/qwenlm/qwen-code/issues)