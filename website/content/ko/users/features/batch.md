# 배치 모드 (DashScope)

DashScope Batch API는 실시간 가격의 절반으로 비동기 요청을 실행하며, 최소 24시간 내에 완료됩니다. Qwen Code는 `/batch-api`를 통해 이를 사용합니다: 대량 작업을 설명하면, 에이전트가 계획을 준비하고, `qwen batch`가 이를 제출하고 추적하여 결과를 파일로 작성합니다.

## Batch 모델 구성

`settings.json`에 엔드포인트와 자격 증명을 한 번 선언한 다음 `batch.model`로 선택합니다. 대화가 Qwen OAuth나 다른 제공자를 사용하는 경우를 포함하여, 일반 대화 모델과 인증은 변경되지 않습니다.

```json
{
  "env": { "DASHSCOPE_API_KEY": "your-key" },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "batch": { "authType": "openai", "model": "qwen3.7-plus" }
}
```

이 필드를 기존 설정에 병합하되 다른 제공자 항목은 유지합니다. `envKey`는 `settings.env`의 키(또는 환경 변수)를 지정합니다; 별도의 shell export는 필요 없습니다. 제공자의 `generationConfig`가 Batch 생성을 제어합니다. `wireApi`는 요청 프로토콜이며 Batch 전환 스위치가 아닙니다: 생략하거나 `"chat-completions"`를 사용하십시오; `"responses"`는 이 실행기에서 지원되지 않습니다.

`batch.authType`의 기본값은 `openai`입니다. 모델은 `baseUrl`과 채워진 `envKey`를 가진 OpenAI 호환 chat-completions 항목 중 정확히 하나와 일치해야 합니다. ID가 반복되면 `batch.baseUrl`을 정확히 설정된 URL로 지정합니다. 잘못된 명시적 선택은 업로드 전에 실패하며, 대화 자격 증명으로 폴백하지 않습니다. 이 선택을 변경한 후 대화형 세션을 재시작하여 백그라운드 컬렉터가 하위 명령어와 동일한 설정을 사용하도록 합니다.

Batch 선택이 없으면 이전 동작이 유지됩니다: Batch는 메인 모델의 구성을 재사용하며 OpenAI 호환 API 키 인증이 필요합니다. Qwen OAuth 자격 증명 자체에는 Batch 경로가 없습니다. `qwen batch check`를 실행하여 유료 요청을 제출하지 않고 준비 상태를 확인합니다.

## Batch가 적합한 경우

- **반값, 캐시 없음.** Batch는 성공한 요청에 대해 실시간 정가의 50%를 청구하지만, 배치 내부에서는 prefix 캐시가 절대 히트하지 않습니다(측정값 `cached_tokens: 0`). 실시간은 캐시된 입력에 대해 정가의 20%를 청구하므로, batch는 각 요청의 공유 부분이 적을 때만 유리합니다: 캐시 히트율 `h`에서, 실시간 입력 비용은 정가의 약 `1 − 0.8h`이며, `h`가 0.625를 초과하면 batch가 더 비쌉니다.
- **좋은 적합:** 각 요청이 자체 콘텐츠로 지배되는 많은 독립적 단일 턴 요청 — 문서 집합 번역 또는 요약, 파일별 데이터 추출. 긴 출력은 batch에 더 유리합니다.
- **나쁜 적합:** 짧은 항목과 함께 긴 공유 규칙북 또는 few-shot prefix, 소수의 항목, 두 턴 이상 필요한 모든 것. 에이전트의 자체 턴을 Batch로 라우팅하면 실시간 대비 1.03배이며 몇 시간 더 느립니다.
- **지연 시간:** 수초에서 수 시간까지, 대부분 대기열 시간이며 모델에 따라 다릅니다. 빠르지는 않지만 저렴하다고 기대하십시오.

작업을 확정하기 전에 확인하려면, 실시간으로 하나의 요청을 전송하여 `usage.prompt_tokens_details.cached_tokens`과 `usage.prompt_tokens`를 비교하십시오.

## `/batch-api`

```text
/batch-api translate the Markdown docs in docs/zh into English,
writing them to docs/en with the same file names
```

에이전트는 `qwen batch check`를 실행하고, 작업이 적합한지 확인하고, 작은 샘플을 읽고, `.qwen/batch/plans/`에 계획을 작성하고 미리봅니다 — 아무것도 업로드되거나 청구되지 않습니다:

```bash
qwen batch run .qwen/batch/plans/<slug>.json --dry-run
# preview: 42 item(s), window 24h — nothing uploaded, nothing billed
# model qwen-plus, thinking off, max output 8192 tokens (frozen from your current settings; retries reuse them)
# writes new files to: docs/en/ (42)
# ~180,000 in / ~190,000 out tokens (rough estimate); ...
# snapshot 3f9c2a7e5d10b884; submit exactly this batch with: qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
```

그런 다음 해당 스냅샷을 제출합니다. 이 명령어의 승인 프롬프트가 비용을 지출할지 결정하는 곳이며, 그 위에 미리보기가 표시됩니다; 그 사이에 계획, 소스 파일 또는 설정이 변경되면 제출이 거부됩니다.

```bash
qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
# task translate-docs-20260923103000: 42 item(s), window 24h
# ...
# batch job: batch_abc123
```

