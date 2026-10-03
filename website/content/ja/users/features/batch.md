# バッチモード (DashScope)

DashScope Batch API は、リアルタイム料金の半額で非同期にリクエストを実行し、少なくとも 24 時間の完了ウィンドウを提供します。Qwen Code は `/batch-api` を通じてこれを使用します：バルクタスクを記述すると、エージェントがプランを準備し、`qwen batch` がそれを送信、追跡し、結果をファイルとして書き出します。

## バッチモデルの設定

エンドポイントと認証情報を `settings.json` に一度だけ宣言し、`batch.model` で選択します。通常の会話モデルと認証はそのまま変わりません。会話が Qwen OAuth や他のプロバイダーを使用している場合でも同様です。

```json
{
  "env": { "DASHSCOPE_API_KEY": "your-key" },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "batch": { "authType": "openai", "model": "qwen3.7-plus" }
}
```

これらのフィールドを既存の設定にマージし、他のプロバイダーエントリは保持します。`envKey` は `settings.env`（または環境変数）内のキー名を指定します。別のシェルエクスポートは不要です。プロバイダーの `generationConfig` がバッチ生成を制御します。`wireApi` はリクエストプロトコルであり、バッチスイッチではありません：省略するか `"chat-completions"` を使用してください。`"responses"` はこのエグゼキューターではサポートされていません。

`batch.authType` のデフォルトは `openai` です。モデルは `baseUrl` と設定済みの `envKey` を持つ、OpenAI 互換の chat-completions エントリ 1 つに正確に一致する必要があります。ID が重複する場合は、`batch.baseUrl` を設定された正確な URL に設定します。無効な明示的な選択は、アップロード前に失敗します。会話の認証情報にフォールバックすることはありません。この選択を変更した後は、バックグラウンドコレクターが子コマンドと同じ設定を使用するように、インタラクティブセッションを再起動してください。

バッチ選択がない場合、以前の動作が維持されます：バッチはメインモデルの設定を再利用し、OpenAI 互換の API キー認証を必要とします。Qwen OAuth 認証情報自体にはバッチルートがありません。`qwen batch check` を実行して、有料リクエストを送信せずに準備状況を確認してください。

## バッチが適切なツールである場合

- **半額、キャッシュなし。** バッチは成功したリクエストをリアルタイム定価の 50% で請求しますが、バッチ内ではプレフィックスキャッシュは決してヒットしません（測定値 `cached_tokens: 0`）。リアルタイムはキャッシュされた入力を定価の 20% で請求するため、バッチが有利になるのは、各リクエストの共有部分が少ない場合のみです：キャッシュヒット率 `h` において、リアルタイムのコストは入力に関して定価の約 `1 − 0.8h` であり、`h` が 0.625 を超えるとバッチは不利になります。
- **適切なユースケース：** 多くの独立したシングルターンリクエストで、それぞれが独自のコンテンツで支配されている場合——ドキュメントセットの翻訳や要約、ファイルごとのデータ抽出。長い出力はバッチをさらに有利にします。
- **不適切なユースケース：** 短いアイテムを持つ長い共有ルールブックまたは few-shot プレフィックス、少数のアイテム、複数ターンを必要とするもの。エージェント自身のターンをバッチ経由でルーティングすると、リアルタイムの 1.03 倍で数時間遅くなることが測定されています。
- **レイテンシ：** 数秒から数時間まで、ほとんどはキューイングであり、モデルによって異なります。安価であることを当てにしてください、速いことではありません。

コミットする前にジョブを確認するには、1 つのリクエストをリアルタイムで送信し、`usage.prompt_tokens_details.cached_tokens` と `usage.prompt_tokens` を比較してください。

## `/batch-api`

```text
/batch-api translate the Markdown docs in docs/zh into English,
writing them to docs/en with the same file names
```

エージェントは `qwen batch check` を実行し、タスクが適切であることを確認し、小さなサンプルを読み取り、`.qwen/batch/plans/` にプランを書き込み、プレビューします——何もアップロードも請求もされません：

```bash
qwen batch run .qwen/batch/plans/<slug>.json --dry-run
# preview: 42 item(s), window 24h — nothing uploaded, nothing billed
# model qwen-plus, thinking off, max output 8192 tokens (frozen from your current settings; retries reuse them)
# writes new files to: docs/en/ (42)
# ~180,000 in / ~190,000 out tokens (rough estimate); ...
# snapshot 3f9c2a7e5d10b884; submit exactly this batch with: qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
```

その後、そのスナップショットを送信します。このコマンドの承認プロンプトで、上記のプレビューとともに支出を決定します。プラン、ソースファイル、または設定が途中で変更された場合、送信は拒否されます。

```bash
qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
# task translate-docs-20260923103000: 42 item(s), window 24h
# ...
# batch job: batch_abc123
```

