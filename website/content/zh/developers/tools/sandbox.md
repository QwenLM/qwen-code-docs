## 自定义沙箱环境（Docker/Podman）

### 目前，项目不支持通过 npm 包安装后使用 BUILD_SANDBOX 功能

1. 要构建自定义沙箱，你需要访问源代码仓库中的构建脚本（scripts/build_sandbox.js）。
2. 这些构建脚本未包含在 npm 发布的包中。
3. 代码中包含了硬编码的路径检查，明确拒绝来自非源码环境的构建请求。

如果你需要在容器内使用额外的工具（例如 `git`、`python`、`rg`），请创建一个自定义 Dockerfile，具体操作如下

#### 1、首先克隆 qwen code 项目，https://github.com/QwenLM/qwen-code.git

#### 2、确保你在源代码仓库目录下执行以下操作

```bash

# 1. 首先安装项目的依赖
npm install

# 2. 构建 Qwen Code 项目
npm run build
```

# 3. 验证 dist 目录是否已生成
ls -la packages/cli/dist/

# 4. 在 CLI 包目录中创建全局链接
cd packages/cli
npm link

# 5. 验证链接（现在应该指向源代码）
which qwen

# 预期输出：/xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen

# 或类似的路径，但应该是符号链接

# 6. 关于符号链接的详细信息，可以看到具体的源代码路径
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code

# 应该显示这是一个指向你源代码目录的符号链接

# 7. 测试 qwen 的版本
qwen -v

# npm link 会覆盖全局的 qwen。为了避免无法区分相同的版本号，你可以先卸载全局 CLI
```

#### 3、在你自己的项目根目录下创建沙箱 Dockerfile

- 路径：`.qwen/sandbox.Dockerfile`

- 官方镜像地址：https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash

# 基于官方 Qwen 沙箱镜像（建议明确指定版本）
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# 在这里添加你的额外工具
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4、在项目根目录下创建第一个沙箱镜像

```bash
GEMINI_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# 观察你启动的工具沙箱版本是否与你自定义镜像的版本一致，如果一致则启动成功
```

这会基于默认沙箱镜像构建一个项目特定的镜像。

#### 移除 npm link

- 如果你想恢复 qwen 的官方 CLI，请移除 npm link

```bash
```

# 方法 1：全局取消链接
npm unlink -g @qwen-code/qwen-code

# 方法 2：在 packages/cli 目录中移除
cd packages/cli
npm unlink

# 验证是否已解除
which qwen

# 应该显示 "qwen not found"

# 如有必要，重新安装全局版本
npm install -g @qwen-code/qwen-code

# 验证恢复
which qwen
qwen --version
```