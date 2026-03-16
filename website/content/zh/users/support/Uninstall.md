# 卸载

卸载方式取决于你运行 CLI 的方法。请根据你使用的是 `npx` 还是全局 npm 安装，选择对应的说明。

## 方法 1：使用 npx

`npx` 从临时缓存中运行包，并不进行永久安装。要“卸载”该 CLI，你需要清除此缓存，这将同时移除 `qwen-code` 及其他所有曾通过 `npx` 执行过的包。

`npx` 缓存是一个名为 `_npx` 的目录，位于你的主 npm 缓存文件夹内。你可以通过运行 `npm config get cache` 查看 npm 缓存路径。

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

## 方法 2：使用 npm（全局安装）

如果你已全局安装 CLI（例如：`npm install -g @qwen-code/qwen-code`），请使用带 `-g` 标志的 `npm uninstall` 命令将其卸载。

```bash
npm uninstall -g @qwen-code/qwen-code
```

该命令会从你的系统中彻底移除该软件包。