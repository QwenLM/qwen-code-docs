# セッションクラッシュリカバリーと統合リカバリーサービスの設計

## 1. Design Goals

Recovery Service はセッションリカバリーの統合された決定レイヤーである。復旧したセッション履歴を読み取り、現在のリカバリー状態を分類し、続行に必要なプロトコル修復と continuation ペイロードを構築し、TUI、デーモン、SDK、ヘッドレスのエントリポイントに同じ結果を公開する。

既存の機能:

- 追記専用の JSONL セッションストレージ。
- セッションロードと API 履歴の再構築。
- 孤立した `tool_use` / `tool_result` の修復。
- 3 状態の中断検出。
- ヘッドレス、nonInteractive 制御、ACP の continue エントリポイント。

今日の主な問題は、リカバリー機能が完全に欠けていることではない。問題は以下である:

- リカバリーの決定が複数のエントリポイントに散らばっている。
- TUI / デーモン / SDK が同じリカバリー状態を見ない。
- 修復が低レベルで暗黙に行われ、ユーザーやクライアントから見えない。
- 将来のリカバリー状態は、複数のエントリポイントへ繰り返し配線する必要がある。

統合 Recovery Service の目標:

- 統合された分類: すべてのエントリポイントが同じリカバリープランを使用する。
- 統合された修復: すべてのエントリポイントが同じツールペア修復と中断分類を再利用する。
- 統合された可視性: TUI / デーモン / SDK のすべてが、再開がクリーンか、中断されたか、degraded かを判別できる。
- 統合されたデバッグデータ: 修復、合成結果、破棄は表示とログのための構造化出力として公開される。
- 統合されたテスト: 同じクラッシュフィクスチャでコアプランと各エントリポイントアダプターをカバーできる。

## 2. Core Design: Recovery Service

コアサービスを追加する:

```text
packages/core/src/core/session-recovery.ts
```

UI を描画せず、ツールを実行しない。唯一の責務は、セッションのトランスクリプトと現在のチャット履歴から決定的な `SessionRecoveryPlan` を生成することである。

推奨される型:

```ts
export type SessionRecoveryKind =
  | 'clean'
  | 'interrupted_prompt'
  | 'interrupted_turn'
  | 'degraded_history';

export type RecoveryRepair =
  | { type: 'synthesized_tool_result'; callId: string; name: string }
  | { type: 'dropped_duplicate_tool_result'; callId: string; name: string }
  | { type: 'history_gap'; childUuid: string; missingParentUuid: string };

export interface SessionRecoveryPlan {
  planId: string;
  sessionId: string;
  kind: SessionRecoveryKind;
  originalApiHistory: Content[];
  apiHistory: Content[];
  repairs: RecoveryRepair[];
  canContinue: boolean;
  canAutoContinue: boolean;
  requiresUserConfirmation: boolean;
  visibleNotice?: string;
  continuation?: {
    mode: 'retry_user_parts' | 'tool_result_parts';
    parts: Part[];
    displayText: string;
  };
}
```

推奨されるエントリポイント:

```ts
export function buildSessionRecoveryPlan(input: {
  sessionId: string;
  conversation: ConversationRecord;
  historyGaps?: HistoryGap[];
  options?: {
    allowAutoContinue?: boolean;
  };
}): SessionRecoveryPlan;
```

コアフロー:

1. `ConversationRecord` から `originalApiHistory` を構築する。
2. 無視できない `historyGaps` が存在する場合、セッションを `degraded_history` に分類する。
3. `originalApiHistory` に対して `detectTurnInterruption` を実行する。これは修復より前に行わなければならない。そうでないと、ぶら下がった `model[functionCall]` が最初に合成の `functionResponse` で閉じられ、状態を `interrupted_turn` に分類できなくなる。
4. `originalApiHistory` をプロバイダー安全な履歴へクローンし、既存の `repairOrphanedToolUseTurns` をクローンに対して実行し、結果を `plan.apiHistory` に保存する。
5. 分類から continuation ペイロードを構築する:
   - `interrupted_prompt`: 末尾のユーザーパーツを Retry セマンティクスでリプレイする。
   - `interrupted_turn`: ぶら下がったツール呼び出しを合成エラーの `functionResponse` パーツで閉じる。
