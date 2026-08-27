---
title: Shell Tool
---

# Shell 도구 (`run_shell_command`)

이 문서는 Qwen Code의 `run_shell_command` 도구에 대해 설명합니다.

## 설명

`run_shell_command`를 사용하여 기본 시스템과 상호 작용하고, 스크립트를 실행하거나, 명령줄 작업을 수행하세요. `run_shell_command`는 주어진 셸 명령을 실행하며, `tools.shell.enableInteractiveShell` 설정이 `true`로 설정된 경우 사용자 입력이 필요한 대화형 명령(예: `vim`, `git rebase -i`)도 포함됩니다.

Windows에서는 명령이 `cmd.exe /c`로 실행됩니다. 다른 플랫폼에서는 `bash -c`로 실행됩니다.

### 인수

`run_shell_command`는 다음 인수를 받습니다:

- `command` (string, 필수): 실행할 정확한 셸 명령.
- `description` (string, 선택 사항): 명령의 목적에 대한 간단한 설명으로, 사용자에게 표시됩니다.
- `directory` (string, 선택 사항): 명령을 실행할 디렉토리(프로젝트 루트 기준). 제공되지 않으면 명령은 프로젝트 루트에서 실행됩니다.
- `is_background` (boolean, 필수): 명령을 백그라운드에서 실행할지 여부. 이 매개변수는 명령 실행 모드에 대한 명시적 의사 결정을 보장하기 위해 필요합니다. 개발 서버, 감시자 또는 데몬과 같이 추가 명령을 차단하지 않고 계속 실행되어야 하는 장기간 실행 프로세스의 경우 true로 설정합니다. 진행하기 전에 완료되어야 하는 일회성 명령의 경우 false로 설정합니다.

## Qwen Code에서 `run_shell_command` 사용 방법

`run_shell_command`를 사용할 때, 명령은 서브프로세스로 실행됩니다. `is_background` 매개변수를 사용하거나 명령에 명시적으로 `&`를 추가하여 명령이 백그라운드에서 실행될지 포그라운드에서 실행될지 제어할 수 있습니다. 이 도구는 실행에 대한 자세한 정보를 반환합니다:

### 필수 백그라운드 매개변수

`is_background` 매개변수는 모든 명령 실행에 대해 **필수**입니다. 이 설계는 LLM(및 사용자)이 각 명령이 백그라운드에서 실행될지 포그라운드에서 실행될지 명시적으로 결정하도록 하여, 의도적이고 예측 가능한 명령 실행 동작을 촉진합니다. 이 매개변수를 필수로 함으로써 장기간 실행 프로세스를 처리할 때 의도하지 않은 포그라운드 실행 폴백을 방지하여 후속 작업을 차단할 수 있습니다.

### 백그라운드 vs 포그라운드 실행

이 도구는 명시적 선택에 따라 백그라운드와 포그라운드 실행을 지능적으로 처리합니다:

**백그라운드 실행 사용 (`is_background: true`):**

- 장기간 실행 개발 서버: `npm run start`, `npm run dev`, `yarn dev`
- 빌드 감시자: `npm run watch`, `webpack --watch`
- 데이터베이스 서버: `mongod`, `mysql`, `redis-server`
- 웹 서버: `python -m http.server`, `php -S localhost:8000`
- 수동으로 중지될 때까지 무기한 실행될 것으로 예상되는 모든 명령

**포그라운드 실행 사용 (`is_background: false`):**

- 일회성 명령: `ls`, `cat`, `grep`
- 빌드 명령: `npm run build`, `make`
- 설치 명령: `npm install`, `pip install`
- Git 작업: `git commit`, `git push`
- 테스트 실행: `npm test`, `pytest`

### 실행 정보

이 도구는 실행에 대한 자세한 정보를 반환합니다:

- `Command`: 실행된 명령.
- `Directory`: 명령이 실행된 디렉토리.
- `Stdout`: 표준 출력 스트림의 출력.
- `Stderr`: 표준 오류 스트림의 출력.
- `Error`: 서브프로세스에서 보고된 오류 메시지.
- `Exit Code`: 명령의 종료 코드.
- `Signal`: 명령이 시그널로 종료된 경우 시그널 번호.
- `Background PIDs`: 시작된 백그라운드 프로세스의 PID 목록.

