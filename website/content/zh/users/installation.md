# 安装与更新

## 安装 Qwen Code

**Windows (PowerShell):**

```powershell
irm https://qwen-code.oss-accelerate.aliyuncs.com/install.ps1 | iex
```

**Linux / macOS:**

```sh
curl -fsSL 'https://qwen-code.oss-accelerate.aliyuncs.com/install.sh' | bash
```

## 验证可执行程序

安装完成后，打开新终端并执行：

```sh
qwen --version
qwen --help
```

使用本文档前先核对版本。旧版本的配置、认证流程和命令可能不同。如果找不到命令，请检查可执行程序所在目录是否已加入当前 shell 的 PATH。如果机器上有多份安装，请先确认 shell 实际启动的是哪一份，再排查配置。

本文档使用 `qwen` 作为可执行程序名称。

## 检查更新

对于配置了发行源的构建：

```sh
qwen update --check
```

此命令只检查更新，不安装。安装可用更新：

```sh
qwen update
```

`qwen update` 和 `qwen rollback` 只管理原生安装。通过 npm（`@qwen-code/qwen-code`）或 Homebrew（`qwen-code`）安装的，请使用对应的包管理器更新。

更新后重新启动 Qwen Code。已经运行的进程继续使用启动时加载的代码。没有配置发行源的构建不会自行轮询某个默认下载服务。

## 自动更新

配置了发行源的交互式构建可以在启动后检查更新。在用户配置中加入以下内容，可以关闭自动安装、保留更新通知：

```json
{
  "general": {
    "enableAutoUpdate": false,
    "enableAutoUpdateNotification": true
  }
}
```

两个值均设为 `false` 时，关闭自动安装和更新通知。这些设置控制交互式自动更新流程，显式执行更新命令是单独的操作。

## 回退版本

回到上次更新前的版本：

```sh
qwen rollback
```

此命令使用上次更新时在本地记录的前一个版本，不访问发行源。如果本地没有记录同一渠道的 1.x 旧版本，命令会失败，此时需要指定目标版本：

```sh
qwen rollback --to '<version>'
```

将 `<version>` 替换为早于当前生效版本的实际版本；当前版本或更新版本会被拒绝。本地没有的版本会从配置的发行源下载。回退成功后，自动更新暂停 24 小时。回退改变已安装的程序，不负责备份或恢复项目文件、配置或会话数据。

更新或回退失败时，保留错误信息和当前版本。重试前先检查发行源与网络连接，不要通过反复更换登录凭据解决下载失败。

## 下一步

继续阅读[快速开始](/zh/users/quickstart/)。程序无法启动时，参阅[故障排查](/zh/users/troubleshooting/)。

