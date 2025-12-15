# アンインストール

CLI の実行方法によってアンインストール方法が異なります。npx を使用した場合と、グローバルな npm インストールの場合のいずれかに応じて、以下の手順に従ってください。

## 方法 1: npx を使用する場合

npx は、永続的なインストールなしに一時キャッシュからパッケージを実行します。CLI を「アンインストール」するには、このキャッシュをクリアする必要があります。これにより、qwen-code および以前に npx で実行された他のパッケージも削除されます。

npx のキャッシュは、メインの npm キャッシュフォルダ内の `_npx` という名前のディレクトリです。`npm config get cache` を実行することで、npm のキャッシュパスを確認できます。

**macOS / Linux 向け**

```bash

# パスは通常 ~/.npm/_npx です
rm -rf "$(npm config get cache)/_npx"
```

**Windows 向け**

_コマンドプロンプト_

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

このコマンドにより、パッケージはシステムから完全に削除されます。