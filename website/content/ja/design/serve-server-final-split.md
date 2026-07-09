# serve server.ts の最終分割

## 目標

デーモンの動作を変更せずに、`packages/cli/src/serve/server.ts` の段階的な分割を継続します。今回の作業では、残りのインライン REST ハンドラ、小規模なミドルウェアヘルパー、ケイパビリティの構築、デバイスフローレジストリのセットアップ、およびレートリミターのセットアップを、焦点を絞った内部モジュールに移動します。`createServeApp()` は、デーモン状態、ミドルウェアの順序、ルート登録、ACP トランスポートのマウント、Web Shell フォールバック、および最終的なエラー処理の構成ポイントとして残ります。

## ミドルウェアとルートの順序

アセンブリ順序はデーモン契約の一部であり、`createServeApp()` で視覚的に監査可能でなければなりません。

1. same-origin `Origin` の削除
2. CORS とホストの許可リスト
3. 許可されたループバックセットアップにおける認証前の `/health` と `/demo`
4. アクセスログ
5. Web Shell の静的アセット
6. Bearer 認証
7. レート制限
8. JSON ボディパーサーと JSON パーサーエラーマッパー
9. 必要に応じた認証後の `/health` と `/demo`
10. デーモンのテレメトリ
11. REST ルートグループ
12. ACP HTTP および WebSocket ルート
13. Web Shell フォールバック
14. 最終エラーハンドラ

## 抽出された境界

`server/self-origin.ts`、`server/access-log.ts`、`server/rate-limiter-setup.ts`、および `server/error-handlers.ts` は、以前 `createServeApp()` にインラインで存在していた小規模なミドルウェア/セットアップブロックを所有します。これらは意図的に薄く作られており、`server.ts` での登録順序は同じに保たれます。

`server/serve-features.ts` は、言語コードリスト、音声文字起こしケイパビリティキャッシュ、および公開される機能エンベロープ入力の構築を所有します。そのキャッシュ無効化関数は、まだワークスペース設定の再読み込み/変更パスによって呼び出されます。

`server/device-flow-registry.ts` は、デフォルトの Qwen OAuth プロバイダーの登録、イベントシンクの配線、監査用の stderr ブレッドクラム、および `app.locals` レジストリのインストールを所有します。

`routes/capabilities.ts` は `GET /capabilities` を所有します。

`routes/workspace-mcp-control.ts` は、MCP の再起動/管理/ランタイムの追加/削除のミューテーションを所有します。

`routes/workspace-lifecycle.ts` は `/workspace/init` と `/workspace/reload` を所有します。

`routes/workspace-tools.ts` は `/workspace/tools/:name/enable` を所有します。

各ルートモジュールは、必要な依存関係のみを受け取ります。新しいモジュールはいずれも `server.ts` をインポートしないため、依存関係の方向が一方通行に保たれ、循環参照が回避されます。

## `server.ts` に残るもの

`server.ts` は引き続き、アプリの作成、バインドされたワークスペースの正規化、bridge/filesystem/workspace の構築、ミューテーションゲートの作成、ルートの順序付け、ACP HTTP/WebSocket のマウント、Web Shell の静的/フォールバック配置、および既存の呼び出し元によって消費される互換性エクスポートを所有します。

この PR でファイル行数を 200 行未満に抑える必要はありません。受け入れ基準は、インラインの REST エンドポイントハンドラを持たず、動作の順序を 1 か所で確認できるアセンブリファイルとして読み取れることです。

## 対象外

今回の作業では、レスポンスボディ、ステータスコード、ヘッダー、SSE フレーム、ACP の動作、認証ゲート、レート制限のティア、デバイスフローのセマンティクス、またはエラー分類を変更しません。`status.ts`、`event-bus.ts`、または `in-memory-channel.ts` の互換性シムを削除しません。過去のドキュメントの名前変更や、ルーターフレームワークの導入、ルート用の単一のゴッドコンテキストの導入も行いません。

## 監査ノート

ラウンド 1 ではアーキテクチャの境界を確認し、ルーターの抽象化を追加する代わりに、既存の `registerXRoutes(app, deps)` パターンを維持しました。

ラウンド 2 では依存関係の方向を確認し、どのルートモジュールにも `server.ts` をインポートさせずに、デバイスフロー/ランタイムのセットアップをヘルパーの背後に移動しました。

ラウンド 3 では障害パスを確認し、bridge のエラーマッピング、JSON ボディパーサーのエラー、厳密なミューテーションゲート、および client-id の検証呼び出しサイトの動作を維持しました。

ラウンド 4 では互換性を確認し、`run-qwen-serve.ts`、ACP HTTP 呼び出し元、およびテスト向けに `server.ts` からのパブリックエクスポートを保持しました。

ラウンド 5 ではテスト戦略を確認し、焦点を絞った `server.test.ts`、ルートテスト、ACP HTTP テスト、型チェック、ビルド、lint、インラインエンドポイントの grep、および `git diff --check` を使用します。