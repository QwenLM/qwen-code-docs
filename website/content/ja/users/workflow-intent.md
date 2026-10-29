# 1 ターンのワークフローをリクエストする


通常の送信をまたいで保存された設定については、
[session Workflow mode](./workflow-mode.md) を参照してください。

`tools.workflowsEnabled` が有効な状態で、人間の送信に `ultracode` または既存の
`workflow` キーワードを含めると、そのターンで Workflow ツールを使用することを提案します。例: `ultracode: audit these three modules`。
モデルがワークフローがリクエストに適しているかどうかを判断します。キーワードはワークフローを開始したり、権限を変更したり、モデルを選択したり、effort を変更したりすることはありません。

Ink と OpenTUI のターミナル入力、IDE composer 入力、および Web Shell composer
入力は、このリマインダーをサポートしています。リマインダーは、表示されるメッセージとは別にモデルリクエストに追加されます。次の通常の送信はそれを継承しません。
ツールの継続と自動リトライはそれを再度追加しません。
composer に貼り付けられたテキストは人間の入力としてカウントされます。添付ファイルの展開と Hook で追加されたコンテキストはカウントされません。

呼び出された履歴と Ink Vim レジスターの貼り付けは、バッファをクリアしたり Vim を無効にした後も含めて、不明な入力のままです。新しい Vim 挿入モードの入力は、引き続きリマインダーをアクティブにできます。

`ultracode` は、完全な引用符/コードスパンと、`ultracode.js`、`x-ultracode`、`ultracode/file` などのパスのようなトークンを無視します。既存の `workflow`
互換性ルールは、`(workflow)` などのスタンドアロンの空白区切り単語を受け入れますが、`workflows` や `my-workflow-runner` は受け入れません。
両方のキーワードが存在する場合、リマインダーは 1 つだけ追加されます。

プレーンな `qwen -p`、プレーンな stdin、スケジュールされた入力、および SDK 文字列プロンプトは自動的にオプトインしません。TypeScript SDK ストリーミング入力は、元の各人間メッセージを明示的に識別できます。

```ts
import { query, type SDKUserMessage } from ' @qwen-code/sdk';

async function* messages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: crypto.randomUUID(),
    parent_tool_use_id: null,
    origin: { kind: 'human' },
    message: { role: 'user', content: 'ultracode: inspect the modules' },
  };
}

for await (const event of query({ prompt: messages() })) {
  console.log(event);
}
```

アプリケーション生成のコンテキスト、自動化、ツールの結果、および履歴のリプレイの場合は `origin` を省略します。origin が欠落しているか無効な場合、通常のチャットはキーワードリマインダーなしで動作し続けます。この宣言はツール権限を付与しません。ACP クライアントは、元の人間テキストのために既存の要求ごとの `_meta['qwen.submittedPrompt']`
宣言を使用できます。デーモン専用のメタデータは予約されたままです。

`ui.disableWorkflowKeywordTrigger` を `true` に設定すると、これらのエントリーポイント全体で両方のキーワードを無効にします。ターミナル設定ダイアログでは、これは
**Disable Workflow Keyword Trigger** であり、新しい送信に対して有効になります。
ワークフローまたは必要なツールサーフェスが利用できない場合も、リマインダーは省略されます。名前のみのワークフローセッションは、`{ name, args }` で保存されたワークフローのみを提案し、スクリプトの作成は提案しません。
