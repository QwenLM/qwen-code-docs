# RFC: "qwen tag" — qwen-code のための永続的・マルチプレイヤー・チャネル常駐エージェント（DingTalkファースト）

**ステータス:** ドラフト (v2)
**日付:** 2026-06-25
**著者:** (qwen-code)

---

## 変更履歴 (v1 → v2)

本改訂では、v1 のすべての Open Decision をクローズし（現在は **Resolved Decisions**、§9）、レビューで指摘された7つの正確性/一貫性の欠陥を修正しました。2つの主要な変更点は以下の通りです。

- **OD-1 はもはやゲートではなく、コミットされたアーキテクチャです。** Phase 0 は現在の `AcpBridge` パスで出荷されます。**Phase 1 以降では、チャネルホスティングが `qwen serve` デーモンに移行されます**（`DaemonChannelBridge` / デーモンチャネルランナー経由）。これにより、セッションごとの FIFO `promptQueue`、`MultiClientPermissionMediator`、`eventBus`、`/workspace/memory`、およびレート制限を再利用します。以前「OD-1 open / gates everything」と読まれていたすべてのセクションは決定済みとして読めるようになり、デーモンへのコミットメントは §1、§4、§5、§6.1、§6.2、§6.3、§6.4、および §7 に伝播されています。
- **プロアクティブな発火パスは、実際に実行されるデーモンパス向けに再設計されました。** v1 の `dispatchProactive` は `AcpBridge` のセマンティクス（チャネル側の `sessionQueues`）用に記述されていました。デーモン移行の下では、`DaemonChannelBridge.prompt()` はキューイングするのではなく、重複時に **`Prompt already in flight` をスローします**（`DaemonChannelBridge.ts:257-261`）。v2 では、**両方の**バリアントに対して `ChannelBase.sessionQueues` を介してプロアクティブプロンプトを直列化するため、スローガードがトリガーされることはなく、never-cancellable な不変条件が明示的に記述されています（§6.2）。

組み込まれた解決策と修正:

- **OD-2** 決定: ワークスペース/チャネルごとに1つのプロセス。
- **OD-3** 決定: Phase 1 は `first-responder` + 単一のチャネルレベル `clientId`。Phase 2 は `senderId→clientId` の名簿とライフサイクルが存在した後の `consensus`/`designated`。プロアクティブターンでは高リスクツールを自動拒否。
- **OD-4** 決定: 共有（スレッド）グループでは、`/clear` は明示的な `confirm` を必要とし、そのリストが設定されている場合は `config.allowedUsers` に制限される。`/status` は読み取り専用。（ハイフン区切りの `/clear-channel` はスラッシュ文法で解析できないため、真のメンバーごとのオーナーゲートは ID モデルを待つ必要がある — OD-3/OD-11。）
- **OD-5** 決定: 古い `types.ts:42` の JSDoc を `'steer'` に修正。タググループプロファイルは `dispatchMode: 'followup'` を明示的に設定。
- **OD-6** 決定: ターンごとの `[senderName]` プレフィックス。**`instructedSessions` によるゲーティングは行わない**。**1つの新しいオプション `Envelope` フィールド `alreadyPrefixed`** を追加し、`collect` モードの合成的な再エントリーで再プレフィックスをスキップするようにする。（v1 の「新しいエンベロープフィールドなし」という主張を修正 — Fix #2。）
- **OD-7** 検証済みの DingTalk API の事実（§6.2/§6.5）を使用して解決。低確信度の項目は引き続きフラグ付き。
- **OD-8** 決定: ゲートウェイ/デーモンスケジューラが**唯一の** cron オーナー。タグセッションはインセッションの `Session` cron を開始**しない**。2つの cron ストアは分離されたパスに存在するため、両方のスケジューラが同じジョブに対して実行されない限り衝突は発生しない。
- **OD-9** 決定: プロセスごとの「org」ロールアップ + チャネルごとのウィンドウ、最も厳しいものが優先、固定の毎日ウィンドウ。v1 はチャネル側でトークンを推定し、デーモンホスト化後はデーモンの使用量パスを読み取る。
- **OD-10** 決定: `writeContextFile.ts` に `channel` スコープ（+`channelKey`）を追加。チャネルベースは **`ChannelBaseOptions` を介して注入される CLI レイヤーのコールバック**（`channel-base → core` の依存関係なし）経由で書き込み/読み取りを取得。ユーザーグローバルの場所は `~/.qwen/channels/memory/`。
- **OD-11** 決定: `senderName` は参考情報のみ。`clientId` が唯一のセキュリティプリンシパル。インメモリ監査リング + 追記専用の `~/.qwen` フォローアップファイル。
- **OD-12** 決定: ループバック以外のデーモンバックデプロイメントには `--require-auth` + トークンを必須とする。

OD の解決を超えた正確性の修正:

- **Fix #1 — プロアクティブ発火パスの同時実行性** がデーモンパス向けに再設計され（§6.2）、Phase-0 の `AcpBridge` バリアントと Phase-1 以降のデーモンバリアントの両方に対して never-cancellable な不変条件が適用される。
- **Fix #2 — 内部矛盾** の削除: §6.1/G2 はもはや「新しいエンベロープフィールドなし」と主張せず、1つの `alreadyPrefixed` フィールドを認める。
- **Fix #3 — メモリ配線の設計**（§6.3）: 正確な `ChannelBaseOptions` の変更（`readChannelMemory`/`writeChannelMemory` コールバック）と、`start.ts` でそれらを構築/注入する主体。セッションごとのブートストラップ読み取りは `instructedSessions` ゲートを再利用。
- **Fix #4 — `canColdSend` ケイパビリティフラグの設計**（§6.2）: 宣言場所、DingTalk/Feishu での設定方法、およびスケジューラがフェイルラウドする方法。
- **Fix #5 — OD-8 分離ストアの明確化**（§6.2）: ゲートウェイストアと `Session` ストアは異なるパス。唯一の衝突リスクは、タグセッションもインセッション cron を実行することであり、これは OD-8 ゲートによって閉じられる。
- **Fix #6 — 推定予算の強制**（§6.4）: 推定値は WARN/アラートを出してもよいが、ユーザープロンプトをハード拒否してはならない。実際のデーモンの使用量数値に対してのみハード拒否する。
- **Fix #7 — `followup` 下の監査帰属**（§6.4）: キューイングされたプロンプト**とともに** `senderId` を運ぶことで、ツール呼び出し/権限が最後にキューイングされた送信者ではなく、実際に実行されているターンに帰属するようにする。

v1 から検証済みのグラウンドトゥルースの事実（AcpBridge トポロジ、AcpBridge 自動承認、抽象 `sendMessage`、スコープ、パーサーのデフォルト）は変更せずに保持されています。

---

## 1. 概要

**"qwen tag"** は、チャットチャネル（まずは DingTalk グループ、次に Feishu）内に存在する共有の qwen-code エージェントであり、そのチャネルのどのメンバーでも `@` メンションで呼び出すことができます。呼び出されると、バインドされたワークスペースに対して完全な qwen-code エージェントループ（ツール、ファイル編集、シェル、MCP）を実行し、作業内容をリアルタイムでチャネルにストリーミングし、**ターンや再起動をまたいでチャネルを記憶**し、聞かれることなく**プロアクティブまたはスケジュールに従って**行動することができます。これは Claude Tag のフォームファクター（1:1 の DM ボットではなく、ルームの_住人_となる単一の永続的マルチプレイヤーエージェント）を反映していますが、新しいホスト型サービスではなく、qwen-code の既存のチャネルアダプタスタック（`qwen channel start`、`packages/channels/*`）と `qwen serve` デーモン上に完全に構築されています。

この RFC の意図的なフレーミングは、**フォームファクターのリアクティブな半分はすでに大部分が出荷されており、プロアクティブ/メモリの半分はまだ出荷されていない**という点です。Claude Tag スタイルの_応答_エージェントを難しくする要素（セッションを多重化する長時間実行プロセス、1セッション1プロンプトの不変条件を保持するエージェントトランスポート、マルチプレイヤーセッションルーティング、チャネルごとのアクセス制御、ストリーミングカードレンダリング、および永続的なセッション永続化）はすでに存在し、現在のチャネルアダプタによって運用されています。_欠けている_のは、リアクティブな応答ボットを常駐エージェントに変える、適切に範囲設定された一連の機能です。つまり、共有セッションでの送信者帰属、プロアクティブ/スケジュールされた出力パス、ルームごとのメモリ、およびマルチプレイヤーガバナンスです。この RFC では、そのギャップを **4つのビルドエリア** にスコープし、Phase 0～2 にわたって仕様を定めます。

> 「80%」に関する注記: 初期のドラフトではこれを「約80%出荷済み」とフレーミングしていました。この数値は検証不可能であり、大げさな表現です。プロアクティブエンジン全体（ビルドエリア 2）とルームごとのメモリ（ビルドエリア 3）は完全に新規であり、特に DingTalk に関しては外向き開始パスが_全く_存在しません。代わりに、「リアクティブパスは構築済み。プロアクティブパスとメモリパスは未構築」とフレーミングします。

### RFC 全体を制約するトポロジの事実

チャネルアダプタが qwen エージェントに接続される方法には、**2つの異なるプロセスにおける2つの明確な方法**があり、これらを混同することが初期のドラフトで最も一般的なエラーでした。

- **`qwen channel start <name>`（出荷パス）。** `start.ts` は **`new AcpBridge(bridgeOpts)`** を構築し（`start.ts:213,268,356,435`）、`AcpBridge.start()` は **子プロセス** `node <cliEntryPath> --acp` を生成します（`AcpBridge.ts:53-70`）。**stdio** 上で NDJSON 経由で ACP と通信します。この子は_スタンドアロンエージェント_であり、`qwen serve` HTTP デーモンではありません。このトポロジには **HTTP デーモンも、`/workspace/memory` ルートも、`MultiClientPermissionMediator` も、`eventBus` リプレイリングも、デーモンの `promptQueue` も存在しません**。これらはすべて `packages/acp-bridge` + `packages/cli/src/serve` に存在しますが、`qwen channel start` はこれらをインスタンス化しません。ここでのプロンプトの直列化は、`ChannelBase`（`ChannelBase.ts:356-391` の `activePrompts` ミューテックス + `:394-470` の `sessionQueues` チェーン）と、子プロセス自身の ACP 1セッション1プロンプトの不変条件によって、完全に**チャネル側**で行われます。`AcpBridge.requestPermission` は**すべてのツール呼び出しを自動承認します**（`AcpBridge.ts:108-118`）。
- **`qwen serve` + `DaemonChannelBridge`（デーモンホスト）。** `DaemonChannelBridge`（`packages/channels/base/src/DaemonChannelBridge.ts`）はインプロセスブリッジであり、その `sessionFactory` はデーモンの `Session` オブジェクトを生成します。このパスはデーモン内でチャネルを実行するため、`acp-bridge` の FIFO `promptQueue`（`bridge.ts:232,2855,3082`）、`MultiClientPermissionMediator`、`eventBus`、および HTTP ルートを継承します。**`qwen channel start` は現在これをインスタンス化しません**（`start.ts` 内の参照はゼロ）。プロアクティブ設計を形作る1つの鋭いエッジ: `DaemonChannelBridge.prompt()` はキューイング**せず**、重複時に **`Prompt already in flight` をスローします**（`DaemonChannelBridge.ts:257-261`）。最終的に到達する FIFO `promptQueue` はデーモン/acp-bridge 側、つまり_そのインプロセススローガードの背後_にあります。したがって、プロアクティブエンジンはチャネルレイヤーで直列化する必要があります（§6.2）。

**コミットされたアーキテクチャ（旧 OD-1、現在決定済み）:** Phase 1 以降、**チャネルホスティングを `qwen serve` デーモンに移行する**ことで、マルチクライアントデーモンの仕組みが再利用されます。

- **Phase 0** は現在の `AcpBridge` パスで出荷されます（ID 注入には HTTP ルートもメディエータも必要ありません）。
- **Phase 1 以降** は `qwen serve` デーモン下でチャネルを実行します（`DaemonChannelBridge` またはデーモンチャネルランナー経由）。プロアクティブエンジン、ルームごとのメモリ永続化、およびガバナンスはすべて、デーモンの耐久性、ルート、`promptQueue`、メディエータ、およびイベントバスを必要とするためです。

これはもはや「オープン」でも「ゲーティング」でもありません。Phase 0 の配線は `DaemonChannelBridge` アタッチパス（または `--daemon <url>` フラグ）を追加するため、Phase 1 が開始されると同時に移行が利用可能になります。ゲートウェイ所有のスケジューラ（§6.2）は**移行ニュートラル**になるように構築されているため、切り替え前と後で同一に実行されます。

### 具体的に見た「qwen tag」とは

「qwen tag」のデプロイメントは、1つのワークスペースにバインドされた単一のエージェントプロセスと、グループ全体で **1つの** エージェントセッションを共有するように構成された `qwen channel start dingtalk` アダプタです。2つの**明確に異なるスコープ概念**の両方が一致する必要があります。

1. **チャネルルーティングスコープ**（`ChannelConfig.sessionScope`、`SessionRouter.routingKey()` によって消費される）: 受信メッセージがルーティングキーにどのようにマッピングされるかを決定します。タグの場合、グループ全体で1つのルーティングキー（`channel:(threadId||chatId)`、`SessionRouter.ts:53`）を共有する必要があるため、`'thread'` でなければなりません。**パーサーのデフォルトは `'thread'` ではなく `'user'` です**（`config-utils.ts:91-92`）。したがって、タグのレシピでは明示的に設定する必要があります。
2. **ブリッジ/ACP セッションスコープ**（`DaemonChannelBridge` / `acp-bridge` の `sessionScope`）: デーモンが基盤となる ACP セッションをどのように共有するかを決定します。`DaemonChannelBridge.newSession()` はこれをデフォルトで `'thread'` にします（`DaemonChannelBridge.ts:229,240`）。`acp-bridge` のインプロセスパスはデフォルトで `'single'` です（`bridge.ts:709`）。これはチャネルルーティングスコープとは**別のノブ**であり、`qwen channel start` パスには_存在しません_（`AcpBridge.newSession(cwd)` は `cwd` のみを受け取ります。`AcpBridge.ts:131`）。

これらが揃うと:

- **ルームごとに1つのエージェント、メンションで呼び出し。** `GroupGate` は `requireMention`（デフォルト `true`、`GroupGate.ts:49`）を強制するため、エージェントは `@` メンションされるか、ボットへの返信があるまで沈黙を保持します（`GroupGate.ts:51`）。マルチプレイヤーキーは `sessionScope: 'thread'` であり、`channel:(threadId||chatId)` にマッピングされるため（`SessionRouter.ts:50-53`）、送信者に関係なくすべてのメンバーが同じ `sessionId` を再利用します。
- **ツールを使用した実際のマルチステージ作業。** 受信メッセージは `ChannelBase.handleInbound()` を介してプロンプトになります。これはメッセージテキスト、返信引用コンテキスト、添付ファイルパス、および（セッションごとに1回）`config.instructions` から `promptText` を構築し（`ChannelBase.ts:316-347`）、`bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` 経由でディスパッチします（`ChannelBase.ts:425` — `promptText` は位置引数。オプションオブジェクトは画像フィールドのみを保持）。
- **作業内容をルームにストリーミング。** アダプタは増分出力をプラットフォームネイティブのカードとしてレンダリングします（Feishu の create/update/finalize、`markdown.ts`。DingTalk のマークダウンチャンキング、`DingtalkAdapter.ts:144-169`）。
- **チャネルを記憶。** `SessionRouter.persist()` / `restoreSessions()` は `sessionId`、ターゲット、および `cwd` を永続的に保存し、再起動をまたいで `bridge.loadSession()` 経由で再ハイドレーションします（`SessionRouter.ts:168-244`）。ワークスペースメモリ（`QWEN.md` / `~/.qwen/QWEN.md`）は `GET` / `POST /workspace/memory` を介して読み書きされます（`workspace-memory.ts`）。このメモリはワークスペース/グローバルスコープであり、ルームごとではありません。ビルドエリア 3 を参照。
- **プロアクティブに、またはスケジュールに従って行動できる。** これはエンドツーエンドでは_まだ_存在しない半分であり、Phase 1 の核心です。

---

## 2. 動機

常駐マルチプレイヤー_応答_エージェントが通常必要とするインフラストラクチャは、すでにこのリポジトリで十分に構築されています。真に欠けている作業は4つのビルドエリアです。

| Tag フォームファクターに必要な機能 | すでに存在するもの（引用） |
| --- | --- |
| 長時間実行、マルチセッションプロセス | `AcpBridge` は長寿命の --acp 子を生成（`AcpBridge.ts:53-70`）。デーモンパスはセッションごとの FIFO `promptQueue` を追加（`bridge.ts:232,2855,3082`） |
| マルチプレイヤー「1ルーム、1セッション」ルーティング | `SessionRouter` の `'thread'` スコープ（`SessionRouter.ts:53`）、チャネルごとのオーバーライド `setChannelScope()`（`SessionRouter.ts:40`） |
| メンションによる呼び出しセマンティクス | `GroupGate` の `requireMention` デフォルト `true`（`GroupGate.ts:49-52`） |
| アクセス制御 + オンボーディング | `SenderGate` の許可リスト + ペアリングコードフロー。グループ→送信者の順でゲートが適用される（`ChannelBase.ts:240-252`） |
| 再起動をまたぐ永続的なセッションマッピング | `SessionRouter` の永続化（`SessionRouter.ts:168-244`） |
| ワークスペースメモリの読み書き | `GET` / `POST /workspace/memory`（`workspace-memory.ts`）。ワークスペース + グローバルスコープのみ。デーモンのみ |
| マルチアクター権限制御 + 監査（デーモンのみ） | `MultiClientPermissionMediator` の `consensus` クォーラムを含む4つのポリシー（`permissionMediator.ts:621-637`）。個別の権限監査リング（`permission-audit.ts`） |
| 認証、レート制限、ループバックの安全性（デーモンのみ） | グローバルベアラートークン（`auth.ts:259-266`）+ `clientId`/IP ごとの段階的レート制限（`rate-limit.ts`） |
| インセッションプッシュプリミティブ（バックグラウンドタスク） | `Session` の通知キュー + `setNotificationCallback()` がバックグラウンドタスク/モニター/シェル出力をオープンセッションに供給（`Session.ts:688-689,2638-2668`）。`isIdle()` がこれを考慮（`Session.ts:777`） |
| プラットフォーム配信（DingTalk + Feishu） | ストリーミングカード、メディア、リアクションを備えた動作するアダプタ（`DingtalkAdapter.ts`, `FeishuAdapter.ts`） |

Phase 1 以降はデーモンの下で実行されるため（コミットされたアーキテクチャ、§1）、上記のデーモンのみの行は、プロアクティブエンジン、メモリ永続化、およびガバナンスのための利用可能な機能となります。単なる「移行した場合のターゲット」ではありません。

§6 で詳細に展開される4つのビルドエリア:

1. **タグを_宣言_するための設定 + ID（Phase 0）。** ドキュメント化された設定レシピ（`sessionScope: 'thread'`、`groupPolicy`、`requireMention`、`instructions`、`dispatchMode`）に加え、**送信者帰属のギャップ**があります。`handleInbound()` は意図的に `senderName` を `promptText` に注入**しません**（`ChannelBase.ts:316-347`。`senderName` は `ChannelBase.ts:246` のアクセス制御にのみ使用されます）。共有 `'thread'` セッションでは、エージェントは_誰が_話しているかを判別できません。Phase 0 は、返信引用コンテキストがすでに行っているのと同じ方法で、送信者マーカーを注入します（`ChannelBase.ts:318`）。
2. **プロアクティブ / 外向き開始エンジン（Phase 1）。** 現在、チャネル境界には**プロアクティブパスが全く存在しません**。`ChannelBase.sendMessage()` は抽象的であり（`ChannelBase.ts:81`）、応答内からのみ呼び出されます。DingTalk では、`sendMessage()` は受信時に `conversationId` ごとにキャッシュされる短命の `sessionWebhook` を介して返信することしかできないため（`DingtalkAdapter.ts:134-142`）、**コールドグループには全くメッセージを送信できません**（`DingtalkAdapter.ts:137-141` は静かにリターンします）。Phase 1 はデーモン常駐スケジューラと DingTalk プロアクティブ送信パスを追加します。
3. **チャネル常駐メモリ + 取得（Phase 2、メモリ半分）。** ワークスペースメモリは**ワークスペースグローバルであり、ルームごとではありません**。`POST /workspace/memory` は `scope: 'workspace' | 'global'` のみを受け付け（`workspace-memory.ts:118-125`）、**厳格な認証ミューテーションルート**です（`deps.mutate({ strict: true })`、`workspace-memory.ts:114`）。「_この_チャネルを記憶する」タグには、ルームごとのメモリ名前空間が必要です。
4. **マルチプレイヤーガバナンス + 安全性（Phase 2、ガバナンス半分）。** 既存の `clientId` レベル（人間 ID レベルではない）の仕組みの上に構築される、グループに適した権限ポリシー、プロアクティブアクションのガードレール、およびフォレンジック監査。

