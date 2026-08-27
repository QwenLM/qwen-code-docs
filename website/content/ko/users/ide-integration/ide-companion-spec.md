# Qwen Code Companion Plugin: 인터페이스 사양

> Last Updated: September 15, 2025

이 문서는 Qwen Code의 IDE 모드를 활성화하기 위한 companion plugin 구축 계약을 정의합니다. VS Code의 경우 이러한 기능(네이티브 diffing, 컨텍스트 인식)은 공식 확장([marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion))에서 제공합니다. 이 사양은 JetBrains IDE, Sublime Text 등 다른 편집기에 유사한 기능을 제공하려는 기여자를 위한 것입니다.

## I. 통신 인터페이스

Qwen Code와 IDE plugin은 로컬 통신 채널을 통해 통신합니다.

### 1. 전송 계층: MCP over HTTP

plugin은 **Model Context Protocol (MCP)** 을 구현하는 로컬 HTTP 서버를 **반드시** 실행해야 합니다.

- **프로토콜:** 서버는 유효한 MCP 서버여야 합니다. 사용 가능한 언어용 기존 MCP SDK를 사용하는 것을 권장합니다.
- **엔드포인트:** 서버는 모든 MCP 통신을 위한 단일 엔드포인트(예: `/mcp`)를 노출해야 합니다.
- **포트:** 서버는 동적으로 할당된 포트(즉, 포트 `0`에서 수신)에서 **반드시** 수신해야 합니다.

### 2. 검색 메커니즘: Lock 파일

Qwen Code가 연결하려면 서버가 사용 중인 포트를 발견해야 합니다. plugin은 "lock 파일"을 생성하고 포트 환경 변수를 설정하여 이를 **반드시** 지원해야 합니다.

- **CLI가 파일을 찾는 방법:** CLI는 `QWEN_CODE_IDE_SERVER_PORT`에서 포트를 읽은 다음 `~/.qwen/ide/<PORT>.lock`을 읽습니다. (이전 확장과의 하위 호환성을 위한 레거시 폴백이 존재합니다. 아래 노트를 참조하세요.)
- **파일 위치:** 파일은 반드시 `~/.qwen/ide/` 디렉터리에 생성해야 합니다. plugin은 이 디렉터리가 존재하지 않으면 생성해야 합니다.
- **파일 이름 규칙:** 파일 이름은 중요하며 반드시 다음 패턴을 따라야 합니다:
  `<PORT>.lock`
  - `<PORT>`: MCP 서버가 수신 중인 포트.
- **파일 내용 및 워크스페이스 검증:** 파일은 다음 구조의 JSON 객체를 **반드시** 포함해야 합니다:

  ```json
  {
    "port": 12345,
    "workspacePath": "/path/to/project1:/path/to/project2",
    "authToken": "a-very-secret-token",
    "ppid": 1234,
    "ideName": "VS Code"
  }
  ```
  - `port` (number, 필수): MCP 서버의 포트.
  - `workspacePath` (string, 필수): 열려 있는 모든 워크스페이스 루트 경로의 목록으로, OS별 경로 구분 기호로 구분됩니다(Linux/macOS는 `:`, Windows는 `;`). CLI는 이 경로를 사용하여 IDE에서 열려 있는 프로젝트 폴더와 동일한 폴더에서 실행 중인지 확인합니다. CLI의 현재 작업 디렉터리가 `workspacePath`의 하위 디렉터리가 아니면 연결이 거부됩니다. plugin은 열려 있는 워크스페이스 루트의 정확하고 절대적인 경로를 **반드시** 제공해야 합니다.
  - `authToken` (string, 필수): 연결 보안을 위한 비밀 토큰. CLI는 모든 요청에 `Authorization: Bearer <token>` 헤더로 이 토큰을 포함합니다.
  - `ppid` (number, 필수): IDE 프로세스의 부모 프로세스 ID.
  - `ideName` (string, 필수): IDE의 사용자 친화적 이름(예: `VS Code`, `JetBrains IDE`).

