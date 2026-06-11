# Typescript SDK

## @qwen-code/sdk

Qwen Code にプログラムからアクセスするための最小限の実験的 TypeScript SDK です。

機能リクエスト、Issue、PR の投稿を歓迎します。

## Installation

```bash
npm install @qwen-code/sdk
```

## Requirements

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stable) がインストールされ、PATH からアクセス可能であること

> **Note for nvm users**: nvm を使用して Node.js のバージョンを管理している場合、SDK が Qwen Code の実行ファイルを自動検出できないことがあります。`pathToQwenExecutable` オプションに `qwen` バイナリのフルパスを明示的に設定してください。

## Quick Start

```typescript
import { query } from '@qwen-code/sdk';

// Single-turn query
const result = query({
  prompt: 'What files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// Iterate over messages
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Result:', message.result);
  }
}
```

## API Reference

### `query(config)`

Qwen Code との新しいクエリセッションを作成します。

#### Parameters

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - 送信するプロンプト。単一ターンクエリには文字列を、複数ターン会話には非同期イテラブルを使用します。
- `options`: `QueryOptions` - クエリセッションの設定オプション。

#### QueryOptions

| Option                   | Type                                           | Default          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | クエリセッションの作業ディレクトリ。ファイル操作やコマンドが実行されるコンテキストを決定します。                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                | 使用する AI モデル（例: `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`）。`OPENAI_MODEL` および `QWEN_MODEL` 環境変数より優先されます。                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Auto-detected    | Qwen Code 実行ファイルへのパス。複数の形式をサポート: `'qwen'` (PATH からのネイティブバイナリ)、`'/path/to/qwen'` (明示的なパス)、`'/path/to/cli.js'` (Node.js バンドル)、`'node:/path/to/cli.js'` (Node.js ランタイムを強制)、`'bun:/path/to/cli.js'` (Bun ランタイムを強制)。指定しない場合、以下から自動検出: `QWEN_CODE_CLI_PATH` 環境変数、`~/.volta/bin/qwen`、`~/.npm-global/bin/qwen`、`/usr/local/bin/qwen`、`~/.local/bin/qwen`、`~/node_modules/.bin/qwen`、`~/.yarn/bin/qwen`。 |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | ツール実行の承認を制御する権限モード。詳細は [Permission Modes](#permission-modes) を参照。                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | ツール実行承認用のカスタム権限ハンドラ。ツールの確認が必要な場合に呼び出されます。60 秒以内に応答する必要があります。応答がない場合、リクエストは自動的に拒否されます。詳細は [Custom Permission Handler](#custom-permission-handler) を参照。                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Qwen Code プロセスに渡す環境変数。現在のプロセス環境とマージされます。                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | メインセッションのシステムプロンプト設定。文字列を指定すると組み込みの Qwen Code システムプロンプトを完全に上書きし、プリセットオブジェクトを指定すると組み込みプロンプトを保持したまま追加の指示を付加します。                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | 接続する MCP (Model Context Protocol) サーバー。外部サーバー (stdio/SSE/HTTP) と SDK 組み込みサーバーをサポート。外部サーバーは `command`、`args`、`url`、`httpUrl` などのトランスポートオプションで設定します。SDK サーバーは `{ type: 'sdk', name: string, instance: Server }` を使用します。                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | クエリセッションをキャンセルするためのコントローラ。`abortController.abort()` を呼び出してセッションを終了し、リソースをクリーンアップします。                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | CLI プロセスからの詳細なログ出力を有効にするデバッグモード。                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (unlimited) | セッションが自動的に終了するまでの会話ターンの最大数。1 ターンはユーザーメッセージとアシスタントの応答で構成されます。                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | settings.json の `tool.core` と同等。指定した場合、これらのツールのみが AI で利用可能になります。例: `['read_file', 'write_file', 'run_terminal_cmd']`。                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | -                | settings.json の `tool.exclude` と同等。除外されたツールは即座に権限エラーを返します。他のすべての権限設定より最優先されます。パターンマッチングをサポート: ツール名 (`'write_file'`)、ツールクラス (`'ShellTool'`)、またはシェルコマンドプレフィックス (`'ShellTool(rm )'`)。                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                | settings.json の `tool.allowed` と同等。一致するツールは `canUseTool` コールバックをバイパスし、自動的に実行されます。ツールの確認が必要な場合にのみ適用されます。`excludeTools` と同じパターンマッチングをサポート。                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | AI サービスの認証タイプ。SDK で `'qwen-oauth'` を使用することは推奨されません。認証情報は `~/.qwen` に保存され、定期的な更新が必要になる場合があります。                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | -                | セッション中に呼び出せるサブエージェントの設定。サブエージェントは、特定のタスクやドメインに特化した AI エージェントです。                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | `true` の場合、SDK は AI の応答が生成されている途中で未完成のメッセージを出力し、リアルタイムストリーミングを可能にします。                                                                                                                                                                                                                                                                                                                                                        |

### Timeouts

SDK では以下のデフォルトタイムアウトが適用されます:

| Timeout          | Default  | Description                                                                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 minute | `canUseTool` コールバックが応答するまでの最大時間。超過した場合、ツールリクエストは自動的に拒否されます。                                                  |
| `mcpRequest`     | 1 minute | SDK MCP ツール呼び出しが完了するまでの最大時間。                                                                                                  |
| `controlRequest` | 1 minute | `initialize()`、`setModel()`、`setPermissionMode()`、`getContextUsage()`、`interrupt()` などの制御操作が完了するまでの最大時間。 |
| `streamClose`    | 1 minute | SDK MCP サーバーを使用する複数ターンモードで、CLI の stdin を閉じる前に初期化が完了するのを待つ最大時間。                             |

`timeout` オプションを使用してこれらのタイムアウトをカスタマイズできます:

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 seconds for permission callback
    mcpRequest: 600000, // 10 minutes for MCP tool calls
    controlRequest: 60000, // 60 seconds for control requests
    streamClose: 15000, // 15 seconds for stream close wait
  },
});
```

### Message Types

SDK は異なるメッセージタイプを識別するための型ガードを提供します:

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
    // Handle assistant message
  } else if (isSDKResultMessage(message)) {
    // Handle result message
  }
}
```

