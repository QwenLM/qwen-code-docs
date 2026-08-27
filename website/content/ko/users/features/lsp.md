# Language Server Protocol (LSP) 지원

Qwen Code는 네이티브 Language Server Protocol (LSP) 지원을 제공하여 정의 이동, 참조 찾기, 진단 및 코드 액션과 같은 고급 코드 인텔리전스 기능을 가능하게 합니다. 이 통합을 통해 AI 에이전트가 코드를 더 깊이 이해하고 더 정확한 지원을 제공할 수 있습니다.

## 개요

Qwen Code의 LSP 지원은 코드를 이해하는 언어 서버에 연결하여 작동합니다. `.lsp.json`(또는 확장)을 통해 서버를 구성하면, Qwen Code가 이를 시작하고 다음을 위해 사용할 수 있습니다:

- 심볼 정의로 이동
- 심볼에 대한 모든 참조 찾기
- 호버 정보 가져오기 (문서, 타입 정보)
- 진단 메시지 보기 (오류, 경고)
- 코드 액션 접근 (빠른 수정, 리팩토링)
- 호출 계층 분석

## 빠른 시작

LSP는 Qwen Code의 실험적 기능입니다. 활성화하려면 `--experimental-lsp` 명령줄 플래그를 사용하세요:

```bash
qwen --experimental-lsp
```

LSP 서버는 구성 기반입니다. Qwen Code가 시작하려면 `.lsp.json`(또는 확장)에 정의해야 합니다.

### 사전 준비 사항

프로그래밍 언어의 언어 서버가 설치되어 있어야 합니다:

| 언어                  | 언어 서버                 | 설치 명령어                                                                    |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server| `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                     | `pip install python-lsp-server`                                                |
| Go                    | gopls                     | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer             | [설치 가이드](https://rust-analyzer.github.io/manual.html#installation)         |
| C/C++                 | clangd                    | 패키지 관리자를 통해 LLVM/clangd 설치                                           |
| Java                  | jdtls                     | JDTLS 및 JDK 설치                                                              |

## 구성

### .lsp.json 파일

프로젝트 루트의 `.lsp.json` 파일을 사용하여 언어 서버를 구성할 수 있습니다. 각 최상위 키는 언어 식별자이며, 값은 서버 구성 객체입니다.

**기본 형식:**

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact"
    }
  }
}
```

### C/C++ (clangd) 구성

의존성:

- clangd (LLVM)가 설치되어 PATH에서 사용 가능해야 합니다.
- 정확한 결과를 위해 컴파일 데이터베이스(`compile_commands.json`) 또는 `compile_flags.txt`가 필요합니다.

예시:

```json
{
  "cpp": {
    "command": "clangd",
    "args": [
      "--background-index",
      "--clang-tidy",
      "--header-insertion=iwyu",
      "--completion-style=detailed"
    ]
  }
}
```

### Java (jdtls) 구성

의존성:

- JDK가 설치되어 PATH에서 사용 가능해야 합니다 (`java`).
- JDTLS가 설치되어 PATH에서 사용 가능해야 합니다 (`jdtls`).

예시:

```json
{
  "java": {
    "command": "jdtls",
    "args": ["-configuration", ".jdtls-config", "-data", ".jdtls-workspace"]
  }
}
```

### 구성 옵션

#### 필수 필드

| 옵션      | 타입   | 설명                                                                                                                                        |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | LSP 서버를 시작하는 명령어. `PATH`를 통해 해결되는 단독 명령어 이름(예: `clangd`)과 절대 경로(예: `/opt/llvm/bin/clangd`)를 지원합니다.         |

#### 선택 필드

| 옵션                    | 타입     | 기본값    | 설명                                                |
| ----------------------- | -------- | --------- | --------------------------------------------------- |
| `args`                  | string[] | `[]`      | 명령줄 인수                                         |
| `transport`             | string   | `"stdio"` | 전송 타입: `stdio`, `tcp` 또는 `socket`             |
| `env`                   | object   | -         | 환경 변수                                           |
| `initializationOptions` | object   | -         | LSP 초기화 옵션                                     |
| `settings`              | object   | -         | `workspace/didChangeConfiguration`를 통한 서버 설정 |
| `extensionToLanguage`   | object   | -         | 파일 확장자를 언어 식별자에 매핑                     |
| `workspaceFolder`       | string   | -         | 작업 공간 폴더 오버라이드 (프로젝트 루트 내여야 함)  |
| `startupTimeout`        | number   | `10000`   | 시작 타임아웃 (밀리초)                               |
| `shutdownTimeout`       | number   | `5000`    | 종료 타임아웃 (밀리초)                               |
| `restartOnCrash`        | boolean  | `false`   | 크래시 시 자동 재시작                                |
| `maxRestarts`           | number   | `3`       | 최대 재시작 시도 횟수                                |
| `trustRequired`         | boolean  | `true`    | 신뢰할 수 있는 작업 공간 필요                        |