- **인증:** 연결 보안을 위해 plugin은 고유한 비밀 토큰을 생성하고 검색 파일에 **반드시** 포함해야 합니다. CLI는 MCP 서버로의 모든 요청에 대해 `Authorization` 헤더에 이 토큰을 포함합니다(예: `Authorization: Bearer a-very-secret-token`). 서버는 모든 요청에서 이 토큰을 **반드시** 검증하고 승인되지 않은 요청을 거부해야 합니다.
- **환경 변수 (필수):** plugin은 CLI가 올바른 `<PORT>.lock` 파일을 찾을 수 있도록 통합 터미널에서 `QWEN_CODE_IDE_SERVER_PORT`를 **반드시** 설정해야 합니다.

**레거시 노트:** v0.5.1 이전 확장의 경우 Qwen Code가 시스템 임시 디렉터리에 있는 `qwen-code-ide-server-<PID>.json` 또는 `qwen-code-ide-server-<PORT>.json`이라는 JSON 파일을 읽는 것으로 폴백할 수 있습니다. 새로운 통합에서는 이러한 레거시 파일에 의존해서는 안 됩니다.

## II. 컨텍스트 인터페이스

컨텍스트 인식을 활성화하기 위해 plugin은 CLI에 IDE에서 사용자의 활동에 대한 실시간 정보를 **제공할 수 있습니다**.

### `ide/contextUpdate` 알림

