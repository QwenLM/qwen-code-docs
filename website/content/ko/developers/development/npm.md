# 패키지 개요

이 모노레포는 두 개의 주요 패키지를 포함합니다: `@qwen-code/qwen-code`와 `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Qwen Code의 메인 패키지입니다. 사용자 인터페이스, 명령어 파싱 및 기타 모든 사용자 대면 기능을 담당합니다.

이 패키지가 게시될 때 단일 실행 파일로 번들링됩니다. 이 번들은 `@qwen-code/qwen-code-core`를 포함한 패키지의 모든 의존성을 포함합니다. 즉, 사용자가 `npm install -g @qwen-code/qwen-code`로 설치하든 `npx @qwen-code/qwen-code`로 직접 실행하든, 이 단일 자체 포함 실행 파일을 사용하게 됩니다.

## `@qwen-code/qwen-code-core`

이 패키지는 CLI의 핵심 로직을 포함합니다. 설정된 프로바이더에 대한 API 요청, 인증 처리, 로컬 캐시 관리를 담당합니다.

이 패키지는 번들링되지 않습니다. 게시될 때 자체 의존성을 가진 표준 Node.js 패키지로 게시됩니다. 이를 통해 필요시 다른 프로젝트에서 독립형 패키지로 사용할 수 있습니다. `dist` 폴더의 모든 트랜스파일된 js 코드가 패키지에 포함됩니다.

# 릴리스 프로세스

이 프로젝트는 모든 패키지가 올바르게 버전 관리되고 게시되도록 구조화된 릴리스 프로세스를 따릅니다. 가능한 한 자동화되도록 설계되었습니다.

## 릴리스 방법

릴리스는 [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) GitHub Actions 워크플로를 통해 관리됩니다. 패치나 핫픽스에 대한 수동 릴리스를 수행하려면:

1.  저장소의 **Actions** 탭으로 이동합니다.
2.  목록에서 **Release** 워크플로를 선택합니다.
3.  **Run workflow** 드롭다운 버튼을 클릭합니다.
4.  필수 입력을 채웁니다:
    - **Version**: 릴리스할 정확한 버전 (예: `v0.2.1`).
    - **Ref**: 릴리스할 브랜치 또는 커밋 SHA (기본값: `main`).
    - **Dry Run**: 게시 없이 워크플로를 테스트하려면 `true`로 두고, 실제 릴리스를 수행하려면 `false`로 설정합니다.
5.  **Run workflow**를 클릭합니다.

## 릴리스 유형

이 프로젝트는 여러 유형의 릴리스를 지원합니다:

### Stable 릴리스

프로덕션 사용을 위한 정규 stable 릴리스.

### Preview 릴리스

다가오는 기능에 대한 얼리 액세스를 위해 매주 화요일 23:59 UTC에 제공되는 Preview 릴리스.

### Nightly 릴리스

최신 개발 테스트를 위해 매일 자정 UTC에 제공되는 Nightly 릴리스.

## 자동화 릴리스 스케줄

- **Nightly**: 매일 자정 UTC
- **Preview**: 매주 화요일 23:59 UTC
- **Stable**: 관리자가 트리거하는 수동 릴리스

### 다양한 릴리스 유형 사용 방법

각 유형의 최신 버전을 설치하려면:

```bash
# Stable (기본값)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### 릴리스 프로세스 세부 정보

예약된 또는 수동 릴리스마다 다음 단계가 수행됩니다:

1.  지정된 코드(`main` 브랜치의 최신 또는 특정 커밋)를 체크아웃합니다.
2.  모든 의존성을 설치합니다.
3.  `preflight` 체크 및 통합 테스트 전체를 실행합니다.
4.  모든 테스트가 성공하면 릴리스 유형에 따라 적절한 버전 번호를 계산합니다.
5.  적절한 dist-tag와 함께 패키지를 빌드하고 npm에 게시합니다.
6.  버전에 대한 GitHub Release를 생성합니다.

### 실패 처리

릴리스 워크플로의 어느 단계라도 실패하면 저장소에 `bug` 라벨과 유형별 실패 라벨(예: `nightly-failure`, `preview-failure`)이 포함된 새 이슈가 자동으로 생성됩니다. 이슈에는 쉬운 디버깅을 위해 실패한 워크플로 실행에 대한 링크가 포함됩니다.