---

## 3. 目標と非目標

### 目標

- **G1 — DingTalk での「タグ」設定のドキュメント化と出荷:** コピー＆ペースト可能な `channels.dingtalk` レシピ（明示的な `sessionScope: 'thread'`、グループ ID がリストされた `groupPolicy: 'allowlist'`、`requireMention: true`、`instructions`、および意図的に選択された `dispatchMode`）により、`parseChannelConfig()` と既存のゲートを再利用して、動作する常駐マルチプレイヤーエージェントを実現します。レシピでは、ルーティングスコープと ACP スコープの違い、およびパーサーのデフォルト `'user'` をオーバーライドする必要があることを明示する必要があります。
- **G2 — 共有セッションでの送信者帰属。** `instructedSessions` によって追跡されるセッションごとの `instructions` 注入を壊すことなく（`ChannelBase.ts:344-346`）、エージェントが `'thread'` スコープのグループで話者を区別できるように、メッセージごとの送信者マーカーを `promptText` に注入します。マーカーは**メッセージごと**（話者はターンごとに変化）であり、`instructedSessions` によってゲーティングされては**なりません**。これには **1つの新しいオプション `Envelope` フィールド `alreadyPrefixed`**（`types.ts`）が必要です。これにより、`collect` モードの合成的な再エントリーで二重プレフィックスが防止されます。§6.1 を参照。（v1 ではこれを「フォーマットのみ、新しいフィールドなし」と誤って記述していました。）
- **G3 — プロアクティブエンジン。** (a) ちょうどメッセージを受信したわけではないチャネルへの出力を開始し、(b) オープンなインタラクティブセッションとは独立したスケジュールで発火し、可能な場合は既存のセッションごとの通知パス（DingTalk プロアクティブ送信 API や永続化された `openConversationId` ストア、定義されたトークンリフレッシュオーナーを含む）を介して配信するメカニズム。両方のトポロジ下で、`ChannelBase.sessionQueues` を介して直列化することで、ACP の 1セッション1プロンプトの不変条件（NG6）を尊重する必要があります（人間のターンを `steer` キャンセルすることは決してありません）。
- **G4 — チャネル常駐メモリ。** 既存の `/workspace/memory` 仕組みと `instructions` メカニズムの上に層状に構築される、ルームごとのメモリ名前空間と取得パス。設計では `writeContextFile.ts` に新しい `channel` スコープ（+`channelKey`）を追加し、**`ChannelBaseOptions` を介して注入される CLI レイヤーのコールバック**（`channel-base → core` の依存関係なし）経由で `channel-base` からアクセスします。
- **G5 — マルチプレイヤーガバナンス。** `MultiClientPermissionMediator` と権限監査リングの上に構築される、グループに適した権限ポリシー、プロアクティブアクションのガードレール、および監査。投票は人間 ID ではなく `clientId` に帰属すること、および単一の共有 `'thread'` セッションではすべてのグループメンバーが_同じ_デーモンクライアントであることを考慮する必要があります。
- **G6 — G1～G5 のすべてに対する Feishu の同等性。** フォローアップとして扱われます。Feishu の安定した `tenant_access_token` はすでに `chatId` だけで任意のチャットへのプロアクティブ送信をサポートしているため（`FeishuAdapter.ts:622-651`）、Feishu は G3 に対して新しい送信 API を_必要としません_。デーモンレベルのウェイク/スケジューリングメカニズムのみが必要です。Feishu は `canColdSend = true` を宣言します。
- **G7 — 再発明よりも再利用。** すべてのビルドエリアは、並列サブシステムを導入するのではなく、既存のメカニズム（ゲート、ルーター、ブリッジ、メディエータ、メモリルート、インセッション通知パス、cron）を拡張します。
### 非目標

- **NG1 — ホスト型マルチテナント SaaS ではない。** 「qwen tag」は **1つ** のワークスペースにバインドされた 1 つのエージェントプロセスです (`serve.ts:165-171`。マルチワークスペース = 別ポート上のワークスペースごとに 1 つのデーモン)。中央制御プレーンはありません。
- **NG2 — 本 RFC には、人間ごとの ID、課金、またはコスト予算は含まれない。** デーモンの ID モデルは **単一のグローバル Bearer トークン** (`auth.ts:259-266`) と、イベントバスおよび権限監査全体での `clientId` レベルの属性です。プロンプトに送信者 _マーカー_ (G2) を追加しますが、認証されたユーザーごとのプリンシパル、ユーザーごとのクォータ、またはコスト追跡は導入 **しません**。送信者マーカーはアドバイザリプロンプトテキストであり、認証境界ではありません。すべてのグループメンバーはデーモンの単一のワークスペース資格情報を共有し、共有 `'thread'` セッションでは _同じ_ デーモン `clientId` になります。
- **NG3 — フェーズ 3 のマルチ ID ゲートウェイは対象外** です。ここでは将来の参照としてのみ言及しています。本 RFC はフェーズ 0～2 を対象とします。
- **NG4 — Feishu は二次的なものであり、主要なものではない。** DingTalk はリファレンス実装であり、すべての動作例のソースです。
- **NG5 — Slack およびその他の欧米のプラットフォームは対象外。** 登録されているチャネルタイプは `telegram`、`weixin`、`dingtalk`、`feishu`、`qq` (`channel-registry.ts:10-14`) であり、Slack アダプターは存在しません。
- **NG6 — ACP の 1 セッション 1 プロンプトという不変条件は変更しない。** スケジュールされた/プロアクティブなプロンプトは、チャネルの `sessionQueues` への単なる別のエントリに過ぎません。同じセッションのユーザーターンと並行して実行したり、キャンセルしたりすることはできません。
- **NG7 — 新しいチャットスコープのメモリストアエンジンは導入しない。** チャネル常駐メモリ (G4) は、既存のファイルベースの `QWEN.md`/`AGENTS.md` ファイルに _名前空間_ を重ねるレイヤーであり、ベクター DB やルームごとのデータベースは使用しません。

---

## 4. 現状評価

構築済み (B)、一部 (P)、未実装 (M)。「File」は正式なシンボルを記載しています。「Topology」は、その機能が `AcpBridge` チャネルパス (A)、`qwen serve` デーモンパス (D)、またはその両方のいずれに存在するかを示します。また、フェーズ 1 以降はデーモン下での実行が確約されているため、機能のロックを解除するのが移行である場合に「→D」という注記を付けます。

| 機能                             | 現在の qwen-code (ファイル / シンボル)                                                                    | トポロジー                              | ギャップ                                                                                                                                                                           | サイズ              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1 ルーム 1 セッションルーティング           | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`)                                 | A+D                                   | デフォルトスコープは `'user'` (`config-utils.ts:91-92`) です。オペレーターは `'thread'` を設定する必要があります                                                                                             | 設定 (S)        |
| メンションによる呼び出し                      | `GroupGate.requireMention` デフォルト `true` (`GroupGate.ts:49-52`)                                   | A+D                                   | なし — すでに正しい                                                                                                                                                        | —                 |
| アクセス制御 / オンボーディング            | `SenderGate` 許可リスト + ペアリング (`ChannelBase.ts:240-252`)                                        | A+D                                   | なし                                                                                                                                                                          | —                 |
| 永続セッションマッピング                | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`)                             | A+D                                   | なし                                                                                                                                                                          | —                 |
| **プロンプト内の送信者属性**       | `handleInbound()` は `senderName` なしで promptText を構築 (`ChannelBase.ts:316-347`)                    | A+D                                   | `senderName` が注入されないため、エージェントは誰が発言したか判別できません。新しい `Envelope.alreadyPrefixed` が必要です                                                                                 | コード (S)          |
| プロンプトの直列化                   | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`); デーモン `promptQueue` (`bridge.ts:2855`)  | A (チャネル) / D (デーモン)              | `DaemonChannelBridge.prompt()` は重複時にスロー (`:257-261`) します。プロアクティブエンジンはチャネル側で直列化する必要があります。`dispatchMode` のデフォルト `'steer'` はピアをキャンセルします (`:354,371-379`) | 設定 + コード (S) |
| **送信開始 / プロアクティブ送信** | `ChannelBase.sendMessage()` 抽象 (`:81`); DingTalk webhook のみ (`DingtalkAdapter.ts:134-142`) | A+D                                   | プロアクティブな継ぎ目がありません。DingTalk のコールドグループにはメッセージを送信できません。`canColdSend` 機能フラグが必要です                                                                                    | コード (L)          |
| **デーモンレベルスケジューラー**             | Cron はセッションスコープ (`Session.ts:667-668`) であり、`dispose()` で終了 (`:790-812`)                    | A+D (ゲートウェイ) → D (監査/キュー再利用) | `serve/` または `channels/` にデーモンスケジューラーエンドポイントがありません。ゲートウェイスケジューラーが唯一のオーナーです (OD-8)                                                                               | コード (L)          |
| セッション内プッシュプリミティブ              | `setNotificationCallback` (`Session.ts:2638-2668`)                                                 | A+D                                   | ライブセッションにのみ配信されます。回収されたセッションを起動することはできません                                                                                                                  | (再利用)           |
| **ルームごとのメモリ**                    | `/workspace/memory` は `workspace\|global` をスコープ化 (`workspace-memory.ts:118-125`)                     | D のみ                                | チャット/チャネルスコープがありません。新しい `channel` スコープ + CLI レイヤーコールバック (コア依存なし)                                                                                                 | コード (M)          |
| マルチアクター権限投票          | `MultiClientPermissionMediator` 4 ポリシー (`permissionMediator.ts:621-637`)                       | D (フェーズ 1+ から継承)                | `AcpBridge` は自動承認します (`AcpBridge.ts:108-118`)。投票は `clientId` ごとであり、1 チャネルにつき 1 クライアントです                                                                          | コード (L)          |
| 監査証跡                            | `PermissionAuditRing` FIFO 512 (`permission-audit.ts`)                                             | D + チャネル側リング                 | 人間の `senderId` がありません。インメモリであり、再起動で失われます。`~/.qwen` への追記専用のフォローアップ                                                                                              | コード (M)          |
| **トークン / コスト予算**                | なし (レート制限はリクエスト数のみ、`rate-limit.ts`)                                           | チャネル側レジャー + D 使用量         | 支出メーターがありません。v1 は見積もり (アドバイザリ) であり、実際のデビットはデーモンホスト時のみです                                                                                                   | コード (M)          |
| チャネルごとのツール/MCP スコープ             | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); MCP 許可フィルター (`:3327-3333`)   | `Config` ごと                          | チャネルから `--acp` 子 (AcpBridge) への spawn-arg パスがありません。ホスト後はデーモンごとの `Config` になります                                                                                  | コード (M)          |
| DingTalk プロアクティブ送信                | 未実装 (`robot/emotion`、`messageFiles/download` のみ)                                    | A+D                                   | 新しいエンドポイント + 永続化された `openConversationId` + トークン更新 (検証済みコントラクト、§6.2)                                                                                       | コード (L)          |
| Feishu プロアクティブ送信                  | `tenant_access_token` 経由の `sendMessage()` (`FeishuAdapter.ts:622-676`)                            | A+D                                   | なし — `canColdSend = true`                                                                                                                                                   | —                 |

サイズの凡例: S = 設定/小規模なコード、M = モジュール + インターフェースの変更、L = 複数パッケージの変更または新しいサブシステム。

---

## 5. アーキテクチャ

`qwen tag` は **新しいランタイムではありません**。既存のアダプタースタックに接ぎ木された 4 つの薄いレイヤーです。ベースレイヤーはすでに、チャットチャネル経由でアクセス可能な、マルチプレイヤー対応、ツール実行、MCP 搭載のエージェントを提供しています。4 つの新しいレイヤーはギャップに 1:1 でマッピングされます。(1) **誰が話しているか** — 送信者 ID がプロンプトに到達しない。(2) **プロンプトなしで行動する** — 送信開始パスがなく、セッション内 cron はセッションとともに終了する。(3) **チャネルを記憶する** — メモリはワークスペースグローバルである。(4) **共有ブレインを管理する** — 認証は 1 つのグローバルトークンであり、チャネルごとの予算はない。

以下の各レイヤーは、どのトポロジーを想定しているかを明記しています (§1 を参照)。**確約された分割**: フェーズ 0 は `AcpBridge` 上。フェーズ 1 以降は `DaemonChannelBridge` を介した `qwen serve` デーモン上。

### ベースレイヤー (既存) — `qwen channel start` トポロジー (フェーズ 0)

```
                              one host, one workspace
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk                                                   │
│                                                                                │
│  ┌────────────────────┐    Envelope     ┌───────────────────────────────────┐ │
│  │ DingtalkAdapter     │ ──────────────▶ │ ChannelBase.handleInbound()       │ │
│  │ (stream client,     │                 │  1 GroupGate.check (mention/      │ │
│  │  webhooks map by     │ ◀────────────── │    policy/allowlist)             │ │
│  │  conversationId)     │   text/markdown │  2 SenderGate.check (pairing)    │ │
│  │  sendMessage()       │                 │  3 slash / "!" commands          │ │
│  └────────────────────┘                 │  4 router.resolve(...)           │ │
│        ▲  sessionWebhook (expires,       │  5 dispatchMode (steer default)  │ │
│        │  per inbound msg only)          └───────────────┬───────────────────┘ │
│        │                                                 │ sessionId            │
│        │                                ┌────────────────▼──────────────────┐ │
│        │                                │ SessionRouter                      │ │
│        │                                │  routingKey(): user|thread|single  │ │
│        │                                │  persist() → JSON (crash recovery)  │ │
│        │                                └────────────────┬──────────────────┘ │
│        │   textChunk / toolCall events  ┌────────────────▼──────────────────┐ │
│        └─────────────────────────────── │ AcpBridge (NOT the HTTP daemon)    │ │
│                                         │  spawns child `node <cli> --acp`   │ │
│                                         │  ClientSideConnection over stdio    │ │
│                                         │  requestPermission AUTO-APPROVES    │ │
│                                         └────────────────┬──────────────────┘ │
└──────────────────────────────────────────────────────────┼─────────────────────┘
                                                             │ ACP / NDJSON (stdio)
                                          ┌──────────────────▼─────────────────────┐
                                          │ child agent process (`--acp`)           │
                                          │  one prompt-in-flight per ACP session   │
                                          │  in-session cron (Session.ts) — DISABLED│
                                          │  for tag sessions (OD-8); MCP, tools.   │
                                          │  NO promptQueue/eventBus/mediator       │
                                          └─────────────────────────────────────────┘
```

### デーモンホストトポロジー (フェーズ 1+) — `qwen serve` + `DaemonChannelBridge`

```
                              one host, one workspace, ONE daemon
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk  (channels hosted IN the daemon)                  │
│  ┌────────────────────┐  Envelope   ┌────────────────────────────────────────┐│
│  │ DingtalkAdapter     │ ──────────▶ │ ChannelBase.handleInbound()            ││
│  │ pushProactive()     │ ◀────────── │  gates → governor.admit → router       ││
│  │ canColdSend = false*│             │  → sessionQueues (FIFO, serialization)  ││
│  └────────────────────┘             └───────────────┬────────────────────────┘│
│         ▲ proactive group-send                       │ bridge.prompt()          │
│         │ (openConversationId)        ┌───────────────▼────────────────────────┐│
│  ┌──────┴────────────┐               │ DaemonChannelBridge                      ││
│  │ ChannelCronSched   │──fire────────▶│  prompt() THROWS on overlap (:257-261)  ││
│  │ (gateway-owned,    │ dispatchProa- │  → so all prompts MUST arrive serialized││
│  │  sole cron owner)  │ ctive via     │     via sessionQueues                   ││
│  └────────────────────┘ sessionQueues └───────────────┬────────────────────────┘│
│                                                        │ in-process Session       │
│                                       ┌────────────────▼────────────────────────┐│
│                                       │ daemon: acp-bridge FIFO promptQueue,     ││
│                                       │  MultiClientPermissionMediator, eventBus, ││
│                                       │  /workspace/memory + /channel routes,     ││
│                                       │  rate-limit, bearer auth                  ││
│                                       └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
* DingTalk canColdSend flips true once the proactive-send path ships (§6.2).
```

私たちが構築する重要な不変条件 (検証済み):

- **スレッドスコープがマルチプレイヤーの鍵。** `routingKey()` は `'thread'` 下で `${channelName}:${threadId || chatId}` を返します (`SessionRouter.ts:53`)。`resolve()` はキーを再利用します (`:79-83`)。デフォルトスコープは `'user'` (`:25`) です。`qwen channel start` は、マルチチャネルパスでは `router.setChannelScope(name, config.sessionScope)` (`start.ts:361-362`) を介して、シングルチャネルパスでは `config.sessionScope` からの `ChannelBase` コンストラクタ (`ChannelBase.ts:62-64`) を介して、チャネルごとのスコープを設定します。**マルチプレイヤーには、オペレーターが `sessionScope: "thread"` を設定する必要があります。**
- **プロンプトの直列化。** `AcpBridge` では、`newSession(cwd)` は `cwd` のみを受け取り (`AcpBridge.ts:131`)、`AcpBridge.prompt()` には同時実行ガードがありません。直列化は `ChannelBase` の `dispatchMode` によります。`collect` はバッファリング (`:361-370,445-463`)、`steer` は実行中のプロンプトをキャンセル (`:371-379`)、`followup` は `sessionQueues` にチェーン (`:381-383,394-470`) します。**ランタイムのデフォルトは `'steer'`** (`:354`) です。`types.ts:42` の JSDoc は `'collect'` と言っていますが — **古い情報です。v2 では `'steer'` に修正されます (OD-5)。** デーモンパスでは、`DaemonChannelBridge.prompt()` は重複時に **スロー** します (`:257-261`)。デーモンの FIFO `promptQueue` (`bridge.ts:2855,3082`) はそのスローガードの _背後_ に存在します。結果 (§6.2 にとって重要): すべてのプロンプト (人間とプロアクティブの両方) は、`ChannelBase.sessionQueues` によってすでに直列化された状態で `bridge.prompt()` に到達する必要があります。
- **`sendMessage` は抽象メソッド。** `ChannelBase.sendMessage()` は `abstract` (`:81`) です。`DingtalkAdapter.sendMessage()` (`:134-170`) は、受信時にのみキャッシュされ (`:516-517`)、有効期限が切れる `conversationId` ごとの `sessionWebhook` 経由で送信します。コールドグループにはキャッシュされた webhook がないため、呼び出しは **サイレントに return** します (`:137-141`)。
- **フェーズ 1 以降で継承されるデーモン不変条件。** チャネルが `qwen serve` 下でホストされると (確約済み、§1)、`MultiClientPermissionMediator` (`permissionMediator.ts:621-637`)、`eventBus` リプレイリング (`eventBus.ts:92`)、`SessionEntry` ごとの `promptQueue` FIFO (`bridge.ts:2855-3082`) が利用可能になります。

### 4 つの新しいレイヤー

```
            ┌───────────── governance (Layer 4) ─────────────┐
            │  per-channel turn/cost budget gate              │
            │  proactive allowlist, quiet hours, kill switch  │
            └───────────────────────┬─────────────────────────┘
                                     │ wraps all inbound + outbound
 inbound  ┌──────────────────────────▼─────────────────────────┐  outbound
 ───────▶ │  identity injection (Layer 1)                       │ ────────▶
          │  prefix promptText with speaker + channel context   │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  channel memory (Layer 3)                           │
          │  per-channel fragment, injected at session start;    │
          │  persisted via CLI-layer callback (core helper)      │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  proactive engine (Layer 2)                         │
          │  gateway scheduler → sessionQueues → bridge.prompt → │
          │  channel.pushProactive() w/ cold-group fallback      │
          └─────────────────────────────────────────────────────┘
