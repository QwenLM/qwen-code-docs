# Virtuelles Viewport für lange Konversationen auf ink 7

Status: **implementiert**, PR #4146 liefert:
Core Viewport, ASCII-Scrollleiste mit Auto-Hide-Animation, SGR-Mausrad, `ui.useTerminalBuffer`-Gate, Tastatur-Scrolltasten.
Scrollleisten-Drag / In-App-Suche / Alternativpuffer-Modus / Dual-Write in Host-Scrollback sind auf V.3+ verschoben (siehe §7).
Autor: 秦奇
Tracking-Branch: `feat/virtual-viewport-on-ink7` (Basis: `main`)

## 1. Problem

Mehrere von Nutzern berichtete Flacker-/Verzögerungsprobleme haben alle die gleiche architektonische Ursache: Inks `<Static>` ist **append-only** und Qwen Codes `MainContent.tsx` schiebt bei jedem Render die _gesamte_ `mergedHistory` durch. Bei einer 1000-Turn-Konversation sind das 1000 `HistoryItemDisplay`-React-Renders + Ink-Layout-Passes pro Zustandsänderung.

Die aktuellen Symptome, die dadurch ermöglicht werden:

| Issue           | Symptom                                                   | Aktueller Beitrag                                           |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| #2950           | Lange Sitzung zeigt kontinuierlichen Auf-/Ab-Scroll-Sturm | volles Static-Remount bei jeder Aktualisierung              |
| #3118           | Wechsel zurück ins Fenster flackert weiter                | `clearTerminal` + `historyRemountKey++` löst volles Remount aus |
| #3007           | Generelles Interface-Flackern                             | gleiches wie #3118                                          |
| #3838 (UI-Seite) | Scrollleiste wächst unbegrenzt                            | jeder kumulative Delta-Render fügt Zeilen hinzu; kein Viewport-Eviction |
| #3899 → #3905   | Strg+O friert Terminal für Sekunden ein                   | der teilweise gefixte Fall, abgedichtet mit `setImmediate`-Chunking |

PR #3905 stellt explizit fest:

> Die Diskussion von Alternativen (versiegelter Präfix + Live-Tail, **echte Viewport-Virtualisierung**, ANSI-Ausgabe-Caching) wurde in Betracht gezogen, ändert aber jeweils die UX oder erfordert eine architektonische Umschreibung.

Diese architektonische Umschreibung ist das, was dieses Design vorschlägt.

## 2. Referenzimplementierungen

Untersucht wurden zwei Open-Source-ink-basierte CLIs, die das gleiche Problem bereits gelöst (oder umgangen) haben:

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

Pflegt einen **eigenen geforkten ink** unter `src/ink/`:

- `ink.tsx` — 1722 LoC eigener Hauptloop
- `log-update.ts` — 773 LoC eigener Diff-Renderer mit Scrollregion-Optimierung (`DECSTBM`), Full-Frame-Fallback wenn Scrollback betroffen wäre
- `screen.ts` / `frame.ts` — explizite Screen-/Frame-Objekte, `cellAt` / `diffEach` auf Zellenebene
- `render-to-screen.ts` — bietet `renderToScreen(node)`, um beliebige Knoten-Bäume außerhalb der Reihe an ein `Screen`-Objekt zu rendern. Dies ist die zugrundeliegende Fähigkeit für "einmal rendern, cachen, wiedergeben" – d.h. Virtualisierung
- `screens/REPL.tsx`:
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` — nur vollständige Zeilen werden dem Renderer ausgesetzt
  - `ScrollBox` mit `scrollRef`, `cursorNavRef`
  - `Markdown.tsx` `StreamingMarkdown` teilt Inhalt an der letzten Top-Level-Blockgrenze, merkt sich stabilen Präfix, parst nur instabilen Suffix neu
- `Markdown.tsx` Token-Cache (LRU-500) — überlebt Unmount→Remount, sodass Virtual-Scroll-Remounts den Cache ohne erneutes Lexen treffen

**Warum wir diesen Ansatz nicht übernehmen**: Ink komplett zu forken ist nicht wartbar (1722 LoC `ink.tsx` allein, plus ein eigener Reconciler). Jeder Upstream-Ink-Fix muss manuell gemerged werden. Dieser Aufwand ist für claude-codes Größenordnung gerechtfertigt; nicht für qwen-code.

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

Verwendet `@jrichman/ink@6.6.9` (einen kleineren Fork, der `ResizeObserver`- und `StaticRender`-Exports hinzufügt) und liefert **eine vollständige virtualisierte Liste als einfache Komponenten**:

| Datei                                 | LoC | Rolle                                                                  |
| ------------------------------------- | --- | ---------------------------------------------------------------------- |
| `components/shared/VirtualizedList.tsx` | 764 | Core Viewport + Messung + Scroll-Anker + Größenänderungs-Tracking pro Eintrag |
| `components/shared/ScrollableList.tsx`  | 278 | Wrappt `VirtualizedList`, fügt Tastaturnavigation + Smooth-Scroll + Scrollleiste hinzu |
| `contexts/ScrollProvider.tsx`           | 469 | Maus-Drag, Scroll-Lock, Fokus-Kontext                                 |
| `hooks/useBatchedScroll.ts`             | 35  | Fasst Scroll-Updates im gleichen Tick zusammen                        |
| `hooks/useAnimatedScrollbar.ts`         | 130 | Ein-/Ausblend-Animation der Scrollleiste                              |

`MainContent.tsx` wechselt zwischen zwei Render-Pfaden über ein `isAlternateBufferOrTerminalBuffer`-Flag:

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` ist mit `React.memo` gewrappt, sodass unveränderte Einträge nicht neu rendern.

