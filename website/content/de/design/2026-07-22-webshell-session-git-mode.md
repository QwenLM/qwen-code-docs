# Git-Modus-Auswahl für neue Sessions in der Web Shell

## Hintergrund

In der täglichen Entwicklung haben Nutzer beim Erstellen einer neuen Session
drei Git-Workflows:

1. **Aktueller Branch** — direkt auf dem aktuellen Branch entwickeln
   (Standardverhalten)
2. **Worktree-Isolation** — einen unabhängigen Worktree + Branch erstellen,
   das Hauptverzeichnis bleibt unberührt
3. **Neuer Branch** — einen neuen Branch im selben Arbeitsverzeichnis
   erstellen und dorthin wechseln

Szenario 1 und 2 sind bereits vollständig unterstützt (Szenario 2 siehe
[2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md)
und
[2026-07-20-worktree-empty-state-toggle.md](./2026-07-20-worktree-empty-state-toggle.md)).
Szenario 3 fehlt — wenn Nutzer „einen neuen Branch für diesen Task erstellen"
wollen, müssen sie erst manuell `git checkout -b` ausführen und dann eine
Session erstellen, oder sie sind gezwungen, einen Worktree zu verwenden (was
eine unnötige Verzeichnis-Isolation einführt).

## Ziele

- Im Chat-Empty-State einen einheitlichen **Git-Modus-Selektor**
  bereitstellen, der die drei Szenarien abdeckt.
- „Neuer Branch"-Modus: Der Daemon führt bei `POST /session` automatisch
  `git checkout -b` aus, die Session startet direkt auf dem neuen Branch.
- Die bestehende Worktree-Erstellungskette wiederverwenden, das
  Worktree-Verhalten nicht ändern.
- Abwärtskompatibel: Ohne neue Parameter bleibt das Verhalten vollständig
  unverändert.

## Non-Goals

- Kein Checkout bestehender Branches (v1 macht nur Neuerstellung; das
  Umschalten bestehender Branches kann später inkrementell ergänzt werden).
- Kein automatisches Zurückwechseln zum ursprünglichen Branch beim
  Session-Ende (verhindert den Verlust von Nutzer-Zustand).
- Keine Merge-back-UI.
- Keine Änderung des Verhaltens der `enter_worktree` / `exit_worktree`-Tools.

## Design

### Empty-State-UI: Git-Chip im Composer

Der Modus-Selektor wird kein eigenständiger Block, sondern **in die untere
Symbolleiste des Composers eingebettet** — er verwendet die Position des
bestehenden Git-Chips weiter (unterhalb des Eingabefelds, links vom
Senden-Button). Der Chip zeigt standardmäßig den aktuellen Branch `⎇ main` an,
ein Klick öffnet ein Popover zur Modusauswahl:

```text
┌─ composer ───────────────────────────────────────────┐
│  描述你的任务…                                        │
│                                                      │
│  📎  @  🎙              [⎇ main ▾]  [发送]           │
└──────────────────────────────────────────────────────┘
                              │ 点击
                              ▼
              ┌─ Git 模式 popover ─────────────┐
              │  ● 当前分支   直接在 main 上    │
              │  ○ 新建分支   从 main 创建      │
              │    [分支名输入框 — 选中时展开]   │
              │  ○ Worktree   独立副本，可并行   │
              │  ─────────────────────────────  │
              │  $ git checkout -b feat/x ← main│
              │                    [创建分支]    │
              └─────────────────────────────────┘
```

- **Aktueller Branch** (Standard): Der Chip zeigt `⎇ main` an (grün),
  entspricht dem bestehenden Verhalten. Nach der Auswahl schließt das Popover
  automatisch.
- **Neuer Branch**: Im Popover entfaltet sich ein Branch-Namen-Eingabefeld +
  Parallelitäts-Hinweis, Echtzeit-Validierung (gültiger Git-Branch-Name, kein
  Konflikt mit bestehenden Branches). Nach Bestätigung wechselt der Chip zu
  `⎇ → feat/xxx` (orange), mit ✕ zur Ein-Klick-Wiederherstellung des
  Defaults.
- **Worktree-Isolation**: Zeigt eine automatisch generierte Slug-Vorschau.
  Nach Bestätigung wechselt der Chip zu `⎇ Worktree-Isolation` (lila), mit ✕
  zur Ein-Klick-Wiederherstellung des Defaults.

Am unteren Rand des Popovers wird eine Echtzeit-Vorschau des auszuführenden
Git-Befehls (`git checkout -b …` / `git worktree add …`) angezeigt, damit der
Nutzer genau weiß, was passieren wird.

Vorteile des Chip-Ansatzes: Er belegt keinen vertikalen Raum im
Welcome-Bereich; der Einstieg liegt im Composer, wo die Aufmerksamkeit des
Nutzers ist; im Nicht-Empty-State (bestehende Session) bleibt der Chip
sichtbar, die Semantik ist konsistent.

