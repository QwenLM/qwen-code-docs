# Speicher

Jede Qwen Code Sitzung beginnt mit einem neuen Kontextfenster. Zwei Mechanismen übertragen Wissen zwischen Sitzungen, damit du dich nicht jedes Mal wiederholen musst:

- **QWEN.md** – Anweisungen, die _du_ einmal schreibst und Qwen jede Sitzung liest
- **Auto-memory** – Notizen, die Qwen selbst schreibt, basierend auf dem, was es von dir lernt

---

## QWEN.md: Deine Anweisungen an Qwen

QWEN.md ist eine einfache Textdatei, in die du Dinge schreibst, die Qwen immer über dein Projekt oder deine Vorlieben wissen sollte. Stell es dir als ein dauerhaftes Briefing vor, das zu Beginn jeder Unterhaltung geladen wird.

### Was in QWEN.md stehen sollte

Füge Dinge hinzu, die du sonst jede Sitzung wiederholen müsstest:

- Build- und Testbefehle (`npm run test`, `make build`)
- Code-Konventionen, die dein Team befolgt („alle neuen Dateien müssen JSDoc-Kommentare haben“)
- Architekturentscheidungen („wir verwenden das Repository-Pattern, rufe niemals die Datenbank direkt aus Controllern auf“)
- Persönliche Vorlieben („verwende immer pnpm, nicht npm“)

Füge keine Dinge hinzu, die Qwen durch Lesen deines Codes herausfinden kann. QWEN.md funktioniert am besten, wenn es kurz und spezifisch ist – je länger es wird, desto unzuverlässiger folgt Qwen ihm.

### Wo QWEN.md erstellt werden soll

| Datei                          | Für wen es gilt                                |
| ----------------------------- | ------------------------------------------------ |
| `~/.qwen/QWEN.md`             | Du, über alle deine Projekte hinweg                    |
| `QWEN.md` im Projektstamm | Dein gesamtes Team (in die Versionsverwaltung einchecken)    |
| `.qwen/QWEN.local.md`         | Nur du, nur in diesem Projekt (nicht in Git aufnehmen) |

Du kannst jede Kombination davon verwenden. Qwen lädt alle, wenn du eine Sitzung startest.

Wenn dein Repository bereits eine `AGENTS.md`-Datei für andere KI-Tools enthält, liest Qwen diese ebenfalls. Keine Notwendigkeit, Anweisungen zu duplizieren.

#### Wann `.qwen/QWEN.local.md` verwendet werden sollte

Verwende es für **projektspezifische, aber persönliche** Anweisungen – Dinge, die zu diesem Projekt gehören, aber nicht mit dem Team geteilt werden sollten:

- Deine eigene Cluster-ID, Container-Registry-Namespace oder Cloud-Konto
- Ein persönlicher Debug-Befehl, der deine lokale Umgebung fest kodiert
- Notizen, die Qwen über deine laufenden Arbeiten wissen soll, aber nicht einchecken

Es wird **nach** dem gemeinsamen Projekt-`QWEN.md` geladen, sodass deine lokalen Anweisungen die des Teams ergänzen oder überschreiben können.

**Du musst es selbst zu .gitignore hinzufügen.** Obwohl `.qwen/` oft als lokales Verzeichnis behandelt wird, generiert qwen-code kein `.gitignore` für dich, und manche Projekte checken `.qwen/settings.json` ein. Füge diese Zeile zu deiner `.gitignore` (oder zu deinem globalen Git-Ignore) hinzu:

```
.qwen/QWEN.local.md
```

### Automatisch mit `/init` generieren

Führe `/init` aus und Qwen analysiert deine Codebasis, um eine erste QWEN.md mit Build-Befehlen, Testanweisungen und gefundenen Konventionen zu erstellen. Wenn bereits eine existiert, schlägt es Ergänzungen vor, anstatt sie zu überschreiben.

### Auf andere Dateien verweisen

Du kannst QWEN.md auf andere Dateien verweisen, sodass Qwen sie ebenfalls liest:

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Verwende `@path/to/file` an beliebiger Stelle in QWEN.md. Relative Pfade werden ausgehend von der QWEN.md-Datei selbst aufgelöst.

---

## Auto-memory: Was Qwen über dich lernt

Auto-memory läuft im Hintergrund. Nach jeder deiner Unterhaltungen speichert Qwen still nützliche Dinge, die es gelernt hat – deine Vorlieben, dein Feedback, Projektkontext –, damit es sie in zukünftigen Sitzungen verwenden kann, ohne dass du dich wiederholen musst.

Das unterscheidet sich von QWEN.md: Du schreibst es nicht, Qwen tut es.

