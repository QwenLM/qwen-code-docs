# GitHub Actions: qwen-code-action

## 개요

`qwen-code-action`은 [Qwen Code CLI]를 통해 [Qwen Code]를 개발 워크플로우에 통합하는 GitHub Action입니다. 중요한 일상 코딩 작업을 위한 자율 에이전트이자, 작업을 빠르게 위임할 수 있는 온디맨드 협업자 역할을 합니다.

GitHub pull request 리뷰, 이슈 분류, 코드 분석 및 수정 등을 [Qwen Code]와 대화식으로 수행하는 데 사용하세요 (예: `@qwencoder fix this issue`) GitHub 리포지토리 내에서 직접.

## 기능

- **자동화**: 이벤트(예: 이슈 열기) 또는 일정(예: 야간)을 기반으로 워크플로를 트리거합니다.
- **온디맨드 협업**: 이슈 및 pull request 댓글에서 [Qwen Code CLI](./features/commands)를 언급하여 워크플로를 트리거합니다 (예: `@qwencoder /review`).
- **도구로 확장 가능**: [Qwen Code](../developers/tools/introduction.md) 모델의 도구 호출 기능을 활용하여 [GitHub CLI](./`gh`)와 같은 다른 CLI와 상호작용합니다.
- **커스터마이즈 가능**: 리포지토리의 `QWEN.md` 파일을 사용하여 [Qwen Code CLI](./features/commands)에 프로젝트별 지시사항과 컨텍스트를 제공합니다.

## 빠른 시작

몇 분 만에 리포지토리에서 Qwen Code CLI를 시작하세요:

### 1. Qwen API 키 받기

