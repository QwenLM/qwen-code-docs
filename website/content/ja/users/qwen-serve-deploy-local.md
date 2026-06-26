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

## Linux: systemd ユーザーユニット

> **最初に `qwen` バイナリの場所を確認してください。** ユニットファイルの `ExecStart=` は**絶対パス**である必要があります — サービス管理はシェルの `PATH` を読み取りません。`which qwen` を実行して確認してください。一般的な場所: `/usr/local/bin/qwen` (Linuxbrew、手動インストール)、`~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm)、`~/.fnm/aliases/default/bin/qwen` (fnm)、`~/.volta/bin/qwen` (Volta)。以下のテンプレートで `/PATH/TO/qwen` と表示されている箇所を実際のパスに置き換えてください。

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Qwen Code デーモン (ループバック HTTP + SSE)
After=network.target

[Service]
Type=simple
# プロジェクトに合わせて置き換え; %h はユーザーユニット下で $HOME に展開されます。
WorkingDirectory=%h/your-project
# `which qwen` を実行して絶対パスを確認してください。systemd は $PATH を読み取りません。
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
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

**システム全体の代替** (共有開発ホスト、あまり一般的ではありません): ユニットを `/etc/systemd/system/qwen-serve@.service` に置き、`User=%i` を設定し、`sudo systemctl enable --now qwen-serve@<ユーザー名>.service` で管理します。それ以外の `[Service]` の本体は同じですが、このレベルでは全ユーザー可読の `Environment=` による露出がさらに問題となるため、常にユーザーの `chmod 600` ファイルを指す `EnvironmentFile=` を使用してください。シングルユーザーワークステーションではユーザーレベル + linger を選択してください。

## macOS: launchd ユーザーエージェント

> **最初に `qwen` バイナリの場所を確認してください。** systemd と同様、`ProgramArguments` は**絶対パス**である必要があります。`which qwen` を実行して確認してください。macOS 上の一般的な場所: `/opt/homebrew/bin/qwen` (Apple Silicon の Homebrew)、`/usr/local/bin/qwen` (Intel の Homebrew、手動インストール)、`~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm)、`~/.volta/bin/qwen` (Volta)。以下のテンプレートで `/PATH/TO/qwen` と表示されている箇所を置き換えてください。

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
  </array>
  <!-- launchd は `~` や `$HOME` を展開しません — 絶対パスを使用してください。 -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
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

## tmux セッション (インタラクティブな監督)

`QWEN_SERVER_TOKEN` がシェルに既にエクスポートされていることを前提とします (上記のセットアップセクションを参照):

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # ライブログを表示; Ctrl-b d でデタッチ
tmux kill-session -t qwen-serve
```

`tmux new -d` は親シェルの環境を継承するため、`QWEN_SERVER_TOKEN` が自動的に引き継がれます。サービスユニットにコミットせずに、デーモンの標準出力 (認証警告、MCP 発見の進捗、低速クライアント警告) を時々確認したい場合に最適です。ターミナルを閉じても持続しますが、ホストの再起動には耐えられません。

## nohup ワンライナー (簡易的)

`QWEN_SERVER_TOKEN` がシェルに既にエクスポートされていることを前提とします:

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # デーモンの PID; 後でクリーンに kill したい場合は控えておきます
```

`bash -c '...'` でラップすることで、デーモンがコマンドを実行した場所ではなく `~/your-project` にバインドするようになります。この `cd` がない場合、`qwen serve` は `process.cwd()` をデフォルトとし、クライアントがプロジェクトのワークスペースを期待して `POST /session` を送信すると `400 workspace_mismatch` が返ります — 静かな落とし穴です。

「バックグラウンドで実行して API を叩きたい」という一回限りのワークフローには問題ありません。**単一セッションを超える用途には推奨しません** — クラッシュ時の再起動なし、ログファイルは無制限に増加、PID を覚えていない場合にデーモンを見つけるクリーンな方法がありません。インタラクティブな監督には tmux を、再起動を超えて持続させたいものには systemd / launchd を推奨します。

## デーモンが起動していることの確認

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # デーモンの機能セット
```

認証が設定されている場合 (つまりデーモンが `--token` / `QWEN_SERVER_TOKEN` を設定して起動されているか、`--require-auth=true` が指定されている場合)、ループバック上の `/health` を除くすべてのルートで `Authorization: Bearer <token>` が必要です。デーモンをトークンなしでループバックデフォルトで起動した場合 (`qwen serve` のゼロコンフィグパス)、どちらの呼び出しもヘッダーは不要です。上記のテンプレートはすべてトークンを設定しているため、実際には `Authorization` ヘッダーが必要です。`/capabilities` が `401` を返す場合、ユニット / plist のトークンが、`curl` が使用している環境変数エクスポートのトークンと一致していません。

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
- **クロスホスト連携 / 単一ホスト上のマルチデーモン調整** — `1 デーモン = 1 ワークスペース × N セッション` が強制されます。インスタンスパストークンキーイングと期限切れトークンのクリーンアップは v0.16.x で対応予定。
- **自動生成デーモントークン** — アルファ版は BYO トークン。自動生成 + トークンストアのインフラは v0.16.x で対応予定。
- **Windows ネイティブサービス** (`nssm`、Service Control Manager ラッパー) — 当面は [WSL2](https://learn.microsoft.com/ja-jp/windows/wsl/) を使用し、上記の systemd セクションに従ってください。

完全な延期機能リストについては、メインユーザーガイドの [v0.16-alpha 既知の制限](./qwen-serve.md#v016-alpha-known-limits) コールアウト、および v0.16-alpha ロールアウト追跡 Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) を参照してください。