# 샌드박스

이 문서는 도구가 셸 명령어를 실행하거나 파일을 수정할 때 위험을 줄이기 위해 Qwen Code를 샌드박스 내에서 실행하는 방법을 설명합니다.

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