```

**レイヤー 1 — ID の注入。** _トポロジー: 両方。デーモンは不要。_ `handleInbound()` は `senderName` を `promptText` に入れません (`ChannelBase.ts:246` は `SenderGate.check()` 用にのみ読み取り。`Envelope.senderName` は `types.ts:69` に存在)。設計: `handleInbound()` 内の `referencedText` プレフィックス (`:316-319`) の後に、設定でゲートされた 1 つの注入ポイント。`envelope.isGroup` でゲートされ、`collect` の再エントリー用に新しい `Envelope.alreadyPrefixed` フラグを追加。詳細は §6.1。

**レイヤー 2 — プロアクティブエンジン。** _トポロジー: ゲートウェイ所有のスケジューラー、移行中立。フェーズ 1 以降はデーモン下で実行。_ セッション内 cron は `dispose()` で終了 (`Session.ts:790-803`)。デーモンスケジューラーエンドポイントはありません。`DingtalkAdapter.sendMessage()` はコールドグループに到達できません (`:137-141`)。設計: `ChannelBase.sessionQueues` (`steer` ではなく) を介して fire を注入し、完了を `channel.pushProactive()` にルーティングするゲートウェイ常駐スケジューラー。詳細は §6.2。

**レイヤー 3 — チャネルメモリ。** _トポロジー: CLI レイヤーコールバックによる永続化パス。注入はチャネル側。_ メモリはワークスペースグローバルのみ (`workspace-memory.ts:86-303`)。設計: セッション開始時に注入されるチャネルごとのメモリフラグメント (1 セッション 1 回の `instructions` ゲートを再利用) と、書き込みパス上の新しい `channel` スコープ。`channel-base` から注入コールバックを介して到達 (コア依存なし)。詳細は §6.3。

**レイヤー 4 — ガバナンス。** _トポロジー: ゲートラッパーはチャネル側。レートリミッターはフェーズ 1 以降デーモン側。_ デーモンは 1 つのグローバル Bearer トークン (`auth.ts:259-266`)、`clientId`/IP ごとのレート制限を持ち、チャネルごとの予算はありません。設計: `handleInbound()` とスケジューラーをラップする `ChannelGovernor`/`BudgetLedger`。詳細は §6.4。
### データフロー 1 — グループスレッドでの `@qwen` 受信

このフローの形状はどちらのトポロジーでも同一であり、唯一の違いはシリアライゼーションと権限がどこに存在するかだけです。`AcpBridge`（Phase 0）では、シリアライゼーションは `ChannelBase.sessionQueues` であり、権限は子プロセスによって自動承認されます。デーモン（Phase 1+）では、シリアライゼーションは引き続き `ChannelBase.sessionQueues` であり（チャネルレイヤーですでにシリアライズされているため、デーモンのスローガードがトリガーされることはありません）、権限は `MultiClientPermissionMediator` を介してフローします。

1. **DingTalk → アダプター。** メンバーが「@qwen summarize today's incidents」と投稿します。ストリームクライアントは、`conversationId`、`sessionWebhook`、sender、`isInAtList` を含む `DingTalkMessageData` を配信します。`DingtalkAdapter` は `webhooks.set(conversationId, sessionWebhook)` をキャッシュし（`:516-517`）、`isGroup:true`、`isMentioned:true`、`chatId = conversationId` を持つ `Envelope` を発行します。
2. **Governor (L4)。** `ChannelGovernor`/`BudgetLedger.admit()` は、チャネルのターン/コスト予算（実際の使用量が利用可能になるまでアドバイザリ、§6.4）およびキルスイッチをチェックします。ハードキル/実際の数値による明示的なキャップ → 拒否して返信。見積もりのみが閾値を超えた場合 → WARN であり、ハード拒否はしません（Fix #6）。
3. **Gates。** `GroupGate.check()` はパスします（メンションがデフォルトの `requireMention:true` を満たすため）。`SenderGate.check()` もパスします（`:246`）。
4. **Routing。** `router.resolve(...)` は `'thread'` スコープ下で `dingtalk:<conversationId>` を計算し（**`sessionScope:"thread"` が必要**）、共有グループの `sessionId` を返します。`persist()` がこれを記録します。
5. **Memory (L3) + identity (L1)。** 最初のターンでは、チャネルごとのメモリと `config.instructions` が一度だけ先頭に追加されます（`instructedSessions`、`:344-347`）。ID 注入は、メッセージごとに `[Alice]` を先頭に追加します。
6. **Attribution capture。** 解決された `senderId`/`senderName` は、後からタイムスタンプで結合されるのではなく、`sessionQueues` に運ばれる**キューアイテム上**に記録されます（Fix #7）。
7. **Dispatch。** タグプロファイルは `followup` を設定します（`steer` にはしません）。Bob の同時実行メッセージは `sessionQueues` にチェーンされます（`:394-470`）。
8. **Bridge。** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` は、stdio ACP（`AcpBridge.prompt`、`AcpBridge.ts:147`）経由またはデーモンセッション（`DaemonChannelBridge.prompt`）に転送されます。これは前のターンで `activePrompts` が排出された場合にのみ到達するため、デーモンのスローガード（`:257-261`）がトリガーされることはありません。
9. **Stream back。** `textChunk` → `onChunk`（`:416-422`）。`onResponseComplete` → `DingtalkAdapter.sendMessage()` はキャッシュされた `sessionWebhook` を使用します（ウォームグループ）。

### データフロー 2 — コールドグループへのスケジュールされたプロアクティブプッシュ

1. **Schedule fires。** ゲートウェイに常駐する `ChannelCronScheduler` が、`daily-standup → dingtalk:<convA>` のために 09:00 に起動します。セッション内 cron ではありません（タグセッションでは無効、OD-8/§6.2。また、セッションがリープされるといずれにせよ停止します。`dispose()` が `cronQueue` をクリアします、`Session.ts:790-803`）。
2. **Governor (L4)。** プロアクティブ許可リストと静寂時間（明示的なタイムゾーンソース）をチェックします。ウィンドウ外/許可リストにない場合 → スキップしてログに記録。スケジューラーは配信を試みる前に `adapter.canColdSend` を検証します。false の場合、**フェイルラウド**（ログ記録 + `lastError` の記録）し、サイレントに no-op することはありません（Fix #4）。
3. **Synthetic envelope。** `senderId:'__cron__'`、`chatId: convA`、`isGroup:true`、`isMentioned:true`、`messageId` なし。合成プロンプトは、キューアイテム上に独自の属性（`createdBy`）を保持します。
4. **Serialize, never preempt。** `dispatchProactive` は `ChannelBase.sessionQueues` にチェーンされ、実行中の人間のターン（`activePrompts.get(sessionId)?.done`）を待機します。`steer`/`cancelSession` を**決して**呼び出さず、`activePrompts` が保持されている間に `bridge.prompt()` を**決して**呼び出しません。そのため、デーモンの `Prompt already in flight` スロー（`:257-261`）が発生することはありません（§6.2、Fix #1）。
5. **Cold-group send。** `pushProactive(convA, text)` は `webhooks.get(convA)` が undefined であることを検出し、新しいプロアクティブパスにフォールバックします。これは、永続化された `openConversationId`、新しいアプリ認証トークン、`robotCode = config.clientId`、`msgKey:'sampleMarkdown'`、`msgParam`（JSON _文字列_）を使用して `https://api.dingtalk.com/v1.0/robot/groupMessages/send` に POST するものです。（Feishu の場合、ステップ 5 は `tenant_access_token` 経由の既存の `sendMessage()` であり、`canColdSend = true` です。）
6. **Budget + audit。** プロアクティブターンはチャネルの予算バケットを消費します（デーモンホストの使用量が利用可能になるまでアドバイザリデビット）。発信元 ID としての `createdBy` と、トランスポートレベルでの `originatorClientId` を使用して記録されます（人間の ID は発明されません、`eventBus.ts:60`）。

### なぜこの形状なのか（発明より再利用）

すべての新しいレイヤーは既存の継ぎ目にアタッチされます。ID は `promptText` ビルドサイト、プロアクティブは `sessionQueues` + `pushProactive()`、メモリは `instructions`/`writeContextFile` メカニズム、ガバナンスはゲートチェーンのラッパーです。唯一の構造的前提条件であるレイヤー 2～4 によるデーモンメカニズムの再利用は、コミットされたデーモン移行（§1）によって満たされます。Phase 0 は `AcpBridge` で出荷され、Phase 1+ は `qwen serve` の下で実行されます。

---

## 6. 詳細設計

### 6.1 マルチプレイヤーと ID（ビルドエリア 1）

「qwen タグ」はグループチャットに存在します。すべてのメンバーは同じエージェントと会話します。このエージェントは、(a) チャネル全体で 1 つの共有会話を維持し、(b) 各ターンで誰が話しているかを把握し、(c) あるメンバーのメッセージが別のメンバーの実行中タスクを破壊しないようにし、(d) 理想的にはリスクの高いツール呼び出しについてグループに承認を求める必要があります。qwen-code には現在 (a)～(c) のプリミティブが備わっています。(d) はデーモンホストの Phase-1+ の作業です（コミットされた移行、§1）。

#### グループ共有セッション: `sessionScope: 'thread'`

`'thread'` の下では、ルーティングキーから `senderId` が除外されるため、すべてのメンバーが 1 つの `sessionId` に解決されます（`SessionRouter.ts:53,72-92`）。これにより、エージェントは N 個のプライベートボットではなく、共有のチャネル常駐エンティティとなります。

- **グローバルな切り替えではなく、チャネルごとのスコープ。** ルーターのデフォルトは `'user'`（`:25`）であり、チャネル設定のデフォルトも `'user'` です（`config-utils.ts:91-92`）。DM と単一ユーザーチャネルは `'user'` のままです。タグプロファイルは `settings.json` で `sessionScope: 'thread'` を設定し、`setChannelScope()`（マルチチャネル、`start.ts:361-362`）または `ChannelBase` コンストラクタ（単一チャネル、`ChannelBase.ts:62-64`）を介してチャネルごとに適用します。
- **DingTalk の `threadId`/`chatId` の安定性。** DingTalk アダプターは `Envelope.threadId` を決して設定しません（`DingtalkAdapter.ts:541-551`）。そのため、`routingKey()` は `threadId || chatId` のフォールバックとして `chatId` を取り、グループを `chatId` ごとに 1 つのセッションに折りたたみます（これが望ましい動作です）。**注意:** `chatId = conversationId || sessionWebhook`（`:534`）。実際のグループメッセージには `conversationId` が存在し、安定しています。もしそれがなくメッセージが到着した場合、`chatId` は**期限切れになる** `sessionWebhook` URL にフォールバックし、スレッドキーが不安定になります。プロファイルは、欠落した `conversationId` をハードエラー（メッセージのドロップ）として扱い、サイレントに webhook をキーにすることはありません。

永続化はクラッシュリカバリーをカバーします（`SessionRouter.ts:168-244`）。デーモンの再起動により、`bridge.loadSession()` を介してグループが同じ共有セッションに再アタッチされます。

#### 新しい危険性: スレッドスコープの `/clear` と `/status` はチャネル全体に及ぶ

共有 `/clear` ハンドラは `router.removeSession(this.name, senderId, chatId)` を呼び出し（`ChannelBase.ts:147-152`）、`/status` は `router.hasSession(...)` を呼び出します（`:203-208`）。どちらも `routingKey()` を介してルーティングされ、これは `'thread'` の下で `senderId` を無視します。そのため、単一のメンバーによる `/clear` でチャネル全体の共有セッションが消去され、`instructedSessions` がリセットされます。これはワンタップで全員をリセットしてしまう踏抜地雷です。

**解決済み (OD-4):** 共有（スレッド）グループでは、`/clear`（およびそのエイリアス）には明示的な `confirm` トークンが必要であり、そのリストが設定されている場合は `config.allowedUsers` に制限されます。それ以外の場合は直接クリアされます（DM とユーザーごとのグループは呼び出し元自身のセッションにのみ触れるため、ゲートは不要です）。スラッシュパーサーは `[a-zA-Z0-9_]` のみを受け付けるため（ハイフン区切りの `/clear-channel` は `clear` + 引数 `-channel` としてパースされます）、コマンド名は `/clear` のままです。明示的な `confirm` が破壊的なキューとなります。真のメンバーごとのオーナーゲート（チャット許可リストとは無関係に管理者とメンバーを区別する）は、ID モデル（OD-3/OD-11）を待っています。**`/status` は共有セッション上で読み取り専用のままです。**

#### 送信者属性のギャップとその修正

`handleInbound()` は、`envelope.text`、`referencedText` 引用プレフィックス、添付ファイルパス、およびセッションごとに 1 回の `config.instructions` から `promptText` を構築します（`ChannelBase.ts:315-347`）。`envelope.senderName` は `SenderGate.check()`（`:246`）でのみ読み取られます。`'thread'` グループでは、エージェントは区別のないストリームを見ます。

**修正 (OD-6) — グループターンの先頭に `[senderName]` プレフィックスを追加。プロンプト構築の先頭（`:315-316`）で、すべてのターンに対して:**

```ts
let promptText = envelope.text;

// Multiplayer attribution: in a thread-shared session, tag each turn with the
// speaker. Skip 1:1 sessions (sender is invariant). Must fire EVERY turn —
// not gated by instructedSessions (the speaker changes each message). The
// alreadyPrefixed flag lets collect-mode synthetic re-entry skip this step.
if (envelope.isGroup && !envelope.alreadyPrefixed) {
  const who = envelope.senderName || envelope.senderId || 'unknown';
  promptText = `[${who}] ${promptText}`;
}

if (envelope.referencedText) {
  promptText = `[Replying to: "${envelope.referencedText}"]\n\n${promptText}`;
}
```

- **`envelope.isGroup`（`types.ts:75`）でゲートし、スコープでは行いません。**
- **`referencedText` の前にプレフィックスを付け、順序が `[Alice] [Replying to: "..."] <text>` となるようにします。**
- **`senderId` ではなく `senderName` を使用します。** DingTalk では `senderName = data.senderNick || 'Unknown'`（`DingtalkAdapter.ts:544`）であり、空になることはありません。`senderId → 'unknown'` のチェーンは防御的です。
- **`collect` モードの二重プレフィックスの危険性は、1 つの新しいフィールドで解決されます。** 統合された再入力は、すでにプレフィックスが付けられた統合文字列を `text` とする `syntheticEnvelope` を構築し、`handleInbound()` に再入力します（`:449-462`）。これにより、プレフィックスが**再度**先頭に追加されてしまいます。**v2 では、1 つの新しいオプションの `Envelope` フィールド `alreadyPrefixed?: boolean`（`types.ts`）を追加します**。`collect` 合成エンベロープはこれを `true` に設定し、上記のプレフィックスステップはこれが設定されている場合にスキップします。（これは、「フォーマットのみで新しいエンベロープフィールドはない」という v1 の主張を修正するものです — Fix #2。これはこの RFC が導入する唯一の新しいエンベロープフィールドであり、bridge/ACP プロトコルは変更されません。）

#### グループデフォルト `dispatchMode`: `steer` → `followup`

`steer`（ランタイムデフォルト、`:354`）は、`bridge.cancelSession()` を介して実行中のプロンプトをキャンセルします（`:371-379`）。共有グループでは、エージェントが Alice のリクエストを処理している間に Bob が何かを送信すると、`steer` は **Alice のタスクをキャンセル**してしまいます。これは偶然によるサービス拒否です。**タグプロファイルは `dispatchMode: 'followup'` を設定**し、Bob のメッセージが Alice のタスクの後ろにキューイングされるようにします（`sessionQueues` FIFO、`:381-383,394-470`）。グローバルデフォルトを切り替えるのではなく、グループプロファイル（`groups["*"].dispatchMode = "followup"`）で設定します。DM は `steer` のセルフインタラプト UX を維持します。文書化されたプロファイルデフォルト以外のコード変更は不要です。v2 では、コードとコメントが一致するように、古い `types.ts:42` の JSDoc を `'steer'` に**修正**します（OD-5）。`collect` は、属性のぼやけを代償として、非常にトラフィックの多いグループ（キューの深さを制限）で許容されます。

タグプロファイルはグループに対して**常に `followup`（`steer` にはしない）**であるため、プロアクティブエンジンはクリーンな不変条件を継承します。タググループ内のいかなるパスも実行中のプロンプトをキャンセルしないため、`steer` 対プロアクティブのレースは存在しません。この不変条件は §6.2 で再述され、強制されます。

#### ハンドオフ — 「最後の人が中断したところから引き継ぐ」

`'thread'` + `[senderName]` プレフィックス + `followup` により、ハンドオフはデフォルトの動作となります。セッションは完全なマルチスピーカーの履歴を保持します。2 つのエルゴノミックな追加機能があります。アクティブな `sessionId`/`cwd`/タスクの要約を報告する読み取り専用の **`/who`** コマンド（`protected registerCommand(name, handler)` 経由、`:141-143` — プライベートな `commands` マップではありません）。および、再起動時の冪等な再アタッチ（すでに `restoreSessions()` でカバーされています）。

#### 複数メンバーの承認 — フェージング（OD-3、決定済み）

意図は正しいです。リスクの高いツール呼び出しはグループで承認可能であるべきであり、qwen-code には 4 つのポリシーを持つ `MultiClientPermissionMediator` が同梱されています（`permissionMediator.ts:348,621-637`）。**しかし**、Phase-0 の `AcpBridge` パスでは、チャネルからこれらに到達することはできません。

1. `qwen channel start` は `AcpBridge` を配線し、その `requestPermission` はすべてのリクエストを自動承認します（`AcpBridge.ts:108-118`）。承認プロンプトは全くありません。
2. メディエーターはデーモンの HTTP サーブレーヤーに存在します。権限に対応している唯一のチャネルブリッジは `DaemonChannelBridge`（`respondToPermission`、`:346-374`）であり、これは Phase 1 でチャネルホスティングがデーモンに移行された場合に到達します（コミット済み、§1）。
3. `config.approvalMode` は**死んだフィールド**です。パースされ（`config-utils.ts:94`）、型付けされています（`types.ts:36`）が、どのアダプターやブリッジからも読み取られません。

**決定されたフェージング:**

- **Phase 0:** グループ承認なし。送信者許可リスト + `requireMention` + 保守的なエージェントツールセットでリスクをゲートします。`approvalMode` が何か機能すると主張しないでください。
- **Phase 1:** チャネルはデーモンブリッジパスで実行されます（コミットされた移行）。`permission_request` を DingTalk カードとして表面化します。**単一のチャネルレベル `clientId` を持つ `first-responder` を出荷します**（許可されたメンバーのいずれかのタップで解決されます。チャネルの粒度で属性を付与）。`senderId → clientId` マップは不要です。プロアクティブターンでの高风险ツールの自動拒否（`__cron__` 発信のターンは権限プロンプトに回答できません）。
- **Phase 2:** `senderId → clientId` マッピングと `clientId` ライフサイクル（リーピング、参照カウント境界）が存在するようになったら、メンバーごとの `consensus`/`designated` を追加します。注意: `senderId` ごとに 1 つの合成 `clientId` は `clientIds` 参照カウントマップを無制限に増加させるため、リーピングする必要があります。

#### 具体的な変更の概要（ビルドエリア 1）

| 変更                                                                  | 場所                                                    | タイプ          |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| グループプロファイルが `sessionScope: 'thread'` を設定                             | `settings.json` + `setChannelScope` (`start.ts:359-363`) | 設定        |
| 欠落した DingTalk `conversationId` をエラーとして扱う                        | `DingtalkAdapter.ts` ~`:534`                             | コード (S)      |
| グループターンの `[senderName]` プレフィックス                                   | `ChannelBase.handleInbound` ~`:316`                      | コード (S)      |
| 新しいオプションの `Envelope.alreadyPrefixed` フィールド                           | `types.ts` (Envelope)                                    | コード (S)      |
| `collect` 合成再入力時に `alreadyPrefixed` を設定                   | `ChannelBase.ts:449-462`                                 | コード (S)      |
| 共有グループでの `/clear confirm` + 許可リストゲート。`/status` は読み取り専用 | 共有コマンド (`:147-217`)                             | コード (S)      |
| グループプロファイルが `dispatchMode: 'followup'` を設定                           | `settings.json` の `groups["*"]`                         | 設定        |
| 古い `dispatchMode` JSDoc を `'steer'` に修正                              | `types.ts:42`                                            | コメント修正   |
| `/who` ハンドオフコマンド                                                  | `registerCommand` (`:141`)                               | コード (S)      |
| デーモンブリッジ移行が `AcpBridge` の自動承認を置き換え               | `DaemonChannelBridge` ホスティング（コミット済み）                | Phase 1 (L)   |
| メンバーごとの承認投票 + DingTalk カード                              | 新しいブリッジ配管 + `respondToPermission`              | Phase 1/2 (L) |

### 6.2 プロアクティブエンジン: スケジューラー + アウトバウンドプッシュ（コア）

#### 決定: ゲートウェイ所有のスケジューラー、移行ニュートラル

**`qwen channel start` ゲートウェイプロセスに存在するスケジューラーを採用します。** ゲートウェイは `SessionRouter`（`restoreSessions()` リカバリー付き — `start.ts:275,444`）を所有し、すべてのアダプターインスタンスとそのブリッジを保持し、`ChannelBase.pushProactive()`（および基盤となる抽象 `sendMessage()`、`:81`）を呼び出すことができる唯一の場所です。エージェント（Phase 0 で生成された `--acp` 子プロセスか、Phase 1+ のデーモンセッションかにかかわらず）は純粋なプロンプト実行エンジンのままです。スケジューラーは `ChannelBase.sessionQueues` にエンキューすることで発火し、前のターンが排出された後にのみ `bridge.prompt()` を呼び出します。**新しいブリッジメソッドも、リバースチャネルも、デーモンプッシュルートもありません。**

> **トポロジーノート（コミットされたアーキテクチャ）。** スケジューラーは**構築上、移行ニュートラル**です。どのブリッジが下にあっても、`ChannelBase.sessionQueues` を介してシリアライズします。Phase 0 では stdio 経由で `AcpBridge.prompt()` を駆動し、Phase 1+ では `DaemonChannelBridge.prompt()`（デーモンホスト）を駆動します。デーモンの `eventBus` 監査と FIFO `promptQueue` は Phase 1+ のガバナンスに必要とされるため、チャネルは Phase 1 以降 `qwen serve` の下で実行されます。しかし、スケジューラー自体のロジックは移行境界で変更されません。

