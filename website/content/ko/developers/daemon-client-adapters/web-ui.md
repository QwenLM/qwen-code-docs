# Daemon Web UI 어댑터

## 목표

Web chat 및 web terminal 클라이언트는 daemon HTTP/SSE API를 통해 `qwen serve`를 소비하고 클라이언트 측 트랜스크립트를 렌더링해야 합니다. 네이티브 로컬 TUI, channel 및 IDE 통합은 당분간 기존 기본 경로를 유지합니다.

## 공유 UI 계약

TypeScript SDK daemon UI 내보내기를 공통 경계로 사용합니다:

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

구분은 다음과 같습니다:

- `DaemonClient`는 daemon HTTP 라우트를 처리합니다.
- `DaemonSessionClient`는 세션 생성/첨부 및 SSE replay를 소유합니다.
- `normalizeDaemonEvent()`는 daemon wire 이벤트를 UI 이벤트로 변환합니다.
- `createDaemonTranscriptStore()`는 UI 이벤트를 트랜스크립트 블록으로 축소합니다.

React 클라이언트는 선택적 `@qwen-code/webui` 바인딩을 사용할 수 있습니다:

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

최소 React 형태:

```tsx
function App() {
  return (
    <DaemonSessionProvider baseUrl="http://127.0.0.1:4170">
      <Transcript />
      <PromptBox />
    </DaemonSessionProvider>
  );
}

function Transcript() {
  const blocks = useDaemonTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

provider는 daemon 세션을 생성 또는 첨부하고, SSE를 구독하고, `DaemonSessionClient`에 마지막 이벤트 ID를 유지하며, 기본적으로 스트림을 재연결합니다. 테스트나 사용자 정의 연결 관리를 위해 `autoReconnect={false}`로 비활성화할 수 있습니다.

## 브라우저 배포 형태

### Same-Origin 로컬 POC

Daemon이 제공하는 페이지는 페이지와 API가 동일한 origin을 공유하므로 daemon에 직접 호출할 수 있습니다. 이것은 로컬 web chat 및 web terminal 검증을 위한 선호되는 초기 POC 형태입니다.

### 원격 Web Chat / Web Terminal

프로덕션 원격 web 앱은 일반적으로 backend-for-frontend와 통신해야 합니다. BFF가 daemon URL, 토큰, 워크스페이스 라우팅 및 세션 메타데이터를 소유하고, 브라우저 안전한 앱 이벤트를 브라우저로 전달합니다. 이렇게 하면 bearer 토큰이 브라우저 저장소에 노출되지 않으며, 배포에서 사용자가 접근할 수 있는 daemon/workspace를 결정할 수 있습니다.

### 로컬 브라우저에서 로컬 Daemon으로

별도 로컬 개발 서버는 `qwen serve`와 cross-origin이므로, daemon 라우트를 동일한 origin으로 프록시하거나 daemon이 제공해야 합니다. Daemon은 임의의 브라우저 `Origin` 요청을 의도적으로 거부합니다.

## 렌더링 책임

공유 트랜스크립트 모델은 시각적이 아닌 의미적입니다. UI 클라이언트가 렌더링 방식을 결정합니다:

- 사용자 및 어시스턴트 메시지 블록
- 접힌 사고 블록
- 도구 상태 카드
- 셸 출력 블록
- 권한 요청 컨트롤
- 상태/오류/디버그 블록

Web terminal은 브라우저 네이티브 의미적 렌더러입니다. 모노스페이스 레이아웃, 스크롤백, 프롬프트 입력, 단축키 및 스트리밍 블록으로 터미널 같은 느낌과 외관을 가져야 하지만, 원시 PTY 프록시가 아니며 서버 측 Ink 렌더링이 필요하지 않습니다.

## 병합 안전성

- 네이티브 `qwen` TUI는 직접적이고 변경되지 않은 상태로 유지됨.
- `--acp`, channel 및 IDE 경로는 기본적으로 변경되지 않음.
- SDK UI 코어는 추가적임.
- WebUI React 바인딩은 선택적이며 이를 가져오는 클라이언트에서만 실행됨.
- 제거된 daemon TUI 스파이크 코드는 제품 마이그레이션으로 간주되지 않음.

## 후속 작업

- Daemon이 제공하는 로컬 `/web` POC 또는 동등한 same-origin web 앱을 추가합니다.
- 트랜스크립트 블록 위에 일급 chat 및 terminal 렌더러를 구축합니다.
- 기존 daemon 이벤트가 안정적인 브라우저 UI 동작에 너무 저수준인 경우에만 더 풍부한 타입화된 이벤트를 추가합니다.
- SDK가 아닌 소비자가 UI 코어를 독립적 의존성으로 필요로 하는 경우 전용 `@qwen-code/daemon-ui-core` 패키지를 고려합니다.
