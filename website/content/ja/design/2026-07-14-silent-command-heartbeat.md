# サイレントコマンドの Heartbeat

日付: 2026-07-14
ステータス: 実装済み

## 問題

出力を一切生成しないフォアグラウンドのシェルコマンドは、起動から完了までの間にイベントを発行しません。インタラクティブな TUI の利用ではこれで問題ありません — スピナーは動き続けます — が、ヘッドレスなコンシューマー（DataAgent などの ACP ゲートウェイ、`--output-format stream-json` のパイプライン）では、コマンドの実行期間中ずっとセッションが完全に無音になります。イベントストリームを監視しているゲートウェイは、「165 秒の SQL プローブがまだ実行中」と「実行チェーンが死んだ」を区別できないため、長時間実行されるサイレントなコマンドは、ユーザーからエージェントのハングとして報告されます。

このようなセッションの本番診断（DataAgent セッション `77255d98`、41 分のタスク、約 32 分がツール待機に費やされた）により、欠落している liveness シグナルが、シェルのタイムアウトセマンティクス（PR 1、別の変更）および todo の stop-guard（PR 3）と並ぶ 3 つの P0 信頼性修正の 1 つとして特定されました。

参考実装: Claude Code は出力ファイルを毎秒ポーリングし、内容が空でも進捗コールバックを呼び出し、スロットルされた最小ペイロードの `tool_progress` イベントを SDK コンシューマーに公開します。進捗がモデルのコンテキストに入ることは決してありません。

## ゴール

- フォアグラウンドのシェルコマンドがサイレントな間、それを必要とするコンシューマー（ACP クライアント、stream-json）に、構造化された liveness シグナルを定期的に発行する。
- 統計情報のみを持たせる — 経過時間、出力の経過時間、行数/バイト数、実効タイムアウト。コマンド出力は決して含めない。
- モデルのコンテキストに決して入れない。インタラクティブなコンシューマーのライブ出力表示を妨げない。

## ノンゴール

- タイムアウト時の自動バックグラウンド化（P1 項目として別途管理）。
- ライブのコマンド出力の ACP クライアントへのストリーミング（`content` フレーム）。
- MCP の `mcp_tool_progress` の ACP 経由での転送、サブエージェントの heartbeat の `AgentResultDisplay` への伝播、TUI 表示の拡張 — すべてフォローアップ事項。

## 設計

### イベントの形状

`ShellProgressData` は、既存の `McpToolProgressData` の先例を踏襲し、`packages/core/src/tools/tools.ts` の `ToolResultDisplay` ユニオンに加わり、共用のエクスポートされたガード `isShellProgressData` を持ちます:

```ts
interface ShellProgressData {
  type: 'shell_progress';
  elapsedMs: number; // monotonic, since post-PTY-init spawn
  lastOutputAgeMs?: number; // monotonic age of last output; absent = none yet
  totalLines?: number; // PTY/AnsiOutput path only
  totalBytes?: number; // PTY/AnsiOutput path only
  timeoutMs?: number; // effective timeout incl. 120s default; absent when disabled
}
```

時間は monotonic（`performance.now()` の差分）であるため、NTP 補正によるずれが生じません。同じ理由で `lastOutputAgeMs` はエポックのタイムスタンプではなく経過時間です。

### プロデューサー

`ShellToolInvocation.execute()` は、実行ハンドルを取得した後（PTY の dynamic-import の所要時間が、存在しないプロセスに対する heartbeat を生成しないようにするため）、かつ `updateOutput` コールバックが存在する場合にのみ、`setInterval` を開始します。各ティックは、完全なインターバルの間に表示の更新が発生しなかった場合にのみ heartbeat を発行します — このチェックは既存の `lastUpdateTime` のスロットル状態を再利用するため、出力が流れているコマンドは決して heartbeat を出しません。タイマーは、既存の末尾フラッシュ／タイムアウト警告タイマーと同じ 3 か所でクリアされます: サービスのスローの catch、結果の `finally`、`onAbort` です（中断後、kill から完了までのウィンドウ中の「まだ実行中」シグナルは嘘になるため）。

インターバルは `tools.shell.heartbeatIntervalMs`（settings → CLI config → core の `ConfigParameters` → `getShellHeartbeatIntervalMs()`、`defaultTimeoutMs` と同じチェーン）に由来し、デフォルトは 10 000 ms です。`0` で無効化します。

### コンシューマー

