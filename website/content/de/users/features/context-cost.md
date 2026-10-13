# Resident Context Cost

Jede Anfrage, die eine Session sendet, trägt dasselbe Präfix vor der eigentlichen Konversation: den System-Prompt, das Schema jedes deklarierten Tools, die Kontextdateien (`QWEN.md`) und die Skill-Auflistung. Dieses Präfix wird **in jedem Turn** bezahlt, auch in den Turns, die nur eine Frage beantworten. Diese Seite beschreibt, wie man es misst und verringert.

[Token Caching](./token-caching.md) senkt den _Preis_ des Präfix. Diese Seite verringert das _Präfix_ selbst. Beides kombiniert sich — ein kleineres Präfix ist auch im Cache günstiger.

## Sehen, wofür bezahlt wird

```
/context detail
```

`/context` gibt die Aufschlüsselung nach Kategorie aus; `detail` fügt Zeilen pro Element hinzu — jedes eingebaute Tool, jedes MCP-Tool, jede Kontextdatei, jeder gelistete Skill — sodass sichtbar wird, welcher einzelne Eintrag der teure ist. Das Ergebnis sollte im **ersten Turn** einer Session gelesen werden, wo die Konversation noch leer ist und alles Sichtbare Präfix ist.

Die Kategorien sind das, was `/context` ausgibt, plus zwei Buchhaltungszeilen: `startupContext` (der Umgebungsblock, der als erster User-Turn gesendet wird) und ein expliziter Restposten für alles, was die Kategorien nicht zuordnen, sodass die Teile immer zur Gesamtsumme addieren.

## Idle-Kosten verwenden, nicht Prozent des Fensters

Ein Prozentsatz des Kontextfensters ist kein haltbares Ziel, weil der Nenner willkürlich ist. Dieselbe Konfiguration liest sich als 6,5 % bei einem 1M-Kontext-Modell und als 37 % bei einem 128k-Modell — identischer Text, identische Kosten, völlig unterschiedliche Zahl. Stattdessen gilt:

> **Idle-Kosten** — die Input-Tokens einer Session, die eine Frage stellt und kein Tool aufruft.

Das ist unabhängig vom Modell und vom Fenster, und es lässt sich nicht beschönigen, indem Text aus einem Tool-Schema in eine Kontextdatei verschoben wird. Ein zweiter hilfreicher Wert ist **nach wie vielen Turns die Konversation das Präfix überwächst**: Ein Präfix, der 20 Turns zur Amortisierung braucht, amortisiert sich in einer 5-Turn-Session niemals.

## Die Stellschrauben, nach Effekt sortiert

### 1. Nicht genutzte Funktionen abschalten

Jedes Tool, das dem Modell deklariert wird, fügt sein Schema bei jeder Anfrage hinzu. Das Abschalten optionaler Funktionen mit großen residenten Tools kann daher Request-Tokens sparen. Deferred Tools hingegen tragen nur kurze Katalogeinträge und die Kosten der späteren Discovery oder Invocation bei. Das Deaktivieren einer Funktion entfernt auch ihre Tools aus Subagenten, was die nächste Stellschraube nicht immer leistet.

### 2. Die eager Tool-Oberfläche auf das tatsächlich Genutzte beschränken

`tools.eager` ist eine Allowlist eingebauter Tools, deren Schemas im initialen Request verbleiben. Alles andere wird **deferred**: weiterhin registriert, weiterhin in `/tools` gelistet, weiterhin aufrufbar — das Modell erreicht es über die `tool_search` → `tool_call`-Bridge, wenn es benötigt wird.

Die Allowlist ist am richtigen Baseline zu messen. Tools, die standardmäßig bereits on-demand sind, fehlen schon im ersten Request, und seit `tools.toolSearch.threshold` standardmäßig `0` ist, lädt nichts sie vor. Daher spart eine Allowlist nur die Schemas der eager-by-default-Tools, die sie zurückhält — nicht die gesamte eingebaute Oberfläche. Vor der Zuordnung einer Zahl für die Liste ist eine frische `/context`-Messung auf der tatsächlich laufenden Version vorzunehmen.

