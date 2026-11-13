# 샌드박스

이 문서는 Linux에서의 도구 실행 제한과 기존 전체 CLI 샌드박스 방법을 설명합니다.

## Linux 도구 실행 샌드박스

Linux에서 가장 강력한 지원 경계를 위해 `bwrap`(Bubblewrap)을 지원되는 시스템 경로인 `/usr/bin/bwrap`에 설치한 다음, **User** 설정(`~/.qwen/settings.json` 또는 `QWEN_HOME`으로 선택된 디렉토리) 또는 관리자 **System** 설정에서 도구 실행 샌드박스를 활성화합니다:

```json
{
  "tools": {
    "executionSandbox": {
      "backend": "auto",
      "filesystem": "workspace-write",
      "network": "closed"
    }
  }
}
```

`filesystem`과 `network`는 필수입니다. `backend`는 기본값이 `auto`이며 bwrap을 먼저 시도합니다. bwrap을 사용할 수 없고 `network`가 `open`인 경우, `auto`는 Landlock ABI 3 이상의 커널에서 번들된 Landlock 헬퍼를 사용할 수 있습니다. 정확한 구현을 요구하려면 `backend`를 `bwrap` 또는 `landlock`으로 설정합니다. Landlock은 `network: closed`를 강제하거나 명시적으로 마스킹된 경로를 숨길 수 없습니다. 두 요구사항 모두 명령이 시작되기 전에 Landlock을 거부하며, 자동 폴백은 남은 경로 마스크를 폐기하지 않습니다. `read-only`를 사용하여 워크스페이스 쓰기를 거부하거나, `workspace-write`를 사용하여 현재 표준 워크스페이스 내부의 쓰기를 허용합니다. 각 명령은 비공개 스크래치 공간도 할당받습니다. 일반 `includeDirectories` 설정은 쓰기 접근을 부여하지 않습니다. 워크스페이스를 Qwen 설치, 사용자 설정 및 런타임 상태 디렉토리와 분리하세요.

CLI, 모델 전송, 인증 및 세션 저장은 호스트에 남습니다. 셸, 터미널 `!`, 프롬프트 셸 보간, Monitor, Read/Write/Edit 및 지원되는 중첩 인메모리 Agent/Code Mode 호출은 동일한 런타임 정책을 사용합니다. bwrap에서 `network: closed`는 명령으로부터의 일반 호스트/외부 IP 연결을 차단하고, `open`은 호스트 네트워크를 공유합니다. 읽기는 넓게 유지됩니다: 이 모드는 호스트 비밀을 숨기거나 경로명 Unix 소켓과 호스트 서비스를 격리한다고 약속하지 않습니다. 승인 및 YOLO는 파일시스템 또는 네트워크 정책을 확장하지 않습니다. 표준 스트림은 명시적인 호출자 제공 기능입니다: 이미 연결된 소켓, TTY 또는 문자 장치는 `network: closed`에서도 사용 가능합니다. 폐쇄 네트워킹은 기존 설명자를 취소하지 않습니다; 해당 접근이 원하지 않을 때 호스트 서비스 연결을 stdin으로 제공하지 마세요. 호스트 지원 파일 및 명명된-FIFO stdin은 번들된 Linux x64/arm64 입력 헬퍼를 필요로 하며, 쓰기 절반이 종료된 비공개 Unix 스트림 소켓을 통해 복사됩니다; 일반 파일 오프셋은 해당 소켓에서 소비된 바이트만큼만 진행되며, 유휴 FIFO 작성자는 명령 완료를 지연하지 않습니다. fd 0을 직접 읽습니다: 이 입력은 FIFO가 아닌 소켓이며, `/dev/stdin` 또는 `/proc/self/fd/0`을 통해 다시 여는 것은 지원되지 않습니다. SIGINT/SIGTERM은 명령을 취소하지만 수용된 stdout/stderr 바이트를 계속 배수합니다; 닫힌 출력은 해당 스트림을 종료 코드 141로 중지하고 다른 유효한 출력은 배수됩니다.

Landlock은 `partial` 집행을 보고합니다. 이는 경로명 읽기, 쓰기 및 디렉토리 변경을 제한하지만 PID 또는 네트워크 네임스페이스를 생성하지 않으며, `chmod`, `chown`, 확장 속성 및 타임스탬프를 포함한 모든 메타데이터 작업을 현재 제한할 수 없기 때문입니다. Landlock 명령은 호스트 프로세스를 볼 수 있고 호스트 네트워킹을 사용합니다. 분리된 하위는 Landlock 파일시스템 제한을 유지하지만 bwrap의 PID-네임스페이스 수명 경계를 얻지 못합니다. 열린 파일 설명자는 기존 접근을 유지합니다. Qwen Code는 호스트 지원 파일 및 명명된-FIFO stdin을 해당 설명자를 페이로드에 전달하는 대신 비공개 읽기 전용 소켓을 통해 스트리밍합니다; 소켓, 문자 장치 및 익명 파이프는 공유될 수 있습니다. 출력 표준 스트림은 호출자의 명시적 대상 그대로 유지됩니다. 실행 상태 설명자는 페이로드 실행 시 닫힙니다.

