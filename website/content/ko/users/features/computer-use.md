# Computer Use

Qwen Code는 에이전트가 데스크톱을 제어할 수 있는 내장 **Computer Use** 도구를 제공합니다 — 클릭, 타이핑, 스크롤, 앱 실행, 창 내용 읽기, 스크린샷 촬영. 이를 통해 Qwen Code는 터미널에 국한된 코딩 어시스턴트가 아닌 일반적인 데스크톱 자동화 에이전트가 됩니다.

Computer Use는 [`cua-driver`](https://github.com/trycua/cua) 네이티브 드라이버로 구동됩니다. 도구는 `computer_use__` 접두사 아래에 지연(deferred, 지연 로드) 내장 도구로 등록되므로, 모델이 실제로 사용할 때만 프롬프트 공간을 소비합니다.

> [!warning]
>
> Computer Use는 에이전트에게 마우스, 키보드 및 창에 대한 제어 권한을 부여하며 화면 내용을 읽을 수 있게 합니다. 신뢰할 수 있는 프롬프트와 함께 사용하고, 가능한 경우 샌드박스 또는 일회용 환경에서만 사용하세요. 작업 도구(click, type, drag 등)는 일반적인 [승인 흐름](./approval-mode.md)을 거칩니다; 창 목록과 같은 읽기 전용 도구는 프롬프트 없이 실행될 수 있습니다.

## 활성화 및 비활성화

Computer Use는 **기본적으로 활성화**되어 있습니다. `computer_use__*` 도구는 시작 시 자동으로 등록됩니다.

전체를 비활성화하려면 — 네이티브 드라이버가 다운로드되거나 실행되는 것도 방지합니다 — `settings.json`에서 `tools.computerUse.enabled`를 `false`로 설정하세요:

```jsonc
{
  "tools": {
    "computerUse": {
      "enabled": false,
    },
  },
}
```

이 설정은 적용되려면 재시작이 필요합니다.

## 첫 실행과 네이티브 드라이버

에이전트가 Computer Use 도구를 처음 호출하면, Qwen Code는 고정된 서명된 `cua-driver` 바이너리(~20MB)를 `~/.qwen/computer-use/`에 다운로드하고 로컬 프로세스로 실행합니다. 사전 빌드된 바이너리는 macOS(Apple Silicon 및 Intel), Linux(x86_64) 및 Windows(x86_64)용으로 게시됩니다.

### macOS 권한

macOS에서 데스크톱 자동화에는 두 가지 시스템 권한이 필요합니다:

- **접근성** — 창/UI 상태를 읽고 입력을 합성하기 위해
- **화면 기록** — 스크린샷을 캡처하기 위해

첫 사용 시 드라이버가 표준 macOS 시스템 대화 상자를 통해 이러한 권한을 부여하는 과정을 안내합니다. 에이전트는 필요에 따라 권한 상태를 확인할 수도 있습니다(`check_permissions` 도구). macOS는 권한 부여를 _책임_ 프로세스에 속하므로, Qwen Code를 실행한 터미널이나 IDE에 권한을 부여해야 할 수 있습니다.

## 에이전트가 할 수 있는 것

전체 `cua-driver` 도구 표면이 노출됩니다. 주요 기능:

| 카테고리      | 도구 (일부)                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| 마우스        | `click`, `double_click`, `right_click`, `drag`, `move_cursor`, `scroll`          |
| 키보드        | `type_text`, `press_key`, `hotkey`                                               |
| 창 / UI       | `list_windows`, `get_window_state`, `get_accessibility_tree`, `set_value`, `zoom`|
| 앱            | `launch_app`, `list_apps`, `bring_to_front`, `kill_app`                          |
| 브라우저 페이지| `page` (JavaScript 실행, 텍스트 읽기, DOM 조회, 요소 클릭)                        |
| 스크린샷      | `get_window_state` (PNG 캡처), `page`                                            |
| 녹화          | `start_recording`, `stop_recording`, `replay_trajectory` (세션 기록/재생)         |
| 세션          | `start_session`, `end_session`, 에이전트 커서 오버레이 제어                        |

요소 주소 지정 작업이 원시 픽셀 좌표보다 선호됩니다: `get_window_state`는 창의 접근성 트리를 Markdown으로 렌더링하여 각 작업 가능한 요소에 안정적인 `element_index`를 부여하며, 입력 도구가 이를 직접 대상으로 할 수 있습니다.

macOS에서 지원이 가장 완전합니다; 일부 도구는 플랫폼별입니다(예: `bring_to_front`는 Windows 전용, `launch_app`은 macOS 앱을 대상으로 함).

## 구성

모든 Computer Use 설정은 `settings.json`의 `tools.computerUse` 아래에 있습니다. 전체 목록은 [설정 레퍼런스](../configuration/settings.md)를 참조하세요.

| 설정                                  | 타입    | 기본값   | 설명                                                                                                                                                                                                                                                |
| ------------------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.computerUse.enabled`           | boolean | `true`   | `computer_use__*` 도구를 등록합니다. `false`이면 드라이버가 다운로드되거나 실행되지 않습니다.                                                                                                                                                       |
| `tools.computerUse.maxImageDimension` | number  | `-1`     | 스크린샷의 최대 변 픽셀 캡. `-1`은 드라이버 기본값(1568)을 유지; `0`은 크기 조정 비활성화(전체 해상도); 양수 값은 최대 변을 제한합니다. 낮은 캡은 비전 토큰 비용을 줄입니다. 환경 변수 오버라이드: `QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`.          |
| `tools.computerUse.idleTimeoutMs`     | number  | `300000` | 마지막 `computer_use__*` 호출 후 드라이버 프로세스를 유지하는 밀리초(기본 5분). `0`은 Qwen Code가 종료될 때까지 계속 실행합니다.                                                                                                                     |

세 설정 모두 적용되려면 재시작이 필요합니다.

## 참고 자료

- [승인 모드](./approval-mode.md) — 도구 실행이 게이팅되는 방식
- [샌드박싱](./sandbox.md) — 도구가 접근할 수 있는 것을 격리
- [설정 레퍼런스](../configuration/settings.md) — 전체 `tools.computerUse.*` 스키마
