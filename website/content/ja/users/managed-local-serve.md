# Managed セッションをローカルで実行する


Managed local は永続的な組み込み H2 データベースを使用します。ローカルに Java 21 がインストールされていれば、
最初の Managed 起動時に一致する Java サーバー JAR が自動的にダウンロードされます。
Qwen を実行している Node 実行ファイル、
その Hosted Harness、ネイティブワーカーエントリー、および本番 WebShell を再利用します。ユーザーは
MySQL、Docker、Maven、systemd をインストールする必要はありません。オプションの事前インストール済みバンドルランタイムには
Java が含まれます。デフォルトのダウンロード版および軽量版にはローカルの Java 21 が必要です。

このモードは実験的です。実装は arm64 および x64 のネイティブ macOS と Linux を
サポートしています。プラットフォーム受け入れ結果は別途記録されます。パッケージングターゲットを提供しても、
そのプラットフォームが E2E 検証に合格したことを意味するものではありません。
Managed ランタイムアーカイブは以下で明示的に説明される方法でビルドされます。通常の CLI
パッケージには Java ペイロードが含まれていません。オプションの完全な Managed
スタンドアロンアーカイブはすべてのコンポーネントをバンドルします。

## 開始と停止

Managed local サポートを含む Qwen バージョンを使用してください。古いリリースでは
CLI のアップグレードが必要です。ランタイムのインストールだけではランチャーを追加できません。Java 21 をインストールし、
`JAVA_HOME` をそのホームに設定するか、その実行ファイルを PATH に追加してから、以下を実行します。

```sh
qwen serve --managed --open
```

アプリケーションデータを作成またはサービスを開始する前に、Qwen は Java 21 をチェックし、
`qwen-managed-agent-server-<cli-version>.jar` とそのチェックサムを
公式 Aliyun OSS リリースミラーからダウンロードします。GitHub Release もフォールバックとして使用されます。
チェックサムを検証し、`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/` に
完全なランタイムをアトミックにインストールします。その後の起動では
ネットワークアクセスなしでそのキャッシュを再利用します。通常の Qwen コマンドはそれをダウンロードしません。
サービス JAR のみがダウンロードされます。Qwen は Java をインストールせず、Maven も実行しません。
一致するリリースが利用できない場合、またはダウンロードが失敗した場合、アプリケーションデータ
またはサービスの子プロセスは作成されません。後で再試行するか、一致するランタイムを事前にインストールしてください。

オフライン使用またはバンドル Java の場合、配布ビルダーから一致する
`qwen-code-managed-runtime-<platform>-<arch>.tar.gz` とその `.sha256` ファイルを
取得してください。開始前に検証して展開します。

```sh
shasum -a 256 -c qwen-code-managed-runtime-darwin-arm64.tar.gz.sha256
mkdir -p "${QWEN_HOME:-$HOME/.qwen}"
tar -xzf qwen-code-managed-runtime-darwin-arm64.tar.gz -C "${QWEN_HOME:-$HOME/.qwen}"
qwen serve --managed --open
```

アーカイブは `<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/` に
インストールされます。Qwen はその正確なバージョンとプラットフォームのディレクトリを自動的に検出します。
ランタイムには別の Node、CLI、Harness、ワーカー、WebShell のインストールは
含まれていません。

より小さいオフラインペイロードには、`qwen-code-managed-runtime-lite-<platform>-<arch>.tar.gz` を
選択し、同じ方法で検証・展開してください。これにはサーバー JAR と
マニフェストのみが含まれています。新しいバージョン/ターゲットディレクトリに 1 つのエディションをインストールし、
軽量版とバンドル版のアーカイブをオーバーレイしないでください。軽量ランチャーは
JAVA_HOME が空でない場合は `JAVA_HOME/bin/java` を使用し、そうでない場合は PATH 上の最初の
実行可能な `java` を使用します。Java 21  specifically 必要とし、アプリケーション状態を作成する前に
実行ファイルをチェックします。PATH に別の動作する Java が含まれていても、不正な JAVA_HOME はエラーになります。例：

