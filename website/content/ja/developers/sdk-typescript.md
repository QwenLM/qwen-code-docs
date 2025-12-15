# Typescript SDK

## @qwen-code/sdk

Qwen Code にプログラムからアクセスするための最小限の実験的な TypeScript SDK。

機能リクエスト、Issue、PR は自由に送ってください。

## インストール

```bash
npm install @qwen-code/sdk
```

## 要件

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0（安定版）がインストールされ、PATH でアクセス可能であること

> **nvm ユーザーへの注意**: Node.js のバージョン管理に nvm を使用している場合、SDK は Qwen Code 実行ファイルを自動検出できないことがあります。`pathToQwenExecutable` オプションに `qwen` バイナリのフルパスを明示的に設定してください。

## クイックスタート

```typescript
import { query } from '@qwen-code/sdk';

// 単一ターンのクエリ
const result = query({
  prompt: '現在のディレクトリにはどのようなファイルがありますか？',
  options: {
    cwd: '/path/to/project',
  },
});

// メッセージをイテレート
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

Qwen Code を使用して新しいクエリセッションを作成します。

#### パラメータ

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - 送信するプロンプト。単一ターンのクエリには文字列を使用し、マルチターンの会話には非同期イテラブルを使用します。
- `options`: `QueryOptions` - クエリセッションの設定オプション。

#### QueryOptions

| オプション                | 型                                             | デフォルト        | 説明                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                     | `string`                                       | `process.cwd()`   | クエリセッションの作業ディレクトリ。ファイル操作やコマンド実行のコンテキストを決定します。                                                                                                                                                                                                                                                                                                                                                                                       |
| `model`                   | `string`                                       | -                 | 使用するAIモデル（例：`'qwen-max'`、`'qwen-plus'`、`'qwen-turbo'`）。`OPENAI_MODEL`および`QWEN_MODEL`環境変数よりも優先されます。                                                                                                                                                                                                                                                                                                                                                  |
| `pathToQwenExecutable`    | `string`                                       | 自動検出          | Qwen Code実行ファイルへのパス。複数の形式に対応しています：`'qwen'`（PATHからのネイティブバイナリ）、`'/path/to/qwen'`（明示的なパス）、`'/path/to/cli.js'`（Node.jsバンドル）、`'node:/path/to/cli.js'`（Node.jsランタイムを強制）、`'bun:/path/to/cli.js'`（Bunランタイムを強制）。指定されていない場合、以下の場所から自動検出されます：`QWEN_CODE_CLI_PATH` 環境変数、`~/.volta/bin/qwen`、`~/.npm-global/bin/qwen`、`/usr/local/bin/qwen`、`~/.local/bin/qwen`、`~/node_modules/.bin/qwen`、`~/.yarn/bin/qwen`。 |
| `permissionMode`          | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`       | ツール実行承認を制御するパーミッションモード。詳細は[Permission Modes](#permission-modes)を参照してください。                                                                                                                                                                                                                                                                                                                                                                        |
| `canUseTool`              | `CanUseTool`                                   | -                 | ツール実行承認のためのカスタムパーミッションハンドラ。ツールが確認を必要とする際に呼び出されます。60秒以内に応答する必要があり、超えるとリクエストは自動的に拒否されます。詳細は[Custom Permission Handler](#custom-permission-handler)を参照してください。                                                                                                                                                                                                                          |
| `env`                     | `Record<string, string>`                       | -                 | Qwen Codeプロセスに渡す環境変数。現在のプロセス環境とマージされます。                                                                                                                                                                                                                                                                                                                                                                                                              |
| `mcpServers`              | `Record<string, McpServerConfig>`              | -                 | 接続するMCP（Model Context Protocol）サーバー。外部サーバー（stdio/SSE/HTTP）およびSDK組み込みサーバーに対応しています。外部サーバーは`command`、`args`、`url`、`httpUrl`などの転送オプションで設定されます。SDKサーバーは`{ type: 'sdk', name: string, instance: Server }`を使用します。                                                                                                                                                                                           |
| `abortController`         | `AbortController`                              | -                 | クエリセッションをキャンセルするためのコントローラー。`abortController.abort()`を呼び出してセッションを終了し、リソースをクリーンアップします。                                                                                                                                                                                                                                                                                                                                    |
| `debug`                   | `boolean`                                      | `false`           | CLIプロセスからの詳細なログ出力を有効にするデバッグモード。                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `maxSessionTurns`         | `number`                                       | `-1`（無制限）    | セッションが自動的に終了するまでの最大会話ターン数。1つのターンはユーザーのメッセージとアシスタントのレスポンスで構成されます。                                                                                                                                                                                                                                                                                                                                                      |
| `coreTools`               | `string[]`                                     | -                 | settings.jsonの`tool.core`と同等です。指定された場合、これらのツールのみがAIに利用可能になります。例：`['read_file', 'write_file', 'run_terminal_cmd']`。                                                                                                                                                                                                                                                                                                                         |
| `excludeTools`            | `string[]`                                     | -                 | settings.jsonの`tool.exclude`と同等です。除外されたツールは即座にパーミッションエラーを返します。他のすべてのパーミッション設定より最優先されます。パターンマッチングに対応しています：ツール名（`'write_file'`）、ツールクラス（`'ShellTool'`）、またはシェルコマンドプレフィックス（`'ShellTool(rm )'`）。                                                                                                                                                                               |
| `allowedTools`            | `string[]`                                     | -                 | settings.jsonの`tool.allowed`と同等です。一致したツールは`canUseTool`コールバックをバイパスして自動的に実行されます。ツールが確認を必要とする場合にのみ適用されます。`excludeTools`と同じパターンマッチングに対応しています。                                                                                                                                                                                                                                                      |
| `authType`                | `'openai' \| 'qwen-oauth'`                     | `'openai'`        | AIサービスの認証タイプ。SDKで`'qwen-oauth'`を使用することは推奨されません。認証情報は`~/.qwen`に保存され、定期的な更新が必要になる可能性があるためです。                                                                                                                                                                                                                                                                                                                          |
| `agents`                  | `SubagentConfig[]`                             | -                 | セッション中に呼び出すことができるサブエージェントの設定。サブエージェントは特定のタスクやドメイン向けの専門的なAIエージェントです。                                                                                                                                                                                                                                                                                                                                                 |
| `includePartialMessages`  | `boolean`                                      | `false`           | `true`の場合、SDKは生成中の不完全なメッセージをリアルタイムで発行し、AIのレスポンスをストリーミング表示できます。                                                                                                                                                                                                                                                                                                                                                                   |

### タイムアウト

SDK は以下のデフォルトのタイムアウトを適用します：

| タイムアウト      | デフォルト   | 説明                                                                                                                         |
| ---------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 分         | `canUseTool` コールバックが応答するまでの最大時間。超過した場合、ツールリクエストは自動的に拒否されます。                   |
| `mcpRequest`     | 1 分         | SDK MCP ツール呼び出しが完了するまでの最大時間。                                                                            |
| `controlRequest` | 1 分         | `initialize()`、`setModel()`、`setPermissionMode()`、および `interrupt()` などの制御操作が完了するまでの最大時間。       |
| `streamClose`    | 1 分         | SDK MCP サーバーとのマルチターンモードで CLI の stdin を閉じる前に初期化が完了するのを待機する最大時間。                    |

これらのタイムアウトは、`timeout` オプションを通じてカスタマイズできます：

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // パーミッションコールバック用に 60 秒
    mcpRequest: 600000, // MCP ツール呼び出し用に 10 分
    controlRequest: 60000, // 制御リクエスト用に 60 秒
    streamClose: 15000, // ストリームクローズ待ち用に 15 秒
  },
});
```

### メッセージタイプ

SDK は、異なるメッセージタイプを識別するための型ガードを提供します：

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

`query()` が返す `Query` インスタンスには、以下のようなメソッドがあります：

```typescript
const q = query({ prompt: 'Hello', options: {} });

