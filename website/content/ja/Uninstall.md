# CLI のアンインストール

CLI の実行方法によってアンインストール方法が異なります。npx を使用した場合と、グローバル npm インストールの場合のいずれかに該当する手順に従ってください。

## 方法 1: npx を使用する場合

npx は永続的なインストールなしに、一時的なキャッシュからパッケージを実行します。CLI を「アンインストール」するには、このキャッシュをクリアする必要があります。これにより、gemini-cli および以前に npx で実行した他のパッケージも削除されます。

npx のキャッシュは、メインの npm キャッシュフォルダ内の `_npx` という名前のディレクトリです。npm キャッシュのパスは、`npm config get cache` を実行することで確認できます。

**macOS / Linux 向け**

```bash

# パスは通常 ~/.npm/_npx です
rm -rf "$(npm config get cache)/_npx"
```

**Windows 向け**

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