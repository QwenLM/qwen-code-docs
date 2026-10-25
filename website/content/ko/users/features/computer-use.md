# Computer Use

Computer Use는 독립 실행형 Node REPL MCP 서버를 통해 동작합니다. 첫 `js` 호출은 전역 `cua`를 로드하고 현재 플랫폼의 문서를 표시합니다. Computer Use와 Browser Use는 더 이상 번들 skill을 필요로 하지 않습니다.

```text
Qwen Code / any MCP client
  -> @qwen-code/node-repl-mcp (js, js_reset)
  -> @qwen-code/cua-sdk/runtime
     -> native Qwen CUA Driver (desktop applications)
     -> @qwen-code/browser-use (Qwen browser extension)
```

## 설정

Node.js 22 이상과 npm이 필요합니다. MCP 서버를 등록한 다음 Qwen Code를 재시작하세요:

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.26.0
```

서버는 일치하는 SDK와 브라우저 SDK를 의존성으로 설치합니다. 네이티브 SDK 페이로드는 현재 플랫폼에 맞게 다운로드되며 해당 릴리스의 SHA-256 체크섬에 대해 검증됩니다. npm 패키지 외부에 캐시되므로 워크스페이스 SDK 부트스트랩 명령이 필요하지 않습니다. 버전 0.26.0은 릴리스가 게시될 때까지 로컬 개발 대상입니다.

Windows는 기본적으로 일반 입력 전달을 사용하며 UIAccess 작업자를 설치하지 않습니다. `CUA_DRIVER_USE_UIACCESS=1`로 UIAccess를 옵트인하려면 `Program Files\Qwen\CuaDriver` 아래에 서명된 작업자가 필요합니다. 해당 변수가 설정된 상태에서 관리자 권한 터미널에서 SDK를 설치하세요. 서명되지 않은 작업자는 UIAccess를 활성화할 수 없습니다; 서명 검사를 우회하지 마세요. 이전 서명되지 않은 릴리스는 UIAccess를 위해 같은 버전을 다시 설치하는 것이 아니라 새로운 서명된 드라이버 릴리스가 필요합니다.

## 애플리케이션 작업

```js
var app = await cua.getApp('Microsoft Excel');
// Use a short ID from the automatically displayed AX state.
await app.click(37);
await app.typeText('hello');
await app.getAXState();
```

`getApp`은 이미지 없이 전체 AX 텍스트를 표시합니다. `getAXState`는 이후 diff를 표시합니다. `getScreenshot`은 현재 창만 캡처하고, `getAXStateAndScreenshot`은 둘 다 캡처합니다. 관찰은 문자열을 반환하며 자체적으로 표시합니다. `{emit:false}`는 출력을 억제합니다. `{x,y}` 좌표를 사용하기 전에 스냅샷을 요청하세요. 이 좌표는 해당 창의 현재 스크린샷에서 픽셀입니다.

드라이버는 애플리케이션/창을 확인하고, 현재 짧은 ID와 좌표를 소유하며, 입력 전달 방식을 선택합니다. macOS는 접근성과 directed 이벤트를 사용합니다. Windows와 Linux는 백그라운드 전달을 먼저 시도하고, 아무것도 전송되지 않았음을 증명하는 거부 후에만 포그라운드 입력을 사용합니다. 포그라운드 입력은 물리적 사용자 활동이 감지되면 중단되며, 사용자가 다른 곳으로 전환하지 않은 경우에만 이전 애플리케이션을 복원합니다. 전달 확인이 UI 변경을 증명하지는 않습니다: 재시도 전에 관찰하세요.

Linux는 XWayland 아래의 X11 애플리케이션을 포함한 X11을 지원합니다. 네이티브 Wayland 애플리케이션은 지원되지 않습니다. DISPLAY, XAUTHORITY 및 데스크톱 접근성 세션 버스를 서버에 전달하세요.

## 데스크톱 및 브라우저 작업

전체 화면 작업에 명시적 데스크톱 인터페이스를 사용하세요:

```js
await cua.desktop.getScreenshot();
await cua.desktop.click({ x: 300, y: 200 }, { key: 'shift' });
```

데스크톱 좌표는 최신 기본 디스플레이 스크린샷의 픽셀입니다. 데스크톱 입력은 보이는 포그라운드 데스크톱을 제어하며 실제 포인터를 이동할 수 있습니다. 고정된 키의 경우 항상 `cua.desktop.keyDown(key)` 및 `keyUp(key)`과 함께 `try/finally`를 사용하세요. 고정된 키는 호출 세션에 속하며 정상적인 리셋/종료 시 해제됩니다. 키를 고정하는 동안, 코드와 데스크톱 포인터 작업에 `keyDown/keyUp`을 사용하고 명시적 수정자는 사용하지 마세요. 텍스트, 일반 단축키 또는 애플리케이션 입력 전에 이들을 해제하세요. 급격한 OS 프로세스 종료 정리는 보장할 수 없습니다.

```js
var browser = await cua.getBrowser('Chrome');
// Browser documentation and tabs are displayed on first selection.
var tab = await cua.getTab('TAB_ID', { browser: 'Chrome' });
await tab.playwright.domSnapshot();
```

`getBrowser`, `getTab`, `createBrowserTab`은 기존 저장소 browser-use SDK 핸들을 반환합니다. 선택된 브라우저의 런타임 문서를 따르고 이전에처럼 Qwen 브라우저 확장 프로그램을 연결하세요. 이 통합은 브라우저 창 API, DOM diff 또는 새로운 Windows 지원을 추가하지 않습니다.

## 권한 및 라이프사이클

서버는 일반적인 Node.js 권한으로 JavaScript를 실행하며 클라이언트의 MCP 승인 흐름을 따릅니다. macOS에서 입력/AX 관찰에는 Accessibility가 필요하고 스크린샷에는 Screen Recording이 필요합니다. 문서 저장/Finder 이름 변경을 위해 Automation이 요청될 수 있습니다. 권한은 호스트 프로세스의 OS 책임 체인에 속합니다. Windows에서 일반적인 설치된 데몬은 기존 UAC/logon-task 경로를 사용하며, 해당 데몬이 시작하는 애플리케이션은 일반 사용자 무결성에서 자체 토큰에서 파생된 토큰을 사용합니다. UIAccess는 선택 사항입니다: `CUA_DRIVER_USE_UIACCESS=1`을 명시적으로 설정하면 Program Files 아래에 신뢰할 수 있는 서명된 작업자가 필요하며 사용 불가능하면 실패합니다. 기본 npm 설치는 해당 작업자를 스테이징하지 않으며 서명을 요구하지 않습니다.

`js`는 한 번의 호출로 완료되며 기본 30초 타임아웃을 가집니다. 타임아웃은 외부 효과를 남길 수 있습니다: 재시도 전에 관찰하세요. `js_reset`은 바인딩을 폐기하고 소유한 네이티브/브라우저 세션을 정상적으로 닫습니다. 컨텍스트 압축 후 계속하기 전에 `cua.rewriteDocumentation()`을 호출하세요.

## 원격 데스크톱 릴레이

기존 macOS 데스크톱 릴레이 설정의 경우, 일치하는 서버를 설치하세요:

```bash
npx -y @qwen-code/node-repl-mcp@0.26.0 desktop-relay install
```

이것은 `127.0.0.1:47821`의 기존 로컬 launchd 소켓을 사용합니다. 보안 Web Shell에서 **Use this computer**를 선택한 다음 **Connect this computer**를 선택하세요. 데스크톱은 각 연결에 대해 프롬프트를 표시합니다. 원격 데몬은 `QWEN_SERVE_CLIENT_MCP_OVER_WS=1`을 활성화해야 합니다.

## 직접 MCP 및 문제 해결

`qwen-cua-driver mcp`는 동일한 19개의 네이티브 Computer Use 작업을 직접 노출합니다. 앱 호출은 `app`을 사용하고, 데스크톱 가능한 호출은 대신 `scope:"desktop"`을 사용합니다. `key_down/key_up`는 데스크톱 전용입니다. 고급 네이티브 도구는 호스트 옵트인 `CUA_DRIVER_EXTRA_TOOLS=1`을 통해 계속 사용 가능합니다.

서버를 사용할 수 없으면 `qwen mcp list`를 확인하고 추가 후 클라이언트를 재시작하세요. 캡처가 실패하면 현재 데스크톱 세션과 OS 권한을 확인하세요. 네이티브 다운로드가 실패하면 정확한 릴리스 버전/체크섬 자산을 확인하거나 `QWEN_CUA_SDK_NATIVE_DIR`을 통해 로컬에서 빌드한 일치하는 페이로드를 제공하세요. 잠긴 데스크톱은 GUI 수락 증거를 제공할 수 없습니다.

[MCP 서버](./mcp.md), [승인 모드](./approval-mode.md) 및 [샌드박싱](./sandbox.md)을 참조하세요.
