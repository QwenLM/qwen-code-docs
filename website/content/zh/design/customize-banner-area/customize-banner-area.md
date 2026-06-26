# 自定义 Banner 区域设计

> 允许用户替换 QWEN ASCII 艺术、替换品牌标题、完全隐藏 banner —— 但不允许他们隐藏运行数据（版本、认证、模型、工作目录），这些数据是让 Qwen Code 可调试且可信赖的关键。

## 概述

Qwen Code CLI 在启动时会打印一个 banner，其中包含 QWEN ASCII 徽标和带边框的信息面板。几个实际场景希望对这一区域进行一定控制：

- **白标 / 第三方品牌集成**：将 Qwen Code 嵌入到自己产品中的企业和团队，希望展示自己的品牌标识，而不是默认的 "Qwen Code"。
- **个性化**：个人希望将终端 banner 匹配到团队标准或个人喜好。
- **多租户 / 多实例区分**：在共享环境中，不同的团队需要一个快速的视觉信号来识别当前所在的实例。

设计立场很简单：**品牌装饰可替换，运行数据不可替换**。自定义应允许用户将自己的品牌放在上面，而不是让他们隐藏那些使得会话可调试的信息。这一立场驱动了本文件其余部分关于“哪些可改，哪些锁定”的所有决策。

