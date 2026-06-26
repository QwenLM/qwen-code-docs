# Agentツール表示実装計画

> **Claude向け:** 必須サブスキル: スーパーパワー:executing-plans を使用して、この計画をタスクごとに実装してください。

**目標:** Agentツールの実行専用のVSCode/web UI表示を追加し、サブエージェントの進捗、サマリー、障害を構造化された`rawOutput`からレンダリングし、汎用ツールカードにフォールバックしないようにします。

**アーキテクチャ:** ACPの`rawOutput`をVSCodeのセッション/更新パイプラインを通して`ToolCallData`に保持し、共有web UIルーターが`task_execution`ペイロードを検出して専用の`AgentToolCall`コンポーネントをレンダリングできるようにします。変更は`packages/webui`内で共有し、VSCodeと`ChatViewer`の一貫性を保ちます。

**技術スタック:** TypeScript, React, Vitest, 共有`@qwen-code/webui`ツール呼び出しコンポーネント。

### タスク1: 失敗するデータフロー動作を確定する

**ファイル:**

- 修正: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- 作成: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**ステップ1: 失敗するテストを書く**

- ACPが`task_execution`ペイロードを送信したときに`tool_call_update`が`rawOutput`を転送することをアサートするセッションハンドラテストを追加する。
- `useToolCalls`がエージェントツール呼び出しの`rawOutput`を保存および更新することをアサートするフックテストを追加する。

**ステップ2: テストを実行して失敗を確認する**

実行: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

期待結果: 現在のハンドラ/フックパイプラインで`rawOutput`が保持されていないため、失敗する。

### タスク2: 失敗するレンダラー動作を確定する

**ファイル:**

- 作成: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**ステップ1: 失敗するテストを書く**

- `kind: 'other'` と `rawOutput.type === 'task_execution'` を持つルーティングされたツール呼び出しをレンダリングする。
- タスクの説明、アクティブな子ツール、サマリー、障害理由が、汎用テキスト出力ではなく、専用のエージェント表示からレンダリングされることをアサートする。

**ステップ2: テストを実行して失敗を確認する**

実行: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

期待結果: ルーターは`kind`のみをキーとしており、専用のエージェントコンポーネントが存在しないため、失敗する。

### タスク3: 構造化されたエージェント出力をエンドツーエンドで保持する

**ファイル:**

- 修正: `packages/vscode-ide-companion/src/types/chatTypes.ts`
- 修正: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- 修正: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- 修正: `packages/webui/src/components/toolcalls/shared/types.ts`

**ステップ1: 最小限のデータモデル変更を実装する**

- VSCodeセッション/ウェブビューのツール呼び出しタイプにオプションの`rawOutput`を追加する。
- `QwenSessionUpdateHandler`で`rawOutput`を転送する。
- `useToolCalls`で`rawOutput`を保存/マージする。
- 共有web UIツール呼び出しデータ型で`rawOutput`を公開する。

**ステップ2: フォーカステストを実行する**

実行: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

期待結果: 合格。

### タスク4: 共有エージェントツール呼び出しUIを追加する

**ファイル:**

- 作成: `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- 修正: `packages/webui/src/components/toolcalls/index.ts`
- 修正: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- 修正: `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**ステップ1: 最小限のレンダラーを実装する**

- `rawOutput.type === 'task_execution'` のガードを追加する。
- タスクの説明をヘッダーとしてレンダリングする。
- エージェント名+ステータス、現在実行中の子ツール、完了サマリー、障害/キャンセル理由を表示する。
- 各ツール呼び出しを独立してレンダリングすることで、複数の並列エージェントカードと互換性のあるレイアウトを維持する。

**ステップ2: フォーカスレンダラーテストを実行する**

実行: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

期待結果: 合格。

### タスク5: 統合された表面を検証する

**ファイル:**

- 修正: `packages/webui/src/index.ts`

**ステップ1: 必要に応じて新しい共有コンポーネントをエクスポートする**

- VSCodeまたは`ChatViewer`が必要とする新しいコンポーネント/タイプを再エクスポートする。

**ステップ2: パッケージ検証を実行する**

実行: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
実行: `npm run check-types --workspace=packages/vscode-ide-companion`
実行: `npm run typecheck --workspace=packages/webui`

期待結果: 対象となるすべてのテストと型チェックが合格する。