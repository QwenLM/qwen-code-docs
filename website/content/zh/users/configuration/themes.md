# 主题

Qwen Code 支持多种主题，用于自定义配色方案和外观。你可以通过 `/theme` 命令或 `"ui.theme"` 配置项来切换主题。

## 可用主题

Qwen Code 内置了一批预定义主题，可在 CLI 中使用 `/theme` 命令查看列表：

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

### 切换主题

1.  在 Qwen Code 中输入 `/theme`。
2.  出现对话框或选择提示，列出所有可用主题。
3.  使用方向键选择主题。部分界面在选择时会实时预览或高亮显示。
4.  确认选择以应用主题。

**注意：** 如果你的 `settings.json` 文件中已通过名称或文件路径定义了主题，则需要先从文件中移除 `"ui.theme"` 配置项，才能通过 `/theme` 命令切换主题。

### 主题持久化

所选主题会保存在 Qwen Code 的[配置](../configuration/settings)中，下次启动时会自动恢复你的偏好设置。

---

## 自动主题检测

当主题设置为 `"auto"`（或未设置）时，Qwen Code 会自动检测终端背景是深色还是浅色，并选择对应的 Qwen 主题（`Qwen Dark` 或 `Qwen Light`）。

### 启用方法

在 `settings.json` 中将主题设置为 `"auto"`：

```json
{
  "ui": {
    "theme": "auto"
  }
}
```

或在 `/theme` 对话框中选择 **Auto**。这是未显式配置主题时的默认行为。

### 检测方式

Qwen Code 使用多种检测方式，按优先级依次回退。启动时（异步路径）的顺序如下：

| 优先级 | 方式                    | 平台       | 工作原理                                                                                         |
| ------ | ----------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| 1      | `COLORFGBG`             | 全平台     | 读取 `COLORFGBG` 环境变量（由 iTerm2、rxvt、Konsole 等终端设置）                                |
| 2      | OSC 11                  | 全平台（TTY） | 向终端发送 `ESC]11;?` 查询并解析响应中的背景色（约 200ms）                                     |
| 3      | macOS 系统外观          | 仅 macOS   | 运行 `defaults read -g AppleInterfaceStyle` 检查 macOS 深色模式是否启用                         |
| 4      | 默认值                  | 全平台     | 所有方式均失败时回退到深色主题                                                                   |

第一个返回结果的方式生效。检测值在会话期间缓存，后续主题解析（例如在 `/theme` 对话框中重新选择 Auto）保持一致。

### 适用场景

- **大多数用户** — 如果终端背景与操作系统外观一致，或终端设置了 `COLORFGBG` / 支持 OSC 11，Auto 模式效果良好。
- **tmux / screen 用户** — OSC 11 可能无法穿透终端复用器。检测会回退到 `COLORFGBG` 或 macOS 系统外观。若两者均不可用，则使用默认深色主题。如果自动检测结果不正确，建议手动指定主题。
- **SSH 会话** — 检测结果取决于远端环境。若 `COLORFGBG` 未转发且远端终端不响应 OSC 11，则使用默认深色主题。

---

## 自定义颜色主题

Qwen Code 支持在 `settings.json` 中创建自定义颜色主题，让你完全掌控 CLI 的配色方案。

### 如何定义自定义主题

在用户、项目或系统级别的 `settings.json` 文件中添加 `customThemes` 块。每个自定义主题是一个对象，包含唯一名称和一组颜色键。示例：

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
- `DiffAdded`（可选，用于 diff 中新增行）
- `DiffRemoved`（可选，用于 diff 中删除行）
- `DiffModified`（可选，用于 diff 中修改行）

**必填属性：**

- `name`（必须与 `customThemes` 对象中的键名一致，且为字符串）
- `type`（必须为字符串 `"custom"`）
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

颜色值可使用十六进制代码（如 `#FF0000`）**或**标准 CSS 颜色名称（如 `coral`、`teal`、`blue`）。完整的支持名称列表请参阅 [CSS 颜色名称](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords)。

你可以在 `customThemes` 对象中添加多个条目来定义多个自定义主题。

### 从文件加载主题

除了在 `settings.json` 中定义自定义主题外，你还可以通过在 `settings.json` 中指定文件路径，直接从 JSON 文件加载主题。这对于共享主题或将主题与主配置分离非常有用。

要从文件加载主题，将 `settings.json` 中的 `ui.theme` 属性设置为主题文件的路径：

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

主题文件必须是有效的 JSON 文件，结构与在 `settings.json` 中定义的自定义主题相同。

**`my-theme.json` 示例：**

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

**安全提示：** 为保障安全，Qwen Code 仅加载位于你主目录下的主题文件。若尝试加载主目录以外的主题文件，将显示警告且不会加载该主题，以防止从不可信来源加载潜在恶意文件。

### 自定义主题示例

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### 使用自定义主题

- 在 Qwen Code 中使用 `/theme` 命令选择自定义主题，自定义主题会显示在主题选择对话框中。
- 或者，在 `settings.json` 的 `ui` 对象中添加 `"theme": "MyCustomTheme"` 将其设为默认主题。
- 自定义主题可在用户、项目或系统级别设置，遵循与其他配置相同的[配置优先级](../configuration/settings)规则。

## 主题预览

|  深色主题  |                                                                                预览                                                                                |  浅色主题  |                                                                                预览                                                                                |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     ANSI     |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  ANSI Light   |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |
| Atom OneDark |     <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |   Ayu Light   | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|     Ayu      | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Default    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     | GitHub Light  | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|   Dracula    |     <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" />     |  Google Code  | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
|    GitHub    | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |     Xcode     | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
