# Deklarative Agenten-Definitionen – Portierung von Claude Code 2.1.168

Internes Designdokument für die Portierung des deklarativen Agenten-Schemas (Markdown + YAML Frontmatter) von Claude Code auf qwen-code, das Issue [#4821][i4821] adressiert und mit der Workflow-Portierung in Issue [#4721][i4721] / PR [#4732][p4732] koordiniert.

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## Implementierungsstatus (vertikal gesliced)

PR [#4842][p4842] hat die Felder mit einem End-to-End-Runtime-Pfad zum damaligen Zeitpunkt ausgeliefert. PR [#4870][p4870] hat dann den YAML-Parser ersetzt, um Block-Skalare zu unterstützen. Dieser Follow-up-PR baut auf beiden auf: Er ersetzt den YAML-**Stringifier** (PR #4870 hatte ihn handgestrickt gelassen – siehe `docs/yaml-parser-replacement.md`), stellt `mcpServers` + `hooks` in `SubagentConfig` bereit und verbindet sie mit der Laufzeit, sodass agent-spezifische MCP-Server und Hooks tatsächlich feuern, wenn ein Subagent läuft.

| Feld               | Status                            | Anmerkungen                                                                                                                                                                                                                    |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `permissionMode`   | **ausgeliefert (#4842)**          | Brückt zum bestehenden qwen `approvalMode` bei der Parse-Zeit                                                                                                                                                                  |
| `maxTurns`         | **ausgeliefert (#4842)**          | Eingebunden in den bestehenden `runConfig.max_turns` Runtime-Pfad                                                                                                                                                              |
| `color`-Allowlist  | **ausgeliefert (#4842)**          | Schränkt das bestehende Feld auf CC's `_Y`-Set ein + Legacy-Sentinel-Handling für `auto`                                                                                                                                       |
| `mcpServers`       | **ausgeliefert (Follow-up)**      | Nested YAML round-trip sicher via eemeli/`yaml` stringify; Runtime-Override merged Session- und Agent-Server via Subagent Config Wrapper + erzwungener Tool-Registry-Neubau                                                       |
| `hooks`            | **ausgeliefert (Follow-up)**      | Flüchtige HookRegistry-Einträge, die beim Erstellen eines Subagenten registriert und via `onStop` entfernt werden; v1 feuert global (kein Agent-Scope-Filter)                                                                  |
| `effort`           | zurückgestellt                    | Es gibt noch keinen `effort`-Parameter auf Model-Ebene in qwen-Providern                                                                                                                                                        |
| `memory`           | zurückgestellt                    | qwen's Auto-Memory hat noch keine `user`/`project`/`local`-Scope-Unterscheidung                                                                                                                                                 |
| `isolation`        | zurückgestellt                    | Workflow PR #4732 besitzt die Runtime; der agent-spezifische Default kommt mit diesem PR                                                                                                                                       |
| `initialPrompt`    | zurückgestellt                    | Erfordert `--agent` CLI-Flag (keine Main-Session-Agent-Infrastruktur in qwen)                                                                                                                                                   |
| `skills`           | zurückgestellt                    | Erfordert SkillManager-Konsum von `config.skills`                                                                                                                                                                              |

Der vollständige Reverse-Engineering-Bericht unten bleibt als Design-Referenz für die zurückgestellten Felder erhalten – Schema-Konstanten, DL7/Ig5-Semantiken, Fehlermeldungen und die Koordinationsmatrix mit dem Workflow sind für diese Arbeit weiterhin tragend.

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## Phase 0 — Grenzen

| Punkt                     | Wert                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Letztes geprüftes Upstream | Claude Code **2.1.168** (Issue #4821 referenziert ≥ 2.1.167, wir liegen einen Bump darüber)                                            |
| Native Binärdatei         | `/private/tmp/cc-2.1.168/package/claude` (220 MB)                                                                                       |
| Strings-Extrakt           | `/private/tmp/cc-2.1.168/claude.strings` (~342 k Zeilen)                                                                                |
| Worktree                  | `.claude/worktrees/gifted-hamilton-684741`                                                                                              |
| Branch                    | `lazzy/gifted-hamilton-684741` ab `main @ 45efb1d3a`                                                                                   |
| Ausgeschlossen            | PR #4732 Workflow-Code (separates Worktree `lazzy/lucid-pare-974192`) – nur über Schnittstelle koordinieren                             |
| Autorenregel              | Autor ist **LaZzyMan**; **keine** `Co-Authored-By`- oder AI-Tooling-Header in Commits, PRs, Issues oder Kommentaren (laut `~/.claude/CLAUDE.md`) |

---

## Phase 1 — Reverse-Engineering-Ergebnisse

Alle Behauptungen hier wurden unabhängig gegen `claude.strings` gegrept und haben einer adversarialen Widerlegung standgehalten. Vertrauensstufen: **C** = Bestätigt (direkter Binärnachweis), **I** = Abgeleitet (aus mehreren bestätigten Fakten synthetisiert), **O** = Offen (noch unsicher).

### Schema — die 15 Felder, widerlegt und neu bestätigt

Das Agent-Frontmatter-Schema ist `Ig5`, verwendet in `ug5.agent` für `tengu_frontmatter_shadow_unknown_key` / `_mismatch` Telemetrie. Der **Produktions-Loader ist `DL7`** (`parseAgentFromMarkdown`), der eine handgestrickte feldweise Validierung mit benutzerdefinierten Fehlermeldungen durchführt. Ein separates **JSON-Form-Schema `JL7`** (verwendet von `fL7` / `parseAgentFromJson`) ist strenger, aber ein anderer Codepfad (verwendet von `--agents <json>` und `settings.agents`).

| #   | Feld               | Typ (Ig5 / DL7)                          | Erforderlich | Standard        | Enum / Einschränkung                                                                                                                        | Best.                                       |
| --- | ------------------ | ---------------------------------------- | ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `name`             | string, nicht leer                       | **ja**       | —                | keine — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                    | **C** strings:308120, 309074                |
| 2   | `description`      | string, nicht leer                       | **ja**       | —                | JL7: `.min(1, "Description cannot be empty")`                                                                                               | **C** strings:308120, 309074, 309076        |
| 3   | `model`            | string                                   | nein         | undefined        | `inherit` (Groß-/Kleinschreibung egal) => literal `"inherit"`; sonst getrimmt durchgereicht                                                 | **C** strings:308120, 309075, 309076        |
| 4   | `tools`            | string\|array (MDH-Vereinigung)           | nein         | undefined        | Einzelnes Token `*` => `undefined` ("alles erben"); dedupliziert via `AXH`/`FbK`                                                             | **C** strings:308120 (MDH/AXH), 309075      |
| 5   | `disallowedTools`  | string\|array (MDH)                       | nein         | undefined        | "Wird ignoriert, wenn `tools` gesetzt ist" (laut Beschreibungstext); von Aufrufern erzwungen                                                | **C** strings:308120, 309075                |
| 6   | `effort`           | string\|integer                          | nein         | undefined        | Enum `GN=["low","medium","high","xhigh","max"]` ODER `int`; Alias `P37={med:"medium"}`                                                     | **C** strings:308120, 309075, GN/P37 inline |
| 7   | `permissionMode`   | string                                   | nein         | undefined        | Enum `$E = Gmq = [...kc]` wobei `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 Werte)                        | **C** strings:307649 (kc), 308120, 309075   |
| 8   | `mcpServers`       | `z.unknown()` (Ig5); `array(jL7)` (JL7)  | nein         | undefined        | Jedes Element: string ODER `record(string, MCPServerSpec)`; pro Element `safeParse` in DL7                                                 | **C** strings:308120, 309075, 309076        |
| 9   | `hooks`            | `z.unknown()` (Ig5); `_u()` (JL7)        | nein         | undefined        | Lazy zur Laufzeit via `TKO` => `_u().safeParse` validiert (settings.json hooks Form)                                                       | **C** strings:308120, 309073 (TKO), 309076  |
| 10  | `maxTurns`         | `union(number, string, null)`            | nein         | undefined        | Positive Ganzzahl (geparst von `W46` – akzeptiert Zahlen oder Zahlenstrings)                                                               | **C** strings:308120, 309075 (W46), 309076  |
| 11  | `skills`           | string\|array (MDH)                       | nein         | `[]` (emittiert) | Normalisiert via `ml(q.skills) = FbK(H) ?? []`; kein `*`-Wildcard (anders als `tools`)                                                     | **C** strings:308120, 309075                |
| 12  | `initialPrompt`    | string                                   | nein         | undefined        | Nur Leerzeichen -> undefined; wird nur automatisch übermittelt, wenn Agent die **Hauptsitzung** ist (via `--agent` / settings), als Subagent ignoriert | **C** strings:308120, 309075                |
| 13  | `memory`           | string                                   | nein         | undefined        | Enum `["user","project","local"]`                                                                                                           | **C** strings:308120, 309075, 309076        |
| 14  | `background`       | string\|bool (eiH=EL8)                   | nein         | undefined        | Akzeptiert `true` / `false` / `"true"` / `"false"`; nur truthy -> `true`, sonst `undefined`                                                | **C** strings:308120, 309075                |
| 15  | `isolation`        | string                                   | nein         | undefined        | Enum **nur** `["worktree"]` (NICHT `["none","worktree"]` – das ist ein anderes Schema bei strings:313284 für Hintergrundsitzungseinstellungen) | **C** strings:308120, 309075, 309076        |

Subtile Beobachtung, die der Widerlegung standgehalten hat: Obwohl `skills` "optional" ist, lautet die Emit-Klausel von DL7 `...I !== void 0 && {skills: I}` und `ml(undefined)` gibt `[]` (nicht undefined) zurück, sodass der **finale emittierte Datensatz `skills: []` enthalten wird, selbst wenn das Frontmatter das Feld weglässt**. Dies betrifft Gleichheitsprüfungen nachgelagert – Flag für den qwen-code-Port.

### Mögliche zusätzliche Felder über die 15 hinaus

| #   | Feld         | Typ    | Standard  | Enum / Einschränkung                                                                                                                                                                                 | Best.                                    |
| --- | ------------ | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 16  | **`color`**  | string | undefined | Enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; beschrieben als `"@internal — display color in the agents UI"`; Werte außerhalb von `_Y` werden stillschweigend bei der Parse-Zeit verworfen (DL7 emittiert `...z && typeof z === "string" && _Y.includes(z) && {color: z}`) | **C** strings:308120, 309075, \_Y inline |

Dies ist das **einzige** neue Agent-Frontmatter-Feld außerhalb der Liste von #4821. Felder, die auf `Ig5` / `JL7` gesucht, aber **NICHT** gefunden wurden: `version`, `tags`, `labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`, `owner`, `author`, `homepage`, `displayName`, `shortDescription` (diese tauchten alle nur im Skill-Schema `bg5` oder in unabhängigen Bezeichnern auf).

### Loader — Datei- und Funktionszuordnung

| Aufgabe                                                       | Funktion                                                                                                                                                    | Position              | Best. |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----- |
| Top-Level-Registry-Assembler                                  | `QL` (Exportname `getAgentDefinitionsWithOverrides`)                                                                                                        | strings:309076        | **C** |
| Dateisystem-Walker (gemeinsam mit Skills/Commands/Output-Styles) | `Gm` (memoisiert via `h6`)                                                                                                                                  | strings:312887        | **C** |
| Pro-`.md`-Entdeckung                                          | `d_q` (= `loadMarkdownFiles`, ripgrep mit `--files --hidden --follow --no-ignore --glob *.md`, 3 s `AbortSignal.timeout`, Fallback `wY3` wenn `__("true")`) | strings:312887        | **C** |
| Pro-Datei-Parser (Markdown)                                    | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                          | strings:309074        | **C** |
| Pro-Datei-Parser (JSON)                                        | `fL7` (= `parseAgentFromJson`), verwendet `JL7`-Schema                                                                                                      | strings:309073        | **C** |
| Plugin-Agent-Loader                                            | `b0_` → pro Verzeichnis `oR7` → pro Datei `sR7`                                                                                                            | strings:308780, 308779 | **C** |
| Eingebaute Agenten                                             | `naH()` — emittiert `[JqH=general-purpose, KL7=statusline-setup, …]` plus implizit `YI=fork`                                                               | strings:309073, 308663 | **C** |
| Override-Auflöser                                              | `DS()` (= `getActiveAgentsFromList`) — siehe Auflösungsreihenfolge                                                                                          | strings:309073        | **C** |
| Cache-Invalidierung                                            | `u0_()` (= `clearAgentDefinitionsCache`) — leert `QL.cache` + `Gm.cache`                                                                                    | strings:309073        | **C** |
| FS-Watcher (chokidar)                                          | `s_T()` => `Q4_=s_T()` bei Modul-Init (`WB6`)                                                                                                              | strings:316417        | **C** |

`Gm("agents", _)` liest drei baseDirs (`policySettings`, `userSettings`, `projectSettings`), jede mit einem Tag auf dem Datensatz, und dedupliziert dann nach **Inode** (verwirft Duplikate mit gleicher Inode von Symlinks/Hardlinks, loggt `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`). Telemetrie: `tengu_dir_search` mit `managedFilesFound`, `userFilesFound`, `projectFilesFound`, `projectDirsSearched`, `subdir`.

### Auflösungsreihenfolge — definitive Priorität

Die Funktion `DS()` filtert ihre Eingabe nach `source` und iteriert dann ein Array fester Reihenfolge in eine `Map`, die nach `agentType` indexiert ist. Da `Map.set` überschreibt, **gewinnt der LETZTE erreichte Bucket**:

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  höchste Priorität
```

| Quelle             | Ursprung                                                                                                                                                                             | Override-Priorität | Best.                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------- |
| `built-in`         | `naH()` (hartcodiert in der Binärdatei)                                                                                                                                              | 1 (niedrigste)     | **C** strings:309073              |
| `plugin`           | `b0_` → pro Plugin `agentsPath`/`agentsPaths`                                                                                                                                        | 2                  | **C** strings:308780              |
| `userSettings`     | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` oder `~/.claude`)                                                                                                                           | 3                  | **C** strings:312887, 307489      |
| `projectSettings`  | `<cwd>/.claude/agents/` PLUS `iV_()` Walk bis zum Home-Verzeichnis / Git-Root                                                                                                        | 4                  | **C** strings:312887, iV\_ inline |
| `flagSettings`     | `--agents <json>` CLI-Flag (Schema `qKO = h.record(h.string(), JL7())`)                                                                                                              | 5                  | **C** strings:330190, 309076      |
| `policySettings`   | systemverwaltetes Verzeichnis: macOS `/Library/Application Support/ClaudeCode/.claude/agents`, Linux `/etc/claude-code/.claude/agents`, Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (höchste)       | **C** strings:307649 (H2), 312887 |

Kollisionen werden **stillschweigend** aufgelöst – nur das Telemetrie-Ereignis `tengu_plugin_name_collision` feuert (`winner_source: T.at(-1)`); es wird keine "X überschreibt built-in"-Warnung an den Benutzer ausgegeben. (strings:308742 `hMH`.)

Subtiles Verhalten: `iV_()` läuft **innermost-first** von `cwd` aufwärts, aber Map.set gewinnt zuletzt, also gewinnt **der äußere Baum `.claude/agents/` gegen den inneren Baum** innerhalb von projectSettings. Dies ist überraschend – als offene Frage markiert.

### Frontmatter-Parser

| Frage                                                      | Antwort                                                                                                                                                                                                                                          | Best.                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Verwendete Bibliothek?                                      | **Keine** – handgestrickter Splitter `lz`, der `Bun.YAML.parse` aufruft (via Wrapper `l5H`). Keine `gray-matter`, `js-yaml` oder `front-matter` in der Binärdatei.                                                                              | **C** strings:307902 (l5H), 307905 (lz), 110303 (Bun.YAML errors) |
| Regex                                                      | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                          | **C** strings:307905                                              |
| Fehlerbehandlung                                           | YAML-Parse-Fehler -> erneuter Versuch mit Tab-zu-2-Leerzeichen-Normalisierung; falls immer noch fehlschlägt, logge `Failed to parse YAML frontmatter in <file>: <err>` auf warn und gib `{frontmatter: {}, content: body}` zurück (WIRFT NIE) | **C** strings:307905, 151839                                      |
| Body-Extraktion                                            | Einfacher String-Slice `H.slice(K[0].length)` nach schließendem `---`; später normalisiert von `v$H` (vermutlich führendes Newline entfernen)                                                                                                   | **C** strings:307905                                              |
| Gemeinsam genutzt zwischen Agents / Skills / Commands / Output-Styles? | **Ja** – derselbe `lz` wird von `Iq_` (Skill-Loader), `f13` (veralteter Commands-Loader) und dem Agent-Loader via `Gm` → `d_q` wiederverwendet                                                                                                | **C** strings:312690                                              |
| Schema-Validator                                           | **Zod v4** (gebündelt). v4-spezifische Marker `looseObject`, `treeifyError`, `prettifyError`, `toJSONSchema` vorhanden                                                                                                                          | **C** strings:141270-141395, 141586                               |
| Validierungsmodus                                          | **Shadow** – `ahH("agent", frontmatter)` führt `ug5.agent().strict().safeParse()` **nur** für Telemetrie aus; DL7 ignoriert das Ergebnis und fährt mit eigener feldweiser Validierung fort. Das lockere Frontmatter-Objekt ist die Runtime-Source of Truth. | **C** strings:308120 (ahH/ug5), 309074 (DL7 calls but ignores)    |
| Telemetrie-Ereignisse                                       | `tengu_frontmatter_shadow_unknown_key`, `tengu_frontmatter_shadow_mismatch` (dedupliziert via In-Prozess-`Set A37`)                                                                                                                             | **C** strings:154634, 154636                                      |
### Verdrahtung — Agent-Tool + CLI-Flag

| Ebene                            | Funktion                                                                                                                                                                   | Conf                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Task/Agent-Tool-Schema (`$_3`)   | Deklariert `subagent_type: string.optional()`; wenn nicht gesetzt, fällt es auf `general-purpose` (oder `fork`, falls `AI()` wahr ergibt) zurück                            | **C** strings:~309220        |
| Subagent-Suche                   | `activeAgents.find(a => a.agentType === requestedType)` gegen `toolUseContext.options.agentDefinitions.activeAgents`                                                       | **C** strings:~309220        |
| Fuzzy-Fallback                   | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`; mehrdeutige Übereinstimmung → `AgentTypeError`; eindeutiger Treffer → `tengu_subagent_type_normalized` | **C** strings:~309220        |
| Berechtigungsprüfung             | `lV_(toolPermissionContext, "Task", agentType)` — Ablehnung → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.`                             | **C** strings:~309220        |
| System-Prompt-Quelle             | Markdown-Body wird zu `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` — Closure zum Parse-Zeitpunkt eingefangen                 | **C** strings:309074-6 (DL7) |
| Hauptthread-Rendering            | `Pp({mainThreadAgentDefinition, …})` — wenn Agent `appendSystemPrompt: true` hat (der Catch-all `claude`-Built-in), wird Body an Standard angehängt; sonst **ERSETZT** er diesen | **C** strings:311015         |
| `--agent <name>` CLI             | Deklariert via Commander; Action-Handler `if(I) process.env.CLAUDE_CODE_AGENT = I;` — schiebt in Umgebungsvariable, wird anderswo in `appState.agent` gelesen. Auch in PID-Datei vermerkt. | **C** strings:330190, 142138 |
| `--agents <json>` CLI            | Separates Flag; JSON-Datensatz `{name: {description, prompt, …}}` validiert durch `qKO = h.record(h.string(), JL7())`; tritt dem gleichen `activeAgents`-Register mit `source: flagSettings` bei | **C** strings:330190, 309076 |

### Lebenszyklus — Kaltstart + Hot Reload

| Aspekt                          | Verhalten                                                                                                                                                                                                                  | Conf                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Kaltstart                       | Träge — `QL` wird via `h6` (Cache-Wrapper) memoisiert; erster Zugriff liest Dateisystem + Plugins, spätere Zugriffe liefern gecachten Wert                                                                               | **C** strings:309076         |
| Hot-Reload-Mechanismus          | **chokidar-Watcher** `s_T()` registriert bei Modulinitialisierung (`WB6`); überwacht `.claude/agents` (Benutzer + Projekt) zusätzlich zu Skills- und Commands-Verzeichnissen                                               | **C** strings:316417         |
| Watcher-Flags                   | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (macOS true), Ereignisse `add`/`change`/`unlink` | **C** strings:316417         |
| Entprellung                     | 300 ms (`l_T = 300`); Handler ruft `RIH(), Vv(), u0_(), …` auf — `u0_()` invalidiert Agenten-Cache                                                                                                                         | **C** strings:316417, 309073 |
| Adaptive Abfrage                | aktiv = Intervall `n_T = 2000 ms`; inaktiv (keine Interaktion für `r_T = 60000 ms`) → `i_T = 30000 ms`; erzeugt bei Wechsel eine neue chokidar-Instanz                                                                     | **C** strings:316417         |
| `/agents`-Slash-Befehl          | `local-jsx`-UI zum Verwalten von Agenten (Bibliothek/erstellen/bearbeiten/löschen/ausführen) — **KEIN** Rescan-Befehl                                                                                                      | **C** strings:314593         |
| `/reload-plugins`-Slash-Befehl  | Führt `QL(W8())` erneut aus, zählt Agenten neu; deckt Plugin-basierte Agenten ab (die chokidar NICHT überwacht)                                                                                                           | **C** strings:314595, 190948 |
| Andere Invalidierungspfade      | `clearSessionCaches` (verwendet von `/clear`) ruft ebenfalls `u0_()` auf                                                                                                                                                   | **C** strings:313246         |

### Offene Fragen (Phase 1)

| #   | Frage                                                                                                                                   | Conf  | Lösungsweg                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------- |
| F1  | Ist das Fehlen von `color` in #4821 beabsichtigt (es ist `@internal`) oder ein Versehen?                                                | **O** | Als **beabsichtigt** behandeln — Feld portieren, aber als internal/UI-only markieren |
| F2  | Ist das nachsichtige DL7-Verhalten (Hintergrund akzeptiert Strings, maxTurns akzeptiert Strings) ein dokumentiertes User-Feature oder ein Rückwärtskompatibilitäts-Hack? | **O** | Aus Paritätsgründen spiegeln, aber in den Portierungsdokumenten warnen    |
| F3  | Warum ist das `isolation`-Enum `["worktree"]` nur für Agenten, während das Schema für Hintergrundsitzungen `["none","worktree"]` akzeptiert? | **O** | Vermutlich "keine Isolation" = weggelassenes Feld; explizit dokumentieren |
| F4  | Hat `--agents <json>` (flagSettings) bewusst die Priorität 5 (über Projekt, unter Richtlinie)?                                         | **O** | qwen-code kann das Flag in v1 überspringen, Entscheidung verschieben      |
| F5  | Innerste-zuerst-Push durch `iV_` + Map.set-last-wins → **äußerer Baum gewinnt** bei projectSettings-Kollisionen. Fußangel oder beabsichtigt? | **O** | qwen-code sollte **innerste gewinnt**-Semantik wählen, um die Fußangel zu vermeiden |

---

## Phase 2 — Implementierungsplan für qwen-code

### Aktueller Stand — Ein-Absatz-Überblick

qwen-code liefert bereits eine umfangreiche Subagent-Infrastruktur aus:
`SubagentManager` (`packages/core/src/subagents/subagent-manager.ts`) implementiert
CRUD über Markdown+YAML-Frontmatter-Dateien in `.qwen/agents/` (Projekt) und
`~/.qwen/agents/` (Benutzer), unterstützt durch einen eigenen YAML-Parser
(`packages/core/src/utils/yaml-parser.ts` — keine `gray-matter`-/`yaml`-Abhängigkeit,
bestätigt durch `package.json`). `SubagentConfig`
(`packages/core/src/subagents/types.ts:41-122`) hat bereits `name`,
`description`, `tools`, `disallowedTools`, `approvalMode`, `systemPrompt`,
`model`, `runConfig`, `color`, `background`. `SubagentLevel` unterstützt bereits
fünf Bereiche (Sitzung, Projekt, Benutzer, Erweiterung, Built-in) mit Priorität
`Sitzung > Projekt > Benutzer > Erweiterung > Built-in`
(`subagent-manager.ts:189-220`). Das Agent-Tool
(`packages/core/src/tools/agent/agent.ts`) deklariert `subagent_type` und
aktualisiert dynamisch sein Schema-Enum via `subagentManager.changeListener`.
Eine `convertClaudeAgentConfig()`-Brücke existiert bereits in
`packages/core/src/extension/claude-converter.ts:162-220` mit einer Tool-Namen-Abbildung
und `permissionMode → approvalMode`-Abbildung. Die **Lücke** ist: (a) dem Schema
fehlen 8 Felder aus #4821 (`effort`, `permissionMode` als Erstklassig, `mcpServers`, `hooks`, `maxTurns` als Top-Level,
`skills`, `initialPrompt`, `memory`, `isolation`); (b) es gibt kein `--agent <name>`
CLI-Flag; (c) es gibt keinen chokidar-artigen Hot Reload (erweiterungsartige Invalidierung
existiert, aber nicht für Dateisystem-Agenten); (d) `maxTurns` ist derzeit unter
`runConfig.max_turns` verschachtelt — muss laut #2409 auf Top-Level gehoben werden.

### Architekturentscheidungen

#### E1. Wiederverwendung des bestehenden yaml-parser für Frontmatter

**Entscheidung:** `packages/core/src/utils/yaml-parser.ts` wiederverwenden (bereits von
`SubagentManager.parseSubagentContent` und dem Skill-Lader genutzt).
**Begründung:** Claude Codes `lz` ist derselbe gemeinsame Parser, der für Skills +
Commands + Agenten verwendet wird; qwen-code spiegelt dieses Muster bereits wider. Das Hinzufügen von `gray-matter`
oder `js-yaml` ist unnötiger Aufwand. Der vorhandene Parser behandelt `--- … ---`
Aufteilung und schweigt bei fehlerhafter Eingabe (entspricht `lz`'s
`warn-and-return-empty`-Haltung).

#### E2. Auflösungs-/Prioritätsreihenfolge

**Entscheidung:** `Sitzung > Projekt (.qwen/agents/) > Benutzer (~/.qwen/agents/) >
Erweiterung > Built-in` verwenden — d.h. **die bestehende qwen-code SubagentLevel-Reihenfolge
beibehalten, Claude Codes `flagSettings`/`policySettings`-Eimer in v1 NICHT spiegeln**.
**Begründung:** Claude Codes policySettings (verwaltetes Verzeichnis) ist eine Enterprise-Deployment-Geschichte,
die qwen-code nicht hat. Flag-injizierte Agenten (`--agents <json>`) sind ein Power-User-Feature,
das in P4 landen kann. Die bestehenden fünf Ebenen von qwen-code
decken bereits die Fälle ab, die #4821 betrifft: Projekt überschreibt Benutzer,
überschreibt Built-in. Die `extension`-Ebene fügt sich sauber zwischen Benutzer
und Builtin ein.

#### E3. Validierung — bestehenden SubagentValidator beibehalten

**Entscheidung:** `SubagentValidator` erweitern
(`packages/core/src/subagents/`) um die acht neuen Felder zu validieren. **Kein
zod einführen**, es sei denn, die Pipeline von skillManager verwendet es bereits; falls der
vorhandene Validator handgestrickt ist, bleibt er handgestrickt.
**Begründung:** Claude Codes `Ig5` ist nur ein Schatten — die Laufzeitvalidierung ist
handgestrickt `DL7`. Diesem Muster zu folgen, hält Fehlermeldungen lesbar
(z. B. `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`),
ohne eine weitere Abhängigkeit einzubringen. Wenn skillManager bereits zod verwendet, dieser
Wahl aus Konsistenzgründen folgen — wird durch Lesen des Skill-Codes in der P1-Vorbereitung geklärt.

#### E4. Hot Reload — verschieben; auf Kaltstart + explizites Neuladen verlassen

**Entscheidung:** v1 liefert **KEINEN** chokidar-Watcher aus. Cache-Invalidierungs-Hooks
existieren bereits (`subagentManager` hat `changeListener` und explizite
CRUD-gesteuerte Aktualisierung). Projektneuladung erfolgt beim Sitzungsstart;
Bearbeitungen innerhalb der Sitzung über `/agents`-UI invalidieren. Ein `/reload-agents`- (oder auf
`/reload-plugins` aufsattelnder) Slash-Befehl kann in P4 landen, falls Benutzerbedarf besteht.
**Begründung:** Hot Reload über Dateisystem-Watcher ist teuer (chokidar fügt eine Polling-Schleife
mit adaptiver Planung hinzu — Claude Codes Implementierung allein umfasst ~150
Zeilen Buchhaltung). Kaltstart-beim-Start ist für v1 völlig ausreichend und entspricht der Art und Weise,
wie `SubagentManager` heute verdrahtet ist. Tür für P4 offen lassen.

#### E5. `--agent <name>` CLI-Flag verdrahten — in v1 enthalten

**Entscheidung:** `--agent <name>` zu `packages/cli/src/config/config.ts`
CliArgs hinzufügen. Verhalten: gegen das aufgelöste Register suchen, den Agenten als
Hauptthread-Agenten setzen, einen klaren Fehler werfen, wenn der Name nicht aufgelöst wird.
Claude-Code-Semantik entsprechen (Standard-System-Prompt ersetzen, es sei denn, der Agent hat
`appendSystemPrompt: true`). KEINE `CLAUDE_CODE_AGENT`-Umgebungsvariable-Indirektion
verwenden – das `Config`-Objekt von qwen-code kann es direkt tragen.
**Begründung:** Dies ist der benutzerseitige Griff zu #4821 — ohne ihn sind deklarative
Agenten nur über den `subagent_type`-Parameter des Agent-Tools erreichbar, was
für einen "meinen Standard-Agenten setzen"-Anwendungsfall zu indirekt ist. `--agents <json>`
(Plural) kann auf P4 verschoben werden.

#### E6. Workflow.agentType-Koordination — Schnittstellenvertrag

**Entscheidung:** Eine stabile Resolver-Schnittstelle bereitstellen, die PR #4732s
`createProductionDispatch` bei seiner Landung aufrufen kann. Im Einzelnen:

| Vertrag                                                                                                                                                                                                                                                                                       | Eigentümer          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Frontmatter `name` IST der Workflow-`agentType`-String (Schlüsselgleichheit, Groß-/Kleinschreibung beachtend)                                                                                                                                                                                 | dieses PR           |
| Harte `disallowedTools`-Basis des Workflows (`[SEND_MESSAGE, EXIT_PLAN_MODE]`, gespiegelt von upstream `Tg8`; in PR #4732 als `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE` verifiziert) **VEREINIGT** sich mit agent-seitigem `disallowedTools` — Basis wird immer angewendet, selbst wenn die Agentendefinition `tools` setzt | Workflow-PR konsumiert |
| Pro-Aufruf `opts.isolation` überschreibt pro-Agent `isolation: 'worktree'`-Standard                                                                                                                                                                                                           | Workflow-PR konsumiert |
| `model`, `effort`, `permissionMode`, `maxTurns` aus der Agentendefinition überschreiben Workflow-Standards, wenn gesetzt                                                                                                                                                                     | Workflow-PR konsumiert |
| Agent-Body wird zum `systemPrompt` des Subagenten; Workflow's `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` ist der Fallback, wenn `agentType` nicht aufgelöst wird                                                                                                                                       | Workflow-PR konsumiert |
| Wenn `agentType` nicht gesetzt ist oder nicht aufgelöst werden kann, fällt der Workflow auf den Built-in-Workflow-Subagenten zurück (sanft, kein Wurf)                                                                                                                                        | Workflow-PR konsumiert |

**Auflösung des Widerspruchs #4721 / #4821** (`tools` vs
`disallowedTools`-Priorität): dieser Port schreibt das Agenten-Register so,
dass `disallowedTools` **immer getrennt** von `tools` geführt wird. Die Regel
"ignoriert, wenn tools gesetzt ist" aus der Tabelle von #4821 wird **von den Agent-Tool-Aufrufern**
durchgesetzt (d.h. beim Erstellen der `ToolConfig` des Subagenten), nicht zum
Parse-Zeitpunkt. Dadurch kann der Workflow seine Basis immer mit `disallowedTools`
vereinigen, unabhängig davon, ob der Agent `tools` setzt. Das Agenten-Register ist ein
**stummer Datenträger**; Prioritätsregeln leben am Dispatch-Ort. Dies
löst den scheinbaren Konflikt zwischen der "ignoriert"-Regel von #4821 und der
"vereinigen"-Regel von #4721.

**Tool-Namen-Kanonisierung:** `ToolNames.SEND_MESSAGE` und
`ToolNames.EXIT_PLAN_MODE` verwenden (gegen den PR #4732-Diff verifiziert), exportiert als benannte Konstanten aus
`packages/core/src/agents/runtime/workflow-orchestrator.ts`, sobald es landet. Der
deklarative-Agenten-Port selbst muss diese NICHT importieren — sie sind die
Basis des Workflows, die am Workflow-Dispatch-Ort angewendet wird.

### Modulaufteilung

| Pfad                                                               | Neu / Berührt | Zweck                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **Berührt**   | 8 neue Felder zu `SubagentConfig` hinzufügen: `effort`, `permissionMode` (bildet bereits via `approvalMode` ab — beide behalten? siehe E7 unten), `mcpServers`, `hooks`, `maxTurns` (auf Top-Level heben, `runConfig.max_turns` veraltet), `skills`, `initialPrompt`, `memory`, `isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **Berührt**   | `parseSubagentContent` / `serializeSubagent` erweitern, um neue Felder zu round-trippen; `SubagentValidator`-Aufrufe erweitern                                                                                                                                            |
| `packages/core/src/subagents/subagent-validator.ts` (angenommener Pfad) | **Berührt**   | Feldweise Validierung hinzufügen, die DL7-Fehlermeldungen entspricht: `Agent file <path> has invalid permissionMode '<x>'. Valid options: …` usw.                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **Neu**       | Einzige Quelle der Wahrheit für Enum-Konstanten: `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES`. Wörtlich von Claude Code 2.1.168 spiegeln.                                                                              |
| `packages/core/src/subagents/builtin-agents.ts`                    | **Berührt**   | Neue Felder standardmäßig auf undefined; keine Verhaltensänderung                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **Berührt**   | Neue Felder aus aufgelöstem `SubagentConfig` beim Erstellen von Subagent-Optionen lesen (`model`, `maxTurns`, `permissionMode`, `effort`); `isolation`-Pro-Aufruf-Überschreibungssemantik für #4721 einziehen                                                                              |
| `packages/cli/src/config/config.ts`                                | **Berührt**   | `--agent <name>`-Flag hinzufügen; gegen `SubagentManager` beim Start auflösen; Fehler werfen, wenn Name nicht aufgelöst wird                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **Berührt**   | Tests für `--agent`-Flag-Auflösung + Fehlerpfad                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **Berührt**   | Abbildung für neue Felder beim Import von Claude `.md`-Dateien hinzufügen (`mcpServers`, `hooks`, `maxTurns` Top-Level, `memory`, `isolation` usw.)                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **Neu**       | Snapshot-Tests für Enum-Listen; Roundtrip-Parse-/Serialisierungs-Tests                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **Berührt**   | Tests für neue Feldvalidierung, Priorität, Fehlermeldungen                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **Berührt**   | Tests für neue Feldverdrahtung in die Subagent-Laufzeit                                                                                                                                                                                                                        |
| `docs/cli/agents.md` (falls vorhanden) oder `docs/declarative-agents.md`   | **Neu**       | Benutzerreferenz: 16-Felder-Schema + Beispiele                                                                                                                                                                                                                             |
### D7. permissionMode vs approvalMode — Brücke, nicht Ersetzung

**Entscheidung:** Akzeptiere sowohl `permissionMode` (Claude-kompatibel) als auch das bestehende `approvalMode` (qwen-kompatibel) im Frontmatter. Beim Parsen: Wenn `permissionMode` gesetzt ist, wird es anhand der bestehenden Tabelle in `claude-converter.ts:195-208` auf `approvalMode` abgebildet (`default` → `default`, `plan` → `plan`, `acceptEdits` → `auto-edit`, `dontAsk` → `default`, `bypassPermissions` → `yolo`). Wenn beide gesetzt sind, gewinnt `approvalMode` (spezifischer für qwen-code) und es wird ein Telemetrieereignis vom Typ `tengu_frontmatter_shadow_*` ausgelöst, das auf beide Setzungen hinweist.
**Begründung:** Bewahrt Abwärtskompatibilität mit bestehenden `.qwen/agents/*.md`-Dateien, die `approvalMode` verwenden, während Claude Code’s `permissionMode` unverändert akzeptiert wird, sodass Benutzer Claude Code Agent-Dateien unverändert ablegen können.

### Schema-Mapping-Tabelle

| Claude Code 2.1.168-Feld | qwen-code-Feld                                    | Anpassung                                                                                             | Hinweise                                                                                             |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `name`                   | `name`                                            | keine                                                                                                 | identisch, erforderlich                                                                              |
| `description`            | `description`                                     | keine                                                                                                 | identisch, erforderlich                                                                              |
| `model`                  | `model`                                           | Akzeptiere `inherit`, `fast`, `haiku`, `sonnet`, `opus` oder `authType:model-id`                      | qwen-code unterstützt bereits das breitere Vokabular; `inherit` ist neu                              |
| `tools`                  | `tools`                                           | Akzeptiere string\|array; `*` → undefined (inherit-all)                                               | bereits als Array unterstützt; füge string + `*`-Handling hinzu                                      |
| `disallowedTools`        | `disallowedTools`                                 | Akzeptiere string\|array; **immer getrennt von `tools` geführt**                                      | Vorrangsregel (#4821 "ignoriert, wenn tools gesetzt") wird von **Aufrufern** erzwungen, nicht vom Parser |
| `effort`                 | `effort` (neu)                                    | Enum `low/medium/high/xhigh/max` + Integer; Alias `med → medium`                                      | Runtime-Effekt ist qwen-spezifisch (auf existierenden thinking-effort-Knopf abbilden, falls vorhanden, sonst speichern und ignorieren) |
| `permissionMode`         | `permissionMode` (neu) + Brücke zu `approvalMode` | Enum `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`; Mapping-Tabelle gemäß D7               | Akzeptiere Claude-Format unverändert                                                                 |
| `mcpServers`             | `mcpServers` (neu)                                | Array von (string \| `{name: spec}`); pro Element validieren, fehlerhafte Einträge mit Warnung verwerfen | Anbindung an MCP-Runtime in P4                                                                       |
| `hooks`                  | `hooks` (neu)                                     | Objekt, das der hooks-Struktur von settings.json entspricht                                           | Anbindung an Hook-Runtime in P4                                                                      |
| `maxTurns`               | `maxTurns` (neu, oberste Ebene)                   | positive Ganzzahl; akzeptiere numerischen String aus Gründen der Konsistenz                           | **Hochstufung von `runConfig.max_turns`**; verschachtelte Form als veraltetes Alias beibehalten       |
| `skills`                 | `skills` (neu)                                    | Array von Skill-Namen; kommagetrennter String ebenfalls akzeptiert                                    | Runtime: Preload über skillManager, wenn Agent startet                                               |
| `initialPrompt`          | `initialPrompt` (neu)                             | String; nur Leerzeichen → undefined; feuert nur, wenn Agent die Hauptsitzung ist                      | Anbindung über `--agent`-Flag-Pfad                                                                   |
| `memory`                 | `memory` (neu)                                    | Enum `user/project/local`; lädt aus `.qwen/agent-memory/<name>/` usw.                                | Runtime in P4                                                                                        |
| `background`             | `background`                                      | Akzeptiere bool oder String `"true"/"false"`; nur truthy → true                                      | bereits unterstützt; lockere Parseregeln                                                             |
| `isolation`              | `isolation` (neu)                                 | Enum **nur** `["worktree"]`                                                                           | Runtime durch Workflow PR (#4732 P3+); Registry führt das Feld lediglich                             |
| `color` (undokumentiert #16) | `color`                                        | Enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; Werte außerhalb werden stillschweigend verworfen | Bereits in qwen `SubagentConfig`; Validierung verschärfen, um zur Claude-Code-Allowlist zu passen     |

### TDD-Testplan

| Abschnitt                     | Testdatei                                          | Was geprüft wird                                                                                                                                      |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema-Enum-Konstanten        | `agent-frontmatter-schema.test.ts` (neu)            | `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES` stimmen byte-für-byte mit Claude Code 2.1.168 überein (Snapshot) |
| Parser — Happy Path           | `subagent-manager.test.ts`                         | Round-trip: Parsen von `.qwen/agents/test.md` mit allen 16 Feldern → ausgegebener Datensatz hat erwartete Struktur                                         |
| Parser — Pflichtfelder        | `subagent-manager.test.ts`                         | Fehlendes `name` gibt null + warn-Log; fehlendes `description` gibt null + warn-Log                                                                       |
| Parser — Enum-Validierung     | `subagent-manager.test.ts`                         | Ungültiges `permissionMode` / `memory` / `isolation` / `effort` / `color` lösen jeweils eine spezifische Warnung aus (entsprechend DL7-Formulierung) und das Feld wird verworfen |
| Parser — Tolerante Feldtypen  | `subagent-manager.test.ts`                         | `background: "true"` → `true`; `maxTurns: "5"` → `5`; `effort: "med"` → `"medium"`; `tools: "Read,Edit"` → `["Read","Edit"]`; `tools: "*"` → undefined |
| Parser — Color-Allowlist      | `subagent-manager.test.ts`                         | `color: "magenta"` wird stillschweigend verworfen (kein Fehler), `color: "blue"` bleibt erhalten                                                          |
| Skills-Feld-Eigenheit         | `subagent-manager.test.ts`                         | Weglassen von `skills` führt zu `skills: []` (entspricht Claude Code DL7-Ausgabeverhalten)                                                                |
| Auflösungsvorrang             | `subagent-manager.test.ts`                         | Gleicher `name` in Projekt + Benutzer → Projekt gewinnt; in Benutzer + Builtin → Benutzer gewinnt; in Erweiterung + Builtin → Erweiterung gewinnt        |
| Inode-Deduplizierung          | `subagent-manager.test.ts`                         | Zwei Pfade zum selben Inode (Symlink) → nur ein Datensatz, Log wird ausgegeben                                                                            |
| permissionMode-Brücke         | `subagent-manager.test.ts`                         | `permissionMode: bypassPermissions` → aufgelöstes `approvalMode: yolo`; beide gesetzt → `approvalMode` gewinnt + Telemetrie                               |
| `--agent`-CLI-Flag            | `packages/cli/src/config/config.test.ts`            | Flag setzt Haupt-Thread-Agent; unaufgelöster Name wirft Fehler mit `Agent type '<x>' not found. Available agents: …`                                     |
| Agent-Tool-Fuzzy-Fallback     | `agent.test.ts`                                    | `subagent_type: "Test_Engineer"` wird über NFKC-Kleinschreibungsnormalisierung zu einem registrierten `test-engineer` aufgelöst                          |
| Agent-Tool-Nicht-Gefunden     | `agent.test.ts`                                    | Nicht aufgelöster `subagent_type` → Fehlermeldung entspricht `Agent type '<x>' not found. Available agents: <list>`                                      |
| Workflow-Vertrag              | `agent-frontmatter-schema.test.ts`                 | Exportiertes `getAgentByName(name)`-Interface gibt vollständigen SubagentConfig zurück, inklusive `isolation`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns` (konsumierbar durch Workflow PR #4732) |

### Phasenweiser PR-Plan

| Phase | Titel                                                                                                                              | Umfang                                                                                                                                                                                         | Blockiert durch       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | Felder zu `SubagentConfig` hinzufügen; Parser + Validator + Serializer erweitern; `runConfig.max_turns` als veraltet markieren; Enum-Konstanten-Modul hinzufügen; Tests                         | Keine                 |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime`                                                                    | `model`, `effort`, `maxTurns`, `permissionMode`/`approvalMode`-Brücke in `AgentTool.execute()` → `AgentHeadless.create()`-Aufruf einbinden; Tests                                                | P1                    |
| **P3** | `feat(cli): --agent flag for main-thread agent selection`                                                                       | `--agent <name>` zu `CliArgs` hinzufügen; beim Start auflösen; Fehlerpfad; Tests                                                                                                                | P1                    |
| **P4** | (optional, Scope-Creep) `feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime`                           | Die vier "nur Metadaten in v1"-Felder an tatsächliche Runtime-Effekte anbinden                                                                                                                  | P1, plus Skill/MCP/Hook-Subsysteme |

Jeder PR zielt auf ≤ 800 LOC Delta (ohne Tests); P1 ist der größte mit ~600 LOC Validator + Tests.

---

## Phase 3 — Koordinationsmatrix mit Workflow-Port (#4721 / PR #4732)

| Declarative-Agents-Funktion                                           | Workflow-Interaktion                                                                                                                                                                   | Zuständig                                                         | Blockiert durch                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `name`-Feld als Registrierungsschlüssel                               | Lookup-String von Workflow's `opts.agentType` ([#4721][i4721] explizit)                                                                                                                  | **dieser PR** definiert Registry-Vertrag; **Workflow-PR** konsumiert | keine — Registry-Form kann zuerst stabilisiert werden |
| `disallowedTools`-Feld am Agent                                       | Workflow vereinigt mit fest codiertem Floor `[SEND_MESSAGE, EXIT_PLAN_MODE]` (gemäß [#4721][i4721] §2 — verifiziert gegen PR #4732-Diff: `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) | **dieser PR** führt Feld; **Workflow-PR** vereinigt beim Dispatch  | Workflow-PR #4732 P3 wird ausgerollt           |
| `tools`-Feld am Agent                                                 | Workflow reicht unverändert an `ToolConfig.tools` des Subagenten durch                                                                                                                  | **dieser PR** führt Feld; **Workflow-PR** bindet ein               | Workflow-PR #4732 P3                          |
| `model`-Feld am Agent                                                 | Workflow's `opts.model` überschreibt pro Aufruf; das `model` des Agenten ist der Standard                                                                                                | **dieser PR** führt Feld; **Workflow-PR** löst Vorrang auf         | Workflow-PR #4732 P3                          |
| `effort`-Feld am Agent                                                | Überschreibung durch Workflow-Aufruf gewinnt; Agent-Standard als Fallback                                                                                                                 | **dieser PR** führt Feld; **Workflow-PR** löst auf                  | Workflow-PR #4732 P3                          |
| `permissionMode`-Feld am Agent                                        | Wird beim Dispatch auf approvalMode des Subagenten abgebildet; Überschreibung durch Workflow-Aufruf gewinnt                                                                                | **dieser PR** führt Feld via D7-Brücke; **Workflow-PR** bindet ein  | Workflow-PR #4732 P3                          |
| `maxTurns`-Feld am Agent                                              | Ersetzt den fest codierten `WORKFLOW_SUBAGENT_MAX_TURNS = 50` des Workflows, wenn der Agent einen Wert setzt                                                                              | **dieser PR** führt Feld; **Workflow-PR** löst Vorrang auf          | Workflow-PR #4732 P3                          |
| `isolation: 'worktree'`-Feld am Agent                                 | Standard; pro Aufruf überschreibt `opts.isolation` ([#4721][i4721] §3)                                                                                                                     | **dieser PR** führt Feld; **Workflow-PR** besitzt Runtime           | Workflow-PR #4732 P3+ (wirft derzeit in P1)   |
| `initialPrompt`-Feld am Agent                                         | Workflow verwendet es **nicht** (feuert nur, wenn Agent die Hauptsitzung ist via `--agent`)                                                                                                 | **dieser PR** + **CLI**                                            | keine (unabhängig)                            |
| `memory`, `mcpServers`, `hooks`, `skills`                             | Workflow hat keine spezielle Behandlung außer Durchreichen an die Subagent-Runtime                                                                                                        | **dieser PR** führt Felder; Runtime-Anbindung in P4 / Zukunft       | zukünftige PRs                                |
| `EXCLUDED_TOOLS_FOR_SUBAGENTS`-Updates                                | Workflow-PR #4732 fügt `WORKFLOW` zum Set hinzu (laut Issue/PR-Kontext-Recherche — obwohl der adversary-falsifizierende Hinweis bemerkte, dass dies NOCH NICHT in `agent-core.ts` auf `main` ist, nur im Worktree) | **Workflow-PR** zuständig; dieser PR unberührt                     | keine                                          |
| Toolnamen-Kanonische Form für Workflow-Floor (`ToolNames.SEND_MESSAGE`) | Dieser PR importiert die Floor-Konstanten nicht; er führt nur `disallowedTools`-Strings wie verfasst. Die Workflow-PR besitzt die Kanonisierung.                                           | **Workflow-PR**                                                    | Workflow PR #4732                             |
| Auslieferungsreihenfolge                                              | Dieser PR (P1+P2+P3) wird unabhängig vom Workflow ausgeliefert. Workflow-PR #4732 P3 hängt an der Importierbarkeit eines `getAgentByName()`-ähnlichen Resolvers aus diesem PR.              | parallel bis P3 des Workflows                                      | Workflow P3 liest aus den Exports dieses PRs |

**Keine zirkuläre Blockade:** Dieser PR und der Workflow-PR können parallel durch ihre P1/P2-Phasen laufen. Sie synchronisieren sich bei Workflow-P3, das diesen PR's Registry-Resolver benötigt. Wenn dieser PR zuerst kommt, liest Workflow-P3 daraus. Wenn der Workflow-PR zuerst kommt, wird er mit dem existierenden `subagent_type`-Lookup ausgeliefert (gibt Workflow-Standards bei Fehlschlag zurück) und wechselt zum reichhaltigeren Resolver, sobald dieser PR kommt.

---

## Phase 4 — Risiken und offene Fragen

### Risiken

| #   | Risiko                                                                                                                                                                               | Gegenmaßnahme                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Schema-Drift zwischen Claude Code-Minorreleases (2.1.168 → 2.1.x)                                                                                                                       | Enum-Konstanten-Modul als "verifiziert gegen 2.1.168" mit einem Dokumentationskommentar versehen; den strings-grep bei neuen Releases im Rahmen des `feature-reverse`-Skills erneut ausführen |
| R2  | `runConfig.max_turns` → `maxTurns` auf oberster Ebene ist eine breaking Schema-Änderung für bestehende `.qwen/agents/*.md`-Dateien                                                     | Verschachtelte Form als veraltetes Alias mit einmaligem Deprecationszyklus beibehalten; Warnung beim Parsen ausgeben, im CHANGELOG dokumentieren                           |
| R3  | `permissionMode` ↔ `approvalMode`-Hin- und Rückübersetzung verlustbehaftet (Claude hat 6 Modi, qwen hat ca. 4)                                                                         | Beide Richtungen explizit gemäß D7 abbilden; Telemetrie bei Doppelsetzung auslösen; beim Speichern NICHT stillschweigend umschreiben                                      |
| R4  | Neue Felder (`hooks`, `mcpServers`, `skills`, `memory`) in der Registry geführt, aber keine Runtime in v1 → Benutzer könnten sie setzen und stillschweigend keine Wirkung erhalten   | v1-Umfang klar dokumentieren; einmaliges Info-Log pro Agent ausgeben, wenn ein "geführtes, aber noch nicht runtime-fähiges" Feld nicht leer ist                           |
| R5  | Adversarial-Verifikation hat festgestellt, dass `EXCLUDED_TOOLS_FOR_SUBAGENTS` auf `main` KEIN `WORKFLOW` enthält — könnte bedeuten, dass der Workflow-Port noch nicht gemerged ist oder dass der rekursive Fächer-Schutz fehlt | Mit dem Autor des Workflow-PRs (LaZzyMan = self) bestätigen, dass der Schutz mit PR #4732 kommt, nicht in diesem Port                                                    |
| R6  | Das Verhalten "Äußerer Baum schlägt inneren Baum" der projectSettings (Q5) ist eine Fußangel, wenn es gespiegelt wird                                                                    | qwen-code wählt explizit **innerstes gewinnt**; durch R5-Fixtur getestet                                                                                                    |
| R7  | Das Feld `color` ist in der Beschreibung der Binary als `@internal` dokumentiert — wir portieren möglicherweise etwas, das Anthropic explizit nicht unterstützt                          | Portieren, aber in der qwen-code-Doku ebenfalls als `@internal` markieren; als reines UI-Element behandeln; nicht in der benutzerseitigen Referenzdokumentation zeigen     |
### Offene Fragen — vorgeschlagene Lösungen

| #   | Frage                                                                                                                                                          | Lösung                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Ist das Weglassen von `color` in #4821 beabsichtigt?                                                                                                                  | **Als beabsichtigt behandeln**. Das Feld portieren; NICHT in der Benutzerdokumentation erwähnen, außer als "verfügbar, intern".                                                                                                                                                                                                                                            |
| Q2  | Nachsichtiges DL7-Verhalten: dokumentieren oder hacken?                                                                                                                       | **Spiegeln**. `background: "true"`, `maxTurns: "5"`, `effort: "med"` zur Gleichheit akzeptieren, auch wenn undokumentiert. Tests hinzufügen.                                                                                                                                                                                                                                |
| Q3  | Warum unterscheidet sich das Isolation-Enum zwischen Agent-Schema und Background-Session-Schema?                                                                                 | **Die Abweichung im Code-Kommentar dokumentieren**; "keine Isolation" = Feld weggelassen, kein Enum-Wert.                                                                                                                                                                                                                                                          |
| Q4  | Sollte `--agents <json>` (Plural, flagSettings) in v1 landen?                                                                                                    | **Auf P4 verschieben**. CLI-Oberfläche für erfahrene Benutzer; v1 liefert nur `--agent <name>` (Singular), worum es in #4821 geht.                                                                                                                                                                                                                                 |
| Q5  | Innerer-Baum vs. äußerer-Baum-Priorität für verschachtelte `.qwen/agents/`?                                                                                                | **Innerster gewinnt**. Überschreibt das versehentliche äußerste-gewinnt-Verhalten von Claude Code. Test-Fixture in P1.                                                                                                                                                                                                                                                          |
| Q6  | `tools` vs. `disallowedTools`-Priorität: #4821 sagt "ignoriert, wenn tools gesetzt ist"; #4721 sagt "Vereinigung mit Workflow-Mindestniveau"                                          | **Registry ist dumme Daten**. Parser bewahrt beide Felder unabhängig. Prioritätsregeln liegen am Dispatch-Ort (Agent-Tool/Workflow). Löst den Widerspruch auf.                                                                                                                                                                                                                                                   |
| Q7  | Tool-Name-Kanonische Form für das Workflow-disallowedTools-Mindestniveau — verifiziert gegen PR #4732 als `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`            | **Nicht Anliegen dieses PRs** — gehört zum Workflow-PR. Nur in der Koordinationsmatrix dokumentieren.                                                                                                                                                                                                                                                              |
| Q8  | Beeinflusst die Schließresolution von #2409 etwas?                                                                                                                   | **Hinweis von #2409 "Model + maxTurns auf oberste Ebene verschieben" übernehmen**. Bereits in diesen Plan eingeflossen.                                                                                                                                                                                                                                                      |
| Q9  | Sollte die Priorität von `extension`-Level-Agenten in qwen-codes bestehendem `SubagentLevel` oberhalb von `builtin` (aktuell) oder unterhalb (Claude Code hat kein Äquivalent) liegen? | **`extension > builtin` beibehalten**. Erweiterungen sind benutzerinstalliert; Built-ins sind Anbieter-Standard. Benutzerinstalliert gewinnt.                                                                                                                                                                                                                                        |
| Q10 | Sind die Issues #4821, #4721, #4732 vollständig für den Vertrag spezifiziert, den dieses Dokument vorschlägt?                                                                             | **Einen Koordinationskommentar auf #4821 posten**, der auf dieses Dokument verweist, die feldbezogenen Entscheidungen zusammenfasst und die Maintainer um Bestätigung bittet: (a) Schema-Gleichheit mit Claude Code 2.1.168's 16 Feldern, (b) D7 `permissionMode`/`approvalMode`-Brücke, (c) D2-Prioritätsreihenfolge, (d) Registry-als-dumme-Daten-Auflösung des `tools`/`disallowedTools`-Widerspruchs. |

### Koordinations-Aktionspunkte

| #   | Aktion                                                                          | Wo                                                |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| A1  | Feld-für-Feld-Zusammenfassung + 5 Entscheidungen auf #4821 posten für Maintainer-Bestätigung        | Kommentar auf #4821                               |
| A2  | Dieses Dokument von #4721 aus verlinken, mit Hinweis auf Phase-3-Matrix                         | Kommentar auf #4721                               |
| A3  | Sobald P1 dieses Ports abgeschlossen ist, #4732 anpingen, um auf reichhaltigeren Resolver umzustellen          | Kommentar auf PR #4732 (wenn bereit)              |
| A4  | Strings-Grep erneut gegen das nächste Claude-Code-Minor-Release für Schema-Drift-Erkennung ausführen | `feature-reverse` Skill-Cron-Job (manuell bis dahin) |