# RFC: "qwen tag" — qwen-code のための永続的、マルチプレイヤー、チャネル常駐エージェント（DingTalkファースト）

**ステータス:** Draft (v2)
**日付:** 2026-06-25
**著者:** (qwen-code)

---

## 変更履歴 (v1 → v2)

この改訂では、v1 のすべての Open Decision をクローズし（現在は **Resolved Decisions**、§9）、レビューで指摘された7つの正確性/一貫性の欠陥を修正しています。2つの主要な変更点は以下の通りです。

- **OD-1 はゲートではなくなり、コミットされたアーキテクチャとなりました。** Phase 0 は現在の `AcpBridge` パスで出荷されます。**Phase 1 以降は、チャネルホスティングを `qwen serve` デーモンに移行します**（`DaemonChannelBridge` / デーモンチャネルランナー経由）。これにより、セッションごとの FIFO `promptQueue`、`MultiClientPermissionMediator`、`eventBus`、`/workspace/memory`、およびレート制限を再利用します。以前「OD-1 open / gates everything」と読めていたすべてのセクションは決定済みとして読めるようになり、デーモンへのコミットは §1, §4, §5, §6.1, §6.2, §6.3, §6.4, §7 に反映されています。
- **プロアクティブな発火パスは、実際に実行されるデーモンパス向けに再設計されました。** v1 の `dispatchProactive` は `AcpBridge` のセマンティクス（チャネル側の `sessionQueues`）向けに記述されていました。デーモン移行により、`DaemonChannelBridge.prompt()` は重複時にキューイングするのではなく、**`Prompt already in flight` をスローします**（`DaemonChannelBridge.ts:257-261`）。v2 では、両バリアントに対してプロアクティブプロンプトを `ChannelBase.sessionQueues` 経由で直列化するため、スローガードがトリガーされることはなく、never-cancellable の不変条件が明示的に記述されています（§6.2）。

組み込まれた解決策と修正:

- **OD-2** 決定: ワークスペース/チャネルごとに1つのプロセス。
- **OD-3** 決定: Phase 1 では `first-responder` + 単一のチャネルレベル `clientId`。Phase 2 では `senderId→clientId` ロースターとライフサイクルが存在した後に `consensus`/`designated` を使用。プロアクティブターンでは高リスクツールを自動拒否。
- **OD-4** 決定: 共有（スレッド）グループでは、`/clear` は明示的な `confirm` を必要とし、そのリストが設定されている場合は `config.allowedUsers` に制限されます。`/status` は読み取り専用。（ハイフン区切りの `/clear-channel` はスラッシュ構文で解析できません。真のメンバーごとのオーナーゲートは ID モデル、つまり OD-3/OD-11 を待っています。）
- **OD-5** 決定: 古い `types.ts:42` の JSDoc を `'steer'` に修正。タググループプロファイルは `dispatchMode: 'followup'` を明示的に設定。
- **OD-6** 決定: ターンごとの `[senderName]` プレフィックス。**`instructedSessions` によってゲートされません**。**1つの新しいオプション `Envelope` フィールド `alreadyPrefixed`** を追加し、`collect` モードの合成再入時に再プレフィックスをスキップします。（v1 の「新しい envelope フィールドなし」という主張を修正 — Fix #2。）
- **OD-7** 解決: 検証済みの DingTalk API の事実を使用（§6.2/§6.5）。低信頼度の項目は引き続きフラグ付き。
- **OD-8** 決定: ゲートウェイ/デーモンスケジューラが**唯一の** cron オーナー。タグセッションはインセッションの `Session` cron を開始**しません**。2つの cron ストアは競合しないパスに存在するため、両方のスケジューラが同じジョブに対して実行されない限り衝突は発生しません。
- **OD-9** 決定: プロセスごとの「org」ロールアップ + チャネルごとのウィンドウ。最も厳しいものが優先される固定のデイリーウィンドウ。v1 はチャネル側でトークンを推定し、デーモンホスト後はデーモンの使用量パスを1回読み取ります。
- **OD-10** 決定: `writeContextFile.ts` に `channel` スコープ（+`channelKey`）を追加。チャネルベースは **`ChannelBaseOptions` 経由で注入される CLI レイヤーのコールバック**を通じて書き込み/読み取りを取得します（`channel-base → core` の依存関係なし）。ユーザーグローバルの場所は `~/.qwen/channels/memory/`。
- **OD-11** 決定: `senderName` は参考情報のみ。`clientId` が唯一のセキュリティプリンシパル。インメモリ監査リング + 追記専用の `~/.qwen` フォローアップファイル。
- **OD-12** 決定: ループバック以外のデーモンバックデプロイメントには `--require-auth` + トークンを必須とする。

OD 解決を超える正確性の修正:

- **Fix #1 — プロアクティブ発火パスの並行性** がデーモンパス向けに再設計され（§6.2）、Phase-0 の `AcpBridge` バリアントと Phase-1 以降のデーモンバリアントの両方に対して never-cancellable の不変条件が適用されます。
- **Fix #2 — 内部矛盾** の削除: §6.1/G2 は「新しい envelope フィールドなし」と主張しなくなりました。1つの `alreadyPrefixed` フィールドを認めています。
- **Fix #3 — メモリ配線** の設計（§6.3）: 正確な `ChannelBaseOptions` の変更（`readChannelMemory`/`writeChannelMemory` コールバック）と、`start.ts` でのそれらの構築/注入元、および `instructedSessions` ゲートを再利用するセッションごとのブートストラップ読み取り。
- **Fix #4 — `canColdSend` ケイパビリティフラグ** の設計（§6.2）: 宣言場所、DingTalk/Feishu での設定方法、およびスケジューラが loud に失敗する方法。
- **Fix #5 — OD-8 の分離ストアの明確化**（§6.2）: ゲートウェイのストアと `Session` のストアは異なるパスです。唯一の衝突リスクは、タグセッションもインセッション cron を実行する場合ですが、これは OD-8 ゲートによって閉じられています。
- **Fix #6 — 推定バジェットの実行**（§6.4）: 推定値は WARN/アラートを出せますが、ユーザープロンプトをハードに拒否してはなりません。ハード拒否は実際のデーモン使用量数値に基づいてのみ行います。
- **Fix #7 — `followup` 下での監査の帰属**（§6.4）: キューイングされたプロンプトと一緒に `senderId` を保持し、ツール呼び出し/権限が最後にキューイングされた送信者ではなく、実際に実行されているターンに帰属するようにします。

v1 から検証済みのグラウンドトゥルースの事実（AcpBridge トポロジ、AcpBridge 自動承認、抽象 `sendMessage`、スコープ、パーサーのデフォルト）は変更せずに保持されています。

---

## 1. 概要

**「qwen tag」** は、チャットチャネル（まずは DingTalk グループ、次に Feishu）内に存在する共有の qwen-code エージェントであり、そのチャネルのメンバーであれば誰でも `@` メンションで呼び出すことができます。呼び出されると、バインドされたワークスペースに対して完全な qwen-code エージェントループ（ツール、ファイル編集、シェル、MCP）を実行し、作業内容をチャネルにストリーミングで返し、**ターンや再起動をまたいでチャネルを記憶**し、聞かれるのを待たずに**プロアクティブまたはスケジュールに従ってアクション**を実行できます。これは Claude Tag のフォームファクター（1:1 の DM ボットではなく、ルームの_住人_となる単一の永続的マルチプレイヤーエージェント）を反映していますが、新しいホスト型サービスではなく、qwen-code の既存のチャネルアダプタースタック（`qwen channel start`、`packages/channels/*`）と `qwen serve` デーモンのみを使用して構築されています。

この RFC の意図的な枠組みは、**フォームファクターのリアクティブな半分はすでに大部分が出荷されており、プロアクティブ/メモリの半分はまだ出荷されていない**という点にあります。Claude Tag スタイルの_応答_エージェントを難しくする部分（セッションを多重化する長時間実行プロセス、1プロンプト/セッションの不変条件を保持するエージェントトランスポート、マルチプレイヤーセッションルーティング、チャネルごとのアクセス制御、ストリーミングカードレンダリング、および永続的なセッション永続化）はすでに存在し、現在のチャネルアダプターによって運用されています。_欠けている_のは、リアクティブな応答ボットを常駐エージェントに変える、適切に境界が引かれた一連の機能、つまり共有セッションでの送信者の帰属、プロアクティブ/スケジュールされた出力パス、ルームごとのメモリ、およびマルチプレイヤーガバナンスです。この RFC では、そのギャップを **4つのビルドエリア** にスコープし、Phase 0–2 にわたって仕様を定めています。

> 「80%」に関する注: 初期のドラフトではこれを「約80%出荷済み」と表現していました。この数値は検証不可能であり、状況を過大評価しています。プロアクティブエンジン全体（ビルドエリア 2）とルームごとのメモリ（ビルドエリア 3）は完全に新規であり、特に DingTalk においてはアウトバウンドの開始パスが_全く_存在しません。代わりに、「リアクティブパスは構築済み。プロアクティブパスとメモリパスは未構築」と表現します。

### RFC 全体を制約するトポロジの事実

チャネルアダプターが qwen エージェントに接続される方法には、**2つの異なるプロセスにおける2つの明確な方法**があり、これらを混同することが初期ドラフトで最も一般的なエラーでした。

- **`qwen channel start <name>`（出荷パス）。** `start.ts` は **`new AcpBridge(bridgeOpts)`** を構築し（`start.ts:213,268,356,435`）、`AcpBridge.start()` は子プロセス `node <cliEntryPath> --acp` を**生成します**（`AcpBridge.ts:53-70`）。これは **stdio** 上の NDJSON 経由で ACP と通信します。この子は_スタンドアロンのエージェント_であり、`qwen serve` HTTP デーモンではありません。このトポロジには **HTTP デーモンも、`/workspace/memory` ルートも、`MultiClientPermissionMediator` も、`eventBus` リプレイリングも、デーモンの `promptQueue` も存在しません**。それらはすべて `packages/acp-bridge` + `packages/cli/src/serve` に存在し、`qwen channel start` はそれらをインスタンス化しません。ここでのプロンプトの直列化は、`ChannelBase`（`ChannelBase.ts:356-391` の `activePrompts` mutex と `:394-470` の `sessionQueues` チェーン）と、子プロセス自体の ACP 1プロンプト/セッションの不変条件によって、完全に**チャネル側**で実行されます。`AcpBridge.requestPermission` は**すべてのツール呼び出しを自動承認します**（`AcpBridge.ts:108-118`）。
- **`qwen serve` + `DaemonChannelBridge`（デーモンホスト）。** `DaemonChannelBridge`（`packages/channels/base/src/DaemonChannelBridge.ts`）は、`sessionFactory` がデーモンの `Session` オブジェクトを生成するインプロセスブリッジです。このパスはデーモン内でチャネルを実行し、それによって `acp-bridge` の FIFO `promptQueue`（`bridge.ts:232,2855,3082`）、`MultiClientPermissionMediator`、`eventBus`、および HTTP ルートを継承します。**`qwen channel start` は現在これをインスタンス化しません**（`start.ts` 内の参照はゼロ）。プロアクティブ設計を形作る鋭いエッジの1つ: `DaemonChannelBridge.prompt()` はキューイング**せず**、重複時に **`Prompt already in flight` をスローします**（`DaemonChannelBridge.ts:257-261`）。最終的に到達する FIFO `promptQueue` はデーモン/acp-bridge 側、つまり_そのインプロセスのスローガードの背後_にあります。したがって、プロアクティブエンジンはチャネルレイヤーで直列化する必要があります（§6.2）。

**コミットされたアーキテクチャ（旧 OD-1、現在決定済み）:** マルチクライアントデーモンの仕組みは、**Phase 1 以降のチャネルホスティングを `qwen serve` デーモンに移行する**ことで再利用されます。

- **Phase 0** は現在の `AcpBridge` パスで出荷されます（ID 注入には HTTP ルートもメディエーターも必要ありません）。
- **Phase 1 以降** は `qwen serve` デーモン下（`DaemonChannelBridge` またはデーモンチャネルランナー経由）でチャネルを実行します。プロアクティブエンジン、ルームごとのメモリ永続化、およびガバナンスはすべて、デーモンの耐久性、ルート、`promptQueue`、メディエーター、およびイベントバスを必要とするためです。

これはもはや「オープン」でも「ゲーティング」でもありません。Phase 0 の配線は `DaemonChannelBridge` アタッチパス（または `--daemon <url>` フラグ）を追加し、移行が Phase 1 の開始時点で利用可能になるようにします。ゲートウェイ所有のスケジューラ（§6.2）は**移行に中立**になるように構築されているため、カットオーバーの前後で同じように動作します。

### 具体的な「qwen tag」の姿

「qwen tag」のデプロイメントは、1つのワークスペースにバインドされた単一のエージェントプロセスと、`qwen channel start dingtalk` アダプターで構成され、グループ全体で **1つ** のエージェントセッションを共有するように設定されます。**2つの異なるスコープの概念**が両方とも一致する必要があります。

1. **チャネルルーティングスコープ**（`ChannelConfig.sessionScope`、`SessionRouter.routingKey()` によって消費）: 受信メッセージをルーティングキーにどのようにマッピングするかを決定します。タグの場合、グループ全体が1つのルーティングキー（`channel:(threadId||chatId)`、`SessionRouter.ts:53`）を共有する必要があるため、`'thread'` でなければなりません。**パーサーのデフォルトは `'thread'` ではなく `'user'` です**（`config-utils.ts:91-92`）。そのため、タグのレシピで明示的に設定する必要があります。
2. **ブリッジ/ACP セッションスコープ**（`DaemonChannelBridge` / `acp-bridge` の `sessionScope`）: デーモンが基盤となる ACP セッションをどのように共有するかを決定します。`DaemonChannelBridge.newSession()` はこれをデフォルトで `'thread'` にします（`DaemonChannelBridge.ts:229,240`）。`acp-bridge` のインプロセスパスはデフォルトで `'single'` です（`bridge.ts:709`）。これはチャネルルーティングスコープとは**別のノブ**であり、`qwen channel start` パスには存在_しません_（`AcpBridge.newSession(cwd)` は `cwd` のみを受け取ります。`AcpBridge.ts:131`）。

これらが揃うと:

- **ルームごとに1つのエージェント、メンションで呼び出し。** `GroupGate` は `requireMention`（デフォルト `true`、`GroupGate.ts:49`）を強制するため、エージェントは `@` メンションされるか、ボットへの返信があるまで沈黙を続けます（`GroupGate.ts:51`）。マルチプレイヤーキーは `sessionScope: 'thread'` であり、`channel:(threadId||chatId)` にマッピングされます（`SessionRouter.ts:50-53`）。これにより、送信者に関係なくすべてのメンバーが同じ `sessionId` を再利用します。
- **ツールを使用した実際のマルチステージ作業。** 受信メッセージは `ChannelBase.handleInbound()` 経由でプロンプトになります。これはメッセージテキスト、返信引用コンテキスト、添付ファイルパス、および（セッションごとに1回）`config.instructions` から `promptText` を構築し（`ChannelBase.ts:316-347`）、`bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` 経由でディスパッチします（`ChannelBase.ts:425` — `promptText` は位置引数であり、オプションオブジェクトは画像フィールドのみを保持します）。
- **作業内容をルームにストリーミングで返す。** アダプターは増分出力をプラットフォームネイティブのカードとしてレンダリングします（Feishu の create/update/finalize、`markdown.ts`。DingTalk のマークダウンチャンキング、`DingtalkAdapter.ts:144-169`）。
- **チャネルを記憶する。** `SessionRouter.persist()` / `restoreSessions()` は `sessionId`、ターゲット、および `cwd` を永続的に保存し、再起動をまたいで `bridge.loadSession()` 経由で再ハイドレートします（`SessionRouter.ts:168-244`）。ワークスペースメモリ（`QWEN.md` / `~/.qwen/QWEN.md`）は `GET` / `POST /workspace/memory` 経由で読み書きされます（`workspace-memory.ts`）。このメモリはワークスペース/グローバルスコープであり、ルームごとではありません。ビルドエリア 3 を参照してください。
- **プロアクティブに/スケジュールに従ってアクションを実行できる。** これはまだエンドツーエンドで存在しない半分であり、Phase 1 の核心です。
---

## 2. Motivation

常駐型マルチプレイヤー _返信_ エージェントが通常必要とするインフラストラクチャは、すでにこのリポジトリで構築されています。真に不足している作業は4つの構築領域です。

| Tag フォームファクタに必要な機能                 | すでに存在するもの (引用)                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 長時間実行されるマルチセッションプロセス                  | `AcpBridge` は長時間稼働する `--acp` 子プロセスを生成し (`AcpBridge.ts:53-70`)、デーモンパスはセッションごとの FIFO `promptQueue` を追加します (`bridge.ts:232,2855,3082`)                                                           |
| マルチプレイヤーの「1ルーム1セッション」ルーティング          | `SessionRouter` の `'thread'` スコープ (`SessionRouter.ts:53`)、チャネルごとのオーバーライド `setChannelScope()` (`SessionRouter.ts:40`)                                                                                  |
| メンションによる呼び出しセマンティクス                          | `GroupGate` の `requireMention` デフォルト `true` (`GroupGate.ts:49-52`)                                                                                                                                          |
| アクセス制御 + オンボーディング                          | `SenderGate` の許可リスト + ペアリングコードフロー。グループ→送信者の順でゲートが適用されます (`ChannelBase.ts:240-252`)                                                                                                      |
| 再起動をまたぐ永続的なセッションマッピング              | `SessionRouter` の永続化 (`SessionRouter.ts:168-244`)                                                                                                                                                    |
| ワークスペースメモリの読み書き                          | `GET` / `POST /workspace/memory` (`workspace-memory.ts`)。ワークスペースおよびグローバルスコープのみ。デーモンのみ                                                                                                       |
| マルチアクターの権限制御 + 監査 (デーモンのみ) | `MultiClientPermissionMediator` の `consensus` クォーラムを含む4つのポリシー (`permissionMediator.ts:621-637`)。個別の権限監査リング (`permission-audit.ts`)                                            |
| 認証、レート制限、ループバックの安全性 (デーモンのみ)   | グローバル Bearer トークン (`auth.ts:259-266`) + クライアントID/IPごとの段階的レート制限 (`rate-limit.ts`)                                                                                                               |
| セッション内プッシュプリミティブ (バックグラウンドタスク)         | `Session` の通知キュー + `setNotificationCallback()` は、バックグラウンドタスク/モニター/シェルの出力を開いているセッションに供給します (`Session.ts:688-689,2638-2668`)。`isIdle()` はこれを考慮します (`Session.ts:777`) |
| プラットフォーム配信 (DingTalk + Feishu)                | ストリーミングカード、メディア、リアクションを備えた動作するアダプタ (`DingtalkAdapter.ts`, `FeishuAdapter.ts`)                                                                                                          |

フェーズ1以降はデーモン配下で実行されるため（コミットされたアーキテクチャ、§1）、上記のデーモン専用の行は、単なる「移行時のターゲット」ではなく、プロアクティブエンジン、メモリ永続化、ガバナンスに対して利用可能な機能となります。

§6 で詳細に説明される4つの構築領域:

