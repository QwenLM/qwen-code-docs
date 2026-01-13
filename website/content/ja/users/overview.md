# Qwen Code 概要

[![@qwen-code/qwen-code ダウンロード数](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code バージョン](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Qwen Code について学びましょう。Qwen のエージェント型コーディングツールで、ターミナル内で動作し、アイデアをこれまで以上に速くコードに変換するのを支援します。

## 30秒で開始

前提条件:

- [Qwen Code](https://chat.qwen.ai/auth?mode=register) アカウント
- [Node.js 20+](https://nodejs.org/ja/download) が必要です。`node -v` コマンドでバージョンを確認できます。インストールされていない場合は、以下のコマンドでインストールしてください。

### Qwen Code をインストール:

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

**Qwen OAuth (無料)** 認証を選択し、プロンプトに従ってログインしてください。次に、コードベースの理解から始めましょう。以下のコマンドのいずれかを試してください:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

初回使用時にログインを求められます。これだけです！[クイックスタート (5分) に進む →](./quickstart)

> [!tip]
>
> 問題が発生した場合は [トラブルシューティング](./support/troubleshooting) を参照してください。

> [!note]
>
> **新規 VS Code 拡張機能 (ベータ版)**: グラフィカルなインターフェースをご希望ですか？新しい **VS Code 拡張機能** は、ターミナル操作に慣れていない方でも簡単に使えるネイティブ IDE エクスペリエンスを提供します。マーケットプレイスからインストールし、サイドバーで直接 Qwen Code を使ってコーディングを始めることができます。今すぐ [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) をダウンロードしてインストールしてください。

## Qwen Code があなたのためにできること

- **説明から機能を構築する**: Qwen Code に、_plain language_（平易な言葉）で何を作りたいかを伝えてください。Qwen Code は計画を立て、コードを書き、動作することを確認します。
- **デバッグと問題の修正**: バグを説明するか、エラーメッセージを貼り付けてください。Qwen Code はあなたのコードベースを分析し、問題を特定して修正を実装します。
- **任意のコードベース内をナビゲートする**: チームのコードベースについて何でも質問すると、適切な回答が返ってきます。Qwen Code はプロジェクト全体の構造を把握しており、Web から最新情報を取得することができ、[MCP](./features/mcp) を使用すれば Google Drive や Figma、Slack などの外部データソースからも情報を取得できます。
- **面倒なタスクを自動化する**: 手間のかかるリンティングの問題を修正し、マージコンフリクトを解決し、リリースノートを書くことができます。これらすべてを、開発用マシンから1つのコマンドで実行するか、CI で自動的に実行できます。

## 開発者が Qwen Code を愛用する理由

- **ターミナルで動作**: また別のチャットウィンドウではありません。また別の IDE でもありません。Qwen Code は、あなたが既に使っているツールとともに、既に作業している場所で出会います。
- **アクションを実行**: Qwen Code はファイルを直接編集したり、コマンドを実行したり、コミットを作成したりできます。さらに必要ですか？[MCP](./features/mcp) を使えば、Qwen Code は Google Drive の設計ドキュメントを読み取り、Jira のチケットを更新したり、_あなたの_ カスタム開発者ツールを利用したりできます。
- **Unix フィロソフィー**: Qwen Code は構成可能でスクリプト化できます。`tail -f app.log | qwen -p "このログストリームに異常が表示されたら Slack で通知してください"` といった処理が _実際に動作します_。CI は `qwen -p "新しいテキスト文字列がある場合、フランス語に翻訳して @lang-fr-team がレビューできるよう PR を作成してください"` を実行できます。