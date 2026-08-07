# WebShell Sidebar — Anpassungsleitfaden

Die `WebShellSidebar` ist die Session-Liste und das Navigationspanel, das innerhalb
der WebShell-`App`-Komponente gerendert wird. Dieses Dokument ordnet jeden visuellen
Bereich seiner aktuellen Anpassungsmöglichkeit zu und identifiziert Bereiche ohne
externen Injection-Point.

## Sidebar aktivieren

Die Sidebar ist **standardmäßig deaktiviert**. Übergib die `sidebar`-Prop zum Aktivieren:

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://localhost:4170"
  sidebar={true} // einfaches Aktivieren
  // oder mit fein abgestimmten Optionen:
  // sidebar={{ enabled: true, defaultCollapsed: false, ... }}
/>;
```

## Layout-Übersicht

```
┌─────────────────────────────────────┐
│ ① Branding (topRow)                 │  ✅ anpassbar
├─────────────────────────────────────┤
│ ② Primäre Navigation                │  ✅ anpassbar
│    [＋ Neue Aufgabe] [🧩 Plugins]   │
│    [📅 Geplant]   [🎯 Ziele]        │
│    [benutzerdefiniertes Rendering…] │
├─────────────────────────────────────┤
│ ③ Projekt-Header                    │  ✅ ein-/ausblendbar
│    📁 Projekte ▼ [🔍] [＋]          │
│    Session-Listeneinträge…          │
│    📦 Archivierte Sessions          │
├─────────────────────────────────────┤
│ ④ Footer-Action-Leiste              │  ✅ anpassbar
│    [⚙ Einstellungen] v0.19 [☀] [▦] [◧] │
├─────────────────────────────────────┤
│ ⑤ Resize-Handle                     │  ❌ nicht anpassbar
└─────────────────────────────────────┘
```

## Anpassbare Bereiche

### ① Branding — `branding`

```ts
interface WebShellSidebarBranding {
  render?: () => ReactNode; // ersetzt die gesamte Branding-Zeile
  hideWhenCompact?: boolean; // ausblenden wenn die Sidebar eingeklappt ist (Standard: true)
}
```

| Wert                               | Effekt                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| `undefined` (Standard)             | Qwen-Logo + "Qwen Code"-Text                                 |
| `false`                            | Branding-Zeile vollständig ausgeblendet                      |
| `{ render: () => <MyHeader /> }`   | Vollständiger Ersatz durch benutzerdefinierten Inhalt        |
| `{ hideWhenCompact: false }`       | Branding im eingeklappten Icon-Rail-Modus sichtbar lassen    |

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
  | 'newTask' // ✏️ Neue-Aufgabe-Button
  | 'plugins' // 🧩 Plugins-Button
  | 'scheduledTasks' // 📅 Geplante-Tasks-Button
  | 'goals'; // 🎯 Ziele-Button

interface WebShellSidebarPrimaryNavOptions {
  items?: readonly WebShellSidebarPrimaryNavItem[]; // welche eingebauten Buttons angezeigt werden (Standard: alle)
  render?: () => ReactNode; // zusätzlicher benutzerdefinierter Inhalt nach den eingebauten Buttons
}
```

Der primäre Navigationsbereich enthält eingebaute Buttons, die über `items` gesteuert werden:

- Alle Buttons werden standardmäßig angezeigt, wenn `items` nicht angegeben ist
- Nur die aufgeführten Buttons werden angezeigt, wenn `items` angegeben ist
- Benutzerdefinierter Inhalt kann über `render()` nach den eingebauten Buttons hinzugefügt werden

