# Qwen Code Companion Plugin: インターフェース仕様書

> 最終更新日: 2025年9月15日

このドキュメントは、Qwen Code の IDE モードを有効にするための Companion Plugin を構築するための契約を定義します。VS Code の場合、これらの機能（ネイティブ差分表示、コンテキスト認識）は公式拡張機能 ([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)) によって提供されています。この仕様書は、JetBrains IDE や Sublime Text などの他のエディタに同様の機能を追加したいコントリビューターを対象としています。

## I. 通信インターフェース

Qwen Code と IDE プラグインは、ローカルの通信チャネルを通じて通信します。

### 1. トランスポート層: HTTP 上の MCP

プラグインは、**Model Context Protocol (MCP)** を実装したローカル HTTP サーバーを実行する**必要があります**。

- **プロトコル:** サーバーは有効な MCP サーバーでなければなりません。お使いの言語で利用可能な既存の MCP SDK を使用することを推奨します。
- **エンドポイント:** サーバーはすべての MCP 通信のために単一のエンドポイント（例: `/mcp`）を公開する必要があります。
- **ポート:** サーバーは動的に割り当てられたポート（すなわち、ポート `0` で待機）でリッスンする**必要があります**。

### 2. 検出メカニズム: ロックファイル

Qwen Code が接続するためには、サーバーが使用しているポートを検出する必要があります。プラグインは、「ロックファイル」を作成し、ポート環境変数を設定することでこれを実現する**必要があります**。

- **CLI がファイルを見つける方法:** CLI は `QWEN_CODE_IDE_SERVER_PORT` からポートを読み取り、次に `~/.qwen/ide/<PORT>.lock` を読み取ります。（古い拡張機能向けのレガシーフォールバックがあります。以下の注記を参照してください。）
- **ファイルの場所:** ファイルは特定のディレクトリ `~/.qwen/ide/` に作成する必要があります。プラグインはこのディレクトリが存在しない場合、作成する必要があります。
- **ファイル命名規則:** ファイル名は重要であり、以下のパターンに従う**必要があります**:
  `<PORT>.lock`
  - `<PORT>`: MCP サーバーがリッスンしているポート。
- **ファイルの内容とワークスペースの検証:** ファイルには、以下の構造を持つ JSON オブジェクトが含まれている**必要があります**:

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (number, 必須): MCP サーバーのポート。
  - `workspacePath` (string, 必須): 開いているすべてのワークスペースのルートパスのリスト。OS 固有のパス区切り文字で区切られます（Linux/macOS では `:`、Windows では `;`）。CLI はこのパスを使用して、IDE で開かれているのと同じプロジェクトフォルダで実行されていることを確認します。CLI のカレントワーキングディレクトリが `workspacePath` のサブディレクトリでない場合、接続は拒否されます。プラグインは、開いているワークスペースのルートへの正しい絶対パスを提供する**必要があります**。
  - `authToken` (string, 必須): 接続を保護するためのシークレットトークン。CLI はこのトークンをすべてのリクエストの `Authorization: Bearer <token>` ヘッダーに含めます。
  - `ppid` (number, 必須): IDE プロセスの親プロセス ID。
  - `ideName` (string, 必須): IDE のユーザーフレンドリーな名前（例: `VS Code`、`JetBrains IDE`）。

- **認証:** 接続を保護するために、プラグインは一意で秘密のトークンを生成し、それを検出ファイルに含める**必要があります**。CLI はその後、MCP サーバーへのすべてのリクエストの `Authorization` ヘッダーにこのトークンを含めます（例: `Authorization: Bearer a-very-secret-token`）。サーバーはすべてのリクエストでこのトークンを検証し、認証されていないものを拒否する**必要があります**。
- **環境変数 (必須):** プラグインは統合ターミナルで `QWEN_CODE_IDE_SERVER_PORT` を設定する**必要があります**。これにより、CLI が正しい `<PORT>.lock` ファイルを見つけられるようになります。

**レガシーに関する注記:** v0.5.1 より前の拡張機能の場合、Qwen Code はシステムの一時ディレクトリにある `qwen-code-ide-server-<PID>.json` または `qwen-code-ide-server-<PORT>.json` という名前の JSON ファイルを読み取るフォールバックを行う可能性があります。新しい統合では、これらのレガシーファイルに依存しないでください。

## II. コンテキストインターフェース

コンテキスト認識を有効にするために、プラグインは IDE でのユーザーのアクティビティに関するリアルタイム情報を CLI に提供する**ことができます（MAY）**。

### `ide/contextUpdate` 通知

プラグインは、ユーザーのコンテキストが変更されるたびに `ide/contextUpdate` [通知](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications) を CLI に送信する**ことができます（MAY）**。

- **トリガーイベント:** この通知は（推奨されるデバウンス 50ms で）以下の場合に送信する必要があります:
  - ファイルが開かれた、閉じられた、またはフォーカスされた場合。
  - アクティブファイル内でユーザーのカーソル位置またはテキスト選択が変更された場合。
- **ペイロード (`IdeContext`):** 通知パラメータは `IdeContext` オブジェクトである**必要があります**:

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

  **注意:** `openFiles` リストには、ディスク上に存在するファイルのみを含める必要があります。仮想ファイル（例: パスのない未保存ファイル、エディタの設定ページ）は**除外する必要があります**。

### CLI がこのコンテキストをどのように使用するか

