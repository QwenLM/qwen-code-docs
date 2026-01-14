# Visual Studio Code

> VS Code 拡張機能（ベータ版）を使用すると、IDE に直接統合されたネイティブのグラフィカルインターフェースを通じて、Qwen の変更をリアルタイムで確認できるため、Qwen Code へのアクセスや操作がより簡単になります。

<br/>

<video src="https://cloud.video.taobao.com/vod/IKKwfM-kqNI3OJjM_U8uMCSMAoeEcJhs6VNCQmZxUfk.mp4" controls width="800">
  お使いのブラウザは video タグをサポートしていません。
</video>

### 機能

- **ネイティブな IDE エクスペリエンス**: Qwen アイコンからアクセスする専用の Qwen Code サイドバーパネル
- **自動承認編集モード**: Qwen の変更を自動的に適用
- **ファイル管理**: ファイルを @ メンションするか、システムのファイルピッカーを使用してファイルや画像を添付
- **会話履歴**: 過去の会話にアクセス
- **複数セッション**: 複数の Qwen Code セッションを同時に実行

### 必要条件

- VS Code 1.85.0 以上

### インストール

[Visual Studio Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) から拡張機能をダウンロードしてインストールしてください。

## トラブルシューティング

### 拡張機能がインストールされない

- VS Code のバージョンが 1.85.0 以上であることを確認してください
- VS Code に拡張機能のインストール許可があるか確認してください
- Marketplace のウェブサイトから直接インストールを試みてください

### Qwen Code が応答しない

- インターネット接続を確認してください
- 新しい会話を開始して、問題が継続するかどうか確認してください
- 問題が続く場合は [GitHub で Issue を報告してください](https://github.com/qwenlm/qwen-code/issues)