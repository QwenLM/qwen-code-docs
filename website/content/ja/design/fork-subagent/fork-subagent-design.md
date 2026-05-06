# Fork Subagent の設計

> 親の会話コンテキスト全体を継承し、プロンプトキャッシュを共有することで、コスト効率の高い並列タスク実行を可能にする暗黙的な fork subagent です。

## 概要

Agent ツールが `subagent_type` なしで呼び出されると、暗黙的な **fork** がトリガーされます。これは親の会話履歴、システムプロンプト、ツール定義を継承するバックグラウンドのサブエージェントです。fork は `CacheSafeParams` を使用して API リクエストが親と同じプレフィックスを共有するようにし、DashScope のプロンプトキャッシュヒットを有効にします。

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

合成エージェント設定であり、`builtInAgents` には登録されていません。フォールバック用の `systemPrompt` を持ちますが、実際には `generationConfigOverride` を介して親のレンダリング済みシステムプロンプトを使用します。

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

fork の `extraHistory` は、`agent-headless` が `task_prompt` を送信する際に Gemini API の user/model の交互送信ルールを維持するため、model メッセージで終了する必要があります。

3つのケース:

| 親の履歴の末尾              | extraHistory の構築方法                                              | task_prompt                    |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `model` (関数呼び出しなし)   | `[...rawHistory]` (変更なし)                                          | `buildChildMessage(directive)` |
| `model` (関数呼び出しあり) | `[...rawHistory, model(clone), user(responses+directive), model(ack)]` | `'Begin.'`                     |
| `user` (稀なケース)              | `rawHistory.slice(0, -1)` (末尾の user を削除)                         | `buildChildMessage(directive)` |

### 4. 再帰的 Fork の防止 (`forkSubagent.ts`)

`isInForkChild()` は会話履歴内の `<fork-boilerplate>` タグをスキャンします。見つかった場合、fork の試行はエラーメッセージと共に拒否されます。

### 5. バックグラウンド実行 (`agent.ts`)

Fork は `void executeSubagent()`（fire-and-forget）を使用し、`FORK_PLACEHOLDER_RESULT` を親に即座に返します。バックグラウンドタスクで発生したエラーはキャッチされ、ログに記録されて表示状態に反映されます。

## データフロー

```
1. Model calls Agent tool (no subagent_type)
2. agent.ts: import forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: build extraHistory from parent's getHistory(true)
5. agent.ts: build forkTaskPrompt (directive or 'Begin.')
6. agent.ts: createAgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — background
8. agent.ts: return FORK_PLACEHOLDER_RESULT to parent immediately
9. Background:
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — uses parent's generationConfig (cache-shared)
   c. runReasoningLoop() — uses parent's tool declarations
   d. Fork executes tools, produces result
   e. updateDisplay() with final status
```

## グレースフルデグラデーション

`getCacheSafeParams()` が null を返す場合（最初のターンで履歴がまだない場合）、fork は以下のフォールバック処理を行います：

- システムインストラクションに `FORK_AGENT.systemPrompt` を使用
- ツール宣言に `prepareTools()` を使用

これにより、キャッシュ共有がなくても fork が常に動作することが保証されます。

## ファイル構成

| ファイル                                                 | 役割                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`   | FORK_AGENT 設定、buildForkedMessages()、isInForkChild()、buildChildMessage()        |
| `packages/core/src/tools/agent.ts`                   | Fork パス：CacheSafeParams の取得、extraHistory の構築、バックグラウンド実行 |
| `packages/core/src/agents/runtime/agent-headless.ts` | execute() オプション：generationConfigOverride、toolsOverride                            |
| `packages/core/src/agents/runtime/agent-core.ts`     | CreateChatOptions.generationConfigOverride                                            |
| `packages/core/src/followup/forkedQuery.ts`          | CacheSafeParams インフラストラクチャ（既存、変更なし）                                 |