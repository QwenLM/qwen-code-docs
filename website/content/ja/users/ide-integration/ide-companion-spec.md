# Qwen Code Companion Plugin: インターフェース仕様

> 最終更新日: 2025年9月15日

このドキュメントでは、Qwen Code の IDE モードを有効にするためのコンパニオンプラグインを構築するための契約（仕様）を定義します。VS Code では、これらの機能（ネイティブな差分表示、コンテキスト認識）は公式拡張機能（[marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)）によって提供されます。本仕様は、JetBrains IDE や Sublime Text などの他のエディタにも同様の機能を提供したいコントリビューター向けに作成されています。

## I. 通信インターフェース

Qwen Code と IDE プラグインは、ローカル通信チャネルを介して通信します。

### 1. トランスポート層: MCP over HTTP

プラグインは、**Model Context Protocol (MCP)** を実装したローカル HTTP サーバーを実行する**必要があります**。

- **プロトコル:** サーバーは有効な MCP サーバーである必要があります。可能であれば、使用言語向けの既存の MCP SDK を利用することを推奨します。
- **エンドポイント:** サーバーは、すべての MCP 通信に対して単一のエンドポイント（例: `/mcp`）を公開する必要があります。
- **ポート:** サーバーは動的に割り当てられたポート（つまりポート `0`）でリッスンする**必要があります**。

### 2. 検出メカニズム: ロックファイル

Qwen Code が接続するには、サーバーが使用しているポートを検出する必要があります。プラグインは「ロックファイル」を作成し、ポートの環境変数を設定することで、この検出を支援する**必要があります**。

- **CLI によるファイルの検出方法:** CLI は `QWEN_CODE_IDE_SERVER_PORT` からポートを読み取り、その後 `~/.qwen/ide/<PORT>.lock` を読み取ります。（古い拡張機能向けのレガシーなフォールバックが存在します。以下の注記を参照してください。）
- **ファイルの場所:** ファイルは特定のディレクトリ `~/.qwen/ide/` に作成する必要があります。ディレクトリが存在しない場合、プラグインが作成する必要があります。
- **ファイル名の規則:** ファイル名は重要であり、以下のパターンに**従う必要があります**：
  `<PORT>.lock`
  - `<PORT>`: MCP サーバーがリッスンしているポート。
- **ファイルの内容とワークスペースの検証:** ファイルには、以下の構造を持つ JSON オブジェクトを**含める必要があります**：

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (数値, 必須): MCP サーバーのポート。
  - `workspacePath` (文字列, 必須): 開いているすべてのワークスペースのルートパスのリスト。OS 固有のパス区切り文字（Linux/macOS は `:`、Windows は `;`）で区切ります。CLI はこのパスを使用して、IDE で開いているプロジェクトフォルダーと同じ場所で実行されていることを確認します。CLI のカレントワーキングディレクトリが `workspacePath` のサブディレクトリでない場合、接続は拒否されます。プラグインは、開いているワークスペースのルートへの正しい絶対パスを**提供する必要があります**。
  - `authToken` (文字列, 必須): 接続を保護するためのシークレットトークン。CLI はすべてのリクエストでこのトークンを `Authorization: Bearer <token>` ヘッダーに含めます。
  - `ppid` (数値, 必須): IDE プロセスの親プロセス ID。
  - `ideName` (文字列, 必須): IDE のユーザーフレンドリーな名前（例: `VS Code`、`JetBrains IDE`）。

- **認証:** 接続を保護するため、プラグインは固有のシークレットトークンを生成し、検出ファイルに**含める必要があります**。CLI はその後、MCP サーバーへのすべてのリクエストの `Authorization` ヘッダーにこのトークンを含めます（例: `Authorization: Bearer a-very-secret-token`）。サーバーはすべてのリクエストでこのトークンを検証し、認証されていないリクエストを拒否する**必要があります**。
- **環境変数（必須）:** CLI が正しい `<PORT>.lock` ファイルを検出できるよう、プラグインは統合ターミナルで `QWEN_CODE_IDE_SERVER_PORT` を**設定する必要があります**。

**レガシーに関する注記:** v0.5.1 より古い拡張機能の場合、Qwen Code はシステム一時ディレクトリ内の `qwen-code-ide-server-<PID>.json` または `qwen-code-ide-server-<PORT>.json` という名前の JSON ファイルの読み取りにフォールバックする場合があります。新しい統合では、これらのレガシーファイルに依存しないでください。

## II. コンテキストインターフェース

コンテキスト認識を有効にするため、プラグインは IDE 内のユーザーのアクティビティに関するリアルタイム情報を CLI に**提供しても構いません**。

### `ide/contextUpdate` 通知

ユーザーのコンテキストが変更されるたびに、プラグインは CLI に対して `ide/contextUpdate` [通知](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications)を**送信しても構いません**。

- **トリガーイベント:** 以下の状況でこの通知を送信する必要があります（50ms のデバウンスを推奨）：
  - ファイルが開かれた、閉じられた、またはフォーカスされた場合。
  - アクティブなファイル内でユーザーのカーソル位置またはテキスト選択が変更された場合。
