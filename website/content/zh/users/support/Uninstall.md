# 卸载

卸载方法取决于您安装 CLI 的方式。

## 方法 1：使用 npx

npx 从临时缓存中运行包，无需永久安装。要“卸载”CLI，您需要清除此缓存，这将移除之前使用 npx 执行过的 `qwen-code` 以及任何其他包。

npx 缓存是一个名为 `_npx` 的目录，位于您的主 npm 缓存文件夹内。您可以通过运行 `npm config get cache` 来找到 npm 缓存路径。

**对于 macOS / Linux**

```bash
# The path is typically ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**对于 Windows**

_命令提示符_

```cmd
:: The path is typically %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# The path is typically $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 方法 2：使用 npm（全局安装）

如果您通过全局方式安装了 CLI（例如 `npm install -g @qwen-code/qwen-code`），请使用带 `-g` 标志的 `npm uninstall` 命令将其移除。

```bash
npm uninstall -g @qwen-code/qwen-code
```

该命令会从您的系统中完全删除此包。

## 方法 3：独立安装

如果您是通过独立安装程序（`curl ... | bash` 或 `irm ... | iex`）安装的，请使用专用的卸载脚本。

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

卸载程序会移除独立运行时、生成的 `qwen` 包装器以及安装程序管理的 PATH 更改。您的 Qwen Code 配置（`~/.qwen`）默认会被保留。