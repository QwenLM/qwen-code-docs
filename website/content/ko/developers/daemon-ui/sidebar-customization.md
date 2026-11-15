# WebShell 사이드바 — 커스터마이징 가이드

`WebShellSidebar`는 web-shell `App` 컴포넌트 내부에 렌더링되는 세션 목록 및 네비게이션 패널입니다. 이 문서는 각 시각적 영역을 현재 커스터마이징 기능에 매핑하고 외부 주입 포인트가 없는 영역을 식별합니다.

## 사이드바 활성화

사이드바의 기본값은 **Home만**: 하단에 접기 컨트롤이 있는 300px 세션 열입니다. `sidebar`를 생략하거나 `true`를 전달하거나 `{}`를 전달하면 이 기본값이 사용됩니다. 사이드바를 숨기려면 `sidebar={false}` 또는 `{ enabled: false }`를 전달합니다.

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // Home만 기본값
  // 또는 세분화된 옵션 사용:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## 레이아웃 개요

Home-only 호스트는 브랜딩, New session, 워크스페이스, 아카이브된 세션, 접기 컨트롤을 하나의 열에 표시합니다. 다른 사용 가능한 기본 엔트리나 푸터 액션을 구성하면 기본 300px 보조 열 옆에 56px 아이콘 레일이 추가됩니다. 기본 엔트리는 레일에 위치하고, 푸터 액션과 버전은 More에 위치합니다. 커스텀 렌더러는 넓은 Home 열에 남아 있습니다. 공개 레이아웃 옵션은 없습니다.

**Breaking change:** 이전에는 `sidebar`를 생략하면 사이드바가 숨겨졌고, 사이드바가 활성화되었을 때 네비게이션/푸터 항목 목록을 생략하면 모든 내장 항목이 노출되었습니다. 이제 호스트는 이전의 숨김 기본값을 유지하려면 `sidebar={false}`를 전달하거나 필요한 항목을 명시적으로 나열해야 합니다. Standalone Web Shell은 전체 메뉴를 명시적으로 구성합니다. `branding.hideWhenCompact`는 이제 `false`가 기본값입니다. 컴팩트 서랍에서 숨겨진 브랜딩을 유지하려면 `true`로 설정합니다.

## 커스터마이징 가능한 영역

### ① 브랜딩 — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // 전체 브랜딩 행을 교체
  hideWhenCompact?: boolean; // 컴팩트 서랍에서 브랜딩 숨김 (기본값: false)
}
```

| 값                               | 효과                                              |
| -------------------------------- | ------------------------------------------------- |
| `undefined` (기본값)             | 해결된 브랜드: `brand` prop → 데몬 `GET /brand` → 내장 Qwen 로고 + "Qwen Code" 텍스트 |
| `false`                          | 브랜딩 행 전체 숨김                               |
| `{ render: () => <MyHeader /> }` | 커스텀 콘텐츠로 전체 교체                         |
| `{ hideWhenCompact: false }`     | 컴팩트 서랍에서 브랜딩을 계속 표시 (기본값)        |

```tsx
sidebar={{
  branding: {
    render: () => (
      <div style={{ display: 'flex', gap: 8 }}>
        <img src="/my-logo.svg" alt="" width={24} />
        <span>My App</span>
      </div>
    ),
  },
}}
```

### ② 기본 네비게이션 — `primaryNav`

```ts
type WebShellSidebarPrimaryNavItem =
  | 'newTask' // ✏️ New session 버튼
  | 'plugins' // 🧩 Plugins 버튼
  | 'channels' // 채널 세션 및 설정
  | 'live' // Live 세션 및 설정; showLive 필요
  | 'workflows' // 워크플로 지원 필요
  | 'managed' // 관리형 에이전트 제공자 필요
  | 'scheduledTasks' // 📅 Scheduled Tasks 버튼
  | 'goals'; // 🎯 Goals 버튼

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // 표시할 내장 버튼 (기본값: ['newTask'])
  render?: () => ReactNode; // 내장 버튼 뒤에 추가할 커스텀 콘텐츠
}
```

기본 네비게이션 영역에는 `items`로 제어되는 내장 버튼이 포함됩니다:

- `items`를 지정하지 않으면 New session만 표시됩니다; Home은 항상 존재합니다
- `items`를 지정하면 나열된 버튼만 표시됩니다
- `render()`를 통해 내장 버튼 뒤에 커스텀 콘텐츠를 추가할 수 있습니다

| 값                                         | 효과                                   |
| ------------------------------------------ | -------------------------------------- |
| `undefined` (기본값)                       | Home with New session                                 |
| `{ items: ['plugins'] }`                   | Home과 Plugins; New session 버튼 없음               |
| `{ items: ['plugins', 'scheduledTasks'] }` | Home + Plugins + Scheduled Tasks                      |
| `{ items: [], render: () => ... }`         | Home with 커스텀 콘텐츠; 내장 기본 버튼 없음          |

```tsx
sidebar={{
  primaryNav: {
    items: ['plugins', 'scheduledTasks'],  // newTask와 goals 숨김
    render: () => (
      <button onClick={() => console.log('custom action')}>
        🔗 Data Sync
      </button>
    ),
  },
}}
```

### ④ 푸터 — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ 설정 패널
  | 'update' // 지원될 때 업데이트 액션
  | 'localFiles' // 사용 가능할 때 로컬 파일 브리지
  | 'desktopRelay' // 기존 데스크톱 릴레이를 통해 이 컴퓨터 사용
  | 'workspacesOverview' // 잠금 해제 시 워크스페이스 관리
  | 'version' // 버전 라벨 (예: "v0.19.10")
  | 'theme' // ☀/🌙 라이트/다크 토글
  | 'sessionsOverview' // ▦ 세션 개요 패널
  | 'splitView' // ◧ 분할 보기 (셸 컨테이너 최소 1024px 너비)
  | 'daemonStatus' // 📊 데몬 상태 패널
  | 'collapse'; // ◁/▷ 접기/펼치기 토글

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // 표시할 내장 항목 (기본값: ['collapse'])
  render?: () => ReactNode; // Home 푸터의 커스텀 콘텐츠
}
```

