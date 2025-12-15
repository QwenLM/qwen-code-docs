# 主题

Qwen Code 支持多种主题，用于自定义其配色方案和外观。你可以通过 `/theme` 命令或 `"theme":` 配置项来更改主题，以符合个人偏好。

## 可用主题

Qwen Code 内置了一系列预定义主题，你可以在 CLI 中使用 `/theme` 命令查看这些主题：

- **暗色主题：**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
- **亮色主题：**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Xcode`

### 更改主题

1. 在 Qwen Code 中输入 `/theme`。
2. 将出现一个对话框或选择提示，列出可用的主题。
3. 使用方向键选择一个主题。某些界面在你选择时可能会提供实时预览或高亮显示。
4. 确认你的选择以应用该主题。

**注意：** 如果你的 `settings.json` 文件中定义了某个主题（通过名称或文件路径），则必须先从该文件中移除 `"theme"` 设置，然后才能使用 `/theme` 命令更改主题。

### 主题持久化

所选主题会保存在 Qwen Code 的 [配置](./configuration.md) 中，以便在不同会话之间记住你的偏好设置。

---

## 自定义颜色主题

Qwen Code 允许你在 `settings.json` 文件中指定自定义颜色主题。这使你可以完全控制 CLI 中使用的调色板。

### 如何定义自定义主题

在你的用户、项目或系统 `settings.json` 文件中添加一个 `customThemes` 块。每个自定义主题都定义为一个具有唯一名称和一组颜色键的对象。例如：

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
- `DiffAdded`（可选，用于差异中的新增行）
- `DiffRemoved`（可选，用于差异中的删除行）
- `DiffModified`（可选，用于差异中的修改行）

**必需属性：**

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

你可以使用十六进制代码（例如 `#FF0000`）**或**标准 CSS 颜色名称（例如 `coral`、`teal`、`blue`）作为任何颜色值。有关支持的名称完整列表，请参见 [CSS 颜色名称](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords)。

你可以通过向 `customThemes` 对象添加更多条目来定义多个自定义主题。

### 从文件加载主题

除了在 `settings.json` 中定义自定义主题外，你还可以通过在 `settings.json` 中指定文件路径，直接从 JSON 文件加载主题。这对于共享主题或将主题与主配置分离非常有用。

要从文件加载主题，请在 `settings.json` 中将 `theme` 属性设置为你的主题文件路径：

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

主题文件必须是一个有效的 JSON 文件，并且结构与在 `settings.json` 中定义的自定义主题相同。

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

**安全提示：** 为了你的安全，Gemini CLI 只会加载位于你的主目录内的主题文件。如果你尝试从主目录之外加载主题，将会显示警告并且不会加载该主题。这是为了防止从不受信任的来源加载可能含有恶意代码的主题文件。

### 示例自定义主题



<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### 使用你的自定义主题

- 在 Qwen Code 中使用 `/theme` 命令选择你的自定义主题。你的自定义主题将出现在主题选择对话框中。
- 或者，通过在 `settings.json` 的 `ui` 对象中添加 `"theme": "MyCustomTheme"` 将其设置为默认主题。
- 自定义主题可以在用户、项目或系统级别进行设置，并遵循与其他设置相同的[配置优先级](./configuration.md)。

## 主题预览

| 深色主题 | 预览 | 浅色主题 | 预览 |
| :-: | :-: | :-: | :-: |
| ANSI | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | ANSI Light | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Atom OneDark | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Ayu Light | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Ayu | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Default | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | GitHub Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Dracula | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Google Code | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| GitHub | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Xcode | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |