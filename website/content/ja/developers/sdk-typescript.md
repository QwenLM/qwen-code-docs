# TypeScript SDK

## @qwen-code/sdk

Qwen Code にプログラムからアクセスするための、最小限の実験的な TypeScript SDK です。

機能リクエストや issue / PR はお気軽に送ってください。

## インストール

```bash
npm install @qwen-code/sdk
```

## 必要条件

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0（安定版）。SDK はデフォルトでバンドル CLI を使用します。カスタムの `qwen` バイナリまたは CLI バンドルを実行する必要がある場合にのみ `pathToQwenExecutable` を設定してください。

## クイックスタート

```typescript
import { query } from '@qwen-code/sdk';

// シングルターンのクエリ
const result = query({
  prompt: '今いるディレクトリにはどんなファイルがありますか？',
  options: {
    cwd: '/path/to/project',
  },
});

// メッセージを反復処理
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Result:', message.result);
  }
}
```

## API リファレンス

### `query(config)`

Qwen Code との新しいクエリセッションを作成します。

#### パラメータ

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - 送信するプロンプト。シングルターンのクエリには文字列、マルチターンの会話には非同期イテラブルを使用します。
- `options`: `QueryOptions` - クエリセッションの設定オプション。

#### QueryOptions

| オプション                 | 型                                             | デフォルト         | 説明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ---------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                                             | `process.cwd()`  | クエリセッションの作業ディレクトリ。ファイル操作やコマンドが実行されるコンテキストを決定します。                                                                                                                                                                                                                                                                                                                                                                                    |
| `model`                  | `string`                                                             | -                | 使用する AI モデル（例: `'qwen-max'`、`'qwen-plus'`、`'qwen-turbo'`）。`OPENAI_MODEL` および `QWEN_MODEL` 環境変数より優先されます。                                                                                                                                                                                                                                                                                                                                                       |
| `pathToQwenExecutable`   | `string`                                                             | バンドル CLI      | Qwen Code 実行ファイルへのパス。複数の形式に対応: `'qwen'`（PATH からのネイティブバイナリ）、`'/path/to/qwen'`（明示的なパス）、`'/path/to/cli.js'`（Node.js バンドル）、`'node:/path/to/cli.js'`（Node.js ランタイムを強制）、`'bun:/path/to/cli.js'`（Bun ランタイムを強制）。未指定の場合、SDK はパッケージに同梱されたバンドル CLI を使用します。 |
| `permissionMode`           | `'default' \| 'plan' \| 'auto-edit' \| 'auto' \| 'yolo'` | `'default'`        | ツール実行の承認を制御するパーミッションモード。詳細は [パーミッションモード](#permission-modes) を参照。                                                                                                                                                                                                                                                                                                                                                                               |
| `canUseTool`               | `CanUseTool`                                   | -                  | ツール実行承認のためのカスタムパーミッションハンドラ。ツールが確認を必要とするときに呼び出されます。60 秒以内に応答しないと自動拒否されます。[カスタムパーミッションハンドラ](#custom-permission-handler) を参照。                                                                                                                                                                                                                                                                |
| `env`                      | `Record<string, string>`                       | -                  | Qwen Code プロセスに渡す環境変数。現在のプロセス環境とマージされます。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `systemPrompt`             | `string \| QuerySystemPromptPreset`            | -                  | メインセッションのシステムプロンプト設定。文字列を使用すると組み込みの Qwen Code システムプロンプトを完全に上書きし、プリセットオブジェクトを使用すると組み込みプロンプトを維持しつつ追加の指示を付け加えます。                                                                                                                                                                                                                                   |
| `mcpServers`               | `Record<string, McpServerConfig>`              | -                  | 接続する MCP（Model Context Protocol）サーバー。外部サーバー（stdio/SSE/HTTP）と SDK 組み込みサーバーをサポート。外部サーバーは `command`、`args`、`url`、`httpUrl` などのトランスポートオプションで設定します。SDK サーバーは `{ type: 'sdk', name: string, instance: Server }` を使用します。                                                                                                                                                                    |
| `abortController`          | `AbortController`                              | -                  | クエリセッションをキャンセルするコントローラ。`abortController.abort()` を呼び出すとセッションを終了しリソースをクリーンアップします。                                                                                                                                                                                                                                                                                                                                                    |
| `debug`                    | `boolean`                                      | `false`            | デバッグモードを有効にし、CLI プロセスからの詳細ログを出力します。                                                                                                                                                                                                                                                                                                                                                                                                    |
| `maxSessionTurns`          | `number`                                       | `-1`（無制限）     | セッションが自動終了するまでの最大会話ターン数。整数である必要があります。1 ターンはユーザーメッセージとアシスタント応答で構成されます。                                                                                                                                                                                                                                                                                                                                                           |
| `coreTools`                | `string[]`                                     | -                  | レガシーの `coreTools` / CLI `--core-tools` 許可リストセマンティクスを使用します。指定された場合、一致するコアツールのみがセッションに登録されます。これは組み込みツールの登録を制限する唯一の許可リスト形式のオプションであり、ツール全体の `permissions.deny` / `excludeTools` ルール（および settings.json の `tools.disabled`）もツールをレジストリから削除します。settings.json の `permissions.allow` は純粋な自動承認であり、ツールを削除・降格・非表示にすることはありません（#10075）。ツールのスキーマを初期モデルリクエストから除外するには、settings.json の `tools.eager` を使用します（再起動が必要、#9827）— `tool_search`、`structured_output`、プランモードのライフサイクルツール、`task_stop`、`mcp__*` および `computer_use__*` ツールはその許可リストの対象外であり、通常の読み込みを維持します。ツールを完全に削除するには、ツール全体の `excludeTools` / `permissions.deny` ルールを使用します — 指定子付きのルール（`'Bash(rm *)'` など）は実行時に一致する呼び出しのみを拒否します。MCP ツールは deny ベースの削除の対象外です。パーサーバーの `excludeTools` / `tools.disabled` フィルタで非表示にします（deny は実行時にその呼び出しをブロックします）。例: `['read_file', 'edit', 'run_shell_command']`。 |
| `excludeTools`             | `string[]`                                     | -                  | settings.json の `permissions.deny` と同等です。除外されたツールは即座にパーミッションエラーを返します。他のすべてのパーミッション設定より最優先されます。ツール名のエイリアスとパターンマッチングをサポート: ツール名（`'write_file'`）、シェルコマンドプレフィックス（`'Bash(rm *)'`）、パスパターン（`'Read(.env)'`、`'Edit(/src/**)'`）。                                                                                                                        |
| `allowedTools`             | `string[]`                                     | -                  | 自動承認用の settings.json の `permissions.allow` と同等です。一致するツールは `canUseTool` コールバックをバイパスし自動的に実行されます。ツールが確認を必要とする場合にのみ適用されます。`permissions.allow` と同様に、これは純粋な自動承認であり、どのツールが登録されるかやどのスキーマが送信されるかには影響しません（#10075）。`excludeTools` と同じパターンマッチングをサポートします。例: `['Bash(git status)', 'Bash(npm test)']`。                                                                                                                                                                                                             |
| `authType`                 | `'openai' \| 'anthropic' \| 'qwen-oauth' \| 'gemini' \| 'vertex-ai'` | -              | AI サービスの認証タイプ。指定すると、SDK は CLI に `--auth-type` として転送します。                                                                                                                                                                                                                                                    |
| `agents`                   | `SubagentConfig[]`                             | -                  | セッション中に呼び出し可能なサブエージェントの設定。サブエージェントは特定のタスクやドメインに特化した AI エージェントです。                                                                                                                                                                                                                                                                                                                                             |
| `includePartialMessages`   | `boolean`                                      | `false`            | `true` に設定すると、SDK は生成中の不完全なメッセージを出力し、AI の応答をリアルタイムでストリーミングできるようにします。                                                                                                                                                                                                                                                                                                                                                             |
| `resume`                   | `string`                                       | -                  | セッション ID を指定して以前のセッションを再開します。CLI の `--resume` フラグと同等です。                                                                                                                                                                                                                                                                                                                                                                                         |
| `sessionId`               | `string`                                       | -                  | 新しいセッションにセッション ID を指定します。履歴を再開せずに SDK と CLI が同じ ID を使用することを保証します。CLI の `--session-id` フラグと同等です。                                                                                                                                                                                                                                                                                                                             |

> [!note]
> `coreTools` では `Read`、`Edit`、`Bash` のようなエイリアスも使用できますが、`Bash(git *)` のような呼び出し指定子は削除されます。`coreTools` はツールの登録を制限するものであり、呼び出しパターンを制限するものではありません。

### タイムアウト

SDK は以下のデフォルトタイムアウトを適用します。

| タイムアウト       | デフォルト | 説明                                                                                                                                          |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`      | 1 分       | `canUseTool` コールバックの最大応答時間。超過するとツールリクエストは自動拒否されます。                                                       |
| `mcpRequest`      | 1 分       | SDK MCP ツール呼び出しの完了までの最大時間。                                                                                                  |
| `controlRequest`  | 1 分       | `initialize()`、`setModel()`、`setPermissionMode()`、`getContextUsage()`、`interrupt()` などの制御操作の完了までの最大時間。                   |
| `streamClose`     | 1 分       | マルチターンモードで SDK MCP サーバーを使用する際、CLI の stdin を閉じる前に初期化が完了するのを待つ最大時間。                                |

これらのタイムアウトは `timeout` オプションでカスタマイズできます。

```typescript
const q = query({
  prompt: 'Your prompt',
  options: {
    timeout: {
      canUseTool: 60000, // 60 seconds for permission callback
      mcpRequest: 600000, // 10 minutes for MCP tool calls
      controlRequest: 60000, // 60 seconds for control requests
      streamClose: 15000, // 15 seconds for stream close wait
    },
  },
});
```

### メッセージタイプ

SDK は異なるメッセージタイプを識別するための型ガードを提供します。

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

`query()` が返す `Query` インスタンスにはいくつかのメソッドがあります。

```typescript
const q = query({ prompt: 'こんにちは', options: {} });

// セッション ID を取得
const sessionId = q.getSessionId();

// クローズ状態の確認
const closed = q.isClosed();

// 現在の操作を中断
await q.interrupt();

// セッション中にパーミッションモードを変更
await q.setPermissionMode('yolo');

// セッション中にモデルを変更
await q.setModel('qwen-max');

// コンテキストウィンドウの使用状況内訳を取得（カテゴリ別トークン数）
const usage = await q.getContextUsage();
// true を渡すと、アイテムごとの詳細を表示するヒントを与える
const detail = await q.getContextUsage(true);

// セッションを閉じる
await q.close();
```

`interrupt()` はアクティブなターンのみをキャンセルします。非同期イテラブルプロンプトで作成されたマルチターンのクエリでは、クエリとその入力ストリームはオープンなままとなり、イテラブルからの後続のメッセージが通常通り処理されます。セッション全体を終了したい場合は、`close()` を使用するか、設定した `AbortController` をアボートしてください。

## デーモンでの呼び出し元指定セッション ID

`DaemonClient.createOrAttachSession` は、セッション作成前に ID を永続化する必要がある呼び出し元のために、オプションの `sessionId` を受け付けます。

```typescript
import { DaemonClient } from '@qwen-code/sdk';

const daemon = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });
const session = await daemon.createOrAttachSession({
  workspaceCwd: '/path/to/project',
  sessionId: '550E8400-E29B-41D4-A716-446655440000',
});

