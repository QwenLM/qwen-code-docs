# デーモンマルチワークスペースのセッション rewind と shell

## Status

最終的な実装設計。このドキュメントは、ライブセッションの rewind
スナップショット、rewind、shell に関する Phase 2a のプライマリ専用という
記述を置き換える。

## Problem

デーモンは単数形のセッション API を公開する一方、マルチワークスペースの
デーモンはワークスペースランタイムごとに 1 つのブリッジを所有する。
ほとんどのライブセッションルートはすでにセッションの所有者を解決するが、
rewind スナップショット、rewind、shell は依然としてプライマリーブブリッジに
バインドされているか、セカンダリの所有者を拒否していた。そのため、
有効なライブのセカンダリセッションは、クライアントからは
未サポートのルートと区別がつかなくなっていた。

## Decision

単数形の REST API を維持し、すべてのリクエストで所有するライブランタイムを
解決する：

- `GET /session/:id/rewind/snapshots` は所有者を認識した読み取りルーティングを
  使用する。
- `POST /session/:id/rewind` と `POST /session/:id/shell` は所有者を認識した
  変更ルーティングと、共有のセッションアーカイブコーディネーターを使用する。
- SDK の rewind 呼び出しは、クライアントが ACP トランスポートで
  設定されている場合でも、常に直接 REST を選択する。これにより
  厳格な REST 変更ゲートが維持される。
- SDK の shell は設定されたトランスポートを維持する。デフォルトの
  REST トランスポートには所有者ルーティングが追加される。
  ワークスペース修飾の ACP クライアントは `_qwen/session/shell` を維持する。
- ワークスペース修飾のセッション REST API、ACP の rewind メソッド、
  コアの変更、ACP 子プロセスの変更、FileHistory の移行は導入されない。

## Ownership and authorization

ワークスペースレジストリは、セッション id についてすべてのライブブリッジ
サマリーを検索する。信頼された所有者がちょうど 1 つの場合、
そのランタイムにディスパッチする。所有者なしは
`404 session_not_found` を返す。信頼されていない所有者は
`403 untrusted_workspace` を返す。所有者が複数の場合は
`500 ambiguous_session_owner` を返す。3 つの結果すべてが、
ターゲットのブリッジ操作が実行される前に発生する。
永続化されたセッションは、まずランタイムに load または
resume されなければならない。

rewind と shell は `mutate({ strict: true })` を維持する。shell は
さらに、実効の shell 有効化、有効なセッションにバインドされた
クライアント id、空でないコマンドを要求する。rewind は任意の
クライアント id を転送し、`rewindFiles` は省略時またはブール値の
場合のみ受け付ける。省略は `true` を意味する。その他の JSON 型は
`400 invalid_rewind_files_flag` を返す。

## Behavior boundaries

shell は所有するセッションのワークスペース cwd で開始され、
ファイルシステムパスのサンドボックスではない。rewind は `edit` と
`write_file` に対して記録されたスナップショットのみを復元する。
shell、Git、スクリプト、手動の変更は取り消さない。ファイルの復元は
ベストエフォートである：レスポンスが `filesFailed[]` とともに
`rewound: false` を報告する時点で、会話はすでに rewind されている
可能性がある。アクティブなプロンプトは `409 session_busy` と
`Retry-After: 5` を維持する。無効なターゲットは
`400 invalid_rewind_target` を維持する。Web Shell は引き続き
`rewindFiles: false` を要求する。

既存の `~/.qwen/file-history/<sessionId>` レイアウトは変更されない。
したがって、ライブの UUID 衝突は、プライマリランタイムを選択するのではなく、
所有者のあいまいさを通じて fail closed（失敗時は拒否）する。

## Capabilities

`multi_workspace_session_rewind` は、複数のランタイムが存在する間のみ
広告される。`multi_workspace_session_shell` は、加えて実効のセッション
shell 有効化を要求する。これは、有効化フラグと設定されたトークンの
両方を意味する。

クライアントのプリフライトは追加的である：

- プライマリの rewind：`session_rewind`。
- セカンダリの rewind：`session_rewind` と
  `multi_workspace_session_rewind`。
- プライマリの shell：`session_shell_command`。
- セカンダリの shell：`session_shell_command` と
  `multi_workspace_session_shell`。

ACP ネイティブクライアントは initialize の `_qwen.methods` を使用する。
デーモンは ACP の rewind ベンダーメソッドを広告しない。

## Verification

ユニットカバレッジは、所有者のディスパッチ、所有しないブリッジへの
呼び出しゼロ、信頼とあいまいさの失敗、厳格な検証順序、
`rewindFiles` のセマンティクス、SDK の REST フォールバック、
変更されない shell トランスポート、条件付きのケイパビリティ広告、
ACP の rewind マッピングの不在を固定する。ACP ワークスペーステストは、
A の接続が B のセッションを操作できない一方、ワークスペース修飾の
B の shell は成功するという不変条件を維持する。

E2E シナリオは、ワークスペース B でセッションと追跡された編集を作成し、
スナップショットと shell の cwd が B スコープであることを検証し、
両方の rewind ファイルモードを確認し、shell で作成されたファイルが
rewind 後も残ることを証明し、busy、部分復元、信頼されていない
セカンダリの結果を記録する。
