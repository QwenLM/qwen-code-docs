# Workflow レベルの Span 粒度不足分析 (P1)

> 2026-05-13 時点の qwen-code origin/main のレビューに基づく

## 現状

qwen-code は tracing 基盤を備えている：

| コンポーネント | 場所                                               | 説明                                                     |
| -------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Span 型定義    | `packages/core/src/telemetry/session-tracing.ts`   | `interaction`、`llm_request`、`tool`、`tool.execution`   |
| Tracer ツール  | `packages/core/src/telemetry/tracer.ts`            | session root context、`withSpan`、`startSpanWithContext` |
| 対話エントリ   | `packages/core/src/core/client.ts`                 | 最上位の対話で明示的に `interaction` span を開始         |
| ライフサイクル管理 | —                                                  | AsyncLocalStorage + WeakRef + TTL cleanup                |

現在のランタイムで安定して接続されているのは主に 2 種類の generic spans である：

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**結論： 「tracing の幹はある」段階には達しているが、agent workflow のフェーズ境界が trace ツリーに完全にエンコードされていない。**

### 比較：claude-code が実装している span 型

`claude-code/src/utils/telemetry/sessionTracing.ts` (line 49) を参照：

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## 欠落項目

| 欠落している span / メカニズム                   | 影響                                              |
| ------------------------------------------------ | ------------------------------------------------- |
| `permission_wait` / `blocked_on_user` span       | 承認待ち vs ツール実行時間を区別できない          |
| `hook` span                                      | hook の時間が tool span に吸収され、境界が不明瞭   |
| `subagent` root span                             | subagent 内部の llm/tool 呼び出しが trace サブツリーを形成できない |
| `tool.execution` の実際の配線                    | helper は定義済みだがメインリンクから呼ばれていない |
| 安定した parent-child 配線                       | spans の多くが session root 直下の sibling であり、階層ツリーではない |

## 項目別分析

### 1. ユーザー承認待ちが trace に含まれない

ツール呼び出しが承認待ちの場合、状態遷移パスは `awaiting_approval` → `scheduled` → 実行となる。

- 「ユーザー確認待ち」は状態遷移であり、trace ノードではない
- trace 上で承認待ち時間を確認できない
- ツールが遅い場合、「承認待ちで止まっている」のか「ツール自体の実行が遅い」のか区別できない

### 2. Hook にイベント記録はあるが独立した span がない

Pre/Post hook 実行後は `HookCallEvent` を生成し、`logHookCall()` で記録するが、独立した OTel span は生成しない。

- hook が遅くなると外側の tool span が遅くなったように見える
- hook が失敗すると「tool の失敗」として表示される
- trace は「時間が hook と tool.execution のどちらで消費されたか」に答えられない

### 3. Subagent は log/metric であり trace サブツリーではない

subagent 起動/完了時に `SubagentExecutionEvent` を記録して log/metric に入るが、明示的な span サブツリーは形成されない。

- 「どの subagent が実行されたか」は統計できる
- 「この subagent がどの llm/tool 呼び出しを引き起こしたか」を trace で追跡できない
- 並行 subagent シナリオで因果関係が不明瞭

### 4. tool.execution helper は定義済みだがメインリンクに接続されていない

`session-tracing.ts` には既に `startToolExecutionSpan()` / `endToolExecutionSpan()` が存在するが、テストコード以外では呼び出し箇所が見られない。

現在の実際の trace ツリー：

```
session-root
  interaction
    api.generateContent
    tool.Bash
  subagent_execution        (log/metric)
  hook_call                 (event/QwenLogger)
```

理想的な trace ツリー：

```
interaction
  llm_request
    tool
      tool.blocked_on_user
      hook(pre)
      tool.execution
      hook(post)
  subagent
    interaction
      llm_request
        tool
```

### 5. Parent-child 配線が不安定

interaction span は既に存在するが、多くの実行中 spans は session root 直下の sibling として配置され、interaction の子ノードではない。

- 呼び出しツリーがフラット
- ノード間の因果関係が直感的でない
- 1 ユーザーラウンドから内部の llm/tool/hook/subagent まで追跡する体験が連続しない

## 影響

- traces には基本的な価値があるが、workflow レベルのトラブルシューティングには不十分
- 「このラウンドはユーザー待ち、hook、それとも tool の実実行が遅いのか」に直接答えられない
- subagent の実行過程を trace サブツリーとして可読性高く復元できない
- hook の問題が tool span に吸収され、境界が不明瞭
- Jaeger / Tempo / ARMS 上のツリーが claude-code よりフラットで読みにくい

---

## claude-code の方式の再利用分析

> 2026-05-13 時点の claude-code ソースコードとの深度比較に基づく

### claude-code の tracing アーキテクチャ