6. UI / デーモン / SDK の表示とデバッグ用に `visibleNotice` と `repairs` を生成する。

命名の互換性:

- 既存の公開プロトコル文字列 `interrupted_turn` を引き続き使用する。`interrupted_tool_turn` は追加しない。nonInteractive 制御、ACP、既存のテストはすでに `interrupted_turn` に依存しており、Recovery Service は移行コストを追加すべきではない。

## 3. Role and Value of the Recovery Service

### 3.1 Robustness

統合サービスは、現在の暗黙で散在するリカバリー挙動を明示的なステートマシンに変える。

現在の状態:

- 再開時の初期化は孤立した `tool_use` エントリを修復するが、エントリポイントは常にその修復が発生したことを知っているわけではない。
- ヘッドレス / ACP は続行できるが、TUI はユーザーに何を伝えるべきか分からない。
- 親チェーンのギャップにはすでに部分的な可視処理がある: `SessionService.loadSession` は `historyGaps` を返し、TUI / ACP はギャップ通知を表示できる。しかし、統合されたリカバリーメタデータや一貫したセーフモードポリシーはまだない。

Recovery Service の導入後:

- すべての再開は最初に明示的な状態を生成する: `clean`、`interrupted_prompt`、`interrupted_turn`、`degraded_history`。
- あらゆるエントリポイントが同じプランに基づいて、続行、通知、degrade を決定できる。
- 履歴ギャップはクリーンな履歴としてサイレントに扱われない。
- 後で新しいリカバリー状態が追加されても、プラン構築のみを拡張すればよく、すべてのエントリポイントがロジックを再実装する必要はない。

堅牢性の利点は、リカバリーが「各所が必要に応じて少しずつ修復する」から「各リカバリーに 1 つの統合された分類結果がある」へ移行することである。

### 3.2 Safety

リカバリーにおける最大の安全性リスクは、シェルコマンド、ファイル書き込み、外部 API 呼び出しなど、副作用のあるアクションの自動繰り返しである。

Recovery Service の安全性原則:

- デフォルトでは未知のツールを自動的にリプレイしない。
- ぶら下がったツール呼び出しはデフォルトで失敗した `functionResponse` パーツに変換し、リトライするかどうかはモデルに判断させる。
- `interrupted_turn` は、呼び出し元が明示的にオプトインしない限り、デフォルトで `requiresUserConfirmation = true` とする。
- `degraded_history` は決して自動続行しない。
- すべての合成修復はログとデバッグのために `repairs` に含める。

これにより次が優先される:

- プロバイダーが無効な履歴を受け取らない。
- ユーザーがリカバリーロジックにより危険なアクションを繰り返さない。
- TUI / SDK が、どのツール結果がリカバリー失敗として合成されたかを明確に表示できる。

安全性の価値は、リカバリーが実行を盲目的に再開しないことである。まずプロトコル形状を修復し、その後保守的なポリシーで続行する。

### 3.3 Completeness

この設計はすべてのクラッシュシナリオを即座に解決するわけではない。現在の機能が確実に分類できる状態に焦点を当てる。

即座にカバーされるもの:

- クリーンな再開。
- 末尾のユーザープロンプト: `interrupted_prompt`。
- 末尾のツール結果送信: これも `interrupted_prompt` に分類され、Retry でリプレイされる。
- ぶら下がったツール呼び出し: `interrupted_turn`、合成のエラーツール結果付き。
- 非隣接のツール結果: 既存の修復が法的な位置へ引き上げる。このプランの最初のバージョンは、修復 API が後でそれらを返すよう拡張されない限り、引き上げの詳細を別途記録しない。
- 重複ツール結果: 重複を破棄。
- 親チェーンギャップ: `degraded_history`。

