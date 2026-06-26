# アンインストール

アンインストール方法は、CLI をどのようにインストールしたかによって異なります。

## 方法 1: npx を使用した場合

npx は永続的なインストールを行わず、一時的なキャッシュからパッケージを実行します。CLI を「アンインストール」するには、このキャッシュをクリアする必要があります。これにより、qwen-code や npx で以前実行したその他のパッケージが削除されます。

npx キャッシュは、メインの npm キャッシュフォルダ内の `_npx` という名前のディレクトリです。npm キャッシュのパスは `npm config get cache` を実行して確認できます。

**macOS / Linux の場合**

```bash
# パスは通常 ~/.npm/_npx です
rm -rf "$(npm config get cache)/_npx"
```

**Windows の場合**

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

## 方法 2: npm（グローバルインストール）を使用した場合

CLI をグローバルにインストールした場合（例: `npm install -g @qwen-code/qwen-code`）、`npm uninstall` コマンドに `-g` フラグを付けて実行すると削除できます。

```bash
npm uninstall -g @qwen-code/qwen-code
```

このコマンドは、パッケージをシステムから完全に削除します。

## 方法 3: スタンドアロンインストールを使用した場合

スタンドアロンインストーラー（`curl ... | bash` または `irm ... | iex`）を使用してインストールした場合は、専用のアンインストールスクリプトを使用します。

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

アンインストーラーは、スタンドアロンランタイム、生成された `qwen` ラッパー、およびインストーラーが管理する PATH の変更を削除します。Qwen Code の設定（`~/.qwen`）はデフォルトで保持されます。