claude-code は `src/utils/telemetry/sessionTracing.ts` において、**二重 ALS ベースの統一 span 管理システム**を実装している：

```
                    interactionContext (ALS)          toolContext (ALS)
                          │                                │
                          ▼                                ▼
              ┌─────────────────────┐           ┌─────────────────────┐
              │  interaction span   │           │    tool span        │
              │  (session root)     │           │  (child of intxn)   │
              └─────────────────────┘           └─────────────────────┘
                   ▲ parent of                       ▲ parent of
                   │                                 │
           ┌───────┴───────┐              ┌──────────┼──────────┐
           │               │              │          │          │
      llm_request      tool          blocked    execution    hook
                                     _on_user
```

**コアメカニズム：**

| メカニズム        | 実装                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 二重 ALS          | `interactionContext` に現在の interaction span を保存；`toolContext` に現在の tool span を保存                                                                                                |
| parent 解決       | span 型ごとにどの ALS から parent を取得するかがハードコード：`llm_request`/`tool` は `interactionContext` から；`blocked_on_user`/`execution`/`hook` は `toolContext` から；`hook` は `interactionContext` へフォールバック |
| ライフサイクル    | `enterWith` で注入 → span 実行 → `enterWith(undefined)` でクリア                                                                                                                             |
| span の検索       | ALS 非保存の span（例：blocked_on_user）は `activeSpans` Map により `span.type` で逆引き                                                                                                      |
| メモリ管理        | ALS が保持する span は `WeakRef` を使用；ALS 非保存の span は `strongRef` で GC を防止；TTL 30分で自動クリア                                                                                   |

**claude-code tool span の完全ライフサイクル** (`toolExecution.ts`)：

```
startToolSpan(name, attrs)                    // → toolContext.enterWith(spanCtx)
  startToolBlockedOnUserSpan()                // → parent = toolContext.getStore()
    [permission resolution / user prompt]
  endToolBlockedOnUserSpan(decision, source)
  startToolExecutionSpan()                    // → parent = toolContext.getStore()
    [tool.call()]
  endToolExecutionSpan({ success })
endToolSpan(result)                           // → toolContext.enterWith(undefined)
```

**claude-code hook span** (`hooks.ts`)：

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [parallel hook execution]
endHookSpan(span, { success, blocking, ... })
```

### qwen-code の現行アーキテクチャ vs claude-code

#### 根本的な差異：2 つの断絶した span 作成パス

これは qwen-code の現時点で最も重要なアーキテクチャ上の問題である：

| 層                  | ファイル                 | 使い方                                                                                          | parent 解決                                                 |
| ------------------- | ------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| session-tracing 層 | `session-tracing.ts`     | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan`   | `interactionContext` ALS から明示的に parent を取得        |
| tracer 層           | `tracer.ts`              | `withSpan` / `startSpanWithContext`                                                           | `context.active()` から parent を取得、fallback は session root |

**ランタイムでの実際の呼び出し状況：**

- `startInteractionSpan` → **接続済み** (`client.ts` line 956)、`interactionContext` ALS に書き込む
- `startLLMRequestSpan` / `endLLMRequestSpan` → **未接続**、ランタイムは `withSpan('api.generateContent', ...)` を使用 ( `loggingContentGenerator.ts` 内)
- `startToolSpan` / `endToolSpan` → **未接続**、ランタイムは `withSpan('tool.${name}', ...)` を使用 ( `coreToolScheduler.ts` 内)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **未接続**

**結果：**

`withSpan` の `getParentContext()` はまず `context.active()`（OTel ネイティブ context）をチェックし、アクティブな span がない場合に session root context にフォールバックする。**`interactionContext` ALS を全く読み取らない。**

そのため、interaction span と LLM/tool spans は session root 直下の**同一階層の sibling** となり、parent-child ツリーにならない：

```
session-root
  ├── interaction         (session-tracing 由来、interactionContext ALS に書き込まれる)
  ├── api.generateContent (withSpan 由来、interactionContext を読まない → session root 直下)
  ├── tool.Bash           (withSpan 由来、同上)
  └── tool.Read           (withSpan 由来、同上)
```

**一方 claude-code では、1 つの span 作成パスしか存在せず（sessionTracing.ts）、すべての span が同じ ALS → OTel context 変換ロジックを通るため、ツリーは完全である。**

#### 項目別再利用評価

##### 1. 二重 ALS + 明示的 parent 解決 — 再利用可能、核心的な修正

