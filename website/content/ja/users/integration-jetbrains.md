# JetBrains IDEs

> JetBrains IDE は、Agent Client Protocol (ACP) を介して AI コーディングアシスタントをネイティブにサポートしています。この統合により、リアルタイムのコード提案機能付きで Qwen Code を JetBrains IDE 内で直接使用できます。

### Features

- **Native agent experience**: JetBrains IDE 内に統合された AI アシスタントパネル
- **Agent Client Protocol**: 高度な IDE 操作を可能にする ACP のフルサポート
- **Symbol management**: `` `#` `` メンションでファイルを会話コンテキストに追加
- **Conversation history**: IDE 内での過去の会話へのアクセス

### Requirements

- ACP をサポートする JetBrains IDE（IntelliJ IDEA、WebStorm、PyCharm など）
- Qwen Code CLI がインストール済みであること

### Installation

#### Install from ACP Registry (Recommend)

1. Qwen Code CLI をインストールします：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE を開き、AI Chat ツールウィンドウに移動します。

3. **Add ACP Agent** をクリックし、**Install** をクリックします。

   ![Install](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   JetBrains AI Assistant やその他の ACP エージェントをすでに使用している場合は、Agents List で **Install From ACP Registry** をクリックし、Qwen Code ACP をインストールしてください。

   ![Add from Agents List](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. AI Assistant パネルに Qwen Code エージェントが表示されます。

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Manual Install (for older version of JetBrains IDEs)

1. Qwen Code CLI をインストールします：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE を開き、AI Chat ツールウィンドウに移動します。

3. 右上の 3 点メニューをクリックし、**Configure ACP Agent** を選択して、以下の設定で Qwen Code を構成します：

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

4. AI Assistant パネルに Qwen Code エージェントが表示されます。

![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Troubleshooting

### Agent not appearing

- ターミナルで `qwen --version` を実行し、インストールを確認する
- 使用している JetBrains IDE のバージョンが ACP をサポートしていることを確認する
- JetBrains IDE を再起動する

### Qwen Code not responding

- インターネット接続を確認する
- ターミナルで `qwen` を実行し、CLI が正常に動作するか確認する
- 問題が解決しない場合は、[GitHub で Issue を作成してください](https://github.com/qwenlm/qwen-code/issues)