console.log(session.sessionId); // 550e8400-e29b-41d4-a716-446655440000
```

SDK は変更を送信する前にデーモンの `session_id_override` ケーパビリティを要求します。REST モードでは `sessionId` が直接シリアライズされ、アクティブな ACP アダプタはそれを `session/new._meta["qwen-code/sessionId"]` にマッピングします。SDK は成功レスポンスを検証し、デーモンが異なる ID を返した場合に `DaemonSessionIdProtocolError` をスローします。

このオプションは常に新しいスレッドセッションを作成し、冪等なアタッチではありません。作成の結果が曖昧な場合は、既知の ID を使用して load または resume してください。オプションを省略すると、既存の create-or-attach 動作が維持されます。

## パーミッションモード

SDK はツール実行を制御するための異なるパーミッションモードをサポートしています。

- **`default`**: 書き込みツールは `canUseTool` コールバックまたは `allowedTools` で承認されない限り拒否されます。読み取り専用ツールは確認なしで実行されます。
- **`plan`**: すべての書き込みツールをブロックし、AI にまず計画を提示するよう指示します。
- **`auto-edit`**: 編集ツール（`edit`、`write_file`、`notebook_edit`）を自動承認し、その他のツールは確認が必要です。
- **`auto`**: 組み込みのクラシファイアを使用して安全なツール呼び出しを自動承認し、リスクのあるものをブロックします。ポリシーによる繰り返しブロックまたはクラシファイアの障害後には手動承認フォールバックに切り替わります。
- **`yolo`**: すべてのツールが確認なしで自動実行されます。

### パーミッションの優先順位チェーン

決定の優先順位（高い順）: `deny` > `ask` > `allow` > _（デフォルト/インタラクティブモード）_

最初に一致したルールが適用されます。

1. `excludeTools` / `permissions.deny` - ツールを完全にブロック（パーミッションエラーを返す）
2. `permissions.ask` - 常にユーザーの確認を要求
3. `permissionMode: 'plan'` - 読み取り専用以外のすべてのツールをブロック
4. `permissionMode: 'yolo'` - すべてのツールを自動承認
5. `allowedTools` / `permissions.allow` - 一致するツールを自動承認
6. `permissionMode: 'auto'` - 残りのツールのクラシファイア仲介の承認
7. `canUseTool` コールバック - カスタム承認ロジック（指定された場合、許可されたツールでは呼び出されない）
8. デフォルト動作 - SDK モードでは自動拒否（書き込みツールは明示的な承認が必要）

## 使用例

### マルチターン会話

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'hello.txt ファイルを作成してください' },
    parent_tool_use_id: null,
  };

  // 何らかの条件やユーザー入力を待つ
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: '今度はそのファイルを読み込んでください' },
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

### カスタムパーミッションハンドラ

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // 読み取り操作はすべて許可
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 書き込み操作はユーザーに確認（実際のアプリでは）
  const userApproved = await promptUser(`${toolName} を許可しますか？`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'ユーザーが操作を拒否しました' };
};

const result = query({
  prompt: '新しいファイルを作成してください',
  options: {
    canUseTool,
  },
});
```

