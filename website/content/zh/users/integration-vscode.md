# Visual Studio Code

## Qwen Subscription 开发预览

本地 daemon 开启开发能力后，身份验证弹窗会提供 **Qwen Account with Subscription**。在浏览器授权有效的 Plus/Pro 账号后，使用现有模型选择器。网络或服务异常、空响应可以使用上次成功加载的列表；没有缓存时需重试。HTTP 403 会展示服务端错误说明，不返回缓存模型。该接入仍需原生宿主验收，普通发布版本尚未启用。详见[身份验证](./configuration/auth.md)。

> VS Code 扩展（Beta 版）让你通过原生图形界面直接在 IDE 中实时查看 Qwen 的更改，让你更轻松地访问和使用 Qwen Code。

<br/>

<video src="https://cloud.video.taobao.com/vod/IKKwfM-kqNI3OJjM_U8uMCSMAoeEcJhs6VNCQmZxUfk.mp4" controls width="800">
  您的浏览器不支持 video 标签。
</video>

### 功能特性

- **原生 IDE 体验**：通过 Qwen 图标即可访问专用的 Qwen Code 侧边栏面板
- **自动接受编辑模式**：自动应用 Qwen 的更改
- **文件管理**：使用 @ 提及文件，或通过系统文件选择器附加文件和图片
- **对话历史**：访问之前的对话记录
- **多会话支持**：同时运行多个 Qwen Code 会话

### 系统要求

- VS Code 1.96.0 或更高版本

### 安装方法

从 [Visual Studio Code 扩展市场](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) 下载并安装扩展。

## 故障排除

### 扩展无法安装

- 确保你使用的 VS Code 版本为 1.96.0 或更高
- 检查 VS Code 是否有安装扩展的权限
- 尝试直接从扩展市场网站安装

### Qwen Code 无响应

- 检查你的网络连接
- 新建一个对话，查看问题是否仍然存在
- 如果问题持续，请在 [GitHub 上提交 issue](https://github.com/qwenlm/qwen-code/issues)
