# AutoSkill: Entwurfsdokument für das automatische Skill-Extraktionssystem

## Übersicht

Dieses Dokument beschreibt das Design, um dem bestehenden Memory-Dream-Architektur von QwenCode die **AutoSkill**-Fähigkeit hinzuzufügen.

AutoSkill ist ein **automatischer Extraktionsmechanismus für prozedurales Gedächtnis**: Nachdem ein Agent eine werkzeugaufrufintensive Aufgabe abgeschlossen hat, bewertet das System im Hintergrund leise, ob in diesem Gespräch wiederverwendbare Arbeitsabläufe vorhanden sind, und speichert sie automatisch als projektweites Skill.

### Abgrenzung zu Memory Extract

| Dimension        | Memory Extract                                     | AutoSkill                                            |
| ---------------- | -------------------------------------------------- | ---------------------------------------------------- |
| **Gedächtnistyp**  | Deklaratives Gedächtnis (wer der Benutzer ist, Projektkontext) | Prozedurales Gedächtnis (wie man eine bestimmte Aufgabe erledigt) |
| **Auslösezeitpunkt** | Nach jeder Sitzung                                 | Wenn die Anzahl der Werkzeugaufrufe in der Sitzung einen Schwellwert erreicht |
| **Zielpfad**       | `${projectRoot}/.qwen/memory/`                     | `${projectRoot}/.qwen/skills/`                       |
| **Inhalt**         | Benutzerpräferenzen, Projektkontext, Feedback-Regeln | Wiederverwendbare Arbeitsschritte, Best Practices    |
| **Lebenszyklus**   | Dream integriert/schneidet regelmäßig              | Wird nach Bedarf aktualisiert, vom Review-Agent gewartet |

---

## Grundlegende Designprinzipien

1. **Kein dediziertes Schreibwerkzeug**: Der Skill-Review-Agent verwendet direkt die universellen Werkzeuge `read_file`, `write_file`, `edit`, um auf `.qwen/skills/` zuzugreifen, ohne ein eigenes `skill_manage`-Werkzeug einzuführen. Gleiches gilt für die Hauptsitzung – wenn der Benutzer Skills manuell verwalten möchte, verwendet er dieselben universellen Werkzeuge.
2. **Erkennung von Skill-Änderungen ersetzt Tool-Zählungsrücksetzung**: In Anlehnung an die Erkennung von `memory_tool`-Aufrufen bei Memory Extract erkennt das System, ob in der Hauptsitzung Schreibvorgänge im Verzeichnis `.qwen/skills/` stattgefunden haben. Wenn ja, hat der Benutzer in dieser Runde bereits aktiv Skills bearbeitet, und die automatische Skill-Überprüfung wird am Ende der Sitzung übersprungen.
3. **`auto-skill`-Kennzeichnung schützt benutzererstellte Skills**: Ein vom Review-Agent erstellter Skill muss im YAML-Frontmatter die Markierung `source: auto-skill` enthalten. Der Skill-Review-Agent darf nur Skills mit dieser Markierung ändern und nicht die manuell vom Benutzer erstellten Skills berühren.
4. **Auslöser durch Werkzeugaufrufdichte**: Wird nur ausgelöst, wenn die kumulierte Anzahl der Werkzeugaufrufe in dieser Sitzung ≥ 20 beträgt, um sicherzustellen, dass nur nach wirklich komplexen Aufgaben extrahiert wird.
5. **Klare Schreibschutzgrenzen**: Der Berechtigungsmanager des Review-Agents beschränkt `write_file` und `edit` auf `${projectRoot}/.qwen/skills/` und darf nicht auf die Benutzer-/Erweiterungs-/gebündelten Ebenen zugreifen.
6. **Maximale Beibehaltung des Hermes-Kern-Prompts**: Der vom Review-Agent verwendete Prompt wird direkt von Hermes' `_SKILL_REVIEW_PROMPT` übernommen, nur mit minimalen Anpassungen.

---

## Architekturänderungen

### 1. Zähler: `toolCallCount` und Erkennung von Skill-Änderungen

Im Sitzungszustand werden zwei parallele Verfolgungsgrößen verwaltet:

**Werkzeugaufrufzähler** (entscheidet, ob eine Skill-Überprüfung ausgelöst wird):

