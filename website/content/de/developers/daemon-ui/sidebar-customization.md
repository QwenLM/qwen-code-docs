# WebShell Sidebar — Anpassungsleitfaden

Die `WebShellSidebar` ist die Session-Liste und das Navigationspanel, das innerhalb
der WebShell-`App`-Komponente gerendert wird. Dieses Dokument ordnet jeden visuellen
Bereich seiner aktuellen Anpassungsmöglichkeit zu und identifiziert Bereiche ohne
externen Injection-Point.

## Sidebar aktivieren

Die Sidebar ist standardmäßig **Home only**: eine 300px Session-Spalte mit einem Einklapp-Control unten. Das Weglassen von `sidebar`, das Übergeben von `true` oder `{}` verwendet diesen Standard. Übergib `sidebar={false}` oder `{ enabled: false }` um sie auszublenden.

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // Home-only-Standard
  // oder mit fein abgestimmten Optionen:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## Layout-Übersicht

Home-only-Hosts zeigen Branding, Neue Session, Workspaces, archivierte Sessions und das Einklapp-Control in einer Spalte. Die Konfiguration eines anderen verfügbaren primären Entry oder Footer-Action fügt eine 56px Icon-Rail neben der standardmäßigen 300px sekundären Spalte hinzu. Primäre Entries leben in der Rail; Footer-Actions und Version leben in More. Custom Renderer bleiben in der breiten Home-Spalte. Es gibt keine öffentliche Layout-Option.

**Breaking Change:** Früher hat das Weglassen von `sidebar` die Sidebar ausgeblendet, und das Weglassen der Navigations-/Footer-Item-Listen hat alle eingebauten Elemente angezeigt, wenn die Sidebar aktiviert war. Hosts müssen jetzt `sidebar={false}` übergeben, um den früheren Standard "ausgeblendet" beizubehalten, oder explizit die benötigten Entries auflisten. Standalone Web Shell konfiguriert sein vollständiges Menü explizit. `branding.hideWhenCompact` ist jetzt standardmäßig `false`; setze es auf `true`, um eine ausgeblendete Marke im kompakten Drawer beizubehalten.

## Anpassbare Bereiche