// セッションIDを取得
const sessionId = q.getSessionId();

// セッションが閉じているか確認
const closed = q.isClosed();

// 現在の操作を中断
await q.interrupt();

// セッション途中でパーミッションモードを変更
await q.setPermissionMode('yolo');

// セッション途中でモデルを変更
await q.setModel('qwen-max');

// セッションを閉じる
await q.close();
```

## パーミッションモード

SDKは、ツール実行を制御するための異なるパーミッションモードをサポートしています：

- **`default`**: `canUseTool` コールバックまたは `allowedTools` で承認されない限り、書き込みツールは拒否されます。読み取り専用ツールは確認なしに実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AIにまずプランを提示するように指示します。
- **`auto-edit`**: 編集ツール（edit、write_file）を自動承認し、その他のツールは確認が必要です。
- **`yolo`**: すべてのツールが確認なしに自動実行されます。

### パーミッション優先チェーン

1. `excludeTools` - ツールを完全にブロック
2. `permissionMode: 'plan'` - 読み取り専用以外のツールをブロック
3. `permissionMode: 'yolo'` - すべてのツールを自動承認
4. `allowedTools` - 一致するツールを自動承認
5. `canUseTool` コールバック - カスタム承認ロジック
6. デフォルト動作 - SDKモードでは自動拒否

## 例

### マルチターン会話

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'hello.txtファイルを作成してください' },
    parent_tool_use_id: null,
  };

  // 何らかの条件やユーザー入力を待つ
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: '今度はファイルを読み戻してください' },
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

### カスタム権限ハンドラ

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // すべての読み取り操作を許可
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 書き込み操作の場合はユーザーに確認（実際のアプリケーションでは）
  const userApproved = await promptUser(`${toolName} を許可しますか？`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'ユーザーが操作を拒否しました' };
};

const result = query({
  prompt: '新しいファイルを作成',
  options: {
    canUseTool,
  },
});
```