Landlock은 더 좁은 쓰기 가능 장치 표면도 가지고 있습니다: `/dev/null`에 대한 쓰기를 허용하지만, bwrap의 비공개 `/dev` 및 `/proc` 마운트를 생성하지 않습니다. `/dev/full` 또는 `/dev/tty`를 쓰기를 위해 열거나 `/dev/shm`에 파일을 생성하는 것은 거부되므로, 이러한 작업이 필요한 프로그램은 실패할 수 있습니다. 임시 파일에는 `TMPDIR`, `TMP`, `TEMP`를 통해 노출되는 비공개 스크래치 디렉토리를 사용하세요. 이미 열린, 호출자 제공 표준 스트림은 기존 접근을 유지합니다. 시작 시 Landlock 정책 프robe는 `/usr/bin/true`를 필요로 합니다; 이것이 누락된 호스트는 커널이 Landlock을 지원하더라도 프robe에 실패합니다.

워크스페이스 설정은 신뢰할 수 있는 프로젝트에서도 이 정책을 활성화, 비활성화 또는 수정할 수 없습니다. 유효한 우선순위는 System > User > SystemDefaults 순이며, 완전한 정책 객체를 선택합니다. 값은 리터럴이어야 합니다; 환경 치환, 알 수 없는 필드 및 불완전한 객체는 거부됩니다. `--bare` 및 `--safe-mode`는 운영자 제한을 유지합니다. 변경사항은 새 런타임을 필요로 합니다. 형식이 잘못되었거나 읽을 수 없는 SystemDefaults, User 또는 System 설정 파일은 이제 알 수 없는 정책을 빈 설정으로 조용히 재설정하는 대신 시작을 차단합니다(설정 종료 코드 52). 오류는 파일과 복구 작업을 명시합니다. JSON 객체를 복구하거나 읽기 접근을 복원한 다음 다시 시작하세요. User `.corrupted` 사본은 참조용일 뿐이며, 원본 운영자 파일은 절대 지워지지 않습니다. 운영자 제한 없이 워크스페이스 전용 복구가 여전히 사용 가능합니다. 형식이 잘못된 연결된 워크스페이스 설정(연결된 `.qwen` 디렉토리 또는 하드링크된 파일 포함)은 수동 복구가 필요합니다; 자동 복구는 원본 또는 이전 손상 사본을 변경하기 전에 거부됩니다. 유효한 연결된 JSON은 읽기 가능합니다.

이 초기 공개 모드는 일반 헤드리스 CLI와 두 터미널 UI를 지원합니다. ACP, `qwen serve` 및 웹 터미널은 명시적으로 거부합니다. MCP/LSP, 실행 가능한 hook/extension, worktree/arena 관리, 외부 에이전트, 투기적 실행, 파일 체크포인트, 자동 skill/memory 유지, 그리고 이식되지 않은 프로세스 또는 변경 도구는 비활성화되거나 거부됩니다. 일반 동일-워크스페이스 인메모리 에이전트는 hook, MCP 서버, 외부 실행기 또는 worktree 격리를 추가할 수 없습니다. 커스텀 상태 명령, 외부 Markdown/이미지 렌더러, IDE 감지 및 연결, 파일 복원, 및 호스트 Git diff 미리보기는 비활성화됩니다. 대화 전용 되감기는 여전히 사용 가능합니다.

`/doctor`와 같은 명시적 운영자 진단, `/memory`를 통한 파일 및 폴더 열기 또는 편집, `/skills`를 통한 설정 변경은 신뢰된 호스트 작업으로 남습니다. 이러한 관리 명령은 모델 호출 가능 명령으로 노출되지 않습니다. skill을 선택하면 입력 필드가 채워집니다; `/skill-name`을 제출하면 현재 인수를 준비하거나 사용 기록을 업데이트하기 전에 지원되지 않는 모드 오류를 보고합니다. skill 명령 실행과 모델 Skill 도구는 준비 쓰기가 제한될 때까지 사용 불가능합니다. 자동 memory 및 skill 유지는 저장된 설정을 변경하더라도 이 런타임에서 비활성화된 상태로 유지됩니다.

