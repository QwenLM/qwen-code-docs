# Memory

Jede Qwen Code-Sitzung beginnt mit einem leeren Kontextfenster. Zwei Mechanismen übertragen Wissen über Sitzungen hinweg, damit du dich nicht jedes Mal neu erklären musst:

- **QWEN.md** — Anweisungen, die _du_ einmal schreibst und die Qwen in jeder Sitzung liest
- **Auto-memory** — Notizen, die Qwen selbst basierend auf dem schreibt, was es von dir lernt

---

## QWEN.md: Deine Anweisungen an Qwen

QWEN.md ist eine reine Textdatei, in der du Dinge festhältst, die Qwen immer über dein Projekt oder deine Präferenzen wissen sollte. Betrachte sie als ein permanentes Briefing, das zu Beginn jedes Gesprächs geladen wird.

### Was in QWEN.md gehört

Füge Dinge hinzu, die du sonst in jeder Sitzung wiederholen müsstest:

- Build- und Testbefehle (`npm run test`, `make build`)
- Coding-Konventionen, die dein Team befolgt („alle neuen Dateien müssen JSDoc-Kommentare haben“)
- Architekturentscheidungen („wir verwenden das Repository-Pattern, rufen die Datenbank nie direkt aus den Controllern auf“)
- Persönliche Präferenzen („immer pnpm verwenden, nicht npm“)

Füge keine Dinge hinzu, die Qwen durch das Lesen deines Codes selbst herausfinden kann. QWEN.md funktioniert am besten, wenn es kurz und spezifisch ist – je länger es wird, desto unzuverlässiger befolgt Qwen die Anweisungen.

### Wo QWEN.md erstellt wird

| Datei | Für wen sie gilt |
| --- | --- |
| `~/.qwen/QWEN.md` | Für dich, über alle deine Projekte hinweg |
| `QWEN.md` im Projekt-Root | Dein gesamtes Team (in die Versionskontrolle committen) |
| `.qwen/QWEN.local.md` | Nur für dich, nur in diesem Projekt (aus git heraushalten) |

Du kannst beliebige Kombinationen davon verwenden. Qwen lädt alle, wenn du eine Sitzung startest.

Wenn dein Repository bereits eine `AGENTS.md`-Datei für andere KI-Tools enthält, liest Qwen diese ebenfalls. Du musst Anweisungen nicht duplizieren.

#### Wann `.qwen/QWEN.local.md` verwendet wird

Verwende sie für **projektspezifische, aber persönliche** Anweisungen – Dinge, die zu diesem Projekt gehören, aber nicht mit dem Team geteilt werden sollten:

- Deine eigene Cluster-ID, der Namespace der Container Registry oder dein Cloud-Account
- Ein persönlicher Debug-Befehl, der deine lokale Umgebung hardcodiert
- Notizen, die Qwen über deine aktuelle Arbeit wissen soll, die du aber nicht committen möchtest

Sie wird **nach** der geteilten Projekt-`QWEN.md` geladen, sodass deine lokalen Anweisungen die des Teams ergänzen oder überschreiben können.

**Du musst sie selbst in die .gitignore aufnehmen.** Obwohl `.qwen/` oft als lokales Verzeichnis behandelt wird, generiert qwen-code keine `.gitignore` für dich, und einige Projekte committen `.qwen/settings.json`. Füge diese Zeile zu deiner `.gitignore` (oder deiner globalen git ignore) hinzu:

```
.qwen/QWEN.local.md
```

### Automatisch generieren mit `/init`

Führe `/init` aus und Qwen analysiert deine Codebasis, um eine initiale QWEN.md mit Build-Befehlen, Testanweisungen und gefundenen Konventionen zu erstellen. Wenn bereits eine existiert, schlägt es Ergänzungen vor, anstatt sie zu überschreiben.

### Auf andere Dateien verweisen

Du kannst QWEN.md auf andere Dateien verweisen, damit Qwen diese ebenfalls liest:

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Verwende `@path/to/file` überall in QWEN.md. Relative Pfade werden relativ zur QWEN.md-Datei selbst aufgelöst.

---

## Auto-memory: Was Qwen über dich lernt

Auto-memory läuft im Hintergrund. Nach jedem deiner Gespräche speichert Qwen leise nützliche Dinge, die es gelernt hat – deine Präferenzen, gegebenes Feedback, Projektkontext –, damit es diese in zukünftigen Sitzungen nutzen kann, ohne dass du dich wiederholen musst.

Das unterscheidet sich von QWEN.md: Du schreibst es nicht, Qwen tut es.

### Was Qwen speichert

Qwen sucht nach vier Arten von Dingen, die es wert sind, erinnert zu werden:

| Was | Beispiele |
| --- | --- |
| **Über dich** | Deine Rolle, dein Hintergrund, wie du gerne arbeitest |
| **Dein Feedback** | Von dir vorgenommene Korrekturen, von dir bestätigte Ansätze |
| **Projektkontext** | Laufende Arbeiten, Entscheidungen, Ziele, die nicht aus dem Code hervorgehen |
| **Externe Referenzen** | Dashboards, Ticket-Tracker, Dokumentationslinks, die du erwähnt hast |