사용법:

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**참고:** `is_background` 매개변수는 필수이며 모든 명령 실행에 대해 명시적으로 지정해야 합니다.

## `run_shell_command` 예시

현재 디렉토리의 파일 나열:

```bash
run_shell_command(command="ls -la", is_background=false)
```

특정 디렉토리에서 스크립트 실행:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

백그라운드 개발 서버 시작(권장 방법):

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

백그라운드 서버 시작(명시적 &를 사용한 대안):

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

포그라운드에서 빌드 명령 실행:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

여러 백그라운드 서비스 시작:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## 설정

`settings.json` 파일을 수정하거나 Qwen Code에서 `/settings` 명령을 사용하여 `run_shell_command` 도구의 동작을 구성할 수 있습니다.

### 대화형 명령 활성화

`tools.shell.enableInteractiveShell` 설정은 셸 명령이 `node-pty`(대화형 PTY)를 통해 실행되는지 일반 `child_process` 백엔드를 통해 실행되는지 제어합니다. 활성화되면 `vim`, `git rebase -i` 및 TUI 프로그램과 같은 대화형 세션이 올바르게 작동합니다.

이 설정은 대부분의 플랫폼에서 기본값이 `true`입니다. Windows 빌드 **<= 19041**(Windows 10 버전 2004 이전)에서는 알려진 신뢰성 문제(출력 누락, 중단)로 인해 기본값이 `false`입니다. 이는 VS Code에서 사용하는 것과 동일한 기준입니다([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)). 런타임에 `node-pty`를 사용할 수 없는 경우, 이 설정과 관계없이 도구가 `child_process`로 폴백합니다.

기본값을 명시적으로 재정의하려면 `settings.json`에 값을 설정하세요:

**`settings.json` 예시:**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### 출력에 색상 표시

셸 출력에 색상을 표시하려면 `tools.shell.showColor` 설정을 `true`로 설정해야 합니다. **참고: 이 설정은 `tools.shell.enableInteractiveShell`이 활성화된 경우에만 적용됩니다.**

**`settings.json` 예시:**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### Pager 설정

`tools.shell.pager` 설정을 통해 셸 출력에 대한 사용자 정의 pager를 설정할 수 있습니다. 기본 pager는 Windows가 아닌 플랫폼에서 `cat`입니다. Windows에서는 기본값이 설정되지 않습니다. `tools.shell.pager`를 빈 문자열로 설정하면 pager 환경 변수를 비활성화합니다. **참고: 이 설정은 `tools.shell.enableInteractiveShell`이 활성화된 경우에만 적용됩니다.**

**`settings.json` 예시:**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## 대화형 명령

`run_shell_command` 도구는 이제 의사 터미널(pty)을 통합하여 대화형 명령을 지원합니다. 이를 통해 텍스트 편집기(`vim`, `nano`), 터미널 기반 UI(`htop`) 및 대화형 버전 관리 작업(`git rebase -i`)과 같이 실시간 사용자 입력이 필요한 명령을 실행할 수 있습니다.

대화형 명령이 실행 중일 때 Qwen Code에서 입력을 보낼 수 있습니다. 대화형 셸에 포커스를 맞추려면 `ctrl+f`를 누르세요. 복잡한 TUI를 포함한 터미널 출력이 올바르게 렌더링됩니다.

## 중요 참고 사항

