# ToolSearch のプリロードしきい値

## 問題

延期ツール（`shouldDefer=true`）は無条件に ToolSearch の背後に隠される: すべての MCP ツール（`DiscoveredMCPTool` でハードコード）に加えて、バンドルされたビルトインのセット（web_search、web_fetch、cron、monitor、worktree など）。延期は、延期されたセットが大きい場合にプロンプトトークンを節約するが、無料ではない: セッション中盤での公開のたびに function declaration のリストが書き換えられ、そのリストは tools→system→messages のプレフィックスの先頭に位置するため、1 回の ToolSearch の読み込みでプロンプトの KV キャッシュ全体が無効になる。延期されたセットが小さい場合、節約はわずかであり、キャッシュの毀損と ToolSearch の追加のラウンドトリップにより、正味で損になる。

Claude Code はこのトレードオフを `ENABLE_TOOL_SEARCH=auto` / `auto:N` でモデル化している: 「コンテキストウィンドウの 10% 以内に収まる場合はツールを前もって読み込み、そうでなければ延期する」(code.claude.com/docs/en/agent-sdk/tool-search)。本変更はこれに相当するゲートを追加する。

## 設計

新しい設定 `tools.toolSearch.threshold`（数値、パーセント、デフォルト `10`）。

セッション開始時（`GeminiClient.startChat`、deferred-tools リマインダーが解決される前）に、ToolSearch が登録されており、しきい値が 0 より大きい場合:

- すべての延期ツールスキーマの合計トークンフットプリントを推定する — バンドルされたビルトインも MCP も同様
  （`JSON.stringify(tool.schema).length / CHARS_PER_TOKEN`）。
- 合計がコンテキストウィンドウ
  （`contentGeneratorConfig.contextWindowSize`、フォールバックは
  `tokenLimit(model)`）の `threshold`% 以内に収まる場合、既存の
  `revealDeferredTool` メカニズムを通じてそれらをすべて公開する。オールオアナッシング — 部分的な公開は任意のサブセットを ToolSearch の背後に残し、延期されたままのツールは初回使用時にキャッシュを毀損し得る。
- それ以外はすべて延期されたまま（以前の動作）。`threshold: 0`
  は無条件に古い動作を復活させる。

したがってプリロードされたツールは最初の declaration リストに入り、起動時の deferred-tools リマインダーからは除外され、declaration リストはセッション全体を通じて安定したままとなる。

## 決定事項

- **セッション開始時のみで、`setTools()` では決して行わない。** 起動時のリマインダーがすでに告知したツールを公開すると、`queueAddedMcpToolsReminder` がそれを「削除された」とマークしてしまい、セッション中盤の declaration の変更は、プリロードが守るために存在するそのキャッシュ自体を毀損する。後から接続したサーバーのツールは、次のセッション開始まで延期されたままとなる（追加ツールリマインダーで告知され、ToolSearch 経由で到達可能）。`/clear` は公開されたセットをクリアし、判定を再実行する。
- **延期セット全体に対して 1 つのバジェット、バンドルも含む。** Claude Code の auto しきい値は MCP/SDK ツールのみをカバーする（そのビルトインは別途管理されている）が、その分割が可能なのは: 延期ツールはキャッシュキーが計算される前にプロンプトプレフィックスから取り除かれ、発見されたツールの定義は `tool_reference` ブロック経由でインラインに展開される — 「プレフィックスは手つかずのままなので、プロンプトキャッシュは保たれる」
  (platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)。
  ここではすべての公開が — バンドルでも MCP でも — `setTools()` を経由して declaration リストを書き換える。約 14 のバンドル延期ツール（web_search、web_fetch など）を除外すると、プレフィックスは 1 回のよくあるツール読み込みだけで完全なキャッシュ毀損に至り、プリロードが買い取るまさにその安定性を手放すことになる。統合したものがバジェットを超える場合はすべて延期されたままとなり、これはバンドルツールにとってしきい値導入前のベースラインと一致する。
- **Claude Code のデフォルトとは異なり、しきい値のデフォルトは 10（auto モードオン）。**
  Claude Code の未設定のデフォルトは MCP ツールを常に延期されたままにし、`auto` をオプトインにしている — そこでは延期ツールの初回使用にキャッシュ無効化のコストがかからないため成り立つ。ここでは完全なプレフィックス再構築のコストがかかるため、auto 形式のゲートはデフォルトでオン。`threshold: 0` は Claude Code の常に延期するデフォルトを再現する。
- **すでに公開されたツールもバジェットに計上する。** 繰り返しセッション開始（コンパクションも `startChat` を通過する）の際に、サーバーの増減に合わせて公開されたセットがバジェットを超えて段階的に増大しないようにするためである。
- **ToolSearch が利用できない場合はプリロードしない** — `resolveDeferredToolsForReminder` 内の既存の即時公開ブランチが、すでにすべてを公開している。
