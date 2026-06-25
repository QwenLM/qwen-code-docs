# F2: Shared MCP Transport Pool — Design v2.2

> `daemon_mode_b_main` を対象とする（#4175 ブランチ戦略に基づく）。#4175 Wave 5 PR 23 を置き換える。
> **シングルPR納品**：メンテナーの機能凝集バッチガイダンスに準拠（2026-05-19）。
> Author: doudouOUC. Date: 2026-05-20. Revised: 2026-05-20 (v2.2 — 実装レビューのフォールドイン)。

---

## 0. 変更履歴

### v2.2 (2026-05-20) — PR #4336 実装 + 32件のレビューフォールドイン

PR #4336 は F2 を約4時間かけて 6つのアトミックコミット + 6つの修正コミットとして出荷した。Wenshao は3バッチに分けて累積レビューを行い、各バッチでインラインおよびクリティカルな修正が折り込まれた。以下の表は v2.1 との差分をレビューバッチごとに記録したものである。

#### v2.1 → 初回レビューバッチ（コミット1-4、wenshao C1-C7 + S1-S4）

| #   | 場所                                                       | 問題の内容                                                                                                                                                              | フォールドインコミット |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| C1  | `acpAgent.ts:269` — IDE クローズパス                         | プールのドレインは SIGTERM ハンドラーでのみ実行されていた。IDE 起動の通常クローズはOS回収まで エントリーをリークしていた。`await connection.closed` で SIGTERM のドレインをミラーリング | `ae0b296c4`    |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                       | `cancelDrainTimer` がフラップのたびに `maxIdleTimer` をリセットし、§6.3 のハードキャップを無効にしていた。今は `drainTimer` のみクリア。max-idle はエントリーの全ライフタイムにわたって保持   | `ae0b296c4`    |
| C3  | `mcp-pool-entry.ts:doRestart`                              | 再接続失敗でエントリーがゾンビ状態（`localStatus=CONNECTED`、`state='active'`、古いスナップショット）に残っていた。try/catch + 失敗時に `'failed'` へ遷移   | `ae0b296c4`    |
| C4  | `mcp-pool-entry.ts:forceShutdown`                          | `state='closed'` が await の後にセットされていたため、並行する `acquire` が `'active'` を観測して古い接続を返す可能性があった。先頭で同期的にセット                 | `ae0b296c4`    |
| C5  | `mcp-transport-pool.ts:drainAll`                           | 並行する `acquire` がドレイン中に新しいエントリーを生成する可能性があった。`draining` ミューテックスフラグ + クリア前に `await Promise.allSettled(spawnInFlight)` を追加             | `ae0b296c4`    |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                   | リスナーが `serverName` でフィルタリングされていなかった。全エントリーが全サーバーのステータス通知を受け取り、エントリー自身の `markActive` 書き込みもエコーバックされていた                  | `ae0b296c4`    |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`     | プールモードのゲートが `discoverAllMcpTools` に追加されたが `Incremental` には漏れていた。`/mcp refresh` がプールをバイパスし、セッションごとにクライアントを生成していた                           | `ae0b296c4`    |
| S1  | `session-mcp-view.ts:passesSessionFilter`                  | `excludeTools` が直接等価比較（括弧形式非対応）を使うことがドキュメントに記載されていなかった。`mcp-client.ts:isEnabled` との乖離                             | `ae0b296c4`    |
| S2  | `pid-descendants.ts` ドキュメントコメント                             | Windows 固有の `taskkill /F` ブランチが存在すると主張していたが、実際は Node が `process.kill('SIGTERM')` を `TerminateProcess` にポリフィルする                            | `ae0b296c4`    |
| S3  | `session-mcp-view.ts:applyTools` デバッグログ                 | 文字列に文字列補間ではなくリテラルの `"N"` が含まれていた。オペレーターには `applied 12 tools (filtered to N registered)` と表示されていた                                       | `ae0b296c4`    |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` ステータスコールバック | `() => CONNECTED` にハードコードされていたため、切断後に `aggregateStatusByName` が誤った値を返していた。`() => client.getStatus()` に変更                                             | `ae0b296c4`    |

#### コミット5 セルフレビューバッチ（R1-R3 小規模）

| #   | 場所                                            | 問題の内容                                                                                                                                           | フォールドインコミット |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| R1  | `server.test.ts:918` `/capabilities` エンベロープ   | テストが `getAdvertisedServeFeatures()`（トグルなし）をアサートしていたが、server.ts は `mcpPoolActive: opts.mcpPoolActive !== false`（デフォルトオン）を渡す。トグルを固定 | `3e68c00bc`    |
| R2  | `server.test.ts` デフォルトオンのカバレッジ | デフォルトオプションで起動してプールタグのアドバタイズを確認するテストがなかった。明示的な `mcpPoolActive: false` テストを追加                                            | `3e68c00bc`    |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`   | ドキュメントに「PR以前の SDK は新しい値を未知として汎用的に表示する」と書いてあったが、実際は `MCP_RESTART_REFUSED_REASONS.has(...)` が拒否してサイレントドロップになる    | `3e68c00bc`    |

#### 第2レビューバッチ（コミット1-5、wenshao R1-R10）

| #   | 場所                                                | 問題の内容                                                                                                                                                                          | フォールドインコミット |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                    | C2 の修正で `maxIdleTimer` はフラップをまたいで正しく保持されるようになったが、発火アクションはグレース期間内の再アタッチに関係なく `refs.size` に関わらず強制クローズしていた。5分後にツールが失われる可能性   | `72399f109`    |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`  | `releaseAllPooledConnections` + 毎パス全件の再取得で、MCP ツールが一瞬ゼロになるウィンドウが発生し、かつ全ドレインタイマーがバウンスしていた。目的の `(name, fingerprint)` との差分に変更 | `72399f109`    |
| WR3 | `mcp-pool-entry.ts:doRestart` スナップショットファンアウト      | 再起動で `toolsSnapshot`/`promptsSnapshot` が更新されてタイプイベントが発行されたが、そのストリームを購読している `SessionMcpView` インスタンスが存在しなかった。スナップショット後に `subscribers` を直接イテレート   | `72399f109`    |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount` | websocket を `subprocessCount` にカウントしていたが、websocket はリモートに接続するためローカルの子プロセスは存在しない。`'stdio'` のみに制限                                                                       | `72399f109`    |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`           | `${pid}` を `-Filter` 文字列に直接補間していた。エントリーポイントの `Number.isInteger` ガードで現在はインジェクションを防げているが、将来のガード緩和に備えて `$p` にバインドする多層防御 | `72399f109`    |
| WR6 | `mcp-pool-entry.ts` コンストラクター `cfg` フィールド                | `readonly cfg: MCPServerConfig` が暗黙的に公開されており、env の API キー / ヘッダー認証 / OAuth フィールドが露出していた。`private` に変更。唯一の外部リーダー用に新しい `transportKind` ゲッターを追加      | `72399f109`    |
| WR7 | `mcp-pool-events.ts` 早期エクスポート              | 5つの PoolEvent 型ガード + `Prompt` 再エクスポート + `PoolEntryConnectionStatus` に呼び出し元がゼロだった。削除。`MCPCallInterruptedError` は保持（設計 §13.4 の要件）                             | `72399f109`    |
| WR8 | `acpAgent.ts:269,300` プールドレインの重複        | SIGTERM + IDE クローズに同一の `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }` ブロックがあった。`drainPoolBeforeExit(label)` ヘルパーに抽出                          | `72399f109`    |

#### コミット6 セルフレビューバッチ（R1-R3 クリティカルレース）

| #   | 場所                                    | 問題の内容                                                                                                                                                               | フォールドインコミット |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | スロットリリースのレース: A がスポーン完了、B（異なるフィンガープリント、同名）がスポーン開始、A がドレイン。クローズコールバックが `entries` のみをチェック（B はまだ未登録）→ 早期リリース | `0e58a098f`    |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc | ワークスペーススコープのイベントが N セッションにファンアウト → N 個のリデューサーインクリメント。セッションをまたいで集計するコンシューマーは二重カウントになる。乗数を明記するようドキュメントコメントを更新           | `0e58a098f`    |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | 非同期ファンアウト中に `this.sessions.keys()` を直接イテレートしていた。並行する `killSession` がイテレーターを壊す可能性があった。`Array.from(...)` でスナップショット                               | `0e58a098f`    |

#### 第3レビューバッチ（コミット1-6、wenshao W1-W15）

| #   | 場所                                                           | 問題の内容                                                                                                                                                                                | フォールドインコミット |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                       | スポーン失敗で `statusChangeListener` が永続的にリークしていた（削除は `forceShutdown` のみ）。catch に `entry.forceShutdown('manual')` を追加                                                     | `4a3c5cd90`    |
| W2  | `mcp-pool-entry.ts:statusChangeListener` クロスチェック           | モジュールレベルの `serverStatuses` マップが複数フィンガープリントのエントリー間で共有されていた。A のトランスポートエラーが DISCONNECTED を書き込み、B のリスナーが B の `localStatus` を破壊していた。`client.getStatus()` チェックを追加 | `4a3c5cd90`    |
| W3  | `mcp-pool-entry.ts:doRestart` pid スウィープ                        | 再起動が `listDescendantPids` + `sigtermPids` をスキップしていた。`npx`/`uvx` でラップされた stdio を再起動するたびに実際の MCP 孫プロセスが孤立していた。切断前にスウィープを追加                           | `4a3c5cd90`    |
| W4  | `mcp-pool-entry.ts:doRestart` ドレインタイマーレース                 | 再起動のイールド中にドレインタイマーが発火 → `forceShutdown` がエントリーを削除 → `client.connect` が孤立プロセスを生成する可能性があった。`doRestart` の先頭に `cancelDrainTimer` + `state→active` を追加                    | `4a3c5cd90`    |
| W5  | `mcp-client-manager.ts:pooledConnections` デッドハンドル         | エントリーが `'failed'` に遷移した際、マネージャーがデッドな `PooledConnection` を永続保持していた。エントリーイベントを購読し、`'failed'` で退出（`get(name) === conn` ガードによる冪等性）               | `4a3c5cd90`    |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` 再入性 | 2つのパスがインターリーブして両方が `set(name, conn)` を呼び出す → 最初の接続がリークする可能性があった。`discoveryInFlight` ミューテックスを追加。2番目の呼び出し元は同じプロミスを待機。新しいリグレッションテストを追加             | `4a3c5cd90`    |
| W9  | `acpAgent.ts:parsePoolDrainMs` 厳密性                      | `Number.parseInt` が `'30000ms'` / `'30000abc'` を受け入れていた。厳密な `^\d+$` 正規表現を使用。不正値は stderr の警告 + デフォルトフォールバックで拒否                                                    | `4a3c5cd90`    |
| W10 | `mcp-transport-pool.ts:acquire` indexAttach の順序              | `indexAttach` が `entry.attach()` の前に `sessionToEntries` を変更していた。`attach` がスローした場合、逆インデックスマッピングが古くなる。`attach` 成功後に `indexAttach` を移動（高速パス・インフライトパスの両方）   | `4a3c5cd90`    |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                  | WR4 で stdio のみに制限した後も、ドキュメントが `stdio + websocket` と記載し続けていた。更新                                                                                                                  | `4a3c5cd90`    |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch         | プールされていないパスに W1 と同じ `statusChangeListener` リークがあった。同様にミラーリング: 切断前に `forceShutdown`                                                                                   | `4a3c5cd90`    |
| W15 | `bridge.ts:restartMcpServer` レスポンス                          | `as PoolEntries` キャストが不健全だった — ACP 子プロセスからの型なし JSON。`Array.isArray` チェック + エントリーごとの形状ガードを追加。不正なエントリーは stderr のブレッドクラムとともにスキップ                              | `4a3c5cd90`    |

#### 却下（F2 フォローアップとして登録）

| #   | 場所                                                | 却下理由                                                                                                                                                                             |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7  | テストカバレッジのギャップ（4つの未テストクリティカルパス）      | 1/4 を追加（W6 リグレッションテスト）。残りは F2 シリーズマージ後の専用テストカバレッジ PR に延期                                                                                 |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` 未使用 | 延期された health-monitor 駆動の再接続（設計 §6.6）のための前方互換プレースホルダー。削除と再追加はパブリック型をかき回すことになる                                          |
| W11 | 高速パス / インフライトパスのアタッチブロックの重複  | ✅ PR A で完了: `attachPooledSession` + `rollbackReservationOnSpawnFailure` プライベートヘルパー（コミット `2d546efca`）                                                                |
| W12 | `passesSessionFilter` の `applyTools` あたり O(M×N) | ✅ PR A で完了: `applyTools` / `applyPrompts` がパスごとにフィルター `Set` を一度だけ事前計算。述語がツールあたり O(1) になる（コミット `a4a855ab3`）                                      |
| R9  | `McpClientManager` コンストラクター 7個の位置引数センチネル      | ✅ PR A で完了: オプションオブジェクトコンストラクター + `mkManager` テストファクトリー（コミット `0cb1eaa27`）                                                                             |
| R10 | `pgrep -P <pid>` の PID・レベルごとのコスト             | ✅ PR A で完了: 単一の `ps -A -o pid=,ppid=` スナップショット + インメモリ BFS ウォーク。pgrep BFS は BusyBox <v1.28 / distroless のフォールバックとして保持（最終 PR A の一部としてランディング） |

