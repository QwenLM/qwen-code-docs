# `@qwen-code/sdk/daemon` v2 마이그레이션

PR #4328에서 v1 daemon UI 레이어가 출시되었고, PR #4353(이 PR)에서 7개의 추가적 기능 커밋과 함께 v2가 출시되었습니다. 이 가이드는 웹 채팅 및 웹 터미널 어댑터 작성자를 대상으로 변경 사항을 설명합니다. 네이티브 로컬 TUI, 채널 및 IDE 유지보수자도 동일한 프리미티브를 재사용할 수 있지만, 해당 기본 제품 경로는 이 PR에서 마이그레이션되지 않습니다.

## 기존 소비자를 위한 요약

**Breaking changes 없음.** 이 PR의 모든 커밋은 추가적입니다:

- v1 필드는 여전히 작동합니다(`createdAt`은 `clientReceivedAt`의 `@deprecated` 별칭으로 보존됨)
- v1 노멀라이저는 여전히 13개의 이벤트 타입을 동일하게 매핑합니다
- v1 리듀서는 여전히 채팅 이벤트에 대해 동일한 블록을 생성합니다
- 새 API는 추가 매개변수와 헬퍼를 통해 옵트인 방식입니다

이 PR은 소비자 변경 없이 안전하게 병합할 수 있습니다. **새 기능의 채택은 점진적입니다.**

## 권장 채택 순서

각 어댑터에 대해, 노력/가치 비율 순으로:

### 1. 정렬: 정렬 키를 `createdAt`에서 `eventId`로 전환

**이전:**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**이후:**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**이유**: `eventId`는 daemon 단조 증가값이며 SSE 재연결 후 재생에서도 유지됩니다. `createdAt`은 클라이언트 시계이며 재생 시(shift) 문제가 있습니다.

### 2. 표시: `createdAt`을 `serverTimestamp ?? clientReceivedAt`으로 전환

**이전:**

```tsx
<TimeLabel ms={block.createdAt} />
```

**이후:**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**이유**: 여러 클라이언트가 일관된 "X분 전"을 보려면 둘 다 daemon 시계를 읽어야 합니다. 렌더러에 `formatBlockTimestamp`을 더하면 시간대 + 로일을 처리합니다.

**참고**: Daemon이 엔벨로프에 `_meta.serverTimestamp`를 스탬프해야 적용됩니다. SDK는 포워드 호환 준비가 되어 있으며, 그 전까지는 `clientReceivedAt`으로 폴백합니다.

### 3. 새 이벤트 타입 수신 — 렌더링할 서브셋 선택

16개의 새 이벤트 타입(session-meta, workspace, auth)은 트랜스크립트 블록을 푸시하지 않습니다. 사이드채널 관찰입니다. 각 어댑터에서 표시할 것을 선택합니다:

```ts
// SSE 소비자에서
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// UI 측에서
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `MCP servers approaching budget: ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... 등, UI에 필요한 것을 옵트인
  }
}
```

또는 상태 미러링 사이드채널에 셀렉터를 사용합니다:

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // approval_mode.changed에서 미러링
const currentTool = selectCurrentTool(state); // 현재 진행 중인 도구
```

### 4. 렌더링 계약: `daemonBlockToMarkdown`(또는 HTML / plainText) 사용

**이전** (각 어댑터가 자체 프로젝션 수행):

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `You: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... 등
  }
}
```

**이후** (SDK에 위임):

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

HTML SSR의 경우:

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

일반 텍스트의 경우:

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. 적합성 테스트

