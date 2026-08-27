# TUI デーモンアダプター草案

> **非推奨**: この文書は初期の `DaemonTuiAdapter` スパイクについて説明しています。レガシーアダプターは `packages/cli/src/ui/daemon/` にまだ存在しますが、再利用可能な方向性は現在 SDK 共有 UI トランスクリプトレイヤーに移行しています。現在のアーキテクチャについては、[`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md) を参照してください。

---

## 目標（歴史的）

フラグで制御される TUI トランスポートを追加し、インプロセスの `Config` + エージェントランタイムを作成する代わりに、`DaemonSessionClient` を介して `qwen serve` と通信します。

これは Mode B クライアント移行のための内部検証パスです。出力シンク、型付きデーモンイベント、セッションスコープのパーミッション、ライフサイクル診断が安定するまでは、デフォルトの TUI パスを置き換えてはなりません。

## 提案されるエントリポイント

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

オプション:

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

CLI は以下の両方が true でない限り、このモードを拒否します:

- `QWEN_DAEMON_URL` または `--daemon-url` が設定されている。
- `GET /capabilities` が `session_create`、`session_prompt`、`session_events` を通知している。

## 最小フロー

1. デーモンURLとトークンで `DaemonClient` を作成。
2. `/capabilities` を取得。
3. `DaemonSessionClient.createOrAttach()` で作成またはアタッチ。
4. `session.events()` をサブスクライブ。
5. `session.prompt()` でユーザープロンプトを送信。
6. `session.cancel()` でキャンセルをルーティング。
7. `session.setModel()` でモデル切り替えをルーティング。
8. `session.respondToPermission()` でパーミッション投票をルーティング。

## レンダリング契約

最初の実装では、`DaemonTuiAdapter` を追加します。これはローカルで検証可能なレデューサー兼トランスポートスパイクです。以下のデーモンイベントのみをマッピングします:

| デーモンイベント                      | TUI の処理                                 |
| ------------------------------------- | ------------------------------------------ |
| `session_update` / `agent_message_chunk` | アシスタントテキストを追加                    |
| `session_update` / `agent_thought_chunk` | 思考テキストを追加                          |
| `session_update` / `tool_call`          | ツール呼び出しのライフサイクルを表示          |
| `permission_request`                    | 可能な場合は既存の確認UIを表示                |
| `permission_resolved`                   | 確認UIを閉じるか更新                        |
| `model_switched`                        | フッター/モデル表示を更新                    |
| `session_died`                          | 切断状態を表示し、ストリーミングを停止        |

未知のイベントは無視し、致命的エラーにしてはなりません。型付きイベントレデューサーは後続のプロトコルPRで導入されます。

このアダプターはまだデフォルトの Ink アプリに組み込まれていません。既存の対話型 TUI、JSONL、stream-json、デュアル出力の動作は変更されません。

## 明示的な非目標

- 現在の TUI インプロセスランタイムを削除しない。
- このPRで JSONL、stream-json、デュアル出力の動作を変更しない。
- TUI でファイル CRUD、MCP 管理、メモリ CRUD、プロバイダー/認証の変更をまだ公開しない。
- ブラウザ/ウェブの直接デーモン想定を行わない。これはターミナルのみです。

## マージの安全性

- デフォルトでオフ。
- 追加コードパス。
- 既存の CLI フラグの動作は変更しない。
- デーモンが利用できない場合、実験的パスは TUI 起動前に失敗し、ユーザーに `qwen serve` の実行を促す。

## 検証計画

- 合成デーモンイベントによるイベントからTUI状態へのマッピングのユニットテスト。
- プロンプト、キャンセル、モデル切り替え、パーミッション投票の転送のユニットテスト。
- 機能フラグが配線された際のフラグ/環境変数解析のユニットテスト。
- ローカルの `qwen serve` でのスモークテスト:
  - プロンプトテキストが TUI にストリーミングされる
  - キャンセルがアクティブなプロンプトを解決する
  - パーミッション要求を受け入れるか拒否できる
  - 再接続で追跡された `Last-Event-ID` が送信される

## デフォルト移行前のブロッカー

- 型付きデーモンイベントスキーマ。
- セッションスコープのパーミッションルート。
- JSONL / stream-json / デュアル出力パリティのための出力シンクリファクタリング。
- セッションライフサイクルのクローズ/削除セマンティクス。
- MCP、スキル、プロバイダー、ワークスペース環境のランタイム診断。