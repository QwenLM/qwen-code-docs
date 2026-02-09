# 国际化 (i18n) 与语言

Qwen Code 为多语言工作流而构建：它支持在 CLI 中进行 UI 本地化 (i18n/l10n)，让你可以选择助手输出语言，并允许自定义 UI 语言包。

## 概述

从用户角度来看，Qwen Code 的"国际化"涵盖多个层面：

| 功能 / 设置              | 控制内容                                                             | 存储位置                     |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | 终端 UI 文本（菜单、系统消息、提示）                                   | `~/.qwen/settings.json`      |
| `/language output`       | AI 回复所使用的语言（输出偏好，非 UI 翻译）                           | `~/.qwen/output-language.md` |
| 自定义 UI 语言包         | 覆盖/扩展内置的 UI 翻译                                              | `~/.qwen/locales/*.js`       |

## UI 语言

这是 CLI 的 UI 本地化层（i18n/l10n）：它控制菜单、提示和系统消息的语言。

### 设置 UI 语言

使用 `/language ui` 命令：

```bash
/language ui zh-CN    # 中文
/language ui en-US    # 英语
/language ui ru-RU    # 俄语
/language ui de-DE    # 德语
/language ui ja-JP    # 日语
```

也支持别名：

```bash
/language ui zh       # 中文
/language ui en       # 英语
/language ui ru       # 俄语
/language ui de       # 德语
/language ui ja       # 日语
```

### 自动检测

在首次启动时，Qwen Code 会检测你的系统区域设置并自动设置 UI 语言。

检测优先级：

1. `QWEN_CODE_LANG` 环境变量
2. `LANG` 环境变量
3. 通过 JavaScript Intl API 获取的系统区域设置
4. 默认：英语

## LLM 输出语言

LLM 输出语言控制 AI 助手以什么语言回复，无论你用什么语言输入问题。

### 工作原理

LLM 输出语言由 `~/.qwen/output-language.md` 的规则文件控制。此文件在启动期间自动包含在 LLM 的上下文中，指示它以指定的语言进行响应。

### 自动检测

首次启动时，如果不存在 `output-language.md` 文件，Qwen Code 会根据你的系统区域设置自动创建一个。例如：

- 系统区域设置为 `zh` 时，创建中文响应的规则
- 系统区域设置为 `en` 时，创建英文响应的规则
- 系统区域设置为 `ru` 时，创建俄文响应的规则
- 系统区域设置为 `de` 时，创建德文响应的规则
- 系统区域设置为 `ja` 时，创建日文响应的规则

### 手动设置

使用 `/language output <language>` 进行更改：

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

任何语言名称都可以。LLM 将被指示以该语言进行回复。

> [!note]
>
> 更改输出语言后，重启 Qwen Code 使更改生效。

### 文件位置

```
~/.qwen/output-language.md
```

## 配置

### 通过设置对话框

1. 运行 `/settings`
2. 在常规设置下找到“语言”
3. 选择你偏好的 UI 语言

### 通过环境变量

```bash
export QWEN_CODE_LANG=zh
```

这会影响首次启动时的自动检测（如果你尚未设置 UI 语言且 `output-language.md` 文件尚不存在）。

## 自定义语言包

对于 UI 翻译，你可以在 `~/.qwen/locales/` 中创建自定义语言包：

- 示例：`~/.qwen/locales/es.js` 用于西班牙语
- 示例：`~/.qwen/locales/fr.js` 用于法语

用户目录优先于内置翻译。

> [!tip]
>
> 欢迎贡献！如果你想改进内置翻译或添加新语言。
> 有关具体示例，请参见 [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238)。

### 语言包格式

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... 更多翻译
};
```

## 相关命令

- `/language` - 显示当前语言设置
- `/language ui [lang]` - 设置 UI 语言
- `/language output <language>` - 设置 LLM 输出语言
- `/settings` - 打开设置对话框