| 次元             | claude-code                                             | qwen-code                                    |
| ---------------- | ------------------------------------------------------- | -------------------------------------------- |
| ALS 数           | 2 (`interactionContext` + `toolContext`)                | 1 (`interactionContext`、`toolContext` なし) |
| parent 解決      | span 型ごとにどの ALS から parent を取得するか明示指定   | `withSpan` で一律 `context.active()` を使用   |
| context 注入     | `trace.setSpan(otelContext.active(), parentCtx.span)`    | `withSpan` 内部で `startActiveSpan` により暗黙的に注入 |

**再利用方法：**

qwen-code の `session-tracing.ts` は claude-code と**ほぼ同じ parent 解決パターン**を既に実装している：

```typescript
// qwen-code session-tracing.ts (既に存在するが未使用)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

このコードは claude-code の `startLLMRequestSpan` のロジックと**完全に一致する**。

**核心的な修正パス：ランタイム内の `withSpan('api.*')` / `withSpan('tool.*')` 呼び出しを廃止し、session-tracing の型付きヘルパーを呼び出すように変更する。** session-tracing 層を書き換える必要はない——その API は既に準備されている。

新規に追加が必要なのは以下のみ：

- `toolContext` ALS の追加（claude-code を模倣）
- `blocked_on_user` および `hook` span の型とヘルパー関数の追加

##### 2. tool.blocked_on_user — 承認フローの差異に適合が必要

| 次元              | claude-code                                   | qwen-code                                                                  |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| 承認位置          | `toolExecution.ts` 内、tool span の内部       | `coreToolScheduler._schedule()` 内、tool span の前                         |
| 承認モード        | 同期待ち `resolveHookPermissionDecision()`    | ステートマシン駆動：`validating` → `awaiting_approval` → `scheduled` → `executing` |
| span のカバレッジ | tool span は blocked + execution を含む       | tool span(`withSpan`) は execution のみ（`executeSingleToolCall` から開始）   |

**重要な差異：** qwen-code の `executeSingleToolCall` エントリは `toolCall.status !== 'scheduled'` をチェックして処理を続行する——つまり、この呼び出しに到達した時点で承認は完了している。Tool span の `withSpan` は承認待ちをカバーできない。

**適合方法（2 案）：**

**案 A — tool span の起点を前方に移動（推奨）：**

`startToolSpan` 呼び出しを `executeSingleToolCall` から `_schedule` 内の承認チェック前に移動し、tool span が完全なライフサイクルをカバーするようにする。`awaiting_approval` 状態に入った時点で `startToolBlockedOnUserSpan` を呼び、承認完了（`scheduled`）時に `endToolBlockedOnUserSpan` を呼ぶ。

```
_schedule():
  startToolSpan(name)                         // ← 新規追加
    startToolBlockedOnUserSpan()              // ← 新規追加、awaiting_approval 時
      [ステートマシン待機]
    endToolBlockedOnUserSpan(decision)        // ← 新規追加、scheduled 時
