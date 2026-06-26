# IDE デーモンアダプター ドラフト

## 目標

VS Code 拡張機能の companion が Mode B を dogfood できるように、拡張機能ホストから `DaemonSessionClient` を介して `qwen serve` に接続します。

Webview はデーモンを直接呼び出してはいけません。拡張機能ホストがデーモンの URL、トークン、セッション ID、SSE のリプレイ状態を保持し、サニタイズされたアプリケーションイベントを webview に転送します。

## 提案するエントリポイント

VS Code 設定:

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

ローカル dogfood 用の環境変数によるフォールバック:

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## 最小フロー

1. 拡張機能ホストが `DaemonClient` を作成する。
2. `/capabilities` を取得し、ワークスペースの互換性を確認する。
3. `DaemonSessionClient.createOrAttach()` でセッションを作成またはアタッチする。
4. 拡張機能ホスト内で `session.events()` にサブスクライブする。
5. デーモンイベントを既存の webview メッセージに変換する。
6. ユーザーのプロンプトを `session.prompt()` で送信する。
7. キャンセル / モデル切り替えを `session.cancel()` および `session.setModel()` でルーティングする。
8. 権限の決定を `session.respondToPermission()` でルーティングする。

## 既存の ACP 接続との関係

最初の実装では、`AcpConnection` を置き換えるのではなく、兄弟関係の接続パスを導入します:

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

両方のパスは、可能な限り同じ高レベル webview コールバックにフィードする必要があります。イベントをまだ忠実にマッピングできない場合、デーモンパスは、静かにパリティを装うのではなく、未サポート状態の明確な警告を表示する必要があります。

この PR は、ローカルで検証可能な拡張機能ホストアダプターのスパイクとして `DaemonIdeConnection` を追加します。これはまだデフォルトの `QwenAgentManager` パスには組み込まれていないため、既存の VS Code の動作は ACP サブプロセスベースのままです。

## イベントマッピング契約

| デーモンイベント                          | IDE の処理                              |
| ----------------------------------------- | --------------------------------------- |
| `session_update` / `agent_message_chunk`  | 既存のアシスタントストリームコールバック |
| `session_update` / `agent_thought_chunk`  | 既存の思考中ストリームコールバック      |
| `session_update` / `tool_call`            | 既存のツール呼び出し更新コールバック    |
| `permission_request`                      | 既存の承認 UI コールバック              |
| `permission_resolved`                     | 承認 UI のクローズ/更新                  |
| `model_switched`                          | 可能な場合、既存のモデル状態コールバック |
| `session_died`                            | 切断 UI + 再接続手段の提供               |

未知のイベントは無視するか、デバッグメタデータとしてログに記録する必要があります。

## ランタイムの配置に関する UX

拡張機能は、デーモンの配置を可視化する必要があります:

- ワークスペース/ファイルはデーモンホストのパスである
- MCP サーバーはデーモンホスト上で動作する
- スキルはデーモンのファイルシステムから読み込まれる
- プロバイダーの認証情報はデーモンプロセスの環境で解決される

ローカルの VS Code 拡張機能、ローカルのブラウザプロファイル、ローカルの localhost サービス、またはローカルの SSH/kube 認証情報が自動的にデーモンで利用可能になることを暗示してはいけません。

## 明示的な非目標

- `AcpConnection` からのデフォルトの移行は行わない。
- Webview からデーモンへの直接転送は行わない。
- ファイルサービス境界が確定するまでは、IDE 経由のデーモン側ファイル CRUD は行わない。
- エディタ/ブラウザ/クリップボードへのリバース RPC はまだ行わない。
- 完全なリモートコントロール統合は行わない。

## マージの安全性

- 設定/環境変数でデフォルトオフ。
- 追加的な兄弟関係の接続パス。
- 既存の VS Code ACP サブプロセスパスは変更なし。
- デーモントークンが webview JavaScript に渡されることはない。

## 検証計画

- デーモンセッションファクトリの接続と SSE イベント消費の単体テスト。
- デーモンイベントから既存の拡張機能ホストコールバックへのマッピングの単体テスト。
- プロンプト、キャンセル、モデル切り替え、権限応答転送の単体テスト。
- フィーチャーフラグが配線されたときの設定/環境変数の解決の単体テスト。
- ローカル拡張機能ホストと `qwen serve` のスモークテスト:
  - プロンプトがチャットにストリーミングされる
  - キャンセルが機能する
  - 権限 UI がリクエストを解決できる
  - SSE 再接続が追跡された `Last-Event-ID` を使用する

## デフォルト移行前のブロッカー

- 型付けされたデーモンイベントスキーマ
- デーモンがスタンプするクライアント ID
- セッションスコープの権限ルート
- 読み取り専用のランタイム診断
- FileSystemService 境界と安全なファイル読み取りルート
- CLI/TUI パリティのための出力シンクのリファクタリング