# 主题

Qwen Code 支持多种主题，用于自定义其配色方案和外观。你可以通过 `/theme` 命令或 `"theme":` 配置项来更改主题，以符合你的个人偏好。

## 可用主题

Qwen Code 内置了一系列预定义主题，你可以在 CLI 中使用 `/theme` 命令查看这些主题列表：

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
2. 系统会弹出一个对话框或选择提示，列出所有可用的主题。
3. 使用方向键选择一个主题。某些界面在你选择时可能会提供实时预览或高亮显示。
4. 确认你的选择以应用该主题。

### 主题持久化

选定的主题会保存在 Qwen Code 的 [配置](./configuration.md) 中，这样你的偏好设置会在不同会话间被记住。

---

## 自定义颜色主题

Qwen Code 允许你通过在 `settings.json` 文件中指定来自定义颜色主题。这让你可以完全控制 CLI 中使用的调色板。

### 如何定义自定义主题

在你的用户、项目或系统 `settings.json` 文件中添加一个 `customThemes` 块。每个自定义主题都定义为一个具有唯一名称和一组颜色键的对象。例如：

```json
{
  "customThemes": {
    "MyCustomTheme": {
      "name": "MyCustomTheme",
      "type": "custom",
      "Background": "#181818",
      "Foreground": "#F8F8F2",
      "LightBlue": "#82AAFF",
      "AccentBlue": "#61AFEF",
      "AccentPurple": "#C678DD",
      "AccentCyan": "#56B6C2",
      "AccentGreen": "#98C379",
      "AccentYellow": "#E5C07B",
      "AccentRed": "#E06C75",
      "Comment": "#5C6370",
      "Gray": "#ABB2BF",
      "DiffAdded": "#A6E3A1",
      "DiffRemoved": "#F38BA8",
      "DiffModified": "#89B4FA",
      "GradientColors": ["#4796E4", "#847ACE", "#C3677F"]
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

你可以为任何颜色值使用十六进制代码（例如 `#FF0000`）**或**标准 CSS 颜色名称（例如 `coral`、`teal`、`blue`）。有关支持的名称完整列表，请参见 [CSS 颜色名称](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords)。

你可以通过向 `customThemes` 对象添加更多条目来定义多个自定义主题。

### 自定义主题示例

<img src="../assets/theme-custom.png" alt="Custom theme example" width="600" />

### 使用你的自定义主题

- 在 Qwen Code 中使用 `/theme` 命令选择你的自定义主题。你的自定义主题将出现在主题选择对话框中。
- 或者，通过在 `settings.json` 中添加 `"theme": "MyCustomTheme"` 将其设为默认主题。
- 自定义主题可以在用户、项目或系统级别进行设置，并遵循与其他设置相同的[配置优先级](./configuration.md)规则。

---

## 暗色主题

### ANSI

<img src="../assets/theme-ansi.png" alt="ANSI theme" width="600" />

### Atom OneDark

<img src="../assets/theme-atom-one.png" alt="Atom One theme" width="600">

### Ayu

<img src="../assets/theme-ayu.png" alt="Ayu theme" width="600">

### Default

<img src="../assets/theme-default.png" alt="Default theme" width="600">

### Dracula

<img src="../assets/theme-dracula.png" alt="Dracula theme" width="600">

### GitHub

<img src="../assets/theme-github.png" alt="GitHub theme" width="600">

## 浅色主题

### ANSI Light

<img src="../assets/theme-ansi-light.png" alt="ANSI Light theme" width="600">

### Ayu Light

<img src="../assets/theme-ayu-light.png" alt="Ayu Light theme" width="600">

### Default Light

<img src="../assets/theme-default-light.png" alt="Default Light theme" width="600">

### GitHub Light

<img src="../assets/theme-github-light.png" alt="GitHub Light theme" width="600">

### Google Code

<img src="../assets/theme-google-light.png" alt="Google Code theme" width="600">

### Xcode

<img src="../assets/theme-xcode-light.png" alt="Xcode Light theme" width="600">