```sh
JAVA_HOME=/absolute/java-21-home qwen serve --managed --open
```

macOS では、JAVA_HOME は通常 `Contents/Home` で終わります。Java が見つからないか互換性がない場合、
JAR をダウンロードする前にインストール/設定エラーが発生します。Qwen は Java をダウンロードしません。
バンドル版は常に独自の Java を使用し、ペイロードが破損している場合でも
マシンの Java にフォールバックしません。

オプションの完全な `qwen-code-managed-local-<platform>-<arch>.tar.gz` も
機能します。展開して `./qwen-code/bin/qwen serve --managed --open` を実行してください。

アプリケーションは `127.0.0.1:4170` にバインドします。利用可能なポートには `--port 0` を使用するか、
固定ポートを選択してください。ターミナルを開いたままにします。Ctrl+C で通常の
デーモン、Java サービス、Harness がシャットダウンします。systemd はオペレーター管理の
デプロイメントではオプションであり、このコマンドでは使用されません。
占有されたパブリックポートは通常のデーモンの制限付き近傍ポート
再試行に従います。ランチャーによって表示されるブラウザアドレスを使用してください。

この 1 つのコマンドで通常のデーモンと Managed Agent の両方が開始されます。同じ
WebShell は Projects の下に通常のワークスペースとセッション、および Managed ワークスペースとセッションを一緒に表示し、
Managed ワークスペースには Managed ラベルが付き、実行モードタブはありません。新しいタスクは選択された
ワークスペースまたは会話に従います。ローカルセッションは
コマンドを実行したディレクトリを使用し、Managed セッションはアプリケーションで作成された
ワークスペースまたは明示的にインポートされたローカルプロジェクトを使用します。両方とも
同じ認証済みブラウザオリジンを使用します。
2 つ目のデーモンコマンドやブラウザページは必要ありません。

**Add workspace** で、**Local (daemon)** または **Managed (Managed Agent)** を
送信前に選択してください。選択はデフォルトで現在の会話のサービスになります。
ワークスペース行と **New task** にはそのサービスが表示され、新しいタスクは
選択されたワークスペースを継承します。デーモンの既存の SSH ワークスペースサポートは
引き続き利用可能です。Managed SSH 登録はこの共有ダイアログには統合されていません。

ターミナルはトークンフラグメントを含むブラウザ URL を表示します。これをローカル
パスワードとして扱ってください。ブラウザはトークンを使用してすべての API リクエストを認証します。Java
署名鍵と内部クレデンシャルはブラウザに渡されません。リスナーは
ループバックのみです。ヘッドレスマシンでは、`--open` を省略し、表示された URL を
そのマシンで開くか、自分で管理する認証済みトンネルを使用してください。

統合アプリケーションは現在ローカルループバックページをサポートしています。フル
シェルの既存の Mobile access / Local Control エントリーは Managed 起動と統合されていません。ペアリングされた
LAN リスナーはこの統合ページを開くことはできません。モバイル
共有には別の統合が必要です。通常のデーモンは既存の
Local Control 動作を維持します。

Harness は通常の Qwen モデル設定とプロバイダークレデンシャルを使用します。
最初のプロンプトを送信する前に、通常の Qwen CLI 設定を使用してモデルを設定してください。
Files と Shell は `default` 承認モードを使用します。Managed UI は
承認を必要とするアクションの前に承認を求めます。

再起動後、既存のセッションの継続はその前の SQL
ライターリースの有効期限が切れるまで待機する場合があります（デフォルトでは 60 秒）。元のデータディレクトリを保持し、
その間隔後に再試行してください。プロセスを再起動しても所有権はクリアされません。

## ワークスペースと永続データ

デフォルトのプライベートデータディレクトリは `<Qwen home>/managed-local` で、通常は
`~/.qwen/managed-local` です。以下でオーバーライドできます。

```sh
qwen serve --managed --managed-data-dir /absolute/private/data --open
```