```jsonc
{
  "tools": {
    "eager": [
      "read_file",
      "write_file",
      "edit",
      "glob",
      "grep_search",
      "run_shell_command",
      "skill",
    ],
  },
}
```

Vier Dinge, die vor der Verwendung zu beachten sind:

- **Es ist kein Disable.** Ein degradiertes Tool bleibt erreichbar. Wenn ein Tool wirklich entfernt werden soll, ist eine toolweite `permissions.deny`-Regel oder `tools.disabled` zu verwenden.
- **Manche Tools sind ausgenommen** und behalten ihr normales Ladeverhalten unabhängig von der Liste: `tool_search` und `tool_call` (die beiden Hälften der Bridge, die ein zurückgehaltenes Tool erreichen), `structured_output`, die Plan-Mode-Lifecycle-Tools (`enter_plan_mode`, `exit_plan_mode`, `ask_user_question`), `task_stop`, MCP-Tools (`mcp__*`) und Computer-Use-Tools (`computer_use__*`). `task_stop` und die Computer-Use-Familie sind standardmäßig on-demand, sodass deren Gating nichts spart; MCP-Tools werden über `tools.toolSearch.*` und die serverbezogenen Filter `includeTools` / `excludeTools` gesteuert; und nichts in `tools.eager` kann eines der übrigen Tools entfernen: dafür braucht es eine toolweite `permissions.deny`-Regel, einen `tools.disabled`-Eintrag oder `--exclude-tools` — und für das Bridge-Paar entfernt `tools.toolSearch.enabled: false` beide Hälften auf einmal. Das Entfernen einer Bridge-Hälfte ist kein neutraler Ausweg aus der Allowlist: Jedes gewöhnliche deferred Tool (alle MCP-Tools, die deferred Computer-Use-Familie) wird dann in jeden Request zwangsdeklariert, während ein zurückgehaltenes Tool dem Modell nicht angeboten wird und nicht über die Bridge nachgeladen werden kann — es bleibt registriert, sodass ein direkter Aufruf nach Name weiterhin die normale Genehmigung durchläuft.
- **`permissions.allow` spart nichts.** Es ist reine Auto-Genehmigung: Es degradiert, versteckt oder entfernt kein Tool. Genehmigungsmodi tun das ebenfalls nicht.
- **Es braucht beide Hälften der Bridge.** Ein zurückgehaltenes Tool wird mit `tool_search` geprüft und über `tool_call` aufgerufen; `tool_search` allein kann ein Schema lesen, das es nicht aufrufen kann. Wenn eine der beiden nicht registriert ist — `tools.toolSearch.enabled: false` verweigert beide; eine `tool_search`/`tool_call`-deny-Regel, ein `--exclude-tools`-Eintrag oder ein `tools.disabled`-Eintrag entfernt eine — hält die Allowlist die Schemas weiterhin zurück, nichts kann sie nachladen, und die degradierten Tools werden dem Modell für diese Session nicht angeboten (eine Warnung wird geloggt); sie bleiben registriert, sodass ein direkter Aufruf nach Name weiterhin die normale Genehmigung durchläuft. Gewöhnliche deferred Tools fallen in diesem Fall auf eager-Deklaration zurück; mit `tools.eager` degradierte Tools nicht.

`tools.visible` ist das Escape Hatch für ein einzelnes Tool, das von vornherein deklariert sein soll, obwohl es standardmäßig deferred ist.

Agent- und Goal-Koordination (`agent`, `list_agents`, `get_goal`, `update_goal` und `propose_goal`) ist standardmäßig deferred; keine `tools.eager`-Konfiguration ist nötig. Das Modell sieht kurze Discovery-Einträge statt der vollständigen Schemas. Ihre erste Nutzung erfordert Discovery über die Bridge, daher sind Gesamtkosten und erfolgreiche Delegation/Goal-Abschluss ebenso zu vergleichen wie der erste Request. Dies sind gewöhnliche deferred Tools: `tools.visible`, Preloading und das oben beschriebene Eager-Fallback bei unvollständiger Bridge gelten weiterhin. Preloading ist alles-oder-nichts über den gesamten deferred Kandidaten-Pool, und diese fünf Deklarationen sind groß, sodass ein `tools.toolSearch.threshold`, der früher jedes deferred Tool zum Session-Start zeigte, jetzt keines davon zeigen kann. Nach Änderung eines der beiden ist eine neue `/context`-Messung vorzunehmen.

