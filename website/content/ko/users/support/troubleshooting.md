# 문제 해결

이 가이드는 일반적인 문제에 대한 해결 방법과 디버깅 팁을 제공합니다. 다음 주제를 다룹니다:

- 인증 또는 로그인 오류
- 자주 묻는 질문 (FAQ)
- 디버깅 팁
- 기존 GitHub Issue 검색 또는 새 Issue 생성

## 인증 또는 로그인 오류

- **오류: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **원인:** Qwen OAuth는 2026년 4월 15일부터 더 이상 사용할 수 없습니다.
  - **해결 방법:** 다른 인증 방법으로 전환하세요. `qwen` → `/auth`를 실행하고 다음 중 하나를 선택하세요:
    - **API Key**: Alibaba Cloud Model Studio의 API 키를 사용하세요([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). API 설정 가이드([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721))를 참조하세요.
    - **Alibaba Cloud Coding Plan**: 고정 월 요금제로 더 높은 할당량을 사용하세요. Coding Plan 가이드([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index))를 참조하세요.

- **오류: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 또는 `unable to get local issuer certificate`**
  - **원인:** SSL/TLS 트래픽을 가로채고 검사하는 방화벽이 있는 기업 네트워크에 있을 수 있습니다. 이 경우 Node.js에서 커스텀 루트 CA 인증서를 신뢰하도록 설정해야 합니다.
  - **해결 방법:** `NODE_EXTRA_CA_CERTS` 환경 변수를 기업 루트 CA 인증서 파일의 절대 경로로 설정하세요.
    - 예시: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **오류: 자체 서명된 엔드포인트에 대한 `Connection error. (cause: fetch failed)`**
  - **원인:** `https://` 배후의 로컬 모델과 같이 자체 서명된 TLS 인증서를 가진 자체 호스팅 서버로 Qwen Code를 지정하고 있어 Node.js가 이를 거부합니다.
  - **해결 방법:** `NODE_EXTRA_CA_CERTS`(위 참조)를 통해 인증서를 신뢰하는 것을 우선적으로 시도하세요. 신뢰할 수 있는 실험실/사설 네트워크에서 이것이 실용적이지 않은 경우 `--insecure` 플래그(또는 `QWEN_TLS_INSECURE=1`)로 검증을 건너뛰세요:
    - 예시: `qwen --insecure --openaiBaseUrl https://192.168.1.10:8080 ...`
    - **경고:** 검증을 비활성화하면 중간자 공격으로부터의 보호가 제거됩니다. 완전히 신뢰하는 엔드포인트에만 사용하세요.

- **오류: `Device authorization flow failed: fetch failed`**
  - **원인:** Node.js가 Qwen OAuth 엔드포인트에 접근할 수 없습니다(종종 프록시 또는 SSL/TLS 신뢰 문제). 사용 가능한 경우 Qwen Code는 기본 오류 원인도 출력합니다(예: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). 참고: 이 오류는 레거시 Qwen OAuth 흐름에만 해당됩니다.
  - **해결 방법:**
    - 여전히 Qwen OAuth를 사용 중이라면 `/auth`를 통해 API Key 또는 Coding Plan으로 전환하세요.
    - 프록시 뒤에 있는 경우 `qwen --proxy <url>`(또는 `settings.json`의 `proxy` 설정)을 통해 설정하세요.
    - 네트워크에서 기업 TLS 검사 CA를 사용하는 경우 위에서 설명한 대로 `NODE_EXTRA_CA_CERTS`를 설정하세요.

- **문제: 인증 실패 후 UI가 표시되지 않음**
  - **원인:** 인증 유형을 선택한 후 인증이 실패하면 `security.auth.selectedType` 설정이 `settings.json`에 지속될 수 있습니다. 재시작 시 CLI가 실패한 인증 유형으로 인증을 시도하다가 UI를 표시하지 못할 수 있습니다.
  - **해결 방법:** `settings.json` 파일에서 `security.auth.selectedType` 구성 항목을 제거하세요:
    - `~/.qwen/settings.json`(또는 프로젝트별 설정의 경우 `./.qwen/settings.json`)을 엽니다
    - `security.auth.selectedType` 필드를 제거합니다
    - CLI를 재시작하여 인증을 다시 요청하도록 합니다

## 자주 묻는 질문 (FAQ)

- **Q: Qwen Code를 최신 버전으로 업데이트하려면 어떻게 하나요?**
  - A: 독립 실행형 설치 프로그램으로 Qwen Code를 설치한 경우 독립 실행형 설치 명령어를 다시 실행하세요. `npm`을 통해 전역으로 설치한 경우 `npm install -g @qwen-code/qwen-code@latest` 명령어로 업데이트하세요. 소스에서 컴파일한 경우 저장소에서 최신 변경 사항을 pull한 후 `npm run build` 명령어로 다시 빌드하세요.

- **Q: Qwen Code 구성 또는 설정 파일은 어디에 저장되나요?**
  - A: Qwen Code 구성은 두 개의 `settings.json` 파일에 저장됩니다:
    1. 홈 디렉토리: `~/.qwen/settings.json`.
    2. 프로젝트 루트 디렉토리: `./.qwen/settings.json`.

    자세한 내용은 [Qwen Code 구성](../configuration/settings)을 참조하세요.

- **Q: 통계 출력에서 캐시된 토큰 수가 표시되지 않는 이유는 무엇인가요?**
  - A: 캐시된 토큰 정보는 캐시된 토큰이 사용 중일 때만 표시됩니다. 이 기능은 API 키 사용자(예: Alibaba Cloud Model Studio API 키 또는 Google Cloud Vertex AI)에게 제공됩니다. `/stats` 명령어를 사용하여 총 토큰 사용량을 확인할 수 있습니다.

- **Q: 커스터마이제이션(확장, hook, skill, MCP 서버 또는 서브에이전트)이 Qwen Code를 손상시키는 것 같습니다. 어떻게 격리하나요?**
  - A: `--safe-mode` 플래그와 함께 Qwen Code를 시작하여 세션 동안 모든 커스터마이제이션을 비활성화하세요 — 컨텍스트 파일, hook, 확장, skill, MCP 서버, 커스텀 서브에이전트(내장 서브에이전트만 로드), 권한 규칙, 설정 기반 승인 모드 오버라이드, 메모리 기능 및 샌드박스 설정. 참고: CLI 플래그 `--yolo` 및 `--approval-mode`는 안전 모드에서도 계속 적용됩니다. 안전 모드에서 문제가 사라지면 커스터마이제이션을 하나씩 다시 활성화하여 원인을 찾으세요.
    - 예시: `qwen --safe-mode`
    - 대안: CLI가 플래그를 받을 수 없는 경우 환경 변수 `QWEN_CODE_SAFE_MODE=true`를 설정하세요.
    - 참고: 여기서 "MCP 서버"는 `settings.json` / 프로젝트 `.mcp.json`에 구성된 서버를 의미합니다 — 안전 모드가 격리하려는 로컬/환경 상태입니다. 현재 호출을 위해 명시적으로 제공하는 MCP 서버(임베딩 ACP 클라이언트의 `session/new` `mcpServers` 또는 `--mcp-config`)는 로컬/환경 상태가 아니며 안전 모드에서도 계속 적용됩니다.

## 일반적인 오류 메시지와 해결 방법

- **오류: MCP 서버 시작 시 `EADDRINUSE`(Address already in use).**
  - **원인:** 다른 프로세스가 MCP 서버가 바인딩하려는 포트를 이미 사용 중입니다.
  - **해결 방법:**
    포트를 사용 중인 다른 프로세스를 중지하거나 MCP 서버가 다른 포트를 사용하도록 구성하세요.

- **오류: Command not found(`qwen`으로 Qwen Code를 실행하려고 할 때).**
  - **원인:** CLI가 올바르게 설치되지 않았거나 시스템의 `PATH`에 없습니다.
  - **해결 방법:**
    업데이트 방법은 Qwen Code 설치 방식에 따라 다릅니다:
    - `qwen`을 독립 실행형 설치 프로그램으로 설치한 경우 독립 실행형 설치 명령어를 다시 실행한 후 새 터미널을 여세요.
    - `qwen`을 전역으로 설치한 경우 `npm` 전역 바이너리 디렉토리가 `PATH`에 있는지 확인하세요. `npm install -g @qwen-code/qwen-code@latest` 명령어로 업데이트할 수 있습니다.
    - 소스에서 `qwen`을 실행하는 경우 올바른 명령어로 호출하고 있는지 확인하세요(예: `node packages/cli/dist/index.js ...`). 업데이트하려면 저장소에서 최신 변경 사항을 pull한 후 `npm run build` 명령어로 다시 빌드하세요.

- **오류: `MODULE_NOT_FOUND` 또는 import 오류.**
  - **원인:** 의존성이 올바르게 설치되지 않았거나 프로젝트가 빌드되지 않았습니다.
  - **해결 방법:**
    1. `npm install`을 실행하여 모든 의존성이 존재하는지 확인하세요.
    2. `npm run build`를 실행하여 프로젝트를 컴파일하세요.
    3. `npm run start`로 빌드가 성공적으로 완료되었는지 확인하세요.

- **오류: "Operation not permitted", "Permission denied" 또는 유사한 오류.**
  - **원인:** 샌드박싱이 활성화되어 있을 때 Qwen Code가 샌드박스 구성에 의해 제한되는 작업(프로젝트 디렉토리 또는 시스템 임시 디렉토리 외부에 쓰기 등)을 시도할 수 있습니다.
  - **해결 방법:** 자세한 내용은 [구성: 샌드박싱](../features/sandbox) 문서를 참조하세요. 샌드박스 구성을 커스터마이즈하는 방법도 포함되어 있습니다.

- **Qwen Code가 "CI" 환경에서 대화형 모드로 실행되지 않음**
  - **문제:** `CI_`로 시작하는 환경 변수(예: `CI_TOKEN`)가 설정되어 있으면 Qwen Code가 대화형 모드로 진입하지 않습니다(프롬프트가 표시되지 않음). 이는 기본 UI 프레임워크에서 사용하는 `is-in-ci` 패키지가 이러한 변수를 감지하여 비대화형 CI 환경으로 가정하기 때문입니다.
  - **원인:** `is-in-ci` 패키지는 `CI`, `CONTINUOUS_INTEGRATION` 또는 `CI_` 접두사가 있는 환경 변수의 존재를 확인합니다. 이러한 변수 중 하나라도 발견되면 환경이 비대화형임을 신호하여 CLI가 대화형 모드로 시작되는 것을 방지합니다.
  - **해결 방법:** `CI_` 접두사 변수가 CLI 작동에 필요하지 않은 경우 명령어에 대해 일시적으로 해제할 수 있습니다. 예: `env -u CI_TOKEN qwen`

- **프로젝트 .env 파일에서 DEBUG 모드가 작동하지 않음**
  - **문제:** 프로젝트의 `.env` 파일에 `DEBUG=true`를 설정해도 CLI의 디버그 모드가 활성화되지 않습니다.
  - **원인:** `DEBUG` 및 `DEBUG_MODE` 변수는 CLI 동작과의 간섭을 방지하기 위해 프로젝트 `.env` 파일에서 자동으로 제외됩니다.
  - **해결 방법:** 대신 `.qwen/.env` 파일을 사용하거나 `settings.json`에서 `advanced.excludedEnvVars` 설정을 구성하여 더 적은 변수를 제외하세요.

- **tmux에서 트랙패드 스크롤링이 대화를 스크롤하는 대신 프롬프트 기록을 변경함**
  - **문제:** tmux 세션에서 트랙패드 또는 휠 스크롤링이 `Up Arrow` 또는 `Down Arrow`를 누르는 것과 유사하게 이전 프롬프트를 순환할 수 있습니다.
  - **원인:** tmux는 휠 제스처를 단순한 방향키 시퀀스로 변환할 수 있습니다. 이러한 시퀀스는 qwen-code가 받을 때 실제 방향키 누름과 구별할 수 없습니다.
  - **해결 방법:** 스크린 리더 모드가 비활성화되어 있으면 `ui.useTerminalBuffer`가 활성화되어 있는지 확인한 후 `Shift+Up` / `Shift+Down`을 사용하거나 tmux가 휠 이벤트를 앱으로 전달할 때 마우스 휠을 사용하세요(`ui.mouseTracking` 필요). 호스트 스크롤백을 선호하는 경우 휠 이벤트에 대한 tmux 마우스 바인딩을 조정하세요.

- **오른쪽 클릭이 작동하지 않고, 링크가 열리지 않으며, 터미널에서 텍스트를 선택할 수 없음**
  - **문제:** Qwen Code가 실행 중인 동안 네이티브 오른쪽 클릭 컨텍스트 메뉴, OSC 8 하이퍼링크 클릭(Ctrl+Click 또는 URL에서 일반 클릭) 및 터미널 네이티브 텍스트 선택이 작동하지 않습니다.
  - **원인:** `ui.mouseTracking`이 활성화되어 있을 때(기본값), Qwen Code는 SGR 마우스 추적을 통해 모든 마우스 이벤트를 캡처하여 앱 내 텍스트 선택, 클릭으로 위치 이동, 행 호버 및 뷰포트 스크롤링을 구동합니다. 터미널은 모든 마우스 이벤트를 네이티브로 처리하지 않고 앱으로 전달합니다.
  - **해결 방법:** `settings.json`에서 `"ui.mouseTracking": false`로 설정하여 네이티브 오른쪽 클릭 메뉴와 클릭 가능한 URL 링크를 복원하세요. 이렇게 하면 모든 앱 내 마우스 상호작용이 꺼집니다. Virtualized History(`ui.useTerminalBuffer: true`, 기본값)에서는 휠이 더 이상 트랜스크립트를 스크롤하지 않습니다 — `Shift+↑/↓`, `PgUp/PgDn` 또는 `Ctrl+Home/End`를 대신 사용하세요. 네이티브 터미널 스크롤백도 복원하려면 `"ui.useTerminalBuffer": false`로 설정하세요. 재시작이 필요합니다.

## IDE Companion이 연결되지 않음

- VS Code에 단일 작업 공간 폴더가 열려 있는지 확인하세요.
- 확장 프로그램 설치 후 통합 터미널을 재시작하여 다음을 상속하도록 하세요:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 컨테이너에서 실행 중인 경우 `host.docker.internal`이 확인되는지 확인하세요. 그렇지 않으면 호스트를 적절히 매핑하세요.
- `/ide install`로 companion을 재설치하고 Command Palette에서 "Qwen Code: Run"을 사용하여 시작되는지 확인하세요.

## 종료 코드

Qwen Code는 종료 이유를 나타내기 위해 특정 종료 코드를 사용합니다. 이는 스크립팅 및 자동화에 특히 유용합니다.

| 종료 코드 | 오류 유형                  | 설명                                                                                          |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | 인증 프로세스 중에 오류가 발생했습니다.                                                        |
| 42        | `FatalInputError`          | CLI에 유효하지 않거나 누락된 입력이 제공되었습니다. (비대화형 모드만)                           |
| 44        | `FatalSandboxError`        | 샌드박스 환경(예: Docker, Podman 또는 Seatbelt)에서 오류가 발생했습니다.                       |
| 52        | `FatalConfigError`         | 구성 파일(`settings.json`)이 유효하지 않거나 오류가 포함되어 있습니다.                          |
| 53        | `FatalTurnLimitedError`    | 세션의 최대 대화 턴 수에 도달했습니다. (비대화형 모드만)                                       |

## 디버깅 팁

- **CLI 디버깅:**
  - CLI 명령어와 함께 `--verbose` 플래그(사용 가능한 경우)를 사용하면 더 자세한 출력을 얻을 수 있습니다.
  - CLI 로그를 확인하세요. 일반적으로 사용자별 구성 또는 캐시 디렉토리에 있습니다.

- **코어 디버깅:**
  - 서버 콘솔 출력에서 오류 메시지나 스택 트레이스를 확인하세요.
  - 구성 가능한 경우 로그 상세도를 높이세요.
  - 서버 측 코드를 단계별로 실행해야 하는 경우 Node.js 디버깅 도구(예: `node --inspect`)를 사용하세요.

- **도구 문제:**
  - 특정 도구가 실패하는 경우 해당 도구가 수행하는 명령이나 작업의 가장 간단한 버전을 실행하여 문제를 격리해 보세요.
  - `run_shell_command`의 경우 셸에서 직접 명령이 작동하는지 먼저 확인하세요.
  - _파일 시스템 도구_의 경우 경로가 올바른지 확인하고 권한을 확인하세요.

- **프리플라이트 검사:**
  - 코드를 커밋하기 전에 항상 `npm run preflight`를 실행하세요. 포매팅, 린팅 및 타입 오류와 관련된 많은 일반적인 문제를 잡을 수 있습니다.

## 기존 GitHub Issue 검색 또는 새 Issue 생성

이 _문제 해결 가이드_에서 다루지 않은 문제에 직면한 경우 Qwen Code [GitHub의 Issue 트래커](https://github.com/QwenLM/qwen-code/issues)를 검색해 보세요. 여러분의 문제와 유사한 이슈를 찾을 수 없다면 자세한 설명과 함께 새 GitHub Issue를 생성하는 것을 고려하세요. Pull Request도 환영합니다!