| コンシューマー                               | 動作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CoreToolScheduler` の liveOutputCallback | heartbeat を `outputUpdateHandler` に転送するが、liveOutput の置き換えと更新通知はスキップする — 統計オブジェクトが蓄積されたライブビューを空白にしてはならない。                                                                                                                                                                                                                                                                                                                                                                       |
| `useReactToolScheduler`（TUI）          | heartbeat を無視する。TUI はすでにスピナーを表示している。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `agent-core`（サブエージェントランタイム）        | heartbeat を無視する。ブロードキャストすると、サブエージェントビューの `liveOutputs` が上書きされてしまう。                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ACP の `Session.runTool`                  | `invocation.execute()` に update コールバックを渡す。heartbeat はファイア・アンド・フォーゲットの、meta のみの `tool_call_update { status: 'in_progress', _meta: { toolName, shellProgress } }` フレームになる。`execute()` が返った瞬間（スローを含む）に設定される `toolSettled` ゲートが、settle パスと競合するティックをドロップするため、クライアントが `completed` の後に `in_progress` を観測することは決してない。heartbeat のカウントと最終出力の経過時間は、既存のツール実行スパンに `shell.heartbeat_count` / `shell.last_output_age_ms` のスパン属性として記録される。 |
| stream-json                            | `createToolProgressHandler` が heartbeat を既存の `emitToolProgress` パイプラインに転送する（`tool_progress` ストリームイベント、`--include-partial-messages` でゲートされる）。`ToolProgressStreamEvent.content` は `McpToolProgressData \| ShellProgressData` に拡張される。                                                                                                                                                                                                                                                                           |
| desktop の `QwenAgent`                    | `handleToolCallUpdate` で `status: in_progress` の更新をスキップする — 以前はすべての `tool_call_update` をターミナルの `tool_result` に変換しており、最初の heartbeat でコマンドが空の結果とともに早期完了してしまうところだった。                                                                                                                                                                                                                                                                                                                                                            |
| channels の `DaemonChannelBridge`         | kind のない `in_progress` フレームを、不正な形式としてフラグを立てる代わりにドロップする（そこの `tool_call_update` は `kind` を要求するが、meta のみの heartbeat はそれを持たない）。                                                                                                                                                                                                                                                                                                                                                                            |
| web-shell デーモン UI ノーマライザー         | heartbeat フレームをドロップする — 正規化すると、ツールブロックの人間が読めるタイトルが、`_meta.toolName` から導出された素のツール名で上書きされてしまう。                                                                                                                                                                                                                                                                                                                                                                                      |

ACP の `ToolCallUpdate` は、id 以外のすべてのフィールドをオプションと定義し、`_meta` を拡張ポイントとしているため、プロトコルに準拠するクライアントは新しいフレームを無視します。ただし、この契約は自己強制ではありません: リポジトリ内の `tool_call_update` コンシューマーの全面的な調査により、フレームを誤処理する 3 つが見つかりました（desktop エージェント、デーモンチャネルブリッジ、web-shell ノーマライザー — 上記で修正済み、それぞれリグレッションテスト付き）。残りは（VS Code コンパニオン、acp-bridge のコンパクション、セッションエクスポート、デーモン TUI アダプター）条件付きでマージし、そのままでも heartbeat に対して安全です。パーミッションリクエストのパス（現在は開始通知を発行しない）では、heartbeat がクライアントがあるツール呼び出しについて目にする最初の更新になる可能性があります — これは既存の completed のみの更新と同じ順序契約です。

### なぜ ShellExecutionService ではないのか

サービス側の方が `lastOutputAt` の精度はわずかに高いですが、ツール層はすでにすべての出力イベントを観測しており、タイマーをそこに置くことは、PR 1 が同じファイルの中断前のセマンティクスを並行して作り替える中で、PTY/child_process/promote のライフサイクルをまたいでタイマーを管理することを意味しました。ユーザー向けの `!` シェルには heartbeat が不要なため、失うものはありません。

## 検証

- ユニット: プロデューサーのリズム/形状/クリーンアップ（`performance` を含むフェイクタイマー）、liveOutput の置き換えなしのスケジューラー転送、TUI フックの保持、ACP の meta のみのフレーム＋遅延 heartbeat のゲート、stream-json のイベント形状と partial-messages のゲート。
- E2E stream-json: `sleep 15` が `{type:'shell_progress', elapsedMs:10001, timeoutMs:30000}` を持つ `tool_progress` を生成し、出力統計フィールドはなし。
- E2E ACP（stdio JSON-RPC）: `tool_call` → heartbeat の `tool_call_update`（meta のみ、10 秒）→ `completed` で、末尾の `in_progress` なし。
- TUI（tmux）: サイレントなコマンドは通常のスピナー/経過時間行を表示。実行中や最終トランスクリプトへの JSON の漏れなし。
