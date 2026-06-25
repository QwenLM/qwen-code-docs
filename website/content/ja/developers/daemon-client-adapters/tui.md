# TUI Daemon Adapter Draft

> **非推奨**: このドキュメントは初期の `DaemonTuiAdapter` スパイクを説明しています。レガシーアダプターは `packages/cli/src/ui/daemon/` に引き続き存在しますが、再利用可能な方向性は現在 SDK 共有 UI トランスクリプトレイヤーです。現在のアーキテクチャについては [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md) を参照してください。

---

## ゴール（歴史的背景）

インプロセスの `Config` とエージェントランタイムを作成する代わりに、`DaemonSessionClient` を通じて `qwen serve` と通信するフラグ制御の TUI トランスポートを追加します。

これは Mode B クライアント移行の内部検証パスです。出力シンク、型付きデーモンイベント、セッションスコープのパーミッション、ライフサイクル診断が安定するまで、デフォルトの TUI パスを置き換えてはなりません。

## 提案されたエントリーポイント

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

オプション:

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

CLI は次の両方の条件が満たされない限りこのモードを拒否する必要があります:

- `QWEN_DAEMON_URL` または `--daemon-url` が設定されている。
- `GET /capabilities` が `session_create`、`session_prompt`、および `session_events` をアドバタイズしている。

## 最小フロー

1. デーモン URL とトークンで `DaemonClient` を作成する。
2. `/capabilities` を取得する。
3. `DaemonSessionClient.createOrAttach()` で作成またはアタッチする。
4. `session.events()` をサブスクライブする。
5. `session.prompt()` でユーザープロンプトを送信する。
6. `session.cancel()` でキャンセルをルーティングする。
7. `session.setModel()` でモデル切り替えをルーティングする。
8. `session.respondToPermission()` でパーミッション投票をルーティングする。

## レンダリングコントラクト

最初の実装では `DaemonTuiAdapter` を追加します。これはローカルで検証可能なリデューサーとトランスポートスパイクです。以下のデーモンイベントのみをマッピングします:

| デーモンイベント                             | TUI の処理                                   |
| ---------------------------------------- | -------------------------------------------- |
| `session_update` / `agent_message_chunk` | アシスタントテキストを追加する               |
| `session_update` / `agent_thought_chunk` | 思考テキストを追加する                       |
| `session_update` / `tool_call`           | ツールコールのライフサイクルを表示する       |
| `permission_request`                     | 可能な場合は既存の確認 UI を表示する         |
| `permission_resolved`                    | 確認 UI を閉じるか更新する                   |
| `model_switched`                         | フッター/モデル表示を更新する                |
| `session_died`                           | 切断状態を表示してストリーミングを停止する   |

未知のイベントは無視する必要があり、致命的エラーにしてはなりません。型付きイベントリデューサーは後のプロトコル PR で追加されます。

アダプターはまだデフォルトの Ink アプリに組み込まれていません。既存のインタラクティブ TUI、JSONL、stream-json、デュアル出力の動作は変更されません。

## 明示的な非ゴール

- 現在の TUI インプロセスランタイムを削除しない。
- この PR で JSONL、stream-json、デュアル出力の動作を変更しない。
- ファイル CRUD、MCP 管理、メモリ CRUD、プロバイダー/認証の変更を TUI 経由で公開しない。
- ブラウザ/Web からデーモンへの直接接続を想定しない。これはターミナル専用です。

## マージの安全性

- デフォルトでオフ。
- 追加的なコードパス。
- 既存の CLI フラグの動作は変更されない。
- デーモンが利用できない場合、実験的パスは TUI を起動する前に失敗し、ユーザーに `qwen serve` を実行するよう伝える。

## 検証計画

- 合成デーモンイベントを使用してイベントから TUI 状態へのマッピングをユニットテストする。
- プロンプト、キャンセル、モデル切り替え、パーミッション投票の転送をユニットテストする。
- フィーチャーフラグが組み込まれたときのフラグ/環境変数の解析をユニットテストする。
- ローカルの `qwen serve` に対してスモークテストする:
  - プロンプトテキストが TUI にストリームされる
  - キャンセルがアクティブなプロンプトを解決する
  - パーミッションリクエストを承認または拒否できる
  - 再接続が追跡された `Last-Event-ID` を送信する

## デフォルト移行前のブロッカー

- 型付きデーモンイベントスキーマ。
- セッションスコープのパーミッションルート。
- JSONL / stream-json / デュアル出力パリティのための出力シンクリファクタリング。
- セッションライフサイクルのクローズ/削除セマンティクス。
- MCP、スキル、プロバイダー、ワークスペース環境のランタイム診断。