```
会话启动
  toolCallCount = 0

每次工具调用完成
  toolCallCount += 1

会话结束
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // 默认 20
    检查 skillsModifiedInSession
    ├─ true  → skip（本轮已手动操作 skill，无需自动 review）
    └─ false → scheduleSkillReview()
```

**Erkennung von Skill-Änderungen** (ersetzt das Zurücksetzen des `skill_manage`-Aufrufs):

```
每次工具调用完成
  if (工具调用的目标路径在 ${projectRoot}/.qwen/skills/ 下):
    skillsModifiedInSession = true
```

Erkennungslogik: Durchläuft die von den Werkzeugaufrufen betroffenen Dateipfade und prüft, ob sie im Skills-Verzeichnis liegen. Konkrete Implementierung analog zum Muster von `historyCallsSkillManage()` – durchläuft die Werkzeugergebnisse im Verlauf, extrahiert die Zielpfade von `write_file`, `edit` usw. und führt einen Präfixabgleich durch.

> **Warum Erkennung von Skill-Änderungen anstelle von Werkzeugnamenserkennung?**
> Es gibt kein spezielles `skill_manage`-Werkzeug mehr; sowohl die Hauptsitzung als auch der Review-Agent verwenden die universellen `write_file`/`edit`. Daher wechselt die Erkennungsdimension von "wurde ein bestimmtes Werkzeug aufgerufen" zu "gab es einen Schreibvorgang im Verzeichnis `.qwen/skills/`". Das ist semantisch genauer: Sobald der Benutzer in dieser Runde aktiv eine Skill-Datei bearbeitet hat, wird die automatische Überprüfung übersprungen.

> **Warum Werkzeugaufrufanzahl anstelle von Gesprächsrunden?**
> Die Anzahl der Werkzeugaufrufe spiegelt die Aufgabenkomplexität wider – eine einzige Benutzernachricht kann 1 oder 30 Werkzeugaufrufe auslösen. Eine hohe Werkzeugdichte bedeutet mehr Versuche und Strategieanpassungen, was die Wahrscheinlichkeit für wiederverwendbare Erfahrungen erhöht. Der Schwellwert von 20 ist konservativer als Hermes' 10, da QwenCode-Werkzeugaufrufe in der Regel feingranularer sind (z. B. zeilenweises Editieren).

### 2. Auslösepunkt

Der bestehende `MemoryManager`-Aufrufpunkt (Sitzungsende) dient als einheitlicher Einstiegspunkt und wird erweitert, um gleichzeitig Skill-Reviews auszulösen.

```
会话结束
  ├─ scheduleExtract(params)           // 现有逻辑不变
  └─ scheduleSkillReview(params)       // 新增
       条件：toolCallCount >= AUTO_SKILL_THRESHOLD
             && !skillsModifiedInSession
```

Extract und Skill-Review werden jeweils unabhängig ausgelöst und über `MemoryManager.track()` parallel ausgeführt, ohne sich gegenseitig zu blockieren.

### 3. Tool-Zugriffsberechtigungen des Skill-Review-Agents

Der Skill-Review-Agent **verwendet nicht** das spezielle `skill_manage`-Werkzeug, sondern direkt die universellen Dateiwerkzeuge:

| Werkzeug      | Zweck                                   | Bereichsbeschränkung                                                                        |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `read_file`   | Liest vorhandenen Skill-Inhalt, prüft Frontmatter | Keine Einschränkung                                                                         |
| `ls`          | Durchsucht die Verzeichnisstruktur von `.qwen/skills/` | Keine Einschränkung                                                                         |
| `write_file`  | Erstellt neue Skill-Dateien             | Nur innerhalb von `${projectRoot}/.qwen/skills/`                                            |
| `edit`        | Ändert vorhandene Skill-Inhalte         | Nur innerhalb von `${projectRoot}/.qwen/skills/` und nur bei Dateien mit `source: auto-skill` |
| `shell`       | Nur-Lese-Befehle (z. B. `cat`, `find`)  | Nur Nur-Lese-Befehle erlaubt (statische Shell-AST-Analyse)                                  |

**Zusätzliche Einschränkung für `edit` (Schutz von `auto-skill`)**:

Der Berechtigungsmanager des Skill-Review-Agents liest vor der Ausführung von `edit` oder `write_file` (Überschreiben vorhandener Dateien) das YAML-Frontmatter der Zieldatei und prüft das Feld `source: auto-skill`. Wenn das Feld fehlt, wird der Schreibvorgang verweigert und ein Fehler zurückgegeben:

```
skill_review_agent: edit is only allowed on skills with 'source: auto-skill' in frontmatter.
This skill appears to be user-created. Modify it manually or ask the user.
```

Diese Prüfung wird auf der Berechtigungsebene von `createSkillScopedAgentConfig` implementiert, nicht nur über den System-Prompt, um sicherzustellen, dass auch bei Modellfehlern keine manuell erstellten Skills überschrieben werden.

**Werkzeugzugriff in der Hauptsitzung**: Der Haupt-Agent unterliegt keinen Einschränkungen beim Lesen und Schreiben von `.qwen/skills/` – der Benutzer kann Skills über normale `write_file`/`edit`-Befehle verwalten. Solche Aktionen setzen `skillsModifiedInSession = true`, sodass am Ende der Sitzung keine automatische Skill-Überprüfung ausgelöst wird.

### 4. Berechtigungssandbox: `SkillScopedPermissionManager`

Analog zu `createMemoryScopedAgentConfig` in `extractionAgentPlanner.ts` wird ein spezieller Berechtigungsbereich für den Skill-Review-Agent erstellt:

```typescript
// skill review agent 允许的操作
read_file:    无路径限制（需要读取任意文件来了解项目上下文）
ls:           无路径限制
shell:        只读命令（Shell AST 静态分析，复用现有 isShellCommandReadOnlyAST）
write_file:   仅限 ${projectRoot}/.qwen/skills/ 路径下的文件（创建新 skill）
edit:         仅限 ${projectRoot}/.qwen/skills/ 内，且目标文件含 source: auto-skill
```

**Implementierungsebenen des `auto-skill`-Schutzes**:

1. **Berechtigungsmanager-Ebene** (harte Einschränkung): Vor `edit` wird das Frontmatter gelesen; fehlt `source: auto-skill`, wird der Vorgang abgelehnt.
2. **System-Prompt-Ebene** (weiche Einschränkung): Der Agent wird explizit angewiesen, nur Skills mit der Markierung `source: auto-skill` zu ändern.
3. **Doppelte Absicherung**: Selbst wenn die Einschränkung im System-Prompt umgangen wird, greift der Berechtigungsmanager.
---

## Skill Review Agent Design

### Auslöser-Prompt (portiert von Hermes, minimal angepasst)

```
Überprüfe die obige Konversation und erwäge, ein Skill zu speichern oder zu aktualisieren, falls angemessen.

Konzentriere dich auf: Wurde ein nicht-trivialer Ansatz verwendet, um eine Aufgabe zu erledigen, die Versuch
und Irrtum erforderte, oder eine Kursänderung aufgrund von Erfahrungen während des Vorgehens, oder erwartete
der Benutzer eine andere Methode oder ein anderes Ergebnis? Falls ein relevanter Skill bereits existiert und
'source: auto-skill' in seinem Frontmatter hat, aktualisiere ihn mit dem Gelernten. Erstelle andernfalls einen
neuen Skill, falls der Ansatz wiederverwendbar ist.

WICHTIGE Einschränkungen:
- Du darfst NUR Skill-Dateien ändern, die 'source: auto-skill' in ihrem YAML-Frontmatter enthalten. Lese
  immer eine Skill-Datei, bevor du sie bearbeitest.
- Bearbeite KEINE Skills, die diese Markierung nicht haben – sie wurden vom Benutzer erstellt.
- Beim Erstellen eines neuen Skills MUSST du 'source: auto-skill' im Frontmatter angeben, damit zukünftige
  Review-Agenten ihn sicher aktualisieren können.
- Lösche KEINEN Skill. Nur erstellen oder aktualisieren.

Wenn nichts speicherwürdig ist, sage einfach 'Nothing to save.' und stoppe.

Skills werden im aktuellen Projekt (.qwen/skills/) gespeichert.
Verwende write_file, um einen neuen Skill zu erstellen, und edit, um einen bestehenden Auto-Skill zu aktualisieren.
Jeder Skill liegt unter .qwen/skills/<name>/SKILL.md mit YAML-Frontmatter:

---
name: <skill-name>
description: <einzeilige Beschreibung>
metadata:
  source: auto-skill
  extracted_at: '<ISO-8601-Zeitstempel>'
---

<Markdown-Text mit dem Verfahren/Ansatz>
```

