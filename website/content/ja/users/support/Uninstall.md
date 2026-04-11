# アンインストール

アンインストール方法は、CLI の実行方法によって異なります。npx を使用した場合と、npm でグローバルインストールした場合のいずれかに該当する手順に従ってください。

## 方法 1: npx を使用する場合

npx はパッケージを永続的にインストールせず、一時的なキャッシュから実行します。CLI を「アンインストール」するには、このキャッシュをクリアする必要があります。これにより、qwen-code や過去に npx で実行した他のパッケージがすべて削除されます。

npx のキャッシュは、メインの npm キャッシュフォルダ内にある `_npx` という名前のディレクトリです。npm キャッシュのパスは、`npm config get cache` を実行して確認できます。

**macOS / Linux の場合**

```bash
# The path is typically ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Windows の場合**

_コマンド プロンプト_

```cmd
:: The path is typically %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# The path is typically $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 方法 2: npm を使用する場合（グローバルインストール）

CLI をグローバルにインストールした場合（例: `npm install -g @qwen-code/qwen-code`）、`-g` フラグを指定した `npm uninstall` コマンドを使用して削除します。

```bash
npm uninstall -g @qwen-code/qwen-code
```

このコマンドを実行すると、パッケージがシステムから完全に削除されます。