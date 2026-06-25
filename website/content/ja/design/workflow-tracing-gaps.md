# Workflow レベルの Span 粒度不足分析 (P1)

> 2026-05-13 における qwen-code origin/main のレビューに基づく

## 現状

qwen-code には既に tracing インフラが整備されている：

| コンポーネント    | 場所                                             | 説明                                                     |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Span 型定義       | `packages/core/src/telemetry/session-tracing.ts` | `interaction`、`llm_request`、`tool`、`tool.execution`   |
| Tracer ユーティリティ | `packages/core/src/telemetry/tracer.ts`      | session root context、`withSpan`、`startSpanWithContext` |
| インタラクション入口 | `packages/core/src/core/client.ts`            | トップレベルのインタラクションで `interaction` span を明示的に開始 |
| ライフサイクル管理 | —                                               | AsyncLocalStorage + WeakRef + TTL cleanup                |

現在の runtime で安定して接続されている主な汎用 span は 2 種類：

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**結論：「tracing の骨格あり」の段階には入っているが、agent workflow のフェーズ境界が trace ツリーに完全にエンコードされていない。**

### 比較：claude-code が実装済みの span 型

`claude-code/src/utils/telemetry/sessionTracing.ts` (line 49) を参照：

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## 欠落項目

| 欠落 span / 機構                            | 影響                                            |
| ------------------------------------------- | ----------------------------------------------- |
| `permission_wait` / `blocked_on_user` span  | 承認待ち vs ツール実行時間の区別ができない      |
| `hook` span                                 | hook の時間が tool span に折り込まれ、境界が不明確 |
| `subagent` root span                        | subagent 内の llm/tool 呼び出しが trace サブツリーを形成しない |
| `tool.execution` の実際の接続               | helper は定義済みだがメインの呼び出しパスで未使用 |
| 安定した parent-child wiring                | span の多くが階層ツリーではなく session root 下の sibling |

## 項目別分析

### 1. ユーザー承認待ちが trace に含まれない

ツール呼び出しが承認を待つ際、状態遷移のパスは `awaiting_approval` → `scheduled` → 実行 となる。

- 「ユーザー確認待ち」は状態遷移であり、trace のノードではない
- 承認待ち時間が trace に現れない
- ツールが遅い場合に「ユーザーを待っているのか」「ツール自体の実行が遅いのか」を区別できない

### 2. Hook はイベント記録があるが独立した span がない

Pre/Post hook の実行後に `HookCallEvent` が生成されて `logHookCall()` を通るが、独立した OTel span は作られない。

- hook が遅くなると外側の tool span が遅く見える
- hook が失敗すると「tool の失敗」に見える
- trace から「時間が hook にかかったのか tool.execution にかかったのか」を答えられない

### 3. Subagent は log/metric であり trace サブツリーではない

subagent の開始・完了時に `SubagentExecutionEvent` が記録され log/metric に入るが、明示的な span サブツリーは形成されない。

- 「どの subagent が実行されたか」は集計できる
- 「その subagent がどの llm/tool 呼び出しをトリガーしたか」を trace でたどれない
- 並行 subagent シナリオでは因果関係が不明確

### 4. tool.execution helper は定義済みだがメインの呼び出しパスに未接続

`session-tracing.ts` に `startToolExecutionSpan()` / `endToolExecutionSpan()` が実装されているが、テスト以外のコードでの呼び出し箇所が見当たらない。

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

### 5. Parent-child wiring が安定していない

interaction span は存在するが、実行中の多くの span が interaction の子ノードではなく session root 下の sibling として接続されている。

- 呼び出しツリーがフラット
- ノード間の因果関係が直感的でない
- 1 つのユーザーターンから内部の llm/tool/hook/subagent をたどる体験が断片的

## 影響

- trace には基本的な価値があるが、workflow レベルのデバッグには不十分
- 「このターンが遅いのはユーザー待ち、hook、それとも tool の実際の実行か」を直接答えられない
- subagent の実行過程を読みやすい trace サブツリーとして再現できない
- hook の問題が tool span に折り込まれ、境界が不明確
- Jaeger / Tempo / ARMS 上のツリーが claude-code より平坦で読みにくい

