# Hosted Workspace 운영자 복구


이 절차는 원래 호스트에서 불완전한 Hosted Shell 캡처가 Workspace 리스를 보유 중인 Linux 내구성 로컬 프로세스 워커에만 사용하십시오. `prepare`와 `complete` 사이의 재부팅은 펜스를 해제하지 않습니다. 운영자는 모든 잠재적 작성자가 중지되었고 재시작할 수 없음을 확인한 후 `complete`로 증명을 제출해야 합니다. 복구는 물리 Workspace를 새 세션에서 사용할 수 있게 만듭니다. 원래 Shell 호출을 완료, 재시도 또는 인증하지는 않습니다.

유지보수 명령어는 `qwen-managed-agent-server-*-operator-recovery.jar`로 제공됩니다. 원래 워커 호스트에서 서비스 OS 계정으로, 서비스의 데이터베이스 설정, Runtime 자격 증명 키, `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`를 사용하여 실행하십시오. 이 유지보수 프로세스에 대해 `QWEN_MANAGED_AGENT_RUNTIME_DURABLE_LOCAL_PROCESS=true`, `QWEN_MANAGED_AGENT_RUNTIME_PROVISIONER=local-process`, `QWEN_MANAGED_AGENT_RUNTIME_OPERATOR_RECOVERY_ENABLED=true`를 설정하십시오. 데이터베이스 및 자격 증명 환경은 비공개로 유지하십시오. 명령어를 실행하기 전에 서비스 데이터베이스 마이그레이션을 적용하십시오. 이 명령어는 HTTP 리스너, 스케줄러 또는 워커를 시작하지 않습니다.

1. 영향받은 실행의 `runtime.runtimeBindingId`와 `runtime.generation`을 찾습니다. 실행 기록을 사용할 수 없는 경우, 권한을 가진 DBA가 영향받은 `tenant_id`와 `workspace_id`에 대해 `qwen_runtime_binding`에 읽기 전용 쿼리를 실행하여 `binding_id`, `runtime_generation`, `binding_state`를 나열할 수 있습니다. 각 후보를 확인하고 보유 중인 리스 및 Shell 캡처가 일치하는 항목만 사용하십시오. `java -jar qwen-managed-agent-server-*-operator-recovery.jar inspect <bindingId> <generation>`을 실행합니다. 반환된 `holderKey`, Runtime 세션, Shell 호출, `captureStatus`, `captureReason`을 기록합니다. 복구에는 저장된 `producer_lost` Shell 결과와 정확히 여전히 보유 중인 Workspace 리스가 필요합니다. 지원되지 않는 레거시 워커, 누락된 등록 신원 또는 누락된 보유자는 대체 신원 기록을 생성해도 복구할 수 없습니다.
2. `java -jar qwen-managed-agent-server-*-operator-recovery.jar prepare <bindingId> <generation> <holderKey> '<incident reason>'`을 실행합니다. 반환된 `recoveryId`를 저장합니다. 활성 또는 복구 차단된 바인딩은 `OPERATOR_RECOVERY`로 펜스되며, 이미 LOST 상태인 바인딩은 LOST로 유지되고 백그라운드 복구 스캔에서 제외됩니다. Workspace 리스는 해제되지 않습니다. 동일한 서비스 OS 계정과 사유를 반복하는 것은 안전합니다. 다른 기록된 계정, 사유, generation 또는 보유자는 거부됩니다. 실제 운영자는 인시던트 기록에 별도로 기록합니다. `operator_id`는 명령어를 실행하는 OS 계정을 식별합니다.
3. 원래 워커를 중지하고 분리된 자식 프로세스 및 외부 감독자를 포함하여 Workspace에 대한 **모든** 가능한 작성자를 점검하십시오. 원래 워커와 작성자가 재시작되지 않도록 하십시오. 중지되었음을 확인하십시오. 프로세스 그룹 종료, 파이프 EOF, 경과 시간 및 부모 PID 상실만으로는 충분하지 않습니다. 이를 확인할 수 없으면 여기서 중지하고 Workspace를 펜스된 상태로 두십시오.
4. 비공개 Runtime 상태 디렉토리 안에 직접 다음 필드를 포함하는 일반 심볼릭 링크가 아닌 UTF-8 JSON 파일을 모드 `0600`, 최대 8 KiB로 생성하십시오(예시 값 교체):

   ```json
   {
     "version": 1,
     "recoveryId": "<recoveryId>",
     "verifiedAt": "2026-09-29T03:00:00Z",
     "method": "host inspection",
     "actions": "Stopped worker and detached writers; disabled their external restart source; verified no writer remains",
     "restartPrevention": true
   }
   ```

   `verifiedAt`은 `prepare`보다 빠르지 않고 유지보수 호스트 시계보다 5분 이상 ahead이지 않은 실제 UTC 확인 시간이어야 합니다. 구체적인 단계와 재시작 방지 출처를 기록하십시오. 해당 확인을 완료하기 전에 이 진술을 작성하지 마십시오. 파일과 인시던트 기록은 비공개로 유지하십시오.

5. `java -jar qwen-managed-agent-server-*-operator-recovery.jar complete <recoveryId> <absoluteEvidenceFile>`을 실행합니다. 이 명령어는 정확히 저장된 워커 신원과 동일한 부팅에서의 부재를 확인하고, 원래 호스트 재부팅 후에는 변경된 부팅 신원을 확인합니다. 그런 등록을 톰스톤 처리하고 변경 불가능한 진술을 저장하며 원래 보유자만 회수합니다. 크래시 또는 일시적 데이터베이스 장애 후 **동일한 파일**로 재시도할 수 있습니다. 변경된 진술은 거부됩니다. 성공적인 출력은 `completed`입니다.

완료 후 **새** 세션을 시작하고 Workspace를 사용할 수 있는지 확인하십시오. 원래 턴은 별도로 점검하십시오. 부분적 출력과 불확실한 효과는 불확실한 상태로 남으며, 어떤 Shell 호출도 리플레이되지 않습니다. 거부를 우회하기 위해 SQL 테이블이나 등록 파일을 수동으로 삭제하지 마십시오. 원래 등록이 없거나 손상된 경우, 또는 워커가 이전 일시적 모드의 경우 이 절차는 지원되지 않습니다. 증거를 조작하지 말고 보존된 증거와 함께 에스컬레이션하십시오.

이 소프트웨어는 등록된 워커 신원과 정확한 SQL 보유자를 확인할 수 있지만, 임의로 이스케이프된 하위 프로세스가 중지되었음을 증명할 수는 없습니다. 해당 사실에 대한 신뢰 경계는 운영자의 진술입니다.