1. **Tag を _宣言_ するための設定 + ID (フェーズ 0)。** ドキュメント化された設定レシピ — `sessionScope: 'thread'`, `groupPolicy`, `requireMention`, `instructions`, `dispatchMode` — と、**送信者属性のギャップ**: `handleInbound()` は意図的に `senderName` を `promptText` に注入 **しません** (`ChannelBase.ts:316-347`。`senderName` は `ChannelBase.ts:246` のアクセス制御にのみ使用されます)。共有 `'thread'` セッションでは、エージェントは _誰が_ 話しているかを判別できません。フェーズ 0 では、返信引用コンテキストがすでにそうであるのと同様に、送信者マーカーを注入します (`ChannelBase.ts:318`)。
2. **プロアクティブ / 送信開始エンジン (フェーズ 1)。** 現在、チャネル境界には **プロアクティブなパスが全く存在しません**: `ChannelBase.sendMessage()` は抽象メソッドであり (`ChannelBase.ts:81`)、レスポンス内からのみ呼び出されます。DingTalk では、`sendMessage()` は受信時に `conversationId` ごとにキャッシュされる短命の `sessionWebhook` を介してのみ返信でき (`DingtalkAdapter.ts:134-142`)、**コールドグループには全くメッセージを送信できません** (`DingtalkAdapter.ts:137-141` は静かにリターンします)。フェーズ 1 では、デーモン常駐のスケジューラと DingTalk のプロアクティブ送信パスを追加します。
3. **チャネル常駐メモリ + 検索 (フェーズ 2、メモリ編)。** ワークスペースメモリは **ワークスペース全体であり、ルームごとではありません**: `POST /workspace/memory` は `scope: 'workspace' | 'global'` のみを受け付け (`workspace-memory.ts:118-125`)、**厳格な認証のミューテーションルート** です (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`)。「_この_ チャネルを記憶する」Tag には、ルームごとのメモリ名前空間が必要です。
4. **マルチプレイヤーガバナンス + 安全性 (フェーズ 2、ガバナンス編)。** 既存の `clientId` レベル（人間IDレベルではない）の仕組みをベースに、グループに適した権限ポリシー、プロアクティブアクションのガードレール、フォレンジック監査を構築します。

---

## 3. Goals & Non-Goals

### Goals

- **G1 — DingTalk での「tag」設定のドキュメント化と提供:** コピー＆ペースト可能な `channels.dingtalk` レシピ（明示的な `sessionScope: 'thread'`、グループ ID をリスト化した `groupPolicy: 'allowlist'`、`requireMention: true`、`instructions`、および意図的に選択された `dispatchMode`）により、`parseChannelConfig()` と既存のゲートを再利用して、動作する常駐型マルチプレイヤーエージェントを実現します。レシピでは、ルーティングスコープと ACP スコープの区別、およびパーサーのデフォルト `'user'` をオーバーライドする必要があることを明示しなければなりません。
- **G2 — 共有セッションにおける送信者属性。** `instructedSessions` (`ChannelBase.ts:344-346`) で追跡されるセッションごとに1回の `instructions` 注入を壊すことなく、エージェントが `'thread'` スコープのグループで話者を区別できるように、`promptText` にメッセージごとの送信者マーカーを注入します。マーカーは **メッセージごと** （話者はターンごとに変わる）であり、`instructedSessions` によってゲートされては **なりません**。これには、`collect` モードの合成再入力で二重にプレフィックスが付けられないように、**1つの新しいオプション `Envelope` フィールド、`alreadyPrefixed`** (`types.ts`) が必要です — §6.1 を参照。（v1 では誤ってこれを「フォーマットのみ、新しいフィールドなし」と説明していました。）
- **G3 — プロアクティブエンジン。** (a) ちょうどメッセージを受信したわけではないチャネルへの出力開始、および (b) 開いているインタラクティブセッションに依存しないスケジュールでの発火を行うメカニズム。可能な限り既存のセッションごとの通知パス（DingTalk プロアクティブ送信 API と、定義されたトークン更新所有者を持つ永続化された `openConversationId` ストアを含む）を介して配信します。両トポロジー下で、`ChannelBase.sessionQueues` を介して直列化し（人間のターンを `steer` キャンセルしない）、ACP の 1セッション1プロンプト不変条件 (NG6) を尊重しなければなりません。
- **G4 — チャネル常駐メモリ。** 既存の `/workspace/memory` 仕組みと `instructions` メカニズムの上に層状に構築される、ルームごとのメモリ名前空間と検索パス。設計では、`writeContextFile.ts` に新しい `channel` スコープ（+`channelKey`）を追加し、**`ChannelBaseOptions` を介して注入される CLI レヤーのコールバック** を通じて `channel-base` からアクセスします（`channel-base → core` の依存関係なし）。
- **G5 — マルチプレイヤーガバナンス。** `MultiClientPermissionMediator` と権限監査リングをベースに、グループに適した権限ポリシー、プロアクティブアクションのガードレール、監査を構築します。投票が `clientId` に帰属し（人間IDではない）、共有 `'thread'` セッションではすべてのグループメンバーが _同じ_ デーモンクライアントであることを考慮しなければなりません。
- **G6 — G1～G5 のすべてに対する Feishu の同等性。** フォローアップとして扱います。Feishu の安定した `tenant_access_token` は、`chatId` だけで任意のチャットへのプロアクティブ送信をすでにサポートしているため (`FeishuAdapter.ts:622-651`)、G3 に対して新しい送信 API は _必要なく_、デーモンレベルのウェイク/スケジューリングメカニズムのみが必要です。Feishu は `canColdSend = true` を宣言します。
- **G7 — 再発明よりも再利用。** すべての構築領域は、並列するサブシステムを導入するのではなく、既存のメカニズム（ゲート、ルーター、ブリッジ、メディエーター、メモリルート、セッション内通知パス、cron）を拡張します。

### Non-Goals

- **NG1 — ホストされたマルチテナント SaaS ではない。** 「qwen tag」は、**1つの** ワークスペースにバインドされた1つのエージェントプロセスです (`serve.ts:165-171`。マルチワークスペース = 別ポート上のワークスペースごとに1つのデーモン)。中央制御プレーンはありません。
- **NG2 — 本 RFC には人間ごとの ID、課金、またはコスト予算は含まれない。** デーモンの ID モデルは **単一のグローバル Bearer トークン** (`auth.ts:259-266`) と、イベントバス全体および権限監査における `clientId` レベルの属性です。送信者 _マーカーをプロンプトに_ 追加します (G2) が、認証されたユーザーごとのプリンシパル、ユーザーごとのクォータ、またはコスト追跡は導入 **しません**。送信者マーカーは認証境界ではなく、アドバイザリなプロンプトテキストです — すべてのグループメンバーはデーモンの単一のワークスペース資格情報を共有し、共有 `'thread'` セッションでは _同じ_ デーモン `clientId` となります。
- **NG3 — フェーズ 3 のマルチ ID ゲートウェイは対象外。** 将来のポインタとして言及するのみです。本 RFC はフェーズ 0～2 をカバーします。
- **NG4 — Feishu は二次的であり、主要ではない。** DingTalk をリファレンス実装とし、すべての作業例のソースとします。
- **NG5 — Slack およびその他の欧米プラットフォームは対象外。** 登録されているチャネルタイプは `telegram`, `weixin`, `dingtalk`, `feishu`, `qq` (`channel-registry.ts:10-14`) であり、Slack アダプタは存在しません。
- **NG6 — ACP の 1セッション1プロンプト不変条件は変更しない。** スケジュール/プロアクティブプロンプトはチャネル `sessionQueues` の単なる別のエントリであり、同じセッション上のユーザーターンと並行して実行したり、キャンセルしたりすることはできません。
- **NG7 — 新しいチャットスコープのメモリストアエンジンは導入しない。** チャネル常駐メモリ (G4) は、既存のファイルベースの `QWEN.md`/`AGENTS.md` ファイルに _名前空間_ を層状に追加するものです。ベクトル DB やルームごとのデータベースはありません。

---

## 4. Current-State Assessment

構築済み (B)、一部 (P)、未構築 (M)。「File」は権威あるシンボルを引用します。「Topology」は、その機能が `AcpBridge` チャネルパス (A)、`qwen serve` デーモンパス (D)、またはその両方に存在するかどうかを示します。また、フェーズ 1 以降はデーモン配下での実行がコミットされているため、移行によって機能が解放される場所には「→D」という注記を付けます。

| 機能                             | 現在の qwen-code (ファイル / シンボル)                                                                    | トポロジー                              | ギャップ                                                                                                                                                                           | サイズ              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1ルーム1セッションルーティング           | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`)                                 | A+D                                   | デフォルトスコープは `'user'` (`config-utils.ts:91-92`)。オペレーターが `'thread'` を設定する必要がある                                                                                             | Config (S)        |
| メンションによる呼び出し                      | `GroupGate.requireMention` デフォルト `true` (`GroupGate.ts:49-52`)                                   | A+D                                   | なし — すでに正しい                                                                                                                                                        | —                 |
| アクセス制御 / オンボーディング            | `SenderGate` 許可リスト + ペアリング (`ChannelBase.ts:240-252`)                                        | A+D                                   | なし                                                                                                                                                                          | —                 |
| 永続的なセッションマッピング                | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`)                             | A+D                                   | なし                                                                                                                                                                          | —                 |
| **プロンプト内の送信者属性**       | `handleInbound()` は `senderName` なしで promptText を構築 (`ChannelBase.ts:316-347`)                    | A+D                                   | `senderName` は注入されない。エージェントは誰が話したかを判別できない。新しい `Envelope.alreadyPrefixed` が必要                                                                                 | Code (S)          |
| プロンプトの直列化                   | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`)。デーモン `promptQueue` (`bridge.ts:2855`)  | A (チャネル) / D (デーモン)              | `DaemonChannelBridge.prompt()` は重複時にスロー (`:257-261`) — プロアクティブエンジンはチャネル側で直列化する必要がある。`dispatchMode` デフォルト `'steer'` はピアをキャンセル (`:354,371-379`) | Config + Code (S) |
| **送信開始 / プロアクティブ送信** | `ChannelBase.sendMessage()` は抽象 (`:81`)。DingTalk は webhook のみ (`DingtalkAdapter.ts:134-142`) | A+D                                   | プロアクティブな継ぎ目がない。DingTalk のコールドグループはメッセージ送信不可。`canColdSend` 機能フラグが必要                                                                                    | Code (L)          |
| **デーモンレベルのスケジューラ**             | Cron はセッションスコープ (`Session.ts:667-668`)。`dispose()` で終了 (`:790-812`)                    | A+D (ゲートウェイ) → D (監査/キュー再利用) | `serve/` または `channels/` にデーモンスケジューラエンドポイントがない。ゲートウェイスケジューラが唯一の所有者 (OD-8)                                                                               | Code (L)          |
| セッション内プッシュプリミティブ              | `setNotificationCallback` (`Session.ts:2638-2668`)                                                 | A+D                                   | _ライブ_ セッションにのみ配信。回収されたセッションをウェイクできない                                                                                                                  | (再利用)           |
| **ルームごとのメモリ**                    | `/workspace/memory` スコープ `workspace\|global` (`workspace-memory.ts:118-125`)                     | D のみ                                | チャット/チャネルスコープがない。新しい `channel` スコープ + CLI レヤーのコールバック（コア依存なし）                                                                                                 | Code (M)          |
| マルチアクターの権限投票          | `MultiClientPermissionMediator` 4 ポリシー (`permissionMediator.ts:621-637`)                       | D (フェーズ 1+ から継承)                | `AcpBridge` は自動承認 (`AcpBridge.ts:108-118`)。投票は `clientId` ごと、1チャネルにつき1クライアント                                                                          | Code (L)          |
| 監査証跡                            | `PermissionAuditRing` FIFO 512 (`permission-audit.ts`)                                             | D + チャネル側リング                 | 人間の `senderId` なし。インメモリ、再起動で消失。`~/.qwen` 追記専用のフォローアップ                                                                                              | Code (M)          |
| **トークン / コスト予算**                | なし (レート制限はリクエストカウントのみ、`rate-limit.ts`)                                           | チャネル側レジャー + D 使用量         | 支出メーターなし。v1 見積もり (アドバイザリ)。デーモンホスト時のみ実際のデビット                                                                                                   | Code (M)          |
| チャネルごとのツール/MCPスコープ             | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`)。MCP 許可フィルタ (`:3327-3333`)   | `Config` ごと                          | チャネルから `--acp` 子への spawn-arg パスがない (AcpBridge)。ホスト後はデーモンごとの `Config`                                                                                  | Code (M)          |
| DingTalk プロアクティブ送信                | 未実装 (`robot/emotion`, `messageFiles/download` のみ)                                    | A+D                                   | 新しいエンドポイント + 永続化された `openConversationId` + トークン更新 (検証済みコントラクト、§6.2)                                                                                       | Code (L)          |
| Feishu プロアクティブ送信                  | `tenant_access_token` 経由の `sendMessage()` (`FeishuAdapter.ts:622-676`)                            | A+D                                   | なし — `canColdSend = true`                                                                                                                                                   | —                 |
サイズキー: S = 設定/小規模なコード, M = モジュール + インターフェースの変更, L = 複数パッケージの変更または新しいサブシステム。

---

## 5. アーキテクチャ

`qwen tag` は**新しいランタイムではありません**。既存のアダプタースタックに接ぎ木された4つの薄いレイヤーです。ベースレイヤーはすでに、チャットチャンネル経由でアクセス可能な、マルチプレイヤー対応、ツール実行、MCP装備のエージェントを提供しています。4つの新しいレイヤーは、以下のギャップに1対1で対応しています。(1) **誰が話しているか** — 送信者のIDがプロンプトに到達しない。(2) **プロンプトなしで行動する** — 送信開始パスがなく、セッション内のcronはセッションとともに終了する。(3) **チャンネルを記憶する** — メモリはワークスペース全体で共有される。(4) **共有ブレインを管理する** — 認証は1つのグローバルトークンであり、チャンネルごとの予算はない。

以下の各レイヤーは、どのトポロジーを前提としているかを明記しています（§1を参照）。**コミットされた分割**: フェーズ0は `AcpBridge` 上。フェーズ1以降は `DaemonChannelBridge` を介した `qwen serve` デーモン上。

### ベースレイヤー（既存） — `qwen channel start` トポロジー（フェーズ0）

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

### デーモンホスト型トポロジー（フェーズ1以降） — `qwen serve` + `DaemonChannelBridge`

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

私たちが構築する重要な不変条件（検証済み）:

- **スレッドスコープがマルチプレイヤーの鍵。** `routingKey()` は `'thread'` の下で `${channelName}:${threadId || chatId}` を返します（`SessionRouter.ts:53`）。`resolve()` はこのキーを再利用します（`:79-83`）。デフォルトのスコープは `'user'` です（`:25`）。`qwen channel start` は、マルチチャンネルパスでは `router.setChannelScope(name, config.sessionScope)`（`start.ts:361-362`）を介して、シングルチャンネルパスでは `config.sessionScope` からの `ChannelBase` コンストラクタ（`ChannelBase.ts:62-64`）を介して、チャンネルごとのスコープを設定します。**マルチプレイヤーには、オペレーターが `sessionScope: "thread"` を設定する必要があります。**
- **プロンプトの直列化。** `AcpBridge` では、`newSession(cwd)` は `cwd` のみを受け取り（`AcpBridge.ts:131`）、`AcpBridge.prompt()` には同時実行ガードがありません。直列化は `ChannelBase` の `dispatchMode` によって行われます。`collect` はバッファリングし（`:361-370,445-463`）、`steer` は実行中のプロンプトをキャンセルし（`:371-379`）、`followup` は `sessionQueues` にチェーンします（`:381-383,394-470`）。**ランタイムのデフォルトは `'steer'`**（`:354`）です。`types.ts:42` の JSDoc は `'collect'` と記載されていますが、**これは古いため、v2 で `'steer'` に修正されます（OD-5）。** デーモンパスでは、`DaemonChannelBridge.prompt()` は重複時に**スロー**します（`:257-261`）。デーモンの FIFO `promptQueue`（`bridge.ts:2855,3082`）は、このスローガードの_背後_に存在します。結果（§6.2 にとって重要）: 人間によるもの、プロアクティブによるものを問わず、すべてのプロンプトは、`ChannelBase.sessionQueues` によってすでに直列化された状態で `bridge.prompt()` に到達する必要があります。
- **`sendMessage` は抽象メソッド。** `ChannelBase.sendMessage()` は `abstract` です（`:81`）。`DingtalkAdapter.sendMessage()`（`:134-170`）は、受信時にのみキャッシュされ（`:516-517`）、有効期限のある `conversationId` ごとの `sessionWebhook` 経由で送信します。コールドグループにはキャッシュされた webhook がないため、呼び出しは**サイレントにリターン**します（`:137-141`）。
- **フェーズ1以降に継承されるデーモンの不変条件。** チャンネルが `qwen serve` の下にホストされると（コミット済み、§1）、`MultiClientPermissionMediator`（`permissionMediator.ts:621-637`）、`eventBus` リプレイリング（`eventBus.ts:92`）、`SessionEntry` ごとの `promptQueue` FIFO（`bridge.ts:2855-3082`）が利用可能になります。

### 4つの新しいレイヤー

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

**レイヤー1 — IDの注入。** _トポロジー: 両方。デーモンは不要。_ `handleInbound()` は `senderName` を `promptText` に決して入れません（`ChannelBase.ts:246` は `SenderGate.check()` でのみ読み取ります。`Envelope.senderName` は `types.ts:69` に存在します）。設計: `handleInbound()` 内の `referencedText` プレフィックスの後（`:316-319`）に、`envelope.isGroup` でゲートされた、設定でゲートされた1つの注入ポイント。さらに、`collect` の再入用の新しい `Envelope.alreadyPrefixed` フラグ。詳細は §6.1 を参照。

**レイヤー2 — プロアクティブエンジン。** _トポロジー: ゲートウェイ所有のスケジューラ、移行中立。フェーズ1以降のデーモンの下で実行。_ セッション内 cron は `dispose()` で終了します（`Session.ts:790-803`）。デーモンスケジューラエンドポイントはありません。`DingtalkAdapter.sendMessage()` はコールドグループに到達できません（`:137-141`）。設計: `ChannelBase.sessionQueues` を介して（`steer` ではなく）fire を注入し、完了を `channel.pushProactive()` にルーティングする、ゲートウェイ常駐のスケジューラ。詳細は §6.2 を参照。

**レイヤー3 — チャンネルメモリ。** _トポロジー: CLIレイヤーのコールバックによる永続化パス。注入はチャンネル側。_ メモリはワークスペース全体でのみ共有されます（`workspace-memory.ts:86-303`）。設計: セッション開始時に注入されるチャンネルごとのメモリフラグメント（セッションごとに1回の `instructions` ゲートを再利用）。さらに、書き込みパス上の新しい `channel` スコープ。これは注入されたコールバックを介して `channel-base` から到達されます（`channel-base → core` の依存関係なし）。詳細は §6.3 を参照。

**レイヤー4 — ガバナンス。** _トポロジー: チャンネル側のゲートラッパー。フェーズ1以降のデーモン側のレートリミッター。_ デーモンは1つのグローバルBearerトークン（`auth.ts:259-266`）、`clientId`/IPごとのレート制限を持ち、チャンネルごとの予算は持ちません。設計: `handleInbound()` とスケジューラをラップする `ChannelGovernor`/`BudgetLedger`。詳細は §6.4 を参照。

### データフロー1 — グループスレッドへの受信 `@qwen`

このフローは両方のトポロジーで形状が同一です。唯一の違いは、直列化と権限がどこに存在するかです。`AcpBridge`（フェーズ0）では、直列化は `ChannelBase.sessionQueues` であり、権限は子プロセスによって自動承認されます。デーモン（フェーズ1以降）では、直列化は_依然として_ `ChannelBase.sessionQueues` であり（チャンネルレイヤーがすでに直列化しているため、デーモンのスローガードがトリップすることはありません）、権限は `MultiClientPermissionMediator` を介してフローします。

1. **DingTalk → アダプター。** メンバーが「@qwen summarize today's incidents」と投稿します。ストリームクライアントは `conversationId`、`sessionWebhook`、送信者、`isInAtList` を含む `DingTalkMessageData` を配信します。`DingtalkAdapter` は `webhooks.set(conversationId, sessionWebhook)`（`:516-517`）をキャッシュし、`isGroup:true`、`isMentioned:true`、`chatId = conversationId` を持つ `Envelope` を発行します。
2. **ガバナー（L4）。** `ChannelGovernor`/`BudgetLedger.admit()` は、チャンネルのターン/コスト予算（実際の使用量が利用可能になるまでアドバイザリ、§6.4）とキルスイッチをチェックします。ハードキル/実際の数値による明示的なキャップ → 拒否して返信。見積もりのみの閾値超過 → WARN（決してハード拒否しない）（Fix #6）。
3. **ゲート。** `GroupGate.check()` はパスします（メンションがデフォルトの `requireMention:true` を満たします）。`SenderGate.check()` もパスします（`:246`）。
4. **ルーティング。** `router.resolve(...)` は `'thread'` スコープの下で `dingtalk:<conversationId>` を計算し（**`sessionScope:"thread"` が必要**）、共有グループの `sessionId` を返します。`persist()` がそれを記録します。
5. **メモリ（L3） + ID（L1）。** 最初のターンで、チャンネルごとのメモリと `config.instructions` が1回だけプリペンドされます（`instructedSessions`、`:344-347`）。ID注入は、メッセージごとに `[Alice]` をプリペンドします。
6. **帰属のキャプチャ。** 解決された `senderId`/`senderName` は、後からタイムスタンプで結合されるのではなく、`sessionQueues` に運ばれる**キューアイテム上**に記録されます（Fix #7）。
7. **ディスパッチ。** タグプロファイルは `followup` を設定します（`steer` ではありません）。Bob の同時実行メッセージは `sessionQueues` にチェーンされます（`:394-470`）。
8. **ブリッジ。** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` は、stdio ACP（`AcpBridge.prompt`、`AcpBridge.ts:147`）経由、またはデーモンセッション（`DaemonChannelBridge.prompt`）に転送されます。これは、前のターンが `activePrompts` を使い切った場合にのみ到達されるため、デーモンのスローガード（`:257-261`）がトリップされることはありません。
9. **ストリームバック。** `textChunk` → `onChunk`（`:416-422`）。`onResponseComplete` → `DingtalkAdapter.sendMessage()` はキャッシュされた `sessionWebhook` を使用します（ウォームグループ）。
### データフロー 2 — コールドグループへのスケジュール済みプロアクティブプッシュ

