# Quickstart

> 👏 Qwen Code에 오신 것을 환영합니다!

이 Quickstart 가이드는 몇 분 안에 AI 기반 코딩 지원을 사용할 수 있도록 도와드립니다. 완료 후 Qwen Code를 일반적인 개발 작업에 사용하는 방법을 이해하게 됩니다.

## 시작하기 전에

다음 사항이 준비되어 있는지 확인하세요:

- **터미널** 또는 명령 프롬프트가 열려 있어야 합니다
- 작업할 코드 프로젝트
- Alibaba Cloud ModelStudio([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/))의 API 키, 또는 Alibaba Cloud Coding Plan([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) 구독

## 1단계: Qwen Code 설치

Qwen Code를 설치하려면 다음 방법 중 하나를 사용하세요:

### 빠른 설치 (권장)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> 설치 후 환경 변수가 적용되도록 터미널을 재시작하는 것이 좋습니다.

### 수동 설치

**사전 요구 사항**

Node.js 22 이상이 설치되어 있어야 합니다. [nodejs.org](https://nodejs.org/en/download)에서 다운로드하세요.

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## 2단계: 인증 설정

`qwen` 명령어로 대화형 세션을 시작하면 인증을 구성하라는 메시지가 표시됩니다:

```bash
# 첫 사용 시 인증 설정 메시지가 표시됩니다
qwen
```

```bash
# 또는 언제든지 /auth를 실행하여 인증 방법을 변경하세요
/auth
```

첫 실행 메뉴에서 모델 제공자를 연결할 수 있습니다. 다음 중 하나를 선택하세요:

- **Alibaba ModelStudio** — 권장 설정. 하위 메뉴를 엽니다:
  - **Coding Plan**: 개인 개발자용, 주간 할당량 포함 및 다양한 모델 옵션. 설정 방법은 [Coding Plan 가이드](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index))를 참조하세요.
  - **Token Plan**: 사용량 기반 과금, 전용 엔드포인트, 팀 및 기업 대상.
  - **Standard API Key**: Alibaba Cloud ModelStudio([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/))의 기존 API 키로 연결. 자세한 내용은 API 설정 가이드([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721))를 참조하세요.
- **Third-party Providers** — 내장 제공자(DeepSeek, Grok, MiniMax, Z.AI, Kimi, Idealab, ModelScope, OpenRouter, Requesty 등)를 선택하고 API 키로 연결합니다.
- **Custom Provider** — 로컬 서버, 프록시 또는 지원되지 않는 제공자를 수동으로 연결합니다.

> ⚠️ **참고**: Qwen OAuth는 2026년 4월 15일에 서비스가 중단되었습니다. 이전에 Qwen OAuth를 사용하고 있었다면 위의 방법 중 하나로 전환해 주세요.

> [!note]
>
> Qwen 계정으로 Qwen Code를 처음 인증하면 ".qwen"이라는 작업 공간이 자동으로 생성됩니다. 이 작업 공간은 조직 내 모든 Qwen Code 사용에 대한 중앙 집중식 비용 추적 및 관리를 제공합니다.

> [!tip]
>
> 인증을 구성하려면 Qwen Code를 시작한 후 `/auth`를 실행하세요. `/doctor`를 사용하면 언제든지 현재 구성을 확인할 수 있습니다. 자세한 내용은 [인증](./configuration/auth) 페이지를 참조하세요.

## 3단계: 첫 세션 시작

원하는 프로젝트 디렉토리에서 터미널을 열고 Qwen Code를 시작하세요:

```bash
# 선택 사항
cd /path/to/your/project
# qwen 시작
qwen
```

세션 정보, 최근 대화 및 최신 업데이트가 포함된 Qwen Code 환영 화면이 표시됩니다. 사용 가능한 명령어를 확인하려면 `/help`를 입력하세요.

## Qwen Code와 대화하기

### 첫 질문 하기

Qwen Code가 파일을 분석하고 요약을 제공합니다. 더 구체적인 질문을 할 수도 있습니다:

```
explain the folder structure
```

Qwen Code의 기능에 대해 질문할 수도 있습니다:

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code는 필요에 따라 파일을 읽습니다 — 수동으로 컨텍스트를 추가할 필요가 없습니다. Qwen Code는 자체 문서에도 접근할 수 있으며 기능과 능력에 대한 질문에 답변할 수 있습니다.

### 첫 코드 변경 하기

이제 Qwen Code로 실제 코딩을 해봅시다. 간단한 작업을 시도해 보세요:

```
add a hello world function to the main file
```

Qwen Code는 다음과 같이 작동합니다:

1. 적절한 파일을 찾습니다
2. 제안된 변경 사항을 보여줍니다
3. 승인을 요청합니다
4. 편집을 수행합니다

> [!note]
>
> Qwen Code는 파일을 수정하기 전에 항상 권한을 요청합니다. 개별 변경 사항을 승인하거나 세션에 대해 "Accept all" 모드를 활성화할 수 있습니다.

### Qwen Code로 Git 사용하기

Qwen Code를 사용하면 Git 작업을 대화적으로 수행할 수 있습니다:

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

더 복잡한 Git 작업을 요청할 수도 있습니다:

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### 버그 수정 또는 기능 추가

Qwen Code는 디버깅과 기능 구현에 능숙합니다.

자연어로 원하는 것을 설명하세요:

```
add input validation to the user registration form
```

또는 기존 문제를 수정하세요:

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code는 다음과 같이 작동합니다:

- 관련 코드를 찾습니다
- 컨텍스트를 이해합니다
- 솔루션을 구현합니다
- 가능한 경우 테스트를 실행합니다

### 다른 일반적인 워크플로우 테스트

Qwen Code와 함께 작업하는 여러 방법이 있습니다:

**코드 리팩토링**

```
refactor the authentication module to use async/await instead of callbacks
```

**테스트 작성**

```
write unit tests for the calculator functions
```

**문서 업데이트**

```
update the README with installation instructions
```

**코드 리뷰**

```
review my changes and suggest improvements
```

> [!tip]
>
> **기억하세요**: Qwen Code는 AI 페어 프로그래머입니다. 도움이 되는 동료에게 말하듯이 이야기하세요 — 달성하고자 하는 것을 설명하면 그곳까지 도달할 수 있도록 도와드립니다.

## 필수 명령어

일상 사용에 가장 중요한 명령어는 다음과 같습니다:

| 명령어                | 기능                                             | 예시                          |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | Qwen Code 시작                                   | `qwen`                        |
| `/auth`               | 인증 방법 변경 (세션 내)                         | `/auth`                       |
| `/doctor`             | 현재 인증 및 환경 확인                           | `/doctor`                     |
| `/help`               | 사용 가능한 명령어의 도움말 정보 표시             | `/help` 또는 `/?`             |
| `/compress`           | 토큰 절약을 위해 채팅 기록을 요약으로 대체       | `/compress`                   |
| `/clear`              | 터미널 화면 내용 지우기                          | `/clear` (단축키: `Ctrl+L`)   |
| `/theme`              | Qwen Code 시각적 테마 변경                       | `/theme`                      |
| `/language`           | 언어 설정 보기 또는 변경                         | `/language`                   |
| → `ui [language]`     | UI 인터페이스 언어 설정                          | `/language ui zh-CN`          |
| → `output [language]` | LLM 출력 언어 설정                               | `/language output Chinese`    |
| `/quit`               | Qwen Code 즉시 종료                              | `/quit` 또는 `/exit`          |

전체 명령어 목록은 [CLI 레퍼런스](./features/commands)를 참조하세요.

## 초보자를 위한 팁

**요청을 구체적으로 작성하세요**

- 대신: "fix the bug"
- 이렇게: "fix the login bug where users see a blank screen after entering wrong credentials"

**단계별 지침을 사용하세요**

- 복잡한 작업을 단계으로 분할하세요:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Qwen Code가 먼저 탐색하게 하세요**

- 변경하기 전에 Qwen Code가 코드를 이해하게 하세요:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**단축키로 시간 절약**

- `?`를 눌러 사용 가능한 모든 키보드 단축키를 확인하세요
- Tab을 사용하여 명령어 자동 완성을 사용하세요
- ↑를 눌러 명령어 기록을 확인하세요
- `/`를 입력하여 모든 슬래시 명령어를 확인하세요

## 도움 받기

- **Qwen Code 내에서**: `/help`를 입력하거나 "how do I..."라고 질문하세요
- **문서**: 현재 이곳을 보고 계십니다! 다른 가이드도 둘러보세요
- **커뮤니티**: 팁과 지원을 받으려면 [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions)에 참여하세요