### TCP/Socket 전송

TCP 또는 Unix socket 전송을 사용하는 서버의 경우:

```json
{
  "remote-lsp": {
    "transport": "tcp",
    "socket": {
      "host": "127.0.0.1",
      "port": 9999
    },
    "extensionToLanguage": {
      ".custom": "custom"
    }
  }
}
```

## 사용 가능한 LSP 작업

Qwen Code는 통합 `lsp` 도구를 통해 LSP 기능을 노출합니다. 사용 가능한 작업은 다음과 같습니다:

위치 기반 작업(`goToDefinition`, `findReferences`, `hover`, `goToImplementation` 및 `prepareCallHierarchy`)은 정확한 `filePath` + `line` + `character` 위치가 필요합니다. 정확한 위치를 모르면 먼저 `workspaceSymbol` 또는 `documentSymbol`을 사용하여 심볼을 찾으세요.

### 코드 탐색

#### 정의로 이동

심볼이 정의된 위치를 찾습니다.

```
Operation: goToDefinition
Parameters:
  - filePath: 파일 경로
  - line: 라인 번호 (1-based)
  - character: 컬럼 번호 (1-based)
```

#### 참조 찾기

심볼에 대한 모든 참조를 찾습니다.

```
Operation: findReferences
Parameters:
  - filePath: 파일 경로
  - line: 라인 번호 (1-based)
  - character: 컬럼 번호 (1-based)
  - includeDeclaration: 선언 자체 포함 (선택)
```

#### 구현으로 이동

인터페이스나 추상 메서드의 구현을 찾습니다.

```
Operation: goToImplementation
Parameters:
  - filePath: 파일 경로
  - line: 라인 번호 (1-based)
  - character: 컬럼 번호 (1-based)
```

### 심볼 정보

#### 호버

심볼에 대한 문서 및 타입 정보를 가져옵니다.

```
Operation: hover
Parameters:
  - filePath: 파일 경로
  - line: 라인 번호 (1-based)
  - character: 컬럼 번호 (1-based)
```

#### 문서 심볼

문서의 모든 심볼을 가져옵니다.

```
Operation: documentSymbol
Parameters:
  - filePath: 파일 경로
```

#### 작업 공간 심볼 검색

작업 공간 전체에서 심볼을 검색합니다.

```
Operation: workspaceSymbol
Parameters:
  - query: 검색 쿼리 문자열
  - limit: 최대 결과 수 (선택)
```

### 호출 계층

#### 호출 계층 준비

위치의 호출 계층 항목을 가져옵니다.

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: 파일 경로
  - line: 라인 번호 (1-based)
  - character: 컬럼 번호 (1-based)
```

#### 들어오는 호출

주어진 함수를 호출하는 모든 함수를 찾습니다.

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: prepareCallHierarchy의 항목
```

#### 나가는 호출

주어진 함수가 호출하는 모든 함수를 찾습니다.

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: prepareCallHierarchy의 항목
```

### 진단

#### 파일 진단

파일의 진단 메시지(오류, 경고)를 가져옵니다.

```
Operation: diagnostics
Parameters:
  - filePath: 파일 경로
```

#### 작업 공간 진단

작업 공간 전체의 모든 진단 메시지를 가져옵니다.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: 최대 결과 수 (선택)
```

### 코드 액션

#### 코드 액션 가져오기

위치에서 사용 가능한 코드 액션(빠른 수정, 리팩토링)을 가져옵니다.

```
Operation: codeActions
Parameters:
  - filePath: 파일 경로
  - line: 시작 라인 번호 (1-based)
  - character: 시작 컬럼 번호 (1-based)
  - endLine: 끝 라인 번호 (선택, 기본값 line)
  - endCharacter: 끝 컬럼 (선택, 기본값 character)
  - diagnostics: 액션을 가져올 진단 (선택)
  - codeActionKinds: 액션 종류로 필터링 (선택)
```

