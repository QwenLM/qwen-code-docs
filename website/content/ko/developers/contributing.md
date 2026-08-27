# 기여 방법

이 프로젝트에 대한 패치와 기여를 환영합니다.

## 기여 프로세스

### 코드 리뷰

프로젝트 멤버의 제출을 포함한 모든 제출물은 리뷰가 필요합니다. 이를 위해 [GitHub 풀 리퀘스트](https://docs.github.com/articles/about-pull-requests)를 사용합니다.

### 풀 리퀘스트 가이드라인

PR을 신속하게 리뷰하고 병합할 수 있도록 다음 가이드라인을 따라 주세요. 이 기준을 충족하지 못하는 PR은 종료될 수 있습니다.

#### 1. 기존 이슈에 연결

모든 PR은 트래커의 기존 이슈에 연결되어야 합니다. 이는 코드를 작성하기 전에 모든 변경사항이 논의되고 프로젝트 목표와 일치하도록 합니다.

- **버그 수정의 경우:** PR은 버그 리포트 이슈에 연결되어야 합니다.
- **기능의 경우:** PR은 유지관리자가 승인한 기능 요청 또는 제안 이슈에 연결되어야 합니다.

변경에 대한 이슈가 없다면, 먼저 **이슈를 생성**하고 코딩을 시작하기 전에 피드백을 기다려 주세요.

#### 2. 작고 집중적으로 유지

단일 이슈를 해결하거나 단일 자체 포함 기능을 추가하는 작고 원자적인 PR을 선호합니다.

- **권장:** 하나의 특정 버그를 수정하거나 하나의 특정 기능을 추가하는 PR을 생성합니다.
- **비권장:** 여러 관련 없는 변경사항(예: 버그 수정, 새 기능, 리팩토링)을 단일 PR에 묶지 않습니다.

경험상 PR이 약 1,200줄의 변경을 초과하면 분할을 시작하세요. 약 2,000줄 이상의 변경이 있는 PR은 독립적으로 리뷰 및 병합될 수 있는 일련의 작고 논리적인 PR로 분할하거나, 변경이 함께 적용되어야 하는 이유를 PR 설명에 명시해야 합니다.

#### 3. 진행 중인 작업에 드래프트 PR 사용

작업에 대한 조기 피드백을 원한다면 GitHub의 **Draft Pull Request** 기능을 사용해 주세요. 이는 PR이 아직 공식 리뷰 준비가 되지 않았지만 토론 및 초기 피드백에 열려 있음을 유지관리자에게 알립니다.

#### 4. 모든 검사를 통과하도록 확인

PR을 제출하기 전에 `npm run preflight`를 실행하여 모든 자동 검사가 통과되는지 확인하세요. 이 명령은 모든 테스트, 린팅 및 기타 스타일 검사를 실행합니다.

#### 5. 문서 업데이트

사용자 대상 변경사항(예: 새 명령어, 수정된 플래그, 동작 변경)을 도입하는 PR은 `/docs` 디렉토리의 관련 문서도 업데이트해야 합니다.

#### 6. 명확한 커밋 메시지와 좋은 PR 설명 작성

PR은 명확하고 설명적인 제목과 변경사항에 대한 자세한 설명을 가져야 합니다. 커밋 메시지에 [Conventional Commits](https://www.conventionalcommits.org/) 표준을 따르세요.

- **좋은 PR 제목:** `feat(cli): Add --json flag to 'config get' command`
- **나쁜 PR 제목:** `Made some changes`

PR 설명에서 변경사항의 "why"를 설명하고 관련 이슈에 연결하세요(예: `Fixes #123`).

## 개발 환경 설정 및 워크플로우

이 섹션에서는 기여자가 프로젝트를 빌드, 수정하고 개발 환경을 이해하는 방법을 안내합니다.

### 개발 환경 설정

**사전 요구사항:**

1.  **Node.js**:
    - **개발:** Node.js `>=22`를 사용해 주세요. TUI에서 사용하는 Ink 7은 Node 22가 필요하며, `react@^19.2.0`이 일치하는 피어입니다. [nvm](https://github.com/nvm-sh/nvm)과 같은 도구를 사용하여 Node.js 버전을 관리할 수 있습니다.
    - **프로덕션:** 프로덕션 환경에서 CLI를 실행하려면 Node.js `>=22`의 모든 버전을 사용할 수 있습니다.
2.  **Git**

### 빌드 프로세스

저장소를 클론하려면:

```bash
git clone https://github.com/QwenLM/qwen-code.git # 또는 포크의 URL
cd qwen-code
```

`package.json`에 정의된 의존성과 루트 의존성을 설치하려면:

```bash
npm install
```

전체 프로젝트(모든 패키지)를 빌드하려면:

```bash
npm run build
```

이 명령은 일반적으로 TypeScript를 JavaScript로 컴파일하고, 에셋을 번들링하고, 패키지를 실행 준비합니다. 빌드 중에 발생하는 일에 대한 자세한 내용은 `scripts/build.js`와 `package.json` 스크립트를 참조하세요.

### 샌드박싱 활성화

[샌드박싱](#sandboxing)은 강력히 권장되며, 최소한 `~/.env`에 `QWEN_SANDBOX=true`를 설정하고 샌드박싱 제공자(예: `macOS Seatbelt`, `docker`, `podman`)가 사용 가능한지 확인해야 합니다. 자세한 내용은 [샌드박싱](#sandboxing)을 참조하세요.

`qwen` CLI 유틸리티와 샌드박스 컨테이너를 모두 빌드하려면 루트 디렉토리에서 `build:all`을 실행하세요:

```bash
npm run build:all
```

샌드박스 컨테이너 빌드를 건너뛰려면 `npm run build`를 대신 사용할 수 있습니다.

### 실행

빌드 후 소스 코드에서 Qwen Code 애플리케이션을 시작하려면 루트 디렉토리에서 다음 명령을 실행하세요:

```bash
npm start
```

qwen-code 폴더 외부에서 소스 빌드를 실행하려면 `npm link path/to/qwen-code/packages/cli`를 활용할 수 있습니다(참고: [문서](https://docs.npmjs.com/cli/v9/commands/npm-link)). `qwen`으로 실행됩니다.

### 테스트 실행

이 프로젝트에는 단위 테스트와 통합 테스트 두 가지 유형의 테스트가 있습니다.

#### 단위 테스트

프로젝트의 단위 테스트 스위트를 실행하려면:

```bash
npm run test
```

이 명령은 `packages/core`와 `packages/cli` 디렉토리의 테스트를 실행합니다. 변경사항을 제출하기 전에 테스트가 통과하는지 확인하세요. 더 포괄적인 검사를 위해 `npm run preflight`를 실행하는 것이 좋습니다.

#### 통합 테스트

통합 테스트는 Qwen Code의 엔드투엔드 기능을 검증하도록 설계되었습니다. 기본 `npm run test` 명령의 일부로 실행되지 않습니다.

통합 테스트를 실행하려면 다음 명령을 사용하세요:

```bash
npm run test:e2e
```

통합 테스트 프레임워크에 대한 자세한 내용은 [통합 테스트 문서](./development/integration-tests.md)를 참조하세요.

### 린팅 및 프리플라이트 검사

코드 품질과 포맷팅 일관성을 보장하려면 프리플라이트 검사를 실행하세요:

```bash
npm run preflight
```

이 명령은 프로젝트의 `package.json`에 정의된 대로 ESLint, Prettier, 모든 테스트 및 기타 검사를 실행합니다.

_Tip_

클론 후 git precommit hook 파일을 생성하여 커밋이 항상 깔끔한지 확인하세요.

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 포맷팅

프로젝트의 코드를 포맷하려면 루트 디렉토리에서 다음 명령을 실행하세요:

```bash
npm run format
```

이 명령은 Prettier를 사용하여 프로젝트의 스타일 가이드라인에 따라 코드를 포맷합니다.

#### 린팅

프로젝트의 코드를 린팅하려면 루트 디렉토리에서 다음 명령을 실행하세요:

```bash
npm run lint
```

### 코딩 규칙

- 기존 코드베이스 전체에서 사용되는 코딩 스타일, 패턴, 규칙을 따라 주세요.
- **임포트:** 임포트 경로에 특히 주의하세요. 프로젝트는 ESLint를 사용하여 패키지 간 상대 임포트에 대한 제한을 강제합니다.

### 프로젝트 구조

- `packages/`: 프로젝트의 개별 하위 패키지를 포함합니다.
  - `cli/`: 커맨드라인 인터페이스.
  - `core/`: Qwen Code의 코어 백엔드 로직.
- `docs/`: 모든 프로젝트 문서를 포함합니다.
- `scripts/`: 빌드, 테스트, 개발 작업을 위한 유틸리티 스크립트.

더 자세한 아키텍처는 `docs/architecture.md`를 참조하세요.

## 문서 개발

이 섹션에서는 문서를 로컬에서 개발하고 미리보기하는 방법을 설명합니다.

### 사전 요구사항

1. Node.js(버전 22+)가 설치되어 있는지 확인
2. npm 또는 yarn 사용 가능

### 로컬에서 문서 사이트 설정

로컬에서 문서를 작업하고 변경사항을 미리보려면:

1. `docs-site` 디렉토리로 이동:

   ```bash
   cd docs-site
   ```

2. 의존성 설치:

   ```bash
   npm install
   ```

3. 메인 `docs` 디렉토리에서 문서 콘텐츠를 링크:

   ```bash
   npm run link
   ```

   이 명령은 `../docs`에서 docs-site 프로젝트의 `content`로 심볼릭 링크를 생성하여 문서 콘텐츠가 Next.js 사이트에서 서비스될 수 있도록 합니다.

4. 개발 서버 시작:

   ```bash
   npm run dev
   ```

5. 브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 변경사항을 실시간으로 반영하는 문서 사이트를 확인하세요.

메인 `docs` 디렉토리의 문서 파일에 대한 모든 변경사항은 문서 사이트에 즉시 반영됩니다.

## 디버깅

### VS Code:

0.  `F5`로 VS Code에서 CLI를 대화형으로 디버그합니다
1.  루트 디렉토리에서 디버그 모드로 CLI를 시작합니다:
    ```bash
    npm run debug
    ```
    이 명령은 `packages/cli` 디렉토리 내에서 `node --inspect-brk dist/index.js`를 실행하여 디버거가 연결될 때까지 실행을 일시 중지합니다. 그런 다음 Chrome 브라우저에서 `chrome://inspect`를 열어 디버거에 연결할 수 있습니다.
2.  VS Code에서 "Attach" 실행 구성(`.vscode/launch.json`에 위치)을 사용합니다.

또는 현재 열려 있는 파일을 직접 실행하려면 VS Code의 "Launch Program" 구성을 사용할 수 있지만, 일반적으로 'F5'가 권장됩니다.

샌드박스 컨테이너 내부에서 브레이크포인트를 적중시키려면:

```bash
DEBUG=1 qwen
```

**참고:** 프로젝트의 `.env` 파일에 `DEBUG=true`가 있으면 자동 제외로 인해 `qwen`에 영향을 주지 않습니다. `qwen`별 디버그 설정에는 `.qwen/.env` 파일을 사용하세요.

### React DevTools

CLI의 React 기반 UI를 디버그하려면 React DevTools를 사용할 수 있습니다. CLI 인터페이스에 사용되는 라이브러리인 Ink는 React DevTools 버전 4.x와 호환됩니다.

1.  **개발 모드에서 Qwen Code 애플리케이션 시작:**

    ```bash
    DEV=true npm start
    ```

2.  **React DevTools 버전 4.28.5(또는 최신 호환 4.x 버전) 설치 및 실행:**

    전역으로 설치할 수 있습니다:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    또는 npx를 사용하여 직접 실행할 수 있습니다:

    ```bash
    npx react-devtools@4.28.5
    ```

    실행 중인 CLI 애플리케이션이 React DevTools에 연결됩니다.

## 샌드박싱

> TBD

## 수동 배포

각 커밋에 대한 아티팩트를 내부 레지스트리에 배포합니다. 하지만 로컬 빌드를 수동으로 생성해야 하는 경우 다음 명령을 실행하세요:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
