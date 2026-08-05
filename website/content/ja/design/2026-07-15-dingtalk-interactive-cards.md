# DingTalk インタラクティブカード

## ステータス

[#6443](https://github.com/QwenLM/qwen-code/issues/6443) の最終実装契約。本ドキュメントは、付随するランタイム実装が従う実装の境界、ペイロード契約、状態の所有権、degradation の動作、受け入れ基準を固定します。

## 動機

DingTalk チャネルはすでに、Markdown の配信、タスクライフサイクルイベントの受信、パーミッションリクエストの中継、アクティブなプロンプトのキャンセルを行うことができます。まだ提供していないのは、その場での実行状況カード、正確な実行単位の Stop アクション、構造化された `ask_user_question` の回答を元のリクエストに返せるフォームカードです。

本設計は、DingTalk のテンプレートやコールバックペイロードをモデル、ツール、ACP スキーマ、他のチャネルアダプターに教えることなく、それらの DingTalk インタラクションを追加します。

## 第 1 章: ターゲットアーキテクチャ

![DingTalk interactive cards architecture](./assets/dingtalk-interactive-cards-architecture.png)

![Channel adapter compatibility and degradation](./assets/dingtalk-interactive-cards-other-im-impact.png)

![Future IM adapter extension boundary](./assets/dingtalk-interactive-cards-other-im-extension.png)

アーキテクチャには 4 つの所有権レイヤーがあります:

1. Core と ACP は引き続き、セマンティックな質問とパーミッションの解決を所有する。
2. `ChannelBase` は pending リクエストの登録、settlement、正確な実行単位のキャンセルを所有する。
3. DingTalk アダプターはカードのプレゼンテーション、コールバックルーティング、レジストリ、べき等性、degradation を所有する。
4. DingTalk Card OpenAPI は配信、ストリーミング更新、インスタンス更新、コールバックトランスポートを所有する。

カードは 2 種類あり、汎用的なカードライフサイクルは 1 つではありません:

| カード                  | ビジネスオブジェクト                         | DingTalk プロトコル                                        | ローカルライフサイクル                                                              |
| --------------------- | --------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ストリーミングステータスカード | 1 つの可視出力セグメント              | `createAndDeliver`、`/card/streaming`、`/card/instances` | `running`、`completed`、`failed`、`stopped`、`cancelled`                     |
| フォームコールバックカード    | 1 つの Channel 所有のユーザー質問リクエスト | `createAndDeliver`、カードコールバック、`/card/instances`     | `pending`、`submitted`、`cancelled`、`expired`、`resolved_outside_presenter` |

これらは認証とコールバックの ingress を共有しますが、独立したレジストリと状態マシンを保持します。

## 再利用される既存機能 — 変更なし

- `ask_user_question` はすでに質問、選択肢、マルチセレクトの動作を定義している。
- ACP のパーミッション metadata はユーザー質問のインタラクションを識別し、質問を保持する。
- pending のパーミッションはすでにリクエスト ID とワンショットの応答パスを持つ。
- `ChannelBase` はすでに、同じチャットに対する複数の pending パーミッションリクエストをサポートしている。
- タスクライフサイクルイベントはすでに `started`、テキストチャンク、ツール呼び出し、`completed`、`failed`、`cancelled` を公開している。
- アクティブなプロンプトのキャンセルはすでに `/cancel` を支えている。
- DingTalk はすでに Stream 接続と汎用の下流コールバック ingress を持っている。
- CLI/TUI、Web、IDE のサーフェスはすでにユーザー質問をネイティブにレンダリングしている。

## 検証済みのソース制約

以下の動作制約は、実装中に `origin/main` に対して再確認されました:

- `packages/channels/base/src/ChannelBase.ts` は、既存の Markdown プロンプトのフォーマットや送信の前に、リクエストとチャットのインデックスを含めて各 pending パーミッションを登録する。同じレジストリが 1 つのチャット内の複数のリクエストをサポートし、`/approve`、`/approve-always`、`/deny` のルックアップを駆動する。
- `packages/channels/base/src/ChannelAgentBridge.ts` は `PermissionResolvedEvent` にパーミッションの結果を含める。`packages/channels/base/src/AcpBridge.ts` は、成功した responder が返る前にそのイベントを同期的に発行する一方、`packages/channels/base/src/DaemonChannelBridge.ts` は応答済みリクエストのマッピングを保持し、イベントを後から発行できる。
- `packages/core/src/tools/askUserQuestion.ts` は 1〜4 個の質問を許可する。ライブの `permission_request` は順序付きの質問を保持するが、それぞれにレンダリング可能な `answerKey` が存在することは保証しない。`packages/acp-bridge/src/bridgeClient.ts` は、pending インタラクションのステータススナップショットにのみインデックスベースの answer key を追加する。したがって、Channel の継ぎ目はライブリクエストを正規化する際に同じ `String(index)` キーを導出しなければならない。
- ACP セッションは、パーミッションの結果に加えて、トップレベルの `answers: Record<string, string>` を消費する。マルチセレクトの回答は、既存の TUI と Web クライアントとの互換性のため、カンマとスペースで結合された文字列のまま。
- 汎用のパーミッションコマンドは、構造化された回答ではなく、選択肢またはキャンセルの結果を送信する。したがって、現在の Channel パスで `ask_user_question` を承認すると、空の回答マップで再開され、`No valid answers were provided.` が生成される。カードプレゼンテーションのパスは `/approve` を再利用してはならない。
- 複数のリクエストが pending の場合、既存の曖昧性レスポンスはすでにリクエスト ID とタイトルをリストするため、本設計はコマンドの曖昧性解消のためだけのカードフィールドを追加しない。

## 変更の影響と実装の境界

本ドキュメントのラベルは規範的です:

- **変更が必要 — 共用 Channel レイヤー** は、実装が `ChannelBase` または Channel 所有のパブリック型を変更することを意味します。
- **DingTalk のみの変更** は、他のアダプターが設定を読み取ったり状態マシンに参加したりしないことを意味します。
- **変更なし** は、既存の契約とランタイム動作が引き続き権威であることを意味します。

| レイヤーまたはサーフェース                                                                                | 影響                               | 必要な作業                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/channels/base/src/ChannelBase.ts`                                                     | 変更が必要 — 共用 Channel     | run identity、正確な実行単位のキャンセル、セマンティックな質問の正規化、プレゼンテーションの settlement、構造化質問のコマンド処理を追加する。                                            |
| `packages/channels/base/src/types.ts` とエクスポート                                               | 変更が必要 — 共用 Channel     | セマンティック入力の型に加えて、オプションのパブリックライフサイクル `runId` と `owner` を追加する。`ChannelBase` が発行する attended イベントは常に両方を設定する。                                              |
| `packages/channels/dingtalk`                                                                    | DingTalk のみの変更                 | カード設定、Card OpenAPI アクセス、コールバックのパース、所有者チェック、2 つのレジストリ、上限付きの結合投影、degradation、テストを追加する。                                      |
| 本設計ドキュメント                                                                            | 変更が必要 — ドキュメントのみ | 最終的なペイロード、所有権、変更影響、ライフサイクル、degradation、受け入れの契約を記録する。                                                                                    |
| アーキテクチャアセット                                                                             | ドキュメントのみ                   | 共用契約にプラットフォームフィールドを導入することなく、ランタイムチェーン、互換性と degradation のマトリクス、将来のアダプター拡張の境界を示す。                        |
| `packages/core`、`ask_user_question`、`ToolConfirmationPayload`                             | 変更なし                            | 引き続きセマンティックな質問を生成し、`answers` を消費する。                                                                                                                           |
| ACP エージェントセッション、ACP スキーマ、`acp-bridge`、パーミッションメディエーター、デーモンのルート、デーモン SDK | 変更なし                            | 引き続き `toolCall`、パーミッションの選択肢、結果、トップレベルの `answers` を運ぶ。                                                                                                     |
| `ChannelAgentBridge`、`AcpBridge`、`DaemonChannelBridge`、デーモンワーカー、`SessionRouter`    | 変更なし                            | 引き続き完全なパーミッションリクエストを中継し、所有する `sessionId` でルーティングし、パーミッションレスポンスを返す。別の `userQuestionRequest` ブリッジイベントは導入されない。         |
| CLI/TUI、Web/Desktop、IDE、SDK クライアント                                                          | 変更なし                            | 引き続き既存のネイティブな質問 UI とパーミッショントランスポートを使用する。                                                                                                             |
| Feishu、WeCom、QQ、Telegram、Weixin、プラグインアダプター                                        | 直接の変更なし                     | デフォルトの `unsupported` プレゼンテーション結果を継承し、既存のパーミッション Markdown とコマンドを保持する。構造化された Channel の回答を返せないという既知の制約は引き続き明示される。 |

オプションのパブリックライフサイクル `runId` と `owner` は、ライフサイクルイベントを合成するサードパーティアダプターやテストフィクスチャに即座の変更を強制することを避けます。`runId` は `ChannelBase` の内部ではオプションではありません: すべての Channel 所有のプロンプトが 1 つを持ち、そのプロンプトに対して発行されるすべてのライフサイクルイベントがそれを含みます。attended なインバウンドプロンプトも正規化された Channel の owner を運び、loop と webhook のプロンプトは意図的に省略します。必要な identity がない場合、DingTalk はインタラクティブカードを作成しません。

## チャネル中立のユーザー入力継ぎ目 — 共用 Channel の変更

`ChannelBase` は、3 つの明示的な結果を持つ 1 つのセマンティックプレゼンテーションフックを獲得します:

```ts
type UserInputPresentationResult =
  | { kind: 'presented' }
  | { kind: 'handled' }
  | { kind: 'unsupported' };

type UserInputSettlementReason =
  | 'resolved_outside_presenter'
  | 'cancelled'
  | 'run_cancelled';

type ChannelUserInputResponse = RequestPermissionResponse & {
  answers?: Record<string, string>;
};

interface ChannelUserQuestion {
  answerKey: string;
  header: string;
  question: string;
  options: Array<{
    label: string;
    description: string;
  }>;
  multiSelect: boolean;
}

interface ChannelPromptOwner {
  kind: 'channel_user';
  id: string;
}

interface ChannelUserInputRequestContext {
  requestId: string;
  sessionId: string;
  runId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  questions: ChannelUserQuestion[];
  submitOptionId: string;
  onSettled(listener: (reason: UserInputSettlementReason) => void): () => void;
  respond(response: ChannelUserInputResponse): Promise<boolean>;
}

protected presentUserInputRequest(
  context: ChannelUserInputRequestContext,
): Promise<UserInputPresentationResult>;
```

`onSettled` は、パブリックな `reason` が `any` である `AbortSignal` ではなく、型付きのワンショットサブスクリプションです。`ChannelBase` が唯一の settlement の書き込み手であり、各リスナーを `UserInputSettlementReason` で呼び出し、返された関数はそのリスナーのみを登録解除します。共用の `ChannelPromptOwner` は意図的にアダプター中立です: DingTalk のコールバックペイロードや identity フィールド名を公開せずに、その run を開始した人間の Channel ユーザーを識別します。コンテキストにはテンプレート ID、アクション ID、`outTrackId`、可変のブリッジオブジェクトは含まれません。`submitOptionId` は `allow_once` として公開された元のパミッション選択肢です。現在のプロデューサーとの互換性のため、ID が `proceed_once` で `kind` がない選択肢も同じように扱われます。アダプターが選択肢 ID を作り出すことは決してありません。

### セマンティックリクエストの認識

`ChannelBase` は 1 つのノーマライザーを所有し、アダプターが独立して ACP ペイロードを再解釈しないようにします:

1. 正典の識別子は `toolCall._meta.qwenInteractionKind === 'user_question'`。
2. 正典の質問は `toolCall._meta.qwenQuestions` に由来する。
3. 古いプロデューサーについては、正典のツール名またはツールの kind も `AskUserQuestion` を識別する場合にのみ、`toolCall.rawInput.questions` を受け付ける。たまたま `questions` 引数を受け入れる別のツールは、セマンティックなユーザー入力ではない。
4. ノーマライザーは 1〜4 個の順序付き質問を検証し、省略された `multiSelect` を `false` に正規化し、`answerKey: String(index)` を割り当てる。
5. 不正な形式の正典リクエストは部分的にレンダリングされない。既存の非対応パーミッションパスに従い、質問の回答をログに記録せずに構造化された診断を記録する。

フックは、pending パーミッションとその settlement コントローラーが保存された後、かつ既存のパーミッションフォーマッターと送信者の前に挿入されます:

```text
store PendingPermission + settlement controller
active = current attended Channel-owned ActivePrompt for event.sessionId
normalize semantic question + compatible allow_once option
if valid question and active has runId + submitOptionId:
  construct context from active and normalized questions
  result = presentUserInputRequest(context)
  presented   -> mark structured input as presented, keep pending, and return
  handled     -> only valid if the adapter synchronously invoked context.respond
  unsupported -> continue
format and send the existing permission message
```

`respond` クロージャが、アダプターから見える唯一の settlement 操作です。これはリクエスト ID を束縛し、既存のブリッジを通じて完全なレスポンスを転送し、`true`、`false`、スローのパスで同じ pending クリーンアップを実行します。`ChannelBase` は、プレゼンテーションフックが解決する前にそれが呼び出されたかどうかを記録します。その呼び出しのない `handled` は契約違反であり、既存のパーミッションメッセージにフォールスルーします。これはリクエストを pending のままにする 2 つ目の方法ではありません。

pending パーミッションを削除するすべてのパスは、コントローラーを正確に 1 回 settle します。これにはパーミッションコマンド、コンテキストの responder、デーモンの `permissionResolved`、セッションのクリーンアップ、タスクのキャンセル、ブリッジの置き換えが含まれます。ローカルで把握している run のキャンセルは、後から来た折りたたまれたブリッジの結果がそれを上書きする前に、`run_cancelled` で settle します。キャンセルの結果や元の拒否選択肢を持つ独立した `permissionResolved` は、中立の `cancelled` になります。別の結果や結果の欠落は `resolved_outside_presenter` になります。ブリッジは、タイムアウト、拒否、クリーンアップを推論するのに十分な原因情報を保持しないため、この分類は unknown なキャンセルに `expired` のラベルを付けることは決してなく、どのクライアントが応答したかを推測することも決してありません。DingTalk ローカルの質問タイマーが、responder を呼び出す前に、個別の `expired` 投影を所有します。

フックの対象となるのは、現在の attended な Channel 所有の `ActivePrompt` のみです。`loopPrompt === true` は対象外です。これはスケジュールされた loop ジョブと webhook プロデューサーの両方を除外し、それらのメッセージ ID と送信者は人間の DingTalk 入力ではなく合成だからです。対象となるアクティブなプロンプト、`runId`、owner が存在しない場合、`ChannelBase` はコンテキストを構築せずフックを呼び出しません。プレゼンテーションを `unsupported` として扱い、既存のパーミッションパスを継続します。アダプターは独立して、その run に対して同じ実際の DingTalk インバウンドメッセージの所有権レコードを要求します。したがって、CLI、Web、IDE、SDK、他のクライアント、loop、webhook が開始した run は、カードに紐付くインタラクションを作成しません。最初の設計は、クライアント間の identity 連携を追加しません。

デフォルトのフックは `unsupported` を返します。したがって、他の IM アダプターは現在のパーミッションのフォーマットとコマンドを保持します。

## 正確な実行単位の identity とキャンセル — 共用 Channel の変更

すべてのプロンプト呼び出しは、不透明で一意な `runId` を作成し、対応する `ActivePrompt` に保存します。これはデーモンのライフサイクル世代ではなく、それはプロンプトごとではなくセッションのライフサイクル操作で変わるものです。

`ChannelTaskLifecycleBase` はソース互換性のために `runId?: string` と `owner?: ChannelPromptOwner` を公開します。`ChannelBase` は、発行するすべての `started`、`text_chunk`、`tool_call`、ターミナルイベントに具体的な run ID を含めます。attended プロンプトはすべてのイベントに同じ owner を含め、loop と webhook のプロンプトは省略します。必要な identity のないイベントを受け取ったコンシューマーは既存の動作を継続できますが、カードのアクションを作成することはできません。

ステータスカードの Stop コールバックは、その `runId` を新しい protected の `ChannelBase` の正確な run 単位のキャンセルエントリポイントに運びます。このメソッドは現在のアクティブなプロンプトを 1 回読み取り、既存のキャンセルパスに入る前に期待される ID をアトミックにチェックします。アクティブなプロンプトの欠落、ID の欠落、stale、不一致は `false` を返します。カードに紐付くパスは、セッションのみのキャンセルに決してフォールバックしません。既存の `/cancel` の動作はセッションスコープのままで不変です。

受け入れられる Stop のシーケンスは以下のとおりです:

1. コールバックの所有者とカードの identity を検証する。
2. 最初の非同期操作の前に、現在のライブコールバックを同期的にクレームする。
3. `ChannelBase` に期待される正確な run のキャンセルを要求する。
4. キャンセルが `true` を返した場合、新しいステータスカードのチャンクをブロックし、ストリーミングをクローズし、Stopped のプレゼンテーションをコミットする。
5. キャンセルが `false` を返し、同じレコードがまだ最新で非ターミナルの場合、クレームを解放し、カードをアクティブのままにし、リトライを許可する。

クレームはアダプターローカルな進行中のロックであり、ライフサイクルの状態ではありません。非同期の結果は、まだ最新で非ターミナルの同じレコードのみを更新または解放できます。await 中に勝ったタイムアウト、settlement、ターミナルのライフサイクルイベントは上書きできません。これにより、古いカードが新しいプロンプトをキャンセルすることを防ぎ、重複コールバックの競合を防ぎ、パブリックな `processing` 状態を追加せずにキャンセル成功前に成功を主張することを避けます。

## 所有者専用のカードアクション — DingTalk のみの変更

カードアクションの認可は、共有セッションのメッセージ認可より厳格です。`sessionScope` に関係なく、Stop、submit、cancel は常に所有者専用です。

インバウンドメッセージ時に、DingTalk はすでに envelope の送信者として `senderStaffId` を優先し、`senderId` にフォールバックします。実際のインバウンドターンを `ChannelBase` に渡す前に、アダプターは `messageId -> DingTalkOwnerKey` を記録します。マップは既存のインバウンドメッセージの上限 1,000 エントリに従います。マッチする `started` ライフサイクルイベントはそのマッピングを消費して削除し、DingTalk ローカルの run/ステータスレコードを作成し、同じ Channel 生成の `runId` を型付きの owner に束縛します。loop と webhook のメッセージ ID はマップに決して入りません。ターミナルの run クリーンアップは、質問を最終化した後に run/ステータスレコードを削除します。コールバックルーターはコールバックの `userId`、`senderStaffId`、`senderId` を同じ型付きドメインに正規化し、完全一致を要求します。比較可能な identity が利用できない場合、アクションは fail closed（失敗時は拒否）となります。

外部ユーザーのコールバックは ACK されますが、run、パーミッションリクエスト、カードを変更することはできません。ライブカードがグループに属する場合、コントローラーは `forbidden` の結果を持つ元のグループターゲットを返し、アダプターはコールバックの ACK 後に「タスクの所有者のみがこのカードを操作できます」という汎用の通知をそのグループに送信します。この通知はアウトバウンドのグループメッセージパスを直接使用します: インバウンドメッセージに変換されず、Agent のコンテキストに決して入りません。通知の失敗はログに記録され、パーミッションの settlement、カードの変更、Agent への配信へのフォールバックはしません。ダイレクトカードの forbidden フィードバックは既存のダイレクトメッセージパスを保持します。

`ignored` は `forbidden` とは区別されます。重複、stale、不正な形式、認識できないコールバックは ACK されて安全に破棄され、グループへのフィードバックはありません。繰り返しや偽造されたコールバックがグループを氾濫させることを防ぎます。この区別はアダプター内部のコールバック処遇であり、可視の DingTalk カード状態ではありません。

## DingTalk ローカルな実装 — DingTalk のみの変更

`interactiveCards` を読み取り、カードのコールバックトピックを登録するのは DingTalk アダプターのみです。所有するのは:

- 固定の 10 秒リクエストタイムアウトを両方のカードタイプに適用する、共用の認証済み Card OpenAPI クライアント。
- 上限付きの実際のインバウンド所有者マップ。
- `runId` をキーとする run/ステータスレジストリ（オプションのステータスカード `outTrackId` 付き）。
- `requestId` と `outTrackId` をキーとする質問カードレジストリ。
- 所有者を検証するコールバックルーター。
- カードごとの結合ライター、一時的な進行中クレーム、上限付きのターミナルトゥームストーン。
- DingTalk ローカルのフォールバックと構造化エラーレポート。

質問のプレゼンテーションは `sessionId + owner.id` でスコープされます。異なるユーザーとセッションは、ライブカードを独立して所有できます。同じ run がそのスコープにすでに pending のネイティブ質問を持つ場合、別のリクエストは `unsupported` を返します: `ChannelBase` は最初のカードを回答可能なままにし、2 番目のリクエストを既存のテキストパーミッションフォールバックで送信します。最初のカードを期限切れにしたり、パーミッションレスポンスを合成したりしません。run の終了は、その run が所有するすべてのカードを期限切れまたはキャンセルします。

## ストリーミングステータスカードのライフサイクル — DingTalk のみの変更

ステータスカードは、Channel 所有の run 内の 1 つの可視出力セグメントを表します。CLI、Web、IDE、SDK、他のクライアントが開始した run も共有セッションの状態に影響し得ますが、DingTalk のステータスカードは作成しません。

作成とストリーミングは DingTalk のストリーミングカードプロトコルに従います:

1. ユニークな `outTrackId` と初期の `flowStatus=2` で `createAndDeliver` を呼び出す。
2. `isFull=true`、`isFinalize=false`、`isError=false` の空のフル更新でストリーミングを開く。
3. モデル出力をローカルに蓄積し、結合されたフルスナップショットを `/card/streaming` で送信する。
4. ステータステキストなどの低頻度のテンプレート変数は、`updateCardDataByKey=true` の `/card/instances` で送信する。

raw チャンクがそれぞれ 1 つのネットワークリクエストになることは決してありません。各ステータスレコードは、進行中の Card OpenAPI 書き込み最大 1 件と、置き換え可能な pending フルスナップショット 1 件を許可します。固定の 500 ms 最小フラッシュ間隔が、より新しいチャンクをその pending スナップショットに結合します。可視コンテンツは 20,000 文字が上限で、オーバーフローはメモリを増やすのではなく、最も古いコンテンツを削除して切り詰めマーカーを挿入します。すべての Card OpenAPI 呼び出しは 10 秒のタイムアウトを持ちます。中間のタイムアウトや失敗は構造化エラーを記録し、そのカードへの以降のストリーミング書き込みを停止し、await される最終配信パスのために最新の上限付きテキストを保持します。

ステータスカードは遅延生成で、セグメントスコープです。ダイレクトな質問はステータスカードを作成しません。質問前のテキストは、質問カードが提示される前にそのセグメントをクローズし、後続の継続テキストは新しいセグメントを開きます:

```text
first visible text -> running
running -> completed
running -> failed
running -> stopped | cancelled
question settlement + later text -> a new running segment
```

コアのライフサイクルは引き続き `cancelled` で、`stopped` イベントは導入されません。理由 `cancel_command` のキャンセルは DingTalk では「Stopped」として提示され得ますが、他のキャンセル理由は「Cancelled」として提示され得ます。

`blockStreaming !== 'on'` の場合、DingTalk は既存の await される `onResponseComplete()` の継ぎ目をオーバーライドします。そのメソッドは最新の蓄積テキストを消費し、pending のフラッシュタイマーをキャンセルし、タイムアウト内で進行中の唯一の書き込みを待ち、completed の最終インスタンス更新を行い、カードの作成や最終化が成功しなかった場合は既存の Markdown 送信者にフォールバックします。したがって `ChannelBase` は、await される配信パスが 1 つ完了した後にのみ `completed` を発行します。新しい共用のターミナル配信フックは追加されません。

`blockStreaming === 'on'` の場合、DingTalk はステータスカードを作成せず、カード配信のために raw ライフサイクルチャンクを消費しません。既存の `BlockStreamer` が唯一のレスポンス配信パスのままです。質問カードは引き続き独立して対象となります。`onTaskLifecycle` はターミナルの原因を記録し、ベストエフォートの failed/cancelled 投影を行い得ますが、await される配信の保証としては扱われません。

ターミナルのステータスカード更新は、1 つの上限付きの順序に従います:

1. 新しいストリーミングチャンクの受け付けを停止し、フラッシュタイマーをキャンセルし、各元のチャンクをリプレイする代わりに、単一の pending スナップショットを最終的な上限付きコンテンツに折り込む。
2. ストリーミングが開かれていた場合、`isFinalize=true` でクローズする。
3. 未解決のローカル画像マーカーをサニタイズし、ターミナルのキャンセルがファイルシステムパスを公開できないようにする。
4. 最終コンテンツ、コピー可能なコンテンツ、ステータステキスト、`flowStatus=3` を 1 回の `/card/instances` 更新でコミットする。

completed、failed、cancelled はすべて DingTalk の `flowStatus=3` に投影されます。最終コンテンツとステータステキストがそれらを区別します。一度ターミナルになると、`outTrackId` ごとのライターは遅延したストリーミング更新を拒否します。

## フォームコールバックカードのライフサイクル — DingTalk のみの変更

質問カードは、完全に正規化された質問配列を含む 1 つのパーミッションリクエストを表します。ツールのスキーマは 1〜4 個の質問を許可します。

各 pending レコードには以下が含まれます:

- `requestId`、`outTrackId`、`runId`。
- 完全な順序付き質問セットとその answer key。
- 元々公開された `submitOptionId`。
- 型付きの owner identity。
- 元のワンショット responder。
- タイムアウトと settlement のサブスクリプション。
- ローカルの `reserved`、`pending`、`claimed` の状態。ターミナル化はレコードをコンパクトなトゥームストーンに置き換える。

ライフサイクルは、その永続化や合成メッセージの継続をコピーすることなく、最新の OpenClaw の配信競合規律に従います:

```text
reserved   inserted and subscribed before createAndDeliver
pending    activated only after successful delivery while still reserved
claimed    atomically claimed by one valid callback
terminal   first settlement wins; live payload is compacted
```

`createAndDeliver` が進行中に settlement や run のキャンセルが `reserved` レコードをターミナルにした場合、後で成功した配信がそれを再有効化することはできません。アダプターはベストエフォートでその配信されたカードを無効化し、responder を再度呼び出さずに返します。

コールバックの順序が権威です:

1. `outTrackId` でレコードを特定し、リクエストと run を対応付ける。
2. レコードを変更せずに submit または cancel のペイロードをパースする。
3. アクションの所有者を検証する。
4. submit については、保存された正規化質問セットに存在しないフォームの answer key をすべて拒否する。
5. 最初の非同期操作の前に、現在の `pending` レコードをアトミックに `claimed` としてクレームする。
6. コールバックを即座に ACK する。無効、重複、stale、外部所有者のコールバックも、同期チェックの後で正確に 1 回 ACK される。
7. 元の responder を呼び出す。
8. 同じレコードがまだ最新で非ターミナルの場合、responder の結果からカードを最終化して投影する。

submit は既存のクライアント間契約を使用してフォームをエンコードします:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "<advertised allow_once option>"
  },
  "answers": {
    "0": "Beijing staging",
    "1": "Logs, Metrics"
  }
}
```

シングルセレクトの値とカスタム入力は文字列です。マルチセレクトの値は、現在の TUI と Web の動作に合わせるため `", "` で結合されます。cancel はキャンセルまたは公開された拒否の結果のみを送信し、回答は送りません。アダプターが合成のプロンプトやインバウンドメッセージを送信することは決してありません。

カードは、responder が回答を受け入れる前に送信成功を決して表示しません:

| イベント                              | ローカル状態                  | カード投影                                                       |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| submit の responder が `true` を返す    | `submitted`                  | 送信済みで無効化                                                |
| cancel の responder が `true` を返す    | `cancelled`                  | キャンセル済みで無効化                                                |
| `respond(...) === false`           | `expired`                    | 非インタラクティブな `card_status=expired`、「Question no longer available」 |
| `respond(...)` がスロー              | `expired`                    | 非インタラクティブな失敗投影、無効化、リトライ不可       |
| 独立した非キャンセルの settlement  | `resolved_outside_presenter` | 非インタラクティブな `card_status=expired`、「Resolved outside this card」   |
| 独立した折りたたまれたキャンセル | `cancelled`                  | 非インタラクティブな `card_status=cancelled`、中立の「Cancelled」          |
| タイムアウト                            | `expired`                    | 期限切れで無効化                                                  |
| リクエストまたは run の破棄           | `cancelled`                  | Cancelled または Stopped で無効化                                     |
| 重複または遅延したコールバック         | 既存のターミナル状態      | ACK して無視                                                |
| ターミナルレコードへの settlement    | 既存のターミナル状態      | ターミナルのトゥームストーンを通じて無視                                 |

`resolved_outside_presenter` のローカル状態は、`false` の responder 結果から推測されるのではなく、独立した非キャンセルの settlement イベントからのみ入ります。`false` はパーミッションレスポンスが受け入れられなかったことのみを意味します: リクエストのマッピングが存在しない、そのセッションが消滅した、または別のサーフェスがすでに勝った可能性があります。したがって、どちらのケースもユーザーのキャンセルを主張せずに、非インタラクティブな `expired` 投影を使用します。

既存のデーモンブリッジは、`respondToPermission()` がスローした際にリクエストからセッションへのマッピングを消費し、`ChannelBase` は同じパスで pending リクエストを削除します。ブリッジが unknown なリクエストとして拒否し得るため、後続のデーモンの `permissionResolved` はもはや信頼できるクリーンアップシグナルではありません。したがって DingTalk は失敗をログに記録し、pending レコードを削除し、ターミナルのトゥームストーンを保持し、即座にベストエフォートの非成功投影を行います。クレームを解放したり、コールバックのリトライを約束したりしません。

`AcpBridge` は、成功した `respondToPermission()` が返る前に `permissionResolved` を同期的に発行します。DingTalk の responder クレームが進行中の間、アダプターは responder の結果とコールバックアクションが判明するまで、マッチする settlement の投影を延期します。受け入れられた submit は `submitted` に、受け入れられた cancel は `cancelled` になります。`false` とスローは上記のターミナル行を使用します。ローカルの responder クレームなしで受信した settlement は、上記の結果を認識する行に従います。デーモンブリッジは、応答済みリクエストのマッピングを保持した後で、成功した settlement を後から発行します。カードがすでにターミナルの場合、トゥームストーンはそのイベントを無視します。DingTalk ローカルのタイマーは、まずライブカードを `expired` として最終化してから responder を呼び出すため、ブリッジの折りたたまれたキャンセルがラベルを付け直すことはできません。ローカルで把握している run のキャンセルも同様に、ブリッジのクリーンアップ前に `run_cancelled` として最終化します。unknown な折りたたまれたキャンセルは中立の `cancelled` のままです。この調停は一時的なクレームを再利用し、パブリックな処理状態、リトライキュー、エラー分類は追加しません。

インスタンス更新は UI の投影であり、パーミッションのトランザクションではありません。responder が成功したが後続のカード更新が失敗した場合、パーミッションは解決済み、ローカルレコードはターミナル、重複コールバックは拒否されたまま、アダプターは失敗した UI 投影をログに記録します。

OpenClaw の参考実装と異なり、Qwen Code は合成のインバウンドメッセージを注入しません。元のパミッションリクエストに直接応答します。同じライブ run 内の 2 番目のリクエストはテキストフォールバックを使用し、最初のネイティブカードを回答可能なままにします。

## 設定と組み込みテンプレート — DingTalk のみの変更

ケーパビリティの設定は DingTalk ローカルです。DingTalk アダプターがパースし、`ChannelConfig` にチャネル間のカード概念を追加しません:

```json
{
  "interactiveCards": {
    "enabled": true,
    "statusCard": {
      "enabled": true
    },
    "questionCard": {
      "enabled": true,
      "timeoutMs": 270000
    }
  }
}
```

有効な質問の寿命は、設定されたタイムアウトとホストのパーミッション寿命の小さい方です。

テンプレート ID は組み込みの DingTalk チャネルアセットであり、ユーザー設定ではありません。参考プラグインは、インストールする bot 自身の DingTalk 認証情報とともにこれらの ID を使用します。これらは参考リポジトリの AppKey が所有するリソースとしては扱われません:

- ステータスカード: `675cde2f-f526-40cb-b828-f5b2b57b8b77.schema`
- 質問カード: `c2a6355b-9724-4f7e-9653-d33fcb3311bb.schema`

本設計はユーザー指定のテンプレート設定や起動時のヘルスチェックを追加しません。初回使用時の OpenAPI 拒否は、テンプレート ID と DingTalk のエラーコードを含む大きな構造化エラーであり、その後、文書化された degradation パスに入ります。

組み込みアセット契約とコールバックフローのエビデンス:

- [soimy/openclaw-channel-dingtalk#583](https://github.com/soimy/openclaw-channel-dingtalk/pull/583) はマージ済みで、実機でのカード配信、submit コールバック、cancel コールバック、タスク継続の検証を記録している。
- [soimy/openclaw-channel-dingtalk#585](https://github.com/soimy/openclaw-channel-dingtalk/pull/585) はマージ済みで、最終的な質問カードのテンプレートアセットを出荷し、メンテナーに承認された。
- [`a8fb6f80e7` 時点の OpenClaw main](https://github.com/soimy/openclaw-channel-dingtalk/commit/a8fb6f80e7360ce0ffee2d4a8007951bd85b23a4) が、現在の reserve/activate/claim/terminal の配信競合の参考を提供する。

これらのソースは Card OpenAPI、テンプレート、並行性のエビデンスを提供します。Qwen Code はそれらの個別のツール、`AsyncLocalStorage`、永続的なライフサイクルストア、合成メッセージの再注入、質問の置き換え、fail-open の所有者チェック、await 後のコールバック ACK タイミングはコピーしません。

## Degradation の動作 — DingTalk のみの変更

最初の設計はバックグラウンドのリトライキューを追加せず、永続的な `presentation_failed` 状態も保持しません。

| 状況                                           | 動作                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ステータスカードが無効、または作成/最終更新が失敗 | 既存の await される Markdown レスポンス配信を使用し、構造化されたカードエラーを記録する。中間更新の失敗は以降のストリーミング書き込みを停止し、最終配信のために上限付きテキストを保持する。 |
| ステータスカードは配信されたがストリーミングのオープンが失敗      | ベストエフォートで空のカードを無効化し、その run のカード書き込みを停止し、既存の await される Markdown レスポンス配信を使用する。                                                                        |
| `blockStreaming === 'on'`                           | ステータスカードをスキップし、既存の `BlockStreamer` 配信パスを保持する。質問カードは引き続き独立して対象となる。                                                                            |
| 質問カードの作成                               | `presented` を返し、元のパミッションを pending のままにする。                                                                                                                                         |
| 同じ run にすでに pending のネイティブ質問がある      | より新しいリクエストに `unsupported` を返し、最初のカードをアクティブのままにし、より新しいリクエストには既存のテキストパーミッションフォールバックを使用する。                                                       |
| 質問カードが無効または作成失敗            | 読みやすいセマンティック Markdown を送信し、質問がキャンセルされリトライ可能であることを伝え、元のリクエストをキャンセルし、`handled` を返し、テンプレートを認識した失敗をログに記録する。                     |
| 現在の Channel 所有のアクティブな run がない                 | プレゼンテーションを `unsupported` として扱い、両方の DingTalk カードをスキップして既存のパーミッションパスを保持する。                                                                                          |
| 正確な run 単位のキャンセルが `false` を返す              | 同じレコードが最新で非ターミナルのままの場合のみ一時的なクレームを解放し、Stop がリトライできるようステータスカードをアクティブに保つ。                                                         |
| 質問の responder が `false` を返す                  | 既存のキャンセル投影と、中立の「Permission no longer pending」メッセージで終了する。                                                                                               |
| 質問の responder がスロー                           | pending レコードを削除し、クレームされたレコードをキャンセルとして終了し、トゥームストーンを保持し、即座に非成功を投影し、コールバックのリトライを宣伝しない。                                      |
| 別のパスが先に解決                         | ローカルの responder クレームが進行中でない場合、折りたたまれたキャンセルを中立の `cancelled` に分類する。非キャンセルの結果にのみ `resolved_outside_presenter` を使用する。                             |
| リクエスト/run の破棄                            | リクエスト/run のキャンセルとして settle し、カードを Cancelled または Stopped に投影する。                                                                                                                     |
| 別の IM アダプターがセッションを所有                 | `unsupported` を返し、既存のパーミッションメッセージとコマンドを保持する。                                                                                                                   |
| 通常のパーミッション                                 | `/approve`、`/approve-always`、`/deny` を不変に保つ。                                                                                                                                        |

カードで提示された質問に対して、`/approve` と `/approve-always` は認識されたままですが responder は呼び出しません。承認は必要な `answers` オブジェクトを提供できないため、カードを通じて送信するようユーザーに指示します。拒否は回答なしですでに完了しているため、`/deny [requestId]` はエスケープハッチのままです。`ChannelBase` はコマンドの送信者が元のプロンプト送信者と一致することを要求し、その後、同じワンショットのコンテキスト responder を通じて拒否をルーティングすることで、カードの settlement、レジストリのクリーンアップ、first-responder-wins のセマンティクスをそのまま保ちます。曖昧なリクエストは既存の明示的なリクエスト ID プロンプトを保持します。他のパーミッションとアダプターは現在のコマンド動作を保持します。最初の設計は自動的なコールバックリトライを約束しません。

## クライアントへの影響 — 既存クライアントは不変

| クライアントまたはサーフェース                                          | 影響               | 本提案後の動作                                                          |
| ---------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| DingTalk Channel 所有の run                                 | DingTalk のみの変更 | ストリーミングステータスカードを作成・更新する。                                          |
| DingTalk Channel 所有の質問リクエスト                    | DingTalk のみの変更 | フォームコールバックカードまたは DingTalk ローカルのセマンティックフォールバックを提示する。                   |
| Channel 所有のアクティブな run がない DingTalk ルーティングのリクエスト | 動作変更なし   | DingTalk カードなし。既存のパーミッションパスを保持する。                              |
| CLI/TUI                                                    | 変更なし            | 引き続きネイティブな質問ダイアログを使用する。                                            |
| Web/Desktop                                                | 変更なし            | 引き続きネイティブな質問コンポーネントと既存のアクション転送を使用する。           |
| IDE/ACP                                                    | 変更なし            | 引き続きネイティブな ACP 質問 UI を使用。スキーマ変更なし。                          |
| SDK とカスタム ACP クライアント                                 | 変更なし            | 引き続き既存のパーミッションリクエストとレスポンスのプロトコルを使用する。                 |
| 他の IM アダプター                                          | 直接の変更なし     | `unsupported` を継承し、現在のパーミッション動作と既知の制約を保持する。 |
| 通常のパーミッション                                       | 変更なし            | すべてのクライアントで既存の承認 UI とコマンドを保持する。                           |

パーミッションの解決は引き続き first-responder-wins です。一時的な DingTalk のクレームは、1 つのカードのコールバックをシリアライズし、その responder 呼び出し中に到着したマッチする settlement を調停するのみです。共用の settlement を置き換えません。ローカルのクレームなしに独立した settlement が到着した場合、DingTalk はどのクライアントが応答したかを主張せずにその結果を分類します。カードの responder が `true` を返した場合、コールバックアクションが `submitted` または `cancelled` を選択し、マッチする `permissionResolved` は別のサーフェスが勝った証拠ではなくクリーンアップです。

## 実装の受け入れ基準

実装が完了するのは、以下の動作がカバーされた場合のみです。これらのテストは変更されたレイヤーを検証します。変更のない Core、ACP、デーモン、Web、IDE、他のアダプターのスイートは本提案のフィーチャー作業ではありません。

### 共用 Channel のテスト — 変更が必要

- すべての Channel 所有のプロンプトがユニークな `runId` を得る。そのプロンプトのすべてのライフサイクルイベントが同じ ID を持ち、同じセッションの後続のプロンプトは異なる ID を得る。
- 正確な run 単位のキャンセルは現在の ID に対してのみ成功する。欠落、stale、不一致の ID は `false` を返し、セッションのみのキャンセルには決してフォールバックしない。
- セマンティックノーマライザーは正典の `_meta.qwenInteractionKind` と `_meta.qwenQuestions` を受け付け、順序付きの文字列 answer key を割り当て、欠落した `multiSelect` を `false` に正規化する。
- 互換パスは、識別された AskUserQuestion ツールに対してのみ `rawInput.questions` を受け付け、`questions` 引数を持つ別のツールを誤分類しない。
- submit 選択肢の正規化は `kind: allow_once` と、`kind` のない現在のレガシーな `proceed_once` 選択肢を受け付け、選択肢 ID を決して作り出さない。
- `presented`、`handled`、`unsupported` はそれぞれ宣言された pending 所有権の動作に従う。
- loop と webhook のプロンプトは、通常のライフサイクルイベントを発行しても、セマンティックカードのプレゼンテーションの対象外。
- カードで提示された質問は `/approve` や `/approve-always` では承認できない。所有者専用の `/deny [requestId]` は同じワンショット responder を使用し、通常のパーミッションはすべてのコマンドを保持する。
- settlement リスナーは型付きの `UserInputSettlementReason` の値のみを受け取る。ローカルで把握している run のキャンセルは、後から来た折りたたまれたブリッジのキャンセルに優先する。
- ダイレクトレスポンス、外部の `permissionResolved`、タイムアウト、キャンセル、セッションの死、ブリッジの置き換え、送信失敗は、pending レコードを正確に 1 回 settle して削除する。

### DingTalk アダプターのテスト — DingTalk のみの変更

- 実際の人間の DingTalk `started` イベントは、そのインバウンドメッセージと owner から 1 つの対象となる run を束縛する。合成、unknown、loop、webhook のメッセージ ID は対象となる run もカードも作成しない。
- ブロックストリーミングがオフの場合、1 つのステータスカードが、進行中の書き込み最大 1 件と上限付き pending スナップショット 1 件でチャンクを結合する。completed の配信は最終化を await し、Markdown にフォールバックする。ブロックストリーミングがオンの場合、ステータスカードは作成されず、既存のブロック配信が引き続き権威。
- Stop は所有者とカードの identity を検証し、1 回だけクレームし、マッチする `runId` のみをキャンセルし、重複を拒否し、非ターミナルの `false` 結果の後のみリトライ可能。
- 1 つのパーミッションリクエストが、すべての質問と順序付き answer key を含む 1 つの質問カードを作成する。同じ run の 2 番目のリクエストは、最初のカードがインタラクティブなまま、テキストにフォールバックし、異なるユーザーとセッションは独立したまま。
- 質問は配信前に reserved され、配信後にまだライブの場合のみ activate され、進行中の settlement や run のキャンセル後に決して復活しない。
- submit は元々公開された `allow_once` 選択肢を選択し、シングル、マルチセレクト、カスタム回答を `Record<string, string>` としてエンコードし、元のリクエストを直接解決する。
- 保存された正規化質問セット外の answer key を含む submit は、responder が呼び出される前に拒否される。
- コールバックトランスポートは、同期のパース、対応付け、認可、クレームの後、かつ responder や Card OpenAPI の await の前に、正確に 1 回 ACK される。
- submit、cancel、タイムアウト、run のキャンセル、リクエストの破棄、外部の解決、重複コールバック、responder の `false`、responder のスロー、カード投影の失敗はすべて `finalizeQuestion` を使用し、run レベルの pending セットをクリアし、ターミナルレコードを決して再オープンしない。
- 外部または識別不能なコールバックユーザーは fail closed（失敗時は拒否）となり、どちらのレジストリも変更できない。
- ストリーミングコンテンツ、Card OpenAPI の時間、ターミナルのトゥームストーンは固定のサイズ/時間の境界に従う。ターミナルレコードには responder、回答、質問、タイマー、サブスクリプション、キューイングされたコンテンツが含まれない。
- カードの無効化やテンプレートの拒否は、raw リクエスト JSON を公開せずに、文書化されたステータスまたは質問の degradation パスに従う。

### エンドツーエンドのレビュアー検証 — 変更された DingTalk の動作

- 実際の DingTalk クライアントで、ステータスカードの作成、順序付きストリーミング、完了、失敗、キャンセルの投影を検証する。
- Stop アクションが正確にそのアクティブな run をキャンセルし、古いカードが同じセッションのより新しい run をキャンセルできないことを検証する。
- 1 つおよび複数の質問カード、シングルセレクト、マルチセレクト、カスタム入力、キャンセル、タイムアウト、送信された回答によるタスク継続を検証する。
- 同じデーモンセッションに Web または IDE をアタッチし、そこで先に質問を解決し、DingTalk カードが DingTalk が送信したと主張することなく非インタラクティブになることを検証する。
- 各カードタイプを独立に無効化し、文書化された Markdown の動作と、タスク実行の継続または質問のキャンセルを検証する。
- `blockStreaming=on` で、既存のブロックレスポンスが引き続き権威である一方、質問カードは正常に送信できることを検証する。

## 第 2 章: 他の IM アダプターへの現在の影響 — 直接の変更なし

共用フックはオプトインの継ぎ目であり、DingTalk の動作のロールアウトではありません。Feishu、QQ、Telegram、WeCom、Weixin、プラグインアダプターは、DingTalk の設定、テンプレート ID、コールバックアクション、カード状態を読み取りません。既存のパーミッションのフォーマットとコマンドは不変のままです。

既存の制約は引き続き明示されます: `/approve` は `ask_user_question` の回答を運べません。本提案は、他の IM アダプターで質問を暗黙にキャンセルしたり raw リクエスト JSON を公開したりしません。

## 第 3 章: 将来の拡張ブループリント — 本提案では変更なし

将来の IM アダプターは、自身の現在の `ActivePrompt` に紐付いたリクエストに対してセマンティックフックを明示的にオーバーライドできます。`presented` を返すアダプターは、プラットフォームのプレゼンテーション、コールバックまたは構造化返信の parser、pending レジストリ、所有者と run のチェック、タイムアウト、原因を認識する settlement、べき等性、元のリクエストへの直接応答を所有しなければなりません。run を再開するためだけに合成のユーザーメッセージを注入してはなりません。

各アダプターは、プラットフォーム固有のケーパビリティと状態の所有権を独立してレビューできるよう、別々の変更を通じてオプトインすべきです。

## リスクとスコープの境界

最初の実装は意図的にデーモンローカルです。ライブの pending カードレジストリはプロセスのライフタイムに紐付きます。再起動に安全な復旧や、非スティッキーなマルチインスタンスのコールバックルーティングには、別の永続化設計が必要です。ターミナルレコードは、コールバックの対応付け、ターミナル状態、期限の metadata のみにコンパクト化され、コールバックの再配信のために 10 分間保持され、カードタイプごとに最大 1,000 エントリの挿入順マップに保存されます。期限切れと最も古いエントリの退去がそれを回収します。ターミナル化を生き延びる responder、質問ペイロード、回答ペイロード、タイマー、サブスクリプション、キューイングされたコンテンツはありません。

本実装は、クライアント間の run の所有権や identity マッピング、チャネル間の文本回答プロトコル、自由形式の返信パース、合成メッセージの注入、汎用のチャネル間カードフレームワーク、コールバックリトライシステム、新しい処理/エラーの状態マシンは追加しません。
