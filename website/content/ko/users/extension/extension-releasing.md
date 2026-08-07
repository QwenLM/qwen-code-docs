---
title: Extension Releasing
---

# 확장 릴리스

사용자에게 확장을 릴리스하는 세 가지 주요 방법이 있습니다:

- [Git 저장소](#git-저장소를-통한-릴리스)
- [Github Releases](#github-releases를-통한-릴리스)
- [npm 레지스트리](#npm-레지스트리를-통한-릴리스)

Git 저장소 릴리스가 가장 간단하고 유연한 접근 방식이며, GitHub 릴리스는 각 파일을 개별적으로 다운로드하는 git clone이 아닌 단일 아카이브로 제공되므로 초기 설치 시 더 효율적일 수 있습니다. GitHub 릴리스는 플랫폼별 바이너리 파일을 제공해야 하는 경우 플랫폼별 아카이브를 포함할 수도 있습니다. npm 레지스트리 릴리스는 이미 패키지 배포에 npm을 사용하는 팀, 특히 프라이빗 레지스트리가 있는 경우에 이상적입니다.

## Git 저장소를 통한 릴리스

가장 유연하고 간단한 옵션입니다. 공개적으로 접근 가능한 git 저장소(예: 공개 GitHub 저장소)를 생성하면 사용자가 `qwen extensions install <your-repo-uri>`를 사용하여 확장을 설치할 수 있으며, GitHub 저장소의 경우 간소화된 `qwen extensions install <org>/<repo>` 형식을 사용할 수 있습니다. `--ref=<some-ref>` 인자를 사용하여 특정 ref(브랜치/태그/커밋)에 선택적으로 의존할 수 있으며, 기본값은 기본 브랜치입니다.

사용자가 의존하는 ref에 커밋이 푸시될 때마다 확장을 업데이트하라는 프롬프트가 표시됩니다. 이는 쉬운 롤백도 가능하다는 의미이며, HEAD 커밋은 `qwen-extension.json` 파일의 실제 버전과 관계없이 항상 최신 버전으로 처리됩니다.

### Git 저장소를 사용한 릴리스 채널 관리

사용자는 브랜치나 태그 등 git 저장소의 어떤 ref에도 의존할 수 있으므로 여러 릴리스 채널을 관리할 수 있습니다.

예를 들어 `stable` 브랜치를 유지하고 사용자가 `qwen extensions install <your-repo-uri> --ref=stable`로 설치할 수 있습니다. 또는 기본 브랜치를 안정 릴리스 브랜치로 사용하고 다른 브랜치(예: `dev`)에서 개발을 수행하여 이를 기본 동작으로 만들 수 있습니다. 원하는 만큼 많은 브랜치나 태그를 유지하여 사용자와 최대의 유연성을 제공할 수 있습니다.

이러한 `ref` 인자는 태그, 브랜치 또는 특정 커밋일 수 있으므로 사용자가 특정 버전의 확장에 의존할 수 있습니다. 태그와 브랜치를 어떻게 관리할지는 사용자에게 달려 있습니다.

### Git 저장소를 사용한 릴리스 흐름 예시

git 흐름을 사용하여 릴리스를 관리하는 방법은 여러 가지가 있지만, 기본 브랜치를 "stable" 릴리스 브랜치로 사용하는 것을 권장합니다. 즉 `qwen extensions install <your-repo-uri>`의 기본 동작이 안정 릴리스 브랜치에 있게 됩니다.

`stable`, `preview`, `dev` 세 가지 표준 릴리스 채널을 유지하고 싶다고 가정해 봅시다. `dev` 브랜치에서 모든 표준 개발을 수행합니다. 프리뷰 릴리스를 준비하면 해당 브랜치를 `preview` 브랜치에 병합합니다. 프리뷰 브랜치를 안정으로 승격할 준비가 되면 `preview`를 안정 브랜치(기본 브랜치일 수도 있고 다른 브랜치일 수도 있음)에 병합합니다.

`git cherry-pick`을 사용하여 한 브랜치에서 다른 브랜치로 변경을 체리픽할 수도 있지만, 각 릴리스마다 브랜치에 변경을 강제 푸시하여 기록을 깨끗한 상태로 복원하지 않는 한 브랜치의 기록이 약간 분기된다는 점에 유의하세요(저장소 설정에 따라 기본 브랜치에서는 불가능할 수 있음). 체리픽을 계획한다면 일반적으로 피해야 하는 기본 브랜치로의 강제 푸시를 피하기 위해 기본 브랜치를 안정 브랜치로 사용하지 않는 것이 좋습니다.

## GitHub Releases를 통한 릴리스

Qwen Code 확장은 [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)를 통해 배포할 수 있습니다. 이는 저장소를 clone할 필요가 없으므로 사용자에게 더 빠르고 안정적인 초기 설치 경험을 제공합니다.

각 릴리스는 연결된 태그에서 저장소의 전체 내용을 포함하는 최소 하나의 아카이브 파일을 포함합니다. 릴리스는 확장에 빌드 단계가 필요하거나 플랫폼별 바이너리가 첨부된 경우 [미리 빌드된 아카이브](#사용자-정의-미리-빌드된-아카이브)를 포함할 수도 있습니다.

업데이트를 확인할 때 qwen code는 GitHub에서 최신 릴리스를 찾습니다(릴리스 생성 시 그렇게 표시해야 함). 단, 사용자가 `--ref=<some-release-tag>`를 전달하여 특정 릴리스를 설치한 경우는 예외입니다. 현재 프리릴리스에 옵트인하거나 semver를 지원하지 않습니다.

### 사용자 정의 미리 빌드된 아카이브

사용자 정의 아카이브는 GitHub 릴리스에 자산으로 직접 첨부되어야 하며 완전히 자체 포함되어야 합니다. 즉 전체 확장을 포함해야 하며, [아카이브 구조](#아카이브-구조)를 참조하세요.

확장이 플랫폼 독립적인 경우 단일 범용 자산을 제공할 수 있습니다. 이 경우 릴리스에 첨부된 자산은 하나만 있어야 합니다.

사용자 정의 아카이브는 더 큰 저장소 내에서 확장을 개발하려는 경우에도 사용할 수 있습니다. 저장소 자체와 다른 레이아웃의 아카이브를 빌드할 수 있습니다(예: 확장을 포함하는 하위 디렉토리의 아카이브).

#### 플랫폼별 아카이브

Qwen Code가 각 플랫폼에 대해 올바른 릴리스 자산을 자동으로 찾을 수 있도록 하려면 다음 명명 규칙을 따라야 합니다. CLI는 다음 순서로 자산을 검색합니다:

1.  **플랫폼 및 아키텍처별:** `{platform}.{arch}.{name}.{extension}`
2.  **플랫폼별:** `{platform}.{name}.{extension}`
3.  **범용:** 자산이 하나만 제공되면 범용 폴백으로 사용됩니다.

- `{name}`: 확장의 이름.
- `{platform}`: 운영 체제. 지원되는 값:
  - `darwin`(macOS)
  - `linux`
  - `win32`(Windows)
- `{arch}`: 아키텍처. 지원되는 값:
  - `x64`
  - `arm64`
- `{extension}`: 아카이브의 파일 확장자(예: `.tar.gz` 또는 `.zip`).

**예시:**

- `darwin.arm64.my-tool.tar.gz`(Apple Silicon Mac 전용)
- `darwin.my-tool.tar.gz`(모든 Mac용)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### 아카이브 구조

아카이브는 완전히 포함된 확장이어야 하며 모든 표준 요구 사항을 충족해야 합니다. 특히 `qwen-extension.json` 파일이 아카이브의 루트에 있어야 합니다.

나머지 레이아웃은 일반적인 확장과 정확히 동일해야 합니다. [introduction.md](./introduction.md)를 참조하세요.

#### GitHub Actions 워크플로 예시

여러 플랫폼을 위한 Qwen Code 확장을 빌드하고 릴리스하는 GitHub Actions 워크플로의 예시입니다:

```yaml
name: Release Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build

      - name: Create release assets
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```

## npm 레지스트리를 통한 릴리스

Qwen Code 확장을 스코프된 npm 패키지(예: `@your-org/my-extension`)로 게시할 수 있습니다. 다음 경우에 적합합니다:

- 팀이 이미 패키지 배포에 npm을 사용하는 경우
- 기존 인증 인프라가 있는 프라이빗 레지스트리 지원이 필요한 경우
- npm에서 버전 확인 및 접근 제어를 처리하길 원하는 경우

### 패키지 요구 사항

npm 패키지는 패키지 루트에 `qwen-extension.json` 파일을 포함해야 합니다. 이것은 모든 Qwen Code 확장에서 사용하는 동일한 구성 파일입니다 — npm tarball은 단순히 또 다른 전달 메커니즘일 뿐입니다.

최소 패키지 구조는 다음과 같습니다:

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # 선택적 컨텍스트 파일
├── commands/             # 선택적 사용자 정의 명령어
├── skills/               # 선택적 사용자 정의 skill
└── agents/               # 선택적 사용자 정의 서브에이전트
```

`qwen-extension.json`이 게시된 패키지에 포함되도록 하세요(즉, `.npmignore` 또는 `package.json`의 `files` 필드에서 제외되지 않도록).

### 게시

표준 npm 게시 도구를 사용하세요:

```bash
# 기본 레지스트리에 게시
npm publish

# 프라이빗/사용자 정의 레지스트리에 게시
npm publish --registry https://your-registry.com
```

### 설치

사용자는 스코프된 패키지 이름을 사용하여 확장을 설치합니다:

```bash
# 최신 버전 설치
qwen extensions install @your-org/my-extension

# 특정 버전 설치
qwen extensions install @your-org/my-extension@1.2.0

# 사용자 정의 레지스트리에서 설치
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### 업데이트 동작

- 버전 핀 없이 설치된 확장(예: `@scope/pkg`)은 `latest` dist-tag를 추적합니다.
- dist-tag로 설치된 확장(예: `@scope/pkg@beta`)은 해당 특정 태그를 추적합니다.
- 정확한 버전으로 고정된 확장(예: `@scope/pkg@1.2.0`)은 항상 최신으로 간주되며 업데이트 프롬프트가 표시되지 않습니다.

### 프라이빗 레지스트리 인증

Qwen Code는 npm 인증 자격 증명을 자동으로 읽습니다:

1. **`NPM_TOKEN` 환경 변수** — 최고 우선순위
2. **`.npmrc` 파일** — 호스트 수준 및 경로 범위 `_authToken` 항목을 모두 지원(예: `//your-registry.com/:_authToken=TOKEN` 또는 `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

`.npmrc` 파일은 현재 디렉토리와 사용자 홈 디렉토리에서 읽힙니다.

### 릴리스 채널 관리

npm dist-tags를 사용하여 릴리스 채널을 관리할 수 있습니다:

```bash
# beta 릴리스 게시
npm publish --tag beta

# 사용자가 beta 채널 설치
qwen extensions install @your-org/my-extension@beta
```

이는 git 브랜치 기반 릴리스 채널과 유사하게 작동하지만 npm의 네이티브 dist-tag 메커니즘을 사용합니다.
