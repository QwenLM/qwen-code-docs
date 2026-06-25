# 自定义 Banner 区域设计

> 允许用户替换 QWEN ASCII 艺术字、替换品牌标题，以及完全隐藏 banner —— 同时不允许隐藏使 Qwen Code 可调试、可信赖的运营数据（版本、认证、模型、工作目录）。

## 概述

Qwen Code CLI 在启动时会打印一个 banner，包含 QWEN ASCII logo 和一个带边框的信息面板。多种实际使用场景需要对此界面进行一定的控制：

- **白标 / 第三方品牌集成**：将 Qwen Code 嵌入自有产品的企业和团队，希望展示自己的品牌标识，而非默认的"Qwen Code"。
- **个性化**：个人用户希望 terminal banner 符合团队规范或个人偏好。
- **多租户 / 多实例区分**：在共享环境中，不同团队希望通过视觉信号快速识别当前所在的实例。

设计理念很简单：**品牌外观可替换，运营数据不可隐藏**。自定义功能应允许用户覆盖品牌展示，而不是屏蔽使会话可调试的信息。这一理念决定了本文档后续所有"可改变 vs. 锁定"的决策。

此功能由 [issue #3005](https://github.com/QwenLM/qwen-code/issues/3005) 跟踪。

## Banner 区域划分

目前 banner 由 `Header`（从 `AppHeader` 挂载）渲染，分为以下区域：

```
  marginX=2                                                           marginX=2
  │                                                                          │
  ▼                                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌──── Logo Column ─────┐  gap=2  ┌──── Info Panel (bordered) ──────────┐  │
│   │                      │         │                                     │  │
│   │  ███ QWEN ASCII ███  │         │  ① Title:    >_ Qwen Code (vX.Y.Z)  │  │
│   │  ███   ART ART  ███  │         │  ② Subtitle: «blank, or override»   │  │
│   │  ███ QWEN ASCII ███  │         │  ③ Status:   Qwen OAuth | qwen-…    │  │
│   │                      │         │  ④ Path:     ~/projects/example     │  │
│   └──────── A ───────────┘         └──────────────── B ──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              region: AppHeader
                          │ Tips component renders below (governed by ui.hideTips) │
```

两个顶层区域为：

- **A. Logo 列** —— 一个带渐变色的 ASCII 艺术字块。当前来源于 `packages/cli/src/ui/components/AsciiArt.ts` 中的 `shortAsciiLogo`。
- **B. 信息面板** —— 一个带边框的框，包含四行内容。第二行默认为空白视觉间距行，可选替换为调用方提供的副标题：
  - **B①** Title：`>_ Qwen Code (vX.Y.Z)` —— 品牌文字 + 版本后缀。
  - **B②** Subtitle / 间距行：默认为单空格行。设置 `ui.customBannerSubtitle` 后，该字符串将占据此行（例如 fork 版本可使用 `Built-in DataWorks Official Skills`）。
  - **B③** Status：`<认证显示类型> | <模型> ( /model to change)`。
  - **B④** Path：经过 tilde 缩短的工作目录。

整体由 `<AppHeader>` 包裹，已通过 `showBanner = !config.getScreenReader()` 控制 banner 显示（屏幕阅读器模式退回到纯文本输出）。

## 自定义规则 —— 可改变与锁定

| 区域                                      | 当前来源                      | 自定义类别          | 理由                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Logo 列**                          | `shortAsciiLogo`（`AsciiArt.ts`）    | **可替换 + 可自动隐藏** | 纯品牌展示面。白标场景需要对视觉效果的完全控制。现有的"在窄终端自动隐藏"fallback 保持不变。                                                                      |
| **B①. Title —— 品牌文字**（`>_ Qwen Code`） | 硬编码于 `Header.tsx`          | **可替换**                 | 品牌展示面。前缀 `>_` 字符是现有品牌的一部分；如果用户想去掉它，只需在 `customBannerTitle` 中省略即可。                                                                  |
| **B①. Title —— 版本后缀**（`(vX.Y.Z)`） | `version` prop                      | **锁定**                      | 对 bug 报告至关重要。隐藏它会使"你用的是哪个版本？"这个问题只能通过 `--version` 回答，这在支持工作流中有实际成本。我们为了支持的可追溯性，牺牲了少量白标灵活性。 |
| **B②. Subtitle / 间距行**               | 默认为空白                    | **可替换**                 | 纯品牌 / 上下文展示面。供白标 fork 标注构建信息（如"Built-in DataWorks Official Skills"）。与标题同等级别的净化处理；仅支持单行 —— 不允许破坏布局的换行符。               |
| **B③. Status 行**（认证 + 模型）          | `formattedAuthType`、`model` props  | **锁定**                      | 运营和安全信号。用户必须始终能看到当前使用的凭证和将消耗 token 的模型。即使在白标场景下隐藏它也是危险操作。                       |
| **B④. Path 行**（工作目录）       | `workingDirectory` prop             | **锁定**                      | 运营信号。"我当前在哪个目录？"是用户常见的疑问；banner 是其权威答案。                                                                                                                                          |
| **整个 banner**（A + B）                    | `<Header>` 在 `AppHeader.tsx` 中挂载 | **可隐藏**                    | 单个 `ui.hideBanner: true` 跳过两个区域 —— 与现有屏幕阅读器门控逻辑相同。`<Tips>` 继续由 `ui.hideTips` 独立控制。                                                                         |

该矩阵转化为四个配置项，不多不少：

| 配置项                   | 默认值 | 效果                                                                                                                               | 影响区域 |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `ui.hideBanner`           | `false` | 隐藏整个 banner（区域 A + B）。                                                                                             | A + B           |
| `ui.customBannerTitle`    | 未设置   | 替换 B① 中的品牌文字。版本后缀仍会附加。去除首尾空格；空字符串表示"使用默认值"。                   | B① 品牌文字   |
| `ui.customBannerSubtitle` | 未设置   | 用单行副标题替换 B② 的空白间距行。经过净化处理；上限 160 个字符；空值表示"保留空白间距行"。 | B② 间距行       |
| `ui.customAsciiArt`       | 未设置   | 替换区域 A。支持三种格式（见下文）。出现任何错误时回退到默认值。                                                            | A               |

**有意不提供**以下功能：

- 无配置项可单独隐藏版本后缀。
- 无配置项可单独隐藏认证/模型行。
- 无配置项可单独隐藏路径行。
- 无配置项可更改 logo 的渐变色（由主题控制）。
- 无配置项可重新排序或重构信息面板。

如果实现过程中需要暴露上述任何内容，应作为新字段并附上各自的理由 —— 而非从上述三个字段派生。

## 用户配置指南 —— 如何修改

### 限制速览

每种 banner 自定义都适用若干上限。在手工制作艺术字之前请牢记这些限制，以免解析器截断或拒绝你的输入。

| 内容                             | 限制                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Title 字符数**        | **最多 80 个字符**（净化后）。超出部分将被截断并记录 `[BANNER]` 警告。换行符和控制字符在计算长度前已被去除。 |
| **Subtitle 字符数**     | **最多 160 个字符**（净化后）。净化流程与 title 相同；同样在截断时记录 `[BANNER]` 警告。                                                             |
| **ASCII 艺术字块大小**         | **每层最多 200 行 × 200 列**。超出部分将被截断并记录 `[BANNER]` 警告。                                                                                                              |
| **ASCII 艺术字文件大小**  | **最大 64 KB**。超出部分的文件内容将被忽略。                                                                                                                                                    |
| **实际渲染的 ASCII 艺术字宽度** | 由启动时的 terminal 列数决定，**不是**固定字符数。宽度计算公式及各终端参考值见下方"logo 最宽能多宽？"一节。                     |

**ASCII 艺术字没有固定的字符数限制** —— 只有上述的列数/行数上限以及每次启动的宽度预算。一个 17 字符的品牌名在某种字体下可能渲染得很舒适，在另一种字体下可能需要换行或选用更紧凑的字体；限制因素是视觉宽度，而非字母数量。

### 配置文件位置

所有四个配置项均位于 `settings.json` 的 `ui` 键下。用户级别（`~/.qwen/settings.json`）和工作区级别（项目根目录下的 `.qwen/settings.json`）均支持，遵循标准合并优先级（工作区覆盖用户，系统覆盖工作区）。

`customAsciiArt` 有特殊处理：解析器不会将整个对象视为由高优先级作用域整体替换的单一值，而是按层（tier）逐作用域查找。如果用户设置定义了 `{ small }`，工作区设置定义了 `{ large }`，两者均会生效 —— `small` 来自用户设置，`large` 来自工作区设置。这保证了两件事同时工作：

1. 每个 `{ path }` 条目相对于声明它的文件所在目录进行解析（工作区 `.qwen/` vs. 用户 `~/.qwen/`）；仅靠合并后的视图会丢失这个作用域信息。
2. 用户可以在个人设置中保留默认的 `large` 层，并在每个工作区仅覆盖 `small` 层，无需重复整个对象。

当同一层在多个作用域中定义时，正常优先级生效（系统 > 工作区 > 用户）。在任何作用域中将 `customAsciiArt` 设为裸字符串或 `{ path }` 仍会在该作用域同时填充两个层。

### 完全隐藏 banner

```jsonc
{
  "ui": {
    "hideBanner": true,
  },
}
```

启动输出将跳过 logo 列和信息面板。除非同时设置 `ui.hideTips` 为 `true`，否则 Tips 仍会渲染。

### 替换品牌标题

```jsonc
{
  "ui": {
    "customBannerTitle": "Acme CLI",
  },
}
```

在信息面板中渲染为 `Acme CLI (vX.Y.Z)`。设置自定义标题后 `>_` 字符会被移除；如需保留，请自行加上：`"customBannerTitle": ">_ Acme CLI"`。

### 添加品牌副标题

```jsonc
{
  "ui": {
    "customBannerSubtitle": "Built-in DataWorks Official Skills",
  },
}
```

副标题以次要文本颜色单独渲染为一行，替换标题与认证/模型行之间的空白间距行：

```
┌─────────────────────────────────────────────────────────┐
│ DataWorks DataAgent (vX.Y.Z)                            │  ← B① title
│ Built-in DataWorks Official Skills                      │  ← B② subtitle
│ Qwen OAuth | qwen-coder ( /model to change)             │  ← B③ status
│ ~/projects/example                                      │  ← B④ path
└─────────────────────────────────────────────────────────┘
```

约束条件：

- 仅支持单行。换行符和其他控制字节将被去除/折叠为空格，避免粘贴意外导致信息面板布局损坏。
- 净化后上限为 160 个字符（比 title 上限宽松，因为 tagline / "powered by" 行通常稍长）。
- 将字段留空（或设为空字符串/空白）可保留现有的空白间距行 —— 向后兼容是默认行为。
- 副标题不影响哪些行被锁定；无论副标题状态如何，认证、模型和工作目录始终可见。

### 替换 ASCII 艺术字 —— 内联字符串

```jsonc
{
  "ui": {
    "customAsciiArt": "  ___  _    _  ____ \n / _ \\| |  / |/ _\\\n| |_| | |__| | __/\n \\___/|____|_|___|",
  },
}
```

在 JSON 字符串中使用 `\n` 嵌入换行符。艺术字与默认 logo 一样使用活动渐变主题渲染。

> **没有现成的 ASCII 艺术字？** 使用任意外部生成器并粘贴结果。最简单的方式是 `figlet`：
> `npx figlet -f "ANSI Shadow" "xxxCode" > brand.txt`，然后用 `customAsciiArt: { "path": "./brand.txt" }` 指向该文件。CLI 不会在运行时进行文字转艺术字渲染 —— 原因见 _超出范围_ 一节。

### 替换 ASCII 艺术字 —— 外部文件

```jsonc
{
  "ui": {
    "customAsciiArt": { "path": "./brand.txt" },
  },
}
```

避免对多行字符串进行 JSON 转义。路径解析规则：

- **工作区配置**：相对路径相对于工作区 `.qwen/` 目录解析。
- **用户配置**：相对路径相对于 `~/.qwen/` 解析。
- 绝对路径直接使用。
- 文件在**启动时读取一次**，净化后缓存。会话中途编辑文件不会重新渲染 banner —— 请重启 CLI。

### 替换 ASCII 艺术字 —— 宽度感知

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

终端足够宽时优先使用 `large`；否则使用 `small`；否则隐藏 logo 列（现有的双列 fallback）。每层均可为字符串或 `{ path }`。任一层均可省略：缺失的层将直接跳到下一步。

### logo 最宽能多宽？—— 尺寸预算

标题或艺术字没有硬性字符数限制。**宽度预算**由 terminal 列数决定，并有绝对硬性上限以防止格式错乱的文件冻结布局：

| 参数                                             | 限制                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| 启动时的 terminal 列数                      | 用户终端报告的实际值。                                 |
| 容器外边距                           | 4 列（左 2 + 右 2）。                                            |
| logo 与信息面板之间的间隙                  | 2 列。                                                               |
| 信息面板最小宽度                         | 44 列（路径 40 + 边框 + 内边距）。                                |
| **可用 logo 宽度**（每层，渲染时） | `terminalCols − 4 − 2 − 44 = terminalCols − 50`。                      |
| 每层艺术字的硬性上限（净化后）        | 200 列 × 200 行。超出部分被截断并记录 `[BANNER]` 警告。 |
| `customBannerTitle` 的硬性上限（净化后）  | 80 个字符。超出部分被截断并记录 `[BANNER]` 警告。             |

常见 terminal 宽度下的预算：

| Terminal 列数 | 可渲染的最大 logo 宽度 | 实际含义                                                           |
| ------------- | --------------------------- | --------------------------------------------------------------------- |
| 80            | 30                          | 大多数 figlet "ANSI Shadow" 字母约 7–11 列 —— 最多 3 个字母。     |
| 100           | 50                          | ANSI Shadow 下的短单词（约 6 个字母），或两个短词叠放。 |
| 120           | 70                          | 多行叠放的词语艺术字可以舒适渲染。                         |
| 200           | 150                         | ANSI Shadow 下完整产品名等长内联字符串均可容纳。       |

设计艺术字时的两个实际注意事项：

1. **多词品牌名在大多数终端上通常无法作为单行 ANSI Shadow 渲染。** 每个 ANSI Shadow 字母约 7–9 列，即使是 12 字符的品牌名如 `Custom Agent` 单行也约需 95 列 —— 已超出 100 列终端在信息面板旁的可用空间。建议将词语分行叠放、选用更紧凑的 figlet 字体，或使用紧凑的单行文字装饰，如 `▶ Custom Agent ◀`。
2. **使用宽度感知的 `{ small, large }` 形式**，当单一层会迫使你在"宽屏好看 / 窄屏崩坏"和"窄屏正常 / 宽屏浪费"之间二选一时。下面的示例在 ≥104 列终端的 `large` 中叠放词语，在 `small` 中退回到 16 列的单行装饰。

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

其中 `banner-large.txt` 包含叠放词语的 ANSI Shadow 输出（约 54 列 × 12 行），例如通过以下命令生成：

```bash
( npx figlet -f "ANSI Shadow" CUSTOM
  npx figlet -f "ANSI Shadow" AGENT ) > banner-large.txt
```

### 组合使用所有配置项

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

### 如何验证修改效果

1. 保存 `settings.json` 并启动一个新的 `qwen` 会话 —— banner 解析在启动时运行一次。
2. 调整终端大小，确认 `small` / `large` 层按预期切换，并在极窄宽度下 logo 列消失。
3. 如果效果不符合预期，查看 `~/.qwen/debug/<sessionId>.txt`（符号链接 `latest.txt` 指向当前会话）并搜索 `[BANNER]` —— 每次软失败都会记录一条包含原因的警告日志。

## 解析流程

```
   settings.json                              packages/cli/src/ui/components/
   ─────────────                              ──────────────────────────────
   {                                          AppHeader.tsx
     "ui": {                                    │
       "hideBanner": false,                     │  showBanner =
       "customBannerTitle": "Acme",             │      !screenReader
       "customBannerSubtitle": "Built-in …",    │   && !ui.hideBanner
       "customAsciiArt": …                      │
     }                                          │
   }                                            ▼
        │                              <Header
        ▼                                customAsciiArt={resolved.asciiArt}
   loadSettings()                        customBannerTitle={resolved.title}
   merge user / workspace                customBannerSubtitle={resolved.subtitle}
        │                                version=… model=… authType=…
        ▼                                workingDirectory=… />
   resolveCustomBanner(settings)                  │
   ┌─────────────────────────┐                    ▼
   │ 1. normalize to         │         packages/cli/src/ui/components/
   │    { small, large }     │         Header.tsx
   │ 2. resolve each tier:   │           │
   │    string → as-is       │           │  pick tier by
   │    {path} → fs.read     │           │    availableTerminalWidth
   │      O_NOFOLLOW         │           ▼
   │      ≤ 64 KB            │         render Logo Column
   │ 3. sanitize art:        │         render Info Panel:
   │    stripControlSeqs     │           Title    = customBannerTitle
   │    ≤ 200 lines × 200    │                   ?? '>_ Qwen Code'
   │    cols                 │           Subtitle = customBannerSubtitle
   │ 4. sanitize title +     │                   ?? blank spacer row
   │    subtitle (single-    │           Status   = locked
   │    line, ≤ 80 / 160     │           Path     = locked
   │    chars)               │
   │ 5. memoize by source    │
   └─────────────────────────┘
```

五步解析算法在加载配置时运行一次，仅在配置热重载事件时再次运行：

1. **规范化**。裸 `string` 或 `{ path }` 转换为 `{ small: x, large: x }`。`{ small, large }` 对象直接传递。
2. **解析每个层**。对于每个 `AsciiArtSource`：
   - 如果是字符串，直接使用。
   - 如果是 `{ path }`，使用 `O_NOFOLLOW` 防御同步读取文件（Windows：普通只读 —— 该常量未暴露），上限 64 KB。相对路径相对于_拥有该配置项的配置文件所在目录_解析 —— 工作区配置相对于工作区 `.qwen/`，用户配置相对于 `~/.qwen/`。读取失败时记录 `[BANNER]` 警告并回退到该层的默认值。
3. **净化**。banner 专用净化器移除 OSC / CSI / SS2 / SS3 前导符，将其他所有 C0 / C1 控制字节（以及 DEL）替换为空格，同时保留 `\n` 使多行艺术字得以保存。去除每行末尾空白，然后限制在 200 行 × 200 列以内。超出上限的内容被截断并记录 `[BANNER]` 警告。
4. **渲染时层选择**。在 `Header.tsx` 中，根据已解析的 `small` 和 `large`，使用现有宽度预算计算（`availableTerminalWidth ≥ logoWidth + logoGap + minInfoPanelWidth`）：
   - 优先使用 `large`（如果能容纳）。
   - 否则回退到 `small`（如果能容纳）。
   - 否则，**如果用户提供了任何自定义艺术字**，完全隐藏 logo 列（现有的 `showLogo = false` 分支）—— 在窄终端上回退到内置 QWEN logo 会悄悄撤销白标部署。信息面板仍然渲染。
   - 否则（完全没有提供自定义艺术字），回退到 `shortAsciiLogo`，由现有宽度门控决定是否显示默认 logo。
5. **Fallback**。如果两个层因软失败（文件缺失、净化拒绝所有内容、配置格式错误）而最终为空或无效，表现为未设置任何自定义：渲染 `shortAsciiLogo` 并遵循默认 logo 宽度门控。CLI 绝不能因 banner 配置错误而崩溃。

层选择伪代码：

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
  return undefined; // logo column hidden
}
```

## Settings schema 新增项

在 `packages/cli/src/config/settingsSchema.ts` 的 `ui` 对象中，紧接 `shellOutputMaxLines` 之后追加四个新属性：

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

`hideBanner` 沿用现有 `hideTips` 的模式（`showInDialog: true`）。三个自由格式字段（title、subtitle、art）不在应用内设置对话框中显示，因为在 TUI 对话框中实现多行 ASCII 编辑器本身就是一个独立项目；高级用户直接编辑 `settings.json`。

## 接入变更

实现涉及的改动点很少。以下按文件和当前 `main` 分支的行范围逐一描述。

`packages/cli/src/ui/components/AppHeader.tsx:53` —— 扩展 `showBanner`：

```ts
const showBanner = !config.getScreenReader() && !settings.merged.ui?.hideBanner;
```

`packages/cli/src/ui/components/AppHeader.tsx` —— 将已解析的 banner 传入 `<Header>`：

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

`packages/cli/src/ui/components/Header.tsx` —— 扩展 `HeaderProps`：

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

`packages/cli/src/ui/components/Header.tsx:45-46` —— 在计算 `logoWidth` 之前选择层，以现有默认值为基础：

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

`packages/cli/src/ui/components/Header.tsx` —— 从 prop 渲染标题，并在设置了 subtitle prop 时用它替换空白间距行：

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

**新文件**：`packages/cli/src/ui/utils/customBanner.ts` —— 解析器。导出：

```ts
export interface ResolvedBanner {
  asciiArt: { small?: string; large?: string };
  title?: string;
  subtitle?: string;
}