### Was Qwen speichert

Qwen sucht nach vier Arten von Dingen, die es sich zu merken lohnt:

| Was                    | Beispiele                                                 |
| ----------------------- | -------------------------------------------------------- |
| **Über dich**           | Deine Rolle, Hintergrund, wie du gerne arbeitest              |
| **Dein Feedback**       | Korrekturen, die du vorgenommen hast, Ansätze, die du bestätigt hast           |
| **Projektkontext**     | Laufende Arbeiten, Entscheidungen, Ziele, die aus dem Code nicht ersichtlich sind |
| **Externe Referenzen** | Dashboards, Ticket-Tracker, Doku-Links, die du erwähnt hast    |

Qwen speichert nicht alles – nur Dinge, die beim nächsten Mal tatsächlich nützlich wären.

### Wo es gespeichert wird

Auto-memory-Dateien befinden sich unter `~/.qwen/projects/<project>/memory/`. Alle Branches und Worktrees desselben Repositorys teilen denselben Speicherordner, sodass das, was Qwen in einem Branch lernt, auch in anderen verfügbar ist.

Alles Gespeicherte ist einfaches Markdown – du kannst jede Datei jederzeit öffnen, bearbeiten oder löschen.

### Regelmäßige Bereinigung

Qwen durchläuft regelmäßig seine gespeicherten Erinnerungen, um Duplikate zu entfernen und veraltete Einträge zu bereinigen. Dies läuft automatisch im Hintergrund einmal täglich, nachdem genügend Sitzungen angesammelt wurden. Du kannst es manuell mit `/dream` auslösen, wenn du es jetzt ausführen möchtest.

Während die Bereinigung läuft, erscheint **✦ dreaming** in der Ecke des Bildschirms. Deine Sitzung läuft normal weiter.

### Ein- oder Ausschalten

Auto-memory ist standardmäßig aktiviert. Um es umzuschalten, öffne `/memory` und verwende die Schalter oben. Du kannst nur das automatische Speichern, nur die regelmäßige Bereinigung oder beides deaktivieren.

Du kannst sie auch in `~/.qwen/settings.json` (gilt für alle Projekte) oder `.qwen/settings.json` (nur dieses Projekt) festlegen:

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

---

## Befehle

### `/memory`

Öffnet das Memory-Panel. Von hier aus kannst du:

- Auto-memory-Speichern ein- oder ausschalten
- Regelmäßige Bereinigung (dream) ein- oder ausschalten
- Deine persönliche QWEN.md öffnen (`~/.qwen/QWEN.md`)
- Die Projekt-QWEN.md öffnen
- Den Auto-memory-Ordner durchsuchen

### `/init`

Generiert eine erste QWEN.md für dein Projekt. Qwen liest deine Codebasis und füllt Build-Befehle, Testanweisungen und gefundene Konventionen ein.

### `/remember <text>`

Speichert sofort etwas im Auto-memory, ohne darauf zu warten, dass Qwen es automatisch aufnimmt:

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

Führt die Speicherbereinigung jetzt aus, anstatt auf den automatischen Zeitplan zu warten:

```
/dream
```

---

## Fehlerbehebung

### Qwen befolgt meine QWEN.md nicht

Öffne `/memory`, um zu sehen, welche Dateien geladen sind. Wenn deine Datei nicht aufgeführt ist, kann Qwen sie nicht sehen – stelle sicher, dass sie im Projektstammverzeichnis oder unter `~/.qwen/` liegt.

Anweisungen funktionieren besser, wenn sie spezifisch sind:

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

Wenn du mehrere QWEN.md-Dateien mit widersprüchlichen Anweisungen hast, kann Qwen sich inkonsistent verhalten. Überprüfe sie und entferne alle Widersprüche.

### Ich möchte sehen, was Qwen gespeichert hat

Führe `/memory` aus und wähle **Auto-memory-Ordner öffnen**. Alle gespeicherten Erinnerungen sind lesbare Markdown-Dateien, die du durchsuchen, bearbeiten oder löschen kannst.

### Qwen vergisst ständig Dinge

Wenn Auto-memory aktiviert ist, Qwen aber scheinbar keine Dinge über Sitzungen hinweg merkt, versuche `/dream` auszuführen, um eine Bereinigung zu erzwingen. Überprüfe auch `/memory`, um sicherzustellen, dass beide Schalter aktiviert sind.

Für Dinge, die Qwen sich immer merken soll, füge sie stattdessen zu QWEN.md hinzu – Auto-memory ist eine bestmögliche Bemühung, QWEN.md ist garantiert.