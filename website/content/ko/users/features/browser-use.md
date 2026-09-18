# Browser Use

Browser Use를 사용하면 Qwen Code가 Chrome 브라우저의 페이지를 작업할 수 있으며, 기존 탭과 로그인된 세션을 활용할 수 있습니다.

## 사용

Chrome 125 이상을 지원하는 macOS 또는 Linux를 사용하세요. **사용하려는 Chrome 프로필에 Qwen Chrome 확장 프로그램을 설치하고 활성화하세요.** 확장 프로그램은 필수이며 Qwen Code 패키지에는 포함되어 있지 않습니다. 아직 Chrome 웹 스토어 등록이 없습니다. Qwen Code 저장소의 `packages/chrome-extension` 디렉토리에서 [README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme)를 따라 빌드한 다음, `chrome://extensions`를 열고 개발자 모드를 활성화하고 **Load unpacked**를 선택한 후 빌드된 `dist/extension` 디렉토리를 선택하세요.

브라우저 작업을 직접 설명하세요. 예를 들어:

> 열려 있는 대시보드를 읽고 오늘 주문을 요약해 주세요.

Qwen은 적절한 경우 Browser Use skill을 선택합니다. 런타임 종속성이 첫 사용 시 설정이 필요하면 Qwen이 안내하며 재시작을 요청할 수 있습니다. 별도의 Browser Use Qwen 확장 프로그램이나 `qwen serve` 프로세스는 필요하지 않습니다.

## 비활성화

`/skills`를 사용하여 **browser-use**를 비활성화하세요. 이렇게 하면 모델에서 skill이 숨겨지지만 기존 브라우저 세션이 연결 해제되거나 대화에 이미 로드된 지침이 제거되지는 않습니다.