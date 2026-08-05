# 名前付きセッショングループのカスタム Hex カラー

## 問題

名前付きセッショングループは、現在クイックセッションのカラータグで使用されている 6 値のカラー列挙型を共有しています。デーモンはそれ以外の値を `invalid_group_color` で拒否し、TypeScript SDK も同じクローズドな union 型を公開しており、WebShell エディターはプリセットのセレクトのみを提供しています。ユーザーは名前付きグループを既存のプロジェクトパレットに合わせたり、より大きなグループカタログを視覚的に区別したりすることができません。

[#6744](https://github.com/QwenLM/qwen-code/issues/6744) で管理されています。

## 提案する変更

| レイヤー        | 変更                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| コア           | プリセットのセッションタグカラーを名前付きグループの表示カラーから分離する。名前付きグループはプリセットまたは 6 桁の `#RRGGBB` を受け付け、クイックタグはプリセットのみに留まる。有効な Hex 値は永続化前に小文字へ正規化する。 |
| REST と ACP    | クイックタグのバリデーションはプリセットのみに留め、名前付きグループのカラーはコアのバリデーションに渡す。                                                                                                   |
| TypeScript SDK | プリセットと Hex のカラー型をエクスポートする。グループの入出力はそれらの union 型を使用し、セッションの整理は引き続きプリセットカラーを使用する。                                                                                    |
| WebShell       | プリセットの選択肢を維持しつつ、ネイティブのカラーピッカーと Hex テキストフィールドを備えたカスタムオプションを追加する。カスタムグループのドットはインラインの背景色で描画する。                                                            |

## 決定事項

- 6 桁の `#RRGGBB` のみを受け付ける。3 桁、4 桁、8 桁の形式は拒否されるため、永続化される値はすべて 1 つの予測可能な形状になる。
- 前後の空白をトリムし、コアで Hex 値を小文字に正規化する。クライアントは即時フィードバックのためにより早い段階で正規化してもよいが、コアが最終的な権威となる。
- クイックセッションのカラータグは拡張しない。その 6 値カタログはコンパクトな並び替え / フィルターの次元であり続け、後方互換性が保たれる。
- sidecar のスキーマバージョンは 1 のままにする。保存されるフィールドは文字列のままであり、古いプリセット値も引き続き有効である。
- Hex クラスを認識しない既存のクライアントは安全に失敗すべきである。WebShell はインラインの `background-color` を通じて Hex グループのドットを描画する。

## ファイル

- `packages/core/src/services/session-organization-service.ts`
- `packages/core/src/services/session-organization-service.test.ts`
- `packages/cli/src/serve/routes/session.ts`
- `packages/cli/src/serve/acp-http/dispatch.ts`
- `packages/cli/src/serve/server/session-list.ts`
- `packages/acp-bridge/src/bridgeTypes.ts`
- `packages/sdk-typescript/src/daemon/types.ts`
- `packages/sdk-typescript/src/daemon/index.ts`
- `packages/sdk-typescript/src/index.ts`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`
- `packages/web-shell/client/components/SessionOverviewPanel.tsx`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.test.tsx`
- `packages/web-shell/client/i18n.tsx`

## スコープ外

- クイックセッションタグのカスタムカラー。
- アルファチャンネル、グラデーション、名前付き CSS カラー、短縮 Hex 形式。
- グループ sidecar フォーマットの変更や既存値の移行。

## 未解決の質問

なし。既存の構造化エラーとグループの永続化パスは、プロトコルバージョンの引き上げなしで拡張できる。
