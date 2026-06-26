# JetBrains IDEs

> JetBrains IDE は、Agent Client Protocol（ACP）を通じて AI コーディングアシスタントをネイティブにサポートしています。この統合により、JetBrains IDE 内で Qwen Code を直接使用し、リアルタイムのコード提案を受けることができます。

### 特長

- **ネイティブエージェントエクスペリエンス**: JetBrains IDE 内に統合された AI アシスタントパネル
- **Agent Client Protocol**: ACP を完全サポートし、高度な IDE 連携を実現
- **シンボル管理**: #-mention でファイルを会話コンテキストに追加可能
- **会話履歴**: IDE 内で過去の会話にアクセス可能

### 必要条件

- ACP 対応の JetBrains IDE（IntelliJ IDEA、WebStorm、PyCharm など）
- Qwen Code CLI のインストール

### インストール

#### ACP レジストリからインストール（推奨）

1. Qwen Code CLI をインストールします。

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE を開き、AI Chat ツールウィンドウに移動します。

3. **ACP エージェントを追加**をクリックし、次に**インストール**をクリックします。

   ![インストール](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   JetBrains AI Assistant や他の ACP エージェントを既に利用しているユーザーは、Agent List の **ACP レジストリからインストール**をクリックし、Qwen Code ACP をインストールします。

   ![Agent List から追加](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. Qwen Code エージェントが AI Assistant パネルに表示されます。

   ![JetBrains AI Chat の Qwen Code](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### 手動インストール（JetBrains IDE の旧バージョン向け）

1. Qwen Code CLI をインストールします。

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. JetBrains IDE を開き、AI Chat ツールウィンドウに移動します。

3. 右上の 3 点リーダーメニューをクリックし、**ACP エージェントを設定**を選択して、以下の設定で Qwen Code を構成します。

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

4. Qwen Code エージェントが AI Assistant パネルに表示されます。

![JetBrains AI Chat の Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## トラブルシューティング

### エージェントが表示されない

- ターミナルで `qwen --version` を実行し、インストールを確認する
- JetBrains IDE のバージョンが ACP をサポートしていることを確認する
- JetBrains IDE を再起動する

### Qwen Code が応答しない

- インターネット接続を確認する
- ターミナルで `qwen` を実行して CLI が動作するか確認する
- 問題が解決しない場合は [GitHub で Issue を報告する](https://github.com/qwenlm/qwen-code/issues)