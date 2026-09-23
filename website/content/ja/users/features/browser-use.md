# Browser Use

Browser Use を使用すると、Qwen Code が Chrome ブラウザのページを操作でき、
既存のタブやサインイン済みのセッションを利用できます。

## 使い方

macOS または Linux で Chrome 125 以降および Qwen Code 0.24.2 以降を使用してください（`qwen --version` で確認できます）。**使用したい Chrome プロファイルに [Chrome Web Store から Qwen Code 拡張機能](https://chromewebstore.google.com/detail/qwen-code/hdhmmjclhibojdddmancfgbkleahfaph)をインストールしてください。** この拡張機能は必須ですが、Qwen Code パッケージには含まれていません。インストール後は Chrome が自動的に更新します。

**拡張機能はプロファイルごとに 1 つだけ使用してください。** 以前にパッケージ化されていない拡張機能として読み込んだ場合は、ストア版を使用する前に `chrome://extensions` でそのコピーを削除または無効化してください。両方が有効な状態だと、Qwen は同じプロファイルに対して 2 つのブラウザを認識し、どちらかに接続してしまう可能性があります。

Chrome Web Store で拡張機能が地域で利用できないと表示される場合は、代わりにソースからビルドしてください。Qwen Code リポジトリの `packages/chrome-extension` ディレクトリの [README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme) に従い、次に `chrome://extensions` を開いてデベロッパーモードを有効にし、**「パッケージ化されていない拡張機能を読み込む」** を選択して、ビルドした `dist/extension` ディレクトリを指定してください。

ブラウザでのタスクを直接記述してください。たとえば:

> 開いているダッシュボードを読んで、今日の注文を要約してください。

Qwen は適切な場合に Browser Use スキルを選択します。最初のブラウザタスクで、
ユーザーディレクトリに小さなローカル接続プログラムが自動的に登録され、
以降のタスクで再利用されます。Qwen はページを操作する前に拡張機能との接続を
確認します。接続できない場合は、Chrome を開いて Qwen Code が 0.24.2 以降であり、
対象のプロファイルで拡張機能が有効になっていることを確認してから
再試行してください。
初回使用時にランタイム依存関係の設定が必要な場合、Qwen が手順を案内し、
再起動を依頼することがあります。Browser Use 専用の Qwen 拡張機能や
`qwen serve` プロセスは不要です。

## 無効化

`/skills` を使用して **browser-use** を無効にできます。これによりモデルから
スキルが隠されますが、既存のブラウザセッションが切断されたり、会話にすでに
読み込まれた指示が削除されたりすることはありません。