코드 액션 종류:

- `quickfix` - 오류/경고에 대한 빠른 수정
- `refactor` - 리팩토링 작업
- `refactor.extract` - 함수/변수로 추출
- `refactor.inline` - 함수/변수 인라인
- `source` - 소스 코드 액션
- `source.organizeImports` - import 정리
- `source.fixAll` - 자동 수정 가능한 모든 이슈 수정

## 보안

LSP 서버는 기본적으로 신뢰할 수 있는 작업 공간에서만 시작됩니다. 언어 서버는 사용자 권한으로 실행되며 코드를 실행할 수 있기 때문입니다.

### 신뢰 제어

- **신뢰할 수 있는 작업 공간**: 구성된 경우 LSP 서버가 시작됩니다
- **신뢰할 수 없는 작업 공간**: 서버 구성에서 `trustRequired: false`를 설정하지 않으면 LSP 서버가 시작되지 않습니다

작업 공간을 신뢰 가능한 것으로 표시하려면 `/trust` 명령어를 사용하세요.

### 서버별 신뢰 오버라이드

구성에서 특정 서버의 신뢰 요구 사항을 오버라이드할 수 있습니다:

```json
{
  "safe-server": {
    "command": "safe-language-server",
    "args": ["--stdio"],
    "trustRequired": false,
    "extensionToLanguage": {
      ".safe": "safe"
    }
  }
}
```

## 문제 해결

### 서버가 시작되지 않음

1. **`--experimental-lsp` 플래그 확인**: Qwen Code 시작 시 플래그를 사용하고 있는지 확인하세요
2. **서버 설치 확인**: 명령어를 수동으로 실행하여 확인하세요 (예: `clangd --version`)
3. **명령어 확인**: 서버 바이너리가 시스템 `PATH`에 있거나 절대 경로로 지정되어야 합니다 (예: `/opt/llvm/bin/clangd`). 작업 공간을 벗어나는 상대 경로는 차단됩니다
4. **작업 공간 신뢰 확인**: LSP를 위해 작업 공간이 신뢰되어야 합니다 (`/trust` 사용)
5. **로그 확인**: `--debug`로 Qwen Code를 시작한 후 디버그 로그에서 LSP 관련 항목을 검색하세요 (아래 디버깅 섹션 참조)
6. **프로세스 확인**: `ps aux | grep <server-name>`을 실행하여 서버 프로세스가 실행 중인지 확인하세요

### 느린 성능

1. **큰 프로젝트**: `node_modules` 및 기타 큰 디렉토리를 제외하는 것을 고려하세요
2. **서버 타임아웃**: 느린 서버의 경우 서버 구성에서 `startupTimeout`을 증가시키세요

### 결과 없음

1. **서버 준비 안 됨**: 서버가 아직 인덱싱 중일 수 있습니다. clangd를 사용하는 C/C++ 프로젝트의 경우, `--background-index`가 인수에 있고 `compile_commands.json`(또는 `compile_flags.txt`)이 프로젝트 루트나 부모 디렉토리에 있는지 확인하세요. 빌드 하위 디렉토리에 있으면 `--compile-commands-dir=<path>`를 사용하세요
2. **파일이 저장되지 않음**: 서버가 변경 사항을 감지하도록 파일을 저장하세요
3. **잘못된 언어**: 해당 언어에 대해 올바른 서버가 실행 중인지 확인하세요
4. **프로세스 확인**: `ps aux | grep <server-name>`을 실행하여 서버가 실제로 실행 중인지 확인하세요

### 디버깅

LSP에는 별도의 디버그 플래그가 없습니다. Qwen Code의 일반 디버그 모드와 LSP 기능 플래그를 함께 사용하세요:

```bash
qwen --experimental-lsp --debug
```

디버그 로그는 세션 디버그 로그 디렉토리에 기록됩니다. LSP 관련 항목을 확인하려면:

```bash
# 기본 런타임 디렉토리
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# 또는 ripgrep 없이:
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# QWEN_RUNTIME_DIR이 구성된 경우
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

유용한 항목:

- `[LSP] ...`: 네이티브 LSP 서비스 및 서버 관리자가 내보낸 로그.
- `[CONFIG] Native LSP status after discovery: ...`: 세션에 대해 발견된 LSP 서버 구성.
- `[CONFIG] Native LSP status after startup: ...`: 서버 시작 결과, 준비/실패 수 포함.
- `[STATUS] LSP status snapshot for /status: ...`: 디버그 모드에서 `/status` 실행 시 출력되는 상태 스냅샷.

CLI에서 `/status`를 실행하여 짧은 LSP 요약을 볼 수도 있습니다:

```text
LSP: disabled
LSP: enabled, 1/1 ready
LSP: enabled, 0/1 ready (1 failed)
LSP: enabled, no servers configured
LSP: enabled, status unavailable
```

서버별 세부 정보는 `/lsp`를 실행하세요:

```text
**LSP Server Status**

| Server | Command | Languages | Status |
|--------|---------|-----------|--------|
| clangd | `clangd` | c, cpp | READY |
| pyright | `pyright-langserver` | python | FAILED - startup failed |
```

찾아볼 일반적인 오류 메시지:

```text
command path is unsafe        -> 상대 경로가 작업 공간을 벗어남, 절대 경로 사용 또는 PATH에 추가
command not found             -> 서버 바이너리가 설치되지 않았거나 PATH에 없음
requires trusted workspace    -> 먼저 /trust 실행
LSP connection closed         -> 서버가 시작되었지만 응답 전에 종료되거나 stdio를 닫음
```

clangd 시작 실패의 경우 프로젝트 루트에서 직접 서버를 확인하세요:

```bash
clangd --version
clangd --check=/path/to/file.cpp --log=verbose
```

C/C++ 프로젝트는 보통 `compile_commands.json` 또는 `compile_flags.txt`를 제공해야 합니다. 컴파일 데이터베이스가 빌드 디렉토리에 있으면 clangd에 전달하세요:

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # 또는 typescript-language-server, jdtls 등
```

## 확장 LSP 구성

확장은 `plugin.json`의 `lspServers` 필드를 통해 LSP 서버 구성을 제공할 수 있습니다. 인라인 객체 또는 `.lsp.json` 파일의 경로일 수 있습니다. Qwen Code는 확장이 활성화될 때 이러한 구성을 로드합니다. 형식은 프로젝트 `.lsp.json` 파일에서 사용되는 동일한 언어 키 레이아웃입니다.

## 모범 사례

1. **언어 서버를 전역으로 설치**: 모든 프로젝트에서 사용 가능하도록 합니다
2. **프로젝트별 설정 사용**: 필요에 따라 `.lsp.json`을 통해 프로젝트별 서버 옵션을 구성하세요
3. **서버를 최신 상태로 유지**: 최상의 결과를 위해 언어 서버를 정기적으로 업데이트하세요
4. **현명하게 신뢰**: 신뢰할 수 있는 출처의 작업 공간만 신뢰하세요

## FAQ

### Q: LSP를 어떻게 활성화하나요?

Qwen Code 시작 시 `--experimental-lsp` 플래그를 사용하세요:

```bash
qwen --experimental-lsp
```

### Q: 어떤 언어 서버가 실행 중인지 어떻게 알 수 있나요?

LSP와 디버그 모드를 활성화하여 Qwen Code를 시작하세요:

```bash
qwen --experimental-lsp --debug
```

그런 다음 짧은 요약을 위해 `/status`, 서버별 상태를 위해 `/lsp`를 실행하거나 디버그 로그를 확인하세요:

```bash
# 기본 런타임 디렉토리
rg "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest
# 또는:
grep -E "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest

# QWEN_RUNTIME_DIR이 구성된 경우
rg "LSP|Native LSP|<server-name>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP는 Qwen Code의 일반 `--debug` 모드를 사용합니다; 별도의 LSP 디버그 플래그는 없습니다.

### Q: 같은 파일 타입에 여러 언어 서버를 사용할 수 있나요?

예, 하지만 각 작업에 대해 하나만 사용됩니다. 결과를 반환하는 첫 번째 서버가 승리합니다.

### Q: LSP가 샌드박스 모드에서 작동하나요?

LSP 서버는 코드에 접근하기 위해 샌드박스 외부에서 실행됩니다. 작업 공간 신뢰 제어의 영향을 받습니다.
