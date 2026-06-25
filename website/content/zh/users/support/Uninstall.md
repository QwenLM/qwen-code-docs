# 卸载

卸载方式取决于你最初安装 CLI 的方法。

## 方法一：使用 npx

npx 从临时缓存运行软件包，不会进行永久安装。要"卸载" CLI，需要清除该缓存，这将移除 qwen-code 以及之前通过 npx 执行过的所有其他软件包。

npx 缓存是位于 npm 主缓存目录下名为 `_npx` 的文件夹。运行 `npm config get cache` 可查看 npm 缓存路径。

**macOS / Linux**

```bash
# 路径通常为 ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Windows**

_命令提示符_

```cmd
:: 路径通常为 %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# 路径通常为 $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 方法二：使用 npm（全局安装）

如果你通过全局方式安装了 CLI（例如 `npm install -g @qwen-code/qwen-code`），请使用带 `-g` 标志的 `npm uninstall` 命令将其移除。

```bash
npm uninstall -g @qwen-code/qwen-code
```

该命令会将软件包从系统中彻底删除。

## 方法三：独立安装包

如果你通过独立安装脚本（`curl ... | bash` 或 `irm ... | iex`）进行安装，请使用专用的卸载脚本。

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

卸载程序会移除独立运行时、生成的 `qwen` 包装脚本以及安装程序管理的 PATH 变更。你的 Qwen Code 配置（`~/.qwen`）默认会被保留。
