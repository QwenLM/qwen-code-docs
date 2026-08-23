---

# MCP를 통해 Qwen Code를 도구에 연결하기

Qwen Code는 [모델 컨텍스트 프로토콜(Model Context Protocol, MCP)](https://modelcontextprotocol.io/introduction)을 통해 외부 도구 및 데이터 소스에 연결할 수 있습니다. MCP 서버는 Qwen Code에 도구, 데이터베이스, API에 대한 접근 권한을 제공합니다.

## MCP로 할 수 있는 일

MCP 서버를 연결하면 Qwen Code에게 다음을 요청할 수 있습니다:

- 파일 및 리포지토리 작업 (활성화된 도구에 따라 읽기/검색/쓰기)
- 데이터베이스 쿼리 (스키마 확인, 쿼리, 리포팅)
- 내부 서비스 연동 (API를 MCP 도구로 래핑)
- 워크플로 자동화 (도구/프롬프트로 노출되는 반복 작업)

> [!tip]
>
> "시작하기 위한 하나의 명령어"를 찾고 있다면 [빠른 시작](#빠른-시작)으로 이동하세요.

## 빠른 시작

Qwen Code는 `settings.json`의 `mcpServers`에서 MCP 서버를 로드합니다. 서버 구성 방법은 두 가지입니다:

- `settings.json`을 직접 편집
- `qwen mcp` 명령어 사용 ([CLI 레퍼런스](#qwen-mcp로-mcp-서버-관리) 참조)

### 첫 서버 추가하기

1. 서버를 추가합니다 (예시: 원격 HTTP MCP 서버):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Qwen Code를 시작하고 MCP 관리 대화상자를 열어 서버를 확인하고 관리합니다:

```bash
qwen
```

그 다음 입력합니다:

```text
/mcp
```

3. 서버를 추가하기 전에 Qwen Code가 이미 실행 중이었다면, 같은 프로젝트에서 다시 시작하세요. 그런 다음 모델에게 해당 서버의 도구를 사용하도록 요청합니다.

## 설정이 저장되는 위치 (스코프)

대부분의 사용자는 다음 두 스코프만 있으면 됩니다:

- **유저 스코프 (기본값)**: 머신의 모든 프로젝트에 적용되는 `~/.qwen/settings.json`
- **프로젝트 스코프**: 프로젝트 루트의 `.qwen/settings.json`

유저 스코프에 기록:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 고급 설정 레이어(시스템 기본값/시스템 설정 및 우선순위 규칙)는 [설정](../configuration/settings)을 참조하세요.

## 서버 구성

### 트랜스포트 선택

| 트랜스포트 | 사용 시기                                                     | JSON 필드                                   |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | 원격 서비스에 권장. 클라우드 MCP 서버에 적합 | `httpUrl` (+ 선택적 `headers`)            |
| `sse`     | Server-Sent Events만 지원하는 레거시/지원 중단된 서버    | `url` (+ 선택적 `headers`)                |
| `stdio`   | 머신의 로컬 프로세스 (스크립트, CLI, Docker)             | `command`, `args` (+ 선택적 `cwd`, `env`) |

> [!note]
>
> 서버가 둘 다 지원한다면 **SSE**보다 **HTTP**를 선호하세요.

### `settings.json` vs `qwen mcp add`로 구성하기

두 방법 모두 `settings.json`에 동일한 `mcpServers` 엔트리를 생성합니다. 선호하는 방식을 사용하세요.

#### Stdio 서버 (로컬 프로세스)

JSON (`.qwen/settings.json`):

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

CLI (기본적으로 유저 스코프에 기록):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP 서버 (원격 스트리밍 HTTP)

JSON:

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token"
      },
      "timeout": 5000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### SSE 서버 (원격 Server-Sent Events)

JSON:

```json
{
  "mcpServers": {
    "sseServer": {
      "url": "http://localhost:8080/sse",
      "timeout": 30000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## MCP 프롬프트 및 리소스 사용하기

도구 외에도 Qwen Code는 두 가지 MCP 프리미티브를 추가로 검색하고 노출합니다.

### 프롬프트 (슬래시 명령어)

서버가 `prompts/list`를 통해 노출하는 모든 프롬프트는 실행 가능한 **슬래시 명령어**가 됩니다. 검색 후 `/`를 입력하면 프롬프트가 표시됩니다 (`MCP: <server>`로 레이블됨). 다른 명령어와 동일하게 실행합니다:

```text
/my_prompt --arg1="value" --arg2="value"
# 위치 인자 형식도 작동합니다:
/my_prompt "value" "value"
# 프롬프트의 인자를 표시합니다:
/my_prompt help
```

프롬프트의 메시지가 모델에게 전송되고, 모델이 이에 따라 동작합니다.

> 검색은 선언된 `prompts` 기능에 대해 관대합니다: 일부 서버는 `prompts/list`를 구현하지만 `initialize` 기능에서 `prompts`를 생략합니다. Qwen Code는 어쨌든 `prompts/list`를 시도하므로 해당 프롬프트가 여전히 나타납니다. 프롬프트가 실제로 없는 서버는 단순히 `Method not found`를 반환하며, 이는 무시됩니다.

### 리소스

서버가 `resources/list`를 통해 노출하는 리소스는 서버별로 검색됩니다. `/mcp`로 관리 대화상자를 열고 서버를 선택하면 도구 및 프롬프트와 함께 **리소스** 수가 표시됩니다. **View resources**를 선택하면 서버의 리소스 URI를 탐색할 수 있으며, 하나를 선택하면 설명과 MIME 타입, 그리고 메시지에 붙여넣을 정확한 `@server:uri` 참조가 표시됩니다. 프롬프트와 마찬가지로 `resources` 기능은 선언이 필수가 아닙니다.

`@server:uri` 구문으로 리소스의 내용을 메시지에 삽입합니다 — `@`를 입력한 다음 서버 이름, 콜론, 리소스 URI를 입력합니다:

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

`@myserver:`를 입력하면 해당 서버의 리소스 자동 완성 목록이 표시됩니다. 계속 입력하면 필터링되며, 리소스 URI 또는 친근한 이름/타이틀을 대소문자 구분 없이 매칭합니다. URI를 외울 필요는 없습니다. 콜론 전에 서버 이름의 일부를 입력하면 리소스를 노출하는 일치하는 서버도 제안되므로, 하나를 선택하여 리소스 목록으로 바로 들어갈 수 있습니다. 제출 시 참조된 리소스가 읽히고 내용이 메시지에 추가됩니다 (텍스트는 인라인, 바이너리 블롭은 첨부파일로). `@server:uri` 참조는 프롬프트에 유지되어 모델이 무엇을 보고 있는지 알 수 있습니다. `server` 접두사는 구성된 MCP 서버와 일치해야 합니다. 그렇지 않으면 토큰은 일반 파일 경로로 처리되므로 기존 `@path/to/file` 참조는 영향을 받지 않습니다. 신뢰할 수 없는 폴더에서는 리소스 읽기가 비활성화됩니다.

## 점진적 사용 가능성 및 검색 타임아웃

Qwen Code는 UI가 이미 상호작용 가능한 상태가 된 후 백그라운드에서 MCP 서버를 검색합니다. MCP 서버 중 하나가 몇 초가 걸리거나 (또는 응답하지 않더라도) 수백 밀리초 내에 CLI의 첫 프롬프트가 표시되며, 각 서버가 검색 핸드셰이크를 완료한 후 대략 한 프레임(~16ms) 내에 모델의 도구 목록이 업데이트됩니다.

- **인터랙티브 모드**: UI가 즉시 나타납니다. 우측 하단의 MCP 상태 필이 검색 진행 중 `N/M MCP servers ready`를 표시합니다. MCP가 완료되기 전에 프롬프트를 전송하면 모델은 _그 시점에_ 준비된 도구만 보게 됩니다. 이후 프롬프트는 서버가 온라인되면서 더 많은 도구를 보게 됩니다.
- **비인터랙티브 모드** (`--prompt`, stream-json, ACP): CLI는 첫 프롬프트를 전송하기 전에 MCP 검색이 안정화될 때까지 여전히 대기하므로, 스크립트/파이프 호출은 레거시 동기 동작이 생성한 것과 동일한 완전한 도구 세트를 보게 됩니다.

### 서버별 `discoveryTimeoutMs`

각 MCP 서버는 초기 핸드셰이크(`connect` + `tools/list` + `prompts/list` + `resources/list`)가 허용되는 최대 시간을 제한하는 검색 전용 타임아웃을 가집니다. 기본값:

- **stdio 서버**: 30초
- **원격 HTTP / SSE 서버**: 5초 (네트워크 위험이 더 높음)

필요에 따라 서버별로 재정의할 수 있습니다:

```jsonc
{
  "mcpServers": {
    "slow-stdio": {
      "command": "node",
      "args": ["./slow-server.js"],
      "discoveryTimeoutMs": 60000,
    },
    "flaky-remote": {
      "httpUrl": "https://example.com/mcp",
      "discoveryTimeoutMs": 10000,
    },
  },
}
```

기존 `timeout` 필드는 **도구 호출** 타임아웃입니다 (각 `tools/call` 요청에 사용되며, 기본값 10분). `discoveryTimeoutMs`의 영향을 받지 않습니다. 오래 실행되는 도구 호출은 시작 경로 문제가 아닙니다.

### 자동 stdio 협상

Stdio 서버는 기본적으로 단일 프로세스 레거시 initialize 흐름을 사용합니다. 최신 전용 stdio 서버에 연결하려면 자동 프로토콜 협상을 옵트인하세요:

```jsonc
{
  "mcpServers": {
    "modern-server": {
      "command": "node",
      "args": ["./server.js"],
      "versionNegotiation": "auto",
    },
  },
}
```

자동 협상은 세션 프로세스를 시작하기 전에 구성된 서버의 단기 복사본을 실행하며 발견 예산의 최대 5초를 사용할 수 있습니다. 비멱등적 시작 부작용, 단일 소유자 잠금 또는 PID 파일, 느린 initialize 핸드셰이크가 있는 서버의 경우 기본 레거시 정책을 유지하세요.

### 점진적 MCP 롤백

레거시 동기 동작(CLI가 모든 MCP 서버가 완료될 때까지 대기한 후 UI를 표시)이 필요하면 환경 변수에 `QWEN_CODE_LEGACY_MCP_BLOCKING=1`을 설정하세요. 최소 한 릴리스 동안 이스케이프 해치로 유지됩니다.

## 안전성 및 제어

### 신뢰 (확인 건너뛰기)

- **서버 신뢰** (`trust: true`): 신뢰하는 워크스페이스에서 해당 서버에 대한 확인 프롬프트를 우회합니다 (신중하게 사용).

### 연결 손실 리플레이

Qwen Code는 서버에 `trust: true`가 설정되고, 워크스페이스가 신뢰되며, 도구가 `idempotentHint: true` 또는 일관된 읽기 전용 주석을 명시적으로 선언한 경우에만 MCP 도구 호출을 다시 연결하고 리플레이합니다. 읽기 전용 주석은 `destructiveHint: true` 또는 `idempotentHint: false`와 충돌하며 리플레이되지 않습니다.

주석이 누락되었거나, 주석이 충돌하거나, 신뢰할 수 없는 서버이거나, 신뢰할 수 없는 워크스페이스의 호출은 연결 실패 후 리플레이되지 않습니다. Qwen Code는 서버가 응답이 손실되기 전에 작업을 완료했을 수 있으므로 결과를 알 수 없을 수 있다고 보고합니다. 다시 시도하기 전에 결과를 확인하세요. 이 보수적 동작은 주석 없는 도구를 투명하게 재시도했던 이전 릴리스와 다를 수 있습니다.

주석은 서버가 제공하는 동작 힌트이며, 권한이나 인증 경계가 아닙니다. 직접 제어하고 주석을 검증한 서버에만 `trust: true`를 구성하세요.

### OAuth 인증

Qwen Code는 MCP 서버에 대한 OAuth 2.0 인증을 지원합니다. 인증이 필요한 원격 서버에 접근할 때 유용합니다.

#### 기본 사용법

OAuth 자격 증명으로 MCP 서버를 추가하면 Qwen Code가 인증 흐름을 자동으로 처리합니다:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 중요: Redirect URI 구성

OAuth 흐름은 인증 제공자가 인증 코드를 전송할 리다이렉트 URI를 필요로 합니다.

- **로컬 개발**: 기본적으로 Qwen Code는 `http://localhost:7777/oauth/callback`을 사용합니다. 로컬 머신에서 로컬 브라우저로 Qwen Code를 실행할 때 작동합니다.

- **원격/클라우드 배포**: 원격 서버, 클라우드 IDE, 웹 터미널에서 Qwen Code를 실행할 때 기본 `localhost` 리다이렉트는 작동하지 않습니다. `/oauth/callback`으로 끝나는 공개 URL로 `--oauth-redirect-uri`를 구성한 다음, 해당 경로를 Qwen Code가 실행되는 머신의 `http://127.0.0.1:7777/oauth/callback`으로 리버스 프록시하세요. Qwen Code는 TLS를 종료하지 않습니다. 프록시가 이를 수행해야 합니다.

원격 서버 예시:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

예를 들어, 리버스 프록시는 이 콜백 경로만 로컬 리스너로 전달할 수 있습니다:

```nginx
location = /oauth/callback {
  proxy_pass http://127.0.0.1:7777;
}
```

#### settings.json을 통한 수동 구성

`settings.json`을 직접 편집하여 OAuth를 구성할 수도 있습니다:

```json
{
  "mcpServers": {
    "oauthServer": {
      "url": "https://api.example.com/sse/",
      "oauth": {
        "enabled": true,
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authorizationUrl": "https://provider.example.com/authorize",
        "tokenUrl": "https://provider.example.com/token",
        "redirectUri": "https://your-server.com/oauth/callback",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

OAuth 구성 속성:

| 속성           | 설명                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | 이 서버에 OAuth 활성화 (부울)                                                                                |
| `clientId`         | OAuth 클라이언트 식별자 (문자열, 동적 등록 시 선택 사항)                                                  |
| `clientSecret`     | OAuth 클라이언트 시크릿 (문자열, 공개 클라이언트의 경우 선택 사항)                                                             |
| `authorizationUrl` | OAuth 인증 엔드포인트 (문자열, 생략 시 자동 검색)                                                     |
| `tokenUrl`         | OAuth 토큰 엔드포인트 (문자열, 생략 시 자동 검색)                                                             |
| `scopes`           | 필수 OAuth 스코프 (문자열 배열)                                                                              |
| `redirectUri`      | 커스텀 리다이렉트 URI (문자열). **원격 배포에 중요**. 기본값: `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | SSE URL의 토큰용 쿼리 매개변수 이름 (문자열)                                                                  |
| `audiences`        | 토큰이 유효한 대상 (문자열 배열)                                                                   |

#### 토큰 관리

OAuth 토큰은 자동으로 다음과 같이 처리됩니다:

- **저장**: 기본적으로 `~/.qwen/mcp-oauth-tokens.json` (평문, 모드 0600)에 저장됩니다. `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`가 설정되면 Qwen Code는 사용 가능한 곳에서 키체인 기반 저장소를 사용하거나 AES-256-GCM 암호화가 적용된 `~/.qwen/mcp-oauth-tokens-v2.json`을 사용합니다.
- **갱신**: 만료 시 자동으로 갱신됩니다 (리프레시 토큰이 있는 경우)
- **검증**: 각 연결 시도 전에 검증됩니다

> [!WARNING]
> 기본적으로 OAuth 토큰은 암호화되지 않은 상태로 디스크에 저장됩니다. 공유 또는 다중 사용자 머신에서는 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`를 설정하여 자격 증명을 보호하세요.

Qwen Code 내의 `/mcp` 대화상자를 사용하여 MCP 서버를 확인하고 인증을 상호작용적으로 관리하세요.

### 도구 필터링 (서버별 도구 허용/거부)

`includeTools` / `excludeTools`를 사용하여 서버가 노출하는 도구를 제한합니다 (Qwen Code 관점에서).

예시: 일부 도구만 포함:

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      "timeout": 30000
    }
  }
}
```

### 전역 허용/거부 목록

`settings.json`의 `mcp` 객체는 모든 MCP 서버에 대한 전역 규칙을 정의합니다:

- `mcp.allowed`: MCP 서버 이름의 허용 목록 (`mcpServers`의 키)
- `mcp.excluded`: MCP 서버 이름의 거부 목록

두 목록 모두 글롭 패턴을 지원합니다: `*`는 임의의 문자 시퀀스와 매칭되고 `?`는 단일 문자와 매칭됩니다 (예: `"*puppeteer*"`는 이름에 `puppeteer`가 포함된 모든 서버와 매칭). 글롭 문자가 없는 엔트리는 정확히 매칭됩니다. 서버가 두 목록 모두와 매칭되면 `mcp.excluded`가 우선합니다.

예시:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server", "*-internal"],
    "excluded": ["experimental-server"]
  }
}
```

## 문제 해결

- **`qwen mcp list`에서 서버가 "Disconnected"로 표시됨**: URL/명령어가 올바른지 확인하고 `timeout`을 늘리세요.
- **Stdio 서버가 시작되지 않음**: 절대 경로로 `command`를 지정하고 `cwd`/`env`를 다시 확인하세요.
- **JSON의 환경 변수가 해석되지 않음**: Qwen Code가 실행되는 환경에 해당 변수가 존재하는지 확인하세요 (셸 vs GUI 앱 환경은 다를 수 있습니다).

## 레퍼런스

### `settings.json` 구조

#### 서버별 구성 (`mcpServers`)

`settings.json` 파일에 `mcpServers` 객체를 추가합니다:

```json
// ... 파일에는 다른 구성 객체가 포함됩니다
{
  "mcpServers": {
    "serverName": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-directory",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

구성 속성:

필수 (다음 중 하나):

| 속성  | 설명                                            |
| --------- | ------------------------------------------------------ |
| `command` | Stdio 트랜스포트용 실행 파일 경로             |
| `url`     | SSE 엔드포인트 URL (예: `"http://localhost:8080/sse"`) |
| `httpUrl` | HTTP 스트리밍 엔드포인트 URL                            |

선택 사항:

| 속성               | 타입/기본값                 | 설명                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | 배열                        | Stdio 트랜스포트용 커맨드라인 인자                                                                                                                                                                                                                        |
| `headers`              | 객체                       | `url` 또는 `httpUrl` 사용 시 커스텀 HTTP 헤더                                                                                                                                                                                                                 |
| `env`                  | 객체                       | 서버 프로세스의 환경 변수. 값은 `$VAR_NAME` 또는 `${VAR_NAME}` 구문을 사용하여 환경 변수를 참조할 수 있습니다                                                                                                                                |
| `cwd`                  | 문자열                       | Stdio 트랜스포트의 작업 디렉토리                                                                                                                                                                                                                             |
| `timeout`              | 숫자<br>(기본값: 600,000) | 밀리초 단위의 요청 타임아웃 (기본값: 600,000ms = 10분)                                                                                                                                                                                                 |
| `versionNegotiation`   | `"auto" \| "legacy"`<br>(기본값: `"legacy"`) | Stdio 서버의 경우, `"auto"`는 일회용 형제 프로세스에서 프로토콜 협상을 활성화합니다. 기본값 `"legacy"`는 세션 프로세스만 시작합니다.                                                                                                                  |
| `trust`                | 부울<br>(기본값: false)  | `true`일 때 신뢰하는 워크스페이스에서 이 서버에 대한 도구 호출 확인을 우회합니다 (기본값: `false`)                                                                                                                                                           |
| `includeTools`         | 배열                        | 이 MCP 서버에서 포함할 도구 이름 목록. 지정하면 여기에 나열된 도구만 이 서버에서 사용 가능합니다 (허용 목록 동작). 지정하지 않으면 서버의 모든 도구가 기본적으로 활성화됩니다.                                       |
| `excludeTools`         | 배열                        | 이 MCP 서버에서 제외할 도구 이름 목록. 여기에 나열된 도구는 서버에서 노출되더라도 모델이 사용할 수 없습니다.<br>참고: `excludeTools`는 `includeTools`보다 우선합니다. 도구가 두 목록 모두에 있으면 제외됩니다. |
| `targetAudience`       | 문자열                       | 접근하려는 IAP 보호 애플리케이션에 허용 목록에 등록된 OAuth 클라이언트 ID. `authProviderType: 'service_account_impersonation'`과 함께 사용됩니다.                                                                                                         |
| `targetServiceAccount` | 문자열                       | 가장할 Google Cloud 서비스 계정의 이메일 주소. `authProviderType: 'service_account_impersonation'`과 함께 사용됩니다.                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### `qwen mcp`로 MCP 서버 관리

`settings.json`을 수동으로 편집하여 MCP 서버를 구성할 수도 있지만, CLI가 보통 더 빠릅니다.

#### 서버 추가 (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 인자/옵션             | 설명                                                         | 기본값                                | 예시                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | 서버의 고유 이름.                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | 실행할 명령어 (`stdio`용) 또는 URL (`http`/`sse`용). | —                                      | `/usr/bin/python` 또는 `http://localhost:8`                          |
| `[args...]`                 | `stdio` 명령어의 선택적 인자.                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | 구성 스코프 (user 또는 project).                              | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | 트랜스포트 타입 (`stdio`, `sse`, `http`).                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | 환경 변수를 설정.                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | SSE 및 HTTP 트랜스포트의 HTTP 헤더를 설정.                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | 밀리초 단위의 연결 타임아웃을 설정.                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | 서버를 신뢰합니다. 신뢰하는 워크스페이스에서 확인을 건너뜁니다.         | — (`false`)                            | `--trust`                                                          |
| `--description`             | 서버의 설명을 설정.                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | 포함할 도구의 쉼표로 구분된 목록.                         | 모든 도구 포함                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | 제외할 도구의 쉼표로 구분된 목록.                         | 없음                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | MCP 서버 인증용 OAuth 클라이언트 ID.                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | MCP 서버 인증용 OAuth 클라이언트 시크릿.                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | 인증 콜백용 OAuth 리다이렉트 URI.                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth 인증 URL.                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth 토큰 URL.                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth 스코프 (쉼표로 구분).                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |

> `--oauth-*` 플래그는 `--transport sse` 및 `--transport http`에만 적용됩니다. `--transport stdio`와 함께 사용하면 거부됩니다.

#### 서버 제거 (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```
