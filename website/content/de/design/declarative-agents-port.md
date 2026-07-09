# Deklarative Agent-Definitionen — Port von Claude Code 2.1.168

Internes Designdokument für den Port des Schemas für deklarative Agenten (Markdown +
YAML-Frontmatter) von Claude Code zu qwen-code. Dies adressiert Issue [#4821][i4821] und
koordiniert den Workflow-Port in Issue [#4721][i4721] / PR [#4732][p4732].

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## Implementierungsstatus (Vertical Slicing)

PR [#4842][p4842] hat die Felder seinerzeit mit einem End-to-End-Laufzeitpfad ausgeliefert. PR [#4870][p4870] hat dann den YAML-Parser ersetzt, um Block-Scalars zu unterstützen. Dieser nachfolgende PR baut auf beiden auf: Er ersetzt den YAML-**Stringifier** (PR #4870 hat ihn manuell implementiert gelassen — siehe
`docs/design/yaml-parser-replacement.md`), exponiert `mcpServers` + `hooks` auf
`SubagentConfig` und bindet sie in die Runtime ein, sodass MCP-Server und Hooks pro Agent tatsächlich ausgelöst werden, wenn ein Subagent läuft.

| Feld              | Status                  | Hinweise                                                                                                                                                          |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **shipped (#4842)**     | leitet zur Parse-Zeit auf das bestehende qwen `approvalMode` um                                                                                                   |
| `maxTurns`        | **shipped (#4842)**     | in den bestehenden `runConfig.max_turns` Runtime-Pfad eingebunden                                                                                                 |
| `color` Allowlist | **shipped (#4842)**     | straft das bestehende Feld auf den `_Y`-Set von CC + `auto` Legacy-Sentinel-Handling                                                                              |
| `mcpServers`      | **shipped (follow-up)** | verschachtelter YAML-Roundtrip sicher durch eemeli/`yaml` stringify; Runtime-Override merged Session- + Agent-Server über Subagent-Config-Wrapper + erzwungenen Tool-Registry-Rebuild |
| `hooks`           | **shipped (follow-up)** | flüchtige HookRegistry-Einträge werden beim Subagent-Spawn registriert und via `onStop` entfernt; v1 feuert global (kein Agent-Scope-Filter)                       |
| `effort`          | deferred                | noch kein `effort`-Parameter auf Model-Layer in qwen-Providern vorhanden                                                                                          |
| `memory`          | deferred                | qwen's Auto-Memory unterscheidet noch nicht zwischen `user`/`project`/`local` Scope                                                                               |
| `isolation`       | deferred                | Workflow-PR #4732 besitzt die Runtime; der Standardwert pro Agent wird eingeführt, wenn dieser PR landet                                                          |
| `initialPrompt`   | deferred                | erfordert `--agent` CLI-Flag (keine Main-Session-Agent-Infrastruktur in qwen)                                                                                     |
| `skills`          | deferred                | erfordert Konsumierung von `config.skills` durch den SkillManager                                                                                                 |

Die vollständige Reverse-Engineering-Dokumentation unten wird als Design-Referenz für die zurückgestellten Felder beibehalten — Schema-Konstanten, DL7/Ig5-Semantik, Fehlermeldungen und die Koordinierungsmatrix mit dem Workflow sind für diese Arbeit weiterhin tragend.

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## Phase 0 — Abgrenzung

| Punkt                    | Wert                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Zuletzt verifizierter Upstream | Claude Code **2.1.168** (Issue #4821 referenziert ≥ 2.1.167, wir sind einen Bump höher)                                                 |
| Natives Binary           | `/private/tmp/cc-2.1.168/package/claude` (220 MB)                                                                                           |
| Strings-Extrakt          | `/private/tmp/cc-2.1.168/claude.strings` (~342 k Zeilen)                                                                                    |
| Worktree                 | `.claude/worktrees/gifted-hamilton-684741`                                                                                                  |
| Branch                   | `lazzy/gifted-hamilton-684741` ab `main @ 45efb1d3a`                                                                                        |
| Nicht im Scope           | PR #4732 Workflow-Code (separates Worktree `lazzy/lucid-pare-974192`) — nur über Schnittstelle koordinieren                                 |
| Autorenregel             | Autor ist **LaZzyMan**; **keine** `Co-Authored-By`- oder AI-Tooling-Trailers in Commits, PRs, Issues oder Kommentaren (gemäß `~/.claude/CLAUDE.md`) |

---

## Phase 1 — Reverse-Engineering-Erkenntnisse

Alle Aussagen hier wurden unabhängig gegen `claude.strings` gegrept und haben einer adversarischen Widerlegung standgehalten. Konfidenzlevel: **C** = Confirmed (direkte Binär-Evidenz), **I** = Inferred (aus mehreren bestätigten Fakten synthetisiert), **O** = Open (noch unsicher).

### Schema — die 15 Felder, widerlegt und erneut bestätigt

Das Shadow-Schema für das Agent-Frontmatter ist `Ig5`, verwendet innerhalb von `ug5.agent` für die `tengu_frontmatter_shadow_unknown_key` / `_mismatch`-Telemetrie. Der **Produktions-Loader ist `DL7`** (`parseAgentFromMarkdown`), der eine manuell implementierte Validierung pro Feld mit benutzerdefinierten Fehlermeldungen durchführt. Ein separates **JSON-Form-Schema `JL7`** (verwendet von `fL7` / `parseAgentFromJson`) ist strenger, folgt aber einem anderen Code-Pfad (verwendet von `--agents <json>` und `settings.agents`).

| #   | Feld              | Typ (Ig5 / DL7)                         | Erforderlich | Standard       | Enum / Constraint                                                                                                                       | Konf                                      |
| --- | ----------------- | --------------------------------------- | ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | `name`            | string, non-empty                       | **ja**       | —              | keine — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                 | **C** strings:308120, 309074              |
| 2   | `description`     | string, non-empty                       | **ja**       | —              | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076      |
| 3   | `model`           | string                                  | nein         | undefined      | `inherit` (case-insensitive) normalisiert zu literal `"inherit"`; sonst pass-through getrimmt                                           | **C** strings:308120, 309075, 309076      |
| 4   | `tools`           | string\|array (MDH union)               | nein         | undefined      | einzelner Token `*` → `undefined` (bedeutet "alles erben"); duped via `AXH`/`FbK`                                                       | **C** strings:308120 (MDH/AXH), 309075    |
| 5   | `disallowedTools` | string\|array (MDH)                     | nein         | undefined      | "Wird ignoriert, wenn `tools` gesetzt ist" (laut Describe-Text); von Callern erzwungen                                                  | **C** strings:308120, 309075              |
| 6   | `effort`          | string\|integer                         | nein         | undefined      | enum `GN=["low","medium","high","xhigh","max"]` ODER `int`; alias `P37={med:"medium"}`                                                  | **C** strings:308120, 309075, GN/P37 inline |
| 7   | `permissionMode`  | string                                  | nein         | undefined      | enum `$E = Gmq = [...kc]` wobei `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 Werte)                    | **C** strings:307649 (kc), 308120, 309075 |
| 8   | `mcpServers`      | `z.unknown()` (Ig5); `array(jL7)` (JL7) | nein        | undefined      | jedes Element: string ODER `record(string, MCPServerSpec)`; `safeParse` pro Element in DL7                                              | **C** strings:308120, 309075, 309076      |
| 9   | `hooks`           | `z.unknown()` (Ig5); `_u()` (JL7)       | nein         | undefined      | lazy zur Laufzeit validiert via `TKO` → `_u().safeParse` (settings.json Hooks-Form)                                                     | **C** strings:308120, 309073 (TKO), 309076 |
| 10  | `maxTurns`        | `union(number, string, null)`           | nein         | undefined      | positive integer (geparst von `W46` — akzeptiert numerisch oder numerischen String)                                                     | **C** strings:308120, 309075 (W46), 309076 |
| 11  | `skills`          | string\|array (MDH)                     | nein         | `[]` (ausgegeben)| normalisiert via `ml(q.skills) = FbK(H) ?? []`; kein `*` Wildcard (im Gegensatz zu `tools`)                                             | **C** strings:308120, 309075              |
| 12  | `initialPrompt`   | string                                  | nein         | undefined      | nur Whitespace → undefined; nur automatisch übermittelt, wenn der Agent die **Main Session** ist (via `--agent` / settings), als Subagent ignoriert | **C** strings:308120, 309075              |
| 13  | `memory`          | string                                  | nein         | undefined      | enum `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076      |
| 14  | `background`      | string\|bool (eiH=EL8)                  | nein         | undefined      | akzeptiert `true` / `false` / `"true"` / `"false"`; nur truthy wird zu `true` normalisiert, sonst `undefined`                           | **C** strings:308120, 309075              |
| 15  | `isolation`       | string                                  | nein         | undefined      | enum **nur** `["worktree"]` (NICHT `["none","worktree"]` — das ist ein anderes Schema bei strings:313284 für Background-Session-Settings) | **C** strings:308120, 309075, 309076      |

Subtile Beobachtung, die der Widerlegung standgehalten hat: Obwohl `skills` "optional" ist, lautet die Emit-Klausel von DL7 `...I !== void 0 && {skills: I}` und `ml(undefined)` gibt `[]` zurück (nicht undefined), sodass der **endgültig ausgegebene Record `skills: []` enthält, selbst wenn das Frontmatter das Feld weglässt**. Dies beeinflusst nachgelagerte Gleichheitsprüfungen — als Flag für den qwen-code Port vormerken.

### Mögliche zusätzliche Felder über die 15 hinaus

| #   | Feld        | Typ    | Standard  | Enum / Constraint                                                                                                                                                                                                                                                            | Konf                                   |
| --- | ----------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 16  | **`color`** | string | undefined | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; beschrieben als `"@internal — display color in the agents UI"`; Werte außerhalb von `_Y` werden zur Parse-Zeit stillschweigend verworfen (DL7 emittiert `...z && typeof z === "string" && _Y.includes(z) && {color: z}`) | **C** strings:308120, 309075, \_Y inline |
Dies ist das **einzige** neue Agent-Frontmatter-Feld über die Liste von #4821 hinaus. Felder, die durchsucht, aber **NICHT** auf `Ig5` / `JL7` gefunden wurden: `version`, `tags`, `labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`, `owner`, `author`, `homepage`, `displayName`, `shortDescription` (diese tauchten nur im Skill-Schema `bg5` oder bei nicht verwandten Identifikatoren auf).

### Loader — Datei- und Funktionszuordnung

| Bereich                                                       | Funktion                                                                                                                                                     | Ort               | Conf  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----- |
| Top-Level-Registry-Assembler                                  | `QL` (Exportname `getAgentDefinitionsWithOverrides`)                                                                                                        | strings:309076         | **C** |
| Filesystem-Walker (gemeinsam genutzt mit Skills/Commands/Output-Styles) | `Gm` (memoisiert über `h6`)                                                                                                                                     | strings:312887         | **C** |
| Pro-`.md`-Erkennung                                           | `d_q` (= `loadMarkdownFiles`, ripgrep mit `--files --hidden --follow --no-ignore --glob *.md`, 3 s `AbortSignal.timeout`, Fallback `wY3` wenn `__("true")`) | strings:312887         | **C** |
| Pro-Datei-Parser (Markdown)                                    | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                           | strings:309074         | **C** |
| Pro-Datei-Parser (JSON)                                        | `fL7` (= `parseAgentFromJson`), verwendet `JL7`-Schema                                                                                                            | strings:309073         | **C** |
| Plugin-Agent-Loader                                           | `b0_` → pro-Verzeichnis `oR7` → pro-Datei `sR7`                                                                                                                       | strings:308780, 308779 | **C** |
| Built-ins                                                     | `naH()` — gibt `[JqH=general-purpose, KL7=statusline-setup, …]` sowie implizit `YI=fork` aus                                                                     | strings:309073, 308663 | **C** |
| Override-Resolver                                             | `DS()` (= `getActiveAgentsFromList`) — siehe Resolution Order                                                                                                  | strings:309073         | **C** |
| Cache-Invalidation                                            | `u0_()` (= `clearAgentDefinitionsCache`) — leert `QL.cache` + `Gm.cache`                                                                                    | strings:309073         | **C** |
| FS-Watcher (chokidar)                                         | `s_T()` → `Q4_=s_T()` bei Modul-Initialisierung (`WB6`)                                                                                                                 | strings:316417         | **C** |

`Gm("agents", _)` liest drei baseDirs (`policySettings`, `userSettings`, `projectSettings`), die jeweils im Record getaggt werden, und entfernt dann Duplikate nach **Inode** (verwirft Duplikate mit gleichem Inode von Symlinks/Hardlinks, loggt `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`).
Telemetrie: `tengu_dir_search` mit `managedFilesFound`, `userFilesFound`, `projectFilesFound`, `projectDirsSearched`, `subdir`.

### Reihenfolge der Auflösung — definitive Priorität

Die Funktion `DS()` filtert ihre Eingabe nach `source` und iteriert dann ein Array fester Reihenfolge in eine `Map`, die nach `agentType` keyt. Da `Map.set` überschreibt, **gewinnt der LETZTE berührte Bucket**:

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  höchste Priorität
```

| Quelle            | Ursprung                                                                                                                                                                            | Override-Priorität | Conf                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| `built-in`        | `naH()` (hardcoded in der Binärdatei)                                                                                                                                                     | 1 (niedrigste)        | **C** strings:309073              |
| `plugin`          | `b0_` → pro-Plugin `agentsPath`/`agentsPaths`                                                                                                                                     | 2                 | **C** strings:308780              |
| `userSettings`    | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` oder `~/.claude`)                                                                                                                          | 3                 | **C** strings:312887, 307489      |
| `projectSettings` | `<cwd>/.claude/agents/` PLUS `iV_()` Walk bis zum Homedir/Git-Root                                                                                                                | 4                 | **C** strings:312887, iV\_ inline |
| `flagSettings`    | `--agents <json>` CLI-Flag (Schema `qKO = h.record(h.string(), JL7())`)                                                                                                           | 5                 | **C** strings:330190, 309076      |
| `policySettings`  | systemverwaltetes Verzeichnis: macOS `/Library/Application Support/ClaudeCode/.claude/agents`, Linux `/etc/claude-code/.claude/agents`, Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (höchste)       | **C** strings:307649 (H2), 312887 |

Kollisionen werden **still** aufgelöst – es wird nur das Telemetrie-Event `tengu_plugin_name_collision` ausgelöst (`winner_source: T.at(-1)`); dem Benutzer wird keine Warnung der Art "X überschreibt built-in" angezeigt. (strings:308742 `hMH`.)

Subtiles Verhalten: `iV_()` läuft **innermost-first** (innerste zuerst) von `cwd` nach oben ab, aber da bei Map.set der letzte gewinnt, **gewinnt das outer-tree `.claude/agents/` gegenüber dem inner-tree** innerhalb von projectSettings. Dies ist überraschend – in den offenen Fragen vermerken.

### Frontmatter-Parser

| Frage                                                   | Antwort                                                                                                                                                                                                                                         | Conf                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Verwendete Bibliothek?                                              | **Keine** – handgeschriebener Splitter `lz`, der `Bun.YAML.parse` aufruft (über Wrapper `l5H`). Kein `gray-matter`, `js-yaml` oder `front-matter` in der Binärdatei.                                                                                               | **C** strings:307902 (l5H), 307905 (lz), 110303 (Bun.YAML errors) |
| Regex                                                      | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                         | **C** strings:307905                                              |
| Fehlerbehandlung                                           | YAML-Parse-Fehler → Retry mit Tab-zu-2-Space-Normalisierung; wenn es immer noch fehlschlägt, `Failed to parse YAML frontmatter in <file>: <err>` auf Warnstufe loggen und `{frontmatter: {}, content: body}` zurückgeben (wirft NIEMALS einen Fehler)                                     | **C** strings:307905, 151839                                      |
| Body-Extraktion                                            | Einfacher String-Slice `H.slice(K[0].length)` nach dem schließenden `---`; später normalisiert durch `v$H` (wahrscheinlich Entfernen führender Newlines)                                                                                                                        | **C** strings:307905                                              |
| Geteilt zwischen Agents / Skills / Commands / Output-Styles? | **Ja** – dasselbe `lz` wird von `Iq_` (Skill-Loader), `f13` (Deprecated-Commands-Loader) und dem Agent-Loader über `Gm` → `d_q` wiederverwendet                                                                                                                  | **C** strings:312690                                              |
| Schema-Validator                                           | **Zod v4** (gebundelt). v4-exklusive Marker `looseObject`, `treeifyError`, `prettifyError`, `toJSONSchema` vorhanden                                                                                                                                   | **C** strings:141270-141395, 141586                               |
| Validierungsmodus                                            | **Shadow** – `ahH("agent", frontmatter)` führt `ug5.agent().strict().safeParse()` **nur** für Telemetrie aus; DL7 ignoriert das Ergebnis und fährt mit seiner eigenen Pro-Feld-Validierung fort. Das nachsichtige Frontmatter-Objekt ist die Source of Truth zur Laufzeit. | **C** strings:308120 (ahH/ug5), 309074 (DL7 calls but ignores)    |
| Telemetrie-Events                                           | `tengu_frontmatter_shadow_unknown_key`, `tengu_frontmatter_shadow_mismatch` (dedupliziert über prozessinternes `Set A37`)                                                                                                                                 | **C** strings:154634, 154636                                      |

### Wiring — Agent-Tool + CLI-Flag

| Ebene                          | Beschreibung                                                                                                                                                                       | Conf                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Task/Agent-Tool-Schema (`$_3`) | Deklariert `subagent_type: string.optional()`; wenn weggelassen, Fallback auf `general-purpose` (oder `fork`, wenn `AI()` true zurückgibt)                                                      | **C** strings:~309220        |
| Subagent-Lookup                | `activeAgents.find(a => a.agentType === requestedType)` gegen `toolUseContext.options.agentDefinitions.activeAgents`                                                             | **C** strings:~309220        |
| Fuzzy-Fallback                 | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`; mehrdeutiger Match → `AgentTypeError`; sauberer Rematch → `tengu_subagent_type_normalized`      | **C** strings:~309220        |
| Permission-Gate                | `lV_(toolPermissionContext, "Task", agentType)` – Ablehnung → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.`                                        | **C** strings:~309220        |
| System-Prompt-Quelle           | Markdown-Body wird zu `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` – Closure wird zur Parse-Zeit erfasst                                  | **C** strings:309074-6 (DL7) |
| Main-Thread-Render             | `Pp({mainThreadAgentDefinition, …})` – wenn der Agent `appendSystemPrompt: true` hat (das Catch-All `claude` built-in), wird der Body an den Default angehängt; andernfalls **ERSETZT** er den Default      | **C** strings:311015         |
| `--agent <name>` CLI           | Deklariert über Commander; Action-Handler `if(I) process.env.CLAUDE_CODE_AGENT = I;` – schreibt in Env-Var, woanders in `appState.agent` gelesen. Wird auch in der PID-Datei aufgezeichnet.          | **C** strings:330190, 142138 |
| `--agents <json>` CLI          | Separates Flag; JSON-Record `{name: {description, prompt, …}}` validiert durch `qKO = h.record(h.string(), JL7())`; tritt derselben `activeAgents`-Registry mit `source: flagSettings` bei | **C** strings:330190, 309076 |
### Lifecycle — Cold Load + Hot Reload

| Aspekt                          | Verhalten                                                                                                                                                                                                                  | Conf                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Cold Load                       | Lazy — `QL` wird über `h6` memoisiert (Cache-Wrapper); der erste Zugriff liest Dateisystem + Plugins, nachfolgende Zugriffe geben den Cache zurück                                                                                               | **C** strings:309076         |
| Hot-Reload-Mechanismus            | **chokidar watcher** `s_T()` bei Modul-Initialisierung registriert (`WB6`); überwacht `.claude/agents` (User + Projekt) sowie Skills- und Commands-Verzeichnisse                                                                                      | **C** strings:316417         |
| Watcher-Flags                   | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (macOS true), Events `add`/`change`/`unlink` | **C** strings:316417         |
| Debounce                        | 300 ms (`l_T = 300`); Handler ruft `RIH(), Vv(), u0_(), …` auf — `u0_()` invalidiert den Agent-Cache                                                                                                                              | **C** strings:316417, 309073 |
| Adaptives Polling                | aktiv = `n_T = 2000 ms` Intervall; idle (keine Interaktion für `r_T = 60000 ms`) → `i_T = 30000 ms`; erstellt die chokidar-Instanz beim Wechsel neu                                                                                   | **C** strings:316417         |
| `/agents` Slash-Command         | `local-jsx` UI zum Verwalten von Agents (Library/create/edit/delete/run) — **KEIN** Rescan-Command                                                                                                                             | **C** strings:314593         |
| `/reload-plugins` Slash-Command | Führt `QL(W8())` erneut aus, zählt Agents neu; deckt Agents aus Plugins ab (die chokidar **NICHT** überwacht)                                                                                                                         | **C** strings:314595, 190948 |
| Andere Invalidierungspfade        | `clearSessionCaches` (verwendet von `/clear`) ruft ebenfalls `u0_()` auf                                                                                                                                                                 | **C** strings:313246         |

### Offene Fragen (Phase 1)

| #   | Frage                                                                                                                                  | Conf  | Lösungsweg                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Q1  | Ist das Weglassen von `color` in #4821 beabsichtigt (es ist `@internal`) oder ein Versehen?                                                            | **O** | Als **beabsichtigt** behandeln — das Feld portieren, aber als internal/UI-only markieren  |
| Q2  | Ist das nachsichtige Verhalten von DL7 (background akzeptiert Strings, maxTurns akzeptiert Strings) ein dokumentiertes, benutzerseitiges Feature oder ein Hack für Abwärtskompatibilität? | **O** | Für Parität spiegeln, aber in den Port-Docs warnen                             |
| Q3  | Warum ist die `isolation`-Enum `["worktree"]` nur für Agents, während das Schema für background-session-Einstellungen `["none","worktree"]` akzeptiert?        | **O** | Wahrscheinlich bedeutet "no isolation" = weggelassenes Feld; explizit dokumentieren              |
| Q4  | Sitzt `--agents <json>` (flagSettings) absichtlich auf Precedence 5 (über Projekt, unter Policy)?                                    | **O** | qwen-code kann das Flag in v1 überspringen und die Entscheidung vertagen                   |
| Q5  | Innermost-first Push durch `iV_` + Map.set last-wins → **outer-tree wins** bei projectSettings-Kollisionen. Fußfalle oder beabsichtigt?           | **O** | qwen-code sollte **innermost-wins**-Semantik wählen, um die Fußfalle zu vermeiden |

---

## Phase 2 — Implementierungsplan für qwen-code

### Aktueller Stand — Überblick in einem Absatz

qwen-code liefert bereits eine umfangreiche Subagent-Infrastruktur aus:
`SubagentManager` (`packages/core/src/subagents/subagent-manager.ts`) implementiert
CRUD für Markdown+YAML-Frontmatter-Dateien in `.qwen/agents/` (Projekt) und
`~/.qwen/agents/` (User), unterstützt durch einen eigenen YAML-Parser
(`packages/core/src/utils/yaml-parser.ts` — keine `gray-matter` / `yaml`-Dependency,
bestätigt durch `package.json`). `SubagentConfig`
(`packages/core/src/subagents/types.ts:41-122`) verfügt bereits über `name`,
`description`, `tools`, `disallowedTools`, `approvalMode`, `systemPrompt`,
`model`, `runConfig`, `color`, `background`. `SubagentLevel` unterstützt bereits
fünf Scopes (session, project, user, extension, builtin) mit der Precedence
`session > project > user > extension > builtin`
(`subagent-manager.ts:189-220`). Das Agent-Tool
(`packages/core/src/tools/agent/agent.ts`) deklariert `subagent_type` und
aktualisiert seine Schema-Enum dynamisch über `subagentManager.changeListener`.
Eine `convertClaudeAgentConfig()`-Bridge existiert bereits in
`packages/core/src/extension/claude-converter.ts:162-220` mit einem Tool-Namen-Mapping
und einem `permissionMode → approvalMode`-Mapping. Die **Lücke** ist: (a) dem
Schema fehlen 8 Felder aus #4821 (`effort`, `permissionMode` als First-Class,
`mcpServers`, `hooks`, `maxTurns` als Top-Level,
`skills`, `initialPrompt`, `memory`, `isolation`); (b) kein `--agent <name>`
CLI-Flag; (c) kein chokidar-Style Hot Reload (Extension-Style Invalidierung
existiert, aber nicht für Filesystem-Agents); (d) `maxTurns` ist derzeit unter
`runConfig.max_turns` verschachtelt — muss gemäß #2409 auf Top-Level gehoben werden.

### Architekturentscheidungen

#### D1. Bestehenden YAML-Parser für Frontmatter wiederverwenden

**Entscheidung:** `packages/core/src/utils/yaml-parser.ts` wiederverwenden (bereits verwendet von
`SubagentManager.parseSubagentContent` und dem Skill-Loader).
**Begründung:** Claude Codes `lz` ist derselbe gemeinsam genutzte Parser, der für Skills +
Commands + Agents verwendet wird; qwen-code spiegelt dieses Muster bereits wider. Das Hinzufügen von `gray-matter`
oder `js-yaml` ist unnötiger Aufwand. Der bestehende Parser verarbeitet das `--- … ---`-Splitting
und ist bei fehlerhaftem Input still (entspricht der `warn-and-return-empty`-Haltung von `lz`).

#### D2. Resolution / Precedence-Reihenfolge

**Entscheidung:** `session > project (.qwen/agents/) > user (~/.qwen/agents/) > extension > builtin` verwenden — d. h. **die bestehende qwen-code SubagentLevel-Reihenfolge beibehalten und Claude Codes `flagSettings`/`policySettings`-Buckets in v1 NICHT spiegeln**.
**Begründung:** Claude Codes policySettings (Managed Dir) ist eine Enterprise-Deploy-Story, die qwen-code nicht hat. Flag-injizierte Agents (`--agents <json>`) sind ein Power-User-Feature, das in P4 landen kann. Die bestehende Fünf-Ebenen-Precedence von qwen-code deckt bereits die Fälle ab, die #4821 betreffen: Projekt überschreibt User überschreibt Built-in. Die `extension`-Ebene fügt sich sauber zwischen User und builtin ein.

#### D3. Validierung — bestehenden SubagentValidator beibehalten

**Entscheidung:** `SubagentValidator`
(`packages/core/src/subagents/`) erweitern, um die acht neuen Felder zu validieren. Zod **NICHT** einführen, es sei denn, die Pipeline von skillManager verwendet es bereits; wenn der bestehende Validator handgerollt ist, bleibt er handgerollt.
**Begründung:** Claude Codes `Ig5` ist nur Shadow — die Runtime-Validierung ist handgerolltes `DL7`. Das Anpassen an dieses Muster hält Fehlermeldungen lesbar
(z. B. `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`)
ohne eine weitere Dependency hereinzuziehen. Wenn skillManager bereits zod verwendet, folge dieser Wahl aus Konsistenzgründen — TBD durch Lesen des Skill-Codes in der P1-Vorbereitung.

#### D4. Hot Reload — vertagen; auf Cold Load + explizites Reload setzen

**Entscheidung:** v1 liefert **KEINEN** chokidar-Watcher aus. Cache-Invalidierungs-Hooks existieren bereits (`subagentManager` hat `changeListener` und expliziten CRUD-gesteuerten Refresh). Reload auf Projekt-Ebene erfolgt beim Session-Start; In-Session-Edits über die `/agents`-UI invalidieren. Ein `/reload-agents`-Slash-Command (oder als Piggyback auf `/reload-plugins`) kann in P4 landen, wenn Nutzerbedarf besteht.
**Begründung:** Hot Reload über FS-Watcher ist teuer (chokidar fügt eine Polling-Schleife mit adaptivem Scheduling hinzu — allein Claude Codes Implementierung umfasst ~150 Zeilen Bookkeeping). Cold-Load-on-Startup reicht für v1 völlig aus und entspricht der heutigen Verdrahtung von `SubagentManager`. Tür für P4 öffnen.

#### D5. `--agent <name>` CLI-Flag anbinden — v1 im Scope

**Entscheidung:** `--agent <name>` zu `packages/cli/src/config/config.ts` CliArgs hinzufügen. Verhalten: Gegen die aufgelöste Registry nachschlagen, den Agent als Main-Thread-Agent setzen, bei Nicht-Auflösung des Namens einen klaren Fehler werfen. Claude-Code-Semantik beachten (Standard-System-Prompt ersetzen, es sei denn, der Agent hat `appendSystemPrompt: true`). **KEINE** `CLAUDE_CODE_AGENT`-Env-Var-Indirektion verwenden — das `Config`-Objekt von qwen-code kann es direkt tragen.
**Begründung:** Dies ist das benutzerseitige Handle für #4821 — ohne sie sind deklarative Agents nur über den `subagent_type`-Param des Agent-Tools erreichbar, was für einen "set my default agent"-Use-Case zu indirekt ist. `--agents <json>` (Plural) kann auf P4 vertagt werden.

#### D6. Workflow.agentType-Koordination — Interface-Vertrag

**Entscheidung:** Ein stabiles Resolver-Interface bereitstellen, das `createProductionDispatch` aus PR #4732 beim Mergen aufrufen kann. Im Detail:

| Vertrag                                                                                                                                                                                                                                                                                                     | Owner                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Frontmatter-`name` IST der Workflow-`agentType`-String (Key-Gleichheit, case-sensitive)                                                                                                                                                                                                                         | dieser PR              |
| Der hartcodierte `disallowedTools`-Floor des Workflows (`[SEND_MESSAGE, EXIT_PLAN_MODE]`, gespiegelt von Upstream `Tg8`; in PR #4732 verifiziert als `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) wird mit `disallowedTools` auf Agent-Ebene **UNION**-verknüpft — der Floor wird immer angewendet, auch wenn die Agent-Definition `tools` setzt | Workflow-PR konsumiert |
| `opts.isolation` pro Aufruf überschreibt den Standard `isolation: 'worktree'` pro Agent                                                                                                                                                                                                                                | Workflow-PR konsumiert |
| `model`, `effort`, `permissionMode`, `maxTurns` aus der Agent-Definition überschreiben bei gesetztem Wert die Workflow-Standards                                                                                                                                                                                                    | Workflow-PR konsumiert |
| Agent-Body wird zum `systemPrompt` des Subagents; `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` des Workflows ist der Fallback, wenn `agentType` nicht aufgelöst wird                                                                                                                                                             | Workflow-PR konsumiert |
| Wenn `agentType` nicht gesetzt ist oder nicht aufgelöst werden kann, fällt der Workflow auf den Built-in-Workflow-Subagent zurück (graceful, kein Throw)                                                                                                                                                                                        | Workflow-PR konsumiert |
**Auflösung des Widerspruchs zwischen #4721 / #4821** (`tools` vs. `disallowedTools`-Präzedenz): Dieser Port gestaltet die Agent-Registry so, dass `disallowedTools` **immer separat** von `tools` geführt werden. Die Regel "ignoriert, wenn tools gesetzt ist" aus der Tabelle von #4821 wird **von den Agent-Tool-Callern durchgesetzt** (d. h. beim Erstellen der `ToolConfig` des Subagenten), nicht zur Parse-Zeit. Dadurch kann der Workflow seinen Floor immer unabhängig davon, ob der Agent `tools` setzt, mit `disallowedTools` vereinen. Die Agent-Registry ist ein **passiver Datenträger**; die Präzedenzregeln liegen an der Dispatch-Stelle. Dies löst den scheinbaren Konflikt zwischen der "ignoriert"-Regel von #4821 und der "union"-Regel von #4721.

**Kanonisierung der Tool-Namen:** Verwende `ToolNames.SEND_MESSAGE` und `ToolNames.EXIT_PLAN_MODE` (verifiziert gegen den PR #4732 Diff), exportiert als benannte Konstanten aus `packages/core/src/agents/runtime/workflow-orchestrator.ts`, sobald dieser landet. Der Declarative-Agents-Port selbst muss diese NICHT importieren – sie sind der Floor des Workflows, der an der Workflow-Dispatch-Stelle angewendet wird.

### Modul-Layout

| Pfad                                                               | Neu / Geändert | Zweck                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **Geändert**   | 8 neue Felder zu `SubagentConfig` hinzufügen: `effort`, `permissionMode` (mappt bereits via `approvalMode` – beide behalten? siehe D7 unten), `mcpServers`, `hooks`, `maxTurns` (auf Top-Level befördern, `runConfig.max_turns` als deprecated markieren), `skills`, `initialPrompt`, `memory`, `isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **Geändert**   | `parseSubagentContent` / `serializeSubagent` erweitern, um neue Felder round-trip-fähig zu machen; `SubagentValidator`-Aufrufe erweitern                                                                                                                                                            |
| `packages/core/src/subagents/subagent-validator.ts` (vermuteter Pfad) | **Geändert**   | Feld-spezifische Validierung hinzufügen, passend zu den Fehlermeldungen von DL7: `Agent file <path> has invalid permissionMode '<x>'. Valid options: …` usw.                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **Neu**       | Single Source of Truth für Enum-Konstanten: `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES`. Claude Code 2.1.168 wortgetreu spiegeln.                                                                                           |
| `packages/core/src/subagents/builtin-agents.ts`                    | **Geändert**   | Neue Felder sind standardmäßig undefined; keine Verhaltensänderung                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **Geändert**   | Neue Felder aus der aufgelösten `SubagentConfig` lesen, wenn Subagent-Optionen konstruiert werden (`model`, `maxTurns`, `permissionMode`, `effort`); `isolation`-Per-Call-Override-Semantik für #4721 durchreichen                                                                              |
| `packages/cli/src/config/config.ts`                                | **Geändert**   | `--agent <name>`-Flag hinzufügen; beim Start gegen `SubagentManager` auflösen; Fehler werfen, wenn der Name nicht aufgelöst werden kann                                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **Geändert**   | Tests für `--agent`-Flag-Auflösung + Fehlerpfad                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **Geändert**   | Mapping für neue Felder beim Importieren von Claude `.md`-Dateien hinzufügen (`mcpServers`, `hooks`, `maxTurns` auf Top-Level, `memory`, `isolation` usw.)                                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **Neu**       | Snapshot-Tests für Enum-Listen; Round-Trip-Parse/Serialise-Tests                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **Geändert**   | Tests für Validierung neuer Felder, Präzedenz, Fehlermeldungen                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **Geändert**   | Tests für das Durchreichen neuer Felder in die Subagent-Laufzeit                                                                                                                                                                                                                        |
| `docs/cli/agents.md` (falls vorhanden) oder `docs/declarative-agents.md`   | **Neu**       | Benutzerreferenz: 16-Felder-Schema + Beispiele                                                                                                                                                                                                                         |

### D7. permissionMode vs approvalMode — überbrücken, nicht ersetzen

**Entscheidung:** Akzeptiere BEIDE, `permissionMode` (Claude-kompatibel) und das bestehende `approvalMode` (qwen-kompatibel), im Frontmatter. Beim Parsen, wenn `permissionMode` gesetzt ist, mappe es auf `approvalMode` unter Verwendung der bestehenden Tabelle in `claude-converter.ts:195-208` (`default → default`, `plan → plan`, `acceptEdits → auto-edit`, `dontAsk → default`, `bypassPermissions → yolo`). Wenn beide vorhanden sind, gewinnt `approvalMode` (spezifischer für qwen-code) und es wird ein Telemetrie-Event im Stil von `tengu_frontmatter_shadow_*` ausgelöst, das vermerkt, dass beide gesetzt wurden. **Begründung:** Erhält die Abwärtskompatibilität mit bestehenden `.qwen/agents/*.md`, die `approvalMode` verwenden, während `permissionMode` von Claude Code wortgetreu akzeptiert wird, sodass Benutzer Claude-Code-Agent-Dateien unverändert übernehmen können.

### Schema-Mapping-Tabelle

| Claude Code 2.1.168 Feld  | qwen-code Feld                                    | Anpassung                                                                                                   | Hinweise                                                                                                    |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `name`                     | `name`                                             | keine                                                                                                         | identisch, erforderlich                                                                                      |
| `description`              | `description`                                      | keine                                                                                                         | identisch, erforderlich                                                                                      |
| `model`                    | `model`                                            | akzeptiere `inherit`, `fast`, `haiku`, `sonnet`, `opus` oder `authType:model-id`                                  | qwen-code unterstützt bereits das breitere Vokabular; `inherit` ist neu                                      |
| `tools`                    | `tools`                                            | akzeptiere string\|array; `*` → undefined (inherit-all)                                                          | bereits als Array unterstützt; String- + `*`-Handling hinzufügen                                                    |
| `disallowedTools`          | `disallowedTools`                                  | akzeptiere string\|array; **immer separat von `tools` geführt**                                             | Präzedenzregel (#4821 "ignoriert, wenn tools gesetzt ist") wird von **Callern** durchgesetzt, nicht vom Parser                    |
| `effort`                   | `effort` (neu)                                     | Enum `low/medium/high/xhigh/max` + Integer; Alias `med → medium`                                             | Laufzeiteffekt ist qwen-spezifisch (auf bestehenden Thinking-Effort-Knopf mappen, falls vorhanden, sonst speichern und ignorieren) |
| `permissionMode`           | `permissionMode` (neu) + brückt zu `approvalMode` | Enum `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`; Mapping-Tabelle gemäß D7                         | Claude-Format wortgetreu akzeptieren                                                                            |
| `mcpServers`               | `mcpServers` (neu)                                 | Array aus (string \| `{name: spec}`); pro Element validieren, fehlerhafte Einträge mit Warnung verwerfen                           | Anbindung an MCP-Laufzeit in P4                                                                            |
| `hooks`                    | `hooks` (neu)                                      | Objekt, das der hooks-Form von settings.json entspricht                                                                    | Anbindung an Hook-Laufzeit in P4                                                                           |
| `maxTurns`                 | `maxTurns` (neu auf Top-Level)                         | positive Ganzzahl; akzeptiere numerischen String für Parität                                                           | **von `runConfig.max_turns` auf Top-Level befördert**; verschachtelte Form als deprecated Alias beibehalten                             |
| `skills`                   | `skills` (neu)                                     | Array aus Skill-Namen; Komma-separierter String wird ebenfalls akzeptiert                                                   | Laufzeit: über skillManager vorladen, wenn Agent startet                                                      |
| `initialPrompt`            | `initialPrompt` (neu)                              | String; nur Whitespace → undefined; wird nur ausgelöst, wenn Agent die Hauptsitzung ist                                   | angebunden über den `--agent`-Flag-Pfad                                                                            |
| `memory`                   | `memory` (neu)                                     | Enum `user/project/local`; lädt aus `.qwen/agent-memory/<name>/` usw.                                      | Laufzeit in P4                                                                                            |
| `background`               | `background`                                       | akzeptiere bool oder String `"true"/"false"`; nur truthy → true                                                   | bereits unterstützt; Parse-Regeln auflockern                                                                    |
| `isolation`                | `isolation` (neu)                                  | Enum **nur** `["worktree"]`                                                                                 | Laufzeit gehört zum Workflow-PR (#4732 P3+); Registry führt nur das Feld                                |
| `color` (undokumentiert #16) | `color`                                            | Enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; Werte außerhalb werden stillschweigend verworfen | bereits in qwen `SubagentConfig`; Validierung straffen, um sie der Claude-Code-Allowlist anzupassen                      |
### TDD-Testplan

| Abschnitt                    | Testdatei                                | Was geprüft wird                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema-Enum-Konstanten       | `agent-frontmatter-schema.test.ts` (neu) | `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES` stimmen Byte für Byte mit Claude Code 2.1.168 überein (Snapshot)                                       |
| Parser — Happy Path          | `subagent-manager.test.ts`               | Round-Trip-Parsing von `.qwen/agents/test.md` mit allen 16 Feldern → ausgegebener Record hat die erwartete Struktur                                                                                   |
| Parser — Pflichtfelder       | `subagent-manager.test.ts`               | Fehlendes `name` gibt null + Warn-Log zurück; fehlendes `description` gibt null + Warn-Log zurück                                                                                                     |
| Parser — Enum-Validierung    | `subagent-manager.test.ts`               | Falsche `permissionMode` / `memory` / `isolation` / `effort` / `color` geben jeweils eine spezifische Warnung aus (passend zur DL7-Formulierung) und das Feld wird verworfen                          |
| Parser — tolerante Feldtypen | `subagent-manager.test.ts`               | `background: "true"` → `true`; `maxTurns: "5"` → `5`; `effort: "med"` → `"medium"`; `tools: "Read,Edit"` → `["Read","Edit"]`; `tools: "*"` → `undefined`                                              |
| Parser — Color-Allowlist     | `subagent-manager.test.ts`               | `color: "magenta"` wird stillschweigend verworfen (kein Fehler), `color: "blue"` wird beibehalten                                                                                                     |
| Besonderheit des `skills`-Feldes | `subagent-manager.test.ts`           | Das Weglassen von `skills` führt zu `skills: []` (entspricht dem Emit-Verhalten von Claude Code DL7)                                                                                                  |
| Präzedenz bei der Auflösung  | `subagent-manager.test.ts`               | Gleicher `name` in Projekt + User → Projekt gewinnt; in User + Builtin → User gewinnt; in Extension + Builtin → Extension gewinnt                                                                     |
| Inode-Deduplizierung         | `subagent-manager.test.ts`               | Zwei Pfade zum selben Inode (Symlink) → nur ein Record, Log wird ausgegeben                                                                                                                           |
| permissionMode-Bridge        | `subagent-manager.test.ts`               | `permissionMode: bypassPermissions` → aufgelöstes `approvalMode: yolo`; beide gesetzt → `approvalMode` gewinnt + Telemetrie                                                                           |
| `--agent` CLI-Flag           | `packages/cli/src/config/config.test.ts` | Flag setzt den Main-Thread-Agent; nicht aufgelöster Name wirft Fehler mit `Agent type '<x>' not found. Available agents: …`                                                                           |
| Agent-Tool Fuzzy-Fallback    | `agent.test.ts`                          | `subagent_type: "Test_Engineer"` wird über NFKC-Lowercase-Normalisierung zu einem registrierten `test-engineer` aufgelöst                                                                             |
| Agent-Tool Not-Found-Fehler  | `agent.test.ts`                          | Nicht aufgelöster `subagent_type` → Fehlermeldung passt zu `Agent type '<x>' not found. Available agents: <list>`                                                                                     |
| Workflow-Contract            | `agent-frontmatter-schema.test.ts`       | Exportierte `getAgentByName(name)`-Schnittstelle gibt die vollständige `SubagentConfig` zurück, einschließlich `isolation`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns` (verbrauchbar durch Workflow PR #4732) |

### Phasenweiser PR-Plan

| Phase  | Titel                                                                                                                        | Scope                                                                                                                                            | Blockiert                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | Felder zu `SubagentConfig` hinzufügen; Parser + Validator + Serializer erweitern; `runConfig.max_turns` als deprecated markieren; Enum-Konstanten-Modul hinzufügen; Tests | Keine                              |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime`                                                                  | `model`, `effort`, `maxTurns`, `permissionMode`/`approvalMode`-Bridge in `AgentTool.execute()` → `AgentHeadless.create()` Call-Site durchschleusen; Tests | P1                                 |
| **P3** | `feat(cli): --agent flag for main-thread agent selection`                                                                    | `--agent <name>` zu `CliArgs` hinzufügen; beim Start auflösen; Fehlerpfad; Tests                                                                 | P1                                 |
| **P4** | (optional, scope-creep) `feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime`                           | Die vier "in v1 nur Metadaten"-Felder mit tatsächlichen Runtime-Effekten verdrahten                                                              | P1, plus Skill/MCP/Hook-Subsysteme |

Jeder PR zielt auf ≤ 800 LOC Delta (ohne Tests); P1 ist mit ~600 LOC für Validator + Tests der größte.

---

## Phase 3 — Koordinationsmatrix mit Workflow-Port (#4721 / PR #4732)

| Declarative-Agents-Feature                                         | Workflow-Interaktion                                                                                                                                                                     | Owner                                                               | Blockiert durch                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| `name`-Feld als Registry-Key                                       | `opts.agentType` Lookup-String des Workflows ([#4721][i4721] explizit)                                                                                                                 | **dieser PR** definiert den Registry-Contract; **Workflow-PR** konsumiert ihn | keine — Registry-Form kann sich zuerst stabilisieren |
| `disallowedTools`-Feld beim Agent                                  | Workflow bildet UNION mit hartcodiertem Floor `[SEND_MESSAGE, EXIT_PLAN_MODE]` (gemäß [#4721][i4721] §2 — verifiziert gegen PR #4732 Diff: `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) | **dieser PR** enthält das Feld; **Workflow-PR** bildet UNION beim Dispatch | Workflow PR #4732 P3 landet                    |
| `tools`-Feld beim Agent                                            | Workflow reicht es unverändert an `ToolConfig.tools` des Subagents weiter                                                                                                                | **dieser PR** enthält das Feld; **Workflow-PR** schleust es durch   | Workflow PR #4732 P3                           |
| `model`-Feld beim Agent                                            | `opts.model` des Workflows überschreibt pro Aufruf; `model` des Agents ist der Default                                                                                                 | **dieser PR** enthält das Feld; **Workflow-PR** löst die Präzedenz auf | Workflow PR #4732 P3                           |
| `effort`-Feld beim Agent                                           | Call-Site-Override des Workflows gewinnt; Agent-Default als Fallback                                                                                                                     | **dieser PR** enthält das Feld; **Workflow-PR** löst auf            | Workflow PR #4732 P3                           |
| `permissionMode`-Feld beim Agent                                   | Wird beim Dispatch auf `approvalMode` des Subagents gemappt; Call-Site-Override des Workflows gewinnt                                                                                    | **dieser PR** enthält das Feld via D7-Bridge; **Workflow-PR** schleust es durch | Workflow PR #4732 P3                           |
| `maxTurns`-Feld beim Agent                                         | Ersetzt hartcodiertes `WORKFLOW_SUBAGENT_MAX_TURNS = 50` des Workflows, wenn der Agent es setzt                                                                                          | **dieser PR** enthält das Feld; **Workflow-PR** löst die Präzedenz auf | Workflow PR #4732 P3                           |
| `isolation: 'worktree'`-Feld beim Agent                            | Default; `opts.isolation` pro Aufruf überschreibt ([#4721][i4721] §3)                                                                                                                    | **dieser PR** enthält das Feld; **Workflow-PR** besitzt die Runtime | Workflow PR #4732 P3+ (wirft derzeit in P1 einen Fehler) |
| `initialPrompt`-Feld beim Agent                                    | Workflow nutzt es **nicht** (wird nur ausgelöst, wenn der Agent via `--agent` die Main-Session ist)                                                                                      | **dieser PR** + **CLI**                                             | keine (unabhängig)                             |
| `memory`, `mcpServers`, `hooks`, `skills`                          | Workflow hat keine spezielle Behandlung, außer es an die Subagent-Runtime weiterzureichen                                                                                              | **dieser PR** enthält die Felder; Runtime-Verdrahtung in P4 / zukünftig | zukünftige PRs                                 |
| `EXCLUDED_TOOLS_FOR_SUBAGENTS`-Updates                             | Workflow PR #4732 fügt `WORKFLOW` zum Set hinzu (basierend auf der Issue/PR-Kontext-Analyse — auch wenn die kritische Prüfung angemerkt hat, dass dies noch NICHT in `agent-core.ts` auf `main` ist, sondern nur im Worktree) | **Workflow-PR** ist verantwortlich; dieser PR bleibt unberührt      | keine                                          |
| Tool-Name-Kanonical-Form für Workflow-Floor (`ToolNames.SEND_MESSAGE`) | Dieser PR importiert nicht die Floor-Konstanten; er enthält nur die `disallowedTools`-Strings wie geschrieben. Der Workflow-PR ist für die Kanonisierung verantwortlich.                 | **Workflow-PR**                                                     | Workflow PR #4732                              |
| Release-Reihenfolge                                                | Dieser PR (P1+P2+P3) wird unabhängig vom Workflow released. Workflow PR #4732 P3 ist davon abhängig, dass der `getAgentByName()`-ähnliche Resolver dieses PRs importierbar ist.         | parallel bis P3 des Workflows                                       | Workflow P3 liest aus den Exports dieses PRs   |
**Kein zirkulärer Block:** Dieser PR und der Workflow-PR können parallel durch ihre P1/P2-Phasen gemerged werden. Sie synchronisieren sich bei workflow-P3, welches den Registry-Resolver dieses PRs benötigt. Wenn dieser PR zuerst gemerged wird, liest workflow-P3 daraus. Wenn der Workflow-PR zuerst gemerged wird, wird er mit dem bestehenden `subagent_type`-Lookup ausgeliefert (das bei einem Miss die Workflow-Standardwerte zurückgibt) und wechselt zu dem umfangreicheren Resolver, sobald dieser PR gemerged wird.

---

## Phase 4 — Risiken und offene Fragen

### Risiken

| #   | Risk                                                                                                                                                                                                | Mitigation                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Schema-Drift zwischen Claude Code Minor Releases (2.1.168 → 2.1.x)                                                                                                                                  | Das Enum-Constants-Modul mit einem Doc-Kommentar auf "verified against 2.1.168" pinnen; den Strings-Grep bei neuen Releases als Teil des `feature-reverse`-Skills erneut ausführen |
| R2  | `runConfig.max_turns` → Top-Level `maxTurns` ist eine Breaking Schemaänderung für bestehende `.qwen/agents/*.md`-Dateien                                                                            | Verschachtelte Form als deprecated Alias mit einem Deprecation-Zyklus beibehalten; Warnung beim Parsen ausgeben, im CHANGELOG dokumentieren                    |
| R3  | `permissionMode` ↔ `approvalMode` Roundtrip ist verlustbehaftet (Claude hat 6 Modi, Qwen hat ca. 4)                                                                                                 | Beide Richtungen explizit gemäß D7 mappen; Telemetrie bei Dual-Set ausgeben; NICHT stillschweigend beim Speichern umschreiben                                  |
| R4  | Neue Felder (`hooks`, `mcpServers`, `skills`, `memory`) werden in der Registry mitgeführt, haben aber in v1 keine Runtime → Benutzer könnten sie setzen und erhalten stillschweigend keinen Effekt    | v1-Scope klar dokumentieren; einmalig einen Info-Log pro Agent ausgeben, wenn ein "mitgeführtes, aber noch nicht in der Runtime verfügbares" Feld nicht leer ist |
| R5  | Adversarial-Verify hat markiert, dass `EXCLUDED_TOOLS_FOR_SUBAGENTS` auf `main` NICHT `WORKFLOW` enthält – das könnte bedeuten, dass der Workflow-Port noch nicht gemerged ist oder dass der Recursive-Fanout-Guard fehlt | Mit dem Autor des Workflow-PRs (LaZzyMan = ich) bestätigen, dass der Guard mit PR #4732 gemerged wird, nicht in diesem Port                                    |
| R6  | Das Outer-tree-beats-inner-tree-Verhalten von projectSettings (Q5) ist eine Stolperfalle, wenn es gespiegelt wird                                                                                   | qwen-code wählt explizit **innermost-wins**; getestet über R5-Fixture                                                                                          |
| R7  | Das Feld `color` ist im Describe-Text der Binärdatei als `@internal` dokumentiert – wir porten möglicherweise etwas, das Anthropic explizit nicht unterstützt                                       | Porten, aber auch in den qwen-code-Docs als `@internal` markieren; als UI-only behandeln; nicht in benutzerzugänglichen Referenzdocs anzeigen                 |

### Offene Fragen — vorgeschlagene Lösungen

| #   | Question                                                                                                                                                       | Resolution                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Ist das Weglassen von `color` in #4821 absichtlich?                                                                                                            | **Als absichtlich behandeln**. Das Feld porten; NICHT in benutzerzugänglichen Docs erwähnen, außer als "available, internal".                                                                                                                                                                                                                            |
| Q2  | Tolerantes DL7-Verhalten: dokumentieren oder hacken?                                                                                                           | **Spiegeln**. `background: "true"`, `maxTurns: "5"`, `effort: "med"` für die Parität akzeptieren, auch wenn undokumentiert. Tests hinzufügen.                                                                                                                                                                                                             |
| Q3  | Warum unterscheidet sich die Isolation-Enum zwischen Agent-Schema und Background-Session-Schema?                                                               | **Die Abweichung im Code-Kommentar dokumentieren**; "no isolation" = Feld weggelassen, kein Enum-Wert.                                                                                                                                                                                                                                                   |
| Q4  | Sollte `--agents <json>` (Plural, flagSettings) in v1 gemerged werden?                                                                                         | **Auf P4 verschieben**. CLI-Oberfläche für Power-User; v1 liefert nur `--agent <name>` (Singular) aus, worum es in #4821 geht.                                                                                                                                                                                                                           |
| Q5  | Inner-tree- vs. Outer-tree-Vorrang für verschachtelte `.qwen/agents/`?                                                                                         | **Innermost-wins**. Das versehentliche Outer-wins-Verhalten von Claude Code überschreiben. Test-Fixture in P1.                                                                                                                                                                                                                                           |
| Q6  | `tools`- vs. `disallowedTools`-Vorrang: #4821 besagt "ignored if tools is set"; #4721 besagt "union with workflow floor"                                       | **Registry sind dumme Daten**. Der Parser bewahrt beide Felder unabhängig voneinander. Vorrangregeln leben am Dispatch-Site (Agent-Tool / Workflow). Löst den Widerspruch auf.                                                                                                                                                                           |
| Q7  | Kanonische Form des Tool-Namens für den Workflow-disallowedTools-Floor — verifiziert gegen PR #4732 als `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`   | **Nicht die Sorge dieses PRs** — liegt beim Workflow-PR. Nur in der Koordinationsmatrix dokumentieren.                                                                                                                                                                                                                                                   |
| Q8  | Beeinflusst die Close-Resolution von #2409 irgendetwas?                                                                                                        | **Die Guidance "promote model + maxTurns to top-level" aus #2409 übernehmen**. Bereits in diesen Plan eingearbeitet.                                                                                                                                                                                                                                     |
| Q9  | Sollten `extension`-Level-Agenten in qwen-codes bestehendem `SubagentLevel`-Vorrang über `builtin` (aktuell) oder darunter bleiben (Claude Code hat kein Äquivalent)? | **`extension > builtin` beibehalten**. Extensions sind vom Benutzer installiert; Built-ins sind Vendor-Default. Vom Benutzer installierte gewinnen.                                                                                                                                                                                                      |
| Q10 | Sind die Issues #4821, #4721, #4732 für den von diesem Dokument vorgeschlagenen Vertrag vollständig spezifiziert?                                              | **Einen Koordinations-Kommentar in #4821 posten**, der auf dieses Dokument verlinkt, die Feld-für-Feld-Entscheidungen zusammenfasst und die Maintainer bittet, zu acken: (a) Schema-Parität mit den 16 Feldern von Claude Code 2.1.168, (b) D7 `permissionMode`/`approvalMode`-Bridge, (c) D2-Vorrangreihenfolge, (d) Registry-as-dumb-data-Lösung des `tools`/`disallowedTools`-Widerspruchs. |

### Koordinations-Action-Items

| #   | Action                                                                       | Where                                                |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Feld-für-Feld-Zusammenfassung + 5 Entscheidungen in #4821 für Maintainer-Ack posten | Kommentar in #4821                                     |
| A2  | Dieses Dokument in #4721 verlinken und auf die Phase-3-Matrix hinweisen                | Kommentar in #4721                                     |
| A3  | Sobald P1 dieses Ports gemerged ist, #4732 pingen, um zum umfangreicheren Resolver zu wechseln | Kommentar in PR #4732 (wenn bereit)                     |
| A4  | Strings-Grep für Schema-Drift-Erkennung gegen das nächste Claude Code Minor Release erneut ausführen | `feature-reverse`-Skill-Cronjob (bis dahin manuell) |