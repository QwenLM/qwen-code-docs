# Browser Use

Browser Use를 사용하면 Qwen Code가 Chrome 브라우저의 페이지를 작업할 수 있으며, 기존 탭과 로그인된 세션을 활용할 수 있습니다.

## 사용

macOS 또는 Linux에 Chrome 125 이상과 Qwen Code 0.24.2 이상을 사용하세요(`qwen --version`으로 확인). **사용하려는 Chrome 프로필에 [Chrome 웹 스토어에서 Qwen Code 확장 프로그램](https://chromewebstore.google.com/detail/qwen-code/hdhmmjclhibojdddmancfgbkleahfaph)을 설치하세요.** 확장 프로그램은 필수이며 Qwen Code 패키지에 포함되어 있지 않습니다. 설치 후에는 Chrome이 자동으로 업데이트합니다.

**프로필당 하나의 확장 프로그램 사본을 사용하세요.** 이전에 unpacked 상태로 로드한 적이 있다면, 스토어 버전을 사용하기 전에 `chrome://extensions`에서 해당 사본을 제거하거나 비활성화하세요. 둘 다 활성화되어 있으면 Qwen이 같은 프로필에 대해 두 개의 브라우저를 감지하여 어느 쪽이든 연결할 수 있습니다.

Chrome 웹 스토어에서 해당 지역에서 확장 프로그램을 사용할 수 없다고 표시되면, 대신 소스에서 빌드하세요: Qwen Code 저장소의 `packages/chrome-extension` 디렉토리에서 [README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme)를 따라 빌드한 다음, `chrome://extensions`를 열고 개발자 모드를 활성화하고 **Load unpacked**를 선택한 후 빌드된 `dist/extension` 디렉토리를 선택하세요.

브라우저 작업을 직접 설명하세요. 예를 들어:

> 열려 있는 대시보드를 읽고 오늘 주문을 요약해 주세요.

Qwen은 적절한 경우 Browser Use skill을 선택합니다. 첫 브라우저 작업 시 사용자 디렉토리에 작은 로컬 연결 프로그램이 자동으로 등록되며, 이후 작업에서 재사용됩니다. Qwen은 페이지를 조작하기 전에 확장 프로그램과의 연결을 확인합니다. 연결할 수 없으면 Chrome을 열고 Qwen Code가 0.24.2 이상인지 확인하고 해당 프로필에서 확장 프로그램이 활성화되어 있는지 확인한 후 다시 시도하세요. 런타임 종속성이 첫 사용 시 설정이 필요하면 Qwen이 안내하며 재시작을 요청할 수 있습니다. 별도의 Browser Use Qwen 확장 프로그램이나 `qwen serve` 프로세스는 필요하지 않습니다.

## 비활성화

`/skills`를 사용하여 **browser-use**를 비활성화하세요. 이렇게 하면 모델에서 skill이 숨겨지지만 기존 브라우저 세션이 연결 해제되거나 대화에 이미 로드된 지침이 제거되지는 않습니다.