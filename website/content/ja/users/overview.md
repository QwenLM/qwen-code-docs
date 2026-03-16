# Qwen Code の概要

[![@qwen-code/qwen-code のダウンロード数](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code のバージョン](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Qwen Code について学びましょう。Qwen のエージェント型コーディングツールで、ターミナル内で動作し、アイデアをこれまで以上に素早くコードに変換するのを支援します。

## 30 秒で始めましょう

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
> インストール後にターミナルを再起動することを推奨します。これにより、環境変数が正しく適用されます。インストールに失敗した場合は、クイックスタートガイドの「[手動インストール](./quickstart#manual-installation)」を参照してください。

### Qwen Code の使用を開始する：

```bash
cd your-project
qwen
```

認証方法として **Qwen OAuth（無料）** を選択し、ログインのためのプロンプトに従ってください。その後、コードベースの理解から始めましょう。以下のコマンドのいずれかを試してみてください：

```
このプロジェクトは何をするものですか？
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

初回起動時にはログインが求められます。以上です！[クイックスタート（5分）へ進む →](./quickstart)

> [!tip]
>
> 問題が発生した場合は、[トラブルシューティング](./support/troubleshooting) を参照してください。

> [!note]
>
> **新しい VS Code 拡張機能（ベータ版）**: グラフィカルなインターフェースを好む場合、新しい **VS Code 拡張機能** をご利用ください。これは、ターミナル操作に慣れていない方でも簡単に使えるネイティブ IDE 環境を提供します。マーケットプレイスからインストールするだけで、サイドバーからすぐに Qwen Code を使ってコーディングを始められます。今すぐ [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) をダウンロード・インストールしてください。

## Qwen Code があなたのために行うこと

- **記述から機能を構築**: Qwen Code に、平易な言葉で何を作りたいかを伝えます。Qwen Code は計画を立て、コードを書き、その動作を保証します。
- **デバッグと問題の修正**: バグの内容を説明するか、エラーメッセージを貼り付けてください。Qwen Code はあなたのコードベースを分析し、問題を特定して修正を実装します。
- **あらゆるコードベースをナビゲート**: チームのコードベースについて何でも質問できます。Qwen Code はプロジェクト全体の構造を把握しており、最新の情報をウェブから取得できます。また、[MCP](./features/mcp) を用いることで、Google Drive、Figma、Slack などの外部データソースからも情報を取得できます。
- **単調なタスクを自動化**: リントに関する細かい問題の修正、マージコンフリクトの解決、リリースノートの作成などを行います。これらはすべて、開発者マシンから単一のコマンドで実行可能であり、CI においても自動的に実行できます。

## 開発者が Qwen Code を愛する理由

- **ターミナルで動作**: また別のチャットウィンドウでも、また別の IDE でもありません。Qwen Code は、あなたがすでに作業している場所、そしてすでに愛用しているツールの上で動作します。
- **実行可能な操作**: Qwen Code はファイルを直接編集したり、コマンドを実行したり、コミットを作成したりできます。さらに機能が必要ですか？[MCP](./features/mcp) を使うと、Qwen Code が Google Drive 上の設計ドキュメントを読み取ったり、Jira のチケットを更新したり、あるいは _あなたの_ カスタム開発者ツールを活用したりできます。
- **Unix の哲学に則る**: Qwen Code は組み合わせ可能で、スクリプト化可能です。`tail -f app.log | qwen -p "このログストリームに異常が現れたら Slack で通知してください"` というコマンドが _そのまま動作します_。CI では `qwen -p "新しいテキスト文字列があれば、それらをフランス語に翻訳し、@lang-fr-team がレビューできるよう PR を作成してください"` を実行できます。