#### バグ件数

- **3バッチ × 27件のクリティカル / 重要な修正** + ドキュメント / 提案のフォールドイン5件 = 合計 **32件のレビューフォールドイン**
- **2件のクリティカルレースは2回目の確認で初めて発覚**（6R1 スポーン中のスロットリリースレース、W6 ディスカバリー再入性）
- **サイレント障害はゼロ** — 全ての修正に `// F2 (#4175 commit X review fix — wenshao YN):` インラインブレッドクラムが付記され、元のレビューを指している

### v2.1 (2026-05-20) — シングルPR戦略 + 12件のレビューフォールドイン

| #      | 内容                                                                                                          | 理由                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| V21-1  | 6サブPR計画から**シングル機能凝集PR**（6つのアトミックコミット）に変更                           | メンテナーガイダンスに準拠（#4175 ブランチ戦略）。レビュアーは `git log -p` でコミットごとに読める         |
| V21-2  | プールに `sessionToEntries: Map<sid, Set<ConnectionId>>` 逆インデックスを追加（§6）                              | `releaseSession` が O(N エントリー) → O(セッションの参照数); 1000セッションスケールに必要                               |
| V21-3  | 再起動ルートに `?fingerprint=` クエリパラメーターを追加（§13.1）                                                        | 同名で複数フィンガープリントがある場合に特定エントリーのみ再起動したい場合に対応。今追加してもコストはほぼゼロ |
| V21-4  | スポーン失敗パスで予約済みスロットを明示的に解放（§6.1、§6.5）                                             | そうしないと次の health-monitor パスまでスロットがリークする。微妙な実バグ                                |
| V21-5  | 新しい §13.4: 再接続中のインフライトツール呼び出しのセマンティクス                                                | `MCPCallInterruptedError`。プールは自動リプレイを行わない（書き込みは安全でない）                            |
| V21-6  | 新しい §10.4: `/mcp disable X` が `SessionMcpView` の再適用をトリガー                                                | そうしないとセッション途中での無効化が既登録ツールを削除しない                                             |
| V21-7  | ステータスルートが生のフィンガープリントではなく `entryIndex` を公開（§8.3）                                                  | フィンガープリント変更による OAuth トークンローテーションのサイドチャネル露出を回避                                     |
| V21-8  | 再接続バックオフの仕様: stdio は固定5秒×3回、HTTP/SSE は指数バックオフ1/2/4/8/16秒×5回（§6.6）                     | v2 では未定義。HTTP はネットワークフラップに対してより長いリトライ予算が必要                                  |
| V21-9  | `canonicalOAuth(o)` が `{enabled: false}` ≡ `undefined` ≡ `null` を正規化（§5.1）                               | そうしないと機能的に等価な設定が異なるエントリーを生成する                                                |
| V21-10 | プールフォールバックヘルパーを「レガシーインプロセス取得」から `createUnpooledConnection` に改名（§5.3、§6.1）      | SDK MCP バイパスは恒久的なもので、レガシーではない                                                         |
| V21-11 | `drainAll(opts?)` が `timeoutMs` ウォールクロック予算付きの `Promise<void>` を返す（§17）                            | 呼び出し元はシャットダウン順序のためにドレイン完了を知る必要がある                                          |
| V21-12 | SDK リデューサーフィールド名を固定（Q1 解決済み）: `mcpBudgetWarningCount` などをスコープセマンティクスとともに JSDoc に保持 | PR 途中でパブリック API の名前を変更しない                                                                |
| V21-13 | Q3（デフォルトプールオン、`--no-mcp-pool` キルスイッチ）、Q4（HTTP/SSE オプトイン）、Q6（早期構築）を固定       | シングルPR納品。フラグゲートは不要                                                                        |
| V21-14 | R9/R10/R11 シングルPRリスクを追加（§23）                                                                        | レビュー疲労、daemon_mode_b_main マージコンフリクト、CI 時間                                               |
| V21-15 | 拡張機能アンインストールの孤立エントリー処理を `MAX_IDLE_MS` の自然回収に延期（§16.3）                      | 明示的な `invalidateByExtension` なし。モデルを統一                                                        |

### v2 (2026-05-20) — v1 スケッチからの初回レビューフォールドイン

| #   | 内容                                                                                                  | 理由                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| C1  | プールが**ツール + プロンプト**をファンアウト（以前: ツールのみ）                                                   | `McpClient` コンストラクターは両方のレジストリを受け取る。プールモードではプロンプトが無音でロストする       |
| C2  | **グローバル状態の共存**に関する新しいセクション（`serverStatuses` / `mcpServerRequiresOAuth` モジュール Maps） | クロスセッション共有は今日既に存在する。プールはそれを継承・形式化する                     |
| C3  | `connectToMcpServer` ファクトリーパスを F2-1 で `McpClient` クラスと**統合**                            | v1 はクラスのみリファクタリング。並行する非プールパスが残ることになる                       |
| C4  | アタッチ時のスナップショットリプレイ（earlyEvents スタイル）を `PoolEntry.attach()` に追加           | 新しいレース: セッションBがアタッチ → サブスクリプション確立前にサーバーが `tools/list_changed` を発行 |
| C5  | 並行取得の重複排除のための `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                  | v1 のテストマトリックスには記載されていたが、実装コントラクトに漏れていた                          |
| C6  | クロスプラットフォームの子孫 pid スウィープ（Linux/macOS pgrep、Windows wmic/PowerShell）                        | v1 では「opencode の `pgrep -P` をコピー」と書かれていたが、Unix 専用                                    |
| C7  | ツールオブジェクトのセッションごとの `trust` フィールド**コピー**                                     | trust は `DiscoveredMCPTool` に存在する。共有インスタンスはセッションごとの trust を混在させる            |
| C8  | HTTP/SSE トランスポートはプールへの**オプトイン**（デフォルト: stdio + websocket のみ）                           | 一部の MCP HTTP サーバーはトランスポートごとのセッション状態を保持する。共有は状態ブリードのリスクがある      |
| C9  | SDK MCP サーバー（`isSdkMcpServerConfig`）の明示的なバイパス                                               | `sendSdkMcpMessage` は設計上セッションごと                                                   |
| C10 | OAuth パスを明示的に **F3 に延期**                                                              | OAuth フローは PermissionMediator スタイルのルーティングが必要。F2 のスコープ外                            |
| C11 | 再起動ルートのセマンティクスを仕様化（name → 一致する全エントリー）                          | PR 17 の `POST /workspace/mcp/:server/restart` は以前は曖昧さがなかった（1エントリー）。今は1..N   |
| C12 | ステータスルートのリファクタリングセクション（新パス: `QwenAgent.getMcpPoolAccounting()`）                          | `httpAcpBridge.ts:733-770` は現在ブートストラップセッションのマネージャーを読んでいる。変更が必要       |
| C13 | 古い `tools/list_changed` ハンドラーガード用に `PoolEntry` にジェネレーションカウンターを追加                        | opencode パターン: `if (s.clients[name] !== client) return`                                 |
| C14 | サブPR内訳を4 → **6**に変更                                                                            | v1 は過小評価していた。A2/B1/B3/C6 にはそれぞれ実際の作業量がある                          |
| C15 | 遅延プール構築（N≥2 セッション確認時のみ）— オプション                                       | `qwen serve --foreground` シングルセッションでは恩恵がない。初期化コストを節約                    |

---

## 1. 目標 / 非目標

**目標**

- 1つのワークスペースの N セッションが、ユニークなサーバー設定ごとに1プロセスを共有 — フィンガープリントキー方式
- セッションごとの `ToolRegistry` / `PromptRegistry` ビューを保持（フィルタリング、trust）
- 再アタッチに対して堅牢な Refcount + grace-drain ライフサイクル
- クロスプラットフォームの子孫 PID クリーンアップ
- バジェットのガードレールをセッション単位からワークスペース単位へ昇格（PR 14 で予告済み）
- デーモン以外のスタンドアロン qwen との後方互換性（その場合はプールを構築しない）

**非目標（F2 スコープ）**

- クロスワークスペースプーリング（1 デーモン = 1 ワークスペースの不変条件は PR #4113 から引き継ぐ）
- クロスデーモンプーリング（スコープ外 — マルチプロセスオーケストレーターの領域）
- OAuth ルーティングの改修（F3 で `PermissionMediator` を使用）
- デーモン再起動をまたいだプールの永続化（インメモリのみ）
- 「プールセーフ」な HTTP サーバーの自動検出（opt-in フラグのみ）
- `MCPServerConfig` の差分によるエントリのインプレース変更（設定変更 → 新規エントリ作成、古いエントリはドレイン）

---

## 2. 現状（置き換え対象）

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**結合マップ（切り離すか引き回す必要があるもの）:**

| 結合                                                                               | 場所                                              | F2 での対応                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `McpClient` のコンストラクターが 1 つの ToolRegistry と 1 つの PromptRegistry に紐づく | mcp-client.ts:106-119                             | プールがトランスポートを保持し、`SessionMcpView`（セッションごと）がセッション固有のレジストリを保持する |
| `McpClient.discover()` がインラインで `toolRegistry.registerTool()` を呼び出す       | mcp-client.ts:178-198                             | 分割：`discoverAndReturn()` がスナップショットを返し、ビューが登録する                  |
| `ListRootsRequestSchema` ハンドラーが `workspaceContext.getDirectories()` をクロージャで参照する | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | プールの単一ワークスペース依存コンテキスト                                              |
| `workspaceContext.onDirectoriesChanged` リスナーが接続ごとに登録される                | mcp-client.ts:907                                 | プールがエントリごとに 1 回だけ登録する                                                |
| `McpClientManager` が ToolRegistry 内で `new` される                               | tool-registry.ts:199                              | オプションの `pool?` コンストラクターパラメーターを追加し、Config から注入する            |
| セッション単位のバジェット適用                                                        | mcp-client-manager.ts:91-95 コメント               | ステートマシンをプールに移動する                                                       |
| `serverDiscoveryPromises` によるサーバーごとの飛行中リクエストの重複排除               | mcp-client-manager.ts:350                         | プールに `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` を持つ                |
| `setMcpBudgetEventCallback` のセッションごとの登録                                   | acpAgent.ts:1851-1899                             | プールがイベントを emit し、`QwenAgent` が全セッションにブロードキャストする              |

**既に共有されている状態（プールが継承するが、導入するものではない）:**

| 状態                                          | 場所                             | 備考                                                              |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>` | mcp-client.ts:292 (モジュールレベル) | 現在はプロセス全体で共有；プールのキーは引き続き name を使用 → "any-CONNECTED-wins" |
| `mcpServerRequiresOAuth: Map<string, boolean>` | mcp-client.ts:302 (モジュールレベル) | 同上                                                              |
| `MCPOAuthTokenStorage` のディスク上トークン     | `~/.qwen/mcp-oauth/<name>.json`  | デーモンホストで共有；プールはより効率的に活用するだけ               |

