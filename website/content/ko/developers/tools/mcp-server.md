---
title: MCP 서버
---

# MCP 서버와 Qwen Code

이 문서는 Qwen Code에서 모델 컨텍스트 프로토콜(MCP) 서버를 설정하고 사용하는 방법을 안내합니다.

## MCP 서버란?

MCP 서버는 모델 컨텍스트 프로토콜을 통해 CLI에 도구와 리소스를 노출하는 애플리케이션으로, CLI가 외부 시스템 및 데이터 소스와 상호작용할 수 있게 합니다. MCP 서버는 모델과 로컬 환경 또는 API와 같은 다른 서비스 사이의 브리지 역할을 합니다.

MCP 서버를 사용하면 CLI가 다음 작업을 수행할 수 있습니다:

- **도구 검색:** 표준화된 스키마 정의를 통해 사용 가능한 도구, 설명, 매개변수를 나열합니다.
- **도구 실행:** 정의된 인수로 특정 도구를 호출하고 구조화된 응답을 받습니다.
- **리소스 접근:** 특정 리소스에서 데이터를 읽습니다(다만 CLI는 주로 도구 실행에 중점을 둡니다).

MCP 서버를 사용하면 데이터베이스, API, 사용자 정의 스크립트, 특수 워크플로와 상호작용하는 등 내장 기능 이상의 작업을 수행하도록 CLI의 기능을 확장할 수 있습니다.

## 핵심 통합 아키텍처

Qwen Code는 코어 패키지(`packages/core/src/tools/`)에 구축된 정교한 검색 및 실행 시스템을 통해 MCP 서버와 통합됩니다:

### 검색 계층 (`mcp-client.ts`)

검색 과정은 `discoverMcpTools()`에 의해 조정되며, 다음 작업을 수행합니다:

1. **설정된 서버를 순회합니다:** `settings.json`의 `mcpServers` 구성에서 서버를 하나씩 확인합니다.
2. **연결을 수립합니다:** 적절한 전송 메커니즘(Stdio, SSE 또는 Streamable HTTP)을 사용합니다.
3. **도구 정의를 가져옵니다:** MCP 프로토콜을 사용하여 각 서버에서 도구 정의를 가져옵니다.
4. **스키마를 정리하고 검증합니다:** Qwen API와의 호환성을 위해 도구 스키마를 정리하고 검증합니다.
5. **도구를 등록합니다:** 전역 도구 레지스트리에 충돌 해결을 포함하여 도구를 등록합니다.

### 실행 계층 (`mcp-tool.ts`)

검색된 각 MCP 도구는 `DiscoveredMCPTool` 인스턴스로 감싸지며, 다음을 수행합니다:

- **확인 로직을 처리합니다:** 서버 신뢰 설정 및 사용자 환경설정에 기반합니다.
- **도구 실행을 관리합니다:** 적절한 매개변수로 MCP 서버를 호출합니다.
- **응답을 처리합니다:** LLM 컨텍스트와 사용자 화면 모두를 위해 응답을 처리합니다.
- **연결 상태를 유지하고:** 타임아웃을 처리합니다.

연결 손실 후, 현재 호출은 신뢰할 수 있는 서버가 신뢰할 수 있는 워크스페이스에서 실행되었고, 도구가 명시적으로 `idempotentHint: true`를 선언하거나, `destructiveHint: true` 또는 `idempotentHint: false`와 충돌하지 않는 `readOnlyHint: true`를 선언한 경우에만 재실행됩니다. 누락되거나 충돌하는 어노테이션, 그리고 신뢰할 수 없는 서버나 워크스페이스의 어노테이션은 응답이 손실되기 전에 서버가 부수 효과를 완료했을 수 있으므로 안전하지 않은 것으로 간주됩니다. 도구 작성자는 정확한 MCP 어노테이션을 제공해야 하며, 관리자는 서버 신뢰를 활성화하기 전에 어노테이션을 검증해야 합니다.

### 전송 메커니즘

CLI는 세 가지 MCP 전송 유형을 지원합니다:

- **Stdio 전송:** 서브프로세스를 생성하고 stdin/stdout을 통해 통신합니다.
- **SSE 전송:** Server-Sent Events 엔드포인트에 연결합니다.
- **Streamable HTTP 전송:** HTTP 스트리밍을 사용하여 통신합니다.

## MCP 서버 설정 방법

Qwen Code는 `settings.json` 파일의 `mcpServers` 구성을 사용하여 MCP 서버를 찾고 연결합니다. 이 구성은 다양한 전송 메커니즘을 사용하는 여러 서버를 지원합니다.

### settings.json에서 MCP 서버 구성

MCP 서버는 `settings.json` 파일에서 두 가지 주요 방식으로 구성할 수 있습니다: 특정 서버 정의를 위한 최상위 `mcpServers` 객체와 서버 검색 및 실행을 제어하는 전역 설정을 위한 `mcp` 객체입니다.

#### 전역 MCP 설정 (`mcp`)

