# 国际化（i18n）与语言

Qwen Code 专为多语言工作流而构建：它支持 CLI 中的 UI 本地化（i18n/l10n），允许您选择助手的输出语言，并支持自定义 UI 语言包。

## 概述

从用户角度看，Qwen Code 的“国际化”涵盖多个层级：

| 功能/设置             | 控制内容                                                         | 存储位置                   |
| --------------------- | ---------------------------------------------------------------- | -------------------------- |
| `/language ui`        | 终端 UI 文本（菜单、系统消息、提示）                             | `~/.qwen/settings.json`    |
| `/language output`    | AI 回复时使用的语言（输出偏好，非 UI 翻译）                      | `~/.qwen/output-language.md` |
| 自定义 UI 语言包      | 覆盖/扩展内置的 UI 翻译                                          | `~/.qwen/locales/*.js`     |

## UI 语言

这是 CLI 的 UI 本地化层（i18n/l10n）：控制菜单、提示和系统消息的语言。

### 设置 UI 语言

使用 `/language ui` 命令：

```bash
/language ui zh-CN    # 中文
/language ui en-US    # 英文
/language ui ru-RU    # 俄语
/language ui de-DE    # 德语
/language ui ja-JP    # 日语
/language ui pt-BR    # 葡萄牙语（巴西）
/language ui fr-FR    # 法语
/language ui ca-ES    # 加泰罗尼亚语
```

也支持别名：

```bash
/language ui zh       # 中文
/language ui en       # 英文
/language ui ru       # 俄语
/language ui de       # 德语
/language ui ja       # 日语
/language ui pt       # 葡萄牙语
/language ui fr       # 法语
/language ui ca       # 加泰罗尼亚语
```

### 自动检测

首次启动时，Qwen Code 会自动检测您的系统区域设置并设置 UI 语言。

检测优先级：

1. `QWEN_CODE_LANG` 环境变量
2. `LANG` 环境变量
3. 通过 JavaScript Intl API 获取系统区域设置
4. 默认：英文

## LLM 输出语言

LLM 输出语言控制 AI 助手使用哪种语言回复，而与您提问时使用的语言无关。

### 工作原理

LLM 输出语言由位于 `~/.qwen/output-language.md` 的规则文件控制。该文件在启动时自动包含在 LLM 的上下文中，指示其使用指定语言回复。

### 自动检测

首次启动时，如果不存在 `output-language.md` 文件，Qwen Code 会根据您的系统区域设置自动创建一个。例如：

- 系统区域 `zh` 创建一条要求使用中文回复的规则
- 系统区域 `en` 创建一条要求使用英文回复的规则
- 系统区域 `ru` 创建一条要求使用俄语回复的规则
- 系统区域 `de` 创建一条要求使用德语回复的规则
- 系统区域 `ja` 创建一条要求使用日语回复的规则
- 系统区域 `pt` 创建一条要求使用葡萄牙语回复的规则
- 系统区域 `fr` 创建一条要求使用法语回复的规则
- 系统区域 `ca` 创建一条要求使用加泰罗尼亚语回复的规则

### 手动设置

使用 `/language output <language>` 更改：

```bash
/language output Chinese    # 中文
/language output English    # 英文
/language output Japanese   # 日语
/language output German     # 德语
```

任何语言名称都可以。LLM 将被指示使用该语言回复。

> [!note]
>
> 更改输出语言后，请重启 Qwen Code 以使更改生效。

### 文件位置

```
~/.qwen/output-language.md
```

## 配置

### 通过设置对话框

1. 运行 `/settings`
2. 在“常规”下找到“语言”
3. 选择您偏好的 UI 语言

### 通过环境变量

```bash
export QWEN_CODE_LANG=zh
```

这会影响首次启动时的自动检测（如果您尚未设置 UI 语言且不存在 `output-language.md` 文件）。

## 自定义语言包

对于 UI 翻译，您可以在 `~/.qwen/locales/` 中创建自定义语言包：

- 示例：`~/.qwen/locales/es.js` 用于西班牙语
- 示例：`~/.qwen/locales/fr.js` 用于法语

用户目录优先于内置翻译。

> [!tip]
>
> 欢迎贡献！如果您希望改进内置翻译或添加新语言，请参与。具体示例请参见 [PR #1238: feat(i18n): 添加俄语支持](https://github.com/QwenLM/qwen-code/pull/1238)。

### 维护 `zh-TW`（台湾繁体中文）

`zh-TW` 并非 `zh.js` 的自动 OpenCC s2t 转换结果——它是手写维护的台湾词汇翻译。在添加或更新键时，请遵循以下约定。

“CI 强制执行？”列表示是否违反时 `npm run check-i18n` 会导致构建失败。标记为**否**的行是仅通过审查执行的样式指导——通常是因为违规形式具有合理的非 UI 含义（`文件` 可以表示“文档”，`打開` 在台湾口语中也可接受）。

| 应避免                | 改用                | CI 强制执行？ | 原因                                                                                                             |
| --------------------- | ------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| 文件 (file)           | 檔案                | 否           | 台湾用于文件系统文件的术语（但 `文件` 可合法表示“文档”）                                                           |
| 服務器 / 服务器       | 伺服器              | 是           | 台湾用于“服务器”的术语                                                                                             |
| 菜單 / 菜单           | 選單                | 是           | 台湾用于“菜单”的术语                                                                                               |
| 鏈接 / 链接           | 連結                | 是           | 台湾用于“链接”的术语（单独的 `鏈` 可以接受——例如 區塊鏈）                                                           |
| 打開                  | 開啟                | 否           | 台湾偏好的“打开”动词（UI）；`打開` 口语中常见                                                                       |
| 爲 / 啓 / 曆史 / 鏈接 | 為 / 啟 / 歷史 / 連結 | 是           | 来自原始 OpenCC s2t 的异体繁体形式。注意：`曆` 取决于上下文，在日历术语（日曆、農曆、西曆）中是正确的；CI 仅标记双字词 `曆史`，不标记单独的 `曆`。 |

如果您不是繁体中文使用者且需要初始化一个值，**请勿粘贴原始 OpenCC `s2t` 输出**：默认的 s2t 配置文件会生成台湾不使用的异体繁体字符（例如 爲, 啓），并且从不改写大陆中文词汇（服務器, 菜單）。建议以 `s2twp.json`（简体 → 台湾，带短语映射）为起点，然后请台湾繁体中文使用者审阅。

`check-i18n` 脚本（在 CI 中通过 `npm run check-i18n` 运行）如果上述 CI 强制实施的子字符串出现在 `zh-TW` 值中，将导致构建失败。查看 `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS` 获取完整列表。如果翻译确实需要包含 CI 禁止的子字符串，请将其键添加到同一文件中的 `ZH_TW_ALLOWED_EXCEPTIONS`，并附上简要理由。

> [!note]
>
> 该检查使用纯子字符串匹配，无法理解中文词边界。因此，双字词模式可能会在复合词边界处误报——例如，`區塊鏈接口`（= `區塊鏈` + `接口`）包含子字符串 `鏈接`，尽管两个词都没有错误。如果您遇到这种意外的 CI 失败，请将翻译键添加到 `ZH_TW_ALLOWED_EXCEPTIONS`，而不是删除该模式。

### 语言包格式

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... more translations
};
```

## 相关命令

- `/language` - 显示当前语言设置
- `/language ui [lang]` - 设置 UI 语言
- `/language output <language>` - 设置 LLM 输出语言
- `/settings` - 打开设置对话框