---
title: Common Workflows
---

# 일반적인 워크플로우

> Qwen Code의 일반적인 워크플로우를 배웁니다.

이 문서의 각 작업에는 Qwen Code를 최대한 활용할 수 있도록 명확한 지시사항, 예시 명령 및 모범 사례가 포함되어 있습니다.

## 새로운 코드베이스 이해

### 코드베이스 빠른 개요 파악

새 프로젝트에 합류하여 구조를 빠르게 이해해야 한다고 가정해 봅시다.

**1. 프로젝트 루트 디렉토리로 이동**

```bash
cd /path/to/project
```

**2. Qwen Code 시작**

```bash
qwen
```

**3. 높은 수준의 개요 요청**

```
give me an overview of this codebase
```

**4. 특정 구성 요소 더 자세히 파악**

```
explain the main architecture patterns used here
```

```
what are the key data models?
```

```
how is authentication handled?
```

> [!tip]
>
> - 넓은 질문으로 시작한 다음 특정 영역으로 좁혀갑니다
> - 프로젝트에서 사용되는 코딩 규칙과 패턴에 대해 질문하세요
> - 프로젝트별 용어집을 요청하세요

### 관련 코드 찾기

특정 기능 또는 기능과 관련된 코드를 찾아야 한다고 가정해 봅시다.

**1. Qwen Code에게 관련 파일을 찾도록 요청**

```
find the files that handle user authentication
```

**2. 구성 요소가 어떻게 상호 작용하는지에 대한 컨텍스트 파악**

```
how do these authentication files work together?
```

**3. 실행 흐름 이해**

```
trace the login process from front-end to database
```

> [!tip]
>
> - 찾고 있는 것에 대해 구체적으로 설명하세요
> - 프로젝트의 도메인 언어를 사용하세요

## 버그 효율적으로 수정

오류 메시지가 발생하여 원인을 찾아 수정해야 한다고 가정해 봅시다.

**1. Qwen Code에 오류를 공유**

```
I'm seeing an error when I run npm test
```

**2. 수정 권장 사항 요청**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. 수정 적용**

```
update user.ts to add the null check you suggested
```

> [!tip]
>
> - Qwen Code에 문제를 재현할 명령을 알려주고 스택 트레이스를 확인하세요
> - 오류를 재현하는 단계를 알려주세요
> - 오류가 간헐적인지 일관적인지 Qwen Code에 알려주세요

## 코드 리팩토링

오래된 코드를 현대적인 패턴과 관행으로 업데이트해야 한다고 가정해 봅시다.

**1. 리팩토링할 레거시 코드 식별**

```
find deprecated API usage in our codebase
```

**2. 리팩토링 권장 사항 확인**

```
suggest how to refactor utils.js to use modern JavaScript features
```

**3. 안전하게 변경 적용**

```
refactor utils.js to use ES 2024 features while maintaining the same behavior
```

**4. 리팩토링 검증**

```
run tests for the refactored code
```

> [!tip]
>
> - Qwen Code에게 현대적 접근 방식의 이점을 설명해 달라고 요청하세요
> - 필요한 경우 변경 사항이 하위 호환성을 유지하도록 요청하세요
> - 작고 테스트 가능한 단위로 리팩토링하세요

## 전문 서브에이전트 사용

특정 작업을 더 효과적으로 처리하기 위해 전문 AI 서브에이전트를 사용하고 싶다고 가정해 봅시다.

**1. 사용 가능한 서브에이전트 확인**

```
/agents
```

이 명령은 사용 가능한 모든 서브에이전트를 표시하고 새 서브에이전트를 생성할 수 있게 합니다.

**2. 서브에이전트 자동 사용**

Qwen Code는 자동으로 적절한 작업을 전문 서브에이전트에 위임합니다:

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. 특정 서브에이전트 명시적 요청**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. 워크플로우를 위한 사용자 정의 서브에이전트 생성**

```
/agents
```

그런 다음 "create"를 선택하고 프롬프트에 따라 다음을 정의합니다:

- 서브에이전트의 목적을 설명하는 고유 식별자(예: `code-reviewer`, `api-designer`).
- Qwen Code가 이 에이전트를 언제 사용해야 하는지
- 접근할 수 있는 도구
- 에이전트의 역할과 동작을 설명하는 시스템 프롬프트