- **ペイロード (`IdeContext`):** 通知パラメーターは `IdeContext` オブジェクトである**必要があります**：

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // Absolute path to the file
    path: string;
    // Last focused Unix timestamp (for ordering)
    timestamp: number;
    // True if this is the currently focused file
    isActive?: boolean;
    cursor?: {
      // 1-based line number
      line: number;
      // 1-based character number
      character: number;
    };
    // The text currently selected by the user
    selectedText?: string;
  }
  ```

  **注記:** `openFiles` リストには、ディスク上に実際に存在するファイルのみを含める必要があります。仮想ファイル（例: パスのない未保存ファイル、エディター設定ページ）は**除外する必要があります**。

### CLI によるコンテキストの使用方法

CLI は `IdeContext` オブジェクトを受信した後、情報をモデルに送信する前に、いくつかの正規化および切り捨て処理を実行します。

- **ファイルの順序:** CLI は `timestamp` フィールドを使用して、最後に使用されたファイルを特定します。この値に基づいて `openFiles` リストをソートします。したがって、プラグインはファイルが最後にフォーカスされた時点の正確な Unix タイムスタンプを**提供する必要があります**。
- **アクティブファイル:** CLI は（ソート後の）最新のファイルのみを「アクティブ」ファイルとみなします。他のすべてのファイルの `isActive` フラグは無視され、`cursor` および `selectedText` フィールドはクリアされます。プラグインは、現在フォーカスされているファイルに対してのみ `isActive: true` を設定し、カーソル/選択範囲の詳細を提供することに注力してください。
- **切り捨て:** トークン制限を管理するため、CLI はファイルリスト（最大 10 ファイル）と `selectedText`（最大 16KB）の両方を切り捨てます。

CLI が最終的な切り捨て処理を行いますが、プラグイン側でも送信するコンテキストの量を制限することを強く推奨します。

## III. 差分表示インターフェース

インタラクティブなコード変更を有効にするため、プラグインは差分表示インターフェースを**公開しても構いません**。これにより、CLI は IDE に対してファイルの差分ビューを開き、提案された変更を表示するようリクエストできます。ユーザーは IDE 内で直接これらの変更を確認、編集し、最終的に承認または拒否できます。

### `openDiff` ツール

プラグインは、MCP サーバーに `openDiff` ツールを**登録する必要があります**。

- **説明:** このツールは、IDE に対して特定のファイルの変更可能な差分ビューを開くよう指示します。
- **リクエスト (`OpenDiffRequest`):** このツールは `tools/call` リクエストを介して呼び出されます。リクエストの `params` 内の `arguments` フィールドは、`OpenDiffRequest` オブジェクトである**必要があります**。

  ```typescript
  interface OpenDiffRequest {
    // The absolute path to the file to be diffed.
    filePath: string;
    // The proposed new content for the file.
    newContent: string;
  }
  ```

- **レスポンス (`CallToolResult`):** ツールはリクエストを確認し、差分ビューが正常に開かれたかどうかを報告するため、直ちに `CallToolResult` を**返す必要があります**。
  - 成功時: 差分ビューが正常に開かれた場合、レスポンスには空のコンテンツ（つまり `content: []`）を**含める必要があります**。
  - 失敗時: エラーにより差分ビューを開けなかった場合、レスポンスは `isError: true` であり、`content` 配列内にエラーを説明する `TextContent` ブロックを**含める必要があります**。

  差分の実際の結果（承認または拒否）は、通知を介して非同期に伝達されます。

### `closeDiff` ツール

プラグインは、MCP サーバーに `closeDiff` ツールを**登録する必要があります**。

- **説明:** このツールは、IDE に対して特定のファイルの開いている差分ビューを閉じるよう指示します。
- **リクエスト (`CloseDiffRequest`):** このツールは `tools/call` リクエストを介して呼び出されます。リクエストの `params` 内の `arguments` フィールドは、`CloseDiffRequest` オブジェクトである**必要があります**。

  ```typescript
  interface CloseDiffRequest {
    // The absolute path to the file whose diff view should be closed.
    filePath: string;
  }
  ```

- **レスポンス (`CallToolResult`):** ツールは `CallToolResult` を**返す必要があります**。
  - 成功時: 差分ビューが正常に閉じられた場合、レスポンスには閉じる前のファイルの最終コンテンツを含む単一の **TextContent** ブロックを content 配列に**含める必要があります**。
  - 失敗時: エラーにより差分ビューを閉じられなかった場合、レスポンスは `isError: true` であり、`content` 配列内にエラーを説明する `TextContent` ブロックを**含める必要があります**。

### `ide/diffAccepted` 通知

ユーザーが差分ビューで変更を承認した場合（例: 「適用」または「保存」ボタンをクリック）、プラグインは CLI に対して `ide/diffAccepted` 通知を**送信する必要があります**。

- **ペイロード:** 通知パラメーターには、ファイルパスとファイルの最終コンテンツを**含める必要があります**。ユーザーが差分ビュー内で手動で編集を行った場合、コンテンツは元の `newContent` と異なる場合があります。

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
    // The full content of the file after acceptance.
    content: string;
  }
  ```

### `ide/diffRejected` 通知

ユーザーが変更を拒否した場合（例: 承認せずに差分ビューを閉じる）、プラグインは CLI に対して `ide/diffRejected` 通知を**送信する必要があります**。

- **ペイロード:** 通知パラメーターには、拒否された差分のファイルパスを**含める必要があります**。

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
  }
  ```

## IV. ライフサイクルインターフェース

プラグインは、IDE のライフサイクルに基づいてリソースと検出ファイルを適切に**管理する必要があります**。

- **アクティブ化時（IDE 起動時/プラグイン有効化時）:**
  1.  MCP サーバーを起動する。
  2.  検出ファイルを作成する。
- **非アクティブ化時（IDE 終了時/プラグイン無効化時）:**
  1.  MCP サーバーを停止する。
  2.  検出ファイルを削除する。