작업을 실행하기 전에 활성 경계를 검사하고 확인하세요:

```bash
qwen sandbox
qwen sandbox --verify
qwen sandbox -- sh -c 'printf "confined command\n"'
qwen -y -p "Update the project and run its tests"
```

연결된 Git worktree는 허용된 워크스페이스에만 쓰기 접근을 받습니다. 해당 워크스페이스 외부의 Git 공통 디렉토리 및 worktree 메타데이터는 읽기 전용으로 유지됩니다; 이 모드는 다른 체크아웃의 저장소 메타데이터 변경을 암시적으로 승인하지 않습니다. 해당 쓰기가 필요한 작업은 거부될 수 있습니다.

보고서는 도구 경계, 요청된/유효한 백엔드, 집행 수준, 해당되는 경우 Landlock ABI, 워크스페이스, 파일시스템 및 명령 네트워크 정책을 명시합니다. `--verify`는 워크스페이스 쓰기, 호스트에서 쓰기 가능한 것으로 알려진 파일에 대한 거부, 예상되는 비공개 또는 공유 PID 네임스페이스 정체성, 그리고 선택된 네트워크 네임스페이스를 확인합니다. 통과한 백엔드 프robe는 승인을 확립하지만, 모든 상속된 환경 설정에서의 인증된 전체 세션 실행 가능성을 확립하지는 않습니다. 그 후 일반 작업을 실행하여 필요한 도구와 서비스를 테스트하세요. 확인이 호스트 측 임시 픽스처를 생성할 수 없으면 `TMPDIR`과 디렉토리 권한을 확인하세요; 이는 경계 거부와는 별개입니다. 백엔드 설정 오류는 페이로드 실행 전에 실패하며 호스트에서 명령을 다시 실행하지 않습니다. 단일 명령 서브커맨드는 리디렉션된 stdin과 함께 리터럴 인수를 전달하면서 stdout과 stderr를 바이트 단위로 보존합니다; 대화형 PTY 명령에는 터미널 `!`를 사용하세요.

### 전체 CLI bwrap에서 마이그레이션

`--sandbox bwrap`을 대체하고 `tools.sandbox: "bwrap"`, `QWEN_SANDBOX=bwrap`, `QWEN_SANDBOX_NET` 및 `QWEN_SANDBOX_PROXY_COMMAND`를 제거한 다음, 위에서와 같이 `tools.executionSandbox`를 설정합니다. 이전 샌드박스 외부의 셸에서 다시 시작합니다; 상속된 `SANDBOX=bwrap`은 거부됩니다. `proxied`는 지원되는 네트워크 정책이 아닙니다. 이 모드와 Docker, Podman, Seatbelt 또는 상속된 전체 CLI 샌드박스 마커를 결합하지 마세요. 이전 bwrap 설정은 명시적인 마이그레이션 오류를 발생시킵니다.

아래의 Docker, Podman 및 macOS Seatbelt 방법은 여전히 기존 환경에서 전체 CLI를 실행합니다.

## 사전 요구사항

샌드박싱을 사용하기 전에 Qwen Code를 설치하고 설정해야 합니다:

```bash
npm install -g @qwen-code/qwen-code
```

설치 확인:

```bash
qwen --version
```

## 샌드박싱 개요

샌드박싱은 잠재적으로 위험한 작업(셸 명령어나 파일 수정 등)을 호스트 시스템으로부터 격리하여 CLI와 환경 사이의 보안 장벽을 제공합니다.

샌드박싱의 이점:

- **보안**: 실수로 인한 시스템 손상 또는 데이터 손실을 방지합니다.
- **격리**: 파일 시스템 접근을 프로젝트 디렉토리로 제한합니다.
- **일관성**: 다양한 시스템에서 재현 가능한 환경을 보장합니다.
- **안전**: 신뢰할 수 없는 코드나 실험적 명령어를 다룰 때 위험을 줄입니다.

> [!note]
>
> **명칭 참고:** 샌드박스 관련 환경 변수 중 일부는 과거 `GEMINI_*` 접두사를 사용했을 수 있습니다. 모든 새 환경 변수는 `QWEN_*` 접두사를 사용합니다.

## 샌드박싱 방법

이상적인 샌드박싱 방법은 플랫폼과 선호하는 컨테이너 솔루션에 따라 다를 수 있습니다.

### 1. macOS Seatbelt (macOS 전용)

`sandbox-exec`를 사용하는 경량 내장 샌드박싱입니다.