Qwen speichert nicht alles – nur Dinge, die beim nächsten Mal tatsächlich nützlich wären.

### Wo es gespeichert wird

Auto-memory-Dateien befinden sich unter `~/.qwen/projects/<project>/memory/`. Alle Branches und Worktrees desselben Repositorys teilen sich denselben Memory-Ordner, sodass das, was Qwen in einem Branch lernt, auch in anderen verfügbar ist.

Alles Gespeicherte ist reines Markdown – du kannst jede Datei jederzeit öffnen, bearbeiten oder löschen.

### Periodische Bereinigung

Qwen durchläuft periodisch seine gespeicherten Memories, um Duplikate zu entfernen und veraltete Einträge zu bereinigen. Dies läuft automatisch einmal täglich im Hintergrund, nachdem sich genügend Sitzungen angesammelt haben. Du kannst es manuell mit `/dream` auslösen, wenn du es sofort ausführen möchtest.

Deine Sitzung läuft normal weiter, während die Bereinigung im Hintergrund ausgeführt wird.

### Ein- und Ausschalten

Auto-memory ist standardmäßig aktiviert. Um es umzuschalten, öffne `/memory` und verwende die Schalter oben. Du kannst nur das automatische Speichern, nur die periodische Bereinigung oder beides ausschalten.

Du kannst sie auch in `~/.qwen/settings.json` (gilt für alle Projekte) oder `.qwen/settings.json` (nur für dieses Projekt) festlegen:

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

### Team memory (mit Collaborators geteilt)

Standardmäßig ist Auto-memory **privat für dich** – es befindet sich in deinem Home-Verzeichnis und wird nie geteilt. Team memory ist eine optionale Ebene, die das gesamte Team **über git** teilt.

Wenn aktiviert, erhält Qwen ein drittes Memory-Verzeichnis unter `.qwen/team-memory/` **innerhalb des Repositorys**. Es verwendet dasselbe One-File-per-Memory-Layout und denselben `MEMORY.md`-Index wie die privaten Ebenen. Da es in das Repo committet wird, wird es auf die normale Weise mit jedem Collaborator geteilt: Du führst `git pull` aus, um die Memories deiner Teammitglieder zu empfangen, und commit/push, um deine zu teilen. Qwen leitet dauerhaftes, projektweites Wissen hierhin – Konventionen, die jeder Contributor befolgen muss, geteilte Referenzpointer (Tracker, Dashboards) –, während persönliche und schnell veraltende Notizen privat bleiben.

Aktiviere es projektbezogen (oder global) in `settings.json`:

```json
{
  "memory": {
    "enableTeamMemory": true
  }
}
```

Es ist **standardmäßig ausgeschaltet**. Beachte folgende Hinweise:

- **Es ist versionskontrolliert und für jeden mit Repo-Zugriff sichtbar.** Behandle eine Team memory wie einen Commit in das Repo.
- **Secrets werden blockiert.** Schreibvorgänge in `.qwen/team-memory/` werden auf Credentials (API-Keys, Tokens, Private Keys) gescannt; ein erkanntes Secret wird abgelehnt und nie geschrieben. Der Scan ist ein Sicherheitsnetz, keine Garantie – lege dort keine sensiblen Daten ab.
- **Änderungen sind überprüfbar.** Team-memory-Schreibvorgänge erscheinen in `git status` / dem PR-Diff wie jede andere Datei, sodass sie vor dem Commit überprüft werden können. Im standardmäßigen Approval-Modus fragt Qwen auch vor jedem Team-Schreibvorgang nach; im `AUTO_EDIT`/YOLO-Modus (in dem du die automatische Genehmigung aktiviert hast) werden sie ohne Aufforderung angewendet, tauchen aber dennoch im Diff auf.
- **Das Verzeichnis muss von git getrackt werden.** Wenn die `.gitignore` deines Projekts `.qwen/*` ausschließt, schließe den Pfad wieder ein, damit er geteilt werden kann:

  ```gitignore
  !.qwen/team-memory/
  !.qwen/team-memory/**
  ```

  Hinweis: Verwende das File-Glob-Ignore-Format (`.qwen/*`), nicht das Verzeichnisformat mit einem abschließenden Schrägstrich (`.qwen/`). Ein Ignore im Verzeichnisformat lässt git den Ordner vollständig überspringen, sodass ein `!`-Wiedereinschluss darunter ein No-Op ist und die Team-Ebene in git stillschweigend leer bleibt. Qwen warnt beim Start einmal, wenn die Ebene aktiviert ist, aber ihr Verzeichnis von git ignoriert wird oder sich außerhalb eines git-Repositorys befindet, sodass diese Fehlkonfiguration nicht unbemerkt bleibt.

`QWEN_CODE_MEMORY_TEAM=1` / `=0` überschreibt die Einstellung für eine einzelne Ausführung.