该功能由 [issue #3005](https://github.com/QwenLM/qwen-code/issues/3005) 追踪。

## Banner 区域分类

当前 banner 由 `Header`（从 `AppHeader` 挂载）渲染，并分为以下几个区域：

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo 列 ─────┐  gap=2  ┌──── 信息面板（带边框） ──────────────┐  │
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① 标题：    >_ Qwen Code (vX.Y.Z)  │  │
│   │  ███   艺术作品  ███  │         │  ② 副标题：   «空白，或自定义覆盖»   │  │
│   │  ███ QWEN ASCII ███  │         │  ③ 状态：   Qwen OAuth | qwen-…    │  │
│   │                      │         │  ④ 路径：     ~/projects/example     │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              region: AppHeader
                          │ Tips 组件渲染在下方（由 ui.hideTips 控制） │
```

两个顶层的方框是：

- **A. Logo 列** — 一个单一的 ASCII 艺术块，带渐变。目前来自 `packages/cli/src/ui/components/AsciiArt.ts` 中的 `shortAsciiLogo`。
- **B. 信息面板** — 一个带边框的方框，包含四行。第二行默认是空白视觉占位符，可选择由调用者提供的副标题替换：
  - **B①** 标题：`>_ Qwen Code (vX.Y.Z)` — 品牌文本 + 版本后缀。
  - **B②** 副标题 / 占位符：默认是空白单空格行。当设置了 `ui.customBannerSubtitle` 时，该字符串占据此行（例如，一个 fork 可能使用 `内置 DataWorks 官方技能`）。
  - **B③** 状态：`<认证显示类型> | <模型> ( /模型 切换)`。
  - **B④** 路径：经过波浪线缩写的、缩短后的工作目录。

整个内容由 `<AppHeader>` 包裹，它已经通过 `showBanner = !config.getScreenReader()` 控制了 banner 的显示（屏幕阅读器模式回退为纯文本输出）。

## 自定义规则 —— 哪些可以改变，哪些锁定

| 区域                                         | 当前来源                            | 自定义类别                  | 理由                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Logo 列**                               | `shortAsciiLogo` (`AsciiArt.ts`)    | **可替换 + 可自动隐藏**     | 纯品牌表面。白标需要完全控制视觉效果。现有的“在窄终端上自动隐藏”回退机制保持不变。                                                                                                                                                                           |
| **B①. 标题 —— 品牌文本**（`>_ Qwen Code`）   | 硬编码在 `Header.tsx` 中            | **可替换**                  | 品牌表面。开头的 `>_` 符号是现有品牌的一部分；如果用户希望去掉它，只需在 `customBannerTitle` 中省略即可。                                                                                                                                                     |
| **B①. 标题 —— 版本后缀**（`(vX.Y.Z)`）       | `version` 属性                      | **锁定**                    | 对错误报告至关重要。隐藏它意味着“你当前是什么版本？”只能通过 `--version` 回答，这在支持工作流中是一个实际成本。我们以少量的白标损失换取支持的可追踪性。                                                                                                       |
| **B②. 副标题 / 占位符行**                    | 默认空白                            | **可替换**                  | 纯品牌 / 上下文表面。白标 fork 用来标记构建版本（例如“内置 DataWorks 官方技能”）。与标题一样进行清理；仅一行 —— 不允许换行破坏布局。                                                                                                                        |
| **B③. 状态行**（认证 + 模型）                | `formattedAuthType`, `model` 属性   | **锁定**                    | 运行和安全信号。用户必须始终看到正在使用的凭据以及将消耗其令牌的模型。即使在白标场景中，隐藏它也是一个安全隐患。                                                                                                                                             |
| **B④. 路径行**（工作目录）                   | `workingDirectory` 属性             | **锁定**                    | 运行信息。“我在哪个目录？”是一个常见问题；banner 是其标准答案。                                                                                                                                                                                              |
| **整个 Banner**（A + B）                     | `<Header>` 挂载在 `AppHeader.tsx` 中 | **可隐藏**                  | 单个 `ui.hideBanner: true` 跳过两个区域 —— 与现有的屏幕阅读器门控方式相同。`<Tips>` 继续由 `ui.hideTips` 独立控制。                                                                                                                                          |

该矩阵转化为四个设置项，仅此而已：

| 设置项                      | 默认值  | 效果                                                                                                 | 影响的区域   |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| `ui.hideBanner`             | `false` | 隐藏整个 banner（区域 A + B）。                                                                      | A + B        |
| `ui.customBannerTitle`      | 未设置  | 替换 B① 中的品牌文本。版本后缀仍会追加。会进行修剪；空字符串表示“使用默认值”。                       | B① 品牌文本  |
| `ui.customBannerSubtitle`   | 未设置  | 将 B② 的空白占位符行替换为一行副标题。会进行清理；最多 160 个字符；空值表示“保持空白占位符”。       | B② 占位符    |
| `ui.customAsciiArt`         | 未设置  | 替换区域 A。接受三种形状（见下文）。任何错误时回退为默认值。                                         | A            |

**不提供**的设置（有意为之）：

- 没有设置可以只隐藏版本后缀。
- 没有设置可以只隐藏认证/模型行。
- 没有设置可以只隐藏路径行。
- 没有设置可以更改徽标的渐变颜色（主题负责此功能）。
- 没有设置可以重新排序或重构信息面板。

如果将来实现需要暴露上述任何设置，它们应该作为新字段，并附有自己的理由 —— 而不是从以上三个设置中衍生出来。

## 用户配置指南 —— 如何修改

### 限制速览

每个 banner 自定义都有少数几个上限。在手工制作art 之前记住这些，以便解析器不会截断或拒绝你的输入。

| 项目                           | 限制                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **标题字符数**                 | **最多 80 个字符**（清理后）。超过时截断并记录 `[BANNER]` 警告。换行和控制字符在计数前会被移除。                                                                                |
| **副标题字符数**               | **最多 160 个字符**（清理后）。与标题相同的清理流程；截断时同样记录 `[BANNER]` 警告。                                                                                          |
| **ASCII 艺术块大小**           | 每层最多 **200 行 × 200 列**。超过时截断以适应，并记录 `[BANNER]` 警告。                                                                                                       |
| **ASCII 艺术文件磁盘大小**     | **最大 64 KB**。大文件会读取到上限，其余部分被忽略。                                                                                                                           |
| **ASCII 艺术渲染宽度**         | 由启动时的终端列数决定，**不是固定的字符数**。参见“Logo 可以有多宽？”下方的公式和每个终端的实际数值。                                                                          |

**ASCII 艺术没有固定的字符数限制** —— 只有上述的列/行上限以及每次启动的宽度预算。一个 17 个字符的品牌名称，在一种字体下可能舒适渲染，但在另一种字体下可能需要堆叠或更密集的字体；限制因素是视觉宽度，而不是字母数量。

### 设置存放位置

所有四个设置都在 `settings.json` 的 `ui` 下。用户级别（`~/.qwen/settings.json`）和工作区级别（项目根目录下的 `.qwen/settings.json`）均受支持，采用标准的合并优先级（工作区覆盖用户，系统覆盖工作区）。

`customAsciiArt` 有特殊处理：它不是一个整体值由更高优先级的范围完全替换，而是解析器按层次遍历各个范围。如果用户设置定义了 `{ small }`，工作区设置定义了 `{ large }`，那么两者都生效 —— `small` 来自用户，`large` 来自工作区。这保持了两种情况的正常工作：

1. 每个 `{ path }` 条目根据声明它的文件（工作区 `.qwen/` 或用户 `~/.qwen/`）进行解析；单独的合并视图会丢失范围信息。
2. 用户可以在个人设置中保留默认的 `large` 层，而仅在每个工作区覆盖 `small`，无需重新声明整个对象。

当同一层在多个范围中定义时，应用正常的优先级（系统 > 工作区 > 用户）。在任何范围中将 `customAsciiArt` 设置为纯字符串或 `{ path }`，仍会填充该范围内的两个层。

### 完全隐藏 banner

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

启动输出会跳过 logo 列和信息面板。Tips 仍然渲染，除非同时设置了 `ui.hideTips: true`。

### 替换品牌标题

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

在信息面板中渲染为 `Acme CLI (vX.Y.Z)`。当设置了自定义标题时，`>_` 符号会被移除；如果你想保留它，请自己包含它：`"customBannerTitle": ">_ Acme CLI"`。

### 添加品牌副标题

```jsonc
{
  "ui": {
    "customBannerSubtitle": "内置 DataWorks 官方技能",
  },
}
```

副标题渲染在单独的一行，使用次要文本颜色，代替通常位于标题和认证/模型行之间的空白占位符：

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① 标题
│ 内置 DataWorks 官方技能                                  │  ← B② 副标题
│ Qwen OAuth | qwen-coder ( /model 切换)                    │  ← B③ 状态
│ ~/projects/example                                      │  ← B④ 路径
└─────────────────────────────────────────────────────────┘
```

约束：

- 仅限单行。换行符和其他控制字节会被移除 / 折叠为空格，以防止粘贴失误破坏信息面板布局。
- 清理后最多 160 个字符（比标题上限宽松，因为标语 / "powered by" 行通常稍长）。
- 保留该字段未设置（或设置为空字符串 / 空白）以保持现有的空白占位符行 —— 向后兼容是默认行为。
- 副标题不会改变哪些行被锁定；无论副标题状态如何，认证、模型和工作目录始终可见。

### 替换 ASCII 艺术 —— 内联字符串

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

使用 `\n` 在 JSON 字符串中嵌入换行。该艺术会像默认徽标一样使用活动渐变主题进行渲染。

> **手头没有 ASCII 艺术？** 使用任何外部生成器并粘贴结果。最简单的方法是使用 `figlet`：
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt`，然后指向 `customAsciiArt: { "path": "./brand.txt" }`。CLI 不会在运行时将文本渲染为艺术 —— 参见“范围外”部分了解原因。

### 替换 ASCII 艺术 —— 外部文件

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

避免对多行字符串进行 JSON 转义。路径解析规则：

- **工作区设置**：相对路径相对于工作区的 `.qwen/` 目录解析。
- **用户设置**：相对路径相对于 `~/.qwen/` 解析。
- 绝对路径按原样使用。
- 文件在 **启动时读取一次**，经过清理并缓存。在会话中编辑文件不会重新渲染 banner —— 重新启动 CLI。

### 替换 ASCII 艺术 —— 宽度感知

```jsonc
{
  "ui": {
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

当终端宽度足够时优先使用 `large`；否则使用 `small`；如果都不满足，则隐藏 logo 列（现有的两列回退机制）。每一层可以是字符串或 `{ path }`。每一层都可以省略：缺失的层只会回退到下一步。

### Logo 可以有多宽？—— 尺寸预算

标题或艺术没有硬性的字符数限制。有一个**宽度预算**，由终端列数和一个绝对硬性上限驱动，以防止格式错误的文件冻结布局：

| 参数                                           | 限制                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| 启动时的终端列数                               | 用户终端报告的内容。                                                      |
| 容器外边距                                     | 4 列（左边 2 + 右边 2）。                                                 |
| Logo 与信息面板之间的间隙                       | 2 列。                                                                   |
| 信息面板最小宽度                               | 44 列（40 路径 + 边框 + 内边距）。                                        |
| **可用 logo 宽度**（每层，渲染时）              | `terminalCols − 4 − 2 − 44 = terminalCols − 50`。                        |
| 每层艺术的硬性上限（清理后）                   | 200 列 × 200 行。超出部分会被截断并记录 `[BANNER]` 警告。                 |
| `customBannerTitle` 的硬性上限（清理后）        | 80 字符。超出部分会被截断并记录 `[BANNER]` 警告。                         |

在常见终端宽度下预算读取：

| 终端列数 | 可渲染的最大 logo 宽度 | 实际意义                                                                                 |
| --------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| 80        | 30                      | 大多数 figlet "ANSI Shadow" 字母约 7–11 列 —— 最多 3 个字母。                            |
| 100       | 50                      | 在 ANSI Shadow 中一个短单词（约 6 个字母），或堆叠的两个短单词。                          |
| 120       | 70                      | 堆叠的多行单词艺术舒适渲染。                                                             |
| 200       | 150                     | 像完整产品名称这样较长的内联字符串在 ANSI Shadow 中也能容纳。                             |

设计艺术时两个实际含义：

1. **多单词品牌在大多数终端上通常无法作为单行 ANSI Shadow 渲染。** 每个 ANSI Shadow 字母约 7–9 列，即使是 12 个字符的品牌如 `Custom Agent`，在一行上也需要大约 95 列的艺术 —— 已经超过 100 列终端与信息面板并排所能容纳的空间。要么将单词堆叠在多行上，选择一个更密集的 figlet 字体，要么使用紧凑的单行文字装饰，如 `▶ Custom Agent ◀`。
2. **使用宽度感知的 `{ small, large }` 形式**，当单一层会迫使你在“宽屏好看 / 窄屏死掉”和“窄屏还好 / 宽屏浪费空间”之间做出选择时。下面的示例在 `large` 中为 ≥104 列终端堆叠单词，并在 `small` 中回退到 16 列的单行装饰。

```jsonc
{
  "ui": {
    "customBannerTitle": "Custom Agent",
    "customAsciiArt": {
      "small": "▶ Custom Agent ◀",
      "large": { "path": "./banner-large.txt" },
    },
  },
}
```

其中 `banner-large.txt` 包含堆叠单词的 ANSI Shadow 输出（约 54 列 × 12 行），例如，由以下命令生成：

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### 组合全部三个设置

```jsonc
{
  "ui": {
    "hideBanner": false,
    "customBannerTitle": "Acme CLI",
    "customAsciiArt": {
      "small": "  ACME\n  ----",
      "large": { "path": "./brand-wide.txt" },
    },
  },
}
```

### 如何验证你的更改

1. 保存 `settings.json` 并启动一个新的 `qwen` 会话 —— banner 解析只在启动时运行一次。
2. 调整终端大小，确认 `small` / `large` 层按预期切换，并且在非常窄的宽度下 logo 列消失。
3. 如果某些内容未按预期显示，查看 `~/.qwen/debug/<sessionId>.txt`（符号链接 `latest.txt` 指向当前会话）并搜索 `[BANNER]` —— 每个软失败都会记录一行警告，其中包含潜在原因。

## 解析管道

```
   settings.json                              packages/cli/src/ui/components/
   ─────────────                              ──────────────────────────────
   {                                          AppHeader.tsx
     "ui": {                                    │
       "hideBanner": false,                     │  showBanner =
       "customBannerTitle": "Acme",             │      !screenReader
       "customBannerSubtitle": "内置…",         │   && !ui.hideBanner
       "customAsciiArt": …                      │
     }                                          │
   }                                            ▼
        │                              <Header
        ▼                                customAsciiArt={resolved.asciiArt}
   loadSettings()                        customBannerTitle={resolved.title}
   合并用户 / 工作区                       customBannerSubtitle={resolved.subtitle}
        │                                version=… model=… authType=…
        ▼                                workingDirectory=… />
   resolveCustomBanner(settings)                  │
   ┌─────────────────────────┐                    ▼
   │ 1. 规范化为              │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. 解析每层：            │           │
   │    string → 原样保留      │           │ 根据可用终端宽度选择层
   │    {path} → fs.read     │           ▼
   │      O_NOFOLLOW         │         渲染 Logo 列
   │      ≤ 64 KB            │         渲染信息面板：
   │ 3. 清理艺术：            │           标题    = customBannerTitle
   │    移除控制序列          │                   ?? '>_ Qwen Code'
   │    ≤ 200 行 × 200       │           副标题   = customBannerSubtitle
   │    列                   │                   ?? 空白占位符行
   │ 4. 清理标题 + 副标题     │           状态    = 锁定
   │    （单行，≤ 80 / 160    │           路径    = 锁定
   │    字符）               │
   │ 5. 按来源记忆化          │
   └─────────────────────────┘
```
五步解析算法在加载设置时运行一次，并且仅在设置重新加载事件时再次运行：

1. **归一化**。裸的 `string` 或 `{ path }` 变为 `{ small: x, large: x }`。`{ small, large }` 对象直接通过。
2. **解析每个层级**。对每个 `AsciiArtSource`：
   - 如果是字符串，直接使用。
   - 如果是 `{ path }`，使用 `O_NOFOLLOW` 防御机制同步读取文件（Windows：仅只读——该常量不公开），大小限制为 64 KB。相对路径相对于 **所属设置文件所在目录** 解析——工作区设置相对于工作区的 `.qwen/`，用户设置相对于 `~/.qwen/`。读取失败则记录 `[BANNER]` 警告，并回退为该层级的默认值。
3. **净化**。横幅专用的剥离器会删除 OSC / CSI / SS2 / SS3 引导符，并将所有其他 C0 / C1 控制字节（以及 DEL）替换为空格，同时保留 `\n` 以便多行艺术图片存活。修剪每行末尾空白，然后限制在 200 行 × 200 列。超出部分被截断并记录 `[BANNER]` 警告。
4. **渲染时的层级选择**。在 `Header.tsx` 中，给定已解析的 `small` 和 `large`，评估当前宽度预算（`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`）：
   - 如果 `large` 能适配，则优先使用。
   - 否则，如果 `small` 能适配，则回退到 `small`。
   - 否则，**如果用户提供了任何自定义艺术图片**，则完全隐藏徽标列（现有 `showLogo = false` 分支）——在此处回退到内置的 QWEN 徽标将静默地撤销窄终端上的白标部署。信息面板仍然渲染。
   - 否则（根本没有提供自定义艺术图片）则降级到 `shortAsciiLogo`，并让现有的宽度门控决定是显示还是隐藏默认徽标。
5. **回退**。如果两个层级最终都为空或无效（由于软故障：文件丢失、净化拒绝了所有内容、配置格式错误），则表现得像没有设置自定义项：渲染 `shortAsciiLogo` 并遵循默认徽标宽度门控。CLI 决不能在横幅配置错误时崩溃。

层级选择的伪代码：

```ts
function pickTier(
  small: string | undefined,
  large: string | undefined,
  availableWidth: number,
  logoGap: number,
  minInfoPanelWidth: number,
): string | undefined {
  for (const candidate of [large, small]) {
    if (!candidate) continue;
    const w = getAsciiArtWidth(candidate);
    if (availableWidth >= w + logoGap + minInfoPanelWidth) {
      return candidate;
    }
  }
  return undefined; // 隐藏徽标列
}
```

## 设置模式新增项

在 `packages/cli/src/config/settingsSchema.ts` 的 `ui` 对象中，`shellOutputMaxLines` 之后立即追加四个新属性：

```ts
hideBanner: {
  type: 'boolean',
  label: 'Hide Banner',
  category: 'UI',
  requiresRestart: false,
  default: false,
  description: 'Hide the startup ASCII banner and info panel.',
  showInDialog: true,
},
customBannerTitle: {
  type: 'string',
  label: 'Custom Banner Title',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Replace the default ">_ Qwen Code" title shown in the banner info panel. The version suffix is always appended.',
  showInDialog: false,
},
customBannerSubtitle: {
  type: 'string',
  label: 'Custom Banner Subtitle',
  category: 'UI',
  requiresRestart: false,
  default: '' as string,
  description:
    'Optional subtitle line rendered between the banner title and the auth/model line. When unset, the info panel keeps its blank spacer row.',
  showInDialog: false,
},
customAsciiArt: {
  type: 'object',
  label: 'Custom ASCII Art',
  category: 'UI',
  requiresRestart: false,
  default: undefined,
  description:
    'Replace the default QWEN ASCII art. Accepts an inline string, {"path": "..."}, or {"small": ..., "large": ...} for width-aware selection.',
  showInDialog: false,
  // The runtime accepts a union the SettingDefinition `type` field can't
  // express. The override is emitted verbatim by the JSON-schema generator
  // so VS Code accepts every documented shape (string, {path}, or
  // {small,large}) without flagging the bare-string form.
  jsonSchemaOverride: { /* string | {path} | {small,large} oneOf … */ },
},
```

`hideBanner` 镜像了现有的 `hideTips` 模式（`showInDialog: true`）。三个自由格式字段（标题、副标题、艺术图片）不包含在应用内设置对话框中，因为在 TUI 对话框中编辑多行 ASCII 艺术本身就是个项目；高级用户直接编辑 `settings.json`。

## 连接更改

实现触碰点很少。以下从当前 `main` 分支列出每个文件的代码范围和描述。

`packages/cli/src/ui/components/AppHeader.tsx:53` — 扩展 `showBanner`：

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` — 将解析后的横幅传递给 `<Header>`：

```tsx
<Header
  version={version}
  authDisplayType={authDisplayType}
  model={model}
  workingDirectory={targetDir}
  customAsciiArt={resolvedBanner?.asciiArt /* { small?, large? } */}
  customBannerTitle={resolvedBanner?.title /* string | undefined */}
  customBannerSubtitle={resolvedBanner?.subtitle /* string | undefined */}
/>
```

`packages/cli/src/ui/components/Header.tsx` — 扩展 `HeaderProps`：

```ts
interface HeaderProps {
  customAsciiArt?: { small?: string; large?: string };
  customBannerTitle?: string;
  customBannerSubtitle?: string;
  version: string;
  authDisplayType?: AuthDisplayType;
  model: string;
  workingDirectory: string;
}
```

`packages/cli/src/ui/components/Header.tsx:45-46` — 在计算 `logoWidth` 之前选择层级，以现有默认值为底线：

```ts
const tier = pickTier(
  customAsciiArt?.small,
  customAsciiArt?.large,
  availableTerminalWidth,
  logoGap,
  minInfoPanelWidth,
);
const displayLogo = tier ?? shortAsciiLogo;
```

`packages/cli/src/ui/components/Header.tsx` — 从属性渲染标题，并在设置副标题时使用副标题属性替代空白间隔行：

```tsx
<Text bold color={theme.text.accent}>
  {customBannerTitle ? customBannerTitle : '>_ Qwen Code'}
</Text>
…
{customBannerSubtitle ? (
  <Text color={theme.text.secondary}>{customBannerSubtitle}</Text>
) : (
  <Text> </Text>
)}
```

**新文件**：`packages/cli/src/ui/utils/customBanner.ts` — 解析器。导出：

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

解析器完成上述解析管道中的归一化、文件读取、净化和缓存。它在 CLI 启动时调用一次，并在设置热重载事件时重新运行。每个作用域的文件路径直接来自 `settings.system.path` / `settings.workspace.path` / `settings.user.path`，因此每个 `{ path }` 都针对声明它的文件进行解析；当 `settings.isTrusted` 为 false 时，完全跳过工作区设置。

## 考虑的替代方案

考虑了该功能的五种形态。此处列出，以便未来的贡献者理解设计空间，并在约束条件改变时重新考虑选择。

### 选项 1 — 三个扁平设置（推荐，与 issue 一致）

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **效果**：最小的用户暴露面；完全符合 issue 要求。
- **优点**：零学习曲线；文档清晰；与现有的扁平 `ui.*` 属性（`hideTips`、`customWittyPhrases` 等）一致。
- **缺点**：三个在概念上属于同一组的顶级键没有分组；未来仅横幅相关的旋钮（渐变、副标题）会向 `ui` 添加更多同级属性，而不是嵌套。

### 选项 2 — 嵌套的 `ui.banner` 命名空间

```jsonc
{
  "ui": {
    "banner": {
      "hide": false,
      "title": "Acme CLI",
      "asciiArt": { "path": "./brand.txt" },
    },
  },
}
```

- **效果**：与选项 1 能力相同，按功能组织。
- **优点**：为未来的仅横幅旋钮提供清晰的命名空间；通过 `/settings` 更容易发现。
- **缺点**：偏离 issue 的确切措辞；现有的 UI 设置大多是扁平的（只有 `ui.accessibility` 和 `ui.statusLine` 嵌套），因此一致性不理想；增加了一层用户需要记住的嵌套。

### 选项 3 — 横幅配置文件预设 + 插槽覆盖

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* 用于 'branded' 的插槽覆盖 */ }
  }
}
```

- **效果**：用户从命名预设中选择；高级用户在选定配置文件中覆盖插槽。
- **优点**：良好的上手 UX；预设随 CLI 一起提供。
- **缺点**：复杂度显著增加；预设是维护承诺；issue 要求的是原始自定义，而不是策划。

### 选项 4 — 整个横幅覆盖（单个字符串模板）

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **效果**：单一自由格式模板，填充锁定变量。
- **优点**：非标准布局的最大灵活性。
- **缺点**：在用户空间中重新实现了布局；丢失了 Ink 的双列抗终端宽度弹性；很容易编写一个在窄终端上破坏的模板；对小功能来说影响范围太大。

### 选项 5 — 插件 / 钩子 API

通过扩展系统暴露横幅渲染钩子。

- **效果**：代码级自定义；扩展可以渲染任何内容。
- **优点**：最大能力；让企业能够交付密封的品牌插件。
- **缺点**：大型 API 表面；需要安全审查才能进行任意终端渲染；对 issue 来说严重超出范围。

### 推荐

**选项 1** 是被推荐的。它完全满足 issue 要求，融入现有的 `ui.*` 风格，并避免在我们知道其他仅横幅旋钮实际是什么样子之前强行做出嵌套命名空间的决定。如果未来有更多同类属性累积，迁移到选项 2 是增量的——`ui.banner.title` 和 `ui.customBannerTitle` 可以在弃用窗口期间共存。

## 安全与故障处理

自定义横幅内容会直接渲染到终端中，并且在路径形式下会从磁盘读取。如果加载了恶意或被破坏的设置文件，这两个表面都是攻击可达的。驱动会话标题功能的相同威胁模型也适用于此处。

| 关注点                                                       | 防护措施                                                                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 艺术图片、标题或副标题中的 ANSI / OSC-8 / CSI 注入           | 横幅专用剥离器（`sanitizeArt` / `sanitizeSingleLine`）：删除 OSC / CSI / SS2 / SS3 引导符，并将所有其他 C0 / C1 控制字节（和 DEL）替换为空格。在渲染和缓存写入之前应用。                                       |
| 过大的文件冻结启动                                           | 文件读取硬限制 64 KB。                                                                                                                                                                                         |
| 病态艺术图片冻结布局                                         | 每个解析后的字符串限制为 200 行 × 200 列。超出部分被截断；记录 `[BANNER]` 警告。                                                                                                                               |
| 路径形式上的符号链接重定向                                   | 文件读取使用 `O_NOFOLLOW`（Windows：仅只读；常量不公开）。                                                                                                                                                     |
| 文件缺失或不可读                                             | 捕获，记录 `[BANNER]` 警告，回退到默认值。绝不向 UI 抛出异常。                                                                                                                                                |
| 标题或副标题包含换行符 / 过长                                | 换行符折叠为空格；限制为 80（标题）/ 160（副标题）字符。                                                                                                                                                       |
| 不可信工作区影响渲染或文件读取                               | 当 `settings.isTrusted` 为 false 时，解析器完全跳过 `settings.workspace`（镜像 `settings.merged` 应用的信任门控）。                                                                                            |
| 设置重载时的竞态条件                                         | 解析由源（路径或字符串哈希）每次调用进行记忆化。重载会重新运行解析器并重新读取受影响文件。                                                                                                                     |

故障模式总结：每个软故障最终都导致 `shortAsciiLogo`（或锁定默认标题）加上一条调试日志警告。硬故障（抛出错误）在解析器的任何分支中都不允许。

## 范围外

以下内容已考虑并被有意推迟。如果用户需求出现，每项都可以作为单独的后续任务。

| 项目                                                                     | 原因                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文本转 ASCII 渲染（`{ text: "xxxCode" }` 形式）                          | 在 v1 中考虑并拒绝。添加此功能需要引入 `figlet` 运行时依赖（包含一组可用字体后解压约 2-3 MB），或使用一个自包含的单字体渲染器（约 200 行 + 我们拥有的 `.flf` 字体文件）。两种选项都带来持续的维护面积：字体选择、字体许可证跟踪、“我的字体在终端 X 上渲染不正确”问题，以及 CJK / 宽字符处理。该功能的驱动用例（白标 / 多租户）几乎总是由设计师制作有意的 ASCII 艺术，而不是依赖默认的 figlet 字体。想要单行生成的用户已经可以通过 `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` 获得相同结果——无新增依赖，无 Qwen Code 内的支持负担。如果日后用户需求出现，此形式纯粹是增量的：扩展 `AsciiArtSource` 为 `string \| {path} \| {text, font?}`，不会破坏任何现有配置。                                                               |
| `/banner` 命令用于实时编辑                                                | 设置 UI 是规范的编辑表面。用于多行 ASCII 艺术的实时编辑器本身就是一个项目。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 自定义渐变颜色 / 每行颜色覆盖                                             | 主题拥有颜色。单独的提案可以扩展主题契约；横幅自定义不应重复该表面。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| URL 加载的 ASCII 艺术                                                     | 启动时网络获取本身就是一个棘手问题——故障模式、缓存、安全审查。文件路径形式是风险较低的等价物。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 动画（旋转徽标、滚动标题）                                                 | 增加渲染负载和无障碍问题；用例中没有任何需求。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| VSCode / Web UI 横幅一致性                                                | 这些表面目前不渲染 Ink 横幅。如果它们将来增加横幅，本设计将是参考。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 文件变化时动态重新加载                                                     | 解析器仅在启动时和设置重新加载时运行。会话中艺术图片变化的频率足够低，因此“重启生效”是可接受的折衷。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 仅隐藏单个已锁定区域（版本、认证、模型、路径）                             | 这些是操作信号；抑制它们对支持和安全姿态的损害大于对白标场景的帮助。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
## 验证计划

对于最终实现 PR，以下端到端检查应通过。

1. `~/.qwen/settings.json` 中设置 `customBannerTitle: "Acme CLI"` 和内联的 `customAsciiArt` 字符串 → `qwen` 显示新的标题和图案；版本后缀仍然存在。
2. `customBannerSubtitle: "Built-in Acme Skills"` → 副标题行在标题与认证/模型行之间以次要文本颜色渲染；认证、模型和路径仍然可见。取消设置则恢复空白间隔行（向后兼容）。
3. `hideBanner: true` → `qwen` 启动时无横幅；提示信息和聊天正常渲染。
4. 在工作区 `settings.json` 中设置 `customAsciiArt: { "path": "./brand.txt" }`，并且 `brand.txt` 位于 `.qwen/` 目录下与之相邻 → 打开工作区时从磁盘加载。
5. `customAsciiArt: { "small": "...", "large": "..." }` → 调整终端尺寸为宽/中/窄；宽尺寸时显示 large，中等尺寸时显示 small，窄尺寸时隐藏徽标列，信息面板始终可见。
6. 在 `customBannerTitle` 和 `customBannerSubtitle` 中注入 `\x1b[31mhostile` → 两者都渲染为纯文本，不解释为红色。
7. 将 `path` 指向一个不存在的文件 → CLI 启动；`[BANNER]` 警告出现在 `~/.qwen/debug/<sessionId>.txt` 中；默认图案被渲染。
8. 在关闭工作区信任的情况下打开工作树 → 工作区定义的 `customAsciiArt`（包括 `{ path }` 条目）被静默忽略；用户作用域设置仍然生效。
9. CLI 包的 `npm test` 和 `npm run typecheck` 通过；`customBanner.test.ts` 中的单元测试覆盖了每种接受的形式和每种失败路径（文件缺失、文件过大、ANSI 注入、格式错误的对象）。