### ① Branding — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // ersetzt die gesamte Branding-Zeile
  hideWhenCompact?: boolean; // Branding im kompakten Drawer ausblenden (Standard: false)
}
```

| Wert                               | Effekt                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| `undefined` (Standard)             | Aufgelöste Marke: `brand`-Prop → Daemon `GET /brand` → eingebautes Qwen-Logo + "Qwen Code"-Text |
| `false`                            | Branding-Zeile vollständig ausgeblendet                      |
| `{ render: () => <MyHeader /> }`   | Vollständiger Ersatz durch benutzerdefinierten Inhalt        |
| `{ hideWhenCompact: false }`     | Branding im kompakten Drawer sichtbar lassen (der Standard)                                  |

Die Standardzeile ist datengesteuert, nicht fest: Ein Daemon, der eine
`ui.brand`-Konfiguration bereitstellt, benennt den Text um und tauscht das
Markenzeichen aus, und ein Embedding-Host kann beides mit der `brand`-Prop
der Shell-Komponente überschreiben (`onBrandResolved` meldet das Ergebnis
für das eigene Chrome des Hosts). `branding.render` bleibt das
Override mit der höchsten Priorität — es gewinnt gegenüber der Prop und
dem daemon-aufgelösten Wert, genau wie zuvor.

```tsx
sidebar={{
  branding: {
    render: () => (
      <div style={{ display: 'flex', gap: 8 }}>
        <img src="/my-logo.svg" alt="" width={24} />
        <span>Meine App</span>
      </div>
    ),
  },
}}
```

### ② Primäre Navigation — `primaryNav`

```ts
type WebShellSidebarPrimaryNavItem =
  | 'newTask' // ✏️ Neue-Session-Button
  | 'plugins' // 🧩 Plugins-Button
  | 'channels' // Channel-Sessions und Einstellungen
  | 'live' // Live-Sessions und Einstellungen; erfordert showLive
  | 'workflows' // Erfordert Workflow-Unterstützung
  | 'managed' // Erfordert einen Managed-Agent-Provider
  | 'scheduledTasks' // 📅 Geplante-Tasks-Button
  | 'goals'; // 🎯 Ziele-Button

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // welche eingebauten Buttons angezeigt werden (Standard: ['newTask'])
  render?: () => ReactNode; // zusätzlicher benutzerdefinierter Inhalt nach den eingebauten Buttons
}
```

Der primäre Navigationsbereich enthält eingebaute Buttons, die über `items` gesteuert werden:

- Nur Neue Session wird angezeigt, wenn `items` nicht angegeben ist; Home existiert immer
- Nur die aufgeführten Buttons werden angezeigt, wenn `items` angegeben ist
- Benutzerdefinierter Inhalt kann über `render()` nach den eingebauten Buttons hinzugefügt werden

| Wert                                       | Effekt                                     |
| ------------------------------------------ | ------------------------------------------ |
| `undefined` (Standard)                     | Home mit Neue Session                      |
| `{ items: ['plugins'] }`                   | Home und Plugins; kein Neue-Session-Button |
| `{ items: ['plugins', 'scheduledTasks'] }` | Home + Plugins + Geplante Tasks            |
| `{ items: [], render: () => ... }`         | Home mit benutzerdefiniertem Inhalt; keine eingebauten primären Buttons |

```tsx
sidebar={{
  primaryNav: {
    items: ['plugins', 'scheduledTasks'],  // newTask und goals ausblenden
    render: () => (
      <button onClick={() => console.log('custom action')}>
        🔗 Data Sync
      </button>
    ),
  },
}}
```

### ④ Footer — `footer`

```ts
type WebShellSidebarFooterItem =
  | 'settings' // ⚙ Einstellungsbereich
  | 'update' // Update-Action wenn unterstützt
  | 'localFiles' // Local-Files-Bridge wenn verfügbar
  | 'desktopRelay' // Diesen Computer über das bestehende Desktop-Relay nutzen
  | 'workspacesOverview' // Workspace-Verwaltung wenn freigeschaltet
  | 'version' // Versionsbezeichnung (z. B. "v0.19.10")
  | 'theme' // ☀/🌙 Hell/Dunkel-Umschalter
  | 'sessionsOverview' // ▦ Session-Übersichtspanel
  | 'splitView' // ◧ Split-View (Shell-Container mindestens 1024px breit)
  | 'daemonStatus' // 📊 Daemon-Statuspanel
  | 'collapse'; // ◁/▷ Einklapp-/Erweiter-Umschalter

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // welche eingebauten Elemente angezeigt werden (Standard: ['collapse'])
  render?: () => ReactNode; // benutzerdefinierter Inhalt im Home-Footer
}
```

| Wert                                         | Effekt                         |
| -------------------------------------------- | ------------------------------ |
| `undefined` (Standard)                       | Nur Einklappen/Erweitern                                                  |
| `false`                                      | Footer ausgeblendet; der Mobile-Drawer behält nur seine Schließen-Steuerung |
| `{ items: ['settings', 'theme', 'collapse'] }` | Nur aufgeführte Elemente angezeigt; der Mobile-Drawer behält immer seine Schließen-Steuerung |

In der Rail-Layout erscheinen Footer-Actions und Version in More; nur das Einklapp-/Erweiter-Control bleibt am Rail-Unterrand. Der Home-only-Modus behält das bestehende kompakte Footer-Verhalten.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // minimaler Footer
}}
```

Benutzerdefinierter Inhalt über `render()` erscheint im breiten Home-Footer:

```tsx
sidebar={{
  footer: {
    items: ['collapse'],
    render: () => (
      <button onClick={() => openHelpCenter()}>
        ❓ Hilfe
      </button>
    ),
  },
}}
```

**Hinweis:** `'scheduledTasks'` und `'goals'` wurden in den primären
Navigationsbereich (②) verschoben und erfordern explizite Konfiguration in eingebetteten Hosts. Sie werden über `primaryNav.items` gesteuert, nicht über
`footer.items`.

