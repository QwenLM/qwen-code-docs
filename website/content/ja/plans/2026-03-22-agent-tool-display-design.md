# Agent Tool Display 実装計画

> **For Claude:** REQUIRED SUB-SKILL: superpowers:executing-plans を使用して、この計画をタスクごとに実装してください。

**Goal:** Agent ツールの実行専用の VSCode/web UI 表示を追加し、サブエージェントの進捗、要約、失敗が汎用ツールカードにフォールバックするのではなく、構造化された `rawOutput` からレンダリングされるようにする。

**Architecture:** ACP の `rawOutput` を VSCode のセッション/更新パイプラインを通じて `ToolCallData` に保持し、共有 web UI ルーターが `task_execution` ペイロードを検出して専用の `AgentToolCall` コンポーネントをレンダリングするようにする。変更は `packages/webui` で共有し、VSCode と `ChatViewer` の整合性を保つ。

**Tech Stack:** TypeScript, React, Vitest, 共有 `@qwen-code/webui` tool-call コンポーネント。

### Task 1: データフローの失敗動作をテストで確定する

**Files:**

- 変更: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- 新規作成: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Step 1: 失敗するテストを記述する**

- ACP が `task_execution` ペイロードを送信した際に `tool_call_update` が `rawOutput` を転送することを検証するセッションハンドラーのテストを追加する。
- `useToolCalls` がエージェントツール呼び出しの `rawOutput` を保存・更新することを検証するフックのテストを追加する。

**Step 2: テストを実行して失敗することを確認する**

Run: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

期待結果: 現在のハンドラー/フックパイプラインで `rawOutput` が保持されていないため、テストが失敗する。

### Task 2: レンダラーの失敗動作をテストで確定する

**Files:**

- 新規作成: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Step 1: 失敗するテストを記述する**

- `kind: 'other'` かつ `rawOutput.type === 'task_execution'` のルーティング済みツール呼び出しをレンダリングする。
- タスクの説明、実行中の子ツール、要約、失敗理由が汎用テキスト出力ではなく、専用のエージェント表示からレンダリングされることを検証する。

**Step 2: テストを実行して失敗することを確認する**

Run: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

期待結果: ルーターが `kind` のみをキーとしており、専用のエージェントコンポーネントが存在しないため、テストが失敗する。

### Task 3: 構造化されたエージェント出力をエンドツーエンドで保持する

**Files:**

- 変更: `packages/vscode-ide-companion/src/types/chatTypes.ts`
- 変更: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- 変更: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- 変更: `packages/webui/src/components/toolcalls/shared/types.ts`

**Step 1: 最小限のデータモデル変更を実装する**

- VSCode セッション/webview のツール呼び出し型にオプションの `rawOutput` を追加する。
- `QwenSessionUpdateHandler` で `rawOutput` を転送する。
- `useToolCalls` で `rawOutput` を保存/マージする。
- 共有 web UI ツール呼び出しデータ型で `rawOutput` を公開する。

**Step 2: 対象テストを実行する**

Run: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

期待結果: テストが成功する。

### Task 4: 共有エージェントツール呼び出し UI を追加する

**Files:**

- 新規作成: `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- 変更: `packages/webui/src/components/toolcalls/index.ts`
- 変更: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- 変更: `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Step 1: 最小限のレンダラーを実装する**

- `rawOutput.type === 'task_execution'` のガードを追加する。
- タスクの説明をヘッダーとしてレンダリングする。
- エージェント名とステータス、現在実行中の子ツール、完了要約、失敗/キャンセル理由を表示する。
- 各ツール呼び出しを独立してレンダリングし、複数の並列エージェントカードと互換性のあるレイアウトを維持する。

**Step 2: 対象レンダラーテストを実行する**

Run: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

期待結果: テストが成功する。

### Task 5: 統合された画面を検証する

**Files:**

- 変更: `packages/webui/src/index.ts`

**Step 1: 必要に応じて新しい共有コンポーネントをエクスポートする**

- VSCode または `ChatViewer` で必要な新しいコンポーネント/型を再エクスポートする。

**Step 2: パッケージの検証を実行する**

Run: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Run: `npm run check-types --workspace=packages/vscode-ide-companion`
Run: `npm run typecheck --workspace=packages/webui`

期待結果: 対象のすべてのテストと型チェックが成功する。