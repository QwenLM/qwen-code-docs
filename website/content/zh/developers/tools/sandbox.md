## 自定义沙盒环境 (Docker/Podman)

### 目前，通过 npm 包安装后，该项目不支持使用 BUILD_SANDBOX 功能

1. 要构建自定义沙盒，你需要访问源码仓库中的构建脚本 (`scripts/build_sandbox.js`)。
2. 这些构建脚本不包含在 npm 发布的包中。
3. 代码中包含硬编码的路径检查，会明确拒绝来自非源码环境的构建请求。

如果你需要在容器中添加额外的工具（例如 `git`、`python`、`rg`），可以创建自定义 Dockerfile，具体操作如下：

#### 1、首先克隆 Qwen Code 项目，https://github.com/QwenLM/qwen-code.git

#### 2、确保在源码仓库目录中执行以下操作

```bash
# 1. 首先安装项目依赖
npm install

# 2. 构建 Qwen Code 项目
npm run build

# 3. 确认已生成 dist 目录
ls -la packages/cli/dist/

# 4. 在 CLI 包目录中创建全局链接
cd packages/cli
npm link

# 5. 验证链接（现在应该指向源码）
which qwen
# 预期输出：/xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# 或者类似的路径，但应该是一个符号链接

# 6. 查看符号链接的具体源码路径
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# 应该显示这是一个指向你源码目录的符号链接

# 7. 测试 qwen 版本
qwen -v
# npm link 会覆盖全局的 qwen。为避免相同版本号无法区分，可以先卸载全局 CLI
```

#### 3、在你项目的根目录下创建沙盒 Dockerfile

- 路径：`.qwen/sandbox.Dockerfile`

- 官方镜像地址：https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# 基于官方 Qwen 沙盒镜像（建议明确指定版本）
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# 在此处添加你的额外工具
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4、在你的项目根目录下创建第一个沙盒镜像

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# 观察启动的沙盒中你添加的工具版本是否与自定义镜像版本一致。如果一致，则启动成功
```

这将基于默认沙盒镜像构建一个项目特定的镜像。

#### 移除 npm link

- 如果你希望恢复 qwen 的官方 CLI，请移除 npm link

```bash
# 方法一：全局取消链接
npm unlink -g @qwen-code/qwen-code

# 方法二：在 packages/cli 目录中取消链接
cd packages/cli
npm unlink

# 验证是否已解除
which qwen
# 应显示 "qwen not found"

# 如有需要，重新安装全局版本
npm install -g @qwen-code/qwen-code

# 验证恢复
which qwen
qwen --version
```