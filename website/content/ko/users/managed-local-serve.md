# Managed 세션 로컬 실행


Managed local은 영구적인 임베디드 H2 데이터베이스를 사용합니다. 로컬에 Java 21이 설치되어 있으면,
첫 Managed 실행 시 일치하는 Java 서버 JAR이 자동으로 다운로드됩니다.
Qwen을 실행하는 Node 실행 파일,
Hosted Harness, 네이티브 worker 진입점 및 프로덕션 WebShell을 재사용합니다. 사용자는 MySQL, Docker, Maven 또는 systemd를 설치할 필요가 없습니다. 선택 사항인 사전 설치 번들 런타임은
Java를 포함하며, 기본 다운로드 및 경량 에디션은 로컬 Java 21이 필요합니다.

이 모드는 실험적입니다. 구현은 arm64 및 x64에서 네이티브 macOS와 Linux를 지원합니다. 플랫폼 승인 결과는 별도로 기록되며,
패키징 대상을 제공한다고 해서 해당 플랫폼이 E2E 검증을 통과한 것은 아닙니다.
Managed 런타임 아카이브는 아래 설명대로 명시적으로 빌드되며, 일반 CLI
패키지에는 Java 페이로드가 포함되어 있지 않습니다. 선택 사항인 완전한 Managed
독립 실행형 아카이브는 모든 구성 요소를 번들합니다.

## 시작 및 중지

Managed local 지원을 포함하는 Qwen 버전을 사용하십시오. 이전 릴리스는 CLI 업그레이드가 필요하며, 런타임만 설치해서는 런처를 추가할 수 없습니다. Java 21을 설치하고
`JAVA_HOME`을 해당 홈으로 설정하거나 실행 파일을 PATH에 추가한 후 실행하십시오:

```sh
qwen serve --managed --open
```

애플리케이션 데이터를 생성하거나 서비스를 시작하기 전에, Qwen은 Java 21을 확인하고
공식 Aliyun OSS 릴리스 미러에서 `qwen-managed-agent-server-<cli-version>.jar`와 체크섬을 다운로드합니다. GitHub Release가 폴백으로 사용됩니다.
체크섬을 검증하고 `<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/` 아래에 완전한 런타임을 원자적으로 설치합니다. 이후 실행은
네트워킹 없이 해당 캐시를 재사용합니다. 일반 Qwen 명령은 이를 다운로드하지 않습니다.
서비스 JAR만 다운로드되며, Qwen은 Java를 설치하거나 Maven을 실행하지 않습니다.
일치하는 릴리스를 사용할 수 없거나 다운로드가 실패하면 애플리케이션 데이터나 서비스 자식이 생성되지 않습니다. 나중에 재시도하거나 일치하는 런타임을 사전 설치하십시오.

오프라인 사용 또는 번들 Java의 경우, 배포 빌더로부터 일치하는
`qwen-code-managed-runtime-<platform>-<arch>.tar.gz`와 해당 `.sha256` 파일을 얻으십시오. 시작 전에 검증하고 압축을 풀십시오:

```sh
shasum -a 256 -c qwen-code-managed-runtime-darwin-arm64.tar.gz.sha256
mkdir -p "${QWEN_HOME:-$HOME/.qwen}"
tar -xzf qwen-code-managed-runtime-darwin-arm64.tar.gz -C "${QWEN_HOME:-$HOME/.qwen}"
qwen serve --managed --open
```

아카이브는 `<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/` 아래에 설치됩니다. Qwen은 정확한 버전과 플랫폼의 디렉토리를 자동으로 검색합니다. 런타임에는 다른 Node, CLI, Harness, worker 또는 WebShell 설치가 포함되어 있지 않습니다.

더 작은 오프라인 페이로드의 경우, `qwen-code-managed-runtime-lite-<platform>-<arch>.tar.gz`를 선택하고 같은 방식으로 검증/압축 해제하십시오. 여기에는 서버 JAR과 매니페스트만 포함되어 있습니다. 새로운 버전/대상 디렉토리에 하나의 에디션을 설치하십시오. 경량 아카이브와 번들 아카이브를 겹쳐서 설치하지 마십시오. 경량 런처는 JAVA_HOME이 비어 있지 않으면 `JAVA_HOME/bin/java`를 사용하고, 그렇지 않으면 PATH에서 첫 번째 실행 가능한
`java`를 사용합니다. Java 21이 특별히 필요하며 애플리케이션 상태를 생성하기 전에 실행 파일을 확인합니다. 잘못된 JAVA_HOME은 PATH에 다른 작동하는 Java가 있더라도 오류입니다. 예:

```sh
JAVA_HOME=/absolute/java-21-home qwen serve --managed --open
```

macOS에서 JAVA_HOME은 일반적으로 `Contents/Home`로 끝납니다. 누락되거나 호환되지 않는
Java는 JAR 다운로드 전에 설치/구성 오류를 발생시키며, Qwen은 Java를 다운로드하지 않습니다.
번들 에디션은 항상 자체 Java를 사용하며 페이로드가 손상된 경우 머신의 Java로 폴백하지 않습니다.

선택 사항인 완전한 `qwen-code-managed-local-<platform>-<arch>.tar.gz`도
작동합니다. 압축을 풀고 `./qwen-code/bin/qwen serve --managed --open`을 실행하십시오.

애플리케이션은 `127.0.0.1:4170`에 바인딩됩니다. 사용 가능한 포트를 사용하려면 `--port 0`을 사용하거나 고정 포트를 선택하십시오. 터미널을 열어 두십시오. Ctrl+C는 일반 데몬, Java 서비스 및 Harness를 종료합니다. systemd는 운영자가 관리하는 배포에 대해 선택 사항이며 이 명령에서 사용되지 않습니다.
점유된 공개 포트는 일반 데몬의 유계된 근접 포트 재시도를 따릅니다. 런처가 출력한 브라우저 주소를 사용하십시오.

이 하나의 명령으로 일반 데몬과 Managed Agent가 모두 시작됩니다. 동일한
WebShell은 일반 및 Managed 워크스페이스와 세션을 Projects 아래에 함께 나열하며, Managed 워크스페이스에는 Managed 라벨이 표시되고 실행 모드 탭은 없습니다. 새 작업은 선택한 워크스페이스나 대화를 따릅니다. 로컬 세션은 명령을 실행한 디렉토리를 사용하고, Managed 세션은 애플리케이션이 생성한 Workspaces 또는 명시적으로 가져온 로컬 프로젝트를 사용합니다. 둘 다 동일한 인증된 브라우저 origin을 사용하므로
두 번째 데몬 명령이나 브라우저 페이지가 필요하지 않습니다.

**Add workspace**에서 제출하기 전에 **Local (daemon)** 또는 **Managed (Managed Agent)**를
선택하십시오. 선택은 기본적으로 현재 대화의 서비스로 설정됩니다.
워크스페이스 행과 **New task**는 해당 서비스를 표시하며, 새 작업은 선택한 워크스페이스를 상속합니다. 데몬의 기존 SSH 워크스페이스 지원은 계속 사용 가능하며, Managed SSH 등록은 이 공유 대화 상자에 통합되지 않습니다.

터미널은 토큰 프래그먼트가 포함된 브라우저 URL을 출력합니다. 이를 로컬 비밀번호로 취급하십시오. 브라우저는 토큰을 사용하여 모든 API 요청을 인증하며, Java 서명 키와 내부 자격 증명은 브라우저에 전달되지 않습니다. 리스너는 루프백 전용입니다. 헤드리스 머신의 경우 `--open`을 생략하고 해당 머신에서 출력된 URL을 열거나 직접 관리하는 인증된 터널을 사용하십시오.

통합 애플리케이션은 현재 로컬 루프백 페이지를 지원합니다. 전체 shell의 기존 Mobile access / Local Control 항목은 Managed 부팅과 통합되지 않습니다. 페어링된 LAN 리스너는 이 통합 페이지를 열 수 없습니다. 모바일 공유는 별도의 통합이 필요하며, 일반 데몬은 기존 Local Control 동작을 유지합니다.

Harness는 일반 Qwen 모델 구성 및 제공자 자격 증명을 사용합니다.
첫 프롬프트를 보내기 전에 일반 Qwen CLI 설정을 사용하여 모델을 구성하십시오. Files와 Shell은 `default` 승인 모드를 사용하며, Managed UI는 승인이 필요한 작업 전에 승인을 요청합니다.

재시작 후 기존 세션을 계속하려면 이전 SQL writer 리스가 만료될 때까지 기다려야 할 수 있습니다(기본값 60초). 원래 데이터 디렉토리를 유지하고 해당 간격 후에 재시도하십시오. 프로세스를 재시작해도 소유권이 지워지지 않습니다.

## 워크스페이스 및 영구 데이터

기본 개인 데이터 디렉토리는 `<Qwen home>/managed-local`이며, 일반적으로
`~/.qwen/managed-local`입니다. 다음으로 재정의할 수 있습니다:

```sh
qwen serve --managed --managed-data-dir /absolute/private/data --open
```

