# Qwen Code 概要

[![@qwen-code/qwen-code バージョン](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Qwen Code について学びましょう。Qwen のエージェント型コーディングツールで、ターミナル内で動作し、アイデアをこれまで以上に速くコードに変換するのを支援します。

## 30 秒で開始

前提条件:

- [Qwen Code](https://chat.qwen.ai/auth?mode=register) アカウント
- [Node.js 20+](https://nodejs.org/zh-cn/download) が必要です。`node -v` コマンドでバージョンを確認できます。インストールされていない場合は、以下のコマンドでインストールしてください。

### Qwen Code のインストール:

**NPM**(推奨)

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew**(macOS, Linux)

```bash
brew install qwen-code
```

### Qwen Code の使用を開始する:

```bash
cd your-project
qwen
```

**Qwen OAuth (無料)** 認証を選択し、プロンプトに従ってログインしてください。次に、コードベースを理解するために始めましょう。以下のコマンドのいずれかを試してください:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

初回使用時にログインを求められます。これだけです！ [クイックスタート (5 分) に進む →](./quickstart)

> [!tip]
>
> 問題が発生した場合は [トラブルシューティング](./support/troubleshooting) を参照してください。

> [!note]
>
> **新規 VS Code 拡張機能 (ベータ版)**: グラフィカルなインターフェースを好む方へ。新しい **VS Code 拡張機能** は、ターミナル操作に慣れていない方でも簡単に使えるネイティブ IDE エクスペリエンスを提供します。マーケットプレイスからインストールし、サイドバーで直接 Qwen Code を使ってコーディングを始められます。今すぐ [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) をダウンロードしてインストールしてください。

## Qwen Code があなたのためにできること

- **説明から機能を構築する**: Qwen Code に平易な言葉で構築したいものを伝えると、計画を作成し、コードを書き、動作することを確認します。
- **デバッグと問題の修正**: バグを説明したり、エラーメッセージを貼り付けたりすると、Qwen Code はコードベースを分析し、問題を特定して修正を実装します。
- **任意のコードベース内をナビゲートする**: チームのコードベースについて何でも質問すると、的確な回答を得られます。Qwen Code はプロジェクト全体の構造を把握し、Web から最新情報を取得でき、[MCP](./features/mcp) を使用して Google Drive、Figma、Slack などの外部データソースから情報を取得できます。
- **面倒なタスクを自動化する**: 面倒なリンティングの問題を修正し、マージコンフリクトを解決し、リリースノートを作成します。これらすべてを、開発マシンから 1 つのコマンドで実行するか、CI で自動的に実行できます。

## 開発者が Qwen Code を愛する理由

- **ターミナルで動作**: また別のチャットウィンドウではありません。また別の IDE でもありません。Qwen Code は、あなたが既に作業している場所で、既に気に入っているツールと共に動作します。
- **アクションを実行**: Qwen Code はファイルを直接編集したり、コマンドを実行したり、コミットを作成したりできます。さらに必要ですか？ [MCP](./features/mcp) を使えば、Qwen Code は Google Drive の設計ドキュメントを読み取り、Jira のチケットを更新したり、_あなたの_ カスタム開発者ツールを使用したりできます。
- **Unix フィロソフィー**: Qwen Code は構成可能でスクリプト化できます。`tail -f app.log | qwen -p "このログストリームに異常が表示されたら Slack で通知してください"` といった処理が _実際に動作します_。あなたの CI は `qwen -p "新しい文字列がある場合、フランス語に翻訳して @lang-fr-team がレビューできるように PR を作成してください"` を実行できます。
