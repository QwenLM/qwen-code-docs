# 主题

Qwen Code 支持多种主题，用于自定义配色方案和外观。你可以通过 `/theme` 命令或 `"theme":` 配置项来更改主题，以符合你的偏好。

## 可用主题

Qwen Code 内置了一系列预定义主题，你可以在 CLI 中使用 `/theme` 命令查看列表：

- **深色主题：**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
- **浅色主题：**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Xcode`

### 切换主题

1. 在 Qwen Code 中输入 `/theme`。
2. 将弹出对话框或选择提示，列出可用主题。
3. 使用方向键选择主题。部分界面可能会在选择时提供实时预览或高亮显示。
4. 确认选择以应用主题。

**注意：** 如果你的 `settings.json` 文件中已定义了主题（通过名称或文件路径），在使用 `/theme` 命令切换主题前，必须先从文件中移除 `"theme"` 配置项。

### 主题持久化

所选主题会保存在 Qwen Code 的[配置](../configuration/settings)中，以便在跨会话时记住你的偏好。

---

## 自定义颜色主题

Qwen Code 允许你在 `settings.json` 文件中指定配置，从而创建自定义颜色主题。这让你可以完全控制 CLI 中使用的调色板。

### 如何定义自定义主题

在你的用户、项目或系统级 `settings.json` 文件中添加 `customThemes` 配置块。每个自定义主题定义为一个对象，包含唯一的名称和一组颜色键。例如：

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
- `DiffAdded`（可选，用于 diff 中新增的行）
- `DiffRemoved`（可选，用于 diff 中删除的行）
- `DiffModified`（可选，用于 diff 中修改的行）

**必需属性：**

- `name`（必须与 `customThemes` 对象中的键名匹配，且为字符串）
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

对于任何颜色值，你可以使用十六进制代码（例如 `#FF0000`）**或**标准 CSS 颜色名称（例如 `coral`、`teal`、`blue`）。有关支持的颜色名称完整列表，请参阅 [CSS 颜色名称](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords)。

你可以通过在 `customThemes` 对象中添加更多条目来定义多个自定义主题。

### 从文件加载主题

除了在 `settings.json` 中定义自定义主题外，你还可以通过在 `settings.json` 中指定文件路径，直接从 JSON 文件加载主题。这便于分享主题或将其与主配置分离。

要从文件加载主题，请将 `settings.json` 中的 `theme` 属性设置为你的主题文件路径：

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

主题文件必须是有效的 JSON 文件，且结构与 `settings.json` 中定义的自定义主题相同。

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

**安全提示：** 出于安全考虑，Gemini CLI 仅会加载位于你主目录（home directory）内的主题文件。如果你尝试从主目录外加载主题，系统将显示警告且不会加载该主题。此举旨在防止从不受信任的来源加载潜在的恶意主题文件。

### 自定义主题示例

<img src="https://gw.alicdn.com/imgextra/i1/O1CN01Em30Hc1jYXAdIgls3_!!6000000004560-2-tps-1009-629.png" alt=" " style="zoom:100%;text-align:center;margin: 0 auto;" />

### 使用自定义主题

- 在 Qwen Code 中使用 `/theme` 命令选择你的自定义主题。自定义主题将出现在主题选择对话框中。
- 或者，在 `settings.json` 的 `ui` 对象中添加 `"theme": "MyCustomTheme"` 将其设为默认主题。
- 自定义主题可在用户、项目或系统级别设置，并遵循与其他设置相同的[配置优先级](../configuration/settings)。

## 主题预览

| 深色主题 | 预览 | 浅色主题 | 预览 |
| :----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| ANSI | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01ZInJiq1GdSZc9gHsI_!!6000000000645-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | ANSI Light | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01IiJQFC1h9E3MXQj6W_!!6000000004234-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Atom OneDark | <img src="https://gw.alicdn.com/imgextra/i2/O1CN01Zlx1SO1Sw21SkTKV3_!!6000000002310-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Ayu Light | <img src="https://gw.alicdn.com/imgextra/i3/O1CN01zEUc1V1jeUJsnCgQb_!!6000000004573-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Ayu | <img src="https://gw.alicdn.com/imgextra/i3/O1CN019upo6v1SmPhmRjzfN_!!6000000002289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Default Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01RHjrEs1u7TXq3M6l3_!!6000000005990-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Default | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016pIeXz1pFC8owmR4Q_!!6000000005330-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | GitHub Light | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01US2b0g1VETCPAVWLA_!!6000000002621-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| Dracula | <img src="https://gw.alicdn.com/imgextra/i4/O1CN016htnWH20c3gd2LpUR_!!6000000006869-2-tps-1140-934.png" style="zoom:30%;text-align:center;margin: 0 auto;" /> | Google Code | <img src="https://gw.alicdn.com/imgextra/i1/O1CN01Ng29ab23iQ2BuYKz8_!!6000000007289-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |
| GitHub | <img src="https://gw.alicdn.com/imgextra/i4/O1CN01fFCRda1IQIQ9qDNqv_!!6000000000887-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> | Xcode | <img src="https://gw.alicdn.com/imgextra/i1/O1CN010E3QAi1Huh5o1E9LN_!!6000000000818-2-tps-1140-934.png" alt=" " style="zoom:30%;text-align:center;margin: 0 auto;" /> |