### Weitere Top-Level-Optionen

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // Sidebar ein-/ausblenden (Standard: true, auch wenn sidebar weggelassen wird)
  defaultCollapsed?: boolean; // initialer eingeklappter Zustand (in localStorage persistiert)
  showCompactToggle?: boolean; // den Einklapp-Button im Chatbereich anzeigen (Standard: true)
  showSessionSourceSwitch?: boolean; // den Tasks/Channels-Umschalter anzeigen (Standard: true)
  showLive?: boolean; // Daemon-eigene Live-Konversationen anzeigen (Standard: false)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // "Workspaces"-Header-Zeile ausblenden (Standard: false = angezeigt)
  sessionActions?: WebShellSidebarSessionActionsOptions;
  footer?: false | WebShellSidebarFooterOptions;
}
```

### Session-Source-Umschalter — `showSessionSourceSwitch`

Setze `showSessionSourceSwitch` auf `false`, wenn ein Embedding-Host nur
normale Task-Sessions anzeigen soll:

```tsx
sidebar={{
  showSessionSourceSwitch: false,
}}
```

Dies entfernt den Tasks/Channels-Umschalter und fixiert jede aktive, archivierte, primäre
und sekundäre Session-Abfrage auf `sourceType: "default"`. Das Weglassen der Option behält
den Zugriff auf Channel-Sessions. Wenn ein dedizierter Channels-Rail-Entry verfügbar ist, ersetzt er die Source-Tabs; andernfalls bleiben die Tabs erhalten.

### Live-Konversationen — `showLive`

Live-Konversationen sind standardmäßig vor eingebetteten Hosts verborgen. Aktiviere die Option, wenn
der Host die Daemon-eigene Live-Gruppe verfügbar machen soll:

Frühere Versionen haben diese Gruppe ohne explizite Option angezeigt, daher müssen Hosts,
die sich darauf verlassen, beim Upgrade `showLive: true` setzen.

```tsx
sidebar={{
  showLive: true,
  primaryNav: { items: ['newTask', 'live'] },
}}
```

Ohne den `live` primären Entry behält `showLive: true` die bestehende Live-Gruppe in Home und Einstellungen unter Experimental. Mit dem Entry öffnet Live seine eigene Session-Spalte und Einstellungsseite.

### ③ Workspace-Header — `hideProjectHeader`

Steuert die Sichtbarkeit der "Workspaces"-Header-Zeile (die Zeile mit dem Einklapp-
Umschalter, Suchsymbol und dem Workspace-hinzufügen-Button). Standardmäßig `false` (angezeigt).

```tsx
sidebar={{
  hideProjectHeader: true,  // die "工作区 ▼ [🔍] [＋]"-Zeile ausblenden
}}
```

Wenn ausgeblendet, werden die Session-Listeneinträge und archivierten Sessions weiterhin angezeigt —
die Header-Zeile mit ihren Aktionsbuttons und die Session-Suchleiste werden entfernt.

### Session-Zeilenaktionen — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Details (Dropdown-Untermenü)
  | 'rename' // ✏️ Umbenennen (Dropdown-Menü)
  | 'bindPr' // 🔗 Ein GitHub-PR binden (Dropdown-Menü)
  | 'group' // 📁 Gruppieren/In Ordner verschieben (Dropdown-Menü)
  | 'export' // 📤 Chat-Verlauf exportieren (Dropdown-Menü)
  | 'delete' // 🗑 Session löschen (Dropdown-Menü)
  | 'pin' // 📌 Anheften/Lösen (Inline-Button)
  | 'archive' // 📦 Archivieren (Dropdown-Menü)
  | 'split'; // ◫ Zur Split-View hinzufügen (Dropdown-Menü)

/** Teilmenge mit funktionierenden Inline-(Hover-Button-)Handlern. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // welche Aktionen angezeigt werden (Standard: alle)
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // welche Elemente als Inline-Buttons erscheinen (Standard: ['pin'])
}
```

Steuert, welche Aktionsbuttons auf Session-Zeilen erscheinen:

- **`items`**: Hauptsteuerung für alle Aktionen (sowohl Inline als auch Dropdown). Wenn ein Element nicht in `items` ist, wird es überall ausgeblendet.
- **`inlineItems`**: Steuert, welche Elemente als **Inline-Buttons** (beim Hovern) auf Standard-Session-Zeilen erscheinen. Standardmäßig `['pin']`. Nur Elemente mit funktionierenden Inline-Handlern können verwendet werden: `'pin'`, `'rename'`, `'export'`, `'delete'`. `'details'`, `'bindPr'`, `'group'`, `'archive'` und `'split'` sind nur Dropdown-only auf Standard-Zeilen.
- **`bindPr` eingebaute Bedingung**: wird nur angezeigt, wenn die Session Metadaten-Mutation unterstützt — die aktuelle Session in einem primären oder gesperrten Workspace, oder jede andere Session mit der `workspace_session_metadata`-Capability (plus `workspace_qualified_rest_core` wenn diese Session in einem gesperrten oder eingeschränkten sekundären Workspace ist) — und die Zeile keine alleinstehende Session ist (einschließlich Recents-Zeilen) — alleinstehende Metadaten-Routen akzeptieren nur einen Anzeigenamen. Dies ist unabhängig vom `rename`-Element: ein Host kann `bindPr` ohne `rename` whitelisten.

Archivierte Zeilen in Einstellungen verwenden Export conversation und Restore als Inline-Buttons, mit Rename und Delete in More. Ihre Aktionen folgen weiterhin `items` und eingebauten Verfügbarkeitsbeschränkungen; `inlineItems` ändert dieses Layout nicht. Die bestehenden Styles zeigen diese Buttons beim Hovern oder Tastaturfokus und halten sie auf Touch-Geräten sichtbar.

**Sichtbarkeitspriorität auf Standard-Zeilen**: Sowohl `items` ALS AUCH die eingebaute Bedingung des Elements ALS AUCH `inlineItems` müssen alle erfüllt sein, damit der Inline-Button angezeigt wird. Zum Beispiel erfordert `delete` als Inline, dass `items` `'delete'` enthält UND `inlineItems` `'delete'` enthält.

| Wert                                   | Effekt                                       |
| -------------------------------------- | -------------------------------------------- |
| `undefined` (Standard)                 | Alle Aktionen angezeigt, nur Pin als Inline |
| `{ inlineItems: ['pin', 'delete'] }`    | Pin + Delete als Inline-Buttons              |
| `{ inlineItems: [] }`                   | Keine Inline-Buttons auf Standard-Zeilen |
| `{ inlineItems: ['rename', 'export'] }` | Umbenennen + Exportieren als Inline-Buttons |

Der Dropdown-Auslöser (⋮) wird automatisch ausgeblendet, wenn keine Dropdown-Elemente
aktiviert sind. Inline-Buttons werden nur angezeigt, wenn sowohl ihre Capability-
Bedingung als auch `items` sie enthalten. Archivieren ist für die aktuelle Session und für jede Session mit einem laufenden Turn
deaktiviert, da der Daemon die Live-Session beim Archivieren schließt.

