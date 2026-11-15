# CI 및 릴리스 변수

CI 및 릴리스 파이프라인의 여러 설정은 GitHub Actions 저장소 변수(`vars.*` 컨텍스트)로 노출되어 있어 운영자가 pull request를 열지 않고도 값을 조정할 수 있습니다. 이 페이지에서는 `.github/workflows/ci.yml`과 `.github/workflows/release.yml`에서 테스트 실행에 영향을 주는 변수와 그 기본값, 그리고 각 변수가 적용되는 위치를 정리합니다.

## 변수 설정

저장소 관리자는 **Settings → Secrets and variables → Actions → Variables**에서 이 값들을 설정합니다. 설정되지 않거나 비어 있는 변수는 워크플로 표현식의 폴백 값을 사용합니다. worker cap은 예약된 runner에서만 적용되며, 해당 변수가 설정되어 있더라도 마찬가지입니다.

워크플로 파일이 이 설정값들의 유일한 기준이며, 테스트 스위트는 워크플로 표현식을 바이트 단위로 고정합니다: `scripts/tests/package-scripts.test.js`는 `release.yml`의 공유 worker-cap 표현식(`QWEN_CI_VITEST_MAX_WORKERS`에 `ecs-qwen-` 가드)을 고정하고, `scripts/tests/no-ak-integration-ci.test.js`는 `ci.yml`의 worker-cap 표현식을 고정하며, `scripts/tests/release-workflow.test.js`는 `release.yml`의 재시도 및 워크스페이스 테스트 타임아웃 표현식을 고정합니다. `scripts/tests/package-scripts.test.js`는 두 워크플로 모두에 대해 문서화된 기본값과 워크플로 위치도 확인합니다. 이 가드는 docs-only 체크가 아닌 전체 프로파일 CI 레인(`test:scripts`)에서 실행되므로, 이 페이지에 국한된 수정은 pull request를 열기 전에 `npm run test:scripts`(또는 `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/package-scripts.test.js`)로 로컬에서 검증하십시오. 문서와 워크플로가 일치하지 않는 경우 워크플로를 기준으로 하고 같은 변경에서 이 페이지를 업데이트하십시오.

## 변수