---

## claude-code ソリューションの再利用分析

> 2026-05-13 における claude-code ソースコードの詳細比較に基づく

### claude-code の tracing アーキテクチャ

claude-code は `src/utils/telemetry/sessionTracing.ts` で**統一された、デュアル ALS ベースの span 管理システム**を実装している：

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

| 機構           | 実装                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| デュアル ALS   | `interactionContext` が現在の interaction span を保持；`toolContext` が現在の tool span を保持                                                                                            |
| parent 解決    | 各 span 型がどの ALS から parent を取得するかをハードコード：`llm_request`/`tool` は `interactionContext`；`blocked_on_user`/`execution`/`hook` は `toolContext`；`hook` は `interactionContext` へのフォールバックあり |
| ライフサイクル | enterWith で注入 → span 実行 → enterWith(undefined) でクリア                                                                                                                              |
| span 検索      | ALS 外に保存される span（`blocked_on_user` 等）は `activeSpans` Map で `span.type` から逆引き                                                                                             |
| メモリ管理     | ALS が保持する span は WeakRef；ALS 外が保持する span は GC 防止のため strongRef；TTL 30 分で自動クリーンアップ                                                                           |

**claude-code の tool span 完全ライフサイクル** (`toolExecution.ts`)：

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

**claude-code の hook span** (`hooks.ts`)：

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [parallel hook execution]
endHookSpan(span, { success, blocking, ... })
```

### qwen-code の現在のアーキテクチャ vs claude-code

#### 根本的な違い：2 つの断絶した span 作成パス

これが qwen-code における現在の最も重要なアーキテクチャ上の問題だ：

| レイヤー           | ファイル             | 使用方法                                                                                        | parent 解決                                               |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| session-tracing 層 | `session-tracing.ts` | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan`     | `interactionContext` ALS から明示的に parent を取得       |
| tracer 層          | `tracer.ts`          | `withSpan` / `startSpanWithContext`                                                             | `context.active()` から parent を取得、session root へフォールバック |

**runtime での実際の呼び出し状況：**

