# OpenAI 认证

Qwen Code CLI 支持 OpenAI 认证，适用于希望使用 OpenAI 模型而非 Google Gemini 模型的用户。

## 认证方式

### 1. 交互式认证（推荐）

当你首次运行 CLI 并选择 OpenAI 作为认证方式时，系统将提示你输入以下信息：

- **API Key**：你的 OpenAI API key，可从 [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) 获取  
- **Base URL**：OpenAI API 的基础 URL（默认为 `https://api.openai.com/v1`）  
- **Model**：要使用的 OpenAI 模型（默认为 `gpt-4o`）

CLI 会逐步引导你完成每个字段的填写：

1. 输入你的 API key 并按回车  
2. 查看/修改 base URL 并按回车  
3. 查看/修改模型名称并按回车  

**注意**：你可以直接粘贴你的 API key —— CLI 支持粘贴功能，并会显示完整 key 供你确认。

### 2. 命令行参数

你也可以通过命令行参数提供 OpenAI 凭据：

```bash

# 使用 API key 的基本用法
qwen-code --openai-api-key "your-api-key-here"

# 指定自定义 base URL
qwen-code --openai-api-key "your-api-key-here" --openai-base-url "https://your-custom-endpoint.com/v1"

# 指定自定义 model
qwen-code --openai-api-key "your-api-key-here" --model "gpt-4-turbo"
```

### 3. 环境变量

在你的 shell 或 `.env` 文件中设置以下环境变量：

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # 可选，默认为此值
export OPENAI_MODEL="gpt-4o"  # 可选，默认为 gpt-4o
```

## 支持的模型

CLI 支持所有可通过 OpenAI API 访问的 OpenAI 模型，包括：

- `gpt-4o`（默认）
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- 以及其他可用模型

## 自定义 Endpoints

你可以通过设置 `OPENAI_BASE_URL` 环境变量或使用 `--openai-base-url` 命令行参数来使用自定义 endpoints。这在以下场景中非常有用：

- 使用 Azure OpenAI
- 使用其他与 OpenAI 兼容的 APIs
- 使用本地的 OpenAI 兼容服务器

## 切换认证方式

要在不同的认证方式之间切换，可以在 CLI 界面中使用 `/auth` 命令。

## 安全说明

- API keys 在会话期间存储在内存中
- 如需持久化存储，请使用环境变量或 `.env` 文件
- 永远不要将 API keys 提交到版本控制系统中
- CLI 会以明文形式显示 API keys 用于验证 —— 请确保你的终端环境是安全的