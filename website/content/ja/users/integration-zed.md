# Zed Editor

> Zed Editor は、エージェントクライアントプロトコル (ACP) を通じて AI コーディングアシスタントのネイティブサポートを提供します。この統合により、Zed のインターフェース内で Qwen Code を直接使用し、リアルタイムのコード提案を利用できます。

![Zed Editor Overview](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 機能

- **ネイティブエージェント体験**: Zed のインターフェース内に統合された AI アシスタントパネル
- **エージェントクライアントプロトコル**: 高度な IDE 相互作用を可能にする ACP の完全サポート
- **ファイル管理**: @メンションでファイルを会話コンテキストに追加
- **会話履歴**: Zed 内での過去の会話へのアクセス

### 動作条件

- Zed Editor (最新バージョン推奨)
- Qwen Code CLI がインストールされていること

### インストール

1. Qwen Code CLI をインストールします：

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) をダウンロードしてインストールします

3. Zed で右上隅の**設定ボタン**をクリックし、**「エージェントを追加」**を選択して、**「カスタムエージェントを作成」**を選択し、以下の設定を追加します：

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code 統合](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## トラブルシューティング

### エージェントが表示されない

- ターミナルで `qwen --version` を実行して、インストールを確認してください
- JSON 設定が有効であることを確認してください
- Zed Editor を再起動してください

### Qwen Code が応答しない

- インターネット接続を確認してください
- ターミナルで `qwen` を実行して CLI が動作することを確認してください
- 問題が解決しない場合は、[GitHub で Issue を報告](https://github.com/qwenlm/qwen-code/issues)してください