**Dies ist die produktionsreife Referenz.**

## 3. Ink-7-Fähigkeitsprüfung

qwen-code ist auf dem laufenden Branch `chore/upgrade-ink-7`. Exporte in `node_modules/ink/build/index.d.ts` geprüft:

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — aktualisiert sich automatisch bei Layout-Änderungen. **Funktionelles Äquivalent von `ResizeObserver`.**
- ✅ `measureElement(node)` — einmalige imperative Messung
- ✅ `useWindowSize` — Terminal-Größenänderung
- ✅ `useAnimation` — für Scrollleisten-Einblendung
- ✅ `Static`, `Box`, `Text`, usw.
- ❌ `ResizeObserver` (Komponente/Klasse) — muss angepasst werden
- ❌ `StaticRender` — benötigt eigene Implementierung

**Fazit**: Ink 7 bietet alle notwendigen Grundbausteine. Kein Fork-Wechsel nötig.

## 4. Strategische Entscheidung

**Portieren von gemini-clis `ScrollableList` + `VirtualizedList` + unterstützenden Hooks/Kontexten nach qwen-code, Anpassung von `ResizeObserver` → `useBoxMetrics` und Bau einer eigenen `StaticRender`-Implementierung.**

Abgelehnte Alternativen:

| Alternative                       | Warum abgelehnt                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fork von ink wie claude-code      | Nicht nachhaltiger Wartungsaufwand                                                                             |
| Wechsel zu `@jrichman/ink`        | Macht das laufende Ink-7-Upgrade rückgängig; verliert Ink-7s React 19.2 + Reconciler 0.33 + neue Diff-Renderer-Verbesserungen |
| Virtualisierung von Grund auf neu bauen | Erfindet ~1700 LoC bewährtes Design neu; gemini-clis Referenz existiert und funktioniert                     |

## 5. Architektur

### Dateizuordnung nach PR #4146

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NEU] Core Viewport + ASCII-Scrollleiste
│   ├── ScrollableList.tsx           [NEU] Tastatur- + Mausrad-Wrapper
│   └── StaticRender.tsx             [NEU] React.memo-Wrapper (ersetzt gemini-clis Ink-Fork-Export)
├── hooks/
│   ├── useBatchedScroll.ts          [NEU] Zusammenfassen von Scroll-Updates im gleichen Tick
│   ├── useMouseEvents.ts            [NEU] SGR-Maus-Modus aktivieren + stdin-Events parsen
│   └── useAnimatedScrollbar.ts      [NEU] Daumen-Blitz beim Scrollen + Auto-Hide im Leerlauf
├── utils/
│   └── mouse.ts                     [NEU] SGR- + X11-Mausereignis-Parser (Port von gemini-cli)
├── components/MainContent.tsx       [MOD] Virtualisierten Branch + Stabilitäts-Refs hinzufügen
└── AppContainer.tsx                 [MOD] Scroll-bezogenen UI-Status in Kontext einspeisen + refreshStatic gaten
```

Auf Folge-PRs verschoben:

- **Scrollleisten-Drag + Klick-zum-Positionieren** — benötigt bildschirmabsolute Elementkoordinaten, blockiert durch eine Einschränkung von Stock-Ink-7 (siehe V.4 / V.7).
- **In-App-`/`-Suche** — claude-codes `TranscriptSearchBar`-Muster (V.5).
- **Alternativpuffer-Modus** — `contexts/ScrollProvider.tsx`-ähnlicher Fokus/Lock mit voller Alt-Screen-Übernahme (V.6).

### Einstellung (V.2)

```ts
// Settings-Schema
ui: {
  /**
   * Aktiviert virtualisiertes History-Rendering für lange Konversationen.
   * Wenn true, werden nur die sichtbaren Viewport-Einträge durch React gerendert;
   * herausgescrollte Einträge bleiben im Terminal-Scrollback-Puffer.
   *
   * Standard: false. Opt-in bis zur nachgewiesenen Stabilität bei langen Konversationen.
   */
  useTerminalBuffer?: boolean;  // Alias aus Kompatibilitätsgründen zu gemini-cli beibehalten
}
```

`MainContent.tsx` liest die Einstellung und wechselt die Pfade:

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // virtualisiert
}

return <Static .../>; // bestehender Pfad, unverändert
```

