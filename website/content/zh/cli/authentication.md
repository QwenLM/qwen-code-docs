# 认证设置

Qwen Code 支持两种主要的认证方式来访问 AI 模型。请选择最适合你使用场景的方式：

1.  **Qwen OAuth（推荐）：**
    - 使用此选项通过你的 qwen.ai 账户登录。
    - 在首次启动时，Qwen Code 将引导你跳转到 qwen.ai 的认证页面。认证完成后，凭证将被缓存在本地，后续运行时可跳过网页登录步骤。
    - **要求：**
      - 有效的 qwen.ai 账户
      - 首次认证需要网络连接
    - **优势：**
      - 无缝访问 Qwen 模型
      - 自动刷新凭证
      - 无需手动管理 API key

    **快速开始：**

    ```bash
    # 启动 Qwen Code 并完成 OAuth 流程
    qwen
    ```

    CLI 会自动打开浏览器并引导你完成认证过程。

    **对于使用 qwen.ai 账户认证的用户：**

    **配额：**
    - 每分钟 60 次请求
    - 每天 2,000 次请求
    - 不适用 token 用量限制

    **费用：** 免费

    **说明：** 不同模型的具体配额未明确区分；为保障共享体验质量，可能会发生模型降级 fallback。

2.  **<a id="openai-api"></a>OpenAI 兼容 API：**
    - 使用 OpenAI 或其他兼容提供商的 API key。
    - 此方法允许你通过 API key 使用多种 AI 模型。

    **配置方式：**

    a) **环境变量：**

    ```bash
    export OPENAI_API_KEY="your_api_key_here"
    export OPENAI_BASE_URL="your_api_endpoint"  # 可选
    export OPENAI_MODEL="your_model_choice"     # 可选
    ```

    b) **项目 `.env` 文件：**
    在项目根目录下创建一个 `.env` 文件：

    ```env
    OPENAI_API_KEY=your_api_key_here
    OPENAI_BASE_URL=your_api_endpoint
    OPENAI_MODEL=your_model_choice
    ```

    **支持的提供商：**
    - OpenAI (https://platform.openai.com/api-keys)
    - 阿里云百炼
    - ModelScope
    - OpenRouter
    - Azure OpenAI
    - 任何兼容 OpenAI 的 API

## 切换认证方式

要在会话期间切换认证方式，请在 CLI 界面中使用 `/auth` 命令：

```bash

# 在 CLI 中输入：
/auth
```

这样你就可以重新配置认证方式，而无需重启应用程序。

### 使用 `.env` 文件持久化环境变量

你可以在项目目录或主目录中创建一个 **`.qwen/.env`** 文件。创建普通的 **`.env`** 文件也可以工作，但推荐使用 `.qwen/.env` 来将 Qwen Code 的变量与其他工具隔离。

**重要提示：** 某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）会自动从项目 `.env` 文件中排除，以防止干扰 qwen-code 的行为。请为 qwen-code 特定的变量使用 `.qwen/.env` 文件。

Qwen Code 会自动从它找到的**第一个** `.env` 文件中加载环境变量，搜索顺序如下：

1. 从**当前目录**开始，向上级目录移动到 `/`，对每个目录检查：
   1. `.qwen/.env`
   2. `.env`
2. 如果没有找到文件，则回退到你的**主目录**：
   - `~/.qwen/.env`
   - `~/.env`

> **重要提示：** 搜索会在遇到**第一个**文件时停止——变量**不会**在多个文件之间合并。

#### 示例

**项目特定的配置**（当你在项目目录内时，这些配置会优先生效）：

```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

**用户全局配置**（在任意目录下都生效）：

```bash
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## 非交互模式 / 无头环境

在非交互环境中运行 Qwen Code 时，你无法使用 OAuth 登录流程。  
此时必须通过环境变量来配置认证信息。

CLI 会自动检测是否运行在非交互式终端中，如果检测到并已配置相关环境变量，则会使用与 OpenAI 兼容的 API 方式进行认证：

1.  **OpenAI-Compatible API：**
    - 设置 `OPENAI_API_KEY` 环境变量。
    - 可选地设置 `OPENAI_BASE_URL` 和 `OPENAI_MODEL` 来指定自定义 endpoint。
    - CLI 将使用这些凭据向 API 提供商进行身份验证。

**无头环境示例：**

如果在非交互式会话中未设置上述任何环境变量，CLI 将报错并退出。

如需了解如何以编程方式和在自动化工作流中使用 Qwen Code 的完整指南，请参阅 [Headless Mode Guide](../headless.md)。