### 外部 MCP サーバーを使用する場合

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

### SDK 組み込み MCP サーバーを使用する場合

SDK は、`tool` および `createSdkMcpServer` を提供し、SDK アプリケーションと同じプロセスで実行される MCP サーバーを作成できます。これは、別のサーバープロセスを実行せずにカスタムツールを AI に公開したい場合に便利です。

#### `tool(name, description, inputSchema, handler)`

Zod スキーマの型推論を使用してツール定義を作成します。

| パラメータ      | 型                                 | 説明                                                                         |
| --------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `name`          | `string`                           | ツール名（1〜64文字、英字で始まり、英数字とアンダースコア）                  |
| `description`   | `string`                           | ツールの機能を説明する人間が読める形式のテキスト                             |
| `inputSchema`   | `ZodRawShape`                      | ツールの入力パラメータを定義する Zod スキーマオブジェクト                    |
| `handler`       | `(args, extra) => Promise<Result>` | ツールを実行し、MCP コンテンツブロックを返す非同期関数                       |

ハンドラーは以下の構造を持つ `CallToolResult` オブジェクトを返す必要があります：

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

SDKが埋め込まれたMCPサーバーインスタンスを作成します。

| オプション | 型                        | デフォルト   | 説明                                  |
| ---------- | ------------------------- | ------------ | ------------------------------------- |
| `name`     | `string`                  | 必須         | MCPサーバーのユニークな名前            |
| `version`  | `string`                  | `'1.0.0'`    | サーバーのバージョン                   |
| `tools`    | `SdkMcpToolDefinition[]`  | -            | `tool()`で作成されたツールの配列       |

返り値は、`mcpServers`オプションに直接渡すことができる`McpSdkServerConfigWithInstance`オブジェクトです。

#### 例

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Zodスキーマでツールを定義
const calculatorTool = tool(
  'calculate_sum',
  '2つの数値を加算する',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// MCPサーバーを作成
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// クエリ内でサーバーを使用
const result = query({
  prompt: '42 + 17 は？',
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
  prompt: 'Long running task...',
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
    console.log('Query was aborted');
  } else {
    throw error;
  }
}
```

## エラーハンドリング

SDKは、中断されたクエリを処理するための`AbortError`クラスを提供します：

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... クエリ操作
} catch (error) {
  if (isAbortError(error)) {
    // 中断時の処理
  } else {
    // その他のエラー処理
  }
}
```