어댑터의 테스트 스위트에 추가:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('adapter projects daemon UI corpus correctly', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

이것은 어댑터를 10개의 픽스처 시나리오에 대해 실행하고 사용자에게 도달하기 전에 프로젝션 드리프트를 발견합니다.

### 6. `provenance`를 통한 도구 아이콘 디스패치

**이전** (toolName에 대한 문자열 매칭):

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**이후** (PR-A의 타입화된 provenance):

```tsx
import type { DaemonUiToolUpdateEvent } from '@qwen-code/sdk/daemon';

function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':
      return <McpIcon server={event.serverId} />;
    case 'subagent':
      return <SubagentIcon />;
    case 'builtin':
      return <BuiltinIcon name={event.toolName} />;
    case 'unknown':
    default:
      return <GenericIcon />;
  }
}
```

SDK에는 `mcp__<server>__<tool>` 명명 휴리스틱 폴백이 있으며 — daemon이 명시적으로 provenance를 스탬프하지 않아도 오늘 작동합니다.

### 7. `errorKind`를 통한 오류 분류

**이전** (텍스트에 대한 정규식):

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**이후** (PR-A의 닫힌 열거형):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';

function errorAction(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <RetryAuthButton />;
    case 'missing_file':   return <FilePicker />;
    case 'blocked_egress': return <CheckProxyHint />;
    case 'init_timeout':   return <RestartDaemonButton />;
    default:               return null;
  }
}
```

**참고**: Daemon이 session_died / stream_error에 `data.errorKind`를 스탬프해야 채워집니다. SDK는 이미 이를 읽습니다.

### 8. 취소 처리 — 이미 자동

v1에서는 취소된 프롬프트가 진행 중인 도구 블록을 무한히 스핀 상태로 두었습니다. v2(PR-E)에서는 `propagateCancellationToInFlightTools`가 `assistant.done.reason === 'cancelled'`에서 자동으로 실행됩니다. 서브에이전트 자식은 부모와 함께 취소됩니다.

**어댑터 변경 불필요** — 스핀너가 올바르게 해결됩니다.

### 8a. 서브에이전트 중첩 — 중첩 렌더링 옵트인 (PR-K)

서브에이전트 위임 내에서 호출된 도구 블록은 이제 `parentToolCallId`, `subagentType` 및 (부모가 상태에 있는 경우) `parentBlockId`를 가집니다. 어댑터는 중첩 렌더링을 옵트인할 수 있습니다:

**이전** (평면 목록, 서브에이전트 호출이 최상위와 시각적으로 구별 불가):

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**이후** (재귀적 중첩 렌더링):

```tsx
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

function renderTool(block) {
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {block.subagentType && <SubagentBadge type={block.subagentType} />}
      {children.length > 0 && <Indent>{children.map(renderTool)}</Indent>}
    </ToolBlock>
  );
}

const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
return topLevel.map(renderTool);
```

**평면 뷰를 선호하면 어댑터 변경 불필요** — 새 필드는 추가적이며 읽지 않는 코드에서는 무시됩니다.

### 9. 도구 미리보기 분류 — 사용자 정의 컴포넌트로 렌더링할 서브셋 선택

PR-D + PR-F는 13개의 미리보기 종류를 제공합니다:

- 4개 파일 형태: `file_diff`, `file_read`, `web_fetch`, `mcp_invocation`
- 5개 콘텐츠 형태: `code_block`, `search`, `tabular`, `image_generation`, `subagent_delegation`
- 2개 제어: `ask_user_question`, `command`
- 2개 일반: `key_value`, `generic`

각 어댑터는 `preview.kind`에 따라 디스패치합니다:

```tsx
function ToolPreviewComponent({ preview }: { preview: DaemonToolPreview }) {
  switch (preview.kind) {
    case 'file_diff':
      return (
        <UnifiedDiffView
          path={preview.path}
          old={preview.oldText}
          new={preview.newText}
        />
      );
    case 'mcp_invocation':
      return (
        <McpCard serverId={preview.serverId} toolName={preview.toolName} />
      );
    case 'tabular':
      return <DataTable columns={preview.columns} rows={preview.rows} />;
    case 'image_generation':
      return (
        <ImagePreview
          thumbnailUrl={preview.thumbnailUrl}
          prompt={preview.prompt}
        />
      );
    // ... 또는 폴백:
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

13개 종류 모두에 대한 사용자 정의 컴포넌트가 없는 어댑터는 처리되지 않은 종류에 대해 SDK의 `daemonToolPreviewToMarkdown`으로 폴백할 수 있습니다.

## 하위 호환성 체크리스트

| Concern                                                | Status                                        |
| ------------------------------------------------------ | --------------------------------------------- |
| Existing `block.createdAt` reads                       | ✅ still works (alias for `clientReceivedAt`) |
| Existing reducer event handling                        | ✅ unchanged for v1 event types               |
| `daemonTranscriptToUnifiedMessages(blocks)` call sites | ✅ new options param is optional              |
| Existing `selectTranscriptBlocks` consumers            | ✅ unchanged                                  |
| New event types in v1 reducer                          | ✅ no-op, `lastEventId` still advances        |

## 교차 참조

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [Daemon UI README](./README.md) — 전체 API 레퍼런스
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — 공유 UI 트랜스크립트 레이어가 포함된 기본 PR
