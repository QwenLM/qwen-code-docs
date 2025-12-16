# Zed エディタ

> Zed エディタは、Agent Control Protocol（ACP）を通じて AI コーディングアシスタントをネイティブサポートしています。この統合により、リアルタイムのコード提案を受けながら、Zed のインターフェース内で直接 Qwen Code を使用できます。

![Zed エディタ概要](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 機能

- **ネイティブエージェント体験**：Zed のインターフェース内に統合された AI アシスタントパネル  
- **Agent Control Protocol**：高度な IDE 連携を可能にする ACP のフルサポート  
- **ファイル管理**：@メンションでファイルを会話コンテキストに追加可能  
- **会話履歴**：Zed 内で過去の会話を参照可能  

### 動作条件

- Zed エディタ（最新バージョン推奨）  
- Qwen Code CLI がインストールされていること

### インストール

1. Qwen Code CLI をインストールします：

   ```bash
   npm install -g qwen-code
   ```

2. [Zed Editor](https://zed.dev/) をダウンロードしてインストールします。

3. Zed で右上隅の **設定ボタン** をクリックし、**「Add agent」** を選択、**「Create a custom agent」** を選び、以下の設定を追加します：

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--experimental-acp"],
  "env": {}
}
```

![Qwen Code 統合](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## トラブルシューティング

### エージェントが表示されない

- ターミナルで `qwen --version` を実行して、インストールを確認してください。
- JSON の設定が有効であることを確認してください。
- Zed Editor を再起動してください。

### Qwen Code が応答しない

- インターネット接続を確認してください。
- ターミナルで `qwen` を実行して CLI が動作するか確認してください。
- 問題が解決しない場合は [GitHub に issue を作成](https://github.com/qwenlm/qwen-code/issues) してください。