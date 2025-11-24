# Language 命令

`/language` 命令允许你自定义 Qwen Code 用户界面（UI）和语言模型输出的语言设置。该命令支持两个不同的功能：

1. 设置 Qwen Code 界面的 UI 语言
2. 设置语言模型（LLM）的输出语言

## UI 语言设置

要更改 Qwen Code 的 UI 语言，请使用 `ui` 子命令：

```
/language ui [zh-CN|en-US]
```

### 可用的 UI 语言

- **zh-CN**: 简体中文 (Simplified Chinese)
- **en-US**: 英语 (English)

### 示例

```
/language ui zh-CN    # 将 UI 语言设置为简体中文
/language ui en-US    # 将 UI 语言设置为英语
```

### UI 语言子命令

为了方便起见，你也可以直接使用以下子命令：

- `/language ui zh-CN` 或 `/language ui zh` 或 `/language ui 中文`
- `/language ui en-US` 或 `/language ui en` 或 `/language ui english`

## LLM 输出语言设置

要设置语言模型的响应语言，可以使用 `output` 子命令：

```
/language output <language>
```

该命令会生成一个语言规则文件，用于指示 LLM 使用指定语言进行回复。规则文件将保存到 `~/.qwen/output-language.md`。

### 示例

```
/language output 中文      # 设置 LLM 输出语言为中文
/language output English   # 设置 LLM 输出语言为英文
/language output 日本語    # 设置 LLM 输出语言为日文
```

## 查看当前设置

不带参数使用时，`/language` 命令会显示当前的语言设置：

```
/language
```

这将展示：

- 当前 UI 语言
- 当前 LLM 输出语言（如果已设置）
- 可用的子命令

## 注意事项

- UI 语言更改会立即生效并重新加载所有命令描述
- LLM 输出语言设置会持久化保存在一个规则文件中，该文件会自动包含在模型的上下文中
- 如需请求额外的 UI 语言包，请在 GitHub 上提交 issue