まだカバーされないもの:

- 途中で切断されたが、通常のモデルテキストのように見える末尾を残すモデルテキストストリーム。
- グレースフルな中断と未知のクラッシュの細かな区別。

ここでの完全性は、一度に大量のコードを追加することからではなく、現在分類できる状態が一貫して処理されるよう、現在の機能を統合プランへ集約することから生まれる。

### 3.4 Engineering Architecture

Recovery Service は、CLI、TUI、デーモン、単一のエントリポイントではなく core に置くべきである。

理由:

- `SessionService`、`buildApiHistoryFromConversation`、`GeminiChat` の修復、`detectTurnInterruption` はすべて core または core 隣接レイヤーにある。
- TUI / ヘッドレス / ACP / デーモン / SDK はアダプターである。
- リカバリー分類はドメインロジックであり、UI 描画ロジックではない。

推奨されるレイヤリング:

```text
SessionService
  Read JSONL, rebuild ConversationRecord, return historyGaps

SessionRecoveryService
  Build RecoveryPlan from ConversationRecord + historyGaps

GeminiClient / GeminiChat
  Consume plan.apiHistory to initialize chat
  Execute plan.continuation when needed

TUI / headless / ACP / daemon / SDK
  Display plan.visibleNotice
  Trigger continuation from user or API requests
```

このレイヤリングの利点:

- Core が事実と決定を所有する。
- UI が表示を所有する。
- デーモン / SDK がプロトコル出力を所有する。
- テストは完全な TUI を起動せずにコアプランを直接実施できる。

### 3.5 Visibility and Debuggability

Recovery Service が生成するプランは、2 種類の出力へ変換できるべきである:

1. ユーザーに見える通知:

```text
The previous session stopped after tool execution. Marked 2 unfinished tool
calls as failed so the history can be sent safely. You can continue the task;
the model will decide whether to retry based on the failure results.
```

2. デバッグログまたはオプションのシステムレコード:

```ts
type RecoveryDebugPayload = {
  planId: string;
  kind: SessionRecoveryKind;
  repairs: RecoveryRepair[];
  timestamp: string;
};
```

この情報は API 履歴に入らない。診断、エクスポート、デバッグ専用である。システムレコードとしての永続化は延期可能であり、この設計の必須要件ではない。

価値:

- ユーザーはリカバリー中に何が起きたかを知れる。
- SDK クライアントは正確な状態を表示できる。
- バグレポートに `planId` と `repairs` を含められる。
- 同じ中断末尾が複数回自動続行されにくくなる。

## 4. Entrypoint Integration

### 4.1 TUI

`/resume` の後、または `--resume` を付けた起動の後:

1. `SessionService.loadSession(sessionId)`。
2. `buildSessionRecoveryPlan(...)`。
3. `config.startNewSession(sessionId, sessionData, recoveryPlan)`、またはプランを保持する同等の仕組み。
4. UI 履歴を読み込む。
5. `plan.kind !== 'clean'` の場合、INFO 項目を挿入する。
6. `/continue` または「中断されたターンを続行」アクションを提供する。

TUI はデフォルトで `interrupted_turn` / `degraded_history` を自動続行しない。

### 4.2 Headless / nonInteractive Control

`continueInterrupted` や `continue_last_turn` は、散在する検出器を直接呼び出さなくなる。代わりに:

1. 現在のチャット履歴または復元された会話からプランを構築する。
2. `plan.canContinue = false` の場合、何もしない結果を返す。
3. 続行が許可されている場合、`plan.continuation` を実行する。

### 4.3 ACP / daemon

`loadSession` / `resumeSession` レスポンスにリカバリーメタデータを追加する:

```ts
{
  recovered: boolean;
  recoveryKind: SessionRecoveryKind;
  canContinue: boolean;
  requiresUserConfirmation: boolean;
  repairs: {
    type: string;
    count: number;
  }
  [];
}
```

`continueLastTurn` もプランに基づいて受け入れ / 拒否し、実行直前に再検証すべきである。

### 4.4 SDK

SDK 統合は 2 つのカテゴリを区別する必要がある:

- デーモンベースの SDK: デーモンの `loadSession` / `resumeSession` レスポンスからリカバリーメタデータを消費し、リカバリーバナーを表示し、ユーザーまたはホストアプリケーションが continue をトリガーできるようにする。
- プロセスベースの SDK: `ProcessTransport` 経由で CLI を起動し、`--resume` / `--continue` フラグを使用する。stream-json のシステムメッセージまたは SDK プロトコルフィールドを通じて公開される同等のリカバリーメタデータが必要である。

どちらの SDK カテゴリも、低レベルの JSONL やツールペア修復を直接理解すべきではない。エントリポイントレイヤーが公開する構造化されたリカバリー結果のみを消費すべきであり、degraded 状態では自動続行をブロックすべきである。

## 5. Unit Test Design

Recovery Service は、TUI や実際のプロバイダーに依存しない独立したユニットテストを持たなければならない。

コアフィクスチャ:

1. クリーンな履歴:
   - モデルテキストの末尾。
   - 完全なツール呼び出し + ツール結果 + 最終モデル。

2. `interrupted_prompt`:
   - 最後のエントリがユーザーテキスト。
   - 最後のエントリがユーザーの functionResponse パーツのグループ。
   - 複数の末尾ユーザーエントリ。

3. `interrupted_turn`:
   - functionResponse のないモデルの functionCall。
   - 複数の functionCall のうち一部のみ完了。
   - id のない FunctionCall はスキップ。

4. 修復:
   - 非隣接の functionResponse が引き上げられ、プロバイダー安全な履歴が合法になる。
   - 重複の functionResponse が破棄される。
   - 合成ツール結果の形状が既存の修復と一貫したままになる。

5. `degraded_history`:
   - `historyGaps` が空でない。
   - `canAutoContinue = false` を確認。
   - `visibleNotice` にギャップ情報が含まれることを確認。

6. 圧縮チェックポイント:
   - 最新の圧縮後の末尾が正しく検出される。
   - システムレコードは API 履歴に入らない。

エントリポイントアダプターテスト:

- TUI の `/resume` は、非クリーンプランの受信後に INFO 項目を挿入する。
- ヘッドレスの `continueInterrupted` はプランの continuation を使用し、ユーザーメッセージを重複させない。
- ACP の `continueLastTurn` は同じフィクスチャに対して同じリカバリー種別を返す。
- デーモンの `loadSession` レスポンスにリカバリーメタデータが含まれる。

主要なテスト目標: 同じ履歴フィクスチャは、core / TUI / ACP / デーモンで同じリカバリー種別を生成すべきである。

## 6. Conclusion

統合 Recovery Service は、多くの新しい仕組みを即座に導入するのではなく、主に既存の機能を集約するため、この段階で最も価値の高い変更である。

その直接的な価値:

- リカバリー状態を TUI / デーモン / SDK / ヘッドレス間で一貫させる。
- 既存の孤立 `tool_use` 修復を、暗黙の 400 防止ステップから明示的なリカバリープランに変える。
- 中断ターン続行をローカルなヘッドレス / ACP 機能から再利用可能なコア機能に変える。
- 将来のリカバリー状態に向けた安定した拡張ポイントを提供する。

それ単独ではすべてのクラッシュ問題、特にテキストストリーム途中のクラッシュを解決しない。この文書は、過度の設計を避けるため、それらの拡張を意図的に今回の範囲外とする。現在の目標は、すでに存在し確実に分類できるリカバリー機能を統合することである。