---

## 3. 参照調査結果

| プロジェクト    | プール?            | キー                                          | ライフサイクル                                                                          | 参考にするパターン                                                                                                              |
| --------------- | ------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **claude-code** | なし、プロセスごと | `name + JSON.stringify(cfg)`（lodash.memoize）| `clearServerCache` + リモートバックオフ×5；stdio クラッシュ → `failed`                  | 無効化/キーイングのためのソート済みキー SHA-256 `hashMcpConfig`                                                                  |
| **opencode**    | あり、ワークスペースごと | サーバー**名のみ**（設定ハッシュなし）        | refcount なし / 退避なし / 再起動なし；Effect ファイナライザー + `pgrep -P` 再帰 SIGTERM | 子孫 PID スイープ、古いハンドラーガード（`if (s.clients[name] !== client) return`）、イベントバスによる `tools/list_changed` ファンアウト |

**F2 が各プロジェクトから継承するもの:** claude-code から設定ハッシュ（opencode が対応しないセッションごとの env/auth の差異を処理）、opencode から子孫 PID スイープ（npx/uvx のラッパーがリークする）。追加するもの：refcount + ドレイン（マルチクライアントデーモン）、自動再起動（長時間稼働デーモン）、プロンプトファンアウト、世代ガード。

---

## 4. アーキテクチャ

### 4.1 プロセス構成

```
HTTP daemon (packages/cli/src/serve, qwen serve)
  │ spawns
  ▼
ACP child (qwen --acp, single process per workspace)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── new, workspace-scoped, 1 instance
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (bound to daemon workspace)
  │     └── budget guardrails (PR 14 state machine, graduated to workspace)
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ pool injected   │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   legacy in-process
                                  → SessionMcpView            (standalone qwen)
                                    .applyTools/Prompts
                                    (filter + register into
                                     session's own registries)
```

**プールは ACP 子プロセスに存在し**、HTTP デーモンには存在しない。HTTP デーモンは既存の `bridge.client` extMethod サーフェス（`getMcpPoolAccounting`、`restartMcpServer`）を通じてプール状態を照会する。F2 のコードは `packages/acp-bridge/` ではなく、**`packages/core/src/tools/`**（`mcp-client-manager.ts` と同じ階層）に置かれる。

### 4.2 クラス図

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (bulk release for session teardown)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (workspace-scope)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (shutdown)
  └─ onBudgetEvent: (event) => void   (set by QwenAgent)

PoolEntry (internal)
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   (++ on reconnect; stale-event guard)
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection (handle returned to caller)
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (per session, per server)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (filters by include/exclude, decorates trust)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (removes its registrations)
```

---

## 5. プールキー（フィンガープリント）

### 5.1 ハッシュ化する正規フィールド

```ts
type PoolKey = string; // sha256 hex、最初の16文字で十分（現実的なN個でも衝突なし）
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] kでソート済み
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9: 機能的に同等なOAuth設定を正規化して、同じフィンガープリントに
 * まとめる。`{enabled: false}`、`undefined`、`null`、`{}` はすべて
 * 「OAuthなし」を意味する → すべて `null` を返す。
 */
function canonicalOAuth(o?: OAuthConfig | null): OAuthConfig | null {
  if (!o || !o.enabled) return null;
  return {
    enabled: true,
    clientId: o.clientId ?? null,
    scopes: o.scopes ? [...o.scopes].sort() : null,
    authorizationUrl: o.authorizationUrl ?? null,
    tokenUrl: o.tokenUrl ?? null,
  };
}

// 除外フィールド（セッション単位のフィルタ、トランスポートレベルではない）:
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 トランスポートクラスのゲーティング

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**デフォルト `pooledTransports = {stdio, websocket}`**。オペレーターはHTTP/SSEを以下の方法でオプトインできる:

- CLI: `--mcp-pool-transports=stdio,websocket,http,sse`
- 環境変数: `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**HTTP/SSEをデフォルト除外する理由**: 一部のMCP HTTPサーバー実装はTCP/SSEストリームに状態（認証コンテキスト、会話メモリ）をバインドしており、複数のACPセッションが共有すると状態が漏洩する。stdioとwebsocketは、状態を観測・分離可能な真のOSプロセスである。

### 5.3 SDK MCPのバイパス

`isSdkMcpServerConfig(cfg)` が真の場合 → プールは `createUnpooledConnection(name, cfg, sid)` 経由で薄い `PooledConnection` ラッパーを返す。これは即座に `McpClient` を構築し、共有もプールへの登録も行わない。理由: `sendSdkMcpMessage` は設計上セッション単位（ACPコントロールプレーンを通じて元のセッションにルーティングされる）。`pooledTransports`（§10.3）にトランスポートが含まれない場合のHTTP/SSEでも同じパスを使用する。

V21-10: 名称は `createUnpooledConnection` であり、`legacyInProcessAcquire` ではない — SDK MCPとHTTPオプトアウトは永続的な設計上の選択であり、レガシーコードではない。

---

## 6. ライフサイクル

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2: 逆引きインデックス、O(refs)のreleaseSessionでO(entries)を回避。 */
  private sessionToEntries = new Map<string, Set<ConnectionId>>();

  async acquire(
    name: string,
    cfg: MCPServerConfig,
    sid: string,
  ): Promise<PooledConnection> {
    if (!isPoolable(cfg, this.opts)) {
      return this.createUnpooledConnection(name, cfg, sid);
    }
    const id: ConnectionId = `${name}::${fingerprint(cfg)}`;

    if (this.entries.has(id)) {
      this.indexAttach(sid, id);
      return this.entries.get(id)!.attach(sid);
    }
    let inFlight = this.spawnInFlight.get(id);
    if (!inFlight) {
      const slot = this.tryReserveSlot(name);
      if (slot === 'refused') {
        throw new BudgetExhaustedError(
          name,
          this.clientBudget!,
          this.reservedSlots.size,
        );
      }
      inFlight = this.spawnEntry(name, cfg, id)
        .catch((err) => {
          // V21-4: スポーン失敗時に予約済みスロットを解放する。
          // これがないと、ヘルスモニターのリリースパスが実行されるまで
          // スロットがリークする（監視対象のエントリが存在しないため
          // 実行されない）。
          if (slot === 'reserved') this.releaseSlotName(name);
          throw err;
        })
        .finally(() => this.spawnInFlight.delete(id));
      this.spawnInFlight.set(id, inFlight);
    }
    const entry = await inFlight;
    this.indexAttach(sid, id);
    return entry.attach(sid);
  }

  release(id: ConnectionId, sid: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.detach(sid);
    this.indexDetach(sid, id);
    if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
  }

  /** V21-2: O(全エントリ)ではなく、O(このセッションのrefs)。 */
  releaseSession(sid: string): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.detach(sid);
      if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
    }
    this.sessionToEntries.delete(sid);
  }

  private indexAttach(sid: string, id: ConnectionId): void {
    let ids = this.sessionToEntries.get(sid);
    if (!ids) {
      ids = new Set();
      this.sessionToEntries.set(sid, ids);
    }
    ids.add(id);
  }

  private indexDetach(sid: string, id: ConnectionId): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) this.sessionToEntries.delete(sid);
  }
}
```

### 6.2 同時取得の重複排除 (`spawnInFlight`)

`McpClientManager.serverDiscoveryPromises`（mcp-client-manager.ts:350）と同様のパターン。これがないと、起動時に5つのセッションが同時に `entries.has(id) === false` を検出し、5つの子プロセスを競って起動してしまう。

### 6.3 ドレイングレース + アイドル上限

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // 最後のリリース後のグレース期間
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // ハード上限（ドレインキャンセルループへの防御）
```

`PoolEntry` のステートマシン:

```
spawning ──spawn ok──► active ──last detach──► draining ──timeout──► closed
   │                     │                       │
   │                     │                       └──attach──► active (cancel timer)
   spawn fail───────────►failed
                          │
                          └──manual restart──► spawning
```

ハードアイドル上限: ドレインタイマーはacquire/releaseのフラップにより無限にキャンセル・再起動される可能性がある。`MAX_IDLE_MS` は**最初のアイドル時**に開始され、リセットされない別タイマーである。タイマーが発火すると、ドレインがアクティブなグレース期間中であっても強制クローズする。acquireとreleaseをスラッシングするバグのあるクライアントによるゾンビプールエントリを防ぐ。

### 6.4 クロスプラットフォームの子孫PIDスイープ

**R10 / R23 T7 / PR A更新（2026-05-22）**: ノードごとの1回の `pgrep -P <pid>` / `Get-CimInstance -Filter` サブプロセス呼び出しによるBFS方式から、プロセステーブルのスナップショット取得後にインメモリでツリー走査する方式に切り替えた。動機は2つ: (1) ホットなプールシャットダウンパスでの B^D フォークの代わりに1フォークで済む; (2) スナップショットの一貫性 — 修正前のBFSは隣接するBFSレベル間にフォークした子孫を見逃す可能性があった。BusyBox `ps` v1.28未満（`-o` 未サポート）および `ps` のないdistrolessコンテナ向けにフォールバックとしてPIDごとのパスを残している。

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // OSがオーファンを回収するため、プールシャットダウンは続行される。
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* フォールバックに進む */
  }
  if (tree) return walkDescendants(tree, root); // O(descendants), 1 fork
  return await listDescendantPidsUnixPgrepFallback(root); // レガシーBFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: 全プロセス（POSIX、BSDでは -e と等価だが曖昧さがない）。
  // -o pid=,ppid=: pid + ppidカラム、末尾の`=`でヘッダーを抑制。
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // 25万超のプロセスを持つ異常なホストに対応
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* パースしてchildrenByPpidにプッシュ */
  }
  return childrenByPpid;
}

// Windows: 全(ProcessId, ParentProcessId)行の単一 Get-CimInstance Win32_Process | ConvertTo-Csv スナップショット
// + インメモリ走査; フォールバックとして PID ごとの
// `Get-CimInstance -Filter "ParentProcessId=$p"` を保持。
```