1. **スケジュールの発火。** ゲートウェイに常駐する `ChannelCronScheduler` が、`daily-standup → dingtalk:<convA>` のために 09:00 に起動します。セッション内 cron ではありません（タグセッションでは無効化されており、OD-8/§6.2；またセッションが回収されればいずれにせよ機能しません — `dispose()` が `cronQueue` をクリアするため、`Session.ts:790-803`）。
2. **ガバナー (L4)。** プロアクティブ許可リストと静寂時間（明示的なタイムゾーンソース）をチェックします。ウィンドウ外 / 許可リストにない → スキップ + ログ出力。スケジューラーは配信を試みる前に `adapter.canColdSend` を検証します。false の場合、**明示的に失敗**（ログ出力 + `lastError` の記録）し、決してサイレントに no-op することはありません（Fix #4）。
3. **合成エンベロープ。** `senderId:'__cron__'`、`chatId: convA`、`isGroup:true`、`isMentioned:true`、`messageId` なし。合成プロンプトは、キューアイテム上に独自の属性（`createdBy`）を持ちます。
4. **直列化、決してプリエンプトしない。** `dispatchProactive` は `ChannelBase.sessionQueues` にチェーンされ、実行中の人間のターン（`activePrompts.get(sessionId)?.done`）を待ちます。`steer`/`cancelSession` を**決して**呼び出さず、`activePrompts` が保持されている間に `bridge.prompt()` を**決して**呼び出しません。そのため、デーモンの `Prompt already in flight` スロー（`:257-261`）が発生することはありません（§6.2, Fix #1）。
5. **コールドグループへの送信。** `pushProactive(convA, text)` は `webhooks.get(convA)` が undefined であることを確認し、新しいプロアクティブパスにフォールバックします。永続化された `openConversationId`、新しいアプリ認証トークン、`robotCode = config.clientId`、`msgKey:'sampleMarkdown'`、`msgParam`（JSON _文字列_）を含む POST `https://api.dingtalk.com/v1.0/robot/groupMessages/send` を実行します。（Feishu の場合、ステップ 5 は `tenant_access_token` 経由の既存の `sendMessage()` であり、`canColdSend = true` です。）
6. **バジェット + 監査。** プロアクティブターンはチャネルのバジェットバケットを消費します（デーモンホスト型の使用量が利用可能になるまでの暫定的なデビット）。発信元 ID としての `createdBy` と、トランスポートレベルでの `originatorClientId` とともに記録されます（人間の ID は偽装されません、`eventBus.ts:60`）。

### なぜこの形状なのか（発明より再利用）

すべての新しいレイヤーは既存の継ぎ目にアタッチされます。ID は `promptText` のビルドサイトに、プロアクティブは `sessionQueues` + `pushProactive()` に、メモリは `instructions`/`writeContextFile` のメカニズムに、ガバナンスはゲートチェーンのラッパーとしてです。唯一の**構造的前提条件** — レイヤー 2～4 によるデーモンメカニズムの再利用 — は、コミットされたデーモン移行（§1）によって満たされます。フェーズ 0 は `AcpBridge` 上で出荷され、フェーズ 1 以降は `qwen serve` の下で実行されます。

---

## 6. 詳細設計

### 6.1 マルチプレイヤー & ID（ビルドエリア 1）

「qwen タグ」はグループチャットに存在します。すべてのメンバーは_同じ_エージェントと会話します。このエージェントは、(a) チャネル全体で 1 つの共有会話を維持し、(b) 各ターンで_誰が_話しているかを把握し、(c) あるメンバーのメッセージが別のメンバーの実行中タスクを破壊しないようにし、(d) 理想的にはリスクの高いツール呼び出しについて_グループ_に承認を求める必要があります。qwen-code には現在 (a)～(c) のプリミティブが備わっています。(d) はデーモンホスト型のフェーズ 1 以降の作業です（コミットされた移行、§1）。

#### グループ共有セッション: `sessionScope: 'thread'`

`'thread'` の下では `senderId` がルーティングキーから除外されるため、すべてのメンバーが 1 つの `sessionId` に解決されます（`SessionRouter.ts:53,72-92`）。これにより、エージェントは N 個のプライベートボットではなく、共有されたチャネル常駐エンティティとなります。

- **グローバルな切り替えではなく、チャネルごとのスコープ。** ルーターのデフォルトは `'user'`（`:25`）であり、チャネル設定のデフォルトも `'user'`（`config-utils.ts:91-92`）です。DM とシングルユーザーチャネルは `'user'` のままです。タグプロファイルは `settings.json` で `sessionScope: 'thread'` を設定し、`setChannelScope()`（マルチチャネル、`start.ts:361-362`）または `ChannelBase` コンストラクタ（シングルチャネル、`ChannelBase.ts:62-64`）を介してチャネルごとに適用します。
- **DingTalk の `threadId`/`chatId` の安定性。** DingTalk アダプターは `Envelope.threadId` を決して設定しません（`DingtalkAdapter.ts:541-551`）。そのため、`routingKey()` は `threadId || chatId` のフォールバックとして `chatId` を採用し、グループを `chatId` ごとに 1 つのセッションに統合します（これが意図した動作です）。**注意点:** `chatId = conversationId || sessionWebhook`（`:534`）。実際のグループメッセージには `conversationId` が存在し安定していますが、もしそれなしでメッセージが到着した場合、`chatId` は_期限切れになる_ `sessionWebhook` URL にフォールバックし、スレッドキーが不安定になります。プロファイルは、欠落した `conversationId` をハードエラー（メッセージのドロップ）として扱い、サイレントに webhook をキーとして使用することはありません。

永続化はクラッシュリカバリーをカバーします（`SessionRouter.ts:168-244`）。デーモンの再起動により、`bridge.loadSession()` を介してグループが同じ共有セッションに再アタッチされます。

#### 新しいリスク: スレッドスコープの `/clear` と `/status` はチャネル全体に影響する

共有 `/clear` ハンドラーは `router.removeSession(this.name, senderId, chatId)`（`ChannelBase.ts:147-152`）を呼び出し、`/status` は `router.hasSession(...)`（`:203-208`）を呼び出します。これらは両方とも `routingKey()` を経由してルーティングされ、**`'thread'` の下では `senderId` を無視**します。そのため、単一のメンバーによる `/clear` 実行でチャネル全体の共有セッションが消去され、`instructedSessions` がリセットされます。これはワンタップで全員をリセットしてしまう危険な操作（footgun）です。

**解決策 (OD-4):** **共有（スレッド）グループ**では、`/clear`（およびそのエイリアス）に明示的な `confirm` トークンが必要であり、そのリストが設定されている場合は `config.allowedUsers` に制限されます。設定されていない場合は直接クリアされます（DM とユーザーごとのグループは呼び出し元自身のセッションにのみ影響するため、ゲートは不要です）。スラッシュパーサーは `[a-zA-Z0-9_]` のみを受け付けるため（ハイフン区切りの `/clear-channel` は `clear` + 引数 `-channel` としてパースされます）、コマンド名は `/clear` のままです。明示的な `confirm` が破壊的な操作のキューとなります。真のメンバーごとのオーナーゲート（チャット許可リストとは独立して管理者とメンバーを区別する）は、ID モデルの完成を待っています（OD-3/OD-11）。**`/status` は共有セッション上で読み取り専用のまま**です。

#### 送信者属性のギャップと修正

`handleInbound()` は、`envelope.text`、`referencedText` の引用プレフィックス、添付ファイルパス、およびセッションごとに 1 回の `config.instructions` から `promptText` を構築します（`ChannelBase.ts:315-347`。`envelope.senderName` は `SenderGate.check()`（`:246`）でのみ読み取られます。`'thread'` グループでは、エージェントは区別のないストリームを見ることになります。

**修正 (OD-6) — グループターンのプロンプト構築の先頭（`:315-316`）で、すべてのターンに `[senderName]` プレフィックスを付与:**

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

- **`envelope.isGroup` でゲート**（`types.ts:75`）。スコープではありません。
- **`referencedText` より前にプレフィックス**を付け、順序が `[Alice] [Replying to: "..."] <text>` となるようにします。
- **`senderId` ではなく `senderName` を使用。** DingTalk では `senderName = data.senderNick || 'Unknown'`（`DingtalkAdapter.ts:544`）であり、空になることはありません。`senderId → 'unknown'` のチェーンは防御的なものです。
- **`collect` モードの二重プレフィックスのリスク、1つの新しいフィールドで解決。** 統合された再入力は、すでにプレフィックス付きの統合された文字列を `text` として持つ `syntheticEnvelope` を構築し、`handleInbound()`（`:449-462`）に再入力します。これによりプレフィックスが**再度**付与されてしまいます。**v2 では、新しいオプションの `Envelope` フィールド `alreadyPrefixed?: boolean`（`types.ts`）を追加**。`collect` の合成エンベロープはこれを `true` に設定し、上記のプレフィックスステップは設定されている場合にスキップします。（これは、変更が「フォーマットのみで、新しいエンベロープフィールドはない」とした v1 の主張を修正するものです — Fix #2。これはこの RFC が導入する唯一の新しいエンベロープフィールドであり、bridge/ACP プロトコルは変更されません。）

#### グループデフォルトの `dispatchMode`: `steer` → `followup`

`steer`（ランタイムデフォルト、`:354`）は、`bridge.cancelSession()`（`:371-379`）を介して実行中のプロンプトをキャンセルします。共有グループでは、エージェントが Alice のリクエストを処理している間に Bob が何かを送信すると、`steer` は _Alice のタスクをキャンセル_ してしまいます。これは偶発的なサービス拒否です。**タグプロファイルは `dispatchMode: 'followup'` を設定**し、Bob のメッセージが Alice のタスクの後ろにキューイングされるようにします（`sessionQueues` FIFO、`:381-383,394-470`）。グローバルデフォルトを切り替えるのではなく、グループプロファイル（`groups["*"].dispatchMode = "followup"`）に設定します。DM は `steer` のセルフインタラプト UX を維持します。文書化されたプロファイルデフォルト以外に**コードの変更は不要**です。v2 では、コードとコメントが一致するように、古い `types.ts:42` の JSDoc を **`'steer'` に修正**します（OD-5）。`collect` は、属性の曖昧化を代償として、非常にトラフィックの多いグループ（キューの深さを制限）で許容されます。

タグプロファイルはグループに対して**常に `followup`（決して `steer` ではない）**であるため、プロアクティブエンジンはクリーンな不変条件を継承します。タググループ内のいかなるパスも実行中のプロンプトをキャンセルしないため、steer とプロアクティブの競合は発生しません。この不変条件は §6.2 で再述され、強制されます。

#### ハンドオフ — 「最後の人が中断したところから引き継ぐ」

`'thread'` + `[senderName]` プレフィックス + `followup` により、ハンドオフは_デフォルトの動作_となります。セッションは完全なマルチスピーカーの履歴を保持します。2 つのエルゴノミックな追加機能: アクティブな `sessionId`/`cwd`/タスクの概要を報告する読み取り専用の **`/who`** コマンド（`protected registerCommand(name, handler)` 経由、`:141-143` — プライベートな `commands` マップではありません）。および、再起動時の冪等な再アタッチ（すでに `restoreSessions()` でカバーされています）。

#### 複数メンバーの承認 — フェーズ分け（OD-3、決定済み）

意図は正しいです。リスクの高いツール呼び出しはグループで承認可能であるべきであり、qwen-code には 4 つのポリシーを持つ `MultiClientPermissionMediator` が同梱されています（`permissionMediator.ts:348,621-637`）。**しかし、フェーズ 0 の `AcpBridge` パスでは、チャネルからこれらに到達することはできません。**

1. **`qwen channel start` は `AcpBridge` を配線し、その `requestPermission` はすべてのリクエストを自動承認します**（`AcpBridge.ts:108-118`）。承認プロンプトは全くありません。
2. メディエーターはデーモンの HTTP サーブレイヤーに存在します。唯一の許可対応チャネルブリッジは `DaemonChannelBridge`（`respondToPermission`、`:346-374`）であり、これはフェーズ 1 でチャネルホスティングがデーモンに移行された後に到達します（コミット済み、§1）。
3. `config.approvalMode` は**死んだフィールド**です。パース（`config-utils.ts:94`）され、型付け（`types.ts:36`）されていますが、どのアダプターやブリッジからも読み取られません。

**決定されたフェーズ分け:**

- **フェーズ 0:** グループ承認なし。送信者許可リスト + `requireMention` + 保守的なエージェントツールセットでリスクをゲート。`approvalMode` が何か機能すると主張しないでください。
- **フェーズ 1:** チャネルはデーモンブリッジパスで実行（コミットされた移行）。`permission_request` を DingTalk カードとして表示。**単一のチャネルレベル `clientId` を持つ `first-responder` を出荷**（許可されたメンバーのいずれかのタップで解決。チャネルの粒度で属性を記録）。`senderId → clientId` マップは不要。**プロアクティブターンでの高リスクツールを自動拒否**（`__cron__` 発のターンは許可プロンプトに回答できません）。
- **フェーズ 2:** `senderId → clientId` マッピングと `clientId` のライフサイクル（回収、参照カウントの境界）が存在するようになったら、メンバーごとの `consensus`/`designated` を追加。注: `senderId` ごとに 1 つの合成 `clientId` を作成すると、`clientIds` の参照カウントマップが無限に増加するため、回収する必要があります。

#### 具体的な変更の概要（ビルドエリア 1）

| 変更 | 場所 | タイプ |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| グループプロファイルが `sessionScope: 'thread'` を設定 | `settings.json` + `setChannelScope` (`start.ts:359-363`) | Config |
| DingTalk の `conversationId` 欠落をエラーとして扱う | `DingtalkAdapter.ts` ~`:534` | Code (S) |
| グループターンに対する `[senderName]` プレフィックス | `ChannelBase.handleInbound` ~`:316` | Code (S) |
| 新しいオプションの `Envelope.alreadyPrefixed` フィールド | `types.ts` (Envelope) | Code (S) |
| `collect` の合成再入力時に `alreadyPrefixed` を設定 | `ChannelBase.ts:449-462` | Code (S) |
| 共有グループでの `/clear confirm` + 許可リストゲート。`/status` は読み取り専用 | 共有コマンド (`:147-217`) | Code (S) |
| グループプロファイルが `dispatchMode: 'followup'` を設定 | `settings.json` 内の `groups["*"]` | Config |
| 古い `dispatchMode` JSDoc を `'steer'` に修正 | `types.ts:42` | Comment fix |
| `/who` ハンドオフコマンド | `registerCommand` (`:141`) | Code (S) |
| デーモンブリッジ移行による `AcpBridge` 自動承認の置き換え | `DaemonChannelBridge` ホスティング（コミット済み） | Phase 1 (L) |
| メンバーごとの承認投票 + DingTalk カード | 新しいブリッジ配管 + `respondToPermission` | Phase 1/2 (L) |
### 6.2 Proactive Engine: スケジューラ + アウトバウンドプッシュ（コア）

#### 決定事項: ゲートウェイ所有のスケジューラ、マイグレーションニュートラル

**`qwen channel start` ゲートウェイプロセス内に存在するスケジューラを採用する。** ゲートウェイは `SessionRouter`（`restoreSessions()` リカバリ付き — `start.ts:275,444`）を所有し、すべてのアダプタインスタンスとそのブリッジを保持しており、`ChannelBase.pushProactive()`（および基盤となる抽象 `sendMessage()`、`:81`）を呼び出せる唯一の場所である。エージェント（Phase 0 で生成される `--acp` 子プロセス、または Phase 1+ のデーモンセッションのいずれであっても）は純粋なプロンプト実行機のままである。スケジューラは `ChannelBase.sessionQueues` へのエンキューによってトリガーされ、前のターンが消費されきった後にのみ `bridge.prompt()` を呼び出す。**新しいブリッジメソッドも、リバースチャネルも、デーモンプッシュルートも存在しない。**

> **トポロジーノート（コミットされたアーキテクチャ）。** スケジューラは**設計上マイグレーションニュートラル**である。基盤となるブリッジが何であれ、`ChannelBase.sessionQueues` を介して直列化される。Phase 0 では stdio 経由で `AcpBridge.prompt()` を駆動し、Phase 1+ では `DaemonChannelBridge.prompt()`（デーモンホスト）を駆動する。デーモンの `eventBus` 監査と FIFO `promptQueue` は Phase 1+ のガバナンスに必要であるため、チャネルは Phase 1 以降 `qwen serve` の下で実行されるが、スケジューラ自体のロジックはマイグレーション境界で変更されない。

なぜ代替案を採用しないのか:

- **`Session` 内 cron:** 却下 — `cronQueue`/`cronProcessing` はインプロセスの `Session`（`Session.ts:667-668`）に存在し、セッションが開いている間のみトリガーされ、30分のアイドルリープ時の `dispose()` で消滅する（`:790-812`）。これはまさにゲートウェイスケジューラが回避する障害である。**そして、ゲートウェイスケジューラは唯一の cron オーナーである（OD-8）。タグセッションは決してセッション内 cron を開始しない**（以下のゲーティングメカニズム）。
- **スタンドアロンプロセス:** 却下 — DingTalk の認証情報を複製する2つ目の長寿命プロセスとなり、インプロセスの `SessionRouter` やすでにアタッチされているブリッジを再利用できない。

#### コンポーネントと配置

| コンポーネント | ファイル | 責任 |
| --- | --- | --- |
| `ChannelCronStore` | `packages/channels/base/src/ChannelCronStore.ts` (新規) | 永続的なジョブテーブル。`sessions.json` と同じ階層の JSON。`atomicWriteJSON` (`atomicFileWrite.ts:385`) + ファイルごとの `async-mutex` `Mutex`。 |
| `ChannelCronScheduler` | `packages/channels/base/src/ChannelCronScheduler.ts` (新規) | 単一の再武装 `setTimeout`（単一のタイムホイール）。`nextFireTime` による次回の発火。再起動時のキャッチアップ。60秒のレコンサイラーティック。ゲートウェイごとに1つ。唯一の cron オーナー。 |
| Cron プリミティブ | `packages/core/src/utils/cronParser.ts` (再利用) | `parseCron`/`matches`/`nextFireTime` (`:104,141,168`)。再実装しない。 |
| `dispatchProactive` | `ChannelBase.ts` (拡張) | `sessionQueues` を介して発火を注入。実行中の人間のターンの `activePrompts.get(sessionId)?.done` を待機。`steer` しない。`activePrompts` が保持されている間は `bridge.prompt()` を呼び出さない。 |
| `pushProactive` | `ChannelBase.ts` (拡張。ベースデフォルト = `sendMessage`) + DingTalk オーバーライド | アウトバウンド配信。コールドグループ向けの DingTalk オーバーライド。`canColdSend` ケイパビリティによってゲーティングされる。 |
| `canColdSend` | `ChannelBase` プロパティ (デフォルト `false`) | コールド送信前にスケジューラがチェックするケイパビリティフラグ。DingTalk は proactive API パスが提供されると `true` に反転。Feishu は `true`。 |
| DingTalk proactive send | `packages/channels/dingtalk/src/proactive.ts` (新規) + `DingtalkAdapter.ts` | `robotCode` + 保存された `openConversationId` を介したプロアクティブメッセージの一斉送信（契約は以下で検証済み）。 |
| Wiring | `start.ts` (`startSingle`/`startAll` を拡張) | `router.restoreSessions()` (`:275,444`) の後にスケジューラを構築 + 開始。`isTagSession` フラグをセッション構築にスレッド化する（OD-8）。 |
| `/schedule` + `schedule_task` ツール | `ChannelBase.handleInbound()` (ゲート `:240-252` の後に拡張) | 最初に決定論的コマンド、次にモデルツール。 |