### Agent-Konfiguration

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // Vorhandenen Skill-Inhalt lesen, source: auto-skill prüfen
    "ls",          // .qwen/skills/ Verzeichnis durchsuchen
    "write_file",  // Neue Skill-Datei erstellen (Permission Manager schränkt Pfad ein)
    "edit",        // Vorhandenen Auto-Skill ändern (Permission Manager prüft Frontmatter)
    "shell",       // Nur-Lese-Befehle (z.B. find, cat)
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // Vollständigen Konversationsverlauf als Snapshot übergeben
}
```

---

## Integration mit dem vorhandenen MemoryManager

### `ScheduleSkillReviewParams` (neuer Typ)

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // Vollständiger Sitzungsverlauf als Snapshot
  toolCallCount: number; // Anzahl der Tool-Aufrufe in dieser Sitzung
  skillsModified: boolean; // Wurden in dieser Sitzung Schreiboperationen unter .qwen/skills/ ausgeführt?
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

  // 2. Schwellwertprüfung
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. Bereits in dieser Sitzung manuell an Skills gearbeitet → automatisches Review überspringen
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. Unabhängig einplanen
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### Erweiterung der Aufgabentypen

```typescript
// Erweitere den bestehenden MemoryTaskRecord.taskType
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// Konstanten
export const AUTO_SKILL_THRESHOLD = 20; // Schwellwert für Anzahl der Tool-Aufrufe
```

---

## Datenfluss

```
Sitzung läuft
  Agent-Hauptschleife
    ├─ Jeder Tool-Aufruf → toolCallCount += 1
    └─ Falls Schreibzielpfad unter ${projectRoot}/.qwen/skills/
         → skillsModifiedInSession = true

Sitzung beendet (sessionEnd-Ereignis)
  ├─ scheduleExtract(params)
  │     └─ [Vorhandene Logik: extraction Agent forken → .qwen/memory/ schreiben]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ Nein → Überspringen (zu wenig Dichte oder bereits manuell Skill bearbeitet)
       └─ Ja → scheduleSkillReview(params)
                 └─ Unabhängigen skill review Agent forken
                        ↓
                 skill review Agent (max 8 Runden, 2 Min, Sandbox-Berechtigungen)
                 Werkzeuge: read_file, ls, write_file, edit, shell
                 Vollständigen sessionHistory übergeben
                        ↓
                 Modell prüft auf wiederverwendbare Methode
                 ├─ Ja → Vorhandenen Skill lesen (source: auto-skill prüfen)
                 │         → write_file erstellt neuen Skill (mit source: auto-skill)
                 │         → edit aktualisiert vorhandenen Auto-Skill
                 │         → SkillManager-Cache ungültig (notifyChangeListeners)
                 └─ Nein → "Nothing to save." beenden

Nächste Sitzung
  SkillManager.listSkills({ level: 'project' })
  → .qwen/skills/ durchsuchen, neu erstellte Skills finden
  → In den System-Prompt einfügen als <available_skills>-Block (Tier 1)
```

---

## SKILL.md-Formatkonvention (project-level)

Automatisch extrahierte Skills werden unter `${projectRoot}/.qwen/skills/<name>/SKILL.md` gespeichert, vollständig kompatibel mit dem bestehenden SkillManager:

```yaml
---
name: <skill-name> # Pflicht, Kleinbuchstaben + Bindestrich
description: <description> # Pflicht, ≤ 1024 Zeichen
version: 1.0.0
metadata:
  source: auto-skill # Pflicht (wird vom Review-Agent beim Erstellen erzwungen)
  extracted_at: '2026-04-24T12:00:00Z'
---
# <Skill-Titel>