| 값                                           | 효과                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `undefined` (기본값)                          | 접기/펼치기만 표시                                                            |
| `false`                                        | 푸터 숨김; 모바일 서랍은 닫기 컨트롤만 유지                                  |
| `{ items: ['settings', 'theme', 'collapse'] }` | 나열된 항목만 표시; 모바일 서랍은 항상 닫기 컨트롤을 유지                    |

레일 레이아웃에서 푸터 액션과 버전은 More에 나타나고, 접기/펼치기 컨트롤만 레일 하단에 남습니다. Home-only 모드는 기존 컴팩트 푸터 동작을 유지합니다.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // 최소화된 푸터
}}
```

`render()`를 통한 커스텀 콘텐츠는 넓은 Home 푸터에 표시됩니다:

```tsx
sidebar={{
  footer: {
    items: ['collapse'],
    render: () => (
      <button onClick={() => openHelpCenter()}>
        ❓ Help
      </button>
    ),
  },
}}
```

**참고:** `'scheduledTasks'`와 `'goals'`는 기본 네비게이션 영역(②)으로 이동되었으며 임베디드 호스트에서 명시적 구성이 필요합니다. `footer.items`가 아닌 `primaryNav.items`로 제어됩니다.

### 기타 최상위 옵션

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // 사이드바 표시/숨김 (기본값: true, sidebar 생략 시에도 포함)
  defaultCollapsed?: boolean; // 초기 접힌 상태 (localStorage에 저장)
  showCompactToggle?: boolean; // 채팅 영역에 접기 버튼 표시 (기본값: true)
  showSessionSourceSwitch?: boolean; // Tasks/Channels 전환 표시 (기본값: true)
  showLive?: boolean; // 데몬 소유 Live 대화 표시 (기본값: false)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // "Workspaces" 헤더 행 숨김 (기본값: false = 표시)
  sessionActions?: WebShellSidebarSessionActionsOptions;
  footer?: false | WebShellSidebarFooterOptions;
}
```

### 세션 소스 전환 — `showSessionSourceSwitch`

임베딩 호스트에서 일반 작업 세션만 표시하려면 `showSessionSourceSwitch`를 `false`로 설정합니다:

```tsx
sidebar={{
  showSessionSourceSwitch: false,
}}
```

이렇게 하면 Tasks/Channels 전환이 제거되고 모든 활성, 아카이브, 기본, 보조 세션 쿼리가 `sourceType: "default"`로 고정됩니다. 이 옵션을 생략하면 채널 세션 접근이 유지됩니다. 전용 Channels 레일 엔트리가 사용 가능하면 소스 탭을 대체하고, 그렇지 않으면 탭이 유지됩니다.

### Live 대화 — `showLive`

Live 대화는 기본적으로 임베딩 호스트에서 숨겨집니다. 호스트에서 데몬 소유 Live 그룹을 노출해야 하는 경우 옵트인합니다:

이전 릴리스에서는 명시적 옵션 없이 이 그룹을 표시했으므로, 이에 의존하는 호스트는 업그레이드 시 `showLive: true`를 설정해야 합니다.

```tsx
sidebar={{
  showLive: true,
  primaryNav: { items: ['newTask', 'live'] },
}}
```

`live` 기본 엔트리 없이 `showLive: true`는 Home과 Experimental 설정에서 기존 Live 그룹을 유지합니다. 해당 엔트리가 있으면 Live는 자체 세션 열과 설정 페이지를 엽니다.

