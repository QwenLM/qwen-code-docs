# Rules

Rule은 세션 시작 시 또는 해당 rule이 적용되는 파일을 건드리는 시점에 모델에 전달되는 Markdown 파일입니다. Rule은 `.qwen/rules/` 디렉토리에 위치하며, `paths:` 필드가 두 번째 방식을 가능하게 합니다. React 컴포넌트에 대한 가이드는 Makefile을 편집하는 동안 프롬프트에 포함될 필요가 없습니다.

Rule은 context file(`QWEN.md`)의 저렴한 대응물입니다. context file은 모든 세션의 **모든** 요청에 포함됩니다 — [Resident Context Cost](./context-cost.md)를 참조하십시오.

## Rule이 위치하는 곳

| 위치                                      | 로드 시점                                  |
| ----------------------------------------- | ------------------------------------------ |
| `~/.qwen/rules/` (또는 `$QWEN_HOME/rules/`) | 항상                                     |
| `<project>/.qwen/rules/`                  | 워크스페이스가 신뢰되는 경우              |
| 활성 확장의 `rules/`                      | 항상, 조건부 rule만 — 아래 참조           |

해당 디렉토리 아래의 모든 `.md` 파일은 하위 디렉토리를 포함하여 결정적 순서로 발견됩니다.

## Baseline 및 조건부 rule

```markdown
---
description: How we write React components
paths:
  - 'src/**/*.tsx'
  - 'src/**/*.jsx'
---

Components are function components. Co-locate the test beside the component.
Never reach for a global store for state one screen owns.
```

- **`paths:` 포함** — _조건부_ rule입니다. 도구 호출이 glob 중 하나와 일치하는 파일을 읽거나 편집할 때까지 프롬프트에 포함되지 않으며, 그 후 세션이 끝날 때까지 한 번 주입됩니다.
- **`paths:` 미포함** — _baseline_ rule입니다. context file과 마찬가지로 첫 요청부터 시스템 프롬프트의 일부가 되며, 모든 턴에서 동일한 비용을 발생시킵니다.

두 필드 모두 선택 사항이며, frontmatter가 전혀 없는 rule은 baseline rule입니다.

알아둘 만한 세부 사항:

- Glob은 모든 플랫폼에서 정방향 슬래시를 사용하는 **프로젝트 루트 기준 상대 경로**에 대해 매칭되며, dotfile도 매칭합니다.
- 심볼릭 링크는 해석되므로, 도구 호출이 링크를 사용했는지 실제 경로를 사용했는지와 관계없이 rule이 매칭됩니다.
- 조건부 rule은 **세션당 한 번** 주입됩니다 — 두 번째로 매칭되는 파일이 이를 반복하지 않습니다.
- HTML 주석은 rule의 본문에서 전송 전 제거됩니다.

## 확장에서의 rule

확장은 `rules/` 디렉토리를 포함할 수 있으며, **해당 rule은 조건부여야 합니다**: `paths:`가 없는 rule은 건너뛰어지며, 시작 시 해당 rule의 이름을 포함한 경고가 표시됩니다. 이 제한이 핵심입니다. 확장의 context file(`contextFileName`)은 확장이 활성화된 모든 세션의 모든 요청에 관련성 게이트 없이 연결됩니다. 한 측정된 세션에서 9개 확장의 context file이 9,989 token에 달했으며, 이는 해당 세션이 운반한 항상 활성 컨텍스트의 65%였습니다. Baseline 확장 rule은 정확히 그 문제를 반복하는 것입니다 — context file보다 더 좁고 저렴한 메커니즘임에도.

확장 rule은 프롬프트에서 소유자에 따라 레이블이 지정됩니다 — `charts:rules/charting.md`와 같이 프로젝트 밖으로 올라가는 경로가 아니므로, 트랜스크립트에서 어떤 rule이 발동되었는지 확인할 수 있습니다.

확장 rule은 프로젝트 rule과 달리 워크스페이스 신뢰에 따라 게이팅되지 않습니다. 확장 설치는 이미 명시적인 행위이며, 동일한 확장이 MCP 서버, 명령어, skill 및 게이팅되지 않은 context file을 기여할 수 있습니다. context file보다 더 좁고 저렴한 유일한 메커니즘에 신뢰를 요구하면 작성자들이 더 비싼 옵션으로 돌아가게 할 뿐입니다.

**확장을 작성하는 경우**, 다음 마이그레이션을 수행하십시오:

| 내용                                                                              | 위치                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------- |
| 항상 참인 사실 — 확장의 정체성, 어휘, 단일 하드 제약                  | context file                                 |
| "X를 작업할 때, Y를 하라"                                                        | `paths:` 게이팅 rule 또는 [skill](./skills.md) |
| 모델이 요청 시 실행하는 절차                                                     | [skill](./skills.md)                           |

## Rule, skill 및 context file

|                             | 처음부터 프롬프트에 포함 | 요청 시 로드                    |
| --------------------------- | ------------------------ | ------------------------------- |
| Context file(`QWEN.md`)     | 항상, 전체               | —                               |
| Baseline rule               | 항상, 전체               | —                               |
| 조건부 rule(`paths:`)       | 없음                     | 매칭되는 파일이 수정될 때       |
| Skill                       | 이름 + 설명만            | 모델이 호출할 때 본문           |

Skill은 모델이 따르기로 선택하는 절차가 위치하기에 적합한 곳이며, 조건부 rule은 모델이 그것을 찾아보았는지 여부와 관계없이 코드베이스의 특정 영역에 적용되는 제약이 위치하기에 적합한 곳입니다. Skill도 [`paths:`로 게이팅](./skills.md#optional-gate-a-skill-on-file-paths-paths)할 수 있으며, 관련성이 있을 때까지 listing 항목조차 프롬프트에서 제외됩니다.

## 함께 보기

- [Resident Context Cost](./context-cost.md) — 접두사가 얼마나 많은 비용을 발생시키는지 측정하는 방법과 다른 레버.
- [Skills](./skills.md)
- [Memory](./memory.md)