[DashScope](https://help.aliyun.com/zh/model-studio/qwen-code)(Alibaba Cloud의 AI 플랫폼)에서 API 키를 발급받으세요.

### 2. GitHub Secret으로 추가

API 키를 `QWEN_API_KEY`라는 이름의 시크릿으로 리포지토리에 저장합니다:

- 리포지토리의 **Settings > Secrets and variables > Actions**로 이동
- **New repository secret** 클릭
- 이름: `QWEN_API_KEY`, 값: API 키

### 3. .gitignore 업데이트

다음 항목을 `.gitignore` 파일에 추가합니다:

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. 워크플로 선택

워크플로를 설정하는 두 가지 옵션이 있습니다:

**옵션 A: setup 명령어 사용 (권장)**

1. 터미널에서 Qwen Code CLI를 시작합니다:

   ```shell
   qwen
   ```

2. 터미널의 Qwen Code CLI에서 다음을 입력합니다:

   ```
   /setup-github
   ```

**옵션 B: 수동으로 워크플로 복사**

1. [`examples/workflows`](./common-workflow) 디렉토리에서 사전 구축된 워크플로를 리포지토리의 `.github/workflows` 디렉토리로 복사합니다. 참고: `qwen-dispatch.yml` 워크플로도 복사해야 합니다. 이 워크플로가 실행될 워크플로를 트리거합니다.

### 5. 사용해보기

**Pull Request 리뷰:**

- 리포지토리에서 pull request를 열고 자동 리뷰를 기다립니다
- 기존 pull request에 `@qwencoder /review`를 댓글로 달아 수동으로 리뷰를 트리거합니다

**이슈 분류:**

- 이슈를 열고 자동 분류를 기다립니다
- 기존 이슈에 `@qwencoder /triage`를 댓글로 달아 수동으로 분류를 트리거합니다

**일반 AI 지원:**

- 모든 이슈 또는 pull request에서 `@qwencoder`를 언급하고 요청을 따릅니다
- 예시:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## 워크플로

이 action은 다양한 사용 사례를 위한 여러 사전 구축 워크플로를 제공합니다. 각 워크플로는 리포지토리의 `.github/workflows` 디렉토리로 복사되어 필요에 따라 커스터마이즈되도록 설계되었습니다.

### Qwen Code Dispatch

이 워크플로는 Qwen Code CLI의 중앙 디스패처 역할을 하며, 트리거 이벤트와 댓글에 제공된 명령어를 기반으로 적절한 워크플로로 요청을 라우팅합니다. dispatch 워크플로 설정에 대한 자세한 가이드는 [Qwen Code Dispatch 워크플로 문서](./common-workflow)를 참조하세요.

### 이슈 분류

이 action은 GitHub Issues를 자동으로 또는 온디맨드로 분류하는 데 사용할 수 있습니다. 작동하는 이슈 분류 설정에 대해서는 [Qwen triage 워크플로](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-triage.yml)를 참조하세요.

### Pull Request 리뷰

이 action은 pull request가 열릴 때 자동으로 리뷰하는 데 사용할 수 있습니다. pull request 리뷰 시스템 설정에 대한 자세한 가이드는 [GitHub PR Review 워크플로 문서](./common-workflow)를 참조하세요.

### Qwen Code CLI 어시스턴트

이 유형의 action은 pull request와 이슈 내에서 범용 대화형 Qwen Code AI 어시스턴트를 호출하여 다양한 작업을 수행하는 데 사용할 수 있습니다. 범용 Qwen Code CLI 워크플로 설정에 대한 자세한 가이드는 [Qwen Code Assistant 워크플로 문서](./common-workflow)를 참조하세요.

## 설정

### 입력

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)\_ Qwen API의 API 키.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, default: `latest`)\_ 설치할 Qwen Code CLI의 버전. "latest", "preview", "nightly", 특정 버전 번호, 또는 git 브랜치, 태그, 커밋이 될 수 있습니다. 자세한 내용은 [Qwen Code CLI releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md)를 참조하세요.

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)\_ 디버그 로깅 및 출력 스트리밍을 활성화합니다.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)\_ Qwen Code와 함께 사용할 모델.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Optional, default: `You are a helpful assistant.`)_ Qwen Code CLI의 [`--prompt` 인수](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments)에 전달되는 문자열.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Optional)_ CLI의 _프로젝트_ 설정을 구성하기 위해 `.qwen/settings.json`에 쓰이는 JSON 문자열.
  자세한 내용은 [설정 파일](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files) 문서를 참조하세요.

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, default: `false`)\_ 기본 Qwen Code API 키 대신 Qwen Code 모델 접근에 Code Assist를 사용할지 여부.
  자세한 내용은 [Qwen Code CLI 문서](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)를 참조하세요.

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, default: `false`)\_ 기본 Qwen Code API 키 대신 Qwen Code 모델 접근에 Vertex AI를 사용할지 여부.
  자세한 내용은 [Qwen Code CLI 문서](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)를 참조하세요.

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Optional)_ 설치할 Qwen Code CLI 확장 목록.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, default: `false`)\_ GitHub action에 아티팩트를 업로드할지 여부.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, default: `false`)\_ qwen-code-cli 설치에 npm 대신 pnpm을 사용할지 여부.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, default: `${{ github.workflow }}`)\_ GitHub 워크플로 이름. 텔레메트리 목적으로 사용됩니다.

<!-- END_AUTOGEN_INPUTS -->

### 출력

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 실행의 요약된 출력.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 실행의 오류 출력 (있는 경우).

<!-- END_AUTOGEN_OUTPUTS -->

### 리포지토리 변수

모든 워크플로에서 재사용할 수 있도록 다음 값을 리포지토리 변수로 설정하는 것을 권장합니다. 또는 개별 워크플로의 action 입력으로 인라인 설정하거나 리포지토리 수준 값을 재정의할 수 있습니다.