### 3. Szenario-Anleitungen aus Kontextdateien in Skills verschieben

Eine Kontextdatei wird an jede Anfrage jeder passenden Session angehängt, ohne Relevanz-Gating. Ein [Skill](./skills.md) wird nur mit Name und Beschreibung gelistet — in einer gemessenen Stichprobe kamen 84 Skills auf durchschnittlich je 55 Tokens — und lädt seinen Inhalt erst beim Aufruf. Ein Skill, der auf [`paths:`](./skills.md#optional-gate-a-skill-on-file-paths-paths) gegatet ist, wird nicht einmal gelistet, bis eine passende Datei berührt wird.

In einer Kontextdatei gehört nur hinein, was immer gilt — Identität, Vokabular, ein hartes Constraint — und „wenn X getan wird, mache Y" kommt in einen Skill oder eine [`paths:`-gated Rule](./rules.md). `/context detail` benennt jede Kontextdatei, und bei der Datei einer [Extension](../extension/getting-started-extensions.md) auch die Extension, der sie gehört.

### 4. Der System-Prompt, zuletzt

Der Basis-Prompt ist bereits die kleinste der residenten Kategorien, und rund ein Drittel davon ist Sicherheits- und Permission-Text, der nicht bearbeitet werden darf. Seine gegatete Tool-Anleitung folgt dem deklarierten Set, mit einer Ausnahme für bridge-erreichbare Agent; andere in diesen Einträgen genannte Tools benötigen weiterhin Deklarationen. Das Kürzen der Tool-Oberfläche kann daher auch diese Anleitung verkleinern. Das vollständige Ersetzen mit `--system-prompt` ist möglich und ist die riskanteste Änderung auf dieser Seite; wer das tut, sollte bei jedem Upgrade den Upstream-Prompt diffen.

## Fallstricke

- **Subagenten erhalten ebenfalls die deferred Tools.** Ein Subagent ohne explizite Tool-Liste erhält das Schema jedes registrierten Tools, deferred inklusive, und durchläuft nicht ToolSearch. `tools.eager` und `permissions.deny` sind die einzigen Stellschrauben, die ihn erreichen; der Preload-Schwellwert nicht.
- **Die Hintergrund-Memory-Agenten brauchen ihre vollständigen Tool-Listen, und die beiden Listen unterscheiden sich.** Der Projekt-Dream-Worker braucht sechs Tools (`read_file`, `grep_search`, `glob`, `run_shell_command`, `write_file`, `edit`); die automatische Extraktion braucht fünf — dasselbe Set ohne `run_shell_command`, das sie by Design verweigert. Das Verweigern eines Tools, das einer der beiden Agenten tatsächlich hält, degradiert ihn still statt einen Fehler zu melden. Daher `run_shell_command` nicht global verweigern, nur um seine Deklaration loszuwerden: Dream braucht es weiterhin.
- **Tokens können wandern statt verschwinden.** Werden `grep_search` und `glob` entzogen, greift das Modell möglicherweise über die Shell zu `grep` und `find`, deren Output in der Konversation landet. Neuer Output fügt beim ersten Senden Input-Tokens hinzu; unveränderte Historie, die ihn enthält, trifft bei späteren Anfragen möglicherweise den Prefix-Cache des Providers. Eine Änderung ist nach gesamten Input-Tokens pro Task, vom Provider gemeldeten gecachten und ungecachten Inputs und der tatsächlichen Rechnung zu bewerten, nicht nach dem Präfix allein.
- **Fortgesetzte Sessions senden erneut, was sie brauchen.** Ein degradiertes Tool, das in der Historie einer fortgesetzten Session erscheint, erhält sein Schema automatisch zurück; ein verweigertes Tool nicht.
- **Das Erreichen eines zurückgehaltenen Tools schreibt das Präfix nicht mehr um — früher tat es das, und alte Ratschläge gehen davon aus.** Discovery läuft über die `tool_search` → `tool_call`-Bridge, die die deklarierte Tool-Liste byte-stabil lässt, sodass der Prompt-Cache-Präfix eine Mid-Session-Discovery übersteht; die Kosten sind ein zusätzlicher Roundtrip vor der ersten Nutzung eines zurückgehaltenen Tools. Deshalb steht `tools.toolSearch.threshold` jetzt standardmäßig auf `0`: Das Mitführen des deferred Sets in jedem Turn ist nicht mehr die günstigere Seite des Trade-offs. Den Schwellwert nur erhöhen, um diesen Roundtrip für _gewöhnliche_ deferred Tools (MCP-Tools und die On-Demand-Built-Ins) in einer Session zurückzugewinnen, die sie bestimmt benötigt — es lädt nie ein Tool vor, das mit `tools.eager` degradiert wurde; diese bleiben hinter der Bridge bei jedem Schwellwert. Das Preloading läuft auch zum Session-Start, und MCP-Server verbinden sich normalerweise danach, sodass ein frischer Start keine MCP-Tools deklariert, egal wie der Schwellwert steht; sie erreichen das Preloading ab dem nächsten Session-Start (in der CLI nach `/clear`) oder sofort unter `QWEN_CODE_LEGACY_MCP_BLOCKING=1`.
- **Prefix-cachende Modelle kehrten diesen Trade-off früher um; für Deferral tun sie es nicht mehr.** Für ein Modell, dessen Rabatt von einem unveränderten Präfix abhängt, war es früher wichtiger, die Deklarationsliste identisch zu halten als sie klein zu halten — weshalb einige Deployments ToolSearch manuell deaktivierten. Das Erreichen eines zurückgehaltenen Tools lässt diese Liste jetzt byte-stabil, sodass dieser besondere Grund entfallen ist — mit einer Ausnahme, die in der `tool_search`-Beschreibung selbst steht: Eine Tool-Set-Aktualisierung kann ein zurückgehaltenes Tool erneut deklarieren, wenn die aktive Historie einen direkten Aufruf enthält, und das verschiebt das Präfix. Die Präfix-Stabilität spricht weiterhin gegen alles andere, das das Präfix mitten in der Session umschreibt, wie das Bearbeiten einer Kontextdatei zwischen Turns.
- **Scope-Leaks.** Settings gelten für jeden Client, der sie liest (CLI, WebShell, serve), daher braucht eine deployment-spezifische Tool-Oberfläche einen eigenen Settings-Scope.

## Die Ersparnis überprüfen

1. Idle-Kosten vor der Änderung notieren: eine frische Session, eine triviale Frage, `/context` im ersten Turn.
2. Jeweils eine Stellschraube anwenden und wiederholen, die Session neu gestartet — die meisten dieser Einstellungen werden beim Start gelesen.
3. Bestätigen, dass die Funktionalität erhalten geblieben ist, anhand des eigenen Task-Sets: Tool-Call-Erfolgsrate, wie oft `tool_search` aufgerufen werden muss, und Task-Ergebnisse. Ein degradiertes Tool, nach dem das Modell nie sucht, schlägt nicht laut fehl; es wird einfach nicht mehr genutzt.
4. Die Rechnung prüfen, nicht nur das Präfix — siehe den Fallstrick zu Tokens, die in die Konversation wandern.

## Siehe auch

- [Token Caching](./token-caching.md) — was Caching mit dem Preis des Verbleibenden macht.
- [Rules](./rules.md) — `paths:`-konditionaler Kontext, einschließlich dessen, was eine Extension beitragen kann.
- [Skills](./skills.md) — progressive Offenlegung und `paths:`-Gating.
- [Settings reference](../configuration/settings.md) — die genaue Semantik von `tools.eager`, `tools.visible`, `tools.disabled`, `tools.toolSearch.*`, `permissions.deny`.