# アンインストール

アンインストール方法は、CLI のインストール方法によって異なります。

## 方法 1: npx を使用する場合

npx はパッケージを一時キャッシュから実行するため、永続的なインストールは行いません。CLI を「アンインストール」するには、このキャッシュをクリアする必要があります。これにより、qwen-code および npx で実行された他のパッケージも削除されます。

npx キャッシュは、メインの npm キャッシュフォルダ内の `_npx` というディレクトリです。npm キャッシュのパスは `npm config get cache` を実行して確認できます。

**macOS / Linux の場合**

```bash
# The path is typically ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Windows の場合**

_コマンドプロンプト_

```cmd
:: The path is typically %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# The path is typically $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 方法 2: npm（グローバルインストール）を使用する場合

CLI をグローバルにインストールした場合（例: `npm install -g @qwen-code/qwen-code`）、`-g` フラグを付けた `npm uninstall` コマンドで削除します。

```bash
npm uninstall -g @qwen-code/qwen-code
```

このコマンドでパッケージがシステムから完全に削除されます。

## 方法 3: スタンドアロンインストールの場合

スタンドアロンインストーラー（`curl ... | bash` または `irm ... | iex`）でインストールした場合は、専用のアンインストールスクリプトを使用します。

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

アンインストーラーはスタンドアロンランタイム、生成された `qwen` ラッパー、およびインストーラーが管理する PATH の変更を削除します。Qwen Code の設定（`~/.qwen`）はデフォルトで保持されます。