<Vorgehensschritte / Best Practices / Hinweise>
```
**`source: auto-skill` 的约束语义**：

| Markierungswert | Erstellt von | Kann vom Skill-Review-Agent geändert werden? | Kann vom Benutzer geändert werden? |
| --------------- | ------------ | -------------------------------------------- | ----------------------------------- |
| `auto-skill`    | Review-Agent | ✅ Ja                                        | ✅ Ja                               |
| Kein Feld       | Manuell vom Benutzer | ❌ Nein (wird vom Berechtigungsmanager abgefangen) | ✅ Ja                               |

Wenn ein Benutzer seinem selbst erstellten Skill auch `source: auto-skill` hinzufügt, erlaubt er dem Review-Agenten, diesen in Zukunft automatisch zu aktualisieren.

---

## Sicherheitsaspekte

| Risiko                                                 | Gegenmaßnahme                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatische Extraktion überschreibt sorgfältig erstellte Skills | Der Berechtigungsmanager liest das Frontmatter; ohne `source: auto-skill` wird `edit` verweigert; das System-Prompt stellt ebenfalls klar, dass nur `auto-skill` geändert werden darf |
| Unbegrenztes Wachstum der Skills                       | Das Review-Prompt fordert explizit „vorhandene Skills priorisieren"; Aktualisieren vorhandener Skills hat Vorrang vor Neuanlage                                      |
| Schreiben außerhalb des Projektpfads                   | `write_file`/`edit`-Berechtigungen auf `${projectRoot}/.qwen/skills/` beschränkt; `assertRealProjectSkillPath` verhindert Symlink-Ausbrüche                           |
| Extrahieren von Inhalten mit Injektionsrisiken         | Vorhandene Logik zur Sicherheitsprüfung von Inhalten wird wiederverwendet                                                                                            |
| Review-Agent löscht Skills                             | Der Werkzeugsatz des Review-Agenten enthält keine Löschoperationen (kein `rm`, keine `shell`-Schreiboperationen); das System-Prompt verbietet Löschen explizit        |
| Hauptsitzung bearbeitet Skills, trotzdem Review       | `skillsModifiedInSession`-Prüfung: Wenn die Hauptsitzung Schreiboperationen unter `.qwen/skills/` hatte, wird das Review übersprungen                                |
| Symlink-Ausbruch – Schreiben in Dateien außerhalb des Skills-Verzeichnisses | `assertRealProjectSkillPath` (async): Löst den tatsächlichen Pfad mittels `fs.realpath()` auf und erlaubt Schreiben nur, wenn er innerhalb des echten Skills-Roots liegt |

---

## Konfiguration

In der QwenCode-Konfiguration werden folgende neue Optionen hinzugefügt (optional, mit Standardwerten):

```typescript
// config schema neu (unter memory)
memory?: {
  enableAutoSkill?: boolean;   // Standard true
}
```

Konfigurationsbeispiel für QWEN.md / `~/.qwen/config.json`:

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## E2E-Test-Checkliste

Nach der Funktionsimplementierung gemäß dem Workflow in `.qwen/skills/e2e-testing/SKILL.md` zuerst `npm run build && npm run bundle` ausführen, dann mit dem lokal erstellten Build-Artefakt `node dist/cli.js` einen End-to-End-Test durchführen.

### 1. Geringe Werkzeugaufrufdichte löst nicht aus

- In einem temporären Projektverzeichnis im Headless-Modus ausführen.
- `memory.enableAutoSkill: true` konfigurieren.
- Eine einfache Aufgabe ausführen, die nur wenige Werkzeugaufrufe erfordert, und die Sitzung normal beenden.
- Behaupten: Unter `.qwen/skills/` wurde kein Skill mit `source: auto-skill` neu erstellt; im JSON-Stream sollten keine Schreiboperationen auf `.qwen/skills/` vorkommen.

### 2. Überschreitung des Schwellenwerts löst Skill-Review aus

- Im temporären Projektverzeichnis im Headless-Modus ausführen (`AUTO_SKILL_THRESHOLD` ist auf 20 hardcodiert; kann in Test-Fixtures gesenkt werden).
- Eine Aufgabe senden, die mehrere Werkzeugaufrufe erfordert und einen wiederverwendbaren Ablauf enthält.
- Behaupten: Nach der Sitzung wird ein Skill-Review ausgelöst; falls das Modell entscheidet, dass es sich lohnt, wird `.qwen/skills/<name>/SKILL.md` erstellt, dessen Frontmatter `source: auto-skill` enthält.
- Falls das Modell `Nothing to save.` feststellt, behaupten, dass der Ablauf normal endet und keine Berechtigungsfehler auftreten.

### 3. Hauptsitzung bearbeitet Skill – Review wird übersprungen

- Eine Sitzung konstruieren, in der parallel zum Erreichen der Werkzeugaufruf-Schwelle durch `write_file` oder `edit` eine Datei unter `.qwen/skills/` geschrieben wird (simuliert manuelle Skill-Verwaltung durch den Benutzer).
- Behaupten: Am Sitzungsende ist `skillsModifiedInSession = true`, `scheduleSkillReview` gibt `skippedReason: 'skills_modified_in_session'` zurück.
- Behaupten: Der Review-Agent wird nicht gestartet, um doppeltes Schreiben zu vermeiden.

### 4. Schreibschutz erlaubt nur projektbezogene Skills

- Der Skill-Review-Agent versucht, außerhalb des Projektpfads, in den user-level Skill-Pfad oder in den bundled Skill-Pfad zu schreiben.
- Behaupten: Die Schreiboperation wird abgelehnt, die Fehlermeldung verweist darauf, dass nur in `${projectRoot}/.qwen/skills/` geschrieben werden darf.
- Behaupten: Schreiben in `${projectRoot}/.qwen/skills/<name>/SKILL.md` ist erlaubt.

### 5. `auto-skill`-Markierung schützt benutzererstellte Skills

- Unter `.qwen/skills/` einen benutzererstellten Skill ohne `source: auto-skill` platzieren.
- Skill-Review-Agent auslösen und das Modell anleiten, diesen Skill zu ändern.
- Behaupten: Die Schreiboperation wird vom Berechtigungsmanager abgelehnt, die Fehlermeldung besagt, dass der Skill kein `auto-skill` ist.
- Behaupten: Ein Skill mit `source: auto-skill` im selben Verzeichnis kann normal aktualisiert werden.

### 6. Symlink-Ausbruch wird abgelehnt

- Unter `.qwen/skills/` einen Symlink erstellen, der auf ein Verzeichnis außerhalb des Projekts zeigt.
- Skill-Review-Agent auslösen und versuchen, in diesen Symlink-Pfad zu schreiben.
- Behaupten: `assertRealProjectSkillPath` lehnt das Schreiben ab und gibt einen Fehler `symlink traversal detected` zurück.

### 7. Konfigurationsschalter wirkt

- `memory.enableAutoSkill: false` konfigurieren – auch wenn die Anzahl der Werkzeugaufrufe den Schwellenwert überschreitet, wird kein Review ausgelöst.
- Überprüfen, dass bei aktiviertem Standard (`enableAutoSkill` nicht konfiguriert oder `true`) das Review beim Erreichen des Schwellenwerts normal ausgelöst wird.

### 8. Überprüfung mit lokalem Build-Artefakt

- Gemäß dem e2e-testing-Skill mit Headless-JSON-Ausgabe: `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`.
- Bei Bedarf `--openai-logging --openai-logging-dir <tmp-dir>` hinzufügen, um die Werkzeug-Schemas, Prompts und Berechtigungskonfiguration im Request-Body zu prüfen.
- Für Szenarien, die den TUI- oder sessionEnd-Status betreffen, einen tmux-interaktiven Workflow verwenden, um die finale Ausgabe zu erfassen.

## Beziehung zum bestehenden System

```
Vorhandener MemoryManager
  ├─ scheduleExtract()       ← unverändert
  ├─ scheduleDream()         ← unverändert
  ├─ recall()                ← unverändert
  ├─ forget()                ← unverändert
  └─ scheduleSkillReview()   ← neu (dieses Dokument)