なぜ代替案ではないのか:

- **セッション内 cron:** 却下 — `cronQueue`/`cronProcessing` はプロセス内 `Session` に存在し（`Session.ts:667-668`）、セッションが開いている間のみ発火し、30 分のアイドルリープ時の `dispose()` で停止します（`:790-812`）。これはゲートウェイスケジューラーが回避するまさにその障害です。**そして、ゲートウェイスケジューラーが唯一の cron オーナーです（OD-8）**。タグセッションはセッション内 cron を決して開始しません（ゲーティングメカニズムは後述）。
- **スタンドアロンプロセス:** 却下 — DingTalk 認証情報を複製する 2 番目の長寿命プロセスとなり、プロセス内の `SessionRouter` とすでにアタッチされたブリッジを再利用できません。

#### コンポーネントと配置

| コンポーネント                          | ファイル                                                                        | 責任                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChannelCronStore`                 | `packages/channels/base/src/ChannelCronStore.ts` (new)                      | 永続的なジョブテーブル。`sessions.json` と同列の JSON。`atomicWriteJSON`（`atomicFileWrite.ts:385`）+ ファイルごとの `async-mutex` `Mutex`。                                                       |
| `ChannelCronScheduler`             | `packages/channels/base/src/ChannelCronScheduler.ts` (new)                  | 単一の再アームされた `setTimeout`（タイマーホイール・オブ・ワン）。`nextFireTime` による次回の発火。再起動時のキャッチアップ。60 秒のレコンサイラーチック。ゲートウェイごとに 1 つ。唯一の cron オーナー。                                |
| Cron プリミティブ                    | `packages/core/src/utils/cronParser.ts` (reuse)                             | `parseCron`/`matches`/`nextFireTime`（`:104,141,168`）。再実装しないでください。                                                                                                               |
| `dispatchProactive`                | `ChannelBase.ts` (extend)                                                   | `sessionQueues` を介して発火を注入。実行中の人間のターンの `activePrompts.get(sessionId)?.done` を待機。`steer` は行わない。`activePrompts` が保持されている間に `bridge.prompt()` を呼び出さない。 |
| `pushProactive`                    | `ChannelBase.ts` (extend; base default = `sendMessage`) + DingTalk override | アウトバウンド配信。コールドグループ用の DingTalk オーバーライド。`canColdSend` ケイパビリティによってゲートされる。                                                                                                |
| `canColdSend`                      | `ChannelBase` property (default `false`)                                    | コールド送信前にスケジューラーがチェックするケイパビリティフラグ。DingTalk はプロアクティブ API パスが出荷されると `true` に反転。Feishu は `true`。                                                      |
| DingTalk プロアクティブ送信            | `packages/channels/dingtalk/src/proactive.ts` (new) + `DingtalkAdapter.ts`  | `robotCode` + 保存された `openConversationId` 経由のアクティブメッセージのグループ送信（コントラクトは後述の通り検証済み）。                                                                                                   |
| 配線                             | `start.ts` (extend `startSingle`/`startAll`)                                | `router.restoreSessions()`（`:275,444`）の後にスケジューラーを構築 + 開始。`isTagSession` フラグをセッション構築にスレッド化（OD-8）。                                              |
| `/schedule` + `schedule_task` ツール | `ChannelBase.handleInbound()` (extend, after gates `:240-252`)              | 決定論的コマンドが最初。モデルツールが次。                                                                                                                                          |
#### `canColdSend` capability flag (Fix #4)

クロスプラットフォームMVPの基準（「DingTalkとFeishuの両方で同じジョブが配信される」）には、スケジューラが到達性をサイレント失敗で発見するのではなく、推論できるようにするためのcapability flagが必要です。

- **`ChannelBase`のプロパティとして宣言:** `protected readonly canColdSend: boolean = false;`。（スケジューラはすでにアダプターインスタンスを保持しており、`pushProactive`/`sendMessage`はインスタンスメソッドであるため、別の`ChannelPlugin`レジストリではなく基底クラスに配置されます。フラグをそれがガードするメソッドと同じ場所に配置することで、それらを1つの型にまとめています。）
- **DingTalk:** proactive-sendパス（`proactive.ts`）がリリースされ、利用可能な`openConversationId`が永続化されるまで`canColdSend = false`です。`pushProactive`が実装されると`true`に切り替わります。`false`の間でも、DingTalkはwarm（webhook）ターンに応答できます。`canColdSend`は_cold-group_配信のみを制御します。
- **Feishu:** `canColdSend = true`（`tenant_access_token`を介したネイティブなproactive send、`FeishuAdapter.ts:622-676`）。
- **Scheduler fails loud:** fireを配信する前に、スケジューラは`adapter.canColdSend`をチェックします。`false`の場合、`pushProactive`を試行**せず**、オペレーターから見えるエラーをログに記録し、`job.lastStatus='error'`と`lastError='adapter cannot cold-send'`を設定して`/schedule list`に表示し、（ポリシーに従って）`consecutiveFailures`をインクリメントします。サイレントにno-opすることはありません。

#### Disjoint cron stores + the OD-8 gate (Fix #5)

cronの永続化パスは2つあり、**それらは互いに素なファイルシステムパス上に存在する**ため、同じジョブを読み書きすることは決してありません。

- **Gateway store（新規）:** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` — チャネルグローバル、`sessionsPath()`の兄弟（`start.ts:56-58`）、ユーザー所有、ワーキングツリーの外。
- **Session store（既存）:** セッションごとの`Session` cronは、**プロジェクトごとにハッシュ化された**ディレクトリ`~/.qwen/tmp/<hash>/scheduled_tasks.json`（`cronTasksFile.ts:1-9`）を使用します。

パスが互いに素であるため、永続的なジョブが二重にfireされる唯一の方法は、**tag sessionがgateway schedulerに加えてセッション内の`Session` cronも実行する場合**です。**OD-8はこれを閉じます:** gateway schedulerが唯一のcronオーナーであり、チャネルホストの（"tag"）セッションはセッション内cronを起動**しません**。

**ゲーティングメカニズム — セッションがtag sessionであることを知る方法。** tag sessionは、チャネルホストからスレッド化された明示的なフラグを使用して構築されます。

- Phase-1+のdaemonパスでは、`DaemonChannelSessionFactory`はすでに構造化されたオプションバッグ（`{ workspaceCwd, modelServiceId, sessionScope }`、`DaemonChannelBridge.ts:226-241`）を受け取ります。そのバッグに`isTagSession: true`を追加します。daemonの`Session`は構築時にそれを読み取り、**`startCronScheduler()`をスキップします**（そうでなければ`cronQueue`をarmする呼び出しサイト、`Session.ts:667-668`）。破棄時にはすでにreap時にcronがクリアされるため（`:790-803`）、tag sessionは単にそれをarmすることはありません。
- Phase-0の`AcpBridge`パスでは、子エージェントもtag workspaceのセッション内cronをarmしてはなりません。同じフラグを`--acp` spawnオプション（`Config`にフラグとして転送される新しい`AcpBridgeOptions`フィールド）を介してスレッド化します。そのフラグの配管が完了するまで、Phase 0はセッション内cronジョブを一切登録しません（`/schedule`コマンドはgateway storeを対象とするため）、二重にfireされるものはありません。

これにより、残りのリスクは純粋に運用的なものになります。「同じジョブに対して両方のスケジューラを実行しない」— そして、このゲートはtag sessionが2つ目のスケジューラを起動しないことを保証します。

#### Durable store schema and restart recovery

スキーマは`DurableCronTask`に準拠しています（`cronTasksFile.ts:19-26`: `id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` — フィールドは`cron`であり、`cronExpr`では**ありません**）。

```ts
interface ChannelCronJob {
  id: string; // randomUUID()
  channelName: string;
  target: {
    // mirrors SessionRouter PersistedEntry (SessionRouter.ts:5-9)
    channelName: string;
    senderId: string; // "__cron__" for system jobs
    chatId: string; // DingTalk openConversationId — the DURABLE cold-group id
    threadId?: string;
  };
  cwd: string; // validated == bound workspace on load
  cron: string; // 5-field (parseCron) OR "@once:<epochMs>"
  prompt: string;
  label?: string;
  recurring: boolean;
  enabled: boolean;
  createdBy: string; // senderId; advisory under single-token model; carried into the fire's attribution
  createdAt: number;
  lastFiredAt: number | null;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  consecutiveFailures: number; // auto-disable after N (e.g. 5)
}
```

ファイルごとの`async-mutex` `Mutex`の下で`atomicWriteJSON`を介して書き込みます。`start.ts`における`router.restoreSessions()`（`:275`/`:444`）_後_の**再起動回復**:

1. `bridge.start()` → `restoreSessions()`が`sessions.json`をリロードし、エントリごとに`bridge.loadSession()`を実行します。
2. `store.load()`。`cwd !== boundWorkspace`のエントリを破棄します。
3. `scheduler.start()`: 有効なジョブごとに`nextFireTime(job.cron, new Date())`を計算します。**見逃したfireのポリシー（RFCの決定）: ダウンタイム中に期限切れになった定期ジョブは、すぐに1回fireしてから再開します — バックログをリプレイすることはありません**（ライブグループへのバックログの洪水はスパムインシデントになります）。過去のワンショットは1回fireしてから削除します。`cronScheduler.ts`は、`:81-89,608-707`で`{ kind: 'catch-up'; ids }`（定期）と`{ kind: 'missed'; tasks }`（ワンショット、確認優先）を区別します。定期ジョブにはcoalesce-to-oneを採用します。
4. 最も近いジョブに対して単一の`setTimeout`をarmします。各fire後にre-armします。サスペンド/レジューム時のクロックスキューを吸収するために、`Date.now()`から再計算する60秒のreconciler tick（前例: `lockProbeTimer`、`cronScheduler.ts:229,507-538`）を追加します。インターバルを累積させることはありません。

#### Fire path: injecting into the SHARED group session (Fix #1 — the big one)

セッションごとに1つのアクティブなプロンプトという不変条件はトポロジによって異なり、v1の`dispatchProactive`はdaemonパスでこれを誤って実装していました。

- **Phase 0 (`AcpBridge`):** `AcpBridge.prompt()`（`:147-180`）には**独自の並行性ガードがありません**。唯一の直列化は`ChannelBase.sessionQueues`/`activePrompts`（`:29-35,394,466`）と`--acp`子プロセス自身のACPセッションのみです。
- **Phase 1+ (`DaemonChannelBridge`):** `DaemonChannelBridge.prompt()`は、`activePrompts.has(sessionId)`（`:257-261`）の場合に**`Prompt already in flight`をスローします** — キューイングは**しません**。FIFOの`promptQueue`（`bridge.ts:2855,3082`）はdaemon/acp-bridge側、つまりそのプロセス内スローガードの_背後_にあります。したがって、人間のターンがアクティブな間に`DaemonChannelBridge.prompt()`を呼び出すと、待機するのではなく**スロー**されます。

**再設計（両方のトポロジで正しい）: ターンが進行中の間に`bridge.prompt()`を呼び出さないでください。チャネルレイヤーで`sessionQueues`を介して直列化し、まず`activePrompts`を待機します。** `sessionQueues`は、前の実行が解決した_後_にproactive runをチェーンするため、`bridge.prompt()`が呼び出される時点では`activePrompts.get(sessionId)`はクリアされています。したがって、daemonパスではスローガードがトリガーされることはなく、`AcpBridge`パスでもガードのない`prompt()`がオーバーラップすることはありません。

```ts
// ChannelBase.ts — reuses private sessionQueues/activePrompts (:29-35).
// Works identically for AcpBridge (Phase 0) and DaemonChannelBridge (Phase 1+):
// the chain guarantees bridge.prompt() runs only after the prior turn drains,
// so DaemonChannelBridge's `Prompt already in flight` throw (:257-261) cannot fire.
async dispatchProactive(sessionId: string, promptText: string): Promise<string> {
  const prev = this.sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const active = this.activePrompts.get(sessionId);
    if (active) await active.done;            // wait out a human turn — never steer-cancel (:371-379)
    return this.bridge.prompt(sessionId, promptText);   // only now is activePrompts clear
  });
  this.sessionQueues.set(sessionId, run.then(() => {}, () => {}));
  return run;
}
```

**不変条件: proactive turnは、後続の人間のターンによってキャンセルされることはなく、人間のターンをキャンセルすることもありません。** 両方のバリアントに対する強制:

- **proactive→humanのキャンセルなし:** `dispatchProactive`は`steer`/`cancelSession`を呼び出しません。`activePrompts.get(sessionId)?.done`を`await`し、その背後にエンキューするだけです。
- **human→proactiveのキャンセルなし:** tag groupプロファイルは**`followup`（`steer`ではない）**（§6.1）です。`steer`は`bridge.cancelSession()`（`:371-379`）を呼び出す唯一の`dispatchMode`であり、tag groupがそれを選択することはないため、受信した人間のターンは`sessionQueues`を介して進行中のproactive turnの_背後_にチェーンされることしかできません — キャンセルすることはできません。（daemonパスでは、`DaemonChannelBridge.cancelSession`（`:332`）は`steer`ブランチからのみ到達されますが、tag groupでは除外されています。）
- **スローガードがトリガーされない:** 両方のパスで、`bridge.prompt()`は`sessionQueues`チェーンの末尾、つまり前の実行が解決し、（人間のターンの場合は）`activePrompts`が排出された後にのみ呼び出されます。したがって、`DaemonChannelBridge`のオーバーラップスロー（`:257-261`）は、tagトラフィックに対して構造的に到達不可能です。

fire時:

1. `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)`（`SessionRouter.ts:72`）を介して**共有セッションを解決します**。`'thread'` → グループ全体で1つの`sessionId`になるため、fireは人間が見るコンテキストに到達します。復元されたセッションがドロップしていた場合、`resolve()`は新規に作成して永続化します。
2. **エンキューし、決してプリエンプトしない**（`sessionQueues`を介したfollowup）。意図的に`steer`ではありません。
3. **マーカーと属性（Fix #7）。** `[Scheduled task "<label>" set by <createdBy>]\n`をプレフィックスとして付与します。`createdBy`のIDは、後でタイムスタンプで結合されるのではなく、**キューに入れられた実行に付随して運ばれる**ため、このfire中に発生したツール呼び出し/権限は_この_proactive turnに帰属します（§6.4）。
4. **キャプチャとプッシュ。** `dispatchProactive`は完了テキストを返します。スケジューラは`adapter.canColdSend`をチェックし、`channel.pushProactive(target.chatId, text)`を呼び出します（`false`の場合はfail-loud）。

#### Cold-group push on DingTalk

**検証済みの制限:** `DingtalkAdapter.sendMessage()`は、`conversationId`ごとにキャッシュされた`sessionWebhook`（`:84,134-142`）を介してのみ送信し、これは受信時にのみ設定されます（`:505-517`）。Cold group → サイレントにリターン（`:137-141`）。

**修正 — DingTalk 主动消息 群发 APIを介した`pushProactive`（契約は現在検証済み、OD-7解決済み）。** 呼び出しの形状はリポジトリ内にも前例があります（`emotionApi`は`api.dingtalk.com/v1.0/robot/...`にヘッダー`x-acs-dingtalk-access-token`とボディ`{ robotCode, openConversationId, ... }`でPOSTします、`:188-197`）。

**検証済みのエンドポイントとパラメータ**（完全なソースノートは§6.5を参照。項目ごとに信頼度を記載）:

- **エンドポイント:** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _（検証度高。公式sendドキュメント + aliyun ask/559227）_。
- **`robotCode`**（必須、文字列）: グループにロボットをインストールした際のロボット識別子。企業内部ロボットの`appKey`と同じ値空間 → `config.clientId`（`:184,435`）を使用。新しい認証情報はありません。_（検証度高）_
- **`openConversationId`**（必須、文字列）: 対象グループの`cid`プレフィックス付きopen conversation id。エラーコード`miss.openConversationId`/`invalid.openConversationId`は、これが必須であり検証されることを確認しています。`ChannelCronJob.target.chatId`に永続化します — `sessionWebhook`とは異なり、再起動間で安定しています。_（検証度高）_
- **`msgKey`**（必須、文字列）: メッセージテンプレートキー。markdownの場合は**`'sampleMarkdown'`**（プレーンテキストの場合は`'sampleText'`）。_（検証度高。message-typeドキュメント + aliyun ask/585232）_
- **`msgParam`**（必須、**JSONエンコードされた_文字列_**、ネストされたオブジェクトではない）: `sampleMarkdown`の場合、文字列は`"{\"title\":\"<preview title>\",\"text\":\"<markdown body, max ~5000 chars>\"}"`です。_（検証度高。markdownのtitle/textフィールドはmessage-typeドキュメントから、textの例はaliyun ask/585232からそのまま引用）_
- **`coolAppCode`**（任意）: ロボットがグループcool app（群聊酷应用）としてインストールされている場合のみ。通常の企業内部アプリロボットでは不要です。_（検証度中）_
- **`conversationId` == `openConversationId`?** 標準的なグループ@-コールバックの場合、**コールバックの`conversationId`（cidプレフィックス付き）を`openConversationId`として直接使用できるものとして扱います** — コミュニティソースによる裏付け + `cid`フォーマットの一致。**フラグ付き（信頼度中）:** 公式ドキュメントには、標準的な（cool-appではない）ロボットに対してこれらを等価とする逐語的な文は含まれていません。ドキュメント保証のパスは、`chatId → openConversationId`変換API（またはグループ作成API / `chooseChat` JSAPI / `openConversationId`+`coolAppCode`を直接配信するcool-appコールバックから取得）です。**フォールバックルール:** 送信が`invalid.openConversationId`を返した場合、`chatId → openConversationId`変換APIにフォールバックします。

```ts
const GROUP_SEND = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'; // verified high

async pushProactive(chatId: string, text: string): Promise<void> {        // DingtalkAdapter override
  const token = await this.tokenManager.get();        // refreshed independently of SDK connect lifecycle
  const robotCode = this.config.clientId;
  if (!token || !robotCode) { /* refresh once; else set lastError + return */ return; }
  for (const chunk of normalizeDingTalkMarkdown(text)) {  // reuse chunker IF the template length budget matches
    const msgParam = JSON.stringify({ title: extractTitle(text), text: chunk });  // msgParam is a STRING
    await sendGroupMessage({ token, robotCode, openConversationId: chatId,
      msgKey: 'sampleMarkdown', msgParam });            // on invalid.openConversationId → convert via chatId API, retry
  }
}
```

`sendMessage()`は次のようになります: まずキャッシュされた`sessionWebhook`を試行し（安価でトークンを消費しない）、そうでない場合は`pushProactive()`にフォールバックします。**ベースのデフォルト**は`pushProactive = (chatId, text) => this.sendMessage(chatId, text)`であるため、**Feishuはオーバーライド不要**です（`FeishuAdapter.sendMessage()`はすでに安定した`tenant_access_token`を持つ任意の`chatId`に対してproactive sendを行います、`:622-676`。`canColdSend = true`）。DingTalkのみが異なるアダプターです — DingTalk優先の非対称性。（上記の）`canColdSend`フラグにより、エンジンはサイレントにドロップするのではなく、リアクティブのみのアダプターで**fail loudly**させることができます。

**ハードなデプロイ制約（コードではない）:** 組織ボットは (a) 公開された企業内部ボットであること、(b) proactive group-message権限が付与されていること、(c) 対象グループのメンバーであること（グループcool app / 企業内部アプリ / サードパーティアプリ経由でインストールされ、その`robotCode`を保持している）_（権限の有効化が必要であることは検証度高。ボットのインストール + robotCodeが前提条件であることも検証度高）_、(d) その`openConversationId`が記録されていること。ボットがグループ内で_何らか_の受信を最初に確認した時点で`conversationId`を永続化するため、「cold」= _アイドル_であり、_未確認_ではありません。真に未確認のグループは、変換APIを介してその`openConversationId`が取得されるまでプッシュできません（ハードリミット）。**必要なアダプターの変更:** 現在は`sessionWebhook`のみがキャッシュされています（`:516-517`）。`conversationId`も永続化する必要があります（推奨されるストア: セッションのライフサイクルから切り離された別の`~/.qwen/channels/dingtalk-groups.json`。これにより、cold groupとライブセッションのないcronを表現できます）。

> **まだフラグ付き（低信頼度） — OD-7に従い表示を維持:** (1) DingTalkアプリの权限管理コンソールにおける「proactively send group message」の**正確な権限ポイントコード/表示名**はドキュメントから特定されていません — DingTalkはアプリの权限管理の下にロボット/メッセージ送信権限として表示しています（一般的にはロボットメッセージファミリー、例: `qyapi_robot_sendmsg` / 企业机器人发送消息权限）。コンソール内で確認し、コードをハードにアサートしないでください。(2) 標準的な（cool-appではない）ロボットのコールバック`conversationId`と`openConversationId`を等価とする権威ある単一の公式文は、今回のセッションでは逐語的には見つかりませんでした — 可能性の高いショートカットですが、ドキュメント保証の取得パスは`chatId → openConversationId`変換APIです。DingTalkのオープンプラットフォームページはJSレンダリングされており、今回のセッションでは完全にスクレイピングできませんでした。エンドポイント/パラメータ/トークンの事実は、apifoxドキュメントミラーと公式リクエスト例を引用しているAliyun開発者Q&Aを介して相互確認されました。

