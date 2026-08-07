# IDE Daemon Adapter 드래프트

## 목표

VS Code companion extension이 `DaemonSessionClient`를 통해 extension host에서 `qwen serve`에 연결하여 Mode B를 dogfood할 수 있도록 합니다.

webview는 daemon에 직접 호출하면 안 됩니다. Extension host가 daemon URL, 토큰, 세션 ID 및 SSE replay 상태를 소유하고, 정제된 앱 이벤트를 webview로 전달합니다.

## 제안 진입점

VS Code 설정:

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

로컬 dogfood을 위한 환경 변수 폴백:

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## 최소 플로우

1. Extension host가 `DaemonClient`를 생성합니다.
2. `/capabilities`를 fetch하고 워크스페이스 호환성을 확인합니다.
3. `DaemonSessionClient.createOrAttach()`로 생성 또는 첨부합니다.
4. Extension host에서 `session.events()`를 구독합니다.
5. Daemon 이벤트를 기존 webview 메시지로 변환합니다.
6. `session.prompt()`를 통해 사용자 프롬프트를 전송합니다.
7. `session.cancel()` 및 `session.setModel()`을 통해 취소/모델 전환을 라우팅합니다.
8. `session.respondToPermission()`을 통해 권한 결정을 라우팅합니다.

## 기존 ACP 연결과의 관계

첫 구현은 `AcpConnection`을 대체하지 않고 형제 연결 경로를 도입합니다:

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

두 경로 모두 가능한 경우 동일한 상위 수준 webview 콜백을 제공해야 합니다. 이벤트를 충실하게 매핑할 수 없는 경우, daemon 경로는 조용히 동등한 척하지 않고 명확한 미지원 상태 경고를 표시해야 합니다.

이 PR은 로컬에서 검증 가능한 extension-host adapter 스파이크인 `DaemonIdeConnection`을 추가합니다. 아직 기본 `QwenAgentManager` 경로에 연결되지 않았으므로, 기존 VS Code 동작은 ACP 서브프로세스 기반으로 유지됩니다.

## 이벤트 매핑 계약

| Daemon 이벤트                           | IDE 처리                                       |
| ---------------------------------------- | ---------------------------------------------- |
| `session_update` / `agent_message_chunk` | 기존 어시스턴트 스트림 콜백                   |
| `session_update` / `agent_thought_chunk` | 기존 사고 스트림 콜백                         |
| `session_update` / `tool_call`           | 기존 도구 호출 업데이트 콜백                  |
| `permission_request`                     | 기존 승인 UI 콜백                             |
| `permission_resolved`                    | 승인 UI 종료/업데이트                         |
| `model_switched`                         | 가능한 경우 기존 모델 상태 콜백              |
| `session_died`                           | 연결 해제 UI + 재연결 affordance              |

알 수 없는 이벤트는 무시하거나 디버그 메타데이터로 기록해야 합니다.

## 런타임 로컬리티 UX

Extension은 daemon locality를 명확히 표시해야 합니다:

- workspace/파일은 daemon 호스트의 경로입니다
- MCP 서버는 daemon 호스트에서 실행됩니다
- skill은 daemon 파일 시스템에서 로드됩니다
- provider credential은 daemon 프로세스 환경에서 해석됩니다

로컬 VS Code extension, 로컬 브라우저 프로필, 로컬 localhost 서비스 또는 로컬 SSH/kube credential이 daemon에서 자동으로 사용 가능하다고 암시하지 마세요.

## 명시적 비목표

- `AcpConnection`에서 기본 마이그레이션 없음.
- Webview에서 daemon으로의 직접 전송 없음.
- 파일 서비스 경계가 도입되기 전까지 IDE를 통한 daemon 측 파일 CRUD 없음.
- 에디터/브라우저/클립보드에 대한 역방향 RPC 아직 없음.
- 완전한 원격 제어 통합 없음.

## 병합 안전성

- 설정/환경 변수 뒤의 기본값 off.
- 추가적 형제 연결 경로.
- 기존 VS Code ACP 서브프로세스 경로 변경 없음.
- Daemon 토큰은 webview JavaScript로 절대 전달되지 않음.

## 검증 계획

- Daemon 세션 팩토리 연결 및 SSE 이벤트 소비를 유닛 테스트.
- Daemon 이벤트를 기존 extension-host 콜백으로 매핑하는 것을 유닛 테스트.
- 프롬프트, 취소, 모델 전환 및 권한 응답 전달을 유닛 테스트.
- 기능 플래그가 연결되었을 때 설정/환경 변수 해석을 유닛 테스트.
- 로컬 extension host를 `qwen serve`에 대해 스모크 테스트:
  - 프롬프트가 채팅으로 스트리밍됨
  - 취소가 동작함
  - 권한 UI가 요청을 해결할 수 있음
  - SSE 재연결이 추적된 `Last-Event-ID`를 사용함

## 기본 마이그레이션 전 차단 사항

- 타입화된 daemon 이벤트 스키마.
- Daemon-stamped 클라이언트 identity.
- 세션 범위 권한 라우트.
- 읽기 전용 런타임 진단.
- FileSystemService 경계 및 안전한 파일 읽기 라우트.
- CLI/TUI 동등성을 위한 출력 sink 리팩토링.
