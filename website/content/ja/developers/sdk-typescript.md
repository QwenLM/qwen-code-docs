# TypeScript SDK

## @qwen-code/sdk

Qwen Code へのプログラムによるアクセスを可能にする最小限の実験的 TypeScript SDK。

機能要望／問題報告／プルリクエストは、お気軽にご提出ください。

## インストール

```bash
npm install @qwen-code/sdk
```

## 必須条件

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0（安定版）がインストール済みで、PATH から利用可能であること

> **nvm を使用している方へ**: nvm を使って Node.js のバージョンを管理している場合、SDK が Qwen Code の実行ファイルを自動検出できないことがあります。その場合は、`pathToQwenExecutable` オプションに `qwen` バイナリの完全パスを明示的に指定してください。

## クイックスタート

```typescript
import { query } from '@qwen-code/sdk';

// 1回限りのクエリ
const result = query({
  prompt: '現在のディレクトリにはどのようなファイルがありますか？',
  options: {
    cwd: '/path/to/project',
  },
});

// メッセージを反復処理
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('アシスタント:', message.message.content);
  } else if (message.type === 'result') {
    console.log('結果:', message.result);
  }
}
```

## API リファレンス

### `query(config)`

Qwen Code を使用した新しいクエリセッションを作成します。

#### パラメーター

- `prompt`: `string | AsyncIterable<SDKUserMessage>` — 送信するプロンプト。1回限りのクエリには文字列を使用し、複数ターンの会話には非同期イテラブルを使用します。
- `options`: `QueryOptions` — クエリセッションの設定オプション。

#### QueryOptions