`'split'` ist standardmäßig aktiviert wie die anderen Elemente, aber es wird nur wirksam
wenn der Host `onAddSessionToSplitView` verdrahtet. Die Sidebar liest auch ihre
`splitSessionIds`-Prop für die Kapazität: eine Session, die bereits im Split geöffnet ist,
rendert das Element deaktiviert mit einem erklärenden Titel, ebenso der
Pane-Limit-Fall und die aktuelle Session während der Split geschlossen ist.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // welche Aktionen angezeigt werden (Hauptsteuerung)
    inlineItems: ['pin', 'delete'],  // Pin + Delete als Inline-Buttons
  },
}}
```

## Nicht anpassbare Bereiche

### Workspaces (innerhalb der Session-Liste)

Wenn die Session-Liste sichtbar ist, werden die folgenden Unterbereiche gerendert, sind aber
**nicht individuell anpassbar**:

| Aspekt               | Detail                                                           |
| -------------------- | ---------------------------------------------------------------- |
| Datenquelle          | `useSessions()` Hook → Daemon-API (`/sessions`-Endpunkt)         |
| Session-Listensortierung | Nach Erstellungszeit, absteigend                              |
| Session-Zeilen-Rendering | Internes `renderSessionRow` `useCallback` — nicht injizierbar |
| Suche / Filter       | Eingebaute Suchleiste mit clientseitigem Text-Matching            |
| Session-Gruppen      | `SessionGroupSection`-Komponente mit 6 voreingestellten Farben + benutzerdefiniertem Hex |
| Workspace-Abschnitte | `WorkspaceSection` pro Daemon-Workspace, nicht ersetzbar          |
| Workspace-hinzufügen-Dialog | Eingebauter `AddWorkspaceDialog`                            |

### ⑤ Resize-Handle

- Drag-Handle an der rechten Kante zum Ändern der Sidebar-Breite
- Die Breite wird in localStorage als gesamte Sidebar-Breite persistiert. Standards sind 300px Home-only und 356px mit der Rail. Wiederhergestellte Breiten werden auf mindestens 220px Home-only oder 276px mit der Rail begrenzt; alte Werte werden nicht blind um 56px erhöht. Das Ziehen unter den Einklapp-Schwellenwert faltet die Sidebar immer noch ein.
- Der Dock-Breakpoint des Umgebungspanels ignoriert die 56px der Rail (der Nachrichtenbereich gibt sie ab), sodass das Panel bei den gleichen Fensterbreiten dockt wie eine Home-only-Sidebar — z.B. ein 1440px-Fenster.
- Nicht konfigurierbar

## Runtime-Verhaltensprops

Diese `WebShellProps` beeinflussen das Sidebar-Verhalten indirekt:

| Prop                            | Effekt                                  |
| ------------------------------- | --------------------------------------- |
| `onNewSession`                  | Den New-Session-Handler überschreiben    |
| `onLoadSession`                 | Die Session-Lade-Logik überschreiben     |
| `onSessionIdChange`             | Auf Session-Wechsel reagieren            |
| `splitSessionIds`               | Split-View-Sessions extern steuern       |
| `theme` / `onThemeChange`       | Theme steuern / beobachten               |
| `language` / `onLanguageChange` | UI-Sprache steuern / beobachten          |

## Eingeklappter und Mobile-Status

| Status    | Verhalten                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------- |
| Expanded  | Vollständige Sidebar mit Text-Labels                                                                                        |
| Collapsed | Home-only: bestehender 56px-Streifen und Hover-Sessions; mit Rail: nur die 56px primäre Rail                             |
| Mobile    | Drawer verwendet 70% seines Containers, innerhalb der Breitenlimits, mit Backdrop und einem Schließen-Control am unteren Rand der besitzenden Spalte |

Der Einklapp-Status wird in `localStorage` unter dem Schlüssel
`qwen-code-web-shell-sidebar-collapsed` persistiert.

Die Sidebar, ihr kompakter Drawer und die Welcome-Chrome für leere Chats folgen der Shell-Container-Breite (kompakt bei 760px); Chat-Nachrichteninhalte behalten viewport-basierte Breakpoints. Split-Verfügbarkeit verwendet 1024px und Split-Sidebar-Raum verwendet 1200px. Tastatur-Einklappen verschiebt den Fokus aus der ausgeblendeten sekundären Spalte zum Rail-Control.

Die resized Desktop-Breite wird nur in erweiterten Layouts wiederhergestellt. Das Öffnen oder
Schließen des Mobile-Drawers überschreibt weder diese Breite noch die persistierte
Desktop-Einklapp-Einstellung.

## Quellcode-Speicherorte

| Komponente        | Datei                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| WebShellSidebar   | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`  |
| WorkspaceSection  | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Sidebar-Styles    | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| App-Integration   | `packages/web-shell/client/App.tsx` (nach `WebShellSidebar` suchen)         |
| Einstiegspunkt (Dev)   | `packages/web-shell/client/main.tsx` (explizite primäre und Footer-Item-Listen) |
