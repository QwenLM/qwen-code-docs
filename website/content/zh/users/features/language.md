# 国际化（i18n）与语言

Qwen Code 专为多语言工作流而构建：它支持命令行界面（CLI）的 UI 本地化（i18n/l10n），允许你选择助手输出的语言，并支持自定义 UI 语言包。

## 概览

从用户视角来看，Qwen Code 的“国际化”涵盖多个层面：

| 功能 / 设置             | 控制内容                                                         | 存储位置                     |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------- |
| `/language ui`           | 终端 UI 文本（菜单、系统消息、提示语）                             | `~/.qwen/settings.json`      |
| `/language output`       | AI 响应所使用的语言（一种输出偏好，而非 UI 翻译）                  | `~/.qwen/output-language.md` |
| 自定义 UI 语言包         | 覆盖或扩展内置的 UI 翻译                                           | `~/.qwen/locales/*.js`       |

## UI 语言

这是 CLI 的 UI 本地化层（i18n/l10n）：它控制菜单、提示和系统消息的语言。

### 设置 UI 语言

使用 `/language ui` 命令：

```bash
/language ui zh-CN    # 中文
/language ui en-US    # 英文
/language ui ru-RU    # 俄文
/language ui de-DE    # 德文
/language ui ja-JP    # 日文
```

也支持简写别名：

```bash
/language ui zh       # 中文
/language ui en       # 英文
/language ui ru       # 俄文
/language ui de       # 德文
/language ui ja       # 日文
```

### 自动检测

首次启动时，Qwen Code 会检测你的系统区域设置，并自动设置 UI 语言。

检测优先级如下：

1. `QWEN_CODE_LANG` 环境变量  
2. `LANG` 环境变量  
3. 通过 JavaScript Intl API 获取的系统区域设置  
4. 默认：英文  

## 大语言模型（LLM）输出语言

LLM 输出语言决定了 AI 助手的响应语言，与你提问所用的语言无关。

### 工作原理

大语言模型（LLM）的输出语言由 `~/.qwen/output-language.md` 文件中的规则控制。该文件会在 Qwen Code 启动时自动加入 LLM 的上下文，从而指示其以指定语言进行响应。

### 自动检测

首次启动时，若不存在 `output-language.md` 文件，Qwen Code 会根据你的系统区域设置（locale）自动生成一个。例如：

- 系统 locale 为 `zh` 时，生成中文响应规则  
- 系统 locale 为 `en` 时，生成英文响应规则  
- 系统 locale 为 `ru` 时，生成俄文响应规则  
- 系统 locale 为 `de` 时，生成德文响应规则  
- 系统 locale 为 `ja` 时，生成日文响应规则

### 手动设置

使用 `/language output <语言>` 命令更改输出语言：

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

任意语言名称均可使用。大语言模型（LLM）将被指示以该语言进行响应。

> [!note]
>
> 更改输出语言后，请重启 Qwen Code 以使设置生效。

### 文件位置

```
~/.qwen/output-language.md
```

## 配置方式

### 通过设置对话框

1. 运行 `/settings` 命令  
2. 在“常规”设置中找到“语言”选项  
3. 选择你偏好的界面语言

### 通过环境变量

```bash
export QWEN_CODE_LANG=zh
```

该环境变量会影响首次启动时的语言自动检测（前提是尚未设置界面语言，且 `output-language.md` 文件尚不存在）。

## 自定义语言包

对于 UI 翻译，你可以在 `~/.qwen/locales/` 目录下创建自定义语言包：

- 示例：`~/.qwen/locales/es.js`（西班牙语）
- 示例：`~/.qwen/locales/fr.js`（法语）

用户目录下的语言包优先级高于内置翻译。

> [!tip]
>
> 欢迎贡献！如果你希望改进内置翻译或添加新语言。
> 具体示例请参阅 [PR #1238：feat(i18n)：添加俄语支持](https://github.com/QwenLM/qwen-code/pull/1238)。

### 语言包格式

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: '配置',
  // ... 更多翻译
};
```

## 相关命令

- `/language` — 显示当前语言设置  
- `/language ui [lang]` — 设置 UI 语言  
- `/language output <language>` — 设置 LLM 输出语言  
- `/settings` — 打开设置对话框