`run` はすぐに戻り、**手動で収集する必要はありません**。エージェントは `qwen batch collect <task-id> --wait` をバックグラウンドタスク（`/tasks` で表示可能）として開始し、そのターンを終了するため、作業を続けることができます。そのプロセスは HTTP 経由でプロバイダーをポーリングします——待機中のモデル呼び出しはありません——バッチが完了すると結果を書き込んで終了します。その後、エージェントが 1 回ウェイクされます：配信されたもの、保留されたもの、失敗したものを伝え、元のリクエストで求めたフォローアップを実行します。失敗したアイテムは自動的にリトライされることはありません。リトライは再度請求されるためです。

セッションが先に閉じても、何も失われません：インタラクティブセッションは、起動時とオープン中にプロジェクトの完了タスクを収集し、1 つの通知を投稿します。`general.batchAutoCollect` を `false` に設定すると、それをオフにできます。ヘッドレスラン（`qwen -p`）、`qwen serve`、および IDE/ACP クライアントは自動収集しません。

コマンドは任意のディレクトリから機能し、`!` プレフィックス（例：`!qwen batch collect <task-id>`）を使用してセッション内で機能するため、モデルターンが消費されません：

```bash
qwen batch check                         # 設定を検証。何も請求されません
qwen batch collect <task-id> [--wait [--timeout <s>]]   # 検証 + ターゲットファイルを書き出し
qwen batch retry <task-id>               # 失敗したアイテムのみを再送信
qwen batch retry <task-id> --max-output-tokens 8192  # 切り捨てられたものを含む
qwen batch list                          # プロジェクトごとの全記録タスク
qwen batch cancel <task-id>              # 部分的な結果でも請求されます
qwen batch clean <task-id>               # ローカルレコードを削除（何もキャンセルしません）
```

`collect` は各アイテムを次のように報告します：

- **delivered** — ターゲットに書き込まれました。
- **held** — 送信後にソースが変更された（`retry` が新しいソースに対して再送信）、またはターゲットが異なるコンテンツで既に存在する（それを解決して `collect` を再実行。新しいリクエストは行われません）。
- **failed** — 切り捨て、空、ツール呼び出し、またはプロバイダーエラー。`retry` がこれらを再送信し、切り捨てられたアイテムはより大きな `--max-output-tokens` で再送信されます。

`collect` の再実行は常に安全です：配信されたアイテムは決してやり直されず、使用量は二重にカウントされません。結果がディスクに書き込まれると、リモートの入力ファイルと出力ファイルは削除されます。

## レコード、安全性、コスト

- タスクレコードは `~/.qwen/batch/tasks/<task-id>/`（`QWEN_BATCH_HOME` がオーバーライド）に保存され、オーナーのみの権限が設定されます。ソースと出力の完全なコピーを保持するためです。プロジェクトの `.qwen/batch/` 下のプランファイルには `.gitignore` が適用されます。
- タスクは送信に使用されたエンドポイントと API キーに紐付けられます（キーの短いハッシュのみが保存されます）。アカウントまたはリージョンを切り替えた後、元に戻すまでコマンドは拒否されます。
- 作成呼び出しの応答が失われた場合、`run` は失敗し、タスクは `submit-unknown` とマークされ、`collect` は再送信せずにプロバイダーのバッチリストに対して reconciliation を行います——重複は二重に請求されるためです。
- 一度に 1 つの `qwen batch` コマンドのみがタスク上で動作します。
- ランは現在のサンプリングパラメーター、出力制限、および thinking モードをフリーズします。リトライはそれらを再利用します。
- 見積もりはトークンベースです。`QWEN_BATCH_INPUT_PRICE_PER_1M_USD` と `QWEN_BATCH_OUTPUT_PRICE_PER_1M_USD` を設定しない限りです。大まかな見積もりは thinking トークンを除外します。thinking トークンは出力の数倍になることがあります。プランの `maxCostUsd` はリクエスト上限の最悪ケースに対して強制されます。それにはそれらの価格、`maxOutputTokens`、および thinking オフまたは `thinking_budget` が必要です。ない場合、ランは拒否されます。どちらの数字にも、セッションがプランを準備するために費やしたものは含まれません。
- 失敗したリモートクリーンアップは `retry`、`cancel`、`clean` を決してブロックしません。後続の `collect` がそれを再試行します。プロバイダーが（1 回の新鮮なダウンロード後に）完全に提供できない、またはもはや持たない結果ファイルは、タスクをスタックさせたままにするのではなく、影響を受けるアイテムを失敗させます。
- `clean` はバッチがまだ実行中の可能性があるか、未収集の結果を保持している場合、`--force` を渡さない限り拒否します。
- ターゲットはプロジェクト内かつ隠しパス（`.git/`、`.github/`、`.qwen/`、…任意の深さ）の外側に残る必要があります。結果はプランを承認してから数時間後に書き込まれます。プレビューはターゲットディレクトリをリストします。

設計：[`docs/design/2026-09-23-batch-api-design.md`](../../design/2026-09-23-batch-api-design.md)。
オフラインのエンドツーエンドチェック（フェイク Batch API、実際のビルド済み CLI）は [`docs/verification/batch-api/`](../../verification/batch-api/README.md) にあります。