`settings.json`의 `mcp` 객체를 사용하면 모든 MCP 서버에 대한 전역 규칙을 정의할 수 있습니다.

- **`mcp.serverCommand`** (string): MCP 서버를 시작하는 전역 명령어입니다.
- **`mcp.allowed`** (string 배열): 허용할 MCP 서버 이름 목록입니다. 이 값이 설정되면 이 목록(`mcpServers` 객체의 키와 일치하는)의 서버에만 연결됩니다.
- **`mcp.excluded`** (string 배열): 제외할 MCP 서버 이름 목록입니다. 이 목록의 서버에는 연결되지 않습니다.

**예시:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### 서버별 구성 (`mcpServers`)

`mcpServers` 객체는 CLI가 연결할 각 MCP 서버를 정의하는 곳입니다.

### 구성 구조

`settings.json` 파일에 `mcpServers` 객체를 추가합니다:

```json
{ ...file contains other config objects
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

### 구성 속성

각 서버 구성은 다음 속성을 지원합니다:

#### 필수 (다음 중 하나)

- **`command`** (string): Stdio 전송을 위한 실행 파일 경로
- **`url`** (string): SSE 엔드포인트 URL (예: `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): HTTP 스트리밍 엔드포인트 URL

#### 선택

- **`args`** (string[]): Stdio 전송을 위한 명령줄 인수
- **`headers`** (object): `url` 또는 `httpUrl` 사용 시 사용자 정의 HTTP 헤더
- **`env`** (object): 서버 프로세스를 위한 환경 변수. 값은 `$VAR_NAME` 또는 `${VAR_NAME}` 구문을 사용하여 환경 변수를 참조할 수 있습니다.
- **`cwd`** (string): Stdio 전송을 위한 작업 디렉터리
- **`timeout`** (number): 밀리초 단위의 요청 타임아웃 (기본값: 600,000ms = 10분)
- **`versionNegotiation`** (`"auto" | "legacy"`, 기본값: `"legacy"`): Stdio 서버의 경우, `"auto"`는 일회용 형제 프로세스에서 `server/discover` 프로브를 활성화합니다.
- **`trust`** (boolean): `true`일 때, 신뢰할 수 있는 워크스페이스에서 이 서버에 대한 도구 호출 확인을 건너뜁니다 (기본값: `false`)
- **`includeTools`** (string[]): 이 MCP 서버에서 포함할 도구 이름 목록입니다. 지정되면 이 목록에 있는 도구만 이 서버에서 사용할 수 있습니다(허용 목록 동작). 지정되지 않으면 서버의 모든 도구가 기본적으로 활성화됩니다.
- **`excludeTools`** (string[]): 이 MCP 서버에서 제외할 도구 이름 목록입니다. 여기에 나열된 도구는 서버에서 노출되더라도 모델에서 사용할 수 없습니다. **참고:** `excludeTools`는 `includeTools`보다 우선합니다. 도구가 두 목록 모두에 있으면 제외됩니다.
- **`targetAudience`** (string): 접근하려는 IAP 보호 애플리케이션에 허용 목록에 등록된 OAuth 클라이언트 ID입니다. `authProviderType: 'service_account_impersonation'`과 함께 사용됩니다.
- **`targetServiceAccount`** (string): 가장할 Google Cloud 서비스 계정의 이메일 주소입니다. `authProviderType: 'service_account_impersonation'`과 함께 사용됩니다.

### 원격 MCP 서버를 위한 OAuth 지원

Qwen Code는 SSE 또는 HTTP 전송을 사용하는 원격 MCP 서버에 대해 OAuth 2.0 인증을 지원합니다. 이를 통해 인증이 필요한 MCP 서버에 안전하게 접근할 수 있습니다.

#### 자동 OAuth 검색

OAuth 검색을 지원하는 서버의 경우, OAuth 구성을 생략하고 CLI가 자동으로 검색하도록 할 수 있습니다:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

CLI는 자동으로 다음 작업을 수행합니다:

- 서버가 OAuth 인증을 요구할 때 감지 (401 응답)
- 서버 메타데이터에서 OAuth 엔드포인트 검색
- 지원되는 경우 동적 클라이언트 등록 수행
- OAuth 흐름 및 토큰 관리 처리

#### 인증 흐름

OAuth 지원 서버에 연결할 때:

1. **초기 연결 시도**가 401 Unauthorized로 실패합니다.
2. **OAuth 검색**이 인증 및 토큰 엔드포인트를 찾습니다.
3. **브라우저가 열려** 사용자 인증을 수행합니다 (로컬 브라우저 접근 필요).
4. **인증 코드**가 접근 토큰으로 교환됩니다.
5. **토큰이 안전하게 저장되어** 향후 사용에 대비합니다.
6. **연결 재시도**가 유효한 토큰으로 성공합니다.

#### 브라우저 리디렉션 요구사항

**중요:** OAuth 인증은 리디렉션 URI가 접근 가능해야 합니다:

- **기본 동작:** `http://localhost:7777/oauth/callback`으로 리디렉션 (로컬 설정에서 작동)
- **사용자 정의 리디렉션 URI:** `--oauth-redirect-uri`를 사용하거나 settings.json에서 `redirectUri`를 설정하여 `/oauth/callback`으로 끝나는 공개 URL을 지정합니다. 해당 경로를 Qwen Code가 실행 중인 머신의 `http://127.0.0.1:7777/oauth/callback`으로 리버스 프록시합니다.

**원격/클라우드 서버 배포**의 경우 (예: 웹 터미널, SSH 세션, 클라우드 IDE):

- 기본 `localhost` 리디렉션은 작동하지 않습니다.
- `/oauth/callback`으로 끝나는 공개 가능 URL을 가리키는 사용자 정의 `redirectUri`를 구성해야 합니다.
- 리버스 프록시에서 TLS를 종료하고 해당 경로만 `http://127.0.0.1:7777/oauth/callback`으로 포워딩합니다.

원격 서버 예시:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth가 작동하지 않는 경우:

- 브라우저 접근이 없는 헤드리스 환경
- 설정된 `redirectUri`가 사용자의 브라우저에서 접근 불가능한 환경

#### OAuth 인증 관리

대화형 Qwen Code 세션 내에서 `/mcp` 대화 상자를 사용하여 MCP 서버를 검사하고 OAuth 인증을 관리합니다.

#### OAuth 구성 속성

- **`enabled`** (boolean): 이 서버에 OAuth를 활성화합니다.
- **`clientId`** (string): OAuth 클라이언트 식별자 (동적 등록 시 선택)
- **`clientSecret`** (string): OAuth 클라이언트 시크릿 (공개 클라이언트의 경우 선택)
- **`authorizationUrl`** (string): OAuth 인증 엔드포인트 (생략 시 자동 검색)
- **`tokenUrl`** (string): OAuth 토큰 엔드포인트 (생략 시 자동 검색)
- **`scopes`** (string[]): 필수 OAuth 스코프
- **`redirectUri`** (string): 사용자 정의 리디렉션 URI. **원격 배포에 중요:** 기본값은 `http://localhost:7777/oauth/callback`입니다. 원격 사용 시 `/oauth/callback`으로 끝나는 공개 URL을 설정하고 로컬 콜백 리스너로 리버스 프록시합니다. `qwen mcp add --oauth-redirect-uri` 또는 settings.json에서 직접 구성할 수 있습니다.
- **`tokenParamName`** (string): SSE URL에서 토큰을 위한 쿼리 매개변수 이름
- **`audiences`** (string[]): 토큰이 유효한 대상 목록

#### 토큰 관리

OAuth 토큰은 자동으로 다음 작업이 수행됩니다:

- **저장:** 기본적으로 `~/.qwen/mcp-oauth-tokens.json`에 저장됩니다 (평문, 모드 0600). `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`가 설정되면, Qwen Code는 사용 가능한 경우 키체인 기반 스토리지를 사용하거나 AES-256-GCM 암호화가 적용된 `~/.qwen/mcp-oauth-tokens-v2.json`을 사용합니다.
- **갱신:** 만료 시 (리프레시 토큰이 사용 가능한 경우)
- **검증:** 각 연결 시도 전에
- **정리:** 유효하지 않거나 만료된 경우

