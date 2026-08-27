---
title: Monitor Tool
---

# Monitor 도구 (`monitor`)

이 문서는 Qwen Code의 `monitor` 도구에 대해 설명합니다.

## 설명

`monitor`를 사용하여 stdout과 stderr 라인을 백그라운드 작업 알림으로 에이전트에 스트리밍하는 장기간 실행 셸 명령을 시작합니다. 이 도구는 로그 추적, 빌드 출력 감시, 헬스 엔드포인트 폴링, 파일 변경 관찰과 같이 시간이 지남에 따라 새로운 출력이 중요한 watch 스타일 명령을 위한 것입니다.

모니터는 백그라운드에서 실행되므로 에이전트는 이벤트가 도착하는 동안에도 계속 작업할 수 있습니다. 각 비어 있지 않은 출력 라인은 스로틀링의 대상이 되는 알림 이벤트가 됩니다.

### 인수

`monitor`는 다음 인수를 받습니다:

- `command` (string, 필수): 실행하고 모니터할 셸 명령.
- `description` (string, 선택 사항): 모니터가 무엇을 감시하는지에 대한 간단한 설명. 표시 텍스트는 80자로 잘립니다.
- `max_events` (number, 선택 사항): 이 많은 알림 이벤트 이후에 중지합니다. 양의 정수여야 합니다. 기본값은 `1000`이며, 최대 `10000`입니다(이 범위를 벗어나는 값은 조용히 제한되지 않고 거부됩니다).
- `idle_timeout_ms` (number, 선택 사항): 명령이 이 밀리초 동안 출력을 생성하지 않으면 중지합니다. 양의 정수여야 합니다. 기본값은 `300000`(5분)이며, 최대 `600000`(10분)입니다. 이 범위를 벗어나는 값은 거부됩니다.
- `directory` (string, 선택 사항): 명령을 실행할 절대 경로. 심볼릭 링크 정규화 후 등록된 작업 공간 디렉토리 중 하나 내부로 해석되어야 하며, user-skills 디렉토리 내부이면 안 됩니다. 생략하면 Qwen Code는 프로젝트 루트를 사용합니다.

## Qwen Code에서 `monitor` 사용 방법

모델은 단일 명령 결과를 수집하는 대신 시간에 따라 프로세스를 관찰해야 할 때 `monitor` 도구를 선택합니다. 성공적인 호출은 모니터 ID, 명령, 이벤트 제한 및 유휴 타임아웃을 반환합니다.

사용법:

```
monitor(command="tail -f logs/app.log", description="app log stream")
```

모니터 출력은 대화에서 작업 알림으로 볼 수 있습니다. `/tasks` 또는 대화형 Background tasks 대화상자를 사용하여 실행 중이고 완료된 모니터를 검사할 수도 있습니다.

실행 중인 모니터를 중지하려면 `task_stop` 도구를 모니터 ID와 함께 사용하세요:

```
task_stop(task_id="mon_abc123def4567890")
```

## `monitor` 예시

애플리케이션 로그 감시:

```
monitor(
  command="tail -f logs/app.log",
  description="application log stream",
  max_events=200
)
```

개발 서버 또는 빌드 감시자 모니터:

```
monitor(
  command="npm run build -- --watch",
  description="watch build output",
  idle_timeout_ms=600000
)
```

로컬 헬스 엔드포인트 폴링:

```
monitor(
  command="while true; do curl -s http://localhost:8080/health; sleep 5; done",
  description="local health check",
  max_events=120
)
```

특정 작업 공간 디렉토리에서 실행:

```
monitor(
  command="npm run dev",
  description="frontend dev server",
  directory="/absolute/path/to/workspace/packages/web"
)
```

## Monitor와 백그라운드 셸 명령 비교

명령이 계속 실행되는 동안 에이전트가 스트리밍 출력에 반응해야 할 때 `monitor`를 사용하세요. 일회성 결과가 필요하거나 전체 명령 출력이 필요할 때는 `run_shell_command`를 대신 사용하세요.

