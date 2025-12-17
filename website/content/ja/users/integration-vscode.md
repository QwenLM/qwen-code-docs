# Visual Studio Code

> VS Code 拡張機能（ベータ版）により、IDEに直接統合されたネイティブのグラフィカルインターフェースを通して、Qwen の変更をリアルタイムで確認できるようになります。これにより、Qwen Code へのアクセスと操作が容易になります。

<br/>

<video src="https://cloud.video.taobao.com/vod/IKKwfM-kqNI3OJjM_U8uMCSMAoeEcJhs6VNCQmZxUfk.mp4" controls width="800">
  お使いのブラウザは動画タグをサポートしていません。
</video>

### 機能

- **ネイティブ IDE エクスペリエンス**: Qwen アイコンからアクセス可能な専用の Qwen Code サイドバーパネル
- **自動承認編集モード**: Qwen の変更が行われるたびに自動的に適用されます
- **ファイル管理**: ファイルを @メンションしたり、システムファイルピッカーを使ってファイルや画像を添付できます
- **会話履歴**: 過去の会話にアクセス可能
- **複数セッション**: 複数の Qwen Code セッションを同時に実行可能

### 必要条件

- VS Code 1.98.0 以上

### インストール

1. Qwen Code CLI をインストールします：

   ```bash
   npm install -g qwen-code
   ```

2. [Visual Studio Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) から拡張機能をダウンロードしてインストールします。

## トラブルシューティング

### 拡張機能がインストールされない

- VS Code 1.98.0 以上を使用していることを確認してください
- VS Code に拡張機能をインストールする権限があるか確認してください
- Marketplace の Web サイトから直接インストールを試みてください

### Qwen Code が応答しない

- インターネット接続を確認してください
- 新しい会話を開始して、問題が継続するかどうか確認してください
- 問題が解決しない場合は [GitHub で Issue を作成](https://github.com/qwenlm/qwen-code/issues) してください