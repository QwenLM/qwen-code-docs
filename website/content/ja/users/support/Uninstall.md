# アンインストール

CLI のアンインストール方法は、CLI を実行した方法によって異なります。`npx` を使用した場合と、npm を用いたグローバルインストールを行った場合のそれぞれに対応する手順に従ってください。

## 方法 1: `npx` を使用する場合

`npx` は、パッケージを一時的なキャッシュから実行し、永続的なインストールを行いません。したがって、CLI を「アンインストール」するには、このキャッシュをクリアする必要があります。これにより、`qwen-code` およびそれ以前に `npx` で実行された他のすべてのパッケージが削除されます。

`npx` のキャッシュは、メインの npm キャッシュフォルダ内にある `_npx` という名前のディレクトリです。npm キャッシュのパスは、`npm config get cache` コマンドを実行することで確認できます。

**macOS / Linux の場合**

```bash

# パスは通常 ~/.npm/_npx です
rm -rf "$(npm config get cache)/_npx"
```

**Windows の場合**

コマンドプロンプト

```cmd
:: パスは通常 %LocalAppData%\npm-cache\_npx です
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

PowerShell

```powershell

# パスは通常 $env:LocalAppData\npm-cache\_npx です
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 方法 2: npm を使用したグローバルインストールのアンインストール

CLI をグローバルにインストールした場合（例: `npm install -g @qwen-code/qwen-code`）、`npm uninstall` コマンドに `-g` フラグを指定して、これをアンインストールします。

```bash
npm uninstall -g @qwen-code/qwen-code
```

このコマンドにより、パッケージがシステムから完全に削除されます。