export function resolveCustomBanner(settings: LoadedSettings): ResolvedBanner;
```

解析器执行上述解析流程中描述的规范化、文件读取、净化和缓存操作。在 CLI 启动时调用一次，并在配置热重载事件时重新运行。各作用域的文件路径直接来自 `settings.system.path` / `settings.workspace.path` / `settings.user.path`，以便每个 `{ path }` 相对于声明它的文件解析；当 `settings.isTrusted` 为 false 时，工作区配置将被完全跳过。

## 已考虑的替代方案

共考虑了五种功能形态。在此列出，供未来贡献者了解设计空间，并在约束条件变化时重新审视选择。

### 方案 1 —— 三个扁平配置项（推荐，符合 issue 要求）

```jsonc
{
  "ui": {
    "customAsciiArt": "...", // string | {path} | {small,large}
    "customBannerTitle": "Acme CLI",
    "hideBanner": false,
  },
}
```

- **效果**：最小化的用户端接口；完全符合 issue 的要求。
- **优点**：零学习曲线；文档极简；与现有扁平 `ui.*` 属性（`hideTips`、`customWittyPhrases` 等）风格一致。
- **缺点**：三个概念上属于同一功能的顶级键未分组；未来新增 banner 专属选项（渐变色、副标题）会在 `ui` 下增加更多兄弟键，而不是嵌套整洁。

### 方案 2 —— 嵌套 `ui.banner` 命名空间

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

- **效果**：与方案 1 能力相同，按功能组织。
- **优点**：为未来 banner 专属选项提供干净的命名空间；通过 `/settings` 更易发现。
- **缺点**：与 issue 的确切措辞有所偏离；现有 UI 配置大多是扁平的（只有 `ui.accessibility` 和 `ui.statusLine` 有嵌套），一致性存疑；用户需要多记一层嵌套。

### 方案 3 —— Banner 预设 + 插槽覆盖

```jsonc
{
  "ui": {
    "bannerProfile": "minimal" | "default" | "branded" | "hidden",
    "banner": { /* slot overrides for 'branded' */ }
  }
}
```

- **效果**：用户从命名预设中选择；高级用户在选定预设内覆盖插槽。
- **优点**：良好的新手引导体验；预设随 CLI 一起发布。
- **缺点**：复杂度显著增加；预设是长期维护承诺；issue 要求的是原始自定义能力，而非精心策划的预设。

### 方案 4 —— 整体 banner 覆盖（单字符串模板）

```jsonc
{
  "ui": {
    "bannerTemplate": "{{logo}}\n>_ {{title}} ({{version}})\n{{auth}} | {{model}}\n{{path}}",
  },
}
```

- **效果**：包含锁定变量的单一自由格式模板。
- **优点**：非标准布局的最大灵活性。
- **缺点**：将布局重新实现到用户空间；失去 Ink 双列对 terminal 宽度的自适应能力；很容易写出在窄终端上崩坏的模板；对于一个小功能来说影响范围过大。

### 方案 5 —— 插件 / Hook API

通过扩展系统暴露 banner 渲染器 hook。

- **效果**：代码级自定义；扩展可以渲染任何内容。
- **优点**：最大能力；允许企业发布密封的品牌插件。
- **缺点**：API 接口庞大；任意 terminal 渲染需要安全审查；对于该 issue 而言严重超出范围。

### 推荐

**推荐方案 1**。它完全满足 issue 的字面要求，符合现有 `ui.*` 风格，并避免在尚不清楚其他 banner 专属选项实际需求的情况下强行决定嵌套命名空间。如果未来不断增加兄弟键，迁移到方案 2 是可加性变更 —— `ui.banner.title` 和 `ui.customBannerTitle` 可在弃用窗口期内共存。

## 安全性与失败处理

自定义 banner 内容会原样渲染到终端，且在路径形式下从磁盘读取。如果加载了恶意或受损的配置文件，两个接触面均可能被攻击。适用于 session-title 功能的相同威胁模型在此同样适用。

| 风险                                                 | 防护措施                                                                                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 艺术字、title 或 subtitle 中的 ANSI / OSC-8 / CSI 注入 | banner 专用净化器（`sanitizeArt` / `sanitizeSingleLine`）：移除 OSC / CSI / SS2 / SS3 前导符，将其他所有 C0 / C1 控制字节（以及 DEL）替换为空格。在渲染前和写入缓存前均执行。 |
| 超大文件冻结启动                           | 文件读取 64 KB 硬性上限。                                                                                                                                                                                     |
| 异常艺术字冻结布局                         | 每个已解析字符串限制在 200 行 × 200 列。超出部分被截断并记录 `[BANNER]` 警告。                                                                                                                                               |
| 路径形式的符号链接重定向                       | 文件读取时使用 `O_NOFOLLOW`（Windows：普通只读；该常量未暴露）。                                                                                                                                      |
| 文件缺失或不可读                              | 捕获异常，记录 `[BANNER]` 警告，回退到默认值。绝不向 UI 抛出异常。                                                                                                                                        |
| title 或 subtitle 包含换行符或超出长度         | 换行符折叠为空格；限制在 80（title）/ 160（subtitle）个字符以内。                                                                                                                                                      |
| 不受信任的工作区影响渲染或文件读取 | 当 `settings.isTrusted` 为 false 时，解析器完全跳过 `settings.workspace`（与 `settings.merged` 应用的信任门控保持一致）。                                                                     |
| 配置重载时的竞争条件                                 | 解析结果按来源（路径或字符串哈希）在每次调用中记忆化。重载会重新运行解析器并重新读取受影响的文件。                                                                                                                                                          |

失败模式总结：每次软失败最终都会渲染 `shortAsciiLogo`（或锁定的默认标题），并记录一条 debug 日志警告。解析器的任何分支都不允许抛出硬失败（异常）。

## 超出范围

以下内容经过考虑后被有意推迟。如果用户需求出现，每项均可作为独立的后续跟进。

| 内容                                                               | 原因                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文字转 ASCII 渲染（`{ text: "xxxCode" }` 形式）               | 已考虑并在 v1 中拒绝。添加此功能需要引入 `figlet` 运行时依赖（包含可用字体集后约 2–3 MB）或内置单字体渲染器（约 200 行 + 我们需要维护的 `.flf` 字体文件）。两种方案都会带来持续的维护面：字体选择、字体许可证跟踪、"我的字体在终端 X 上渲染不正确"等问题，以及 CJK / 宽字符处理。驱动本功能的主要使用场景（白标 / 多租户）几乎总是由设计师提供专门制作的 ASCII 艺术字，而不是依赖默认的 figlet 字体。需要一次性生成的用户已经可以通过 `npx figlet "xxxCode" > brand.txt` + `customAsciiArt: { "path": "./brand.txt" }` 实现 —— 效果相同，无额外依赖，无需在 Qwen Code 内部承担支持负担。如果未来出现需求，此形式可纯粹以加性方式扩展：将 `AsciiArtSource` 扩展为 `string \| {path} \| {text, font?}` 而不破坏任何现有配置。 |
| `/banner` slash 命令用于实时编辑                                   | settings UI 是权威的编辑界面。多行 ASCII 艺术字的实时编辑器本身就是一个独立项目。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 自定义渐变色 / 逐行颜色覆盖                  | 颜色由主题控制。独立的提案可以扩展主题契约；banner 自定义不应重复该接触面。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| URL 加载的 ASCII 艺术字                                               | 启动时的网络请求有其自身的麻烦 —— 失败模式、缓存、安全审查。文件路径形式是风险更低的等效方案。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 动画（旋转 logo、滚动标题）                           | 增加渲染负担和无障碍顾虑；没有任何使用场景需要它。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| VSCode / Web UI banner 一致性                                      | 这些界面目前不渲染 Ink banner。如果它们日后添加 banner，本设计将作为参考。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 文件变更时动态重载                                      | 解析器仅在启动时和配置重载时运行。会话中途更改艺术字文件的场景足够罕见，"重启生效"是可接受的权衡。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 单独隐藏锁定区域（版本、认证、模型、路径） | 这些都是运营信号；隐藏它们对支持和安全态势的损害大于对白标场景的帮助。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 验证计划

在最终实现 PR 中，以下端到端检查应全部通过。

1. `~/.qwen/settings.json` 设置 `customBannerTitle: "Acme CLI"` 和内联 `customAsciiArt` 字符串 → `qwen` 显示新标题和艺术字；版本后缀仍存在。
2. `customBannerSubtitle: "Built-in Acme Skills"` → 副标题行以次要文本颜色渲染在标题和认证/模型行之间；认证、模型和路径仍然可见。取消设置后恢复空白间距行（向后兼容）。
3. `hideBanner: true` → `qwen` 启动时无 banner；Tips 和对话正常渲染。
4. 工作区 `settings.json` 中设置 `customAsciiArt: { "path": "./brand.txt" }`，`brand.txt` 位于 `.qwen/` 目录下 → 工作区打开时从磁盘加载。
5. `customAsciiArt: { "small": "...", "large": "..." }` → 在宽 / 中 / 窄之间调整终端大小；宽屏用 large，中屏用 small，窄屏隐藏 logo 列，信息面板始终可见。
6. 在 `customBannerTitle` 和 `customBannerSubtitle` 中注入 `\x1b[31mhostile` → 两者均渲染为字面文本，不解释为红色。
7. 将 `path` 指向缺失的文件 → CLI 正常启动；`[BANNER]` 警告出现在 `~/.qwen/debug/<sessionId>.txt`；默认艺术字渲染。
8. 在工作区信任关闭时打开工作区 → 工作区定义的 `customAsciiArt`（包括 `{ path }` 条目）被静默忽略；用户作用域配置仍然生效。
9. CLI 包的 `npm test` 和 `npm run typecheck` 通过；`customBanner.test.ts` 中的单元测试覆盖每种接受的格式和每种失败路径（文件缺失、文件过大、ANSI 注入、格式错误的对象）。
