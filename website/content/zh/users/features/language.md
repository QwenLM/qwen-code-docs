# 国际化（i18n）与语言设置

Qwen Code 专为多语言工作流设计：支持 CLI 界面本地化（i18n/l10n）、允许选择 AI 输出语言，以及自定义 UI 语言包。

## 概览

从用户角度看，Qwen Code 的"国际化"涵盖多个层面：

| 功能 / 设置              | 控制内容                                                               | 存储位置                     |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | 终端 UI 文本（菜单、系统消息、提示语）                                 | `~/.qwen/settings.json`      |
| `/language output`       | AI 回复使用的语言（输出偏好，非 UI 翻译）                              | `~/.qwen/output-language.md` |
| 自定义 UI 语言包         | 覆盖或扩展内置 UI 翻译                                                 | `~/.qwen/locales/*.js`       |

## UI 语言

这是 CLI 的 UI 本地化层（i18n/l10n），控制菜单、提示语和系统消息所使用的语言。

### 设置 UI 语言

使用 `/language ui` 命令：

```bash
/language ui zh-CN    # Chinese
/language ui en-US    # English
/language ui ru-RU    # Russian
/language ui de-DE    # German
/language ui ja-JP    # Japanese
/language ui pt-BR    # Portuguese (Brazil)
/language ui fr-FR    # French
/language ui ca-ES    # Catalan
```

也支持别名：

```bash
/language ui zh       # Chinese
/language ui en       # English
/language ui ru       # Russian
/language ui de       # German
/language ui ja       # Japanese
/language ui pt       # Portuguese
/language ui fr       # French
/language ui ca       # Catalan
```

### 自动检测

首次启动时，Qwen Code 会检测系统语言区域设置并自动配置 UI 语言。

检测优先级：

1. `QWEN_CODE_LANG` 环境变量
2. `LANG` 环境变量
3. 通过 JavaScript Intl API 获取系统语言区域
4. 默认：英文

## LLM 输出语言

LLM 输出语言控制 AI 助手回复所使用的语言，与你提问所用的语言无关。

### 工作原理

LLM 输出语言由 `~/.qwen/output-language.md` 规则文件控制。该文件在启动时自动加入 LLM 的上下文，指示其使用指定语言回复。

### 自动检测

首次启动时，若 `output-language.md` 文件不存在，Qwen Code 会根据系统语言区域自动创建该文件。例如：

- 系统语言区域 `zh` → 创建中文回复规则
- 系统语言区域 `en` → 创建英文回复规则
- 系统语言区域 `ru` → 创建俄文回复规则
- 系统语言区域 `de` → 创建德文回复规则
- 系统语言区域 `ja` → 创建日文回复规则
- 系统语言区域 `pt` → 创建葡萄牙文回复规则
- 系统语言区域 `fr` → 创建法文回复规则
- 系统语言区域 `ca` → 创建加泰罗尼亚文回复规则

### 手动设置

使用 `/language output <语言>` 进行更改：

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

支持任意语言名称，LLM 将按指定语言回复。

> [!note]
>
> 更改输出语言后，需重启 Qwen Code 使设置生效。

### 文件位置

```
~/.qwen/output-language.md
```

## 配置

### 通过设置对话框

1. 运行 `/settings`
2. 在 General 下找到"Language"
3. 选择你偏好的 UI 语言

### 通过环境变量

```bash
export QWEN_CODE_LANG=zh
```

这会影响首次启动时的自动检测行为（前提是你尚未设置 UI 语言，且 `output-language.md` 文件不存在）。

## 自定义语言包

对于 UI 翻译，你可以在 `~/.qwen/locales/` 下创建自定义语言包：

- 示例：`~/.qwen/locales/es.js`（西班牙文）
- 示例：`~/.qwen/locales/fr.js`（法文）

用户目录中的翻译优先级高于内置翻译。

> [!tip]
>
> 欢迎贡献！如果你希望改进内置翻译或添加新语言，
> 可参考具体示例：[PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238)。

### 维护 `zh-TW`（台湾繁体中文）

`zh-TW` **并非**对 `zh.js` 执行 OpenCC s2t 自动转换的结果——它是经过人工维护的台湾用语翻译。在新增或更新词条时，请遵循以下规范。

"CI 强制执行？"一列表示 `npm run check-i18n` 是否会因违规导致构建失败。标注为 **No** 的行仅为风格指导，由 Code Review 执行——通常是因为被禁用的形式在非 UI 场景下有合理含义（`文件` 可表示"document"，`打開` 在台湾口语中也常见）。

| 避免使用              | 替换为                | CI 强制执行？ | 原因                                                                                                                                                                             |
| --------------------- | --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 (file)           | 檔案                  | No           | 台湾对文件系统文件的用词（但 `文件` 合法地表示"document"）                                                                                                                       |
| 服務器 / 服务器       | 伺服器                | Yes          | 台湾对"server"的用词                                                                                                                                                             |
| 菜單 / 菜单           | 選單                  | Yes          | 台湾对"menu"的用词                                                                                                                                                               |
| 鏈接 / 链接           | 連結                  | Yes          | 台湾对"link"的用词（单独的 `鏈` 没问题，如 區塊鏈）                                                                                                                              |
| 打開                  | 開啟                  | No           | 台湾 UI 中"open"的首选动词；`打開` 在口语中也常见                                                                                                                                |
| 爲 / 啓 / 曆史 / 鏈接 | 為 / 啟 / 歷史 / 連結 | Yes          | 原始 OpenCC s2t 转换产生的变体繁体字形。注意：`曆` 在日历相关语境中是正确的（日曆、農曆、西曆）；CI 仅标记双字词 `曆史`，不标记单独的 `曆`。 |

如果你不是繁体中文使用者，需要为某个词条生成初始译文，**请勿直接粘贴原始 OpenCC `s2t` 输出**：默认的 s2t 配置会产生台湾不使用的变体繁体字形（如 爲、啓），且不会转换大陆词汇（服務器、菜單）。建议以 `s2twp.json`（简体 → 台湾用语映射）为起点，再请台湾繁体中文使用者审阅。

`check-i18n` 脚本（在 CI 中通过 `npm run check-i18n` 运行）会在 `zh-TW` 词条中出现上述 CI 强制执行的字符串时导致构建失败。完整列表见 `scripts/check-i18n.ts → ZH_TW_FORBIDDEN_PATTERNS`。若某个翻译确实需要包含 CI 禁用字符串，请将该词条键名添加到同一文件的 `ZH_TW_ALLOWED_EXCEPTIONS` 中，并附上简要说明。

> [!note]
>
> 该检查采用纯子字符串匹配，不理解中文词语边界。因此，双字模式可能在复合词边界处产生误报——例如 `區塊鏈接口`（= `區塊鏈` + `接口`）包含子字符串 `鏈接`，但两个词本身均无误。若遇到此类意外的 CI 失败，请将该翻译词条键名添加到 `ZH_TW_ALLOWED_EXCEPTIONS`，而非移除该模式。

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
