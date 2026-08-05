# ワークスペース修飾 Voice

## Goal

既存のデーモン Voice 設定、一括文字起こし、ストリーミング文字起こしの
サーフェスを、すべての信頼されたワークスペースランタイムに対して、
レガシーのプライマリ専用ルートを変更せずに公開する。

## Design

`GET`/`POST /workspaces/:workspace/voice`、
`POST /workspaces/:workspace/voice/transcribe`、
`WS /workspaces/:workspace/voice/stream` は、登録された信頼済み
ランタイムを id またはエンコードされた cwd で解決する。
それらはそのランタイムの cwd、実効環境、ブリッジ、ワークスペース設定を
使用する。複数形 REST 経由の Voice 設定書き込みは常にワークスペース
スコープを使用する。セカンダリの ACP voice 書き込みも同じスコープを
使用するため、共有のユーザー設定を変更することはできない。

1 つのプロセススコープの `WorkspaceVoiceCoordinator` が、既存の
8 個のアクティブ Voice 操作という上限を所有する。これはレガシーと
ワークスペース修飾のパス全体で、WebSocket と REST の一括処理の
両方を計算に入れる。削除時の drain は新しい受け入れを拒否するが、
既存の Voice 作業は、強制でない削除のアクティビティスナップショットに
表示されたままとなる。ランタイムの廃棄は、そのブリッジが
シャットダウンされる前に、選択されたランタイムの Voice リースのみを
中断する。

## Compatibility

レガシーの `/workspace/voice`、`/workspace/voice/transcribe`、
`/voice/stream` は引き続きプライマリワークスペースにバインドされる。
ACP メソッド名と Voice 設定のスキーマは変更されない。
`workspace_qualified_voice` は、共有の ACP/Voice WebSocket リスナーが
有効な場合、修飾されたすべての Voice モダリティを広告する。
既存の Voice モダリティのケイパビリティタグはプライマリワークスペースの
シグナルのままとなり、セカンダリランタイムの前提条件ではない。
セカンダリランタイムの設定は選択されたルートによって検証される。

未知のワークスペースセレクターは `400 workspace_mismatch` を返す。
登録済みだが信頼されていないランタイムは、Voice 設定や音声が
読み取られる前に `403 untrusted_workspace` を返す。
共有の 8 操作受け入れ上限は、レガシーと複数形ルートの両方の
一括処理とストリーミング作業をカバーする。一括処理のキャパシティ失敗は
`Retry-After: 5` を伴う `503 voice_capacity_exceeded` を返す。
ストリーミングのキャパシティ失敗はエラーフレームを送信し、
コード `1013` でクローズする。
