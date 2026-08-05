# デーモンセッションのランタイムステータス

## Problem

デーモンクライアントは `GET /session/:id/status` でライブセッションをポーリング
し、`GET /workspace/:id/sessions` でセッションを列挙できるが、今日のランタイム
アクティビティのシグナルは `hasActivePrompt` のみである。クライアントは、通常の
権限を待っているターン、`ask_user_question` の応答を待っているターン、または作業が
再開されるまでエラーを表示し続けるべき失敗したターンを区別できない。

## Design

ACP ブリッジは、各ライブ `SessionEntry` 上に小さなインメモリステータス拡張を
所有する:

- `hasTurnError` と `turnError` は、直近の失敗したターンの最終エラーを格納する。
- `pendingInteractions` は、保留中の権限リクエスト ID を、正規化された描画可能な
  権限アクションまたはユーザー質問にマッピングする。

既存のプロンプトライフサイクルは、引き続き `hasActivePrompt` の情報源である。
失敗したターンは、既存の `turn_error` SSE イベントを発行する際に、サニタイズ済み
の `message`、任意の `code`、任意の `errorKind` を記録する。エラーは、次にキュー
入れされたプロンプトがディスパッチに到達して実際に開始されるまで表示されたまま
となる。承認されたがキューに入っているだけのプロンプトはこれをクリアしない。

ACP 子プロセスは、ツール呼び出しメタデータ内で `ask_user_question` 権限リクエスト
に明示的にタグ付けする。ブリッジは UI テキストやツール名からカテゴリを推論せず、
その安定したマーカーのみを読み取る。

## API

既存のライブサマリに、任意の付加的フィールドが追加される:

- `isWaitingForPermission`
- `isWaitingForUserQuestion`
- `pendingInteractionCount`
- `hasTurnError`
- `turnError`（`message`、任意の `code`、任意の `errorKind`）
- `pendingInteractions`: 権限の場合はアクションのタイトル/コンテンツ/入力と
  選択可能なオプション、`ask_user_question` の場合は質問と選択可能なオプション。
  各質問は、`answers: Record<string, string>` の権限投票ペイロード用の
  `answerKey` を持つ。

`GET /session/:id/status` は、ライブセッションのすべてのフィールドを返す。
ワークスペースのセッションリストも、ライブエントリについて `turnError` と
`pendingInteractions` を含む同じランタイムフィールドを保持するため、呼び出し元は
バッチポーリング中に直接インタラクションを描画して承認できる。ライブでは
ない永続化セッションは新しいフィールドを省略するため、呼び出し元が利用不可能な
ランタイム状態を既知のアイドル状態と誤解することはない。

## Scope

これはデーモンの再起動をまたいでランタイム状態を永続化せず、新しいエンドポイントを
追加せず、詳細なイベント消費のための SSE を置き換えない。既存の
`POST /session/:id/permission/:requestId` 投票ルートが保留中の項目を解決し、
質問の回答はその既存の `answers` 拡張を使用する。
