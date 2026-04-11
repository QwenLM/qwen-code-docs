## 自定义沙箱环境（Docker/Podman）

### 当前通过 npm 包安装后，暂不支持使用 BUILD_SANDBOX 功能

1. 要构建自定义沙箱，你需要访问源代码仓库中的构建脚本（`scripts/build_sandbox.js`）。
2. 这些构建脚本未包含在 npm 发布的包中。
3. 代码中包含硬编码的路径检查，会明确拒绝来自非源代码环境的构建请求。

如果你需要在容器内使用额外的工具（例如 `git`、`python`、`rg`），请创建自定义 Dockerfile。具体操作如下：

#### 1、首先克隆 Qwen Code 项目：https://github.com/QwenLM/qwen-code.git

#### 2、确保在源代码仓库目录下执行以下操作

```bash
# 1. First, install the dependencies of the project
npm install

# 2. Build the Qwen Code project
npm run build

# 3. Verify that the dist directory has been generated
ls -la packages/cli/dist/

# 4. Create a global link in the CLI package directory
cd packages/cli
npm link

# 5. Verification link (it should now point to the source code)
which qwen
# Expected output: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# Or similar paths, but it should be a symbolic link

# 6. For details of the symbolic link, you can see the specific source code path
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# It should show that this is a symbolic link pointing to your source code directory

# 7.Test the version of qwen
qwen -v
# npm link will overwrite the global qwen. To avoid being unable to distinguish the same version number, you can uninstall the global CLI first

```

#### 3、在你自己项目的根目录下创建沙箱 Dockerfile

- 路径：`.qwen/sandbox.Dockerfile`

- 官方镜像地址：https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# Based on the official Qwen sandbox image (It is recommended to explicitly specify the version)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# Add your extra tools here
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4、在你项目的根目录下构建首个沙箱镜像

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# Observe whether the sandbox version of the tool you launched is consistent with the version of your custom image. If they are consistent, the startup will be successful
```

这将基于默认沙箱镜像构建一个项目专属的镜像。

#### 移除 npm link

- 如果你想恢复 Qwen 的官方 CLI，请移除 npm link

```bash
# Method 1: Unlink globally
npm unlink -g @qwen-code/qwen-code

# Method 2: Remove it in the packages/cli directory
cd packages/cli
npm unlink

# Verification has been lifted
which qwen
# It should display "qwen not found"

# Reinstall the global version if necessary
npm install -g @qwen-code/qwen-code

# Verification Recovery
which qwen
qwen --version
```