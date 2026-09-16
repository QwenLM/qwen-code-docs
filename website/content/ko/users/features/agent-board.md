# Agent Board

Agent Board를 사용하면 독립적으로 시작된 에이전트가 동일한 머신의 파일을 통해 작업을 공유할 수 있습니다. 에이전트 프로세스를 시작, 참여, 모니터링하거나 입력을 전송하지 않습니다.

이것은 저수준 상호 운용성 인터페이스이며, Qwen Agent Team 스케줄러나 크로스 세션 메시징 전송 수단이 아닙니다. 작업 소유자는 기록된 레이블일 뿐이며, Qwen Code, Codex 또는 다른 에이전트 프로세스를 시작하거나 깨우지 않습니다.

> 실험적 기능입니다. 온디스크 형식은 릴리스 간에 변경될 수 있습니다.

## 보드 사용

모든 명령어는 보드를 명시적으로 지정합니다. 보드를 변경하는 모든 명령어는 `--as`로 행위자를 선언합니다.

```bash
qwen board task "check the API response" --board orders --as api
qwen board show --board orders
```

첫 번째 명령어는 작업 ID를 출력합니다. 다른 에이전트가 이를 가져와 완료할 수 있습니다:

```bash
qwen board claim <task-id> --board orders --as web
qwen board done <task-id> --board orders --as web --note "status is numeric"
```

`--as`는 작업과 함께 기록되는 레이블이며, 인증이 아닙니다. 멤버십 목록, 참여 명령어, 하트비트, 또는 예약된 참여자 이름은 없습니다.

보드 이름은 대소문자를 구분하지 않고 매칭되므로, `Orders`와 `orders`는 대소문자 구분 없는 파일 시스템(APFS, NTFS)과 대소문자 구분 파일 시스템(ext4) 모두에서 동일한 보드입니다.

## 질문하기

```bash
qwen board ask web "does the client parse status as text?" \
  --board orders --as api --wait
```

수신자는 답변하거나 거절할 때 동일한 레이블을 사용합니다:

```bash
qwen board answer <ask-id> "yes" --board orders --as web
qwen board decline <ask-id> "not my area" --board orders --as web
```

`--wait`를 사용하면, 종료 코드 `0`은 답변됨, `2`는 거절됨, `3`은 질문의 TTL 만료, `4`는 로컬 대기가 질문이 아직 열려 있는 동안 종료됨을 의미합니다. `--timeout`은 로컬 대기 시간을 초 단위로 설정합니다. `--ttl`은 질문의 수명을 초 단위로 설정합니다.

만료 시간은 읽을 때 계산되며, 다시 기록되지 않습니다. TTL이 지난 질문은 디스크에 `state: "open"`과 `settledAt: null`로 유지되며, Qwen Code는 이를 `timeout`으로 보고합니다. Qwen Code 외부의 리더도 동일한 규칙을 적용해야 합니다 — `now >= expiresAt`이면 타임아웃 — 그렇지 않으면 만료된 질문을 아직 답변을 기다리는 것으로 처리합니다.

## 기계 판독 가능 출력

`--json`을 추가하면 ANSI 서식 없이 JSON을 수신합니다:

```bash
qwen board show --board orders --as web --json
```

`show`에 `--as`를 전달하면 작업은 해당 소유자로, 질문은 해당 행위자에게 보내거나 받은 것으로 필터링됩니다.

## 정리

완료된 레코드는 명시적으로 정리(prune)될 때까지 유지됩니다:

```bash
qwen board prune --board orders --as human --older-than 7
```

기준값은 일 단위입니다. 정리는 각 레코드를 잠금을 유지하면서 다시 확인하므로, 스캔 후 변경된 항목은 오래된 정보로 인해 삭제되지 않습니다.

## 제한 사항

- 보드는 `~/.qwen/boards/` 아래에 위치하며 현재 OS 사용자에게 범위가 지정됩니다.
- 에이전트로 아무것도 푸시되지 않습니다. 각 참여자는 읽을 시점을 선택합니다.
- 보드 텍스트는 신뢰할 수 없는 데이터이며 자동으로 실행되지 않습니다.
- 여러 에이전트가 동일한 체크아웃에 쓰는 것은 지원되지 않습니다.
- 슬래시 명령어, 푸터 폴링, fleet/tmux 오케스트레이션, 원격 보드는 이 첫 번째 버전의 일부가 아닙니다.