# Daemon UI SDK — 개발자 가이드

`@qwen-code/sdk/daemon` 서브패스는 daemon 클라이언트를 위한 공유 UI 프리미티브를 제공합니다. 현재 채택 대상은 웹 채팅 및 웹 터미널이며, 네이티브 로컬 TUI, 채널, IDE 통합은 daemon UI 계약이 안정화될 때까지 기존 기본 경로를 유지합니다. 이 가이드는 PR #4353에서 도입된 API 표면을 다룹니다(PR #4328의 공유 UI 트랜스크립트 레이어에 대한 통합 후속 작업).

## 3계층 모델

```
Daemon SSE wire (NDJSON envelopes)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← 렌더러가 여기에 연결
```

- **Normalizer**: 원시 daemon SSE 엔벨로프를 받아 타입화된 UI 이벤트를 반환합니다
- **Reducer**: 이벤트를 트랜스크립트 상태 머신에 누적합니다
- **Render helpers**: 상태 블록을 렌더링 가능한 문자열로 프로젝션합니다

## 빠른 시작

```ts
import {
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
  daemonBlockToMarkdown,
  selectCurrentTool,
  selectApprovalMode,
} from '@qwen-code/sdk/daemon';

const session = await DaemonSessionClient.createOrAttach(client, {
  workspaceCwd,
});
const store = createDaemonTranscriptStore();

for await (const envelope of session.events({ signal })) {
  const events = normalizeDaemonEvent(envelope, {
    clientId: session.clientId,
    suppressOwnUserEcho: true,
  });
  store.dispatch(events);
}

// 모든 구독자에서 상태 읽기
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## 이벤트 분류 (28개 이상 타입)

`DaemonUiEvent`는 모든 UI 대상 이벤트의 판별 유니언입니다:

### 채팅 스트림 이벤트

| 이벤트                       | 발생 시점                                             |
| ---------------------------- | ----------------------------------------------------- |
| `user.text.delta`            | daemon에서 사용자 메시지 청크가 도착                  |
| `assistant.text.delta`       | 어시스턴트 스트리밍 청크                              |
| `assistant.done`             | 프롬프트 완료 (sendPrompt resolve에서)                |
| `thought.text.delta`         | 에이전트 추론 청크                                    |
| `tool.update`                | 도구 호출 라이프사이클 (running / completed / cancelled) |
| `shell.output`               | 셸 도구 stdout/stderr 청크                            |
| `permission.request`         | 도구가 사용자 인증을 요청                             |
| `permission.resolved`        | 권한 결정이 도착                                      |
| `model.changed`              | 세션 모델 전환                                        |
| `status` / `debug` / `error` | 상태 / 디버그 / 오류 블록                             |

### 세션 메타 이벤트 (PR-A)

| 이벤트                          | 발생 시점                                        |
| ------------------------------- | ------------------------------------------------ |
| `session.metadata.changed`      | 세션 제목 / 표시 이름 업데이트                   |
| `session.approval_mode.changed` | 모드 전환 (plan / default / yolo / auto-edit)    |
| `session.available_commands`    | 슬래시 명령어 목록 새로 고침                     |

### 워크스페이스 이벤트 (PR-A, Wave 3-4)

| 이벤트                                     | 발생 시점                               |
| ------------------------------------------ | --------------------------------------- |
| `workspace.memory.changed`                 | QWEN.md / 메모리 파일 수정              |
| `workspace.agent.changed`                  | 서브에이전트 생성 / 업데이트 / 삭제     |
| `workspace.tool.toggled`                   | 내장 도구 활성화 / 비활성화             |
| `workspace.initialized`                    | `qwen init` 완료                        |
| `workspace.mcp.budget_warning`             | MCP 자식 수가 상한에 근접               |
| `workspace.mcp.child_refused`              | MCP 서버가 예산 문제로 거부             |
| `workspace.mcp.server_restarted`           | 수동 MCP 재시작 성공                    |
| `workspace.mcp.server_restart_refused`     | 수동 재시작 차단됨                      |

### 인증 디바이스 플로우 이벤트 (PR-A, Wave 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

각 이벤트는 daemon의 `deviceFlowId`를 가집니다. 실패 이벤트는 닫힌 열거형 `errorKind`를 가집니다 (닫힌 열거형 — 정식 목록은 `@qwen-code/sdk/daemon`에서 내보내는 `KNOWN_DEVICE_FLOW_ERROR_KINDS`를 참조, 현재: `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`).

## 렌더링 계약 (PR-D)

3개의 프로젝션 헬퍼와 1개의 미리보기 헬퍼. 모두 `block.kind` 또는 `preview.kind`에 따라 판별합니다:

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### 레시피: 트랜스크립트를 마크다운으로 렌더링

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### 레시피: SSR을 위한 sanitized HTML로 렌더링

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // 2단계 파이프라인: 마크다운 → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

또는 내장 보수적 HTML 렌더러를 사용합니다 (마크다운 파싱 없이, HTML 이스케이프만):

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### 레시피: 복사-붙여넣기 일반 텍스트

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## 도구 미리보기 분류 (13가지 종류)

| 종류                  | 표현                                              |
| --------------------- | ------------------------------------------------- |
| `ask_user_question`   | 옵션이 있는 다중 선택 질문                        |
| `command`             | Bash 스타일 명령어 + cwd                          |
| `file_diff`           | oldText/newText 또는 patch가 있는 파일 편집        |
| `file_read`           | 경로 + 선택적 라인 범위                           |
| `web_fetch`           | URL + HTTP 메서드                                 |
| `mcp_invocation`      | MCP 서버 + 도구 + 인수 요약                       |
| `code_block`          | 언어 태그가 있는 코드 스니펫                      |
| `search`              | 쿼리 + 결과 수 + 상위 결과                        |
| `tabular`             | 열 + 행 (최대 50개, 잘림 표시됨)                  |
| `image_generation`    | 프롬프트 + 선택적 썸네일 URL                      |
| `subagent_delegation` | 에이전트 이름 + 작업                              |
| `key_value`           | 일반 라벨/값 행                                   |
| `generic`             | 폴백 요약                                         |

각각 `daemonToolPreviewToMarkdown` 프로젝션을 가집니다. 커스텀 렌더러는 `preview.kind`에 따라 디스패치하여 타입별 풍부한 표시(구문 강조가 있는 파일 diff, MCP 서버 배지, 이미지 썸네일 등)를 할 수 있습니다.

## 상태 셀렉터 (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // daemon 단조 증가 id로 정렬

// PR-K — 서브에이전트 중첩
selectSubagentChildBlocks(state, parentToolCallId); // 직접 자식만
isSubagentChildBlock(block); // 타입 가드: 이 도구가 서브에이전트 내에서 호출되었는가?
```

