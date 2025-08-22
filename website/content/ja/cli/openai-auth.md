# OpenAI 認証

Qwen Code CLI は、Google の Gemini モデルではなく OpenAI モデルを使用したいユーザーのために、OpenAI 認証をサポートしています。

## 認証方法

### 1. インタラクティブ認証（推奨）

CLI を初めて実行し、認証方法として OpenAI を選択すると、以下の入力を求められます：

- **API Key**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) から取得した OpenAI API key
- **Base URL**: OpenAI API のベース URL（デフォルトは `https://api.openai.com/v1`）
- **Model**: 使用する OpenAI モデル（デフォルトは `gpt-4o`）

CLI は各フィールドについてガイドします：

1. API key を入力して Enter を押す
2. Base URL を確認／変更して Enter を押す
3. モデル名を確認／変更して Enter を押す

**Note**: API key は直接貼り付けることができます — CLI はペースト機能をサポートしており、確認のためにキー全体を表示します。

### 2. コマンドライン引数

OpenAI の認証情報をコマンドライン引数からも渡すことができます：

```bash

# API key を使って基本的な使い方
qwen-code --openai-api-key "your-api-key-here"

# カスタム base URL を指定する場合
qwen-code --openai-api-key "your-api-key-here" --openai-base-url "https://your-custom-endpoint.com/v1"

# カスタム model を指定する場合
qwen-code --openai-api-key "your-api-key-here" --model "gpt-4-turbo"
```

### 3. 環境変数

シェルまたは `.env` ファイルで以下の環境変数を設定してください：

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # 省略可能、デフォルトはこの値
export OPENAI_MODEL="gpt-4o"  # 省略可能、デフォルトは gpt-4o
```

## サポートされているモデル

CLI は OpenAI API 経由で利用可能なすべての OpenAI モデルをサポートしています。以下が含まれます：

- `gpt-4o`（デフォルト）
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- その他の利用可能なモデル

## カスタムエンドポイント

`OPENAI_BASE_URL` 環境変数を設定するか、`--openai-base-url` コマンドライン引数を使用することで、カスタムエンドポイントを利用できます。これは以下のようなケースで便利です：

- Azure OpenAI の利用
- 他の OpenAI 互換 API の利用
- ローカルの OpenAI 互換サーバーの利用

## 認証方法の切り替え

認証方法を切り替えるには、CLI インターフェースで `/auth` コマンドを使用してください。

## セキュリティに関する注意点

- API キーはセッション中にメモリ上に保存されます
- 永続的に保存する場合は、環境変数または `.env` ファイルを使用してください
- API キーをバージョン管理にコミットしないでください
- CLI は確認用に API キーをプレーンテキストで表示します - 端末が安全であることを確認してください