### ③ 워크스페이스 헤더 — `hideProjectHeader`

"Workspaces" 헤더 행(접기 토글, 검색 아이콘, 워크스페이스 추가 버튼이 있는 행)의 표시 여부를 제어합니다. 기본값은 `false`(표시)입니다.

```tsx
sidebar={{
  hideProjectHeader: true,  // "Workspaces ▼ [🔍] [＋]" 행 숨김
}}
```

숨겨져도 세션 목록 항목과 아카이브된 세션은 계속 표시됩니다 — 액션 버튼과 세션 검색 바가 있는 헤더 행만 제거됩니다.

### 세션 행 액션 — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Details (드롭다운 하위 메뉴)
  | 'rename' // ✏️ Rename (드롭다운 메뉴)
  | 'bindPr' // 🔗 GitHub PR 바인딩 (드롭다운 메뉴)
  | 'group' // 📁 Group/폴더로 이동 (드롭다운 메뉴)
  | 'export' // 📤 채팅 내보내기 (드롭다운 메뉴)
  | 'delete' // 🗑 세션 삭제 (드롭다운 메뉴)
  | 'pin' // 📌 Pin/Unpin (인라인 버튼)
  | 'archive' // 📦 Archive (드롭다운 메뉴)
  | 'split'; // ◫ 분할 보기에 추가 (드롭다운 메뉴)

