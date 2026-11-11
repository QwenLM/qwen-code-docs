# Qwen Code 概要

[![@qwen-code/qwen-code ダウンロード数](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code) [![@qwen-code/qwen-code バージョン](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Qwen Code について学びましょう。これは Qwen のエージェント型コーディングツールで、ターミナル上で動作し、アイデアをコードに変換するプロセスをかつてないほど高速化します。

## 30秒で始める

### Qwen Code をインストール:

推奨インストーラーは、プラットフォーム向けにスタンドアロンアーカイブが利用可能な場合、それを使用します。npm にフォールバックする場合、PATH 上に Node.js 22 以降と npm が利用可能である必要があります。

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
> インストール後、`qwen` が PATH 上で即座に利用できない場合は、ターミナルの再起動を推奨します。インストールが失敗した場合は、クイックスタートガイドの[手動インストール](./quickstart#manual-installation)を参照してください。オフラインインストールの場合は、リリースアーカイブをダウンロードし、`--archive PATH` を指定してインストーラーを実行してください。`SHA256SUMS` はアーカイブと同じ場所に配置してください。

### Qwen Code の使用を開始:

```bash
cd your-project
qwen
```

初回起動時に、モデルプロバイダーに接続するよう促されます。メニューには [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) ([**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) の Qwen Plus または Pro サブスクリプションを使用)、**QwenCloud** (公式の推奨セットアップ)、**Alibaba ModelStudio**、**Third-party Providers** (DeepSeek、MiniMax、Z.AI、Kimi、OpenRouter などのビルトインプロバイダー。API キーで接続)、**Custom Provider** (ローカルサーバー、プロキシ、または未サポートのプロバイダー) が用意されています。

Qwen のサブスクリプションを使用するには、[**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) を選択して Qwen アカウントでサインインします。**Plus または Pro サブスクリプション**で **Qwen Code and Agent** にアクセスできます。まだサブスクリプションをお持ちでない場合は、[**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) で Plus または Pro をサブスクリプションしてから Qwen Code に戻り、[**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) を選択してください。

QwenCloud キーの場合、**QwenCloud → Token Plan** または **QwenCloud → Standard API Key** を選択し、プラットフォーム（中国または国際）を選択してください。詳細は [認証](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/) を参照してください。

[Alibaba Cloud Token Plan](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ([intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)) の場合、**Alibaba ModelStudio → Token Plan** を選択してください。ModelStudio API キーを使用する場合は、**Alibaba ModelStudio → Standard API Key** を選択し、API セットアップガイド ([北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) に従ってください。

次に、コードベースを理解することから始めましょう。以下のコマンドのいずれかをお試しください:

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
