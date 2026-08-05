# Fork-Profile

## Zusammenfassung

Füge eine Schicht benannter Projekt-Profile über der Fork-Execution-Allowlist
hinzu, die mit #8066 eingeführt wurde. Ein Aufrufer kann `fork_profile: "<name>"`
übergeben, statt `fork_tools` zu wiederholen; die Runtime löst
`.qwen/fork-profiles/<name>.md` einmalig beim Start auf und speist die
resultierende Tool-Liste in das bestehende Execution-Gate ein.

Diese Phase führt keinen neuen Autorisierungsmechanismus ein. Das aufgelöste
Profil muss sich exakt wie der entsprechende Inline-`fork_tools`-Aufruf
verhalten.

## Dateiformat

Profile liegen unterhalb des aktiven Projekt-Roots:

```text
.qwen/fork-profiles/<name>.md
```

Jede Datei enthält YAML-Frontmatter:

```markdown
---
name: ro-research
tools:
  - read_file
  - grep_search
  - glob
  - mcp__search__*
promptHint: |
  Work read-only. Prefer targeted searches and report evidence.
---
```

`name` und `tools` sind erforderlich. `promptHint` ist optional und auf 200
Zeichen begrenzt. Der angefragte Name, der Dateiname und der Name im
Frontmatter müssen übereinstimmen. Namen sind 2–50 Zeichen lang und enthalten
nur Buchstaben, Zahlen, Bindestriche oder Unterstriche, ohne führendes oder
abschließendes Trennzeichen. Profil-Dateien bestehen nur aus Frontmatter; ein
nicht-leerer Markdown-Body wird abgelehnt, damit Anweisungen nicht
stillschweigend verworfen werden können. Ein Profil muss sich auf eine
reguläre Datei innerhalb des Projekt-Profilverzeichnisses auflösen und darf
64 KiB nicht überschreiten.

Das `tools`-Feld nutzt exakt den `fork_tools`-Vertrag. Eine leere Liste bleibt
deny-all, ein nacktes `*` ist ungültig, und die MCP-Wildcard-Syntax bleibt
unverändert.

Der Projekt-Scope ist in dieser Phase der einzige Lookup-Scope. Profile auf
User-Ebene, Scope-Rangfolge, eingebaute Profile, Profil-Listing und
Management-UI sind zurückgestellt. Safe Mode und Bare Mode lehnen
Projekt-Profile ab, da es sich um lokale Anpassungen handelt. Der AUTO-Modus
behandelt Schreibvorgänge unter `.qwen/fork-profiles/` als Selbständerung,
sodass sie den normalen In-Workspace-Edit-Fast-Path nicht nutzen können.

## Start-Auflösung

`fork_profile` ist nur zusammen mit `subagent_type: "fork"` gültig und kann
nicht mit `fork_tools` oder einem benannten Teammate kombiniert werden. Der
Agent-Aufruf löst das Profil auf, bevor er die Fork-Runtime konstruiert:

1. Validiere den angefragten logischen Namen, bevor ein Dateisystempfad
   gebaut wird.
2. Lies das passende Projekt-Profil und parse dessen YAML-Frontmatter strikt.
3. Validiere die Identität von Dateiname/Frontmatter und die Tool-Allowlist.
4. Binde das geparste Profil an einen einzigen Start-Snapshot und mache seine
   effektiven Tools und den Prompt-Hint für die AUTO-Modus-Klassifikation
   sichtbar.
5. Übergib eine geklonte Tool-Liste als `ToolConfig.executionAllowedTools`.
6. Hänge `promptHint`, falls vorhanden, nach dem vom Parent abgeleiteten
   cachebaren Präfix an die Fork-Task-Direktive an. Der projekt-kontrollierte
   Text wird escaped und als Hinweis nach der Direktive eingerahmt, während
   die maßgebliche Ausführungseinschränkung zuletzt bleibt.

Fehlende oder ungültige Profile lassen den Start fehlschlagen, bevor die
Agent-Runtime, Hooks, der Eintrag in der Hintergrund-Registry oder das
Transkript-Sidecar erzeugt werden.

## Runtime und Revival

Das bestehende Execution-Gate bleibt maßgeblich. Die Profil-Auflösung ändert
weder die für das Modell sichtbaren Deklarationen noch umgeht sie normale
Berechtigungen für ein erlaubtes Tool.

Die aufgelöste Tool-Liste, nicht der Profil-Name oder -Pfad, ist die Policy
zum Startzeitpunkt. Das bestehende `AgentMeta.executionAllowedTools`-Sidecar
speichert sie, einschließlich einer leeren deny-all-Liste. Cold Revival wendet
diesen Snapshot erneut auf die aktuelle Live-Tool-Fläche an und liest kein
Profil neu, das sich seit dem Start geändert haben könnte.

Der Start-Task-Prompt ist bereits Teil des Fork-Transkripts, sodass der
aufgelöste Prompt-Hint dem bestehenden Transkript-/Revival-Pfad ohne einen
zweiten Profil-Lookup folgt.

## Grenzen

Diese Phase fügt keine Shell-Argument-Patterns, Overlay-Dateisysteme,
`/btw`-Integration, automatische Reflexions-/Schwarm-Orchestrierung, Profile
auf User-Ebene oder Profil-CRUD-UI hinzu.

Fork-Profile sind eine Komfortfunktion für Aufrufer und eine
projekt-kontrollierte Prompt-Schicht, keine von Administratoren durchgesetzte
Sandbox. Sie können die vom Parent geerbte ausführbare Fläche nur
einschränken.