Die Sichtbarkeitsbedingungen sind konsistent mit dem bestehenden
Worktree-Toggle: Workspace ist vertrauenswürdig + ist ein Git-Repository. Wenn
nicht erfüllt, fällt der Chip auf einen Read-only-Branch-Indikator zurück
(bestehendes Verhalten).

#### Zustandsautomat

`pendingWorktreeRef` / `worktreePending` zu einer einheitlichen Pending-Absicht
erweitern:

```typescript
type SessionGitIntent =
  | { mode: 'current' }
  | { mode: 'branch'; name: string }
  | { mode: 'worktree'; slug?: string };
```

- Auswahl „Aktueller Branch" → `{ mode: 'current' }` (entspricht `undefined`,
  kein Parameter wird übergeben).
- Auswahl „Neuer Branch" → `{ mode: 'branch', name }`.
- Auswahl „Worktree" → `{ mode: 'worktree', slug? }` (bestehende Logik
  wiederverwenden).
- Senden der ersten Nachricht → `ensureSessionForPrompt` trägt je nach Absicht
  die entsprechenden Parameter mit.
- Nach erfolgreicher Erstellung die Absicht löschen; bei Fehlern für einen
  Retry behalten.

### API-Änderungen

#### `CreateSessionRequest` (SDK)

```typescript
export interface CreateSessionRequest {
  // ... existing fields ...
  worktree?: { slug?: string };
  /**
   * Create a new git branch and check it out before starting the
   * session. The session runs in the same working directory but on
   * the new branch. Mutually exclusive with `worktree`.
   */
  branch?: { name: string };
}
```

`branch` und `worktree` schließen sich gegenseitig aus; gleichzeitige Übergabe
liefert 400 zurück.

#### `DaemonSession` / `DaemonSessionSummary`-Antwort

```typescript
export interface DaemonBranchInfo {
  name: string; // 新建的分支名
  baseBranch: string; // 创建时的基础分支
}

export interface DaemonSession {
  // ... existing fields ...
  worktree?: DaemonWorktreeInfo;
  branch?: DaemonBranchInfo;
}
```

#### `POST /session`-Routen-Handling (`routes/session.ts`)

Vor der bestehenden Worktree-Handling-Logik das Branch-Handling hinzufügen:

```text
1. 校验 branch / worktree 互斥
2. 校验 branch.name 是合法 git 分支名
3. 检查分支名不与现有分支冲突（git rev-parse --verify）
4. 检测 dirty tree（git status --porcelain），有改动则 409 branch_dirty_tree
5. 记录 baseBranch = 当前分支（git rev-parse --abbrev-ref HEAD）
6. git checkout -b <name>
7. branchMeta = { name, baseBranch }
8. 强制 sessionScope = 'thread'
9. 正常 spawnOrAttach（cwd 不变）
10. 失败回滚：git checkout <baseBranch> && git branch -D <name>
```

`changeSessionCwd` ist nicht erforderlich (das Arbeitsverzeichnis ändert sich
nicht), kein Worktree-Marker erforderlich.

#### Fehlercodes

| Fehlercode                       | Bedeutung                                                                 |
| -------------------------------- | ------------------------------------------------------------------------- |
| `branch_and_worktree_conflict`   | `branch` und `worktree` wurden gleichzeitig übergeben                     |
| `invalid_branch`                 | Das `branch`-Feld ist kein Objekt (muss `{"name":"..."}` sein)            |
| `branch_invalid_name`            | Branch-Name ist ungültig                                                  |
| `branch_session_conflict`        | In diesem Workspace gibt es bereits eine Branch-Session, oder auf dem geteilten Checkout gibt es bereits eine andere aktive Session |
| `branch_init_failed`             | Initialisierung des Git-Dienstes fehlgeschlagen                           |
| `branch_not_git_repo`            | Der Workspace ist kein Git-Repository                                     |
| `branch_already_exists`          | Der Branch-Name existiert bereits                                         |
| `branch_status_failed`           | Prüfung des Arbeitsverzeichnis-Zustands fehlgeschlagen                    |
| `branch_dirty_tree`              | Das Arbeitsverzeichnis hat nicht committete Änderungen, erst committen oder stashen |
| `branch_checkout_failed`         | `git checkout -b` fehlgeschlagen (andere Gründe)                          |

### Frontend-Parameter-Kette

```text
App.tsx (gitIntent state)
  → sessionPreparation.ts createAndAttachSessionForPrompt({ branch })
    → actions.ts createSession({ branch })
      → DaemonClient.createOrAttachSession({ branch })
        → POST /session { branch: { name } }
```

Vollständig symmetrisch zur Worktree-Kette, auf jeder Ebene wird `branch`
durchgereicht.

### Sidebar-Anzeige

- Worktree-Session: Bestehendes `GitForkIcon`-Badge, unverändert.
- Branch-Session: Zeigt `GitBranchIcon` + Branch-Namen-Badge.
- Normale Session: Kein Badge, unverändert.