Der alte `<Static>`-Pfad bleibt wie gehabt – kein Regressionsrisiko für Nutzer, die nicht optieren.

## 6. Wichtige Anpassungen gegenüber der gemini-cli-Quelle

### 6.1 `ResizeObserver` → `useBoxMetrics`

gemini-clis Container-Beobachter (imperatives Muster):

```ts
const containerObserverRef = useRef<ResizeObserver | null>(null);

const containerRefCallback = useCallback((node: DOMElement | null) => {
  containerObserverRef.current?.disconnect();
  containerRef.current = node;
  if (node) {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const newHeight = Math.round(entry.contentRect.height);
        const newWidth = Math.round(entry.contentRect.width);
        setContainerHeight((prev) => (prev !== newHeight ? newHeight : prev));
        setContainerWidth((prev) => (prev !== newWidth ? newWidth : prev));
      }
    });
    observer.observe(node);
    containerObserverRef.current = observer;
  }
}, []);
```

Unsere Anpassung (deklarativer Ink-7-Hook):

```ts
const containerRef = useRef<DOMElement>(null);
const { width: containerWidth, height: containerHeight } =
  useBoxMetrics(containerRef);
```

`useBoxMetrics` erledigt bereits Attach/Detach + Layout-Change-Abonnement; die imperative Buchhaltung entfällt.

### 6.2 Größenänderungs-Tracker pro Eintrag (`itemsObserver`)

Schwieriger. gemini-cli beobachtet N-Element-Knoten über einen einzelnen `ResizeObserver` und leitet den Eintrag → Schlüssel über eine `WeakMap`:

```ts
const nodeToKeyRef = useRef(new WeakMap<DOMElement, string>());
const itemsObserver = useMemo(
  () =>
    new ResizeObserver((entries) => {
      setHeights((prev) => {
        let next = null;
        for (const entry of entries) {
          const key = nodeToKeyRef.current.get(entry.target);
          if (key && prev[key] !== Math.round(entry.contentRect.height)) {
            if (!next) next = { ...prev };
            next[key] = Math.round(entry.contentRect.height);
          }
        }
        return next ?? prev;
      });
    }),
  [],
);
```

`useBoxMetrics` ist **ein Ref pro Hook**, daher können wir dies nicht 1:1 ersetzen. Zwei Optionen:

**Option A — Messung nach unten in `VirtualizedListItem` verschieben**

Jeder `VirtualizedListItem` läuft bereits als eigene Komponente (memoisiert). `useBoxMetrics` darin hinzufügen; Höhe über einen Callback-Prop nach oben melden:

```tsx
const VirtualizedListItem = memo(({ itemKey, onHeightChange, ...props }) => {
  const ref = useRef<DOMElement>(null);
  const { height, hasMeasured } = useBoxMetrics(ref);
  useEffect(() => {
    if (hasMeasured) onHeightChange(itemKey, height);
  }, [itemKey, height, hasMeasured, onHeightChange]);
  return <Box ref={ref}>{...}</Box>;
});
```

**Option B — `measureElement` + `useLayoutEffect`** im Eltern-Element

Eltern speichert Refs für sichtbare Elemente, führt nach jedem Render einen Layout-Effekt zur Messung aus. Weniger reaktiv, aber einfacher:

```ts
useLayoutEffect(() => {
  const newHeights: Record<string, number> = { ...heights };
  let changed = false;
  for (const [key, ref] of itemRefs.current) {
    if (ref) {
      const { height } = measureElement(ref);
      if (newHeights[key] !== height) {
        newHeights[key] = height;
        changed = true;
      }
    }
  }
  if (changed) setHeights(newHeights);
});
```

