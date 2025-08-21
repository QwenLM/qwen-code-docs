# 認証の設定

Qwen Code では、AI モデルにアクセスするための認証方法が2つ用意されています。利用ケースに応じて適切な方法を選択してください。

1. **Qwen OAuth（推奨）：**
   - qwen.ai アカウントでログインする場合に使用します。
   - 初回起動時に、Qwen Code は qwen.ai の認証ページにリダイレクトします。認証が完了すると、資格情報はローカルにキャッシュされ、次回以降の実行では Web ログインをスキップできます。
   - **必要条件：**
     - 有効な qwen.ai アカウント
     - 初回認証のためのインターネット接続
   - **メリット：**
     - Qwen モデルへのシームレスなアクセス
     - 資格情報の自動更新
     - API キーの手動管理が不要

   **クイックスタート：**

   ```bash
   # Qwen Code を起動し、OAuth フローに従ってください
   qwen
   ```

   CLI が自動的にブラウザを開き、認証プロセスをガイドします。

   **qwen.ai アカウントで認証するユーザー向け：**

   **クォータ：**
   - 1分あたり 60 リクエスト
   - 1日あたり 2,000 リクエスト
   - トークン使用量は適用されません

   **コスト：** 無料

   **注意：** モデルごとの具体的なクォータは設定されていません。共有体験の品質を保つため、モデルのフォールバックが発生する場合があります。

2. **<a id="openai-api"></a>OpenAI 互換 API：**
   - OpenAI またはその他の互換プロバイダの API キーを使用します。
   - この方法では、API キーを通じてさまざまな AI モデルを利用できます。

   **設定方法：**

   a) **環境変数：**

   ```bash
   export OPENAI_API_KEY="your_api_key_here"
   export OPENAI_BASE_URL="your_api_endpoint"  # 任意
   export OPENAI_MODEL="your_model_choice"     # 任意
   ```

   b) **プロジェクトの `.env` ファイル：**  
   プロジェクトのルートに `.env` ファイルを作成してください：

   ```env
   OPENAI_API_KEY=your_api_key_here
   OPENAI_BASE_URL=your_api_endpoint
   OPENAI_MODEL=your_model_choice
   ```

   **対応プロバイダ：**
   - OpenAI（https://platform.openai.com/api-keys）
   - Alibaba Cloud 百炼（Bailian）
   - ModelScope
   - OpenRouter
   - Azure OpenAI
   - その他 OpenAI 互換の API

## 認証方法の切り替え

セッション中に認証方法を切り替えるには、CLIインターフェースで `/auth` コマンドを使用します：

```bash

# CLI内で以下を入力:
/auth
```

これにより、アプリケーションを再起動することなく認証方法を再設定できます。

### `.env` ファイルによる環境変数の永続化

プロジェクトディレクトリまたはホームディレクトリに **`.qwen/.env`** ファイルを作成できます。通常の **`.env`** ファイルでも動作しますが、Qwen Code の変数を他のツールと分離するために `.qwen/.env` を推奨します。

**重要:** 一部の環境変数（`DEBUG` や `DEBUG_MODE` など）は、qwen-code の動作に干渉するのを防ぐため、プロジェクトの `.env` ファイルからは自動的に除外されます。qwen-code 固有の変数には `.qwen/.env` ファイルを使用してください。

Qwen Code は以下の検索順序で **最初に見つけた** `.env` ファイルから自動的に環境変数を読み込みます：

1. **カレントディレクトリ** から始めて `/` に向かって上位ディレクトリを探索し、各ディレクトリで以下をチェック：
   1. `.qwen/.env`
   2. `.env`
2. ファイルが見つからない場合、**ホームディレクトリ** をフォールバック先とします：
   - `~/.qwen/.env`
   - `~/.env`

> **重要:** 検索は **最初に見つけた** ファイルで停止します—複数のファイルにまたがって変数が **マージされることはありません**。

#### 例

**プロジェクト固有のオーバーライド**（プロジェクト内にいるときに優先される）:

```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

**ユーザー全体の設定**（すべてのディレクトリで利用可能）:

```bash
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## 非対話モード / ヘッドレス環境

Qwen Code を非対話環境で実行する場合、OAuth ログインフローは使用できません。  
代わりに、環境変数を使って認証を設定する必要があります。

CLI は自動的に非対話端末での実行を検出し、設定されていれば OpenAI 互換の API メソッドを使用します：

1.  **OpenAI 互換 API:**
    - `OPENAI_API_KEY` 環境変数を設定します。
    - カスタムエンドポイントを使用する場合は、任意で `OPENAI_BASE_URL` と `OPENAI_MODEL` も設定します。
    - CLI はこれらの認証情報を使用して、API プロバイダに対して認証を行います。

**ヘッドレス環境での実行例:**

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
export OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"

# Qwen Code を実行
qwen
```

非対話セッションで API キーが設定されていない場合、CLI は認証設定を促すエラーメッセージを表示して終了します。