# Qwen Code CLI

Qwen Code 内において、`packages/cli` はユーザーが Qwen や他の AI モデル、およびそれに関連するツールとプロンプトを送受信するためのフロントエンドです。Qwen Code 全体の概要については

## このセクションのナビゲーション

- **[Authentication](./authentication.md):** Qwen OAuth および OpenAI 互換プロバイダを使用した認証設定のガイド。
- **[Commands](./commands.md):** Qwen Code CLI コマンド（例: `/help`、`/tools`、`/theme`）のリファレンス。
- **[Configuration](./configuration.md):** 設定ファイルを使用して Qwen Code CLI の動作をカスタマイズするためのガイド。
- **[Themes](./themes.md)**: 異なるテーマで CLI の外観をカスタマイズするためのガイド。
- **[Tutorials](tutorials.md)**: Qwen Code を使用して開発タスクを自動化する方法を示すチュートリアル。

## ノンインタラクティブモード

Qwen Code はノンインタラクティブモードで実行することもでき、これはスクリプティングや自動化に便利です。このモードでは、CLI に input を pipe してコマンドを実行し、その後終了します。

以下の例では、ターミナルから Qwen Code にコマンドを pipe しています：

```bash
echo "What is fine tuning?" | qwen
```

また、`--prompt` または `-p` フラグを使うこともできます：

```bash
qwen -p "What is fine tuning?"
```

ヘッドレス使用、スクリプティング、自動化、および高度な例に関する詳細なドキュメントについては、**[Headless Mode](../headless.md)** ガイドをご参照ください。