> [!WARNING]
> 기본적으로 OAuth 토큰은 디스크에 암호화되지 않은 상태로 저장됩니다. 공유 또는 다중 사용자 머신에서는 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`를 설정하여 자격 증명을 보호하세요.

#### 인증 제공자 유형

`authProviderType` 속성을 사용하여 인증 제공자 유형을 지정할 수 있습니다:

- **`authProviderType`** (string): 인증 제공자를 지정합니다. 다음 중 하나일 수 있습니다:
  - **`dynamic_discovery`** (기본값): CLI가 서버에서 OAuth 구성을 자동으로 검색합니다.
  - **`google_credentials`**: CLI가 Google 애플리케이션 기본 자격 증명(ADC)을 사용하여 서버를 인증합니다. 이 제공자를 사용할 때 필수 스코프를 지정해야 합니다.
  - **`service_account_impersonation`**: CLI가 Google Cloud 서비스 계정을 가장하여 서버를 인증합니다. IAP 보호 서비스에 접근하는 데 유용합니다 (Cloud Run 서비스를 위해 특별히 설계되었습니다).

#### Google 자격 증명

```json
{
  "mcpServers": {
    "googleCloudServer": {
      "httpUrl": "https://my-gcp-service.run.app/mcp",
      "authProviderType": "google_credentials",
      "oauth": {
        "scopes": ["https://www.googleapis.com/auth/userinfo.email"]
      }
    }
  }
}
```

#### 서비스 계정 가장

서비스 계정 가장(Service Account Impersonation)을 사용하여 서버를 인증하려면, `authProviderType`을 `service_account_impersonation`으로 설정하고 다음 속성을 제공해야 합니다:

- **`targetAudience`** (string): 접근하려는 IAP 보호 애플리케이션에 허용 목록에 등록된 OAuth 클라이언트 ID입니다.
- **`targetServiceAccount`** (string): 가장할 Google Cloud 서비스 계정의 이메일 주소입니다.

CLI는 로컬 애플리케이션 기본 자격 증명(ADC)을 사용하여 지정된 서비스 계정과 대상에 대한 OIDC ID 토큰을 생성합니다. 이 토큰은 MCP 서버를 인증하는 데 사용됩니다.

#### 설정 지침

1. **OAuth 2.0 클라이언트 ID를 [생성](https://cloud.google.com/iap/docs/oauth-client-creation)하거나 기존 ID를 사용합니다.** 기존 OAuth 2.0 클라이언트 ID를 사용하려면 [OAuth 클라이언트 공유 방법](https://cloud.google.com/iap/docs/sharing-oauth-clients)의 단계를 따르세요.
2. **애플리케이션의 [프로그래밍 방식 접근](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) 허용 목록에 OAuth ID를 추가합니다.** Cloud Run은 아직 gcloud iap에서 지원되는 리소스 유형이 아니므로, 프로젝트에 클라이언트 ID를 허용 목록에 추가해야 합니다.
3. **서비스 계정을 생성합니다.** [문서](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Cloud Console 링크](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Cloud Run 서비스 자체의 "Security" 탭 또는 gcloud를 통해 서비스 계정과 사용자를 모두 IAP 정책에 추가합니다.**
5. **MCP 서버에 접근하는 모든 사용자와 그룹에게** [서비스 계정을 가장](https://cloud.google.com/docs/authentication/use-service-account-impersonation)하는 데 필요한 권한(즉, `roles/iam.serviceAccountTokenCreator`)을 부여합니다.
6. **프로젝트에 대해 [IAM Credentials API를 활성화](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com)합니다.**

### 구성 예시

#### Python MCP 서버 (Stdio)

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

#### Node.js MCP 서버 (Stdio)

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["dist/server.js", "--verbose"],
      "cwd": "./mcp-servers/node",
      "trust": true
    }
  }
}
```

#### Docker 기반 MCP 서버

```json
{
  "mcpServers": {
    "dockerizedServer": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "API_KEY",
        "-v",
        "${PWD}:/workspace",
        "my-mcp-server:latest"
      ],
      "env": {
        "API_KEY": "$EXTERNAL_SERVICE_TOKEN"
      }
    }
  }
}
```

#### HTTP 기반 MCP 서버

```json
{
  "mcpServers": {
    "httpServer": {
      "httpUrl": "http://localhost:3000/mcp",
      "timeout": 5000
    }
  }
}
```

#### 사용자 정의 헤더가 포함된 HTTP 기반 MCP 서버

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token",
        "X-Custom-Header": "custom-value",
        "Content-Type": "application/json"
      },
      "timeout": 5000
    }
  }
}
```

#### 도구 필터링이 포함된 MCP 서버

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      // "excludeTools": ["dangerous_tool", "file_deleter"],
      "timeout": 30000
    }
  }
}
```

### 서비스 계정 가장을 사용한 SSE MCP 서버

```json
{
  "mcpServers": {
    "myIapProtectedServer": {
      "url": "https://my-iap-service.run.app/sse",
      "authProviderType": "service_account_impersonation",
      "targetAudience": "YOUR_IAP_CLIENT_ID.apps.googleusercontent.com",
      "targetServiceAccount": "your-sa@your-project.iam.gserviceaccount.com"
    }
  }
}
```

## 검색 과정 상세 분석

Qwen Code가 시작되면 다음 상세 과정을 통해 MCP 서버 검색을 수행합니다:

### 1. 서버 순회 및 연결

`mcpServers`의 각 설정된 서버에 대해:

1. **상태 추적 시작:** 서버 상태가 `CONNECTING`으로 설정됩니다.
2. **전송 선택:** 구성 속성에 기반합니다:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **연결 수립:** MCP 클라이언트가 설정된 타임아웃으로 연결을 시도합니다.
4. **오류 처리:** 연결 실패가 기록되고 서버 상태가 `DISCONNECTED`로 설정됩니다.

### 2. 도구 검색

연결 성공 후:

1. **도구 나열:** 클라이언트가 MCP 서버의 도구 나열 엔드포인트를 호출합니다.
2. **스키마 검증:** 각 도구의 함수 선언이 검증됩니다.
3. **도구 필터링:** `includeTools` 및 `excludeTools` 구성에 기반하여 도구가 필터링됩니다.
4. **이름 정리:** 도구 이름은 Qwen API 요구사항을 충족하도록 정리됩니다:
   - 유효하지 않은 문자(영숫자, 밑줄, 점, 하이픈 이외)는 밑줄로 대체됩니다.
   - 63자를 초과하는 이름은 중간 대체(`___`)와 함께 잘립니다.

### 3. 충돌 해결