> [!tip]
>
> - 팀 공유를 위해 `.qwen/agents/`에 프로젝트별 서브에이전트를 생성하세요
> - 설명적인 `description` 필드를 사용하여 자동 위임을 활성화하세요
> - 각 서브에이전트가 실제로 필요로 하는 도구에만 접근을 제한하세요
> - [서브 에이전트](./features/sub-agents)에 대해 더 알아보기
> - [승인 모드](./features/approval-mode)에 대해 더 알아보기

## 테스트 작업

커버리지에서 누락된 코드에 대한 테스트를 추가해야 한다고 가정해 봅시다.

**1. 테스트되지 않은 코드 식별**

```
find functions in NotificationsService.swift that are not covered by tests
```

**2. 테스트 스캐폴딩 생성**

```
add tests for the notification service
```

**3. 의미 있는 테스트 케이스 추가**

```
add test cases for edge conditions in the notification service
```

**4. 테스트 실행 및 검증**

```
run the new tests and fix any failures
```

Qwen Code는 프로젝트의 기존 패턴과 규칙을 따르는 테스트를 생성할 수 있습니다. 테스트를 요청할 때, 검증하려는 동작에 대해 구체적으로 설명하세요. Qwen Code는 기존 테스트 파일을 조사하여 이미 사용 중인 스타일, 프레임워크 및 어서션 패턴을 일치시킵니다.

포괄적인 커버리지를 위해 Qwen Code에게 놓쳤을 수 있는 엣지 케이스를 식별해 달라고 요청하세요. Qwen Code는 코드 경로를 분석하고 간과하기 쉬운 오류 조건, 경계값 및 예상치 못한 입력에 대한 테스트를 제안할 수 있습니다.

## Pull Request 생성

변경 사항에 대한 잘 문서화된 pull request를 생성해야 한다고 가정해 봅시다.

**1. 변경 사항 요약**

```
summarize the changes I've made to the authentication module
```

**2. Qwen Code로 pull request 생성**

```
create a pr
```

**3. 검토 및 개선**

```
enhance the PR description with more context about the security improvements
```

**4. 테스트 세부 정보 추가**

```
add information about how these changes were tested
```

> [!tip]
>
> - Qwen Code에게 직접 PR을 만들어 달라고 요청하세요
> - 제출하기 전에 Qwen Code가 생성한 PR을 검토하세요
> - Qwen Code에게 잠재적 위험이나 고려 사항을 강조해 달라고 요청하세요

## 문서 처리

코드에 대한 문서를 추가하거나 업데이트해야 한다고 가정해 봅시다.

**1. 문서화되지 않은 코드 식별**

```
find functions without proper JSDoc comments in the auth module
```

**2. 문서 생성**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. 검토 및 개선**

```
improve the generated documentation with more context and examples
```

**4. 문서 검증**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - 원하는 문서 스타일을 지정하세요(JSDoc, docstrings 등)
> - 문서에 예제를 요청하세요
> - 공개 API, 인터페이스 및 복잡한 로직에 대한 문서를 요청하세요

## 파일 및 디렉토리 참조

`@`를 사용하여 Qwen Code가 파일을 읽기를 기다리지 않고 빠르게 파일이나 디렉토리를 포함할 수 있습니다.

**1. 단일 파일 참조**

```
Explain the logic in @src/utils/auth.js
```

이렇게 하면 파일의 전체 내용이 대화에 포함됩니다.

**2. 디렉토리 참조**

```
What's the structure of @src/components?
```

이렇게 하면 파일 정보가 포함된 디렉토리 목록이 제공됩니다.

**3. MCP 리소스 참조**

```
Show me the data from @github: repos/owner/repo/issues
```

이렇게 하면 @server: resource 형식을 사용하여 연결된 MCP 서버에서 데이터를 가져옵니다. 자세한 내용은 [MCP](./features/mcp)를 참조하세요.

> [!tip]
>
> - 파일 경로는 상대 경로 또는 절대 경로일 수 있습니다
> - @ 파일 참조는 파일의 디렉토리와 상위 디렉토리의 `QWEN.md`를 컨텍스트에 추가합니다
> - 디렉토리 참조는 내용이 아닌 파일 목록을 보여줍니다
> - 하나의 메시지에서 여러 파일을 참조할 수 있습니다(예: "`@file 1.js` and `@file 2.js`")

## 이전 대화 재개

Qwen Code로 작업을 진행하던 중 나중에 세션에서 중단한 부분을 계속해야 한다고 가정해 봅시다.

