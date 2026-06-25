# Qwen Code overview

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Qwen Code について学びましょう。Qwen のエージェント型コーディングツールで、ターミナル上で動作し、アイデアをコードへと素早く変換できます。

## 30秒で始める

### Qwen Code のインストール:

推奨インストーラーは、お使いのプラットフォーム向けのスタンドアロンアーカイブが利用可能な場合にそれを使用します。npm にフォールバックする場合は、Node.js 22 以降と npm が PATH 上で利用可能である必要があります。

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
> インストール後、`qwen` がすぐに PATH で利用できない場合はターミナルを再起動することをお勧めします。インストールに失敗した場合は、クイックスタートガイドの [手動インストール](./quickstart#manual-installation) を参照してください。オフラインインストールの場合は、リリースアーカイブをダウンロードし、`--archive PATH` オプションでインストーラーを実行してください。`SHA256SUMS` はアーカイブと同じ場所に置いてください。

### Qwen Code を使い始める:

```bash
cd your-project
qwen
```

初回起動時にモデルプロバイダーの接続を求めるプロンプトが表示されます。メニューでは **Alibaba ModelStudio**（Coding Plan、Token Plan、または Standard API Key）、**Third-party Providers**（DeepSeek、MiniMax、Z.AI、OpenRouter などの組み込みプロバイダーで API キーを使って接続）、**Custom Provider**（ローカルサーバー、プロキシ、または未サポートのプロバイダー）を選択できます。[Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)（[intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）を使う場合は **Alibaba ModelStudio → Coding Plan** を選択し、ModelStudio API キーを使う場合は **Alibaba ModelStudio → Standard API Key** を選んで API セットアップガイド（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）に従ってください。まずはコードベースを理解するところから始めましょう。次のコマンドを試してみてください：

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

初回使用時にログインを求めるプロンプトが表示されます。以上です！ [クイックスタートへ進む（5分） →](./quickstart)

> [!tip]
>
> 問題が発生した場合は [トラブルシューティング](./support/troubleshooting) を参照してください。

> [!note]
>
> **新しい VS Code 拡張機能（ベータ版）**: グラフィカルなインターフェースをお好みですか？新しい **VS Code 拡張機能** は、ターミナルの知識がなくても使いやすいネイティブ IDE 体験を提供します。マーケットプレイスからインストールするだけで、サイドバーから直接 Qwen Code でコーディングを始められます。[Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) を今すぐダウンロードしてインストールしてください。

## Qwen Code でできること

- **説明からフィーチャーを構築**: 作りたいものを自然な言葉で Qwen Code に伝えるだけ。計画を立て、コードを書き、動作確認まで行います。
- **バグの調査と修正**: バグの説明やエラーメッセージを貼り付けてください。Qwen Code がコードベースを分析し、問題を特定して修正を実施します。
- **あらゆるコードベースのナビゲーション**: チームのコードベースについて何でも質問でき、的確な回答が得られます。Qwen Code はプロジェクト全体の構造を把握し、Web から最新情報を取得でき、[MCP](./features/mcp) を使えば Google Drive、Figma、Slack などの外部データソースからも情報を取得できます。
- **面倒な作業の自動化**: lint の細かい修正、マージコンフリクトの解消、リリースノートの作成など、すべて開発者マシンから単一のコマンドで、または CI 上で自動的に実行できます。
- **[フォローアップ候補](./features/followup-suggestions)**: Qwen Code が次に入力したい内容を予測し、ゴーストテキストとして表示します。Tab で確定、またはそのまま入力を続けると非表示になります。

## 開発者に愛される理由

- **ターミナルで動作**: 別のチャットウィンドウも、別の IDE も不要。Qwen Code はすでに使い慣れているツールとともに、あなたが作業する場所に存在します。
- **実際に動く**: Qwen Code はファイルの編集、コマンドの実行、コミットの作成を直接行えます。さらに必要なら、[MCP](./features/mcp) を使って Google Drive のデザインドキュメントを読んだり、Jira のチケットを更新したり、_あなた専用の_ 開発者ツールを活用したりできます。
- **Unix 哲学**: Qwen Code は組み合わせてスクリプト化できます。`tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` は _動作します_。CI から `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"` を実行することもできます。