`run`은 즉시 반환되며 **수동으로 collect할 필요가 없습니다**. 에이전트는 `qwen batch collect <task-id> --wait`를 백그라운드 작업(`/tasks`에서 표시)으로 시작하고 턴을 종료하므로 계속 작업할 수 있습니다. 이 프로세스는 HTTP를 통해 제공자를 폴링하며 — 대기 중에는 모델 호출이 없습니다 — batch가 완료되면 결과를 작성하고 종료합니다. 그런 다음 에이전트가 한 번 깨어납니다: 전달된 항목, 보류된 항목 또는 실패한 항목을 알려주고, 원본 요청에서 요청한 후속 작업을 수행합니다. 실패한 항목은 재시도 시 추가 비용이 발생하므로 자동으로 재시도되지 않습니다.

세션이 먼저 닫혀도 아무것도 손실되지 않습니다: 대화형 세션은 시작 시와 열려 있는 동안 프로젝트의 완료된 작업을 수집하고 하나의 알림을 게시합니다. 이를 끄려면 `general.batchAutoCollect`를 `false`로 설정하십시오. 헤드리스 실행(`qwen -p`), `qwen serve` 및 IDE/ACP 클라이언트는 자동 수집하지 않습니다.

명령어는 모든 디렉토리에서 작동하며, 세션 내에서 `!` 접두사(예: `!qwen batch collect <task-id>`)와 함께 사용되므로 모델 턴이 소모되지 않습니다:

```bash
qwen batch check                         # verify setup; nothing is billed
qwen batch collect <task-id> [--wait [--timeout <s>]]   # validate + write target files
qwen batch retry <task-id>               # resubmit only the failed items
qwen batch retry <task-id> --max-output-tokens 8192  # include truncated ones
qwen batch list                          # every recorded task, with its project
qwen batch cancel <task-id>              # partial results are still billed
qwen batch clean <task-id>               # delete the local record (cancels nothing)
```

`collect`는 각 항목을 다음과 같이 보고합니다:

- **delivered** — 대상에 작성됨;
- **held** — 제출 후 소스가 변경되었거나(`retry`가 새 소스에 대해 재제출), 대상이 이미 다른 콘텐츠로 존재합니다(해결 후 `collect`를 재실행; 새 요청은 발생하지 않음);
- **failed** — 잘림, 비어 있음, 도구 호출 또는 제공자 오류; `retry`가 이를 재제출하며, 잘린 항목은 더 큰 `--max-output-tokens`와 함께 재제출됩니다.

`collect`를 재실행하는 것은 항상 안전합니다: 전달된 항목은 절대 다시 처리되지 않으며 사용량이 이중으로 계산되지 않습니다. 결과가 디스크에 작성되면 원격 입력 및 출력 파일이 삭제됩니다.

## 기록, 안전 및 비용

- 작업 기록은 `~/.qwen/batch/tasks/<task-id>/`(`QWEN_BATCH_HOME`으로 재정의 가능)에 소유자 전용 권한으로 저장됩니다. 소스 및 출력의 전체 복사본을 포함하기 때문입니다. 프로젝트의 `.qwen/batch/` 아래 계획 파일에는 `.gitignore`이 적용됩니다.
- 작업은 제출된 엔드포인트 및 API 키에 연결됩니다(키의 짧은 해시만 저장됨); 계정 또는 리전을 전환한 후에는 다시 원래대로 전환할 때까지 명령어가 거부됩니다.
- create 호출의 응답이 유실되면 `run`이 실패하고, 작업이 `submit-unknown`으로 표시되며, `collect`는 재제출 대신 제공자의 배치 목록과 조정합니다 — 중복 제출 시 이중 청구되기 때문입니다.
- 한 번에 하나의 `qwen batch` 명령어만 작업에서 작동합니다.
- 실행 시 현재 샘플링 매개변수, 출력 제한 및 사고 모드가 고정되며; 재시도 시 이들이 재사용됩니다.
- 추정은 `QWEN_BATCH_INPUT_PRICE_PER_1M_USD`와 `QWEN_BATCH_OUTPUT_PRICE_PER_1M_USD`를 설정하지 않는 한 토큰 기반입니다. 대략적 추정은 사고 토큰을 제외하며, 이는 출력의 여러 배가 될 수 있습니다. 계획의 `maxCostUsd`는 요청 상한에서의 최악의 경우에 대해 적용됩니다: 해당 가격, `maxOutputTokens`, 그리고 사고 꺼짐 또는 `thinking_budget`가 필요하며, 그렇지 않으면 실행이 거부됩니다. 두 수치 모두 계획을 준비하는 데 세션에서 소비한 비용은 포함하지 않습니다.
- 실패한 원격 정리는 `retry`, `cancel` 또는 `clean`을 절대 차단하지 않습니다; 이후 `collect`가 이를 재시도합니다. 제공자가 전체적으로 제공할 수 없거나(신규 다운로드 한 번 후) 더 이상 보유하지 않는 결과 파일은 작업을 멈춘 상태로 두는 대신 영향을 받은 항목을 실패 처리합니다.
- `clean`은 batch가 아직 실행 중이거나 수집되지 않은 결과가 있을 수 있는 경우 `--force`를 전달하지 않는 한 거부됩니다.
- 대상은 프로젝트 내부 및 숨겨진 경로 외부(`.git/`, `.github/`, `.qwen/`, … 모든 깊이)에 있어야 합니다: 결과는 계획을 승인한 후 수 시간에 걸쳐 작성됩니다. 미리보기에 대상 디렉토리가 나열됩니다.

설계: [`docs/design/2026-09-23-batch-api-design.md`](../../design/2026-09-23-batch-api-design.md). 오프라인 종단 점검(가짜 Batch API, 실제 빌드된 CLI)은 [`docs/verification/batch-api/`](../../verification/batch-api/README.md)에 있습니다.