여러 서버가 같은 이름의 도구를 노출하는 경우:

1. **선 등록 우선:** 도구 이름을 먼저 등록한 서버가 접두사 없는 이름을 가져갑니다.
2. **자동 접두사 부여:** 이후 서버는 접두사가 부여된 이름을 가져갑니다: `serverName__toolName`
3. **레지스트리 추적:** 도구 레지스트리가 서버 이름과 도구 간 매핑을 유지합니다.

### 4. 스키마 처리

도구 매개변수 스키마는 API 호환성을 위해 정리됩니다:

- **`$schema` 속성**이 제거됩니다.
- **`additionalProperties`**가 제거됩니다.
- **`default`가 포함된 `anyOf`**는 기본값이 제거됩니다 (Vertex AI 호환성).
- **재귀적 처리**가 중첩 스키마에 적용됩니다.

### 5. 연결 관리

검색 후:

- **지속적 연결:** 도구를 성공적으로 등록한 서버는 연결을 유지합니다.
- **정리:** 사용 가능한 도구를 제공하지 않는 서버의 연결은 종료됩니다.
- **상태 업데이트:** 최종 서버 상태가 `CONNECTED` 또는 `DISCONNECTED`로 설정됩니다.

## 도구 실행 흐름

모델이 MCP 도구를 사용하기로 결정하면 다음 실행 흐름이 발생합니다:

### 1. 도구 호출

모델은 다음을 포함한 `FunctionCall`을 생성합니다:

- **도구 이름:** 등록된 이름 (접두사가 포함될 수 있음)
- **인수:** 도구의 매개변수 스키마에 일치하는 JSON 객체

### 2. 확인 과정

각 `DiscoveredMCPTool`은 정교한 확인 로직을 구현합니다:

#### 신뢰 기반 우회

```typescript
if (this.trust === true && this.cliConfig?.isTrustedFolder()) {
  return 'allow';
}
return 'ask';
```

#### 동적 허용 목록

시스템은 다음에 대한 내부 허용 목록을 유지합니다:

- **서버 수준:** `serverName` → 이 서버의 모든 도구가 신뢰됩니다.
- **도구 수준:** `serverName.toolName` → 이 특정 도구가 신뢰됩니다.

#### 사용자 선택 처리

확인이 필요할 때, 사용자는 다음을 선택할 수 있습니다:

- **한 번만 실행:** 이번에만 실행합니다.
- **이 도구 항상 허용:** 도구 수준 허용 목록에 추가합니다.
- **이 서버 항상 허용:** 서버 수준 허용 목록에 추가합니다.
- **취소:** 실행을 중단합니다.

### 3. 실행

확인 후 (또는 신뢰 우회 후):

1. **매개변수 준비:** 인수가 도구의 스키마에 대해 검증됩니다.
2. **MCP 호출:** 내부 `CallableTool`이 서버를 호출합니다:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // 원래 서버 도구 이름
       args: params,
     },
   ];
   ```

3. **응답 처리:** 결과가 LLM 컨텍스트와 사용자 화면을 위해 포맷됩니다.

### 4. 응답 처리

실행 결과는 다음을 포함합니다:

- **`llmContent`:** 언어 모델의 컨텍스트를 위한 원시 응답 부분
- **`returnDisplay`:** 사용자 화면을 위한 포맷된 출력 (종종 마크다운 코드 블록의 JSON)

## MCP 서버와 상호작용하는 방법

### `/mcp` 명령어 사용

`/mcp` 명령어는 MCP 서버 설정에 대한 종합적인 정보를 제공합니다:

```bash
/mcp
```

다음을 표시합니다:

- **서버 목록:** 구성된 모든 MCP 서버
- **연결 상태:** `CONNECTED`, `CONNECTING`, 또는 `DISCONNECTED`
- **서버 세부정보:** 구성 요약 (민감한 데이터 제외)
- **사용 가능한 도구:** 각 서버의 도구 목록과 설명
- **검색 상태:** 전체 검색 과정 상태

### `/mcp` 출력 예시

```
MCP Servers Status:

📡 pythonTools (CONNECTED)
  Command: python -m my_mcp_server --port 8080
  Working Directory: ./mcp-servers/python
  Timeout: 15000ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Command: node dist/server.js --verbose
  Error: Connection refused

🐳 dockerizedServer (CONNECTED)
  Command: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Discovery State: COMPLETED
