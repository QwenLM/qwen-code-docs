# ワークスペース `session-info` 集約エンドポイント

## 問題

`GET /workspace/:id/sessions` はカーソルページングであり、合計を返しません。
`GET /daemon/status` はライブのインメモリ `sessionCount` のみを公開します。
多くの永続化されたセッションを持つワークスペース（たとえばスケジュールタスク由来のもの）は、すべてのセッションをページングしなければローカルストアのサイズを知ることができません。

## 提案

以下を追加:

```http
GET /workspace/:id/session-info
GET /workspaces/:workspace/session-info
```

レスポンス（例示）:

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

非信頼のセカンダリワークスペースでは `live` は省略されます。これらのカタログ読み取りはライブブリッジに問い合わせてはならないためです。スキャンが安全上限に達した場合、または候補の JSONL ファイルを分類できない場合、レスポンスには `"truncated": true` が含まれます。その場合、永続化カウントは下限値となります。

## コストモデル

永続化カウントは、セッションタイトル検索（`SessionService.findSessionsByTitle` / `findSessionTitlesByPrefix`）がすでに使用している、既存のフルディレクトリスキャンパターンを再利用します:

1. プロジェクトの chats ディレクトリ（およびアーカイブの対となるディレクトリ）を `readdir`
2. UUID の `*.jsonl` をフィルタ
3. 同じファイル処理の安全上限を適用
4. project-hash の所属判定のため、最初の JSONL レコードのみを読み取る

タイトル/プロンプトのハイドレーションは行いません。これはディスク上で O(n) であり、**ポーリングしてはなりません**。レスポンスは常に `expensive: true` と `cost: "disk_scan"` を設定し、クライアントがホットパスで fail closed（失敗時は拒否）できるようにします。ドキュメントはこれを明示的に記載します。

デフォルトのリストページングは変更されず、合計を計算しません。カウントのために organized-view の `listAllPersistedSummaries` を再利用しないでください — そのパスは最大 50k セッションまでリストメタデータ全体をハイドレートします。

## ケーパビリティ

`/capabilities` に常時オンの `session_info` を、`session_list` の隣に追加します。

## ノンゴール

- キャッシュされたカウンター / ミューテーションフックによる集計（呼び出し元がより低いレイテンシを必要とする場合のフォローアップ候補）
- すべてのリストページに `total` を詰め込むこと
- v1 での organized-group や親でフィルタされた合計
