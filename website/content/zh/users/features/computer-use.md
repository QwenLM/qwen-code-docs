# Computer Use

Qwen Code 内置了 **Computer Use** 工具，让 agent 可以操控你的桌面——点击、输入、滚动、启动应用、读取窗口内容和截屏。这使 Qwen Code 成为一个通用的桌面自动化 agent，而不仅仅是局限于终端的编码助手。

Computer Use 由 [`cua-driver`](https://github.com/trycua/cua) 原生驱动提供支持。这些工具作为延迟加载（lazy-loaded）的内置工具注册在 `computer_use__` 前缀下，因此只有在模型实际使用它们时才会占用 prompt 空间。

> [!warning]
>
> Computer Use 赋予 agent 对鼠标、键盘和窗口的控制权，并允许它读取屏幕内容。请仅在受信任的 prompt 下使用，并尽可能在沙箱或一次性环境中使用。操作工具（click、type、drag 等）经过正常的[审批流程](./approval-mode.md)；只读工具（如列出窗口）可能在不提示的情况下运行。

## 启用和禁用

Computer Use **默认启用**。`computer_use__*` 工具在启动时自动注册。

要完全禁用它——同时阻止原生驱动被下载或启动——请在 `settings.json` 中将 `tools.computerUse.enabled` 设置为 `false`：

```jsonc
{
  "tools": {
    "computerUse": {
      "enabled": false,
    },
  },
}
```

此设置需要重启才能生效。

## 首次运行和原生驱动

当 agent 首次调用 Computer Use 工具时，Qwen Code 会下载一个固定的、已签名的 `cua-driver` 二进制文件（约 20 MB）到 `~/.qwen/computer-use/`，并作为本地进程启动它。预构建的二进制文件适用于 macOS（Apple Silicon 和 Intel）、Linux（x86_64）和 Windows（x86_64）。

### macOS 权限

在 macOS 上，桌面自动化需要两个系统权限：

- **Accessibility** — 读取窗口/UI 状态和合成输入
- **Screen Recording** — 捕获截屏

首次使用时，驱动会引导你通过标准的 macOS 系统对话框授予这些权限。agent 还可以按需检查权限状态（`check_permissions` 工具）。由于 macOS 将权限授予归因于_负责_进程，因此可能需要将权限授予启动 Qwen Code 的终端或 IDE。

## Agent 可以做什么

完整的 `cua-driver` 工具集都被暴露。主要功能：

| 类别          | 工具（部分）                                                                       |
| ------------- | ---------------------------------------------------------------------------------- |
| 鼠标          | `click`、`double_click`、`right_click`、`drag`、`move_cursor`、`scroll`            |
| 键盘          | `type_text`、`press_key`、`hotkey`                                                 |
| 窗口 / UI     | `list_windows`、`get_window_state`、`get_accessibility_tree`、`set_value`、`zoom`  |
| 应用          | `launch_app`、`list_apps`、`bring_to_front`、`kill_app`                            |
| 浏览器页面    | `page`（执行 JavaScript、读取文本、查询 DOM、点击元素）                            |
| 截屏          | `get_window_state`（捕获 PNG）、`page`                                             |
| 录制          | `start_recording`、`stop_recording`、`replay_trajectory`（录制/重放会话）          |
| 会话          | `start_session`、`end_session`、agent 光标覆盖控制                                 |

元素定位操作优先于原始像素坐标：`get_window_state` 返回窗口辅助功能树的 Markdown 渲染，每个可操作元素都有一个稳定的 `element_index`，输入工具可以直接定位。

macOS 上的支持最为完整；部分工具是平台特定的（例如，`bring_to_front` 仅限 Windows，`launch_app` 针对 macOS 应用）。

## 配置

所有 Computer Use 设置位于 `settings.json` 的 `tools.computerUse` 下。完整列表请参见[设置参考](../configuration/settings.md)。

| 设置                                  | 类型    | 默认值   | 描述                                                                                                                                                                                                                                              |
| ------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.computerUse.enabled`           | boolean | `true`   | 注册 `computer_use__*` 工具。为 `false` 时，驱动不会被下载或启动。                                                                                                                                                                                |
| `tools.computerUse.maxImageDimension` | number  | `-1`     | 截屏的最长边像素上限。`-1` 保持驱动默认值（1568）；`0` 禁用缩放（全分辨率）；正值限制最长边。较低的上限可降低 vision token 成本。环境变量覆盖：`QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`。                                                       |
| `tools.computerUse.idleTimeoutMs`     | number  | `300000` | 最后一次 `computer_use__*` 调用后保持驱动进程存活的毫秒数（默认 5 分钟）。`0` 保持运行直到 Qwen Code 退出。                                                                                                                                       |

以上三个设置均需重启才能生效。

## 另请参阅

- [审批模式](./approval-mode.md) — 工具执行如何被门控
- [沙箱](./sandbox.md) — 隔离工具可触及的范围
- [设置参考](../configuration/settings.md) — 完整的 `tools.computerUse.*` schema