`client.disconnect()` の前に `PoolEntry.shutdown()` から呼び出される。`npx @modelcontextprotocol/server-X`、`uvx ...`、`pnpm dlx ...` のラッパーリークを処理する。MAX_DESCENDANTS=256 / MAX_DEPTH=8 の上限は保持される。

### 6.5 スポーン失敗のハンドリング

複数のサブスクライバーがアタッチされた後（`spawnInFlight` 経由）に `spawnEntry` がリジェクトした場合:

- すべての待機者がリジェクションを受け取る
- `tryReserveSlot` は **`acquire` 内の明示的な `.catch` アームで解放される**（V21-4）; この修正がないとスロットは次のヘルスモニターパスまでリークするが、エントリが存在しないためそのパスは実行されない。
- 失敗したエントリは `entries` に保存されない
- サブスクライバーのコードパスは `acquire` が元々失敗したかのように処理する（既存のセッションごとの `discoverMcpToolsForServer` キャッチロジックは引き続き有効）

### 6.6 再接続バックオフ（V21-8）

`PoolEntry` がトランスポートの切断後に再接続に入る場合:

| トランスポートファミリー | 戦略                                         | 上限                                                             |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| stdio            | 固定 5秒 × 3回試行                        | 既存の `DEFAULT_HEALTH_CONFIG.reconnectDelayMs` に準拠            |
| websocket        | 固定 5秒 × 3回試行                        | stdioと同じ                                                    |
| http (opt-in)    | 指数バックオフ 1秒、2秒、4秒、8秒、16秒 × 5回試行 | リモートエンドポイントは一時的なネットワーク問題でフラップするため、より長いバジェット |
| sse (opt-in)     | 指数バックオフ 1秒、2秒、4秒、8秒、16秒 × 5回試行 | httpと同じ                                                     |

上限到達後: エントリは `failed` 状態に遷移し、サブスクライバーは `failed` イベントを受け取る。同じ `ConnectionId` に対する新しい `acquire` は1回スポーンを再試行し、その後スローする。オペレーターによる再起動（§13）で状態がリセットされる。

---

## 7. ディスカバリー / SessionMcpView

### 7.1 ツール + プロンプトのデュアルファンアウト

```ts
// packages/core/src/tools/mcp-client.ts — discoverを純粋な形に分割
async discoverAndReturn(cliConfig: Config): Promise<{
  tools: DiscoveredMCPTool[];
  prompts: Prompt[];
}> {
  if (this.status !== MCPServerStatus.CONNECTED) throw new Error('Client is not connected.');
  try {
    const [prompts, tools] = await Promise.all([
      discoverPrompts(this.serverName, this.client, /* no registry */),
      discoverTools(this.client, this.serverConfig, this.serverName, this.debugMode, this.workspaceContext),
    ]);
    if (prompts.length === 0 && tools.length === 0) {
      throw new Error('No prompts or tools found on the server.');
    }
    return { tools, prompts };
  } catch (e) {
    this.updateStatus(MCPServerStatus.DISCONNECTED);
    throw e;
  }
}

// レガシーの discover() は残し、discoverAndReturn + 登録に委譲（スタンドアロン qwen 向け）
async discover(cliConfig: Config): Promise<void> {
  const { tools, prompts } = await this.discoverAndReturn(cliConfig);
  for (const t of tools) this.toolRegistry.registerTool(t);
  for (const p of prompts) this.promptRegistry.registerPrompt(p);
}
```

```ts
class SessionMcpView {
  applyTools(snapshot: DiscoveredMCPTool[]) {
    this.sessionToolRegistry.removeToolsByServer(this.serverName);
    for (const tool of snapshot) {
      if (!this.passesFilter(tool)) continue;
      // C7: セッションごとの信頼コピー（共有スナップショットを変更しない）
      const localTool = tool.withTrust(this.cfg.trust);
      this.sessionToolRegistry.registerTool(localTool);
    }
  }
  applyPrompts(snapshot: Prompt[]) {
    this.sessionPromptRegistry.removePromptsByServer(this.serverName);
    for (const p of snapshot) this.sessionPromptRegistry.registerPrompt(p);
  }
}
```

### 7.2 アタッチ時のスナップショット再生（earlyEvents スタイル）

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // 現在のスナップショットを即座に再生し、進行中の discover 完了と
    // アタッチの間に発生した更新をサブスクライバーが見逃さないようにする
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

PR 14b の修正 #1 にある `BridgeClient.earlyEvents` パターンと同様 — プールへのアタッチにおける類似のレースコンディションを解決する。

### 7.3 ステールハンドラーガード（世代カウンター）

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // 別の再接続によって上書きされた
    const snap = await this.client.discoverAndReturn(this.cfg);
    if (myGen !== this.generation) return;
    this.toolsSnapshot = snap.tools;
    this.promptsSnapshot = snap.prompts;
    this.fanOut('toolsChanged');
    this.fanOut('promptsChanged');
  }

  private onServerToolsListChanged = () => {
    const myGen = this.generation;
    this.client
      .discoverAndReturn(this.cfg)
      .then((snap) => {
        if (myGen !== this.generation) return;
        this.toolsSnapshot = snap.tools;
        this.fanOut('toolsChanged');
      })
      .catch(/* swallow + log */);
  };
}
```

これがなければ、再接続前の Client インスタンスに由来するステールハンドラーが、再接続後のスナップショットを古いデータで上書きしてしまう可能性がある。

**単調性の不変条件**（V21 の明確化）: `generation` はインクリメントのみで、リセットされることはない。進行中の操作はエントリー時に `myGen` をキャプチャし、`await` 後に `myGen === this.generation` をチェックする。「開始してから上位のイベントが発生していない」ことと等価。Number.MAX_SAFE_INTEGER（1Hz 再接続で約 28.5 万年）で上限が決まるため、オーバーフローの懸念はない。

### 7.4 パス統一（F2-1 のスコープ拡張）

`packages/core/src/tools/mcp-client.ts` にはサーバー接続のパスが **2 つ** ある:

1. `McpClient` クラス（mcp-client.ts:100）— `McpClientManager` が使用
2. `connectToMcpServer` ファクトリー関数（mcp-client.ts:875）— `discoverMcpTools`（560 行目）と `connectAndDiscover`（607 行目）が使用

F2-1 では、両方を `McpClient.discoverAndReturn` に統合しなければならない（`connectToMcpServer` を `McpClient` のプライベートヘルパーにするか、両方が共通の `establishConnection()` プリミティブを呼び出す形にする）。そうしなければ、プールはクラスのパスのみをカバーし、ファクトリーのパスはセッションごとのままになり、全体の取り組みが無意味になる。

---

## 8. グローバル状態の共存

### 8.1 `serverStatuses`（mcp-client.ts:292）— 衝突を許容する書き込み

モジュールレベルの `Map<serverName, MCPServerStatus>`。プールの `ConnectionId` は `name::hash` だが、`updateMCPServerStatus(name, status)` は名前で書き込む。**同名（フィンガープリントが異なる、例: トークンの相違）の複数のプールエントリーが互いのステータスを上書きしてしまう。**

**解決策**: プールがステータスの書き込みをインターセプトする:

```ts
class PoolEntry {
  updateStatus(s: MCPServerStatus) {
    this.localStatus = s;
    const aggregated = this.pool.aggregateStatusByName(this.serverName);
    updateMCPServerStatus(this.serverName, aggregated);
  }
}

class McpTransportPool {
  aggregateStatusByName(name: string): MCPServerStatus {
    // いずれかが CONNECTED ⇒ CONNECTED
    // そうでなければ、いずれかが CONNECTING ⇒ CONNECTING
    // それ以外は DISCONNECTED
    const entries = [...this.entries.values()].filter(
      (e) => e.serverName === name,
    );
    if (entries.some((e) => e.localStatus === CONNECTED)) return CONNECTED;
    if (entries.some((e) => e.localStatus === CONNECTING)) return CONNECTING;
    return DISCONNECTED;
  }
}
```

ステータスルートは `entryCount: number` を公開し、運用者が名前に対して複数のエントリーが存在する場合に確認できるようにする。

### 8.2 OAuth トークンストレージ

`MCPOAuthTokenStorage` は `~/.qwen/mcp-oauth/<serverName>.json` に書き込む — これはすでにデーモンホスト間で共有される。プールは副次的に恩恵を受ける（最初のセッションの OAuth が完了 → トークンがディスクに保存 → プールエントリーの再接続がトークンを取得 → 他のすべてのセッションが便乗できる）。

**注意点 — マルチフィンガープリントの場合**: 同名（異なるヘッダー/環境変数）で同じ OAuth プロバイダーを持つ 2 つのエントリーが同じトークンファイルを読み込む。トークンがサーバースコープ（OAuth では一般的）であれば問題ない。トークンが環境変数スコープ（まれ）であれば、明示的なストレージキーの拡張が必要になる。**F3 に先送り**し、既知の制限事項としてドキュメントに記載する。

### 8.3 スナップショット内の `entryCount`

`GET /workspace/mcp` のサーバーごとのセルに以下が追加されます：

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // NEW — この名前のプールエントリ数
  entrySummary?: [                        // NEW — エントリごとの不透明な内訳
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**: `entrySummary[].entryIndex` はエントリ作成時（名前グループ内の挿入順）に割り当てられる**安定した不透明な整数**であり、生のフィンガープリントではありません。理由：OAuthトークンや環境変数がローテーションされるとフィンガープリントが変わり、スナップショットの差分からその情報が漏洩する可能性があります（オペレーターが `'a3b1' → 'f972'` の遷移から「T+5分にトークンがローテーションされた」と推測できてしまいます）。`entryIndex` は名前グループ内で単調増加しますが、古いエントリがドレインされ新しいエントリが次のインデックスを取得するため、ローテーション後も安定したままです。

旧 SDK クライアントは PR 14 の契約に従って未知フィールドを無視します。新しいクライアントはバッジに `entryCount` を使用します。内部のフィンガープリントによる再起動パスは、HTTP スナップショットには公開されず、特権 extMethod 経由でのみ返される不透明なトークンを使用します。

---

## 9. WorkspaceContext / ListRoots

### 9.1 シングル登録

プールの `McpClient` インスタンスは、デーモンのバインドされたワークスペースコンテキスト（PR #4113 の不変条件）である**1つの** `WorkspaceContext` を共有します。`connectToMcpServer` の `ListRootsRequestSchema` ハンドラーはこの単一コンテキストをクロージャで参照します。

`onDirectoriesChanged` リスナーは `acquire` のたびではなく、**エントリごとに1回**登録されます。エントリのシャットダウン時に切り離されます。

### 9.2 `roots/list_changed` のファンアップ

サーバーが新しいルートをクライアントに通知する → プールがファンアウト：

- プールが再探索する（サーバーが新しいルート配下で異なるツールセットを報告する場合あり）→ `toolsChanged` イベント → すべてのサブスクライバービューが再適用

### 9.3 セッションごとの `updateWorkspaceDirectories`

**契約**: モード B では、セッションごとのディレクトリ追加はソフトヒントであり、権威的ではありません。プールの `WorkspaceContext` はデーモンレベルです。

2つの実装の選択肢：

- **v1 シンプル**: セッションごとの追加を無視し、検出時に警告をログ出力
- **v2 ユニオン**: プールが `extraRoots: Map<sessionId, Set<dir>>` を管理し、ListRoots ハンドラーがバインドされたワークスペースと全エクストラのユニオンを返す。セッションごとの削除が `roots/list_changed` をトリガー。50〜80 LOC の複雑さが追加。

**F2 では v1 シンプルを採用**。ユーザーの問題が顕在化した場合は v2 ユニオンを後続対応とする。

---

## 10. セッションごとのインジェクション

### 10.1 `newSession({mcpServers})` からの `mcpServers`

`newSessionConfig(cwd, mcpServers, ...)` はインジェクトされたリストと `settings.merged.mcpServers`（acpAgent.ts:1778-1831）をマージします。プールは**セッションごとのマージ済みビュー**を消費します：

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...既存の setMcpBudgetEventCallback は削除済み — プールが直接ブロードキャストを処理
}
```