#### Auth & token lifecycle (verified; the load-bearing feasibility risk)

**認証ヘッダー（検証度高）。** すべてのv1.0呼び出し（`groupMessages/send`を含む）は、リクエストヘッダー`x-acs-dingtalk-access-token: <accessToken>`と`Content-Type: application/json`でトークンを渡します — これは`emotionApi()`（`:188-207`）と`downloadMedia()`（`media.ts:36-43`）がすでに使用しているヘッダーと全く同じです。

**トークンの取得（検証度高）。** 企業内部アプリ、v1.0スタイル: JSONボディ`{"appKey":"<appKey>","appSecret":"<appSecret>"}`で`POST https://api.dingtalk.com/v1.0/oauth2/accessToken` → `{ "accessToken": "...", "expireIn": 7200 }`。（レガシーな同等の`GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..`は`{access_token, expires_in:7200}`を返しますが、そのレガシートークンは古い`oapi`エンドポイント用のものです。`api.dingtalk.com` v1.0 APIの場合は、`x-acs-dingtalk-access-token`ヘッダーでv1.0の`accessToken`を使用します。）

**有効期限とキャッシュ（検証度高）。** トークンは**7200秒（約2時間）**で期限切れになり、期限切れ後は再取得**しなければなりません**。有効期間内の繰り返し取得は同じトークンを返し、更新します。**アプリごとにキャッシュし、リクエストごとにトークンエンドポイントを呼び出さないでください**（頻繁な呼び出しはスロットリングされます）。

**これが負荷を支えるリスクである理由。** Stream SDKは、`getEndpoint()`（`client.mjs:85-87`）内の`GET .../gettoken`を介して**接続時に1回だけ**`access_token`を取得し、**それを更新しません**。`getAccessToken()`はキャッシュされた値を返します（`DingtalkAdapter.ts:172-174`）。`autoReconnect`はソケットの_クローズ_時にのみ再取得します（`client.mjs:157-163`） — 安定した長寿命ソケットは、約2時間のTTLを過ぎても古いトークンを保持し、期限切れになるとproactive send（および既存のemotion/mediaパス）はサイレントに失敗します。**proactive機能はトークンの更新を所有しなければなりません:** タイマー（約2時間の期限切れ前）および/または401応答時にv1.0の`oauth2/accessToken`エンドポイントを介して取得し、SDKの接続ライフサイクルから独立してアプリごとにキャッシュする`tokenManager`（OD-7）です。これが「デモでは動くが、2時間後に死ぬ」という失敗の最も可能性の高い原因です。

**レート制限（検証済み、信頼度混合 — フラグを維持）:** (1) DingTalk Standardではアプリごとのサーバー側API同時実行は約20 QPSで、月間Open APIクォータは約10,000回/月（Professionalは約500k、Dedicatedは約5M）_（中〜高）_。(2) よく引用されるロボットごとの**20メッセージ/分 → 約10分のスロットル**制限は、**カスタムグループwebhookロボット**に対して文書化されています。これはorgappロボットの送信パスに対する実践的なガイドとして一般的に適用されますが、今回のセッションでは`groupMessages/send`ページで明示的に確認され**ませんでした** — **`groupMessages/send`に対する正確な20回/分という数値は低〜中信頼度として扱ってください。** また: トークンエンドポイントを過剰に呼び出さないでください（別のスロットル）。スケジューラは自身の送信を保守的にレート制限し、スロットル応答時にはバックオフする必要があります。

#### Standing instructions (NL recurring asks → store → consume)

ゲートを通過した後の`handleInbound()`における2層のキャプチャ（`:240-252`）: 明示的な**`/schedule "0 9 * * 1-5" post the open PR list`**コマンド（`parseCron`で解析され、モデルのラウンドトリップなし）、およびPhase-2モデルツール`schedule_task(cron, prompt, recurring, label)`。両方とも`store.add({...})` → 永続化 → `scheduler.reschedule(job)`を呼び出し、その後チャネル内で返信します。`/schedule list|cancel <id>|disable <id>`はストアを読み書きします。**永続化はfail-closed:** 書き込みがスローされた場合、`/schedule`のackを拒否します。

#### Failure modes

- **fire時のGatewayダウン:** 回復時に、期限切れの定期fireを1つのcatch-upに統合します。過去のワンショットは1回fireしてから削除します。
- **fire中のエージェントクラッシュ:** `bridge.prompt()`が拒否されます。`attachDisconnectHandler`（`start.ts:241,403`）が再スポーン（Phase 0）/ daemonが再アタッチ（Phase 1+）します。スケジューラは`lastError`を設定し、定期ジョブの`lastFiredAt`にタイムスタンプを付けません → 再試行されます。At-least-once。分単位のfireキー + `lastFiredAt`で重複排除します。
- **セッションのreap / `loadSession`の失敗:** `resolve()`が新規に作成します（グループのトランスクリプトは失われるため、standing instructionsは自己完結している必要があります）。チャネルメモリ（§6.3）が回復のフロアです。
- **アダプターがcold-sendできない（`canColdSend=false`）:** スケジューラはログに記録し、`lastError`を記録して`/schedule list`に表示します。サイレントになることはありません。
- **削除された/権限が取り消されたグループへのCold-groupプッシュ:** 2xx以外 → `lastError`。`invalid.openConversationId` → `chatId → openConversationId`変換を試行 + 1回リトライ。
- **トークンの期限切れ:** `tokenManager`が1回更新 + バックオフ。`consecutiveFailures` ≥ N → オペレーターから見える記録とともに自動無効化。
- **1つのワークスペースに2つのGateway:** `checkDuplicateInstance()`（`start.ts:170-179`）がシングルインスタンスをガードします。さらに、`cron.json`にロックトークンを記録します。
### 6.3 チャネルスコープのメモリと学習 (Build Area 3)

タグは、兄弟グループに漏洩することなく、_長期的にグループを記憶する_ 必要があります。現在の qwen-code のメモリは **ワークスペースグローバル** であり、chat/channel/group/session の軸はありません。

