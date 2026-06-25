# `qwen serve` のローカル起動テンプレート（v0.16-alpha）

開発者のワークステーションで `qwen serve` を長期実行するバックグラウンドプロセスとして起動するための参照テンプレートです。[v0.16-alpha の既知の制限](./qwen-serve.md#v016-alpha-known-limits)と合わせてご参照ください — ローカル専用、シングルユーザー、BYO ベアラートークン。コンテナ化 / マルチホスト / TLS フロントエンドのデプロイは v0.16.x に持ち越しです。

> **対象読者**: 再起動後もデーモンを起動し続けたい、ログを永続的に保存したい、`restart-on-failure` の仕組みを整えたいドッグフーディング開発者向けです。単一のシェルセッション中だけデーモンを使いたい場合は、シンプルに `qwen serve`（フォアグラウンド、Ctrl-C で停止）で十分です。

## ベアラートークンの生成（初回のみ）

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # user-managed, NOT a built-in path
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

パス / ファイル名はご自身で決めてください。v0.16-alpha はトークンファイルの自動生成・自動検出を行いません（v0.16.x に持ち越し）。BYO セットアップの正規手順についてはユーザーガイドの [Authentication](./qwen-serve.md#authentication) セクションを参照してください。

> **この `export` は現在のシェルセッションにのみスコープを限定してください。** `~/.bashrc` / `~/.zshrc` には追加しないでください — プロファイルレベルの export は、そのシェルから起動されるすべてのプロセス（IDE のサブプロセス、ブラウザデバッガー、無関係プロジェクトの `npm` スクリプトなど）にベアラートークンを公開してしまいます。長期実行のセットアップには、以下の systemd `EnvironmentFile=` / launchd `EnvironmentVariables` の仕組みを使ってください — どちらもトークンをデーモンプロセスのみにスコープします。

デーモンは CLI の `--token <value>` または `QWEN_SERVER_TOKEN` 環境変数（どちらも前後の空白を除去）からベアラートークンを読み取ります。TypeScript SDK の `DaemonClient` コンストラクターは `token` オプションが渡されない場合に `QWEN_SERVER_TOKEN` にフォールバックします（PR 27 のフォールバック — 環境変数がセットされているクライアントはスクリプト内でその値を受け渡す必要がありません）。

シェルレベルで一度 `export` すれば、サーバーの起動と SDK クライアントの構築の両方をカバーできます（ただし前述のとおり、スコープをセッションに限定してください）。

## Linux: systemd ユーザーユニット

> **まず `qwen` バイナリのパスを確認してください。** ユニットファイルの `ExecStart=` には**絶対パス**が必要です — サービスマネージャーはシェルの `PATH` を読み取りません。`which qwen` を実行して確認してください。よくある場所: `/usr/local/bin/qwen`（Linuxbrew、手動インストール）、`~/.nvm/versions/node/vX.Y.Z/bin/qwen`（nvm）、`~/.fnm/aliases/default/bin/qwen`（fnm）、`~/.volta/bin/qwen`（Volta）。以下のテンプレートで `/PATH/TO/qwen` となっている箇所を実際のパスに置き換えてください。

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Qwen Code daemon (loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# Replace with your project; %h expands to $HOME under user units.
WorkingDirectory=%h/your-project
# Run `which qwen` to find the absolute path. systemd does NOT read $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Read the bearer token from a chmod 600 file rather than inlining it
# in the unit. `Environment=` would expose the token in the unit file
# (typically 644 = world-readable). EnvironmentFile keeps the token in
# the user-owned secret file you already created with `chmod 600`.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

env ファイルを一度作成します（セットアップ手順で作成したトークンファイルは生の値を持っています。これを systemd が env 変数として読み取れるよう `KEY=value` 形式にラップします）:

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

管理コマンド:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # keep the user manager running after logout / across reboot
journalctl --user -u qwen-serve -f               # tail logs
systemctl --user restart qwen-serve.service     # after token rotation
systemctl --user disable --now qwen-serve.service
```

`loginctl enable-linger` がない場合、ユーザーレベルの systemd インスタンスはユーザーがログアウトすると停止し、次のログイン時にのみ再起動します — ヘッドレスの開発サーバーでは SSH セッション終了後にデーモンが停止してしまいます。`enable-linger` が「再起動後も維持」を実現する鍵です。

**システム全体の代替案**（共有開発ホスト、あまり一般的でない）: `User=%i` を付けて `/etc/systemd/system/qwen-serve@.service` にユニットを配置し、`sudo systemctl enable --now qwen-serve@<username>.service` で管理します。`[Service]` の本体は同じですが — このレベルではワールドリーダブルな `Environment=` の露出がより問題になるため、ユーザーの `chmod 600` ファイルを指す `EnvironmentFile=` を必ず使用してください。シングルユーザーのワークステーションにはユーザーレベル + linger を選んでください。

## macOS: launchd ユーザーエージェント

> **まず `qwen` バイナリのパスを確認してください。** systemd と同じ制約 — `ProgramArguments` には**絶対パス**が必要です。`which qwen` を実行して確認してください。macOS での一般的な場所: `/opt/homebrew/bin/qwen`（Apple Silicon の Homebrew）、`/usr/local/bin/qwen`（Intel の Homebrew、手動インストール）、`~/.nvm/versions/node/vX.Y.Z/bin/qwen`（nvm）、`~/.volta/bin/qwen`（Volta）。テンプレートの `/PATH/TO/qwen` を実際のパスに置き換えてください。

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
    <!-- Run `which qwen` to find the absolute path; launchd does NOT read $PATH. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd does NOT expand `~` or `$HOME` — use absolute paths. -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- DO NOT COMMIT this file with a real token. Also chmod 600 the
         plist itself so the inlined token is not world-readable. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>PASTE-YOUR-TOKEN-HERE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Restart only on non-zero exits (matches systemd Restart=on-failure).
       A bare `<true/>` would respawn even after a clean SIGTERM, making
       `kill <pid>` impossible to use as a stop signal — operator would
       have to `launchctl unload`. SuccessfulExit=false fixes that. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Throttle restart storms on persistent failures (mirrors systemd
       RestartSec=5; launchd's default would respawn every <1s). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Log into the user's Library, not /tmp. /tmp is world-writable
       (symlink-attack risk on shared workstations) and gets cleaned by
       periodic-daily after 3 days; `~/Library/Logs/qwen-serve/` is
       user-scoped and survives. launchd truncates these on every
       `load`, so the unload→load token-rotation cycle wipes prior
       diagnostic logs — back them up if you need post-incident
       inspection. -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

管理コマンド:

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # first time only
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist holds the inline token
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # to stop
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

plist を編集した後（例えばトークンのローテーション）は `unload` してから再度 `load` する必要があります — `launchctl` は `systemd daemon-reload` のように plist の変更を自動で再読み込みしません。注意: `load` のたびにログファイルが切り詰められるため、ローテーション前にインシデントを調査している場合はファイルを保存しておいてください。

## tmux セッション（インタラクティブな監視）

`QWEN_SERVER_TOKEN` がシェルで既に export されていることを前提とします（上記のセットアップセクションを参照）:

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # see live logs; Ctrl-b d to detach
tmux kill-session -t qwen-serve
```

`tmux new -d` は親シェルの環境を引き継ぐため、`QWEN_SERVER_TOKEN` は自動的に渡されます。デーモンの stdout（認証警告、MCP ディスカバリの進捗、スロークライアント警告など）を時々確認したいが、サービスユニットにはコミットしたくない場合に最適です。ターミナルを閉じても継続しますが、ホストの再起動では停止します。

## nohup ワンライナー（手早く・ラフに）

`QWEN_SERVER_TOKEN` がシェルで既に export されていることを前提とします:

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # daemon PID; capture if you want to `kill` cleanly later
```

`bash -c '...'` でラップすることで、コマンドを実行した場所ではなく `~/your-project` にデーモンがバインドされます。この `cd` がない場合、`qwen serve` はデフォルトで `process.cwd()` を使用し、プロジェクトのワークスペースを期待するクライアントからの `POST /session` が `400 workspace_mismatch` を返します — 気づきにくい落とし穴です。

「API をちょっと試している間だけバックグラウンドで動かしたい」といったワンオフのワークフローには使えます。**単一セッションを超える用途には推奨しません** — クラッシュ時の自動再起動なし、ログファイルが無制限に肥大化、PID を忘れた場合にデーモンを見つける手段がありません。インタラクティブな監視には tmux を、再起動後も維持したい場合は systemd / launchd を使用してください。

## デーモンの起動確認

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # daemon's feature set
```

認証が設定されている場合（デーモンが `--token` / `QWEN_SERVER_TOKEN` 付きで起動された、または `--require-auth=true` が指定されている場合）、ループバックバインドの `/health` 以外すべてのルートで `Authorization: Bearer <token>` が必要です。ループバックデフォルト（`qwen serve` のゼロコンフィグパス）でトークンなしでデーモンを起動した場合、どちらのリクエストもヘッダーは不要です。上記のテンプレートはすべてトークンを設定するため、実際には `Authorization` ヘッダーが必要です。`/capabilities` が `401` を返す場合、ユニット / plist のトークンが `curl` で使用している env export のトークンと一致していません。

## トークンのローテーション

1. 新しいトークンを生成し、ユニットが参照する env ファイルを更新します:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   （launchd / nohup / tmux テンプレートの場合: plist の `<string>` 値を編集するか、`QWEN_SERVER_TOKEN` を再度 `export` してください。plist を再生成した場合は `chmod 600` を忘れずに。）
2. デーモンを再起動します:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>` してから新しいトークンを env にセットして再実行
3. クライアント SDK / スクリプトを更新します。TypeScript SDK の `DaemonClient` は `QWEN_SERVER_TOKEN` を自動で読み取ります（PR 27 のフォールバック）— クライアントシェルで新しい値を再 `export` し、クライアントを再構築してください。

## 再起動とクラッシュ時の動作

サービスマネージャーの再起動セマンティクスはテンプレートによって異なります:

- **systemd `Restart=on-failure`** — 非ゼロ終了 / シグナルの場合のみ再起動。クリーンな SIGTERM（`systemctl stop`）では再起動ループが**起きません**。
- **launchd の `KeepAlive` with `SuccessfulExit=false`**（上記テンプレート）— systemd の動作に合わせています。素の `<true/>` ではクリーンな終了後も再起動されてしまいます。`ThrottleInterval=10` は systemd の `RestartSec=5` に倣い、継続的な障害時の再起動ストームをレート制限します。
- **tmux / nohup** — 自動再起動なし。デーモンがクラッシュすると再実行するまで死んだ PID が残ります。

**単一のデーモンプロセスのライフタイム内**では、クライアントの切断は SSE `Last-Event-ID` リジュームによって回復します（ユーザーガイドの [Durability model](./qwen-serve.md#durability-model) セクションを参照）— リプレイリングはインメモリです。

デーモンを**再起動**するとすべてのインメモリセッションが破棄され、クライアントは再接続して最初からやり直します。セッション内容（プロンプト、ツールコール、会話履歴）の再起動をまたいだ永続化は **v0.16-alpha では対応していません**。

## スコープ外（v0.16.x 以降に持ち越し）

- **コンテナ化デプロイ** — Dockerfile、docker-compose、Kubernetes マニフェスト、nginx + TLS リバースプロキシ、マルチインスタンストークン分離。エンタープライズパイロットが確定してから v0.16.x で対応予定。検証なしでドキュメントが陳腐化するのを避けるためです。
- **クロスホストフェデレーション / 1ホスト上のマルチデーモン協調** — `1 daemon = 1 workspace × N sessions` が強制されます。インスタンスパスのトークンキーイングと古いトークンのクリーンアップは v0.16.x に持ち越し。
- **デーモントークンの自動生成** — alpha は BYO トークンです。自動生成 + トークンストアのインフラは v0.16.x に持ち越し。
- **Windows ネイティブサービス**（`nssm`、Service Control Manager ラッパー）— 現時点では [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) を使用し、上記の systemd セクションに従ってください。

延期された機能の全リストについてはメインユーザーガイドの [v0.16-alpha known limits](./qwen-serve.md#v016-alpha-known-limits) コールアウトを、v0.16-alpha のロールアウト追跡イシューについては [#4175](https://github.com/QwenLM/qwen-code/issues/4175) を参照してください。
