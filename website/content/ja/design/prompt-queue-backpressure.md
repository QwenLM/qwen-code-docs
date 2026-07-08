# プロンプトキューのバックプレッシャー

## 概要

`qwen serve` はセッションごとのプロンプト受け入れバックプレッシャーを適用するようになりました。デフォルトの制限は、セッションごとに保留中のプロンプトが `5` つです。保留中のプロンプトとは、デーモンが `sendPrompt` を介して受け入れ、まだ解決（settled）していないプロンプトのことで、セッションごとの FIFO で待機中のプロンプトと、現在実行中のプロンプトが含まれます。

`branchSession` は引き続き同じセッションごとの FIFO の背後で直列化されますが、プロンプトではなく、このプロンプト制限を消費しません。

## 意味論

- デフォルト: `maxPendingPromptsPerSession = 5`。
- 無効: `0` または `Infinity` は無制限を意味します。
- 無効な値: 負の数、小数、および `NaN` は、ブリッジの構築時および `runQwenServe` によって拒否されます。CLI フラグは負でない整数を受け入れます。`0` は上限（キャップ）を無効にします。
- 権限: ブリッジが受け入れゲートです。SDK 側のアカウンティングは早期失敗ガードであり、サーバー側の強制の代替ではありません。
- プロンプトのデッドライン: `--prompt-deadline-ms` は、すでに受け入れられたプロンプトにのみ引き続き適用されます。これはキュー受け入れの上限ではありません。

## ブリッジの動作

`SessionEntry` は `pendingPromptCount` を追跡します。`sendPrompt` は意図的に `async` ではないため、HTTP ルートが `202 Accepted` を返す前に、受け入れチェックが同期的にスローされる可能性があります。

受け入れフロー:

1. セッションを検索します。
2. カウンターをインクリメントする前に、事前に中止されたシグナルを拒否します。
3. `pendingPromptCount >= maxPendingPromptsPerSession` の場合、`PromptQueueFullError` をスローします。
4. カウンターをインクリメントし、プロンプトを FIFO にエンキューします。
5. 呼び出し元から見えるプロンプトの Promise が解決したときに、スロットを正確に 1 回解放します。

キューの末尾が各プロンプトの結果を依然として受け止めるため、失敗によって FIFO が汚染されることはありません。元の呼び出し元は引き続きプロンプトの拒否を受け取ります。

## HTTP の動作

`POST /session/:id/prompt` は、受け入れ済みレスポンスを出力する前に、同期的な `PromptQueueFullError` をキャッチします。ルートは以下を返します。

- ステータス: `503`
- ヘッダー: `Retry-After: 5`
- ボディ: `{ code: 'prompt_queue_full', error, sessionId, limit, pendingCount }`

受け入れに失敗した場合、`promptId` は返されません。

`/capabilities` は以下を通知します。

```json
{
  "limits": {
    "maxPendingPromptsPerSession": 5
  }
}
```

上限が無効な場合、通知される値は `null` になります。

## ACP HTTP の動作

ACP JSON-RPC トランスポートは、構造化されていない内部エラーにフォールスルーする代わりに、`PromptQueueFullError` を安定したエラーシェイプにマッピングします。

```json
{
  "data": {
    "errorKind": "prompt_queue_full",
    "sessionId": "...",
    "limit": 5,
    "pendingCount": 5
  }
}
```

## SDK の動作

`DaemonClient` は `prompt()` 呼び出しに対して、ローカルなセッションごとの予約を持ちます。HTTP リクエストを送信する前に予約を行い、以下の場合に解放します。

- レガシーなブロッキング `200` の完了、
- ノンブロッキング `202` ターンの完了、
- `turn_error`、
- 呼び出し元による中止、
- SSE の終了、
- fetch またはレスポンスの解析失敗。

`DaemonPendingPromptLimitError` は、SDK がローカルで拒否し、プロンプトリクエストを送信しなかったことを意味します。

SDK オプションは数値のケイパビリティ値を直接受け入れます。`null` は、`/capabilities.limits.maxPendingPromptsPerSession` に一致するようにローカル上限を無効にします。

`DaemonSessionClient` は、長寿命のサブスクリプションパスに対して同じローカル制限を適用します。静的メソッド `createOrAttach`、`load`、および `resume` は既存のパラメータ位置を維持します。直接構築ではローカル上限をオーバーライドする場合があります。