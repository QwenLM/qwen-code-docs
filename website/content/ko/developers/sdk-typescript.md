# Typescript SDK

## @qwen-code/sdk

Qwen Code에 프로그래밍 방식으로 접근하기 위한 최소한의 실험적 TypeScript SDK입니다.

기능 요청/이슈/PR을 자유롭게 제출해 주세요.

## 설치

```bash
npm install @qwen-code/sdk
```

## 요구 사항

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (안정). SDK는 기본적으로 번들 CLI를 사용합니다. 커스텀 `qwen` 바이너리나 CLI 번들을 실행해야 하는 경우에만 `pathToQwenExecutable`을 설정하세요.

## 빠른 시작

```typescript
import { query } from '@qwen-code/sdk';

// 단일 턴 쿼리
const result = query({
  prompt: 'What files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// 메시지 반복
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Result:', message.result);
  }
}
```

## API 레퍼런스

### `query(config)`

Qwen Code와 새 쿼리 세션을 생성합니다.

#### 파라미터

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - 전송할 프롬프트. 단일 턴 쿼리에는 문자열을, 멀티 턴 대화에는 async iterable을 사용하세요.
- `options`: `QueryOptions` - 쿼리 세션의 구성 옵션.

#### QueryOptions

| 옵션                     | 타입                                                       | 기본값            | 설명                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                                 | `process.cwd()`  | 쿼리 세션의 작업 디렉토리. 파일 작업과 명령어가 실행되는 컨텍스트를 결정합니다.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                                 | -                | 사용할 AI 모델 (예: `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). `OPENAI_MODEL` 및 `QWEN_MODEL` 환경 변수보다 우선합니다.                                                                                                                                                                                                                                                                                                                                                         |
| `pathToQwenExecutable`   | `string`                                                 | 번들 CLI      | Qwen Code 실행 파일의 경로. 다양한 형식 지원: `'qwen'` (PATH의 네이티브 바이너리), `'/path/to/qwen'` (명시적 경로), `'/path/to/cli.js'` (Node.js 번들), `'node:/path/to/cli.js'` (Node.js 런타임 강제), `'bun:/path/to/cli.js'` (Bun 런타임 강제). 제공되지 않으면 SDK는 패키지에 포함된 번들 CLI를 사용합니다. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'auto' \| 'yolo'` | `'default'`      | 도구 실행 승인을 제어하는 승인 모드. 자세한 내용은 [승인 모드](#승인-모드)를 참조하세요.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `canUseTool`             | `CanUseTool`                                             | -                | 도구 실행 승인을 위한 커스텀 권한 핸들러. 도구가 확인을 요구할 때 호출됩니다. 60초 이내에 응답해야 하며, 그렇지 않으면 요청이 자동 거부됩니다. [커스텀 권한 핸들러](#커스텀-권한-핸들러)를 참조하세요.                                                                                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                                 | -                | Qwen Code 프로세스에 전달할 환경 변수. 현재 프로세스 환경과 병합됩니다.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`                      | -                | 메인 세션의 시스템 프롬프트 구성. 문자열을 사용하면 내장 Qwen Code 시스템 프롬프트를 완전히 오버라이드하고, 프리셋 객체를 사용하면 내장 프롬프트를 유지하면서 추가 지시를 덧붙입니다.                                                                                                                                                                                                                                                                                                                                                |
| `mcpServers`             | `Record<string, McpServerConfig>`                        | -                | 연결할 모델 컨텍스트 프로토콜(MCP) 서버. 외부 서버(stdio/SSE/HTTP) 및 SDK 내장 서버를 지원합니다. 외부 서버는 `command`, `args`, `url`, `httpUrl` 등의 transport 옵션으로 구성합니다. SDK 서버는 `{ type: 'sdk', name: string, instance: Server }`를 사용합니다.                                                                                                                                                                                                                                                        |
| `abortController`        | `AbortController`                                        | -                | 쿼리 세션을 취소하는 컨트롤러. `abortController.abort()`를 호출하여 세션을 종료하고 리소스를 정리합니다.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `debug`                  | `boolean`                                                | `false`          | CLI 프로세스의 상세 로깅을 위한 디버그 모드를 활성화합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `maxSessionTurns`        | `number`                                                 | `-1` (무제한)       | 세션이 자동으로 종료되기 전의 최대 대화 턴 수. 정수여야 합니다. 턴은 사용자 메시지와 어시스턴트 응답으로 구성됩니다.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `coreTools`              | `string[]`                                               | -                | 레거시 `coreTools` / CLI `--core-tools` 허용목록 시맨틱스를 사용합니다. 지정되면 일치하는 코어 도구만 세션에 등록됩니다. 이는 내장 도구 등록을 제한하는 유일한 허용목록 스타일 옵션입니다. 도구 전체에 적용되는 `permissions.deny` / `excludeTools` 규칙(및 settings.json의 `tools.disabled`)도 레지스트리에서 도구를 제거합니다. settings.json의 `permissions.allow`는 순수 자동 승인이며 도구를 제거, 강등, 또는 숨기지 않습니다(#10075). 도구의 스키마를 초기 모델 요청에서 제외하려면 settings.json의 `tools.eager`를 사용하세요(재시작 필요, #9827) — `tool_search`, `structured_output`, 계획 모드 수명주기 도구, `task_stop`, `mcp__*` 및 `computer_use__*` 도구는 해당 허용목록에서 면제되며 정상적으로 로드됩니다. 완전히 제거하려면 도구 전체에 적용되는 `excludeTools` / `permissions.deny` 규칙을 사용하세요. 지정자가 있는 규칙(예: `'Bash(rm *)'`)은 런타임에 일치하는 호출만 거부합니다. MCP 도구는 deny 기반 제거에서 면제됩니다. 서버별 `excludeTools` / `tools.disabled` 필터로 숨기세요(deny는 여전히 런타임에 호출을 차단합니다). 예시: `['read_file', 'edit', 'run_shell_command']`. |
| `excludeTools`           | `string[]`                                               | -                | settings.json의 `permissions.deny`와 동일합니다. 제외된 도구는 즉시 권한 오류를 반환합니다. 다른 모든 권한 설정보다 가장 높은 우선순위를 가집니다. 도구 이름 별칭 및 패턴 매칭 지원: 도구 이름(`'write_file'`), 셸 명령어 접두사(`'Bash(rm *)'`), 또는 경로 패턴(`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                                                                                                                               |
| `allowedTools`           | `string[]`                                               | -                | 자동 승인을 위한 settings.json의 `permissions.allow`와 동일합니다. 일치하는 도구는 `canUseTool` 콜백을 우회하여 자동으로 실행됩니다. 도구가 확인을 요구할 때만 적용됩니다. `permissions.allow`와 마찬가지로, 이것은 순수 자동 승인이며 어떤 도구가 등록되거나 어떤 스키마가 전송되는지에 영향을 주지 않습니다(#10075). `excludeTools`와 동일한 패턴 매칭을 지원합니다. 예시: `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                                                                                       |
| `authType`               | `'openai' \| 'anthropic' \| 'qwen-oauth' \| 'gemini' \| 'vertex-ai'` | -                | AI 서비스의 인증 유형. 제공되면 SDK는 CLI에 `--auth-type`으로 전달합니다.                                                                                                                                                                                                                                                                                                                                                                 |
| `agents`                 | `SubagentConfig[]`                                       | -                | 세션 중에 호출할 수 있는 서브에이전트의 구성. 서브에이전트는 특정 작업이나 도메인을 위한 특화된 AI 에이전트입니다.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `includePartialMessages` | `boolean`                                                | `false`          | `true`이면, SDK가 생성 중에 미완료 메시지를 방출하여 AI 응답의 실시간 스트리밍을 허용합니다.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `resume`                 | `string`                                                 | -                | 세션 ID를 제공하여 이전 세션을 재개합니다. CLI의 `--resume` 플래그와 동일합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `sessionId`              | `string`                                                 | -                | 새 세션의 세션 ID를 지정합니다. 이력을 재개하지 않고 SDK와 CLI가 동일한 ID를 사용하도록 합니다. CLI의 `--session-id` 플래그와 동일합니다.                                                                                                                                                                                                                                                                                                                                                                          |

> [!note]
> `coreTools`의 경우, `Read`, `Edit`, `Bash`와 같은 별칭도 작동하지만 `Bash(git *)`와 같은 호출 지정자는 제거됩니다. `coreTools`는 도구 등록을 제한하며 호출 패턴을 제한하지 않습니다.

### 타임아웃

SDK는 다음 기본 타임아웃을 적용합니다:

| 타임아웃              | 기본값     | 설명                                                                                                                                       |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1분      | `canUseTool` 콜백이 응답할 수 있는 최대 시간. 초과 시 도구 요청이 자동 거부됩니다.                                                  |
| `mcpRequest`     | 1분      | SDK MCP 도구 호출이 완료될 수 있는 최대 시간.                                                                                                  |
| `controlRequest` | 1분      | `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()`, `interrupt()`와 같은 제어 작업이 완료될 수 있는 최대 시간. |
| `streamClose`    | 1분      | SDK MCP 서버가 있는 멀티 턴 모드에서 CLI stdin을 닫기 전에 초기화가 완료될 때까지 대기하는 최대 시간.                             |

`timeout` 옵션을 통해 이 타임아웃을 커스터마이즈할 수 있습니다:

```typescript
import { query } from '@qwen-code/sdk';

const q = query({
  prompt: 'Your prompt',
  options: {
    timeout: {
      canUseTool: 60000, // 권한 콜백에 60초
      mcpRequest: 600000, // MCP 도구 호출에 10분
      controlRequest: 60000, // 제어 요청에 60초
      streamClose: 15000, // 스트림 close 대기에 15초
    },
  },
});
```

### 메시지 타입

SDK는 다양한 메시지 타입을 식별하기 위한 타입 가드를 제공합니다:

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
    // 어시스턴트 메시지 처리
  } else if (isSDKResultMessage(message)) {
    // 결과 메시지 처리
  }
}
```

### Query 인스턴스 메서드

`query()`가 반환하는 `Query` 인스턴스는 여러 메서드를 제공합니다:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// 세션 ID 가져오기
const sessionId = q.getSessionId();

// 종료 여부 확인
const closed = q.isClosed();

// 현재 작업 중단
await q.interrupt();

// 세션 중 승인 모드 변경
await q.setPermissionMode('yolo');

// 세션 중 모델 변경
await q.setModel('qwen-max');

// 컨텍스트 창 사용량 세부 정보 가져오기 (카테고리별 토큰 수)
const usage = await q.getContextUsage();
// 항목별 세부 정보를 표시하도록 힌트를 전달하려면 true를 전달하세요
const detail = await q.getContextUsage(true);

// 세션 종료
await q.close();
```

`interrupt()`는 활성 턴만 취소합니다. async iterable 프롬프트로 생성된 멀티 턴 쿼리의 경우, 쿼리와 입력 스트림이 열린 상태로 유지되므로 이후 iterable의 메시지가 정상적으로 처리됩니다. 전체 세션을 종료하려면 `close()`를 사용하거나 구성된 `AbortController`를 abort하세요.

## Daemon 호출자 제공 세션 ID

`DaemonClient.createOrAttachSession`는 세션 생성 전에 identity를 영속화해야 하는 호출자를 위한 선택적 `sessionId`를 받습니다:

```typescript
import { DaemonClient } from '@qwen-code/sdk';

const daemon = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });
const session = await daemon.createOrAttachSession({
  workspaceCwd: '/path/to/project',
  sessionId: '550E8400-E29B-41D4-A716-446655440000',
});

console.log(session.sessionId); // 550e8400-e29b-41d4-a716-446655440000
```

SDK는 mutation을 전송하기 전에 daemon의 `session_id_override` capability를 요구합니다. REST 모드는 `sessionId`를 직접 직렬화하고, 활성 ACP 어댑터는 이를 `session/new._meta["qwen-code/sessionId"]`에 매핑합니다. SDK는 성공 응답을 확인하고 daemon이 다른 ID를 반환하면 `DaemonSessionIdProtocolError`를 throw합니다.

이 옵션은 항상 새 스레드 세션을 생성하며 멱등적인 attach가 아닙니다. 생성 결과가 모호한 경우, 알려진 ID를 load 또는 resume과 함께 사용하세요. 이 옵션을 생략하면 기존 create-or-attach 동작이 유지됩니다.

## 승인 모드

SDK는 도구 실행을 제어하기 위해 다양한 승인 모드를 지원합니다:

- **`default`**: 쓰기 도구는 `canUseTool` 콜백이나 `allowedTools`에서 승인되지 않는 한 거부됩니다. 읽기 전용 도구는 확인 없이 실행됩니다.
- **`plan`**: 모든 쓰기 도구를 차단하고 AI에게 먼저 계획을 제시하도록 지시합니다.
- **`auto-edit`**: 편집 도구(`edit`, `write_file`, `notebook_edit`)를 자동 승인하고 다른 도구는 확인을 요구합니다.
- **`auto`**: 내장 분류기를 사용하여 안전한 도구 호출을 자동 승인하고 위험한 호출을 차단합니다. 반복된 정책 차단 또는 분류기 장애 시 수동 승인 폴백을 제공합니다.
- **`yolo`**: 모든 도구가 확인 없이 자동으로 실행됩니다.

### 권한 우선순위 체인

결정 우선순위 (높은 순): `deny` > `ask` > `allow` > _(기본/인터랙티브 모드)_

먼저 일치하는 규칙이 적용됩니다.

1. `excludeTools` / `permissions.deny` - 도구를 완전히 차단 (권한 오류 반환)
2. `permissions.ask` - 항상 사용자 확인을 요구
3. `permissionMode: 'plan'` - 읽기 전용이 아닌 모든 도구를 차단
4. `permissionMode: 'yolo'` - 모든 도구를 자동 승인
5. `allowedTools` / `permissions.allow` - 일치하는 도구를 자동 승인
6. `permissionMode: 'auto'` - 나머지 도구에 대한 분류기 중재 승인
7. `canUseTool` 콜백 - 커스텀 승인 로직 (제공된 경우, 허용된 도구에 대해서는 호출되지 않음)
8. 기본 동작 - SDK 모드에서 자동 거부 (쓰기 도구는 명시적 승인 필요)

## 예시

### 멀티 턴 대화

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // 특정 조건이나 사용자 입력을 대기
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

### 커스텀 권한 핸들러

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // 모든 읽기 작업 허용
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 쓰기 작업에 대해 사용자에게 확인 요청 (실제 앱에서)
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

### 외부 MCP 서버와 함께 사용

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

### 시스템 프롬프트 오버라이드

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### 내장 시스템 프롬프트에 추가

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

### SDK 내장 MCP 서버와 함께 사용

SDK는 SDK 애플리케이션과 동일한 프로세스에서 실행되는 MCP 서버를 생성하기 위해 `tool`과 `createSdkMcpServer`를 제공합니다. 별도의 서버 프로세스를 실행하지 않고 AI에 커스텀 도구를 노출하고 싶을 때 유용합니다.

#### `tool(name, description, inputSchema, handler)`

Zod 스키마 타입 추론을 사용하여 도구 정의를 생성합니다.

| 파라미터        | 타입                                 | 설명                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | 도구 이름 (1-64자, 문자로 시작, 영숫자 및 밑줄) |
| `description` | `string`                           | 도구의 기능을 설명하는 읽기 쉬운 설명                         |
| `inputSchema` | `ZodRawShape`                      | 도구의 입력 파라미터를 정의하는 Zod 스키마 객체                   |
| `handler`     | `(args, extra) => Promise<Result>` | 도구를 실행하고 MCP 콘텐츠 블록을 반환하는 async 함수     |

핸들러는 다음 구조의 `CallToolResult` 객체를 반환해야 합니다:

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

SDK 내장 MCP 서버 인스턴스를 생성합니다.

| 옵션      | 타입                     | 기본값      | 설명                          |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | 필수       | MCP 서버의 고유 이름       |
| `version` | `string`                 | `'1.0.0'` | 서버 버전                       |
| `tools`   | `SdkMcpToolDefinition[]` | -         | `tool()`로 생성된 도구의 배열 |

`mcpServers` 옵션에 직접 전달할 수 있는 `McpSdkServerConfigWithInstance` 객체를 반환합니다.

#### 예시

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Zod 스키마로 도구 정의
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// MCP 서버 생성
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// 쿼리에서 서버 사용
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

### 쿼리 중단

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Long running task...',
  options: {
    abortController,
  },
});

// 5초 후 중단
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

## 오류 처리

SDK는 중단된 쿼리를 처리하기 위한 `AbortError` 클래스를 제공합니다:

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... 쿼리 작업
} catch (error) {
  if (isAbortError(error)) {
    // 중단 처리
  } else {
    // 다른 오류 처리
  }
}
```