/** 작동하는 인라인(호버 버튼) 핸들러가 있는 서브셋. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // 표시할 액션 (기본값: 모두)
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // 인라인 버튼으로 표시할 항목 (기본값: ['pin'])
}
```

세션 행에 표시되는 액션 버튼을 제어합니다:

- **`items`**: 모든 액션(인라인 및 드롭다운 모두)에 대한 마스터 제어. 항목이 `items`에 없으면 모든 곳에서 숨겨집니다.
- **`inlineItems`**: 어떤 항목이 **인라인 버튼**(호버 시)으로 나타나는지 제어합니다. 기본값은 `['pin']`입니다. 작동하는 인라인 핸들러가 있는 항목만 사용 가능합니다: `'pin'`, `'rename'`, `'export'`, `'delete'`. `'details'`, `'bindPr'`, `'group'`, `'archive'`, `'split'`은 표준 행에서 드롭다운 전용입니다.
- **`bindPr` 내장 조건**: 세션이 메타데이터 변경을 지원할 때만 표시됩니다 — 기본 또는 잠긴 워크스페이스의 현재 세션, 또는 `workspace_session_metadata` 기능이 있는 다른 세션(해당 세션이 잠기거나 제한된 보조 워크스페이스에 있는 경우 `workspace_qualified_rest_core`도 필요) — 그리고 행이 독립 실행형 세션(최근 행 포함)가 아닌 경우. 독립 실행형 메타데이터 라우트는 표시 이름만 허용합니다. 이것은 `rename` 항목과 독립적입니다: 호스트는 `rename` 없이 `bindPr`을 허용 목록에 추가할 수 있습니다.

설정에서 아카이브된 행은 Export conversation과 Restore를 인라인 버튼으로 사용하며, Rename과 Delete는 More에 있습니다. 이들의 액션은 여전히 `items`와 내장 가용성 제한을 따르며, `inlineItems`는 이 레이아웃을 변경하지 않습니다. 기존 스타일은 호버 또는 키보드 포커스에서 이러한 버튼을 표시하고 터치 디바이스에서 계속 표시합니다.

**표준 행의 표시 우선순위**: 인라인 버튼이 표시되려면 `items` AND 항목의 내장 조건 AND `inlineItems`가 모두 통과해야 합니다. 예를 들어, `delete`를 인라인으로 표시하려면 `items`에 `'delete'`가 포함되고 `inlineItems`에도 `'delete'`가 포함되어야 합니다.

| 값                                     | 효과                                     |
| ---------------------------------------- | ------------------------------------------ |
| `undefined` (기본값)                    | 모든 액션 표시, pin만 인라인               |
| `{ inlineItems: ['pin', 'delete'] }`     | Pin + delete를 인라인 버튼으로             |
| `{ inlineItems: [] }`                    | 표준 행에 인라인 버튼 없음                 |
| `{ inlineItems: ['rename', 'export'] }` | Rename + export를 인라인 버튼으로          |

드롭다운 트리거(⋮)는 활성화된 드롭다운 항목이 없으면 자동으로 숨겨집니다. 인라인 버튼은 기능 조건과 `items`가 모두 포함할 때만 표시됩니다. Archive는 현재 세션과 실행 중인 턴이 있는 세션에서는 비활성화됩니다. 데몬이 아카이브 시 라이브 세션을 닫기 때문입니다.

`'split'`은 다른 항목과 마찬가지로 기본적으로 활성화되어 있지만, 호스트가 `onAddSessionToSplitView`를 연결할 때만 적용됩니다. 사이드바는 용량을 위해 `splitSessionIds` prop도 읽습니다: 분할 보기에 이미 열려 있는 세션은 설명적인 title과 함께 항목을 비활성화로 렌더링하며, 창 제한 사례와 분할 보기가 닫혀 있는 동안의 현재 세션도 마찬가지입니다.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // 표시할 액션 (마스터 제어)
    inlineItems: ['pin', 'delete'],  // pin + delete를 인라인 버튼으로
  },
}}
```

## 커스터마이징 불가능한 영역

### 워크스페이스 (세션 목록 내부)

세션 목록이 표시될 때, 다음 하위 영역은 렌더링되지만 **개별적으로 커스터마이징할 수 없습니다**:

| 측면                | 세부 사항                                                       |
| --------------------- | ----------------------------------------------------------------- |
| 데이터 소스           | `useSessions()` hook → 데몬 API (`/sessions` 엔드포인트)          |
| 세션 목록 정렬        | 생성 시간 기준, 내림차순                                          |
| 세션 행 렌더링        | 내부 `renderSessionRow` `useCallback` — 주입 불가                 |
| 검색 / 필터           | 클라이언트 측 텍스트 매칭이 있는 내장 검색 바                     |
| 세션 그룹             | 6개 프리셋 색상 + 커스텀 hex가 있는 `SessionGroupSection` 컴포넌트  |
| 워크스페이스 섹션     | 데몬 워크스페이스별 `WorkspaceSection`, 교체 불가                 |
| 워크스페이스 추가 대화 상자 | 내장 `AddWorkspaceDialog`                                     |

### ⑤ 리사이즈 핸들

- 오른쪽 가장자리의 드래그 핸들로 사이드바 너비 조정
- 너비는 localStorage에 총 사이드바 너비로 저장됩니다. 기본값은 Home-only 300px, 레일 포함 356px입니다. 복원된 너비는 Home-only 최소 220px, 레일 포함 최소 276px으로 제한됩니다; 이전 값이 56px만큼 무작정 증가되지 않습니다. 접기 임계값 이하로 드래그하면 사이드바가 접힙니다.
- 환경 패널의 도크 브레이크포인트는 레일의 56px을 무시합니다(메시지 영역이 양보하므로), 패널은 Home-only 사이드바와 동일한 창 너비에서 도킹됩니다 — 예: 1440px 창.
- 설정 불가

## 런타임 동작 prop

다음 `WebShellProps`는 사이드바 동작에 간접적으로 영향을 줍니다:

| Prop                            | 효과                                 |
| ------------------------------- | -------------------------------------- |
| `onNewSession`                  | 새 세션 핸들러 오버라이드              |
| `onLoadSession`                 | 세션 로딩 로직 오버라이드              |
| `onSessionIdChange`             | 세션 전환에 반응                       |
| `splitSessionIds`               | 분할 보기 세션을 외부에서 제어         |
| `theme` / `onThemeChange`       | 테마 제어 / 관찰                       |
| `language` / `onLanguageChange` | UI 언어 제어 / 관찰                    |

## 접힌 상태 및 모바일 상태

| 상태      | 동작                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- |
| 확장됨    | 텍스트 라벨이 있는 전체 사이드바                                                                      |
| 접힘      | Home-only: 기존 56px 스트립 및 호버 세션; 레일 포함: 56px 기본 레일만                                 |
| 모바일    | 서랍이 컨테이너의 70%를 사용하며 너비 제한 내에서 표시되고, 배경 오버레이와 푸터 닫기 컨트롤이 포함됨 |

접힌 상태는 `qwen-code-web-shell-sidebar-collapsed` 키로 `localStorage`에 저장됩니다.

사이드바, 컴팩트 서랍, 빈 채팅 환영 크롬은 셸 컨테이너 너비를 따릅니다(760px에서 컴팩트); 채팅 메시지 콘텐츠는 뷰포트 기반 브레이크포인트를 유지합니다. 분할 보기는 1024px을 사용하고 분할 사이드바 공간은 1200px을 사용합니다. 키보드 접기는 숨겨진 보조 열에서 레일 컨트롤로 포커스를 이동합니다.

리사이즈된 데스크톱 너비는 확장된 레이아웃에서만 복원됩니다. 모바일 서랍을 열거나 닫아도 해당 너비나 저장된 데스크톱 접기 설정이 덮어쓰이지 않습니다.

## 소스 위치

| 컴포넌트          | 파일                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| WebShellSidebar     | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`    |
| WorkspaceSection    | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Sidebar 스타일      | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| App 통합            | `packages/web-shell/client/App.tsx` (`WebShellSidebar` 검색)              |
| 엔트리 포인트 (개발) | `packages/web-shell/client/main.tsx` (명시적 기본 및 푸터 항목 목록)                    |