**기본 프로파일**: `permissive-open` - 프로젝트 디렉토리 외부의 쓰기를 제한하지만, 대부분의 다른 작업과 아웃바운드 네트워크 접근을 허용합니다.

**추천 대상**: 빠른 속도, Docker 불필요, 파일 쓰기에 대한 강력한 가드레일.

### 2. 컨테이너 기반 (Docker/Podman)

완전한 프로세스 격리를 제공하는 크로스 플랫폼 샌드박싱입니다.

기본적으로 Qwen Code는 게시된 샌드박스 이미지(CLI 패키지에 설정됨)를 사용하며 필요에 따라 pull합니다.

컨테이너 샌드박스는 워크스페이스와 `~/.qwen` 디렉토리를 컨테이너에 마운트하여 실행 간 인증과 설정이 유지됩니다.

**추천 대상**: 모든 OS에서의 강력한 격리, 알려진 이미지 내의 일관된 도구.

### 방법 선택

- **macOS에서**:
  - 경량 샌드박싱을 원하면 Seatbelt 사용 (대부분의 사용자에게 추천).
  - 전체 Linux 사용자 환경이 필요하면 Docker/Podman 사용 (예: Linux 바이너리가 필요한 도구).
- **Linux/Windows에서**:
  - Docker 또는 Podman 사용.

## 빠른 시작

