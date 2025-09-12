# CLIのアンインストール

CLIの実行方法によってアンインストール方法が異なります。npxを使用した場合と、グローバルなnpmインストールの場合のいずれかに応じて、以下の手順に従ってください。

## 方法1: npxを使用する場合

npxは、永続的なインストールなしに一時的なキャッシュからパッケージを実行します。CLIを「アンインストール」するには、このキャッシュをクリアする必要があります。これにより、qwen-codeおよび以前にnpxで実行した他のパッケージも削除されます。

npxのキャッシュは、メインのnpmキャッシュフォルダ内の`_npx`という名前のディレクトリです。`npm config get cache`を実行することで、npmキャッシュのパスを確認できます。

**macOS / Linuxの場合**

```bash

# パスは通常 ~/.npm/_npx です
rm -rf "$(npm config get cache)/_npx"
```

**Windowsの場合**

_Command Prompt_

```cmd
:: パスは通常 %LocalAppData%\npm-cache\_npx です
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# パスは通常 $env:LocalAppData\npm-cache\_npx です
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 方法2: npmを使用する（グローバルインストール）

CLIをグローバルにインストールした場合（例: `npm install -g @qwen-code/qwen-code`）、`npm uninstall`コマンドに`-g`フラグを付けて実行することで削除できます。

```bash
npm uninstall -g @qwen-code/qwen-code
```

このコマンドにより、パッケージがシステムから完全に削除されます。