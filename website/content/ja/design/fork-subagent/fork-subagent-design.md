# Fork Subagent 設計

> 親の会話コンテキスト全体を継承し、プロンプトキャッシュを共有することで、コスト効率の高い並列タスク実行を可能にする暗黙的なフォークサブエージェント。

## 概要

Agent ツールが `subagent_type` なしで呼び出されると、暗黙的な **フォーク** がトリガーされます。これは、親の会話履歴、システムプロンプト、ツール定義を継承するバックグラウンドサブエージェントです。フォークは `CacheSafeParams` を使用して、その API リクエストが親と同じプレフィックスを共有するようにし、DashScope プロンプトキャッシュのヒットを可能にします。

## アーキテクチャ

```
Parent conversation: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (model)]
                              ↑ identical prefix for all forks ↑

Fork A: [...MsgN | placeholder results | "Research A"]  ← shared cache
Fork B: [...MsgN | placeholder results | "Modify B"]    ← shared cache
Fork C: [...MsgN | placeholder results | "Test C"]      ← shared cache
```

## 主要コンポーネント

### 1. FORK_AGENT (`forkSubagent.ts`)

組み込みエージェントには登録されていない合成エージェント設定。フォールバック用の `systemPrompt` を持つが、実際には `generationConfigOverride` を介して親のレンダリング済みシステムプロンプトを使用する。

### 2. CacheSafeParams の統合 (`agent.ts` + `forkedQuery.ts`)

```
agent.ts (fork path)
  │
  ├── getCacheSafeParams()          ← parent's generationConfig snapshot
  │     ├── generationConfig        ← systemInstruction + tools + temp/topP
  │     └── history                 ← (not used — we build extraHistory instead)
  │
  ├── forkGenerationConfig          ← passed as generationConfigOverride
  └── forkToolsOverride             ← FunctionDeclaration[] extracted from tools
        │
        ▼
  AgentHeadless.execute(context, signal, {
    extraHistory,                   ← parent conversation history
    generationConfigOverride,       ← parent's exact systemInstruction + tools
    toolsOverride,                  ← parent's exact tool declarations
  })
        │
        ▼
  AgentCore.createChat(context, {
    extraHistory,
    generationConfigOverride,       ← bypasses buildChatSystemPrompt()
  })                                   AND skips getInitialChatHistory()
        │                              (extraHistory already has env context)
        ▼
  new GeminiChat(config, generationConfig, startHistory)
                          ↑ byte-identical to parent's config
```

### 3. 履歴の構築 (`agent.ts` + `forkSubagent.ts`)

フォークの `extraHistory` は、`agent-headless` が `task_prompt` を送信するときに Gemini API の user/model 交互を維持するために、モデルメッセージで終了する必要があります。

3 つのケース:

| 親履歴の最後                   | extraHistory の構築                                                     | task_prompt                    |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------ |
| `model` (関数呼び出しなし)     | `[...rawHistory]` (変更なし)                                            | `buildChildMessage(directive)` |
| `model` (関数呼び出しあり)     | `[...rawHistory, model(clone), user(responses+directive), model(ack)]`  | `'Begin.'`                     |
| `user` (通常ではない)          | `rawHistory.slice(0, -1)` (最後の user を削除)                           | `buildChildMessage(directive)` |

### 4. 再帰的なフォークの防止 (`forkSubagent.ts`)

`isInForkChild()` は会話履歴をスキャンして `<fork-boilerplate>` タグを探します。見つかった場合、フォーク試行はエラーメッセージで拒否されます。

### 5. バックグラウンド実行 (`agent.ts`)

フォークは `void executeSubagent()` (fire-and-forget) を使用し、すぐに `FORK_PLACEHOLDER_RESULT` を親に返します。バックグラウンドタスクのエラーはキャッチされ、ログに記録され、表示状態に反映されます。

## データフロー

```
1. モデルが Agent ツールを呼び出す (subagent_type なし)
2. agent.ts: import forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: 親の getHistory(true) から extraHistory を構築
5. agent.ts: forkTaskPrompt を構築 (directive または 'Begin.')
6. agent.ts: createAgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — バックグラウンド
8. agent.ts: すぐに FORK_PLACEHOLDER_RESULT を親に返す
9. バックグラウンド:
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — 親の generationConfig を使用 (キャッシュ共有)
   c. runReasoningLoop() — 親のツール宣言を使用
   d. フォークがツールを実行し、結果を生成
   e. updateDisplay() で最終ステータスを表示
```

## グレースフルデグラデーション

`getCacheSafeParams()` が null を返す場合 (最初のターンで履歴がない場合)、フォークは以下にフォールバックします:

- `FORK_AGENT.systemPrompt` をシステムインストラクションとして使用
- `prepareTools()` をツール宣言として使用

これにより、キャッシュ共有がなくてもフォークが常に動作することが保証されます。

## ファイル

| ファイル                                                 | 役割                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`       | FORK_AGENT 設定、buildForkedMessages()、isInForkChild()、buildChildMessage()             |
| `packages/core/src/tools/agent.ts`                       | フォークパス: CacheSafeParams の取得、extraHistory の構築、バックグラウンド実行          |
| `packages/core/src/agents/runtime/agent-headless.ts`     | execute() オプション: generationConfigOverride、toolsOverride                            |
| `packages/core/src/agents/runtime/agent-core.ts`         | CreateChatOptions.generationConfigOverride                                                |
| `packages/core/src/followup/forkedQuery.ts`              | CacheSafeParams インフラストラクチャ (既存、変更なし)                                     |