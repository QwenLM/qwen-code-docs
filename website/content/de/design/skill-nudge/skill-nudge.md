# AutoSkill：Automatische Skill-Extraktion – Systemdesign-Dokument

## Überblick

Dieses Dokument beschreibt das Design zur Erweiterung der bestehenden Memory-Dream-Architektur von QwenCode um die **AutoSkill**-Fähigkeit.

AutoSkill ist ein **Mechanismus zur automatischen Extraktion prozeduraler Erinnerungen**: Nachdem ein Agent eine aufgabenintensive Sequenz mit vielen Tool-Aufrufen abgeschlossen hat, evaluiert das System im Hintergrund, ob in der Konversation wiederverwendbare Abläufe vorhanden sind, und speichert diese automatisch als projektweites Skill.

### Abgrenzung zu Memory Extract

| Dimension         | Memory Extract                              | AutoSkill                                        |
| ----------------- | ------------------------------------------- | ------------------------------------------------ |
| **Speichertyp**   | Deklaratives Gedächtnis (Wer ist der Nutzer, Projektkontext) | Prozedurales Gedächtnis (Wie man eine bestimmte Aufgabe erledigt) |
| **Auslöser**      | Nach jeder Sitzung                          | Wenn die Anzahl der Tool-Aufrufe in einer Sitzung einen Schwellenwert erreicht |
| **Zielverzeichnis** | `${projectRoot}/.qwen/memory/`            | `${projectRoot}/.qwen/skills/`                   |
| **Inhalt**        | Nutzerpräferenzen, Projektkontext, Feedbackregeln | Wiederverwendbare Arbeitsschritte, Best Practices |
| **Lebenszyklus**  | Dream integriert / trimmt regelmäßig        | Aktualisierung nach Bedarf, gepflegt durch review agent |

---

## Kern-Designprinzipien

1. **Kein spezielles Schreib-Tool**: Der Skill-Review-Agent verwendet direkt die allgemeinen Tools `read_file`, `write_file` und `edit`, um `.qwen/skills/` zu bearbeiten – es wird kein spezielles `skill_manage`-Tool eingeführt. Gleiches gilt für die Hauptsitzung: Möchte der Nutzer manuell Skills verwalten, nutzt er dieselben allgemeinen Tools.
2. **Erkennung von Skill-Änderungen statt Zurücksetzen des Tool-Zählers**: Analog zur Erkennung von `memory_tool`-Aufrufen bei Memory Extract erkennt das System, ob Schreiboperationen in der Hauptsitzung auf das `.qwen/skills/`-Verzeichnis fallen. Falls ja, hat der Nutzer in dieser Runde bereits aktiv Skills bearbeitet, und die automatische Skill-Review am Ende der Sitzung wird übersprungen.
3. **`auto-skill`-Flag schützt nutzerseitig erstellte Skills**: Skills, die vom Review-Agent erstellt werden, müssen im YAML-Frontmatter das Feld `source: auto-skill` enthalten. Der Skill-Review-Agent darf nur Skills mit diesem Flag ändern und niemals manuell erstellte Skills des Nutzers berühren.
4. **Auslösung durch Tool-Aufruf-Dichte**: Nur wenn die Anzahl der Tool-Aufrufe in einer Sitzung ≥ 20 beträgt, wird die Extraktion ausgelöst. Dadurch wird sichergestellt, dass sie nur nach wirklich komplexen Aufgaben stattfindet.
5. **Klare Schreibschutzgrenzen**: Der Permission-Manager des Review-Agents beschränkt `write_file` und `edit` auf `${projectRoot}/.qwen/skills/`. Das User-, Extension- und Bundled-Verzeichnis darf nicht berührt werden.
6. **Maximale Beibehaltung des Hermes-Kern-Prompts**: Der Prompt für den Review-Agent wird direkt aus Hermes' `_SKILL_REVIEW_PROMPT` übernommen, nur mit minimalen Anpassungen.

---

## Architekturänderungen

### 1. Zähler: `toolCallCount` & Erkennung von Skill-Änderungen

Im Sitzungszustand werden zwei parallel verfolgte Größen verwaltet:

**Tool-Aufruf-Zähler** (bestimmt, ob ein Skill-Review ausgelöst wird):

