# Agent Skill

> Qwen Code의 기능을 확장하는 Skill을 생성, 관리, 공유하세요.

이 가이드는 **Qwen Code**에서 Agent Skill을 생성, 사용, 관리하는 방법을 보여줍니다. Skill은 지시사항(및 선택적으로 스크립트/리소스)을 포함한 정리된 폴더를 통해 모델의 효과를 확장하는 모듈식 기능입니다.

## 사전 요구사항

- Qwen Code (최신 버전)
- Qwen Code에 대한 기본 이해 ([Quickstart](../quickstart.md))

## Agent Skill이란?

Agent Skill은 전문성을 발견 가능한 기능으로 패키징합니다. 각 Skill은 모델이 관련 있을 때 로드할 수 있는 지시사항이 포함된 `SKILL.md` 파일과 스크립트, 템플릿 등의 선택적 지원 파일로 구성됩니다.

### Skill 호출 방식

Skill은 **모델이 호출**합니다 — 모델이 요청과 Skill의 설명을 기반으로 자율적으로 사용 시점을 결정합니다. 이는 사용자가 명시적으로 `/command`를 입력하는 **사용자 호출** 슬래시 명령어와 다릅니다.

Skill을 명시적으로 호출하려면 Skill 이름을 슬래시 명령어로 입력하세요:

```bash
/<skill-name>
```

`/`를 입력하기 시작하면 자동 완성으로 사용 가능한 Skill과 설명을 탐색할 수 있습니다. `/skills` 명령어는 Skill 패널을 열어 Skill을 탐색, 검색, 토글, 대화식으로 실행할 수 있습니다.

> **참고:** 이전에 `/skills <skill-name>`으로 Skill을 실행했다면, 해당 구문은 이제 Skill 패널을 열고 trailing 인수를 무시합니다. Skill을 직접 실행하려면 `/<skill-name>`을 사용하세요.

### 이점

- 워크플로우에 맞게 Qwen Code를 확장
- git을 통해 팀 전체에 전문성 공유
- 반복적인 프롬프팅 감소
- 복잡한 작업에 여러 Skill 조합

## Skill 생성

Skill은 `SKILL.md` 파일을 포함하는 디렉토리로 저장됩니다.

### `/learn`으로 프로젝트 Skill 생성

`/learn`을 사용하여 기존 지식 소스를 재사용 가능한 프로젝트 Skill로 압축합니다:

```text
/learn https://docs.example.com/api
/learn ~/projects/acme-sdk
/learn Our deploy process: run migrate, deploy the service, then check health
```

명령어는 일반 에이전트 턴으로 실행되며 프론트매터에 `source: learned`가 포함된 `.qwen/skills/learned-skill-<name>/SKILL.md` 아래 결과를 생성합니다. 생성된 지시사항을 사용하거나 공유하기 전에 검토하세요.

`/learn`은 로컬 또는 직접 링크 `.mp4`, `.webm`, `.mov`, `.m4v` 비디오도 받습니다. 경로 또는 URL 뒤에 텍스트를 추가하여 생성된 Skill을 튜토리얼의 한 부분에 집중시킬 수 있습니다:

```text
/learn ./tutorial.mp4 focus on the deployment workflow
```

비디오 학습은 OpenAI 호환 공급자의 비디오 지원 모델이 필요합니다. YouTube 페이지 URL은 직접 비디오 입력이 아닙니다; 비디오를 워크스페이스로 다운로드하고 로컬 경로를 전달하세요.

### 개인 Skill

개인 Skill은 모든 프로젝트에서 사용 가능합니다. `~/.qwen/skills/`에 저장합니다:

```bash
mkdir -p ~/.qwen/skills/my-skill-name
```

개인 Skill 사용 용도:

- 개별 워크플로우와 선호도
- 개발 중인 Skill
- 개인 생산성 도구

### 프로젝트 Skill

프로젝트 Skill은 팀과 공유됩니다. 프로젝트 내 `.qwen/skills/`에 저장합니다:

```bash
mkdir -p .qwen/skills/my-skill-name
```

프로젝트 Skill 사용 용도:

- 팀 워크플로우와 컨벤션
- 프로젝트별 전문성
- 공유 유틸리티와 스크립트

프로젝트 Skill은 git에 커밋할 수 있으며 팀원에게 자동으로 사용 가능해집니다.

### 자동 생성 프로젝트 Skill 유지보수

