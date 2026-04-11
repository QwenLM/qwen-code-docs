# Zed Editor

> Zed Editor は Agent Client Protocol (ACP) を介して AI コーディングアシスタントをネイティブにサポートしています。この統合により、Zed のインターフェース内で Qwen Code を直接使用し、リアルタイムのコード提案を受け取ることができます。

![Zed Editor Overview](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 機能

- **ネイティブエージェント体験**: Zed のインターフェース内に統合された AI アシスタントパネル
- **Agent Client Protocol**: 高度な IDE 連携を可能にする ACP のフルサポート
- **ファイル管理**: `@` メンションでファイルを会話コンテキストに追加
- **会話履歴**: Zed 内での過去の会話へのアクセス

### 要件

- Zed Editor（最新バージョンを推奨）
- Qwen Code CLI がインストールされていること

### インストール

#### ACP Registry からのインストール（推奨）

1. Qwen Code CLI をインストールします：

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) をダウンロードしてインストールします。

3. Zed の右上にある **設定ボタン** をクリックし、**"Add agent"** を選択します。**"Install from Registry"** を選択して **Qwen Code** を探し、**"Install"** をクリックします。

   ![ACP Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP Installed](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### 手動インストール

1. Qwen Code CLI をインストールします：

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) をダウンロードしてインストールします。

3. Zed の右上にある **設定ボタン** をクリックし、**"Add agent"** を選択します。**"Create a custom agent"** を選択し、以下の設定を追加します：

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## トラブルシューティング

### エージェントが表示されない場合

- ターミナルで `qwen --version` を実行し、インストールが正常に完了しているか確認します。
- JSON 設定が有効であることを確認します。
- Zed Editor を再起動します。

### Qwen Code が応答しない場合

- インターネット接続を確認します。
- ターミナルで `qwen` を実行し、CLI が正常に動作するか確認します。
- 問題が解決しない場合は、[GitHub で Issue を報告してください](https://github.com/qwenlm/qwen-code/issues)。