**Empfehlung: Option A.** Sauberere Trennung, nutzt Ink-7s integrierte Änderungserkennung. Vermeidet das Risiko eines "Mess-Sturms", bei dem jeder Render alles misst.

### 6.3 `StaticRender` — eigene Implementierung

gemini-cli importiert `StaticRender` aus `@jrichman/ink`. Betrachtet man die Verwendung in `VirtualizedList.tsx`:

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

Semantik: `content` einmal in der angegebenen Breite rendern; nachfolgende Renders mit dem gleichen Schlüssel + Breite geben den gecachten Render zurück.

Für Ink 7 ist das Äquivalent einfaches `React.memo` mit einer stabilen Komponente, deren erneutes Rendern das Elternteil garantiert unterbindet. Eigene Implementierung:

```tsx
import { memo } from 'react';
import { Box } from 'ink';

interface StaticRenderProps {
  children: React.ReactElement;
  width?: number | string;
}

const StaticRender = memo(
  ({ children, width }: StaticRenderProps) => (
    <Box width={width} flexDirection="column" flexShrink={0}>
      {children}
    </Box>
  ),
  (prev, next) => prev.children === next.children && prev.width === next.width,
);
```

In Kombination mit dem stabilen `key`-Prop des Elternteils (`${itemKey}-static-${width}`) führt eine Änderung von Kindern oder Breite zu einem frischen Mount; andernfalls überspringt React das erneute Rendern.

Dies ist die Kernfähigkeit: Elemente, die STATISCH sind (z. B. abgeschlossene Gemini-Nachrichten), werden einmal gemessen + gerendert und nie wieder durch React durchlaufen.

### 6.4 Memoisieren von `HistoryItemDisplay`

gemini-cli macht:

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

Gleiches Muster in qwen-code. Erforderlich, damit Virtualisierung Rerenders tatsächlich überspringt.

## 7. PR-Sequenz

| PR        | Titel (Entwurf)                                                             | Umfang                                                                                                                                                                                | Zeilen            | Abhängigkeiten | Risiko                                        |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------- | --------------------------------------------- |
| **#4146** | feat(cli): virtuelles Viewport für lange Konversationen auf ink 7           | Core-Primitives + ASCII-Scrollleiste mit **Auto-Hide-Animation** + SGR-**Mausrad** + `ui.useTerminalBuffer`-Gate + `MainContent`/`AppContainer`-Verdrahtung + Tests                   | ~2800 LoC         | `main`         | ✅ **ausgeliefert** — Typprüfung sauber, Vitest grün |
| **V.3**   | test(integration): Capture-Suite Regressionen für Streaming / Resize / Shell | 3 Capture-Skripte aus PR #3663 portieren                                                                                                                                               | ~2000 (nur Tests) | #4146          | ausstehend                                    |
| **V.4**   | feat(cli): Scrollleisten-Drag + Klick-zum-Positionieren                     | SGR-Maus-Hittest auf Scrollleisten-Spalte. Benötigt bildschirmabsolute Koordinaten – entweder Upstream-`getBoundingBox` für Ink 7 oder eigener Yoga-Walker. Auto-Hide-Animation bereits in #4146 ausgeliefert. | ~400              | #4146          | verschoben — Koordinaten-Blocker              |
| **V.5**   | feat(cli): In-App-`/`-Suche                                                 | Viewport-begrenztes Hervorheben + n/N-Navigation (claude-codes `TranscriptSearchBar`-Muster)                                                                                          | ~300              | #4146          | verschoben                                    |
| **V.6**   | feat(cli): Alternativpuffer-Modus (volle Alt-Screen-Übernahme)              | Zusätzliche Einstellung `ui.useAlternateBuffer`                                                                                                                                        | ~500              | #4146          | verschoben — separate UX-Entscheidung nötig   |
| **V.7**   | research: Host-Terminal-Scrollback erhalten (Dual-Write)                    | `@jrichman/ink`s `overflowToBackbuffer` ist nur im Fork vorhanden. Optionen: Upstream-PR für Ink 7, eigener Dual-Write, oder Verlust akzeptieren. Untersuchung.                        | —                 | #4146          | strukturell blockiert durch Stock-Ink 7       |

V.3 (Integrationstests) ist das verbleibende kritische Pfad-Element vor dem Umschalten des Standards. V.4–V.6 schließen die verbleibenden Lücken zur gemini-cli-Parität; V.7 ist offene Forschung, da die benötigte zugrundeliegende Ink-Prop (`overflowToBackbuffer`) nur in gemini-clis `@jrichman/ink`-Fork existiert.

## 8. Verifikationsplan

Pro PR (obligatorisch vor "ready for review"):