디렉토리는 모든 Git worktree 외부에 있어야 합니다. 한 번에 하나의 런처만 사용할 수 있으며, Java도 배타적인 데이터베이스 파일 잠금을 유지합니다. 개인 서비스 포트와 자격 증명은 재시작 시에도 안정적으로 유지됩니다. 다른 애플리케이션이 점유한 개인 포트는 시작 실패를 유발합니다. 지속된 사실을 편집하기보다는 다른 새로운 데이터 디렉토리를 선택하거나 충돌하는 서비스를 중지하십시오.

시작 시 기존 멱등 Workspace API를 통해 애플리케이션 소유의 기본 워크스페이스와 OWNER 권한이 생성됩니다. 기존 로컬 프로젝트를 사용하려면
**Workspace → Choose existing directory**를 열고 절대 경로를 탐색하거나 입력한 후 폴더를 추가하십시오. 서비스가 부모를 등록하고 OWNER 접근 권한을 자동으로 부여하며 기존 파일을 그대로 유지합니다. 새 작업은 선택한 프로젝트에서 시작됩니다. 빈 워크스페이스를 생성할 수도 있습니다.

시작 디렉토리는 로컬 세션에서 계속 사용 가능하며 자동으로 가져오지지 않습니다. `--workspace`는 Managed 로컬 모드에서 지원되지 않습니다. UI에서 프로젝트를 선택하십시오. `.qwen-managed-storage.json` 유지 관리 마커는 Git worktree 외부에 유지됩니다. 편집, 삭제, 스태시 또는 커밋하지 마십시오. 가져온 프로젝트 파일은 개인 Managed 데이터 디렉토리 외부에 유지되며 자체 백업이 필요합니다.

로컬 세션 기록은 계속 일반 Qwen 스토리지를 사용합니다. Managed 데이터 디렉토리와 분리되어 있으며 Managed 전용 백업에 포함되지 않습니다.

`state.json`, `database/`, `runtime/`, `worker-home/` 및 `workspaces/`를 포함하여 완전한 데이터 디렉토리를 함께 보존하십시오. 파일시스템 백업을 만들기 전에 활성 작업을 완료 또는 취소하고, 세션을 닫은 후 애플리케이션을 중지하십시오. 내구성 있는 원래 worker는 제어 플랜 종료 후에도 생존할 수 있습니다. 모든 워크스페이스 writer가 중지되었는지 확인하십시오. 알 수 없는 실행은 오프라인 백업 전에 기존 원래 소유자 복구 절차가 필요합니다. 자격 증명, 데이터베이스, worker 기록 및 워크스페이스 ID는 동일한 설치에 속합니다. 하위 집합만 복원하면 복구가 제한될 수 있습니다. 시작 시 누락된 마커가 재생성되거나 손상된 자격 증명이 교체되지 않습니다. 서비스 진단은 `logs/`에 있습니다.

macOS는 네이티브 worker와 동일 부트 내구성 인수를 지원합니다. 신뢰할 수 있는 전체 호스트 재부팅 복구는 로컬 런처에서 비활성화되어 있습니다. 알 수 없는 도구 결과는 기존 원래 소유자 복구 규칙을 유지하며 무작위로 리플레이되지 않습니다. 이 모드는 자동 로그인 시간 시작을 추가하거나 노트북 절전을 방지하지 않습니다.

## 배포 빌드

이 명령은 최종 사용자가 아닌 릴리스 빌더를 위한 것입니다. Node 22+, Java 21 및 Maven 3.8.9+를 사용하여 동일한 체크아웃에서 CLI와 Java 서버를 빌드하십시오:

```sh
corepack pnpm install --frozen-lockfile
npm run build
npm run typecheck
npm run bundle
npm run prepare:package
mvn -f packages/sdk-java/qwencode/pom.xml -DskipTests -Dgpg.skip=true install
mvn -f packages/managed-agent-server/pom.xml verify
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --jre-home /verified/java-21-home \
  --out-dir /output/managed-runtime
```

런타임 빌더는 이 체크아웃의 일치하는 서버 JAR, Java 런타임 및 CLI 버전만 필요로 합니다. 빌드된 CLI 자산이나 Node 아카이브가 필요하지 않습니다. 기본적으로 CLI의 `dist/` 자산 외부인 `packages/managed-agent-server/target/managed-runtime`에 씁니다. 런타임 아카이브와 아카이브별 `.sha256` 파일을 생성합니다. 일반 CLI는 별도로 빌드/릴리스됩니다.