| オプション                   | 型                                           | デフォルト値          | 説明                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`                        | `string`                                     | `process.cwd()`       | クエリセッションの作業ディレクトリ。ファイル操作およびコマンドの実行コンテキストを決定します。                                                                                                                                                                                                                                                                                                                                                                               |
| `model`                      | `string`                                     | -                     | 使用する AI モデル（例：`'qwen-max'`、`'qwen-plus'`、`'qwen-turbo'`）。環境変数 `OPENAI_MODEL` および `QWEN_MODEL` よりも優先されます。                                                                                                                                                                                                                                                                                                                                     |
| `pathToQwenExecutable`       | `string`                                     | 自動検出              | Qwen Code 実行可能ファイルへのパス。以下の形式をサポート：`'qwen'`（PATH から取得されるネイティブバイナリ）、`'/path/to/qwen'`（明示的なパス）、`'/path/to/cli.js'`（Node.js バンドル）、`'node:/path/to/cli.js'`（Node.js ランタイムを強制）、`'bun:/path/to/cli.js'`（Bun ランタイムを強制）。指定されていない場合、以下の順で自動検出されます：環境変数 `QWEN_CODE_CLI_PATH`、`~/.volta/bin/qwen`、`~/.npm-global/bin/qwen`、`/usr/local/bin/qwen`、`~/.local/bin/qwen`、`~/node_modules/.bin/qwen`、`~/.yarn/bin/qwen`。 |
| `permissionMode`             | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`           | ツール実行の承認を制御する権限モード。詳細は「[権限モード](#permission-modes)」を参照してください。                                                                                                                                                                                                                                                                                                                                                                          |
| `canUseTool`                 | `CanUseTool`                                 | -                     | ツール実行承認のためのカスタム権限ハンドラー。ツールが確認を必要とする際に呼び出されます。60 秒以内に応答しなければ、リクエストは自動的に拒否されます。詳細は「[カスタム権限ハンドラー](#custom-permission-handler)」を参照してください。                                                                                                                                                                                                                                                 |
| `env`                        | `Record<string, string>`                     | -                     | Qwen Code プロセスに渡す環境変数。現在のプロセスの環境とマージされます。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `mcpServers`                 | `Record<string, McpServerConfig>`            | -                     | 接続する MCP（Model Context Protocol）サーバー。外部サーバー（stdio/SSE/HTTP）および SDK 組み込みサーバーをサポートします。外部サーバーは `command`、`args`、`url`、`httpUrl` などのトランスポートオプションで設定されます。SDK サーバーは `{ type: 'sdk', name: string, instance: Server }` の形式を使用します。                                                                                                                                                                             |
| `abortController`            | `AbortController`                            | -                     | クエリセッションをキャンセルするためのコントローラー。セッションを終了しリソースをクリーンアップするには、`abortController.abort()` を呼び出します。                                                                                                                                                                                                                                                                                                                         |
| `debug`                      | `boolean`                                    | `false`               | CLI プロセスからの詳細なログ出力を有効にするデバッグモード。                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `maxSessionTurns`            | `number`                                     | `-1`（無制限）        | セッションが自動終了するまでの最大会話ターン数。1 ターンは、ユーザーのメッセージとアシスタントの応答のペアで構成されます。                                                                                                                                                                                                                                                                                                                                                       |
| `coreTools`                  | `string[]`                                   | -                     | `settings.json` の `tool.core` と同等です。指定した場合、AI が利用できるツールはこれらのものに限定されます。例：`['read_file', 'write_file', 'run_terminal_cmd']`。                                                                                                                                                                                                                                                                                                         |
| `excludeTools`               | `string[]`                                   | -                     | `settings.json` の `tool.exclude` と同等です。除外されたツールは即座に権限エラーを返します。すべての他の権限設定よりも最優先されます。パターンマッチングをサポート：ツール名（`'write_file'`）、ツールクラス（`'ShellTool'`）、シェルコマンドのプレフィックス（`'ShellTool(rm )'`）。                                                                                                                                                                                               |
| `allowedTools`               | `string[]`                                   | -                     | `settings.json` の `tool.allowed` と同等です。該当するツールは `canUseTool` コールバックをバイパスし、自動的に実行されます。これはツールが確認を必要とする場合にのみ適用されます。`excludeTools` と同じパターンマッチングをサポートします。                                                                                                                                                                                                                                                                                         |
| `authType`                   | `'openai' \| 'qwen-oauth'`                   | `'openai'`            | AI サービスの認証タイプ。SDK 内で `'qwen-oauth'` を使用することは推奨されません。なぜなら、資格情報が `~/.qwen` に保存され、定期的な更新が必要になる可能性があるためです。                                                                                                                                                                                                                                                                                              |
| `agents`                     | `SubagentConfig[]`                           | -                     | セッション中に呼び出せるサブエージェントの設定。サブエージェントは、特定のタスクまたはドメインに特化した AI エージェントです。                                                                                                                                                                                                                                                                                                                                                 |
| `includePartialMessages`     | `boolean`                                    | `false`               | `true` の場合、SDK は AI の応答を生成中の不完全なメッセージをリアルタイムで発行し、ストリーミングを可能にします。                                                                                                                                                                                                                                                                                                                                                             |

### タイムアウト

SDK では、以下のデフォルトのタイムアウトが適用されます。

| タイムアウト         | デフォルト | 説明                                                                                                                                 |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `canUseTool`        | 1 分       | `canUseTool` コールバックの応答に許容される最大時間です。この時間を超えると、ツール要求は自動的に拒否されます。                         |
| `mcpRequest`        | 1 分       | SDK の MCP ツール呼び出しの完了に許容される最大時間です。                                                                            |
| `controlRequest`    | 1 分       | `initialize()`、`setModel()`、`setPermissionMode()`、`interrupt()` などの制御操作の完了に許容される最大時間です。                      |
| `streamClose`       | 1 分       | SDK MCP サーバーを用いたマルチターンモードにおいて、CLI の標準入力を閉じる前に初期化完了を待機する最大時間です。                        |

これらのタイムアウト値は、`timeout` オプションでカスタマイズできます。

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 権限コールバックに 60 秒
    mcpRequest: 600000, // MCP ツール呼び出しに 10 分
    controlRequest: 60000, // 制御要求に 60 秒
    streamClose: 15000, // ストリーム閉じる際の待機に 15 秒
  },
});
```

### メッセージの種類

SDK は、異なるメッセージタイプを識別するための型ガードを提供します。

```typescript
import {
  isSDKUserMessage,
  isSDKAssistantMessage,
  isSDKSystemMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
} from '@qwen-code/sdk';

for await (const message of result) {
  if (isSDKAssistantMessage(message)) {
    // アシスタントメッセージを処理
  } else if (isSDKResultMessage(message)) {
    // 結果メッセージを処理
  }
}
```

### Query インスタンスのメソッド

`query()` が返す `Query` インスタンスには、以下のメソッドが用意されています。

```typescript
const q = query({ prompt: 'Hello', options: {} });

// セッション ID を取得
const sessionId = q.getSessionId();

// セッションが閉じられているか確認
const closed = q.isClosed();

// 現在の操作を中断
await q.interrupt();

// セッション中にパーミッションモードを変更
await q.setPermissionMode('yolo');

// セッション中にモデルを変更
await q.setModel('qwen-max');

