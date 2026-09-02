
# `qwen serve` のローカル起動テンプレート (v0.16-alpha)

開発者ワークステーション上で `qwen serve` を長期稼働するバックグラウンドプロセスとして実行するためのリファレンステンプレートです。[v0.16-alpha 既知の制限](./qwen-serve.md#v016-alpha-known-limits) と対になっています — ローカルのみ、シングルユーザー、BYO ベアラトークン。コンテナ化 / マルチホスト / TLS フロントのデプロイメントは v0.16.x で対応予定です。

> **対象読者**: デーモンを再起動後も持続させ、ログを永続的な場所に出力し、クリーンな `restart-on-failure` を求めるドッグフーディング開発者。シェルセッションの間だけデーモンが必要な場合は、素の `qwen serve` (フォアグラウンド、Ctrl-C で停止) で十分です。

## ベアラトークンの生成 (1回のみ)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # ユーザー管理、ビルトインパスではありません
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

パス / ファイル名は自由に選択できます。v0.16-alpha はトークンファイルを自動生成・自動検出しません (v0.16.x で対応予定)。標準の BYO 設定については、ユーザーガイドの [Authentication](./qwen-serve.md#authentication) セクションを参照してください。

> **この `export` は現在のシェルセッションのみにスコープしてください。** `~/.bashrc` / `~/.zshrc` には追加しないでください — プロファイルレベルの export は、そのシェルから起動されるすべてのプロセス (IDE サブプロセス、ブラウザデバッガ、無関係なプロジェクトの `npm` スクリプト) にベアラトークンを公開してしまいます。長期実行のセットアップでは、以下の systemd `EnvironmentFile=` / launchd `EnvironmentVariables` の仕組みを使用してください。どちらもトークンをデーモンプロセスのみにスコープします。

デーモンは、ベアラトークンを CLI の `--token <値>` または環境変数 `QWEN_SERVER_TOKEN` (どちらも先頭・末尾の空白は除去) から読み取ります。TypeScript SDK の `DaemonClient` コンストラクタは、`token` オプションが渡されなかった場合に `QWEN_SERVER_TOKEN` にフォールバックします (PR 27 のフォールバック — 環境変数を設定したクライアントは、スクリプトに値を渡す必要がありません)。

シェルレベルの一度の `export` で、サーバー起動と SDK クライアント構築の両方をカバーできます (上記の注意に従い、必ずセッション内にスコープしてください)。

## ワークスペースのライフサイクルとプロセス境界

1つのデーモンで、同じリスナーの下に複数の分離されたワークスペースランタイムをホストできます。
`--workspace` を絶対パスディレクトリで繰り返し指定すると、明示的な起動時ランタイムが作成されます。
最初のものがプライマリです。プライマリおよびその他の明示的な起動時/静的ランタイムは、プロセスを再起動せずに削除できません。

追加のワークスペースは、デーモンの実行中に `POST /workspaces` で登録することもできます。
`persist: true` を渡すと、動的なセカンダリがユーザーレベルの登録ストアに保持され、次回の起動時に復元されます。
信頼されていない登録は、診断、バウンディングされたファイル読み取り、および宣言された永続化読み取りに表示されますが、ACP を開始できません。動的および永続化復元されたセカンダリは削除可能です。通常の削除は、ランタイムがビジーの場合は拒否します。強制削除は、アクティブリソースの終了を要求し、同じ cwd が再追加可能になる前に論理的削除をコミットします。
クリーンアップは永続化コミットポイント以降でバウンディングされ、ベストエフォートです。障害は削除されたランタイムを復元する代わりにログに記録されます。

ランタイムの分離は、cwd、環境オーバーレイ、ファイルシステム/信頼境界、ワークスペースサービス、ブリッジ、Voice リース状態、チャネルワーカー、および ACP/MCP リソース境界をカバーします。本番環境では、互換性のために信頼されたプライマリ ACP チャイルドのプリヒートを試みます。信頼されたセカンダリは、最初のランタイムバックされたコマンドまたは Session で開始され、信頼されていないセカンダリは ACP を開始しません。レガシーなプライマリルートは既存の互換性動作を保持します。
認証、HTTP レート制限、リスナーおよび Voice の受け入れキャップ、合計セッション受け入れ、メトリクス、シャットダウン、およびプロセス障害半径はデーモン全体で共通です。それらのプロセスレベルの境界を独立させる必要がある場合は、別のデーモンを実行してください。

## Linux: systemd ユーザーユニット

> **最初に `qwen` バイナリと信頼されたツールディレクトリを確認してください。** ユニットファイルの `ExecStart=` は**絶対パス**である必要があり、明示的な `PATH` には、デーモンセッションが必要とする `gh`、`git`、`npm`、スクリプトベースの `qwen` ランチャーが使用する `node` インプリターなどのツールの信頼されたディレクトリを含む必要があります。サービスマネージャーはシェルプロファイルを読み取りません。通常のシェルで `which qwen gh git npm node` を実行し、以下のテンプレートで `/PATH/TO/qwen` と `/PATH/TO/USER/BIN` が表示されている箇所を実際の実行ファイルとディレクトリに置き換えてください。

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Qwen Code デーモン (ループバック HTTP + SSE)
After=network.target

[Service]
Type=simple
# プロジェクトに合わせて置き換え; %h はユーザーユニット下で $HOME に展開されます。
WorkingDirectory=%h/project-a
# `which qwen` を実行して絶対パスを確認してください。systemd は $PATH を読み取りません。
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170 --workspace %h/project-a --workspace %h/project-b
# qwen のインタープリターとユーザーインストール済みツールを含む信頼されたディレクトリで
# 最初のエントリを置き換えてください。systemd はシェルプロファイルを読み取りません。
Environment=PATH=/PATH/TO/USER/BIN:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
# ベアラトークンをユニットに直接記述するのではなく、chmod 600 のファイルから読み取ります。
# `Environment=` はトークンをユニットファイルに露出します (通常 644 = 全ユーザー可読)。
# EnvironmentFile は、既に `chmod 600` で作成したユーザー所有のシークレットファイルにトークンを保持します。
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

環境ファイルを一度生成します (セットアップ手順で作成したトークンファイルは生の値を保持しています。これを `KEY=値` の形式でラップし、systemd が環境変数として読み取れるようにします):

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

管理:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # ログアウト後 / 再起動後もユーザーマネージャーを実行し続ける
journalctl --user -u qwen-serve -f               # ログの末尾を表示
systemctl --user restart qwen-serve.service     # トークンローテーション後
systemctl --user disable --now qwen-serve.service
```

`loginctl enable-linger` がない場合、ユーザーレベルの systemd インスタンスはユーザーがログアウトすると停止し、次回ログイン時にのみ再起動します — ヘッドレスな開発ボックスでは、SSH セッション終了時にデーモンが存続できません。`enable-linger` は「再起動後も持続」を実際に機能させるためのものです。

**システム全体の代替** (共有開発ホスト、あまり一般的ではありません): ユニットを `/etc/systemd/system/qwen-serve@.service` に置き、`User=%i` を設定し、`sudo systemctl enable --now qwen-serve@<ユーザー名>.service` で管理します。それ以外の `[Service]` の本体は同じです。機密性の低い `PATH` は `Environment=` に残せますが、ベアラトークンは決してそこに入れないでください。ユーザーの `chmod 600` ファイルを指す `EnvironmentFile=` を使用してください。シングルユーザーワークステーションではユーザーレベル + linger を選択してください。

## macOS: launchd ユーザーエージェント

> **最初に `qwen` バイナリと信頼されたツールディレクトリを確認してください。** systemd と同じ制約です: `ProgramArguments` は**絶対パス**である必要があり、`EnvironmentVariables.PATH` にはデーモンセッションが必要とするツールを含む信頼されたディレクトリを含む必要があります。通常のシェルで `which qwen gh git npm node` を実行してください。macOS 上の一般的な場所: `/opt/homebrew/bin` (Apple Silicon の Homebrew)、`/usr/local/bin` (Intel の Homebrew と手動インストール)、`~/.nvm/versions/node/vX.Y.Z/bin` (nvm)、`~/.volta/bin` (Volta)。以下の実際の絶対パスに置き換えてください。launchd は `~` やシェル変数を展開しません。

`~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.qwenlm.qwen-serve</string>
  <key>ProgramArguments</key>
  <array>
    <!-- `which qwen` を実行して絶対パスを確認してください; launchd は $PATH を読み取りません。 -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
    <string>--workspace</string>
    <string>/Users/YOUR-USERNAME/project-a</string>
    <string>--workspace</string>
    <string>/Users/YOUR-USERNAME/project-b</string>
  </array>
  <!-- launchd は `~` や `$HOME` を展開しません — 絶対パスを使用してください。 -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/project-a</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- launchd はシェルプロファイルを読み取りません。最初のエントリを qwen のインタープリターと
         ユーザーツールを含む信頼されたディレクトリで置き換えてください。 -->
    <key>PATH</key>
    <string>/PATH/TO/USER/BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <!-- 実際のトークンを入れたままこのファイルをコミットしないでください。また、plist 自体も chmod 600 にして、
         インラインのトークンが全ユーザー可読にならないようにしてください。 -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>PASTE-YOUR-TOKEN-HERE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- 非ゼロ終了時のみ再起動 (systemd の Restart=on-failure に一致)。
       生の `<true/>` だと正常な SIGTERM 後でも再起動してしまい、`kill <pid>` を停止のシグナルとして使えなくなります
       (オペレーターは `launchctl unload` する必要があります)。SuccessfulExit=false でそれを修正します。 -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- 永続的な障害時の再起動ストームを抑制します (systemd の RestartSec=5 に相当;
       launchd のデフォルトは 1秒未満で再起動します)。 -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- ログは /tmp ではなくユーザーの Library に出力します。/tmp は全ユーザー書き込み可能であり
       (共有ワークステーションではシンボリックリンク攻撃のリスク)、3日後に periodic-daily で消去されます;
       `~/Library/Logs/qwen-serve/` はユーザースコープで永続的です。launchd は `load` のたびにこれらを切り詰めるため、
       unload → load のトークンローテーションサイクルで以前の診断ログが消去されます — インシデント調査後はバックアップしてください。 -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

管理:

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # 初回のみ
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist にインラインのトークンが含まれます
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # 停止する場合
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

plist を編集した後 (例: トークンのローテーション) は、必ず `unload` してから `load` してください — `launchctl` は systemd の `daemon-reload` のように plist の変更を自動的に再読み込みしません。注意: 各 `load` でログファイルが切り詰められるため、インシデント調査中にローテーションする前にログを別途保存してください。

どちらかのサービスを起動または再起動した後、新しいデーモンセッションを開き、コマンド内で `PATH` を変更せずに必要なツールが解決されることを確認してください。たとえば `command -v gh` です。ツールが見つからない場合は、その信頼された絶対パスを含むディレクトリをサービスレベルの `PATH` に追加してサービスをリロードしてください。`~/.zshrc`、`~/.bashrc`、または他のインタラクティブシェルプロファイルに依存しないでください。

## tmux セッション (インタラクティブな監督)

`QWEN_SERVER_TOKEN` がシェルに既にエクスポートされていることを前提とします (上記のセットアップセクションを参照):

```bash
tmux new -d -s qwen-serve "qwen serve --hostname 127.0.0.1 --workspace /absolute/path/project-a --workspace /absolute/path/project-b"
tmux attach -t qwen-serve   # ライブログを表示; Ctrl-b d でデタッチ
tmux kill-session -t qwen-serve
```

`tmux new -d` は親シェルの環境を継承するため、`QWEN_SERVER_TOKEN` が自動的に引き継がれます。サービスユニットにコミットせずに、デーモンの標準出力 (認証警告、MCP 発見の進捗、低速クライアント警告) を時々確認したい場合に最適です。ターミナルを閉じても持続しますが、ホストの再起動には耐えられません。

## nohup ワンライナー (簡易的)

`QWEN_SERVER_TOKEN` がシェルに既にエクスポートされていることを前提とします:

```bash
nohup qwen serve --hostname 127.0.0.1 \
  --workspace /absolute/path/project-a \
  --workspace /absolute/path/project-b \
  > qwen-serve.log 2>&1 &
echo $!  # デーモンの PID; 後でクリーンに kill したい場合は控えておきます
```

明示的な絶対パスの `--workspace` 値により、デーモンはシェルのカレントディレクトリに依存しません。クライアントは、公開された `capabilities.workspaces[]` のいずれかを選択し、セッション作成時にその cwd を渡すべきです。

「バックグラウンドで実行して API を叩きたい」という一回限りのワークフローには問題ありません。**単一セッションを超える用途には推奨しません** — クラッシュ時の再起動なし、ログファイルは無制限に増加、PID を覚えていない場合にデーモンを見つけるクリーンな方法がありません。インタラクティブな監督には tmux を、再起動を超えて持続させたいものには systemd / launchd を推奨します。

## デーモンが起動していることの確認

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # デーモンの機能セット
```

認証が設定されている場合 (`--token` または `QWEN_SERVER_TOKEN`)、通常のループバックバインド上の `/health` を除くすべての通常の API ルートで `Authorization: Bearer <token>` が必要です。チャネル Webhook ingress は常に設定された `x-qwen-webhook-secret` を使用し、Web Shell のドキュメントおよびアセットルートは事前認証のままです。`--require-auth=true` は起動時にトークンを要求し、Webhook 認証を変更せずにループバックの `/health` もベアラゲートの後ろに移動します。ループバックデフォルトでトークンなしでデーモンを起動した場合 (`qwen serve` のゼロコンフィグパス)、どちらの呼び出しもヘッダーを必要とせず、プライマリリスナーに到達できるローカルプロセスは、デーモンユーザーとしてのコード実行を含む、フルオペレーター API 権限を受け取ります。上記のテンプレートはすべてトークンを設定しているため、実際には `Authorization` ヘッダーが必要です。`/capabilities` が `401` を返す場合、ユニット / plist のトークンが、`curl` が使用している環境変数エクスポートのトークンと一致していません。

## トークンのローテーション

1. 新しいトークンを生成し、ユニットが参照する環境ファイルを書き込みます:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (launchd / nohup / tmux テンプレートの場合: plist の `<string>` 値を編集するか、`export QWEN_SERVER_TOKEN` を再実行してください。plist を再生成する場合は `chmod 600` を忘れずに)
2. デーモンを再起動します:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>` してから、新しいトークンを環境に設定して再実行
3. クライアント SDK / スクリプトを更新します。TypeScript SDK の `DaemonClient` は `QWEN_SERVER_TOKEN` を自動的に読み取ります (PR 27 フォールバック) — クライアントシェルで新しい値を `export` し、クライアントを再構築してください。

## 再起動とクラッシュの動作

サービス管理の再起動セマンティクスはテンプレートによって異なります:

- **systemd `Restart=on-failure`** — 非ゼロ終了 / シグナルの場合のみ再起動。クリーンな SIGTERM (`systemctl stop`) は再起動ループを**トリガーしません**。
- **launchd `KeepAlive` と `SuccessfulExit=false`** (上記テンプレート) — systemd の動作に一致。生の `<true/>` だとクリーンな終了後も再起動します。`ThrottleInterval=10` は永続的な障害時の再起動ストームをレート制限し、systemd の `RestartSec=5` に相当します。
- **tmux / nohup** — 自動再起動はありません。デーモンがクラッシュすると、再実行するまで PID が死んだままになります。

**単一のデーモンプロセスのライフタイム内**では、クライアントの切断は、ユーザーガイドの [Durability model](./qwen-serve.md#durability-model) セクションに従い、SSE `Last-Event-ID` の再開によって回復します — リプレイリングはインメモリです。

デーモンの**再起動**は、すべてのインメモリセッションをドロップします。クライアントは再接続して新たに開始します。セッション内容 (プロンプト、ツール呼び出し、会話履歴) の再起動を跨ぐ持続性は、v0.16-alpha では**ありません**。

## 対象外 (v0.16.x 以降で対応)

- **コンテナ化デプロイメント** — Dockerfile、docker-compose、Kubernetes マニフェスト、nginx + TLS リバースプロキシ、マルチインスタンストークン分離。エンタープライズパイロットが確定したら v0.16.x で対応予定。検証する人がいないとドキュメントは腐ります。
- **クロスホスト連携 / 単一ホスト上のマルチデーモン調整** — 1つのデーモンで複数の登録されたワークスペースランタイムをホストできますが、デーモン間の調整は行いません。インスタンスパストークンキーイングと期限切れトークンのクリーンアップは v0.16.x で対応予定。
- **一般的なデーモントークンストレージ** — Local Control は取り消し可能なデーモン所有のペアリングトークンを使用しますが、長期稼働のランタイムトークンストレージは引き続き BYO トークンです。永続的なトークンストアのインフラは v0.16.x で対応予定です。
- **Windows ネイティブサービス** (`nssm`、Service Control Manager ラッパー) — 当面は [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) を使用し、上記の systemd セクションに従ってください。

完全な延期機能リストについては、メインユーザーガイドの [v0.16-alpha 既知の制限](./qwen-serve.md#v016-alpha-known-limits) コールアウト、および v0.16-alpha ロールアウト追跡 Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) を参照してください。
