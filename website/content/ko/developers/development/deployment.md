# Qwen Code 실행 및 배포

이 문서는 Qwen Code를 실행하는 방법과 Qwen Code가 사용하는 배포 아키텍처에 대해 설명합니다.

## Qwen Code 실행

Qwen Code를 실행하는 방법은 여러 가지가 있습니다. 선택하는 방법은 사용 목적에 따라 다릅니다.

---

### 1. 표준 설치 (일반 사용자에게 권장)

최종 사용자가 Qwen Code를 설치하는 권장 방법입니다. NPM 레지스트리에서 Qwen Code 패키지를 다운로드합니다.

- **전역 설치:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  그런 다음 어디에서나 CLI를 실행합니다:

  ```bash
  qwen
  ```

- **NPX 실행:**

  ```bash
  # 전역 설치 없이 NPM에서 최신 버전 실행
  npx @qwen-code/qwen-code
  ```

---

### 2. 샌드박스에서 실행 (Docker/Podman)

보안과 격리를 위해 Qwen Code를 컨테이너 내부에서 실행할 수 있습니다. 이는 CLI가 부작용을 일으킬 수 있는 도구를 실행하는 기본 방식입니다.

- **레지스트리에서 직접 실행:**
  게시된 샌드박스 이미지를 직접 실행할 수 있습니다. Docker만 있고 CLI를 실행하려는 환경에 유용합니다.
  ```bash
  # 게시된 샌드박스 이미지 실행
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **`--sandbox` 플래그 사용:**
  로컬에 Qwen Code가 설치되어 있다면(위에서 설명한 표준 설치 사용), 샌드박스 컨테이너 내부에서 실행하도록 지시할 수 있습니다.
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. 소스에서 실행 (Qwen Code 기여자에게 권장)

프로젝트 기여자는 소스 코드에서 직접 CLI를 실행해야 합니다.

- **개발 모드:**
  이 방법은 핫 리로딩을 제공하며 활성 개발에 유용합니다.
  ```bash
  # 저장소 루트에서
  npm run start
  ```
- **프로덕션 유사 모드 (링크된 패키지):**
  이 방법은 로컬 패키지를 링크하여 전역 설치를 시뮬레이션합니다. 프로덕션 워크플로에서 로컬 빌드를 테스트하는 데 유용합니다.

  ```bash
  # 로컬 cli 패키지를 전역 node_modules에 링크
  npm link packages/cli

  # 이제 `qwen` 명령어를 사용하여 로컬 버전을 실행할 수 있습니다
  qwen
  ```

---

### 4. GitHub에서 최신 Qwen Code 커밋 실행

GitHub 저장소에서 가장 최근에 커밋된 버전의 Qwen Code를 직접 실행할 수 있습니다. 아직 개발 중인 기능을 테스트하는 데 유용합니다.

```bash
# GitHub의 main 브랜치에서 직접 CLI 실행
npx https://github.com/QwenLM/qwen-code
```

## 배포 아키텍처

위에서 설명한 실행 방법은 다음 아키텍처 구성 요소와 프로세스에 의해 가능합니다:

**NPM 패키지**

Qwen Code 프로젝트는 핵심 패키지를 NPM 레지스트리에 게시하는 모노레포입니다:

- `@qwen-code/qwen-code-core`: 백엔드, 로직 처리 및 도구 실행.
- `@qwen-code/qwen-code`: 사용자 대면 프론트엔드.

이 패키지들은 표준 설치 수행 시와 소스에서 Qwen Code를 실행할 때 사용됩니다.

**빌드 및 패키징 프로세스**

배포 채널에 따라 두 가지 distinct 빌드 프로세스가 사용됩니다:

- **NPM 게시:** NPM 레지스트리에 게시하기 위해 `@qwen-code/qwen-code-core`와 `@qwen-code/qwen-code`의 TypeScript 소스 코드가 TypeScript Compiler(`tsc`)를 사용하여 표준 JavaScript로 트랜스파일됩니다. 결과물인 `dist/` 디렉토리가 NPM 패키지에 게시됩니다. 이는 TypeScript 라이브러리의 표준 접근 방식입니다.

- **GitHub `npx` 실행:** GitHub에서 최신 버전의 Qwen Code를 직접 실행할 때 `package.json`의 `prepare` 스크립트에 의해 다른 프로세스가 트리거됩니다. 이 스크립트는 `esbuild`를 사용하여 전체 애플리케이션과 의존성을 단일 자체 포함 JavaScript 파일로 번들링합니다. 이 번들은 사용자 머신에서 실시간으로 생성되며 저장소에 체크인되지 않습니다.

**Docker 샌드박스 이미지**

Docker 기반 실행 방법은 `qwen-code-sandbox` 컨테이너 이미지로 지원됩니다. 이 이미지는 컨테이너 레지스트리에 게시되며 사전 설치된 전역 버전의 Qwen Code를 포함합니다.

## 릴리스 프로세스

릴리스 프로세스는 GitHub Actions를 통해 자동화됩니다. 릴리스 워크플로는 다음 작업을 수행합니다:

1.  `tsc`를 사용하여 NPM 패키지를 빌드합니다.
2.  NPM 패키지를 아티팩트 레지스트리에 게시합니다.
3.  번들된 애셋이 포함된 GitHub 릴리스를 생성합니다.
