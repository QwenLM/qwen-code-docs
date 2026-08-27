# TUI Daemon Adapter 드래프트

> **Deprecated**: 이 문서는 초기 `DaemonTuiAdapter` 스파이크를 설명합니다. 레거시 adapter는 여전히 `packages/cli/src/ui/daemon/`에 존재하지만, 재사용 가능한 방향은 이제 SDK 공유 UI 트랜스크립트 레이어입니다. 현재 아키텍처는 [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md)를 참조하세요.

---

## 목표 (과거)

프로세스 내 `Config` + agent 런타임을 생성하는 대신 `DaemonSessionClient`를 통해 `qwen serve`와 통신하는 플래그 게이트 TUI 전송을 추가합니다.

이것은 Mode B 클라이언트 마이그레이션을 위한 내부 검증 경로입니다. 출력 sink, 타입화된 daemon 이벤트, 세션 범위 권한 및 수명주기 진단이 안정화될 때까지 기본 TUI 경로를 대체하면 안 됩니다.

## 제안 진입점

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

선택 사항:

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

CLI는 다음 두 조건이 모두 참일 때까지 이 모드를 거부해야 합니다:

- `QWEN_DAEMON_URL` 또는 `--daemon-url`이 설정되어 있음.
- `GET /capabilities`가 `session_create`, `session_prompt` 및 `session_events`를 광고함.

## 최소 플로우

1. daemon URL과 토큰으로 `DaemonClient`를 생성합니다.
2. `/capabilities`를 fetch합니다.
3. `DaemonSessionClient.createOrAttach()`로 생성 또는 첨부합니다.
4. `session.events()`를 구독합니다.
5. `session.prompt()`를 통해 사용자 프롬프트를 제출합니다.
6. `session.cancel()`을 통해 취소를 라우팅합니다.
7. `session.setModel()`을 통해 모델 전환을 라우팅합니다.
8. `session.respondToPermission()`을 통해 권한 투표를 라우팅합니다.

## 렌더링 계약

첫 구현은 로컬에서 검증 가능한 reducer 및 전송 스파이크인 `DaemonTuiAdapter`를 추가합니다. 다음 daemon 이벤트만 매핑합니다:

| Daemon 이벤트                           | TUI 처리                                     |
| ---------------------------------------- | -------------------------------------------- |
| `session_update` / `agent_message_chunk` | 어시스턴트 텍스트 추가                       |
| `session_update` / `agent_thought_chunk` | 사고 텍스트 추가                             |
| `session_update` / `tool_call`           | 도구 호출 수명주기 표시                      |
| `permission_request`                     | 가능한 경우 기존 확인 UI 표시                |
| `permission_resolved`                    | 확인 UI 종료 또는 업데이트                   |
| `model_switched`                         | 푸터/모델 표시 업데이트                      |
| `session_died`                           | 연결 해제 상태 표시 및 스트리밍 중지         |

알 수 없는 이벤트는 무시해야 하며, 치명적 오류로 처리하지 않습니다. 타입화된 이벤트 reducer는 이후 프로토콜 PR에서 도입됩니다.

이 adapter는 아직 기본 Ink 앱에 연결되지 않았습니다. 기존 대화형 TUI, JSONL, stream-json 및 이중 출력 동작은 변경되지 않습니다.

## 명시적 비목표

- 현재 TUI 프로세스 내 런타임을 제거하지 않음.
- 이 PR에서 JSONL, stream-json 또는 이중 출력 동작을 변경하지 않음.
- TUI를 통한 파일 CRUD, MCP 관리, 메모리 CRUD 또는 provider/auth 변경을 아직 노출하지 않음.
- 브라우저/web에서 daemon으로의 직접 가정을 만들지 않음. 이것은 터미널 전용임.

## 병합 안전성

- 기본값 off.
- 추가적 코드 경로.
- 기존 CLI 플래그는 동작이 변경되지 않음.
- daemon을 사용할 수 없는 경우, 실험적 경로는 TUI를 시작하기 전에 실패하고 사용자에게 `qwen serve`를 실행하도록 안내함.

## 검증 계획

- 합성 daemon 이벤트로 이벤트-to-TUI-상태 매핑을 유닛 테스트.
- 프롬프트, 취소, 모델 전환 및 권한 투표 전달을 유닛 테스트.
- 기능 플래그가 연결되었을 때 플래그/환경 변수 파싱을 유닛 테스트.
- 로컬 `qwen serve`에 대해 스모크 테스트:
  - 프롬프트 텍스트가 TUI로 스트리밍됨
  - 취소가 활성 프롬프트를 해결함
  - 권한 요청을 수락 또는 거부할 수 있음
  - 재연결이 추적된 `Last-Event-ID`를 전송함

## 기본 마이그레이션 전 차단 사항

- 타입화된 daemon 이벤트 스키마.
- 세션 범위 권한 라우트.
- JSONL / stream-json / 이중 출력 동등성을 위한 출력 sink 리팩토링.
- 세션 수명주기 close/delete 시맨틱.
- MCP, skill, provider 및 워크스페이스 환경에 대한 런타임 진단.