### Parallelitätsbeschränkung

Eine „Neuer Branch"-Session im selben Workspace ändert den HEAD des geteilten
Arbeitsverzeichnisses; mehrere Branch-Sessions würden sich gegenseitig
kollidieren. Beschränkungsstrategie:

- **Server-seitig**: Wenn `POST /session` `branch` trägt, prüfen, ob es im
  selben Workspace bereits eine aktive Branch-Session gibt (über die
  Session-Liste der Bridge + `branchMeta`). Falls ja, 409
  `branch_session_conflict` zurückgeben.
- **Frontend**: Wenn im Empty-State „Neuer Branch" ausgewählt wird und bereits
  eine aktive Branch-Session existiert, einen Hinweis anzeigen und
  deaktivieren.

Worktree-Sessions unterliegen dieser Beschränkung nicht (jeweils unabhängige
Verzeichnisse).

### Dateiänderungen

| Datei                                                              | Änderung                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`               | `CreateSessionRequest` um das `branch`-Feld erweitert                     |
| `packages/sdk-typescript/src/daemon/types.ts`                      | `DaemonBranchInfo`, `DaemonSession.branch`, `DaemonSessionSummary.branch` |
| `packages/cli/src/serve/routes/session.ts`                         | `POST /session` Branch-Erstellungslogik + Rollback                        |
| `packages/webui/src/daemon/session/actions.ts`                     | `createSession` reicht `branch` durch                                     |
| `packages/webui/src/daemon/session/types.ts`                       | `createSession`-Signatur um `branch` erweitert                            |
| `packages/web-shell/client/App.tsx`                                | `SessionGitIntent`-Zustandsautomat, Modus-Selektor-UI, Parallelitätsprüfung |
| `packages/web-shell/client/App.module.css`                         | Selektor-Styling                                                          |
| `packages/web-shell/client/utils/sessionPreparation.ts`            | `branch` durchreichen                                                     |
| `packages/web-shell/client/i18n.tsx`                               | Neue i18n-Keys (en/zh)                                                    |
| `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx` | Branch-Session-Badge                                                      |

### i18n

| Key                              | EN                                                     | ZH                                       |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `gitMode.current`                | `Current branch`                                       | `当前分支`                               |
| `gitMode.branch`                 | `New branch`                                           | `新建分支`                               |
| `gitMode.worktree`               | `Worktree`                                             | `Worktree 隔离`                          |
| `gitMode.branch.placeholder`     | `Branch name`                                          | `分支名`                                 |
| `gitMode.branch.hint`            | `Switches the working directory to a new branch`       | `在工作目录中切换到新分支`               |
| `gitMode.branch.conflictWarning` | `Only one branch session per workspace at a time`      | `同一 workspace 同时只能有一个分支会话`  |
| `gitMode.branch.invalidName`     | `Invalid branch name`                                  | `分支名不合法`                           |
| `gitMode.branch.exists`          | `Branch already exists`                                | `分支已存在`                             |
| `gitMode.branch.dirtyTree`       | `Uncommitted changes detected. Commit or stash first.` | `检测到未提交改动，请先 commit 或 stash` |

## Entschiedene Fragen

1. **Branch-Namen-Default**: Keine automatische Generierung, Eingabe durch den
   Nutzer. Das Eingabefeld bleibt leer + Placeholder-Hinweis (z. B.
   `feat/my-feature`), weniger Vorgaben.
2. **Dirty Working Tree**: Der Server prüft den Dirty-Zustand vor
   `git checkout -b` (`git status --porcelain`). Bei nicht committeten
   Änderungen wird 409 `branch_dirty_tree` zurückgegeben, und das Frontend
   weist den Nutzer an, erst zu committen oder zu stashen, bevor eine
   Branch-Session erstellt wird. Keine Vorabprüfung auf UI-Ebene (um eine
   Entkopplung vom tatsächlichen Git-Verhalten zu vermeiden), die Entscheidung
   liegt einheitlich beim Server.
3. **Session-Resume**: Kein Sidecar erforderlich. Ein Worktree benötigt ein
   Sidecar, weil das Arbeitsverzeichnis vom Haupt-Repository getrennt ist und
   beim Resume der Worktree-Pfad bekannt sein muss. Das Arbeitsverzeichnis
   einer Branch-Session ist das ursprüngliche Verzeichnis, `git branch` gibt
   den aktuellen Branch an, zusätzliche Aufzeichnung ist nicht nötig. Hinweis:
   `DaemonSessionSummary.branch` wird derzeit nur im Speicher gehalten
   (Bridge-Mapping) und geht nach einem Daemon-Neustart verloren, daher
   bleiben das Sidebar-Badge und der Parallelitäts-Guard nicht über einen
   Neustart hinweg erhalten; Persistenz ist Folgearbeit.