| 필요 사항                                               | 사용                                     |
| :------------------------------------------------------ | :--------------------------------------- |
| 로그, 빌드 출력 또는 주기적 상태 업데이트 감시          | `monitor`                                |
| 일회성 명령을 실행하고 전체 출력 읽기                  | `run_shell_command(is_background=false)` |
| 의미 있는 출력을 생성하지 않는 데몬 시작               | `run_shell_command(is_background=true)`  |

모니터 명령에 `&`를 추가하지 마세요. `tail -f log &`와 같은 끝에 있는 `&`는 모니터가 자체적으로 백그라운드를 관리하므로 제거됩니다. `cmd1 & cmd2`와 같이 마지막이 아닌 `&`는 직접 거부됩니다. 이러한 명령은 백그라운딩 없이 재구성하세요.

## 중요 참고 사항

- **자동 중지 동작:** 모니터는 `max_events`에 도달하거나, `idle_timeout_ms`가 출력 없이 경과하거나, 기본 명령이 자체적으로 종료되면 자동으로 중지됩니다. 모니터의 상태는 도구 오류가 아닌 명령의 결과를 반영합니다: 정상 종료(`code 0`)는 `completed`가 되고, 0이 아닌 종료 코드는 `Exit code N` 메시지와 함께 `failed`가 되며, 시그널에 의한 종료는 `Killed by signal SIG` 메시지와 함께 `failed`가 됩니다. 명령은 stdin이 닫혀 있으므로 대화형일 수 없습니다. 모니터가 중지되면 Qwen Code는 명령의 프로세스 그룹에 `SIGTERM`을 보내고 약 200ms 후에 `SIGKILL`로 에스컬레이션합니다. Windows에서는 `taskkill /f /t`를 사용합니다. Qwen Code 프로세스 자체가 강제 종료되거나, 충돌하거나, 메모리가 부족하면 분리된 프로세스 그룹이 자동으로 정리되지 않습니다. 종료 전에 `task_stop`으로 모니터를 중지하거나 프로세스 그룹을 수동으로 종료하여 복구하세요.
- **동시성 제한:** Qwen Code는 CLI 세션당 최대 16개의 실행 중인 모니터를 단일 공유 풀로 허용합니다. 서브에이전트가 시작한 모니터도 메인 에이전트가 시작한 모니터와 동일한 상한에 포함됩니다. 제한에 도달하면 다른 모니터를 시작하기 전에 기존 모니터를 중지하세요.
- **출력 처리:** Stdout과 stderr는 스트림 접두사 없이 단일 알림 스트림으로 병합됩니다. 빈 줄은 무시되고, ANSI 색상 및 제어 문자는 제거되며, 2000자를 초과하는 개별 라인은 잘립니다. 높은 볼륨의 출력은 5개의 이벤트 버스트와 그 후 초당 약 1개의 이벤트로 속도 제한되며, 속도 제한을 초과하는 라인은 버퍼링되지 않고 삭제됩니다. 모니터 출력은 `<task-notification>` 콘텐츠로 에이전트 컨텍스트에 유입됩니다. 구조적 알림 태그는 무력화되지만, 모델은 여전히 각 라인의 텍스트를 읽으므로 외부 당사자가 작성할 수 있는 스트림을 모니터하지 마세요(모델이 포함된 지시를 무시할 것이라고 신뢰하는 경우 제외).
- **권한:** `monitor`는 `Monitor(git status)`와 같은 자체 권한 경계 및 권한 규칙을 가집니다. 읽기 전용 명령은 자동으로 허용되고, 상태를 수정하는 명령은 사용자 승인이 필요하며, 명령 치환(`$(...)`, 백틱, `<(...)`, `>(...)`)을 포함하는 명령은 직접 거부됩니다. `run_shell_command`의 `tools.core` 및 `tools.exclude` 설정은 `monitor`에 적용되지 않습니다.
- **작업 공간 제한:** 선택 사항인 `directory`는 등록된 작업 공간 디렉토리 내부와 user-skills 디렉토리 외부로 해석되는 절대 경로여야 합니다. 작업 공간 외부를 가리키는 심볼릭 링크는 거부됩니다.
