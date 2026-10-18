# Managed Agent 참조 배포


Managed Agent 참조 배포본은 실험적입니다. 허용되는 초기 토폴로지는 하나의 신뢰할 수 있는 Linux 호스트에 하나의 Java 컨트롤 플레인 및 내장된 Runtime Broker, 하나의 MySQL 데이터베이스, 그리고 하나의 호환되는 Qwen Hosted Harness로 구성됩니다. 각 릴리스의 호환성 매니페스트가 해당 릴리스에 대해 권위 있습니다.

## 확인 및 압축 해제

동일한 GitHub 프리릴리스에서 아카이브, 분리된 매니페스트, `SHA256SUMS.txt`를 다운로드합니다. 압축 해제 전에 검증합니다:

```bash
sha256sum --check SHA256SUMS.txt
tar -xzf qwen-managed-agent-reference-<version>.tar.gz
cd qwen-managed-agent-reference-<version>
sha256sum --check SHA256SUMS
```

`manifest.json`을 검토합니다. `source.revision`이 검토된 리비전인지, `compatibility.qwenCodeVersion`이 CLI/Harness 설치 버전과 일치하는지, `compatibility.databaseSchema.latestMigrationVersion`이 대상 데이터베이스에 허용 가능한지 확인합니다. 체크섬 또는 호환성 검사 중 하나라도 실패하면 해당 릴리스는 유효하지 않습니다.

## 사전 요구사항

- 신뢰할 수 있는 애플리케이션 호스트의 Linux.
- JDK 21 이상.
- `compatibility.node`와 일치하는 Node.js 및 `compatibility.qwenCodeVersion`과 일치하는 Qwen Code.
- 빈 데이터베이스 또는 이전에 오래된 호환 참조 배포본으로 관리되던 데이터베이스가 있는 MySQL 8.
- Runtime 상태와 인증된 Workspace를 위한 비공개 영구 디렉토리.
- 아카이브 외부에 저장된 안정적인 데이터베이스 자격 증명, Runtime 자격 증명 키, Harness 토큰.

Java 아카이브에는 npm CLI가 포함되어 있지 않습니다. 정확한 호환 Qwen Code 리비전을 별도로 설치 또는 빌드하고 Runtime 워커의 `dist/cli.js` 위치를 확인합니다.

## Hosted Harness 시작

하나의 토큰과 capability 다이제스트를 선택하고 Harness와 Java 서비스에 동일한 값을 지정합니다:

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

Harness를 루프백에 유지합니다. 보고되는 포트를 기록합니다. 요청된 포트가 이미 사용 중이면 `--port`가 변경될 수 있습니다.

## Java 컨트롤 플레인 시작

다른 터미널에서 동일한 Harness와 데이터베이스를 구성합니다:

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/qwen_managed_agent'
export SPRING_DATASOURCE_USERNAME='qwen'
export SPRING_DATASOURCE_PASSWORD='<private-password>'
export QWEN_MANAGED_AGENT_HARNESS_ENABLED='true'
export QWEN_MANAGED_AGENT_HARNESS_BASE_URL='http://127.0.0.1:4170'
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

bin/qwen-managed-agent-server
```

런처는 이 아카이브의 서버 JAR을 사용합니다. Spring Flyway는 서비스가 준비 상태가 되기 전에 순방향 데이터베이스 마이그레이션을 적용합니다. 다음을 기다립니다:

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

이 기본 구성은 텍스트 전용 Hosted Session을 지원합니다. 서명된 또는 인증된 인그레스가 구성되지 않는 한 리스너를 루프백에 유지합니다. 완전한 인증, API 및 capability 구성은 `docs/server-reference.md`에 번들되어 있습니다.

## 허용된 로컬 프로세스 도구 경로 활성화

도구 실행에는 기존 fail-closed Runtime 및 Workspace 설정이 필요합니다. 최소한 다음을 구성합니다:

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_WORKSPACE_ID='reference-workspace'
export QWEN_MANAGED_AGENT_WORKSPACE_CWD='/srv/qwen-workspace'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

파일, Shell 또는 자식 Git 작업을 허용하기 전에 `docs/server-reference.md`의 "Verified physical Workspace recovery" 섹션에 설명된 네이티브 스토리지 등록 및 마운트 ID 검증을 완료합니다. 등록되지 않았거나 모호한 마운트는 사용 불가능한 상태로 유지되어야 합니다. Public Shell 및 v2 capability 광고는 별도의 자격 확인이 완료될 때까지 비활성화된 상태로 유지됩니다.

## 업그레이드

1. 새 아카이브를 다운로드하고 검증한 다음 두 매니페스트를 읽습니다. 실행 중인 배포를 변경하기 전에 새 Qwen Code/Harness, Java, 프로토콜 및 데이터베이스 요구사항을 확인합니다.
2. 새 인그레스를 중단합니다. 배포의 기존 드레인 절차에 따라 허용된 작업이 정리될 때까지 기다립니다.
3. MySQL, `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`, Runtime 자격 증명 키, 그리고 정확한 이전 배포본을 백업합니다. 업그레이드 중에 자격 증명 키를 교체하지 않습니다.
4. Java 서비스와 Hosted Harness를 중지합니다. Workspace와 영구 Runtime 상태를 보존합니다.
5. 매니페스트와 호환되는 Qwen Code/Harness를 설치하고 기존 토큰과 capability 다이제스트로 시작합니다.
6. 동일한 데이터베이스 및 영구 설정으로 새 `bin/qwen-managed-agent-server`를 시작합니다. Flyway가 스키마를 순방향으로 마이그레이션합니다.
7. 정상적인 actuator 응답을 확인하고, 기존 Session과 히스토리를 읽은 다음, 인그레스를 다시 열기 전에 새로운 도구 없는 Turn 하나를 완료합니다. 선택적 도구 capability는 활성화 전에 다시 자격을 확인합니다.

데이터베이스 다운그레이드는 지원되지 않습니다. 트래픽이 재개되기 전에 시작 또는 유효성 검사가 실패하면 구성을 수정하고 동일한 아티팩트를 다시 시도합니다. 매니페스트의 스키마 범위가 더 오래된 버전으로 돌아가려면 새 쓰기를 허용하기 전에 업그레이드 전 데이터베이스와 Runtime 상태 백업을 함께 복원합니다. 마이그레이션된 데이터베이스에 대해 이전 서버를 임의로 실행하지 않습니다.

## Runtime 자격 증명 키 교체

배포 업그레이드와 별도로 자격 증명 키를 교체합니다. 데이터베이스와 현재 키를 백업한 다음, 새 활성 쌍을 구성하고 `previous-credential-keys` 아래에 이전 쌍을 유지합니다:

```yaml
qwen:
  managed-agent:
    runtime-broker:
      credential-key-id: reference-v2
      credential-key: <base64-encoded-32-byte-v2-key>
      previous-credential-keys:
        '[reference-v1]': <base64-encoded-32-byte-v1-key>
