# Zed エディタ

> Zed エディタは、エージェント・クライアント・プロトコル（ACP）を通じて AI コーディング・アシスタントをネイティブにサポートしています。この統合により、Zed のインターフェース内で Qwen Code を直接利用し、リアルタイムのコード提案を受けられます。

![Zed エディタの概要](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### 機能

- **ネイティブなエージェント体験**: Zed のインターフェース内に統合された AI アシスタント・パネル
- **エージェント・クライアント・プロトコル（ACP）**: 高度な IDE 相互作用を可能にする ACP の完全サポート
- **ファイル管理**: ファイルを `@` でメンションすることで、会話コンテキストに追加可能
- **会話履歴**: Zed 内で過去の会話を参照可能

### 必要条件

- Zed エディタ（最新版を推奨）
- Qwen Code CLI のインストール済み

### インストール

#### ACP レジストリからインストール（推奨）

1. Qwen Code CLI をインストールします：

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed エディタ](https://zed.dev/) をダウンロードしてインストールします。

3. Zed で、右上隅の **設定ボタン** をクリックし、「エージェントを追加」を選択して、「レジストリからインストール」を選び、**Qwen Code** を見つけたら **インストール** をクリックします。

   ![ACP レジストリ](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code の ACP インストール完了](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### 手動インストール

1. Qwen Code CLI をインストールします：

```bash
npm install -g @qwen-code/qwen-code
```

2. [Zed エディタ](https://zed.dev/) をダウンロードしてインストールします。

3. Zed で、右上隅の **設定ボタン** をクリックし、「エージェントを追加」を選択、「カスタムエージェントを作成」を選択して、以下の設定を追加します：

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code の統合](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## トラブルシューティング

### エージェントが表示されない

- ターミナルで `qwen --version` を実行し、インストールが正しく完了しているか確認してください。
- JSON 設定が有効であるか確認してください。
- Zed エディタを再起動してください。

### Qwen Code が応答しない

- インターネット接続を確認してください。
- ターミナルで `qwen` を実行し、CLI が正常に動作するか確認してください。
- 問題が解決しない場合は、[GitHub で Issue を報告してください](https://github.com/qwenlm/qwen-code/issues)。