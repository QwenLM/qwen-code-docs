# Qwen Code ドキュメントへようこそ

このドキュメントでは、Qwen Code のインストール、使用方法、開発に関する包括的なガイドを提供します。このツールを使うと、コマンドラインインターフェースを通じて AI モデルとやり取りできます。

## 概要

Qwen Code は、高度なコードモデルの機能を対話型の Read-Eval-Print Loop (REPL) 環境でターミナルに持ち込みます。Qwen Code は、ローカルサーバー（`packages/core`）と通信するクライアントサイドアプリケーション（`packages/cli`）で構成されています。また、Qwen Code には、ファイルシステム操作、シェルの実行、Web リクエストなどを行うためのさまざまなツールが含まれており、これらは `packages/core` によって管理されています。

## ドキュメントのナビゲーション

このドキュメントは以下のセクションに分かれています：

- **[実行とデプロイ](./deployment.md)：** Qwen Code を実行するための情報。
- **[アーキテクチャ概要](./architecture.md)：** コンポーネントとその相互作用を含む、Qwen Code の高レベル設計を理解します。
- **CLI Usage：** `packages/cli` のドキュメント。
  - **[CLI イントロダクション](./cli/index.md)：** コマンドラインインターフェースの概要。
  - **[コマンド](./cli/commands.md)：** 利用可能な CLI コマンドの説明。
  - **[設定](./cli/configuration.md)：** CLI の設定に関する情報。
  - **[チェックポイント](./checkpointing.md)：** チェックポイント機能のドキュメント。
  - **[拡張機能](./extension.md)：** 新しい機能で CLI を拡張する方法。
  - **[IDE との連携](./ide-integration.md)：** CLI をエディタに接続する方法。
  - **[テレメトリ](./telemetry.md)：** CLI 内のテレメトリの概要。
- **Core Details：** `packages/core` のドキュメント。
  - **[Core イントロダクション](./core/index.md)：** コアコンポーネントの概要。
  - **[Tools API](./core/tools-api.md)：** コアがツールを管理・公開する方法に関する情報。
- **Tools：**
  - **[ツールの概要](./tools/index.md)：** 利用可能なツールの概要。
  - **[ファイルシステムツール](./tools/file-system.md)：** `read_file` および `write_file` ツールのドキュメント。
  - **[マルチファイル読み込みツール](./tools/multi-file.md)：** `read_many_files` ツールのドキュメント。
  - **[シェルツール](./tools/shell.md)：** `run_shell_command` ツールのドキュメント。
  - **[Web フェッチツール](./tools/web-fetch.md)：** `web_fetch` ツールのドキュメント。
  - **[Web 検索ツール](./tools/web-search.md)：** `web_search` ツールのドキュメント。
  - **[メモリーツール](./tools/memory.md)：** `save_memory` ツールのドキュメント。
- **[サブエージェント](./subagents.md)：** 専門的なタスクに対応した AI アシスタントで、包括的な管理・設定・使用方法を提供します。
- **[貢献と開発ガイド](../CONTRIBUTING.md)：** 貢献者および開発者のための情報。セットアップ、ビルド、テスト、コーディング規則などを含みます。
- **[NPM Workspaces とパブリッシュ](./npm.md)：** プロジェクトのパッケージがどのように管理・公開されているかの詳細。
- **[トラブルシューティングガイド](./troubleshooting.md)：** 一般的な問題や FAQ の解決策を見つけます。
- **[利用規約およびプライバシー通知](./tos-privacy.md)：** Qwen Code の利用に適用される利用規約およびプライバシー通知に関する情報。

このドキュメントがあなたが Qwen Code を最大限に活用するお手伝いができることを願っています！