Qwen Code는 이전 대화를 재개하기 위한 두 가지 옵션을 제공합니다:

- `--continue`: 가장 최근 대화를 자동으로 재개
- `--resume`: 대화 선택기를 표시

**1. 가장 최근 대화 재개**

```bash
qwen --continue
```

이 명령은 프롬프트 없이 가장 최근 대화를 즉시 재개합니다.

**2. 비대화형 모드에서 재개**

```bash
qwen --continue -p "Continue with my task"
```

`--continue`와 함께 `-p`(또는 `--prompt`)를 사용하면 비대화형 모드에서 가장 최근 대화를 재개할 수 있습니다. 스크립트나 자동화에 적합합니다.

**3. 대화 선택기 표시**

```bash
qwen --resume
```

이 명령은 다음을 표시하는 깔끔한 목록 뷰의 대화형 대화 선택기를 표시합니다:

- 세션 요약(또는 초기 프롬프트)
- 메타데이터: 경과 시간, 메시지 수 및 git 브랜치

화살표 키로 탐색하고 Enter를 눌러 대화를 선택합니다. Esc을 눌러 종료합니다.

> [!tip]
>
> - 대화 기록은 로컬 머신에 저장됩니다
> - 가장 최근 대화에 빠르게 접근하려면 `--continue`를 사용하세요
> - 특정 과거 대화를 선택해야 할 때는 `--resume`을 사용하세요
> - 재개할 때, 계속하기 전에 전체 대화 기록을 볼 수 있습니다
> - 재개된 대화는 원래와 동일한 모델 및 구성으로 시작합니다
>
> **작동 방식**:
>
> 1. **대화 저장**: 모든 대화는 전체 메시지 기록과 함께 로컬에 자동으로 저장됩니다
> 2. **메시지 역직렬화**: 재개할 때, 전체 메시지 기록이 복원되어 컨텍스트를 유지합니다
> 3. **도구 상태**: 이전 대화의 도구 사용 및 결과가 보존됩니다
> 4. **컨텍스트 복원**: 대화는 모든 이전 컨텍스트가 그대로 유지된 채 재개됩니다
>
> **예시**:
>
> ```bash
> # 가장 최근 대화 재개
> qwen --continue
>
> # 특정 프롬프트로 가장 최근 대화 재개
> qwen --continue -p "Show me our progress"
>
> # 대화 선택기 표시
> qwen --resume
>
> # 비대화형 모드에서 가장 최근 대화 재개
> qwen --continue -p "Run the tests again"
> ```

## Git worktree로 병렬 Qwen Code 세션 실행

Qwen Code 인스턴스 간에 완전한 코드 격리로 여러 작업을 동시에 진행해야 한다고 가정해 봅시다.

**1. Git worktree 이해**

