# Computer Use

Qwen Code には組み込みの **Computer Use** ツールが搭載されており、エージェントがデスクトップを操作できます。クリック、入力、スクロール、アプリの起動、ウィンドウ内容の読み取り、スクリーンショットの撮影などが可能です。これにより、Qwen Code はターミナル内に閉じない汎用デスクトップ自動化エージェントになります。

Computer Use は [`cua-driver`](https://github.com/trycua/cua) ネイティブドライバーによって動作します。ツールは `computer_use__` プレフィックスの遅延ロード組み込みツールとして登録されるため、モデルが実際に使用するまでプロンプトスペースを消費しません。

> [!warning]
>
> Computer Use はエージェントにマウス、キーボード、ウィンドウの操作権限を与え、画面の内容を読み取れるようにします。信頼できるプロンプトでのみ使用し、可能な限りサンドボックス化または使い捨ての環境で利用してください。アクションツール（click、type、drag など）は通常の[承認モード](./approval-mode.md)のフローに従いますが、ウィンドウ一覧取得などの読み取り専用ツールは確認なしで実行される場合があります。

## 有効化と無効化

Computer Use は**デフォルトで有効**です。`computer_use__*` ツールは起動時に自動的に登録されます。

完全に無効化するには（ネイティブドライバーのダウンロードや起動も防止されます）、`settings.json` で `tools.computerUse.enabled` を `false` に設定します。

```jsonc
{
  "tools": {
    "computerUse": {
      "enabled": false,
    },
  },
}
```

この設定は再起動後に反映されます。

## 初回実行とネイティブドライバー

エージェントが初めて Computer Use ツールを呼び出すと、Qwen Code は署名付きの `cua-driver` バイナリ（約 20 MB）を `~/.qwen/computer-use/` にダウンロードし、ローカルプロセスとして起動します。ビルド済みバイナリは macOS（Apple Silicon および Intel）、Linux（x86_64）、Windows（x86_64）向けに提供されています。

### macOS の権限

macOS では、デスクトップ自動化に 2 つのシステム権限が必要です。

- **アクセシビリティ** — ウィンドウ/UI 状態の読み取りと入力の合成
- **画面収録** — スクリーンショットのキャプチャ

初回使用時に、macOS の標準システムダイアログを通じてこれらの権限付与をガイドします。エージェントは権限ステータスをオンデマンドで確認することもできます（`check_permissions` ツール）。macOS は権限付与を_責任ある_プロセスに帰属させるため、Qwen Code を起動したターミナルや IDE に対して権限を付与する必要がある場合があります。

## エージェントができること

`cua-driver` の全ツール群が公開されます。主なものは以下の通りです。

| カテゴリ        | ツール（抜粋）                                                                       |
| --------------- | ------------------------------------------------------------------------------------ |
| マウス          | `click`、`double_click`、`right_click`、`drag`、`move_cursor`、`scroll`              |
| キーボード      | `type_text`、`press_key`、`hotkey`                                                   |
| ウィンドウ / UI | `list_windows`、`get_window_state`、`get_accessibility_tree`、`set_value`、`zoom`    |
| アプリ          | `launch_app`、`list_apps`、`bring_to_front`、`kill_app`                              |
| ブラウザページ  | `page`（JavaScript の実行、テキストの読み取り、DOM クエリ、要素のクリック）           |
| スクリーンショット | `get_window_state`（PNG をキャプチャ）、`page`                                    |
| 録画            | `start_recording`、`stop_recording`、`replay_trajectory`（セッションの記録/リプレイ） |
| セッション      | `start_session`、`end_session`、エージェントカーソルオーバーレイ制御                  |

要素指定のアクションは、生のピクセル座標よりも優先されます。`get_window_state` はウィンドウのアクセシビリティツリーの Markdown レンダリングを返し、各操作可能な要素に安定した `element_index` を付与します。入力ツールはこのインデックスを直接ターゲットにできます。

サポートは macOS が最も充実しています。一部のツールはプラットフォーム固有です（例：`bring_to_front` は Windows のみ、`launch_app` は macOS アプリが対象）。

## 設定

Computer Use のすべての設定は `settings.json` の `tools.computerUse` 配下に存在します。詳細は[設定リファレンス](../configuration/settings.md)を参照してください。

| 設定項目                              | 型      | デフォルト | 説明                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools.computerUse.enabled`           | boolean | `true`     | `computer_use__*` ツールを登録します。`false` の場合、ドライバーのダウンロードや起動は一切行われません。                                                                                                                                                       |
| `tools.computerUse.maxImageDimension` | number  | `-1`       | スクリーンショットの最長辺ピクセル上限。`-1` はドライバーのデフォルト（1568）を維持。`0` はリサイズ無効（フル解像度）。正の値は最長辺をキャップします。低いキャップは vision トークンコストを削減します。環境変数オーバーライド：`QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`。 |
| `tools.computerUse.idleTimeoutMs`     | number  | `300000`   | 最後の `computer_use__*` 呼び出し後にドライバープロセスを維持するミリ秒（デフォルト 5 分）。`0` は Qwen Code 終了までプロセスを維持します。                                                                                                                   |

3 つの設定はいずれも再起動後に反映されます。

## 関連項目

- [承認モード](./approval-mode.md) — ツール実行の許可方法
- [サンドボックス](./sandbox.md) — ツールがアクセス可能な範囲の隔離
- [設定リファレンス](../configuration/settings.md) — `tools.computerUse.*` の完全なスキーマ