| Wert                                       | Effekt                                     |
| ------------------------------------------ | ------------------------------------------ |
| `undefined` (Standard)                     | Alle eingebauten Buttons angezeigt          |
| `{ items: ['plugins'] }`                   | Nur Plugins-Button                         |
| `{ items: ['plugins', 'scheduledTasks'] }` | Plugins + Geplante Tasks                   |
| `{ items: [], render: () => ... }`         | Alle eingebauten ausblenden, nur benutzerdefinierter Inhalt |

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
  | 'version' // Versionsbezeichnung (z. B. "v0.19.10")
  | 'theme' // ☀/🌙 Hell/Dunkel-Umschalter
  | 'sessionsOverview' // ▦ Session-Übersichtsbereich (nur große Screens)
  | 'splitView' // ◧ Split-View (nur große Screens)
  | 'daemonStatus' // 📊 Daemon-Statusbereich
  | 'collapse'; // ◁/▷ Umschalter zum Ein-/Ausklappen

interface WebShellSidebarFooterOptions {
  items?: readonly WebShellSidebarFooterItem[]; // welche eingebauten Elemente angezeigt werden (Standard: alle)
  render?: () => ReactNode; // benutzerdefinierter Inhalt, der auf der linken Seite vor den eingebauten Elementen gerendert wird
}
```

| Wert                                         | Effekt                         |
| -------------------------------------------- | ------------------------------ |
| `undefined` (Standard)                       | Alle Elemente angezeigt        |
| `false`                                      | Footer vollständig ausgeblendet|
| `{ items: ['settings', 'theme', 'collapse'] }` | Nur aufgeführte Elemente angezeigt |

Der Footer passt sich automatisch an schmale Breiten an: Labels werden ausgeblendet und die Version
wird unter bestimmten Schwellenwerten weggelassen.

```tsx
sidebar={{
  footer: { items: ['theme', 'collapse'] },  // minimaler Footer
}}
```

Benutzerdefinierter Inhalt über `render()` erscheint auf der linken Seite des Footers, vor
den eingebauten Elementen:

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
Navigationsbereich (②) verschoben und werden standardmäßig angezeigt. Sie werden über `primaryNav.items` gesteuert, nicht über
`footer.items`.

### Weitere Top-Level-Optionen

```ts
interface WebShellSidebarOptions {
  enabled?: boolean; // Sidebar ein-/ausblenden (Standard: true wenn übergeben)
  defaultCollapsed?: boolean; // initialer eingeklappter Zustand (in localStorage persistiert)
  showCompactToggle?: boolean; // den Einklapp-Button im Chatbereich anzeigen (Standard: true)
  branding?: false | WebShellSidebarBranding;
  primaryNav?: WebShellSidebarPrimaryNavOptions;
  hideProjectHeader?: boolean; // "Projekte"-Header-Zeile ausblenden (Standard: false = angezeigt)
  sessionActions?: WebShellSidebarSessionActionsOptions;
  footer?: false | WebShellSidebarFooterOptions;
}
```

### ③ Projekt-Header — `hideProjectHeader`

Steuert die Sichtbarkeit der "Projekte"-Header-Zeile (die Zeile mit dem Einklapp-
Umschalter, Suchsymbol und dem Workspace-hinzufügen-Button). Standardmäßig `false` (angezeigt).

```tsx
sidebar={{
  hideProjectHeader: true,  // die "Projekte ▼ [🔍] [＋]"-Zeile ausblenden
}}
```

Wenn ausgeblendet, werden die Session-Listeneinträge und archivierten Sessions weiterhin angezeigt —
die Header-Zeile mit ihren Aktionsbuttons und die Session-Suchleiste werden entfernt.

### Session-Zeilenaktionen — `sessionActions`

```ts
type WebShellSidebarSessionActionItem =
  | 'details' // 📝 Details (Dropdown-Untermenü)
  | 'rename' // ✏️ Umbenennen (Dropdown-Menü)
  | 'group' // 📁 Gruppieren/In Ordner verschieben (Dropdown-Menü)
  | 'export' // 📤 Chat-Verlauf exportieren (Dropdown-Menü)
  | 'delete' // 🗑 Session löschen (Dropdown-Menü)
  | 'pin' // 📌 Anheften/Lösen (Inline-Button)
  | 'archive'; // 📦 Archivieren (Inline-Button)