- `startInteractionSpan` → **接続済み** (`client.ts` line 956)、`interactionContext` ALS に書き込み
- `startLLMRequestSpan` / `endLLMRequestSpan` → **未接続**、runtime では `withSpan('api.generateContent', ...)` を使用 (`loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **未接続**、runtime では `withSpan('tool.${name}', ...)` を使用 (`coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **未接続**

**結果：**

`withSpan` の `getParentContext()` はまず `context.active()`（OTel ネイティブ context）を確認し、アクティブな span が見つからない場合は session root context にフォールバックする。これは `interactionContext` ALS を**一切読まない**。

そのため interaction span と LLM/tool span は parent-child ツリーではなく、session root 下の**フラットな sibling** になってしまう：

```
session-root
  ├── interaction         (session-tracing から、interactionContext ALS に書き込み済み)
  ├── api.generateContent (withSpan から、interactionContext を読まない → session root に接続)
  ├── tool.Bash           (withSpan から、同上)
  └── tool.Read           (withSpan から、同上)
```

**一方 claude-code では、span 作成パスが 1 つだけ（sessionTracing.ts）であり、すべての span が同じ ALS → OTel context 変換ロジックを通るため、ツリーが完整に構築される。**

#### 項目別の再利用評価

##### 1. デュアル ALS + 明示的 parent 解決 — 再利用可能、コアの修正

| 項目          | claude-code                                           | qwen-code                                    |
| ------------- | ----------------------------------------------------- | -------------------------------------------- |
| ALS 数        | 2 (`interactionContext` + `toolContext`)              | 1 (`interactionContext`、`toolContext` なし) |
| parent 解決   | 各 span 型が取得元の ALS を明示的に指定               | `withSpan` が統一して `context.active()` を使用 |
| context 注入  | `trace.setSpan(otelContext.active(), parentCtx.span)` | `withSpan` 内部で `startActiveSpan` が暗黙的に注入 |

**再利用方針：**

qwen-code の `session-tracing.ts` はすでに claude-code と**ほぼ同じ parent 解決パターン**を実装している：

```typescript
// qwen-code session-tracing.ts (既存だが未使用)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

このコードは claude-code の `startLLMRequestSpan` のロジックと**完全に一致**している。

**コアの修正方針：runtime の `withSpan('api.*')` / `withSpan('tool.*')` 呼び出しを廃止し、session-tracing の typed helper を呼び出すように変更する。** session-tracing 層を書き直す必要はない——API はすでに整っている。

新たに追加が必要なもの：

- `toolContext` ALS の追加（claude-code を模倣）
- `blocked_on_user` および `hook` span 型と helper 関数の追加

##### 2. tool.blocked_on_user — 承認フローの差異に適応が必要

| 項目          | claude-code                                | qwen-code                                                                  |
| ------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| 承認の場所    | `toolExecution.ts` 内、tool span の内部    | `coreToolScheduler._schedule()` 内、tool span の前                         |
| 承認モード    | `resolveHookPermissionDecision()` で同期待機 | 状態機械駆動：`validating` → `awaiting_approval` → `scheduled` → `executing` |
| span のカバー範囲 | tool span が blocked + execution を包含   | tool span（`withSpan`）は execution のみ（`executeSingleToolCall` から開始） |

**重要な違い：** qwen-code の `executeSingleToolCall` のエントリポイントは `toolCall.status !== 'scheduled'` をチェックしてから続行する——つまりここに到達した時点で承認は完了している。Tool span の `withSpan` は承認待ちを包含できない。

**適応方針（2 案）：**

**方案 A — tool span の開始点を前に移す（推奨）：**

`startToolSpan` の呼び出しを `executeSingleToolCall` から `_schedule` 内の承認チェック前に移動し、tool span がライフサイクル全体を包含するようにする。`awaiting_approval` 状態に入るときに `startToolBlockedOnUserSpan`、承認完了（`scheduled`）時に `endToolBlockedOnUserSpan` を呼び出す。

```
_schedule():
  startToolSpan(name)                         // ← 新規追加
    startToolBlockedOnUserSpan()              // ← 新規追加、awaiting_approval 入場時
      [状態機械の待機]
    endToolBlockedOnUserSpan(decision)        // ← 新規追加、scheduled 入場時
executeSingleToolCall():
    startToolExecutionSpan()                  // ← 既存 helper を接続
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← finally ブロック内に配置
```

**方案 B — tool span の位置を変えず、承認を独立してトレース：**

`_schedule` 内で独立した `approval_wait` span を作成し（tool の子としてではなく）、interaction に接続する。変更量が少ない一方、claude-code のモデルと一致しないため trace ツリーの可読性が下がる。

**方案 A を推奨**する理由：

- claude-code の trace ツリー構造と一致する
- trace 上の 1 つの tool ノードで「何分待ったか + 何分かかったか」を確認できる
- 状態機械駆動の特性は span の start/end タイミングに影響するだけで、parent-child モデリングには影響しない

##### 3. hook span — 直接再利用可能

| 項目          | claude-code                         | qwen-code                                                            |
| ------------- | ----------------------------------- | -------------------------------------------------------------------- |
| hook 実行入口 | `executeHooks()` in `hooks.ts`      | `firePreToolUseHook`/`firePostToolUseHook` via `hookEventHandler.ts` |
| 現在の記録方法 | OTel span + Perfetto span          | `HookCallEvent` → `QwenLogger` (OTel なし)                          |
| parent        | `toolContext ?? interactionContext` | —                                                                    |

**再利用方針：**

1. `session-tracing.ts` に `startHookSpan` / `endHookSpan` を追加（parent = `toolContext ?? interactionContext`、claude-code と一致）
2. `coreToolScheduler.ts` の `executeSingleToolCall` 内で、pre/post hook 呼び出しの前後に hook span の start/end を追加
3. 既存の `logHookCall` イベント記録は維持（両方並行で動作、排他ではない）

変更量は少なく、既存の hook ロジックに影響しない。

##### 4. tool.execution — helper は既存、接続のみ必要

qwen-code の `startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` はすでに完全に実装されており、`executeSingleToolCall` で呼び出すだけでよい：

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

注意：qwen-code の `startToolExecutionSpan` は明示的な `parentToolSpan` パラメータを受け取るが、claude-code では `toolContext` ALS から暗黙的に取得する。機能的な差異はなく、スタイルの違いのみ。`toolContext` ALS を導入すれば、暗黙的取得に統一することもできる。

##### 5. subagent trace tree — 両者とも未完成、直接の再利用は非推奨

| 項目            | claude-code                                                             | qwen-code                                            |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| OTel trace 伝播 | **なし** — subagent の interaction は新しい root                        | **なし** — subagent に明示的な trace 伝播がない      |
| 識別情報の関連付け | Perfetto metadata（agent プロセス/スレッド）+ `teammateContextStorage` ALS | `subagentNameContext` ALS + `SubagentExecutionEvent` |
| 並行分離        | OTel ALS にリーク リスク（`enterWith` はプロセスレベル、並行 subagent が互いを上書き） | 同様のリスク                                         |

claude-code も subagent の OTel tracing を**自身で解決できていない**：

- `interactionContext.enterWith()` はプロセスレベルであり、並行 subagent は互いの ALS 値を上書きする
- 真の agent 階層ツリーは OTel ではなく Perfetto（Anthropic 内部の feature-flagged システム）にのみ存在する

**推奨：**

- 短期：qwen-code 既存の `subagentNameContext` + イベントログ方式を継続
- 中期：subagent 起動時に `subagent` span を作成（parent = 現在の toolContext）し、`enterWith()` ではなく `context.with()` を使って並行 subagent の OTel context を分離する
- 独立した設計が必要な作業項目であり、claude-code を直接踏襲することは非推奨

##### 6. LLM request span — パスは明確

qwen-code は現在 `loggingContentGenerator.ts` 内で `withSpan('api.generateContent', ...)` と `startSpanWithContext('api.generateContentStream', ...)` を使用している。

`startLLMRequestSpan` / `endLLMRequestSpan`（session-tracing 層に実装済み）を呼び出すように変更するだけでよい。streaming シナリオでの注意点：

- `startLLMRequestSpan` は `Span` オブジェクトを返す
- `endLLMRequestSpan(span, metadata)` を手動で呼び出して終了させる必要がある
- これは `startSpanWithContext` の手動管理モードと互換性がある

### 再利用まとめ

| 改修項目                                                                     | 再利用度                              | 変更量                                        | 優先度 |
| ---------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- | ------ |
| span 作成パスの統一（runtime の `withSpan` を廃止、session-tracing helpers を使用） | **コア修正** — parent-child の断絶を解消 | 中（〜5 箇所の呼び出し点）                   | P0     |
| `toolContext` ALS の追加                                                      | claude-code パターンをそのまま踏襲    | 低（session-tracing.ts 内部）                 | P0     |
| tool.blocked_on_user span                                                    | 方案 A は状態機械への適応が必要       | 中（\_schedule + executeSingleToolCall の協調） | P1     |
| tool.execution の接続                                                         | helper 実装済み、呼び出すだけ         | 低（executeSingleToolCall 内 3 行）           | P1     |
| hook span                                                                    | helper 追加 + 呼び出し点              | 低                                            | P1     |
| LLM request span の切り替え                                                   | withSpan を typed helper に置換       | 低（2 箇所の呼び出し点）                      | P1     |
| subagent trace tree                                                          | **直接再利用は非推奨** — 独立設計が必要 | 高                                          | P2     |

### 推奨実施順序

```
Phase 1 — trace ツリー構造の修正 (P0)
├── 1a. session-tracing.ts に toolContext ALS + blocked_on_user / hook span helpers を追加
├── 1b. loggingContentGenerator.ts: withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts: withSpan → startToolSpan/endToolSpan

Phase 2 — workflow span の補完 (P1)
├── 2a. coreToolScheduler._schedule: blocked_on_user span の接続
├── 2b. coreToolScheduler.executeSingleToolCall: tool.execution span の接続
└── 2c. hook pre/post 呼び出し箇所: hook span の接続

Phase 3 — Subagent trace tree (P2)
├── 3a. context.with() による分離方案の設計（enterWith の代替）
├── 3b. subagent 起動時に subagent root span を作成
└── 3c. 並行 subagent シナリオの検証
```