### Automatischer git-Sync (optional)

Standardmäßig teilst du die Team memory mit dem normalen git-Workflow (`pull` zum Empfangen, `commit`/`push` zum Teilen). Damit Qwen das für dich erledigt, aktiviere den Sync:

```json
{
  "memory": {
    "enableTeamMemory": true,
    "enableTeamMemorySync": true
  }
}
```

Wenn aktiviert, synchronisiert Qwen beim Sitzungsstart nach bestem Bemühen das `.qwen/team-memory/`-Verzeichnis: Es baut den geteilten `MEMORY.md`-Index neu, führt **zuerst** einen Fast-Forward-Pull der Updates der Collaborators durch, committet dann deine Team-memory-Änderungen oben drauf und pusht **nur diesen Sync-Commit** (über eine explizite Single-Branch-Refspec) – sodass der Index, den du lädst, den neuesten Stand widerspiegelt. Es **stagt** nur das Team-Verzeichnis (deine anderen Working Changes werden nie committet) und blockiert die Sitzung niemals bei einem git-Fehler. Standardmäßig ausgeschaltet. `QWEN_CODE_MEMORY_TEAM_SYNC=1` / `=0` überschreibt die Einstellung für eine einzelne Ausführung.

Zwei Dinge, die du vor der Aktivierung wissen solltest:

- **Der Fast-Forward-Pull wirkt auf deinen gesamten aktuellen Branch, nicht nur auf `.qwen/team-memory/`** (git hat keinen pfadbasierten Pull). Der Sync wird also deinen Branch per Fast-Forward auf den Remote-Tip vorziehen. Der Push hingegen ist scoped: Er veröffentlicht **nur den Commit, den dieser Sync gerade erstellt hat**, pusht also niemals andere unpushed Commits von dir – wenn dein Branch bereits upstream voraus ist, committet der Sync lokal und überspringt den Push. Aktiviere ihn auf Branches, auf denen der Fast-Forward-Pull in Ordnung ist – oder führe ihn in einem dedizierten Checkout aus.
- **Ein divergierter Branch bleibt unberührt** (`--ff-only` mergt niemals). Wenn das passiert, tut der Sync in dieser Sitzung einfach nichts; löse die Divergenz auf (`git pull`) und er wird fortgesetzt. Ein Branch ohne Upstream (keine Tracking-Konfiguration) committet weiterhin lokal, überspringt aber den Push – es gibt kein Ziel zum Pushen.

---

## Befehle

### `/memory`

Öffnet das Memory-Panel. Von hier aus kannst du:

- Das Speichern von Auto-memory ein- oder ausschalten
- Die periodische Bereinigung (dream) ein- oder ausschalten
- Deine persönliche QWEN.md öffnen (`~/.qwen/QWEN.md`)
- Die Projekt-QWEN.md öffnen
- Den Auto-memory-Ordner durchsuchen

### `/init`

Generiert eine initiale QWEN.md für dein Projekt. Qwen liest deine Codebasis und füllt Build-Befehle, Testanweisungen und entdeckte Konventionen ein.

### `/remember <text>`

Speichert sofort etwas in Auto-memory, ohne zu warten, dass Qwen es automatisch aufgreift:

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

Entfernt Auto-memory-Einträge, die deiner Beschreibung entsprechen:

```
/forget old workaround for the login bug
```

### `/dream`

Führt die Memory-Bereinigung jetzt aus, anstatt auf den automatischen Zeitplan zu warten:

```
/dream
```

---

## Troubleshooting

### Qwen befolgt meine QWEN.md nicht

Öffne `/memory`, um zu sehen, welche Dateien geladen werden. Wenn deine Datei nicht aufgeführt ist, kann Qwen sie nicht sehen – stelle sicher, dass sie sich im Projekt-Root oder in `~/.qwen/` befindet.

Anweisungen funktionieren besser, wenn sie spezifisch sind:

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

Wenn du mehrere QWEN.md-Dateien mit widersprüchlichen Anweisungen hast, verhält sich Qwen möglicherweise inkonsistent. Überprüfe sie und entferne alle Widersprüche.

### Ich möchte sehen, was Qwen gespeichert hat

Führe `/memory` aus und wähle **Open auto-memory folder**. Alle gespeicherten Memories sind lesbare Markdown-Dateien, die du durchsuchen, bearbeiten oder löschen kannst.

### Qwen vergisst ständig Dinge

Wenn Auto-memory aktiviert ist, aber Qwen sich scheinbar nicht über Sitzungen hinweg an Dinge erinnert, versuche `/dream` auszuführen, um einen Bereinigungsdurchlauf zu erzwingen. Überprüfe auch `/memory`, um zu bestätigen, dass beide Schalter aktiviert sind.

Für Dinge, bei denen du immer möchtest, dass Qwen sie sich merkt, füge sie stattdessen zu QWEN.md hinzu – Auto-memory ist best-effort, QWEN.md ist garantiert.