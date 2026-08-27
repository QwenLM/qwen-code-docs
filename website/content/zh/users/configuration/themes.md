# 主题

Qwen Code 支持多种主题，让你可以自定义其配色方案和外观。你可以通过 `/theme` 命令或 `"ui.theme"` 配置设置来更改主题，以符合你的偏好。

## 可用主题

Qwen Code 自带一系列预定义主题，你可以在 CLI 中使用 `/theme` 命令列出它们：

- **深色主题：**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
  - `Qwen Dark`
  - `Shades Of Purple`
- **浅色主题：**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Qwen Light`
  - `Xcode`

### 更改主题

1.  在 Qwen Code 中输入 `/theme`。
2.  出现一个对话框或选择提示，列出可用的主题。
3.  使用方向键选择一个主题。部分界面可能会在你选择时提供实时预览或高亮效果。
4.  确认你的选择以应用该主题。

> [!note]
> 如果主题已在你的 `settings.json` 文件中定义（通过名称或文件路径），你必须在使用 `/theme` 命令更改主题之前，先从文件中移除 `"ui.theme"` 设置。

### 主题持久化

选中的主题会保存在 Qwen Code 的[配置](../configuration/settings)中，因此你的偏好会在会话之间保留。

---

## 自动主题检测

当主题设置为 `"auto"`（或未设置）时，Qwen Code 会自动检测你的终端使用的是深色还是浅色背景，并选择匹配的 Qwen 主题（`Qwen Dark` 或 `Qwen Light`）。

### 如何启用

在 `settings.json` 中将主题设置为 `"auto"`：

```json
{
  "ui": {
    "theme": "auto"
  }
}
```

或者在 `/theme` 对话框中选择 **Auto**。这是未显式配置主题时的默认行为。

### 检测方法

Qwen Code 使用多种检测方法，通过一个回退链进行。在启动时（异步路径），顺序为：

| 优先级 | 方法                  | 平台       | 工作原理                                                                                         |
| ------ | --------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| 1      | `COLORFGBG`           | 所有       | 读取 `COLORFGBG` 环境变量（由 iTerm2、rxvt、Konsole 等终端设置）                                  |
| 2      | OSC 11                | 所有 (TTY) | 向终端发送 `ESC]11;?` 查询，并从响应中解析背景颜色（约 200ms）                                    |
| 3      | macOS 系统外观         | 仅 macOS   | 运行 `defaults read -g AppleInterfaceStyle` 来检查 macOS 深色模式是否已启用                         |
| 4      | 默认                   | 所有       | 如果所有方法都失败，则回退到深色主题                                                             |

第一个返回结果的方法胜出。检测到的值会在会话中缓存，因此后续的主题解析（例如在 `/theme` 对话框中重新选择 Auto）会保持一致。

### 何时使用 Auto

- **大多数用户**——如果你的终端背景与操作系统外观匹配，或者你的终端设置了 `COLORFGBG` / 支持 OSC 11，那么 Auto 效果很好。
- **tmux / screen 用户**——OSC 11 可能无法穿透多路复用器。检测会回退到 `COLORFGBG` 或 macOS 系统外观。如果两者都不可用，则使用默认深色主题。如果自动检测结果错误，请设置一个特定的主题。
- **SSH 会话**——检测取决于远程环境。如果 `COLORFGBG` 没有转发，且远程终端不响应 OSC 11，则使用默认深色主题。

---

## 自定义颜色主题

Qwen Code 允许你通过 `settings.json` 文件指定自己的自定义颜色主题。这让你可以完全控制 CLI 中使用的调色板。

### 如何定义自定义主题

在用户、项目或系统的 `settings.json` 文件中添加一个 `customThemes` 块。每个自定义主题定义为一个对象，包含唯一的名称和一组颜色键。例如：

```json
{
  "ui": {
    "customThemes": {
      "MyCustomTheme": {
        "name": "MyCustomTheme",
        "type": "custom",
        "Background": "#181818",
        ...
      }
    }
  }
}
```

**颜色键：**

- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`
- `DiffAdded`（可选，用于 diff 中添加的行）
- `DiffRemoved`（可选，用于 diff 中删除的行）
- `DiffModified`（可选，用于 diff 中修改的行）

**必需的属性：**

- `name`（必须与 `customThemes` 对象中的键匹配，且为字符串）
- `type`（必须是字符串 `"custom"`）
- `Background`
- `Foreground`
- `LightBlue`
- `AccentBlue`
- `AccentPurple`
- `AccentCyan`
- `AccentGreen`
- `AccentYellow`
- `AccentRed`
- `Comment`
- `Gray`

对于任何颜色值，你可以使用十六进制代码（例如 `#FF0000`）**或**标准的 CSS 颜色名称（例如 `coral`、`teal`、`blue`）。有关所有支持的颜色名称，请参阅 [CSS 颜色名称](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords)。

你可以通过在 `customThemes` 对象中添加更多条目来定义多个自定义主题。

### 从文件加载主题

除了在 `settings.json` 中定义自定义主题外，你还可以通过指定 JSON 文件的路径，直接从文件加载主题。这对于共享主题或将其与主配置分开管理非常有用。

要通过文件加载主题，请将 `settings.json` 中的 `ui.theme` 属性设置为主题文件的路径：

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

主题文件必须是有效的 JSON 文件，并且遵循与 `settings.json` 中定义的自定义主题相同的结构。

**示例 `my-theme.json`：**

```json
{
  "name": "My File Theme",
  "type": "custom",
  "Background": "#282A36",
  "Foreground": "#F8F8F2",
  "LightBlue": "#82AAFF",
  "AccentBlue": "#61AFEF",
  "AccentPurple": "#BD93F9",
  "AccentCyan": "#8BE9FD",
  "AccentGreen": "#50FA7B",
  "AccentYellow": "#F1FA8C",
  "AccentRed": "#FF5555",
  "Comment": "#6272A4",
  "Gray": "#ABB2BF",
  "DiffAdded": "#A6E3A1",
  "DiffRemoved": "#F38BA8",
  "DiffModified": "#89B4FA",
  "GradientColors": ["#4796E4", "#847ACE", "#C3677F"]
}
```

**安全说明：** 为了你的安全，Qwen Code 只会加载位于主目录内的主题文件。如果你尝试加载主目录之外的主题文件，将会显示警告，并且不会加载该主题。这是为了防止从不受信任的来源加载潜在恶意的主题文件。

### 自定义主题示例

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### 使用你的自定义主题

- 在 Qwen Code 中使用 `/theme` 命令选择你的自定义主题。你的自定义主题将出现在主题选择对话框中。
- 或者，在 `settings.json` 的 `ui` 对象中添加 `"theme": "MyCustomTheme"` 将其设置为默认主题。
- 自定义主题可以在用户、项目或系统级别设置，并遵循与其他设置相同的[配置优先级](../configuration/settings)。

## 主题预览

| 深色主题    | 预览                                                                                                                 | 浅色主题      | 预览                                                                                                                 |
| :---------- | :------------------------------------------------------------------------------------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------- |
| ANSI        | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | ANSI Light    | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Atom OneDark | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Ayu Light     | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Ayu          | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Default      | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Dracula      | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Google Code   | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| GitHub       | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Xcode         | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |