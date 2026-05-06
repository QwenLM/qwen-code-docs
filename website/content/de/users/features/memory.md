# Memory

Jede Qwen Code-Sitzung startet mit einem frischen Kontextfenster. Zwei Mechanismen transportieren Wissen über Sitzungen hinweg, sodass du dich nicht jedes Mal neu erklären musst:

- **QWEN.md** – Anweisungen, die _du_ einmal schreibst und die Qwen in jeder Sitzung liest
- **Auto-memory** – Notizen, die Qwen selbst basierend auf dem erstellt, was es von dir lernt

---

## QWEN.md: Deine Anweisungen an Qwen

QWEN.md ist eine reine Textdatei, in der du Dinge festhältst, die Qwen immer über dein Projekt oder deine Präferenzen wissen sollte. Betrachte es als ein dauerhaftes Briefing, das zu Beginn jeder Konversation geladen wird.

### Was gehört in QWEN.md

Füge Dinge hinzu, die du sonst in jeder Sitzung wiederholen müsstest:

- Build- und Test-Befehle (`npm run test`, `make build`)
- Coding-Konventionen, die dein Team befolgt („alle neuen Dateien müssen JSDoc-Kommentare enthalten“)
- Architekturentscheidungen („wir verwenden das Repository-Pattern, rufen die Datenbank niemals direkt aus Controllern auf“)
- Persönliche Präferenzen („verwende immer pnpm, nicht npm“)

Nimm nichts auf, was Qwen durch das Lesen deines Codes selbst herausfinden kann. QWEN.md funktioniert am besten, wenn es kurz und präzise ist – je länger es wird, desto unzuverlässiger befolgt Qwen die Anweisungen.

### Wo du QWEN.md erstellst

| Datei                         | Für wen gilt es                                 |
| ----------------------------- | ----------------------------------------------- |
| `~/.qwen/QWEN.md`             | Dich, projektübergreifend                       |
| `QWEN.md` im Projekt-Root     | Dein gesamtes Team (commite es in die Versionskontrolle) |

Du kannst beide verwenden. Qwen lädt beim Start einer Sitzung alle gefundenen QWEN.md-Dateien – deine persönliche sowie alle im Projekt.

Falls dein Repository bereits eine `AGENTS.md`-Datei für andere KI-Tools enthält, liest Qwen diese ebenfalls. Eine Duplizierung der Anweisungen ist nicht nötig.

### Automatisch generieren mit `/init`

Führe `/init` aus und Qwen analysiert deine Codebasis, um eine initiale QWEN.md mit Build-Befehlen, Testanweisungen und erkannten Konventionen zu erstellen. Falls bereits eine existiert, schlägt es Ergänzungen vor, anstatt die Datei zu überschreiben.

### Andere Dateien referenzieren

Du kannst in QWEN.md auf andere Dateien verweisen, damit Qwen diese ebenfalls liest:

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Verwende `@path/to/file` an beliebiger Stelle in QWEN.md. Relative Pfade werden relativ zur QWEN.md-Datei selbst aufgelöst.

---

## Auto-memory: Was Qwen über dich lernt

Auto-memory läuft im Hintergrund. Nach jeder deiner Konversationen speichert Qwen unauffällig nützliche Erkenntnisse – deine Präferenzen, gegebenes Feedback, Projektkontext –, damit es diese in zukünftigen Sitzungen verwenden kann, ohne dass du dich wiederholen musst.

Das unterscheidet sich von QWEN.md: Du schreibst es nicht, Qwen tut es.

### Was Qwen speichert

Qwen sucht nach vier Arten von Informationen, die es sich zu merken lohnt:

| Was                     | Beispiele                                                |
| ----------------------- | -------------------------------------------------------- |
| **Über dich**           | Deine Rolle, Hintergrund, wie du gerne arbeitest         |
| **Dein Feedback**       | Von dir vorgenommene Korrekturen, bestätigte Ansätze     |
| **Projektkontext**      | Laufende Arbeiten, Entscheidungen, Ziele, die nicht direkt aus dem Code ersichtlich sind |
| **Externe Referenzen**  | Dashboards, Ticket-Tracker, von dir erwähnte Doc-Links   |

Qwen speichert nicht alles – nur Dinge, die beim nächsten Mal tatsächlich nützlich wären.

### Wo es gespeichert wird

Die Auto-memory-Dateien befinden sich unter `~/.qwen/projects/<project>/memory/`. Alle Branches und Worktrees desselben Repositories teilen sich denselben Memory-Ordner. Was Qwen also in einem Branch lernt, ist in anderen ebenfalls verfügbar.

Alles Gespeicherte ist reines Markdown – du kannst jede Datei jederzeit öffnen, bearbeiten oder löschen.

### Regelmäßige Bereinigung

Qwen durchsucht regelmäßig seine gespeicherten Memories, um Duplikate zu entfernen und veraltete Einträge zu bereinigen. Dies läuft automatisch im Hintergrund einmal täglich, sobald genügend Sitzungen angesammelt wurden. Du kannst es manuell mit `/dream` auslösen, wenn es sofort laufen soll.

Während die Bereinigung läuft, erscheint **✦ dreaming** in der Bildschirmecke. Deine Sitzung läuft normal weiter.

### Aktivieren oder Deaktivieren

Auto-memory ist standardmäßig aktiviert. Um es umzuschalten, öffne `/memory` und verwende die Schalter oben. Du kannst nur das automatische Speichern, nur die regelmäßige Bereinigung oder beides deaktivieren.

Du kannst sie auch in `~/.qwen/settings.json` (gilt für alle Projekte) oder `.qwen/settings.json` (nur für dieses Projekt) konfigurieren:

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

- Das automatische Speichern von Auto-memory aktivieren oder deaktivieren
- Die regelmäßige Bereinigung (dream) aktivieren oder deaktivieren
- Deine persönliche QWEN.md öffnen (`~/.qwen/QWEN.md`)
- Die Projekt-QWEN.md öffnen
- Den Auto-memory-Ordner durchsuchen

### `/init`

Generiert eine initiale QWEN.md für dein Projekt. Qwen liest deine Codebasis und füllt Build-Befehle, Testanweisungen und erkannte Konventionen ein.

### `/remember <text>`

Speichert etwas sofort in Auto-memory, ohne darauf zu warten, dass Qwen es automatisch erkennt:

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

## Fehlerbehebung

### Qwen befolgt meine QWEN.md nicht

Öffne `/memory`, um zu sehen, welche Dateien geladen sind. Wenn deine Datei nicht aufgeführt ist, kann Qwen sie nicht sehen – stelle sicher, dass sie sich im Projekt-Root oder unter `~/.qwen/` befindet.

Anweisungen funktionieren besser, wenn sie präzise sind:

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

Falls du mehrere QWEN.md-Dateien mit widersprüchlichen Anweisungen hast, kann sich Qwen inkonsistent verhalten. Überprüfe sie und entferne alle Widersprüche.

### Ich möchte sehen, was Qwen gespeichert hat

Führe `/memory` aus und wähle **Auto-memory-Ordner öffnen**. Alle gespeicherten Memories sind lesbare Markdown-Dateien, die du durchsuchen, bearbeiten oder löschen kannst.

### Qwen vergisst ständig Dinge

Wenn Auto-memory aktiviert ist, Qwen sich aber scheinbar nicht über Sitzungen hinweg erinnert, versuche `/dream` auszuführen, um eine Bereinigung zu erzwingen. Prüfe außerdem `/memory`, um sicherzustellen, dass beide Schalter aktiviert sind.

Für Dinge, die Qwen immer wissen soll, füge sie stattdessen zu QWEN.md hinzu – Auto-memory ist best-effort, QWEN.md ist garantiert.