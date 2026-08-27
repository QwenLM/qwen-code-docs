# Zed Editor

> Zed Editor は、Agent Client Protocol (ACP) を介して AI コーディングアシスタントをネイティブサポートしています。この統合により、Zed のインターフェース内で Qwen Code を直接使用し、リアルタイムのコード提案を受けることができます。

![Zed Editor 概要](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 機能

- **ネイティブエージェント体験**: Zed のインターフェースに統合された AI アシスタントパネル
- **Agent Client Protocol**: ACP を完全サポートし、高度な IDE 連携を実現
- **ファイル管理**: @-mention でファイルを会話コンテキストに追加可能
- **会話履歴**: Zed 内で過去の会話にアクセス可能

### 必要条件

- Zed Editor（最新バージョンを推奨）
- Qwen Code CLI がインストールされていること

### インストール

#### ACP レジストリからインストール（推奨）

1. Qwen Code CLI をインストール:

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) をダウンロードしてインストール

3. Zed で右上の **設定ボタン** をクリックし、**「エージェントを追加」** を選択、**「レジストリからインストール」** を選び、**Qwen Code** を見つけて **「インストール」** をクリック。

   ![ACP レジストリ](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP インストール完了](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### 手動インストール

1. Qwen Code CLI をインストール:

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed Editor](https://zed.dev/) をダウンロードしてインストール

3. Zed で右上の **設定ボタン** をクリックし、**「エージェントを追加」** を選択、**「カスタムエージェントを作成」** を選び、以下の設定を追加:

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

- ターミナルで `qwen --version` を実行し、インストールを確認
- JSON 設定が有効かどうか確認
- Zed Editor を再起動

### Qwen Code が応答しない

- インターネット接続を確認
- ターミナルで `qwen` を実行し、CLI が動作するか確認
- 問題が解決しない場合は [GitHub で Issue を報告](https://github.com/qwenlm/qwen-code/issues)