| 변수                                       | 기본값  | 사용 위치               | 제어 내용                                                                                  |
| ------------------------------------------ | ------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `QWEN_CI_VITEST_RETRY`                     | `2`     | `ci.yml`                | 메인 CI 워크스페이스 및 스크립트 테스트 단계의 재시도 횟수                                |
| `QWEN_CI_HOST_LOAD_MAX_RATIO`              | `2.0`   | `ci.yml`                | 단위 테스트 스위트 전에 자체 호스팅 Linux 호스트를 거부하는 CPU당 부하 상한               |
| `QWEN_CI_RPC_RETRY`                        | `1`     | `ci.yml`                | Vitest의 worker RPC 타임아웃에서만 실패한 all-green 워크스페이스 스위트의 재실행          |
| `QWEN_RELEASE_VITEST_RETRY`                | `2`     | `release.yml`           | 릴리스 워크스페이스 테스트 샤드의 재시도 횟수                                             |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`   | `45`    | `release.yml`           | 각 릴리스 워크스페이스 테스트 샤드의 잡 타임아웃                                          |
| `QWEN_CI_VITEST_MAX_WORKERS`               | `4`     | `ci.yml`, `release.yml` | 예약된 runner에서 메인 CI 단위 테스트 및 릴리스 워크스페이스/품질 테스트의 worker cap     |

### 재시도 횟수

`QWEN_CI_VITEST_RETRY`와 `QWEN_RELEASE_VITEST_RETRY`는 Vitest에 `--retry=<n>`으로 전달됩니다. 각각 메인 CI 테스트 단계(모든 워크스페이스의 `test:ci` - 해당 단계가 두 개의 동시 레인으로 실행 - 및 `npm run test:scripts:unit`)와 릴리스 레인(`npm run test:release:workspaces`)에서 사용됩니다. 두 레인은 독립적으로 조정할 수 있도록 별도의 변수를 사용합니다.

Vitest는 동일한 실행 내에서 실패한 테스트를 다시 실행합니다. 이는 간헐적인 경합 상황에 도움이 될 수 있지만, 재시도 예산 내에서 복구된 실패는 체크를 성공으로 만들고 flaky-rerun 추적기에 실패로 기록되지 않습니다. flaky 테스트 스위트를 덮기 위해 재시도를 사용하기보다 예산을 낮게 유지하십시오. 두 변수 모두 리터럴 값 `off`를 받을 수 있으며, 이 경우 `--retry=0`을 전달하는 대신 `--retry` 플래그 자체를 생략합니다(`--retry=0`은 워크스페이스 자체의 Vitest 설정보다 우선하여 의도적인 재시도 정책을 비활성화할 수 있습니다).

### 경합 호스트의 Worker RPC 타임아웃

`QWEN_CI_RPC_RETRY`는 `--retry`와 다른 설정입니다: 전체 워크스페이스 스위트를 재실행하며, 해당 스위트의 자체 보고서에 실패한 테스트가 없고 Vitest의 worker-to-main RPC 예산(`Timeout calling "onTaskUpdate"`)이 유일한 미처리 오류인 경우에만 적용됩니다. 이 풀에서 이러한 형태는 회귀가 아닌 호스트 경합입니다 — main 실행 43018456551과 43016357976 모두 `packages/channels/github`에서 902개 중 902개 테스트가 통과했음에도 실패했습니다. 첫 번째 시도는 npm의 자체 배치 호출을 유지하며, npm이 실패로 지정한 워크스페이스만 각각 단독으로 재실행됩니다.

릴리스 레인은 이미 자체 샤드에서 동일한 통과를 허용합니다(`.github/scripts/run-release-workspace-tests.sh`). 증거 규칙은 `scripts/tests/release-workflow.test.js`가 그곳에서 고정하는 규칙입니다: 실행이 통과 카운트에 도달해야 하고, 시그널로 종료되지 않았어야 하며, Vitest의 자체 미처리 오류 카운트가 보고서에 포함된 전송 타임아웃 수와 일치해야 합니다. 카운트이지 크래시 헤더가 아닙니다 — 헤더는 생산자가 선택하므로 헤더에 대한 패턴은 불완전합니다. `Errors` 수치는 전체 보고서의 합계인 반면, 전송 수치는 Vitest의 `Unhandled Errors` 섹션 내부에서만 계산됩니다 — 테스트의 콘솔 출력도 컬럼 0에 에코되므로 인쇄된 복사본은 이를 이동시키면 안 됩니다 — 그리고 해당 섹션 내에서 오류의 자체 헤더 라인(컬럼 0의 `Error: [vitest-worker]: Timeout calling`)과 일치하며, 접두사를 인용하는 메시지, 스택 또는 코드 프레임과는 일치하지 않습니다. 따라서 한 시도의 성공 카운트가 이후 시도의 크래시를 덮을 수 없습니다.

Linux 레인은 의도적으로 미처리 오류를 치명적으로 유지합니다(`scripts/tests/unit-vitest-configs.test.ts`, #10438). 따라서 이를 무시하지 않습니다: 실패한 테스트, 두 번째 미처리 오류, 또는 보고 전에 종료된 프로세스는 재시도를 거부합니다. 두 시도를 모두 초과하는 정지는 여전히 실패합니다. `0`으로 설정하면 첫 번째 실패를 그대로 유지합니다.

**카운트가 유일한 한계입니다.** 재실행에는 시간 조건이 없습니다: 이 레인의 이전 개정에서는 테스트 단계 예산의 절반 미만만 남았을 때 재실행을 건너뛰었지만, 해당 가드는 수정되지 않고 제거되었습니다. 배치의 경과 시간을 두 번 추가하여 예산의 74%에서 재실행을 거부했으며, 레인 스크립트 내부에서 올바른 버전을 사용할 수 없습니다 — 단계는 스크립트보다 먼저 시작됩니다(`chown -R`, `mktemp`, 디스크 샘플러). 따라서 스크립트 자체의 `SECONDS`는 단계의 클록이 아니며, 워크플로에서 단계의 시작 시간을 전달하는 것은 피하려는 하나의 잘림보다 더 많은 새로운 표면이 됩니다. 허용된 비용: 너무 늦게 발행된 재실행은 단계의 `timeout-minutes: 45`에 의해 종료될 수 있습니다. 그렇게 되면 잡이 실패하고 첫 번째 시도의 로그는 여전히 남아 있습니다. 첫 번째 시도는 파일로 tee되기 때문입니다 — 4분의 1의 예산이 사용되지 않은 채로 재시도를 버리는 거부가 아닌, 증거를 유지하는 잘림입니다.

### 호스트 부하 승인

`QWEN_CI_HOST_LOAD_MAX_RATIO`는 단위 테스트 샤드의 `Host load gate (self-hosted)` 단계의 CPU당 부하 상한입니다. 이 게이트는 `/proc/loadavg`에서 5분 부하 평균을 `nproc`에 대해 샘플링하고, 10초 간격으로 최대 6개의 샘플을 대기하며, 하나의 샘플이 상한을 초과하면 즉시 잡을 승인합니다. 여전히 상한 이상인 호스트는 스위트 시작 전에 단계를 실패시킵니다.

게이트는 잡을 이동할 수 없습니다: GitHub가 이미 배치했으며, 재실행만 다른 호스트로 배치합니다. 변경하는 것은 잡이 실패하는 시점입니다. 옆의 디스크 바닥 게이트는 사용 가능한 바이트와 inode로 승인하며, 이는 CPU 경합에 대해 아무것도 말하지 않습니다. 2026-11-11에 hk1 풀은 64-CPU 호스트를 부하 53-98에서 28-140개의 동시 Vitest 프로세스와 함께 실행했으며, 이 점유율이 60초 테스트 예산, Vitest의 worker-to-main RPC 예산, 테스트 단계의 전체 45분 예산을 만료시키는 것입니다. 거부하는 것은 이미 지출된 설치 비용을 지불하고 해당 예산을 반환하며, 어떤 브랜치도 작성하지 않은 테스트 실패 대신 재실행하라는 메시지와 함께 반환합니다.

**게이트는 예측자가 아니라 안전장치입니다.** 기본값 `2.0`은 2026-11-11에 실패한 샤드와 같은 시간대에 같은 풀에서 통과한 4개 샤드의 CPU당 5분 부하를 기준으로 조정됩니다:

| 샤드 | 호스트 | 진입 시 | 중앙값 | 피크 | 결과                   |
| ---- | ------ | ------- | ------ | ---- | ---------------------- |
| 2/2  | hk1-4  | 1.34    | 1.43   | 1.54 | worker RPC 타임아웃    |
| 2/2  | hk1-30 | 1.45    | 1.42   | 1.54 | worker RPC 타임아웃    |
| 2/2  | hk1-29 | 0.85    | 1.42   | 1.54 | 45분 단계 타임아웃     |
| 1/2  | hk1-7  | 0.94    | 1.40   | 1.49 | 통과                   |
| 2/2  | hk5-27 | 1.03    | 1.03   | 1.19 | 통과                   |
| 1/2  | hk2-32 | 0.75    | 0.97   | 1.18 | 통과                   |
| 1/2  | hk3-28 | 0.48    | 0.67   | 0.87 | 통과                   |

범위가 겹칩니다. 통과한 호스트는 1.49에 도달했고, 실패한 호스트는 0.85에서 시작했습니다 — 점유율이 실행 중에 증가했으며, 실패한 세 호스트 중 두 개만 스위트 시작 시 이미 경합 중이었습니다. 진입 시점 임계값이 이들을 구분하지 못하므로, 경합 중인 두 개를 잡을 만큼 충분히 타이트한 상한은 명백히 통과하는 호스트도 거부합니다. `2.0`은 스위트를 완료한 호스트에서 측정된 모든 판독값 위에 있습니다: 이 샘플들이 생존하지 못한 호스트를 거부하며, 표의 어떤 사건에서도 발동되지 않았을 것입니다. 타이트하게 하면 잘못된 거부를 생성할 것으로 예상됩니다; 더 많이 올리면 게이트가 비활성화됩니다.

해당 표의 RPC flake는 다른 문제이며 이 게이트는 그 수정이 아닙니다: 결정에는 스위트의 자체 보고서가 필요하며, 이는 스위트 실행 전에는 존재하지 않습니다. #16945는 정확히 그 형태에 대한 레인 레벨 재실행을 추가합니다 — 유일한 미처리 오류가 worker RPC 타임아웃인 all-green 보고서입니다. 둘은 독립적이며 별도로 조정하거나 비활성화할 수 있습니다.

상한은 절대 부하가 아닌 비율입니다. 풀이 호스트 크기를 혼합하기 때문입니다. 플릿이 크기 조정 중일 때 모든 호스트를 승인하려면 `off`로 설정하십시오. 게이트는 자체 호스팅 Linux에서만 실행됩니다. GitHub 호스팅 및 macOS 레인은 영향을 받지 않으며, 읽을 수 없는 CPU 카운트나 부하 평균, 또는 누락된 `awk`는 레인을 차단하는 대신 경고와 함께 잡을 승인합니다. 잘못된 임계값은 게이트를 조용히 비활성화하는 대신 구성 오류로 실패합니다.

### 워크스페이스 테스트 타임아웃

`QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`는 릴리스 파이프라인의 세 개 `workspace_tests` 샤드 각각에 대한 잡 레벨 `timeout-minutes`를 설정합니다. 이 타임아웃은 테스트 스위트 자체가 아니라 예약된 호스트의 부하 정도에 따라 크기를 결정하므로, 테스트 회귀를 가정하기보다 호스트에 경합이 있을 때 값을 올리십시오.

### 자체 호스팅 runner의 Vitest worker cap

`QWEN_CI_VITEST_MAX_WORKERS`는 아래 나열된 단계에서 Vitest 프로세스 수를 제한합니다(`VITEST_MAX_THREADS` / `VITEST_MAX_FORKS`, 대응되는 최솟값은 `1`로 강제됨). 이름이 `ecs-qwen-`으로 시작하는 예약된 자체 호스팅 runner에 적용됩니다. 이 변수는 메인 CI 워크스페이스 테스트 단계와 릴리스의 `workspace_tests` 및 `quality_scripts` 단계에서만 내보내집니다. CI 및 릴리스 워크플로에서 동일한 예약된 풀을 사용하는 다른 Vitest 통합 테스트는 이 변수를 사용하지 않고 자체 Vitest 제한을 사용합니다. web-shell E2E 스모크는 ARM64 풀에서 자체 Playwright worker 2개로 실행되므로 이 cap이 적용되지 않습니다. GitHub 호스팅 runner에서는 이 변수가 무시되고 Vitest가 자체 기본값을 사용합니다.

각 Vitest 실행은 자체적으로 cap을 적용합니다. 메인 CI 워크스페이스 테스트 단계는 두 개의 레인을 동시에 실행합니다(`.github/scripts/ci/run-unit-test-lanes.sh`): 메인 레인은 CLI와 코어 스위트를 cap으로 실행하고, 사이드 레인은 다른 워크스페이스의 스위트와 `npm run test:scripts:unit`을 cap의 절반(최소 1)으로 실행하므로, 피크 시 이 단계는 cap과 그 절반의 합만큼 실행됩니다. GitHub 호스팅 runner에서 사이드 레인의 Vitest 실행은 2개의 worker를 사용합니다.

이 단계는 두 개의 샤드(`Linux unit tests (shard N/2)`)로 실행되며, 각 샤드는 모든 Vitest 실행에 `--shard=N/2`를 전달합니다. 샤드도 자체적으로 cap을 적용하므로, 풀에서는 최대 두 개의 이런 단계를 동시에 볼 수 있습니다. 이들은 `prepare` 빌드 없이 설치하며 `test_build`가 한 번 빌드한 트리를 풀어 사용합니다. `Test (ubuntu-latest, Node 22.x)`는 빌드와 모든 샤드가 통과될 때만 성공합니다.

`test_build`는 유일하게 빌드를 수행하는 잡입니다. `scripts/ci-build-cache.mjs`를 통해 빌드합니다: pull request는 베이스 커밋의 `main` 푸시가 저장한 빌드를 복원하고(`key --at <base>`), 최신 캐시된 빌드로 폴백하며, 입력이 변경된 워크스페이스만 재빌드합니다: 워크스페이스의 추적 파일 중 테스트를 제외한 파일, 루트 파일, `scripts/tests/` 외부의 `patches/` 및 `scripts/`, 그리고 의존하는 워크스페이스입니다. `main`으로의 푸시는 항상 처음부터 빌드하고 해당 빌드를 저장합니다. 캐시 키에 CPU 아키텍처가 포함되지 않습니다: x64 레이블 풀에 ARM64 호스트가 포함되어 있으며, 아키텍처별 유일한 산출물인 번들의 opentui 네이티브 라이브러리는 복원 및 풀기 후마다 호스트용으로 다시 복사됩니다(`ci-build-cache.mjs host-assets`).

단위 테스트 샤드, 두 개의 `Integration Tests (no-AK, shard N/2)` 샤드, 두 개의 web-shell 스모크 샤드 모두 이 단일 트리를 풀어 사용합니다. `test_build`는 이를 읽는 체크도 실행합니다: serve fast-path 번들 클로저, 코어 서브패스 익스포트, 설정 스키마 최신성 체크이며, 이는 이전에 `Lint & Static`이 빌드하던 것입니다. `Integration Tests (no-AK, No Sandbox)`는 빌드와 모든 통합 샤드가 통과될 때만 성공합니다. Draft pull request는 통합 샤드와 브라우저 스모크를 건너뛰며, ready for review로 표시하면 이들을 포함하는 실행이 시작됩니다. `packages/managed-agent-server/` 또는 `packages/sdk-java/`에만 국한된 변경(TypeScript 스위트가 읽는 파일 제외)은 `java_only`로 분류됩니다: `Lint & Static`은 해당 페이로드와 해당 트리를 명명하는 `scripts/tests` 스위트를 실행하고, TypeScript 빌드 및 테스트 레인은 건너뜁니다.

### 테스트 실행 외의 관련 변수

`release.yml`은 또한 `QWEN_RELEASE_STATIC_TIMEOUT_MINUTES`(기본값 `60`, `quality_static` lint 레인 제어)와 `QWEN_RELEASE_BUILD_TIMEOUT_MINUTES`(기본값 `45`, `quality_build` 패키징 레인 제어)를 노출합니다. 이 변수들은 테스트 실행이 아닌 정적 린팅 및 아티팩트 빌드를 제어하므로 이 페이지의 테스트 실행 범위 밖에 있습니다.