Git worktree를 사용하면 동일한 리포지토리에서 여러 브랜치를 별도의 디렉토리로 체크아웃할 수 있습니다. 각 worktree는 격리된 파일이 있는 자체 작업 디렉토리를 가지면서 동일한 Git 기록을 공유합니다. 자세한 내용은 [공식 Git worktree 문서](https://git-scm.com/docs/git-worktree)를 참조하세요.

**2. 새 worktree 생성**

```bash
# 새 브랜치로 새 worktree 생성
git worktree add ../project-feature-a -b feature-a

# 또는 기존 브랜치로 worktree 생성
git worktree add ../project-bugfix bugfix-123
```

이렇게 하면 리포지토리의 별도 작업 복사본이 있는 새 디렉토리가 생성됩니다.

**3. 각 worktree에서 Qwen Code 실행**

```bash
# worktree로 이동
cd ../project-feature-a

# 격리된 환경에서 Qwen Code 실행
qwen
```

**4. 다른 worktree에서 Qwen Code 실행**

```bash
cd ../project-bugfix
qwen
```

**5. worktree 관리**

```bash
# 모든 worktree 목록
git worktree list

# 완료 후 worktree 제거
git worktree remove ../project-feature-a
```

> [!tip]
>
> - 각 worktree는 자체 독립 파일 상태를 가지므로 병렬 Qwen Code 세션에 완벽합니다
> - 한 worktree에서 변경된 내용은 다른 worktree에 영향을 주지 않아 Qwen Code 인스턴스가 서로 간섭하는 것을 방지합니다
> - 모든 worktree는 동일한 Git 기록과 원격 연결을 공유합니다
> - 장기간 실행 작업의 경우, 한 worktree에서 Qwen Code가 작업하는 동안 다른 worktree에서 개발을 계속할 수 있습니다
> - 각 worktree가 어떤 작업용인지 쉽게 식별할 수 있도록 설명적인 디렉토리 이름을 사용하세요
> - 프로젝트 설정에 따라 각 새 worktree에서 개발 환경을 초기화하는 것을 잊지 마세요. 스택에 따라 다음이 포함될 수 있습니다:
>   - JavaScript 프로젝트: 의존성 설치 실행(`npm install`, `yarn`)
>   - Python 프로젝트: 가상 환경 설정 또는 패키지 관리자로 설치
>   - 다른 언어: 프로젝트의 표준 설정 프로세스 따르기

## Qwen Code를 unix 스타일 유틸리티로 사용

### 검증 프로세스에 Qwen Code 추가

Qwen Code를 린터 또는 코드 리뷰어로 사용하고 싶다고 가정해 봅시다.

**빌드 스크립트에 Qwen Code 추가:**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'you are a linter. please look at the changes vs. main and report any issues related to typos. report the filename and line number on one line, and a description of the issue on the second line. do not return any other text.'"
    }
}
```

> [!tip]
>
> - CI/CD 파이프라인에서 자동 코드 리뷰에 Qwen Code를 사용하세요
> - 프로젝트와 관련된 특정 문제를 확인하도록 프롬프트를 커스터마이즈하세요
> - 다양한 유형의 검증을 위해 여러 스크립트 생성을 고려하세요

### 파이프 인, 파이프 아웃

Qwen Code로 데이터를 파이프하고 구조화된 형식으로 데이터를 돌려받고 싶다고 가정해 봅시다.

**Qwen Code를 통해 데이터 파이프:**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - 파이프를 사용하여 기존 셸 스크립트에 Qwen-Code를 통합하세요
> - 다른 Unix 도구와 결합하여 강력한 워크플로우를 만드세요
> - 구조화된 출력을 위해 --output-format 사용을 고려하세요

### 출력 형식 제어

특히 Qwen Code를 스크립트나 다른 도구에 통합할 때 특정 형식의 출력이 필요하다고 가정해 봅시다.

**1. 텍스트 형식 사용(기본값)**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

이렇게 하면 Qwen Code의 일반 텍스트 응답만 출력됩니다(기본 동작).

**2. JSON 형식 사용**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

이렇게 하면 비용 및 지속 시간을 포함한 메타데이터가 있는 메시지 JSON 배열이 출력됩니다.

**3. 스트리밍 JSON 형식 사용**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

이렇게 하면 Qwen Code가 요청을 처리하는 동안 실시간으로 일련의 JSON 객체가 출력됩니다. 각 메시지는 유효한 JSON 객체이지만, 전체 출력은 연결하면 유효한 JSON이 아닙니다.

> [!tip]
>
> - Qwen Code의 응답만 필요한 간단한 통합에는 `--output-format text`를 사용하세요
> - 전체 대화 로그가 필요할 때는 `--output-format json`을 사용하세요
> - 각 대화 턴의 실시간 출력에는 `--output-format stream-json`을 사용하세요

## Qwen Code에 기능에 대해 질문

Qwen Code는 내장된 문서 접근 기능을 가지고 있으며 자체 기능과 제한 사항에 대한 질문에 답할 수 있습니다.

### 예시 질문

```
can Qwen Code create pull requests?
```

```
how does Qwen Code handle permissions?
```

```
what slash commands are available?
```

```
how do I use MCP with Qwen Code?
```

```
how do I configure Qwen Code for Amazon Bedrock?
```

```
what are the limitations of Qwen Code?
```

> [!note]
>
> Qwen Code는 이러한 질문에 대해 문서 기반 답변을 제공합니다. 실행 가능한 예시와 실습 데모를 위해서는 위의 특정 워크플로우 섹션을 참조하세요.

> [!tip]
>
> - Qwen Code는 사용 중인 버전에 관계없이 항상 최신 Qwen Code 문서에 접근할 수 있습니다
> - 구체적인 질문을 하여 자세한 답변을 받으세요
> - Qwen Code는 MCP 통합, 엔터프라이즈 구성 및 고급 워크플로우와 같은 복잡한 기능을 설명할 수 있습니다