경량 런타임은 `--jre-home` 대신 `--without-jre`를 사용하여 동일한 서버 JAR로 빌드하십시오:

```sh
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --without-jre \
  --out-dir /output/managed-runtime
```

이것은 `qwen-code-managed-runtime-lite-darwin-arm64.tar.gz`와 체크섬을 생성합니다. 경량 빌더는 Java 입력이 필요하지 않습니다. 선택 사항인 완전한 배포의 경우:

```sh
npm run package:standalone -- \
  --target darwin-arm64 \
  --node-archive /verified/node-v22-darwin-arm64.tar.gz \
  --managed-server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --managed-jre-home /verified/java-21-home \
  --out-dir /output/managed-local
```

`bin/java`, `lib/modules`, `release` 및 `legal/`을 포함하는 완전한 추출된 런타임 홈을 사용하십시오. macOS JRE는 이를 `Contents/Home` 아래에 배치할 수 있습니다. 빌더는 Java 메이저 버전, OS 및 아키텍처를 확인하고 라이선스를 포함하며 서버 SHA-256과 일치하는 CLI 버전을 페이로드 매니페스트에 기록합니다. 완전한 독립 실행형은 `lib/managed-runtime/`을 사용하고 `SHA256SUMS`를 생성합니다. 빌드 전에 런타임 입력의 게시자 체크섬을 검증하십시오. Windows 및 Bun managed 실행은 거부되며, 런처는 Node 22+가 필요합니다.

명시적 런타임 위치의 경우,
`QWEN_MANAGED_LOCAL_RUNTIME_DIR=/absolute/managed-runtime`는 로컬 CLI가 `manifest.json`과 `server.jar`(번들 에디션의 경우 `jre/` 포함)를 포함하는 디렉토리를 직접 가리키도록 합니다.
이는 동일한 위치의 페이로드와 버전이 지정된 Qwen-home 설치보다 우선합니다. 기존 동일한 위치의 페이로드는 Qwen-home 설치보다 우선합니다. 선택한 유효하지 않거나 불완전한 페이로드는 다른 것으로 교체되지 않습니다. 누락된 명시적으로 선택된 페이로드, 잘못된 CLI 버전, 대상, Java 메이저 버전 또는 서버 체크섬은 자식이 시작되기 전에 실패합니다. 누락된 기본 캐시만 JAR 설치를 트리거하며, 기존 손상된 페이로드는 교체되지 않습니다. Maven은 애플리케이션 시작 시 실행되지 않습니다.

## 첫 사용 JAR 게시

`Release Managed server runtime` 워크플로는 이미 게시된 CLI 릴리스 태그에서 빌드되며, 해당 소스 수정의 SDK와 서버를 사용합니다. 수동 실행은 `main`에서 디스패치되어야 하며 기본값은 모의 실행입니다. CLI와 Java 모듈을 검증하고, `central-release` 프로필을 빌드하며, JAR과 체크섬을 워크플로 아티팩트로 유지하면서 공개 저장소를 변경하지 않습니다.

모의 실행을 검증한 후, 릴리스 운영자는 보호된 `production-release` 환경을 통해 `dry_run=false`로 동일한 태그를 실행할 수 있습니다. 워크플로는 서버 아티팩트 버전을 CLI 버전으로 설정하고, 소스, Javadoc 및 서명과 함께 `com.alibaba:qwen-managed-agent-server:<cli-version>`를 Maven Central에 게시하며, 동일한 기본 JAR과 `.sha256`을 해당 GitHub Release 및 기존 버전 OSS 미러를 통해 배포합니다. 보조 운영자 JAR은 Central 게시에 첨부되지 않습니다. 기존 자산은 바이트 단위로 비교되며 다른 내용으로 교체되지 않습니다. 게시된 CLI 릴리스 이벤트도 이 워크플로를 자동으로 실행합니다.

CLI는 Maven Central이 아닌 OSS/GitHub에서 다운로드합니다. SDK를 별도의 사용자 종속성으로 해결하지 않습니다. 실행 가능한 서버 JAR에 Java 종속성이 포함되어 있습니다. 런타임 자산은 첫 사용 다운로드가 성공하기 전에 정확한 CLI 릴리스에 대해 존재해야 합니다. 이 PR의 로컬 검증은 해당 자산을 게시하거나 프로덕션 릴리스 환경을 우회하지 않습니다.

소유권 경계 및 검증 기준에 대한 이중 언어 [디자인](../design/2026-10-20-managed-local-serve.md) 및 운영자 지향 MySQL 배포에 대한 [Java 서버 참조](../../packages/managed-agent-server/README.md)를 참조하십시오.