```

### 도구 사용

한번 검색되면, MCP 도구는 내장 도구와 마찬가지로 Qwen 모델에서 사용할 수 있습니다. 모델은 자동으로 다음을 수행합니다:

1. **적절한 도구를 선택합니다:** 요청에 기반합니다.
2. **확인 대화 상자를 표시합니다:** 서버가 신뢰되지 않는 한.
3. **적절한 매개변수로 도구를 실행합니다.**
4. **사용자 친화적인 형식으로 결과를 표시합니다.**

## 상태 모니터링 및 문제 해결

### 연결 상태

MCP 통합은 여러 상태를 추적합니다:

#### 서버 상태 (`MCPServerStatus`)

- **`DISCONNECTED`:** 서버가 연결되지 않았거나 오류가 있습니다.
- **`CONNECTING`:** 연결 시도 중입니다.
- **`CONNECTED`:** 서버가 연결되어 준비되었습니다.

#### 검색 상태 (`MCPDiscoveryState`)

- **`NOT_STARTED`:** 검색이 시작되지 않았습니다.
- **`IN_PROGRESS`:** 현재 서버를 검색 중입니다.
- **`COMPLETED`:** 검색이 완료되었습니다 (오류 유무와 관계없이).

### 일반적인 문제와 해결 방법

#### 서버가 연결되지 않음

**증상:** 서버가 `DISCONNECTED` 상태를 표시합니다.

**문제 해결:**

1. **구성을 확인합니다:** `command`, `args`, `cwd`가 올바른지 확인합니다.
2. **수동으로 테스트합니다:** 서버 명령어를 직접 실행하여 작동하는지 확인합니다.
3. **의존성을 확인합니다:** 필요한 패키지가 모두 설치되어 있는지 확인합니다.
4. **로그를 검토합니다:** CLI 출력에서 오류 메시지를 확인합니다.
5. **권한을 확인합니다:** CLI가 서버 명령어를 실행할 수 있는지 확인합니다.

#### 도구가 검색되지 않음

**증상:** 서버는 연결되지만 사용 가능한 도구가 없습니다.

**문제 해결:**

1. **도구 등록을 확인합니다:** 서버가 실제로 도구를 등록하는지 확인합니다.
2. **MCP 프로토콜을 확인합니다:** 서버가 MCP 도구 나열을 올바르게 구현하는지 확인합니다.
3. **서버 로그를 검토합니다:** 서버 측 오류에 대한 stderr 출력을 확인합니다.
4. **도구 나열을 테스트합니다:** 서버의 도구 검색 엔드포인트를 수동으로 테스트합니다.

#### 도구가 실행되지 않음

**증상:** 도구가 검색되었지만 실행 중 실패합니다.

**문제 해결:**

1. **매개변수 검증:** 도구가 예상 매개변수를 수락하는지 확인합니다.
2. **스키마 호환성:** 입력 스키마가 유효한 JSON 스키마인지 확인합니다.
3. **오류 처리:** 도구에서 처리되지 않는 예외가 발생하는지 확인합니다.
4. **타임아웃 문제:** `timeout` 설정을 늘리는 것을 고려합니다.

#### 샌드박스 호환성

**증상:** 샌드박싱이 활성화된 상태에서 MCP 서버가 실패합니다.

**해결 방법:**

1. **Docker 기반 서버:** 모든 의존성을 포함한 Docker 컨테이너를 사용합니다.
2. **경로 접근성:** 샌드박스에서 서버 실행 파일을 사용할 수 있는지 확인합니다.
3. **네트워크 접근:** 필요한 네트워크 연결을 허용하도록 샌드박스를 구성합니다.
4. **환경 변수:** 필수 환경 변수가 전달되는지 확인합니다.

### 디버깅 팁

1. **디버그 모드를 활성화합니다:** `--debug`와 함께 CLI를 실행하여 자세한 출력을 확인합니다.
2. **stderr를 확인합니다:** MCP 서버의 stderr가 캡처되어 기록됩니다 (INFO 메시지는 필터링됨).
3. **격리 테스트:** 통합 전에 MCP 서버를 독립적으로 테스트합니다.
4. **단계적 설정:** 복잡한 기능을 추가하기 전에 간단한 도구부터 시작합니다.
5. **`/mcp`를 자주 사용합니다:** 개발 중에 서버 상태를 모니터링합니다.

## 중요 참고사항

### 보안 고려사항

- **신뢰 설정:** `trust` 옵션은 신뢰할 수 있는 워크스페이스에서만 도구 확인 대화 상자를 우회합니다. 주의해서 사용하며 완전히 제어하는 서버에만 적용하세요.
- **접근 토큰:** API 키나 토큰이 포함된 환경 변수를 구성할 때 보안을 인지하세요.
- **샌드박스 호환성:** 샌드박싱을 사용할 때 MCP 서버가 샌드박스 환경 내에서 사용 가능한지 확인하세요.
- **개인 데이터:** 광범위한 범위의 개인 접근 토큰을 사용하면 리포지토리 간 정보 유출이 발생할 수 있습니다.

### 성능 및 리소스 관리

- **연결 지속성:** CLI는 도구를 성공적으로 등록한 서버에 대한 지속적 연결을 유지합니다.
- **자동 정리:** 도구를 제공하지 않는 서버에 대한 연결은 자동으로 종료됩니다.
- **타임아웃 관리:** 서버의 응답 특성에 따라 적절한 타임아웃을 구성합니다.
- **리소스 모니터링:** MCP 서버는 별도 프로세스로 실행되며 시스템 리소스를 소비합니다.

### 스키마 호환성

- **스키마 준수 모드:** 기본적으로 (`schemaCompliance: "auto"`), 도구 스키마는 ...

- **OpenAPI 3.0 변환:** `openapi_30` 모드가 활성화되면, 시스템이 다음을 처리합니다:
  - Nullable 유형: `["string", "null"]` -> `type: "string", nullable: true`
  - Const 값: `const: "foo"` -> `enum: ["foo"]`
  - 배타적 한도: 숫자 `exclusiveMinimum` -> `minimum`을 포함한 부울 형태
  - 키워드 제거: `$schema`, `$id`, `dependencies`, `patternProperties`
- **이름 정리:** 도구 이름은 API 요구사항을 충족하도록 자동으로 정리됩니다.
- **충돌 해결:** 서버 간 도구 이름 충돌은 자동 접두사 부여를 통해 해결됩니다.

이러한 종합적인 통합을 통해 MCP 서버는 보안, 안정성, 사용 편의성을 유지하면서 CLI의 기능을 확장하는 강력한 방법을 제공합니다.

## 도구에서 풍부한 콘텐츠 반환

MCP 도구는 간단한 텍스트 반환에만 제한되지 않습니다. 텍스트, 이미지, 오디오 및 기타 이진 데이터를 포함한 풍부한 다중 부분 콘텐츠를 단일 도구 응답으로 반환할 수 있습니다. 이를 통해 단일 턴에서 모델에 다양한 정보를 제공할 수 있는 강력한 도구를 구축할 수 있습니다.

도구에서 반환된 모든 데이터가 처리되어 다음 생성을 위한 컨텍스트로 모델에 전달되므로, 모델이 제공된 정보를 추론하거나 요약할 수 있습니다.

### 작동 방식

풍부한 콘텐츠를 반환하려면, 도구의 응답이 [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result)에 대한 MCP 사양을 준수해야 합니다. 결과의 `content` 필드는 `ContentBlock` 객체의 배열이어야 합니다. CLI는 이 배열을 올바르게 처리하여 텍스트와 이진 데이터를 분리하고 모델을 위해 패키징합니다.

`content` 배열에서 다양한 콘텐츠 블록 유형을 혼합하여 사용할 수 있습니다. 지원되는 블록 유형은 다음과 같습니다:

- `text`
- `image`
- `audio`
- `resource` (임베디드 콘텐츠)
- `resource_link`

### 예시: 텍스트와 이미지 반환

다음은 텍스트 설명과 이미지 모두를 반환하는 MCP 도구의 유효한 JSON 응답 예시입니다:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Here is the logo you requested."
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "The logo was created in 2025."
    }
  ]
}
```