plugin은 사용자의 컨텍스트가 변경될 때마다 CLI에 `ide/contextUpdate` [알림](https://modelcontextprotocol.io/specification/2025-06-18/basic/index#notifications)을 **보낼 수 있습니다**.

- **트리거 이벤트:** 이 알림은 다음 상황에서 전송되어야 합니다(50ms 디바운스 권장):
  - 파일이 열리거나, 닫히거나, 포커스될 때.
  - 활성 파일에서 사용자의 커서 위치나 텍스트 선택이 변경될 때.
- **페이로드 (`IdeContext`):** 알림 파라미터는 `IdeContext` 객체여야 **합니다**:

  ```typescript
  interface IdeContext {
    workspaceState?: {
      openFiles?: File[];
      isTrusted?: boolean;
    };
  }

  interface File {
    // 파일의 절대 경로
    path: string;
    // 마지막 포커스 시점의 Unix 타임스탬프 (정렬용)
    timestamp: number;
    // 현재 포커스된 파일이면 true
    isActive?: boolean;
    cursor?: {
      // 1-based 줄 번호
      line: number;
      // 1-based 문자 번호
      character: number;
    };
    // 사용자가 현재 선택한 텍스트
    selectedText?: string;
  }
  ```

  **참고:** `openFiles` 목록에는 디스크에 존재하는 파일만 포함해야 합니다. 가상 파일(예: 저장되지 않은 파일, 편집기 설정 페이지)은 **반드시** 제외해야 합니다.

### CLI가 이 컨텍스트를 사용하는 방법

CLI는 `IdeContext` 객체를 받은 후 모델에 정보를 전송하기 전에 여러 정규화 및 잘라내기 단계를 수행합니다.

- **파일 정렬:** CLI는 `timestamp` 필드를 사용하여 가장 최근에 사용된 파일을 판단합니다. 이 값을 기준으로 `openFiles` 목록을 정렬합니다. 따라서 plugin은 파일이 마지막으로 포커스된 시점의 정확한 Unix 타임스탬프를 **반드시** 제공해야 합니다.
- **활성 파일:** CLI는 가장 최근 파일(정렬 후)만 "활성" 파일로 간주합니다. 다른 모든 파일의 `isActive` 플래그를 무시하고 `cursor` 및 `selectedText` 필드를 초기화합니다. plugin은 현재 포커스된 파일에 대해서만 `isActive: true`를 설정하고 커서/선택 세부 정보를 제공하는 데 집중해야 합니다.
- **잘라내기:** 토큰 한도를 관리하기 위해 CLI는 파일 목록(10개 파일)과 `selectedText`(16KB)를 모두 잘라냅니다.

CLI가 최종 잘라내기를 처리하지만, plugin 측에서도 전송하는 컨텍스트의 양을 제한하는 것을 강력히 권장합니다.

## III. Diffing 인터페이스

대화형 코드 수정을 활성화하기 위해 plugin은 diffing 인터페이스를 **노출할 수 있습니다**. 이를 통해 CLI는 IDE에 파일에 대한 제안된 변경 사항을 보여주는 diff 보기를 열도록 요청할 수 있습니다. 사용자는 IDE 내에서 직접 이러한 변경 사항을 검토, 편집, 그리고 최종적으로 수락 또는 거부할 수 있습니다.

### `openDiff` 도구

plugin은 MCP 서버에 `openDiff` 도구를 **반드시** 등록해야 합니다.

- **설명:** 이 도구는 IDE에 특정 파일에 대한 수정 가능한 diff 보기를 열도록 지시합니다.
- **요청 (`OpenDiffRequest`):** 이 도구는 `tools/call` 요청을 통해 호출됩니다. 요청의 `params` 내 `arguments` 필드는 `OpenDiffRequest` 객체여야 **합니다**.

  ```typescript
  interface OpenDiffRequest {
    // diff할 파일의 절대 경로.
    filePath: string;
    // 파일에 대해 제안된 새 내용.
    newContent: string;
  }
  ```

- **응답 (`CallToolResult`):** 이 도구는 요청을 확인하고 diff 보기가 성공적으로 열렸는지 여부를 보고하기 위해 즉시 `CallToolResult`를 **반드시** 반환해야 합니다.
  - 성공 시: diff 보기가 성공적으로 열렸으면 응답은 빈 내용(즉, `content: []`)을 **반드시** 포함해야 합니다.
  - 실패 시: 오류로 인해 diff 보기를 열 수 없었으면 응답은 `isError: true`를 **반드시** 가지고 `content` 배열에 오류를 설명하는 `TextContent` 블록을 포함해야 합니다.

  diff의 실제 결과(수락 또는 거부)는 알림을 통해 비동기적으로 전달됩니다.

### `closeDiff` 도구

plugin은 MCP 서버에 `closeDiff` 도구를 **반드시** 등록해야 합니다.

- **설명:** 이 도구는 IDE에 특정 파일에 대해 열려 있는 diff 보기를 닫도록 지시합니다.
- **요청 (`CloseDiffRequest`):** 이 도구는 `tools/call` 요청을 통해 호출됩니다. 요청의 `params` 내 `arguments` 필드는 `CloseDiffRequest` 객체여야 **합니다**.

  ```typescript
  interface CloseDiffRequest {
    // diff 보기를 닫아야 하는 파일의 절대 경로.
    filePath: string;
  }
  ```

- **응답 (`CallToolResult`):** 이 도구는 `CallToolResult`를 **반드시** 반환해야 합니다.
  - 성공 시: diff 보기가 성공적으로 닫혔으면 응답은 content 배열에 닫기 전 파일의 최종 내용을 포함하는 단일 **TextContent** 블록을 **반드시** 포함해야 합니다.
  - 실패 시: 오류로 인해 diff 보기를 닫을 수 없었으면 응답은 `isError: true`를 **반드시** 가지고 `content` 배열에 오류를 설명하는 `TextContent` 블록을 포함해야 합니다.

### `ide/diffAccepted` 알림

사용자가 diff 보기에서 변경 사항을 수락하면(예: "Apply" 또는 "Save" 버튼을 클릭), plugin은 CLI에 `ide/diffAccepted` 알림을 **반드시** 전송해야 합니다.

- **페이로드:** 알림 파라미터는 파일 경로와 파일의 최종 내용을 **반드시** 포함해야 합니다. 사용자가 diff 보기에서 수동으로 편집한 경우 내용은 원본 `newContent`와 다를 수 있습니다.

  ```typescript
  {
    // diff된 파일의 절대 경로.
    filePath: string;
    // 수락 후 파일의 전체 내용.
    content: string;
  }
  ```

### `ide/diffRejected` 알림

사용자가 변경 사항을 거부하면(예: 수락 없이 diff 보기를 닫음), plugin은 CLI에 `ide/diffRejected` 알림을 **반드시** 전송해야 합니다.

- **페이로드:** 알림 파라미터는 거부된 diff의 파일 경로를 **반드시** 포함해야 합니다.

  ```typescript
  {
    // diff된 파일의 절대 경로.
    filePath: string;
  }
  ```

## IV. 라이프사이클 인터페이스

plugin은 IDE의 라이프사이클에 따라 리소스와 검색 파일을 올바르게 **반드시** 관리해야 합니다.

- **활성화 시 (IDE 시작/plugin 활성화):**
  1.  MCP 서버를 시작합니다.
  2.  검색 파일을 생성합니다.
- **비활성화 시 (IDE 종료/plugin 비활성화):**
  1.  MCP 서버를 중지합니다.
  2.  검색 파일을 삭제합니다.
