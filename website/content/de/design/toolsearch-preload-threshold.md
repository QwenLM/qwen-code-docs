# ToolSearch-Preload-Schwelle

## Problem

Deferred-Tools (`shouldDefer=true`) werden bedingungslos hinter ToolSearch
versteckt: jedes MCP-Tool (hartkodiert in `DiscoveredMCPTool`) plus eine
Reihe von Bundled-Built-ins (web_search, web_fetch, cron, monitor,
worktree, …). Das Deferral spart Prompt-Tokens, wenn das Deferred-Set groß
ist, aber es ist nicht kostenlos: Jede Aufdeckung mitten in der Session
schreibt die Funktionsdeklarationsliste neu, die am Anfang des
tools→system→messages-Präfixes steht, daher invalidiert ein einzelner
ToolSearch-Load den gesamten Prompt-KV-Cache. Bei einem kleinen
Deferred-Set spart das Deferral wenig, und der Cache-Schaden plus der
zusätzliche ToolSearch-Round-Trip machen es zu einem Netto-Verlust.

Claude Code modelliert diesen Tradeoff mit `ENABLE_TOOL_SEARCH=auto` /
`auto:N`: "tools load upfront if they fit within 10% of the context
window, deferred otherwise"
(code.claude.com/docs/en/agent-sdk/tool-search). Diese Änderung fügt das
äquivalente Gate hinzu.

## Design

Neue Einstellung `tools.toolSearch.threshold` (Zahl, Prozent, Standard
`10`).

Beim Session-Start (`GeminiClient.startChat`, bevor der
Deferred-Tools-Reminder aufgelöst wird), wenn ToolSearch registriert ist
und der Threshold > 0 ist:

- Schätze den kombinierten Token-Footprint jedes Deferred-Tool-Schemas —
  Bundled-Built-ins und MCP gleichermaßen
  (`JSON.stringify(tool.schema).length / CHARS_PER_TOKEN`).
- Passt die Summe in `threshold`% des Kontextfensters
  (`contentGeneratorConfig.contextWindowSize`, mit Fallback auf
  `tokenLimit(model)`), werden alle über den bestehenden
  `revealDeferredTool`-Mechanismus aufgedeckt. Alles oder nichts — eine
  partielle Aufdeckung ließe eine willkürliche Teilmenge hinter ToolSearch,
  und jedes Tool, das deferred bleibt, kann den Cache bei der ersten
  Nutzung immer noch sprengen.
- Andernfalls bleibt alles deferred (bisheriges Verhalten). `threshold: 0`
  stellt bedingungslos das alte Verhalten wieder her.

Preloaded-Tools landen daher in der initialen Deklarationsliste, werden
aus dem Startup-Deferred-Tools-Reminder herausgefiltert, und die
Deklarationsliste bleibt für die gesamte Session stabil.

## Entscheidungen

- **Nur Session-Start, niemals `setTools()`.** Ein Tool aufzudecken, das
  der Startup-Reminder bereits angekündigt hat, würde
  `queueAddedMcpToolsReminder` dazu bringen, es als "removed" zu
  markieren, und eine Deklarationsänderung mitten in der Session sprengt
  genau den Cache, den der Preload schützen soll. Tools von Servern, die
  sich später verbinden, bleiben deferred (angekündigt über den
  Added-Tools-Reminder, erreichbar über ToolSearch) bis zum nächsten
  Session-Start. `/clear` leert das aufgedeckte Set und führt die
  Entscheidung erneut aus.
- **Ein Budget über das gesamte Deferred-Set, Bundled eingeschlossen.**
  Der Auto-Threshold von Claude Code deckt nur MCP-/SDK-Tools ab (seine
  Built-ins werden separat verwaltet), aber er kann sich diesen Split
  leisten: Deferred-Tools werden vor der Berechnung des Cache-Keys aus dem
  Prompt-Präfix entfernt, und die Definition eines entdeckten Tools wird
  inline über einen `tool_reference`-Block expandiert — "The prefix is
  untouched, so prompt caching is preserved"
  (platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool).
  Hier läuft jede Aufdeckung — Bundled oder MCP — über `setTools()` und
  schreibt die Deklarationsliste neu. Die ~14 Bundled-Deferred-Tools
  (web_search, web_fetch, …) auszuschließen würde den Präfix nur einen
  gewöhnlichen Tool-Load von einem vollen Cache-Bruch entfernt lassen und
  genau die Stabilität verschenken, die der Preload erkauft. Wenn die
  Vereinigungsmenge das Budget überschreitet, bleibt alles deferred, was
  der Baseline vor dem Threshold für Bundled-Tools entspricht.
- **Threshold standardmäßig 10 (Auto-Modus an), anders als bei Claude
  Code.** Der ungesetzte Standard von Claude Code hält MCP-Tools immer
  deferred und macht `auto` zu einem Opt-in — dort tragfähig, weil die
  erste Nutzung eines Deferred-Tools keine Cache-Invalidierung kostet.
  Hier kostet sie einen vollen Präfix-Rebuild, daher ist das Gate im
  Auto-Stil standardmäßig an; `threshold: 0` reproduziert den
  Immer-Deferred-Standard von Claude Code.
- **Bereits aufgedeckte Tools zählen zum Budget**, damit wiederholte
  Session-Starts (auch Kompression läuft durch `startChat`) das
  aufgedeckte Set nicht schrittweise über das Budget hinaus vergrößern
  können, während Server kommen und gehen.
- **Kein Preload, wenn ToolSearch nicht verfügbar ist** — der bestehende
  Eager-Reveal-Branch in `resolveDeferredToolsForReminder` deckt bereits
  alles auf.