ディレクトリはすべての Git ワークツリーの外部にある必要があります。1 つのランチャーが一度に
それを使用できます。Java も排他的なデータベースファイルロックを保持します。プライベートサービスポートと
クレデンシャルは再起動を通じて安定しています。別のアプリケーションによって占有されたプライベートポートは
起動の失敗を引き起こします。競合するサービスを停止するか、異なる新しいデータ
ディレクトリを選択してください。永続化されたファクトを編集しないでください。

起動時に既存の冪等 Workspace API を介してアプリケーション所有のデフォルトワークスペースとその
OWNER 権限が作成されます。既存のローカルプロジェクトを使用するには、
**Workspace → Choose existing directory** を開き、その絶対
パスを参照または入力してから、フォルダを追加します。サービスはその親を登録し、OWNER
アクセスを自動的に付与し、既存のファイルをそのまま保持します。新しいタスクは
選択されたプロジェクトで開始されます。空のワークスペースを作成することもできます。

起動ディレクトリはローカルセッションで引き続き利用可能であり、自動的に
インポートされません。`--workspace` は Managed local モードではサポートされていません。UI で
プロジェクトを選択してください。`.qwen-managed-storage.json` メンテナンスマーカーは
Git ワークツリーの外部に保持されます。編集、削除、スタッシュ、コミットしないでください。インポートされた
プロジェクトファイルはプライベート Managed データディレクトリの外部に残り、独自の
バックアップが必要です。

ローカルセッション履歴は通常の Qwen ストレージを引き続き使用します。これは Managed データディレクトリとは
別であり、Managed のみのバックアップには含まれません。

`state.json`、`database/`、`runtime/`、`worker-home/`、`workspaces/` を含めて、
完全なデータディレクトリを一緒に保持してください。アクティブな作業を完了またはキャンセルし、
セッションを閉じてから、ファイルシステムバックアップを作成する前にアプリケーションを停止してください。
永続的な元のワーカーはコントロールプレーンの終了よりも長く存続する場合があります。すべてのワークスペース
ライターが停止したことを確認してください。不明な実行には、オフラインバックアップの前に
既存の元の所有者回復手順が必要です。
クレデンシャル、データベース、ワーカー履歴、ワークスペース ID は同じ
インストールに属します。サブセットのみを復元すると
回復受け入れが制限される可能性があります。起動時に欠落したマーカーの再作成や
破損したクレデンシャルの置換は行われません。サービス診断は `logs/` にあります。

macOS はネイティブワーカーと同じブート後の永続的な採用をサポートしています。ホスト全体の
信頼された再起動回復はローカルランチャーでは無効のままです。不明なツールの結果は
既存の元の所有者回復ルールを保持し、盲目にリプレイされることはありません。
このモードは自動ログイン時起動やラップトップのスリープ防止を追加しません。

## 配布のビルド

これらのコマンドはリリースビルダー用であり、エンドユーザー用ではありません。Node 22+、Java 21、Maven 3.8.9+ を使用して、
同じチェックアウトから CLI と Java
サーバーをビルドします。

```sh
corepack pnpm install --frozen-lockfile
npm run build
npm run typecheck
npm run bundle
npm run prepare:package
mvn -f packages/sdk-java/qwencode/pom.xml -DskipTests -Dgpg.skip=true install
mvn -f packages/managed-agent-server/pom.xml verify
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --jre-home /verified/java-21-home \
  --out-dir /output/managed-runtime
```

ランタイムビルダーにはこのチェックアウトからの一致するサーバー JAR、Java ランタイム、CLI
バージョンのみが必要です。ビルド済みの CLI アセットや Node
アーカイブは必要ありません。デフォルトでは
CLI の `dist/` アセット外の `packages/managed-agent-server/target/managed-runtime` に
書き込みます。ランタイムアーカイブとアーカイブごとの `.sha256` ファイルを出力します。
通常の CLI は個別にビルド/リリースされます。

`--jre-home` の代わりに `--without-jre` を使用して、同じサーバー JAR で
軽量ランタイムをビルドします。

