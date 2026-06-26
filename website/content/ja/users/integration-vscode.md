# Visual Studio Code

> VS Code 拡張機能（ベータ版）を使用すると、IDE に直接統合されたネイティブなグラフィカルインターフェースを通じて Qwen の変更をリアルタイムで確認できるため、Qwen Code へのアクセスと操作が容易になります。

<br/>

<video src="https://cloud.video.taobao.com/vod/IKKwfM-kqNI3OJjM_U8uMCSMAoeEcJhs6VNCQmZxUfk.mp4" controls width="800">
  お使いのブラウザは video タグをサポートしていません。
</video>

### 機能

- **ネイティブ IDE エクスペリエンス**: Qwen アイコンからアクセスできる専用の Qwen Code サイドバーパネル
- **自動承諾編集モード**: Qwen の変更が行われると自動的に適用
- **ファイル管理**: @-mention でファイルを指定、またはシステムのファイルピッカーを使ってファイルや画像を添付
- **会話履歴**: 過去の会話にアクセス可能
- **複数セッション**: 複数の Qwen Code セッションを同時に実行

### 必要条件

- VS Code 1.85.0 以上

### インストール

[Visual Studio Code 拡張機能マーケットプレイス](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) から拡張機能をダウンロードしてインストールしてください。

## トラブルシューティング

### 拡張機能がインストールできない

- VS Code 1.85.0 以上であることを確認してください
- VS Code に拡張機能をインストールする権限があることを確認してください
- マーケットプレイスの Web サイトから直接インストールを試してください

### Qwen Code が応答しない

- インターネット接続を確認してください
- 新しい会話を開始して問題が続くかどうか確認してください
- 問題が続く場合は [GitHub で issue を報告](https://github.com/qwenlm/qwen-code/issues) してください