`currentToolCallId`는 reducer에 의해 자동으로 관리됩니다:

- 도구가 실행 중 상태에 진입할 때 설정 (`running` / `in_progress` / `pending` / `confirming`)
- 도구가 종료 상태에 진입할 때 해제 (`completed` / `failed` / `cancelled` / 기타)
- 알 수 없는 상태는 변경하지 않음 (forward-compat)

## 취소 전파 (PR-E)

`assistant.done.reason === 'cancelled'`일 때, reducer는 모든 실행 중인 도구 블록을 순회하며 상태를 강제로 `'cancelled'`로 설정합니다. Daemon은 부모 프롬프트가 취소될 때 모든 실행 중 도구에 대해 종료 `tool_call_update`를 보장하지 않습니다 — 이 전파는 UI 스피너가 무한히 회전하는 것을 방지합니다.

서브에이전트 자식은 부모와 함께 취소됩니다. 취소는 현재 포인터뿐 아니라 `toolBlockByCallId`의 모든 실행 중인 도구 블록을 순회하기 때문입니다.

## 서브에이전트 중첩 (PR-K)

메인 에이전트가 서브에이전트에 위임할 때(`Task` 도구 또는 동등한 도구), daemon은 **자식** 도구 호출에 `parentToolCallId`와 `subagentType`을 `tool_call._meta`를 통해 기록합니다. Reducer는 둘 다 읽어서:

- `parentToolCallId` + `subagentType`을 `DaemonToolTranscriptBlock`에 미러링합니다
- 부모 블록이 이미 상태에 있을 때 `parentBlockId`(부모의 트랜스크립트 블록 `id`)를 해결합니다; 그렇지 않으면 `undefined`로 두고 부모 블록이 나중에 나타날 때 역충당합니다

순서가 뒤죽박죽인 도착(자식이 부모보다 먼저)은 투명하게 처리됩니다. `maxBlocks`에 의해 부모가 잘린 자식은 셀렉터 쿼리를 위해 `parentToolCallId`를 유지하지만, `parentBlockId`는 null이 됩니다 (dangling id는 더 이상 `blockIndexById`로 해결할 수 없기 때문입니다).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// 부모 도구 블록을 렌더링한 다음 자식을 순회:
function renderToolBlock(state, block) {
  if (block.kind !== 'tool') return renderOther(block);
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {children.length > 0 && (
        <Indent>
          {children.map((c) => renderToolBlock(state, c))}
        </Indent>
      )}
    </ToolBlock>
  );
}

// 또는 렌더링 시 최상위 vs 중첩을 필터링:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks`는 **직접** 자식만 반환합니다. 중첩된 서브에이전트(서브에이전트 내의 서브에이전트)를 렌더링하려면 재귀적으로 순회하세요. Daemon은 사이클을 발생시키지 않지만, `parentBlockId`를 통해 위로 순회하는 렌더러는 여전히 방어적으로 감지해야 합니다 (예: 깊이 제한 또는 방문 집합).

자기 참조(`parentToolCallId === toolCallId`)는 normalizer에 의해 reducer에 도달하기 전에 제거됩니다.

## 시간 시맨틱 (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // 기본 정렬 키 — daemon 단조 증가
  serverTimestamp?: number; // 선호 표시 — daemon 권한
  clientReceivedAt: number; // 폴백 — 로컬 시계
  createdAt: number; // clientReceivedAt의 @deprecated 별칭
}
```

긴 세션을 표시할 때는 **항상 `eventId`로 정렬**하세요 (`selectTranscriptBlocksOrderedByEventId` 사용). daemon 단조 증가 커서는 SSE 재연결 후 재생에서도 유지됩니다. 클라이언트 시계는 그렇지 않습니다.

**항상 `serverTimestamp`에서 표시 타임스탬프를 포맷**하세요 (`clientReceivedAt`으로 폴백). 같은 세션을 보는 여러 클라이언트가 둘 다 daemon 시계에서 읽을 때만 동일한 "5분 전"을 봅니다.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## 어댑터 적합성 (PR-G)

어댑터가 SDK의 레퍼런스 코퍼스를 의미적으로 동일한 출력으로 프로젝션하는지 검증합니다:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('my adapter conforms to daemon UI corpus', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReducer(events),
    renderToText: (state) => myRenderer(state),
  });
  expect(result.failed).toEqual([]);
});
```

픽스처 코퍼스(`DAEMON_UI_CONFORMANCE_FIXTURES`)는 채팅, 도구 라이프사이클, 파일 편집, MCP, 권한, MCP 예산 경고, 취소, 잘못된 페이로드 마스킹, OAuth, 명령어 업데이트, 서브에이전트 중첩을 다룹니다. (개수는 런타임에 확인 가능 — `DAEMON_UI_CONFORMANCE_FIXTURES.length`를 읽으세요.)

**포맷 비의존** — 어댑터가 ANSI / HTML / 마크다운 / JSX로 렌더링할 수 있으며, 프레임워크는 `expectedContains`와 `expectedAbsent`를 통해 의미적 내용만 검사합니다.

## 오류 분류 (PR-A)

`DaemonUiErrorEvent.errorKind`는 daemon의 타입화된 오류 분류에서 전파되는 닫힌 열거형입니다(daemon이 기록할 때):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