### 外部 MCP サーバーとの連携

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'MCP サーバーのカスタムツールを使ってください',
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

### システムプロンプトの上書き

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '1文で挨拶してください。',
  options: {
    systemPrompt: 'あなたは簡潔なアシスタントです。ちょうど1文で答えてください。',
  },
});
```

### 組み込みシステムプロンプトへの追記

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '現在のディレクトリをレビューしてください。',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: '簡潔にし、具体的な発見に焦点を当ててください。',
    },
  },
});
```

### SDK組み込みMCPサーバー

SDKは、`tool`と`createSdkMcpServer`を提供し、SDKアプリケーションと同じプロセス内で動作するMCPサーバーを作成します。これは、別のサーバープロセスを実行せずに、AIにカスタムツールを公開したい場合に便利です。

#### `tool(name, description, inputSchema, handler)`

Zodスキーマの型推論を使用してツール定義を作成します。

| パラメータ      | 型                                 | 説明                                                               |
| -------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `name`        | `string`                           | ツール名（1〜64文字、英字で始まり、英数字とアンダースコア） |
| `description` | `string`                           | ツールの動作を説明する人間が読める形式の説明 |
| `inputSchema` | `ZodRawShape`                      | ツールの入力パラメータを定義する Zod スキーマオブジェクト |
| `handler`     | `(args, extra) => Promise<Result>` | ツールを実行し、MCP コンテンツブロックを返す非同期関数 |

ハンドラーは以下の構造を持つ`CallToolResult`オブジェクトを返す必要があります：

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

SDK組み込みのMCPサーバーインスタンスを作成します。

| オプション | 型                       | デフォルト   | 説明                                |
| ---------- | ------------------------ | ------------ | ----------------------------------- |
| `name`    | `string`                 | 必須         | MCP サーバーの一意の名前 |
| `version` | `string`                 | `'1.0.0'` | サーバーバージョン |
| `tools`   | `SdkMcpToolDefinition[]` | -          | `tool()` で作成されたツールの配列 |

`mcpServers`オプションに直接渡すことができる`McpSdkServerConfigWithInstance`オブジェクトを返します。

#### 例

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Zodスキーマでツールを定義
const calculatorTool = tool(
  'calculate_sum',
  '2つの数値を加算',
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

// クエリでサーバーを使用
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

### クエリの中断

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: '長時間実行タスク...',
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

## エラーハンドリング

SDKは、中断されたクエリを処理するための`AbortError`クラスを提供します：

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