### Query Instance Methods

`query()` が返す `Query` インスタンスは、以下のメソッドを提供します:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Get session ID
const sessionId = q.getSessionId();

// Check if closed
const closed = q.isClosed();

// Interrupt the current operation
await q.interrupt();

// Change permission mode mid-session
await q.setPermissionMode('yolo');

// Change model mid-session
await q.setModel('qwen-max');

// Get context window usage breakdown (token counts per category)
const usage = await q.getContextUsage();
// Pass true to hint that per-item details should be displayed
const detail = await q.getContextUsage(true);

// Close the session
await q.close();
```

## Permission Modes

SDK はツール実行を制御するために以下の権限モードをサポートしています:

- **`default`**: `canUseTool` コールバックまたは `allowedTools` で承認されない限り、書き込みツールは拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AI にまず計画を提示するよう指示します。
- **`auto-edit`**: 編集ツール（edit、write_file）を自動承認し、他のツールは確認を必要とします。
- **`yolo`**: すべてのツールが確認なしで自動的に実行されます。

### Permission Priority Chain

1. `excludeTools` - ツールを完全にブロック
2. `permissionMode: 'plan'` - 読み取り専用以外のツールをブロック
3. `permissionMode: 'yolo'` - すべてのツールを自動承認
4. `allowedTools` - 一致するツールを自動承認
5. `canUseTool` callback - カスタム承認ロジック
6. Default behavior - SDK モードでは自動拒否

## Examples

### Multi-turn Conversation

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // Wait for some condition or user input
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Now read the file back' },
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

### Custom Permission Handler

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // Allow all read operations
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Prompt user for write operations (in a real app)
  const userApproved = await promptUser(`Allow ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'User denied the operation' };
};

const result = query({
  prompt: 'Create a new file',
  options: {
    canUseTool,
  },
});
```

### With External MCP Servers

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Use the custom tool from my MCP server',
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

### Override the System Prompt

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### Append to the Built-in System Prompt

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Review the current directory.',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: 'Be terse and focus on concrete findings.',
    },
  },
});
```

### With SDK-Embedded MCP Servers

SDK は `tool` と `createSdkMcpServer` を提供し、SDK アプリケーションと同じプロセスで実行される MCP サーバーを作成できます。これにより、別のサーバープロセスを起動せずにカスタムツールを AI に公開できます。

#### `tool(name, description, inputSchema, handler)`

Zod スキーマの型推論を使用してツール定義を作成します。

| Parameter     | Type                               | Description                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | ツール名（1〜64文字、英字で始まり、英数字とアンダースコアを使用可能） |
| `description` | `string`                           | ツールの機能を説明する人間が読める形式の説明                         |
| `inputSchema` | `ZodRawShape`                      | ツールの入力パラメータを定義する Zod スキーマオブジェクト                   |
| `handler`     | `(args, extra) => Promise<Result>` | ツールを実行し、MCP コンテンツブロックを返す非同期関数     |

ハンドラは以下の構造を持つ `CallToolResult` オブジェクトを返す必要があります:

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

SDK 組み込みの MCP サーバーインスタンスを作成します。

| Option    | Type                     | Default   | Description                          |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | Required  | MCP サーバーの一意の名前       |
| `version` | `string`                 | `'1.0.0'` | サーバーのバージョン                       |
| `tools`   | `SdkMcpToolDefinition[]` | -         | `tool()` で作成されたツールの配列 |

`mcpServers` オプションに直接渡すことができる `McpSdkServerConfigWithInstance` オブジェクトを返します。

#### Example

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Define a tool with Zod schema
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Create the MCP server
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Use the server in a query
const result = query({
  prompt: 'What is 42 + 17?',
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

### Abort a Query

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Long running task...',
  options: {
    abortController,
  },
});

// Abort after 5 seconds
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Query was aborted');
  } else {
    throw error;
  }
}
```

## Error Handling

SDK は中止されたクエリを処理するための `AbortError` クラスを提供します:

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... query operations
} catch (error) {
  if (isAbortError(error)) {
    // Handle abort
  } else {
    // Handle other errors
  }
}
```