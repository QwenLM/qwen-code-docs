# Worktree-Isolations-Toggle im Web-Shell-Empty-State

## Hintergrund

Die Worktree-isolierte Session (siehe
[2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md))
hat derzeit als einzigen Einstiegspunkt das **Dropdown-Menü der
Git-Branch-Kapsel im Workspace-Header der Seitenleiste**
(`WorkspaceSection.tsx`), und das Rendern erfordert, dass gleichzeitig die
drei Bedingungen `onOpenGitDiff`, `workspace.trusted` und `gitStatus?.branch`
erfüllt sind. Dass eine Git-Pill klickbar ist, entdecken Nutzer kaum; das
Feature ist zu tief versteckt.

Die Web Shell hat keine unabhängige „Neue Session erstellen"-Seite — nach dem
Klick auf „Neue Session erstellen" wird der Chat-Empty-State angezeigt
(WelcomeHeader + Eingabefeld), der faktisch die Seite zum Erstellen einer
neuen Session ist. Der Empty State hat bereits eine fertige
Worktree-Pending-Badge-UI (`worktreeWelcomeBadge` in `App.tsx`) und einen
vollständigen Pending-Zustandsautomaten (`pendingWorktreeRef` /
`worktreePending`); die Session wird erst beim Senden der ersten Nachricht
wirklich erstellt (Lazy-Erstellung), daher setzt der „Toggle" nur eine
Pending-Absicht.

## Ziele

- Im Chat-Empty-State einen sichtbaren Worktree-Isolations-Toggle
  bereitstellen; nach dem Klick wird der bestehende Pending-Zustandsautomat
  und die Lazy-Erstellungskette wiederverwendet.
- Nach dem Einschalten das bestehende Pending-Badge anzeigen und einen
  Abbruchweg anbieten.
- Den Einstieg über das Git-Pill-Menü der Seitenleiste unverändert beibehalten
  (Pro-Workspace-Schnelleinstieg).

## Non-Goals

- Keine Änderungen an SDK, Daemon-Routing oder `GitWorktreeService` — die
  Erstellungskette wird vollständig wiederverwendet.
- Keine Änderung der bestehenden Semantik „Absicht folgt dem Workspace": Die
  Pending-Absicht wirkt immer auf den Workspace, der beim nächsten
  Session-Erstellen aufgelöst wird (`lockedWorkspaceCwd ?? selectedWorkspaceCwd ??
primary`), konsistent mit dem aktuellen Stand des Seitenleisten-Einstiegs.
- Keine Behandlung der Fehlermeldung für „Nach Pending-Aktivierung zu einem
  Nicht-Git-Workspace wechseln" (der aktuelle Stand wirft bereits einen
  Fehler, was über den Rahmen dieser Änderung hinausgeht).

## Design

### Toggle-Sichtbarkeit (Eligibility)

Der Toggle wird im Empty State nur angezeigt, wenn alle folgenden Bedingungen
erfüllt sind:

| Bedingung                        | Signal                                                        | Begründung                                                      |
| -------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Chat-Empty-State                 | `welcomeHeader` wird nur bei `isChatEmptyState` gerendert     | Natürlich erfüllt, keine zusätzliche Prüfung nötig              |
| Aktueller Workspace ist vertrauenswürdig | `workspaces.find(e => e.cwd === activeWorkspaceCwd)?.trusted` | Konsistent mit dem Seitenleisten-Einstieg: In nicht vertrauenswürdigen Workspaces keine Git-Änderungen |
| Aktueller Workspace ist ein Git-Repository | `selectedWorkspaceGitStatus?.branch`                | Der Daemon schlägt bei Nicht-Git-Repositories hart fehl (`worktree_not_git_repo`), daher vorab ausblenden |

`activeWorkspaceCwd` verwendet das bestehende Memo (`connection.sessionId ?
connection.workspaceCwd : (locked ?? selected ?? primary)`) weiter, und
`selectedWorkspaceGitStatus` verwendet den bestehenden Fetch-Effekt weiter.
Beides sind bestehende Zustände, es werden keine neuen Netzwerkanfragen
hinzugefügt. Bevor der Git-Status vollständig geladen ist, wird der Toggle
nicht angezeigt, konsistent mit dem `gitStatus?.branch`-Gate-Verhalten der
Seitenleiste.

### Interaktion

- **Aus-Zustand**: An der Badge-Position wird ein dezenter Ghost-Button
  gerendert (Fork-Icon + Text `worktree.welcomeTitle`). Klick →
  `pendingWorktreeRef.current = {}` + `setWorktreePending(true)`.
- **An-Zustand**: Das bestehende `worktreeWelcomeBadge` wird gerendert (Icon +
  Titel + Beschreibung), oben rechts wird ein X-Abbrechen-Button hinzugefügt
  (`aria-label` verwendet einen neuen i18n-Key). Klick →
  `pendingWorktreeRef.current = undefined` + `setWorktreePending(false)`.
- Senden der ersten Nachricht → `ensureSessionForPrompt` trägt gemäß
  bestehender Logik `worktree: {}` mit; nach Erfolg wird Pending automatisch
  gelöscht; bei Fehlern bleibt das Badge für einen Retry erhalten (aktueller
  Stand unverändert).
- Die Pending-Löschlogik bestehender Pfade wie Klick auf „Neue Session" in der
  Seitenleiste oder Laden einer bestehenden Session bleibt unverändert.

### Dateiänderungen

| Datei                                                             | Änderung                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/web-shell/client/App.tsx`                               | Eligibility-Memo, An-/Abbrechen-Handler, Rendern von Toggle/Badge im welcomeHeader-Memo |
| `packages/web-shell/client/App.module.css`                        | Styling des Ghost-Toggle-Buttons, Styling des Badge-Abbrechen-Buttons  |
| `packages/web-shell/client/i18n.tsx`                              | Neuer `worktree.cancel` (en/zh)                                        |
| `packages/web-shell/client/App.test.tsx`                          | Unit-Tests: Sichtbarkeits-Gating, An-/Abbrechen, Mittragen von `worktree: {}` beim Absenden |
| `packages/web-shell/client/e2e/utils/mockDaemon.ts`               | Ergänzung der `workspaces`-Capability (inkl. `trusted`) und der `/workspaces/:cwd/git`-Route |
| `packages/web-shell/client/e2e/web-shell.worktree-toggle.spec.ts` | Neues Playwright-E2E: Toggle erscheint/aktivieren/abbrechen, Submit-Request-Body enthält `worktree` |

## Offene Fragen

Keine.