```sh
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --without-jre \
  --out-dir /output/managed-runtime
```

これにより `qwen-code-managed-runtime-lite-darwin-arm64.tar.gz` とそのチェックサムが出力されます。
軽量ビルダーには Java 入力は必要ありません。オプションの完全な配布の場合：

```sh
npm run package:standalone -- \
  --target darwin-arm64 \
  --node-archive /verified/node-v22-darwin-arm64.tar.gz \
  --managed-server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --managed-jre-home /verified/java-21-home \
  --out-dir /output/managed-local
```

`bin/java`、`lib/modules`、`release`、`legal/` を含む完全な展開されたランタイムホームを
使用してください。macOS JRE はこれを `Contents/Home` に配置する場合があります。
ビルダーは Java メジャーバージョン、OS、アーキテクチャをチェックし、その
ライセンスを含め、サーバー SHA-256 と一致する CLI バージョンを
ペイロードマニフェストに記録します。完全なスタンドアロンは `lib/managed-runtime/` を使用し、
`SHA256SUMS` を出力します。ビルド前にランタイム入力の発行元チェックサムを検証してください。
Windows と Bun の Managed 実行は拒否されます。ランチャーには Node 22+ が必要です。

明示的なランタイムロケーションの場合、
`QWEN_MANAGED_LOCAL_RUNTIME_DIR=/absolute/managed-runtime` はローカル
CLI を `manifest.json` と `server.jar`（バンドル版の場合は
`jre/` も）を含むディレクトリに直接指定します。
これは同じ場所に配置されたペイロードおよびバージョン付き Qwen-home インストールよりも優先されます。
既存の同じ場所に配置されたペイロードは Qwen-home インストールよりも優先されます。
選択された無効または不完全なペイロードが別のものに置き換えられることはありません。
明示的に選択されたペイロードが見つからない場合、CLI バージョンが間違っている場合、ターゲット、
Java メジャーバージョン、またはサーバーチェックサムが間違っている場合、子が開始する前に失敗します。デフォルト
キャッシュが見つからない場合のみ JAR インストールがトリガーされます。既存の破損したペイロードは置き換えられません。
Maven はアプリケーション起動時に決して実行されません。

## 初回使用 JAR の公開

`Release Managed server runtime` ワークフローはすでに公開された
CLI リリースタグからビルドし、その正確なソースリビジョンから SDK とサーバーを使用します。
手動実行は `main` からディスパッチする必要があり、デフォルトではドライランです。CLI と Java モジュールを
検証し、`central-release` プロファイルをビルドし、JAR とチェックサムを
パブリックリポジトリを変更せずにワークフローアーティファクトとして保持します。

ドライランを検証した後、リリースオペレーターは保護された `production-release` 環境を介して
`dry_run=false` で同じタグを実行できます。
ワークフローはサーバーアーティファクトバージョンを CLI バージョンに設定し、
`com.alibaba:qwen-managed-agent-server:<cli-version>` をソース、Javadoc、署名付きで
Maven Central に公開し、同じプライマリ JAR とその
`.sha256` をその GitHub Release および既存のバージョン付き OSS ミラーを通じて配布します。
補助オペレーター JAR は Central 公開には添付されません。既存
アセットはバイト単位で比較され、異なるコンテンツで置き換えられることはありません。
公開された CLI リリースイベントもこのワークフローを自動的に実行します。

CLI は Maven Central ではなく OSS/GitHub からダウンロードします。
SDK を別のユーザー依存関係として解決しません。実行可能なサーバー JAR にはその Java
依存関係が含まれています。ランタイムアセットは初回使用ダウンロードが成功する前に、
正確な CLI リクエストに対して存在する必要があります。この PR のローカル検証はそれらの
アセットを公開せず、本番リリース環境をバイパスしません。

所有権境界と検証基準については、バイリンガルの[設計](../design/2026-10-20-managed-local-serve.md)を
参照してください。オペレーター向けの MySQL デプロイメントについては
[Java サーバーリファレンス](../../packages/managed-agent-server/README.md)を参照してください。