Qwen Code가 이 응답을 받으면:

1. 모든 텍스트를 추출하여 모델을 위한 단일 `functionResponse` 부분으로 결합합니다.
2. 이미지 데이터를 별도의 `inlineData` 부분으로 제공합니다.
3. CLI에 깔끔하고 사용자 친화적인 요약을 표시하여 텍스트와 이미지 모두를 수신했음을 나타냅니다.

이를 통해 Qwen 모델에 풍부한 멀티모달 컨텍스트를 제공할 수 있는 정교한 도구를 구축할 수 있습니다.

## MCP 프롬프트를 슬래시 명령어로 사용

도구 외에도, MCP 서버는 미리 정의된 프롬프트를 노출할 수 있으며, 이를 Qwen Code 내에서 슬래시 명령어로 실행할 수 있습니다. 이를 통해 이름으로 쉽게 호출할 수 있는 일반적이거나 복잡한 쿼리에 대한 단축키를 만들 수 있습니다.

### 서버에서 프롬프트 정의

다음은 프롬프트를 정의하는 stdio MCP 서버의 작은 예시입니다:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

server.registerPrompt(
  'poem-writer',
  {
    title: 'Poem Writer',
    description: 'Write a nice haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write a haiku${mood ? ` with the mood ${mood}` : ''} called ${title}. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables `,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

이는 `settings.json`의 `mcpServers`에 다음으로 포함할 수 있습니다:

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["filename.ts"]
    }
  }
}
```

### 프롬프트 호출

프롬프트가 검색되면, 이름을 슬래시 명령어로 사용하여 호출할 수 있습니다. CLI가 자동으로 인수 파싱을 처리합니다.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

또는 위치 인수를 사용하여:

```bash
/poem-writer "Qwen Code" reverent
```

이 명령어를 실행하면, CLI는 제공된 인수로 MCP 서버에서 `prompts/get` 메서드를 실행합니다. 서버는 프롬프트 템플릿에 인수를 대체하고 최종 프롬프트 텍스트를 반환하는 역할을 합니다. CLI는 이 프롬프트를 모델에 전송하여 실행합니다. 이를 통해 일반적인 워크플로를 자동화하고 공유하는 편리한 방법을 제공합니다.

## `qwen mcp`로 MCP 서버 관리

`settings.json` 파일을 수동으로 편집하여 MCP 서버를 항상 구성할 수 있지만, CLI는 서버 구성을 프로그래밍 방식으로 관리할 수 있는 편리한 명령어 세트를 제공합니다. 이 명령어를 사용하면 JSON 파일을 직접 편집하지 않고도 MCP 서버를 추가, 나열, 제거하는 과정을 간소화할 수 있습니다.

### 서버 추가 (`qwen mcp add`)

`add` 명령어는 `settings.json`에 새 MCP 서버를 구성합니다. 범위(`-s, --scope`)에 따라 사용자 구성 `~/.qwen/settings.json` 또는 프로젝트 구성 `.qwen/settings.json` 파일에 추가됩니다.

**명령어:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: 서버의 고유한 이름입니다.
- `<commandOrUrl>`: 실행할 명령어(`stdio`용) 또는 URL(`http`/`sse`용)입니다.
- `[args...]`: `stdio` 명령어의 선택적 인수입니다.

**옵션 (플래그):**

- `-s, --scope`: 구성 범위 (user 또는 project). [기본값: "project"]
- `-t, --transport`: 전송 유형 (stdio, sse, http). [기본값: "stdio"]
- `-e, --env`: 환경 변수를 설정합니다 (예: -e KEY=value).
- `-H, --header`: SSE 및 HTTP 전송을 위한 HTTP 헤더를 설정합니다 (예: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: 밀리초 단위의 연결 타임아웃을 설정합니다.
- `--trust`: 서버를 신뢰합니다 (신뢰할 수 있는 워크스페이스에서 도구 호출 확인을 우회합니다).
- `--description`: 서버의 설명을 설정합니다.
- `--include-tools`: 포함할 도구의 쉼표로 구분된 목록입니다.
- `--exclude-tools`: 제외할 도구의 쉼표로 구분된 목록입니다.
- `--oauth-client-id`: MCP 서버 인증을 위한 OAuth 클라이언트 ID입니다.
- `--oauth-client-secret`: MCP 서버 인증을 위한 OAuth 클라이언트 시크릿입니다.
- `--oauth-redirect-uri`: OAuth 리디렉션 URI (예: `https://your-server.com/oauth/callback`). 로컬 설정의 기본값은 `http://localhost:7777/oauth/callback`입니다. **원격 배포에 중요:** `/oauth/callback`으로 끝나는 공개 URL을 사용하고 `http://127.0.0.1:7777/oauth/callback`으로 리버스 프록시합니다.
- `--oauth-authorization-url`: OAuth 인증 URL입니다.
- `--oauth-token-url`: OAuth 토큰 URL입니다.
- `--oauth-scopes`: OAuth 스코프 (쉼표로 구분).