#### `canColdSend` ケイパビリティフラグ (Fix #4)

クロスプラットフォーム MVP 基準（「同じジョブが DingTalk と Feishu で配信される」）には、スケジューラが到達性をサイレント失敗によって発見するのではなく、推論できるようにするためのケイパビリティフラグが必要である。

- **`ChannelBase` のプロパティとして宣言:** `protected readonly canColdSend: boolean = false;`。（別の `ChannelPlugin` レジストリではなくベースクラスに配置する。スケジューラはすでにアダプタインスタンスを保持しており、`pushProactive`/`sendMessage` はインスタンスメソッドであるため、フラグをガードするメソッドと同じ型にまとめておくため。）
- **DingTalk:** proactive-send パス（`proactive.ts`）が提供され、利用可能な `openConversationId` が永続化されるまで `canColdSend = false`。`pushProactive` が実装されると `true` に反転。`false` の間でも、DingTalk はウォーム（webhook）ターンに回答できる。`canColdSend` は_コールドグループ_配信のみを制御する。
- **Feishu:** `canColdSend = true`（`tenant_access_token` を介したネイティブ proactive send、`FeishuAdapter.ts:622-676`）。
- **スケジューラは明示的に失敗する:** 発火を配信する前に、スケジューラは `adapter.canColdSend` をチェックする。`false` の場合、`pushProactive` を試行**しない**。オペレーターから見えるエラーをログに記録し、`job.lastStatus='error'` + `lastError='adapter cannot cold-send'` を設定して `/schedule list` に表示し、（ポリシーに従って）`consecutiveFailures` をインクリメントする。サイレントに no-op することはない。

#### 分離された cron ストア + OD-8 ゲート (Fix #5)

cron の永続化パスは2つ存在し、**それらはファイルシステム上で完全に分離されたパス**に存在するため、同じジョブを読み書きすることは決してない。

- **ゲートウェイストア（新規）:** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` — チャネルグローバル、`sessionsPath()` と同じ階層（`start.ts:56-58`）、ユーザー所有、ワーキングツリーの外。
- **セッションストア（既存）:** セッションごとの `Session` cron は、**プロジェクトごとにハッシュ化された**ディレクトリ `~/.qwen/tmp/<hash>/scheduled_tasks.json`（`cronTasksFile.ts:1-9`）を使用する。

パスが分離されているため、永続的なジョブが二重に発火する唯一の方法は、**タグセッションがゲートウェイスケジューラに加えてセッション内の `Session` cron も実行してしまう**場合である。**OD-8 がこれを閉じる:** ゲートウェイスケジューラが唯一の cron オーナーであり、チャネルホストの（「タグ」）セッションはセッション内 cron を**開始しない**。

**ゲーティングメカニズム — セッションが自身がタグセッションであることを知る方法。** タグセッションは、チャネルホストからスレッド化された明示的なフラグで構築される。

- Phase 1+ のデーモンパスでは、`DaemonChannelSessionFactory` はすでに構造化されたオプションバッグ（`{ workspaceCwd, modelServiceId, sessionScope }`、`DaemonChannelBridge.ts:226-241`）を受け取る。そのバッグに `isTagSession: true` を追加する。デーモンの `Session` は構築時にこれを読み取り、**`startCronScheduler()` をスキップする**（そうでなければ `cronQueue` を武装する呼び出しサイト、`Session.ts:667-668`）。dispose はすでにリープ時に cron をクリアするため（`:790-803`）、タグセッションは単純にそれを武装しないだけである。
- Phase 0 の `AcpBridge` パスでも、子エージェントはタグワークスペースのセッション内 cron を武装してはならない。同じフラグを `--acp` スポーンオプション（`Config` にフラグとして転送される新しい `AcpBridgeOptions` フィールド）を通じてスレッド化する。そのフラグの配管が完了するまで、Phase 0 はセッション内の cron ジョブを一切登録しない（`/schedule` コマンドはゲートウェイストアを対象とする）ため、二重発火するものは存在しない。

これにより、残存リスクは純粋に運用的なもの、「同じジョブに対して両方のスケジューラを実行しない」ことになり、ゲートがタグセッションが2つ目のスケジューラを開始しないことを保証する。

#### 永続ストアスキーマと再起動リカバリ

スキーマは `DurableCronTask`（`cronTasksFile.ts:19-26`: `id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` — フィールドは `cronExpr` ではなく **`cron`**）と同等である。

```ts
interface ChannelCronJob {
  id: string; // randomUUID()
  channelName: string;
  target: {
    // SessionRouter PersistedEntry をミラー (SessionRouter.ts:5-9)
    channelName: string;
    senderId: string; // システムジョブの場合は "__cron__"
    chatId: string; // DingTalk openConversationId — 永続的なコールドグループ ID
    threadId?: string;
  };
  cwd: string; // ロード時にバインドされたワークスペースと一致することを検証
  cron: string; // 5フィールド (parseCron) または "@once:<epochMs>"
  prompt: string;
  label?: string;
  recurring: boolean;
  enabled: boolean;
  createdBy: string; // senderId。シングルトークンモデルでは参考情報。発火の属性に引き継がれる
  createdAt: number;
  lastFiredAt: number | null;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  consecutiveFailures: number; // N回（例: 5）後に自動無効化
}
```

ファイルごとの `async-mutex` `Mutex` の下で `atomicWriteJSON` を介して書き込む。`start.ts` における **再起動リカバリ** は `router.restoreSessions()`（`:275`/`:444`）の_後_に行われる。

1. `bridge.start()` → `restoreSessions()` が `sessions.json` をリロードし、エントリごとに `bridge.loadSession()` を実行する。
2. `store.load()`。`cwd !== boundWorkspace` のエントリを破棄する。
3. `scheduler.start()`。有効なジョブごとに `nextFireTime(job.cron, new Date())` を計算する。**見逃し発火ポリシー（RFC 決定）:** ダウンタイム中に期限切れになった定期ジョブは、直ちに1回発火してから再開する。**バックログをリプレイすることはない**（ライブグループへのバックログフラッディングはスパムインシデントになるため）。過去のワンショットは1回発火してから削除する。`cronScheduler.ts` は `:81-89,608-707` で `{ kind: 'catch-up'; ids }`（定期）と `{ kind: 'missed'; tasks }`（ワンショット、確認必須）を区別する。我々は定期ジョブに対して1回への合流を採用する。
4. 最も近いジョブに向けて単一の `setTimeout` を武装し、各発火後に再武装する。サスペンド/レジューム時のクロックスキューを吸収するため、`Date.now()` から再計算する60秒のレコンサイラーティック（先例: `lockProbeTimer`、`cronScheduler.ts:229,507-538`）を追加する。インターバルを累積しないこと。

#### 発火パス: 共有グループセッションへの注入 (Fix #1 — 最重要)

セッションごとに1つのアクティブプロンプトという不変条件はトポロジーによって異なり、v1 の `dispatchProactive` はデーモンパスでこれを誤っていた。

- **Phase 0 (`AcpBridge`):** `AcpBridge.prompt()`（`:147-180`）は**それ自体に並行性ガードを持たない**。直列化は `ChannelBase.sessionQueues`/`activePrompts`（`:29-35,394,466`）と `--acp` 子プロセス自身の ACP セッションによってのみ行われる。
- **Phase 1+ (`DaemonChannelBridge`):** `DaemonChannelBridge.prompt()` は `activePrompts.has(sessionId)` の場合 **`Prompt already in flight` をスローする**（`:257-261`）。キューイングは**しない**。FIFO `promptQueue`（`bridge.ts:2855,3082`）はデーモン/acp-bridge 側、つまりこのインプロセスのスローガードの_背後_にある。したがって、人間のターンがアクティブな間に `DaemonChannelBridge.prompt()` を呼び出すと、待機するのではなく**スロー**される。

**再設計（両方のトポロジーで正しい）:** ターンが実行中の間は `bridge.prompt()` を呼び出さない。`sessionQueues` を介してチャネルレイヤーで直列化し、まず `activePrompts` を待機する。`sessionQueues` はプロアクティブ実行を前の実行が解決した_後_にチェーンするため、`bridge.prompt()` が呼び出される時点では `activePrompts.get(sessionId)` はクリアされている。したがって、デーモンパスではスローガードがトリガーされることはなく、`AcpBridge` パスでもガードのない `prompt()` がオーバーラップすることはない。
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

**不変条件: proactive turn（プロアクティブターン）は、後続の human turn（ヒューマンターン）によってキャンセルされることはなく、また human turn をキャンセルすることもない。** 両バリアントにおける強制力は以下の通り:

- **proactive→human のキャンセルなし:** `dispatchProactive` は `steer` や `cancelSession` を決して呼び出さない。`activePrompts.get(sessionId)?.done` を `await` して、その背後にキューイングするだけである。
- **human→proactive のキャンセルなし:** タググループのプロファイルは **`followup`（決して `steer` ではない）**（§6.1）。`steer` のみが `bridge.cancelSession()` を呼び出す唯一の `dispatchMode` であり（`:371-379`）、タググループはこれを選択しないため、受信した human turn は `sessionQueues` を介して実行中の proactive turn の _背後_ にチェーンされることしかできず、キャンセルすることはできない。（デーモンパスでは、`DaemonChannelBridge.cancelSession`（`:332`）に到達するのは `steer` ブランチからのみであり、これはタググループでは除外される。）
- **Throw-guard がトリガーされることはない:** どちらのパスでも、`bridge.prompt()` は `sessionQueues` チェーンの末尾でのみ呼び出され、前の実行が解決し、（human turn の場合は）`activePrompts` が排出された後になる。したがって、`DaemonChannelBridge` の重複スロー（`:257-261`）は、タグトラフィックに対して構造的に到達不可能である。

発火時（On fire）:

1. **共有セッションの解決:** `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)`（`SessionRouter.ts:72`）を介して行う。`'thread'` → グループ全体で1つの `sessionId` となるため、発火は human が見ているコンテキストに反映される。復元されたセッションがドロップしていた場合、`resolve()` は新規に作成して永続化する。
2. **キューイング、決してプリエンプトしない**（`sessionQueues` 経由の followup）。意図的に `steer` にしない。
3. **マーカーと属性の付与（Fix #7）。** `[Scheduled task "<label>" set by <createdBy>]\n` をプレフィックスとして付与する。`createdBy` の識別子は、後からタイムスタンプで結合されるのではなく、**キューイングされた実行に紐づけられる**ため、この発火中に発生するツール呼び出しや権限要求は _この_ proactive turn に帰属する（§6.4）。
4. **キャプチャとプッシュ。** `dispatchProactive` は完了テキストを返す。スケジューラは `adapter.canColdSend` をチェックし、`channel.pushProactive(target.chatId, text)` を呼び出す（`false` の場合は fail-loud となる）。

#### DingTalk でのコールドグループプッシュ

**検証済みの制限事項:** `DingtalkAdapter.sendMessage()` は `conversationId` ごとにキャッシュされた `sessionWebhook`（`:84,134-142`）を介してのみ送信し、これはインバウンド時にのみ設定される（`:505-517`）。コールドグループの場合はサイレントにリターンする（`:137-141`）。

**修正 — DingTalk の主动消息 群发 API を介した `pushProactive`（コントラクトは検証済み、OD-7 解決済み）。** この呼び出し形状はリポジトリ内にも前例がある（`emotionApi` は `x-acs-dingtalk-access-token` ヘッダーと `{ robotCode, openConversationId, ... }` ボディで `api.dingtalk.com/v1.0/robot/...` に POST する。`:188-197`）。

**検証済みのエンドポイントとパラメータ**（完全なソースノートは §6.5 を参照。各項目の信頼度を明記）:

- **エンドポイント:** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _（信頼度高；公式送信ドキュメント + aliyun ask/559227）_。
- **`robotCode`**（必須、文字列）: グループにロボットをインストールした際のロボット識別子。企業内部ロボットの `appKey` と同じ値空間 → `config.clientId` を使用する（`:184,435`）。新しい認証情報は不要。_（信頼度高）_
- **`openConversationId`**（必須、文字列）: 対象グループの `cid` プレフィックス付きオープン会話 ID。エラーコード `miss.openConversationId` / `invalid.openConversationId` から、必須であり検証されることが確認できる。`ChannelCronJob.target.chatId` に永続化する。`sessionWebhook` と異なり、再起動後も安定している。_（信頼度高）_
- **`msgKey`**（必須、文字列）: メッセージテンプレートキー。Markdown の場合は **`'sampleMarkdown'`**（プレーンテキストの場合は `'sampleText'`）。_（信頼度高；メッセージタイプドキュメント + aliyun ask/585232）_
- **`msgParam`**（必須、**JSON エンコードされた _文字列_** であり、ネストされたオブジェクトではない）: `sampleMarkdown` の場合、文字列は `"{\"title\":\"<preview title>\",\"text\":\"<markdown body, max ~5000 chars>\"}"` となる。_（信頼度高；Markdown の title/text フィールドはメッセージタイプドキュメントから、text の例は aliyun ask/585232 からそのまま引用）_
- **`coolAppCode`**（任意）: ロボットがグループ cool app（群聊酷应用）としてインストールされている場合のみ。通常の企業内部アプリロボットでは不要。_（信頼度中）_
- **`conversationId` == `openConversationId` か？** 標準的なグループ @-callback の場合、**callback の `conversationId`（cid プレフィックス付き）を `openConversationId` として直接使用可能とみなす**。コミュニティソースによる裏付け + `cid` フォーマットの一致による。**フラグ付き（信頼度中）:** 標準的な（cool app ではない）ロボットについてこれらを同等とする一文は公式ドキュメントには存在しない。ドキュメントで保証されているパスは `chatId → openConversationId` 変換 API（またはグループ作成 API / `chooseChat` JSAPI / `openConversationId` + `coolAppCode` を直接配信する cool app callback からの取得）である。**フォールバックルール:** 送信時に `invalid.openConversationId` が返された場合は、`chatId → openConversationId` 変換 API にフォールバックする。

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

`sendMessage()` は次のようになる: まずキャッシュされた `sessionWebhook` を試行し（低コスト、トークン消費なし）、失敗したら `pushProactive()` にフォールバックする。**ベースのデフォルト**は `pushProactive = (chatId, text) => this.sendMessage(chatId, text)` であるため、**Feishu はオーバーライド不要**（`FeishuAdapter.sendMessage()` はすでに安定した `tenant_access_token` を使用して任意の `chatId` への proactive 送信を行っており、`:622-676`；`canColdSend = true`）。DingTalk のみが異なるアダプタであり、DingTalk ファーストの非対称性となっている。`canColdSend` フラグ（上記）により、エンジンはリアクティブのみのアダプタにおいてサイレントにドロップするのではなく、**fail loudly** することができる。

**ハードなデプロイ制約（コードではない）:** 組織ボットは以下の条件を満たす必要がある。(a) 公開された企業内部ボットであること、(b) proactive グループメッセージ権限が付与されていること、(c) 対象グループのメンバーであること（グループ cool app / 企業内部アプリ / サードパーティアプリ経由でインストールされ、その `robotCode` を保持していること）_（権限の有効化が必要であることは信頼度高；ボットのインストール + robotCode が前提条件であることも信頼度高）_、(d) `openConversationId` が記録されていること。ボットがグループ内で _何らかの_ インバウンドを最初に確認した時点で `conversationId` を永続化するため、「コールド」= _アイドル_ であり、_未確認_ ではない。完全に未確認のグループは、変換 API を介して `openConversationId` を取得するまでプッシュできない（ハードリミット）。**必要なアダプタの変更:** 現在は `sessionWebhook` のみがキャッシュされている（`:516-517`）が、`conversationId` も永続化する必要がある（推奨ストア: セッションのライフサイクルから切り離された別の `~/.qwen/channels/dingtalk-groups.json`。これにより、コールドグループやライブセッションのない cron を表現可能にする）。

> **依然としてフラグ付き（信頼度低）— OD-7 に従い表示を維持:** (1) DingTalk アプリの权限管理コンソールにおける「proactively send group message」の**正確な権限ポイントコード/表示名**はドキュメントから特定できていない。DingTalk はアプリの权限管理の下で、ロボット/メッセージ送信権限（一般的にはロボットメッセージファミリー、例: `qyapi_robot_sendmsg` / 企业机器人发送消息权限）として表示している。コンソール内で確認し、コードをハードにアサーションしないこと。(2) 標準的な（cool app ではない）ロボットについて callback の `conversationId` と `openConversationId` を同等とする権威ある公式の一文は、今回のセッションではそのままの形では見つからなかった。実現可能性は高いショートカットだが、ドキュメントで保証されている取得パスは `chatId → openConversationId` 変換 API である。DingTalk のオープンプラットフォームページは JS レンダリングされており、今回のセッションでは完全にスクレイピングできなかった。エンドポイント/パラメータ/トークンの事実は、公式リクエスト例を引用している apifox ドキュメントミラーと Aliyun 開発者 Q&A を介して相互に確認した。

#### 認証とトークンのライフサイクル（検証済み；実現可能性を支えるリスク）

**認証ヘッダー（信頼度高）。** すべての v1.0 呼び出し（`groupMessages/send` を含む）は、リクエストヘッダー `x-acs-dingtalk-access-token: <accessToken>` と `Content-Type: application/json` でトークンを渡す。これは `emotionApi()`（`:188-207`）と `downloadMedia()`（`media.ts:36-43`）がすでに使用しているヘッダーと全く同じである。

**トークンの取得（信頼度高）。** 企業内部アプリ、v1.0 スタイル: JSON ボディ `{"appKey":"<appKey>","appSecret":"<appSecret>"}` で `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` → `{ "accessToken": "...", "expireIn": 7200 }`。（レガシーな同等 API `GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..` は `{access_token, expires_in:7200}` を返すが、そのレガシートークンは古い `oapi` エンドポイント用である。`api.dingtalk.com` v1.0 API には、`x-acs-dingtalk-access-token` ヘッダーで v1.0 の `accessToken` を使用する。）

**有効期限とキャッシュ（信頼度高）。** トークンは **7200 秒（約2時間）** で失効し、失効後は再取得**しなければならない**。有効期間内であれば、繰り返し取得しても同じトークンが返され、更新される。**アプリごとにキャッシュし、リクエストごとにトークンエンドポイントを呼び出さないこと**（頻繁な呼び出しはスロットリングされる）。

**これが実現可能性を支えるリスクである理由。** Stream SDK は `getEndpoint()` 内で `GET .../gettoken` を介して**接続時に一度だけ** `access_token` を取得し（`client.mjs:85-87`）、**決してリフレッシュしない**。`getAccessToken()` はキャッシュされた値を返す（`DingtalkAdapter.ts:172-174`）。`autoReconnect` はソケットが _close_ した時にのみ再取得する（`client.mjs:157-163`）。安定した長寿命ソケットは約2時間の TTL を過ぎても古いトークンを保持し続け、proactive 送信（および既存の emotion/media パス）は失効するとサイレントに失敗する。**proactive 機能はトークンのリフレッシュを自ら管理しなければならない。** タイマー（約2時間の有効期限切れ前）および/または 401 応答時に v1.0 `oauth2/accessToken` エンドポイントを介して取得し、SDK の接続ライフサイクルから独立してアプリごとにキャッシュする `tokenManager` である（OD-7）。これが「デモでは動くが2時間で死ぬ」という失敗の最も可能性の高い原因である。

**レート制限（検証済み、信頼度はまちまち — フラグを維持）:** (1) DingTalk Standard ではアプリごとのサーバー側 API 並行性は約 20 QPS、月間 Open API クォータは約 10,000回/月（Professional は約 500k、Dedicated は約 5M）_（信頼度中〜高）_。(2) よく引用されるロボットあたり **20メッセージ/分 → 約10分のスロットル** という制限は、**カスタムグループ Webhook ロボット** に対してドキュメント化されている。orgapp ロボットの送信パスに対する実践的なガイドとして一般的に適用されるが、今回のセッションでは `groupMessages/send` ページで明示的に確認**されなかった**。— **`groupMessages/send` の正確な 20回/分 という数値は信頼度低〜中として扱うこと。** また: トークンエンドポイントを過剰に呼び出さないこと（別のスロットルがある）。スケジューラは自身の送信を保守的にレート制限し、スロットル応答時にはバックオフしなければならない。

#### 定期指示（自然言語の定期リクエスト → ストア → 消費）

ゲート通過後の `handleInbound()` における2段階のキャプチャ（`:240-252`）: 明示的な **`/schedule "0 9 * * 1-5" post the open PR list`** コマンド（`parseCron` でパースされ、モデルのラウンドトリップなし）、および Phase-2 モデルツール `schedule_task(cron, prompt, recurring, label)`。どちらも `store.add({...})` → 永続化 → `scheduler.reschedule(job)` を呼び出し、その後チャンネル内に返信する。`/schedule list|cancel <id>|disable <id>` はストアの読み書きを行う。**永続化は fail-closed:** 書き込みがスローされた場合は `/schedule` の ack を拒否する。
#### 障害モード

- **実行時にゲートウェイがダウン:** リカバリにより、期限切れの定期実行が1回のキャッチアップ実行に統合されます。過去のワンショット実行は1回実行された後に削除されます。
- **実行中のエージェントクラッシュ:** `bridge.prompt()` が拒否されます。`attachDisconnectHandler` (`start.ts:241,403`) が再スポーン（フェーズ 0）/ デーモンが再アタッチ（フェーズ 1以降）を行います。スケジューラは `lastError` を設定し、定期実行に対しては `lastFiredAt` をスタンプしないため、再試行されます。At-least-once 保証。分単位の丸められた実行キーと `lastFiredAt` により重複排除されます。
- **セッションの回収 / `loadSession` の失敗:** `resolve()` が新規作成します（グループのトランスクリプトは失われます。常設指示は自己完結型である必要があります）。チャネルメモリ（§6.3）がリカバリの下限（フロア）となります。
- **アダプタがコールドセンドできない（`canColdSend=false`）:** スケジューラがログを記録し、`lastError` を記録します。`/schedule list` で表示され、サイレントに失敗することはありません。
- **削除済みまたは権限が取り消されたグループへのコールドグループプッシュ:** 2xx 以外の場合 -> `lastError`。`invalid.openConversationId` の場合 -> `chatId → openConversationId` の変換を試行し、1回再試行します。
- **トークンの期限切れ:** `tokenManager` が1回リフレッシュし、バックオフを行います。`consecutiveFailures` >= N の場合 -> オペレーターが確認可能な記録を残して自動無効化されます。
- **1つのワークスペースに2つのゲートウェイ:** `checkDuplicateInstance()` (`start.ts:170-179`) がシングルインスタンスをガードします。さらに、`cron.json` にロックトークンを記録します。

### 6.3 チャネルスコープのメモリと学習（ビルドエリア 3）

タグは、兄弟グループに漏洩することなく、_時間経過とともにグループを記憶する_ 必要があります。現在の qwen-code のメモリは **ワークスペースグローバル** であり、チャット/チャネル/グループ/セッションの軸はありません。

> **トポロジー / 依存関係の事実（Fix #3）。** 2つのハード制約が配線を形作っています。(1) デフォルトの `AcpBridge` トポロジーには、**`qwen serve` デーモンも `POST /workspace/memory` ルートも存在しません** — `--acp` 子プロセスには HTTP クライアントがありません。フェーズ 1以降のデーモン移行後でも、メモリルートは **デーモン専用かつ厳格な認証** です（`deps.mutate({ strict: true })`、`workspace-memory.ts:114`）。(2) `@qwen-code/channel-base` は `@agentclientprotocol/sdk` (`packages/channels/base/package.json`) にのみ依存し、**`@qwen-code/qwen-code-core` には依存しない** ため、`ChannelBase` は `import { writeWorkspaceContextFile }` を **実行できません**。したがって、修正された設計では、チャネルメモリは **コアヘルパーを介してプロセス内で書き込み/読み取りされ、CLI レイヤー（`packages/cli`。こちらはコアに依存可能）から注入されたコールバックを介して `channel-base` からアクセスされます** — HTTP 経由ではなく、`channel-base` にコア依存関係を追加するのでもありません。

#### 現在の状態: 2つのスコープ、いずれも会話ごとではない

`POST /workspace/memory` は `scope: 'workspace' | 'global'` のみを受け付け（`workspace-memory.ts:118-125`）、`resolveContextFilePath()` (`writeContextFile.ts:223-240`) を介して解決されます。`workspace → <root>/QWEN.md`、`global → ~/.qwen/QWEN.md`。追記モードは `## Qwen Added Memories` (`MEMORY_SECTION_HEADER`、`const.ts:29`) の下に折りたたまれます。30秒のデッドラインを持つファイルごとのミューテックスが書き込みを直列化し（`writeContextFile.ts:48-57,159-162`）、ライターは追記時に 16 MB を超える既存ファイルを拒否します（`MAX_EXISTING_FILE_BYTES`、`:255`）。このルートは **厳格な認証** です（`deps.mutate({ strict: true })`、`:114`）— トークンなしのループバックでも拒否されます。結果として、1つのワークスペース上のすべてのグループが1つの `QWEN.md` を共有します。

