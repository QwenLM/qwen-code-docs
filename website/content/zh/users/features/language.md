# 国际化 (i18n) 与语言

Qwen Code 专为多语言工作流设计：它在 CLI 中支持 UI 本地化 (i18n/l10n)，允许你选择助手的输出语言，并支持自定义 UI 语言包。

## 概述

从用户角度来看，Qwen Code 的“国际化”涵盖多个层面：

| 功能 / 设置              | 控制内容                                                             | 存储位置                     |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | 终端 UI 文本（菜单、系统消息、提示词）                               | `~/.qwen/settings.json`      |
| `/language output`       | AI 回复使用的语言（输出偏好，非 UI 翻译）                            | `~/.qwen/output-language.md` |
| 自定义 UI 语言包         | 覆盖/扩展内置 UI 翻译                                                | `~/.qwen/locales/*.js`       |

## UI 语言

这是 CLI 的 UI 本地化层 (i18n/l10n)：用于控制菜单、提示词和系统消息的语言。

### 设置 UI 语言

使用 `/language ui` 命令：

```bash
/language ui zh-CN    # Chinese
/language ui en-US    # English
/language ui ru-RU    # Russian
/language ui de-DE    # German
/language ui ja-JP    # Japanese
```

同时也支持别名：

```bash
/language ui zh       # Chinese
/language ui en       # English
/language ui ru       # Russian
/language ui de       # German
/language ui ja       # Japanese
```

### 自动检测

首次启动时，Qwen Code 会检测你的系统区域设置并自动设置 UI 语言。

检测优先级：

1. `QWEN_CODE_LANG` 环境变量
2. `LANG` 环境变量
3. 通过 JavaScript Intl API 获取的系统区域设置
4. 默认值：English

## LLM 输出语言

LLM 输出语言控制 AI 助手的回复语言，与你提问时使用的语言无关。

### 工作原理

LLM 输出语言由 `~/.qwen/output-language.md` 规则文件控制。该文件会在启动时自动包含在 LLM 的上下文中，指示其使用指定语言进行回复。

### 自动检测

首次启动时，如果不存在 `output-language.md` 文件，Qwen Code 会根据你的系统区域设置自动创建该文件。例如：

- 系统区域设置为 `zh` 时，创建中文回复规则
- 系统区域设置为 `en` 时，创建英文回复规则
- 系统区域设置为 `ru` 时，创建俄语回复规则
- 系统区域设置为 `de` 时，创建德语回复规则
- 系统区域设置为 `ja` 时，创建日语回复规则

### 手动设置

使用 `/language output <language>` 进行更改：

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

支持任意语言名称。LLM 将被指示使用该语言进行回复。

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
3. 选择你偏好的 UI 语言

### 通过环境变量

```bash
export QWEN_CODE_LANG=zh
```

这会影响首次启动时的自动检测（前提是你尚未设置 UI 语言且不存在 `output-language.md` 文件）。

## 自定义语言包

对于 UI 翻译，你可以在 `~/.qwen/locales/` 目录下创建自定义语言包：

- 示例：`~/.qwen/locales/es.js` 用于西班牙语
- 示例：`~/.qwen/locales/fr.js` 用于法语

用户目录的优先级高于内置翻译。

> [!tip]
>
> 欢迎贡献！如果你希望改进内置翻译或添加新语言。
> 具体示例请参考 [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238)。

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