```bash
# 명령 플래그로 샌드박싱 활성화
qwen -s -p "analyze the code structure"

# 또는 셸 세션에 대해 샌드박싱 활성화 (CI / 스크립트에 추천)
export QWEN_SANDBOX=true   # true는 공급자를 자동 선택 (아래 참고)
qwen -p "run the test suite"

# settings.json에서 설정
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **공급자 선택 참고:**
>
> - **macOS**에서 `QWEN_SANDBOX=true`는 사용 가능하면 일반적으로 `sandbox-exec`(Seatbelt)를 선택합니다.
> - **Linux/Windows**에서 `QWEN_SANDBOX=true`는 `docker` 또는 `podman`이 설치되어 있어야 합니다.
> - 공급자를 강제하려면 `QWEN_SANDBOX=docker|podman|sandbox-exec`를 설정합니다.

## 설정

### 샌드박싱 활성화 (우선순위 순)

1. **환경 변수**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **명령 플래그 / 인수**: `-s`, `--sandbox`, 또는 `--sandbox=<provider>`
3. **설정 파일**: `settings.json`의 `tools.sandbox` (예: `{"tools": {"sandbox": true}}`).

> [!important]
>
> `QWEN_SANDBOX`가 설정되면 CLI 플래그와 `settings.json`을 **재정의**합니다.

### 샌드박스 이미지 설정 (Docker/Podman)

- **CLI 플래그**: `--sandbox-image <image>`
- **환경 변수**: `QWEN_SANDBOX_IMAGE=<image>`
- **설정 파일**: `settings.json`의 `tools.sandboxImage` (예: `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`)

우선순위 (높은 순):

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. CLI 패키지의 내장 기본 이미지 (예: `ghcr.io/qwenlm/qwen-code:<version>`)

`settings.env.QWEN_SANDBOX_IMAGE`도 범용 env 주입 메커니즘으로 작동하지만, `tools.sandboxImage`가 권장되는 영구 설정입니다.

커스텀 이미지는 사용자가 관리합니다. 안전한 업데이트 핸드오프를 받으려면 최신 Qwen Code 설치로 리빌드하세요; 오래된 이미지는 여전히 원래의 프로세스 내 업데이터를 사용할 수 있습니다.

### macOS Seatbelt 프로파일

내장 프로파일 (`SEATBELT_PROFILE` 환경 변수로 설정):

- `permissive-open` (기본): 쓰기 제한, 네트워크 허용
- `permissive-closed`: 쓰기 제한, 네트워크 차단
- `permissive-proxied`: 쓰기 제한, 프록시 경유 네트워크
- `restrictive-open`: 엄격한 제한, 네트워크 허용
- `restrictive-closed`: 최대 제한
- `restrictive-proxied`: 엄격한 제한, 프록시 경유 네트워크

> [!tip]
>
> `permissive-open`으로 시작한 다음, 워크플로우가 여전히 작동하면 `restrictive-closed`로 강화하세요.

### 커스텀 Seatbelt 프로파일 (macOS)

커스텀 Seatbelt 프로파일을 사용하려면:

1. 프로젝트에 `.qwen/sandbox-macos-<profile_name>.sb` 파일을 생성합니다.
2. `SEATBELT_PROFILE=<profile_name>`을 설정합니다.

### 커스텀 샌드박스 플래그

컨테이너 기반 샌드박싱의 경우, `SANDBOX_FLAGS` 환경 변수를 사용하여 `docker` 또는 `podman` 명령에 커스텀 플래그를 주입할 수 있습니다. 특정 사용 사례를 위해 보안 기능을 비활성화하는 등의 고급 설정에 유용합니다.

**예시 (Podman)**:

볼륨 마운트에 대한 SELinux 레이블링을 비활성화하려면:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

여러 플래그는 공백으로 구분된 문자열로 제공할 수 있습니다:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### 네트워크 프록시 (모든 샌드박스 방법)

아웃바운드 네트워크 접근을 허용 목록으로 제한하려면 샌드박스와 함께 로컬 프록시를 실행할 수 있습니다:

- `QWEN_SANDBOX_PROXY_COMMAND=<command>`를 설정합니다
- 명령은 `:::8877`에서 수신하는 프록시 서버를 시작해야 합니다

이는 `*-proxied` Seatbelt 프로파일과 특히 유용합니다.

허용 목록 스타일 프록시 예시는 다음을 참조하세요: [Example Proxy Script](../../developers/examples/proxy-script.md).

## Linux UID/GID 처리

Linux에서 Qwen Code는 기본적으로 UID/GID 매핑을 활성화하여 샌드박스가 사용자의 사용자로 실행되도록 합니다(마운트된 `~/.qwen`을 재사용). 재정의:

```bash
export SANDBOX_SET_UID_GID=true   # 호스트 UID/GID 강제
export SANDBOX_SET_UID_GID=false  # UID/GID 매핑 비활성화
```

## 문제 해결

### 일반적인 문제

**"Operation not permitted"**

- 작업이 샌드박스 외부 접근을 필요로 합니다.
- macOS Seatbelt: 더 허용적인 `SEATBELT_PROFILE`을 시도하세요.
- Docker/Podman: 워크스페이스가 마운트되어 있고 명령이 프로젝트 디렉토리 외부 접근을 필요로 하지 않는지 확인하세요.

**누락된 명령어**

- 컨테이너 샌드박스: `.qwen/sandbox.Dockerfile` 또는 `.qwen/sandbox.bashrc`를 통해 추가합니다.
- Seatbelt: 호스트 바이너리가 사용되지만 샌드박스가 일부 경로에 대한 접근을 제한할 수 있습니다.

**Docker 샌드박스에서 Java를 사용할 수 없음**

공식 Qwen Code Docker 이미지는 이미지를 작고, 안전하게, 빠르게 pull할 수 있도록 의도적으로 최소화되어 있습니다. 각 사용자는 서로 다른 언어 런타임(Java, Python, Node.js 등)이 필요하며, 모든 환경을 단일 이미지에 번들링하는 것은 실용적이지 않습니다. 따라서 Java는 Docker 샌드박스에서 **기본적으로 포함되지 않습니다**.

워크플로우에 Java가 필요하면, 프로젝트에 `.qwen/sandbox.Dockerfile`을 생성하여 기본 이미지를 확장할 수 있습니다:

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

그런 다음 샌드박스 이미지를 리빌드합니다:

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

샌드박스 커스터마이징에 대한 자세한 내용은 [Customizing the sandbox environment](../../developers/tools/sandbox.md)를 참조하세요.

**네트워크 문제**

- 샌드박스 프로파일이 네트워크를 허용하는지 확인합니다.
- 프록시 설정을 확인합니다.

### 디버그 모드

```bash
DEBUG=1 qwen -s -p "debug command"
```

**참고:** 프로젝트의 `.env` 파일에 `DEBUG=true`가 있으면 자동 제외로 인해 CLI에 영향을 주지 않습니다. Qwen Code 전용 디버그 설정에는 `.qwen/.env` 파일을 사용하세요.

### 샌드박스 검사

```bash
# 환경 확인
qwen -s -p "run shell command: env | grep SANDBOX"

# 마운트 목록
qwen -s -p "run shell command: mount | grep workspace"
```

## 보안 참고사항

- 샌드박싱은 위험을 줄이지만 완전히 제거하지는 않습니다.
- 작업이 가능한 가장 제한적인 프로파일을 사용하세요.
- 컨테이너 오버헤드는 첫 pull/빌드 이후 미미합니다.
- GUI 애플리케이션은 샌드박스에서 작동하지 않을 수 있습니다.

## 관련 문서

- [Configuration](../configuration/settings): 전체 설정 옵션.
- [Commands](../features/commands): 사용 가능한 명령어.
- [Troubleshooting](../support/troubleshooting): 일반적인 문제 해결.