```
Sitzung startet
  toolCallCount = 0

Nach jedem Tool-Aufruf
  toolCallCount += 1

Sitzung endet
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // Standard: 20
    Prüfe skillsModifiedInSession
    ├─ true  → überspringen (Skill wurde in dieser Runde manuell bearbeitet, kein automatischer Review nötig)
    └─ false → scheduleSkillReview()
```

**Erkennung von Skill-Änderungen** (ersetzt das Zurücksetzen durch `skill_manage`-Aufrufe):

```
Nach jedem Tool-Aufruf
  if (Zielpfad des Tool-Aufrufs liegt unter ${projectRoot}/.qwen/skills/):
    skillsModifiedInSession = true
```

Erkennungslogik: Scanne die in den Tool-Ergebnissen enthaltenen Dateipfade und prüfe, ob sie unter dem Skills-Verzeichnis liegen. Die Implementierung orientiert sich am Muster von `historyCallsSkillManage()`: Durchlaufe die `history`-Einträge, extrahiere Zielpfade von Schreiboperationen (`write_file`, `edit`) und führe einen Präfixvergleich durch.

> **Warum Erkennung von Skill-Änderungen statt Tool-Namen-Erkennung?**
> Es gibt kein dediziertes `skill_manage`-Tool mehr. Sowohl die Hauptsitzung als auch der Review-Agent verwenden die allgemeinen `write_file`/`edit`-Tools. Daher wechselt die Erkennungsdimension von „Wurde ein bestimmtes Tool aufgerufen?" zu „Gibt es Schreiboperationen im `.qwen/skills/`-Verzeichnis?". Dies ist semantisch genauer: Wenn der Nutzer in dieser Runde bereits aktiv Skill-Dateien bearbeitet hat, wird der automatische Review übersprungen.

> **Warum Tool-Aufruf-Anzahl statt Konversationsrunden?**
> Die Anzahl der Tool-Aufrufe spiegelt die Aufgabenkomplexität wider – eine einzige Nutzernachricht kann 1 oder 30 Tool-Aufrufe auslösen. Eine hohe Tool-Dichte bedeutet mehr Versuch-und-Irrtum, Strategiewechsel usw., was die Wahrscheinlichkeit für wiederverwendbare Erfahrungen erhöht. Der Schwellenwert von 20 ist konservativer als Hermes' 10, da die Tool-Aufruf-Granularität von QwenCode oft feiner ist (z. B. zeilenweise Edits).

### 2. Auslösepunkt

Der bestehende `MemoryManager`-Aufrufpunkt (Sitzungsende) dient als einheitlicher Einstiegspunkt und wird erweitert, um gleichzeitig einen Skill-Review zu planen.

```
Sitzung endet
  ├─ scheduleExtract(params)           // Bestehende Logik unverändert
  └─ scheduleSkillReview(params)       // Neu
        Bedingung: toolCallCount >= AUTO_SKILL_THRESHOLD
             && !skillsModifiedInSession
```

Extract und Skill-Review werden unabhängig voneinander geplant und über `MemoryManager.track()` parallel ausgeführt – sie blockieren sich nicht gegenseitig.

### 3. Tool-Zugriffsrechte des Skill-Review-Agents

Der Skill-Review-Agent verwendet **kein** spezielles `skill_manage`-Tool, sondern direkt die allgemeinen Datei-Tools:

| Tool         | Zweck                                              | Bereichseinschränkung                                                                   |
| ------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `read_file`  | Vorhandenes Skill lesen, Frontmatter prüfen        | Keine Einschränkung                                                                     |
| `ls`         | `.qwen/skills/`-Verzeichnisstruktur scannen        | Keine Einschränkung                                                                     |
| `write_file` | Neue Skill-Datei erstellen                         | Nur innerhalb von `${projectRoot}/.qwen/skills/`                                        |
| `edit`       | Vorhandenes Skill bearbeiten                       | Nur innerhalb von `${projectRoot}/.qwen/skills/` und die Zieldatei muss `source: auto-skill` enthalten |
| `shell`      | Nur-Lese-Befehle (z. B. `cat`, `find`)             | Nur Lese-Befehle (statische Analyse des Shell-AST)                                      |

**Zusätzliche Einschränkung für `edit` (`auto-skill`-Schutz)**:

Der Permission-Manager des Skill-Review-Agents liest vor der Ausführung von `edit` oder `write_file` (Überschreiben einer bestehenden Datei) das YAML-Frontmatter der Zieldatei und prüft das Feld `source: auto-skill`. Fehlt dieses Feld, wird der Schreibvorgang abgelehnt und ein Fehler zurückgegeben:

```
skill_review_agent: edit is only allowed on skills with 'source: auto-skill' in frontmatter.
This skill appears to be user-created. Modify it manually or ask the user.
```

Diese Prüfung erfolgt auf der Berechtigungsebene von `createSkillScopedAgentConfig`, nicht nur über den System-Prompt, sodass selbst bei einem Modellfehler keine vom Nutzer erstellten Skills überschrieben werden.

**Tool-Zugriff in der Hauptsitzung**: Der Haupt-Agent hat keine Einschränkungen beim Lesen/Schreiben von `.qwen/skills/` – der Nutzer kann Skills über normale `write_file`/`edit`-Befehle verwalten. Solche Operationen setzen `skillsModifiedInSession = true` und führen dazu, dass der automatische Skill-Review am Ende der Sitzung übersprungen wird.

### 4. Berechtigungssandbox: `SkillScopedPermissionManager`

Analog zu `createMemoryScopedAgentConfig` in `extractionAgentPlanner.ts` wird ein dedizierter Berechtigungsbereich für den Skill-Review-Agent erstellt:

```typescript
// Vom Skill-Review-Agent erlaubte Operationen
read_file:    Keine Pfadbeschränkung (muss beliebige Dateien lesen können, um den Projekthontext zu verstehen)
ls:           Keine Pfadbeschränkung
shell:        Nur-Lese-Befehle (statische Analyse des Shell-AST, Wiederverwendung von `isShellCommandReadOnlyAST`)
write_file:   Nur Dateien unter ${projectRoot}/.qwen/skills/ (neue Skills anlegen)
edit:         Nur Dateien unter ${projectRoot}/.qwen/skills/, und die Zieldatei muss `source: auto-skill` enthalten
```

**Implementierungsebenen des `auto-skill`-Schutzes**:

1. **Permission-Manager-Ebene** (harte Einschränkung): Vor `edit` wird das Frontmatter gelesen. Fehlt `source: auto-skill`, wird der Vorgang abgelehnt.
2. **System-Prompt-Ebene** (weiche Einschränkung): Der Agent wird explizit angewiesen, nur Skills mit `source: auto-skill` zu bearbeiten.
3. **Doppelte Absicherung**: Selbst wenn die System-Prompt-Einschränkung umgangen wird, greift der Permission-Manager.

---

## Skill-Review-Agent – Design

### Trigger-Prompt (übernommen von Hermes, minimale Anpassung)

```
Review the conversation above and consider saving or updating a skill if appropriate.

Focus on: was a non-trivial approach used to complete a task that required trial
and error, or changing course due to experiential findings along the way, or did
the user expect or desire a different method or outcome? If a relevant skill
already exists and has 'source: auto-skill' in its frontmatter, update it with
what you learned. Otherwise, create a new skill if the approach is reusable.

IMPORTANT constraints:
- You may ONLY modify skill files that contain 'source: auto-skill' in their
  YAML frontmatter. Always read a skill file before editing it.
- Do NOT touch skills that lack this marker — they were created by the user.
- When creating a new skill, you MUST include 'source: auto-skill' in the
  frontmatter so future review agents can safely update it.
- Do NOT delete any skill. Only create or update.

If nothing is worth saving, just say 'Nothing to save.' and stop.

Skills are saved to the current project (.qwen/skills/).
Use write_file to create a new skill, edit to update an existing auto-skill.
Each skill lives at .qwen/skills/<name>/SKILL.md with YAML frontmatter:

---
name: <skill-name>
description: <one-line description>
metadata:
  source: auto-skill
  extracted_at: '<ISO-8601 timestamp>'
---

<markdown body with the procedure/approach>
```

### Agent-Konfiguration

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // Vorhandenes Skill lesen, source: auto-skill prüfen
    "ls",          // .qwen/skills/-Verzeichnis scannen
    "write_file",  // Neue Skill-Datei erstellen (Permission-Manager schränkt Pfad ein)
    "edit",        // Vorhandenes Auto-Skill bearbeiten (Permission-Manager prüft Frontmatter)
    "shell",       // Nur-Lese-Befehle (z. B. find, cat)
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // Vollständiger Schnappschuss des Konversationsverlaufs
}
```

---

## Integration mit dem bestehenden MemoryManager

### `ScheduleSkillReviewParams` (neuer Typ)

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // Vollständiger Schnappschuss des Konversationsverlaufs
  toolCallCount: number; // Anzahl der Tool-Aufrufe in dieser Sitzung
  skillsModified: boolean; // Gab es in dieser Sitzung Schreiboperationen unter .qwen/skills/?
  config?: Config;
  enabled?: boolean;
  threshold?: number;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface SkillReviewScheduleResult {
  status: 'scheduled' | 'skipped';
  taskId?: string;
  skippedReason?: 'below_threshold' | 'skills_modified_in_session' | 'disabled';
}
```

### `MemoryManager.scheduleSkillReview()` (neue Methode)

```typescript
scheduleSkillReview(params: ScheduleSkillReviewParams): SkillReviewScheduleResult {
  // 1. Konfigurations-Gate
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. Schwellenwertprüfung
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. In dieser Runde wurden bereits Skills manuell bearbeitet – automatische Review überspringen
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. Unabhängige Planung
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### Erweiterung der Aufgabentypen

```typescript
// Erweiterung des bestehenden MemoryTaskRecord.taskType
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// Konstanten
export const AUTO_SKILL_THRESHOLD = 20; // Schwellenwert für die Anzahl der Tool-Aufrufe
```

---

## Datenfluss

```
Sitzung läuft
  Haupt-Agent-Schleife
    ├─ Nach jedem Tool-Aufruf → toolCallCount += 1
    └─ Falls Zielpfad einer Schreiboperation unter ${projectRoot}/.qwen/skills/ liegt
         → skillsModifiedInSession = true

Sitzung endet (sessionEnd-Ereignis)
  ├─ scheduleExtract(params)
  │     └─ [Bestehende Logik: Fork des Extraktions-Agent → schreibt in .qwen/memory/]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ nein → Überspringen (Dichte zu niedrig oder Skills wurden in dieser Runde manuell bearbeitet)
       └─ ja → scheduleSkillReview(params)
                 └─ Unabhängiger Fork des Skill-Review-Agents
                        ↓
                 Skill-Review-Agent (max. 8 Runden, 2 Min., Sandbox-Berechtigungen)
                 Tools: read_file, ls, write_file, edit, shell
                 Erhält vollständigen sessionHistory
                        ↓
                 Modell entscheidet, ob es einen wiederverwendbaren Ablauf gibt
                 ├─ Ja → Vorhandenes Skill lesen (prüft source: auto-skill)
                 │         → write_file erstellt neues Skill (enthält source: auto-skill)
                 │         → edit aktualisiert vorhandenes Auto-Skill
                 │         → SkillManager-Cache ungültig (notifyChangeListeners)
                 └─ Nein → "Nothing to save." Ende

Nächste Sitzung
  SkillManager.listSkills({ level: 'project' })
  → Scannt .qwen/skills/ und findet neu erstelltes Skill
  → Injektion in den <available_skills>-Block des System-Prompts (Tier 1)
```

---

## SKILL.md-Format-Konvention (Project-Level)

Automatisch extrahierte Skills werden unter `${projectRoot}/.qwen/skills/<name>/SKILL.md` gespeichert. Das Format ist vollständig kompatibel mit dem bestehenden SkillManager:

```yaml
---
name: <skill-name> # Pflicht, Kleinbuchstaben + Bindestriche
description: <description> # Pflicht, ≤ 1024 Zeichen
version: 1.0.0
metadata:
  source: auto-skill # Pflicht (wird vom Review-Agent beim Erstellen zwingend gesetzt)
  extracted_at: '2026-04-24T12:00:00Z'
---
# <Skill-Titel>

