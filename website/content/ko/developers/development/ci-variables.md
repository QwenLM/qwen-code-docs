# CI 및 릴리스 변수

CI 및 릴리스 파이프라인의 여러 설정은 GitHub Actions 저장소 변수(`vars.*` 컨텍스트)로 노출되어 있어 운영자가 pull request를 열지 않고도 값을 조정할 수 있습니다. 이 페이지에서는 `.github/workflows/ci.yml`과 `.github/workflows/release.yml`에서 테스트 실행에 영향을 주는 변수와 그 기본값, 그리고 각 변수가 적용되는 위치를 정리합니다.

## 변수 설정

저장소 관리자는 **Settings → Secrets and variables → Actions → Variables**에서 이 값들을 설정합니다. 설정되지 않거나 비어 있는 변수는 워크플로 표현식의 폴백 값을 사용합니다. worker cap은 예약된 runner에서만 적용되며, 해당 변수가 설정되어 있더라도 마찬가지입니다.

워크플로 파일이 이 설정값들의 유일한 기준이며, 테스트 스위트는 워크플로 표현식을 바이트 단위로 고정합니다: `scripts/tests/package-scripts.test.js`는 `release.yml`의 공유 worker-cap 표현식(`QWEN_CI_VITEST_MAX_WORKERS`에 `ecs-qwen-` 가드)을 고정하고, `scripts/tests/no-ak-integration-ci.test.js`는 `ci.yml`의 worker-cap 표현식을 고정하며, `scripts/tests/release-workflow.test.js`는 `release.yml`의 재시도 및 워크스페이스 테스트 타임아웃 표현식을 고정합니다. `scripts/tests/package-scripts.test.js`는 두 워크플로 모두에 대해 문서화된 기본값과 워크플로 위치도 확인합니다. 이 가드는 docs-only 체크가 아닌 전체 프로파일 CI 레인(`test:scripts`)에서 실행되므로, 이 페이지에 국한된 수정은 pull request를 열기 전에 `npm run test:scripts`(또는 `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/package-scripts.test.js`)로 로컬에서 검증하십시오. 문서와 워크플로가 일치하지 않는 경우 워크플로를 기준으로 하고 같은 변경에서 이 페이지를 업데이트하십시오.

## 변수

| 변수                                       | 기본값  | 사용 위치               | 제어 내용                                                                                  |
| ------------------------------------------ | ------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `QWEN_CI_VITEST_RETRY`                     | `2`     | `ci.yml`                | 메인 CI 워크스페이스 및 스크립트 테스트 단계의 재시도 횟수                                |
| `QWEN_RELEASE_VITEST_RETRY`                | `2`     | `release.yml`           | 릴리스 워크스페이스 테스트 샤드의 재시도 횟수                                             |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`   | `45`    | `release.yml`           | 각 릴리스 워크스페이스 테스트 샤드의 잡 타임아웃                                          |
| `QWEN_CI_VITEST_MAX_WORKERS`               | `4`     | `ci.yml`, `release.yml` | 예약된 runner에서 메인 CI 단위 테스트 및 릴리스 워크스페이스/품질 테스트의 worker cap     |

### 재시도 횟수

`QWEN_CI_VITEST_RETRY`와 `QWEN_RELEASE_VITEST_RETRY`는 Vitest에 `--retry=<n>`으로 전달됩니다. 각각 메인 CI 테스트 단계(모든 워크스페이스의 `test:ci` - 해당 단계가 두 개의 동시 레인으로 실행 - 및 `npm run test:scripts:unit`)와 릴리스 레인(`npm run test:release:workspaces`)에서 사용됩니다. 두 레인은 독립적으로 조정할 수 있도록 별도의 변수를 사용합니다.

Vitest는 동일한 실행 내에서 실패한 테스트를 다시 실행합니다. 이는 간헐적인 경합 상황에 도움이 될 수 있지만, 재시도 예산 내에서 복구된 실패는 체크를 성공으로 만들고 flaky-rerun 추적기에 실패로 기록되지 않습니다. flaky 테스트 스위트를 덮기 위해 재시도를 사용하기보다 예산을 낮게 유지하십시오. 두 변수 모두 리터럴 값 `off`를 받을 수 있으며, 이 경우 `--retry=0`을 전달하는 대신 `--retry` 플래그 자체를 생략합니다(`--retry=0`은 워크스페이스 자체의 Vitest 설정보다 우선하여 의도적인 재시도 정책을 비활성화할 수 있습니다).

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