## 릴리스 유효성 검증

새 릴리스를 푸시한 후 패키지가 예상대로 작동하는지 확인하기 위해 스모크 테스트를 수행해야 합니다. 패키지를 로컬에 설치하고 올바르게 작동하는지 확인하기 위한 테스트 세트를 실행하면 됩니다.

- `npx -y @qwen-code/qwen-code@latest --version` — rc나 dev 태그가 아닌 경우 푸시가 예상대로 작동했는지 확인
- `npx -y @qwen-code/qwen-code@<release tag> --version` — 태그가 올바르게 푸시되었는지 확인
- _이 명령은 로컬 환경에 영향을 줍니다_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<version>`
- 몇 가지 LLM 명령어와 도구를 실행하는 기본적인 스모크 테스트를 수행하여 패키지가 예상대로 작동하는지 확인하는 것이 좋습니다. 향후 이를 더 체계화할 예정입니다.

## 버전 변경을 병합할 시점과 말아야 할 시점

현재 또는 이전 커밋에서 패치 또는 핫픽스 릴리스를 만드는 위의 패턴은 저장소를 다음 상태로 남깁니다:

1.  태그(`vX.Y.Z-patch.1`): 이 태그는 릴리스하려는 stable 코드가 포함된 main의 원본 커밋을 올바르게 가리킵니다. 이것이 핵심입니다. 이 태그를 체크아웃하는任何人都는 게시된 정확한 코드를 얻게 됩니다.
2.  브랜치(`release-vX.Y.Z-patch.1`): 이 브랜치는 태그된 커밋 위에 하나의 새 커밋을 포함합니다. 새 커밋은 package.json(및 package-lock.json 등 기타 관련 파일)의 버전 번호 변경만 포함합니다.

이 분리는 올바른 방식입니다. 병합하기로 결정할 때까지 릴리스 관련 버전 bump가 main 브랜치 이력을 오염시키지 않습니다.

이것이 핵심 결정이며, 릴리스의 성격에 전적으로 달려 있습니다.

### Stable 패치 및 핫픽스는 병합

stable 패치 또는 핫픽스 릴리스의 경우 `release-<tag>` 브랜치를 `main`으로 거의 항상 병합해야 합니다.

- 이유: 주요 이유는 main의 package.json에서 버전을 업데이트하기 위해서입니다. 이전 커밋에서 v1.2.1을 릴리스하고 버전 bump를 병합하지 않으면 main 브랜치의 package.json은 여전히 "version": "1.2.0"을 나타냅니다. 다음 기능 릴리스(v1.3.0) 작업을 시작하는 개발자는 정확하지 않은 이전 버전 번호를 가진 코드베이스에서 브랜치를 만들게 됩니다. 이는 혼란을 초래하고 나중에 수동 버전 bump가 필요하게 됩니다.
- 절차: release-v1.2.1 브랜치가 생성되고 패키지가 성공적으로 게시된 후 release-v1.2.1을 main에 병합하는 풀 리퀘스트를 열어야 합니다. 이 PR에는 단 하나의 커밋만 포함됩니다: "chore: bump version to v1.2.1". 깔끔하고 단순한 통합으로 main 브랜치를 최신 릴리스 버전과 동기화합니다.

### Pre-Release(RC, Beta, Dev)는 병합하지 않음

Pre-release 릴리스의 릴리스 브랜치는 일반적으로 `main`에 병합하지 않습니다.

- 이유: Pre-release 버전(예: v1.3.0-rc.1, v1.3.0-rc.2)은 정의상 stable이 아니며 임시입니다. release candidate의 버전 bump 시리즈로 main 브랜치 이력을 오염시키고 싶지 않습니다. main의 package.json은 최신 stable 릴리스 버전을 반영해야 하며 RC를 반영해서는 안 됩니다.
- 절차: release-v1.3.0-rc.1 브랜치가 생성되고 npm publish --tag rc가 수행된 후... 브랜치는 목적을 다했습니다. 간단히 삭제하면 됩니다. RC의 코드는 이미 main(또는 기능 브랜치)에 있으므로 기능적 코드는 손실되지 않습니다. 릴리스 브랜치는 버전 번호를 위한 임시 수단에 불과합니다.

## 로컬 테스트 및 유효성 검증: 패키징 및 게시 프로세스 변경

NPM에 실제로 게시하거나 공개 GitHub 릴리스를 생성하지 않고 릴리스 프로세스를 테스트해야 하는 경우 GitHub UI에서 워크플로를 수동으로 트리거할 수 있습니다.

1.  저장소의 [Actions 탭](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml)으로 이동합니다.
2.  "Run workflow" 드롭다운을 클릭합니다.
3.  `dry_run` 옵션을 체크한 상태로 둡니다(`true`).
4.  "Run workflow" 버튼을 클릭합니다.

이렇게 하면 전체 릴리스 프로세스가 실행되지만 `npm publish`와 `gh release create` 단계는 건너뜁니다. 워크플로 로그를 확인하여 모든 것이 예상대로 작동하는지 확인할 수 있습니다.

패키징 및 게시 프로세스에 대한 변경 사항을 커밋하기 전에 로컬에서 테스트하는 것이 중요합니다. 이렇게 하면 패키지가 올바르게 게시되고 사용자가 설치할 때 예상대로 작동할 것을 보장할 수 있습니다.

변경 사항을 유효성 검증하려면 게시 프로세스의 dry run을 수행할 수 있습니다. 이렇게 하면 실제로 npm 레지스트리에 게시하지 않고도 게시 프로세스를 시뮬레이션합니다.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

이 명령은 다음을 수행합니다:

1.  모든 패키지를 빌드합니다.
2.  모든 prepublish 스크립트를 실행합니다.
3.  npm에 게시될 패키지 타볼을 생성합니다.
4.  게시될 패키지의 요약을 출력합니다.

그런 다음 생성된 타볼을 검사하여 올바른 파일을 포함하고 있는지, `package.json` 파일이 올바르게 업데이트되었는지 확인할 수 있습니다. 타볼은 각 패키지 디렉토리의 루트에 생성됩니다(예: `packages/cli/qwen-code-0.1.6.tgz`).

Dry run을 수행하면 패키징 프로세스에 대한 변경 사항이 올바르고 패키지가 성공적으로 게시될 것임을 확신할 수 있습니다.

## 릴리스 심층 분석

릴리스 프로세스의 주요 목표는 packages/ 디렉토리의 소스 코드를 가져와 빌드하고 프로젝트 루트의 임시 `dist` 디렉토리에 깔끔하고 자체 포함된 패키지를 조립하는 것입니다. 이 `dist` 디렉토리가 실제로 NPM에 게시됩니다.

주요 단계는 다음과 같습니다:

1단계: Pre-Release 상태 확인 및 버전 관리

- 수행 작업: 파일이 이동되기 전에 프로세스는 프로젝트가 양호한 상태인지 확인합니다. 여기에는 테스트, 린팅 및 타입 체크(`npm run preflight`)가 포함됩니다. 루트 package.json과 packages/cli/package.json의 버전 번호가 새 릴리스 버전으로 업데이트됩니다.
- 이유: 고품질의 작동하는 코드만 릴리스되도록 보장합니다. 버전 관리는 새 릴리스를 알리는 첫 번째 단계입니다.

2단계: 소스 코드 빌드

- 수행 작업: packages/core/src와 packages/cli/src의 TypeScript 소스 코드가 JavaScript로 컴파일됩니다.
- 파일 이동:
  - packages/core/src/\*_/_.ts -> 컴파일 대상 -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> 컴파일 대상 -> packages/cli/dist/
- 이유: 개발 중에 작성된 TypeScript 코드는 Node.js에서 실행할 수 있는 일반 JavaScript로 변환되어야 합니다. cli 패키지가 의존하므로 core 패키지가 먼저 빌드됩니다.

3단계: 최종 게시 가능 패키지 번들링 및 조립

파일이 이동되고 게시를 위한 최종 상태로 변환되는 가장 중요한 단계입니다. 이 프로세스는 현대적인 번들링 기법을 사용하여 최종 패키지를 생성합니다.

1.  번들 생성:
    - 수행 작업: prepare-package.js 스크립트가 `dist` 디렉토리에 깔끔한 배포 패키지를 생성합니다.
    - 주요 변환:
      - README.md와 LICENSE를 dist/로 복사
      - 국제화를 위한 locales 폴더 복사
      - 필요한 의존성만 포함된 깔끔한 package.json을 배포용으로 생성
      - 배포 의존성을 최소로 유지(번들된 런타임 의존성 없음)
      - node-pty에 대한 선택적 의존성 유지

2.  JavaScript 번들 생성:
    - 수행 작업: 두 패키지 packages/core/dist와 packages/cli/dist에서 빌드된 JavaScript가 esbuild를 사용하여 단일 실행 가능한 JavaScript 파일로 번들링됩니다.
    - 파일 위치: dist/cli.js
    - 이유: 필요한 모든 애플리케이션 코드를 포함한 단일 최적화된 파일을 생성합니다. 설치 시 복잡한 의존성 해결이 필요 없도록 하여 패키지를 단순화합니다.

3.  정적 및 지원 파일 복사:
    - 수행 작업: 소스 코드의 일부는 아니지만 패키지가 올바르게 작동하거나 잘 설명되기 위해 필요한 필수 파일이 `dist` 디렉토리로 복사됩니다.
    - 파일 이동:
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Vendor 파일 -> dist/vendor/
    - 이유:
      - README.md와 LICENSE는 모든 NPM 패키지에 포함되어야 하는 표준 파일입니다.
      - Locales는 국제화 기능을 지원합니다.
      - Vendor 파일은 필요한 런타임 의존성을 포함합니다.

4단계: NPM에 게시

- 수행 작업: 루트 `dist` 디렉토리 내부에서 `npm publish` 명령이 실행됩니다.
- 이유: `dist` 디렉토리 내부에서 npm publish를 실행하면 3단계에서 조심스럽게 조립한 파일만 NPM 레지스트리에 업로드됩니다. 이렇게 하면 소스 코드, 테스트 파일 또는 개발 구성이 실수로 게시되는 것을 방지하여 사용자를 위한 깔끔하고 최소한의 패키지를 제공합니다.

이 프로세스는 최종 게시 아티팩트가 개발 워크스페이스의 직접적인 복사본이 아닌 목적에 맞게 구축된 깔끔하고 효율적인 프로젝트 표현임을 보장합니다.

## NPM Workspaces

이 프로젝트는 [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)를 사용하여 이 모노레포 내의 패키지를 관리합니다. 프로젝트 루트에서 여러 패키지에 걸쳐 의존성을 관리하고 스크립트를 실행할 수 있어 개발이 간소화됩니다.

### 작동 방식

루트 `package.json` 파일은 이 프로젝트의 워크스페이스를 정의합니다:

```json
{
  "workspaces": ["packages/*"]
}
```

이는 NPM에 `packages` 디렉토리 안의 모든 폴더가 워크스페이스의 일부로 관리되어야 하는 별도 패키지임을 알려줍니다.

### Workspaces의 이점

- **단순화된 의존성 관리**: 프로젝트 루트에서 `npm install`을 실행하면 워크스페이스의 모든 패키지에 대한 모든 의존성이 설치되고 함께 링크됩니다. 각 패키지 디렉토리에서 `npm install`을 실행할 필요가 없습니다.
- **자동 링크**: 워크스페이스 내의 패키지는 서로 의존할 수 있습니다. `npm install`을 실행하면 NPM이 패키지 간에 심볼릭 링크를 자동으로 생성합니다. 한 패키지를 변경하면 해당 패키지에 의존하는 다른 패키지에서 변경 사항이 즉시 사용 가능합니다.
- **단순화된 스크립트 실행**: `--workspace` 플래그를 사용하여 프로젝트 루트에서 모든 패키지의 스크립트를 실행할 수 있습니다. 예를 들어 `cli` 패키지의 `build` 스크립트를 실행하려면 `npm run build --workspace @qwen-code/qwen-code`를 실행하면 됩니다.