<Arbeitsschritte / Best Practices / Hinweise>
```

**Bedeutung von `source: auto-skill`**:

| Markierung     | Erstellt durch | Darf der Review-Agent ändern? | Darf der Nutzer ändern? |
| -------------- | -------------- | ----------------------------- | ----------------------- |
| `auto-skill`   | Review-Agent   | ✅ Ja                         | ✅ Ja                   |
| Kein Feld      | Nutzer         | ❌ Nein (Permission-Manager blockt) | ✅ Ja |

Legt der Nutzer bei einem selbst erstellten Skill ebenfalls `source: auto-skill` an, erlaubt er damit dem Review-Agent, diesen Skill in Zukunft automatisch zu aktualisieren.

---

## Sicherheitsaspekte

| Risiko                                               | Gegenmaßnahme                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatische Extraktion überschreibt sorgfältig erstellte Skills | Permission-Manager liest Frontmatter; wenn `source: auto-skill` fehlt, wird `edit` verweigert; auch der System-Prompt klärt auf, dass nur Auto-Skills geändert werden dürfen |
| Unbegrenztes Wachstum der Skills                     | Review-Prompt verlangt explizit „vorhandene Skills bevorzugen"; Aktualisierung ist dem Neuanlegen vorzuziehen                                                     |
| Schreiben außerhalb des Projektpfads                 | `write_file`/`edit`-Berechtigungen auf `${projectRoot}/.qwen/skills/` beschränkt; `assertRealProjectSkillPath` verweigert Symlink-Traversal                      |
| Extraktion von injektionsgefährdetem Inhalt          | Wiederverwendung der bestehenden Sicherheitsprüfungen für Inhalte                                                                                                |
| Review-Agent löscht Skills                           | Zum Tool-Set des Review-Agents gehören keine Löschoperationen (kein `rm`, kein `shell`-Schreibbefehl); der System-Prompt verbietet das Löschen explizit           |
| Nach manueller Skill-Bearbeitung wird trotzdem ein Review ausgelöst | `skillsModifiedInSession`-Prüfung: Gibt es in der Hauptsitzung Schreiboperationen unter `.qwen/skills/`, wird der Review übersprungen                              |
| Symlink-Traversal in Dateien außerhalb des Skills-Verzeichnisses | `assertRealProjectSkillPath` (async): Verwendet `fs.realpath()`, um den echten Pfad aufzulösen. Schreiben wird nur erlaubt, wenn der echte Pfad innerhalb des echten Skills-Root liegt        |

---

## Konfiguration

Im QwenCode-Config werden die folgenden optionalen Konfigurationsfelder (mit Standardwerten) hinzugefügt:

```typescript
// config schema neu (unter memory)
memory?: {
  enableAutoSkill?: boolean;   // Standard: true
}
```

Entsprechende Konfigurationsbeispiele in QWEN.md / `~/.qwen/config.json`:

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## E2E-Test-Checkliste

Nach Abschluss der Implementierung gemäß dem Ablauf in `.qwen/skills/e2e-testing/SKILL.md` zuerst `npm run build && npm run bundle` ausführen, dann das lokal erstellte Build `node dist/cli.js` zur End-to-End-Validierung verwenden.

### 1. Keine Auslösung bei geringer Tool-Aufruf-Dichte

- Temporäres Projektverzeichnis im Headless-Modus verwenden.
- `memory.enableAutoSkill: true` konfigurieren.
- Eine einfache Aufgabe ausführen, die nur wenige Tool-Aufrufe erfordert, und die Sitzung normal beenden.
- Sicherstellen, dass unter `.qwen/skills/` kein neues Skill mit `source: auto-skill` angelegt wurde; im JSON-Stream sollten keine Schreiboperationen auf `.qwen/skills/` auftauchen.

### 2. Auslösung bei Erreichen des Schwellenwerts

- Temporäres Projektverzeichnis im Headless-Modus verwenden (`AUTO_SKILL_THRESHOLD` ist hart auf 20 codiert; kann in Test-Fixtures heruntergesetzt werden).
- Eine Aufgabe senden, die mehrere Tool-Aufrufe erfordert und einen wiederverwendbaren Ablauf enthält.
- Sicherstellen, dass nach der Sitzung ein Skill-Review geplant wurde; falls das Modell eine Speicherung für sinnvoll hält, wird `.qwen/skills/<name>/SKILL.md` erstellt, und das Frontmatter enthält `source: auto-skill`.
- Falls das Modell `Nothing to save.` meldet, muss der Vorgang normal beendet werden, ohne Berechtigungsfehler.

### 3. Überspringen des Reviews, nachdem in der Hauptsitzung Skills bearbeitet wurden

- Eine Sitzung konstruieren, in der gleichzeitig der Tool-Aufruf-Schwellenwert erreicht wird und über `write_file` oder `edit` in `.qwen/skills/` geschrieben wird (simuliert manuelle Skill-Verwaltung durch den Nutzer).
- Sicherstellen, dass am Sitzungsende `skillsModifiedInSession = true` und `scheduleSkillReview` den Status `skippedReason: 'skills_modified_in_session'` zurückgibt.
- Sicherstellen, dass kein Review-Agent gestartet wird, um doppelte Schreibvorgänge zu vermeiden.

### 4. Schreibschutz erlaubt nur Project-Level-Skills

- Der Skill-Review-Agent soll versuchen, in Pfade außerhalb des Projekts, in User-Level- oder Bundled-Skill-Pfade zu schreiben.
- Sicherstellen, dass die Schreibvorgänge abgelehnt werden und die Fehlermeldung darauf hinweist, dass nur in `${projectRoot}/.qwen/skills/` geschrieben werden darf.
- Sicherstellen, dass das Schreiben in `${projectRoot}/.qwen/skills/<name>/SKILL.md` erlaubt ist.

### 5. `auto-skill`-Flag schützt nutzerseitig erstellte Skills

- In `.qwen/skills/` ein vom Nutzer erstelltes Skill ohne `source: auto-skill` platzieren.
- Den Skill-Review-Agent auslösen und das Modell anleiten, dieses Skill zu ändern.
- Sicherstellen, dass der Schreibversuch vom Permission-Manager abgelehnt wird, mit einer Fehlermeldung, dass das Skill kein Auto-Skill ist.
- Sicherstellen, dass ein im selben Verzeichnis befindliches Skill mit `source: auto-skill` normal aktualisiert werden kann.

### 6. Symlink-Traversal wird abgelehnt

- In `.qwen/skills/` einen Symlink auf ein Verzeichnis außerhalb des Projekts erstellen.
- Den Skill-Review-Agent auslösen und versuchen, in den Symlink-Pfad zu schreiben.
- Sicherstellen, dass `assertRealProjectSkillPath` den Schreibvorgang mit dem Fehler `symlink traversal detected` ablehnt.

### 7. Konfigurationsschalter wirksam

- `memory.enableAutoSkill: false` konfigurieren; auch wenn die Anzahl der Tool-Aufrufe den Schwellenwert überschreitet, darf keine Auslösung erfolgen.
- Prüfen, dass bei standardmäßig aktiviertem Feature (`enableAutoSkill` nicht konfiguriert oder `true`) die Auslösung nach Erreichen des Schwellenwerts normal erfolgt.

### 8. Lokales Build-Artefakt validieren

- Gemäß dem E2E-Testing-Skill die Headless-JSON-Ausgabe verwenden:
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`.
- Bei Bedarf `--openai-logging --openai-logging-dir <tmp-dir>` hinzufügen, um das Tool-Schema, den Prompt und die Berechtigungskonfiguration im Request-Body zu prüfen.
- Für Szenarien, die den TUI- oder sessionEnd-Zustand betreffen, den Ablauf mit tmux interaktiv erfassen und die endgültige Ausgabe festhalten.

