# Qwen Code CLI

Qwen Code 内において、`packages/cli` はユーザーが Qwen や他の AI モデル、およびそれに関連するツールとプロンプトを送受信するためのフロントエンドです。Qwen Code の概要については、[メインドキュメントページ](../index.md)を参照してください。

## このセクションのナビゲーション

- **[Authentication](./authentication.md):** Qwen OAuth および OpenAI 互換プロバイダを使用した認証設定ガイド。
- **[Commands](./commands.md):** Qwen Code CLI コマンド（例: `/help`、`/tools`、`/theme`）のリファレンス。
- **[Configuration](./configuration.md):** 設定ファイルを使用して Qwen Code CLI の動作をカスタマイズするガイド。
- **[Token Caching](./token-caching.md):** トークンキャッシングにより API コストを最適化する方法。
- **[Themes](./themes.md)**: 異なるテーマを使って CLI の外観をカスタマイズするガイド。
- **[Tutorials](tutorials.md)**: Qwen Code を使って開発タスクを自動化する方法を示すチュートリアル。
- **[Welcome Back](./welcome-back.md)**: セッション間でシームレスに作業を再開できる Welcome Back 機能について学ぶ。

## 非対話モード

Qwen Code は非対話モードで実行することもでき、これはスクリプティングや自動化に便利です。このモードでは、CLI に input を pipe してコマンドを実行し、その後終了します。

以下の例では、terminal から Qwen Code にコマンドを pipe しています：

```bash
echo "What is fine tuning?" | qwen
```

Qwen Code はコマンドを実行し、output を terminal に表示します。同じ動作は、`--prompt` または `-p` フラグを使っても実現できます。例えば：

```bash
qwen -p "What is fine tuning?"
```