`IdeContext` オブジェクトを受信した後、CLI は情報をモデルに送信する前に、いくつかの正規化と切り詰めの手順を実行します。

- **ファイルの順序付け:** CLI は `timestamp` フィールドを使用して、最も最近使用されたファイルを特定します。この値に基づいて `openFiles` リストを並べ替えます。したがって、プラグインはファイルが最後にフォーカスされた正確な Unix タイムスタンプを提供する**必要があります**。
- **アクティブファイル:** CLI は、（並べ替え後の）最新のファイルのみを「アクティブ」ファイルと見なします。他のすべてのファイルの `isActive` フラグは無視し、それらの `cursor` および `selectedText` フィールドをクリアします。プラグインは、現在フォーカスされているファイルに対してのみ `isActive: true` を設定し、カーソル/選択の詳細を提供することに焦点を当てる必要があります。
- **切り詰め:** トークン制限を管理するために、CLI はファイルリスト（10 ファイルまで）と `selectedText`（16KB まで）の両方を切り詰めます。

CLI が最終的な切り詰めを処理しますが、プラグインも送信するコンテキストの量を制限することを強くお勧めします。

## III. 差分表示インターフェース

インタラクティブなコード変更を可能にするために、プラグインは差分表示インターフェースを公開する**ことができます（MAY）**。これにより、CLI は IDE に差分ビューを開くように要求し、ファイルに対する提案された変更を表示できます。ユーザーはその差分ビュー内で変更を確認、編集、最終的に受け入れまたは拒否できます。

### `openDiff` ツール

プラグインは、MCP サーバー上に `openDiff` ツールを登録する**必要があります**。

- **説明:** このツールは、特定のファイルに対して編集可能な差分ビューを開くように IDE に指示します。
- **リクエスト (`OpenDiffRequest`):** このツールは `tools/call` リクエストを介して呼び出されます。リクエストの `params` 内の `arguments` フィールドは、`OpenDiffRequest` オブジェクトである**必要があります**。

  ```typescript
  interface OpenDiffRequest {
    // The absolute path to the file to be diffed.
    filePath: string;
    // The proposed new content for the file.
    newContent: string;
  }
  ```

- **応答 (`CallToolResult`):** このツールは、リクエストを確認し、差分ビューが正常に開かれたかどうかを報告するために、すぐに `CallToolResult` を返す**必要があります**。
  - 成功時: 差分ビューが正常に開かれた場合、応答には空のコンテンツ（すなわち `content: []`）が含まれている**必要があります**。
  - 失敗時: 差分ビューの開始を妨げるエラーが発生した場合、応答は `isError: true` とし、エラーを説明する `TextContent` ブロックを `content` 配列に含める**必要があります**。

  差分の実際の結果（受け入れまたは拒否）は、通知を介して非同期に伝達されます。

### `closeDiff` ツール

プラグインは、MCP サーバー上に `closeDiff` ツールを登録する**必要があります**。

- **説明:** このツールは、特定のファイルに対して開いている差分ビューを閉じるように IDE に指示します。
- **リクエスト (`CloseDiffRequest`):** このツールは `tools/call` リクエストを介して呼び出されます。リクエストの `params` 内の `arguments` フィールドは、`CloseDiffRequest` オブジェクトである**必要があります**。

  ```typescript
  interface CloseDiffRequest {
    // The absolute path to the file whose diff view should be closed.
    filePath: string;
  }
  ```

- **応答 (`CallToolResult`):** このツールは `CallToolResult` を返す**必要があります**。
  - 成功時: 差分ビューが正常に閉じられた場合、応答には、閉じる前のファイルの最終コンテンツを含む単一の **TextContent** ブロックを content 配列に含める**必要があります**。
  - 失敗時: 差分ビューのクローズを妨げるエラーが発生した場合、応答は `isError: true` とし、エラーを説明する `TextContent` ブロックを `content` 配列に含める**必要があります**。

### `ide/diffAccepted` 通知

ユーザーが差分ビューで変更を受け入れた場合（例: 「適用」または「保存」ボタンをクリックした場合）、プラグインは `ide/diffAccepted` 通知を CLI に送信する**必要があります**。

- **ペイロード:** 通知パラメータには、ファイルパスとファイルの最終コンテンツが含まれている**必要があります**。ユーザーが差分ビューで手動編集を行った場合、コンテンツは元の `newContent` と異なる可能性があります。

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
    // The full content of the file after acceptance.
    content: string;
  }
  ```

### `ide/diffRejected` 通知

ユーザーが変更を拒否した場合（例: 差分ビューを受け入れずに閉じた場合）、プラグインは `ide/diffRejected` 通知を CLI に送信する**必要があります**。

- **ペイロード:** 通知パラメータには、拒否された差分のファイルパスが含まれている**必要があります**。

  ```typescript
  {
    // The absolute path to the file that was diffed.
    filePath: string;
  }
  ```

## IV. ライフサイクルインターフェース

プラグインは、IDE のライフサイクルに基づいて、リソースと検出ファイルを正しく管理する**必要があります**。

- **アクティベーション時（IDE 起動/プラグイン有効化）:**
  1.  MCP サーバーを起動します。
  2.  検出ファイルを作成します。
- **非アクティベーション時（IDE シャットダウン/プラグイン無効化）:**
  1.  MCP サーバーを停止します。
  2.  検出ファイルを削除します。