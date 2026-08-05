# UserPromptSubmit フックコンテキストの provenance

Issue: https://github.com/QwenLM/qwen-code/issues/7940

## 問題

`UserPromptSubmit` フックは `additionalContext` を返すことができ、クライアントはそれを
そのままのテキストパートとして送信リクエストに追加する。`recordUserMessage` は拡張された
リクエストを永続化するため、注入されたテキストはユーザーレコードの `message.parts` に、
ユーザーが書いたテキストと区別のつかない形で混入する。

結果:

- **再開**: UI プロジェクションはすべてのテキストパートを連結するため、再開されたセッションでは
  フックが注入したコンテキストが、まるでユーザーが入力したかのように表示される。
- **オフライン分析 / 下流コンシューマー**: JSONL トランスクリプトはユーザーテキストと注入を
  分離できず、コンシューマーは壊れやすいカスタムのマーカー除去ヒューリスティックに頼る。
- **テレメトリーと自動メモリ recall**: どちらも注入後に `partToString(request)` を消費しており、
  prompt 属性と recall クエリを汚染していた。

ライブの TUI は影響を受けない（フック前の入力から履歴アイテムを構築する）が、まさにこの
非対称性のために、汚染されたトランスクリプトは見逃されやすかった。

## 設計

既存の 2 つのパターンと同型: `SessionStart` のコンテキストはタグ付きブロックとしてシステム
指示に注入され、ターン中/通知レコードはモデルに送る `message` と
`systemPayload.displayText` プロジェクションを分離する。

### 書き込みパス

1. **タグ付き注入**（`client.ts`）: サニタイズされた `additionalContext` は、
   `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>` でラップされた
   独自のパートとして追加される。`getAdditionalContext()` はフック出力内の `<`/`>` を
   エスケープするため、内部からラッパーを閉じたり偽造したりすることはできない。
   ユーザーが書いたテキストは書き換えもエスケープもしない。`promptText` は、それを
   `preInjectionPromptText` にキャプチャする注入代入より前に宣言しなければならない
   （周囲の Goal の try/catch が後で並び替えられた場合の TDZ を回避）。
2. **表示の provenance**（`chatRecordingService.ts`）: `recordUserMessage` は
   `systemPayload` として保存される任意の `UserPromptRecordPayload { displayText? }` を
   受け取る。`message` はモデルに送る Content そのものを保持する——再開はモデルが実際に
   見たものをリプレイしなければならない——一方 `displayText` は注入前のユーザー
   プロジェクションを保持する。フックが注入したテキストはタグ付きの `message.parts`
   エントリに残る（機械的にパース可能）。このペイロードはフックが実際にコンテキストを
   注入した場合のみ書き込まれる。
3. **テレメトリーと recall**（`client.ts`）: `addUserPromptAttributes` と
   `MemoryManager.recall` は、注入が発生した場合に注入前のプロンプトテキストを使用する。

### 読み取りパス（再開のプロジェクション）

`resumeHistoryUtils` は通常のユーザーレコードを 3 形状のフォールバックで投影する:

- (a) 新しいレコード: `systemPayload.displayText` を優先;
- (b) タグのみのレコード（ペイロードなし）: その全体がタグ付きブロックである末尾パートを
  除去——パート全体の厳密マッチのみなので、タグを含むだけのユーザー文章は決して除去されない。
  タグ形状にマッチする唯一のパートも保持される（注入は常にユーザー自身のパートの後に
  追加されるため、単一パートのレコードはユーザー作成でしかない）;
- (c) レガシーの素の注入レコード: 連結は変更なし。

`@` コマンド再開ブランチは、引き続き存在すれば `AtCommandRecordPayload.userText` を優先;
`userText` 欠落時のフォールバックのみが `extractUserRecordDisplayText` を通るため、
末尾のタグ付きパートが `@` コマンドの表示テキストを上書きすることはない。

## スコープの補足

- インタラクティブな `UserPromptSubmit` パスに集中する。ACP セッションパスはすでに
  注入前のプロンプトテキストを記録しているため、必要だったのはモデルに送る注入への
  同じタグラッピングのみ（ここに含む）。サブエージェントのコンテキスト注入
  （`contextState` 経由の `SubagentStart`）は別途の調査が必要で、フォローアップとする。
- その他のトランスクリプトコンシューマー（デスクトップ、Web UI）はフォローアップで
  `displayText` を採用できる; それまではタグ付き形状が見えるが、少なくとも機械的に
  識別可能である。

`transcript-replay` の `projectUserRecord` を通る ACP/エクスポート/デーモンの
コンシューマーも `displayText` を優先し、subtype のないユーザーレコードについて末尾の
タグ付きパートを除去する（TUI の再開パスと同じ 3 形状フォールバック）。