#### stdio 서버 추가

로컬 서버를 실행하기 위한 기본 전송입니다.

```bash
# 기본 구문
qwen mcp add <name> <command> [args...]

# 예시: 로컬 서버 추가
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 예시: 로컬 Python 서버 추가
qwen mcp add python-server python server.py --port 8080
```

#### HTTP 서버 추가

이 전송은 스트리밍 가능한 HTTP 전송을 사용하는 서버를 위한 것입니다.

```bash
# 기본 구문
qwen mcp add --transport http <name> <url>

# 예시: HTTP 서버 추가
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 예시: 인증 헤더가 포함된 HTTP 서버 추가
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### SSE 서버 추가

이 전송은 Server-Sent Events (SSE)를 사용하는 서버를 위한 것입니다.

```bash
# 기본 구문
qwen mcp add --transport sse <name> <url>

# 예시: SSE 서버 추가
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 예시: 인증 헤더가 포함된 SSE 서버 추가
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# 예시: OAuth가 활성화된 SSE 서버 추가
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### 서버 관리 (`/mcp`)

현재 구성된 모든 MCP 서버를 보고 관리하려면, 대화형 Qwen Code 세션 내에서 `/mcp` 대화 상자를 엽니다. 이 대화 상자에서 다음을 수행할 수 있습니다:

- 연결 상태와 함께 모든 MCP 서버를 보기
- 서버 활성화/비활성화
- 연결이 끊어진 서버에 재연결
- 각 서버에서 제공하는 도구 및 프롬프트 보기
- 서버 로그 보기

**명령어:**

```bash
qwen
```

그런 다음 입력:

```text
/mcp
```

관리 대화 상자는 각 서버의 이름, 구성 세부정보, 연결 상태, 사용 가능한 도구/프롬프트를 보여주는 시각적 인터페이스를 제공합니다.

### 서버 제거 (`qwen mcp remove`)

구성에서 서버를 삭제하려면, 서버 이름과 함께 `remove` 명령어를 사용합니다.

**명령어:**

```bash
qwen mcp remove <name>
```

**예시:**

```bash
qwen mcp remove my-server
```

이 명령어는 범위(`-s, --scope`)에 따라 적절한 `settings.json` 파일의 `mcpServers` 객체에서 "my-server" 항목을 찾아 삭제합니다.