// セッションを閉じる
await q.close();
```

## 権限モード

SDK では、ツールの実行を制御するための異なる権限モードがサポートされています。

- **`default`**: 書き込み系ツールは、`canUseTool` コールバックまたは `allowedTools` で明示的に承認されない限り拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込み系ツールをブロックし、AI に事前に実行計画を提示させるように指示します。
- **`auto-edit`**: 編集系ツール（`edit`、`write_file` など）を自動承認しますが、その他のツールは確認が必要です。
- **`yolo`**: すべてのツールを確認なしで自動実行します。

### 権限の優先順位チェーン

1. `excludeTools` — ツールを完全にブロック
2. `permissionMode: 'plan'` — 読み取り専用でないツールをブロック
3. `permissionMode: 'yolo'` — すべてのツールを自動承認
4. `allowedTools` — 条件に合致するツールを自動承認
5. `canUseTool` コールバック — カスタム承認ロジック
6. デフォルト動作 — SDK モードでは、デフォルトで拒否

## 例

### マルチターン対話

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'hello.txt ファイルを作成してください' },
    parent_tool_use_id: null,
  };

  // 何らかの条件を待つ、またはユーザー入力を待つ
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: '次に、そのファイルを読み込んでください' },
    parent_tool_use_id: null,
  };
}

const result = query({
  prompt: generateMessages(),
  options: {
    permissionMode: 'auto-edit',
  },
});

for await (const message of result) {
  console.log(message);
}
```

### カスタム権限ハンドラー

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // すべての読み取り操作を許可
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 書き込み操作については、ユーザーに確認（実際のアプリケーションでは）
  const userApproved = await promptUser(`${toolName} を実行してもよろしいですか？`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'ユーザーがこの操作を拒否しました' };
};

const result = query({
  prompt: '新しいファイルを作成する',
  options: {
    canUseTool,
  },
});
```

### 外部 MCP サーバーを使用する場合

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '私の MCP サーバーからカスタムツールを使用します',
  options: {
    mcpServers: {
      'my-server': {
        command: 'node',
        args: ['path/to/mcp-server.js'],
        env: { PORT: '3000' },
      },
    },
  },
});
```

### SDK 組み込み MCP サーバーを使用する場合

SDK は、SDK アプリケーションと同じプロセス内で実行される MCP サーバーを作成するための `tool` および `createSdkMcpServer` を提供します。これは、別個のサーバープロセスを起動せずに AI にカスタムツールを公開したい場合に便利です。

#### `tool(name, description, inputSchema, handler)`

Zod スキーマによる型推論を用いたツール定義を作成します。

| パラメーター     | 型                                   | 説明                                                                 |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `name`           | `string`                             | ツール名（1～64 文字、英字で始まり、英数字およびアンダースコア可） |
| `description`    | `string`                             | ツールの機能を人間が読み取れる形で記述した説明                        |
| `inputSchema`    | `ZodRawShape`                        | ツールの入力パラメーターを定義する Zod スキーマオブジェクト          |
| `handler`        | `(args, extra) => Promise<Result>`   | ツールを実行し、MCP コンテンツブロックを返す非同期関数                |

ハンドラーは、以下の構造を持つ `CallToolResult` オブジェクトを返す必要があります：

```typescript
{
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; uri: string; mimeType?: string; text?: string }
  >;
  isError?: boolean;
}
```

#### `createSdkMcpServer(options)`

SDK に埋め込まれた MCP サーバーのインスタンスを作成します。

| オプション  | 型                        | デフォルト値 | 説明                                 |
| ----------- | ------------------------- | ------------ | ------------------------------------ |
| `name`      | `string`                  | 必須         | MCP サーバーの固有名                 |
| `version`   | `string`                  | `'1.0.0'`    | サーバーのバージョン                 |
| `tools`     | `SdkMcpToolDefinition[]`  | -            | `tool()` で作成されたツールの配列   |

この関数は、`mcpServers` オプションに直接渡すことができる `McpSdkServerConfigWithInstance` オブジェクトを返します。

#### 例

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Zod スキーマを用いてツールを定義
const calculatorTool = tool(
  'calculate_sum',
  '2つの数値を加算します',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// MCP サーバーを作成
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// クエリ内でサーバーを使用
const result = query({
  prompt: '42 と 17 の和は？',
  options: {
    permissionMode: 'yolo',
    mcpServers: {
      calculator: server,
    },
  },
});

for await (const message of result) {
  console.log(message);
}
```

### クエリの中断

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: '長時間実行されるタスク...',
  options: {
    abortController,
  },
});

// 5秒後に中断
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('クエリが中断されました');
  } else {
    throw error;
  }
}
```

## エラー処理

SDK は中断されたクエリを処理するための `AbortError` クラスを提供します：

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... クエリ操作
} catch (error) {
  if (isAbortError(error)) {
    // 中断の処理
  } else {
    // その他のエラーの処理
  }
}
```