Vorhandener SkillManager
  ├─ listSkills()            ← unverändert (erkennt automatisch neue Dateien unter .qwen/skills/)
  └─ loadSkill()             ← unverändert

Vorhandene Dateiwerkzeuge (read_file / write_file / edit)
  ├─ In Hauptsitzung: Benutzer können Skills manuell mit diesen Werkzeugen verwalten
  │   └─ Schreiboperation unter .qwen/skills/ → skillsModifiedInSession = true
  └─ Im Skill-Review-Agent: Direkt zum Erstellen/Aktualisieren von auto-skills
      └─ Berechtigungsmanager schränkt Pfad ein + prüft source: auto-skill

Auslöser (vorhandener sessionEnd-Hook)
  └─ Ruft gleichzeitig scheduleExtract + scheduleSkillReview auf (wenn Bedingungen erfüllt)
```

Die Leseseite des SkillManagers (`listSkills`, `loadSkill`) muss nicht geändert werden – nachdem der Review-Agent in `${projectRoot}/.qwen/skills/` geschrieben hat, erkennt `SkillManager` die Änderung automatisch über den vorhandenen `chokidar`-Dateiüberwachungsmechanismus, ruft `notifyChangeListeners()` auf, löst einen Cache-Refresh aus, und in der nächsten Konversation wird der neue Skill selbstverständlich im System-Prompt sichtbar.
