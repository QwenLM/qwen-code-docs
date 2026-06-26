# Virtueller Viewport für lange Unterhaltungen auf ink 7

Status: **implementiert**, PR #4146 enthält:
Kern-Viewport, ASCII-Scrollleiste mit automatischer Ausblend-Animation, SGR-Mausrad, `ui.useTerminalBuffer`-Schalter, Tastatur-Scroll-Tasten.
Scrollleisten-Ziehen / integrierte Suche / alternativer Puffermodus / Dual-Write in den Host-Scrollback sind für V.3+ zurückgestellt (siehe §7).
Autor: 秦奇
Tracking-Branch: `feat/virtual-viewport-on-ink7` (Basis: `main`)

## 1. Problem

Mehrere von Nutzern gemeldete Flacker-/Verzögerungsprobleme führen alle auf die gleiche architektonische Tatsache zurück: inks `<Static>` ist **append-only** und qwen-codes `MainContent.tsx` übergibt die _gesamte_ `mergedHistory` bei jedem Rendering daran. Für eine Unterhaltung mit 1000 Runden sind das 1000 React-Renderings von `HistoryItemDisplay` + ink-Layout-Durchläufe pro Zustandsänderung.

Die aktuellen Symptome, die dies ermöglicht:

| Problem       | Symptom                                                           | Aktueller Beitrag                                              |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| #2950         | Lange Sitzung zeigt kontinuierlichen Auf-/Ab-Scroll-Sturm         | vollständiges Static-Remount bei jeder Aktualisierung          |
| #3118         | Wechsel zurück ins Fenster flackert weiter                        | `clearTerminal` + `historyRemountKey++` löst vollständiges Remount aus |
| #3007         | Generelles Interface-Flackern                                     | selbe Ursache wie #3118                                        |
| #3838 (UI)    | Scrollleiste wächst unbegrenzt                                    | jedes kumulative Delta-Rendering fügt Zeilen hinzu; kein Viewport-Eviction |
| #3899 → #3905 | Strg+O ließ Terminal für Sekunden einfrieren                      | der teilweise behobene Fall, abgedichtet mit `setImmediate`-Chunking |

PR #3905 vermerkt ausdrücklich:

> Die Diskussion von Alternativen (versiegelter Präfix + Live-Tail, **echte Viewport-Virtualisierung**, ANSI-Ausgabe-Caching) wurde in Betracht gezogen, aber jede ändert die UX oder erfordert eine architektonische Neufassung.

Diese architektonische Neufassung ist es, die dieser Entwurf vorschlägt.

## 2. Referenzimplementierungen

Untersucht wurden zwei quelloffene ink-basierte CLIs, die bereits das gleiche Problem gelöst (oder umgangen) haben:

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

Hält einen **eigenen geforkten ink** unter `src/ink/` vor:

- `ink.tsx` — 1722 LoC eigener Hauptloop
- `log-update.ts` — 773 LoC eigener Diff-Renderer mit Scrollregion-Optimierung (`DECSTBM`), Vollbild-Fallback wenn der Scrollback berührt würde
- `screen.ts` / `frame.ts` — explizite Screen-/Frame-Objekte, `cellAt` / `diffEach`-Zellen-Diffing
- `render-to-screen.ts` — stellt `renderToScreen(node)` bereit, um einen beliebigen Knotenbaum out-of-band auf ein `Screen`-Objekt zu rendern. Dies ist die zugrundeliegende Fähigkeit für "einmal rendern, cachen, wiedergeben" – also Virtualisierung
- `screens/REPL.tsx`:
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` – nur vollständige Zeilen werden dem Renderer ausgesetzt
  - `ScrollBox` mit `scrollRef`, `cursorNavRef`
  - `Markdown.tsx` `StreamingMarkdown` teilt Inhalt an der letzten Blockgrenze auf oberster Ebene, merkt sich stabilen Präfix, parst nur instabilen Suffix neu
- `Markdown.tsx`-Token-Cache (LRU-500) – überlebt Unmount→Remount, sodass Virtual-Scroll-Remounts den Cache treffen ohne erneutes Lexing

**Warum wir diesen Ansatz nicht übernehmen**: Das Forken von ink im Ganzen ist nicht nachhaltig wartbar (allein 1722 LoC `ink.tsx`, plus ein eigener Reconciler). Jeder Upstream-ink-Fix muss manuell eingepflegt werden. Dieser Aufwand ist für claude-codes Größenordnung gerechtfertigt; nicht für qwen-code.

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

Verwendet `@jrichman/ink@6.6.9` (ein kleinerer Fork, der `ResizeObserver`- und `StaticRender`-Exporte hinzufügt) und liefert **eine vollständige virtualisierte Liste als einfache Komponenten**:

| Datei                                        | LoC | Rolle                                                                     |
| -------------------------------------------- | --- | ------------------------------------------------------------------------- |
| `components/shared/VirtualizedList.tsx`       | 764 | Kern-Viewport + Messung + Scroll-Anker + Größenverfolgung pro Element     |
| `components/shared/ScrollableList.tsx`        | 278 | Umhüllt `VirtualizedList`, fügt Tastaturnavigation + Smooth-Scroll + Scrollleiste hinzu |
| `contexts/ScrollProvider.tsx`                | 469 | Mausziehen, Scroll-Sperre, Fokus-Kontext                                  |
| `hooks/useBatchedScroll.ts`                  | 35  | Fasst gleichzeitige Scroll-Updates zusammen                               |
| `hooks/useAnimatedScrollbar.ts`              | 130 | Ein-/Ausblendanimation der Scrollleiste                                   |

`MainContent.tsx` wechselt zwischen zwei Rendering-Pfaden mittels eines `isAlternateBufferOrTerminalBuffer`-Flags:

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` ist in `React.memo` eingewickelt, sodass unveränderte Elemente nicht neu gerendert werden.
**Dies ist die Referenz für den Produktionseinsatz.**

## 3. Ink 7-Funktionsprüfung

qwen-code befindet sich auf dem in Bearbeitung befindlichen Branch `chore/upgrade-ink-7`. Die Exporte von `node_modules/ink/build/index.d.ts` wurden überprüft:

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — aktualisiert automatisch bei Layoutänderungen. **Funktionelles Äquivalent zu `ResizeObserver`.**
- ✅ `measureElement(node)` — einmalige imperative Messung
- ✅ `useWindowSize` — Terminalgrößenänderung
- ✅ `useAnimation` — für das Ein- und Ausblenden der Scrollleiste
- ✅ `Static`, `Box`, `Text` usw.
- ❌ `ResizeObserver` (Komponente/Klasse) — erfordert Anpassung
- ❌ `StaticRender` — erfordert benutzerdefinierte Implementierung

**Fazit**: Ink 7 bietet alle erforderlichen Grundelemente. Kein Fork-Wechsel erforderlich.

## 4. Strategische Entscheidung

**Übertragen der `ScrollableList` + `VirtualizedList` + unterstützende Hooks/Kontexte von gemini-cli nach qwen-code, Anpassung von `ResizeObserver` → `useBoxMetrics` und Erstellung eines benutzerdefinierten `StaticRender`.**

Abgelehnte Alternativen:

| Alternative                       | Warum abgelehnt                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Ink forken wie claude-code        | Nicht tragbare Wartungslast                                                                                      |
| Wechsel zu `@jrichman/ink`        | Macht das laufende Ink-7-Upgrade rückgängig; verliert Ink 7's React 19.2 + Reconciler 0.33 + neue Diff-Renderer-Verbesserungen |
| Virtualisierung von Grund auf neu | Erfindet ~1700 LoC bewährten Designs neu; gemini-cli's Referenz existiert und funktioniert                       |

## 5. Architektur