2つのセッションが同じ名前のサーバーを異なる env/headers でインジェクトすると → 異なるフィンガープリント → 2つのプールエントリ。プールの共有はセッションが完全に一致する場合のみ機能します。

### 10.2 認証の分岐

静的な `~/.qwen/settings.json` の mcpServers はセッション間で同一 → すべて共有 → 80% のケース。ユーザーごとのトークンを持つセッションごとにインジェクトされた mcpServers → 固有のフィンガープリント → 共有なし。両方とも安全。

### 10.3 HTTP トランスポートのオプトイン（§5.2 の要約）

デフォルトは `pooledTransports = {stdio, websocket}`。HTTP/SSE サーバーは `createUnpooledConnection` パス（セッションごとに1つの McpClient）を経由します。ただしオペレーターがオプトインした場合は除きます。

### 10.4 `/mcp disable X` のセッション途中実行（V21-6）

オペレーターがライブセッションに対して `/mcp disable github` を実行した場合：

1. `Config.disableMcpServer('github')` が Config ごとの `disabledMcpServers` セットに追加
2. **F2 フック**: `Config.onDisabledMcpServersChanged` が発火し、その名前の `SessionMcpView` が `teardown()` を呼び出す（セッションレジストリからツール/プロンプトの登録を削除）
3. 他のセッションがまだ参照している場合（refcount > 0）、プールエントリは**存続する可能性あり** — 無効化したセッションのビューのみが切り離される
4. すべてのセッションが無効化 → refcount → 0 → ドレインタイマーが開始

ステップ2がないと、セッション途中の無効化では、次のセッション再起動まですでに登録されたツールがセッションの `ToolRegistry` に残り続けます。テスト 21.4 がこれをカバーしています。

`/mcp enable github` はその逆です：セッションに対して新しい `pool.acquire` をトリガーし、新しいビューをアタッチして、スナップショットを再適用します。

---

## 11. バジェットガードレールの移行

### 11.1 ステートマシンのプールへの移動

`tryReserveSlot` / `releaseSlotName` / 75% ヒステリシス / refused_batch のコアレッシング / `bulkPassDepth` / `pendingRefusalNames` — すべてが `McpClientManager` から `McpTransportPool` に移行します。`McpClientManager` は単独で実行する場合（プールがインジェクトされていない場合）のみ状態を保持します。

### 11.2 スナップショットセルのスコープ

```ts
{
  kind: 'mcp_budget',
  scope: 'workspace',          // NEW — PR 14 v1 は 'session' を返していた
  liveCount: 5,
  clientBudget: 10,
  budgetMode: 'enforce',
  status: 'ok',
}
```

PR 14 の契約より：「コンシューマーは認識されない scope 値を持つ追加エントリを許容しなければなりません（ドロップし、失敗しない）。」旧 SDK クライアントは `scope: 'workspace'` を受け取り、未知として扱います（またはトップレベルの数値にフォールバック）。新しい SDK は `isWorkspaceScopedBudget(cell)` ヘルパーを追加します。

### 11.3 イベントのファンアウト

```ts
class QwenAgent {
  constructor() {
    this.mcpPool = new McpTransportPool({
      onBudgetEvent: (event) => this.broadcastBudgetEvent(event),
    });
  }

  private broadcastBudgetEvent(event: McpBudgetEvent) {
    for (const [sid, session] of this.sessions) {
      const enriched = {
        ...event,
        scope: 'workspace' as const,
        sessionId: sid,
      };
      session.connection
        .extNotification('qwen/notify/session/mcp-budget-event', enriched)
        .catch((err) =>
          debugLogger.debug('budget event delivery failed', { sid, err }),
        );
    }
  }
}
```

### 11.4 SDK 型コントラクトの変更

PR 14b でエクスポートされた以下の型（追加的に拡張すること）:

- `DaemonMcpBudgetWarningData` — `scope?: 'workspace' | 'session'` を追加（後方互換のためオプション; 省略時は 'session'）
- `DaemonMcpChildRefusedBatchData` — 同様の `scope?` 拡張
- `DaemonMcpGuardrailEvent` — ディスクリミネーターは変更なし

新規 SDK ヘルパー:

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`DaemonSessionViewState` のリデューサー状態:

- **新規フィールドなし** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` はスコープに関わらずインクリメントされる（スコープは別ストリームではなく各イベントのプロパティ）
- F2 ではこれらのカウントがワークスペースレベルのイベントを全セッションにファンアウトしたものを反映するため、バジェット負荷が発生すると**すべてのアタッチ済みセッションで同時にインクリメント**される

**V21-12 (Q1 解決済み、v2.1 で確定)**: 既存のフィールド名（`mcpBudgetWarningCount`、`mcpChildRefusedBatchCount`、`lastMcpBudgetWarning`、`lastMcpChildRefusedBatch`）を維持し、拡張されたスコープのセマンティクスを JSDoc に記述:

```ts
/**
 * Count of `mcp_budget_warning` events the session has observed.
 * Under F2 (`scope: 'workspace'`), this increments simultaneously
 * across all attached sessions because budget events fan out at
 * workspace level. Use `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`
 * to inspect scope of the most recent event.
 */
mcpBudgetWarningCount: number;
```

根拠: PR 14b でこれらの名前はすでに公開 SDK サーフェスとして出荷済み; リネームはわずかに不正確なセマンティクスよりも悪い破壊的変更となる。

---

## 12. OAuth — F3 への明示的な先送り

`connectToMcpServer`（mcp-client.ts:950-1010）の OAuth 401 フォールバックはインタラクティブな解決（ブラウザを開くかデバイスフロー）が必要。Mode B デーモンは**ブラウザを起動してはならない**（PR 21 設計 — `open`/`xdg-open`/`shell.openExternal` に対する静的ソース grep テストがビルドを失敗させる）。

**OAuth が必要なサーバーに対する F2 の動作**:

1. 最初の取得が `connectToMcpServer` をトリガー → 401 を検出
2. プールが OAuth 必須例外をキャッチし、エントリーを `failed_auth_required` としてマーク
3. ステータスルートが `errorKind: 'auth_env_error'` を公開（既存の PR 13 errorKind）
4. プールは**自動リトライしない**
5. オペレーターが `/mcp auth <name>`（既存 CLI）を実行するか、PR 21 のデバイスフロールートでトークンをディスクに取得 → 次のセッション取得で再試行し成功

**F3 ではステップ 4-5 を** `PermissionMediator` によるアタッチ済みセッションへの OAuth 完了リクエストのルーティング（ファーストレスポンダー）で置き換える。

これにより F2 が認証ステートマシン作業に混入することを回避する。

---

## 13. 再起動ルートのセマンティクス

### 13.1 プール配下での `POST /workspace/mcp/:server/restart`

現状（PR 17）: ブートストラップセッションのマネージャーでの再起動 = その名前の単一エントリーを再起動。

プール配下: 名前 → 複数エントリーの可能性（同名で異なるフィンガープリント = 異なる設定を持つ異なるセッション）。

**仕様の動作**:

| リクエスト                                            | 動作                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /workspace/mcp/:server/restart`              | `serverName` に一致する**すべての**エントリーを再起動（`Promise.allSettled` で並列）    |
| `POST /workspace/mcp/:server/restart?entryIndex=0` | V21-3: エントリー #0 のみ再起動（§8.3 スナップショットの不透明インデックス）; 見つからない場合は 404 |
| `POST /workspace/mcp/:server/restart?entryIndex=*` | 明示的な「すべて」（パラメーターなしと同じ）                                                    |

レスポンスの形状:

```ts
type RestartResult = {
  entryIndex: number;        // V21-7: opaque index, not raw fingerprint
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

後方互換のため、`entries.length === 1` かつ `entryIndex` クエリパラメーターがない場合は旧形状 `{restarted: true, durationMs}` を保持; クライアントは `'entries' in response` で新形状を検出できる。

### 13.2 インフライト再起動の重複排除

```ts
class PoolEntry {
  private restartInFlight?: Promise<void>;
  async restart(): Promise<void> {
    if (this.restartInFlight) return this.restartInFlight;
    this.restartInFlight = this.doRestart().finally(() => {
      this.restartInFlight = undefined;
    });
    return this.restartInFlight;
  }
}
```

### 13.3 バジェットチェック（PR 17 の動作を保持）

再起動前にプールがバジェットをチェック: 切断+再接続がバジェット内に収まる場合は OK。現在の PR 17 の `{restarted:false, skipped:true, reason:'budget_would_exceed'}` セマンティクスを保持（エントリーごとに適用されるだけ）。

### 13.4 再接続中のインフライトツール呼び出し（V21-5、新規）

セッション A が `pool.callTool('git.commit', args)` を呼び出す → リクエストが基盤の子プロセスの stdin に到達 → 書き込み中に子プロセスがクラッシュ → エントリーが再接続に移行:

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // pre-reconnect generation
  readonly args: unknown;              // original args, for caller to retry if safe
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**仕様**:

- インフライトの呼び出し Promise はトランスポート切断検出時に即座に `MCPCallInterruptedError` でリジェクトされる（再接続を待たない）
- プールは呼び出しを**自動リトライしない**; 書き込み（commit、ファイル編集など）に対して安全でなく、プールは読み取りと書き込みを区別できない
- 呼び出し元（通常はエージェントループのツール実行レイヤー）がこのエラーをキャッチし判断: リトライ / ユーザーへの提示 / 中断
- 再接続後: セッション A は再呼び出し可能（同じ `PooledConnection.callTool`）; プールは新しいトランスポートインスタンスに透過的にルーティング
- `MCPCallInterruptedError.clientGeneration` により、呼び出し元は必要に応じて後続の `reconnected` イベントと照合できる

テスト 21.6 でカバーすること: 長時間実行される stdio MCP を起動し、ツール呼び出しを送信し、呼び出し中に子プロセスを kill し、ゼロでない `clientGeneration` を持つ `MCPCallInterruptedError` のリジェクトをアサートする。

---

## 14. ステータスルートのリファクタリング

### 14.1 新しいクエリパス

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — replace data source
let accounting: McpClientAccounting | undefined;
try {
  // NEW: query pool directly via bridge extMethod, not bootstrap session
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // Fallback to legacy bootstrap session path for non-pool daemon
  const manager = config.getToolRegistry()?.getMcpClientManager();
  if (manager) accounting = manager.getMcpClientAccounting();
}
```

`QwenAgent` は `getMcpPoolAccounting()` を公開します：

```ts
class QwenAgent {
  getMcpPoolAccounting(): McpClientAccounting | undefined {
    return this.mcpPool?.getAccounting();
  }
}
```

ACP の子ブリッジは `extMethod` 経由でデーモンが呼び出します。

