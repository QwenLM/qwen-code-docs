# 도구 사용 요약

Qwen Code는 각 도구 배치 완료 후 짧은 git-commit-subject 스타일의 레이블을 생성하여 배치에서 달성한 내용을 요약할 수 있습니다. 레이블은 인라인으로 표시됩니다: 메인 뷰에서 완료된 도구 그룹의 경우 일반적인 `Tool × N` 헤더를 대체합니다; 그룹이 강제 확장된 경우(`Ctrl+O` 확장 상세 모드, 또는 오류 / 사용자 시작 배치) 그룹 아래 흐리게 `● <label>` 라인으로 나타납니다.

이것은 병렬 도구 호출을 위한 UX 보조입니다: 모델이 여러 `Read` + `Grep` + `Bash` 호출로 한꺼번에 팬아웃할 때, 요약이 도구 목록을 스캔하게 강제하는 대신 한눈에 의도를 알려줍니다.

이 기능은 기본적으로 활성화되어 있으며 백그라운드에서 조용히 실행됩니다. 설정된 [fast model](./followup-suggestions#fast-model)이 필요합니다.

## 보이는 것

### 메인 뷰 (완료된 그룹)

메인 트랜스크립트에서, 완료된 접을 수 있는 배치가 단일 레이블 행으로 접힙니다 — 요약이 일반적인 `Tool × N` 헤더를 대체합니다:

```
╭──────────────────────────────────────────────╮
│✓  Read 4 text files                          │
╰──────────────────────────────────────────────╯
```

전체 도구별 출력은 키 입력 하나 떨어져 있습니다: `Ctrl+O`를 눌러 확장 상세 모드를 토글하세요.

### 확장 상세 모드 (`Ctrl+O`) 및 강제 확장된 그룹

그룹이 강제 확장된 경우 — `Ctrl+O` 확장 상세 모드, 또는 메인 뷰의 오류 / 사용자 시작 배치 — 각 도구가 개별적으로 렌더링되고 요약이 그룹 아래 흐린 배지 라인으로 나타납니다:

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Read 4 text files
```

## 작동 방식

도구 배치가 완료되면 Qwen Code는 설정된 fast model에 fire-and-forget 호출을 실행합니다:

- 도구 이름, 잘린 인수, 잘린 결과(각각 최대 300자).
- 어시스턴트의 가장 최근 텍스트 출력(첫 200자)이 의도 접두사로.
- 모델에게 과거 시제의 30자 레이블을 git-commit-subject 스타일로 반환하도록 지시하는 시스템 프롬프트.

호출은 다음 턴의 API 스트리밍과 병렬로 실행되므로 ~1초 지연이 메인 모델의 응답 뒤에 숨겨집니다. 레이블이 확인되면 `tool_use_summary` 항목으로 트랜스크립트에 추가됩니다.

예시 레이블: `Searched in auth/`, `Fixed NPE in UserService`, `Created signup endpoint`, `Read config.json`, `Ran failing tests`.

## 나타나는 시기

요약은 **모든** 다음 조건이 참일 때 생성됩니다:

- `experimental.emitToolUseSummaries`가 `true`(기본값).
- `fastModel`이 설정됨 (설정 또는 `/model --fast` 경유).
- 배치에서 최소 하나의 도구가 완료됨.
- 도구 완료 전에 턴이 중단되지 않음.
- Fast model이 비어 있지 않고 오류가 아닌 응답을 반환함.

서브에이전트 도구 호출은 요약 생성을 트리거하지 않습니다 — 메인 세션의 도구 배치만 트리거합니다.

## 나타나지 않는 시기

요약은 조용히 건너뛰어집니다(오류 없음, UI 변경 없음):

- Fast model이 설정되지 않음.
- Fast model 호출이 실패, 타임아웃, 또는 빈 응답 반환.
- 모델이 명백한 오류 메시지 유사 문자열을 반환(예: `Error: ...`, `I cannot ...`) — UI가 오해의 소지가 있는 레이블을 표시하지 않도록 클라이언트에서 필터링됨.
- 모델이 완료되기 전에 턴이 중단됨(`Ctrl+C`).

이 모든 경우, 도구 그룹은 항상 그랬던 것처럼 렌더링됩니다.

## Fast Model

레이블은 [fast model](./followup-suggestions#fast-model)을 사용하여 생성됩니다 — 프롬프트 제안과 투기적 실행을 위해 설정하는 것과 동일한 모델입니다. 설정 방법:

### 명령어 경유

```
/model --fast qwen3-coder-flash
```

### `settings.json` 경유

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Fast model이 설정되지 않으면 요약 생성이 완전히 건너뛰어집니다 — 설정할 때까지 이 기능은 효과가 없습니다.

## 설정

다음 설정은 `settings.json`에서 설정할 수 있습니다:

| 설정                                | 유형    | 기본값  | 설명                                                                                             |
| ----------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------ |
| `experimental.emitToolUseSummaries` | boolean | `true`  | 요약 생성의 마스터 스위치. 추가 fast model 호출을 비활성화하려면 끄세요.                         |
| `fastModel`                         | string  | `""`    | 요약 생성에 사용되는 fast model (프롬프트 제안과 공유). 필수; 비어 있으면 무효.                  |

### 환경 변수 재정의

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES`는 현재 세션에 대해 `experimental.emitToolUseSummaries` 설정을 재정의합니다:

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 또는 `=false` — 강제 비활성화.
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` 또는 `=true` — 강제 활성화.
- 설정 해제 — `experimental.emitToolUseSummaries` 설정 사용.

### 예시

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

## 범위 및 수명

이 기능의 첫 읽을 혼란스럽게 하는 세 가지 포인트:

1. **배치당 한 번 생성, 두 표시 모드 모두 공유.** Fast model 호출은 도구 배치가 완료될 때 `handleCompletedTools`에서 정확히 한 번 발생합니다. 그 후 `Ctrl+O` 확장 상세 모드를 토글해도 새 호출이 트리거되지 **않습니다** — 접힌 것과 확장된 렌더링 모두 처음에 캡처된 동일한 `tool_use_summary` 기록 항목에서 읽습니다.
2. **토글 또는 세션 재개 시 백필 없음.** 기능이 활성화되기 전에 완료된 `tool_group`(설정을 켜기 전, 또는 재개된 세션에서 — `ChatRecordingService`는 요약 항목을 지속하지 않음)은 절대 레이블을 받지 못합니다. "기존 기록 스윕" 패스가 없습니다. 세션 중에 이 설정을 켜면 _미래_ 배치만 레이블을 표시합니다; 이전 그룹은 레이블이 누락되었다는 표시 없이 기본 렌더링을 유지합니다.
3. **메인 에이전트 배치만.** 트리거는 메인 세션의 턴 루프(`useLlmStream`)에 있으므로:
   - ✅ 셸, MCP, 파일 작업, 그리고 `Task` / 서브에이전트 도구 _호출 자체_(메인 배치에 나타나는 대로)는 요약됩니다.
   - ❌ 서브에이전트의 **내부** 도구 배치(`packages/core/src/agents/runtime/`를 통해 실행)는 요약되지 않습니다.

   `Task` 도구를 _포함하는_ 외부 배치는 여전히 레이블이 붙지만, fast model은 서브에이전트 도구 호출과 그 집계 출력만 봅니다 — 서브에이전트 내부의 개별 도구 호출은 아닙니다. `Ran research-agent` 또는 `Delegated file search`와 같은 레이블을 기대하세요, `Searched 14 files`가 아닙니다. 이것은 의도적입니다 — 서브에이전트 내부를 요약하면 fast model 비용이 곱해지고 기본 UI에 절대 나타나지 않는 노이즈가 표면화됩니다.

## 표시 동작

메인 뷰는 이미 완료된 접을 수 있는 배치를 단일 레이블 행(`✓  Read 4 text files`)으로 접습니다 — 요약이 이전 도구별 목록의 역할을 합니다. 전체 도구별 세부 정보는 `Ctrl+O`를 눌러 확장 상세 모드를 토글하세요. 각 도구가 개별적으로 렌더링되고 요약이 그룹 아래 후행 `● <label>` 라인으로 나타납니다.

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

작은 동일 유형 배치(예: `Read × 3`)의 경우 확장 `● <label>` 라인이 보이는 도구 라인의 재진술로 읽힐 수 있습니다; 이것이 일반적인 워크플로우와 일치하면 `experimental.emitToolUseSummaries: false`를 통해 요약을 완전히 끌 수 있습니다.

## 모니터링

요약 모델 사용량은 `/stats` 출력에서 fast model 토큰 합계 아래에 `prompt_id` `tool_use_summary_generation`과 함께 표시되어 프롬프트 제안 및 기타 백그라운드 작업과 구별됩니다.

## 데이터 플로우 및 프라이버시

요약 호출은 각 성공적인 도구의 이름, 잘린 `args`, 잘린 결과(각 필드 최대 300자)를 **fast model**로 전송하며, 어시스턴트의 가장 최근 텍스트 첫 200자를 의도 접두사로 전송합니다.

Fast model이 메인 세션 모델과 동일한 공급자/인증으로 설정된 경우, 데이터는 메인 세션이 이미 사용하는 동일한 경계로 흐릅니다 — 신뢰 범위의 변화 없음. **다른 공급자**의 fast model을 설정한 경우, 도구 입력과 출력(`read_file`이 읽은 파일 내용, 셸 호출의 명령어 출력, 또는 MCP 도구를 통해 표면화된 값 포함 가능)이 요약 프롬프트의 일부로 해당 다른 공급자에게 전송됩니다. 이것은 메인 세션만보다 엄격히 더 큰 데이터 공유 범위입니다.

이것이 워크플로우에 중요하다면 두 가지 깔끔한 옵션이 있습니다:

- 요약 호출이 새 인증/데이터 경계를 넘지 않도록 `fastModel`을 메인 세션과 동일한 공급자의 모델로 설정.
- `experimental.emitToolUseSummaries: false`(또는 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`)로 기능을 완전히 비활성화.

300자 필드당 캡은 노출을 제한하지만 제거하지는 않습니다 — 캡 창 동안 도구 출력에서 발견된 비밀이 여전히 전송될 수 있습니다. Fast model의 데이터 경계를 메인 모델의 것과 동일하게 취급하세요.

## 비용

적격 도구 배치당 한 번의 fast model 호출. 입력은 작은 고정 시스템 프롬프트와 잘린 도구 입력/출력(필드당 최대 300자)입니다. 출력은 단일 짧은 라인(최대 100자, 일반적으로 20토큰 이하)입니다. 일반적인 fast model에서 배치당 약 $0.001입니다.

추가 비용을 원하지 않으면 `experimental.emitToolUseSummaries: false` 또는 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`을 통해 기능을 끄세요.

## 관련 자료

- [Expanded detail mode](../configuration/settings#ui) — `Ctrl+O`를 눌러 모든 도구 출력을 인라인으로 확장; 완료된 그룹의 경우 요약이 일반적인 도구 그룹 헤더를 대체합니다.
- [Followup Suggestions](./followup-suggestions) — 동일한 `fastModel` 설정을 공유하는 또 다른 fast model 기반 UX 향상.