- **보안:** 특히 사용자 입력에서 구성된 명령을 실행할 때 보안 취약점을 방지하기 위해 주의하세요.
- **오류 처리:** 명령이 성공적으로 실행되었는지 확인하려면 `Stderr`, `Error` 및 `Exit Code` 필드를 확인하세요.
- **백그라운드 프로세스:** `is_background=true`일 때 또는 명령에 `&`가 포함되어 있을 때, 도구는 즉시 반환되고 프로세스는 백그라운드에서 계속 실행됩니다. `Background PIDs` 필드에는 백그라운드 프로세스의 프로세스 ID가 포함됩니다.
- **백그라운드 실행 선택:** `is_background` 매개변수는 필수이며 실행 모드에 대한 명시적 제어를 제공합니다. 수동 백그라운드 실행을 위해 명령에 `&`를 추가할 수도 있지만, `is_background` 매개변수는 여전히 지정해야 합니다. 이 매개변수는 더 명확한 의도를 제공하며 백그라운드 실행 설정을 자동으로 처리합니다.
- **명령 설명:** `is_background=true`를 사용할 때, 명령 설명에 실행 모드를 명확히 표시하는 `[background]` 표시기가 포함됩니다.

## 환경 변수

`run_shell_command`가 명령을 실행할 때, 서브프로세스의 환경에 `QWEN_CODE=1` 환경 변수를 설정합니다. 이를 통해 스크립트나 도구가 CLI 내부에서 실행되고 있는지 감지할 수 있습니다.

## 명령 제한

구성 파일에서 `tools.core` 및 `tools.exclude` 설정을 사용하여 `run_shell_command` 도구에서 실행할 수 있는 명령을 제한할 수 있습니다.

- `tools.core`: `run_shell_command`를 특정 명령 집합으로 제한하려면, `tools` 카테고리 아래의 `core` 목록에 `run_shell_command(<command>)` 형식으로 항목을 추가하세요. 예를 들어, `"tools": {"core": ["run_shell_command(git)"]}`는 `git` 명령만 허용합니다. 제네릭 `run_shell_command`을 포함하면 와일드카드로 작동하여 명시적으로 차단되지 않은 모든 명령을 허용합니다.
- `tools.exclude`: 특정 명령을 차단하려면, `tools` 카테고리 아래의 `exclude` 목록에 `run_shell_command(<command>)` 형식으로 항목을 추가하세요. 예를 들어, `"tools": {"exclude": ["run_shell_command(rm)"]}`는 `rm` 명령을 차단합니다.

검증 로직은 안전하고 유연하도록 설계되었습니다:

1.  **명령 체이닝 비활성화:** 이 도구는 `&&`, `||` 또는 `;`로 체인된 명령을 자동으로 분할하고 각 부분을 별도로 유효성 검사합니다. 체인의 일부라도 허용되지 않으면 전체 명령이 차단됩니다.
2.  **접두사 매칭:** 이 도구는 접두사 매칭을 사용합니다. 예를 들어, `git`을 허용하면 `git status` 또는 `git log`를 실행할 수 있습니다.
3.  **차단 목록 우선:** `tools.exclude` 목록이 항상 먼저 확인됩니다. 명령이 차단된 접두사와 일치하면 `tools.core`에서 허용된 접두사와도 일치하더라도 거부됩니다.

### 명령 제한 예시

**특정 명령 접두사만 허용**

`git`과 `npm` 명령만 허용하고 나머지를 차단하려면:

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status`: 허용
- `npm install`: 허용
- `ls -l`: 차단

**특정 명령 접두사 차단**

`rm`을 차단하고 나머지 명령을 모두 허용하려면:

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /`: 차단
- `git status`: 허용
- `npm install`: 허용

**차단 목록이 우선**

명령 접두사가 `tools.core`와 `tools.exclude` 모두에 있으면 차단됩니다.

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main`: 차단
- `git status`: 허용

**모든 셸 명령 차단**

모든 셸 명령을 차단하려면 `run_shell_command` 와일드카드를 `tools.exclude`에 추가하세요:

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: 차단
- `any other command`: 차단

## `excludeTools`의 보안 참고 사항

`run_shell_command`의 `excludeTools`에서 명령별 제한은 간단한 문자열 매칭을 기반으로 하며 쉽게 우회할 수 있습니다. 이 기능은 **보안 메커니즘이 아니며** 신뢰할 수 없는 코드를 안전하게 실행하는 데 의존해서는 안 됩니다. 실행할 수 있는 명령을 명시적으로 선택하려면 `coreTools`를 사용하는 것이 좋습니다.