- `npm run typecheck --workspace=@qwen-code/qwen-code` — sauber
- `npm run lint --workspace=@qwen-code/qwen-code` — sauber
- `cd packages/cli && npx vitest run` — alles grün
- Mehrrunden-Richtungsaudit gemäß Projektworkflow

End-to-End (nach V.3):

- Langkonversations-Benchmark: 1000-Turn-Sitzung, messen:
  - First-Paint-Zeit (initialer Mount + Paint)
  - Strg+O-Umschaltlatenz
  - Größenänderungslatenz
  - Renderzeit pro Frame während Streaming
- Vergleiche `useTerminalBuffer: false` (Legacy) vs. `true` (virtualisiert)

## 9. Offene Fragen / Entscheidungen

1. **Einstellungsname**: `ui.useTerminalBuffer` (gemini-cli-Kompatibilität) vs. `ui.virtualizedHistory` (aussagekräftiger)?
2. **Standardwert**: als `false` ausliefern (Opt-in) oder zuerst via Umgebungsvariable stufenweise ausrollen?
3. **Statisches-Element-Heuristik**: gemini-cli markiert nur `header` als statisch. Sollten wir auch abgeschlossene Gemini-Nachrichten, Tool-Ergebnisse, die nicht mehr in `pendingHistoryItems` sind, usw. markieren?
4. **Mausunterstützung**: gemini-clis `ScrollProvider` enthält Maus-Drag für die Scrollleiste. Jetzt portieren oder bis V.4 warten?
5. **Kompatibilität mit #3905**: ~~PR #3905 (Strg+O-Freeze-Fix) ist offen und ändert dieselbe `MainContent.tsx`. Merge-Reihenfolge koordinieren – vermutlich rebased V.2 auf #3905.~~ **Gelöst**: #3905s progressives Replay ist in `main` gelandet und bleibt im Legacy-`<Static>`-Zweig von `MainContent.tsx` erhalten; der VP-Zweig ersetzt es für Opt-in-Nutzer, weil der Freeze-Auslöser (volles Static-Remount) nicht mehr zutrifft.
6. **Kompatibilität mit `chore/re-upgrade-ink-7-0-3`**: PR #4146 baut darauf auf. Nachdem #4119 (der Ink-7.0.3-Neu-Upgrade-PR) in `main` gemerged ist, wird die Basis von PR #4146 auf `main` neu ausgerichtet.

## 10. Risiken

| Risiko                                                                  | Wahrscheinlichkeit | Risikominderung                                                                                              |
| ----------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `useBoxMetrics` pro Eintrag erzeugt Mess-Stürme auf langen Listen       | mittel             | Option A in §6.2 memoisiert bereits pro Eintrag; nur Einträge im Render-Fenster zahlen den Preis. Benchmark in V.3. |
| Eigene `StaticRender`-Implementierung übersieht einen Edge-Case, den der @jrichman-Fork behandelt hat | mittel             | gemini-clis StaticRender-Quelle prüfen, falls verfügbar; ansonsten auf Funktionstests + Benchmark verlassen. |
| Legacy-`<Static>`-Pfad driftet, während der neue Pfad sich weiterentwickelt | niedrig            | Feature-Flag-Gate hält beide Pfade aktiv; CI führt beide über eine Einstellungsmatrix aus.                   |
| Ink 7 hat noch ungefüllte Upstream-Bugs                                  | niedrig            | Wir sind bereits über `chore/upgrade-ink-7` auf Ink 7; dieser PR führt kein zusätzliches Ink-Risiko ein.     |
| Lang laufende Sitzungen sammeln Speicher in Mess-Caches an               | mittel             | LRU-Eviction auf `heights`-Record hinzufügen, sobald Größe N×Viewport überschreitet (z. B. 5×). V.3 benchmarkt dies. |
## 11. Genehmigungs-Checkliste

- [x] Architektonische Richtung genehmigt – Portierung von gemini-cli (§4)
- [x] Einstellungsname + Standardwert festgelegt – `ui.useTerminalBuffer`, Standard `false` (Opt-in)
- [x] Heuristik für statische Elemente – `isStaticItem={(item) => item.id > 0}` (abgeschlossene Verlaufselemente)
- [x] Umfang der Mausunterstützung – auf V.4 verschoben; nur Tastatur-Scroll in #4146
- [x] Merge-Reihenfolge mit #3905 (§9.5) – #3905 bereits in `main`; #4146 behält den alten progressiven Replay-Pfad bei und ersetzt ihn nur für VP-Benutzer
- [x] PR #4146 Implementierung abgeschlossen