> **トポロジーと依存関係の事実 (Fix #3)。** 2つの厳しい制約が配線を形作ります。(1) デフォルトの `AcpBridge` トポロジーには **`qwen serve` デーモンも `POST /workspace/memory` ルートも存在しません** — `--acp` 子プロセスには HTTP クライアントがありません。Phase-1+ のデーモン移行後でも、メモリルートは **デーモン専用かつ strict-auth** です (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`)。(2) `@qwen-code/channel-base` は `@agentclientprotocol/sdk` (`packages/channels/base/package.json`) にのみ依存し、`@qwen-code/qwen-code-core` には依存**しない**ため、`ChannelBase` は `import { writeWorkspaceContextFile }` **できません**。したがって、修正された設計では、チャネルメモリの書き込み/読み取りは、**CLI レイヤー (`packages/cli`。コアに依存可能) によって注入されたコールバックを通じて `channel-base` から到達するコアヘルパーを介してプロセス内で** 行われます。HTTP 経由でも、`channel-base` にコア依存関係を追加することでもありません。

#### 現状: 2つのスコープ、いずれも会話単位ではない

`POST /workspace/memory` は `scope: 'workspace' | 'global'` のみを受け付け (`workspace-memory.ts:118-125`)、`resolveContextFilePath()` を介して解決します (`writeContextFile.ts:223-240`)。`workspace → <root>/QWEN.md`、`global → ~/.qwen/QWEN.md` となります。追記モードは `## Qwen Added Memories` (`MEMORY_SECTION_HEADER`, `const.ts:29`) の下に折りたたまれます。30秒のデッドラインを持つファイルごとの mutex が書き込みを直列化し (`writeContextFile.ts:48-57,159-162`)、ライターは追記時に 16 MB を超える既存ファイルを拒否します (`MAX_EXISTING_FILE_BYTES`, `:255`)。このルートは **strict-auth** (`deps.mutate({ strict: true })`, `:114`) であり、トークンなしのループバックでも拒否されます。結果として、1つのワークスペース上のすべてのグループが1つの `QWEN.md` を共有することになります。

#### 設計: `(channelName, chatId)` をキーとする `channel` メモリスコープ

分離の単位はセッションではなく **ルーティングターゲット** です (セッションはアイドル時に刈り取られます。`DEFAULT_SESSION_IDLE_TIMEOUT_MS` 30分、`run-qwen-serve.ts:94`)。キーはすでに存在します: `SessionTarget { channelName, senderId, chatId, threadId }` (`types.ts:88-93`)。グループメモリの場合、`(channelName, chatId)` をキーとします。

**ストレージレイアウト** は既存の `~/.qwen/channels/` ツリーを反映しています:

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # サニタイズ: /, .., NUL を拒否
      <hash(chatId)>/               # sha256(chatId).slice(0,16) — パスセーフ、衝突/エスケープなし
        QWEN.md                     # グループスコープの「長期的な学習」
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

ファイル名は `getCurrentGeminiMdFilename()` (`const.ts:49`) に従います。これにより、チャネルメモリはワーキングツリー、バインドされたワークスペース、および階層的な `QWEN.md` 検出パスから除外され (グループ間で漏洩することはありません)、安全に保たれます。

#### 書き込みパス (コアヘルパーをフォークせず拡張する)

`packages/core/src/memory/writeContextFile.ts` において:

- `WriteContextFileScope` (`:80`) を `'workspace' | 'global'` から `'channel'` を追加するように拡張します。
- `WriteContextFileOptions` (`:83-97`) に `channelKey?: { channelName: string; chatId: string }` を追加します。`scope === 'channel'` の場合に存在することを検証します (`:142-146` の絶対パスガードを反映)。`projectRoot` はインターフェースで必須のままです — チャネルスコープでは未使用でも `config.cwd` を渡します。
- `resolveContextFilePath()` (`:223-240`) に、`path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())` を返す `channel` ブランチを追加します。**関数の現在のシグネチャは `(scope, projectRoot)` です — `channelKey` パラメータを追加する必要があります** (プライベート関数、ローカルな変更)。ファイルごとの mutex は解決されたパスをキーとするため、2つのグループは競合せずに同時に書き込みできます。

**正確な `ChannelBaseOptions` の変更 + 注入元 (Fix #3)。** `channel-base` はコアをインポートできないため、CLI レイヤーが読み取り/書き込みをコールバックとして提供します。オプションバッグを拡張します (`ChannelBase.ts:9-12` — 現在の実際のインターフェースは `{ router?: SessionRouter; proxy?: string }` のみです。`config` と `bridge` は `:40-46` の **コンストラクタの位置引数** であり、バッグのメンバではありません)。バッグにはすでに `router` が含まれています:

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions (新しいコア依存関係なし)
export interface ChannelBaseOptions {
  // ...現在の既存メンバ: router?: SessionRouter; proxy?: string
  /** このチャネルの蒸留されたメモリを読み取ります。まだない場合は null。CLI レイヤーによって注入されます。 */
  readChannelMemory?: (target: SessionTarget) => Promise<string | null>;
  /** このチャネルのメモリを追記/置換します。CLI レイヤーによって注入されます。 */
  writeChannelMemory?: (
    target: SessionTarget,
    content: string,
    mode: 'append' | 'replace',
  ) => Promise<void>;
}
```

**構築と注入を行うもの:** `packages/cli/src/commands/channel/start.ts` (コアに依存)。`start.ts` が各アダプタのオプションバッグを構築する際、コアの `writeWorkspaceContextFile` / 読み取りヘルパーをクロージャでキャプチャし、`router.getTarget(sessionId)` (`SessionRouter.ts:94`) からサーバーが信頼する `(channelName, chatId)` を解決します。アダプタがネットワークから `chatId` を提供することは決してありません:

```ts
// packages/cli/src/commands/channel/start.ts — CLI レイヤー (コアに依存可能)
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config と bridge は createChannel(name, config, bridge, baseOpts) の位置引数です — バッグのメンバではありません
  readChannelMemory: (target) =>
    readChannelContextFile({
      channelKey: { channelName: target.channelName, chatId: target.chatId },
    }),
  writeChannelMemory: (target, content, mode) =>
    writeWorkspaceContextFile({
      scope: 'channel',
      channelKey: { channelName: target.channelName, chatId: target.chatId },
      mode,
      content,
      projectRoot: config.cwd, // projectRoot はチャネルスコープでは未使用ですが、インターフェースで必須です
    }),
};
// アダプタはバッグを最後にして位置引数で作成されます: plugin.createChannel(name, config, bridge, baseOpts)
```

アダプタはファイルシステムに決して触れず、`channel-base` は新しい依存関係を得ません。(Phase-2 のデーモン代替案: サーバー側で `channelKey` を解決するスコープ付き `POST /channel/:sessionId/memory` ルート。`scope ∈ {workspace, global}` を厳密に検証し、固定の `projectRoot` を転送する `POST /workspace/memory` を再利用することはできません (`:118-125,185-190`)。プロアクティブエンジンがデーモン側の `sessionId → target` ルックアップを必要とするようになるまで延期します。)

**イベントのファンアウト。** `publishWorkspaceEvent` はチャネル側ではなく、**デーモン側** の `AcpSessionBridge` (`bridge.ts:3610`) にあります。`AcpBridge` (Phase 0) の下では `memory_changed` イベントは**存在しません** (必要でもありません — 1つのプロセスが書き込みと読み取りを所有します)。デーモントポロジーの下では、`publishWorkspaceEvent` は**すべての**ライブセッションバスに無差別にファンアウトされます (`bridge.ts:3649-3675`)。`BridgeEvent.data` は自由形式 (`eventBus.ts:51`) であるため、`memory_changed` イベントは `{ scope:'channel', channelName, chatId }` を運ぶこと_ができます_が、**サブスクライバー側のフィルタリング**が必要です — パブリッシャーは配信をスコープ制限できません。

#### 読み取りパス (メモリ → プロンプト) — `instructedSessions` を再利用するセッションごとのブートストラップ

セッションごとに1回の `instructions` ブロックを拡張します (`ChannelBase.ts:343-347`、`instructedSessions` によってゲート)。ターゲットが `(channelName, chatId)` を持つセッションの最初のメッセージで、注入された `readChannelMemory(target)` を呼び出し、その結果を `config.instructions` と並べて先頭に追加し、今日と同じように `instructedSessions` にセッションをマークします。`'thread'` スコープは1つの `sessionId` を共有するため、これは**セッションのライフタイムごとに1回**メモリをロードします (`config.instructions` の再注入を防ぐのと同じゲート)。コア依存関係は追加されません — 読み取りは注入されたコールバックを経由します。チャネルメモリは階層的な検出パスに**決して**含まれません。このフックによってセッションごとに注入されます。

```ts
// ChannelBase.handleInbound() — 最初のターンのブートストラップ (instructedSessions を再利用)
if (!this.instructedSessions.has(sessionId)) {
  const parts: string[] = [];
  if (this.options.readChannelMemory) {
    const mem = await this.options.readChannelMemory(target); // target は router.getTarget(sessionId) から取得
    if (mem) parts.push(mem);
  }
  if (config.instructions) parts.push(config.instructions);
  if (parts.length) promptText = `${parts.join('\n\n')}\n\n${promptText}`;
  this.instructedSessions.add(sessionId);
}
```

#### SessionRouter の永続化/復元およびトランスクリプトとの関係

| レイヤー                    | 永続化するもの                                            | ライフタイム                                   | 所有者                             |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| セッションのトランスクリプト       | ACP の会話ターン                              | 刈り取り / `/clear confirm` / 再起動まで  | `Session` (エージェント)             |
| `SessionRouter` の永続化  | `key → { sessionId, target, cwd }` (`:5-9,224-244`) | ブリッジの再起動をまたぐ、`loadSession()` 経由 | `SessionRouter` (`sessions.json`) |
| **チャネルメモリ (新規)** | グループに関する蒸留された永続的な事実             | 無期限                                 | `~/.qwen/channels/memory/`        |

`restoreSessions()` がセッションの再ロードに失敗した場合 (`:196`)、トランスクリプトは失われますが、グループの `QWEN.md` は無傷です — ブートストラップの読み取りにより、次のメッセージでエージェントの知識が再ハイドレートされます。**チャネルメモリはトランスクリプトの回復の底上げ (フロア) です。** 「長期的な学習」は生のトランスクリプトの永続化ではなく、_蒸留_ ループです: エージェント (またはトリガーされたジョブ) が、追記モードでグループの `QWEN.md` に重要な事実を定期的に要約します。

#### 分離、サイズ、およびフェーズ分け

書き込みパスが常にサーバーが信頼する `chatId` を運ぶ限り、分離はパスレベルで保持されます (`sales` と `eng` は異なる `hash(chatId)` のディレクトリ/ファイル/mutex に解決されます)。これは認証境界ではなく、**コンテンツ** の分離です (プロセスは引き続き単一のグローバルトークンを持ち、ユーザーごとのアイデンティティはありません)。ハードなテナント分離については、ワークスペース/テナントごとに1つのプロセスを実行します (OD-2)。

サイズのガードレール (既存の仕組みを再利用): 追記時の 16 MB の既存ファイル上限は無料で継承されます (`WorkspaceMemoryFileTooLargeError` をユーザーに表示される「グループメモリが満杯です。コンパクションパスを実行してください」にマッピング)。Phase-2 のルートは書き込みごとの 1 MB 上限 (`MAX_MEMORY_CONTENT_BYTES`, `workspace-memory.ts:79`) を再利用します。置換モードのコンパクション (`writeContextFile.ts:202-211`) は、無限の成長に対する長期的な解決策です。

- **Phase 0/1:** `writeContextFile.ts` に `channel` スコープと `channelKey` を追加します。`~/.qwen/channels/memory/` と `meta.json` を出荷します。`ChannelBaseOptions` と上記のブートストラップ読み取りを介して、CLI レイヤーの `readChannelMemory` / `writeChannelMemory` コールバックを配線します。新しい HTTP ルートや `channel-base → core` の依存関係はありません。
- **Phase 2:** スコープ付きの `POST /channel/:sessionId/memory` ルート (デーモントポロジー) と、サブスクライバー側フィルタリングを伴う `memory_changed` を追加します。蒸留トリガーと `qwen channel memory <name> <chatId>` CLI を追加します。**蒸留の制約:** cron はセッションスコープであり、`dispose()` で終了します (`Session.ts:791,799-803,1056`)。蒸留はセッションがライブ中に発生する必要があります — ターン完了時、明示的な `/remember` 時、またはウォームに保たれたセッション時 — 独立したバックグラウンドスケジューラから発生させることは決してありません。

### 6.4 ガバナンス: トークン予算と監査ログ (Build Area 4)

どのメンバでも操作でき、かつプロアクティブに行動できるチャネル常駐エージェントには、支出制限、_誰_ が _何_ を要求したかを記録する監査証跡、およびアイデンティティごとの分離が必要です。qwen-code は4つのプリミティブのうち3つを出荷しています: `rate-limit.ts` (キーごとのトークンバケット)、`permission-audit.ts` リング、および `MultiClientPermissionMediator` です。この領域はそれらを構成し、ギャップを埋めます (どこにもコスト予算がない、監査行に人間の送信者が含まれない)。指導原則: **切り捨てず、拒否する** — ただし、Fix #6 に従い、_推定_ 予算がユーザープロンプトをハードに拒否することはなく、WARN のみを行います。

#### どのプロセスがガバナンスを所有するか？

| デプロイメント                                          | ブリッジ                                                  | 利用可能な `serve/` の仕組み                                                            |
| --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Phase 0 — `qwen channel start` / `AcpBridge`**    | 独自の `--acp` stdio 子プロセスを生成 (`start.ts:213,356`) | **なし。** Express サーバー、`rate-limit.ts`、HTTP ルート、`permission-audit.ts` リングはありません。 |
| **Phase 1+ — `qwen serve` + `DaemonChannelBridge`** | チャネルがデーモンでホストされる                           | `serve/` のすべて: 実際の使用量、メディエータ、レート制限、監査リング、ルート。                          |

解決策: **予算のアドミッションと拒否は `@qwen-code/channel-base`** (共通のチョークポイント `ChannelBase.handleInbound()`) に実装し、新しい **`packages/channels/base/src/BudgetLedger.ts`** に配置します。`serve/budget.ts` ではありません。Phase-0 のチャネルプロセスは `serve/` を決してロードせず、チャネルレイヤーのみが人間の送信者コンテキストを持つ場所だからです。**監査と属性** もチャネルレイヤーで発生します。Phase-1+ のデーモンパスでは、レッジャーは実際の使用量を読み取り、ルートを通じて_追加で_ 公開されます。Phase-0 のパスでは推定を行い、チャネルコマンド (`/audit`) を介して公開されます。

#### 現在のガバナンスの接続箇所 (およびギャップ)

| 懸念事項                     | 既存の仕組み                                                                                                                                                    | ギャップ                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| リクエストレートのスロットリング     | `(clientId\|ip)` ごとのトークンバケット、3つのティア (`rate-limit.ts`)                                                                                                         | トークン/コストはなく、リクエスト数のみ。`serve/` のみ                                |
| 事後の決定ログ | 境界付き FIFO リング、5つのレコードタイプ (`permission-audit.ts`)                                                                                                             | 人間の `senderId` はなく、`clientId` のみ。GET ルートなし。リングはクロージャで保持 (`:17-25`) |
| アクションごとの実際の承認    | 4つのポリシー + コンセンサス定足数 (`permissionMediator.ts:621-637`)                                                                                                    | 投票は人間ではなく `clientId` に帰属。1つのチャネル = 1つのクライアント          |
| チャネルごとのツール/データスコープ | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); `getPermissionsAllow()` (`:3158`); `getPermissionsDeny()` (`:3182`); MCP 許可フィルタ (`:3327-3333`) | スコープは `Config`/プロセスごと。`--acp` 子プロセスへの spawn-arg パスなし          |

2つの構造的な事実: (1) **デーモンには人間のアイデンティティがない** (`BridgeEvent.originatorClientId`、すべての `PermissionVote.clientId` はトランスポート識別子であり、`senderName` は `SenderGate.check()` までしか残らない) ため、人間↦`clientId`↦`sessionId` の相関はチャネル境界で確立する必要があります。(2) **認証とレート制限はデーモングローバルである** (単一のベアラートークン `auth.ts:259-266`、`(clientId, ip)` をキーとするレート制限) ため、チャネルごとのガバナンスはアダプタで発生する必要があります。

#### トークンとコストの予算 — 新しい `BudgetLedger`、実際の使用量が存在するまでアドバイザリ (Fix #6)

**使用量の源泉 — 注意事項 (OD-9)。** トークン予算は、モデルが使用量を報告して初めて_実際の_数値をデビットできます。セッション内では、`Session.#recordPromptTokenCount()` (`Session.ts:2078-2087`) が `usageMetadata.promptTokenCount` を `lastPromptTokenCount` に保存し、**ターンごとに上書きされます** — 累積的な課金メーターではありません。Phase-0 の `AcpBridge` パスでは、ACP の `session/update` ストリームに `usageMetadata` が含まれないため、**v1 ではそこで実際のトークン数をデビットできません**。Phase-1+ のデーモンパスでは、デーモンがプロセス内で使用量を監視し、正確にデビット_できます_。

**強制ルール (Fix #6 — 重要な要素):**

- **推定予算はアドバイザリのみです。** 利用可能な数値がチャネル側の推定値 (プロンプト+レスポンスの文字数 ÷ トークンあたりの文字数の定数) である場合、レッジャーは閾値で **WARN/アラート** を発行し、返信に警告を添付する場合があります — ユーザープロンプトを**ハードに拒否することは決してありません**。誤検知の推定によって、実際のユーザーリクエストが黙殺されてはなりません。
- **実際の数値に対してのみハードに拒否します。** デビットソースが実際のデーモン使用量パス (Phase-1+ デーモンホスト) である場合に**のみ**、予算はプロンプトを_拒否_ (切り捨てず拒否) できます。それまで、予算はゲートではなく、可観測性 + アラートです。

これにより、v1 の予算は正直なものになります。あらゆる場所で早期に警告し、数値が信頼できる場所で正確にハード制限を強制します。

**モジュール `BudgetLedger.ts`** は、`rate-limit.ts` (ファクトリ、GC を伴うバケットの Map、オーバーフロー時のフェイルオープン) をモデルとしています:

```ts
export type BudgetUnit = 'tokens' | 'usd'; // 'usd' = tokens × per-model rate
export type UsageSource = 'estimate' | 'daemon'; // 'estimate' => advisory; 'daemon' => may hard-decline
export interface BudgetLedger {
  // allowed=false only when source==='daemon'; estimates return allowed=true + warn flags
  admit(key: string): {
    allowed: boolean;
    spent: number;
    limit: number;
    advisory: boolean;
  };
  debit(
    key: string,
    amount: number,
    unit: BudgetUnit,
    source: UsageSource,
  ): void; // fires threshold alerts
  snapshot(): Record<
    string,
    { spent: number; limit: number; ratio: number; source: UsageSource }
  >;
  reset(): void;
  dispose(): void;
}
```

- **デフォルト継承セマンティクス + 最も厳しい条件が勝つ組織のロールアップ (OD-9)。** `admit(key)` は、`GroupGate` スタイルの `channel → '*' → built-in` フォールバックで有効なウィンドウを解決します。プロンプトは、チャネルごとのウィンドウと**プロセスごとの「組織」ロールアップ** (最も厳しい条件が勝ち、両方をデビット) の**両方**をパスする必要があります。「組織」 = _この単一プロセスの_ ロールアップ。真のクロスプロセス組織キャップには共有ストアが必要です (スコープ外)。**固定の毎日ウィンドウ。**
- **75%/95% アラート。** `debit()` は、イベントバスのヒステリシスイディオム (`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`, `eventBus.ts:101-103`) を使用して、ウィンドウごとの閾値ごとに1回 `onAlert` を発生させます。**アラートの投稿はプロアクティブな送信です** — Build Area 2 へのハード依存 (DingTalk のコールドグループの注意事項。Feishu は自由に投稿)。プロアクティブなチャネルが存在しない場合は、「次の返信に警告を添付する」にデグレードします。
- **切り捨てず拒否 (`source==='daemon'` の場合のみ)。** アドミッション時、`bridge.prompt()` (`:425`) の_前_ にチェックされます。実際の使用量で `!allowed` の場合、アダプタは `sendMessage(chatId, refusal)` を呼び出して戻ります — ステア/キャンセルパスには**入らない**ため、実行中のプロンプトは完了し、_次_ のプロンプトが拒否されます。推定の場合、`allowed` は常に true です (アドバイザリ)。
- **コスト (`usd`)** は、オペレーターが提供するモデルごとのレートテーブルによってトークンを乗算します (qwen-code はマルチモデルであり、単一の価格はありません)。エントリがない場合 → `tokens` + 1回限りの警告にフォールバックします。
- **設定。** `ChannelConfig` (`types.ts:27-51`) に `budget?: { unit; limit; windowMs; reset? }` が追加され、`parseChannelConfig` によって解析されます。デーモンパスでは、`ServeOptions` に `--budget-org-daily`/`--budget-unit` が追加され、(`rateLimit` をすでに報告している `daemon-status.ts`, `:295-297`) に並行する `budget` ブロックが追加されます。
#### Audit log — ターンに人間の senderId を付与する (Fix #7)

`PermissionAuditRing` (`permission-audit.ts:128-172`、FIFO 512) は適切な基盤ですが、すべての行が `clientId` をキーとしています。**設計 — チャネル側での sender↦turn のバインディング** (`RequestAttributionRing.ts`、同じ FIFO 形状)。

**単純なタイムスタンプ結合は `followup` 環境では誤りとなる (Fix #7)。** v1 では、パーミッション行を「その `sessionId` の中で、`recordedAtMs` がパーミッションの `issuedAtMs` より前の、最も新しい attribution 行」に結合することを提案していました。`followup` では、複数の sender が `sessionQueues` 経由で **1つの** `sessionId` にキューイングされます。最も最近キューイングされた sender は、ツール呼び出し/パーミッションが発火したときにターンが *実行中* の sender とは異なることがよくあります。したがって、タイムスタンプ結合は体系的に誤った属性付けを行います。

**修正: キューイングされたプロンプトと共に `senderId` を運ぶ。** `handleInbound()` が `sessionQueues` にエンキューするとき（およびスケジューラが proactive fire をエンキューするとき）、キューアイテム/合成ターンコンテキストはそれ自身の `{ senderId, senderName, requestSeq }` を保持します。ターン中に発生するツール呼び出し/パーミッションの属性は、タイムスタンプスキャンではなく、**現在実行中のターン**（FIFO の先頭）から読み取られます。具体的には、`sessionQueues` チェーンは、実行が先頭に到達した瞬間（`bridge.prompt()` の直前）にターンごとの `currentTurnAttribution.set(sessionId, {senderId, ...})` をスタンプし、実行が解決したときにそれをクリアします。audit 行はそのマップを読み取ります。Proactive fires も同じ方法で `createdBy` をスタンプします（§6.2 ステップ 3）。これは実行中のターンに対して正確であり、エンキュー順序の影響を受けません。

admission 時に 6 番目の行タイプ **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`** を追加し、読み取り専用ワークであっても audit が「誰がこのタスクを開始したか」に答えられるようにします。`PermissionAuditEntry` 共用体 (`:57-104`) は閉じており、コンシューマは `kind` で switch するため、これを拡張する（または兄弟 ring を追加する）とすべてのコンシューマに影響が及びます。

**クエリパス。** Phase-1+ daemon: `GET /workspace/audit`（bearer + `createMutationGate` strict、`auth.ts:356`）を追加し、bridge クロージャから ring を公開します（ファイルのヘッダードキュメントはこれを予見しており、`:22-25`）。Phase-0 `AcpBridge`: `sendMessage` 経由の `/audit` チャネルコマンド。**耐久性:** ring は 512 個のインメモリエントリであり、**再起動時に失われます** — これは既知の v1 の制限です。フォローアップ（OD-11）は、**`~/.qwen` への追記専用の結合 audit** を永続化します。

**コンセンサス投票者は人間ではない。** `votersAtIssue` は daemon がスタンプした `clientId` であり、1 つのチャネル = 1 つの `clientId` であるため、DingTalk グループでの「コンセンサス」は、そのままでは daemon クライアント間のコンセンサスとなります。人間レベルの投票には、`senderId` → 個別の投票をマッピングする登録済み承認者名簿が必要です — これは OD-3 Phase-2 の要件であり、解決済みの機能ではありません。

#### ID 別のツールおよびデータ分離

1. **チャネル別のツール許可/拒否。** `Config` は `coreTools`/`allowedTools`/`excludeTools` (`:727-729`) をサポートし、`getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()` 経由で公開されます（**`getAllowedTools()`/`getBlockedTools()` は存在しません**）。Phase 0 の `AcpBridge` パスではチャネルごとに子プロセスを生成しますが、`AcpBridgeOptions` は `{ cliEntryPath, cwd, model }` (`:17-21`) のみを保持し、`start()` は `--acp`+`--model` (`:56-63`) のみを転送します。チャネル別のスコープを提供するには、新しい `AcpBridgeOptions` フィールド、`Config` への新しい `--acp` フラグ、および新しい `ChannelConfig` フィールドが必要です。Phase-1+ daemon パスでは daemon ごとに 1 つの `Config` があるため、スコープはチャネル子プロセスごとではなく daemon ごと（ワークスペースごと、OD-2）になります。
2. **チャネル別の MCP スコープ。** `Config.getMcpServers()` は構築時に設定される `allowedMcpServers` (`:3327-3333`) でフィルタリングします。`ChannelConfig` に `allowMcpServers?: string[]` を追加し、同じ spawn-arg パス（または `AcpBridge.newSession()` が渡す `mcpServers` 配列 — `:133` でハードコードされた `[]`）にスレッド化します。
3. **データ境界としての `sessionScope`。** `'thread'` はグループで 1 つのワーキングツリー/コンテキストを共有させます。チャネル間の分離は、`channelName` で名前空間化されたルーティングキーによって強制されます。`'thread'` グループ内の sender ごとの分離は、設計上分離されません。

**率直な制限:** 認証はユーザーごとのプリンシパルを持たない単一の daemon グローバルトークンであるため、分離は人間ごとではなくチャネルごとになります。真の人間ごとのツール分離には Phase-3 が必要です。

#### Admission パス

```
DingTalk 受信
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [既存 :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [新規]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (steer/cancel には入れない)
            ↳ source==='estimate': allowed always true → WARN のみ (Fix #6)
     3. enqueue onto sessionQueues WITH {senderId, senderName, requestSeq}  [新規 — Fix #7]
        + task.requested row
     4. FIFO 先頭で、currentTurnAttribution をスタンプ → bridge.prompt(...)   [既存 :425]
            ↳ tool call → permission (AcpBridge Phase 0 では自動承認、daemon Phase 1+ ではメディエーター)
                ↳ audit row reads currentTurnAttribution[sessionId]  (実行中のターン)
     5. 完了時: 使用量が判明（daemon）または推定（AcpBridge） → budget.debit(..., source)  [新規]
            ↳ 75%/95% アラート投稿は proactive → Build Area 2 に依存
```

明示すべきハード依存関係: (1) 実際のトークンデビット（したがってハード拒否）には Phase-1+ daemon の使用量パスが必要です — それまで budget は助言的なものとなります（Fix #6）；(2) proactive budget アラートには Build Area 2 が必要です；(3) 人間レベルのコンセンサス投票と人間レベルの audit 属性付けには、OD-3 の登録済み承認者名簿が必要です。

### 6.5 DingTalk プラットフォーム（プライマリ）+ Feishu フォローアップ

> **配線に関する注意（コミットされたアーキテクチャ）。** Phase 0: `qwen channel start` は `AcpBridge` (`start.ts:213,350`; `AcpBridge.ts:38`) を構築し、`node <cli> --acp` を生成して `newSession(cwd)`/`loadSession(sessionId, cwd)` (`:131,137`) を公開します。セッションスコープは bridge ではなく `SessionRouter` が所有します。Phase 1+: チャネルは `DaemonChannelBridge` 経由で `qwen serve` 配下でホストされます（`'thread'` のデフォルトは `:229,240`、オーバーラップ時のスローは `:257-261`）。この移行はコミットされており、オプションではありません（§1）。

#### sessionWebhook 期限切れの問題

DingTalk Stream モードは、短期間の `sessionWebhook` を添えて各受信を配信します。アダプタはそれを `conversationId` をキーとしてキャッシュし（`:84`、`onMessage()` `:517` で設定）、`sendMessage()` (`:134-170`) がそれを参照して、存在しない場合は `No webhook for chatId` をログに出力してサイレントにリターンします（`:137-141`）。proactive 利用における 2 つの致命的な事実: (1) webhook は**期限切れになる**（SDK 型 `RobotMessageBase` は `sessionWebhookExpiredTime` を保持するが（`constants.d.ts:13`）、アダプタの `DingTalkMessageData` インターフェースはそれを省略しており決して読み取らない — キャッシュされた webhook はホットウィンドウ内でも古くなる可能性がある）；(2) マップは受信トラフィックによってのみ設定されるため、コールドグループにはエントリが存在しません。

#### ロボット proactive-message (主动消息) API 経由のコールドグループプッシュ — 検証済み (OD-7)

修正は DingTalk のボット proactive-message API、つまり **`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** です（エンドポイントは高信頼度で検証済み）。webhook とは異なり、これは永続的な **`openConversationId`**（高信頼度で検証済み）でアドレス指定され、**`x-acs-dingtalk-access-token`** ヘッダーで認証され（高信頼度で検証済み — `emotionApi()` `:188-207` および `downloadMedia()` `media.ts:36-43` で既に使用）、ボットの **`robotCode`** を保持します（高信頼度で検証済み；= `config.clientId`、`:184,435`）。ボディは `msgKey`/`msgParam` のペア（高信頼度で検証済み）であり、**`msgParam`** 自体が JSON エンコードされた文字列（ネストされたオブジェクトではない）です。例えば `msgKey:'sampleMarkdown'` の場合:

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // 永続的なグループ ID（受信 conversationId から。無効な場合は変換）
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<preview title>\",\"text\":\"# hi\\n...markdown ≤ ~5000 chars\"}",
}
```

これは `sendMessage()` に並ぶ**新しいメソッド**であり、それの変更ではありません（§6.2 のスケッチ）。`ChannelBase.sendMessage()` は抽象的なままです（`:81`）。proactive エンジンには、新しい `pushProactive?(target, text)` アウトバウンドシームが必要です — 完全に新規であり、中心的なプラットフォームの成果物です。**エンドポイント/パラメータ/`msgParam` 形状について、公式 send ドキュメント + aliyun ask/559227, ask/585232 + メッセージタイプドキュメントに基づき [高] で検証済み**。

**パーミッションの前提条件:** `groupMessages/send` が機能する前に、「proactive グループチャットメッセージの送信」ロボット/メッセージパーミッションを企業内部アプリに付与する必要があります（send ドキュメントにこの前提条件が記載されています）（パーミッションを有効にする必要があることは高信頼度で検証済み）。**まだフラグ付き（低信頼度）:** 正確なパーミッションポイントの表示名/コードは、このセッションのドキュメントからは特定できていません — DingTalk コンソールでは、アプリの 权限管理 の下にロボット/メッセージ送信パーミッションとして表示されています（一般的にロボットメッセージファミリー、例: `qyapi_robot_sendmsg` / 企业机器人发送消息权限）。コンソールで確認し、コードをハードにアサート**しないでください**。アダプタは `!resp.ok`/throw 時に `resp.status` + ボディをログに出力する必要があります — 現在の `emotionApi` の空の catch (`:214-216`) は、パーミッション不足のミス設定を隠してしまうアンチパターンです。

#### openConversationId の取得と永続化

2 つのソース: (1) 受信からの収集 — すべてのメッセージは `conversationId` (`:506`) を保持し、emotion API へ `openConversationId` として転送されます（`:197`）。確認した瞬間に永続化します。aliyun ask/559227, ask/585233 + 一致する 'cid' 形式に基づき、コールバック `conversationId`（cid プレフィックス）が標準グループ @-コールバックの `openConversationId` として直接使用可能であることは **[中] で検証済み**。**まだフラグ付き:** cool-app 以外のロボットに対してこれらを等価とする公式の逐語的な文はありません。ドキュメントで保証されている取得パスは、**`chatId` → `openConversationId` 変換 API** (`obtain-group-openconversationid`)、またはグループ作成 API / `chooseChat` JSAPI からの取得、または cool-app コールバック（`openConversationId`+`coolAppCode` を直接配信）です。**フォールバック:** `invalid.openConversationId` の場合は、`chatId` API 経由で変換してリトライします。(2) `registerAllEventListener` (`client.mjs:58-61`) 経由の bot-added-to-group イベント: イベントはデフォルトの `topic:'*'` (`client.mjs:14-19,241-254`) の下で `onEvent` → `onEventReceived` と流れますが、アダプタはロボット*コールバック* (`:107`) のみをインストールするため、org/bot イベントは現在受信され、no-op のデフォルトにドロップされます（`client.mjs:35-37`）。インストール時のイベント topic と `openConversationId` フィールドは未検証です — イベント名をハードコード**しないでください**。

**永続化。** `SessionRouter` ターゲットではなく、**別の `~/.qwen/channels/dingtalk-groups.json`** ストアを使用します。グループ ID はどのセッションよりも長く存続する必要があるためです（cron 駆動のコールドグループプッシュはライブセッションなしで発生します）。また、`PersistedEntry` はルーティングキーに対してセッションが作成された後にのみ存在します — グループ ID をセッションのライフタイムに結合すると、コールドグループが表現されなくなります。

#### マルチプレイヤーのスコープはオプトインであり、デフォルトではない

`'thread'` スコープ (`:53`) はグループごとに 1 つの共有エージェントを提供するものですが、`parseChannelConfig()` は `sessionScope` のデフォルトを `'user'` (`config-utils.ts:91-92`) としており、これはメンバーごとのセッションを提供します。オペレーターは明示的に `sessionScope: 'thread'` を設定する必要があります。設定すると、2 つのマルチプレイヤーの結果が適用されます: (a) デフォルトの `dispatchMode: 'steer'` は、いずれかのメンバーがメッセージを送信すると実行中のワークをキャンセルします (`:371-379`) — タグプロファイルは `'followup'` を設定します（§6.1）；(b) sender 属性付けのギャップ（§6.1）。

#### 受信 @ の解析

グループゲーティングは機能します: `GroupGate` は `data.isInAtList` (`:520`) から設定される `envelope.isMentioned` を使用します。テキストクリーンアップは最初の `@token` (`:527-529`) のみを削除し、ID ベースではなく位置ベースです — `@qwen @alice` は正しいですが、人間が先頭のメンションでは人間のものが削除されます。強化のフォローアップでは、ボット自身の `chatbotUserId` で削除します。返信/引用コンテキストは抽出され（`extractQuotedContext()`、`:272-298`）、`isReplyToBot` は `chatbotUserId` に対して計算され（`:280,292`）、`referencedText` は `[Replying to: "…"]` として注入されます（`ChannelBase.ts:317-319`）。sender 属性付けは、§6.1 で `[senderName]` プレフィックス経由で閉じられています。

#### Markdown / カードレンダリング

`markdown.ts` は、proactive パスが再利用するプラットフォーム正規化をすでに行っています: テーブル → パイプテキスト（`convertTables()`、`:44-80`）、フェンスバランシングを伴う 3800 文字でのチャンキング（`splitChunks()`、`:84-188`；`CHUNK_LIMIT=3800`、`:10`）、20 文字にスライスされたタイトル抽出でフォールバックは `'Reply'`（`extractTitle()`、`:190-195`）。再利用は、`sampleMarkdown` テンプレートが同じ markdown サブセットと最大 **~5000 文字**のボディを受け入れる場合に条件付けられます（高信頼度で検証済み — メッセージタイプドキュメント）。`CHUNK_LIMIT` をその予算以下に保ちます。ストリーミングインタラクティブカード（`TOPIC_CARD` パス、`constants.d.ts:4`） — Feishu のストリーミングカードに相当するもの — は、プライマリマイルストーンの範囲外です。v1 proactive は markdown メッセージベースです。

#### Feishu フォローアップ（簡潔に）

Feishu は、まさに重要な軸において先行しています: proactive 送信はネイティブであり（任意の `chat_id` への `sendMessage(chatId, text)`、`:622-676` — コールドグループの問題なし；`canColdSend = true`）、期限追跡リフレッシュを伴う安定した `tenant_access_token`（`refreshToken()`、`:581-620` — DingTalk がまだ必要としている作業）、柔軟なイベントサブスクリプション（WebSocket または HMAC webhook、`:146-176`）、および第一級のストリーミングカード（`markdown.ts`、`:742-792`）を備えています。**しかし、共有されている `ChannelBase`/`SessionRouter` の問題 — オプトインの `'thread'` スコープ、`dispatchMode` のキャンセル、欠落している sender 属性付け、新しいアウトバウンドシーム — は Feishu にもそのまま適用されます。** Feishu は*到達可能性*を解決しますが、*誰が何を言ったか*や*あるメンバーが別のメンバーをキャンセルする問題*は解決しません。proactive エンジンを Feishu に移植する場合、既存の `sendMessage()` を直接再利用します（ベースの `pushProactive` デフォルト）。唯一の新しいプラットフォーム作業は、エンジンのターゲットグループを永続化された `chat_id` にマッピングし、オプションでストリーミングカードパス経由でルーティングすることです。

---

## 7. フェーズ分けされたロールアウト（Phase 0–2）と MVP

各フェーズは独立してマージ可能であり、デモ可能な状態で終了し、明示的な受け入れ基準によってゲーティングされます。**Phase 0** は、既存のスタックを共有レジデントエージェントのように動作させます — `AcpBridge` 上の設定といくつかの小さなコード変更です。**Phase 1** はチャネルホスティングを `qwen serve`（コミットされたアーキテクチャ）に移行し、proactive エンジンと単一の MVP クローズドループを追加します。**Phase 2** はチャネルメモリ、budget、audit を追加します。

### トポロジー: コミットされた daemon 移行（旧 OD-1）

決定は下されており、保留ではありません: Phase 0 は `AcpBridge` で出荷されます。**Phase 1+ はチャネルを `qwen serve` 配下で実行します**（`DaemonChannelBridge` または daemon チャネルランナー経由）。ルームごとのメモリ永続化、パーミッションメディエーター、イベントバス audit、FIFO `promptQueue`、および budget/audit クエリルートはすべて daemon を必要とするためです。ゲートウェイ所有のスケジューラ（§6.2）は**移行ニュートラル**です — bridge に関係なく `ChannelBase.sessionQueues` 経由で直列化されるため、Phase 1 で出荷され、切り替えの影響を受けません。**Phase 0 の配線は `DaemonChannelBridge` アタッチパス（または `--daemon <url>` フラグ）を追加**するため、移行は Phase-1 境界での設定ステップとなり、書き換えではありません。スケジューラが設計されている鋭いエッジに注意してください: `DaemonChannelBridge.prompt()` はキューイング**せず**、オーバーラップ時に `Prompt already in flight` を*スロー*します（`:257-261`）。daemon FIFO `promptQueue` は acp-bridge 側（`bridge.ts:2855,3082`）にあり、チャネル側の直列化は `ChannelBase.sessionQueues` (`:394`) です。これが、proactive エンジンがターンがアクティブな間に `prompt()` を決して呼び出さない理由です（§6.2、Fix #1）。

### Phase 0 — 設定 + ID 注入（`AcpBridge` 上）

**目標。** どのメンバーがボットを @-メンションしても、すべてのメンバーが 1 つのセッションを共有し、エージェントが誰が話しているかを知り、実行中のタスクがチームメイトの followup によって破壊されない DingTalk グループ。

**0.1 — 「qwen tag」設定プロファイル**（主に `settings.json`）:

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // マルチプレイヤー: グループ全体で 1 つの sessionId を共有。routingKey → `${name}:${threadId||chatId}` (:53)。
    // DingTalk は threadId を設定しない (:541-551) → キーは chatId = conversationId||sessionWebhook (:534) にフォールバック。
    // conversationId のないメッセージは一時的な webhook をキーとする — これはハードエラーとして扱う。
    "sessionScope": "thread",

    // groupPolicy のデフォルトは "disabled" (GroupGate :13; config-utils :98) — 設定しないとすべてのグループメッセージがドロップされる。
    // 許可リストモードでは、"*" はメンバーシップのワイルドカードではない (GroupGate :42)。各 chatId をリスト化する。"*" はデフォルトのみを提供する。
    "groupPolicy": "allowlist",
    "groups": {
      "cidXXXXXXXX": { "requireMention": true, "dispatchMode": "followup" },
      "*": { "requireMention": true, "dispatchMode": "followup" },
    },
    "senderPolicy": "open",
    "instructions": "You are the team's shared engineering agent in this DingTalk group...",
  },
}
```

事実に基づいた注意: `requireMention` のデフォルトは `true` (`GroupGate.ts:49`) です。`sessionScope` のデフォルトは `'user'` (`config-utils.ts:92`) です — `'thread'` がマルチプレイヤー機構の全体です。`dispatchMode` のグループデフォルトは `'followup'` にすべきです（ランタイムの `'steer'` ではなく、`:354`）。

**0.2 — Sender 属性付け。** `promptText` シード (`ChannelBase.ts:316`) の `[senderName]` プレフィックスは、`isGroup` でゲーティングされ、すべてのターンで発火し（`instructedSessions` によってゲーティングされない）、新しい `Envelope.alreadyPrefixed` フラグが `collect` の再エントリーをガードします。§6.1 を参照。

**0.3 — `dispatchMode` の調整。** グループごとの `dispatchMode` を明示的に設定します。古い `types.ts:42` の JSDoc（`'collect'` → `'steer'`）を修正し、コードとコメントを一致させます（OD-5）。

**変更されるファイル（Phase 0）。** `start.ts`（オプションの `DaemonChannelBridge` アタッチパスを追加し、Phase 1 のコミットされた移行を 1 つのフラグで可能にする）；`ChannelBase.ts`（`senderName` シード + `alreadyPrefixed` ガード + `/clear` confirm+allowlist ゲート + `/who`）；`types.ts`（新しい `Envelope.alreadyPrefixed` フィールド + JSDoc 修正）；`docs/`（レシピ + 注意点）。

**受け入れ基準。**

- [ ] 2 人のメンバーがボットを @-メンションする。両方が**同じ** `sessionId` に解決される（`SessionRouter` マップ経由でアサート）。ルーティングキーは webhook URL ではなく `team-eng:<conversationId>` である。
- [ ] エージェントが sender 属性付けを使用する（グループでは `[senderName]` が存在し、1:1 では存在しない）。`collect` の再エントリーでプレフィックスが二重にならない（`alreadyPrefixed` パスをアサート）。
- [ ] メンションのないグループメッセージはドロップされる（理由 `mention_required`）。許可リストにないグループはドロップされる（`not_allowlisted`）。
- [ ] `dispatchMode: 'followup'` で、メンバー A のタスク中にメンバー B がメッセージを送信しても A はキャンセルされない。B のメッセージは A の後に実行される。
- [ ] 共有（thread）グループで、`/clear` は `confirm` を必要とし、設定されている場合は `config.allowedUsers` に制限される（自由なリセットではない）。`/status` は読み取り専用のまま。
- [ ] フックレベルのユニットテスト（`wait(ms)` UI テストではない）。送信者間でのルーティングキーの等価性。`isGroup` が true と false の場合の `promptText` プレフィックスの存在。`alreadyPrefixed` のスキップ。

### Phase 1 — Daemon 移行 + Proactive エンジン + MVP クローズドループ

**MVP の定義。** 単一のスケジュールされたダイジェストクローズドループ: オペレーターがチャネルの cron スタイルのジョブを登録します。発火時、ゲートウェイはチャネルの thread スコープセッションを解決し、ツールでプロンプトを実行し、**結果をプロンプトなしでコールドチャネルに投稿**します。1 つのジョブ、1 つのチャネル、1 つの配信パス。より豊富な動作は MVP の範囲外です。

**コミットされた移行。** Phase 1 は、`DaemonChannelBridge` 経由で `qwen serve` 配下にチャネルをホストします（OD-1 の決定）。FIFO `promptQueue`、メディエーター、`eventBus`、およびルートを継承します。proactive エンジンは §6.2 です（ゲートウェイ所有、移行ニュートラルなスケジューラ。`dispatchProactive` は `sessionQueues` 経由で直列化。検証済みの `groupMessages/send` API による DingTalk コールド送信フォールバック。`tokenManager` リフレッシュ。`canColdSend` ケーパビリティフラグ）。3 つの事実がそれを自明でないものにしています: 現在の cron はセッションスコープであり dispose 時に終了します（OD-8 単一所有者ゲートでクローズ）。DingTalk はコールドグループにメッセージを送信できません（検証済みの proactive API + 永続化された `openConversationId` でクローズ）。そして、proactive プロンプトは `sessionQueues` 経由で直列化されなければならず、`activePrompts` が保持されている間に `bridge.prompt()` を**決して**呼び出してはなりません — そうしないと `DaemonChannelBridge` が `Prompt already in flight` をスローします（`:257-261`）。
**変更対象のパッケージ。** `ChannelCronStore.ts`/`ChannelCronScheduler.ts`（新規、channel-base）; `cronParser.ts`（再利用）; `ChannelBase.ts`（`dispatchProactive`、`pushProactive`、`canColdSend` フラグ、`/schedule`）; `DingtalkAdapter.ts` + `dingtalk/src/proactive.ts`（新規のコールド送信 + 永続化された `openConversationId` + `tokenManager`）; `FeishuAdapter.ts`（変更なし。プロアクティブ対応アダプターの参照、`canColdSend = true`）; `start.ts`（デーモン下でホスト。`restoreSessions()` 後にスケジューラーを構築・開始。セッション構築時に `isTagSession` をスルーし、セッション内 cron を無効化 — OD-8）; セッション構築（タグセッションでは `startCronScheduler()` をスキップ、`Session.ts:667-668`）。

**受け入れ基準。**

- [ ] チャネルは `qwen serve`（デーモンホスト）下で実行される。ツール呼び出しによって `permission_request` が表面化し（メディエーターに到達可能）、マイグレーションが確認される。
- [ ] オペレーターが1つのダイジェストジョブを登録する。これはゲートウェイの再起動をまたいで永続化される（`~/.qwen/channels/cron.json` から再読み込みされる）。
- [ ] ジョブが**セッションなし**で発火したとき、ゲートウェイはスレッドスコープのセッションを解決し、ツールを使ってプロンプトを実行し、コールド送信パス経由でアイドル状態の DingTalk グループに配信する。これによりコールドグループ配信が証明される。エンジンは `canColdSend = false` の場合、**フェイルラウド**（ログ出力、`lastError` の記録、サイレントな no-op の回避）する。
- [ ] 同じジョブが `tenant_access_token` 経由で Feishu に配信され、`canColdSend` の抽象化が証明される。
- [ ] 発火したジョブが「1セッションにつき1プロンプト」に違反しない。メンバーが会話中の場合、プロアクティブプロンプトは `sessionQueues` 経由でその後ろにキューイングされ（`activePrompts.get(sessionId)?.done` を await）、`steer` によるキャンセルは一切行われず、`DaemonChannelBridge` のオーバーラップスローも決してトリガーしない。
- [ ] プロアクティブターンは、その後の人間のターンによってキャンセルされない（タググループは `followup` であり、決して `steer` ではない）。
- [ ] `tokenManager` は約2時間の有効期限切れ前および 401 エラー時に v1.0 `accessToken` をリフレッシュするため、ソケットが2時間以上オープンされた後の送信でも成功する。
- [ ] 永続化ジョブの二重発火は発生しない。ゲートウェイのスケジューラーが唯一のオーナーであり、タグセッションはセッション内 cron を起動しない（OD-8）。2つのストアは互いに素なパス上にある。
- [ ] ジョブを削除すると、将来の発火が停止する。
- [ ] フック/サービスレベルのテスト（フェイククロックに対するスケジューラー、モック HTTP クライアントに対するコールド送信）— `wait(ms)` は使用しない。

### Phase 2 — チャネルメモリ + トークン予算 + 監査ログ

**2.1 — チャネルスコープのメモリ**（§6.3）: `writeContextFile.ts` に `'channel'` スコープと `channelKey` を追加（`WriteContextFileScope` `:80`、`WriteContextFileOptions` `:83-97`、`resolveContextFilePath` `:223-240`）。`~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md` を出荷。CLI レイヤーの `readChannelMemory`/`writeChannelMemory` コールバックを `ChannelBaseOptions` 経由で配線し、`instructedSessions` を再利用してブートストラップ読み取りを行う。Phase 2 のデーモンルート `POST /channel/:sessionId/memory` はデーモントポロジー下でのみ有効。

**2.2 — チャネルごとのトークン予算**（§6.4）: チャネルをキーとする `BudgetLedger.ts`。**チャネル側の見積もりではアドバイザリ（WARN のみ）とし、実際のデーモン使用量に対してのみハード拒否する**（Fix #6/OD-9）。プロセスごとの組織ロールアップとチャネルごとのウィンドウ、最厳格優先、固定日次ウィンドウ。75%/95% アラート（プロアクティブ送信の依存関係）。

**2.3 — 監査ログ**（§6.4）: `RequestAttributionRing` と `task.requested` 行。**属性は実行中のターンに付随させる（ターンごとの `currentTurnAttribution`）のであり、タイムスタンプ結合ではない**（Fix #7）。`GET /workspace/audit`（デーモン）または `/audit` チャネルコマンド。インメモリ FIFO 512、再起動で失われる（既知の v1 制限。`~/.qwen` への追記専用ファイルは後続対応、OD-11）。

**変更対象のファイル。** `writeContextFile.ts`、`workspace-memory.ts`（スコープの検証 + GET ウォーカー、デーモンパス）; `BudgetLedger.ts`、`RequestAttributionRing.ts`（チャネルベース）; `permission-audit.ts`（パターンソース）/ 新規 `channel-audit.ts`（デーモン）; `ChannelBase.ts`（キューイングされたターンで `senderId`/`senderName` を伝播させる + `currentTurnAttribution`。予算フック）; `server.ts`（`express.json` `:2025` の後にルートをマウントし、`mutate({ strict: true })` でミューテーションをゲート）。

**受け入れ基準。**

- [ ] `scope: 'channel'` は `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md` に書き込む。2つのグループは**独立した**ファイルを取得する。共有ワークスペースの `QWEN.md` は変更されない。書き込みは注入されたコールバックを経由する（`channel-base → core` の依存関係なし）。
- [ ] チャネルメモリの追記は並行性下で冪等であり（ファイルごとのミューテックス）、実際のミューテーションが発生した場合にのみ `memory_changed` を発行する（デーモンパス。サブスクライバー側のフィルタリング）。
- [ ] **デーモン**パスでは、チャネルが実際の使用量ウィンドウの上限を超えた後、次の受信プロンプトは拒否され（切り詰められない）、プロアクティブジョブは一時停止する。カウンターは日次ウィンドウのローリングでリセットされ、予算はチャネルごとに独立している。**見積もりのみ**のパスでは、予算は WARN を出すもののハード拒否はしない（Fix #6）。
- [ ] 送信者 A のキューイングされたターンが実行中にツール呼び出し/権限要求が発生した場合、B が後に `followup` でキューイングしていても、その属性は **A** に帰属される（Fix #7）。
- [ ] すべてのプロアクティブ発火、チャネルメモリ書き込み、予算イベントは、ベストエフォートの `senderId`/`senderName` とともに監査リングに記録され、監査サーフェスから読み取り可能である。**SSE バスではブロードキャストされない**。
- [ ] リング/ルート/リゾルバーのユニットテスト（FIFO 削除、スコープパス解決、予算閾値の計算、実行ターンの属性帰属）— UI/タイミングテストはなし。

### フェーズの境界と今後の指針

フェーズ 0→1→2 は追加的である。マルチプレイヤー + アイデンティティ（`AcpBridge` 上）→ デーモンマイグレーション + プロアクティブ MVP → メモリ + 予算 + 監査。**Phase 3 のマルチアイデンティティゲートウェイ**（チャネルごとに異なるボットアイデンティティ/認証情報、真のユーザーごとのプリンシパル、チャネルごとのトークン）は_スコープ外_であり、シングルグローバルトークン / デーモンごとの1ワークスペースの制約を取り除く自然な次のステップである。フェーズ 0～2 であっても、「qwen tag」は**ワークスペースごとに1つのエージェントプロセス**を必要とする（OD-2）。複数のリポジトリを提供するデプロイメントは、複数のプロセスを実行する。

---

## 8. qwen tag vs Claude Tag（トレードオフ）

Claude Tag はホストされたマルチテナントエージェントである。Anthropic がランタイム、アイデンティティ、ユーザーごとの課金を運用し、チャネルアプリは薄いクライアントである。`qwen tag` はその逆であり、qwen-code のアダプターの上に、オペレーターが制御するインフラで実行される。この反転こそが、全体の価値提案であり、全体のリスクサーフェスである。

### qwen が優位な点

- **オープン / セルフホスト、データは内部に留まる。** エージェントはローカルで実行される。Phase 0 では stdio 経由（`AcpBridge.start()` は `node <cli> --acp` を実行）、Phase 1 からは `qwen serve` 下のインプロセスで実行され、ベンダー API を経由することはない。リポジトリの内容、モデルのトラフィック、トランスクリプトはオペレーターのホスト上に留まる。Claude Tag はこの主張をすることはできない。
- **MCP / 任意のツール。** クローズドなホストエージェントのツールサーフェスの厳密なスーパーセット。
- **アクションごとの権限投票 — _デーモンホスト化後の Phase 1+ の機能_。** qwen-code には `MultiClientPermissionMediator`（4つのポリシー、コンセンサス定足数 `floor(M/2)+1`、別の監査リング）が同梱されている。これは真の差別化要因であり、**Phase 0 の `AcpBridge` パスでは到達不可能**（`requestPermission` は自動承認、`:108-118`）だが、Phase 1 でデーモンがチャネルをホストするようになれば到達可能になる。そこでもなお、投票は `clientId` でキーイングされ、OD-3 の名簿が導入されるまで、チャネルは_単一_のクライアントである。死んだ `ChannelConfig.approvalMode` フィールド（`types.ts:36`）は、計画されていたが不在であることを確認している。
- **永続的で検査可能な状態。** `SessionRouter` の永続化、プレーンな `QWEN.md`/`AGENTS.md` ファイル、および（デーモン、Phase 1+）Last-Event-ID リプレイリング。不透明な部分はない。

### 相違点と補償が必要な点

1. **シングルワークスペース + シングルグローバルトークン + 人間のアイデンティティなし。** 1つのプロセスが1つのワークスペースにバインドされる。マルチワークスペース = N プロセス（OD-2）。シングルグローバルトークンは _HTTP デーモン_ に適用される。Phase 0 の `AcpBridge` チャネルパスには HTTP サーフェスもトークンもない（その境界は `SenderGate`/`GroupGate`）。どこにも人間のアイデンティティはない — `senderName` はアドバイザリなプロンプトテキストのみ（OD-11）。_補償:_ ワークスペース/チームごとに1プロセス。チャネルレイヤーで送信者の属性を注入。`clientId` をセキュリティ境界として維持。ループバック以外のデーモンでは `--require-auth` + トークンを必須とする（OD-12）。
2. **プロアクティブ / コールドチャネルメッセージングが均一ではない。** DingTalk ではリアクティブな返信のみ（期限切れの `sessionWebhook`）。Feishu は `tenant_access_token` 経由で自由に送信する。_補償:_ 永続化された `openConversationId` 上の Phase 1 の検証済みプロアクティブグループ送信（DingTalk、`canColdSend` が true に反転）。Feishu は何も必要としない。
3. **スケジューラーはセッションスコープであり、デーモンスコープではない。** 30分のアイドルリープ時の `dispose()` で cron が死ぬ。_補償:_ ゲートウェイ所有のスケジューラー（§6.2）— 長寿命、リープから生存、唯一の cron オーナー（OD-8）。
4. **メモリはワークスペースグローバルであり、チャネルごとではない。** _補償:_ チャネルごとに1プロセス（コード変更なし）または Phase 2 の `channel` スコープ（OD-10）。
5. **マルチアイデンティティ / 真のマルチテナントはスコープ外**（Phase 3）。フェーズ 0～2 ではマルチプロセスとしてモデル化される。

### リスクと緩和策

| #   | リスク                                                                                                                                                   | 重大度 | 緩和策                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | チャネルスタックのツール呼び出しは、Phase 0 の `AcpBridge` パスで**自動承認**される（`AcpBridge.ts:108-118`）— リークしたチャネルはゲートなしで任意のツールを実行する。 | 高     | コミットされた Phase 1 のデーモンマイグレーションでメディエーターが導入される。それまではツールセットと信頼できるホストを制限する。                                                           |
| R2  | デーモンのシングルグローバルトークンのリークにより、ワークスペース全体へのアクセスが許可される（HTTP デーモンパス。`AcpBridge` パスにはトークンがない）。                                    | 高     | ループバックデフォルト + ベアラゲート。ループバック以外では `--require-auth`（OD-12）。信頼できるホスト。再起動によるローテーション。配線後は `consensus` の背後に破壊的なツールをゲートする。 |
| R3  | `dispatchMode` のデフォルト `'steer'` が、任意のメンバーのメッセージで実行中の作業をキャンセルする（JSDoc は `'collect'` と言っていたが、現在は `'steer'` に修正済み、`types.ts:42`）。       | 高     | タググループは `'followup'` を設定。JSDoc を整合させた（OD-5）。                                                                                                             |
| R4  | 送信者の属性が欠落しているため、エージェントが話者を混同する。                                                                                                 | 高     | グループターンのための Phase 0 の `[senderName]` 注入（+ `alreadyPrefixed`、OD-6）。                                                                                     |
| R5  | DingTalk のコールドグループ / 期限切れウェブフックのプロアクティブ送信がサイレントに失敗する（`:137-141`）。                                                                         | 中   | 永続化された `openConversationId` 上の Phase 1 の検証済みプロアクティブグループ送信。`canColdSend` のフェイルラウド。劣化を表面化させる。                                           |
| R6  | セッションリープ（30分、`run-qwen-serve.ts:94`）で cron/通知が死ぬ。また、送信パスも必要（R5）。                                             | 中   | ゲートウェイ所有のスケジューラー（§6.2）。OD-8 の唯一のオーナーゲート。                                                                                                             |
| R7  | `requireMention` が true の場合、メンションされていないグループメッセージがサイレントにドロップされる（`GroupGate.ts:51-52`）。                                                            | 低/中  | デフォルトを維持。ドキュメント化。オプションの初回メッセージヒント。                                                                                                          |
| R8  | 共有ワークスペースのメモリが、同居しているグループ間で交差汚染する。                                                                                           | 中   | チャネルごとに1プロセス、または Phase 2 の `channel` スコープ（OD-10）。                                                                                                       |
| R9  | レート制限は `clientId`/IP ごとであり、ユーザーごとではない（デーモンパス）。`AcpBridge` パスには存在しない。                                                                | 低      | シングルテナントでは許容。ユーザーごとの課金は Phase 3。                                                                                                       |
| R10 | コンセンサスの投票者セットはリクエスト時にスナップショットされる。今日のチャネルメンバーは個別の `clientId` ではない。                                                    | 低      | OD-3: Phase 1 の `first-responder`。コンセンサスの前に `senderId` → 投票のマッピングを解決する。                                                                                  |
| R11 | DingTalk SDK は、ソケットが閉じない限り約2時間のアクセストークンをリフレッシュしない — プロアクティブ/感情/メディアがサイレントに失敗する。                                   | 高     | プロアクティブ機能が所有する `tokenManager`。v1.0 の `oauth2/accessToken` エンドポイント経由でリフレッシュする（§6.2、検証済み）。                                            |
| R12 | 人間のターン中に `DaemonChannelBridge.prompt()` を呼び出すプロアクティブ発火は、**スロー** する `Prompt already in flight`（`:257-261`）。                     | 高     | `dispatchProactive` は `sessionQueues` を介して直列化し、`bridge.prompt()` の前に `activePrompts` を await する — スローガードは構造的に到達不可能（Fix #1、§6.2）。 |
| R13 | 見積もり予算の偽陽性が、正当なユーザープロンプトを拒否する可能性がある。                                                                                | 中   | 見積もりは WARN のみ。実際のデーモン使用量に対してのみハード拒否する（Fix #6、§6.4）。                                                                                       |
| R14 | `followup` のキューイングが、ツール呼び出しを最後にキューイングされた送信者に誤って帰属させる。                                                                    | 中   | キューイングされたターンで `senderId` を伝播させる。監査は実行中のターンを読み取る（Fix #7、§6.4）。                                                                               |

---

## 9. 解決済みの決定

すべての v1 Open Decisions は以下で解決され、選択された回答が示されている。**唯一残っている真にオープンな項目**は、最終行に記載されている OD-7 の下の信頼度の低い DingTalk API の詳細である。

| ID                        | 質問                                                                                       | **決定**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | チャネルホスティングを Phase 1+ 用に `qwen serve` にマイグレーションするか、`AcpBridge` に留まるか？                | **解決済み — マイグレーションする。** Phase 0 は `AcpBridge` で出荷される。**Phase 1+ は `DaemonChannelBridge` / デーモンチャネルランナー経由で `qwen serve` 下にチャネルをホストし**、FIFO `promptQueue`、`MultiClientPermissionMediator`、`eventBus`、`/workspace/memory`、およびレート制限を継承する。Phase 0 はアタッチパス（または `--daemon <url>`）を追加し、切り替えを設定ステップにする。ゲートウェイのスケジューラー（§6.2）はマイグレーションに対して中立である。もはやゲートではなく、コミットされたアーキテクチャ。                                                                                                                                                                                                                                                                                                                                                                                |
| **OD-2**                  | デプロイメントユニット = ワークスペース/チャネルごとに1プロセス？                                           | **解決済み — はい。** ワークスペース/チャネルごとに1プロセス。チャネルごとのメモリ + 秘密の分離、シングルグローバルトークンの影響範囲の限定。複数のチャネルの同居は Phase 3 の課題（`channel` スコープ + ガバナーが必要）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OD-3**                  | マルチプレイヤータグの権限ポリシー（1チャネル = 1デーモン `clientId`）？                 | **解決済み — Phase 1: 単一のチャネルレベル `clientId` を持つ `first-responder`**（許可された任意のメンバーが解決。チャネル粒度の属性。`senderId→clientId` マップなし）。**Phase 2: `senderId→clientId` 名簿 + ライフサイクル（リーピング、参照カウント境界）が存在するようになったら `consensus`/`designated`**。**プロアクティブターンでの高リスクツールの自動拒否。**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | スレッドスコープの `/clear`/`/status` はチャネル全体に及ぶ。                                             | **解決済み — 共有（スレッド）グループでは `/clear` は `confirm` を必要とし、設定されている場合は `config.allowedUsers` に制限される**（ハイフン区切りの `/clear-channel` は解析不可能。メンバーごとのオーナーゲートはアイデンティティモデルに延期、OD-3/OD-11）。`/status` は共有セッションで読み取り専用のまま。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | `dispatchMode` のデフォルトの不一致（JSDoc `'collect'` vs ランタイム `'steer'`）。                      | **解決済み — `types.ts:42` の JSDoc を `'steer'` に修正**（ランタイムに一致）。タググループプロファイルは `dispatchMode: 'followup'` を明示的に設定する。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OD-6**                  | 送信者マーカーのフォーマット + `collect` の二重プレフィックス。                                                | **解決済み — ターンごとの `[senderName]` プレフィックス。`instructedSessions` によるゲートは行わない**。さらに、**`collect` モードの合成再入が再プレフィックスをスキップするための、1つの新しいオプション `Envelope` フィールド `alreadyPrefixed`**（`types.ts`）。（v1 の「新しいフィールドなし」という主張を修正。）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | DingTalk プロアクティブ送信: エンドポイント/権限、`openConversationId` の等価性、トークンリフレッシュ。 | **検証済みの事実で解決済み（§6.2/§6.5）:** エンドポイント `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _（高）_; ボディ `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _（高）_; 認証ヘッダー `x-acs-dingtalk-access-token`。v1.0 の `oauth2/accessToken` トークン、約7200秒の TTL、機能所有の `tokenManager` によってキャッシュおよびリフレッシュ _（高）_; `openConversationId` を `~/.qwen/channels/dingtalk-groups.json` に永続化。コールバックの `conversationId` ≈ `openConversationId` _（中。`invalid.openConversationId` の場合は `chatId→openConversationId` 変換 API にフォールバック）_。**残りのオープン（低信頼度）: 正確な権限ポイントコード/表示名。公式の等価性の逐語的な文。20回/分のスロットルが `groupMessages/send` に適用されるかどうか。** |
| **OD-8**                  | ゲートウェイとセッションスケジューラー間の cron の二重発火。                                       | **解決済み — ゲートウェイのスケジューラーが唯一の cron オーナーである。** チャネルホストの（タグ）セッションは、セッション内の `Session` cron を**開始しない**。セッション構築時にチャネルホストからスレッドされた `isTagSession` フラグ（Phase 1+ の `DaemonChannelBuilderFactory` オプションバッグ、Phase 0 の `--acp` スポーンオプション）を通じてタグセッションであることを学習し、`startCronScheduler()` をスキップする（`Session.ts:667-668`）。2つの cron ストアは**互いに素なパス**（ゲートウェイ `~/.qwen/channels/cron.json` vs セッション `~/.qwen/tmp/<hash>/scheduled_tasks.json`）上にあるため、同じジョブに対して両方のスケジューラーを実行する衝突リスクのみが存在し、これはゲートによって排除される。                                                                                                                                                                                     |
| **OD-9**                  | トークン予算のスコープ、信頼できる情報源、ウィンドウ。                                                   | **解決済み — プロセスごとの「組織」ロールアップ + チャネルごとのウィンドウ、最厳格優先、固定日次ウィンドウ。** v1 はチャネル側でトークンを見積もり（アドバイザリ、WARN のみ — ハード拒否はしない、Fix #6）、デーモンホスト化後は正確なデビット（およびハード拒否）のために**デーモン使用パス**を読み取る。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | ルームごとのメモリの名前空間 + 書き込み権限。                                                 | **解決済み — `writeContextFile.ts` に `channel` スコープ（+`channelKey`）を追加。チャネルベースは `ChannelBaseOptions` を介して注入された CLI レイヤーのコールバック（`readChannelMemory`/`writeChannelMemory`）によって書き込み/読み取りを取得 — `channel-base → core` の依存関係はなし。** ユーザーグローバルの場所は `~/.qwen/channels/memory/`。エージェントは `save_memory` インテント経由で追記する。ブートストラップ読み取りは `instructedSessions` ゲートを再利用する。                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | 人間のアイデンティティモデル + 監査の耐久性。                                                       | **解決済み — `senderName` はアドバイザリのみ。`clientId` が唯一のセキュリティプリンシパルのまま。** 実行中のターンに付随するベストエフォートの属性（Fix #7）。**インメモリ FIFO 512 監査リング + 追記専用の `~/.qwen` フォローアップファイル**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | ループバック以外のデーモンバックデプロイメントのトークン強化。                                    | **解決済み — ループバック以外のデーモンバックデプロイメントには `--require-auth` + トークンを必須とする。** ループバックのみは開発用。`--require-auth` はドキュメント化されたデフォルトの姿勢（`run-qwen-serve.ts` はすでにループバック以外でのトークンを強制）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **オープン（唯一の残り）** | OD-7 の下の信頼度の低い DingTalk API の詳細。                                                | **まだオープン — コーディング前にコンソール / ライブドキュメントに対して検証:** (1) 「プロアクティブにグループメッセージを送信」の正確な権限ポイントコード/表示名（低）。(2) 標準の非クールアプリロボットに対してコールバックの `conversationId` と `openConversationId` を等価とする公式の権威ある文（中。ドキュメント保証されたパスは `chatId→openConversationId` 変換 API）。(3) 「20メッセージ/分 → 約10分のスロットル」制限が `groupMessages/send` に逐語的に適用されるかどうか（低/中 — カスタムウェブフックロボットに対してドキュメント化されているが、orgapp 送信ページでは確認されていない）。                                                                                                                                                                                                                                                            |
---

## 10. リスクと緩和策

§8 の統合テーブルを参照してください。重要なリスクを優先度順に示します。

1. **R1 — Phase-0 チャネルパスでの自動承認。** 約束された Phase-1 のデーモン移行によって仲介トランスポートが導入されるまで、チャネル常駐エージェントはガードなしで_任意の_ツールを実行します。最も重要な安全上のギャップであり、Phase 1 までは保守的なツールセット + 信頼されたホストで緩和します。
2. **R12 — プロアクティブなオーバーラップスロー。** 人間のターン中に `DaemonChannelBridge.prompt()` を呼び出すと、`Prompt already in flight` がスローされます（`:257-261`）。これは `sessionQueues` を介した直列化（Fix #1）によって解消されます。これは §6.2 の中心となる機能です。
3. **R11 — DingTalk トークンの有効期限切れ。** 「デモでは動くが、2時間後に死ぬ」という障害です。プロアクティブ機能は、長時間稼働する機能がリリースされる前に、`tokenManager`（検証済み v1.0 エンドポイント、約 7200 秒 TTL）を所有します。
4. **R5 — DingTalk コールドグループの暗黙の失敗。** 検証済みの送信パスなしでは、休止状態のグループへのプロアクティブな出力は不可能です。`canColdSend` はドロップするのではなく、明示的に失敗します。
5. **R3 — グループ内での `steer` キャンセル。** ランタイムのデフォルトでは、マルチプレイヤーによる偶発的な DoS 状態になります。タグプロファイルでは `followup` を設定します。
6. **R13/R14 — バジェットの誤検知と誤帰属。** 見積もりは WARN のみとします（Fix #6）。帰属情報は実行中のターンに付随させます（Fix #7）。
7. **R8 — 共有メモリの交差汚染。** チャネルごとに1プロセスはコード変更なしの緩和策であり、`channel` スコープがコロケーションの解決策です。

各リスクはフェーズにマッピングされます。R1/R3/R4 は Phase 0–1、R5/R6/R11/R12 は Phase 1、R8/R13/R14 および監査/バジェット関連のリスクは Phase 2 です。

---

## 11. 付録: ファイルとシンボルのインデックス

### チャネルベース (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`, thread `:53`, single `:55`, user `:58`), デフォルトスコープ `'user'` (`:25`), `setChannelScope()` (`:40-42`), `resolve()` (`:72-92`), `getTarget()` (`:94`), `persist()`/`restoreSessions()` (`:168-244`), `PersistedEntry` (`:5-9`).
- `ChannelBase.ts` — `handleInbound()` (`:238-471`), プロンプト構築 (`:316-347`), `bridge.prompt()` 呼び出し (`:425`), ゲート (`:240-252`), `dispatchMode` の解決 (`:353-354`), steer (`:371-379`), collect (`:361-370,445-463`), followup (`:381-383,394-470`), `activePrompts` (`:32-35,356`), `sessionQueues` (`:394,466`), 抽象 `sendMessage()` (`:81`), `registerCommand()` (`:141-143`), コンストラクタールーター (`:62-64`), `ChannelBaseOptions` (`:9-22,46`), `/clear`/`/status` (`:147-217`).
- `AcpBridge.ts` — `--acp` の spawn (`:53-70`), `newSession(cwd)` (`:131`), `prompt()` (`:147-180`), `requestPermission` の自動承認 (`:108-118`), `AcpBridgeOptions` (`:17-21`).
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`), セッションファクトリのオプションバッグ (`:226-241`), `activePrompts` ガード / **`Prompt already in flight` のスロー** (`:257-261`), `cancelSession` (`:332`), `respondToPermission` (`:346-374`), 権限イベント (`:557-633`).
- `GroupGate.ts` — `requireMention` デフォルトは true (`:49`), メンバーシップ (`:42`), メンションゲーティング (`:51-52`), フォールバックチェーン (`:48`), デフォルトポリシー `'disabled'` (`:13`).
- `SenderGate.ts` — `check()` + ペアリング (`:42`).
- `types.ts` — `GroupConfig` (`:10-13`), `ChannelConfig` (`:27-51`), `approvalMode` (`:36`), `dispatchMode` JSDoc は `'steer'` に修正 (`:42`), `senderName` (`:69`), 新規 `alreadyPrefixed` フィールド, `isGroup` (`:75`), `SessionTarget` (`:88-93`).

### DingTalk (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — `webhooks` マップ (`:84`), `sendMessage()` (`:134-170`, webhook 不在時の return `:137-141`), webhook キャッシュ (`:516-517`), `getAccessToken()` (`:172-174`), `emotionApi()` (`:188-207`, robotCode `:184`, openConversationId `:197`, 空の catch アンチパターン `:214-216`), media robotCode (`:435`), 受信 `conversationId` (`:506`), メンションの除去 (`:527-529`), `isMentioned` (`:520`), `senderName` (`:544`), `extractQuotedContext()` (`:272-298`), `chatId` (`:534`), `threadId` なし (`:541-551`).
- `proactive.ts` (新規) — `sendGroupMessage()` から `POST /v1.0/robot/groupMessages/send` へ (`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` JSON 文字列), `tokenManager` (v1.0 `oauth2/accessToken`, 約 7200 秒 TTL, タイマー + 401 リフレッシュ), `chatId→openConversationId` 変換のフォールバック。
- `markdown.ts` — `convertTables()` (`:44-80`), `splitChunks()` (`:84-188`), `CHUNK_LIMIT=3800` (`:10`; 約 5000 文字の `sampleMarkdown` バジェット以下), `extractTitle()` (`:190-195`), `normalizeDingTalkMarkdown()` (`:198-201`).
- `media.ts` — `downloadMedia` ヘッダー (`:39`), ボディ `:42`.
- SDK: `client.mjs` gettoken (`:85-87`), 再接続 (`:157-163`), イベント/コールバックの分割 (`:14-19,35-37,58-61,241-257`); `constants.d.ts` `sessionWebhookExpiredTime` (`:13`), `robotCode` (`:19`), `TOPIC_CARD` (`:4`).

### Feishu (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` プロアクティブ (`:622-676`, エンドポイント `:651`; `canColdSend = true`), `refreshToken()` (`:581-620`), `connect()` モード (`:146-176`), `updateCard()` (`:742-792`), 取り込み時の重複排除 (`:1633-1870`).
- `markdown.ts` — schema-v2 カードコンテンツ (`:69-189`), `splitChunks()` (`:198-256`).

### コア (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`, +`'channel'`), `WriteContextFileOptions` (`:83-97`, +`channelKey`), `resolveContextFilePath()` (`:223-240`, +`channel` ブランチ + `channelKey` パラメータ), ファイルごとの mutex (`:48-57,159-162`), 絶対パスガード (`:142-146`), `MAX_EXISTING_FILE_BYTES` (`:255`), 置換モード (`:202-211`).
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`).
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`), プロジェクトごとのハッシュ化パス (`:1-9`).
- `Session.ts` — `cronQueue`/`cronProcessing` フィールド宣言 (`:667-668`), `startCronScheduler()` (`:758`, OD-8 に従いタグセッションではスキップ), `dispose()` cron クリア (`:790-812`), `#recordPromptTokenCount()` (`:2078-2087`), `setNotificationCallback()` (`:2638-2668`), `isIdle()` (`:777`).

### Serve / デーモン (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — `SessionEntry` ごとの FIFO `promptQueue` (`:232,2855,3082`), `publishWorkspaceEvent` (`:3610,3649-3675`).
- `eventBus.ts` — `BridgeEvent.data` 自由形式 (`:51`), `originatorClientId` (`:60`), ヒステリシス閾値 (`:101-103`), リプレイリング (`:92`).
- `permissionMediator.ts` — 4 つのポリシー + コンセンサス定足数 (`:348,621-637`).
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`), 閉じたエントリの共用体 (`:57-104`), GET サーフェスを想定したヘッダードキュメント (`:22-25`).
- `rate-limit.ts` — `(clientId|ip)` ごとのトークンバケット; `X-Qwen-Client-Id` (`:110`).
- `auth.ts` — グローバル bearer トークン (`:259-266`), `createMutationGate` strict (`:356`).
- `workspace-memory.ts` — スコープ `workspace|global` (`:118-125`), 厳格認証による mutate (`:114`), 書き込みごとの上限 `MAX_MEMORY_CONTENT_BYTES` (`:79`), 固定 `projectRoot` の転送 (`:185-190`).

### CLI チャネルコマンド (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`), `AcpBridge` の構築 (`:213,268,356,435`), `setChannelScope` (`:361-362`), `restoreSessions` (`:275,444`), `sessionsPath()` (`:56-58`), `checkDuplicateInstance()` (`:170-179`), 切断ハンドラ (`:241,403`); Phase 1+ デーモンアタッチパス; `readChannelMemory`/`writeChannelMemory` の CLI レイヤーでの注入。
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`, sessionScope デフォルト `:91-92`, approvalMode `:94`, groupPolicy `:98`), `resolveEnvVars()` (`:6-18`).
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`), チャネルタイプ (`:10-14`).