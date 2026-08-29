# Computer Use

Qwen Code에는 모델이 데스크톱 애플리케이션을 조작하는 방법을 가르치는 `computer-use` skill이 있으며, 별도로 설치되는 두 패키지를 통해 동작합니다:

```text
bundled computer-use skill
  -> @qwen-code/node-repl-mcp
  -> @qwen-code/cua-sdk/computer-use
  -> native cua-driver accessibility backend
```

Qwen Code는 MCP 서버, SDK 또는 네이티브 드라이버를 번들하지 않습니다. skill은 외부 패키지가 누락되어 있을 때 자동으로 설치합니다.

> [!warning]
>
> Computer Use는 애플리케이션 UI를 읽고 마우스 및 키보드 입력을 제어할 수 있습니다.
> 신뢰할 수 있는 환경에서만 사용하고 MCP 승인을 신중하게 확인하세요.

## 자동 설정

Node.js 22 이상이 필요하며 npm도 필요합니다.

처음 사용 시 skill이 다음 명령을 직접 실행합니다:

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.1
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.2
```

MCP 서버가 처음 추가된 후 Qwen Code를 재시작하세요. 그런 다음 skill이 `node_repl`을 통해 데스크톱 작업을 계속합니다.

SDK 설치는 `package.json`과 lockfile을 변경하지 않지만, 워크스페이스의 `node_modules`에는 씁니다. postinstall 스크립트가 현재 플랫폼의 네이티브 페이로드를 다운로드하고 검증합니다.

MCP 구성이나 워크스페이스 SDK 설치를 제거하면 실행 경로가 비활성화됩니다. 레거시 폴백은 없습니다.

## 사용

Qwen Code에게 데스크톱 작업에 `$computer-use`를 사용하도록 요청하세요. 부트스트랩 후 표준 Computer Use 워크플로를 따릅니다:

1. 정확한 애플리케이션과 창을 발견합니다.
2. 전체 접근성 상태를 관찰합니다.
3. 현재 시맨틱 요소 토큰을 통해 가능한 경우 동작을 수행합니다.
4. 모든 변경 후 새 상태를 가져옵니다.
5. 요청된 결과를 검증합니다.
6. SDK 클라이언트를 닫고 REPL을 초기화합니다.

드라이버만이 관찰 diff를 계산하는 유일한 구성 요소입니다. 모델 코드는 타입화된 SDK 메서드를 사용하며 임의의 드라이버 도구 이름을 디스패치하지 않습니다.

## 권한

Node REPL은 일반적인 Node.js 권한으로 모델이 작성한 JavaScript를 실행하는 MCP 서버입니다. 호출은 Qwen Code의 일반 [MCP 승인 흐름](./approval-mode.md)을 따릅니다. SDK는 네이티브 인증도 강제합니다.

macOS에서 접근성 관찰과 입력에는 Accessibility 권한이 필요합니다. 스크린샷은 추가로 Screen Recording 권한이 필요합니다. macOS는 권한 부여를 Qwen Code를 실행한 터미널이나 IDE에 귀속시킬 수 있습니다. Windows와 Linux는 플랫폼별 접근성 및 입력 기능을 사용합니다.

## 문제 해결

- 자동 설정 후에도 `node_repl`을 사용할 수 없으면, Qwen Code를 재시작하고 `qwen mcp list`로 서버를 확인하세요.
- 자동 설정 후에도 SDK 가져오기가 실패하면, Qwen Code가 패키지가 설치된 워크스페이스에서 실행 중인지 확인하세요.
- 타임아웃, 취소, 초기화 또는 커널 크래시 후, SDK 클라이언트를 다시 부트스트랩하고 새 상태를 요청하세요.

## 참고 자료

- [Skills](./skills.md)
- [MCP servers](./mcp.md)
- [승인 모드](./approval-mode.md)
- [샌드박싱](./sandbox.md)