Qwen Code는 Auto Skill 생성이 비활성화된 동안에도 생성된 프로젝트 Skill의 성공적인 사용을 로컬에서 추적하므로, 유지보수를 다시 활성화할 때 최근에 사용된 skill을 비활성 skill로 오인하지 않습니다. **Auto Skill**이 활성화되면, 주기적으로 비활성 생성 Skill을 활성 라이브러리에서 이동합니다. `SKILL.md` 프론트매터에 `source: auto-skill`이 포함된 `.qwen/skills/auto-skill-*`로 이름 지어진 디렉토리만 관리됩니다; 개인, 확장, 번들, 수작업 Skill은 절대 선택되지 않습니다.

- 성공적인 사용 또는 `SKILL.md` 편집 없이 30일 후, auto-skill은 오래된 것으로 표시됩니다.
- 90일 후, 전체 디렉토리가 `.qwen/archived-skills/`로 이동됩니다. 영구 삭제되는 것은 없습니다.
- 자동 유지보수는 신뢰되는 워크스페이스에서 최대 7일에 한 번 실행됩니다. 새로 관찰된 각 auto-skill은 유지보수가 시작되기 전에 전체 유예 기간을 받습니다.
- 고정된 auto-skill은 고정 해제될 때까지 자동 오래됨 및 아카이브 전환에서 제외됩니다.
- 아카이브된 디렉토리 이름은 예약된 상태로 유지되며, 기존 아카이브 대상은 해당 충돌만 건너뛰고 다른 skill의 유지보수를 중지하지 않습니다.

`/curator`를 사용하여 활성, 오래된, 아카이브된, 고정된 auto-skill을 확인하세요. `/curator run --dry-run`으로 유지보수 패스를 미리보고, `/curator run`으로 즉시 적용하고, `/curator pin <directory>` 또는 `/curator unpin <directory>`로 skill별 유지보수를 제어하거나, `/curator restore <directory>`로 아카이브된 auto-skill을 활성 라이브러리로 되돌립니다.

상태 및 dry-run 미리보기는 안전 모드와 신뢰되지 않는 워크스페이스에서 사용 가능합니다. 유지보수 적용, 고정 변경, 아카이브된 auto-skill 복원은 안전 모드 외부의 신뢰되는 워크스페이스가 필요합니다.

## `SKILL.md` 작성

YAML 프론트매터와 Markdown 콘텐츠가 포함된 `SKILL.md` 파일을 생성합니다:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
priority: 10
---

# Your Skill Name

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### 필드 요구사항

Qwen Code는 현재 다음을 검증합니다:

- `name`은 `/^[\p{L}\p{N}_:.-]+$/u`와 일치하는 비어 있지 않은 문자열 — 유니코드 문자와 숫자(CJK / 키릴 / 악센트 Latin 모두 가능) 그리고 `_`, `:`, `.`, `-`. 공백, 슬래시, 대괄호 및 기타 구조적으로 안전하지 않은 문자는 파싱 시 거부됩니다.
- `description`은 비어 있지 않은 문자열
- `priority`는 선택 사항. 존재하면 유한한 숫자여야 합니다. 높은 값은 `/skills` 목록에서만 먼저 정렬됩니다 — 슬래시 명령어 자동 완성(`/` 입력)과 `/help` 사용자 정의 명령어 보기는 알파벳 순서를 유지하므로, 우선순위가 높은 Skill이 내장 명령어를 재정렬하지 않습니다. 생략되거나 잘못된 값은 설정되지 않은 것으로 처리되며 `0`과 동일하게 동작합니다.

권장 컨벤션:

- 공유 가능한 이름에는 하이픈이 포함된 소문자 ASCII 선호 (예: `tsx-helper`)
- `description`을 구체적으로 작성: Skill이 **무엇을** 하는지와 **언제** 사용해야 하는지(사용자가 자연스럽게 언급할 키워드) 포함
- `/skills`에서 기본 알파벳 순서보다 먼저 나타나야 하는 Skill에 `priority`를 신중하게 사용. 음수 우선순위 허용되며 설정되지 않은 Skill 아래로 정렬됩니다.

### 선택 사항: 파일 경로로 Skill 제한 (`paths:`)

코드베이스의 특정 부분에만 관련되는 Skill의 경우, glob 패턴의 `paths:` 목록을 추가합니다. 일치하는 파일에 도구 호출이 접근할 때까지 Skill은 모델의 사용 가능한 skill 목록에 표시되지 않습니다:

```yaml
---
name: tsx-helper
description: React TSX component helper
paths:
  - 'src/**/*.tsx'
  - 'packages/*/src/**/*.tsx'
---
```

참고:

- Glob은 프로젝트 루트를 기준으로 [picomatch](https://github.com/micromatch/picomatch)와 매칭됩니다; 프로젝트 루트 외부의 파일은 절대 활성화를 트리거하지 않습니다.
- 경로로 제한된 Skill은 일치하는 파일이 접근되면 **세션이 끝날 때까지 활성화된 상태로 유지됩니다**. 새 세션 또는 Skill 파일 편집으로 트리거되는 `refreshCache`가 활성화를 재설정합니다.
- `paths:`는 **모델** 검색만 제한하며 SkillTool 목록 수준에서만 제한됩니다. `user-invocable: false`가 설정되지 않은 한, `/<skill-name>` 또는 `/skills` 피커를 통해 경로 제한 Skill을 항상 직접 호출할 수 있습니다 — 해당 사용자 경로는 활성화 상태와 관계없이 Skill 본문을 실행합니다. 하지만 모델 측은 일치하는 파일이 접근될 때까지 제한된 상태로 유지됩니다: 슬래시 호출이 모델 측 활성화를 잠금 해제하지 **않으므로**, 모델이 호출에서 체인하도록 하려면(skill 자체 `Skill { skill: ... }` 호출), 먼저 skill의 `paths:`와 일치하는 파일에 접근하세요.
- `paths:`와 `disable-model-invocation: true`를 조합하는 것은 허용되지만 게이트가 효과가 없습니다 — Skill은 어쨌든 모델에서 숨겨지므로 경로 활성화가 이를 광고하지 않습니다.

### 선택 사항: 사용자 및 모델 호출 제어

Skill은 기본적으로 사용자 호출 가능합니다. 직접 슬래시 명령어 사용에서 Skill을 숨기면서 모델 호출에 대해 사용 가능하게 유지하려면 `user-invocable: false`를 설정합니다:

```yaml
---
name: model-only-helper
description: Helper the model can call when appropriate
user-invocable: false
---
```

이렇게 하면 `/<skill-name>` 호출과 `/skills` 피커 결과에서 Skill이 제거됩니다. 모델에서 Skill을 숨기지 않습니다.

직접 사용자 호출을 유지하면서 모델 호출에서 Skill을 숨기려면 `disable-model-invocation: true`를 설정합니다:

```yaml
---
name: manual-helper
description: Helper you invoke manually
disable-model-invocation: true
---
```

두 필드를 모두 조합할 수 있지만, Skill은 일반적인 사용자 또는 모델 호출 경로로 접근할 수 없게 됩니다.

## 지원 파일 추가

`SKILL.md`와 함께 추가 파일을 생성합니다:

```text
my-skill/
├── SKILL.md (필수)
├── reference.md (선택 문서)
├── examples.md (선택 예시)
├── scripts/
│   └── helper.py (선택 유틸리티)
└── templates/
    └── template.txt (선택 템플릿)
```

`SKILL.md`에서 이 파일들을 참조합니다:

````markdown
For advanced usage, see [reference.md](reference.md).

Run the helper script:

```bash
python scripts/helper.py input.txt
```
````

## 사용 가능한 Skill 보기

Qwen Code는 다음에서 Skill을 발견합니다:

- 개인 Skill: `~/.qwen/skills/`
- 프로젝트 Skill: `.qwen/skills/`
- 확장 Skill: 설치된 확장이 제공하는 Skill
- 번들 Skill: Qwen Code에 포함된 Skill

### 확장 Skill

확장은 활성화되면 사용 가능해지는 커스텀 skill을 제공할 수 있습니다. 이 skill은 확장의 `skills/` 디렉토리에 저장되며 개인 및 프로젝트 skill과 동일한 형식을 따릅니다.

확장 skill은 확장이 설치되고 활성화되면 자동으로 발견되고 로드됩니다.

어떤 확장이 skill을 제공하는지 확인하려면 확장의 `qwen-extension.json` 파일에서 `skills` 필드를 확인하세요.

사용 가능한 Skill을 보려면 Qwen Code에게 직접 물어보세요:

```text
What Skills are available?
```

> **주의 — 모델 vs. 사용자 뷰.** 모델에게 물어보면 모델이 현재 볼 수 있는 Skill만 표시됩니다. Skill이 `paths:`를 사용하면(위 "선택 사항: 파일 경로로 Skill 제한" 참조), 일치하는 파일이 접근될 때까지 해당 목록에 표시되지 않습니다. `/skills` 슬래시 명령어는 직접 호출할 수 있는 Skill을 표시합니다; `user-invocable: false`가 있는 Skill은 디스크에 표시된 상태로 유지되며 모델에게 여전히 보일 수 있습니다.

또는 슬래시 명령어로 사용자 호출 가능 목록을 탐색합니다(아직 활성화되지 않은 경로 제한 Skill 포함):

```text
/skills
```

또는 파일시스템을 검사합니다:

```bash
# 개인 Skill 나열
ls ~/.qwen/skills/

# 프로젝트 Skill 나열 (프로젝트 디렉토리에 있는 경우)
ls .qwen/skills/

# 특정 Skill의 내용 보기
cat ~/.qwen/skills/my-skill/SKILL.md
```

## Skill 테스트

Skill을 생성한 후, 설명과 일치하는 질문을 하여 테스트합니다.

예시: 설명에 "PDF files"가 언급된 경우:

```text
Can you help me extract text from this PDF?
```

모델이 요청과 일치하면 자율적으로 Skill을 사용합니다 — 명시적으로 호출할 필요가 없습니다.

## Skill 디버그

Qwen Code가 Skill을 사용하지 않으면 다음 일반적인 문제를 확인하세요:

### 설명을 구체적으로 작성

너모 모호한 경우:

```yaml
description: Helps with documents
```

구체적인 경우:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### 파일 경로 확인

- 개인 Skill: `~/.qwen/skills/<skill-name>/SKILL.md`
- 프로젝트 Skill: `.qwen/skills/<skill-name>/SKILL.md`

```bash
# 개인
ls ~/.qwen/skills/my-skill/SKILL.md

# 프로젝트
ls .qwen/skills/my-skill/SKILL.md
```

### YAML 구문 확인

잘못된 YAML은 Skill 메타데이터가 올바르게 로드되는 것을 방지합니다.

```bash
cat SKILL.md | head -n 15
```

확인 사항:

- 1행에 시작 `---`
- Markdown 콘텐츠 전에 종료 `---`
- 유효한 YAML 구문 (탭 없음, 올바른 들여쓰기)

### 오류 보기

디버그 모드로 Qwen Code를 실행하여 Skill 로드 오류를 확인합니다:

```bash
qwen --debug
```

## 팀과 Skill 공유

프로젝트 리포지토리를 통해 Skill을 공유할 수 있습니다:

1. `.qwen/skills/` 아래에 Skill 추가
2. 커밋 및 푸시
3. 팀원이 변경 사항을 pull

```bash
git add .qwen/skills/
git commit -m "Add team Skill for PDF processing"
git push
```

## Skill 업데이트

`SKILL.md`를 직접 편집합니다:

```bash
# 개인 Skill
code ~/.qwen/skills/my-skill/SKILL.md

# 프로젝트 Skill
code .qwen/skills/my-skill/SKILL.md
```

일반 세션 중에 Qwen Code는 개인 및 프로젝트 Skill 디렉토리를 감시합니다. Skill을 추가, 편집, 제거하면 짧은 지연 후 Skill 목록과 호출 상태가 자동으로 새로 고쳐집니다. Bare 모드는 이 감시자를 시작하지 않으므로 해당 모드에서 Skill 변경 사항을 로드하려면 Qwen Code를 재시작하세요.

## Skill 제거

Skill 디렉토리를 삭제합니다:

```bash
# 개인
rm -rf ~/.qwen/skills/my-skill

# 프로젝트
rm -rf .qwen/skills/my-skill
git commit -m "Remove unused Skill"
```

## 모범 사례

### Skill을 집중적으로 유지

하나의 Skill은 하나의 기능을 다루어야 합니다:

- 집중적: "PDF form filling", "Excel analysis", "Git commit messages"
- 너무 광범위: "Document processing" (더 작은 Skill로 분할)

### 명확한 설명 작성

구체적인 트리거를 포함하여 모델이 Skill 사용 시점을 발견하도록 돕습니다:

```yaml
description: Analyze Excel spreadsheets, create pivot tables, and generate charts. Use when working with Excel files, spreadsheets, or .xlsx data.
```

### 팀과 테스트

- Skill이 예상될 때 활성화되나요?
- 지시사항이 명확한가요?
- 누락된 예시나 엣지 케이스가 있나요?