#### 設計: `(channelName, chatId)` をキーとする `channel` メモリスコープ

分離の単位はセッションではなく、**ルーティングターゲット** です（セッションはアイドル時に回収されます。`DEFAULT_SESSION_IDLE_TIMEOUT_MS` 30分、`run-qwen-serve.ts:94`）。キーはすでに存在します。`SessionTarget { channelName, senderId, chatId, threadId }` (`types.ts:88-93`)。グループメモリのキーは `(channelName, chatId)` とします。

**ストレージレイアウト** は既存の `~/.qwen/channels/` ツリーを反映しています。

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # サニタイズ: /, .., NUL を拒否
      <hash(chatId)>/               # sha256(chatId).slice(0,16) — パスセーフ、衝突/エスケープなし
        QWEN.md                     # グループスコープの「時間経過とともに学習」
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

ファイル名は `getCurrentGeminiMdFilename()` (`const.ts:49`) に従います。これにより、チャネルメモリはワーキングツリー、バインドされたワークスペース、および階層的な `QWEN.md` 検出パスから除外され（グループ間で漏洩することはありません）、安全に保たれます。

#### 書き込みパス（コアヘルパーを拡張し、フォークしない）

`packages/core/src/memory/writeContextFile.ts` において:

- `WriteContextFileScope` (`:80`) を `'workspace' | 'global'` から拡張し、`'channel'` を追加します。
- `WriteContextFileOptions` (`:83-97`) に `channelKey?: { channelName: string; chatId: string }` を追加します。`scope === 'channel'` の場合に存在することを検証します（`:142-146` の絶対パスガードを反映）。`projectRoot` はインターフェースで必須のままです — チャネルスコープでは未使用であっても `config.cwd` を渡します。
- `resolveContextFilePath()` (`:223-240`) に、`path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())` を返す `channel` ブランチを追加します。**関数の現在のシグネチャは `(scope, projectRoot)` です — `channelKey` パラメータを追加する必要があります**（プライベート関数、ローカル変更）。ファイルごとのミューテックスは解決されたパスをキーとするため、2つのグループは競合せずに並行して書き込みできます。

