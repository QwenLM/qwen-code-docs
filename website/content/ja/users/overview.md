# Qwen Code の概要

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Qwen Code は、ターミナルで動作する Qwen のエージェント型コーディングツールです。アイデアをこれまで以上に高速にコードへ変換します。

## 30秒で始める

### Qwen Code のインストール:

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows（管理者として実行した CMD）**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> インストール後は環境変数を反映させるため、ターミナルを再起動することを推奨します。インストールに失敗した場合は、クイックスタートガイドの [手動インストール](./quickstart#manual-installation) を参照してください。

### Qwen Code の利用開始:

```bash
cd your-project
qwen
```

**Qwen OAuth (Free)** 認証を選択し、プロンプトに従ってログインしてください。次に、コードベースの理解から始めましょう。以下のコマンドのいずれかを試してみてください：

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

初回使用時にログインが求められます。これで完了です！[クイックスタートに進む（5分） →](./quickstart)

> [!tip]
>
> 問題が発生した場合は [トラブルシューティング](./support/troubleshooting) を参照してください。

> [!note]
>
> **新しい VS Code 拡張機能（ベータ版）**：GUI をご利用になりたいですか？新しい **VS Code 拡張機能** は、ターミナルの操作に慣れていなくても使いやすいネイティブ IDE 体験を提供します。マーケットプレイスからインストールするだけで、サイドバーで直接 Qwen Code を使ったコーディングを開始できます。今すぐ [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) をダウンロードしてインストールしてください。

## Qwen Code でできること

- **自然言語からの機能構築**: 作りたい機能を自然言語で Qwen Code に伝えるだけです。計画の立案、コードの記述、動作確認まで自動で行います。
- **デバッグと問題修正**: バグの説明やエラーメッセージを貼り付けるだけです。Qwen Code がコードベースを分析して問題を特定し、修正を適用します。
- **あらゆるコードベースのナビゲーション**: チームのコードベースについて何でも質問すれば、的確な回答が得られます。Qwen Code はプロジェクト全体の構造を把握しており、Web から最新情報を検索できるほか、[MCP](./features/mcp) を介して Google Drive、Figma、Slack などの外部データソースから情報を取得できます。
- **煩雑なタスクの自動化**: 細かい lint 問題の修正、マージコンフリクトの解決、リリースノートの作成など。開発マシンから単一コマンドで実行したり、CI で自動化したりできます。
- **[フォローアップ提案](./features/followup-suggestions)**: Qwen Code が入力したい次の内容を予測し、ゴーストテキストとして表示します。Tab キーで確定するか、そのまま入力を続けて無視できます。

## 開発者に選ばれる理由

- **ターミナルで動作**: 新たなチャットウィンドウも、新たな IDE も不要です。Qwen Code は、あなたが普段使い慣れたツールとワークフローの中で動作します。
- **アクションを実行**: Qwen Code はファイルの直接編集、コマンドの実行、コミットの作成が可能です。さらに拡張したい場合？[MCP](./features/mcp) を使えば、Google Drive の設計ドキュメントの参照、Jira チケットの更新、または _あなた専用の_ 開発ツールの利用も可能です。
- **Unix 哲学**: Qwen Code は組み合わせ可能でスクリプト化可能です。`tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _そのまま動作します_。CI で `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"` を実行することもできます。