## Beziehung zum bestehenden System

```
Bestehender MemoryManager
  ├─ scheduleExtract()       ← Unverändert
  ├─ scheduleDream()         ← Unverändert
  ├─ recall()                ← Unverändert
  ├─ forget()                ← Unverändert
  └─ scheduleSkillReview()   ← Neu (dieses Dokument)

Bestehender SkillManager
  ├─ listSkills()            ← Unverändert (entdeckt automatisch neue Dateien unter .qwen/skills/)
  └─ loadSkill()             ← Unverändert

Bestehende Datei-Tools (read_file / write_file / edit)
  ├─ In der Hauptsitzung: Nutzer können Skills manuell mit diesen Tools verwalten
  │   └─ Schreiboperationen unter .qwen/skills/ → skillsModifiedInSession = true
  └─ Im Skill-Review-Agent: Direkt zum Erstellen/Aktualisieren von Auto-Skills verwendet
      └─ Permission-Manager schränkt Pfade ein + prüft source: auto-skill

Auslösepunkt (bestehender sessionEnd-Hook)
  └─ Gleichzeitiger Aufruf von scheduleExtract + scheduleSkillReview (bei erfüllter Bedingung)
```

Die Lese-Seite des SkillManagers (`listSkills`, `loadSkill`) muss überhaupt nicht geändert werden – nachdem der Review-Agent in `${projectRoot}/.qwen/skills/` geschrieben hat, erkennt `SkillManager` die Änderungen automatisch über den bestehenden `chokidar`-Dateiüberwachungsmechanismus, ruft `notifyChangeListeners()` auf, um den Cache zu aktualisieren, und das neue Skill wird in der nächsten Konversation natürlich im System-Prompt sichtbar sein.