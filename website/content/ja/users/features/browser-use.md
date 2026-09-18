# Browser Use

Browser Use を使用すると、Qwen Code が Chrome ブラウザのページを操作でき、
既存のタブやサインイン済みのセッションを利用できます。

## 使い方

macOS または Linux で Chrome 125 以降を使用してください。**使用したい Chrome プロファイルに
Qwen Chrome 拡張機能をインストールし、有効化してください。** この拡張機能は必須ですが、
Qwen Code パッケージには含まれていません。Chrome Web Store での公開はまだありません。
Qwen Code リポジトリの `packages/chrome-extension` ディレクトリから、
[README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme)
に従ってビルドし、`chrome://extensions` を開いてデベロッパーモードを有効にし、
**「パッケージ化されていない拡張機能を読み込む」** を選択して、ビルドした
`dist/extension` ディレクトリを指定してください。

ブラウザでのタスクを直接記述してください。たとえば:

> 開いているダッシュボードを読んで、今日の注文を要約してください。

Qwen は適切な場合に Browser Use スキルを選択します。初回使用時にランタイム依存関係の
設定が必要な場合、Qwen が手順を案内し、再起動を依頼することがあります。
Browser Use 専用の Qwen 拡張機能や `qwen serve` プロセスは不要です。

## 無効化

`/skills` を使用して **browser-use** を無効にできます。これによりモデルから
スキルが隠されますが、既存のブラウザセッションが切断されたり、会話にすでに
読み込まれた指示が削除されたりすることはありません。