### 14.2 entryCount + entrySummary

§8.3 参照。

### 14.3 ブートストラップセッションなしの場合

現状（PR 12）、デーモンがアイドル状態（セッションなし）のとき、`GET /workspace/mcp` はブートストラップセッションが存在しないため `initialized: false` を返します。

プール使用時：プールは `QwenAgent` コンストラクタから存在するため、ステータスルートは**セッションがゼロでもライブの accounting を返せます**。初回セッション前でも `initialized: true` となります。PR の説明に**ドキュメント化された動作変更**として記載；リグレッションではありません。

---

## 15. loadSession / resume の相互作用（PR 6 #4222）

### 15.1 resume 時のドレインキャンセル

```
session-A がアクティブで entry-X の参照を保持
session-A が切断（明示的なクローズなし）→ 最終的に killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → ドレインタイマー開始（30秒）
session-A が 30秒以内に resume → 新しい newSessionConfig → pool.acquire が entry-X を返す → attach がドレインをキャンセル
session-A が 30秒後に resume → entry-X は既にクローズ済み → プールが新しいエントリをスポーン（コールドスタート）
```

### 15.2 `restoreState` キャッシュウィンドウ（5分、PR 6より）

`acpAgent.restoreState` は切断後 5 分間保持されます。プールドレイン（デフォルト 30 秒）＜ リストアウィンドウ（5 分）→ 30 秒から 5 分の間に resume すると MCP のコールドスタートが発生します。許容できるトレードオフです（resume 自体はレアパスのため）。

代替案：プールがデーモンのリストアウィンドウ設定を読み取り、ドレインをそれに合わせて延長する。プールとセッションステートマシンの間に結合が生じるため、**ユーザーからコールドスタートの問題報告があるまでフォローアップに延期**。

### 15.3 `pendingRestoreIds` との相互作用

`acpAgent.killSession()` は `pendingRestoreIds` をクリーンアップした**後**に `pool.releaseSession(sid)` を呼び出す必要があります。順序：

1. セッションがリストア可能としてマーク（`pendingRestoreIds.add(sid)`）
2. Session.close() — ただしプールの参照はまだ保持
3. `RESTORE_WINDOW_MS` 経過後に resume がなければ：`killSession` が完全にクリーンアップ → `pool.releaseSession(sid)` がドレインをトリガー

リストアウィンドウ中のドレイン発火を防ぎます。

---

## 16. ホットコンフィグリロード

### 16.1 フィンガープリント変更による暗黙のリロード

ユーザーが実行中に `~/.qwen/settings.json` を編集してサーバーの env を変更した場合：

1. 古いセッションは古い `Config`/`McpServers` のスナップショットを保持 → 古いフィンガープリントを取得し続ける → entry-OLD の参照が残る
2. 新しいセッションは新しい設定を読み込む → 新しいフィンガープリント → entry-NEW が作成される → entry-OLD と共存
3. 古いセッションが自然にクローズ → entry-OLD がドレイン → 最終的にクローズ
4. 安定状態：entry-NEW のみが残る

**実行中の接続はライブで変更されない** — 異なる設定バージョンのセッション間でクリーンに分離されます。

### 16.2 強制リロードルート（オプション）

```
POST /workspace/mcp/reload-all
  → 各セッション: 設定を再読み込み、Config.mcpServers を入れ替え
  → 参照されなくなった各エントリ: エビクションをスケジュール
```

「環境変数を変更してすべてのセッションに即時反映したい」場合に有用。F2 フォローアップに延期（ブロッキングではない）。

### 16.3 拡張機能アンインストール時の孤立エントリ（V21-15）

シナリオ：拡張機能 `foo-ext` が MCP サーバー `foo-server` を登録。オペレーターが `/extension uninstall foo-ext` を実行。拡張機能のライフサイクルが `extensionMcpServers` から `foo-server` を削除するため、以後の `loadCliConfig` 呼び出しにはそれが含まれない。しかし：

- ライブセッションは `foo-server` を含む `Config` スナップショットを保持 → それらのセッションは引き続きエントリを使用
- アンインストール後の新しいセッションは取得しない（サーバーがマージされた mcpServers に存在しない）→ 参照カウントは増加しない

**解決策**：自然なドレインに委ねる。古いセッションがクローズするにつれて参照カウントが下がり、最終的にエントリは `MAX_IDLE_MS = 5min` に達して強制クローズされます。**明示的な `pool.invalidateByExtension(name)` API なし** — ホットコンフィグリロード（§16.1）とモデルを統一します。

トレードオフ：長いセッションがアクティブなまま保持している場合、拡張機能のサーバーはアンインストール後最大 5 分間動作し続ける可能性があります。許容範囲内です；緊急時はオペレーターが `/mcp restart foo-server` を実行してセッションを終了できます。

---

## 17. シャットダウン順序

`QwenAgent.close()` のシーケンス（必ず強制すること）：

```
1. acceptingNewSessions = false を設定; 新しい POST /session を拒否
2. 処理中の各プロンプト: キャンセルシグナルを送り、完了を待機（既存の PR 11 ライフサイクル）
3. 各セッション: クローズをトリガー → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← 30秒のグレースをバイパス
   ├── 各エントリ: ドレインとヘルスタイマーをキャンセル、ドレイン中としてマーク
   ├── 各エントリ（並列）: listDescendantPids → SIGTERM 子プロセス
   ├── 各エントリ（並列）: client.disconnect()
   └── Promise.race を timeoutMs に対して実行; 残ったエントリに SIGKILL
5. ブリッジチャネルクローズ
6. プロセス終了
```

**V21-11**：`drainAll` のシグネチャ：

```ts
async drainAll(opts?: {
  force?: boolean;       // default false; true bypasses 30s grace timer
  timeoutMs?: number;    // default 10_000; wall-clock budget; SIGKILL stragglers after
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // entries that disconnected cleanly
  forced: number;        // entries SIGKILLed after timeout
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

呼び出し元はシャットダウンログに `DrainResult` を使用します；`forced > 0` の場合はサーバーがクリーンにシャットダウンしなかったことをオペレーターに知らせる警告をログに出力します。

---

## 18. ファイルレイアウト

**新規ファイル：**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool main (~700 LOC)
  mcp-pool-key.ts              # fingerprint + canonicalize helpers (~150 LOC)
  mcp-pool-entry.ts            # PoolEntry: refcount + drain + health + generation (~500 LOC)
  session-mcp-view.ts          # SessionMcpView: filter + register tools/prompts (~200 LOC)
  mcp-pool-events.ts           # PoolEvent discriminated union (~80 LOC)
  pid-descendants.ts           # listDescendantPids クロスプラットフォーム (~150 LOC, テスト含む)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 LOC
  mcp-pool-entry.test.ts       # ~400 LOC
  session-mcp-view.test.ts     # ~250 LOC
  mcp-pool-key.test.ts         # ~150 LOC
  pid-descendants.test.ts      # ~200 LOC (Unix + Windows スキップゲート付き)
```

**変更ファイル:**

```
packages/core/src/tools/mcp-client.ts            # discoverAndReturn() の分割; connectToMcpServer の統一
packages/core/src/tools/mcp-client-manager.ts    # オプションの pool パラメータ; バジェット状態の条件分岐
packages/core/src/tools/tool-registry.ts         # config から pool を McpClientManager へ渡す
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # QwenAgent.mcpPool の構築; broadcastBudgetEvent;
                                                 # newSessionConfig が pool を Config に接続;
                                                 # killSession が pool.releaseSession を呼び出す
packages/cli/src/serve/run-qwen-serve.ts           # --mcp-pool-transports + バジェット env を ACP 子プロセスに渡す
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus が pool を読み取る;
                                                 # restartMcpServer の extMethod が RestartResult[] を返す
packages/cli/src/serve/capabilities.ts           # mcp_workspace_pool をアドバタイズ
packages/sdk/src/daemon/mcpEvents.ts             # scope?: オプションフィールド; isWorkspaceScopedBudgetEvent ヘルパー
```

---

## 19. 単一PR納品 — コミット分割 (V21-1)

メンテナーの機能凝集型バッチガイドライン (#4175 ブランチ戦略 2026-05-19) に従い、F2 は **6つのアトミックコミットを含む1つのPR** として提供されます。レビュアーは `git log -p HEAD~6..HEAD` でコミットごとに確認できます。

| コミット # | タイトル                                                                                         | スコープ                                                                                                                                                                                                                                                                                                                                                                                                                  | 変更ファイル                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1        | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths` | `discoverAndReturn()` を追加; `McpClient.connect()` と `connectToMcpServer()` ファクトリの両方で使用される共有 `establishConnection()` を抽出; レガシー `discover()` は登録を行うシンラッパーになる (スタンドアロンの qwen 動作を維持)。外部から観測可能な動作変更はゼロ。                                                                                                                                                | `mcp-client.ts`, `mcp-client.test.ts`                                                                                    |
| 2        | `feat(core): McpTransportPool + SessionMcpView`                                               | プールコア: `fingerprint`、refcount、`spawnInFlight` 重複排除、`sessionToEntries` 逆インデックス、ドレイン状態マシン、アタッチ時のスナップショット再生、generation ガード、tool+prompt デュアルファンアウト、セッションごとの trust コピー。ユニットテスト用のモック McpClient。プロダクション配線なし。                                                                                                                                                 | 新規 `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + テスト |
| 3        | `feat(core): cross-platform descendant pid sweep + pool health monitor`                       | `listDescendantPids` (Unix `pgrep -P` 再帰, Windows PowerShell CIM); `PoolEntry` 内の統一ヘルスモニター (インターバルチェック + 失敗カウント + §6.6 に基づく再接続バックオフ); `QWEN_INTEGRATION === '1'` でゲートされたサブプロセス生成統合テスト。                                                                                                                                                             | 新規 `pid-descendants.ts` + テスト; `mcp-pool-entry.ts`                                                                    |
| 4        | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                               | `Config.setMcpTransportPool` + `getMcpTransportPool`; `ToolRegistry` が pool を `McpClientManager` へ渡す; `McpClientManager` のオプション `pool?` コンストラクタパラメータ; `acpAgent.QwenAgent` が初期化時に pool を構築; `newSessionConfig` への注入; `killSession` が `pool.releaseSession` を呼び出す; SDK MCP + HTTP/SSE の `createUnpooledConnection` によるバイパス; CLI フラグ `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`。 | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                               |
| 5        | `feat(serve): pool-aware status + restart routes`                                             | `QwenAgent.getMcpPoolAccounting` extMethod; `httpAcpBridge.buildWorkspaceMcpStatus` のプールファースト + ブートストラップセッションへのフォールバック; `restartMcpServer` が `?entryIndex=` を受け付け `RestartResult[]` を返す; セルへの `entryCount` + `entrySummary[].entryIndex`; capability タグ `mcp_workspace_pool` + `mcp_pool_restart`。                                                                                                                                                   | `httpAcpBridge.ts`, `capabilities.ts`, SDK 型定義                                                                         |
| 6        | `feat(serve): graduate MCP budget guardrails to workspace scope`                              | `tryReserveSlot`/`releaseSlotName`/ヒステリシス状態マシンを `McpClientManager` からプールへ移動; `acpAgent.newSessionConfig` のセッションごとの `setMcpBudgetEventCallback` 配線を削除; `QwenAgent.broadcastBudgetEvent` ファンアウト; スナップショットセル `scope: 'workspace'`; SDK `scope?` 追加フィールド; `isWorkspaceScopedBudgetEvent` ヘルパー; インラインドキュメント更新。                                                          | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                 |

**総LOC見積もり**: プロダクション ~4100 + テスト ~1900 = 合計 ~6000 LOC (v2 見積もり ~3850; 増分は V21 の修正を吸収)。

**マージ先**: `daemon_mode_b_main` への単一PR。#4175 戦略に従い定期的なバッチマージで `main` へ。

**PR オープン前のセルフレビュープロセス**:

1. 各コミット後、コミット差分に対して `code-reviewer` エージェントを実行; 採用した指摘を同一コミットに反映
2. コミット 2/4/6 (設計リスクが最も高い) については、追加で `silent-failure-hunter` + `type-design-analyzer` を実行
3. 全6コミット完了後: 異なるエージェントの組み合わせで PR 差分全体に対して3回のフルレビューパス
4. 変更対象パッケージ全体でフルテストスイート + 型チェック + リントを実行

PR 21 のスペシャリスト事前レビューパターンを踏襲する。

---

## 20. Capability タグ + SDK コントラクト変更

### 20.1 新規 capability タグ (v0.16, V21-1 でアトミックにアドバタイズ)

F2 は1つの PR として提供されるため、3つのタグはすべて同時にアドバタイズされます。プールのコンシューマーは **`mcp_workspace_pool` のアドバタイズ ⇒ `entryCount`/`entrySummary`/`scope?` フィールドがすべて存在する** と見なしてよく、フィールドごとの capability チェックは不要です。

| タグ                        | アドバタイズ条件                                                                                        | 意味                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `mcp_workspace_pool`       | `QwenAgent.mcpPool !== undefined` のとき (ダエモンモードでは `--no-mcp-pool` キルスイッチがない限り常に true) | `GET /workspace/mcp` がプールレベルの状態を反映; `entryCount` + `entrySummary` フィールドが存在           |
| `mcp_pool_restart`         | `mcp_workspace_pool` が有効なときは常に                                                                 | `POST /workspace/mcp/:server/restart` が `?entryIndex=` を受け付け `entries: RestartResult[]` を返す場合がある |
| (extends `mcp_guardrails`) | 変更なし                                                                                              | 同一タグ、ペイロードに `scope` を追加 (F2 では `'workspace'`)                                       |

### 20.2 SDK 追加サーフェス

```ts
// @qwen-code/sdk — 追加のみ
export interface DaemonMcpBudgetWarningData {
  // existing fields...
  scope?: 'workspace' | 'session'; // NEW — absent on old daemons (means 'session')
}

export interface DaemonMcpChildRefusedBatchData {
  // existing fields...
  scope?: 'workspace' | 'session';
}

export interface ServeWorkspaceMcpServerStatus {
  // existing fields...
  entryCount?: number;
  entrySummary?: Array<{
    fingerprint: string;
    refs: number;
    status: MCPServerStatus;
  }>;
}

export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`EVENT_SCHEMA_VERSION` は `1` のまま (追加のみ)。

---

## 21. テストマトリクス

### 21.1 プールキー (F2-2)

- 同一 cfg → 同一キー (env-key 順列安定、header-key 順列安定)
- env 値が1バイト異なる → 異なるキー
- header `Authorization` 値が異なる → 異なるキー
- `includeTools`/`excludeTools`/`trust` を変更 → 同一キー (セッションごとのフィルター)
- 同一内容で `new MCPServerConfig(...)` を2回生成 → 同一キー (ID ではなくカノニカルハッシュ)

### 21.2 ライフサイクル (F2-2)

- 3セッションが同一キーを取得 → スポーン1回 (`client.connect` へのスパイで確認)
- リリースシーケンス n,n-1,...,1 → ドレインタイマーは 1→0 のときのみ開始
- 30秒ドレイン: 25秒時点での取得はタイマーをキャンセル; 35秒時点での取得は新エントリをスポーン
- `MAX_IDLE_MS` (5分) でドレインがフラッピングしていてもハードクローズ
- インフライト中にスポーン失敗: 全アウェイターがエラーを受け取る; スロットが解放される; エントリは保存されない

### 21.3 並行取得 (F2-2)

- エントリが存在しない状態で 5つの同時 `acquire(sameKey)` → `spawnEntry` 呼び出しはちょうど1回、5つすべてが同一エントリを取得
- スポーン失敗 → 5つすべてのアウェイターが同一エラーで reject; 後続の取得は再スポーン

### 21.4 セッションごとの分離 (F2-2)

- セッション A `excludeTools: ['foo']`、セッション B 除外なし → A の ToolRegistry は foo を除外、B は保持; 両方とも同一 `toolsSnapshot` から
- セッション A `trust: true`、セッション B `trust: false` → セッション A の `DiscoveredMCPTool.trust === true`、B は `false`; 参照が共有されていないことを確認 (一方を変更しても他方に影響しない)
- セッション A がプロンプトのみのサーバーを取得 → A の PromptRegistry が設定され、そのサーバーの ToolRegistry は空

### 21.5 ツール/プロンプトリストの変更 (F2-2)

- サーバーが `notifications/tools/list_changed` を発行 → 全サブスクライバーの `applyTools` が新スナップショットで呼び出される
- 再接続前の古い世代のハンドラーがスナップショットを上書きしない
- `notifications/prompts/list_changed` の同様の動作

### 21.6 クラッシュ + 再接続 (F2-2)

- `process.kill` でサブプロセスを終了 → サブスクライバーが `disconnected` イベントを受信
- 3回の再接続試行（既存の `MCPHealthMonitorConfig` を使用）→ 成功 → `reconnected` + 新しいスナップショット
- リトライ上限到達 → 全サブスクライバーが `failed` を受信；エントリが `failed` 状態に遷移；新規 acquire は1回リトライ後に例外をスロー

### 21.7 子孫 pid の掃引 (F2-2b)

- Linux/macOS：`bash -c "sleep 60 & sleep 60"` を stdio コマンドとしてスポーン → ルートを kill → 子孫が両方回収されたことを確認（`/proc/<pid>/status` ポーリング、または `kill(0, pid) === false`）
- Windows：`cmd /c "ping -t localhost"` ラッパーをスポーン → kill → ping サブプロセスが消えたことを確認
- `pgrep` が利用不可（PATH に含まれない）→ グレースフル・デグラデーション：警告をログ出力し、ルートに SIGTERM を送るだけでクラッシュしない

### 21.8 ワークスペーススコープのバジェット (F2-4)

- 4セッション × `--mcp-client-budget=2`、静的 MCP サーバー3台 → ワークスペース合計 = 3（12ではない）；スナップショットのセルは `scope: 'workspace'`、`liveCount: 3`
- バジェット警告はワークスペース全体で75%を上回るたびに1回発火；4セッション全てに同時ブロードキャスト
- ヒステリシス再アーム：37.5%まで低下 → 次の超過時に再び発火

### 21.9 後方互換性 (F2-3)

- スタンドアロンの `qwen`（daemon なし）→ `mcpPool === undefined` → 既存の `mcp-client-manager.test.ts` テストが変更なしで通過
- `--no-mcp-pool` daemon フラグ → セッション単位にフォールバック、既存の daemon e2e テストが全て通過

### 21.10 認証情報の分離 (F2-3)

- セッション A が `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}` を注入、セッション B が `tokenB` を注入 → 2つの独立したプロセス；スナップショットで `entryCount: 2` を確認；A のツール呼び出しが A のトランスポートを通ることを確認（stdin/ログのヘッダー検査で）

### 21.11 LoadSession / 再開 (F2-3)

- セッションクローズ → ドレイン開始 → 30秒以内に再開 → プールエントリを再利用（コールドスタートなし、`client.connect` spy のカウントで確認）
- 30秒後、restore-window 期限前に再開 → プールのコールドスタート；restoreState の内容は保持される

### 21.12 再起動ルート (F2-3b)

- name に対してエントリが1件 → `POST /workspace/mcp/foo/restart` がレガシーの `{restarted: true, durationMs}` 形式を返す
- name に対してエントリが2件（異なるフィンガープリント）→ `{entries: [{fingerprint, restarted, ...}, ...]}` を返す
- 再起動中に別の再起動が進行中 → 2回目の呼び出しは同じ Promise を返す（重複除去）
- バジェット超過となる再起動 → エントリごとに `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` を返す

### 21.13 ステータスルート (F2-3b)

- アイドル状態の daemon（セッションなし）だがプールに前のセッションのキャッシュエントリあり → `GET /workspace/mcp` がライブのアカウンティングと共に `initialized: true` を返す
- ブートストラップセッションが存在しない → pool 直接パスにフォールバック；エラーなし
- プールクエリが例外をスロー → ブートストラップセッションパスにフォールバック；スナップショットはクラッシュしない

### 21.14 SDK リデューサー (F2-4)

- ワークスペースイベントのブロードキャスト時に `mcpBudgetWarningCount` が全サブスクライバーセッションで同時インクリメント
- `isWorkspaceScopedBudgetEvent(e)` がペイロードからスコープを正しく識別
- 古い daemon（`scope` フィールドなし）→ デフォルトで 'session' として解釈

### 21.15 ホットコンフィグリロード (F2-3)

- 処理中に settings.json が変更 → 古いセッションは古いエントリを保持、新しいセッションは新しいエントリを作成、両者が共存；最後の古いセッションがクローズされると古いエントリが自然にドレイン
- 古いセッションのクローズ後にセッション数が0 → ドレインタイマーが発火 → 古いエントリが GC される → 新しいエントリのみ残る

### 21.16 シャットダウンの順序 (F2-3)

- `QwenAgent.close()` が以下の順序でトリガー：新規受付停止 → プロンプトのドレイン → セッションのクローズ → `pool.drainAll` → 終了後に `pgrep -P <acpChildPid>` でゾンビ pid がないことを確認

---

## 22. 未解決の質問

V21 でQ1/Q3/Q4/Q6 が設計デフォルトとして確定（シングルPR納品）。Q2/Q5/Q7/Q8/Q9 は未確定。

| #     | 質問                                                                                                              | F2 設計デフォルト                                                                         | 確定期限 |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------- |
| Q1 ✅ | SDK リデューサーのフィールド名 — リネームするか保持するか？                                                         | **LOCKED v2.1**: `mcpBudgetWarningCount` 等を保持し、JSDoc で拡張スコープセマンティクスを追加 | 解決済み               |
| Q2    | `mcp_workspace_pool` capability — `protocolVersions` を('v1' → 'v1.1')バンプするか、'v1' の加算的追加に留めるか？  | **'v1' の加算的追加に留める**（PR 14b の先例と整合）                                        | コミット5              |
| Q3 ✅ | `--no-mcp-pool` フラグ — デフォルトオンかオプトインか？                                                           | **LOCKED v2.1**: デフォルトオン；`--no-mcp-pool` はキルスイッチ                             | 解決済み               |
| Q4 ✅ | HTTP/SSE のデフォルト — プールオフかオンか？                                                                      | **LOCKED v2.1**: プールオフ；`--mcp-pool-transports` でオプトイン                           | 解決済み               |
| Q5    | `POST /workspace/mcp/reload-all` — F2 に含めるかフォローアップとするか？                                          | **フォローアップ**                                                                         | 該当なし（延期）        |
| Q6 ✅ | レイジープール構築 — 条件分岐に値するか？                                                                         | **LOCKED v2.1**: イーガー（`QwenAgent` コンストラクタで常に構築）                            | 解決済み               |
| Q7    | `restoreState` ウィンドウ vs プールドレイン — 分離を維持・揃える・設定から読み込む？                               | **30秒デフォルトを維持**＋設定ノブ `--mcp-pool-drain-ms`                                   | コミット4              |
| Q8    | OAuth の扱い — F3 への延期を確認、ワークアラウンドをドキュメント化？                                              | **F3 に延期**、`/mcp auth <name>` ワークアラウンドをドキュメント化                          | コミット4              |
| Q9    | `entrySummary` の公開 — 常に含めるか、verbose フラグの後ろに置くか？                                             | **常に含める**（ペイロードが小さく、運用に有用）                                            | コミット5              |
| Q10   | `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` の決定 #3 を更新 — @wenshao と調整が必要？    | F2 PR の説明が codeagents PR にリンク；2つの PR を独立してレビュー                          | PR オープン            |

---

## 23. リスク

### 高

- **R1 (A2 グローバルステート)**：同名の複数エントリで `serverStatuses` が衝突。集約ステータス関数で軽減；残存リスクは SDK コンシューマーが生のグローバル Map を直接読む場合（可能性低 — `getMCPServerStatus(name)` アクセサーを通じてのみ使用）。
- **R2 (PromptRegistry の対称性)**：任意のコードパスでプロンプトのファンアウトを忘れると、プロンプトが無音で欠落。F2-2 テスト 21.4 の3番目の bullet と F2 以前との比較でプロンプト同一性を確認する統合テストで軽減。
- **R3 (HTTP トランスポートのステート汚染)**：トランスポート単位のステートを保持するサーバーに HTTP プールをオプトインすると、セッションコンテキストが汚染される。デフォルトオフ＋ドキュメント化で軽減；自動検出は不可能。

### 中

- **R4 (パス統一 F2-1)**：`connectToMcpServer` ファクトリと `McpClient` クラスには微妙な挙動の差異あり（例：capability が構築時に広告されるか接続時かなど）。F2-1 をプール作業開始前の純粋なリファクタリング PR として全回帰カバレッジで軽減。
- **R5 (Windows の子孫 pid)**：PowerShell の `Get-CimInstance` が遅い（スポーンコスト）か AppLocker にブロックされる可能性。2秒タイムアウト＋グレースフル・デグラデーションで軽減。
- **R6 (プールイベントブロードキャストの増幅)**：バジェット警告が100セッションにファンアウトすると、タイトなループで100件の extNotification 呼び出しが発生。`Promise.all` 並列化＋セッション単位の catch（既存の PR 14b パターン）で軽減。

### 低

- **R7 (MCPServerConfig バージョン間のフィンガープリント安定性)**：`MCPServerConfig` に今後追加されるフィールドがフィンガープリントに含まれなければ、誤った共有が無音で発生。明示的な正規化関数＋全 `MCPServerConfig` フィールドを列挙してカバレッジを確認するテストで軽減。
- **R8 (世代カウンターの競合)**：急速な再起動サイクルで JS の数値精度が枯渇する可能性（≈ 2^53 = 毎秒1回で約28万5千年）。実用上は問題なし。

### シングルPR 固有 (V21-14)

- **R9 (〜6000 LOC のシングル PR によるレビュー疲労)**：レビュアーの帯域がクリティカルパスになる。F3 は F2 のマージに依存 → 他のコントリビューターをブロック。軽減策：(a) 3人の専門エージェントで事前レビューし、PR21 のパターンに倣って P0/P1 をオープン前に解消；(b) 6つのアトミックコミットとして構成し、レビュアーがステップごとに追えるようにする；(c) #4175 コメントで事前に @wenshao とレビューウィンドウを調整。
- **R10 (`daemon_mode_b_main` へのマージコンフリクトの蓄積)**：F2 は `acpAgent.ts`、`httpAcpBridge.ts`、`capabilities.ts`、`mcp-client*.ts` に触れており、いずれもホットパス。F3/F4 のコントリビューターが F2 の1〜2週間のレビュー期間中に同時着地するとコンフリクトのリスクがある。軽減策：毎日 `git rebase origin/daemon_mode_b_main`；F2 が進行中であることを #4175 アップデートで周知し、F2 マージまで F3/F4 のホットファイル変更を控えるよう依頼。
- **R11 (CI 実行時間)**：サブプロセスのスポーンとクロスプラットフォーム pid 掃引を含む〜1900 LOC の新規テストにより、CI が30分から50分に延びる可能性。軽減策：(a) サブプロセステストを `process.env.QWEN_INTEGRATION === '1'` フラグでゲートし、PR CI ではサブセットのみ実行、完全なセットはナイトリーで実行；(b) Vitest の並列度を4以上に設定；(c) Windows pid 掃引テストは GHA Windows ランナーのみでスキップゲートを設定。

---

## 24. ドキュメント更新

| ドキュメント                                                                   | 更新内容                                                                                                                                                | タイミング                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`             | 決定 #3「MCP サーバーライフタイム」：現在は「セッション単位」；「daemon モードではコンフィグハッシュキーによるワークスペースプール化；スタンドアロンではセッション単位」に更新 | F2-3 マージ時（@wenshao の codeagents PR と調整）   |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                             | Wave 5 PR 23 → F2 シリーズとしてマーク；PR にリンク                                                                                                      | F2-3 マージ時                                        |
| `packages/cli/src/serve/README.md`（存在する場合）または新規 `docs/serve/mcp-pool.md` | 新セクション：プールのセマンティクス、フィンガープリントキー、トランスポートのオプトイン、再起動のセマンティクス、ステータススナップショットの解釈           | F2-3b                                                |
| `packages/sdk/README.md`                                                       | ガードレールイベントの `scope?` フィールド、サーバーステータスの `entryCount`、ヘルパー `isWorkspaceScopedBudgetEvent`                                     | F2-4                                                 |
| Issue #4175 本文                                                               | サブ PR テーブルで F2 エントリを更新、設計 v2（本ドキュメント）にリンク                                                                                   | F2-1 オープン前                                      |
| Issue #3803 本文                                                               | 決定 #3 の行：「現在セッション単位」→「daemon 配下ではワークスペースプール化 (F2)」に更新                                                                   | F2-3 マージ後                                        |
| `acpAgent.ts:869-936` インラインコメント                                       | 「Wave 5 PR 23」前方参照を削除；「F2 で `scope: 'workspace'` として graduated」に更新                                                                    | F2-4 PR                                              |
| CHANGELOG / リリースノート（Wave 6 / F5）                                      | 「MCP プロセスがワークスペース内のセッション間で共有されるようになりました」の見出し                                                                       | F5 リリース時                                        |

---

## 25. PR 説明テンプレート（シングルPR納品）

```markdown
## feat(serve): shared MCP transport pool (workspace-scoped) [F2]

Single feature-cohesive PR per #4175 branching strategy (2026-05-19).
Replaces what was originally planned as Wave 5 PR 23 + sub-PRs F2-1..F2-4.

### Scope

~4100 LOC production + ~1900 LOC tests across 6 atomic commits.
Step through with `git log -p HEAD~6..HEAD` for commit-by-commit review.

### Design doc

See `docs/design/f2-mcp-transport-pool.md` (v2.1).

### レビュー前の専門エージェント（PR 21パターン）

最初のコミットに組み込み、オープン前に実施：

- code-reviewer: N件の指摘、すべて採用
- silent-failure-hunter: N件の指摘、すべて採用
- type-design-analyzer: N件の指摘、すべて採用

### クローズ

（なし — #4175のF2エントリはPRがmainバッチにマージされるまで開いたまま）

### 関連

- #3803 決定 #3 更新（codeagents PR <link>）
- PR 14b（#4271 マージ済み）— バジェットガードレールのベース；F2はスコープをワークスペースに昇格
- F1（#4319 マージ済み）— acp-bridgeパッケージ；F2は注入ポイントに依存

### 後方互換性

- スタンドアロン `qwen`（非デーモン）：プールは構築されず、既存の動作を維持
- デーモン `qwen serve --no-mcp-pool`：キルスイッチによりセッション単位にフォールバック
- SDK：すべての新フィールドは追加的（`entryCount`、`scope?`）；EVENT_SCHEMA_VERSIONは1のまま
- 旧SDKクライアント：未知の `scope: 'workspace'` はPR 14の契約に従い無視される
- 旧デーモン：SDKコンシューマーは `mcp_workspace_pool` ケーパビリティの欠如を検出してフォールバック可能

### テスト計画

- [ ] プールキー：env順列の安定性、ヘッダーの乖離、セッション単位フィルターの除外
- [ ] ライフサイクル：3セッション共有、ドレイングレース、同時アクワイアのデデュープ、スポーン失敗スロットの解放
- [ ] Tools + Prompts のデュアルファンアウト、セッション単位の信頼コピー、アタッチ時のスナップショットリプレイ
- [ ] ジェネレーションガード：再接続前ハンドラーが再接続後スナップショットを上書きしないこと
- [ ] クラッシュ + stdioバックオフ（5s × 3）とHTTPバックオフ（1/2/4/8/16s × 5）での再接続
- [ ] 子孫pidスイープ：Linux/macOS pgrep再帰、Windows PowerShell CIM
- [ ] ワークスペーススコープのバジェット：4セッション × budget=2 → 最大3（12ではない）；アタッチ済み全体にファンアウト
- [ ] ドレインウィンドウ内でのLoadSessionレジューム：プールエントリ再利用、コールドスタートなし
- [ ] ホットコンフィグリロード：旧／新エントリが共存；旧エントリは自然にドレイン
- [ ] リスタートルート：`?entryIndex=` の選択性；レガシー単一エントリのレスポンス形式を維持
- [ ] 再接続中のインフライトツール呼び出し：`MCPCallInterruptedError` の拒否
- [ ] スタンドアロン qwen：既存のmcp-client-managerテストがすべて変更なしで通過
```

## まとめ

F2 v2.1 = 6つのアトミックコミット（約6000 LOC）からなる単一PR、`daemon_mode_b_main` をターゲット。主要な設計の柱：

1. **`McpTransportPool`**（`packages/core`内、ACPチャイルドサイド）：ワークスペーススコープ、参照カウント + 30秒ドレイン
2. **フィンガープリントキー**：env/ヘッダーを含む正規化コンフィグのSHA-256（claude-codeパターン）、セッション単位フィルター（includeTools/trust）を除外
3. **`SessionMcpView`**：セッション単位のツール+プロンプトレジストリのプロジェクション（信頼コピー付き）
4. **スナップショットリプレイ + ジェネレーションガード**：アタッチ競合と古い通知への対応
5. **クロスプラットフォーム子孫pidスイープ**（opencodeパターン + Windowsポート）
6. **HTTP/SSEのオプトイン**、SDK MCPバイパス、OAuthはF3に延期
7. **バジェットステートマシン**：ワークスペーススコープに昇格；スナップショットセル + プッシュイベントは追加的に拡張（`scope?`）
8. **ステータス + リスタートルート**のリファクタリング：プール優先でブートストラップセッションフォールバック；`entryCount` + `RestartResult[]`

**未解決の問いQ1〜Q10**（§22）はサブPRオープン前にメンテナーによる決定が必要。F2-3着手前にQ1〜Q4の解決を推奨（大まかな方向性を決定するゲート）；Q5〜Q10は段階的に解決可能。