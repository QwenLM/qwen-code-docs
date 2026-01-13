# JetBrains IDE

> JetBrains IDE は、エージェントコントロールプロトコル (ACP) を介して AI コーディングアシスタントへのネイティブサポートを提供します。この統合により、JetBrains IDE 内で Qwen Code を直接使用し、リアルタイムのコード提案を利用できます。

### 機能

- **ネイティブエージェント体験**: JetBrains IDE 内に統合された AI アシスタントパネル
- **エージェントコントロールプロトコル**: 高度な IDE インタラクションを可能にする ACP の完全サポート
- **シンボル管理**: #-mention ファイルを使用して会話コンテキストに追加
- **会話履歴**: IDE 内での過去の会話へのアクセス

### 動作条件

- ACP サポート付き JetBrains IDE (IntelliJ IDEA、WebStorm、PyCharm など)
- Qwen Code CLI のインストール済み

### インストール

1. Qwen Code CLI をインストールします：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE を開き、AI Chat ツールウィンドウに移動します。

3. 右上隅の 3 点メニューをクリックし、**Configure ACP Agent** を選択して、以下の設定で Qwen Code を構成します：

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/path/to/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. Qwen Code エージェントが AI Assistant パネルで利用可能になります

![JetBrains AI Chat での Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## トラブルシューティング

### エージェントが表示されない場合

- ターミナルで `qwen --version` を実行して、インストールを確認してください
- 使用中の JetBrains IDE のバージョンが ACP をサポートしていることを確認してください
- JetBrains IDE を再起動してください

### Qwen Code が応答しない場合

- インターネット接続を確認してください
- ターミナルで `qwen` を実行して CLI が動作することを確認してください
- 問題が解決しない場合は、[GitHub で Issue を作成してください](https://github.com/qwenlm/qwen-code/issues)