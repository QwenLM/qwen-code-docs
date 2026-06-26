# Qwen Code 概要

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Qwen Code について学びましょう。Qwen のエージェンティックコーディングツールはターミナル上で動作し、アイデアをこれまで以上に素早くコードに変えます。

## 30秒で始める

### Qwen Code をインストール:

推奨されるインストーラは、お使いのプラットフォームでスタンドアロンアーカイブが利用可能な場合、それを使用します。npm にフォールバックする場合、Node.js 22 以降と npm が PATH 上で利用可能である必要があります。

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> インストール後、`qwen` がすぐに PATH 上で利用可能にならない場合は、ターミナルを再起動することを推奨します。インストールに失敗した場合は、クイックスタートガイドの[手動インストール](./quickstart#manual-installation)を参照してください。オフラインインストールの場合は、リリースアーカイブをダウンロードし、`--archive PATH` を指定してインストーラを実行してください。`SHA256SUMS` はアーカイブと同じ場所に置いてください。

### Qwen Code を使い始める:

```bash
cd your-project
qwen
```

初回起動時に、モデルプロバイダーに接続するよう促されます。メニューには、**Alibaba ModelStudio** (Coding Plan、Token Plan、Standard API Key)、**サードパーティプロバイダー** (DeepSeek、MiniMax、Z.AI、OpenRouter などのビルトインプロバイダー。API key で接続)、**カスタムプロバイダー** (ローカルサーバー、プロキシ、またはサポート外のプロバイダー) があります。[Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([国際版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) を使用する場合は、**Alibaba ModelStudio → Coding Plan** を選択してください。ModelStudio API key を使用する場合は、**Alibaba ModelStudio → Standard API Key** を選択し、API 設定ガイド ([北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国際版](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) に従ってください。それでは、コードベースを理解することから始めましょう。次のコマンドのいずれかを試してみてください:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

初回使用時にログインを求められます。以上です！[クイックスタートに進む（5分）→](./quickstart)

> [!tip]
>
> 問題が発生した場合は[トラブルシューティング](./support/troubleshooting)を参照してください。

> [!note]
>
> **新しい VS Code 拡張機能 (ベータ版)**: グラフィカルインターフェースをお好みですか？新しい **VS Code 拡張機能** は、ターミナルに詳しくなくても使いやすいネイティブ IDE 体験を提供します。マーケットプレイスからインストールするだけで、サイドバーから直接 Qwen Code でコーディングを始められます。今すぐ [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) をダウンロードしてインストールしてください。

## Qwen Code が提供する機能

- **説明から機能を構築**: 作りたいものを平易な言葉で Qwen Code に伝えてください。計画を立て、コードを書き、動作することを確認します。
- **問題のデバッグと修正**: バグを説明するか、エラーメッセージを貼り付けてください。Qwen Code がコードベースを分析し、問題を特定し、修正を実装します。
- **あらゆるコードベースをナビゲート**: チームのコードベースについて何でも質問し、深い考察に基づく回答を得られます。Qwen Code はプロジェクト全体の構造を把握し、Web から最新情報を取得でき、[MCP](./features/mcp) を使用して Google Drive、Figma、Slack などの外部データソースから情報を引き出すこともできます。
- **面倒なタスクを自動化**: 細かい lint の問題の修正、マージコンフリクトの解決、リリースノートの作成など。これらすべてを開発マシンからの単一コマンド、または CI で自動的に実行できます。
- **[フォローアップ提案](./features/followup-suggestions)**: Qwen Code は次に入力したい内容を予測し、ゴーストテキストとして表示します。Tab キーを押して受け入れるか、そのまま入力を続けて却下します。

## 開発者が Qwen Code を愛する理由

- **ターミナルで動作**: また別のチャットウィンドウでも、別の IDE でもありません。Qwen Code は、あなたが既に作業している場所で、既に愛用しているツールとともにあなたに寄り添います。
- **アクションを実行**: Qwen Code はファイルの直接編集、コマンドの実行、コミットの作成が可能です。さらに必要なものは？[MCP](./features/mcp) により、Qwen Code は Google Drive の設計ドキュメントを読んだり、Jira のチケットを更新したり、_あなたの_カスタム開発者ツールを使用したりできます。
- **Unix 哲学**: Qwen Code は合成可能でスクリプト化可能です。`tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _動作します_。CI で `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"` を実行できます。