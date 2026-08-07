---
title: Sandbox
---

## 샌드박스 환경 사용자 정의 (Docker/Podman)

### 현재 npm 패키지를 통한 설치 후 BUILD_SANDBOX 기능은 지원되지 않습니다

1. 사용자 정의 샌드박스를 빌드하려면 소스 코드 리포지토리의 빌드 스크립트(scripts/build_sandbox.js)에 접근해야 합니다.
2. 이러한 빌드 스크립트는 npm이 릴리스하는 패키지에는 포함되지 않습니다.
3. 코드에는 소스 코드 환경이 아닌 빌드 요청을 명시적으로 거부하는 하드코딩된 경로 검사가 포함되어 있습니다.

컨테이너 안에 추가 도구(예: `git`, `python`, `rg`)가 필요한 경우, 사용자 정의 Dockerfile을 생성하세요. 구체적인操作步骤는 다음과 같습니다.

#### 1、먼저 qwen code 프로젝트를 클론합니다. https://github.com/QwenLM/qwen-code.git

#### 2、소스 코드 리포지토리 디렉토리에서 다음 작업을 수행하세요

```bash
# 1. 먼저 프로젝트 의존성을 설치합니다
npm install

# 2. Qwen Code 프로젝트를 빌드합니다
npm run build

# 3. dist 디렉토리가 생성되었는지 확인합니다
ls -la packages/cli/dist/

# 4. CLI 패키지 디렉토리에서 글로벌 링크를 생성합니다
cd packages/cli
npm link

# 5. 링크를 확인합니다 (이제 소스 코드를 가리켜야 합니다)
which qwen
# 예상 출력: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# 또는 유사한 경로이지만 심볼릭 링크여야 합니다

# 6. 심볼릭 링크의 세부 정보는 구체적인 소스 코드 경로를 확인할 수 있습니다
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# 소스 코드 디렉토리를 가리키는 심볼릭 링크임을 보여야 합니다

# 7. qwen 버전을 테스트합니다
qwen -v
# npm link가 글로벌 qwen을 덮어씁니다. 동일한 버전 번호를 구분할 수 없는 것을 방지하려면 글로벌 CLI를 먼저 제거할 수 있습니다

```

#### 3、자체 프로젝트의 루트 디렉토리 아래에 샌드박스 Dockerfile을 생성합니다

- 경로: `.qwen/sandbox.Dockerfile`

- 공식 이미지 주소: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# 공식 Qwen 샌드박스 이미지 기반 (버전을 명시적으로 지정하는 것이 좋습니다)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# 여기에 추가 도구를 추가합니다
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4、프로젝트의 루트 디렉토리에서 첫 번째 샌드박스 이미지를 생성합니다

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# 시작하는 샌드박스 버전의 도구가 사용자 정의 이미지 버전과 일치하는지 확인합니다. 일치하면 시작 성공입니다
```

이렇게 하면 기본 샌드박스 이미지를 기반으로 프로젝트별 이미지가 빌드됩니다.

#### npm link 제거

- qwen의 공식 CLI를 복원하려면 npm link를 제거하세요

```bash
# 방법 1: 글로벌에서 링크 해제
npm unlink -g @qwen-code/qwen-code

# 방법 2: packages/cli 디렉토리에서 제거
cd packages/cli
npm unlink

# 해제가 되었는지 확인
which qwen
# "qwen not found"가 표시되어야 합니다

# 필요한 경우 글로벌 버전을 다시 설치
npm install -g @qwen-code/qwen-code

# 복구 확인
which qwen
qwen --version
```
