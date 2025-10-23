# 欢迎阅读 Qwen Code 文档

Qwen Code 是一个强大的命令行 AI 工作流工具，基于 [**Gemini CLI**](https://github.com/google-gemini/gemini-cli) 改造而来（[详情请见](./README.gemini.md)），并针对 [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder) 模型进行了专门优化。它通过先进的代码理解能力、自动化任务和智能辅助功能，显著提升你的开发工作流效率。

## 🚀 为什么选择 Qwen Code？

- 🎯 **免费额度：** 使用你的 [QwenChat](https://chat.qwen.ai/) 账户，可享受每分钟最多 60 次请求、每天最多 2000 次请求的免费额度。
- 🧠 **先进模型：** 专为 [Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder) 优化，提供卓越的代码理解和辅助能力。
- 🏆 **全面功能：** 包含 subagents、Plan Mode、TodoWrite、视觉模型支持，以及完整的 OpenAI API 兼容性——所有功能无缝集成。
- 🔧 **内置 & 可扩展工具：** 支持文件系统操作、shell 命令执行、网络抓取/搜索等功能，并可通过 Model Context Protocol (MCP) 轻松扩展，实现自定义集成。
- 💻 **面向开发者：** 为终端优先的工作流而生——非常适合命令行爱好者。
- 🛡️ **开源：** 采用 Apache 2.0 许可证，确保最大程度的自由与透明。

## 安装

### 环境要求

确保你已安装 [Node.js 20](https://nodejs.org/en/download) 或更高版本。

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### 通过 npm 安装

```bash
npm install -g @qwen-code/qwen-code@latest
qwen --version
```

### 从源码安装

```bash
git clone https://github.com/QwenLM/qwen-code.git
cd qwen-code
npm install
npm install -g .
```

### 使用 Homebrew 全局安装（macOS/Linux）

```bash
brew install qwen-code
```

## 快速开始

```bash

# 启动 Qwen Code
qwen

# 示例命令
> Explain this codebase structure
> Help me refactor this function
> Generate unit tests for this module
```

### 会话管理

通过可配置的 session limit 来控制 token 使用，以优化成本和性能。

#### 配置 Session Token Limit

在你的 home 目录下创建或编辑 `.qwen/settings.json` 文件：

```json
{
  "sessionTokenLimit": 32000
}
```

#### 会话命令

- **`/compress`** - 压缩对话历史记录，以便在 token 限制内继续对话
- **`/clear`** - 清除所有对话历史记录，重新开始
- **`/stats`** - 查看当前 token 使用情况和限制

> 📝 **注意**：会话 token 限制适用于单次对话，而非累计的 API 调用。

### 视觉模型配置

Qwen Code 支持智能视觉模型自动切换功能，能够检测你输入中的图像，并自动切换到支持视觉的模型进行多模态分析。**此功能默认开启**——当你在查询中包含图像时，系统会弹出对话框询问你如何处理视觉模型的切换。

#### 跳过切换对话框（可选）

如果你不希望每次都要看到交互式对话框，可以在 `.qwen/settings.json` 中配置默认行为：

```json
{
  "experimental": {
    "vlmSwitchMode": "once"
  }
}
```

**可用模式：**

- **`"once"`** - 仅针对当前查询切换到视觉模型，然后恢复
- **`"session"`** - 在整个会话期间切换到视觉模型
- **`"persist"`** - 继续使用当前模型（不切换）
- **未设置** - 每次显示交互式对话框（默认）

#### 命令行覆盖

你也可以通过命令行来设置行为：

```bash

# 每个查询切换一次
qwen --vlm-switch-mode once

# 整个会话期间切换
qwen --vlm-switch-mode session

# 永不自动切换
qwen --vlm-switch-mode persist
```

#### 禁用视觉模型（可选）

要完全禁用视觉模型支持，请在你的 `.qwen/settings.json` 中添加：

```json
{
  "experimental": {
    "visionModelPreview": false
  }
}
```

> 💡 **提示**：在 YOLO 模式（`--yolo`）下，当检测到图像时，视觉切换会自动进行，无需提示。

### 授权

根据你的需求选择首选的认证方式：

#### 1. Qwen OAuth（🚀 推荐 - 30 秒快速开始）

最简单的入门方式 - 完全免费且配额充足：

```bash

# 只需运行此命令并按照浏览器提示进行身份验证
qwen

**会发生什么：**

1. **即时设置**：CLI 自动打开你的浏览器
2. **一键登录**：使用你的 qwen.ai 账户进行身份验证
3. **自动管理**：凭证会缓存在本地，供以后使用
4. **无需配置**：零设置，直接开始编码！

**免费套餐权益：**

- ✅ **每天 2,000 次请求**（无需计算 token）
- ✅ **每分钟 60 次请求**的速率限制
- ✅ **自动凭证刷新**
- ✅ **个人用户零费用**
- ℹ️ **注意**：为了维持服务质量，可能会发生模型降级

#### 2. OpenAI 兼容 API

使用 OpenAI 或其他兼容提供商的 API key：

**配置方式：**

1. **环境变量**

   ```bash
   export OPENAI_API_KEY="your_api_key_here"
   export OPENAI_BASE_URL="your_api_endpoint"
   export OPENAI_MODEL="your_model_choice"
   ```

2. **项目 `.env` 文件**
   在项目根目录创建一个 `.env` 文件：
   ```env
   OPENAI_API_KEY=your_api_key_here
   OPENAI_BASE_URL=your_api_endpoint
   OPENAI_MODEL=your_model_choice
   ```

**API 提供商选项**

> ⚠️ **地区提示：**
>
> - **中国大陆用户**：推荐使用阿里云百炼或 ModelScope
> - **国际用户**：可使用阿里云 ModelStudio 或 OpenRouter

<details>
<summary><b>🇨🇳 中国大陆用户</b></summary>

**选项 1：阿里云百炼**（[申请 API Key](https://bailian.console.aliyun.com/)）

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**选项 2：ModelScope（免费额度）**（[申请 API Key](https://modelscope.cn/docs/model-service/API-Inference/intro)）

- ✅ **每日 2000 次免费调用**
- ⚠️ 需绑定阿里云账号，避免认证错误

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
export OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
```

</details>

<details>
<summary><b>🌍 国际用户</b></summary>

**选项 1：阿里云 ModelStudio**（[申请 API Key](https://modelstudio.console.alibabacloud.com/)）

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

**选项 2：OpenRouter（提供免费额度）**（[申请 API Key](https://openrouter.ai/)）

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_MODEL="qwen/qwen3-coder:free"
```

## 使用示例

### 🔍 探索代码库

```bash
cd your-project/
qwen

# 架构分析
> Describe the main pieces of this system's architecture
> What are the key dependencies and how do they interact?
> Find all API endpoints and their authentication methods
```

### 💻 代码开发

```bash

# 重构
> Refactor this function to improve readability and performance
> Convert this class to use dependency injection
> Split this large module into smaller, focused components

# 代码生成
> Create a REST API endpoint for user management
> Generate unit tests for the authentication module
> Add error handling to all database operations
```

### 🔄 自动化工作流

```bash

# Git 自动化
> Analyze git commits from the last 7 days, grouped by feature
> Create a changelog from recent commits
> Find all TODO comments and create GitHub issues
```

# 文件操作
> 将此目录中的所有图片转换为 PNG 格式
> 重命名所有测试文件，使其符合 *.test.ts 模式
> 查找并删除所有 console.log 语句

### 🐛 调试与分析

```bash
# 性能分析
> 识别此 React 组件中的性能瓶颈
> 在代码库中查找所有 N+1 查询问题

# 安全审计
> 检查潜在的 SQL 注入漏洞
> 查找所有硬编码的凭证或 API keys
```

## 常见任务

### 📚 理解新代码库

```text
> 核心业务逻辑组件有哪些？
> 实现了哪些安全机制？
> 数据在系统中是如何流转的？
> 使用了哪些主要的设计模式？
> 为此模块生成依赖关系图
```

### 🔨 代码重构与优化

```text
> 这个模块的哪些部分可以优化？
> 帮我重构这个类以遵循 SOLID 原则
> 添加适当的错误处理和日志记录
> 将回调函数转换为 async/await 模式
> 为耗时操作实现缓存机制
```

### 📝 文档与测试

```text
> 为所有公共 API 生成完整的 JSDoc 注释
> 为此组件编写包含边界情况的单元测试
> 创建 OpenAPI 格式的 API 文档
> 添加内联注释解释复杂算法
> 为此模块生成 README 文件
```

### 🚀 开发加速

```text
> 设置一个带身份验证的新 Express 服务器
> 创建一个包含 TypeScript 和测试的 React 组件
> 实现限流中间件
> 为新 schema 添加数据库迁移
> 为此项目配置 CI/CD 流水线
```

## 命令与快捷键

### Session Commands

- `/help` - 显示可用命令
- `/clear` - 清除对话历史
- `/compress` - 压缩历史记录以节省 token
- `/stats` - 显示当前会话信息
- `/exit` 或 `/quit` - 退出 Qwen Code

### Keyboard Shortcuts

- `Ctrl+C` - 取消当前操作
- `Ctrl+D` - 退出（在空行时）
- `Up/Down` - 导航命令历史