| 이름               | 설명                                                     | 유형     | 필수 | 필수 조건                  |
| ------------------ | -------------------------------------------------------- | -------- | ---- | -------------------------- |
| `DEBUG`            | Qwen Code CLI의 디버그 로깅을 활성화합니다.              | Variable | 아니오 | 없음                       |
| `QWEN_CLI_VERSION` | 설치되는 Qwen Code CLI의 버전을 제어합니다.              | Variable | 아니오 | CLI 버전 고정              |
| `APP_ID`           | 커스텀 인증을 위한 GitHub App ID.                        | Variable | 아니오 | 커스텀 GitHub App 사용     |

리포지토리 변수를 추가하려면:

1. 리포지토리의 **Settings > Secrets and variables > Actions > New variable**로 이동합니다.
2. 변수 이름과 값을 입력합니다.
3. 저장합니다.

리포지토리 변수에 대한 자세한 내용은 [변수에 대한 GitHub 문서][variables]를 참조하세요.

### 시크릿

리포지토리에 다음 시크릿을 설정할 수 있습니다:

| 이름              | 설명                                     | 필수 | 필수 조건                          |
| ----------------- | ---------------------------------------- | ---- | ---------------------------------- |
| `QWEN_API_KEY`    | DashScope의 Qwen API 키.                 | 예   | Qwen을 호출하는 모든 워크플로     |
| `APP_PRIVATE_KEY` | GitHub App의 개인 키 (PEM 형식).         | 아니오 | 커스텀 GitHub App 사용             |

시크릿을 추가하려면:

1. 리포지토리의 **Settings > Secrets and variables > Actions > New repository secret**으로 이동합니다.
2. 시크릿 이름과 값을 입력합니다.
3. 저장합니다.

자세한 내용은 [암호화된 시크릿 생성 및 사용에 대한 공식 GitHub 문서][secrets]를 참조하세요.

## 인증

이 action은 GitHub API에 대한 인증과 선택적으로 Qwen Code 서비스에 대한 인증이 필요합니다.

### GitHub 인증

GitHub를 두 가지 방법으로 인증할 수 있습니다:

1. **기본 `GITHUB_TOKEN`:** 간단한 사용 사례의 경우, action이 워크플로에서 제공하는 기본 `GITHUB_TOKEN`을 사용할 수 있습니다.
2. **커스텀 GitHub App (권장):** 가장 안전하고 유연한 인증을 위해 커스텀 GitHub App 생성을 권장합니다.

Qwen 및 GitHub 인증 모두에 대한 자세한 설정 지침은 [**인증 문서**](./configuration/auth)를 참조하세요.

## 확장

Qwen Code CLI는 확장을 통해 추가 기능으로 확장할 수 있습니다. 이 확장은 GitHub 리포지토리에서 소스에서 설치됩니다.

확장 설정 및 구성에 대한 자세한 지침은 [확장 문서](./extension/introduction.md)를 참조하세요.

## 모범 사례

자동화된 워크플로의 보안, 신뢰성, 효율성을 보장하기 위해 모범 사례를 따를 것을 강력히 권장합니다. 이 가이드라인은 리포지토리 보안, 워크플로 구성, 모니터링과 같은 주요 영역을 다룹니다.

주요 권장 사항:

- **리포지토리 보안:** 브랜치 및 태그 보호 구현, pull request 승인자 제한.
- **모니터링 및 감사:** action 로그 정기 검토, 성능 및 동작에 대한 더 깊은 통찰을 위해 OpenTelemetry 활성화.

리포지토리 및 워크플로 보안을 위한 종합 가이드는 [**모범 사례 문서**](./common-workflow)를 참조하세요.

## 커스터마이즈

[Qwen Code CLI](./common-workflow)에 프로젝트별 컨텍스트와 지시사항을 제공하기 위해 리포지토리 루트에 QWEN.md 파일을 생성하세요. 이는 모델이 해당 리포지토리에 대해 따라야 할 코딩 컨벤션, 아키텍처 패턴, 또는 기타 가이드라인을 정의하는 데 유용합니다.

## 기여

기대를 환영합니다! 시작 방법에 대한 자세한 내용은 Qwen Code CLI **Contributing Guide**를 확인하세요.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context
