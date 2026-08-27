# IDE 통합

Qwen Code는 IDE와 통합되어 더 원활하고 컨텍스트를 인지하는 경험을 제공합니다. 이 통합을 통해 CLI가 워크스페이스를 더 잘 이해하고 네이티브 에디터 내 diffing과 같은 강력한 기능을 사용할 수 있습니다.

현재 지원되는 IDE는 [Visual Studio Code](https://code.visualstudio.com/) 및 VS Code 확장을 지원하는 다른 에디터입니다. 다른 에디터에 대한 지원을 구축하려면 [IDE Companion Extension Spec](../ide-integration/ide-companion-spec)을 참조하세요.

## 기능

- **워크스페이스 컨텍스트:** CLI가 자동으로 워크스페이스를 인식하여 더 관련성 있고 정확한 응답을 제공합니다. 이 컨텍스트에는 다음이 포함됩니다:
  - 워크스페이스에서 가장 최근에 접근한 **10개의 파일**.
  - 활성 커서 위치.
  - 선택한 텍스트(16KB 제한; 더 긴 선택은 잘림).

- **네이티브 Diffing:** Qwen이 코드 수정을 제안하면 IDE의 네이티브 diff 뷰어에서 변경 사항을 직접 볼 수 있습니다. 제안된 변경 사항을 원활하게 검토, 편집, 수락 또는 거부할 수 있습니다.

- **VS Code 명령어:** VS Code 명령어 팔레트(`Cmd+Shift+P` 또는 `Ctrl+Shift+P`)에서 Qwen Code 기능에 직접 접근할 수 있습니다:
  - `Qwen Code: Run`: 통합 터미널에서 새 Qwen Code 세션을 시작합니다.
  - `Qwen Code: Accept Diff`: 활성 diff 에디터의 변경 사항을 수락합니다.
  - `Qwen Code: Close Diff Editor`: 변경 사항을 거부하고 활성 diff 에디터를 닫습니다.
  - `Qwen Code: View Third-Party Notices`: 확장의 제3자 고지를 표시합니다.

## 설치 및 설정

IDE 통합을 설정하는 세 가지 방법이 있습니다:

### 1. 자동 안내 (권장)

지원되는 에디터 내에서 Qwen Code를 실행하면 환경을 자동으로 감지하고 연결을 안내합니다. "Yes"를 응답하면 필요한 설정이 자동으로 실행되며, companion 확장 설치 및 연결 활성화가 포함됩니다.

### 2. CLI에서 수동 설치

이전에 안내를 닫았거나 확장을 수동으로 설치하려면 Qwen Code 내에서 다음 명령어를 실행하세요:

```
/ide install
```

IDE에 맞는 확장을 찾아 설치합니다.

### 3. 마켓플레이스에서 수동 설치

마켓플레이스에서 직접 확장을 설치할 수도 있습니다.

- **Visual Studio Code용:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)에서 설치.
- **VS Code Fork용:** VS Code fork를 지원하기 위해 확장이 [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion)에도 게시됩니다. 이 레지스트리에서 확장을 설치하는 에디터의 지침을 따르세요.

> 참고:
> "Qwen Code Companion" 확장은 검색 결과 하단에 나타날 수 있습니다. 즉시 보이지 않으면 아래로 스크롤하거나 "Newly Published"로 정렬해 보세요.
>
> 확장을 수동으로 설치한 후, CLI에서 `/ide enable`을 실행하여 통합을 활성화해야 합니다.

## 사용법

### 활성화 및 비활성화

CLI 내에서 IDE 통합을 제어할 수 있습니다:

- IDE 연결을 활성화하려면:
  ```
  /ide enable
  ```
- 연결을 비활성화하려면:
  ```
  /ide disable
  ```

활성화되면 Qwen Code가 자동으로 IDE companion 확장에 연결을 시도합니다.

### 상태 확인

연결 상태를 확인하고 CLI가 IDE에서 받은 컨텍스트를 보려면:

```
/ide status
```

연결된 경우, 이 명령어는 연결된 IDE와 인식하고 있는 최근 열린 파일 목록을 표시합니다.

(참고: 파일 목록은 워크스페이스 내에서 최근 접근한 10개의 파일로 제한되며 디스크의 로컬 파일만 포함합니다.)

### Diff 작업