executeSingleToolCall():
    startToolExecutionSpan()                  // ← 既存のヘルパーを接続
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← finally ブロックで必要
```

**案 B — tool span の位置をそのままに、承認を独立して追跡：**

`_schedule` 内で独立した `approval_wait` span を作成し（tool の子ではない）、interaction 直下に配置する。変更が小さい利点があるが、claude-code のモデルと一致せず、trace ツリーの可読性が低い。

**案 A を推奨する理由：**

- claude-code の trace ツリー構造と一致する
- trace 上で 1 つの tool ノードを見れば「待機時間 + 実行時間」がわかる
- ステートマシン駆動の特性は span start/end のトリガー時期にのみ影響し、parent-child モデリングには影響しない

##### 3. hook span — そのまま再利用可能

| 次元            | claude-code                         | qwen-code                                                            |
| --------------- | ----------------------------------- | -------------------------------------------------------------------- |
| hook 実行エントリ | `executeHooks()` in `hooks.ts`      | `firePreToolUseHook`/`firePostToolUseHook` via `hookEventHandler.ts` |
| 現在の記録方式    | OTel span + Perfetto span           | `HookCallEvent` → `QwenLogger` (OTel なし)                             |
| parent           | `toolContext ?? interactionContext`  | —                                                                    |

**再利用方法：**

1. `session-tracing.ts` に `startHookSpan` / `endHookSpan` を新規追加（parent = `toolContext ?? interactionContext`、claude-code と同一）
2. `coreToolScheduler.ts` の `executeSingleToolCall` 内で、pre/post hook 呼び出し前後にそれぞれ hook span を開始/終了
3. 既存の `logHookCall` イベント記録は維持（2 系統並行、排他しない）

変更量は少なく、既存の hook ロジックに影響しない。

##### 4. tool.execution — 既存 helper、配線のみ

qwen-code の `startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` は既に完全に実装されている。`executeSingleToolCall` 内で呼び出すだけ：

```typescript
// coreToolScheduler.ts executeSingleToolCall 内部
const toolSpan = startToolSpan(toolName, attrs);
// ... hook pre ...
const execSpan = startToolExecutionSpan(toolSpan);
try {
  // ... invocation.execute() ...
  endToolExecutionSpan(execSpan, { success: true });
} catch (e) {
  endToolExecutionSpan(execSpan, { success: false, error: e.message });
}
// ... hook post ...
endToolSpan(toolSpan);
```

注意：qwen-code の `startToolExecutionSpan` は明示的な `parentToolSpan` パラメータを受け取るが、claude-code は `toolContext` ALS から暗黙的に取得する。これは機能に影響せず、単なるスタイルの違いである。`toolContext` ALS を導入すれば、暗黙取得に統一できる。

##### 5. subagent trace ツリー — 両者とも不完全、直接再利用は推奨しない

| 次元            | claude-code                                                             | qwen-code                                            |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| OTel trace 伝搬 | **なし** — subagent の interaction は新しい root                           | **なし** — subagent に明示的な trace 伝搬なし          |
| 同一性紐付け     | Perfetto metadata（agent process/thread）+ `teammateContextStorage` ALS | `subagentNameContext` ALS + `SubagentExecutionEvent` |
| 並行分離         | OTel ALS にリークリスク（`enterWith` はプロセスレベル、並行 subagent で上書きされる可能性） | 同様のリスク                                          |

claude-code も subagent OTel tracing は**うまく解決できていない**：

- `interactionContext.enterWith()` はプロセスレベルであり、並行 subagent は互いの ALS 値を上書きする
- 真のエージェント階層ツリーは Perfetto（Anthropic 内部の feature-flagged システム）にのみ存在し、OTel には存在しない

**推奨：**

- 短期：qwen-code の既存の `subagentNameContext` + イベントログ方式を継続
- 中期：subagent 起動時に `subagent` span（parent = 現在の toolContext）を作成し、`enterWith()` ではなく `context.with()` を使用して並行 subagent の OTel context を分離
- これは独立した設計が必要な作業項目であり、claude-code をそのままコピーすることは推奨しない

##### 6. LLM request span — パスは明確

qwen-code は現在 `loggingContentGenerator.ts` で `withSpan('api.generateContent', ...)` および `startSpanWithContext('api.generateContentStream', ...)` を使用している。

これを `startLLMRequestSpan` / `endLLMRequestSpan`（session-tracing 層に既に実装済み）の呼び出しに変更する。ストリーミングシナリオでは注意が必要：

- `startLLMRequestSpan` は `Span` オブジェクトを返す
- 手動で `endLLMRequestSpan(span, metadata)` を呼んで終了させる必要がある
- これは `startSpanWithContext` の手動管理モードと互換性がある

### 再利用のまとめ

| 改修項目                                                                      | 再利用可能性                            | 変更量                                        | 優先度 |
| ----------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- | ------ |
| 統一 span 作成パス（runtime `withSpan` を廃止し、session-tracing ヘルパーを使用） | **核心修正** — parent-child 断絶を解決 | 中（~5 箇所の呼び出し）                       | P0     |
| `toolContext` ALS の新規追加                                                    | claude-code 方式をそのまま流用          | 低（session-tracing.ts 内部）                 | P0     |
| tool.blocked_on_user span                                                      | 案 A でステートマシン適合が必要         | 中（\_schedule + executeSingleToolCall の協調） | P1     |
| tool.execution の配線                                                          | helper は既存、呼び出しのみ             | 低（executeSingleToolCall 内 3 行）           | P1     |
| hook span                                                                      | 新規 helper + 呼び出し点の追加          | 低                                            | P1     |
| LLM request span の切り替え                                                    | withSpan を型付き helper に置き換え     | 低（2 箇所の呼び出し）                        | P1     |
| subagent trace ツリー                                                          | **直接再利用は推奨しない** — 独立設計が必要 | 高                                            | P2     |

### 推奨実施順序

```
Phase 1 — trace ツリー構造の修正 (P0)
├── 1a. session-tracing.ts に toolContext ALS + blocked_on_user / hook span ヘルパーを追加
├── 1b. loggingContentGenerator.ts: withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts: withSpan → startToolSpan/endToolSpan

Phase 2 — workflow span の補完 (P1)
├── 2a. coreToolScheduler._schedule: blocked_on_user span の接続
├── 2b. coreToolScheduler.executeSingleToolCall: tool.execution span の接続
└── 2c. hook pre/post 呼び出し箇所: hook span の接続

Phase 3 — Subagent trace ツリー (P2)
├── 3a. context.with() による分離方式の設計（enterWith の代替）
├── 3b. subagent 起動時に subagent root span を作成
└── 3c. 並行 subagent シナリオの検証
```