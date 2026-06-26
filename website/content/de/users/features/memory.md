# Speicher

Jede Qwen Code-Sitzung beginnt mit einem frischen Kontextfenster. Zwei Mechanismen übertragen Wissen zwischen Sitzungen, damit du dich nicht jedes Mal neu erklären musst:

- **QWEN.md** — Anweisungen, die du einmal schreibst und Qwen liest sie jede Sitzung
- **Auto-memory** — Notizen, die Qwen selbst schreibt, basierend auf dem, was es von dir lernt

---

## QWEN.md: deine Anweisungen an Qwen

QWEN.md ist eine einfache Textdatei, in die du Dinge schreibst, die Qwen immer über dein Projekt oder deine Vorlieben wissen sollte. Betrachte es als ein dauerhaftes Briefing, das zu Beginn jeder Unterhaltung geladen wird.

### Was in QWEN.md stehen sollte

Füge Dinge hinzu, die du sonst jede Sitzung wiederholen müsstest:

- Build- und Testbefehle (`npm run test`, `make build`)
- Code-Konventionen deines Teams ("alle neuen Dateien müssen JSDoc-Kommentare haben")
- Architekturentscheidungen ("wir verwenden das Repository-Pattern, rufe die Datenbank niemals direkt aus Controllern auf")
- Persönliche Vorlieben ("verwende immer pnpm, nicht npm")

Füge keine Dinge hinzu, die Qwen durch Lesen deines Codes selbst herausfinden kann. QWEN.md funktioniert am besten, wenn es kurz und spezifisch ist – je länger es wird, desto unzuverlässiger folgt Qwen ihm.

### Wo QWEN.md erstellt wird

| Datei                              | Für wen es gilt                                     |
| ---------------------------------- | --------------------------------------------------- |
| `~/.qwen/QWEN.md`                  | Du, für alle deine Projekte                         |
| `QWEN.md` im Projektstammverzeichnis | Dein gesamtes Team (in die Versionsverwaltung einchecken) |
| `.qwen/QWEN.local.md`              | Nur du, nur in diesem Projekt (aus Git ausschließen) |

Du kannst jede beliebige Kombination dieser Dateien haben. Qwen lädt alle, wenn du eine Sitzung startest.

Wenn dein Repository bereits eine `AGENTS.md`-Datei für andere KI-Tools enthält, liest Qwen diese ebenfalls. Keine Notwendigkeit, Anweisungen zu duplizieren.

#### Wann `.qwen/QWEN.local.md` verwenden

Verwende es für **projektspezifische, aber persönliche** Anweisungen – Dinge, die zu diesem Projekt gehören, aber nicht mit dem Team geteilt werden sollten:

- Deine eigene Cluster-ID, Container-Registry-Namespace oder Cloud-Konto
- Ein persönlicher Debug-Befehl, der deine lokale Umgebung fest codiert
- Notizen, die Qwen über deine laufende Arbeit wissen soll, aber nicht committen

Es wird **nach** dem gemeinsamen Projekt-`QWEN.md` geladen, sodass deine lokalen Anweisungen die des Teams ergänzen oder überschreiben können.

**Du musst es selbst in die `.gitignore` aufnehmen.** Obwohl `.qwen/` oft als lokales Verzeichnis behandelt wird, generiert qwen-code keine `.gitignore` für dich, und manche Projekte committen `.qwen/settings.json`. Füge diese Zeile zu deiner `.gitignore` (oder zu deiner globalen Git-Ignore) hinzu:

```
.qwen/QWEN.local.md
```

### Automatisch eine mit `/init` erstellen

Führe `/init` aus und Qwen analysiert deine Codebasis, um ein Starter-QWEN.md mit Build-Befehlen, Testanweisungen und gefundenen Konventionen zu erstellen. Wenn bereits eine existiert, schlägt es Ergänzungen vor, anstatt sie zu überschreiben.

### Andere Dateien referenzieren

Du kannst QWEN.md auf andere Dateien verweisen lassen, damit Qwen diese ebenfalls liest:

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Verwende `@path/to/file` überall in QWEN.md. Relative Pfade werden relativ zur QWEN.md-Datei selbst aufgelöst.

---

## Auto-memory: was Qwen über dich lernt

Auto-memory läuft im Hintergrund. Nach jedem deiner Gespräche speichert Qwen leise nützliche Dinge, die es gelernt hat – deine Vorlieben, gegebenes Feedback, Projektkontext –, damit es sie in zukünftigen Sitzungen verwenden kann, ohne dass du dich wiederholen musst.

Dies unterscheidet sich von QWEN.md: du schreibst es nicht, Qwen tut es.

### Was Qwen speichert

Qwen sucht nach vier Arten von Dingen, die es sich zu merken lohnt:

| Was                  | Beispiele                                                        |
| -------------------- | ---------------------------------------------------------------- |
| **Über dich**        | Deine Rolle, dein Hintergrund, wie du gerne arbeitest            |
| **Dein Feedback**    | Korrekturen, die du vorgenommen hast, Ansätze, die du bestätigt hast |
| **Projektkontext**   | Laufende Arbeiten, Entscheidungen, Ziele, die aus dem Code nicht offensichtlich sind |
| **Externe Referenzen** | Dashboards, Ticket-Tracker, Dokumentationslinks, die du erwähnt hast |

Qwen speichert nicht alles – nur Dinge, die tatsächlich beim nächsten Mal nützlich wären.

### Wo es gespeichert wird

Auto-memory-Dateien liegen unter `~/.qwen/projects/<project>/memory/`. Alle Branches und Worktrees desselben Repositories teilen sich denselben Speicherordner, sodass das, was Qwen in einem Branch lernt, auch in anderen verfügbar ist.

Alles Gespeicherte ist einfaches Markdown – du kannst jede Datei jederzeit öffnen, bearbeiten oder löschen.

### Regelmäßige Bereinigung

Qwen durchläuft regelmäßig seine gespeicherten Erinnerungen, um Duplikate zu entfernen und veraltete Einträge zu bereinigen. Dies läuft automatisch im Hintergrund einmal täglich, nachdem genügend Sitzungen angesammelt wurden. Du kannst es manuell mit `/dream` auslösen, wenn du es jetzt ausführen möchtest.

Während die Bereinigung läuft, erscheint **✦ dreaming** in der Ecke des Bildschirms. Deine Sitzung läuft normal weiter.

### Ein- und Ausschalten

Auto-memory ist standardmäßig aktiviert. Um es umzuschalten, öffne `/memory` und verwende die Schalter oben. Du kannst entweder nur das automatische Speichern, nur die regelmäßige Bereinigung oder beides deaktivieren.
Sie können sie auch in `~/.qwen/settings.json` (gilt für alle Projekte) oder `.qwen/settings.json` (nur für dieses Projekt) festlegen:

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

---

## Commands

### `/memory`

Öffnet das Memory-Panel. Hier können Sie:

- Automatisches Speichern des Speichers ein- oder ausschalten
- Periodische Bereinigung (Dream) ein- oder ausschalten
- Ihre persönliche QWEN.md öffnen (`~/.qwen/QWEN.md`)
- Die Projekt-QWEN.md öffnen
- Den Auto-Memory-Ordner durchsuchen

### `/init`

Generiert eine Starter-QWEN.md für Ihr Projekt. Qwen liest Ihre Codebasis und füllt Build-Befehle, Testanweisungen und von ihm entdeckte Konventionen ein.

### `/remember <text>`

Speichert sofort etwas im Auto-Memory, ohne darauf zu warten, dass Qwen es automatisch aufnimmt:

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

Entfernt Auto-Memory-Einträge, die Ihrer Beschreibung entsprechen:

```
/forget old workaround for the login bug
```

### `/dream`

Führt die Speicherbereinigung jetzt aus, anstatt auf die automatische Planung zu warten:

```
/dream
```

---

## Troubleshooting

### Qwen befolgt meine QWEN.md nicht

Öffnen Sie `/memory`, um zu sehen, welche Dateien geladen sind. Wenn Ihre Datei nicht aufgeführt ist, kann Qwen sie nicht sehen – stellen Sie sicher, dass sie im Projektstamm oder in `~/.qwen/` liegt.

Anweisungen funktionieren besser, wenn sie spezifisch sind:

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

Wenn Sie mehrere QWEN.md-Dateien mit widersprüchlichen Anweisungen haben, kann Qwen inkonsistent handeln. Überprüfen Sie sie und entfernen Sie alle Widersprüche.

### Ich möchte sehen, was Qwen gespeichert hat

Führen Sie `/memory` aus und wählen Sie **Auto-Memory-Ordner öffnen**. Alle gespeicherten Erinnerungen sind lesbare Markdown-Dateien, die Sie durchsuchen, bearbeiten oder löschen können.

### Qwen vergisst ständig Dinge

Wenn Auto-Memory aktiviert ist, Qwen aber scheinbar über Sitzungen hinweg nichts merkt, versuchen Sie, `/dream` auszuführen, um einen Bereinigungsdurchlauf zu erzwingen. Überprüfen Sie auch `/memory`, um zu bestätigen, dass beide Schalter aktiviert sind.

Für Dinge, die Qwen immer merken soll, fügen Sie sie stattdessen zur QWEN.md hinzu – Auto-Memory ist eine bestmögliche Leistung, QWEN.md ist garantiert.
