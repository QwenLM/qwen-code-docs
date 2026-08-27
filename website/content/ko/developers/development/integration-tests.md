# 통합 테스트

이 문서는 이 프로젝트에서 사용되는 통합 테스트 프레임워크에 대한 정보를 제공합니다.

## 개요

통합 테스트는 Qwen Code의 엔드투엔드 기능을 검증하도록 설계되었습니다. 제어된 환경에서 빌드된 바이너리를 실행하고 파일 시스템과 상호작용할 때 예상대로 동작하는지 확인합니다.

이 테스트는 `integration-tests` 디렉토리에 위치하며 커스텀 테스트 러너를 사용하여 실행됩니다.

## 테스트 실행

통합 테스트는 기본 `npm run test` 명령어의 일부로 실행되지 않습니다. `npm run test:integration:all` 스크립트를 사용하여 명시적으로 실행해야 합니다.

통합 테스트는 다음 단축 명령으로도 실행할 수 있습니다:

```bash
npm run test:e2e
```

## 특정 테스트 세트 실행

테스트 파일의 하위 집합을 실행하려면 `npm run <integration test command> <file_name1> ....`를 사용합니다. 여기서 &lt;integration test command&gt;는 `test:e2e` 또는 `test:integration*` 중 하나이고 `<file_name>`은 `integration-tests/` 디렉토리의 `.test.ts` 파일입니다. 예를 들어, 다음 명령은 `list_directory.test.ts`와 `write_file.test.ts`를 실행합니다:

```bash
npm run test:e2e list_directory write_file
```

### 이름으로 단일 테스트 실행

이름으로 단일 테스트를 실행하려면 `--test-name-pattern` 플래그를 사용합니다:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### 모든 테스트 실행

통합 테스트 전체를 실행하려면 다음 명령을 사용합니다:

```bash
npm run test:integration:all
```

### 샌드박스 매트릭스

`all` 명령은 `no sandboxing`, `docker`, `podman`에 대해 테스트를 실행합니다. 각 개별 유형은 다음 명령으로 실행할 수 있습니다:

```bash
npm run test:integration:sandbox:none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## 진단

통합 테스트 러너는 테스트 실패를 추적하는 데 도움이 되는 여러 진단 옵션을 제공합니다.

### 테스트 출력 유지

테스트 실행 중 생성된 임시 파일을 검사용으로 보존할 수 있습니다. 파일 시스템 작업 관련 문제를 디버깅하는 데 유용합니다.

테스트 출력을 유지하려면 `KEEP_OUTPUT` 환경 변수를 `true`로 설정합니다.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

출력이 유지되면 테스트 러너는 테스트 실행의 고유 디렉토리 경로를 출력합니다.

### 상세 출력

더 자세한 디버깅을 위해 `VERBOSE` 환경 변수를 `true`로 설정합니다.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

동일한 명령에서 `VERBOSE=true`와 `KEEP_OUTPUT=true`를 함께 사용하면 출력이 콘솔에 스트리밍되고 테스트의 임시 디렉토리 내 로그 파일에도 저장됩니다.

상세 출력은 로그의 출처를 명확히 식별할 수 있도록 포맷됩니다:

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## 린팅 및 포맷팅

코드 품질과 일관성을 보장하기 위해 통합 테스트 파일은 메인 빌드 프로세스의 일부로 린팅됩니다. 린터와 자동 수정기를 수동으로 실행할 수도 있습니다.

### 린터 실행

린팅 오류를 확인하려면 다음 명령을 실행합니다:

```bash
npm run lint
```

`:fix` 플래그를 포함하면 수정 가능한 린팅 오류를 자동으로 수정합니다:

```bash
npm run lint:fix
```

## 디렉토리 구조

통합 테스트는 `.integration-tests` 디렉토리 안에 각 테스트 실행에 대한 고유 디렉토리를 생성합니다. 이 디렉토리 안에서 각 테스트 파일에 대해 하위 디렉토리가 생성되고, 그 안에 각 개별 테스트 케이스에 대해 하위 디렉토리가 생성됩니다.

이 구조 덕분에 특정 테스트 실행, 파일 또는 케이스의 아티팩트를 쉽게 찾을 수 있습니다.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.ts/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## 지속적 통합

통합 테스트가 항상 실행되도록 `.github/workflows/e2e.yml`에 GitHub Actions 워크플로가 정의되어 있습니다. 이 워크플로는 `main` 브랜치에 대한 풀 리퀘스트 또는 풀 리퀘스트가 병합 큐에 추가될 때 통합 테스트를 자동으로 실행합니다.

워크플로는 다양한 샌드박스 환경에서 테스트를 실행하여 각 환경에서 Qwen Code가 테스트되도록 합니다:

- `sandbox:none`: 샌드박스 없이 테스트 실행.
- `sandbox:docker`: Docker 컨테이너에서 테스트 실행.
- `sandbox:podman`: Podman 컨테이너에서 테스트 실행.
