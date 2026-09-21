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

Jede Funktion, die ein Tool registriert, bezahlt für das Schema dieses Tools bei jeder Anfrage. Die größten einzelnen eingebauten Einträge gehören zu optionalen Funktionen. Ein Deployment, das Workflows, Goals, geplante Tasks oder die Review-Tools nicht nutzt, spart also mehr durch Abschalten dieser Funktionen als durch beliebiges Prompt-Editing. Dadurch wird das Tool auch aus Subagenten entfernt, was die nächste Stellschraube nicht immer leistet.

### 2. Die eager Tool-Oberfläche auf das tatsächlich Genutzte beschränken

`tools.eager` ist eine Allowlist eingebauter Tools, deren Schemas im initialen Request verbleiben. Alles andere wird **deferred**: weiterhin registriert, weiterhin in `/tools` gelistet, weiterhin aufrufbar — das Modell lädt es bei Bedarf mit `tool_search` nach.

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
- **Manche Tools sind ausgenommen** und behalten ihr normales Ladeverhalten unabhängig von der Liste: `tool_search`, `structured_output`, die Plan-Mode-Lifecycle-Tools (`enter_plan_mode`, `exit_plan_mode`, `ask_user_question`), `task_stop`, MCP-Tools (`mcp__*`) und Computer-Use-Tools (`computer_use__*`). `task_stop` und die Computer-Use-Familie sind standardmäßig on-demand, sodass deren Gating nichts spart; MCP-Tools werden über `tools.toolSearch.*` und die serverbezogenen Filter `includeTools` / `excludeTools` gesteuert, und die einzigen Wege, eines der ersten drei Tools loszuwerden, sind `permissions.deny`.
- **`permissions.allow` spart nichts.** Es ist reine Auto-Genehmigung: Es degradiert, versteckt oder entfernt kein Tool. Genehmigungsmodi tun das ebenfalls nicht.
- **`tool_search` muss aktiv bleiben.** Wenn ToolSearch nicht registriert ist — `tools.toolSearch.enabled: false`, eine `tool_search`-deny-Regel oder der automatische Opt-out für DeepSeek-Modelle — hält die Allowlist die Schemas weiterhin zurück, aber nichts kann sie nachladen, und die degradierten Tools sind für diese Session unerreichbar.

`tools.visible` ist das Escape Hatch für ein einzelnes Tool, das von vornherein deklariert sein soll, obwohl es standardmäßig deferred ist.

### 3. Szenario-Anleitungen aus Kontextdateien in Skills verschieben

Eine Kontextdatei wird an jede Anfrage jeder passenden Session angehängt, ohne Relevanz-Gating. Ein [Skill](./skills.md) wird nur mit Name und Beschreibung gelistet — in einer gemessenen Stichprobe kamen 84 Skills auf durchschnittlich je 55 Tokens — und lädt seinen Inhalt erst beim Aufruf. Ein Skill, der auf [`paths:`](./skills.md#optional-gate-a-skill-on-file-paths-paths) gegatet ist, wird nicht einmal gelistet, bis eine passende Datei berührt wird.

In einer Kontextdatei gehört nur hinein, was immer gilt — Identität, Vokabular, ein hartes Constraint — und „wenn X getan wird, mache Y" kommt in einen Skill oder eine [`paths:`-gated Rule](./rules.md). `/context detail` benennt jede Kontextdatei, und bei der Datei einer [Extension](../extension/getting-started-extensions.md) auch die Extension, der sie gehört.

### 4. Der System-Prompt, zuletzt

Der Basis-Prompt ist bereits die kleinste der residenten Kategorien, und rund ein Drittel davon ist Sicherheits- und Permission-Text, der nicht bearbeitet werden darf. Er beschreibt außerdem nur noch die Tools, die die Session tatsächlich deklariert hat, sodass das Kürzen der Tool-Oberfläche ihn kostenlos etwas verkleinert. Das vollständige Ersetzen mit `--system-prompt` ist möglich und ist die riskanteste Änderung auf dieser Seite; wer das tut, sollte bei jedem Upgrade den Upstream-Prompt diffen.

## Fallstricke

- **Subagenten erhalten ebenfalls die deferred Tools.** Ein Subagent ohne explizite Tool-Liste erhält das Schema jedes registrierten Tools, deferred inklusive, und durchläuft nicht ToolSearch. `tools.eager` und `permissions.deny` sind die einzigen Stellschrauben, die ihn erreichen; der Preload-Schwellwert nicht.
- **Der Hintergrund-Agent für Memory benötigt sechs Tools** (`read_file`, `grep_search`, `glob`, `run_shell_command`, `write_file`, `edit`). Wird eines davon verweigert, degradiert er still statt einen Fehler zu melden.
- **Tokens können wandern statt verschwinden.** Werden `grep_search` und `glob` entzogen, greift das Modell möglicherweise über die Shell zu `grep` und `find`, deren Output in der Konversation landet. Neuer Output fügt beim ersten Senden Input-Tokens hinzu; unveränderte Historie, die ihn enthält, trifft bei späteren Anfragen möglicherweise den Prefix-Cache des Providers. Eine Änderung ist nach gesamten Input-Tokens pro Task, vom Provider gemeldeten gecachten und ungecachten Inputs und der tatsächlichen Rechnung zu bewerten, nicht nach dem Präfix allein.
- **Fortgesetzte Sessions senden erneut, was sie brauchen.** Ein degradiertes Tool, das in der Historie einer fortgesetzten Session erscheint, erhält sein Schema automatisch zurück; ein verweigertes Tool nicht.
- **Ein deferred Tool, das mitten in der Session enthüllt wird, invalidiert den Prefix-Cache.** Funktionsdeklarationen stehen ganz vorn im Präfix, daher schreibt eine einzige Enthüllung ihn um und der gesamte Prompt wird für diesen Turn neu berechnet. Das Vorladen des deferred Sets (`tools.toolSearch.threshold`) vermeidet das auf Kosten des Mitführens dieser Schemas in jedem Turn; `threshold: 0` gewinnt nur, wenn die Session sie wirklich niemals benötigt.
- **Prefix-cachende Modelle kehren den Trade-off um.** Für Modelle, deren Rabatt von einem stabilen Präfix abhängt, ist es mehr wert, das Präfix identisch zu halten als es klein zu machen; DeepSeek-Modelle steigen aus diesem Grund automatisch aus ToolSearch aus.
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