```

모든 맵 키를 `[ ... ]`로 감쌉니다. Spring의 relaxed binder는 일반 키를 정규화합니다 — `legacy/v1`, `legacy:v1` 또는 `legacy v1`과 같은 ID는 YAML에서 따옴표로 묶었는지 여부에 관계없이 `legacyv1`로 바인딩됩니다 — 따라서 키 링이 영구화된 키 ID와 일치하지 않게 되어, 키가 구성되어 있어도 해당 ID로 작성된 행은 읽을 수 없게 됩니다. 대괄호 형식은 정확한 ID를 보존합니다.

단일 Java 컨트롤 플레인을 재시작하고 기존 바인딩이 로드되는지 확인하며, 새 바인딩 행에 `reference-v2`가 기록되는지 확인합니다. 새 시크릿은 활성 키만 사용합니다. 이전 행은 기록된 키 ID로 암호화된 상태로 유지됩니다. 서버는 읽기 시 이전 행을 다시 암호화하지 않으며, 여전히 참조되는 키를 제거하면 해당 행을 읽을 수 없게 됩니다.

영구화된 행이 참조하지 않을 때만 `reference-v1`을 폐기합니다. `ma_runtime_binding.credential_key_id`와 `ma_runtime_binding.runtime_credential_key_id`가 유일한 영구 참조이며, 둘 다 UTF-8 바이트를 저장합니다. `CONVERT` 없이 선택해야 중복 제거가 바이트 단위로 정확해집니다. 키 선택 방식도 동일합니다. 변환된 값은 문자 세트의 기본 콜레이션을 따르므로 대소문자 또는 악센트만 다른 두 ID를 병합하여 행이 여전히 참조하는 키를 숨길 수 있습니다.

```sql
SELECT DISTINCT credential_key_id AS key_id
FROM ma_runtime_binding WHERE credential_key_id IS NOT NULL
UNION
SELECT DISTINCT runtime_credential_key_id AS key_id
FROM ma_runtime_binding WHERE runtime_credential_key_id IS NOT NULL;
```

결과는 영구화된 행이 여전히 필요로 하는 키 ID를 나열합니다. 활성 ID(`reference-v2`)만 예상됩니다. `reference-v1`이 나타나는 동안에는 해당 키가 구성된 상태로 유지되어야 합니다.

키 링은 맵이며 `QWEN_MANAGED_AGENT_*` 환경 변수를 통해 제공할 수 없습니다. relaxed binding은 환경 변수 형식을 빈 키 또는 잘못된 키의 링으로 조용히 해석하며 시작 오류가 발생하지 않습니다. 서버 프로세스가 실제로 로드하는 `application.yml`에서 `previous-credential-keys`를 구성합니다. 참조 배포본은 구성 파일과 함께 제공되지 않으며, Spring은 외부 `application.yml`을 배포 루트가 아닌 프로세스 작업 디렉토리(`./` 및 `./config/`)에 대해 해석합니다. `bin/qwen-managed-agent-server`는 인수를 JVM으로 전달하므로 `--spring.config.additional-location=file:<absolute-path>`로 위치를 고정합니다. 환경 변수에만 의존하는 배포는 빈 링으로 시작하므로, 이전 키 구성 없이 `credential-key-id`를 교체하면 해당 키로 작성된 행을 읽을 수 없게 됩니다.

운영자 복구 진입점과 CSI/마이그레이션 유지보수 메인도 단일 자격 증명 키 쌍을 구성하며 `previous-credential-keys`를 읽지 않습니다. 이전 키로 작성된 바인딩을 복구하려면, 이전 키를 활성 자격 증명 쌍으로 구성하여 해당 진입점을 실행합니다.

## 운영자 복구

`bin/qwen-managed-agent-operator-recovery`는 별도로 패키징된 복구 진입점을 시작합니다. 복구 전용 환경이 설정되지 않은 경우 비활성화되며 HTTP 서비스나 워커를 시작하지 않습니다. `docs/hosted-workspace-recovery.md`를 따릅니다. 안전 펜스를 해제하기 위해 물리적 중지를 추론하거나 영구 행을 삭제하지 않습니다.

## 범위 경계

이 배포본은 다중 Java 컨트롤 플레인, 교차 호스트 인계, 공개 CSI, Kubernetes 퇴역, 공개 Shell, v2 광고 또는 안정적인 프로덕션 지원을 인증하지 않습니다. 이러한 기능에는 별도의 릴리스 증거가 필요합니다.