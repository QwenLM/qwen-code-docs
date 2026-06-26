# F2: 共有 MCP トランスポートプール — 設計 v2.2

> 対象: `daemon_mode_b_main` (#4175 ブランチ戦略に準拠)。#4175 Wave 5 PR 23 を置き換え。
> **単一 PR 納品**（メンテナーによる機能一貫性バッチガイダンス、2026-05-19 に基づく）。
> 著者: doudouOUC。日付: 2026-05-20。改訂: 2026-05-20（v2.2 — 実装レビューの統合）。

---

## 0. 変更履歴

### v2.2 (2026-05-20) — PR #4336 実装 + 32 件のレビュー統合

PR #4336 は F2 を 6 つのアトミックコミット + 6 つの修正コミットとして約 4 時間でリリースしました。Wenshao は 3 つのバッチに分けて累積レビューを実施。各バッチでインライン + クリティカルな修正が発生し、それらは統合されました。以下の表は、v2.1 からの変更点をレビューバッチごとにまとめたものです。

#### v2.1 → 初回レビューバッチ（コミット 1-4、wenshao C1-C7 + S1-S4）

| #   | サイト                                                        | 問題点                                                                                                                                                                     | 統合コミット  |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| C1  | `acpAgent.ts:269` — IDE 終了パス                              | プールのドレインは SIGTERM ハンドラでのみ実行されていました。IDE が開始する通常終了では、OS が回収するまでエントリがリークしていました。`await connection.closed` で SIGTERM のプールドレインをミラーリング | `ae0b296c4`   |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                          | `cancelDrainTimer` がフラップのたびに `maxIdleTimer` をリセットし、§6.3 のハードキャップを無効化していました。今は `drainTimer` のみクリアし、max-idle はエントリの全生存期間にわたって維持 | `ae0b296c4`   |
| C3  | `mcp-pool-entry.ts:doRestart`                                 | 再接続失敗により、エントリがゾンビ状態（`localStatus=CONNECTED`、`state='active'`、古いスナップショット）になる可能性がありました。try/catch を追加し、失敗時に `'failed'` に遷移 | `ae0b296c4`   |
| C4  | `mcp-pool-entry.ts:forceShutdown`                             | `state='closed'` を await の後に設定していたため、同時に `acquire` が実行されると `'active'` を観測して古い接続を渡す可能性がありました。同期的に先頭で設定 | `ae0b296c4`   |
| C5  | `mcp-transport-pool.ts:drainAll`                              | 同時に `acquire` が実行されると、ドレイン中に新しいエントリが生成される可能性がありました。`draining` ミューテックスフラグ + クリア前に `await Promise.allSettled(spawnInFlight)` を追加 | `ae0b296c4`   |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                      | リスナーが `serverName` でフィルタリングされていませんでした。すべてのエントリがすべてのサーバーのステータス通知を受け取り、さらにエントリ自身の `markActive` 書き込みがエコーバックされていました | `ae0b296c4`   |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`        | `discoverAllMcpTools` にはプールモードのゲートが追加されましたが、`Incremental` には漏れていました。`/mcp refresh` がプールをバイパスし、セッションごとのクライアントを生成していました | `ae0b296c4`   |
| S1  | `session-mcp-view.ts:passesSessionFilter`                     | ドキュメントで `excludeTools` が直接等価性を使用していること（括弧形式をサポートしない）を明記していませんでした。`mcp-client.ts:isEnabled` との差異 | `ae0b296c4`   |
| S2  | `pid-descendants.ts` の docstring                              | Windows 固有の `taskkill /F` ブランチが存在すると主張していましたが、実際には存在しませんでした。Node は `process.kill('SIGTERM')` を `TerminateProcess` にポリフィル | `ae0b296c4`   |
| S3  | `session-mcp-view.ts:applyTools` デバッグログ                 | 文字列に補間ではなくリテラルの `"N"` が含まれていました。オペレーターには `applied 12 tools (filtered to N registered)` と表示されていました | `ae0b296c4`   |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` ステータス cb | `() => CONNECTED` にハードコードされていたため、切断後は `aggregateStatusByName` が誤った値を返していました。`() => client.getStatus()` に修正 | `ae0b296c4`   |

#### コミット 5 自己レビューバッチ（R1-R3 小規模）

| #   | サイト                                            | 問題点                                                                                                                                                             | 統合コミット  |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| R1  | `server.test.ts:918` `/capabilities` エンベロープ | テストは `getAdvertisedServeFeatures()`（トグルなし）をアサートしていましたが、server.ts は `mcpPoolActive: opts.mcpPoolActive !== false`（デフォルトオン）を渡します。トグルをアンカー | `3e68c00bc`   |
| R2  | `server.test.ts` 機能デフォルトオンのカバレッジ    | デフォルトオプションで起動してプールタグがアドバタイズされることを検証するテストがありませんでした。`mcpPoolActive: false` のテストを明示的に追加 | `3e68c00bc`   |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`    | ドキュメントでは、PR 前の SDK は「新しい値を unknown として扱い、一般的に表示する」としていましたが、実際には `MCP_RESTART_REFUSED_REASONS.has(...)` が拒否 → サイレントドロップ | `3e68c00bc`   |

#### 2 回目レビューバッチ（コミット 1-5、wenshao R1-R10）

| #   | サイト                                                 | 問題点                                                                                                                                                                               | 統合コミット  |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                       | C2 の修正で `maxIdleTimer` はフラップを超えて正しく保持されましたが、ファイアアクションは `refs.size` に関係なく強制クローズしていました。グレース期間内に再アタッチしたアクティブセッションは 5 分後にツールを失う | `72399f109`   |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`     | `releaseAllPooledConnections` + 毎パスですべてを再取得すると、MCP ツールがゼロの短いウィンドウが発生し、かつすべてのドレインタイマーをリセットしていました。望ましいのは `(name, fingerprint)` ごとの差分 | `72399f109`   |
| WR3 | `mcp-pool-entry.ts:doRestart` スナップショットのファンアウト | 再起動で `toolsSnapshot`/`promptsSnapshot` が更新され、型付きイベントが発行されましたが、`SessionMcpView` インスタンスがそのストリームを購読していませんでした。スナップショット後に `subscribers` を直接イテレート | `72399f109`   |
| WR4 | `mcp-transport-pool.ts:getSnapshot` の subprocessCount  | websocket を `subprocessCount` にカウントしていました。websocket はリモートをダイヤルし、ローカルの子プロセスはありません。`'stdio'` のみに制限 | `72399f109`   |
| WR5 | `pid-descendants.ts` PowerShell の `-Filter`            | `${pid}` を `-Filter` 文字列に直接補間していました。エントリポイントの `Number.isInteger` ガードが現在はインジェクションを防いでいますが、将来のガード緩和に備えて `$p` にバインドして防御 | `72399f109`   |
| WR6 | `mcp-pool-entry.ts` コンストラクタの `cfg` フィールド    | `readonly cfg: MCPServerConfig` が暗黙的に public であり、環境 API キー / ヘッダー認証 / OAuth フィールドを公開していました。`private` に変更。唯一の外部リーダー用に新しい `transportKind` ゲッターを追加 | `72399f109`   |
| WR7 | `mcp-pool-events.ts` の時期尚早なエクスポート            | 5 つの PoolEvent 型ガード + `Prompt` の再エクスポート + `PoolEntryConnectionStatus` の呼び出し元がゼロでした。削除。`MCPCallInterruptedError` は保持（設計 §13.4 の要件） | `72399f109`   |
| WR8 | `acpAgent.ts:269,300` プールドレインの重複              | SIGTERM + IDE 終了に同一の `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }` ブロックがありました。`drainPoolBeforeExit(label)` ヘルパーを抽出 | `72399f109`   |

#### コミット 6 自己レビューバッチ（R1-R3 クリティカルレース）

| #   | サイト                                     | 問題点                                                                                                                                                                         | 統合コミット  |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`           | スロット解放レース: A が spawn を完了、B（別の fingerprint、同じ名前）が spawn を開始、A が drain。Close-cb は `entries` のみチェック（B はまだ未登録）→ 時期尚早な解放 | `0e58a098f`   |
| 6R2 | `events.ts:mcpBudgetWarningCount` の JSDoc  | ワークスペーススコープのイベントは N セッションにファンアウト → N 個のリデューサーがインクリメント。セッションを集約するコンシューマは二重カウント。Docstring を更新して乗数を明記 | `0e58a098f`   |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`         | 非同期ファンアウト中に `this.sessions.keys()` を直接イテレートしていました。同時 `killSession` によりイテレータが壊れる可能性あり。`Array.from(...)` でスナップショット | `0e58a098f`   |

#### 3 回目レビューバッチ（コミット 1-6、wenshao W1-W15）

| #   | サイト                                                           | 問題点                                                                                                                                                                                     | 統合コミット  |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` の catch                       | Spawn 失敗により `statusChangeListener` が永続的にリークしていました。`forceShutdown` のみがそれを削除します。catch に `entry.forceShutdown('manual')` を追加 | `4a3c5cd90`   |
| W2  | `mcp-pool-entry.ts:statusChangeListener` のクロスチェック         | モジュールレベルの `serverStatuses` マップがマルチフィンガープリントのエントリ間で共有されていました。A のトランスポートエラーが DISCONNECTED を書き込み、B のリスナーが B の `localStatus` を破損。`client.getStatus()` チェックを追加 | `4a3c5cd90`   |
| W3  | `mcp-pool-entry.ts:doRestart` の pid スイープ                     | 再起動で `listDescendantPids` + `sigtermPids` がスキップされていました。`npx`/`uvx` でラップされた stdio の再起動ごとに、実際の MCP 子プロセスが孤立していました。切断前にスイープを追加 | `4a3c5cd90`   |
| W4  | `mcp-pool-entry.ts:doRestart` のドレインタイマーレース             | ドレインタイマーが再起動の yield 中に発火する可能性がありました → `forceShutdown` がエントリを削除 → `client.connect` が孤立を生成。`doRestart` の先頭に `cancelDrainTimer` + `state→active` を追加 | `4a3c5cd90`   |
| W5  | `mcp-client-manager.ts:pooledConnections` のデッドハンドル         | エントリが `'failed'` に遷移したとき、マネージャーがデッドな `PooledConnection` を保持し続けていました。エントリのイベントを購読し、`'failed'` で削除（`get(name) === conn` ガードで冪等） | `4a3c5cd90`   |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` の再入性       | 2 つのパスがインターリーブすると、両方とも `set(name, conn)` を実行 → 最初の接続がリーク。`discoveryInFlight` ミューテックスを追加。2 つ目の呼び出し元は同じ Promise を待機。新しい回帰テスト | `4a3c5cd90`   |
| W9  | `acpAgent.ts:parsePoolDrainMs` の厳格性                          | `Number.parseInt` が `'30000ms'` / `'30000abc'` を受け入れていました。厳格な `^\d+$` 正規表現で拒否。stderr 警告 + デフォルトフォールバック | `4a3c5cd90`   |
| W10 | `mcp-transport-pool.ts:acquire` の indexAttach 順序              | `indexAttach` が `entry.attach()` の前に `sessionToEntries` を変更していました。`attach` がスローすると、逆インデックスが古くなります。`indexAttach` を `attach` 成功後（高速 + インフライトパスの両方）に移動 | `4a3c5cd90`   |
| W13 | `mcp-transport-pool.ts:subprocessCount` の JSDoc                  | ドキュメントは WR4 で stdio のみに制限された後も `stdio + websocket` と主張していました。更新 | `4a3c5cd90`   |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` の catch         | アンプールドパスでも W1 と同じ `statusChangeListener` リークが発生。同じミラー: 切断前に `forceShutdown` | `4a3c5cd90`   |
| W15 | `bridge.ts:restartMcpServer` のレスポンス                        | `as PoolEntries` キャストは安全ではありませんでした。ACP 子からの型付けされていない JSON。`Array.isArray` チェック + エントリごとの形状ガード。不正なエントリは stderr ブレッドクラムを付けてスキップ | `4a3c5cd90`   |

#### 却下・返信済み（F2 フォローアップとして提出）

| #   | サイト                                                 | 却下理由                                                                                                                                                                     |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7  | テストカバレッジのギャップ（未テストのクリティカルパス 4 つ） | 1/4 を追加（W6 回帰テスト）。残りは F2 シリーズマージ後のテストカバレッジ PR に延期 |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` が未使用     | 将来のヘルスモニター駆動の再接続（設計 §6.6）のための前方互換プレースホルダー。削除して再追加するとパブリック型が変更される |
| W11 | 高速パス / インフライトパスアタッチブロックの重複        | ✅ PR A で対応済み: `attachPooledSession` + `rollbackReservationOnSpawnFailure` プライベートヘルパー（コミット `2d546efca`） |
| W12 | `passesSessionFilter` の `applyTools` あたり O(M×N)       | ✅ PR A で対応済み: `applyTools` / `applyPrompts` がパスごとにフィルター `Set` を一度だけ事前計算。述語はツールあたり O(1)（コミット `a4a855ab3`） |
| R9  | `McpClientManager` コンストラクタの 7 位置センチネル       | ✅ PR A で対応済み: options-object コンストラクタ + `mkManager` テストファクトリ（コミット `0cb1eaa27`） |
| R10 | `pgrep -P <pid>` の PID あたり・レベルあたりのコスト        | ✅ PR A で対応済み: 単一の `ps -A -o pid=,ppid=` スナップショット + インメモリ BFS ウォーク。pgrep BFS は BusyBox <v1.28 / distroless のためのフォールバックとして保持（最終 PR A の一部としてコミット） |

#### バグ数

- **3 バッチ × 27 件のクリティカル / 重要な修正** + 5 件のドキュメント / 提案のフォールド = **合計 32 件のレビュー統合**
- **2 件のクリティカルレースは再確認でのみ発見**（6R1 スロット解放中の spawn レース、W6 discovery 再入性）
- **サイレント障害のリリースは 0** — すべての修正にはインライン `// F2 (#4175 commit X review fix — wenshao YN):` のブレッドクラムが元のレビューを指して付属

### v2.1 (2026-05-20) — 単一 PR 戦略 + 12 件のレビュー統合

| #       | 内容                                                                                                                          | 理由                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| V21-1   | 6 サブPR 計画から **単一の機能一貫性 PR** に変更、6 つのアトミックコミットで構成                                         | メンテナーガイダンス（#4175 ブランチ戦略）に従う。レビュアーは `git log -p` でコミットごとに読める |
| V21-2   | `sessionToEntries: Map<sid, Set<ConnectionId>>` 逆インデックスをプールに追加（§6）                                             | `releaseSession` が O(N エントリ) → O(セッションの参照数) に。1000 セッションスケールに必要 |
| V21-3   | 再起動ルートに `?fingerprint=` クエリパラメータを追加（§13.1）                                                                | オペレーターが同じ名前で複数のフィンガープリントがある場合、1 つのエントリのみ再起動したい。今追加するコストはほぼゼロ |
| V21-4   | Spawn 失敗パスで予約済みスロットを明示的に解放（§6.1、§6.5）                                                                 | そうしないと次のヘルスモニターパスまでスロットがリークする。微妙だが実際のバグ |
| V21-5   | 新しい §13.4: 再接続中のインフライトツールコールのセマンティクス                                                             | `MCPCallInterruptedError`。プールは自動再生しません（非安全な書き込み） |
| V21-6   | 新しい §10.4: `/mcp disable X` が `SessionMcpView` の再適用をトリガー                                                        | そうしないとセッション途中での無効化ですでに登録されたツールが削除されない |
| V21-7   | ステータスルートは raw フィンガープリントではなく `entryIndex` を公開（§8.3）                                                 | フィンガープリントの変更による OAuth トークンローテーションのサイドチャネル露出を回避 |
| V21-8   | 再接続バックオフを明確化: stdio 固定 5s × 3、HTTP/SSE 指数 1/2/4/8/16s × 5（§6.6）                                             | v2 では未記載。HTTP はネットワークフラップのためにより長いリトライバジェットが必要 |
| V21-9   | `canonicalOAuth(o)` が `{enabled: false}` ≡ `undefined` ≡ `null` を正規化（§5.1）                                             | そうしないと機能的に同等な設定が別個のエントリを生成する |
| V21-10  | プールフォールバックヘルパーを "legacy in-process acquire" から `createUnpooledConnection` に名称変更（§5.3、§6.1）            | SDK MCP バイパスは永続的であり、レガシーではない |
| V21-11  | `drainAll(opts?)` が `Promise<void>` を返し、`timeoutMs` の壁時計バジェットを持つ（§17）                                      | 呼び出し側はドレインがいつ終了するかを知る必要があり、シャットダウン順序に使う |
| V21-12  | SDK リデューサーフィールド名を固定（Q1 解決済み）: `mcpBudgetWarningCount` などを JSDoc でスコープセマンティクス付きで維持 | 公開 API を PR 途中で名前変更しない |
| V21-13  | Q3（デフォルトプールオン、`--no-mcp-pool` キルスイッチ）、Q4（HTTP/SSE オプトイン）、Q6（イーガー構築）を確定 | 単一 PR 納品。フラグゲーティングは不要 |
| V21-14  | R9/R10/R11 の単一 PR リスクを追加（§23）                                                                                      | レビュー疲れ、daemon_mode_b_main のマージコンフリクト、CI 時間 |
| V21-15  | 拡張機能アンインストールによる孤立エントリの処理は `MAX_IDLE_MS` による自然回収に延期（§16.3）                                | 明示的な `invalidateByExtension` なし。モデルを統一に保つ |

### v2 (2026-05-20) — v1 スケッチからの初期レビュー統合

| #   | 内容                                                                                                   | 理由                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| C1  | プールは **Tools + Prompts** をファンアウト（以前は Tools のみ）                                          | `McpClient` コンストラクタは両方のレジストリを取る。プロンプトはそうしないとプールモードでサイレントに失われる |
| C2  | **グローバル状態の共存**に関する新しいセクション（`serverStatuses` / `mcpServerRequiresOAuth` モジュール Maps） | クロスセッション共有はすでに存在する。プールは継承し、形式化する |
| C3  | `connectToMcpServer` ファクトリパスを F2-1 で `McpClient` クラスと **統合**                                  | v1 はクラスのみリファクタリング。並列の非プールパスが残る |
| C4  | アタッチ時のスナップショットリプレイ（earlyEvents スタイル）を `PoolEntry.attach()` に追加                     | 新しいレース: セッション B がアタッチ → サブスクリプションが配線される前にサーバーが `tools/list_changed` を発行 |
| C5  | 同時 acquire の重複排除のための `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                      | v1 はテストマトリックスで言及したが、実装契約では欠落 |
| C6  | クロスプラットフォームの子孫 pid スイープ（Linux/macOS pgrep、Windows wmic/PowerShell）                    | v1 は「opencode の `pgrep -P` をコピー」と記述 — それは Unix のみ |
| C7  | セッションごとのツールオブジェクトの `trust` フィールド **コピー**                                             | trust は `DiscoveredMCPTool` に存在。共有インスタンスはセッションごとの trust を混在させる |
| C8  | HTTP/SSE トランスポートはプールに **オプトイン**（デフォルト: stdio + websocket のみ）                       | 一部の MCP HTTP サーバーはトランスポートごとにセッション状態を維持。共有は状態漏洩のリスク |
| C9  | SDK MCP サーバー（`isSdkMcpServerConfig`）を明示的にバイパス                                                | `sendSdkMcpMessage` は設計上セッションごと |
| C10 | OAuth パスは明示的に **F3 に延期**                                                                      | OAuth フローは PermissionMediator スタイルのルーティングが必要。F2 の範囲外 |
| C11 | 再起動ルートのセマンティクスを明確化（名前 → 一致するすべてのエントリ）                                      | PR 17 の `POST /workspace/mcp/:server/restart` は以前は曖昧（1 エントリ）。現在は 1..N |
| C12 | ステータスルートのリファクタリングセクション（新しいパス: `QwenAgent.getMcpPoolAccounting()`）                | `httpAcpBridge.ts:733-770` は現在ブートストラップセッションのマネージャーを読み取る。変更が必要 |
| C13 | `PoolEntry` の生成カウンター、古くなった `tools/list_changed` ハンドラガード用                          | Opencode パターン: `if (s.clients[name] !== client) return` |
| C14 | サブPR 分割を 4 → **6** に                                                                             | v1 は過小評価。A2/B1/B3/C6 はそれぞれ実際の作業を追加 |
| C15 | レイジープール構築（N≥2 セッションが確認された場合のみ）— オプション                                        | `qwen serve --foreground` 単一セッションではメリットなし。初期化コストを節約 |
---
## 1. 目標 / 非目標

**目標**

- 1 つのワークスペース内で N 個のセッションが、ユニークなサーバ設定ごとに 1 つのプロセスを共有する (フィンガープリントキー方式)
- セッションごとに `ToolRegistry` / `PromptRegistry` のビューを保持する (フィルタリング、信頼設定)
- リファレンスカウント + グレースドレインのライフサイクルにより、再接続に耐える
- クロスプラットフォームでの子孫プロセス PID クリーンアップ
- バジェットガードレールをセッション単位からワークスペース単位に昇格 (PR 14 で約束済み)
- 非デーモンのスタンドアロン qwen との後方互換性 (そこではプールは構築されない)

**非目標 (F2 スコープ)**

- ワークスペース間のプール (1 デーモン = 1 ワークスペースという PR #4113 の不変条件を維持)
- デーモン間のプール (対象外 — マルチプロセスオーケストレーターの領域)
- OAuth ルーティングの再設計 (F3 で `PermissionMediator` と共に実施)
- デーモン再起動をまたぐプールの永続化 (インメモリのみ)
- 「プールセーフ」な HTTP サーバの自動検出 (オプトインフラグのみ)
- 稼働中の `MCPServerConfig` の差分を検出してエントリをその場で変更する (設定変更 → 新エントリ、旧エントリはドレイン)

---

## 2. 現在の状態 (置き換え対象)

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**結合マップ (F2 で解消または引き継ぐ必要のあるもの):**

| 結合                                                                                 | 場所                                              | F2 での対応                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `McpClient` コンストラクタが 1 つの ToolRegistry と 1 つの PromptRegistry にバインド | mcp-client.ts:106-119                             | プールがトランスポートを所有し、`SessionMcpView` (セッションごと) がセッションごとのレジストリを所有 |
| `McpClient.discover()` が `toolRegistry.registerTool()` をインラインで呼び出す       | mcp-client.ts:178-198                             | 分割: `discoverAndReturn()` がスナップショットを返し、ビューが登録する  |
| `ListRootsRequestSchema` ハンドラが `workspaceContext.getDirectories()` をクロージャで捕捉 | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | プールの単一ワークスペースバインド済みコンテキストを利用               |
| `workspaceContext.onDirectoriesChanged` リスナーが接続ごとに登録される                  | mcp-client.ts:907                                 | プールがエントリごとに 1 回だけ登録する                                |
| `McpClientManager` が ToolRegistry 内で `new` される                                   | tool-registry.ts:199                              | オプションの `pool?` コンストラクタパラメータを追加; Config から注入   |
| バジェット適用がセッションごと                                                         | mcp-client-manager.ts:91-95 のコメント            | ステートマシンをプールに移動                                           |
| `serverDiscoveryPromises` によるサーバごとのインフライト重複排除                      | mcp-client-manager.ts:350                         | プールが `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` を持つ  |
| `setMcpBudgetEventCallback` がセッションごとに登録                                       | acpAgent.ts:1851-1899                             | プールが発行 → `QwenAgent` が全セッションにブロードキャスト            |

**既に共有されている状態 (プールが継承し、新たに導入しないもの):**

| 状態                                              | 場所                             | 備考                                                              |
| ------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>`    | mcp-client.ts:292 (モジュールレベル) | 現在はプロセス全体で共有; プールキーは名前ベース → "any-CONNECTED-wins" |
| `mcpServerRequiresOAuth: Map<string, boolean>`    | mcp-client.ts:302 (モジュールレベル) | 同上                                                              |
| `MCPOAuthTokenStorage` のディスク上のトークン     | `~/.qwen/mcp-oauth/<name>.json`  | デーモンホストで共有; プールはより効率的に利用するだけ            |

---

## 3. 参考調査結果

| プロジェクト       | プール?                 | キー                                                 | ライフサイクル                                                                                           | 参考にするパターン                                                                                             |
| ------------------ | ----------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **claude-code**    | いいえ、プロセスごと    | `name + JSON.stringify(cfg)` (lodash.memoize)        | `clearServerCache` + リモートバックオフ×5; stdio クラッシュ → `failed`                                   | ソート済みキー SHA-256 `hashMcpConfig` で無効化/キー判定                                                     |
| **opencode**       | はい、ワークスペースごと | サーバ **名のみ** (設定ハッシュなし)                   | リファレンスカウントなし / 退去なし / 再起動なし; Effect finalizer + `pgrep -P` 再帰 SIGTERM               | 子孫プロセス PID スイープ、古いハンドラガード (`if (s.clients[name] !== client) return`)、`tools/list_changed` のイベントバス経由ファンアウト |

**F2 がそれぞれから継承するもの:** claude-code から設定ハッシュ (セッションごとの環境/認証の分岐を処理; opencode は非対応)、opencode から子孫プロセス PID スイープ (npx/uvx ラッパーがプロセスを漏らす)。新たに追加するもの: リファレンスカウント + ドレイン (マルチクライアントデーモン)、自動再起動 (長時間稼働デーモン)、プロンプトファンアウト、世代ガード。

---

## 4. アーキテクチャ

### 4.1 プロセスレイアウト

```
HTTP デーモン (packages/cli/src/serve, qwen serve)
  │ 起動
  ▼
ACP 子プロセス (qwen --acp, ワークスペースごとに単一プロセス)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── 新規、ワークスペーススコープ、1 インスタンス
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (デーモンワークスペースにバインド)
  │     └── バジェットガードレール (PR 14 のステートマシン、ワークスペースに昇格)
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ プール注入       │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   従来のインプロセス
                                  → SessionMcpView            (スタンドアロン qwen)
                                    .applyTools/Prompts
                                    (フィルタ + セッション自身の
                                     レジストリに登録)
```

**プールは ACP 子プロセス内に存在**し、HTTP デーモン内にはありません。HTTP デーモンは既存の `bridge.client` extMethod サーフェス (`getMcpPoolAccounting`, `restartMcpServer`) を介してプールの状態を照会します。F2 のコードは **`packages/core/src/tools/`** に置かれ (`mcp-client-manager.ts` と同階層)、`packages/acp-bridge/` ではありません。

### 4.2 クラス図

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (セッション破棄時の一括解放)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (ワークスペーススコープ)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (シャットダウン)
  └─ onBudgetEvent: (event) => void   (QwenAgent が設定)

PoolEntry (内部)
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   (再接続時に ++; 古いイベントガード)
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection (呼び出し元に返されるハンドル)
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (セッションごと、サーバごと)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (include/exclude でフィルタ、信頼をデコレート)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (自身の登録を削除)
```

---

## 5. プールキー (フィンガープリント)

### 5.1 ハッシュ化される正規化フィールド

```ts
type PoolKey = string; // sha256 hex、先頭 16 文字で十分 (現実的な N では衝突なし)
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] を k でソート
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9: 機能的に等価な OAuth 設定を正規化して、
 * 同じフィンガープリントにまとめる。`{enabled: false}`, `undefined`,
 * `null`, `{}` はすべて「OAuth なし」を意味し、`null` を返す。
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

// 除外フィールド (セッションごとのフィルタであり、トランスポートレベルではない):
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 トランスポートクラスによるゲーティング

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**デフォルトの `pooledTransports = {stdio, websocket}`**。オペレーターは以下で HTTP/SSE をオプトインします:

- CLI: `--mcp-pool-transports=stdio,websocket,http,sse`
- 環境変数: `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**HTTP/SSE がデフォルトで除外される理由**: 一部の MCP HTTP サーバ実装は、TCP/SSE ストリームに状態 (認証コンテキスト、会話メモリ) をバインドします。複数の ACP セッションで共有すると状態が混ざります。stdio + websocket は真の OS プロセスであり、その状態は観測可能かつ分離可能です。

### 5.3 SDK MCP バイパス

`isSdkMcpServerConfig(cfg)` が true の場合、プールは `createUnpooledConnection(name, cfg, sid)` を介して薄い `PooledConnection` ラッパーを返します。`McpClient` を即座に構築し、共有せず、プールにエントリも保存しません。理由: `sendSdkMcpMessage` は設計上セッションごとです (ACP コントロールプレーンを経由して元のセッションにルーティング)。HTTP/SSE が `pooledTransports` に含まれていない場合も同じパスを使用します (§10.3)。

V21-10: 名前は `createUnpooledConnection` であり、`legacyInProcessAcquire` ではありません — SDK MCP と HTTP オプトアウトは永続的な設計選択であり、レガシーコードではありません。

---

## 6. ライフサイクル

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2: 逆インデックス、releaseSession を O(entries) ではなく O(refs) にする。 */
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
          // V21-4: 起動失敗時に予約済みスロットを解放する。これがないと、
          // ヘルスモニターの解放パスが実行されるまでスロットがリークする
          // (実行されないのは、監視対象のエントリが存在しないため)。
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

  /** V21-2: O(全エントリ) ではなく O(このセッションの refs) で処理。 */
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

### 6.2 同時 acquire の重複排除 (`spawnInFlight`)

`McpClientManager.serverDiscoveryPromises` (mcp-client-manager.ts:350) を反映。これがないと、起動時に 5 つのセッションが同時に立ち上がった場合、すべてが `entries.has(id) === false` とみなして、5 つの子プロセスを起動する競合が発生します。

### 6.3 ドレイン猶予 + アイドル上限

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // 最後の解放後の猶予時間
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // ハードキャップ (ドレインキャンセルループ対策)
```

`PoolEntry` 内のステートマシン:

```
spawning ──起動成功──► active ──最後の detach──► draining ──タイムアウト──► closed
   │                     │                       │
   │                     │                       └──attach──► active (タイマーキャンセル)
   起動失敗───────────►failed
                          │
                          └──手動再起動──► spawning
```

ハードアイドル上限: ドレインタイマーは acquire/release のフラップによって無期限にキャンセルおよび再起動される可能性があります。`MAX_IDLE_MS` は別のタイマーであり、**最初のアイドル時に開始**され、その後リセットされません。発火すると、ドレインが現在アクティブな猶予中であっても強制終了します。バグのあるクライアントが acquire/release を繰り返してプールエントリがゾンビ化するのを防ぎます。

### 6.4 クロスプラットフォームの子孫プロセス PID スイープ

**R10 / R23 T7 / PR A 更新 (2026-05-22)**: プロセスごとの BFS (ノードごとに `pgrep -P <pid>` / `Get-CimInstance -Filter` サブプロセスを 1 つ起動) から、単一のプロセステーブルスナップショットとメモリ内ツリーウォークに切り替えました。動機は 2 つ: (1) ホットなプールシャットダウンパスでのフォーク回数が B^D から 1 回に削減される; (2) スナップショットの一貫性 — 修正前の BFS では隣接する BFS レベル間で子プロセスがフォークされた場合に見逃す可能性があった。プロセスごとのパスは、BusyBox `ps` <v1.28 (`-o` 非対応) や `ps` がない distroless コンテナ用のフォールバックとして残されています。

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // OS は孤児プロセスを回収する。プールシャットダウンはそのまま続行。
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* フォールバックへフォールスルー */
  }
  if (tree) return walkDescendants(tree, root); // O(子孫数)、1 フォーク
  return await listDescendantPidsUnixPgrepFallback(root); // レガシー BFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: 全プロセス (POSIX、-e と同等だが BSD では明確)。
  // -o pid=,ppid=: pid + ppid 列、末尾の `=` はヘッダーを抑制。
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // 25 万プロセス超の異常なホストにも対応
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* パース、childrenByPpid に追加 */
  }
  return childrenByPpid;
}

// Windows: 単一の Get-CimInstance Win32_Process | ConvertTo-Csv スナップショット
// ですべての (ProcessId, ParentProcessId) 行を取得し、メモリ内でツリーウォーク。
// プロセスごとの `Get-CimInstance -Filter "ParentProcessId=$p"` はフォールバックとして残す。
```

`PoolEntry.shutdown()` で `client.disconnect()` の前に呼び出されます。`npx @modelcontextprotocol/server-X`、`uvx ...`、`pnpm dlx ...` のラッパーによるリークを処理します。MAX_DESCENDANTS=256 / MAX_DEPTH=8 の上限は維持されます。

### 6.5 起動失敗処理

`spawnEntry` が、複数のサブスクライバーが `spawnInFlight` 経由でアタッチした後に reject した場合:

- 待機中の全員が reject を受け取る
- `tryReserveSlot` は **acquire 内の明示的な `.catch` アーム** によって解放される (V21-4)。この修正がなければ、スロットは次のヘルスモニターパスまでリークし、監視対象のエントリが存在しないためパスは決して実行されない。
- 失敗したエントリは `entries` に保存されない
- サブスクライバーのコードパスは、`acquire` が最初から失敗した場合と同様に処理される (既存のセッションごとの `discoverMcpToolsForServer` catch ロジックはそのまま有効)

### 6.6 再接続バックオフ (V21-8)

`PoolEntry` がトランスポート断後に再接続に入るとき:

| トランスポート種別 | 戦略                                   | 上限                                                          |
| ------------------ | -------------------------------------- | ------------------------------------------------------------- |
| stdio              | 固定 5秒 × 3 回                       | 既存の `DEFAULT_HEALTH_CONFIG.reconnectDelayMs` に準拠        |
| websocket          | 固定 5秒 × 3 回                       | stdio と同じ                                                  |
| http (オプトイン)  | 指数 1秒, 2秒, 4秒, 8秒, 16秒 × 5 回  | リモートエンドポイントは一時的なネットワーク問題で変動する; より長いバジェット |
| sse (オプトイン)   | 指数 1秒, 2秒, 4秒, 8秒, 16秒 × 5 回  | http と同じ                                                   |

上限に達すると、エントリは `failed` 状態に遷移。サブスクライバーは `failed` イベントを受け取る。同じ `ConnectionId` に対する新しい `acquire` は spawn を 1 回試行し、失敗した場合はスローする。オペレーターによる再起動 (§13) で状態がリセットされる。
---

## 7. ディスカバリ / SessionMcpView

### 7.1 Tools + Prompts のデュアルファンアウト

```ts
// packages/core/src/tools/mcp-client.ts — split discover into pure
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

// Legacy discover() retained, delegates to discoverAndReturn + registers (for standalone qwen)
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
      // C7: セッションごとの trust のコピー（共有スナップショットを変更しない）
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

### 7.2 アタッチ時のスナップショットリプレイ（earlyEvents スタイル）

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // 現在のスナップショットを即座にリプレイし、サブスクライバが
    // インフライトのディスカバリ完了とアタッチの間に発生した更新を
    // 見逃さないようにする。
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

これは PR 14b fix #1 の `BridgeClient.earlyEvents` パターンを反映したもので、プールアタッチにおける同種の競合を解決する。

### 7.3 スタルハンドラガード（生成カウンタ）

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // 別の reconnect で上書きされた
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
      .catch(/* 吸収 + ログ */);
  };
}
```

これがないと、reconnect 前の Client インスタンスからのスタルハンドラが、reconnect 後のスナップショットを古いデータで上書きする可能性がある。

**単調性不変条件**（V21 での明確化）: `generation` は単調増加のみで、リセットされない。インフライトの操作はエントリ時に `myGen` をキャプチャし、`await` 後に `myGen === this.generation` をチェックする。「開始以降、上書きイベントが発生していない」ことと等価。上限は Number.MAX_SAFE_INTEGER（1Hz reconnect で約 285k 年）であり、オーバーフローの懸念はない。

### 7.4 パスの統合（F2-1 スコープ拡張）

`packages/core/src/tools/mcp-client.ts` にはサーバ接続への **2 つの**パスが存在する:

1. `McpClient` クラス (mcp-client.ts:100) — `McpClientManager` で使用
2. `connectToMcpServer` ファクトリ関数 (mcp-client.ts:875) — `discoverMcpTools`（560行）および `connectAndDiscover`（607行）で使用

F2-1 では両方を `McpClient.discoverAndReturn` の背後で統合する必要がある（`connectToMcpServer` は `McpClient` の private ヘルパーになるか、両方が共有の `establishConnection()` プリミティブを呼び出すようにする）。そうしないと、プールはクラスパスしかカバーできず、ファクトリパスはセッションごとに残り、全体の取り組みが損なわれる。

---

## 8. グローバル状態の共存

### 8.1 `serverStatuses` (mcp-client.ts:292) — 衝突耐性のある書き込み

モジュールレベルの `Map<serverName, MCPServerStatus>`。プールの `ConnectionId` は `name::hash` だが、`updateMCPServerStatus(name, status)` は名前で書き込む。**同じ名前の複数のプールエントリ（異なるフィンガープリント、例：トークンの不一致）は互いのステータスを上書きする。**

**解決策**: プールがステータス書き込みをインターセプトする:

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
    // いずれかが CONNECTED なら CONNECTED
    // それ以外でいずれかが CONNECTING なら CONNECTING
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

ステータスルートは `entryCount: number` を公開し、運用者が name から複数エントリへのマッピングを確認できるようにする。

### 8.2 OAuth トークンストレージ

`MCPOAuthTokenStorage` は `~/.qwen/mcp-oauth/<serverName>.json` に書き込む — これは既にデーモンホスト間で共有されている。プールは副次的に恩恵を受ける（最初のセッションの OAuth が完了 → トークンがディスク上に → プールエントリの reconnect がトークンを取得 → 他の全セッションが利用可能）。

**注意点 — マルチフィンガープリントの場合**: 同じ名前で 2 つのエントリ（異なるヘッダ/env）だが同じ OAuth プロバイダの場合 → 両方が同じトークンファイルを読み取る。トークンがサーバスコープの場合（OAuth では通常）、これは機能する。トークンが env スコープの場合（まれ）、明示的なストレージキーの拡張が必要。**F3 に先送り**し、既知の制限として文書化する。

### 8.3 スナップショット内の `entryCount`

`GET /workspace/mcp` のサーバごとのセルに以下を追加:

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // NEW — この名前に対する N 個のプールエントリ
  entrySummary?: [                        // NEW — エントリごとの不透明な内訳
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**: `entrySummary[].entryIndex` は **エントリ作成時に割り当てられる安定した不透明な整数**（名前グループ内の挿入順）、**生のフィンガープリントではない**。理由: フィンガープリントは OAuth トークンや env 変数がローテーションされると変化し、その情報がスナップショット差分を通じて漏れる可能性がある（運用者が `'a3b1' → 'f972'` の遷移から「T+5分でトークンがローテーションされた」と推測できる）。`entryIndex` は名前グループ内で単調増加するが、ローテーション全体で安定している。なぜなら、古いエントリはドレインされ、新しいエントリは次のインデックスを取得するため。

古い SDK クライアントは PR 14 の契約に従い未知のフィールドを無視する。新しいクライアントはバッジに `entryCount` を使用する。フィンガープリントによる内部再起動パスは、HTTP スナップショットで公開されるのではなく、特権 extMethod 経由でのみ返される不透明なトークンを使用する。

---

## 9. WorkspaceContext / ListRoots

### 9.1 単一登録

プールの `McpClient` インスタンスは **1 つの** `WorkspaceContext` を共有する — デーモンのバインドされたワークスペースコンテキスト（PR #4113 の不変条件）。`connectToMcpServer` の `ListRootsRequestSchema` ハンドラはこの単一コンテキストをクローズする。

`onDirectoriesChanged` リスナーはエントリごとに **1 回のみ**登録され、`acquire` ごとではない。エントリのシャットダウン時にデタッチされる。

### 9.2 `roots/list_changed` のファンアップ

サーバが新しいルートをクライアントに通知 → プールがファンアウト:

- プールが再ディスカバリ（サーバは新しいルート下で異なるツールセットを報告する可能性がある）→ `toolsChanged` イベント → 全サブスクライバビューが再適用

### 9.3 セッションごとの `updateWorkspaceDirectories`

**契約**: Mode B では、セッションごとのディレクトリ追加はソフトヒントであり、権威あるものではない。プールの `WorkspaceContext` はデーモンレベルである。

2 つの実装選択肢:

- **v1 シンプル**: session ごとの追加を無視し、検出時に警告をログ出力
- **v2 ユニオン**: プールが `extraRoots: Map<sessionId, Set<dir>>` を管理し、ListRoots ハンドラがバインドされたワークスペース + すべての追加ルートのユニオンを返す。セッションごとの削除は `roots/list_changed` をトリガーする。50～80 LOC の複雑さが追加される。

**F2 では v1 シンプルを採用**; v2 ユニオンはユーザーからの不満が顕在化した場合のフォローアップとする。

---

## 10. セッションごとのインジェクション

### 10.1 `newSession({mcpServers})` からの `mcpServers`

`newSessionConfig(cwd, mcpServers, ...)` は、インジェクトされたリストを `settings.merged.mcpServers`（acpAgent.ts:1778-1831）とマージする。プールは **セッションごとのマージ済みビュー** を消費する:

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...既存の setMcpBudgetEventCallback は削除 — プールが直接ブロードキャストを処理
}
```

2 つのセッションが同名のサーバを異なる env/headers でインジェクトした場合 → 異なるフィンガープリント → 2 つのプールエントリ。プールの共有は、セッションが正確に一致する場合にのみ機能する。

### 10.2 認可の乖離

静的な `~/.qwen/settings.json` の mcpServers は全セッションで同一 → すべて共有 → 80% のケース。セッションごとのインジェクトされた mcpServers でユーザートークンが異なる場合 → 一意のフィンガープリント → 共有なし。どちらも安全。

### 10.3 HTTP トランスポートのオプトイン（§5.2 の再掲）

デフォルト `pooledTransports = {stdio, websocket}`。HTTP/SSE サーバは、運用者がオプトインしない限り `createUnpooledConnection` パス（セッションごとに 1 つの McpClient）を経由する。

### 10.4 セッション中の `/mcp disable X`（V21-6）

運用者がアクティブセッションに対して `/mcp disable github` を実行した場合:

1. `Config.disableMcpServer('github')` が per-Config の `disabledMcpServers` セットに追加
2. **F2 フック**: `Config.onDisabledMcpServersChanged` が発火; その名前に対応する `SessionMcpView` が `teardown()` を呼び出す（セッションのレジストリからツール/プロンプトの登録を削除）
3. プールエントリは、他のセッションがそれを参照している場合（refcount > 0）**存続する可能性がある** — 無効化したセッションのビューのみがデタッチされる
4. すべてのセッションが無効化した場合 → refcount → 0 → ドレインタマーが開始

ステップ 2 がない場合、セッション中の disable は、次回のセッション再起動まで既に登録されたツールをセッションの `ToolRegistry` に残す。テスト 21.4 でカバーする。

`/mcp enable github` はその逆: セッションの `pool.acquire` を再トリガーし、新しいビューをアタッチし、スナップショットを再適用する。

---

## 11. バジェットガードレールの卒業

### 11.1 ステートマシンがプールに移動

`tryReserveSlot` / `releaseSlotName` / 75% ヒステリシス / refused_batch の合体 / `bulkPassDepth` / `pendingRefusalNames` — すべて `McpClientManager` から `McpTransportPool` に移動。`McpClientManager` は、スタンドアロン実行時（プールが注入されていない場合）のみ状態を保持する。

### 11.2 スナップショットセルのスコープ

```ts
{
  kind: 'mcp_budget',
  scope: 'workspace',          // NEW 値 (PR 14 v1 は 'session' を返していた)
  liveCount: 5,
  clientBudget: 10,
  budgetMode: 'enforce',
  status: 'ok',
}
```

PR 14 の契約に従う: 「コンシューマは、認識できない scope 値を持つ追加エントリを許容しなければならない（ドロップしてはならない、失敗してはならない）。」古い SDK クライアントは `scope: 'workspace'` を認識し、不明としてレンダリングする（またはトップレベルの数値にフォールバック）。新しい SDK は `isWorkspaceScopedBudget(cell)` ヘルパーを追加する。

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

### 11.4 SDK 型契約の変更

PR 14b でエクスポートされたもの（追加的に拡張する必要がある）:

- `DaemonMcpBudgetWarningData` — `scope?: 'workspace' | 'session'` を追加（後方互換のためオプショナル; 省略時 = 'session'）
- `DaemonMcpChildRefusedBatchData` — 同じ `scope?` 拡張
- `DaemonMcpGuardrailEvent` — 判別子は変更なし

新しい SDK ヘルパー:

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`DaemonSessionViewState` のリデューサ状態:

- **新しいフィールドはなし** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` はスコープに関係なくインクリメントされる（スコープは各イベントのプロパティであり、別のストリームではない）
- F2 では、これらのカウントはワークスペースレベルのイベントが各セッションにファンアウトされることを反映している — バジェットプレッシャーが発生すると、**アタッチされたすべてのセッションで同時に**インクリメントされることを文書化

**V21-12（Q1 解決済み、v2.1 で確定）**: 既存のフィールド名 (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) を維持し、拡張されたスコープセマンティクスを JSDoc で文書化する:

```ts
/**
 * セッションが観測した `mcp_budget_warning` イベントの数。
 * F2 (`scope: 'workspace'`) の下では、バジェットイベントがワークスペースレベルで
 * ファンアウトされるため、アタッチされたすべてのセッションで同時にインクリメントされる。
 * 最新イベントのスコープを検査するには `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`
 * を使用すること。
 */
mcpBudgetWarningCount: number;
```

根拠: PR 14b は既にこれらの名前を公開 SDK サーフェスとして出荷しており、リネームはわずかに不正確なセマンティクスよりも深刻な破壊的変更となる。

---

## 12. OAuth — 明示的な F3 先送り

`connectToMcpServer`（mcp-client.ts:950-1010）の OAuth 401 フォールバックは、インタラクティブな解決（ブラウザを開くかデバイスフロー）を必要とする。Mode B デーモンは **ブラウザを起動してはならない**（PR 21 設計による — `open`/`xdg-open`/`shell.openExternal` の静的ソース grep テストはビルドに失敗する）。

**OAuth が必要なサーバに対する F2 の動作**:

1. 最初の acquire が `connectToMcpServer` をトリガー → 401 が検出される
2. プールが OAuth-required 例外をキャッチし、エントリを `failed_auth_required` としてマーク
3. ステータスルートが `errorKind: 'auth_env_error'`（既存の PR 13 errorKind）を公開
4. プールは **自動的にリトライしない**
5. 運用者が `/mcp auth <name>`（既存の CLI）を実行するか、PR 21 のデバイスフロールートを使用してトークンをディスクに取得 → 次のセッション acquire が再試行し成功する

**F3 はステップ 4-5 を**、OAuth 完了リクエストをアタッチされたセッションにルーティングして最初に応答させる `PermissionMediator` で置き換える。

これにより、F2 が認証ステートマシンの処理に混ざることを回避する。

---

## 13. 再起動ルートのセマンティクス

### 13.1 プール下の `POST /workspace/mcp/:server/restart`

現在（PR 17）: ブートストラップセッションのマネージャでの再起動 = その名前の単一エントリの再起動。

プール下: 名前 → 場合によっては複数のエントリ（同じ名前でも異なるフィンガープリント = 異なるセッション、異なる設定）。

**仕様動作**:

| リクエスト                                          | 動作                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`              | `serverName` に一致する **すべての** エントリを再起動（`Promise.allSettled` で並列実行）          |
| `POST /workspace/mcp/:server/restart?entryIndex=0` | V21-3: エントリ #0 のみ再起動（スナップショット §8.3 の不透明なインデックス）; 見つからない場合は 404 |
| `POST /workspace/mcp/:server/restart?entryIndex=*` | 明示的な「すべて」（パラメータなしと同じ）                                                       |

レスポンス形状:

```ts
type RestartResult = {
  entryIndex: number;        // V21-7: 不透明なインデックス、生のフィンガープリントではない
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

後方互換のため、`entries.length === 1` かつ `entryIndex` クエリパラメータがない場合、古い形状 `{restarted: true, durationMs}` を保持する。クライアントは `'entries' in response` をチェックして新しい形状を検出できる。

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

### 13.3 バジェットチェック（PR 17 の動作を維持）

再起動前にプールがバジェットをチェック: 切断+再接続が収まるなら OK。現在の PR 17 の `{restarted:false, skipped:true, reason:'budget_would_exceed'}` セマンティクスは維持される（エントリごとに適用されるようになっただけ）。

### 13.4 再接続中のインフライトツール呼び出し（V21-5、新規）

セッション A が `pool.callTool('git.commit', args)` を呼び出す → リクエストが基盤の子プロセスの stdin にヒット → 子プロセスが書き込み途中でクラッシュ → エントリが再接続に遷移:

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // 再接続前の generation
  readonly args: unknown;              // 元の引数。安全なら呼び出し元がリトライするため
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**仕様**:

- インフライトの呼び出し Promise は、トランスポートドロップが検出されたらすぐに `MCPCallInterruptedError` で reject される（再接続を待たない）
- プールは呼び出しを **自動リトライしない**; 書き込み（commit、ファイル編集など）に対してセマンティクスが安全ではなく、プールは読み取りと書き込みを区別できない
- 呼び出し元（通常はエージェントループのツール実行層）がこのエラーをキャッチし、リトライ / ユーザーに表示 / 中止を決定する
- 再接続後: セッション A は再呼び出し可能（同じ `PooledConnection.callTool`）; プールは新しいトランスポートインスタンスに透過的にルーティングする
- `MCPCallInterruptedError.clientGeneration` により、呼び出し元が必要に応じて後続の `reconnected` イベントと関連付けることができる

テスト 21.6 は以下をカバーする必要がある: 長時間実行の stdio MCP を起動し、ツール呼び出しを送信し、呼び出し途中で子プロセスを kill し、`MCPCallInterruptedError` の reject とそれがゼロでない `clientGeneration` を持つことをアサートする。

---

## 14. ステータスルートのリファクタリング

### 14.1 新しいクエリパス

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — データソースを置き換え
let accounting: McpClientAccounting | undefined;
try {
  // NEW: ブートストラップセッションではなく、ブリッジの extMethod 経由でプールを直接クエリ
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // 非プールデーモン用にレガシーのブートストラップセッションパスにフォールバック
  const manager = config.getToolRegistry()?.getMcpClientManager();
  if (manager) accounting = manager.getMcpClientAccounting();
}
```

`QwenAgent` は `getMcpPoolAccounting()` を公開する:

```ts
class QwenAgent {
  getMcpPoolAccounting(): McpClientAccounting | undefined {
    return this.mcpPool?.getAccounting();
  }
}
```

ACP 子プロセスは `extMethod` を介してデーモンが呼び出すためにブリッジする。

### 14.2 entryCount + entrySummary

§8.3 の通り。

### 14.3 ブートストラップセッションがない場合

現在（PR 12）、デーモンがアイドル状態（セッションがまだない）の場合、`GET /workspace/mcp` は `initialized: false` を返す。これは、クエリするブートストラップセッションがないためである。

プール下: プールは `QwenAgent` コンストラクタから存在する → ステータスルートは **セッションがゼロでも** ライブ accounting を返すことができる。セル `initialized: true` は最初のセッション前でも true。PR 説明で **文書化された動作変更**; リグレッションではない。

---

## 15. loadSession / resume の相互作用（PR 6 #4222）

### 15.1 レジューム時のドレインキャンセル

```
session-A がアクティブ、entry-X の参照を保持
session-A が切断（明示的な close なし）→ 最終的に killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → ドレインタマー開始（30秒）
session-A が 30秒以内にレジューム → 新しい newSessionConfig → pool.acquire が entry-X を返す → attach がドレインをキャンセル
session-A が 30秒後にレジューム → entry-X は既に閉じられている → プールが新しいエントリを生成（コールドスタート）
```
### 15.2 `restoreState` キャッシュウィンドウ（5分、PR 6 より）

`acpAgent.restoreState` は切断後5分間保持される。プールのドレイン（デフォルト30秒）< 復元ウィンドウ（5分）→ 30秒から5分の間に再開するとMCPのコールドスタートが発生する。許容可能なトレードオフ（再開自体が稀なパスであるため）。

代替案：プールがデーモンの復元ウィンドウ設定を読み取り、ドレイン時間を一致するよう延長する。プールとセッション状態マシン間の結合が増える。**ユーザーからコールドスタートの問題が報告されるまではフォローアップに延期**。

### 15.3 `pendingRestoreIds` の相互作用

`acpAgent.killSession()` は、`pendingRestoreIds` をクリーンアップした**後**に `pool.releaseSession(sid)` を呼び出さなければならない。順序：

1. セッションを復元可能としてマーク（`pendingRestoreIds.add(sid)`）
2. `Session.close()` — ただしプール参照は保持されたまま
3. `RESTORE_WINDOW_MS` 経過後に再開がない場合：`killSession` で完全にクリーンアップ → `pool.releaseSession(sid)` がドレインをトリガー

これにより、復元ウィンドウ中にドレインが発生するのを防ぐ。

---

## 16. ホットコンフィグリロード

### 16.1 フィンガープリント変更による暗黙的なリロード

ユーザーが `~/.qwen/settings.json` を実行中に編集し、サーバーの環境変数を変更した場合：

1. 古いセッションは古い `Config`/`McpServers` のスナップショットを保持 → 古いフィンガープリントを取得し続ける → entry-OLD の参照が残る
2. 新しいセッションは新しい設定を読み込む → 新しいフィンガープリント → entry-NEW が作成され、entry-OLD と共存
3. 古いセッションが自然に閉じる → entry-OLD がドレイン → 最終的にクローズ
4. 定常状態：entry-NEW のみが残る

**実行中の接続に対するライブミューテーションは行わない** — 異なる設定バージョンを持つセッション間は完全に分離される。

### 16.2 強制リロードルート（オプション）

```
POST /workspace/mcp/reload-all
  → 各セッションに対して：設定を再読み込み、Config.mcpServers を置き換え
  → 参照されなくなった各エントリーに対して：エビクションをスケジュール
```

「環境変数を変更したので、全セッションに即座に反映させたい」という場合に有用。F2 フォローアップに延期（ブロッカーではない）。

### 16.3 拡張機能アンインストール時の孤立エントリー（V21-15）

シナリオ：拡張機能 `foo-ext` が MCP サーバー `foo-server` を登録している。オペレーターが `/extension uninstall foo-ext` を実行する。拡張機能のライフサイクルにより `extensionMcpServers` から `foo-server` が削除され、以降の `loadCliConfig` 呼び出しには含まれなくなる。しかし：

- 実行中のセッションは依然として `foo-server` を含む `Config` スナップショットを保持している → それらのセッションはエントリーを使い続ける
- アンインストール後の新しいセッションはこのサーバーを取得しない（マージ後の mcpServers に含まれないため）→ 参照カウントは増加しない

**解決策**：自然なドレインに依存する。古いセッションが閉じるにつれて参照カウントが減少し、最終的にエントリーが `MAX_IDLE_MS = 5分` に達して強制クローズされる。**明示的な `pool.invalidateByExtension(name)` API は設けない** — ホットコンフィグリロード（§16.1）と統一されたモデルを維持する。

トレードオフ：長期セッションが生存している場合、アンインストール後も拡張機能のサーバーが最大5分間動作し続ける可能性がある。許容範囲。緊急時はオペレーターが `/mcp restart foo-server` を実行し、セッションを強制終了すればよい。

---

## 17. シャットダウンの順序付け

`QwenAgent.close()` のシーケンス（順序厳守）：

```
1. acceptingNewSessions = false に設定。新規 POST /session を拒否
2. 進行中のプロンプトごとに：キャンセルを通知し、完了を待機（既存の PR 11 ライフサイクル）
3. 各セッションに対して：close をトリガー → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← 30秒の猶予をバイパス
   ├── 各エントリーに対して：ドレイン+ヘルスタイマーをキャンセル、draining にマーク
   ├── 各エントリーに対して並列：listDescendantPids → 子プロセスに SIGTERM
   ├── 各エントリーに対して並列：client.disconnect()
   └── timeoutMs に対する Promise.race。タイムアウトしたエントリーは SIGKILL
5. ブリッジチャネルをクローズ
6. プロセス終了
```

**V21-11**: `drainAll` のシグネチャ:

```ts
async drainAll(opts?: {
  force?: boolean;       // デフォルト false。true の場合は30秒の猶予タイマーをバイパス
  timeoutMs?: number;    // デフォルト 10_000。経過時間ベースの予算。タイムアウト後に残ったものは SIGKILL
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // 正常に切断できたエントリー数
  forced: number;        // タイムアウト後に SIGKILL されたエントリー数
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

呼び出し側は `DrainResult` をシャットダウンログに使用する。`forced > 0` の場合は警告をログ出力し、オペレーターにサーバーが正常にシャットダウンしなかったことを知らせる。

---

## 18. ファイル構成

**新規ファイル:**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool 本体（約700行）
  mcp-pool-key.ts              # fingerprint + canonicalize ヘルパー（約150行）
  mcp-pool-entry.ts            # PoolEntry: refcount + drain + health + generation（約500行）
  session-mcp-view.ts          # SessionMcpView: フィルタリング + tools/prompts の登録（約200行）
  mcp-pool-events.ts           # PoolEvent 判別共用体（約80行）
  pid-descendants.ts           # listDescendantPids クロスプラットフォーム（約150行、テスト含む）

packages/core/src/tools/
  mcp-transport-pool.test.ts   # 約900行
  mcp-pool-entry.test.ts       # 約400行
  session-mcp-view.test.ts     # 約250行
  mcp-pool-key.test.ts         # 約150行
  pid-descendants.test.ts      # 約200行（Unix + Windows スキップゲート付き）
```

**変更ファイル:**

```
packages/core/src/tools/mcp-client.ts            # discoverAndReturn() 分割。connectToMcpServer を統一
packages/core/src/tools/mcp-client-manager.ts    # pool パラメータをオプション化。budget 状態を条件付きに
packages/core/src/tools/tool-registry.ts         # pool を config から McpClientManager にスレッド
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # QwenAgent.mcpPool 構築。broadcastBudgetEvent。
                                                 # newSessionConfig で pool を Config に結線。
                                                 # killSession で pool.releaseSession を呼び出し
packages/cli/src/serve/run-qwen-serve.ts           # --mcp-pool-transports + budget env を ACP 子プロセスに渡す
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus が pool を読み取り。
                                                 # restartMcpServer extMethod が RestartResult[] を返す
packages/cli/src/serve/capabilities.ts           # mcp_workspace_pool をアドバタイズ
packages/sdk/src/daemon/mcpEvents.ts             # scope?: オプショナルフィールド。isWorkspaceScopedBudgetEvent ヘルパー
```

---

## 19. 単一PRでのデリバリー — コミット分割（V21-1）

メンテナーによる機能一貫性のあるバッチ分割ガイドライン（#4175 ブランチ戦略 2026-05-19）に従い、F2 は **1つのPRに6つのアトミックコミット** として出荷する。レビュアーは `git log -p HEAD~6..HEAD` でコミットごとにレビューできる。

| コミット # | タイトル                                                                                         | スコープ                                                                                                                                                                                                                                                                                                                                                            | 影響範囲                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1          | `refactor(core): McpClient.discover を純粋なツール/プロンプト一覧に分割し、接続パスを統一`         | `discoverAndReturn()` を追加。`establishConnection()` を抽出し、`McpClient.connect()` と `connectToMcpServer()` ファクトリの両方で使用。レガシー `discover()` は登録を行う薄いラッパーになる（スタンドアロン qwen の動作を維持）。動作の観測可能な変更はゼロ。                                         | `mcp-client.ts`, `mcp-client.test.ts`                                                                                    |
| 2          | `feat(core): McpTransportPool + SessionMcpView`                                                  | プールコア: `fingerprint`, refcount, `spawnInFlight` 重複排除, `sessionToEntries` 逆インデックス, ドレインステートマシン, アタッチ時のスナップショット再生, generation ガード, tool+prompt 双方向ファンアウト, セッションごとの trust コピー。ユニットテスト用の Mock McpClient。プロダクションへの配線なし。                                                         | 新規 `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + テスト |
| 3          | `feat(core): クロスプラットフォームの子孫PIDスイープ + プールヘルスモニター`                        | `listDescendantPids`（Unix は `pgrep -P` 再帰、Windows は PowerShell CIM）。`PoolEntry` 内の統合ヘルスモニター（間隔チェック + 失敗回数 + §6.6 の再接続バックオフ）。`QWEN_INTEGRATION === '1'` でゲートされたサブプロセス生成統合テスト。                                                                                                                      | 新規 `pid-descendants.ts` + テスト。`mcp-pool-entry.ts`                                                                    |
| 4          | `feat(serve): McpTransportPool を QwenAgent デーモンモードに配線`                                 | `Config.setMcpTransportPool` + `getMcpTransportPool`。`ToolRegistry` が pool を `McpClientManager` にスレッド。`McpClientManager` のオプショナル `pool?` コンストラクタパラメータ。`acpAgent.QwenAgent` が初期化時に pool を構築。`newSessionConfig` 注入。`killSession` で `pool.releaseSession` を呼び出し。SDK MCP + HTTP/SSE は `createUnpooledConnection` でバイパス。CLI フラグ `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`。 | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                               |
| 5          | `feat(serve): プール対応のステータス + 再起動ルート`                                              | `QwenAgent.getMcpPoolAccounting` extMethod。`httpAcpBridge.buildWorkspaceMcpStatus` はプール優先 + ブートストラップセッションフォールバック。`restartMcpServer` は `?entryIndex=` を受け付け、`RestartResult[]` を返す。セルに `entryCount` + `entrySummary[].entryIndex`。機能タグ `mcp_workspace_pool` + `mcp_pool_restart`。                                           | `httpAcpBridge.ts`, `capabilities.ts`, SDK 型                                                                         |
| 6          | `feat(serve): MCP バジェットガードレールを作業スペーススコープに昇格`                              | `tryReserveSlot`/`releaseSlotName`/ヒステリシスステートマシンを `McpClientManager` からプールに移動。`acpAgent.newSessionConfig` でのセッションごとの `setMcpBudgetEventCallback` 配線を削除。`QwenAgent.broadcastBudgetEvent` ファンアウト。スナップショットセル `scope: 'workspace'`。SDK の `scope?` 追加フィールド。`isWorkspaceScopedBudgetEvent` ヘルパー。インラインドキュメント更新。 | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                 |

**推定総LOC**: プロダクション約4100 + テスト約1900 = 約6000 LOC（v2推定約3850から増加。V21の修正分を吸収）。

**マージターゲット**: `daemon_mode_b_main` への単一PR。定期的に `main` にバッチマージ（#4175戦略に従う）。

**PRを開く前のセルフレビュープロセス**:

1. 各コミット後、`code-reviewer` エージェントをコミット差分に対して実行。採用した指摘は同じコミットに取り込む
2. コミット2/4/6（設計リスクが最も高いもの）には、さらに `silent-failure-hunter` + `type-design-analyzer` を実行
3. 6つのコミットがすべて揃ったら、異なるエージェントの組み合わせでPR全体の差分に対して3回の完全レビューパスを実行
4. 影響を受ける全パッケージでテストスイート・型チェック・lint をフル実行

PR 21 の専門家による事前レビューパターンをミラーリングする。

---

## 20. 機能タグ + SDK契約変更

### 20.1 新機能タグ（v0.16, V21-1 でアトミックにアドバタイズ）

F2 は単一PRで出荷されるため、3つのタグはすべて同時にアドバタイズされる。プール利用者は **`mcp_workspace_pool` のアドバタイズが存在すれば、`entryCount`/`entrySummary`/`scope?` フィールドがすべて存在する** と想定してよい。フィールドごとの機能チェックは不要。

| タグ                          | アドバタイズ条件                                                                                   | 意味                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `mcp_workspace_pool`         | `QwenAgent.mcpPool !== undefined` の場合（デーモンモードでは `--no-mcp-pool` キルスイッチがなければ常に真） | `GET /workspace/mcp` がプールレベルの状態を反映。`entryCount` + `entrySummary` フィールドが存在                |
| `mcp_pool_restart`           | `mcp_workspace_pool` がオンの場合は常に                                                               | `POST /workspace/mcp/:server/restart` が `?entryIndex=` を受け付け、`entries: RestartResult[]` を返す可能性あり  |
| (`mcp_guardrails` を拡張)     | 変更なし                                                                                              | 同じタグ。ペイロードに `scope` が追加（F2 では `'workspace'`）                                                |

### 20.2 SDK 追加インターフェース

```ts
// @qwen-code/sdk — 追加のみ
export interface DaemonMcpBudgetWarningData {
  // 既存フィールド...
  scope?: 'workspace' | 'session'; // NEW — 古いデーモンには存在しない（'session' を意味する）
}

export interface DaemonMcpChildRefusedBatchData {
  // 既存フィールド...
  scope?: 'workspace' | 'session';
}

export interface ServeWorkspaceMcpServerStatus {
  // 既存フィールド...
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

`EVENT_SCHEMA_VERSION` は `1` のまま（追加のみ）。

---

## 21. テストマトリックス

### 21.1 プールキー（F2-2）

- 同じ設定 → 同じキー（env-key の順列は安定、header-key の順列は安定）
- env の値が1バイト異なる → 異なるキー
- ヘッダー `Authorization` の値が異なる → 異なるキー
- `includeTools`/`excludeTools`/`trust` を変更 → 同じキー（セッションごとのフィルター）
- 同一内容の `new MCPServerConfig(...)` × 2 → 同じキー（正準ハッシュ、同一性ではない）

### 21.2 ライフサイクル（F2-2）

- 3つのセッションが同じキーを取得 → 1つの spawn（`client.connect` のスパイで確認）
- 解放シーケンス n, n-1, ..., 1 → 1→0 になったときのみドレインタイマー開始
- 30秒のドレイン：25秒で取得するとタイマーキャンセル。35秒で取得すると新しいエントリーを spawn
- `MAX_IDLE_MS`（5分）でもドレインフラッピング中は強制クローズ
- 実行中に spawn が失敗：すべての待機者がエラーを受け取る。スロット解放。エントリーは保存されない

### 21.3 同時取得（F2-2）

- 5つの同時 `acquire(sameKey)` でエントリーが存在しない場合 → ちょうど1回の `spawnEntry` 呼び出し。5つすべてが同じエントリーを取得
- Spawn が拒否 → 5つの待機者がすべて同じエラーで reject。後続の acquire は再 spawn

### 21.4 セッションごとの分離（F2-2）

- セッションA `excludeTools: ['foo']`、セッションB 除外なし → A の ToolRegistry は foo を除外、B は含む。両方とも同じ `toolsSnapshot` から取得
- セッションA `trust: true`、セッションB `trust: false` → A の `DiscoveredMCPTool.trust === true`、B は `false`。共有参照でないことを確認（一方を変更しても他方に影響しない）
- セッションA がプロンプトのみのサーバーを取得 → A の PromptRegistry は登録、ToolRegistry はそのサーバーに対して空

### 21.5 ツール/プロンプト一覧の変更（F2-2）

- サーバーが `notifications/tools/list_changed` を発行 → 全サブスクライバーの `applyTools` が新しいスナップショットで呼び出される
- 再接続前の generation からの古いハンドラがスナップショットを上書きしない
- `notifications/prompts/list_changed` も同様

### 21.6 クラッシュ + 再接続（F2-2）

- `process.kill` でサブプロセスを強制終了 → サブスクライバーは `disconnected` イベントを受け取る
- 3回の再接続試行（既存の `MCPHealthMonitorConfig` を使用）→ 成功 → `reconnected` + 新しいスナップショット
- リトライを使い果たす → 全サブスクライバーが `failed` を受け取る。エントリーは `failed` 状態に遷移。新しい acquire は1回リトライしてからスロー

### 21.7 子孫PIDスイープ（F2-2b）

- Linux/macOS: stdio コマンドとして `bash -c "sleep 60 & sleep 60"` を spawn → ルートを kill → 両方の子孫が回収されたことを確認（`/proc/<pid>/status` のポーリング、または `kill(0, pid) === false`）
- Windows: `cmd /c "ping -t localhost"` ラッパーを spawn → kill → ping サブプロセスがなくなったことを確認
- `pgrep` が利用不可（PATH にない）→ グレースフルデグラデーション：警告をログ出力、ルートに SIGTERM を送るだけで、クラッシュはしない

### 21.8 ワークスペーススコープのバジェット（F2-4）

- 4セッション × `--mcp-client-budget=2`、静的 MCP サーバー3つ → ワークスペース合計 = 3（12ではない）。スナップショットセル `scope: 'workspace'`、`liveCount: 3`
- バジェット警告は、ワークスペース全体で75%の上昇閾値を超えたときに1回だけ発火。4つのセッションすべてに同時にブロードキャスト
- ヒステリシス再アーム：37.5%に低下 → 次に閾値を超えたときに再び発火

### 21.9 後方互換性（F2-3）

- スタンドアロン `qwen`（デーモンなし）→ `mcpPool === undefined` → 既存の `mcp-client-manager.test.ts` テストはすべてそのまま合格
- `--no-mcp-pool` デーモンフラグ → セッションごとの動作にフォールバック。既存のデーモン e2e テストはすべて合格

### 21.10 クレデンシャル分離（F2-3）

- セッションA が `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}` を注入、セッションB は `tokenB` → 2つの別プロセス。スナップショットで `entryCount: 2` を確認。ツール呼び出しがそれぞれのトランスポートを通ることを確認（stdin/log でのヘッダー検査による）

### 21.11 LoadSession / 再開（F2-3）

- セッションクローズ → ドレイン開始 → 30秒以内に再開 → プールエントリーが再利用される（コールドスタートなし。`client.connect` のスパイカウントで確認）
- 30秒後、復元ウィンドウ期限内に再開 → プールはコールドスタート。restoreState の内容は保持される

### 21.12 再起動ルート（F2-3b）

- 名前に対して1つのエントリー → `POST /workspace/mcp/foo/restart` がレガシーな `{restarted: true, durationMs}` 形状を返す
- 名前に対して2つのエントリー（異なるフィンガープリント）→ `{entries: [{fingerprint, restarted, ...}, ...]}` を返す
- 別の再起動が進行中に再起動 → 2回目の呼び出しは同じ Promise を返す（重複排除）
- バジェット超過になる再起動 → エントリーごとに `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` を返す

### 21.13 ステータスルート（F2-3b）

- アイドル状態のデーモン（セッションなし）だが、プールに以前のセッションからのキャッシュエントリーがある場合 → `GET /workspace/mcp` が `initialized: true` とライブのアカウンティングを返す
- ブートストラップセッションが存在しない場合 → プール直接パスにフォールバック。エラーなし
- プールクエリがスローする場合 → ブートストラップセッションパスにフォールバック。スナップショットがクラッシュすることはない

### 21.14 SDK リデューサー（F2-4）

- ワークスペースイベントがブロードキャストされたとき、`mcpBudgetWarningCount` が全サブスクライバーセッションで同時に増加する
- `isWorkspaceScopedBudgetEvent(e)` がペイロードからスコープを正しく識別する
- 古いデーモン（`scope` フィールドなし）→ デフォルトで 'session' として解釈

### 21.15 ホットコンフィグリロード（F2-3）

- 実行中の settings.json 変更 → 古いセッションは古いエントリーを保持、新しいセッションは新しいエントリーを作成。両者が共存。最後の古いセッションが閉じると古いエントリーは自然にドレイン
- 古いセッションクローズ後セッション数0 → ドレインタイマーが発火 → 古いエントリーは GC → 新しいエントリーのみ残る

### 21.16 シャットダウン順序（F2-3）

- `QwenAgent.close()` が順にトリガー：受け入れ停止 → プロンプトドレイン → セッションクローズ → `pool.drainAll` → 終了後に `pgrep -P <acpChildPid>` でゾンビプロセスがいないことを確認
---

## 22. 未解決の質問

V21 では Q1/Q3/Q4/Q6 を設計デフォルトに固定（単一 PR での提供）。Q2/Q5/Q7/Q8/Q9 は未決定のまま。

| # | 質問 | F2 設計デフォルト | 決定が必要なタイミング |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------- |
| Q1 ✅ | SDK リデューサーフィールド名 — リネームするか、維持するか？ | **LOCKED v2.1**: `mcpBudgetWarningCount` などを維持し、JSDoc で拡張スコープのセマンティクスを記述 | 解決済み |
| Q2 | `mcp_workspace_pool` 機能 — `protocolVersions` をバンプするか（'v1' → 'v1.1'）、それとも 'v1' のままアドオンするか？ | **'v1' のままアドオン**（PR 14b の先例と一致） | コミット 5 |
| Q3 ✅ | `--no-mcp-pool` フラグ — デフォルトオンにするか、オプトインにするか？ | **LOCKED v2.1**: デフォルトオン；`--no-mcp-pool` はキルスイッチ | 解決済み |
| Q4 ✅ | HTTP/SSE デフォルト — プールはオフかオンか？ | **LOCKED v2.1**: プールオフ；`--mcp-pool-transports` でオプトイン | 解決済み |
| Q5 | `POST /workspace/mcp/reload-all` — F2 に含めるか、それとも後続対応にするか？ | **後続対応** | n/a（延期） |
| Q6 ✅ | 遅延プール構築 — 条件分岐の価値があるか？ | **LOCKED v2.1**: 即時（`QwenAgent` コンストラクタで常に構築） | 解決済み |
| Q7 | `restoreState` のウィンドウとプールドレイン — 別々に維持するか、統一するか、設定から読み込むか？ | **別々に 30 秒デフォルトを維持** + 設定可能な `--mcp-pool-drain-ms` | コミット 4 |
| Q8 | OAuth 処理 — F3 への延期を確認し、回避策を文書化するか？ | **F3 に延期**、`/mcp auth <name>` の回避策を文書化 | コミット 4 |
| Q9 | `entrySummary` の公開 — 常に含めるか、詳細フラグの背後に隠すか？ | **常に含める**（ペイロードが小さく、運用に有用） | コミット 5 |
| Q10 | `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` の決定 #3 を更新する — @wenshao と調整するか？ | F2 PR 説明が codeagents PR にリンク；2 つの PR は独立してレビューされる | PR オープン |

---

## 23. リスク

### 高

- **R1（A2 グローバル状態）**: 複数エントリで同名の場合の `serverStatuses` の衝突。集約ステータス関数で緩和；残りのリスクは SDK コンシューマーが生のグローバル Map を読むこと（`getMCPServerStatus(name)` アクセサを介してのみ使用されるため可能性は低い）。
- **R2（PromptRegistry の対称性）**: いずれかのコードパスでプロンプトのファンアウトを忘れると、サイレントにプロンプトが失われる。F2-2 テスト 21.4 の 3 番目の箇条書きと、F2 以前と同等のプロンプトであることをアサートする統合テストで緩和。
- **R3（HTTP トランスポートの状態漏洩）**: トランスポートごとの状態を維持するサーバーに対して HTTP プールをオプトインすると、セッションコンテキストが破損する。デフォルトオフ + ドキュメントで緩和；自動検出は不可能。

### 中

- **R4（パス統一 F2-1）**: `connectToMcpServer` ファクトリと `McpClient` クラスには微妙な動作の差異がある（例：コンストラクト時にアドバタイズされる機能とコネクト時にアドバタイズされる機能）。F2-1 がプール作業開始前に完全なリグレッションカバレッジを持つ純粋なリファクタ PR であることで緩和。
- **R5（Windows 子孫 pid）**: PowerShell `Get-CimInstance` は遅い可能性がある（起動コスト）か、AppLocker によりブロックされる可能性がある。2 秒のタイムアウト + グレースフルデグラデーションで緩和。
- **R6（プールイベントブロードキャストの増幅）**: 予算警告が 100 セッションにファンアウトすると、タイトループ内で 100 回の extNotification 呼び出しが発生する。`Promise.all` による並列化 + セッションごとのキャッチ（既存の PR 14b パターン）で緩和。

### 低

- **R7（MCPServerConfig バージョン間でのフィンガープリントの安定性）**: 将来 `MCPServerConfig` に追加されたフィールドがフィンガープリントに含まれない場合、誤った共有が黙って許可される可能性がある。明示的な正規化関数 + すべての `MCPServerConfig` フィールドを列挙してカバレッジをアサートするテストで緩和。
- **R8（世代カウンタの競合）**: 急速な再起動サイクルにより JS の数値精度（約 2^53 = 1 秒あたり約 285k 年）を超える可能性がある。実用的な懸念事項ではない。

### 単一 PR 固有（V21-14）

- **R9（約 6000 LOC の単一 PR に対するレビュー疲労）**: レビューアの帯域がクリティカルパスになる。F3 は F2 マージ後にブロックされる → 他のコントリビューターをブロックする。緩和策: (a) 3 人の専門エージェントによる事前レビューと、P0/P1 を折りたたんでからオープンする（PR 21 のパターンを反映）；(b) 6 つのアトミックコミットとして構成し、レビューアが段階的に進められるようにする；(c) #4175 のコメントで @wenshao と事前にレビュー期間を調整する。
- **R10（`daemon_mode_b_main` のマージコンフリクト蓄積）**: F2 は `acpAgent.ts`、`httpAcpBridge.ts`、`capabilities.ts`、`mcp-client*.ts` に触れる — すべてホットパス。F3 / F4 のコントリビューターが同時にランディングすると、F2 の 1～2 週間のレビュー期間中にコンフリクトが発生するリスクがある。緩和策: 毎日の `git rebase origin/daemon_mode_b_main`；#4175 の更新で F2 が進行中であることを通知し、F3/F4 に F2 がマージされるまでホットファイルの変更を延期するよう依頼する。
- **R11（CI 実行時間）**: サブプロセス spawn + クロスプラットフォーム pid スイープを含む約 1900 LOC の新しいテストにより、CI が 30 分から 50 分に増加する可能性がある。緩和策: (a) サブプロセステストを `process.env.QWEN_INTEGRATION === '1'` でガードし、PR CI ではサブセットを実行、フルセットはナイトリーテストで実行；(b) Vitest 並列度 ≥ 4；(c) Windows pid スイープテストは GHA Windows ランナーでのみスキップゲート。

---

## 24. ドキュメント更新

| ドキュメント | 更新内容 | タイミング |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` | 決定 #3 "MCP server lifetime": 現在 "per-session"；デーモンモードでは "workspace-pooled with config-hash key under daemon mode; per-session standalone" に更新 | F2-3 マージ時（@wenshao の codeagents PR と調整） |
| `codeagents/qwen-code-daemon-design/06-roadmap.md` | Wave 5 PR 23 → F2 シリーズとマーク；PR にリンク | F2-3 マージ時 |
| `packages/cli/src/serve/README.md`（存在する場合）または新規 `docs/serve/mcp-pool.md` | 新しいセクション: プールセマンティクス、フィンガープリントキー、トランスポートオプトイン、再起動セマンティクス、ステータススナップショットの解釈 | F2-3b |
| `packages/sdk/README.md` | ガードレールイベントの `scope?` フィールド、サーバーステータスの `entryCount`、ヘルパー `isWorkspaceScopedBudgetEvent` | F2-4 |
| Issue #4175 本文 | F2 エントリをサブ PR テーブルで更新し、デザイン v2（このドキュメント）にリンク | F2-1 オープン前 |
| Issue #3803 本文 | 決定 #3 行: 現在の "Currently per-session" → "Workspace-pooled under daemon (F2)" に更新 | F2-3 マージ後 |
| `acpAgent.ts:869-936` インラインコメント | "Wave 5 PR 23" 前方参照を削除し、"graduated by F2 to `scope: 'workspace'`" に更新 | F2-4 PR |
| CHANGELOG / リリースノート（Wave 6 / F5） | "MCP processes now shared across sessions in a workspace" をヘッドラインに | F5 リリース時 |

---

## 25. PR 説明テンプレート（単一 PR 提供）

```markdown
## feat(serve): shared MCP transport pool (workspace-scoped) [F2]

Single feature-cohesive PR per #4175 branching strategy (2026-05-19).
Replaces what was originally planned as Wave 5 PR 23 + sub-PRs F2-1..F2-4.

### Scope

~4100 LOC production + ~1900 LOC tests across 6 atomic commits.
Step through with `git log -p HEAD~6..HEAD` for commit-by-commit review.

### Design doc

See `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Pre-review specialist agents (per PR 21 pattern)

Folded into first commit before opening:

- code-reviewer: N findings, all adopted
- silent-failure-hunter: N findings, all adopted
- type-design-analyzer: N findings, all adopted

### Closes

(none — F2 entry in #4175 stays open until PR merges into main batch)

### Related

- #3803 decision #3 update (codeagents PR <link>)
- PR 14b (#4271 merged) — budget guardrail base; F2 graduates scope to workspace
- F1 (#4319 merged) — acp-bridge package; F2 depends on injection seams

### Backward compatibility

- Standalone `qwen` (non-daemon): pool not constructed; existing behavior preserved
- Daemon `qwen serve --no-mcp-pool`: kill switch falls back to per-session
- SDK: all new fields additive (`entryCount`, `scope?`); EVENT_SCHEMA_VERSION stays at 1
- Old SDK clients: unknown `scope: 'workspace'` ignored per PR 14 contract
- Old daemons: SDK consumers can detect absence of `mcp_workspace_pool` capability and fall back

### Test plan

- [ ] Pool key: env permutation stability, header divergence, per-session filter exclusion
- [ ] Lifecycle: 3-session sharing, drain grace, concurrent acquire dedupe, spawn failure slot release
- [ ] Tools + Prompts dual fan-out, per-session trust copy, snapshot replay on attach
- [ ] Generation guard: pre-reconnect handler doesn't overwrite post-reconnect snapshot
- [ ] Crash + reconnect with stdio backoff (5s × 3) and HTTP backoff (1/2/4/8/16s × 5)
- [ ] Descendant pid sweep: Linux/macOS pgrep recursion, Windows PowerShell CIM
- [ ] Budget at workspace scope: 4 sessions × budget=2 → 3 max (not 12); fan-out to all attached
- [ ] LoadSession resume within drain window: pool entry reused, no cold start
- [ ] Hot config reload: old/new entries coexist; old drains naturally
- [ ] Restart route: `?entryIndex=` selectivity; legacy single-entry response shape preserved
- [ ] In-flight tool call during reconnect: `MCPCallInterruptedError` rejection
- [ ] Standalone qwen: all existing mcp-client-manager tests pass unchanged
```

## サマリー

F2 v2.1 = 6 つのアトミックコミットを持つ単一の PR（約 6000 LOC）、ターゲットは `daemon_mode_b_main`。主要な設計の柱:

1. **`McpTransportPool`**（`packages/core`、ACP 子側）、ワークスペーススコープ、参照カウント + 30 秒ドレイン
2. **フィンガープリントキー**: env/ヘッダーを含む正規化設定の SHA-256（claude-code パターン）、セッションごとのフィルター（includeTools/trust）は除外
3. **`SessionMcpView`**: セッションごとのツール＋プロンプトレジストリプロジェクション、トラストコピー付き
4. **スナップショットリプレイ + 世代ガード**: アタッチレースと古い通知に対する対策
5. **クロスプラットフォームの子孫 pid スイープ**（opencode パターン + Windows 版）
6. **HTTP/SSE オプトイン**、SDK MCP バイパス、OAuth は F3 に延期
7. **予算ステートマシン**: ワークスペーススコープに昇格；スナップショットセル + プッシュイベントはアドオンで拡張（`scope?`）
8. **ステータス + 再起動ルートのリファクタリング**: プール優先、ブートストラップセッションにフォールバック；`entryCount` + `RestartResult[]`

**未解決の質問 Q1～Q10**（§22）は、それぞれのサブ PR をオープンする前にメンテナーによる決定が必要。Q1～Q4 は F2-3 開始前に解決することを推奨（これらが大まかな方向性を決める）；Q5～Q10 は段階的に解決可能。