Qwen 모델에게 파일 수정을 요청하면 에디터에서 직접 diff 뷰를 열 수 있습니다.

**Diff를 수락하려면** 다음 작업 중 하나를 수행할 수 있습니다:

- diff 에디터의 타이틀 바에서 **체크마크 아이콘**을 클릭.
- 파일을 저장 (예: `Cmd+S` 또는 `Ctrl+S`).
- 명령어 팔레트를 열고 **Qwen Code: Accept Diff**를 실행.
- 프롬프트가 표시되면 CLI에서 `yes`로 응답.

**Diff를 거부하려면** 다음을 수행할 수 있습니다:

- diff 에디터의 타이틀 바에서 **'x' 아이콘**을 클릭.
- diff 에디터 탭을 닫기.
- 명령어 팔레트를 열고 **Qwen Code: Close Diff Editor**를 실행.
- 프롬프트가 표시되면 CLI에서 `no`로 응답.

Diff 뷰에서 제안된 변경 사항을 **수정**한 후 수락할 수도 있습니다.

CLI에서 'Yes, allow always'를 선택하면 변경 사항이 자동으로 수락되어 IDE에 표시되지 않습니다.

## 샌드박싱과 함께 사용

Qwen Code를 샌드박스 내에서 사용하는 경우 다음을 알아두세요:

- **macOS에서:** IDE 통합은 IDE companion 확장과 통신하기 위해 네트워크 접근이 필요합니다. 네트워크 접근을 허용하는 Seatbelt 프로파일을 사용해야 합니다.
- **Docker 컨테이너에서:** Qwen Code를 Docker (또는 Podman) 컨테이너 내에서 실행하면, IDE 통합은 호스트 머신에서 실행 중인 VS Code 확장에 계속 연결할 수 있습니다. CLI는 `host.docker.internal`에서 IDE 서버를 자동으로 찾도록 설정되어 있습니다. 일반적으로 특별한 설정이 필요하지 않지만, Docker 네트워킹 설정이 컨테이너에서 호스트로의 연결을 허용하는지 확인해야 할 수 있습니다.

## 문제 해결

IDE 통합에 문제가 발생하면 일반적인 오류 메시지와 해결 방법은 다음과 같습니다.

### 연결 오류

- **메시지:** `● Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **원인:** Qwen Code가 IDE에 연결하는 데 필요한 환경 변수(`QWEN_CODE_IDE_WORKSPACE_PATH` 또는 `QWEN_CODE_IDE_SERVER_PORT`)를 찾을 수 없습니다. 일반적으로 IDE companion 확장이 실행 중이 아니거나 올바르게 초기화되지 않았음을 의미합니다.
  - **해결 방법:**
    1. IDE에 **Qwen Code Companion** 확장이 설치되어 있고 활성화되어 있는지 확인하세요.
    2. IDE에서 새 터미널 창을 열어 올바른 환경을 가져오도록 하세요.

- **메시지:** `● Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **원인:** IDE companion와의 연결이 끊어졌습니다.
  - **해결 방법:** `/ide enable`을 실행하여 재연결을 시도하세요. 문제가 계속되면 새 터미널 창을 열거나 IDE를 재시작하세요.

### 설정 오류

- **메시지:** `● Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **원인:** CLI의 현재 작업 디렉토리가 IDE에서 열고 있는 폴더 또는 워크스페이스 외부에 있습니다.
  - **해결 방법:** IDE에서 열려 있는 동일한 디렉토리로 `cd`하고 CLI를 재시작하세요.

- **메시지:** `● Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **원인:** IDE에 워크스페이스가 열려 있지 않습니다.
  - **해결 방법:** IDE에서 워크스페이스를 열고 CLI를 재시작하세요.

### 일반 오류

- **메시지:** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **원인:** 지원되는 IDE가 아닌 터미널 또는 환경에서 Qwen Code를 실행 중입니다.
  - **해결 방법:** VS Code와 같은 지원되는 IDE의 통합 터미널에서 Qwen Code를 실행하세요.

- **메시지:** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **원인:** `/ide install`을 실행했지만 CLI에 특정 IDE에 대한 자동 설치 프로그램이 없습니다.
  - **해결 방법:** IDE의 확장 마켓플레이스를 열고 "Qwen Code Companion"을 검색하여 수동으로 설치하세요.