### Dateizuordnung nach PR #4146

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NEU] Kern-Viewport + ASCII-Scrollleiste
│   ├── ScrollableList.tsx           [NEU] Tastatur- und Mausrad-Wrapper
│   └── StaticRender.tsx             [NEU] React.memo-Wrapper (ersetzt gemini-cli's Ink-Fork-Export)
├── hooks/
│   ├── useBatchedScroll.ts          [NEU] Zusammenfassen von Scroll-Updates im selben Tick
│   ├── useMouseEvents.ts            [NEU] SGR-Mausmodus aktivieren + stdin-Ereignisse parsen
│   └── useAnimatedScrollbar.ts      [NEU] Daumenblitz beim Scrollen + automatisches Ausblenden bei Inaktivität
├── utils/
│   └── mouse.ts                     [NEU] SGR + X11-Mausereignis-Parser (Port von gemini-cli)
├── components/MainContent.tsx       [MOD] virtuellen Zweig + Stabilitätsreferenzen hinzufügen
└── AppContainer.tsx                 [MOD] Scroll-bezogenen UI-Status in Kontext einfließen lassen + refreshStatic steuern
```

Auf nachfolgende PRs verschoben:

- **Scrollleiste ziehen + klicken zum Positionieren** – benötigt bildschirmabsolute Elementkoordinaten, blockiert durch eine Einschränkung von Stock-Ink-7 (siehe V.4 / V.7).
- **In-App `/`-Suche** – das `TranscriptSearchBar`-Muster von claude-code (V.5).
- **Alternativer Puffermodus** – Fokus/Sperre nach `contexts/ScrollProvider.tsx`-Muster mit vollständiger Alt-Bildschirm-Übernahme (V.6).

### Einstellung (V.2)

```ts
// settings schema
ui: {
  /**
   * Aktiviert virtualisiertes Rendering des Verlaufs für lange Konversationen.
   * Wenn aktiv, werden nur sichtbare Elemente im Viewport über React gerendert;
   * herausgescrollte Elemente bleiben im Terminalscrollback-Puffer.
   *
   * Standard: false. Opt-in, bis es sich bei langen Konversationen als stabil erwiesen hat.
   */
  useTerminalBuffer?: boolean;  // Alias zur Kompatibilität mit gemini-cli
}
```

`MainContent.tsx` liest die Einstellung und wechselt den Pfad:

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // virtualisiert
}

return <Static .../>; // bestehender Pfad, unverändert
```

Der alte `<Static>`-Pfad bleibt unverändert – kein Regressionsrisiko für Benutzer, die nicht opt-in.

## 6. Wichtige Anpassungen aus dem gemini-cli-Quellcode

### 6.1 `ResizeObserver` → `useBoxMetrics`

Container-Beobachter von gemini-cli (imperatives Muster):

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

`useBoxMetrics` kümmert sich bereits um Anhängen/Trennen + Layoutänderungsabonnement; die imperative Buchhaltung entfällt.

### 6.2 Elementweites Größenänderungs-Tracking (`itemsObserver`)

Schwieriger. gemini-cli beobachtet N Element-Knoten über einen einzelnen `ResizeObserver` und leitet den Eintrag per `WeakMap` → Schlüssel weiter:
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

`useBoxMetrics` ist **ein Ref pro Hook**, daher können wir es nicht 1:1 ersetzen. Zwei Optionen:

**Option A — Messung in `VirtualizedListItem` verschieben**

Jeder `VirtualizedListItem` wird bereits als eigenständige Komponente (memoized) ausgeführt. Füge `useBoxMetrics` darin ein; melde die Höhe über eine Callback-Property zurück:

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

**Option B — `measureElement` + `useLayoutEffect`** im übergeordneten Element verwenden

Das übergeordnete Element speichert Refs für sichtbare Elemente und führt nach jedem Rendern einen Layout-Effekt aus, um sie zu messen. Weniger reaktiv, aber einfacher:

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

**Empfehlung: Option A.** Sauberere Trennung, nutzt die integrierte Änderungserkennung von ink 7. Vermeidet das Risiko eines „Measure-Sturms", bei dem jedes Rendern alles misst.

### 6.3 `StaticRender` — benutzerdefinierte Implementierung

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

Semantik: `content` einmal in der angegebenen Breite rendern; nachfolgende Rendervorgänge mit demselben Key + derselben Breite geben das gecachte Rendering zurück.

Das Äquivalent in ink 7 ist einfaches `React.memo` in Kombination mit einer stabilen Komponente, deren erneutes Rendern das übergeordnete Element garantiert nicht auslöst. Benutzerdefinierte Implementierung:

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

In Kombination mit der stabilen `key`-Property des übergeordneten Elements (`${itemKey}-static-${width}`) führt eine Änderung von `children` oder `width` zu einem neuen Mount; andernfalls überspringt React das erneute Rendern.

Dies ist die Kernfunktion: Elemente, die STATISCH sind (z. B. abgeschlossene Gemini-Nachrichten), werden einmal gemessen und gerendert und durchlaufen danach nie wieder React.

### 6.4 `HistoryItemDisplay` memoizen

gemini-cli macht:

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

Das gleiche Muster in qwen-code. Notwendig, damit die Virtualisierung tatsächlich erneutes Rendern überspringt.

## 7. PR-Reihenfolge

| PR        | Titel (Entwurf)                                                            | Umfang                                                                                                                                                                                     | Zeilen            | Abhängigkeiten  | Risiko                                         |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | --------------- | ---------------------------------------------- |
| **#4146** | feat(cli): virtueller Viewport für lange Unterhaltungen unter ink 7        | Kern-Primitive + ASCII-Scrollleiste mit **Auto-Hide-Animation** + SGR **Mausrad** + `ui.useTerminalBuffer`-Gate + `MainContent`/`AppContainer`-Verdrahtung + Tests                         | ~2800 LoC         | `main`          | ✅ **ausgeliefert** — Typecheck sauber, Vitest grün |
| **V.3**   | test(integration): Capture-Suite-Regressionen für Streaming / Resize / Shell | Portierung von 3 Capture-Skripten aus PR #3663                                                                                                                                            | ~2000 (nur Tests) | #4146           | ausstehend                                    |
| **V.4**   | feat(cli): Scrollleiste ziehen + Klick-zum-Positionieren                  | SGR-Maus-Hittest auf der Scrollleisten-Spalte. Benötigt bildschirmabsolute Koordinaten – entweder via Upstream `getBoundingBox` zu ink 7 oder eigener Yoga-Walker. Auto-Hide-Animation bereits in #4146 ausgeliefert. | ~400              | #4146           | zurückgestellt — Koordinatenblocker           |
| **V.5**   | feat(cli): In-App-`/`-Suche                                             | Viewport-begrenzte Hervorhebung + n/N-Navigation (claude-code's `TranscriptSearchBar`-Muster)                                                                                              | ~300              | #4146           | zurückgestellt                                |
| **V.6**   | feat(cli): Alternate-Buffer-Modus (vollständige Alt-Screen-Übernahme)     | Zusätzliche Einstellung `ui.useAlternateBuffer`                                                                                                                                            | ~500              | #4146           | zurückgestellt — separate UX-Entscheidung nötig |
| **V.7**   | Research: Host-Terminal-Scrollback erhalten (Dual-Write)                  | `@jrichman/ink`'s `overflowToBackbuffer` ist Fork-only. Optionen: Upstream-PR zu ink 7, eigener Dual-Write oder Verlust akzeptieren. Untersuchung.                                          | —                 | #4146           | strukturell durch Stock-ink-7 blockiert        |
V.3 (Integrationstests) ist der letzte kritische Punkt vor dem Umschalten des Standards. V.4–V.6 schließen die verbleibenden Lücken zur gemini-cli-Parität; V.7 ist offene Forschung, da die zugrunde liegende ink-Prop, die wir benötigen (`overflowToBackbuffer`), nur im `@jrichman/ink`-Fork von gemini-cli existiert.

## 8. Verifikationsplan

Pro-PR (obligatorisch vor jedem "ready for review"):

- `npm run typecheck --workspace=@qwen-code/qwen-code` — sauber
- `npm run lint --workspace=@qwen-code/qwen-code` — sauber
- `cd packages/cli && npx vitest run` — alle grün
- Mehrstufige richtungslose Prüfung gemäß Projektworkflow

Ende-zu-Ende (nach V.3):

- Langzeitgespräch-Benchmark: 1000-Wiederholungen-Sitzung, messen
  - Erste-Darstellungszeit (anfängliches Mounten + Zeichnen)
  - Ctrl+O-Umschaltlatenz
  - Größenänderungslatenz
  - Bild-für-Bild-Renderzeit während Streaming
- Vergleiche `useTerminalBuffer: false` (Legacy) vs `true` (virtualisiert)

## 9. Offene Fragen / benötigte Entscheidungen

1. **Einstellungsname**: `ui.useTerminalBuffer` (gemini-cli-kompatibel) vs `ui.virtualizedHistory` (ausführlicher)?
2. **Standardwert**: als `false` ausliefern (Opt-in) oder zuerst über Umgebungsvariable ausrollen?
3. **Heuristik für statische Elemente**: gemini-cli markiert nur `header` als statisch. Sollten wir auch abgeschlossene Gemini-Nachrichten, Tool-Ergebnisse, die nicht mehr in `pendingHistoryItems` sind, usw. markieren?
4. **Mausunterstützung**: gemini-clis `ScrollProvider` beinhaltet Mausziehen für die Bildlaufleiste. Lohnt es sich, jetzt zu portieren, oder bis V.4 überspringen?
5. **Kompatibilität mit #3905**: ~~PR #3905 (Ctrl+O-Freeze-Fix) ist offen und ändert dieselbe `MainContent.tsx`. Merge-Reihenfolge koordinieren — wahrscheinlich rebasieren V.2 auf #3905.~~ **Gelöst**: #3905s progressives Replay ist in `main` gelandet und wird im Legacy-`<Static>`-Zweig von `MainContent.tsx` beibehalten; der VP-Zweig ersetzt es für Opt-in-Benutzer, da der Freeze-Trigger (vollständiges Static-Remount) nicht mehr zutrifft.
6. **Kompatibilität mit `chore/re-upgrade-ink-7-0-3`**: PR #4146 baut darauf auf. Nachdem #4119 (der ink 7.0.3 Re-Upgrade PR) in `main` gemerged wird, wird die Basis von PR #4146 auf `main` umgestellt.

## 10. Risiken

| Risiko                                                                      | Wahrscheinlichkeit | Minderung                                                                                              |
| --------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `useBoxMetrics` pro Element erzeugt Messstürme bei langen Listen            | mittel            | Option A in §6.2 merkt bereits pro Element; nur Elemente im Render-Fenster tragen die Kosten. Benchmark in V.3. |
| Eigene `StaticRender`-Implementierung verpasst einen Randfall, den der @jrichman-Fork behandelte | mittel            | Quellcode von gemini-clis StaticRender prüfen, falls verfügbar; andernfalls auf Funktionstests + Benchmark verlassen. |
| Legacy-Pfad `<Static>` driftet ab, während sich der neue Pfad entwickelt    | niedrig           | Feature-Flag-Gate hält beide Pfade aktiv; CI führt beide über eine Einstellungsmatrix aus.             |
| ink 7 hat noch ungefüllte Fehler upstream                                   | niedrig           | Wir sind bereits auf ink 7 via `chore/upgrade-ink-7`; dieser PR führt kein zusätzliches ink-Risiko ein. |
| Lang laufende Sitzungen sammeln Speicher in Mess-Caches an                  | mittel            | LRU-Räumung im `heights`-Record hinzufügen, sobald die Größe N×Viewport (z.B. 5×) überschreitet. V.3 benchmarkt dies. |

## 11. Genehmigungs-Checkliste

- [x] Architekturrichtung genehmigt — Port von gemini-cli (§4)
- [x] Einstellungsname + Standard entschieden — `ui.useTerminalBuffer`, Standard `false` (Opt-in)
- [x] Heuristik für statische Elemente — `isStaticItem={(item) => item.id > 0}` (abgeschlossene Verlaufselemente)
- [x] Mausunterstützungsumfang — auf V.4 verschoben; nur Tastatur-Scroll in #4146
- [x] Merge-Reihenfolge mit #3905 (§9.5) — #3905 bereits in `main`; #4146 behält den Legacy-Progressive-Replay-Pfad bei und ersetzt ihn nur für VP-Benutzer
- [x] PR #4146 Implementierung abgeschlossen
