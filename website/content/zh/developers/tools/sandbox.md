## 自定义沙箱环境（Docker/Podman）

### 当前，通过 npm 包安装后，项目不支持使用 `BUILD_SANDBOX` 功能

1. 若要构建自定义沙箱，需访问源代码仓库中的构建脚本（`scripts/build_sandbox.js`）。
2. 这些构建脚本未包含在 npm 发布的包中。
3. 代码中包含硬编码的路径检查，会明确拒绝来自非源码环境的构建请求。

如需在容器内添加额外工具（例如 `git`、`python`、`rg`），请创建自定义 Dockerfile。具体操作如下：

#### 1. 首先克隆 Qwen Code 项目：https://github.com/QwenLM/qwen-code.git

#### 2. 确保在源代码仓库目录下执行以下操作

```bash

# 1. 首先安装项目依赖
npm install

# 2. 构建 Qwen Code 项目
npm run build

# 3. 验证 `dist` 目录是否已生成
ls -la packages/cli/dist/

# 4. 在 CLI 包目录中创建全局链接
cd packages/cli
npm link

# 5. 验证链接（此时应指向源代码）
which qwen

# 期望输出：/xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen

# 或类似路径，但必须是一个符号链接

# 6. 如需查看符号链接的详细信息，可检查其具体指向的源代码路径
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code

# 输出应显示该路径为指向你本地源代码目录的符号链接

# 7. 测试 `qwen` 的版本
qwen -v

# `npm link` 会覆盖全局安装的 `qwen`。为避免因版本号相同而无法区分，建议先卸载全局 CLI

#### 3. 在你自己的项目根目录下创建沙箱 Dockerfile

- 路径：`.qwen/sandbox.Dockerfile`

- 官方镜像地址：https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash

# 基于官方 Qwen 沙箱镜像（建议显式指定版本）
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# 在此处添加你的额外工具
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. 在你项目根目录下构建首个沙箱镜像

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# 观察你启动的工具所使用的沙箱版本是否与你自定义镜像的版本一致。若一致，则启动成功
```

此步骤将基于默认沙箱镜像构建一个项目专属的镜像。

#### 移除 npm link

- 如果你想恢复 qwen 的官方 CLI，请移除 npm link

```bash

# 方法 1：全局取消链接  
npm unlink -g @qwen-code/qwen-code  

# 方法 2：在 packages/cli 目录中移除  
cd packages/cli  
npm unlink  

# 验证是否已解除链接  
which qwen  

# 此时应显示 “qwen not found”  

# 如有必要，重新安装全局版本  
npm install -g @qwen-code/qwen-code  

# 验证是否恢复  
which qwen  
qwen --version