/** Teilmenge mit funktionierenden Inline-(Hover-Button-)Handlern. */
type WebShellSidebarSessionInlineActionItem =
  | 'pin'
  | 'archive'
  | 'rename'
  | 'export'
  | 'delete';

interface WebShellSidebarSessionActionsOptions {
  items?: readonly WebShellSidebarSessionActionItem[]; // welche Aktionen angezeigt werden (Standard: alle)
  inlineItems?: readonly WebShellSidebarSessionInlineActionItem[]; // welche Elemente als Inline-Buttons erscheinen (Standard: ['pin', 'archive'])
}
```

Steuert, welche Aktionsbuttons auf Session-Zeilen erscheinen:

- **`items`**: Hauptsteuerung für alle Aktionen (sowohl Inline als auch Dropdown). Wenn ein Element nicht in `items` ist, wird es überall ausgeblendet.
- **`inlineItems`**: Steuert, welche Elemente als **Inline-Buttons** (beim Hovern) erscheinen. Standardmäßig `['pin', 'archive']`. Nur Elemente mit funktionierenden Inline-Handlern können verwendet werden: `'pin'`, `'archive'`, `'rename'`, `'export'`, `'delete'`. `'details'` und `'group'` sind nur im Dropdown verfügbar.

**Sichtbarkeitspriorität**: Sowohl `items` ALS AUCH die eingebaute Bedingung des Elements ALS AUCH `inlineItems` müssen alle erfüllt sein, damit der Inline-Button angezeigt wird. Zum Beispiel erfordert `delete` als Inline, dass `items` `'delete'` enthält UND `inlineItems` `'delete'` enthält.

| Wert                                   | Effekt                                       |
| -------------------------------------- | -------------------------------------------- |
| `undefined` (Standard)                 | Alle Aktionen angezeigt, Pin + Archive als Inline |
| `{ inlineItems: ['pin', 'delete'] }`   | Pin + Delete als Inline-Buttons              |
| `{ inlineItems: [] }`                  | Keine Inline-Buttons                         |
| `{ inlineItems: ['archive', 'export'] }` | Archive + Export als Inline-Buttons        |

Der Dropdown-Auslöser (⋮) wird automatisch ausgeblendet, wenn keine Dropdown-Elemente
aktiviert sind. Inline-Buttons (`pin`, `archive`) werden nur angezeigt, wenn sowohl
ihre Capability-Bedingung als auch `items` sie enthalten.

```tsx
sidebar={{
  sessionActions: {
    items: ['details', 'rename', 'export', 'delete', 'pin'],  // welche Aktionen angezeigt werden (Hauptsteuerung)
    inlineItems: ['pin', 'delete'],  // Pin + Delete als Inline-Buttons
  },
}}
```

## Nicht anpassbare Bereiche

### Projekte / Workspaces (innerhalb der Session-Liste)

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
- Breite wird in localStorage persistiert
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

| Status    | Verhalten                                          |
| --------- | -------------------------------------------------- |
| Expanded  | Vollständige Sidebar mit Text-Labels               |
| Collapsed | Icon-Rail-Modus (nur Logo, Stift-Symbol, Aktionssymbole) |
| Mobile    | Drawer gleitet von links mit Backdrop-Overlay      |

Der Einklapp-Status wird in `localStorage` unter dem Schlüssel
`qwen-code-web-shell-sidebar-collapsed` persistiert.

## Quellcode-Speicherorte

| Komponente        | Datei                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| WebShellSidebar   | `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`        |
| SessionGroupSection | `packages/web-shell/client/components/sidebar/SessionGroupSection.tsx`  |
| WorkspaceSection  | `packages/web-shell/client/components/sidebar/WorkspaceSection.tsx`       |
| Sidebar-Stiles    | `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css` |
| App-Integration   | `packages/web-shell/client/App.tsx` (nach `WebShellSidebar` suchen)         |
| Einstiegspunkt (Dev) | `packages/web-shell/client/main.tsx` (`sidebar: true`)                 |