렌더러는 실행 가능한 어포던스를 위해 `errorKind`로 분기해야 합니다:

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Re-authenticate</button>;
    case 'missing_file':   return <button>Choose file</button>;
    case 'blocked_egress': return <span>Network blocked — check proxy</span>;
    default:               return null;
  }
}
```

## 도구 출처 디스패치 (PR-A)

`DaemonUiToolUpdateEvent.provenance`는 닫힌 열거형입니다 (`builtin` / `mcp` / `subagent` / `unknown`). `mcp`일 때 `serverId?: string`가 포함됩니다. 아이콘 디스패치와 배징에 사용합니다:

```ts
function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':      return <McpIcon server={event.serverId} />;
    case 'subagent': return <SubagentIcon />;
    case 'builtin':  return <BuiltinIcon name={event.toolName} />;
    default:         return <GenericIcon />;
  }
}
```

SDK에는 `mcp__<server>__<tool>` 명명 휴리스틱 폴백이 있습니다 — daemon이 명시적으로 provenance를 기록하지 않아도 MCP 도구를 감지할 수 있습니다.

## 디버그 이유 분류

`DaemonUiStatusEvent.debugReason`는 normalizer가 타입화된 이벤트 대신 `debug` 블록을 프로젝션할 때 기록하는 닫힌 열거형입니다(`DaemonStatusTranscriptBlock`에도 미러링됨):

```ts
import type { DaemonUiDebugReason } from '@qwen-code/sdk/daemon';
// 'unrecognized_event' | 'unrecognized_session_update' | 'malformed_payload'
```

정식 목록은 `DAEMON_UI_DEBUG_REASONS`로 내보냅니다. 이유 이름은 와일드카드 이름 범주입니다: `unrecognized_*`는 daemon이 이 SDK 버전에 case가 없는 프레임을 보낸 것을 의미합니다 — forward-compat 노이즈이며 대화 콘텐츠가 아닌 개발자 진단입니다. `malformed_*`는 SDK가 _알고 있는_ 프레임이 사용 불가능한 페이로드로 도착한 것을 의미합니다 — 실제 결함 신호입니다.

렌더러는 디버그 텍스트가 아닌 `debugReason`로 분기해야 합니다 — 텍스트 접두사는 진단 문구이며 예고 없이 변경됩니다:

```ts
function hideDebugBlock(reason?: DaemonUiDebugReason): boolean {
  // forward-compat 노이즈를 범주별로 숨겨서 새로운 SDK가 추가하는 이유도
  // 자동으로 커버됩니다. 결함 신호와 클라이언트가 디스패치한 디버그
  // 이벤트(이유를 가지지 않음)는 렌더링을 유지합니다.
  return reason?.startsWith('unrecognized_') ?? false;
}
```

`status` 이벤트는 `debugReason`를 가지지 않으며, 클라이언트 자체가 디스패치한 디버그 이벤트(예: Web Shell의 모델 전환 요약)도 가지지 않습니다 — 둘 다 렌더링을 유지해야 합니다.

## Forward-compat 원칙

daemon UI SDK의 모든 계층은 **forward-compat 원칙**을 따릅니다: 알 수 없는 값은 예외를 발생시키지 않으며, 점진적으로 저하됩니다.

- 알 수 없는 daemon 이벤트 타입 → 원시 타입 이름을 가진 `debug` 이벤트, `unrecognized_*` `debugReason` 기록(위 참조)
- 알 수 없는 도구 상태 → `currentToolCallId` 변경 없음 (해제하지 않음)
- 알 수 없는 오류 종류 → `errorKind` undefined (렌더러가 텍스트로 폴백)
- 누락된 serverTimestamp → `clientReceivedAt`으로 폴백
- 인식할 수 없는 미리보기 형태 → `summary`가 있는 `generic` 종류

즉, **SDK는 daemon 방출보다 먼저 배포할 수 있습니다**. PR-A의 도구 provenance 휴리스틱, PR-B의 3위치 타임스탬프 추출, PR-E의 알 수 없는 상태 보존은 모두 "daemon이 보내면 준비되고, 보내지 않으면 안전한" 예시입니다.

## 관련 링크

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — 공유 UI 트랜스크립트 레이어가 포함된 기본 PR
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — 이 PR (통합 완전성 후속)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — daemon 모드 제안
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — Mode B v0.16 구현 트래커

