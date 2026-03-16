# JetBrains IDE

> JetBrains IDE は、エージェント クライアント プロトコル (ACP) を通じて AI コーディング アシスタントをネイティブにサポートしています。この統合により、リアルタイムのコード提案とともに、Qwen Code を JetBrains IDE 内で直接利用できます。

### 機能

- **ネイティブなエージェント体験**: JetBrains IDE 内に統合された AI アシスタント パネル
- **エージェント クライアント プロトコル**: 高度な IDE 相互作用を可能にする ACP の完全サポート
- **シンボル管理**: 対話コンテキストにファイルを追加するには、`#` でファイルをメンションします
- **対話履歴**: IDE 内で過去の対話にアクセス可能

### 必要条件

- ACP サポート付きの JetBrains IDE（IntelliJ IDEA、WebStorm、PyCharm など）
- Qwen Code CLI のインストール

### インストール

#### ACP レジストリからのインストール（推奨）

1. Qwen Code CLI をインストールします：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE を起動し、「AI Chat」ツールウィンドウを開きます。

3. **Add ACP Agent** をクリックし、その後 **Install** をクリックします。

   ![インストール](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   JetBrains AI Assistant やその他の ACP エージェントを使用しているユーザーは、エージェント一覧から **Install From ACP Registry** をクリックし、Qwen Code ACP をインストールしてください。

   ![エージェント一覧からの追加](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. これで、Qwen Code エージェントが AI Assistant パネルで利用可能になります。

   ![JetBrains AI Chat 内の Qwen Code](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### 手動インストール（古いバージョンの JetBrains IDE 向け）

1. Qwen Code CLI をインストールします：

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE を起動し、AI Chat ツールウィンドウを開きます。

3. 右上隅にある 3 つのドット（…）メニューをクリックし、**Configure ACP Agent**（ACP エージェントの設定）を選択して、以下の設定で Qwen Code を構成します：

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

4. これで、Qwen Code エージェントが AI アシスタントパネルに表示されるようになります。

![JetBrains AI Chat における Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## トラブルシューティング

### エージェントが表示されない場合

- 端末で `qwen --version` を実行し、インストールが正しく完了しているか確認してください。
- 使用中の JetBrains IDE のバージョンが ACP をサポートしているか確認してください。
- JetBrains IDE を再起動してください。

### Qwen Code が応答しない

- インターネット接続を確認してください
- ターミナルで `qwen` を実行して、CLI が正しく動作することを確認してください
- 問題が解決しない場合は、[GitHub で Issue を報告してください](https://github.com/qwenlm/qwen-code/issues)