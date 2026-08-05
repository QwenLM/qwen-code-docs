# MCP モデルペイロードフィルタリング

## Goal

アプリ、ウィンドウ、デバイス、パッケージの操作に必要な実際のローカル値は保持しつつ、`packages/cua-driver` と `packages/mobile-mcp` がテキストの MCP ペイロード内で既知のベンダー用語を返すことを防ぐ。

フィルタリングはオプトインで、デフォルトでは無効である。これらの用語を拒否する API ルートでは、MCP サーバーの環境変数に `MCP_MODEL_PAYLOAD_FILTER=1` を設定する。その他のルートのユーザーは元のペイロードをそのまま受け取る。

初期の大文字小文字を区別しない ASCII 用語は、`qwen`、`dashscope`、`alibaba`、`aliyun`、`aliyuncs`、`alicloud`、`tongyi`、`qianwen`、`antgroup`、`bailian`、`modelscope`、`damo`、`lingma`、`wanx`、`alipay`、`antfin`、`yuque`、`dingtalk`、`taobao`、`tmall`、`qoder`、`maxcompute` である。中国語用語は完全一致でマッチする: `通义`、`千问`、`阿里`、`百炼`、`魔搭`、`达摩`、`灵码`、`万相`、`支付宝`、`蚂蚁`、`语雀`、`钉钉`、`淘宝`、`天猫`。複数部分からなる名前のセパレーターバリアントもマッチする。たとえば `q-wen`、`dash_scope`、`ali cloud`、`qian-wen`、`ant_group` などである。

## Encoding

一致した各部分文字列は、その UTF-8 の 16 進バイトを含むステートレスなトークンで置き換えられる。たとえば、フィルタリングされたアプリ名はトークンの周囲でも読むことができ、その値を同じ MCP サーバーへ返すと、ツールの検証と実行の前に元の部分文字列が正確に復元される。これによりセッションマップを回避し、プロセス再起動後もアプリ/パッケージ/パスのラウンドトリップが機能し続ける。

JSON-RPC の id とメソッドは決して変換されない。result、error、notification ペイロード内のオブジェクトキーとテキスト値は再帰的に変換される。画像と音声の `data` フィールドはバイト単位で保持される。

## Component boundaries

cua-driver では、`Response::ok` と `Response::error` が、直接 stdio、HTTP、デーモンプロキシの MCP レスポンスに対する共有のモデル向け境界である。ツール呼び出し名と引数は、ディスパッチ前に `Request::tool_call` でデコードされる。両方向とも、`MCP_MODEL_PAYLOAD_FILTER=1` の場合のみ変換を適用する。

mobile-mcp では、トランスポートラッパーが送信 JSON-RPC ペイロードをエンコードし、SDK がスキーマ検証を行う前に受信ペイロードをデコードする。小さな `McpServer` サブクラスが、`MCP_MODEL_PAYLOAD_FILTER=1` のときにこのラッパーを stdio、SSE、インメモリテスト、将来のトランスポートに適用し、それ以外は元のトランスポートを変更せず接続する。

## Non-goals

インストール済みアプリ、プロセス、バンドル、npm パッケージ、署名 ID、リポジトリ、配布 URL のリネームは行わない。stderr、telemetry、ビルドログの変換もしない。画像バイトは保持されるため、OCR ベースのフィルタリングはこのテキストペイロード保証の対象外である。

エイリアスは、同じ MCP コンポーネントへ返された場合のみデコードされる。エイリアスをシェルや別のサーバーへ渡してもローカル値は復元されない。

## Verification

- すべての用語、大文字小文字混在、中国語テキスト、ネストされたオブジェクトとキー、無効なトークン、厳密なラウンドトリップ、バイナリコンテンツの保持をユニットテストする。
- モデル向け境界がデフォルトで変更されず、`MCP_MODEL_PAYLOAD_FILTER=1` が存在する場合のみフィルタリングされることを検証する。
- 両コンポーネントについて、実際の MCP initialize、tools/list、成功、構造化成功、エラーレスポンスを実施する。
- 観測済みの cua の permission、health、app、window ペイロードと、決定的な mobile のエラーエコーを再実行する。
