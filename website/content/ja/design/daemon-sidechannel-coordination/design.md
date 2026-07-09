# Daemon side-channel coordination — Design (A1 / A2 / A4 / A5)

> ターゲット: `daemon_mode_b_main` (#4175 ブランチ戦略に基づく)。著者: 秦奇。日付: 2026-05-25。改訂: 2026-05-27 (v13 — zombie-gap ドキュメント、reconciliation_failed コントラクト、availableCommands 仕様、§7 アトミックカップリング、§8 有界コールカウント)。
> **ドキュメントのみ / 設計優先。** A4 は実装および承認済み (#4539)。A1 は実装済み (#4546)。
>
> ソース: クロスクライアントリアルタイム同期監査 (2026-05-24) + PR #4484 マージ後レビュー (**Aシリーズ** のフォローアップ)。同じレビューからのバグ修正/クリーンアップのフォローアップは別途出荷され (PR #4510)、**ここでは対象外** とする。

## 変更履歴

### v12 (2026-05-27) — 第9回レビューラウンド (ヘルパーシグネチャ + 構造的ガード)

- **`publishModelSwitched` ヘルパーが `originatorClientId` を受け付けるように (Critical)。** ブリッジラウンドトリップ (`bridge.ts:1172`, `:2883`) と `applyModelServiceId` の両方が、すべての `model_switched` イベントに `originatorClientId` を渡す。v11 の `publishModelSwitched(entry, modelId)` シグネチャはこれを省略しており、実装者に属性をサイレントにドロップするか、ヘルパーをバイパスするかのどちらかを強いていた。修正: シグネチャは `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })` になった。ブリッジラウンドトリップと `applyModelServiceId` は解決済みの `originatorClientId` を渡し、demux プロモーションと reconciliation 修正は何も渡さない。
- **非再帰ルールに構造的な強制力を追加。** v11 はコールグラフの規律 (契約的 — 「`.finally` フックを経由しない」) に依存していた。v12 では、非同期読み取りの前に `true` に設定され、後にクリアされるセッションごとの `reconciliationInFlight: boolean` フラグを追加する。ラウンドトリップ settle の `.finally` がフラグすでに `true` の場合に発生した場合、ログに記録してスキップする。これにより、将来のリファクタリングに関係なく、非再帰が不変条件となる。
- **オブザーバビリティログフォーマットに世代カウンターを拡張。** フォーマットは `[reconcile] session=<id> trigger=… baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=…` になった。`published` を `baseline` に改名 (失敗パスでは `model_switched` がパブリッシュされなかったため、「published」は誤解を招く)。非再帰の文章はオブザーバビリティ行から削除 (上記の専用段落でカバーされるため、保守ポイントは1つ)。
- **Fresh-read 不変条件の失敗モードを修正。** 「stale-but-equal」シナリオは自己矛盾していたため、正確な2つの失敗モードに置き換えた: (1) `entry.currentModelId` に一致する古いレスポンス → 誤った「converged」(実際の変化を見逃す)。(2) `entry.currentModelId` と異なる古いレスポンス → より新しい値を上書きする誤った「corrective」。
- **失敗パスのコンシューマーイベント順序を文書化。** 失敗パスでは、コンシューマーは `model_switch_failed` → `model_switched(A)` (タイムアウトしたモデルが実際に適用された) を目にする可能性がある。§2.2 ではこの順序に言及し、コンシューマーは先行する失敗イベントに関係なく `model_switched` を常に権威あるものとみなすことを推奨している。
- **§8 テスト計画を拡張:** (1) 非再帰ルール: reconciliation ごとに `getSessionContextStatus` が正確に1回だけ呼び出されることをアサーションし、corrective 後に2回目の `.finally` がスケジュールされないことを確認。(2) 失敗パスの converged ケース (エージェントがタイムアウトしたモデルを適用しなかった → `action=converged`)。(3) `gen_before`/`gen_after` 値の世代スキップ正索性アサーション。
- **§2.2 reconciliation の結果: 用語の統一** — `_converged_` の箇条書きは `entry.currentModelId` (バスの現在のモデル) を使用し、v11 のコントラクト言語と整合させた。

### v11 (2026-05-27) — 第8回レビューラウンド (reconciliation コントラクトの強化)

- **失敗パス reconciliation ベースラインの明確化 (Critical)。** 失敗パス (`model_switch_failed`) では、`model_switched` はパブリッシュされず、バスと `entry.currentModelId` は両方とも **ラウンドトリップ前** の値を保持する。Reconciliation は、権威ある読み取り値を `entry.currentModelId` (一般的に「パブリッシュされたモデル」ではない) と比較する。明示的な文言と、§8 の `_failure-path trigger_` サブシナリオ拡張を追加。
- **`publishModelSwitched` ヘルパー — 世代不変条件の強制メカニズム (Critical)。** 単一の `publishModelSwitched(entry, modelId)` ヘルパーが、(1) `entry.currentModelId` の更新、(2) `entry.modelPublishGeneration` のインクリメント、(3) バスへの `model_switched` のパブリッシュを (1つの同期ターンで) アトミックに実行する。**4つのパブリッシュサイトすべて** (ブリッジラウンドトリップ、`applyModelServiceId`、demux プロモーション、reconciliation corrective) がこれを経由する。他のコードパスが `model_switched` を直接パブリッシュしてはならない。テスト不変条件: 各コードパスの後、世代が正確に 1 だけ進んだことをアサーションする。
- **Fresh-read 不変条件を文書化 (Critical)。** reconciliation で使用される `getSessionContextStatus` の読み取りは、最新のポイントインタイム値を返さ**なければならない** — レスポンスキャッシュ、リクエストの重複排除、または進行中の統合をバイパスし**なければならない**。§2.2 コントラクトに追加。(実際には: `extMethod` は呼び出しごとに新しい JSON-RPC コールであり、今日ミドルウェアキャッシュは存在しないが、コントラクトは明示的になった。) 
- **Corrective は reconciliation を再トリガーしてはならない (Critical)。** reconciliation corrective はローカルの `publishModelSwitched` であり、後続の reconciliation をスケジュールし**ない**。実装は、corrective パスがラウンドトリップ settle の `.finally` フックを経由しないようにしなければならない。§2.2 のオブザーバビリティと明示的な非再帰ルールに追加。
- **世代アサーションの §8 テスト箇条書きを拡張:** すべての `model_switched` パブリッシュサイト (reconciliation corrective を含む) が `entry.currentModelId` を更新し、**かつ** `entry.modelPublishGeneration` をインクリメントする。各操作後に世代が正確に 1 だけ進んだことをアサーションする。

### v10 (2026-05-27) — 第7回レビューラウンド (reconciliation TOCTOU + リトライ + テスト)

- **Reconciliation TOCTOU (Critical) → パブリッシュ世代ガード。** v9 の権威ある読み取りでさえウィンドウが存在する。settle 後、非同期読み取り中にセッション内の並行 `/model C` が `model_switched(C)` をプロモートする可能性がある。読み取り (先に発行された) は C 以前の値 B を返し、reconciliation は `model_switched(B)` を発行して C を上書きしてしまう。**修正:** セッションごとの `modelPublishGeneration` を追加し、`model_switched` がパブリッシュされるたびに (ブリッジ / demux プロモーション / reconciliation corrective) インクリメントする。Reconciliation は非同期読み取り**前**に世代をキャプチャし、読み取り中に世代が進んだ場合は **corrective をスキップする** (より新しい権威あるパブリッシュがすでに到着しているため)。Reconciliation は成功パスと失敗パスの**両方** (ラウンドトリップの `.finally`) で発生する。タイムアウト/失敗ケースこそが最も必要とされる場面だからである。
- **読み取りエラーはサイレントに終端しない → 有界リトライ + イベント。** 一時的な `getSessionContextStatus` の失敗は、バスが永久に分散したままになる可能性がある。1〜2回の有界リトライ (短いバックオフ) を追加。すべて失敗した場合は、クライアントが警告/プルできるように `reconciliation_failed` バスイベントを発行し、`action=read-error` をログに記録する。
- **§2.3 パブリッシュサイトの列挙に reconciliation corrective を追加** (修正後、キャッシュがバスから分散しないように、`entry.currentModelId` を更新し + 世代をインクリメントする必要がある)。
- **§8 古いデータ (staleness) テストを修正** — v9 と矛盾していた (キャッシュ=B のときに A の値ベースのドロップを期待していたが、v9 の重複排除は _等しい値_ の重複のみをドロップする)。以下に置き換え: (1) 冗長重複のドロップ (キャッシュがすでに A のときの `current_model_update(A)`)、(2) reconciliation によって処理されるタイムアウトレース (A≠B はプロモートされ、reconciliation が収束させる)。さらに、より新しいプロモーション時に reconciliation がスキップされるテストを追加。
- **§10 Q3 を昇格:** セッション内の `/model` を `modelChangeQueue` を通してルーティングする (ソースで直列化) ことが、レースフリーな長期的な設計である。suppress/dedup/reconcile スタックは、それまでの暫定的なものである。

### v9 (2026-05-27) — reconciliation/staleness メカニズムの修正 (A1 強化の計画時に発見)

- **v8 の「reconciliation は §2.3 キャッシュを読み取る」は不十分だった。** キャッシュは **パブリッシュ** サイトでのみ更新されるが、demux が **ドロップ** する (suppress ウィンドウ内の) 並行セッション内の変更はパブリッシュされないため、キャッシュはそれを観測できない。Reconciliation がキャッシュを読み取ると、ブリッジがパブリッシュしたばかりの値を見て、「分散なし」と判断し、修正に失敗する → 防止するために存在するはずの永久分散バグそのもの。
- **修正 (§2.2): reconciliation は権威ある post-settle 読み取りを行う。** ブリッジモデルのラウンドトリップが settle した後、ブリッジは `getSessionContextStatus` (`bridge.ts:2784`、非同期 `extMethod`) を介してエージェントの **真の** 現在のモデルを読み取り、パブリッシュしたものと異なる場合は corrective な `model_switched` を発行する。これはエージェントを信頼できる情報源とするバックストップである。非同期だが、**post-settle で実行される (demux 内ではない)** ため、§5 の同期ブロックコントラクトは適用されない — その制約はスナップショット/古いデータ読み取りパス専用である。
- **Staleness チェック (§2 項目4) をベストエフォート + 権威あるバックストップとしての reconciliation に再定義。** 値の比較だけでは、古い遅延通知と同じ ID への新しいスイッチを区別できない (分散順序付けの問題)。したがって、demux は曖昧さのないケース (`currentModelId` がすでに `entry.currentModelId` と等しい `current_model_update` — 冗長な重複) のみをドロップし、タイムアウトレース (タイムアウトした以前の変更は常に settle したブリッジラウンドトリップに対応する) は §2.2 reconciliation によって権威的にキャッチされる。エージェント側のシーケンスカウンターは不要。
- **§2.3 キャッシュの役割を絞り込み:** **A5 のスナップショット** とベストエフォートの demux 重複排除の同期ソース — reconciliation の信頼できる情報源ではない (それは権威ある読み取り)。reconciliation 後、最後にパブリッシュされた値がエージェントの真実となるため、キャッシュは A5 に対して正しく動作し続ける。

### v8 (2026-05-26) — 第6回レビューラウンド (A5 に対する 1×Critical + 提案)

- **ブリッジ状態キャッシュ (§2.3、新規) — 統合メカニズム。** Staleness チェック (§2 項目4)、§2.2 reconciliation、および A5 の同期スナップショットコントラクトはすべて「エージェントの現在のモデル/モード」を必要としていたが、ブリッジには同期アクセサがなかった (非同期 `extMethod` 状態読み取りのみで、レースが再発する)。`SessionEntry` に `currentModelId` / `currentApprovalMode` / `availableCommands` を追加し、**すべてのパブリッシュサイトで同期的に更新** (`bridge.ts:2883`/`:1172` の model_switched、`:2979` の approval_mode_changed、demux プロモーション) し、`createSession`/`loadSession` ACP レスポンスからシードする。3つのメカニズムすべてがこれらの同期フィールドを読み取るようになり、§5 の単一同期ブロックコントラクトを構築によって満たす。
- **これにより A2 `previousModeId` ACP スキーマの問題も解消される:** ACP の `CurrentModeUpdate` には `currentModeId` しかない (`previousModeId` フィールドがない — v7 で A1 に対してヒットしたのと同じ外部ユニオン制約)。ブリッジはエージェントに `previous` を送信する必要がなくなった: キャッシュされた `entry.currentApprovalMode` (この変更**前**の値) から派生させる。A1 も同様。したがって、どちらの通知も `previous*` フィールドを持たない。
- **§1.1 項目2 の古い記述を解消** — 2a (A1 `extNotification`) / 2b (A2 `sessionUpdate`) に分割。v7 は §2/§2.1/§6/§7 を修正していたが、§1.1 を見落としていた。
- **§2.1: `scope` をプロモートされた `approval_mode_changed` ペイロードに統合** (`{sessionId, previous, next, persisted, scope}`)。`persisted` との関係を明確化。
- **§2.2 reconciliation オブザーバビリティ** — `[reconcile] session=… published=… actual=… action=corrected|converged|read-error` + 明示的な読み取りエラー処理。
- **extNotification メソッド名を固定** — `qwen/notify/session/model-update` (#4546 と一致) + 早期リターンガードをディスパッチに変更する必要があることに言及。
- **Dual-emit 削除の強制** — サイトに `TODO(dual-emit-removal)` + §7 に追跡イシューを追加。
- §0 («2つの demux 挿入ポイント»)、§3.4→§3-項目4 の相互参照を修正し、§8 を staleness-drop / reconciliation-corrective / cross-axis-non-suppression / dual-emit / extNotification-transport シナリオで拡張。

### v7 (2026-05-26) — 実装開始時の実現可能性修正 (A1 トランスポート)

- **A1 は `current_model_update` sessionUpdate を使用できない — その型は ACP に存在しない。** 実装開始時に確認: `SessionUpdate` は外部 `@agentclientprotocol/sdk` 型であり、`acp.d.ts` は `current_mode_update` (2件一致) を定義しているが、**`current_model_update` (0件一致) は定義していない**。外部仕様のユニオンにバリアントを追加することはできない。v1〜v6 の「`current_model_update` sessionUpdate を追加する」(および extNotification を対称性のために _拒否した_ §2 の「代替案」) は誤りだった。
- **A1 トランスポートの修正: エージェントはセッション内モデル変更を `BridgeClient.extNotification()` を介して発行する** (`bridgeClient.ts:491`、今日 MCP ガードレイルに使用されている既存のエージェント→ブリッジ サイドチャネル) — sessionUpdate ではない。したがって、A1 demux は **`extNotification()`** に存在し、A2 の `current_mode_update` (実際の ACP sessionUpdate) は **`sessionUpdate()`** で demux される。A1 と A2 は異なるトランスポート + 挿入ポイントを使用する — 新しい非対称性であり、現在は文書化されている。
- 残りの設計への正味の影響: demux ルール (ペイロードマッピング、タイプごとの suppress、staleness チェック、suppress 時のドロップ、オブザーバビリティ) は本質的に変更なし。A1 の挿入ポイントが `sessionUpdate()` から `extNotification()` に移動するのみで、A1 に ACP 仕様の変更は不要。
- **これが design-first が重要な理由である:** ブロッカーは A1 実装の最初の行で表面化した。ドキュメントでトランスポートをひっくり返すのは安価だが、外部 `SessionUpdate` ユニオンへのキャストは潜在的な型偽装 (type-lie) となっただろう。
### v6 (2026-05-26) — 第5回レビューラウンド (wenshao 2×Critical + 4×Suggestion)

- **タイムアウト競合 + 途中変更 (Critical):** 変更Bが介入する場合、「後のイベントが優先される」というルールは誤りでした。古い遅延 \`current_model_update(A)\` が \`model_switched(B)\` の後に昇格してしまうためです。**鮮度チェック (staleness check)** に置き換えました。demux は \`current_model_update\` を、昇格時の \`currentModelId\` がエージェントの実際の現在のモデルと一致する場合にのみ昇格させ、古い通知は破棄します。§2 item 4 / §2.1。
- **\`previousModeId\` の必須化 (Critical):** SDK ノーマライザー \`normalizeApprovalModeChanged\` (\`normalizer.ts:754\`) は \`previous\` を要求し、ない場合は \`fallbackDebug\` でイベントを破棄します。オプションの \`previousModeId\` だと、セッション内の承認モード変更が暗黙のうちに破棄されてしまいます。§3。
- **Suppress はセッションごとではなく変更タイプごとに変更:** モデルのラウンドトリップは、セッション内の \`current_mode_update\` を suppress してはなりません（その逆も同様です）。§2.1。
- **\`current_model_update\` ペイロード:** 未定義の \`authType?\` を削除（不要なデータ — \`model_switched\` は \`{sessionId,modelId}\` です）。\`previousModelId\` はオプションのままです（\`model_switched\` ノーマライザーには \`modelId\` だけが必要です）。§2。
- \`current_model_update\` (A1) を意図していた箇所で \`current_mode_update\` (A2) と書かれていた、2つのテキスト・相互参照エラーを修正しました。§2 wire/compat, §6。

### v5 (2026-05-26) — 第4回レビューラウンド (wenshao 2×Critical + 8×Suggestion)

- **セッション内 \`/model\` の同時実行によるドリフト (Critical) → 整合性ルール。** suppress 時のドロップにより、bridge の \`setSessionModel(A)\` ラウンドトリップ中に発生したセッション内 \`/model B\` がドロップされる可能性があります（セッション内 \`/model\` は \`modelChangeQueue\` をバイパスするため）。その結果、セッションは B で動作しているにもかかわらず、bus は A のままになります。§2.2 を追加: ラウンドトリップ完了時に bridge が整合性をとります。エージェントの現在のモデルを再読込し、公開したものから逸脱している場合は修正用の \`model_switched\` を発行します。
- **IDE-companion のロックステップ (Critical) → 1リリースでの dual-emit 移行。** 昇格をアトミックに切り替えることはできないため（daemon と Marketplace の出荷チャネルが異なる）、アップストリームのディスパッチ (\`daemonIdeConnection.ts\`, \`DaemonChannelBridge.ts\`) はハンドラに到達する前に未知のイベントタイプをドロップします。**dual-emit 移行ウィンドウ**（1リリースの間、汎用の \`session_update\` と昇格された名前付きイベントの両方を公開）を追加し、影響を受けるアップストリームディスパッチサイトを列挙しました（§2.1, §6）。
- **\`model_switched\` ペイロードマッピングの指定** — \`currentModelId → modelId\`、エンベロープ \`sessionId → data.sessionId\`。これがなければ、SDK バリデーター（\`events.ts:1910\`、空でない \`modelId\` を要求）が昇格されたすべてのイベントをドロップします（A1 が機能不全に）。§2.1。
- **Demux の可観測性必須** — すべての判断ポイント（昇格 / ドロップ / suppress / 汎用）で構造化ログを出力。§2.1。
- **\`replay_complete\` の修正** — これは実際に存在します（\`eventBus.ts:444\`、マージされた #4484 で出荷済み）。レビュアーの「0件ヒット」は古いツリーに対するものでした。A5 フェーズ2は \`replay_complete\` の導入ではなく、新しい \`session_snapshot\` フレームに依存します。§5/§7。
- **初回アタッチ時に \`replay_complete{0}\` を合成しない**（既存の「replaying→live」コンシューマーに対してそのイベントの契約を拡大してしまうため）。初回アタッチ時のスナップショットは自己区切り（self-delimiting）です。§5。
- **発行時キャプチャの厳格化** — スナップショットフィールドの読み取り + 公開は、1つの同期ブロックでなければなりません（間に \`await\` を入れない）。そうでなければ、古いデータによる上書きウィンドウが再び開いてしまいます。§5。
- **ヘルパー移行モデル + Q3 解決**（\`extMethod\` バイパスを維持 — §1.1 は有効）。\`A4\` 識別テストを追加（#4539 で完了）。§3, §8, §9。

### v4 (2026-05-26) — 第3回レビューラウンド (wenshao 2×Critical + 9×Suggestion, Copilot 5×)

- **Demux 挿入ポイントの修正** — 汎用の \`sessionUpdate → session_update\` フォワーディングは \`packages/acp-bridge/src/bridgeClient.ts:397\` (\`BridgeClient.sessionUpdate()\`) にあり、\`bridge.ts:352\`（これはプロンプトエコー）ではありません。§2.1 の demux フックは \`bridgeClient.ts\` に存在します。**第3の demux ルール**を追加: 実行中のラウンドトリップによってブロックされた昇格は、汎用の \`session_update\` として公開されるのではなく**ドロップ**されます（そうしないと、bridge の信頼できるイベント + 汎用ラッパーで二重にシグナルされてしまいます）。
- **\`approvalModeQueue\` はまだ存在しない** — PR #4510 で出荷されます。A2 の suppress ウィンドウはセッションごとの実行中トラッカーに依存するため、A2 はソフトな「調整」ではなく、#4510 に対する**ハードな前提条件**としてマークされるようになりました（§3, §7）。
- **A2 HTTP パスはエージェント通知を発行しない**（\`extMethod\` 経由で \`Session.setMode\` をバイパスするため）→ そのパスでは bridge が唯一の発行者となります。「ラウンドトリップ中の suppress」は**モデルパス**にのみ適用されます。§1.1 / §9 を修正。
- **ステップ2の demux は \`current_model_update\` のみをカバー。** \`current_mode_update\` の昇格はステップ3に延期されます（\`previousModeId\` が必要）。それまでは汎用の \`session_update\` として流れ続けます（後退なし）。
- **A5 スナップショットの古いデータによる上書きを修正** — サブスクライブ時ではなく**発行時**（\`replay_complete\` の後）にスナップショットをキャプチャします。これにより、リプレイ中に配信されたライブデルタが古いスナップショットで上書きされなくなります。初回アタッチの順序を定義。
- **どこでも「追加のみ」ではない** — \`current_mode_update\` の昇格はロックステップの変更です。\`packages/vscode-ide-companion/.../qwenSessionUpdateHandler.ts:177\` は影響を受けるコンシューマーとして明示されています。
- **\`previousModeId\` のキャプチャポイントを指定**。ヘルパーの一般化を詳細化。persist スコープの説明を修正（\`getPersistScopeForModelSelection\` → workspace または user）。セキュリティの列挙を完了（\`resolveTrustedClientId\`）。テストプラン + アンカーを修正。

### v3 (2026-05-26) — 第2ラウンド

bridge 信頼モデル（§1.1、単一発行者ではない）に再構成。A1 の3つの公開サイト + \`model_switch_failed\` の例外 + タイムアウト競合。A1 の workspace-mirror に関する明示的な決定。\`previousModeId\`。A4 は両方の SDK フィールドを公開。A5 は \`replay_complete\` 後のスナップショット。テストを拡充。

### v2 (2026-05-26) — 第1ラウンド

A1/A2 の非対称性。§2.1 demux 契約。§9 テーブル。A5 \`pendingPermissionIds\` 削除。アンカーの整理。\`voterClientId\` をオプション化。

---

## 0. スコープと非ゴール

あるパスでのセッション状態の変更が、他の接続済みクライアント（またはピアセッション）から見えなくなってしまう、4つのサイドチャネル状態調整のギャップ:

| #      | 概要                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | セッション内のモデル切り替え（\`/model\`、プランモード）が bus に到達しない。                                                                                        |
| **A2** | セッション内の承認モード変更（\`setMode\`）がイベントを発行しない。HTTP パスは異なるエージェントエントリーポイントを使用する。workspace と persist の可視性が不明確。      |
| **A4** | \`permission_resolved.originatorClientId\` は _voter_ を運び、\`permission_request.originatorClientId\` は _prompt originator_ を運ぶため曖昧。    |
| **A5** | \`Last-Event-ID\` 経由で接続するクライアントは、リングリプレイ + ライブテールを取得するが、現在のモデル / 承認モード / コマンドのスナップショットは取得しない。追加の pull を発行する必要がある。 |

非ゴール: マルチモーダルユーザーコンテンツのエコー（PR #4353 §D）、A3 競合修正（PR #4510）、clientId の改ざん防止（A6）、streamable-HTTP トランスポート（#4472）。

**アンカーの規約:** リポジトリルートからのフルパス。

- **\`packages/acp-bridge/src/bridgeClient.ts\`** — ACP→bus クライアント。\`sessionUpdate()\` と \`extNotification()\` はエージェント通知を EventBus に転送します（**2つ**の demux 挿入ポイント — A2 は \`sessionUpdate()\`、A1 は \`extNotification()\`。§2.1 を参照）。
- **\`packages/acp-bridge/src/bridge.ts\`** — 3923行のオーケストレーター（HTTP 制御メソッド、公開サイト）。\`packages/cli/src/serve/httpAcpBridge.ts\` は 101行の再エクスポートシムであり、アンカーターゲットではありません。
- **\`packages/acp-bridge/src/permissionMediator.ts\`** — 許可の投票/解決。
- **\`packages/cli/src/acp-integration/acpAgent.ts\`** / **\`.../session/Session.ts\`** — エージェント + セッション。

---

## 1. 背景 — サイドチャネル調整の不変条件

デーモンはトランスクリプトのデルタと、HTTPルート経由で開始された制御変更（\`model_switched\`、\`approval_mode_changed\`）をブロードキャストします。ギャップ: 同じ論理変更には2つのエントリーパスがあり、スラッシュ/プランモードの変更に対してブロードキャストを行うのは HTTP パスのみです。

\`current_mode_update\` は現在存在しますが（\`Session.ts:1645\`。ヘルパー \`sendCurrentModeUpdateNotification\` は \`Session.ts:1625\`）、ツール確認パス（\`exit_plan_mode\` (\`Session.ts:2160\`) と編集ツールの \`ProceedAlways\` (\`Session.ts:2168\`)）にのみ接続されており、汎用の \`Session.setMode\`/\`setModel\` には接続されていません。\`current_model_update\` タイプは存在しません。現在、両方とも \`BridgeClient.sessionUpdate()\` (\`bridgeClient.ts:397\`) 経由で、サブタイプの demux を持たない汎用の \`session_update\` として bus に流れます。

### 1.1 調整モデル（重要な決定）

v1 の「エージェントが単一の発行者であり、bridge は公開をドロップする」は**却下**されました。bridge はシリアライゼーション（\`modelChangeQueue\`）、タイムアウト処理、\`model_switch_failed\`、および persist/workspace の区別を所有しているためです。採用されたモデル:

1. **bridge は、自身が駆動する変更に対する信頼できる発行者であり続ける**（HTTP \`setSessionModel\`/\`setSessionApprovalMode\`、アタッチ時の \`applyModelServiceId\`）— シリアライゼーション/タイムアウト/失敗/persist のロジックは変更なし。
2. **bridge をバイパスするセッション内の変更**は、bridge が demux する新しいエージェント通知を獲得します（§2.1）。**異なるトランスポート**（v7）を経由します:
   - **2a. A1 (モデル):** \`Session.setModel\` は、エージェント→bridge の **\`extNotification\`** サイドチャネル経由で \`current_model_update\` を発行します（\`sessionUpdate\` ではありません — その ACP union にはモデルバリアントがないため）。\`BridgeClient.extNotification()\` がこれを demux し → \`model_switched\` となります。
   - **2b. A2 (承認モード):** \`Session.setMode\` は、実際の ACP **\`sessionUpdate\`** として \`current_mode_update\` を発行します。\`BridgeClient.sessionUpdate()\` がこれを demux し → \`approval_mode_changed\` となります。
3. **ラウンドトリップ中の suppress — モデルパスのみ。** HTTP **モデル**パスは \`Session.setModel\` (\`acpAgent.ts:935\`) を経由するため、エージェント通知は bridge の公開に加えてそこで**必ず**発行されます。demux は、bridge のモデルラウンドトリップが実行中の間、昇格を suppress します。HTTP **承認モード**パスは \`Session.setMode\` を経由**しません**（\`extMethod\` を使用、\`acpAgent.ts:2228\`）。そのため、そこでエージェント通知は一切発行されず、bridge が唯一の発行者となり、suppress する対象もありません。suppress が意味を持つのはモデルパスのみです。

---

## 2. A1 — bus 上のセッション内モデル切り替え

### 問題

\`Session.setModel\` (\`Session.ts:1580\`) → \`config.switchModel()\` (\`:1601\`)。\`sessionUpdate\` はありません。\`model_switched\` は bridge 側の3つのサイトから公開されます。\`bridge.ts:2883\` (\`setSessionModel\`)、\`bridge.ts:1172\` (\`applyModelServiceId\`)、そしてセッション内用のものは**なし** — これがギャップです。

### 提案された設計

1. **トランスポート: \`sessionUpdate\` ではなく \`extNotification\` (v7)。** \`current_model_update\` は ACP \`SessionUpdate\` バリアント**ではありません**。したがって、\`Session.setModel\` は \`switchModel\` が解決した後（**成功時のみ**）、エージェント→bridge の **\`extNotification\`** サイドチャネル経由で、**完全修飾メソッド名 \`qwen/notify/session/model-update\`**（既存の \`qwen/notify/session/*\` 規約に準拠。実装は #4546）とペイロード \`{ v:1, sessionId, currentModelId }\` を発行します。\`previousModelId\` / \`authType\` はありません（bridge は状態キャッシュから \`previous\` を導出します §2.3。\`model_switched\` は \`{sessionId,modelId}\` です）。**実装メモ:** \`BridgeClient.extNotification()\` の現在の早期リターンガード（\`if (method !== 'qwen/notify/session/mcp-budget-event') return;\`）は、モデルアップデートハンドラに到達できるようにメソッドディスパッチに変更する必要があります（#4546 で対応済み）。
2. **\`BridgeClient.extNotification()\` (\`bridgeClient.ts:491\`) が \`current_model_update\` 通知を demux** し → \`model_switched\` となります（§2.1）。**そのセッションに対して bridge のモデルラウンドトリップが実行中でない場合にのみ**。（A2 の \`current_mode_update\` は実際の sessionUpdate のまま、\`sessionUpdate()\` で demux されます — §2.1 を参照。）
3. **\`model_switch_failed\` は bridge のみに留まる** — \`Session.setModel\` は通知なしでスローします。bridge は両方の失敗パスでこれを公開し続けます。
4. **タイムアウト競合（ベストエフォートの demux ドロップ + 信頼できる整合性バックストップ — v9）。** bridge の \`withTimeout\` (\`bridge.ts:2844-2849\`) はリジェクトすることがあり（\`model_switch_failed(A)\` を公開）、A の ACP コールは実行を続けます（FIXME \`bridge.ts:2836-2840\`）。その後、変更 B が成功し（\`model_switched(B)\`）、A のコールがようやく完了した場合、A の遅延した \`current_model_update(A)\` が A を最終状態に見せてはなりません。**値の比較だけではこれを判断できません**（遅延した古い \`A\` と \`A\` への新しい切り替えは同じに見えるため。分散順序付けの問題です）。したがって: demux は**ベストエフォートの重複排除**を行い（\`currentModelId\` がすでに \`entry.currentModelId\` と等しい \`current_model_update\` をドロップ。冗長なノーオペレーション）、**信頼できる正しさは §2.2 の整合性から得られます**。タイムアウトした以前の変更は常に_解決済みの bridge ラウンドトリップ_に対応し、これはエージェントの真のモデルを再公開する、解決後の信頼できる読み取りをトリガーします。エージェント側のシーケンスカウンターは不要です。
**残存ギャップ — ゾンビラウンドトリップ (v13)。** 再コンシリエーションは_最初の_解決（タイムアウト）をカバーしますが、再コンシリエーションがすでに `action=converged` を発行した**後**に完了するゾンビ ACP コールはカバーされません。エージェントがタイムアウトしたモデルを遅れて適用し → `current_model_update(A)` を発行し → demux がそれを昇格させ（実行中のラウンドトリップはなく、重複でもない） → バスがサイレントに A に戻り、ユーザーによる B への正常な切り替えと矛盾します。長期的な修正は ACP キャンセルシグナルです（`bridge.ts:2836-2840` にある既存の FIXME）。それまでは、タイムアウトが発生し、再コンシリエーションが収束し（エージェントがまだ適用していない）、ユーザーが正常に B に切り替え、**その後**ゾンビが完了するという狭い条件において、これは**既知の残存レース**となります。可能性は低いですが（エージェントがタイムアウト + 再コンシリエーション読み取り + その後の正常な切り替えよりも長い時間がかかる必要があるため）、ゼロではありません。再コンシリエーションがタイムアウトレースを完全に排除すると主張するのではなく、ここに文書化します。

### 2.1 Demux コントラクト（2つの挿入ポイント）

demux には A1 と A2 で異なるトランスポートを使用するため（v7）、**2つの挿入ポイント**があります。

- **A1 — `BridgeClient.extNotification()` (`bridgeClient.ts:491`):** `current_model_update` 通知 → `model_switched`。
- **A2 — `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`):** `current_mode_update` sessionUpdate → `approval_mode_changed`。このメソッドは現在、すべての通知を `{ type: 'session_update', data: params }` としてそのまま発行します。demux はここに追加されます。

以下のルールは、サブタイプが到着した挿入ポイントに適用されます。

- **昇格テーブル:** `current_model_update → model_switched`、`current_mode_update → approval_mode_changed`（セッションスコープ、ステップ3に延期、§7を参照）。
- **ペイロードマッピング（両方のサブタイプを指定する必要があり、そうでない場合は SDK 検証によってドロップされます）:**
  - `current_model_update → model_switched`: `currentModelId → data.modelId` をマッピングし、エンベロープ/`params.sessionId` を `data.sessionId` にリフトします。SDK バリデーターは空でない `data.modelId` を要求します（`events.ts:1910`）。そのまま昇格させる（`currentModelId` を保持する）と検証に失敗してサイレントにドロップされるため、**A1 は機能しません**。したがって、昇格はフィールドマッピングであり、リレーベルではありません。
  - `current_mode_update → approval_mode_changed`: 完全なペイロード `{ sessionId, previous, next, persisted: false, scope: 'session' }` を構築します。`next` = 通知の `currentModeId`。**`previous` はブリッジ状態キャッシュ** `entry.currentApprovalMode`（この変更前の値 — §2.3）から取得されるため、エージェントは `previousModeId` を送信**しません**（ACP `CurrentModeUpdate` にはそもそもそのようなフィールドがありません）。セッション内の変更はワークスペースに永続化されないため、`persisted:false`、`scope:'session'` となります。`scope` は `DaemonApprovalModeChangedData` に対して**追加的**であり、`persisted` とは直交します。`scope` はイベントがどのバス（このセッションかピアセッションか）をターゲットにするかを示し、`persisted` はワークスペース設定も書き込んだかどうかを示します。ブリッジ独自の `persist:true` HTTP パスは、`scope:'workspace', persisted:true` のミラーを出力します（`bridge.ts:3007`）。
- **ラウンドトリップ中の抑制（セッションごとではなく変更タイプごと）:** そのセッションに対してブリッジ駆動の**モデル**ラウンドトリップが実行中でない場合にのみ `current_model_update` を昇格させます。ブリッジ駆動の**承認モード**ラウンドトリップが実行中でない場合にのみ `current_mode_update` を昇格させます。モデルラウンドトリップがセッション内の `current_mode_update` を抑制してはなりません（その逆も同様です）。クロス属性の抑制は、もう一方の軸の変更をサイレントにドロップしてしまいます。
- **ベストエフォート重複排除（モデル）:** demux は、`currentModelId` がすでに `entry.currentModelId`（§2.3）と等しい `current_model_update` をドロップします（冗長な no-op）。値だけで古いものと新しいものを区別しようとは**しません**（値だけでは不可能です）。タイムアウト/同時実行レースに対する権威あるバックストップは、§2.2 の再コンシリエーションです（§2 の項目4）。
- **抑制時のドロップ（第3のルール）:** _昇格可能な_サブタイプが昇格されない（抑制された、または古い）場合、**完全にドロップ**します。汎用の `session_update` の発行にフォールバックし**ないでください**。ブリッジはすでに権威ある名前付きイベントを発行しており、汎用ラッパーも発行すると二重シグナルになってしまいます。（セッション内の残存する同時実行ドリフトは、§2.2 の再コンシリエーションによって処理されます。）
- **汎用ラッパーの抑制:** 昇格されたサブタイプは、名前付きイベントのみを発行します。**ただし、以下の二重発行移行ウィンドウ中は除きます**。
- **二重発行移行（IDE コンパニオンのロックステップ、§6を参照）:** デーモンと VS Code IDE コンパニオンは異なるチャネルでリリースされ、アトミックに切り替えることができないため、`current_mode_update` 昇格の最初のリリースでは、1つのリリースサイクルにわたって、昇格された `approval_mode_changed` **と**、レガシーな汎用 `session_update{sessionUpdate:'current_mode_update'}` の**両方**を発行します。IDE コンパニオンの既存の `case 'current_mode_update'` は引き続き機能します。その `approval_mode_changed` ハンドラーがリリースされ次第、次のリリースで二重発行を削除します。`current_model_update` は完全に新しいもの（レガシーコンシューマーなし）であるため、二重発行なしで直接昇格されます。**削除は強制され、記憶に委ねられません。** 二重発行サイトにある `TODO(dual-emit-removal)` コメントはこのセクションを参照しており、§7 ステップ3にはターゲットリリースを含む追跡 issue があります。そのため、冗長な汎用ラッパーがサイレントに恒久化されることはなく（また、新しいコンシューマーがそれをベースに構築すべきではありません）。
- **観測性（必須、任意ではない）:** demux のすべての決定で構造化ログを出力します — `[demux] session=<id> type=<sub> action=promoted|dropped|suppressed|generic reason=<why>`。現在の `BridgeClient.sessionUpdate()` にはログが全くありません。特に `dropped` ケースは可視化する必要があり、オンコールが「エージェントが出力しなかった」/「demux がドロップした」/「SSE が失われた」を区別できるようにします。
- **不明なサブタイプ:** 変更なし（汎用 `session_update`）。

### 2.2 ラウンドトリップ後の再コンシリエーション（セッション内の同時実行ドリフト）

抑制 + ドロップは、ブリッジラウンドトリップとエージェントが**同じ**変更を記述していることを前提としています。これは、セッション内の同時実行変更下で破綻します。なぜなら、セッション内の `/model` は `Session.setModel` を**直接呼び出し、`modelChangeQueue` に入らない**からです。

1. ブリッジの `setSessionModel(A)` が開始 → 抑制ウィンドウが開く。
2. ユーザーがターミナルで `/model B` を入力 → `Session.setModel(B)`（キューをバイパス） → エージェントが `current_model_update(B)` を発行。
3. demux が B を**ドロップ**（抑制ウィンドウが開いている）。
4. ブリッジが権威ある `model_switched(A)` を発行。**バスは A を示し、セッションは B を実行 — 何も再コンシリエーションされない。**

**コントラクト（v9/v10/v11 — 権威ある読み取り、世代ガード、非再帰）:** 再コンシリエーションは、ブリッジモデルラウンドトリップが解決したときに発生します。成功パスと失敗パスの**両方**です（ラウンドトリップに対する `.finally`。タイムアウト/失敗ケースはまさにバスが分岐する可能性が最も高いタイミングであるため）。`getSessionContextStatus`（`bridge.ts:2784`、非同期 `extMethod`）を介してエージェントの**真の**現在のモデルを読み取り、バスの現在のモデル（`entry.currentModelId` — 失敗パスでは、`model_switch_failed` がキャッシュを更新しないため、これは**ラウンドトリップ前**の値です）と分岐している場合、`publishModelSwitched` を介して修正用の `model_switched` を発行します。**なぜ §2.3 のキャッシュを_真実_として使わないのか:** キャッシュは発行サイトでのみ更新されるため、demux が**ドロップ**したセッション内の同時実行変更を観測できません。それを読み取ると「分岐なし」と誤って結論づけてしまいます。エージェントが唯一の真実の情報源です。読み取りは非同期ですが、**解決後、demux の外側**で実行されるため、§5 の同期ブロック制約は適用されません。（長期的には、セッション内の `/model` を `modelChangeQueue` を通す — §10 Q3 — ことで、ソースでこのレースをなくします。）`approvalModeQueue` が存在するようになれば、A2 にも同じ再コンシリエーションが適用されます。

**フレッシュリード不変条件（v11/v12）:** 再コンシリエーションで使用される `getSessionContextStatus` の読み取りは、エージェントプロセスから新鮮な時点の値を返さ**なければなりません**。応答キャッシュ、リクエストの重複排除、または実行中の統合をバイパスし**なければなりません**。これがなければ、偶然 `entry.currentModelId` に一致するキャッシュされた応答は誤った「収束」を生み出し（実際の分岐を見逃す — エージェントは先に進んでいる可能性がある）、`entry.currentModelId` から分岐するキャッシュされた応答は、エージェントの真の現在のモデルではなく古い値をバスに設定する誤った「修正」を生み出します。実際には、`extMethod` は呼び出しごとに新しい JSON-RPC `requestSessionStatus` コールです。現在、ミドルウェアやトランスポートレベルのキャッシュは存在しません。この不変条件は契約上のものです。将来のキャッシュレイヤーは、再コンシリエーションの読み取りを免除し**なければなりません**。

**世代ガード（v10 — 読み取りウィンドウの TOCTOU を閉じる）:** 解決と非同期読み取りの戻りの間に、同時実行のセッション内 `/model C` が `model_switched(C)` を昇格させる可能性があります。実行中の読み取り（C より前に発行された）は C 以前の値を返し、再コンシリエーションは C を上書きしてしまいます。修正: セッションごとの `modelPublishGeneration` は、**すべての** `model_switched` 発行（ブリッジ / demux 昇格 / 再コンシリエーション修正）でバンプされます。これは `publishModelSwitched` ヘルパー（v11）を介して排他的に行われます。再コンシリエーションは読み取り**前**に世代をキャプチャし、読み取り中に**進行した場合は修正をスキップ**します。新しい権威ある発行がすでに到着しているため、バスは最新の状態です。

**`publishModelSwitched` ヘルパー（v11/v12 — 強制メカニズム）:** アトミックに（1つの同期ターンで）以下を行う単一の関数 `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })`: (1) `entry.currentModelId = modelId` を設定、(2) `entry.modelPublishGeneration` をインクリメント、(3) バスに `model_switched` を発行（提供されている場合は `originatorClientId` を含む）。**すべての** `model_switched` 発行サイト（ブリッジラウンドトリップ成功、`applyModelServiceId`、demux 昇格、再コンシリエーション修正）は、このヘルパーを経由し**なければなりません**。ブリッジラウンドトリップと `applyModelServiceId` は解決された `originatorClientId` を渡します。demux 昇格と再コンシリエーション修正は何も渡しません（単一のクライアントが変更を駆動したわけではないため）。ヘルパーの外部での直接の `events.publish({type:'model_switched', ...})` は禁止されています。これにより、世代のバンプを見逃したり、クライアントの属性をサイレントにドロップしたりすることが不可能になり、テストの不変条件で次のことをアサートできます。`model_switched` を生成する任意のコードパスの後、世代は正確に 1 だけ進行します。

**非再帰ルール（v11/v12 — 構造的に強制）:** 再コンシリエーション修正は `publishModelSwitched`（ローカルバス発行）を呼び出し、後続の再コンシリエーションをスケジュールし**ません**。実装者が `publishModelSwitched` を `.finally` 再コンシリエーションもアタッチするラッパーを介してファクタリングした場合、結果は無限の修正ループになります（再コンシリエーション → 読み取り → 発行 → 再コンシリエーション → …）。各修正は世代をバンプしますが、各新しい再コンシリエーションはエージェントを読み取り、分岐を見つける可能性があります（修正は_エージェント_ではなく_バス_を更新します）。**構造的ガード（v12）:** セッションごとの `reconciliationInFlight: boolean` フラグは、非同期読み取りの前に `true` に設定され、後に（`.finally` で）クリアされます。ラウンドトリップ解決の `.finally` は、再コンシリエーションをスケジュールする前にこのフラグをチェックします。`true` の場合、`[reconcile] session=<id> action=skipped-reentrant` をログに出力して戻ります。これにより、非再帰がリファクタリングに対して不変になります。コールグラフの再編成によって打ち負かされることはありません。`publishModelSwitched` ヘルパー自体は、項目 (1)～(3) 以外の副作用を持ちません。

**読み取りエラー: 制限付きリトライ、その後表面化。** 一時的な `getSessionContextStatus` の失敗により、バスがログ行だけで永久に分岐したままになってはなりません。短いバックオフで 1～2 回リトライします。すべて失敗した場合は、`reconciliation_failed` バスイベントを発行し、`action=read-error` をログに出力します。

- **ペイロード（v13）:** `reconciliation_failed { sessionId: string, error: string, retryCount: number, trigger: 'roundtrip-settled' | 'failed' }`。`error` は、コンシューマー UX とオンコール診断のために、「エージェントプロセスのクラッシュ」と「JSON-RPC タイムアウト」を区別します。
- **コンシューマーコントラクト:** 勧告 — クライアントは一時的な警告を表面化させても**よく**、自己修復のために独自の `getSessionContextStatus` プルをトリガーさせても**よい**です。必須のハンドラーはありません。コンシューマーが存在しない場合、バス状態は最後に発行された状態のままになります（古いですが、終端ではありません）。
- **試行ごとのログ:** 各リトライ試行は独自のログ行を出力します: `[reconcile] session=<id> attempt=<n>/<max> error=<msg>`。これにより、オンコールは最終的な集計イベントを必要とせずに、一時的な失敗と持続的な失敗を区別できます。
**Failure-path consumer event ordering (v12)。** 失敗パス（タイムアウト/エラー）において、コンシューマーは `model_switch_failed` を観測した直後（非同期なリコンシリエーションの後）に、まさに「失敗」したモデルに対して `model_switched(A)` を観測する場合があります。これは、ブリッジのタイムアウトにもかかわらずエージェントが実際にモデルを適用した際に発生します。これは正しい動作です。リコンシリエーションによる修正が権威ある情報となります。コンシューマーは、先行する失敗イベントに関わらず、`model_switched` を常に権威あるものとして扱うべきです（失敗したモデルのエラートーストは破棄してください）。§8 には、このコンシューマーから観測可能な完全なイベント順序を表明するテストが含まれています。

**Observability:** `[reconcile] session=<id> trigger=roundtrip-settled|failed baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=corrected|converged|skipped-newer-gen|skipped-reentrant|read-error`。

### 2.3 Bridge state cache（「現在」の model/mode/commands の同期的なソース）

鮮度チェック（§2 item 4）、§2.2 のリコンシリエーション、および A5 のスナップショット（§5）は、すべてセッションの**現在**の model / approval-mode / commands を必要とします。ブリッジには同期的なアクセサがありませんでした。`getSessionContextStatus`（`bridge.ts:2784` → `requestSessionStatus`、非同期の `extMethod` ラウンドトリップ）しかなく、ここでの `await` は、これらのメカニズムが閉じるはずの TOCTOU ウィンドウを再び開いてしまいます。そのため：

- `SessionEntry` に追加: `currentModelId?: string`, `currentApprovalMode?: ApprovalMode`, `availableCommands?: AvailableCommand[]`。
- **すべての publish サイトで同期的に更新**、publish と同じ同期的なターンで実行（古い値の読み取りと新しい値の書き込みの間に `await` を挟まない）：すべての `model_switched` publish は §2.2 の `publishModelSwitched` ヘルパーを経由します（これは `entry.currentModelId` をアトミックに更新し、`entry.modelPublishGeneration` をインクリメントし、バスに publish します）。`approval_mode_changed`（`:2979` / `:3007`）は `entry.currentApprovalMode` を更新します。`availableCommands` は、`available_commands_update` 汎用 sessionUpdate を受信した際に `BridgeClient.sessionUpdate()` で更新されます。ハンドラは、汎用転送 publish の**前**に同期的に `entry.availableCommands = payload.commands` を設定します。このヘルパーにより、どの publish サイトもキャッシュや世代の更新を見逃すことがなくなります。
- **`availableCommands` の詳細 (v13):** 型は `AvailableCommand[]`（`status.ts` と一致）です。model/mode とは異なり、このフィールドには**名前付きの promoted bus event がなく**、**リコンシリエーションもありません**。これは汎用の `session_update` パスによって更新されるパッシブなキャッシュです。実装者がフックを見逃した場合、A5 のスナップショットは古い/未定義の commands を提供してしまい、フォールバックもありません。トリガーパスは明示的に `BridgeClient.sessionUpdate()` → `params.type === 'available_commands_update'` をチェック → キャッシュを更新 → 汎用 `session_update` として転送、となります。
- エントリ作成時（初期 model/mode）、つまり何らかの変更が発生する前に、`createSession` / `loadSession` ACP レスポンスから**シード**します。
- **コンシューマー（同期的なフィールド読み取り）:**
  - **A5 snapshot (§5):** 3 つのフィールドすべてを 1 つの同期的なブロックで読み取ります。これがキャッシュの主な目的です。
  - **ベストエフォートの demux dedup (§2.1):** `currentModelId` がすでに `entry.currentModelId` と等しい `current_model_update` を破棄します。
  - **`previous` の導出 (A1/A2):** demux は、新しい値を適用する_前_にキャプチャした `entry.currentApprovalMode` から `approval_mode_changed.previous` を設定します。これにより、**エージェントは `previousModeId` / `previousModelId` を決して送信しません**（ACP の `CurrentModeUpdate` スキーマに `previousModeId` フィールドがないという問題を回避します）。
- **コンシューマーではないもの: §2.2 リコンシリエーション。** リコンシリエーションにはエージェントの_真の_ model が必要ですが、キャッシュはそれを提供できません（ドロップされた抑制された通知を見ることはないため）。リコンシリエーションは代わりに権威ある `getSessionContextStatus` の読み取りを使用します（§2.2, v9）。キャッシュは_ publish されたもの_のみを反映します。

これにより、キャッシュはスナップショット + dedup + `previous` ための第一級の同期的なソースとなり、リコンシリエーションの真実のパスに過度に踏み込むことはありません。

### Workspace mirror（明示的な決定）

`Session.setModel` はデフォルトで `persistDefault:true`（`Session.ts:1610`）とし、`getPersistScopeForModelSelection(this.settings)`（`Session.ts:1611`）経由で `model.name` を書き込みます。これは、**`modelProviders` を所有する信頼されたワークスペースの場合は workspace スコープ、それ以外の場合は user スコープ**です。どちらの場合でも、**A1 phase 1 は session-scoped ブロードキャストのみを行います**。理由：ピアセッションは次の起動時に永続化されたデフォルトを取得するため、および approval-mode のようなセキュリティ関連のクロスセッションゲーティングが存在しないためです。永続化されたモデルの workspace ミラーは、明示的に延期されたフォローアップ（§10）であり、暗黙的に省略されたものではありません。

### リスク

二重ブロードキャスト（§1.1 + 3 つの §2.1 ルールにより緩和）。失敗イベントの損失（item 3 の例外）。テストは §8 にあります。

---

## 3. A2 — セッション内 approval-mode 変更（非対称。#4510 によりブロック中）

### 問題

1. **サイレントなセッション内変更。** `Session.setMode`（`Session.ts:1561`）→ `config.setApprovalMode()`（`:1573`）。通知なし。
2. **HTTP が `Session.setMode` をバイパスする。** `setSessionApprovalMode` は extMethod `qwen/control/session/approval_mode`（`acpAgent.ts:2200`）を介して直接 `config.setApprovalMode()`（`acpAgent.ts:2228`）を駆動します。セッション内の emit だけでは HTTP をカバーできず、HTTP はエージェント通知を emit しません。
3. **ペイロード + 永続化。** `approval_mode_changed` には `{previous,next,persisted}` が必要です（`bridge.ts:2979` は session-scoped、`:3007` は workspace-scoped）。`current_mode_update` は `currentModeId` のみを持ち、エージェントには `persist` の概念がありません。
4. **まだシリアライゼーションプリミティブがない。** 現在のコードベースには `approvalModeQueue` が**存在しません**。approval-mode の HTTP パス（`bridge.ts:2893-3020`）は、セッションごとのキューなしで（model パスの `modelChangeQueue` とは異なり）extMethod + publish をインラインで実行します。したがって、#4510 が実装されるまで、抑制/競合のウィンドウは無限大となります。

### 提案された設計

**Session-scoped — セッション内での emit。HTTP に対してはブリッジが唯一の emitter として残る:**

1. `Session.setMode` から `current_mode_update` を emit します（ACP `setSessionMode`、`acpAgent.ts:922`、およびセッション内 `/approval-mode` をカバー）。
2. HTTP extMethod パスは、**ブリッジの** session-scoped `approval_mode_changed` publish（`bridge.ts:2979`）を維持し、エージェント通知は **emit しません**（`Session.setMode` をバイパスするため）。ブリッジが唯一の emitter であり、抑制するものはありません。
3. **`previous` はブリッジの state cache から取得される — エージェントは `previousModeId` を送信しない。** SDK ノーマライザー `normalizeApprovalModeChanged`（`normalizer.ts:754`）は `previous` を要求するため、promoted な `approval_mode_changed` はそれを保持する必要があります。しかし、ACP の `CurrentModeUpdate` には `currentModeId` しかありません（`previousModeId` フィールドがない — A1 で v7 が直面したのと同じ外部ユニオンの制約。仕様で定義された型に必須フィールドを追加することはできません）。解決策：**demux が `entry.currentApprovalMode`**（この変更前のキャッシュされた値、§2.3）から `previous` を設定し、同じ同期的なターンでキャッシュを `currentModeId` に更新します。エージェントの `current_mode_update` は変更されていない ACP の形状（`{currentModeId}`）のままであり、ブリッジは常に完全な `{previous,next}` を生成します。SDK のドロップもなく、ACP スキーマの変更もありません。
4. **ヘルパーの一般化（移行モデルの指定）：** 現在の `sendCurrentModeUpdateNotification`（`Session.ts:1625`）は `ToolConfirmationOutcome` から `newModeId` を導出します（`auto-edit`/`default`/current のみ）。これを一般化して明示的な `currentModeId` を受け取れるようにし、`Session.setMode` が任意の `ApprovalMode`（`plan`/`yolo`/`auto`/…）に対して emit できるようにします。既存の 2 つのツール確認呼び出し元（`Session.ts:2160`、`:2168`）は、`ToolConfirmationOutcome` エントリーポイント（事前に `currentModeId` を計算してから委譲する）を維持します。フラグデイの削除ではなく、非推奨は別途追跡されます。どの呼び出し元も `previous` を計算する必要はありません（ブリッジが item 3 で導出します）。

**Workspace-scoped (persist) はブリッジのみに残る:**

5. persist + workspace ブロードキャスト（`bridge.ts:3007`）は、ブリッジの `persist` フラグによってゲーティングされたブリッジレベルの publish のままです。`persisted:true` は workspace イベントにのみ現れます。`scope: 'session' | 'workspace'` ディスクリミネータを追加します。

### ハード前提条件（A2 をブロック）

A2 は **PR #4510 による `approvalModeQueue` の実装（または approval-mode ラウンドトリップのための同等のセッションごとの in-flight トラッカー）が完了するまでブロックされます。** これがないと、抑制/調整のウィンドウが無限大になります。具体的に（これが防ぐ分岐）：ブリッジが `setSessionApprovalMode('default')` を開始し、その間にセッション内 `/approval-mode yolo` が発生します。もし無限大のウィンドウ全体で promotion が抑制されると、`yolo` 通知はドロップされ、二度と再発行されなくなります。その結果、バスは `default` を示しているのに実際のモードは `yolo` となります（セキュリティ上重要）。有界な `approvalModeQueue` ウィンドウが緩和策となります。

### 二重 emit のエッジケース

オープンなツール確認ダイアログ中の `/approval-mode` は、数ミリ秒以内に 2 つの `current_mode_update` を発生させる可能性があります（ユーザーの `setMode` + ツールの `ProceedAlways` ハンドラ）。許容されます（収束するため）。必要に応じて、結果のモードが現在のモードと等しい場合は emit をスキップします。文書化されていますが、ゲーティングはされていません。

### リスク / 互換性

 wire に対する追加（`current_mode_update` の再利用 + `previousModeId` + `scope`）ですが、promoted 型に対しては SDK の追加**ではありません**（§6 を参照）。#4510 によりハードブロックされています。

---

## 4. A4 — `permission_resolved` の originator/voter セマンティクス

### 問題

`permission_request.originatorClientId` = プロンプトの originator。`permission_resolved.originatorClientId` = voter。`permissionMediator.ts:1125` での emit は、`permissionMediator.ts:1135-1137` の spread 内で `resolverClientId` から `originatorClientId` をスタンプします（voter の信頼された clientId、O8 pre-F3 互換性）。コンシューマーは `permission_resolved` を特別なケースとして処理する必要があります。

### 提案された設計（wire と SDK に対する追加）

- **Wire:** `originatorClientId` と並んで `voterClientId` を emit します（同じ値）。両方とも**オプション**です。voter がいない解決（タイマー満了、セッションクローズ、`X-Qwen-Client-Id` なしのループバック voter）は、今日と同様にどちらも持ちません。
- **SDK 型付きイベント:** `originatorClientId`（変更なし — 名前変更なし、破壊的変更なし）**と**、新しいオプションの `voterClientId` の**両方**を公開します。古いフィールドは、将来のメジャーバージョンで非推奨エイリアスとなるよう文書化されます。
- プロンプトの originator は、一致する `permission_request` と相関させることで引き続き利用可能です。

### Wire / 互換性

両レイヤーに対して追加 — コンシューマーの破壊的変更はありません。D4 エイリアシング（PR #4510）を反映しています。

---

## 5. A5 — アタッチ時のサイドチャネルスナップショット

### 問題

`Last-Event-ID` アタッチはリプレイ + ライブテールを取得しますが、現在のサイドチャネルスナップショットは取得しません。今日、それは `qwen/status/session/context`（`packages/acp-bridge/src/status.ts:96`）、supported-commands、`POST /load` をプルします。

### 提案された設計

`?snapshot=1` によるオプトイン。リプレイ後に合成された **`session_snapshot`** フレームを emit します:

```
session_snapshot { approvalMode, model, availableCommands? }
```

- **`replay_complete` はすでに存在します**（`eventBus.ts:444`、マージされた #4484 で出荷済み）。A5 phase 2 は新しい `session_snapshot` フレームのみを導入し、`replay_complete` は導入しません。
- **再開の順序: replay → `replay_complete` → `session_snapshot`。** スナップショットが権威ある最終的な情報となります。
- **§2.3 のブリッジ state cache から、単一の同期的なブロックで emit 時にキャプチャ。** これが実現可能なのは、§2.3 が `entry.currentModelId` / `currentApprovalMode` / `availableCommands` を同期的なフィールドとして追加し（すべての publish で最新に保たれ、セッション作成時にシードされる）、スナップショットがこれら 3 つのフィールドを読み取って 1 つの同期的なターンで publish するためです。間に `await` も、非同期の `extMethod` ステータスラウンドトリップもないため、並行するミューテーションが割り込むことはありません。（v3 の「サブスクライブ時 (T0) にキャプチャ、リプレイ後に emit」には古い値で上書きするバグがありました。リプレイ中に配信されたライブの `model_switched` が、最後に適用される T0 スナップショットによって上書きされてしまうのです。ライブキャッシュからの emit 時キャプチャがこれを修正します。）§2.3 がなければ「現在」の状態に対する同期的なソースが存在せず、この契約は実装不可能です。これが v8 の Critical でした。
- **初回アタッチの順序**（`Last-Event-ID` なし）：`replay_complete` は強制 push されません（リプレイが発生しないため）。また、設計上 `replay_complete{replayedCount:0}` を合成**しません**。そうすると、既存のコンシューマーに対してそのイベントの「リプレイ中→ライブ」契約が広がってしまうためです。代わりに、`session_snapshot` は**初回アタッチ時に自己区切り**となります。つまり、ライブテールの前に最初のフレームとして emit され、コンシューマーは `session_snapshot` を「ベースラインが確立された」として扱います。（再開時は上記の replay → `replay_complete` → snapshot の順序を維持します。）
- **`pendingPermissionIds` は除外**（後述のセキュリティ）。
- SDK: 型付き `session.snapshot` イベントが view-state reducer のサイドチャネルフィールドをシードし、最後に（再開時）/ 最初に（初回アタッチ時）適用されます。
### `?snapshot=1` サブコントラクト

初回アタッチ: `?snapshot=1` が指定されない限りオフ。再接続: オプトイン（最も有用）。再接続をまたいだトグル: 合法かつ冪等（各サブスクライブは独立）。アトミック性: ベストエフォート — 発行時のキャプチャとそれに続くライブデルタが整合；reducer テストは競合するミューテーションをカバーする。

### セキュリティ: `pendingPermissionIds` を含めない理由

pending ID を含めると、クライアントがコンテキストを受け取っていないリクエストに対して投票できてしまう。`respondToSessionPermission` はセッションの存在、`requestId`/pending 状態、**`clientId` の登録**（`entry.clientIds` に対する `resolveTrustedClientId`、`bridge.ts:2271`）、およびオプションの妥当性を検証するが、投票者が元の `permission_request` を観測したかどうかは検証**しない**。したがって攻撃者は匿名クライアントではなく、登録済みのセッション共同作業者（すでに Bearer 認証済み + `clientId` 登録済み）となる。「真新しいクライアントなら誰でも」よりも範囲は狭いが、ギャップは実在する。つまり、コンテキストを持たない破壊的な操作を承認できてしまう。pending 権限を正当に必要とするクライアントは、リプレイからそれらを学習する（完全なコンテキストが伝播する）。このフィールドを削除することで、snapshot/resolution の競合も無意味になる。

### Wire / 互換性

追加型、オプトイン。古い SDK は不明なフレームを `debug` UI イベントとして表面化する（ノイズになるが壊れない）— これもオプトインにしておく理由の一つ。

### 代替案

フェーズ 1: プルコントラクトのみをドキュメント化（`replay_complete` 後のプル）；フレームは延期。

---

## 6. クロスカット

- **Bridge 権限モデル（§1.1）**: bridge は自身が駆動する変更のイベントを所有する；セッション内の変更は、bridge が demux する通知を追加する — A1 は `extNotification()`（`bridgeClient.ts:491`）経由、A2 は `sessionUpdate()`（`bridgeClient.ts:397`）経由；suppress と suppress 時の drop により二重シグナルを防ぐ。Suppression はモデルパスに対してのみ意味を持つ；HTTP approval-mode にはエージェント通知がない。
- **Demux（§2.1）は厳格な前提条件**；A2 はさらに **#4510**（`approvalModeQueue`）**でブロックされている**。
- **どこでも追加型というわけではない；dual-emit 移行で処理される。** `current_mode_update` から `approval_mode_changed` への昇格は、観測されるイベントタイプを変更する。daemon と VS Code IDE companion は**異なるチャネル**（CLI 自動アップデート vs Marketplace）でリリースされるため、切り替えをアトミックにはできない。**影響を受けるコンシューマーチェーン（すべて `approval_mode_changed` パスを獲得する必要がある）:**
  - `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts:177`（`case 'current_mode_update'`）— リーフハンドラ；
  - daemon イベントをそこにルーティングするアップストリームディスパッチ — `daemonIdeConnection.ts` と `DaemonChannelBridge.ts` は `event.type` でスイッチし、認識されないタイプを `default` 経由で破棄するため、これらが拡張されるまで、更新されたリーフハンドラでも単独の `approval_mode_changed` を受け取ることはない。
  - **緩和策（§2.1 dual-emit）:** 最初のリリースでは、レガシーの汎用 `session_update{current_mode_update}` と昇格された `approval_mode_changed` の**両方**を送出する；IDE companion はレガシーフレームで動作し続ける；その `approval_mode_changed` パスがリリースされたら、次のリリースで dual-emit を削除する。A4（`voterClientId`）と A5（オプトインフレーム）は**追加型である**（移行は不要）。
- **失敗イベントは bridge のみに留まる**（`model_switch_failed`）。
- **セッション内の同時ドリフト**は、§2.2 のラウンドトリップ後整合によって制限される。
- **SDK reducer の更新**（A1/A2 の混同を避けるための命名）: A1 は **`current_model_update`** → `model.changed` を導入；A2 は **`current_mode_update`** → `approval_mode_changed` に昇格；A4 はオプションの `voterClientId` を追加；A5 は `session.snapshot` からサイドチャネル状態をシードする。

---

## 7. 実装順序

1. **A4** — 追加型の wire + SDK エイリアス。最小かつブロックされていない。
2. **A1 — `extNotification` 経由の `current_model_update`**（#4546 core としてリリース済み）— `Session.setModel` が `extNotification` を送出する；`BridgeClient.extNotification()`（`bridgeClient.ts:491`）の demux がそれを `model_switched` に昇格する。コアパス + タイプごとの suppress + 可観測性は #4546 で完了；**§2.3 状態キャッシュ + 鮮度チェック + §2.2 整合は A1 のフォローアップ**（キャッシュフィールドが必要）。
   - **2b. §2.3 bridge 状態キャッシュ** — `SessionEntry` に `currentModelId`/`currentApprovalMode`/`availableCommands` を追加し、publish ごとに更新 + 作成時にシードする。A1 の鮮度/整合フォローアップ、**および** A5 の前提条件。
   - **2c. アトミックな結合:** 整合と `modelPublishGeneration` ガードは単一のアトミックな成果物である；ガードなしで整合をリリースすると、上書きリグレッションが発生する（非同期の `getSessionContextStatus` 読み取り中の同時昇格により、古い値が書き戻されてしまう）。両方は同じ PR に含まれなければならない。
3. **A2 — PR #4510**（`approvalModeQueue`）**でブロック**。`current_mode_update` の昇格（`previous` は §2.3 キャッシュから派生 — wire 上に `previousModeId` はなし）、`Session.setMode` の送出、ヘルパーの一般化、`scope`、保持された bridge ワークスペース publish、**dual-emit 移行** + IDE-companion + アップストリームディスパッチの更新を追加。
   - **3b. Dual-emit の削除** — ターゲットリリースを指定した GitHub issue で追跡；dual-emit の publish サイトには §2.1 を参照する `TODO(dual-emit-removal)` が記載されている。次のリリースで dual-emit が削除されたら issue をクローズする。
   - **3c. A2 ラウンドトリップ後整合** — 同じ §2.2 コントラクト、エージェントの実際の approval mode を読み取る；`approvalModePublishGeneration` と `publishApprovalModeChanged` ヘルパーを追加する。A2 の昇格と合わせてリリースされなければならない（2c と同じ理由 — ガードのない整合は、整合がないよりも悪い）。
4. **A5** — フェーズ 1: プルコントラクトのドキュメント；フェーズ 2: オプトインの `session_snapshot`（同期ブロック内での発行時キャプチャ；再開時の `replay_complete` 後、初回アタッチ時の自己区切り最初のフレーム）。`replay_complete` はすでに存在する（#4484）；新しいのは `session_snapshot` のみ。

本デザインが承認された後、それぞれが独自の実装 PR としてリリースされる。

---

## 8. テスト計画

- **Demux/§1.1:** 昇格された `current_model_update` は `model_switched` を publish し、汎用ラッパーを suppress する；bridge モデルのラウンドトリップ中の通知は**破棄される**（汎用 publish も昇格もされない）；セッション内の通知は昇格**される**；不明なサブタイプは引き続き汎用のまま。
- **A1:** セッション内の `/model` と plan-mode はそれぞれ正確に 1 つの `model_switched` を publish する；HTTP `POST /model` とアタッチ時の `applyModelServiceId` はそれぞれ正確に 1 つを publish する（二重にならない）；失敗した `setModel`（セッション内 + HTTP）は `model_switched` を送出せず、HTTP は引き続き `model_switch_failed` を送出する；タイムアウトした `model_switch_failed` の後の `model_switched` は配信される（権威ある最新）。
- **A2:** セッション内の `setMode` は 1 つのセッションスコープの `approval_mode_changed{scope:'session',persisted:false}` を publish する；HTTP `POST /approval-mode` は 1 つを publish する（bridge、唯一の送出元、二重にならない）；非永続化はワークスペースブロードキャスト**しない**；永続化は `scope:'workspace',persisted:true` イベントを追加する；失敗した `setMode` は何も送出しない；`approvalModeQueue` がリリースされれば、無限ウィンドウの発散は防止される。
- **A4:** **識別ケース** — クライアント A がプロンプトを送信し（したがって `permission_request.originatorClientId === A`）、**別の**クライアント B が解決投票を行い（したがって `permission_resolved.voterClientId === B`）、2 つが異なることをアサーションする（A4 が存在する理由である曖昧さ解消のため、同じクライアントの値だけでなく）；タイマー/`clientId` なしの解決はどちらのフィールドも保持しない；SDK は両方を公開する；古い daemon のフォールバックは `originatorClientId` 経由で投票者を表面化する。（PR #4539 で完了。）
- **A5:** `?snapshot=1` での再開は、`replay_complete` の後に `session_snapshot`（mode/model/commands、`pendingPermissionIds` なし）を生成する；初回アタッチは、合成 `replay_complete` **なし**で最初のフレームとして `session_snapshot` を生成する；フラグ**なし**のアタッチはスナップショットを生成**しない**；再接続をまたいだフラグのトグルは冪等である；リプレイ中に配信された `model_switched` は、（発行時、同期キャプチャの）スナップショットによって上書き**されない**。
- **ベストエフォート dedup（§2.1）:** `entry.currentModelId` が**すでに A** のときに `current_model_update(A)` が到着すると**破棄される**（冗長な no-op）。キャッシュが B（A≠B）で、ラウンドトリップが進行中でないときに `current_model_update(A)` が到着すると**昇格される**（demux は古い値と新しい値を値で区別**しない** — それは整合の役割）。（_値ベースの破棄を誤って期待していた v8 シナリオから修正。_）
- **整合（§2.2、権威 + 世代ガード）:**
  - _修正:_ bridge の `setSessionModel(A)` が進行中 → セッション内の同時 `/model B` は破棄（suppress）される → bridge は `model_switched(A)` を publish → settled 後の `getSessionContextStatus`（モック → B）→ 修正 `model_switched(B)`；バスは B に収束する（そして修正はキャッシュ + 世代を更新する）。
  - _収束:_ 状態の読み取りが `entry.currentModelId`（バスの現在のモデル）と等しい → 修正なし（`action=converged`）。
  - _世代スキップ（TOCTOU）:_ 非同期読み取り中に昇格が発生し（世代が進む）→ 読み取りが古くても、整合は修正を**スキップする**（`action=skipped-newer-gen`）。
  - _失敗パスのトリガー:_ タイムアウトしたラウンドトリップ（`model_switch_failed`）でも整合がトリガーされる；比較のベースラインは `entry.currentModelId`（ラウンドトリップ前の値。`model_switch_failed` はキャッシュを更新**しない**ため）；エージェントが実際にタイムアウトしたモデル A を適用した場合（読み取りが A を返す）、かつ `entry.currentModelId` がまだ古い値 B である場合、整合は `publishModelSwitched` 経由で修正 `model_switched(A)` を送出 → バスは A に収束する。
  - _読み取りエラー:_ 状態の読み取りがすべての再試行で失敗 → 正しいペイロードで `reconciliation_failed { sessionId, error, retryCount, trigger }` を送出；試行ごとのログが送出される（`attempt=1/<max>`、`attempt=2/<max>`）；修正なし。
- **クロス軸の非 suppress（§2.1）:** 進行中の bridge **モデル**のラウンドトリップは、セッション内の `current_mode_update` を suppress **しない**（それは昇格**される**）、そしてその逆も同様。
- **Bridge 状態キャッシュ（§2.3）:** すべての `model_switched` publish サイトは `publishModelSwitched` を経由し、`entry.currentModelId` を更新**し**、`entry.modelPublishGeneration` をインクリメントする；それぞれ（整合の修正を含む）の後に世代が正確に 1 進むことをアサーションする。スナップショット/dedup/世代ガードの読み取りは最新の値を同期的に参照する；キャッシュはセッション作成時にシードされる。
- **Dual-emit 移行（§2.1/§6）:** ウィンドウ期間中は `approval_mode_changed` と `session_update{current_mode_update}` の**両方**が送出される；削除後は `approval_mode_changed` のみ。
- **`extNotification` トランスポート（v7）:** `current_model_update` は `extNotification()`（`sessionUpdate()` ではない）経由で到着し、`model_switched` に昇格する。
- **互換性移行（§2.1）:** 以前は汎用の `session_update` として `current_mode_update` を受け取っていた SDK reducer は、`approval_mode_changed` に昇格されると同じ状態に到達する。
- **ヘルパーのリグレッション（§3 ポイント 4）:** ヘルパーが一般化された後も、`exit_plan_mode` と `ProceedAlways` の呼び出し元は引き続き正しい `current_mode_update` ペイロードを生成する。
- **二重送出のエッジケース（§3）:** 同時の `/approval-mode` と `ProceedAlways` が両方とも送出する；reducer は収束する。
- **非再帰の構造ガード（§2.2）:** 整合が進行中の間（`reconciliationInFlight === true`）、整合をトリガーする同時昇格は**スキップされる**（`action=skipped-reentrant`）；フラグは、進行中の整合が結果に関係なく settled した後にリセットされる。さらに：整合の修正 `model_switched` が発生した後、トリガーとなった settle イベントに対して `getSessionContextStatus` が**正確に 1 回**呼び出されることをアサーションする — 修正の publish は整合パスに再入**しない**（呼び出し回数に上限がある）。
- **失敗パスの収束（§2.2）:** `model_switch_failed` が発生 → 整合が `getSessionContextStatus` を読み取る → `entry.currentModelId`（変更なし）を返す → 修正は送出されない（`action=converged`）；バスの状態は変更されない。
- **世代カウンターの値（§2.3）:** 昇格 → 整合 → 修正のシーケンスの後、`entry.modelPublishGeneration` は `gen_before + 2` に等しい（初期昇格に 1、修正に 1）；可観測性でログに記録される `gen_before`/`gen_after` は、整合の入口/出口のカウンター値と一致する。
## 9. 解決済みの決定事項（emitter の所有権）

| エントリ                                              | エージェントパス                                                                   | `Session.*` を経由するか？          | セッションスコープの emitter                                                            | ワークスペースへの publish                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `POST /session/:id/model`                          | `unstable_setSessionModel` (`acpAgent.ts:925`) → `session.setModel` (`:935`) | ✅                            | **bridge** (`bridge.ts:2883`)；エージェント通知は**ラウンドトリップ中に抑制される** | n/a                                        |
| `applyModelServiceId` のアタッチ                       | 同じパス                                                                    | ✅                            | **bridge** (`bridge.ts:1172`)；ラウンドトリップ中に抑制される                        | n/a                                        |
| セッション内 `/model`、plan-mode                     | `Session.setModel` を直接呼び出し                                                  | ✅                            | **agent** `current_model_update` → demux                                          | n/a（延期）                             |
| `POST /session/:id/approval-mode`                  | extMethod (`acpAgent.ts:2200`) → `config.setApprovalMode` (`:2228`)          | ❌ `Session.setMode` をバイパス | **bridge** (`bridge.ts:2979`)；**エージェント通知なし**（抑制するものがない）    | bridge、`persist` でゲート (`bridge.ts:3007`) |
| ACP `setSessionMode` / セッション内 `/approval-mode` | `acpAgent.ts:922` → `Session.setMode`                                        | ✅                            | **agent** `current_mode_update` → demux                                           | n/a                                        |

`model_switch_failed` は、すべてのパスにおいて bridge のみで発生します。

**解決済み: A2 は extMethod のバイパスを維持します（HTTP approval-mode パスを `Session.setMode` 経由でルーティングしないでください）。** これは以前未解決だった問題ですが、システム上で重要な役割を果たしています（もし変更した場合、HTTP パスはエージェント通知を発火させ、§1.1 の「エージェント通知なし、抑制対象なし」という記述が誤りとなり、二重の emit が発生してしまいます）。決定: バイパスを維持します。bridge は HTTP approval-mode の唯一の emitter のままであり、そこに抑制ロジックは必要ありません。これを再検討するには、そのパスに抑制ロジックと `approvalModeQueue` の依存関係を追加する必要があるため、明示的にスコープ外とします。

## 10. 未解決の課題

1. **A1 ワークスペースミラー:** 延期されている persisted-model のワークスペースミラーをリリースするか、それともモデルを永続的にセッションスコープのままにするか？（永続化スコープ自体は `getPersistScopeForModelSelection` に従ってワークスペースまたはユーザーとなります）。
2. **A5 デフォルト:** 再接続時に `?snapshot=1` をオプトインのままにするか、常にオンにするか。
3. **Reconciliation vs serialize-at-source (A1) — レースフリーのターゲット。** suppress + best-effort-dedup + authoritative-reconciliation + generation-guard のスタックが存在するのは、セッション内 `/model` が `modelChangeQueue` をバイパスし、bridge 駆動の変更とレースを引き起こすためだけです。セッション内のモデル変更を同じ `modelChangeQueue` 経由でルーティングするようにすれば（すべてのモデル変更が直列化され、順序通りに publish される）、suppress/dedup/reconcile の仕組みと、それが生み出したすべての TOCTOU を排除できます。これが正しい長期的な設計です。これが延期されているのは、セッション内ハンドラ（`Session.setModel` → agent）が ACP 境界を越えて bridge エントリのキューと連携する必要があるためであり、それは大規模な変更となるからです。それまでの間、v10 スタックは、上記で文書化された残存レース動作を伴う暫定的な緩和策となります。**reconciliation を無期限に強化するのではなく、serialize-at-source のリファクタリングをスケジュールすることをお勧めします。**