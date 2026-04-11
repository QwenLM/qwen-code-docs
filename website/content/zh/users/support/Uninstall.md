# 卸载

卸载方式取决于你运行 CLI 的方式。请根据使用的是 npx 还是全局 npm 安装，参考对应的说明。

## 方法 1：使用 npx

npx 会从临时缓存中运行包，不会进行永久安装。要“卸载”该 CLI，你需要清除此缓存，这将移除 qwen-code 以及之前通过 npx 运行过的其他所有包。

npx 缓存是位于主 npm 缓存文件夹内名为 `_npx` 的目录。运行 `npm config get cache` 即可查看 npm 缓存路径。

**macOS / Linux**

```bash
# The path is typically ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Windows**

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

如果你全局安装了该 CLI（例如 `npm install -g @qwen-code/qwen-code`），请使用带 `-g` 参数的 `npm uninstall` 命令将其卸载。

```bash
npm uninstall -g @qwen-code/qwen-code
```

该命令将从系统中彻底移除此包。