**正確な `ChannelBaseOptions` の変更 + 注入元（Fix #3）。** `channel-base` はコアをインポートできないため、CLI レイヤーが読み取り/書き込みをコールバックとして提供します。オプションバッグを拡張します（`ChannelBase.ts:9-12` — 実際の今日のインターフェースは単に `{ router?: SessionRouter; proxy?: string }` です。`config` と `bridge` は `:40-46` の **コンストラクタの位置引数** であり、バッグのメンバーではありません）。バッグにはすでに `router` が含まれています。

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions (新しいコア依存関係なし)
export interface ChannelBaseOptions {
  // ...既存のメンバー: router?: SessionRouter; proxy?: string
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

**構築と注入を行うもの:** `packages/cli/src/commands/channel/start.ts`（コアに依存）。`start.ts` が各アダプタのオプションバッグを構築する際、コアの `writeWorkspaceContextFile` / 読み取りヘルパーをクロージャでキャプチャし、`router.getTarget(sessionId)` (`SessionRouter.ts:94`) からサーバーが信頼する `(channelName, chatId)` を解決します — アダプタはワイヤから `chatId` を提供しません。

```ts
// packages/cli/src/commands/channel/start.ts — CLI レイヤー (コアに依存可能)
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config と bridge は createChannel(name, config, bridge, baseOpts) の位置引数であり、バッグのメンバーではない
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
      projectRoot: config.cwd, // projectRoot はチャネルスコープでは未使用だが、インターフェースで必須
    }),
};
// アダプタはバッグを最後に取って位置的に作成される: plugin.createChannel(name, config, bridge, baseOpts)
```

アダプタはファイルシステムに直接触れず、`channel-base` は新しい依存関係を得ません。（フェーズ 2 のデーモン代替案: `channelKey` をサーバーサイドで解決するスコープ付き `POST /channel/:sessionId/memory` ルート。`scope ∈ {workspace, global}` をハード検証し、固定の `projectRoot` を転送する `POST /workspace/memory` を再利用することはできません（`:118-125,185-190`）。プロアクティブエンジンがデーモンサイドの `sessionId → target` ルックアップを必要とするまで延期します。）

**イベントのファンアウト。** `publishWorkspaceEvent` はチャネルサイドではなく、**デーモンサイド** の `AcpSessionBridge` (`bridge.ts:3610`) にあります。`AcpBridge`（フェーズ 0）の下では、`memory_changed` イベントは **存在しません**（そして必要もありません — 1つのプロセスが書き込みと読み取りを所有するため）。デーモントポロジーの下では、`publishWorkspaceEvent` はすべてのライブセッションバスに無差別にファンアウトします（`bridge.ts:3649-3675`）。`BridgeEvent.data` は自由形式（`eventBus.ts:51`）であるため、`memory_changed` イベントは `{ scope:'channel', channelName, chatId }` を _含むことができます_ が、**サブスクライバーサイドのフィルタリング** が必要です — パブリッシャーは配信をスコープ制限できません。

#### 読み取りパス（メモリ → プロンプト）— `instructedSessions` を再利用するセッションごとのブートストラップ

セッションごとに1回の `instructions` ブロックを拡張します（`ChannelBase.ts:343-347`、`instructedSessions` によってガード）。ターゲットが `(channelName, chatId)` を持つセッションの最初のメッセージで、注入された `readChannelMemory(target)` を呼び出し、その結果を `config.instructions` と並べてプリペンドし、今日と同じように `instructedSessions` にセッションをマークします。`'thread'` スコープは1つの `sessionId` を共有するため、これは **セッションのライフタイムごとに1回** メモリをロードします（`config.instructions` の再注入を防ぐのと同じゲート）。コア依存関係は追加されません — 読み取りは注入されたコールバックを介して行われます。チャネルメモリは階層的な検出パス上に **決して** 存在せず、このフックによってセッションごとに注入されます。

```ts
// ChannelBase.handleInbound() — 初回ターンのブートストラップ (instructedSessions を再利用)
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

| レイヤー                    | 永続化するもの                                            | ライフタイム                                   | オーナー                             |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| セッションのトランスクリプト       | ACP の会話ターン                              | 回収 / `/clear confirm` / 再起動まで  | `Session`（エージェント）             |
| `SessionRouter` の永続化  | `key → { sessionId, target, cwd }` (`:5-9,224-244`) | ブリッジの再起動をまたぐ、`loadSession()` 経由 | `SessionRouter` (`sessions.json`) |
| **チャネルメモリ（新規）** | グループに関する蒸留された永続的な事実             | 無期限                                 | `~/.qwen/channels/memory/`        |

`restoreSessions()` がセッションの再ロードに失敗したとき（`:196`）、トランスクリプトは失われますが、グループの `QWEN.md` は無傷です — ブートストラップの読み取りにより、次のメッセージでエージェントの知識が再ハイドレートされます。**チャネルメモリはトランスクリプトのリカバリの下限（フロア）です。** 「時間経過とともに学習する」ことは、生のトランスクリプトの永続化ではなく、_蒸留_ ループです。エージェント（またはトリガーされたジョブ）は、重要な事実を定期的に要約し、追記モードでグループの `QWEN.md` に書き込みます。

#### 分離、サイズ、およびフェーズ分け

分離はパスレベルで保持されます（`sales` と `eng` は異なる `hash(chatId)` ディレクトリ/ファイル/ミューテックスに解決されます）。書き込みパスが常にサーバーが信頼する `chatId` を運ぶ限りにおいて。これは認証境界ではなく、**コンテンツ** の分離です（プロセスは引き続き単一のグローバルトークンを持ち、ユーザーごとのアイデンティティはありません）。ハードなテナント分離には、ワークスペース/テナントごとに1つのプロセスを実行します（OD-2）。

サイズのガードレール（既存の仕組みを再利用）: 追記時の 16 MB の既存ファイルキャップは無料で継承されます（`WorkspaceMemoryFileTooLargeError` をユーザーに表示される「グループメモリが満杯です。コンパクションパスを実行してください」にマップします）。フェーズ 2 のルートは、書き込みごとの 1 MB キャップ（`MAX_MEMORY_CONTENT_BYTES`、`workspace-memory.ts:79`）を再利用します。replace モードのコンパクション（`writeContextFile.ts:202-211`）は、無限の成長に対する長期的な解決策です。

- **フェーズ 0/1:** `writeContextFile.ts` に `channel` スコープと `channelKey` を追加します。`~/.qwen/channels/memory/` と `meta.json` を出荷します。上記のブートストラップ読み取りと `ChannelBaseOptions` を介して、CLI レイヤーの `readChannelMemory` / `writeChannelMemory` コールバックを配線します。新しい HTTP ルートも、`channel-base → core` の依存関係もありません。
- **フェーズ 2:** スコープ付き `POST /channel/:sessionId/memory` ルート（デーモントポロジー）と、サブスクライバーサイドのフィルタリングを伴う `memory_changed` を追加します。蒸留トリガーと `qwen channel memory <name> <chatId>` CLI を追加します。**蒸留の制約:** cron はセッションスコープであり、`dispose()` で終了します（`Session.ts:791,799-803,1056`）。蒸留はセッションがライブである間に発生する必要があります — ターン完了時、明示的な `/remember` 時、またはウォームに保たれたセッション時 — 独立したバックグラウンドスケジューラからではありません。
### 6.4 ガバナンス: トークン予算と監査ログ (Build Area 4)

どのメンバーでも操作でき、かつプロアクティブに動作できるチャネル常駐エージェントには、支出制限、_誰が_ _何を_ 要求したかを記録する監査証跡、および ID ごとの分離が必要である。qwen-code は 4 つのプリミティブのうち 3 つ、つまり `rate-limit.ts`（キーごとのトークンバケット）、`permission-audit.ts` リング、および `MultiClientPermissionMediator` を提供している。この領域ではそれらを構成し、ギャップを埋める（コスト予算がどこにも存在しない、監査行に人間の送信者が含まれない）。基本原則は **切り捨てず、拒否する** である。ただし、Fix #6 に従い、_推定_ 予算はユーザープロンプトをハード拒否せず、WARN を発するのみである。

#### どのプロセスがガバナンスを所有するか？

| デプロイ | ブリッジ | 利用可能な `serve/` の仕組み |
| --- | --- | --- |
| **Phase 0 — `qwen channel start` / `AcpBridge`** | 独自の `--acp` stdio 子プロセスを生成 (`start.ts:213,356`) | **なし。** Express サーバー、`rate-limit.ts`、HTTP ルート、`permission-audit.ts` リングはいずれもない。 |
| **Phase 1+ — `qwen serve` + `DaemonChannelBridge`** | チャネルはデーモン内でホストされる | `serve/` のすべて: 実際の使用量、メディエーター、レート制限、監査リング、ルート。 |

解決策: **予算のアドミッションと拒否は `@qwen-code/channel-base`**（共通のチョークポイントである `ChannelBase.handleInbound()`）に実装し、新しい **`packages/channels/base/src/BudgetLedger.ts`** に配置する。`serve/budget.ts` には_配置しない_。なぜなら、Phase-0 のチャネルプロセスは `serve/` をロードせず、チャネル層のみが人間の送信者コンテキストを持つ場所だからである。**監査と属性付け**もチャネル層で発生する。Phase-1+ のデーモンパスでは、元帳は実際の使用量を読み取り、ルート経由で_追加的に_公開される。Phase-0 パスでは推定を行い、チャネルコマンド (`/audit`) 経由で公開される。

#### 現在のガバナンスの接続箇所（およびギャップ）

| 懸念事項 | 既存のメカニズム | ギャップ |
| --- | --- | --- |
| リクエストレートのスロットリング | `(clientId\|ip)` ごとのトークンバケット、3 段階 (`rate-limit.ts`) | トークン/コストではなくリクエスト数のみ。`serve/` のみ |
| 事後の決定ログ | 制限付き FIFO リング、5 種類のレコード (`permission-audit.ts`) | 人間の `senderId` はなく `clientId` のみ。GET ルートなし。リングはクロージャで保持 (`:17-25`) |
| アクションごとの実際の承認 | 4 つのポリシー + コンセンサス定足数 (`permissionMediator.ts:621-637`) | 投票は人間ではなく `clientId` に帰属。1 チャネル = 1 クライアント |
| チャネルごとのツール/データスコープ | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); `getPermissionsAllow()` (`:3158`); `getPermissionsDeny()` (`:3182`); MCP 許可フィルター (`:3327-3333`) | スコープは `Config`/プロセスごと。`--acp` 子プロセスへの spawn 引数パスがない |

2 つの構造的な事実: (1) **デーモンには人間の ID がない**（`BridgeEvent.originatorClientId`、すべての `PermissionVote.clientId` はトランスポート識別子であり、`senderName` は `SenderGate.check()` までしか残らない）。そのため、人間↦`clientId`↦`sessionId` の相関はチャネル境界で確立する必要がある。(2) **認証とレート制限はデーモングローバルである**（単一の bearer トークン `auth.ts:259-266`、レート制限は `(clientId, ip)` をキーとする）。そのため、チャネルごとのガバナンスはアダプターで発生する必要がある。

#### トークンおよびコスト予算 — 実際の使用量が存在するまでアドバイザリとなる新しい `BudgetLedger` (Fix #6)

**使用量の取得元 — 注意事項 (OD-9)。** トークン予算は、モデルが使用量を報告して初めて_実際の_数値をデビットできる。セッション内では、`Session.#recordPromptTokenCount()` (`Session.ts:2078-2087`) が `usageMetadata.promptTokenCount` を `lastPromptTokenCount` に保存するが、**ターンごとに上書きされる**ため、累積的な課金メーターには_ならない_。Phase-0 の `AcpBridge` パスでは、ACP の `session/update` ストリームに `usageMetadata` が含まれないため、**v1 ではそこで実際のトークン数をデビットできない**。Phase-1+ のデーモンパスでは、デーモンがプロセス内で使用量を監視し、正確にデビット_できる_。

**強制ルール (Fix #6 — 重要な要素):**

- **推定予算はアドバイザリのみ。** 利用可能な数値がチャネル側の推定値（プロンプト+レスポンスの文字数 ÷ トークンあたりの文字数の定数）である場合、元帳はしきい値で **WARN/アラート** を発し、返信に警告を添付する可能性があるが、**ユーザープロンプトをハード拒否することは決してない**。誤検知の推定値によって、実際のユーザーリクエストが黙殺されてはならない。
- **実際の数値に対してのみハード拒否。** デビット元が実際のデーモン使用量パス（Phase-1+ デーモンホスト）である場合に**のみ**、予算はプロンプトを_拒否_（切り捨てず拒否）できる。それまで、予算はゲートではなく、可観測性 + アラートである。

これにより、v1 の予算は誠実なものになる。つまり、あらゆる場所で早期に警告を発し、数値が信頼できる場所で厳密にハード制限を適用する。

**モジュール `BudgetLedger.ts`** は、`rate-limit.ts`（ファクトリ、GC を伴うバケットの Map、オーバーフロー時のフェイルオープン）をモデルとしている:

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

- **デフォルト継承セマンティクス + 最も厳しい条件が優先される組織ロールアップ (OD-9)。** `admit(key)` は、`GroupGate` スタイルの `channel → '*' → built-in` フォールバックで有効なウィンドウを解決する。プロンプトは、チャネルごとのウィンドウと**プロセスごとの「組織」ロールアップ**（最も厳しい条件が優先され、両方をデビット）の**両方**をパスする必要がある。「組織」 = _この単一プロセスの_ ロールアップ。真のクロスプロセス組織キャップには共有ストアが必要（スコープ外）。**固定の日次ウィンドウ。**
- **75%/95% アラート。** `debit()` は、イベントバスのヒステリシスイディオム（`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`、`eventBus.ts:101-103`）を使用して、ウィンドウごとにしきい値あたり 1 回 `onAlert` を発生させる。**アラートの投稿はプロアクティブな送信である** — Build Area 2 へのハード依存（DingTalk のコールドグループに関する注意事項。Feishu は自由に投稿できる）。プロアクティブなチャネルが存在しない場合は、「次の返信に警告を添付する」ようにデグレードする。
- **切り捨てず拒否（`source==='daemon'` の場合のみ）。** アドミッション時、_つまり_ `bridge.prompt()` (`:425`) の_前_にチェックされる。実際の使用量で `!allowed` の場合、アダプターは `sendMessage(chatId, refusal)` を呼び出して戻る。**ステア/キャンセルパスには入らない**ため、実行中のプロンプトは完了し、_次_のプロンプトが拒否される。推定の場合、`allowed` は常に true（アドバイザリ）。
- **コスト（`usd`）** は、オペレーターが提供するモデルごとのレートテーブルにトークンを乗算する（qwen-code はマルチモデルであり、単一の価格はない）。エントリがない場合 → `tokens` にフォールバックし、1 回限りの警告を発する。
- **設定。** `ChannelConfig` (`types.ts:27-51`) に `budget?: { unit; limit; windowMs; reset? }` が追加され、`parseChannelConfig` で解析される。デーモンパスでは、`ServeOptions` に `--budget-org-daily`/`--budget-unit` が追加され、`daemon-status.ts`（すでに `rateLimit` を報告している、`:295-297`）に並行する `budget` ブロックが追加される。

#### 監査ログ — ターンに付随する人間の `senderId` (Fix #7)

`PermissionAuditRing` (`permission-audit.ts:128-172`、FIFO 512) は適切な基盤であるが、すべての行が `clientId` をキーとしている。**設計 — チャネル側の送信者↦ターンのバインディング**（`RequestAttributionRing.ts`、同じ FIFO 形状）。

**`followup` における単純なタイムスタンプ結合は誤りである (Fix #7)。** v1 では、権限行を「その `sessionId` の中で、権限の `issuedAtMs` より前に `recordedAtMs` を持つ、最も新しい属性行」に結合することを提案していた。`followup` の下では、`sessionQueues` 経由で**1 つの** `sessionId` に複数の送信者がキューイングされる。ツール呼び出し/権限が発火したときに_実行中_のターンの送信者が、最も最近_キューイングされた_送信者と**一致しない**ことが頻繁にある。したがって、タイムスタンプ結合は体系的に誤った属性付けを行う。

**修正: キューイングされたプロンプトに `senderId` を付随させる。** `handleInbound()` が `sessionQueues` にエンキューするとき（およびスケジューラーがプロアクティブな発火をエンキューするとき）、キューアイテム/合成ターンコンテキストは独自の `{ senderId, senderName, requestSeq }` を持つ。ターンの発生中に発生するツール呼び出し/権限の属性は、タイムスタンプスキャンではなく、**現在実行中のターン**（FIFO の先頭）から読み取られる。具体的には、`sessionQueues` チェーンは、実行が先頭に到達した瞬間（`bridge.prompt()` の直前）にターンごとの `currentTurnAttribution.set(sessionId, {senderId, ...})` をスタンプし、実行が解決したときにクリアする。監査行はそのマップを読み取る。プロアクティブな発火も同様に `createdBy` をスタンプする（§6.2 ステップ 3）。これは実行中のターンに対して正確であり、エンキュー順序の影響を受けない。

アドミッション時に 6 番目の行タイプ **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`** を追加し、読み取り専用作業であっても「誰がこのタスクを開始したか」を監査が答えられるようにする。`PermissionAuditEntry` 共用体（`:57-104`）は**クローズド**であり、コンシューマーは `kind` でスイッチするため、これを拡張する（または兄弟リングを追加する）とすべてのコンシューマーに影響する。

**クエリパス。** Phase-1+ デーモン: `GET /workspace/audit`（bearer + `createMutationGate` strict、`auth.ts:356`）を追加し、ブリッジクロージャからリングを公開する（ファイルのヘッダードキュメントはこれを想定している、`:22-25`）。Phase-0 `AcpBridge`: `sendMessage` 経由の `/audit` チャネルコマンド。**耐久性:** リングは 512 個のインメモリエンティティであり、**再起動時に失われる**。これは既知の v1 の制限である。フォローアップ（OD-11）では、**追記専用の結合監査を `~/.qwen` に永続化する**。

**コンセンサスの投票者は人間ではない。** `votersAtIssue` はデーモンによってスタンプされた `clientId` であり、1 チャネル = 1 `clientId` であるため、DingTalk グループにおけるデフォルトの「コンセンサス」は_デーモンクライアント_間のコンセンサスとなる。人間レベルの投票には、`senderId` を個別の投票にマッピングする登録済み承認者の名簿が必要である。これは OD-3 Phase-2 の要件であり、解決済みの機能ではない。

#### ID ごとのツールおよびデータの分離

1. **チャネルごとのツールの許可/拒否。** `Config` は `coreTools`/`allowedTools`/`excludeTools` (`:727-729`) をサポートし、`getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()` 経由で公開される。（`getAllowedTools()`/`getBlockedTools()` は**存在しない**。）Phase 0 では `AcpBridge` パスがチャネルごとに子を生成するが、`AcpBridgeOptions` は `{ cliEntryPath, cwd, model }` (`:17-21`) のみを持ち、`start()` は `--acp`+`--model` (`:56-63`) のみを転送する。チャネルごとのスコープを提供するには、新しい `AcpBridgeOptions` フィールド、`Config` への新しい `--acp` フラグ、および新しい `ChannelConfig` フィールドが必要である。Phase-1+ のデーモンパスでは、デーモンごとに 1 つの `Config` があるため、スコープはチャネル子ごとではなくデーモンごと（ワークスペースごと、OD-2）となる。
2. **チャネルごとの MCP スコープ。** `Config.getMcpServers()` は、構築時に設定される `allowedMcpServers` (`:3327-3333`) でフィルタリングする。`ChannelConfig` に `allowMcpServers?: string[]` を追加し、同じ spawn 引数パス（または `AcpBridge.newSession()` が渡す `mcpServers` 配列 — `:133` でハードコードされた `[]`）にスレッド化する。
3. **データ境界としての `sessionScope`。** `'thread'` はグループが 1 つのワーキングツリー/コンテキストを共有するようにする。チャネル_間_の分離は、`channelName` で名前空間化されたルーティングキーによって強制される。`'thread'` グループ内の送信者ごとの分離は、設計上_行われない_。
**率直な制限事項:** 認証はユーザーごとのプリンシパルを持たないデーモン全体の単一トークンであるため、分離は人ごとではなく**チャネル**ごとに行われます。真に人ごとのツール分離を実現するには Phase-3 が必要です。

#### 承認パス

```
DingTalk inbound
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [existing :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [NEW]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (steer/cancel には入らない)
            ↳ source==='estimate': allowed は常に true → WARN のみ (Fix #6)
     3. {senderId, senderName, requestSeq} を含めて sessionQueues にエンキュー  [NEW — Fix #7]
        + task.requested row
     4. FIFO の先頭で、currentTurnAttribution をスタンプ → bridge.prompt(...)   [existing :425]
            ↳ tool call → permission (AcpBridge Phase 0 では自動承認; daemon Phase 1+ では mediator)
                ↳ audit row は currentTurnAttribution[sessionId] を読み取る (実行中の turn)
     5. 完了時: 使用量が判明 (daemon) または推定 (AcpBridge) → budget.debit(..., source)  [NEW]
            ↳ 75%/95% アラートの投稿はプロアクティブ → Build Area 2 に依存
```

明示すべきハード依存関係: (1) 実際のトークンデビット（したがってハード拒否）には Phase-1+ のデーモン使用パスが必要です。それまでの間、予算は参考値となります (Fix #6)。(2) プロアクティブな予算アラートには Build Area 2 が必要です。(3) 人間レベルのコンセンサス投票と人間レベルの監査帰属には、OD-3 の登録承認者名簿が必要です。

### 6.5 DingTalk プラットフォーム（プライマリ）+ Feishu フォローアップ

> **配線に関する注記（確定済みアーキテクチャ）。** Phase 0: `qwen channel start` は `AcpBridge` (`start.ts:213,350`; `AcpBridge.ts:38`) を構築し、`node <cli> --acp` を生成して `newSession(cwd)`/`loadSession(sessionId, cwd)` (`:131,137`) を公開します。セッションのスコープはブリッジではなく `SessionRouter` が所有します。Phase 1+: チャネルは `DaemonChannelBridge` を介して `qwen serve` 配下でホストされます（`:229,240` の `'thread'` デフォルト、`:257-261` の overlap-throw）。この移行は必須であり、任意ではありません（§1）。

#### sessionWebhook の有効期限問題

DingTalk Stream モードは、受信ごとに短命な `sessionWebhook` を配信します。アダプタはこれを `conversationId` をキーとしてキャッシュし（`:84`、`onMessage()` `:517` で設定）、`sendMessage()` (`:134-170`) がそれを参照して、存在しない場合は `No webhook for chatId` をログに出力してサイレントにリターンします（`:137-141`）。プロアクティブな利用において致命的な事実が 2 つあります。(1) webhook は**有効期限切れ**になる（SDK 型 `RobotMessageBase` は `sessionWebhookExpiredTime` を持つが（`constants.d.ts:13`）、アダプタの `DingTalkMessageData` インターフェースはそれを省略しており、決して読み取りません。キャッシュされた webhook はホットウィンドウ内でも期限切れになり得ます）。(2) マップはインバウンドトラフィックによって**のみ**設定されるため、コールドグループにはエントリが存在しません。

#### ロボットのプロアクティブメッセージ（主动消息）API を介したコールドグループへのプッシュ — 検証済み (OD-7)

修正策は DingTalk のボットのプロアクティブメッセージ API、つまり **`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** です_（エンドポイントは高信頼度で検証済み）_。webhook とは異なり、これは永続的な **`openConversationId`** _（高信頼度で検証済み）_ でアドレス指定され、**`x-acs-dingtalk-access-token`** ヘッダー _（高信頼度で検証済み — すでに `emotionApi()` `:188-207` と `downloadMedia()` `media.ts:36-43` で使用）_ で認証され、ボットの **`robotCode`** _（高信頼度で検証済み; = `config.clientId`、`:184,435`）_ を保持します。ボディは `msgKey`/`msgParam` のペア _（高信頼度で検証済み）_ であり、**`msgParam` はそれ自体が JSON エンコードされた文字列**です（ネストされたオブジェクトではありません）。例えば `msgKey:'sampleMarkdown'` の場合:

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // durable group id (from inbound conversationId; convert if invalid)
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<preview title>\",\"text\":\"# hi\\n...markdown ≤ ~5000 chars\"}",
}
```

これは `sendMessage()` の変更ではなく、**それと並ぶ新しいメソッド**です（§6.2 のスケッチを参照）。`ChannelBase.sendMessage()` は抽象のままです（`:81`）。プロアクティブエンジンには、新しい `pushProactive?(target, text)` アウトバウンドシームが必要です。これは完全に新しいものであり、中心的なプラットフォームの成果物です。エンドポイント/パラメータ/`msgParam` の形状について、**公式の send ドキュメント + aliyun ask/559227, ask/585232 + message-type ドキュメントに基づき [高信頼度] で検証済み**です。

**権限の前提条件:** `groupMessages/send` が機能する前に、企業内部アプリに「プロアクティブグループチャットメッセージの送信」ロボット/メッセージ権限を付与する必要があります（send ドキュメントにこの前提条件が記載されています）_（権限の有効化が必要であることは高信頼度で検証済み）_。**STILL FLAGGED（低信頼度）:** 正確な権限ポイントの表示名/コードは、このセッションのドキュメントからは特定できていません。DingTalk コンソールでは、アプリの権限管理の下にロボット/メッセージ送信権限（一般的にはロボットメッセージファミリー、例: `qyapi_robot_sendmsg` / 企业机器人发送消息权限）として表示されます。コンソールで確認し、コードを**ハードコードして断定しないでください**。アダプタは `!resp.ok`/throw 時に `resp.status` + ボディをログに出力する必要があります。現在の `emotionApi` の空の catch（`:214-216`）は、権限不足の設定ミスを隠してしまうアンチパターンです。

#### openConversationId の取得と永続化

2 つの情報源があります。(1) **インバウンドからの収集** — すべてのメッセージは `conversationId` (`:506`) を持ち、emotion API に `openConversationId` として転送されます（`:197`）。確認次第すぐに永続化します。コールバックの `conversationId`（cid プレフィックス）が、標準的なグループ @-コールバックの `openConversationId` として直接使用可能であることは、**aliyun ask/559227, ask/585233 + 一致する 'cid' 形式に基づき [中信頼度] で検証済み**です。**STILL FLAGGED:** クールアプリではないロボットのためにそれらを等価とする公式の逐語的な文はありません。ドキュメントで保証されている取得パスは、**`chatId → openConversationId` 変換 API** (`obtain-group-openconversationid`)、またはグループ作成 API / `chooseChat` JSAPI からのキャプチャ、またはクールアプリのコールバック（`openConversationId`+`coolAppCode` を直接配信）です。**フォールバック:** `invalid.openConversationId` の場合、`chatId` API を介して変換し、再試行します。(2) `registerAllEventListener` (`client.mjs:58-61`) を介した**ボットのグループ追加イベント**: デフォルトの `topic:'*'` (`client.mjs:14-19,241-254`) の下でイベントは `onEvent → onEventReceived` に流れますが、アダプタはロボットの_コールバック_のみをインストールするため（`:107`）、組織/ボットイベントは現在受信され、no-op のデフォルトにドロップされます（`client.mjs:35-37`）。インストール時のイベントトピックと `openConversationId` フィールドは**未検証**です。イベント名をハードコードしないでください。

**永続化。** `SessionRouter` のターゲットではなく、**別の `~/.qwen/channels/dingtalk-groups.json`** ストアを使用します。グループ ID はセッションよりも長く存続する必要があるためです（cron 駆動のコールドグループプッシュはライブセッションなしで発生します）。また、`PersistedEntry` はルーティングキーに対してセッションが作成された場合にのみ存在するため、グループのアイデンティティをセッションのライフタイムに結合すると、コールドグループが表現されなくなります。

#### マルチプレイヤーのスコープはオプトインであり、デフォルトではない

`'thread'` スコープ（`:53`）は、グループごとに 1 つの共有エージェントを提供するものですが、`parseChannelConfig()` は `sessionScope` のデフォルトを `'user'` に設定します（`config-utils.ts:91-92`）。これは_メンバーごと_のセッションを提供します。オペレーターは明示的に `sessionScope: 'thread'` を設定する必要があります。設定すると、2 つのマルチプレイヤーへの影響が適用されます。(a) デフォルトの `dispatchMode: 'steer'` は、どのメンバーがメッセージを送信しても実行中のタスクを**キャンセル**します（`:371-379`）。タグプロファイルは `'followup'` を設定します（§6.1）。(b) 送信者帰属のギャップ（§6.1）。

#### インバウンド @ の解析

グループゲーティングは機能します。`GroupGate` は `data.isInAtList` から設定される `envelope.isMentioned` を使用します（`:520`）。テキストのクリーンアップは**最初の** `@token` のみを削除します（`:527-529`）。これはアイデンティティベースではなく位置ベースです。`@qwen @alice` は正しいですが、人間が最初に来るメンションは人間のものを削除してしまいます。ボット自身の `chatbotUserId` で削除する強化フォローアップがあります。返信/引用コンテキストは抽出され（`extractQuotedContext()`、`:272-298`）、`isReplyToBot` は `chatbotUserId` に対して計算され（`:280,292`）、`referencedText` は `[Replying to: "…"]` として注入されます（`ChannelBase.ts:317-319`）。**送信者帰属は §6.1 で `[senderName]` プレフィックスを介してクローズされます**。

#### Markdown / カードのレンダリング

`markdown.ts` は、プロアクティブパスが再利用するプラットフォーム正規化をすでに行っています。Markdown テーブルのパススルー、フェンスバランシングを伴う 3800 文字でのチャンキング（`splitChunks()`; `CHUNK_LIMIT=3800`）、およびフォールバック `'Reply'` を持つ 20 文字にスライスされたタイトル抽出（`extractTitle()`）です。再利用は、`sampleMarkdown` テンプレートが同じ Markdown サブセットと**最大約 5000 文字**のボディを受け入れる場合に**条件付き**となります_（高信頼度で検証済み — message-type ドキュメント）_。`CHUNK_LIMIT` をその予算以下に保ちます。ストリーミングインタラクティブカード（`TOPIC_CARD` パス、`constants.d.ts:4`）— Feishu のストリーミングカードに相当するもの — は、プライマリマイルストーンの**スコープ外**です。v1 プロアクティブは Markdown メッセージベースです。

#### Feishu フォローアップ（簡潔に）

Feishu は、まさに重要な軸において先行しています。**プロアクティブ送信がネイティブ**です（任意の `chat_id` への `sendMessage(chatId, text)`、`:622-676` — コールドグループの問題なし。`canColdSend = true`）、有効期限追跡リフレッシュを伴う**安定した `tenant_access_token`**（`refreshToken()`、`:581-620` — DingTalk がまだ必要としている作業）、**柔軟なイベントサブスクリプション**（WebSocket または HMAC webhook、`:146-176`）、および**ファーストクラスのストリーミングカード**（`markdown.ts`、`:742-792`）です。**しかし、共有の `ChannelBase`/`SessionRouter` の問題 — オプトインの `'thread'` スコープ、`dispatchMode` のキャンセル、欠落している送信者帰属、新しいアウトバウンドシーム — は Feishu にもそのまま適用されます。** Feishu は_到達可能性_を解決しますが、_誰が何を言ったか_や_あるメンバーが別のメンバーをキャンセルする_問題は解決しません。プロアクティブエンジンを Feishu に移植する場合、既存の `sendMessage()` を直接再利用します（ベースの `pushProactive` デフォルト）。唯一の新しいプラットフォーム作業は、エンジンのターゲットグループを永続化された `chat_id` にマッピングし、オプションでストリーミングカードパスを経由することです。

---

## 7. フェーズ分けされたロールアウト（Phase 0–2）と MVP

各フェーズは独立してマージ可能であり、デモ可能な状態で終了し、明示的な受け入れ基準によってゲーティングされます。**Phase 0** は、既存のスタックを共有レジデントエージェントのように動作させます。`AcpBridge` 上の設定といくつかの小さなコード変更です。**Phase 1** はチャネルホスティングを `qwen serve` に移行し（確定済みアーキテクチャ）、プロアクティブエンジンと単一の MVP クローズドループを追加します。**Phase 2** はチャネルメモリ、予算、および監査を追加します。

### トポロジー: 確定済みデーモン移行（旧 OD-1）

決定は**下されており**、保留中ではありません。Phase 0 は `AcpBridge` で出荷されます。**Phase 1+ はチャネルを `qwen serve` 配下で実行します**（`DaemonChannelBridge` またはデーモンチャネルランナーを介して）。ルームごとのメモリ永続化、権限メディエーター、イベントバス監査、FIFO `promptQueue`、および予算/監査クエリルートはすべてデーモンを必要とするためです。ゲートウェイ所有のスケジューラ（§6.2）は**移行に対して中立**です。ブリッジに関係なく `ChannelBase.sessionQueues` を介して直列化されるため、Phase 1 で出荷され、カットオーバーの影響を受けません。**Phase 0 の配線は `DaemonChannelBridge` アタッチパス（または `--daemon <url>` フラグ）を追加**し、移行が Phase-1 境界での設定ステップとなるようにし、書き換えにならないようにします。スケジューラが対処するように設計されている鋭いエッジに注意してください。`DaemonChannelBridge.prompt()` はキューイング**しません**。オーバーラップ時に `Prompt already in flight` を_スロー_します（`:257-261`）。デーモンの FIFO `promptQueue` は acp-bridge 側（`bridge.ts:2855,3082`）にあります。チャネル側の直列化は `ChannelBase.sessionQueues`（`:394`）です。これが、プロアクティブエンジンがターンがアクティブな間に `prompt()` を決して呼び出さない理由です（§6.2, Fix #1）。

### Phase 0 — 設定 + アイデンティティの注入（`AcpBridge` 上）

**目標。** どのメンバーがボットを @-メンションしても、すべてのメンバーが 1 つのセッションを共有し、エージェントが誰が話しているかを知り、実行中のタスクがチームメイトのフォローアップによって破壊されない DingTalk グループ。

**0.1 — "qwen tag" 設定プロファイル**（主に `settings.json`）:

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // マルチプレイヤー: グループ全体で 1 つの sessionId を共有。routingKey → `${name}:${threadId||chatId}` (:53)。
    // DingTalk は threadId を設定しない (:541-551) → キーは chatId = conversationId||sessionWebhook にフォールバック (:534)。
    // conversationId なしメッセージは過渡的な webhook をキーとする — これはハードエラーとして扱う。
    "sessionScope": "thread",

    // groupPolicy のデフォルトは "disabled" (GroupGate :13; config-utils :98) — 設定必須。さもないと全グループメッセージがドロップされる。
    // allowlist モードでは、"*" はメンバーシップのワイルドカードではない (GroupGate :42)。各 chatId をリスト化する。"*" はデフォルトのみを提供する。
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
事実（ground truth）に紐づくメモ: `requireMention` のデフォルトは `true` (`GroupGate.ts:49`)。`sessionScope` のデフォルトは `'user'` (`config-utils.ts:92`) — `'thread'` はマルチプレイヤー機構全体を指す。`dispatchMode` のグループデフォルトは `'followup'` にすべきである（ランタイムの `'steer'` ではなく、`:354`）。

**0.2 — 送信者の帰属（Sender attribution）。** `promptText` シード（`ChannelBase.ts:316`）における `[senderName]` プレフィックスは `isGroup` によってゲートされ、**すべてのターンで発火する**（`instructedSessions` によるゲートではない）。**新しい `Envelope.alreadyPrefixed`** フラグが `collect` の再入をガードする。§6.1 を参照。

**0.3 — `dispatchMode` の整合性確保。** グループごとの `dispatchMode` を明示的に設定する。コードとコメントを一致させるため、古い `types.ts:42` の JSDoc（`'collect'` → `'steer'`）を修正する（OD-5）。

**変更されたファイル（Phase 0）。** `start.ts`（オプションの `DaemonChannelBridge` アタッチパスを追加し、Phase 1 のコミット済みマイグレーションをフラグ1つで切り替えられるようにする）。`ChannelBase.ts`（`senderName` シード + `alreadyPrefixed` ガード + `/clear` の確認 + 許可リストゲート + `/who`）。`types.ts`（新しい `Envelope.alreadyPrefixed` フィールド + JSDoc の修正）。`docs/`（レシピ + 注意点）。

**受け入れ基準。**

- [ ] 2人のメンバーがボットを `@` メンションする。両方とも**同じ** `sessionId` に解決されることを確認する（`SessionRouter` のマップ経由でアサーション）。ルーティングキーは webhook URL ではなく `team-eng:<conversationId>` であること。
- [ ] エージェントが送信者の帰属を使用する（グループでは `[senderName]` が存在し、1:1 では存在しない）。`collect` の再入時にプレフィックスが二重に付与されないこと（`alreadyPrefixed` パスをアサーション）。
- [ ] メンションのないグループメッセージは破棄される（理由 `mention_required`）。許可リストにないグループは破棄される（`not_allowlisted`）。
- [ ] `dispatchMode: 'followup'` の場合、メンバー A のタスク中にメンバー B がメッセージを送信しても A はキャンセルされない。B のメッセージは A の後に実行される。
- [ ] 共有（スレッド）グループでは、`/clear` に `confirm` が必要であり、設定されている場合は `config.allowedUsers` に制限される（誰でもリセットできるわけではない）。`/status` は読み取り専用のままとなる。
- [ ] フックレベルのユニットテスト（`wait(ms)` を使う UI テストは不可）: 送信者間でのルーティングキーの等価性。`isGroup` が true の場合と false の場合の `promptText` プレフィックスの存在有無。`alreadyPrefixed` のスキップ。

### Phase 1 — デーモンマイグレーション + プロアクティブエンジン + MVP クローズドループ

**MVP の定義。** **単一のスケジュールされたダイジェストのクローズドループ**: オペレーターがチャネルに対して cron スタイルのジョブを登録する。発火時、ゲートウェイはチャネルのスレッドスコープセッションを解決し、ツールを使ってプロンプトを実行し、**結果をプロンプトなしでコールドチャネルにポストバックする**。1つのジョブ、1つのチャネル、1つの配信パス。よりリッチな動作は MVP のスコープ外である。

**コミット済みマイグレーション。** Phase 1 は `DaemonChannelBridge` を介して `qwen serve` 配下でチャネルをホストする（OD-1 の決定）。FIFO の `promptQueue`、メディエーター、eventBus、およびルートを継承する。プロアクティブエンジンは §6.2 である（ゲートウェイ所有のマイグレーションに依存しないスケジューラ。`dispatchProactive` は `sessionQueues` を介して直列化される。検証済みの `groupMessages/send` API を介した DingTalk コールド送信フォールバック。`tokenManager` の更新。`canColdSend` ケイパビリティフラグ）。これを非自明にしている3つの事実がある。現在の cron はセッションスコープであり、dispose 時に終了する（OD-8 の単一所有者ゲートにより解決済み）。DingTalk はコールドグループにメッセージを送信できない（検証済みのプロアクティブ API + 永続化された `openConversationId` により解決済み）。そして、プロアクティブプロンプトは `sessionQueues` を介して直列化されなければならず、`activePrompts` が保持されている間に `bridge.prompt()` を**決して**呼び出してはならない。そうでない場合、`DaemonChannelBridge` は `Prompt already in flight` をスローする（`:257-261`）。

**変更されたパッケージ。** `ChannelCronStore.ts`/`ChannelCronScheduler.ts`（新規、チャネルベース）。`cronParser.ts`（再利用）。`ChannelBase.ts`（`dispatchProactive`、`pushProactive`、`canColdSend` フラグ、`/schedule`）。`DingtalkAdapter.ts` + `dingtalk/src/proactive.ts`（新規コールド送信 + 永続化された `openConversationId` + `tokenManager`）。`FeishuAdapter.ts`（変更なし。プロアクティブ対応アダプターの参照、`canColdSend = true`）。`start.ts`（デーモン配下でホスト。`restoreSessions()` の後にスケジューラを構築 + 開始。セッション内 cron を無効化するために `isTagSession` をセッション構築にスレッド化 — OD-8）。セッション構築（タグセッションでは `startCronScheduler()` をスキップ、`Session.ts:667-668`）。

**受け入れ基準。**

- [ ] チャネルは `qwen serve`（デーモンホスト）配下で実行される。ツール呼び出しによって `permission_request` が表面化し（メディエーターに到達可能）、マイグレーションが確認されること。
- [ ] オペレーターが1つのダイジェストジョブを登録する。これはゲートウェイの再起動をまたいで永続化される（`~/.qwen/channels/cron.json` からリロードされる）。
- [ ] **開いているセッションがない**状態でジョブが発火したとき、ゲートウェイはスレッドスコープセッションを解決し、ツールでプロンプトを実行し、コールド送信パスを介してアイドル状態の DingTalk グループに配信する（コールドグループ配信を証明する）。`canColdSend = false` の場合、エンジンは**明示的に失敗する**（ログを出力し、`lastError` を記録し、暗黙に no-op しない）。
- [ ] 同じジョブが `tenant_access_token` を介して Feishu に配信され、`canColdSend` の抽象化が証明されること。
- [ ] 発火したジョブが「1セッションにつき1プロンプト」に違反しないこと。メンバーが会話中の場合、プロアクティブプロンプトは `sessionQueues` を介してその背後にキューイングされる（`activePrompts.get(sessionId)?.done` を await する）。`steer` によるキャンセルは決して行わず、`DaemonChannelBridge` のオーバーラップスローも決してトリガーしない。
- [ ] プロアクティブターンは、それ以降の人間のターンによってキャンセルされない（タググループは `followup` であり、`steer` にはならない）。
- [ ] `tokenManager` は v1.0 の `accessToken` を約2時間の有効期限切れ前および 401 発生時に更新するため、ソケットが2時間以上開いた後の送信でも成功すること。
- [ ] 永続化ジョブの二重発火がないこと。ゲートウェイのスケジューラが唯一の所有者である。タグセッションはセッション内 cron を起動しない（OD-8）。2つのストアは素集合のパス上にある。
- [ ] ジョブを削除すると、将来の発火が停止すること。
- [ ] フック/サービスレベルのテスト（フェイククロックに対するスケジューラ。モック HTTP クライアントに対するコールド送信）。`wait(ms)` は使用しない。

### Phase 2 — チャネルメモリ + トークン予算 + 監査ログ

**2.1 — チャネルスコープのメモリ**（§6.3）: `writeContextFile.ts` に `'channel'` スコープ + `channelKey` を追加する（`WriteContextFileScope` `:80`、`WriteContextFileOptions` `:83-97`、`resolveContextFilePath` `:223-240`）。`~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md` を出荷する。`ChannelBaseOptions` を介して CLI レイヤーの `readChannelMemory`/`writeChannelMemory` コールバックを配線し、`instructedSessions` を再利用してブートストラップ読み取りを行う。Phase 2 のデーモンルート `POST /channel/:sessionId/memory` はデーモントポロジー下でのみ有効とする。

**2.2 — チャネルごとのトークン予算**（§6.4）: チャネルをキーとする `BudgetLedger.ts`。**チャネル側の見積もりではアドバイザリ（WARN のみ）、実際のデーモン使用量でのみハード拒否する**（Fix #6/OD-9）。プロセスごとの組織ロールアップ + チャネルごとのウィンドウ、最厳格優先、固定のデイリーウィンドウ。75%/95% のアラート（プロアクティブ送信の依存関係）。

**2.3 — 監査ログ**（§6.4）: `RequestAttributionRing` + `task.requested` 行。**帰属情報はタイムスタンプ結合ではなく、実行中のターンに付随して保持される**（ターンごとの `currentTurnAttribution`）（Fix #7）。`GET /workspace/audit`（デーモン）または `/audit` チャネルコマンド。インメモリ FIFO 512、再起動時に失われる（既知の v1 の制限。`~/.qwen` への追記専用のフォローアップ、OD-11）。

**変更されたファイル。** `writeContextFile.ts`、`workspace-memory.ts`（スコープの検証 + GET ウォーカー、デーモンパス）。`BudgetLedger.ts`、`RequestAttributionRing.ts`（チャネルベース）。`permission-audit.ts`（パターンソース）/ 新規 `channel-audit.ts`（デーモン）。`ChannelBase.ts`（キューイングされたターンで `senderId`/`senderName` を保持 + `currentTurnAttribution`。予算フック）。`server.ts`（`express.json` `:2025` の後にルートをマウント。`mutate({ strict: true })` でミューテーションをゲート）。

**受け入れ基準。**

- [ ] `scope: 'channel'` は `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md` に書き込む。2つのグループは**独立した**ファイルを受け取る。共有ワークスペースの `QWEN.md` は変更されない。書き込みは注入されたコールバックを経由する（`channel-base → core` の依存関係なし）。
- [ ] チャネルメモリの追記は並行性に対して冪等である（ファイルごとの mutex）。実際のミューテーションが発生した場合にのみ `memory_changed` を発行する（デーモンパス。サブスクライバー側のフィルタリング）。
- [ ] **デーモン**パスでは、チャネルが実際の使用量ウィンドウの上限を超えた後、次の受信プロンプトは拒否され（切り捨てられない）、プロアクティブジョブは一時停止する。カウンターはデイリーウィンドウのローリングオーバー時にリセットされる。予算はチャネルごとに独立している。**見積もりのみ**のパスでは、予算は WARN を出すものの、ハード拒否は決して行わない（Fix #6）。
- [ ] 送信者 A のキューイングされたターンが実行中に発生したツール呼び出し/パーミッションは、B が後に `followup` でキューイングした場合でも、**A** に帰属される（Fix #7）。
- [ ] すべてのプロアクティブ発火、チャネルメモリの書き込み、および予算イベントは、ベストエフォートの `senderId`/`senderName` を伴って監査リングに記録され、監査サーフェス経由で読み取り可能である。**SSE バスにはブロードキャストされない**。
- [ ] リング/ルート/リゾルバーのユニットテスト（FIFO 削除、スコープパスの解決、予算閾値の計算、実行ターンの帰属）。UI/タイミングテストは不可。

### Phase の境界と将来のポインター

Phase 0→1→2 は追加型である。マルチプレイヤー + ID（`AcpBridge` 上） → デーモンマイグレーション + プロアクティブ MVP → メモリ + 予算 + 監査。**Phase 3 のマルチ ID ゲートウェイ**（チャネルごとに異なるボット ID/認証情報、真のユーザーごとのプリンシパル、チャネルごとのトークン）は_スコープ外_であり、単一のグローバルトークン / デーモンごとに1つのワークスペースという制約を取り除く自然な次のステップである。Phase 0～2 であっても、「qwen tag」は**ワークスペースごとに1つのエージェントプロセス**を必要とする（OD-2）。複数のリポジトリを提供するデプロイメントは、複数のプロセスを実行する。

---

## 8. qwen tag と Claude Tag の比較（トレードオフ）

Claude Tag はホスト型のマルチテナントエージェントである。Anthropic がランタイム、ID、およびユーザーごとの計測を運用し、チャネルアプリはシンクライアントである。`qwen tag` はその逆である。qwen-code のアダプター上で、オペレーターが管理するインフラストラクチャ上で動作する。この反転こそが、価値提案のすべてであり、リスクサーフェスのすべてである。

### qwen が優位な点

- **オープン / セルフホスト、データは内部に留まる。** エージェントはローカルで動作する。Phase 0 では stdio 経由（`AcpBridge.start()` は `node <cli> --acp` を実行）、Phase 1 からは `qwen serve` 配下でインプロセス動作し、ベンダー API を経由することはない。リポジトリの内容、モデルのトラフィック、およびトランスクリプトはオペレーターのホスト上に留まる。Claude Tag ではこの主張はできない。
- **MCP / 任意のツール。** クローズドなホスト型エージェントのツールサーフェスの厳密なスーパーセット。
- **アクションごとのパーミッション投票 — _デーモンホスト化後の Phase 1+ のケイパビリティ_。** qwen-code には `MultiClientPermissionMediator`（4つのポリシー、コンセンサス定足数 `floor(M/2)+1`、独立した監査リング）が同梱されている。これは真の差別化要因である。**Phase 0 の `AcpBridge` パスでは到達不可能**（`requestPermission` は自動承認される、`:108-118`）だが、Phase 1 でデーモン内にチャネルがホストされると到達可能になる。ただし、そこでも投票は `clientId` でキーイングされ、OD-3 の名簿が導入されるまで、チャネルは_単一_のクライアントである。死んだ `ChannelConfig.approvalMode` フィールド（`types.ts:36`）は、計画されていたが未実装であることを裏付けている。
- **永続的で検査可能な状態。** `SessionRouter` の永続化、プレーンな `QWEN.md`/`AGENTS.md` ファイル、および（デーモン、Phase 1+）Last-Event-ID リプレイリング。不透明なものは何もない。

### 差異があり、補完が必要な点

1. **単一のワークスペース + 単一のグローバルトークン + 人間の ID なし。** 1つのプロセスが1つのワークスペースにバインドされる。マルチワークスペース = N プロセス（OD-2）。単一のグローバルトークンは _HTTP デーモン_ に適用される。Phase 0 の `AcpBridge` チャネルパスには HTTP サーフェスもトークンもない（その境界は `SenderGate`/`GroupGate` である）。どこにも人間の ID は存在しない。`senderName` はアドバイザリなプロンプトテキストに過ぎない（OD-11）。_補完策:_ ワークスペース/チームごとに1つのプロセス。チャネルレイヤーで送信者の帰属を注入する。`clientId` をセキュリティ境界として維持する。ループバック以外のデーモンでは `--require-auth` + トークンを必須とする（OD-12）。
2. **プロアクティブ / コールドチャネルメッセージングが均一ではない。** DingTalk ではリアクティブな返信のみ（期限切れとなる `sessionWebhook`）。Feishu は `tenant_access_token` を介して自由に送信できる。_補完策:_ 永続化された `openConversationId` に対する Phase 1 の検証済みプロアクティブグループ送信（DingTalk、`canColdSend` が true に反転する）。Feishu は不要。
3. **スケジューラはセッションスコープであり、デーモンスコープではない。** Cron は30分のアイドルリープ時の `dispose()` で終了する。_補完策:_ ゲートウェイ所有のスケジューラ（§6.2） — 長寿命で、リープから生き残り、唯一の cron 所有者となる（OD-8）。
4. **メモリはワークスペースグローバルであり、チャネルごとではない。** _補完策:_ チャネルごとに1プロセス（コード変更ゼロ）または Phase 2 の `channel` スコープ（OD-10）。
5. **マルチ ID / 真のマルチテナントはスコープ外**（Phase 3）。Phase 0～2 ではマルチプロセスとしてモデル化される。
### リスクと緩和策

| #   | リスク                                                                                                                                                   | 重大度 | 緩和策                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | チャネルスタックのツール呼び出しは、フェーズ0の `AcpBridge` パス（`AcpBridge.ts:108-118`）で**自動承認**されます。リークしたチャネルはゲートなしで任意のツールを実行できます。 | 高     | フェーズ1でコミットされたデーモン移行によりメディエーターが導入されます。それまでは、ツールセットと信頼されたホストを制限します。                                                           |
| R2  | デーモンの単一グローバルトークンのリークは、ワークスペース全体へのアクセスを許可します（HTTP デーモンパス。`AcpBridge` パスにはトークンがありません）。                                    | 高     | ループバックデフォルト + Bearer ゲート。非ループバックでは `--require-auth`（OD-12）。信頼されたホスト。再起動によるローテーション。配線後は `consensus` の背後に破壊的なツールをゲートします。 |
| R3  | `dispatchMode` のデフォルト `'steer'` は、任意のメンバーのメッセージで実行中の作業をキャンセルします（JSDoc は `'collect'` と記載されていましたが、現在は `'steer'` に修正済み、`types.ts:42`）。       | 高     | タググループは `'followup'` を設定。JSDoc を整合（OD-5）。                                                                                                             |
| R4  | 送信者の特定がないため、エージェントが話者を混同します。                                                                                                 | 高     | グループターンのフェーズ0 `[senderName]` 注入（+ `alreadyPrefixed`、OD-6）。                                                                                     |
| R5  | DingTalk のコールドグループ / 期限切れの Webhook のプロアクティブ処理がサイレントに失敗します（`:137-141`）。                                                                         | 中   | フェーズ1で、永続化された `openConversationId` に対する検証済みのプロアクティブなグループ送信。`canColdSend` は失敗時にエラーを明示。劣化を表面化。                                           |
| R6  | セッションの回収（30分、`run-qwen-serve.ts:94`）で Cron / 通知が停止します。また、アウトバウンドパスが必要です（R5）。                                             | 中   | ゲートウェイ所有のスケジューラー（§6.2）。OD-8 単一所有者ゲート。                                                                                                             |
| R7  | `requireMention` が true の場合、メンションされていないグループメッセージがサイレントに破棄されます（`GroupGate.ts:51-52`）。                                                            | 低/中  | デフォルトを維持。ドキュメント化。オプションの初回メッセージヒント。                                                                                                          |
| R8  | 共有ワークスペースメモリが、同じプロセスで動作するグループ間で交差汚染されます。                                                                                           | 中   | チャネルごとに1プロセス、またはフェーズ2の `channel` スコープ（OD-10）。                                                                                                       |
| R9  | レート制限はユーザーごとではなく、`clientId` / IP ごとです（デーモンパス）。`AcpBridge` パスにはありません。                                                                | 低      | シングルテナントでは許容。ユーザーごとの計測はフェーズ3。                                                                                                       |
| R10 | コンセンサスの投票者セットはリクエスト時にスナップショット化されます。現在、チャネルメンバーは個別の `clientId` ではありません。                                                    | 低      | OD-3: フェーズ1で `first-responder`。コンセンサス前に `senderId` → 投票のマッピングを解決。                                                                                  |
| R11 | DingTalk SDK は、ソケットが閉じない限り約2時間のアクセストークンを更新しません。プロアクティブ / 感情 / メディアがサイレントに失敗します。                                   | 高     | `tokenManager` はプロアクティブ機能によって所有され、v1.0 の `oauth2/accessToken` エンドポイント経由で更新されます（§6.2、検証済み）。                                            |
| R12 | 人間のターン中にプロアクティブな呼び出しが `DaemonChannelBridge.prompt()` を呼び出すと、**`Prompt already in flight` がスロー**されます（`:257-261`）。                     | 高     | `dispatchProactive` は `sessionQueues` を介して直列化され、`bridge.prompt()` の前に `activePrompts` を待機します。スローガードは構造的に到達不可能です（Fix #1, §6.2）。 |
| R13 | 推定バジェットの誤検知が、正当なユーザープロンプトを拒否する可能性があります。                                                                                | 中   | 推定は WARN のみ。実際のデーモン使用量に対してのみハード拒否（Fix #6, §6.4）。                                                                                       |
| R14 | `followup` のキューイングが、ツール呼び出しを最後にキューイングされた送信者に誤って帰属させます。                                                                    | 中   | キューイングされたターンに `senderId` を保持。監査は実行中のターンを読み取ります（Fix #7, §6.4）。                                                                               |

---

## 9. 解決済みの決定事項

すべての v1 未解決の決定事項（Open Decisions）は、以下で選択された回答とともに解決されています。**唯一残っている真に未解決の項目**は、OD-7 の下にある信頼度の低い DingTalk API の詳細であり、最後の行で言及されています。

| ID                        | 質問                                                                                       | **決定**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | チャネルホスティングをフェーズ1以降のために `qwen serve` に移行するか、それとも `AcpBridge` に留まるか？                | **解決済み — 移行。** フェーズ0は `AcpBridge` で出荷されます。**フェーズ1以降は、`DaemonChannelBridge` / デーモンチャネルランナーを介して `qwen serve` の下にチャネルをホスト**し、FIFO `promptQueue`、`MultiClientPermissionMediator`、`eventBus`、`/workspace/memory`、およびレート制限を継承します。フェーズ0はアタッチパス（または `--daemon <url>`）を追加し、切り替えを構成ステップにします。ゲートウェイのスケジューラー（§6.2）は移行に対して中立です。もはやゲートではなく、コミットされたアーキテクチャです。                                                                                                                                                                                                                                                                                                                                                                                |
| **OD-2**                  | デプロイメントユニットはワークスペース/チャネルごとに1プロセスか？                                           | **解決済み — はい。** ワークスペース/チャネルごとに1プロセス：チャネルごとのメモリ + 秘密の分離、単一グローバルトークンの影響範囲を制限します。複数のチャネルを同じプロセスで動作させることはフェーズ3の懸念です（`channel` スコープ + ガバナーが必要です）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OD-3**                  | マルチプレイヤータグ（1チャネル = 1デーモン `clientId`）の権限ポリシーは？                 | **解決済み — フェーズ1: 単一のチャネルレベル `clientId` を持つ `first-responder`**（許可された任意のメンバーが解決。チャネル粒度の帰属。`senderId→clientId` マップなし）。**フェーズ2: `senderId→clientId` ロースター + ライフサイクル（回収、参照カウント境界）が存在するようになったら `consensus` / `designated`。** **プロアクティブなターンでは高リスクツールを自動拒否。**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | スレッドスコープの `/clear` / `/status` はチャネル全体に適用される。                                             | **解決済み — 共有（スレッド）グループでは、`/clear` は `confirm` を必要とし、設定されている場合は `config.allowedUsers` に制限**されます（ハイフン区切りの `/clear-channel` は解析不可能。メンバーごとの所有者ゲートは ID モデル、OD-3/OD-11 に延期）。`/status` は共有セッションで読み取り専用のままです。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | `dispatchMode` のデフォルトの不一致（JSDoc `'collect'` 対 ランタイム `'steer'`）。                      | **解決済み — `types.ts:42` の JSDoc を `'steer'` に修正**（ランタイムに一致）。タググループプロファイルは `dispatchMode: 'followup'` を明示的に設定します。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OD-6**                  | 送信者マーカーのフォーマット + `collect` の二重プレフィックス。                                                | **解決済み — ターンごとの `[senderName]` プレフィックス。`instructedSessions` によってゲートされない**、さらに **`collect` モードの合成再入が再プレフィックスをスキップするための、1つの新しいオプション `Envelope` フィールド `alreadyPrefixed`**（`types.ts`）。（v1 の「新しいフィールドなし」という主張を修正。）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | DingTalk プロアクティブ送信：エンドポイント/権限、`openConversationId` の同等性、トークンの更新。 | **検証済みの事実とともに解決（§6.2/§6.5）：** エンドポイント `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(高)_。ボディ `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _(高)_。認証ヘッダー `x-acs-dingtalk-access-token`。v1.0 `oauth2/accessToken` トークン、約7200秒の TTL、機能所有の `tokenManager` によってキャッシュおよび更新 _(高)_。`openConversationId` を `~/.qwen/channels/dingtalk-groups.json` に永続化。コールバック `conversationId` ≈ `openConversationId` _(中。`invalid.openConversationId` の場合は `chatId→openConversationId` 変換 API にフォールバック)_。**残りの未解決（低信頼度）：正確な権限ポイントコード/表示名。公式の同等性の逐語的な文。20回/分のスロットルが `groupMessages/send` に適用されるかどうか。** |
| **OD-8**                  | ゲートウェイとセッションスケジューラー間の Cron の二重発火。                                       | **解決済み — ゲートウェイのスケジューラーが唯一の Cron 所有者。** チャネルホストの（タグ）セッションは、セッション内の `Session` Cron を開始**しません**。チャネルホストからセッション構築時にスレッド化された `isTagSession` フラグを介して、自身がタグセッションであることを認識します（フェーズ1以降の `DaemonChannelSessionFactory` オプションバッグ。フェーズ0の `--acp` 生成オプション）。これにより `startCronScheduler()` がスキップされます（`Session.ts:667-668`）。2つの Cron ストアは**重複しないパス**（ゲートウェイ `~/.qwen/channels/cron.json` 対 セッション `~/.qwen/tmp/<hash>/scheduled_tasks.json`）上にあるため、同じジョブに対して両方のスケジューラーを実行する衝突リスクのみが存在し、これはゲートによって排除されます。                                                                                                                                                                                     |
| **OD-9**                  | トークンバジェットのスコープ、単一の情報源、ウィンドウ。                                                   | **解決済み — プロセスごとの「組織」ロールアップ + チャネルごとのウィンドウ、最厳格優先、固定の毎日ウィンドウ。** v1 はチャネル側でトークンを推定し（アドバイザリ、WARN のみ — ハード拒否しない、Fix #6）、デーモンホスト化後は正確なデビット（およびハード拒否）のために**デーモン使用量パス**を読み取ります。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | ルームごとのメモリ名前空間 + 書き込み権限。                                                 | **解決済み — `writeContextFile.ts` に `channel` スコープ（+ `channelKey`）を追加。** チャネルベースは、`ChannelBaseOptions` を介して注入された CLI レイヤーのコールバック（`readChannelMemory` / `writeChannelMemory`）を介して書き込み/読み取りを取得します。**`channel-base → core` の依存関係はありません。** ユーザーグローバルの場所 `~/.qwen/channels/memory/`。エージェントは `save_memory` インテントを介して追加します。ブートストラップの読み取りは `instructedSessions` ゲートを再利用します。                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | ユーザー ID モデル + 監査の永続性。                                                       | **解決済み — `senderName` はアドバイザリのみ。`clientId` が唯一のセキュリティプリンシパルのまま。** 実行中のターンでベストエフォートの帰属を保持（Fix #7）。**インメモリの FIFO 512 監査リング + 追記のみの `~/.qwen` フォローアップファイル。**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | 非ループバックのデーモンバックデプロイメントのトークン強化。                                    | **解決済み — 非ループバックのデーモンバックデプロイメントには `--require-auth` + トークンを要求。** ループバックのみは開発専用。`--require-auth` はドキュメント化されたデフォルトの姿勢です（`run-qwen-serve.ts` はすでに非ループバックでのトークンを強制）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **未解決（唯一の残り）** | OD-7 の下の低信頼度の DingTalk API の詳細。                                                | **まだ未解決 — コーディング前にコンソール内 / ライブドキュメントに対して検証：** (1) 「プロアクティブにグループメッセージを送信」の正確な権限ポイントコード/表示名（低）。(2) 標準の非クールアプリロボットに対してコールバック `conversationId` と `openConversationId` を同等とする公式の権威ある逐語的な文（中。ドキュメントで保証されたパスは `chatId→openConversationId` 変換 API）。(3) 「20メッセージ/分 → 約10分のスロットル」制限が `groupMessages/send` に逐語的に適用されるかどうか（低/中 — カスタム Webhook ロボットに対してドキュメント化されているが、orgapp 送信ページでは確認されていない）。                                                                                                                                                                                                                                                            |
---

## 10. リスクと緩和策

§8 の統合表を参照してください。重要なリスクを優先順位順に示します。

1. **R1 — Phase-0 チャネルパスでの自動承認。** 約束された Phase-1 のデーモン移行によってメディエートトランスポートが導入されるまで、チャネル常駐エージェントはガードなしで_あらゆる_ツールを実行します。最も重要な安全上のギャップであり、Phase 1 までは保守的なツールセットと信頼されたホストによって緩和します。
2. **R12 — プロアクティブなオーバーラップスロー。** 人間のターン中に `DaemonChannelBridge.prompt()` を呼び出すと、`Prompt already in flight` がスローされます（`:257-261`）。これは `sessionQueues` を介して直列化することで解消されます（Fix #1）— §6.2 の中心となる修正です。
3. **R11 — DingTalk トークンの有効期限切れ。** 「デモでは動くが2時間で死ぬ」という障害です。プロアクティブ機能は、長寿命な機能が出荷される前に `tokenManager`（検証済みの v1.0 エンドポイント、約7200秒の TTL）を所有します。
4. **R5 — DingTalk のコールドグループでのサイレント失敗。** 検証済みの送信パスなしでは、休止状態のグループへのプロアクティブな出力は不可能です。`canColdSend` はドロップするのではなく、明示的に失敗します。
5. **R3 — グループ内での `steer` のキャンセル。** ランタイムのデフォルトでは、マルチプレイヤーによる意図せぬ DoS 状態になります。タグプロファイルでは `followup` を設定します。
6. **R13/R14 — バジェットの誤検知と誤帰属。** 見積もりは WARN のみとします（Fix #6）。帰属情報は実行中のターンに付随させます（Fix #7）。
7. **R8 — 共有メモリの交差汚染。** チャネルごとに1つのプロセスを立てることが、コード変更なしの緩和策です。`channel` スコープが、同一配置（colocated）に対する解答となります。

各リスクはフェーズにマッピングされます。R1/R3/R4 は Phase 0–1、R5/R6/R11/R12 は Phase 1、R8/R13/R14 および監査/バジェットのリスクは Phase 2 です。

---

## 11. 付録: ファイルとシンボルのインデックス

### Channel base (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`、スレッド `:53`、シングル `:55`、ユーザー `:58`)、デフォルトスコープ `'user'` (`:25`)、`setChannelScope()` (`:40-42`)、`resolve()` (`:72-92`)、`getTarget()` (`:94`)、`persist()`/`restoreSessions()` (`:168-244`)、`PersistedEntry` (`:5-9`)。
- `ChannelBase.ts` — `handleInbound()` (`:238-471`)、プロンプト構築 (`:316-347`)、`bridge.prompt()` 呼び出し (`:425`)、ゲート (`:240-252`)、`dispatchMode` 解決 (`:353-354`)、steer (`:371-379`)、collect (`:361-370,445-463`)、followup (`:381-383,394-470`)、`activePrompts` (`:32-35,356`)、`sessionQueues` (`:394,466`)、抽象 `sendMessage()` (`:81`)、`registerCommand()` (`:141-143`)、コンストラクタールーター (`:62-64`)、`ChannelBaseOptions` (`:9-22,46`)、`/clear`/`/status` (`:147-217`)。
- `AcpBridge.ts` — `--acp` の spawn (`:53-70`)、`newSession(cwd)` (`:131`)、`prompt()` (`:147-180`)、`requestPermission` の自動承認 (`:108-118`)、`AcpBridgeOptions` (`:17-21`)。
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`)、セッションファクトリーのオプションバッグ (`:226-241`)、`activePrompts` ガード / **`Prompt already in flight` のスロー** (`:257-261`)、`cancelSession` (`:332`)、`respondToPermission` (`:346-374`)、権限イベント (`:557-633`)。
- `GroupGate.ts` — `requireMention` デフォルト true (`:49`)、メンバーシップ (`:42`)、メンションゲーティング (`:51-52`)、フォールバックチェーン (`:48`)、デフォルトポリシー `'disabled'` (`:13`)。
- `SenderGate.ts` — `check()` + ペアリング (`:42`)。
- `types.ts` — `GroupConfig` (`:10-13`)、`ChannelConfig` (`:27-51`)、`approvalMode` (`:36`)、`dispatchMode` JSDoc を `'steer'` に修正 (`:42`)、`senderName` (`:69`)、新しい `alreadyPrefixed` フィールド、`isGroup` (`:75`)、`SessionTarget` (`:88-93`)。

### DingTalk (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — `webhooks` マップ (`:84`)、`sendMessage()` (`:134-170`、webhook なしの return `:137-141`)、webhook キャッシュ (`:516-517`)、`getAccessToken()` (`:172-174`)、`emotionApi()` (`:188-207`、robotCode `:184`、openConversationId `:197`、empty-catch アンチパターン `:214-216`)、メディア robotCode (`:435`)、受信 `conversationId` (`:506`)、メンション削除 (`:527-529`)、`isMentioned` (`:520`)、`senderName` (`:544`)、`extractQuotedContext()` (`:272-298`)、`chatId` (`:534`)、`threadId` なし (`:541-551`)。
- `proactive.ts` (新規) — `POST /v1.0/robot/groupMessages/send` への `sendGroupMessage()` (`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` JSON 文字列)、`tokenManager` (v1.0 `oauth2/accessToken`、約7200秒 TTL、タイマー + 401 リフレッシュ)、`chatId→openConversationId` 変換フォールバック。
- `markdown.ts` — テーブルのパススルー、`splitChunks()`、`CHUNK_LIMIT=3800` (約5000文字の `sampleMarkdown` バジェット以下)、`extractTitle()`、`normalizeDingTalkMarkdown()`。
- `media.ts` — `downloadMedia` ヘッダー (`:39`)、ボディ `:42`。
- SDK: `client.mjs` gettoken (`:85-87`)、再接続 (`:157-163`)、イベント/コールバックの分割 (`:14-19,35-37,58-61,241-257`)、`constants.d.ts` `sessionWebhookExpiredTime` (`:13`)、`robotCode` (`:19`)、`TOPIC_CARD` (`:4`)。

### Feishu (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` プロアクティブ (`:622-676`、エンドポイント `:651`、`canColdSend = true`)、`refreshToken()` (`:581-620`)、`connect()` モード (`:146-176`)、`updateCard()` (`:742-792`)、取り込み dedup (`:1633-1870`)。
- `markdown.ts` — schema-v2 カードコンテンツ (`:69-189`)、`splitChunks()` (`:198-256`)。

### Core (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`、+`'channel'`)、`WriteContextFileOptions` (`:83-97`、+`channelKey`)、`resolveContextFilePath()` (`:223-240`、+`channel` ブランチ + `channelKey` パラメータ)、ファイルごとの mutex (`:48-57,159-162`)、絶対パスガード (`:142-146`)、`MAX_EXISTING_FILE_BYTES` (`:255`)、置換モード (`:202-211`)。
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`)。
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`)、プロジェクトごとのハッシュ化パス (`:1-9`)。
- `Session.ts` — `cronQueue`/`cronProcessing` フィールド宣言 (`:667-668`)、`startCronScheduler()` (`:758`、OD-8 に従いタグセッションではスキップ)、`dispose()` cron クリア (`:790-812`)、`#recordPromptTokenCount()` (`:2078-2087`)、`setNotificationCallback()` (`:2638-2668`)、`isIdle()` (`:777`)。

### Serve / daemon (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — `SessionEntry` ごとの FIFO `promptQueue` (`:232,2855,3082`)、`publishWorkspaceEvent` (`:3610,3649-3675`)。
- `eventBus.ts` — `BridgeEvent.data` フリーフォーム (`:51`)、`originatorClientId` (`:60`)、ヒステリシス閾値 (`:101-103`)、リプレイリング (`:92`)。
- `permissionMediator.ts` — 4つのポリシー + コンセンサス定足数 (`:348,621-637`)。
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`)、クローズドエントリユニオン (`:57-104`)、GET サーフェスを想定したヘッダードキュメント (`:22-25`)。
- `rate-limit.ts` — `(clientId|ip)` ごとのトークンバケット、`X-Qwen-Client-Id` (`:110`)。
- `auth.ts` — グローバルベアラートークン (`:259-266`)、`createMutationGate` strict (`:356`)。
- `workspace-memory.ts` — スコープ `workspace|global` (`:118-125`)、strict-auth mutate (`:114`)、書き込みごとのキャップ `MAX_MEMORY_CONTENT_BYTES` (`:79`)、固定 `projectRoot` のフォワード (`:185-190`)。

### CLI チャネルコマンド (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`)、`AcpBridge` の構築 (`:213,268,356,435`)、`setChannelScope` (`:361-362`)、`restoreSessions` (`:275,444`)、`sessionsPath()` (`:56-58`)、`checkDuplicateInstance()` (`:170-179`)、切断ハンドラー (`:241,403`)、Phase 1+ デーモンアタッチパス、CLI レイヤーでの `readChannelMemory`/`writeChannelMemory` の注入。
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`、sessionScope デフォルト `:91-92`、approvalMode `:94`、groupPolicy `:98`)、`resolveEnvVars()` (`:6-18`)。
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`)、チャネルタイプ (`:10-14`)。