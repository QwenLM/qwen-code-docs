# Memory 记忆管理系统

> Dieser Artikel beschreibt den Mechanismus des **Managed Auto-Memory** (verwaltetes automatisches Gedächtnis) in Qwen Code, seine Auslöser und Implementierungsdetails.

---

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Speicherstruktur](#speicherstruktur)
3. [Speichertypen](#speichertypen)
4. [Format der Speichereinträge](#format-der-speichereinträge)
5. [Lebenszyklus](#lebenszyklus)
6. [Extract — Extraktion](#extract--extraktion)
7. [Dream — Konsolidierung](#dream--konsolidierung)
8. [Recall — Abruf](#recall--abruf)
9. [Forget — Vergessen](#forget--vergessen)
10. [Index-Neuerstellung](#index-neuerstellung)
11. [Telemetrie-Ereignisse](#telemetrie-ereignisse)

---

## Übersicht

Managed Auto-Memory ist ein System zur persistenten Speicherung von Benutzerwissen, das während KI-Konversationen **automatisch** gesammelt, konsolidiert und abgerufen wird. Es erhält den Lebenszyklus des Gedächtnisses durch vier Kernoperationen:

| Operation | Englisch | Auslöser                        | Wirkung                                                     |
| --------- | -------- | ------------------------------- | ----------------------------------------------------------- |
| Extrahieren | Extract  | Automatisch (nach jeder Runde)  | Extrahiert neues Wissen aus dem Dialog und schreibt es in Speicherdateien |
| Konsolidieren | Dream    | Automatisch (periodischer Hintergrundtask) | Dedupliziert und konsolidiert Speicherdateien, hält sie sauber |
| Abrufen   | Recall   | Automatisch (vor jeder Runde)   | Ruft relevantes Gedächtnis zur aktuellen Anfrage ab und injiziert es in den System-Prompt |
| Vergessen | Forget   | Manuell (Benutzerbefehl `/forget`) | Löscht gezielt bestimmte Speichereinträge                    |

---

## Speicherstruktur

### Verzeichnisstruktur

```
~/.qwen/                                      ← Globales Basisverzeichnis (Standard)
└── projects/
    └── <sanitized-git-root>/                 ← Projekt-ID (basierend auf Git-Root-Pfad)
        ├── meta.json                         ← Metadaten (Zeitstempel für Extract/Dream, Status)
        ├── extract-cursor.json               ← Extract-Cursor (bereits verarbeiteter Dialog-Offset)
        ├── consolidation.lock                ← Mutex für Dream-Prozess
        └── memory/                           ← Hauptverzeichnis für Speicher
            ├── MEMORY.md                     ← Indexdatei (automatisch generiert, fasst alle Einträge zusammen)
            ├── user.md                       ← Benutzerpräferenz-Gedächtnis (Beispiel)
            ├── feedback.md                   ← Feedback-Regel-Gedächtnis (Beispiel)
            ├── project/
            │   └── milestone.md              ← Projekt-Gedächtnis (unterstützt Unterverzeichnisse)
            └── reference/
                └── grafana.md                ← Externes Ressourcen-Gedächtnis
```

> **Umgebungsvariablen-Override**:
>
> - `QWEN_CODE_MEMORY_BASE_DIR`: Ersetzt das globale Basisverzeichnis
> - `QWEN_CODE_MEMORY_LOCAL=1`: Nutzt projektspezifischen Pfad `.qwen/memory/`

### Wichtige Dateien

| Datei                 | Beschreibung                                                                 |
| --------------------- | ---------------------------------------------------------------------------- |
| `meta.json`           | Zeichnet Zeitstempel, Sitzungs-ID, beteiligte Speichertypen und Ausführungsstatus des letzten Extract / Dream auf |
| `extract-cursor.json` | Zeichnet den aktuellen Offset im Dialogverlauf auf, um Doppelextraktion zu vermeiden |
| `consolidation.lock`  | Dateisperre während Dream, Inhalt ist PID des Halters, verfällt nach 1 Stunde automatisch |
| `MEMORY.md`           | Index aller Themen-Dateien, wird nach jedem Extract/Dream neu erstellt, Format: Markdown-Liste |

---

## Speichertypen

Das System unterstützt vier integrierte Speichertypen, die jeweils eine andere Informationsdimension abdecken:

| Typ         | Speicherinhalt                                           | Wann geschrieben                         | Wann gelesen                          |
| ----------- | -------------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| `user`      | Rolle des Benutzers, Fähigkeiten, Arbeitsgewohnheiten    | Wenn Benutzerrolle/-präferenz/-hintergrund bekannt wird | Wenn Antwort an Benutzerkontext angepasst werden muss |
| `feedback`  | Leitlinien des Benutzers für KI-Verhalten: was vermeiden/was fortsetzen | Wenn Benutzer KI korrigiert oder nicht offensichtliche Handlung bestätigt | Wenn KI-Verhalten beeinflusst wird     |
| `project`   | Projektfortschritt, Ziele, Entscheidungen, Fristen, Bug-Tracking | Wenn bekannt wird: wer macht was, warum, bis wann | Wenn KI Arbeitskontext und Motivation verstehen muss |
| `reference` | Zeiger auf externe Systemressourcen (Dashboard, Ticketsystem, Slack-Channel etc.) | Wenn eine externe Ressource und ihr Zweck bekannt wird | Wenn Benutzer externes System oder relevante Info erwähnt |

**Nicht in das Gedächtnis aufnehmen**: Codestile/-konventionen, Git-Historie, Debugging-Lösungen, temporäre Aufgabenstatus, bereits in QWEN.md/AGENTS.md dokumentierte Inhalte.

---

## Format der Speichereinträge

Jede Themen-Datei verwendet das Format **YAML-Frontmatter + Markdown-Body**:

```markdown
---
name: Name des Gedächtnisses
description: Ein-Satz-Beschreibung (für Relevanzabruf, möglichst konkret)
type: user|feedback|project|reference
---

Hauptinhalt des Gedächtnisses (Zusammenfassungszeile)

Why: Grund (damit KI Randfälle versteht und nicht blind Regel befolgt)
How to apply: Anwendungsszenarien und Nutzungsweise
```

Bei den Typen `feedback` und `project` wird dringend empfohlen, `Why` und `How to apply` auszufüllen, damit das Gedächtnis auch in Grenzfällen korrekt angewendet wird.

---

## Lebenszyklus

```mermaid
flowchart TD
    A([Benutzer sendet Anfrage]) --> B

    subgraph "Recall — Abruf"
        B[Alle Themen-Dateien scannen] --> C{Anzahl Dokumente und\nAbfrageinhalt gültig?}
        C -- Nein --> D[Leeren Prompt zurückgeben\nstrategy: none]
        C -- Ja --> E{Ist Config konfiguriert?}
        E -- Ja --> F[Modellgesteuerte Auswahl\nside query]
        F --> G{Relevante Dokumente gefunden?}
        G -- Ja --> H[strategy: model]
        G -- Nein --> I[strategy: none]
        E -- Nein --> J[Heuristische Keyword-Bewertung]
        F -- Fehler --> J
        J --> K{Dokumente mit Score > 0?}
        K -- Ja --> L[strategy: heuristic]
        K -- Nein --> I
        H --> M[Relevant Memory Prompt erstellen\nSystem-Prompt injizieren]
        L --> M
        I --> N[Kein Gedächtnis injizieren]
    end

    M --> O([KI verarbeitet Anfrage])
    N --> O
    D --> O

    O --> P([KI sendet Antwort])

    subgraph "Extract — Extraktion (Hintergrund)"
        P --> Q{Hat die KI in dieser Runde\n direkt eine Speicherdatei geschrieben?}
        Q -- Ja --> R[Überspringen\nmemory_tool]
        Q -- Nein --> S{Läuft Extraktionsaufgabe\nbereits?}
        S -- Ja --> T[In Warteschlange oder überspringen\nalready_running / queued]
        S -- Nein --> U[Ungesendete Dialogausschnitte laden\nbasierend auf extract cursor]
        U --> V[Extraktions-Agent aufrufen\nrunAutoMemoryExtractionByAgent]
        V --> W[Patches deduplizieren und normalisieren]
        W --> X{Gibt es touched topics?}
        X -- Ja --> Y[meta.json aktualisieren\nMEMORY.md Index neu erstellen]
        X -- Nein --> Z[Nur extract cursor aktualisieren]
        Y --> Z
    end

    subgraph "Dream — Konsolidierung (Hintergrund, periodisch)"
        P --> AA{Dream-Scheduler-Prüfung}
        AA --> AB{Gleiche Sitzung?}
        AB -- Ja --> AC[Überspringen\nsame_session]
        AB -- Nein --> AD{Seit letztem Dream\n≥ 24 Stunden?}
        AD -- Nein --> AE[Überspringen\nmin_hours]
        AD -- Ja --> AF{Anzahl neuer Sitzungen\nseit letztem Dream ≥ 5?}
        AF -- Nein --> AG[Überspringen\nmin_sessions]
        AF -- Ja --> AH{consolidation.lock\nvorhanden?}
        AH -- Ja --> AI[Überspringen\nlocked]
        AH -- Nein --> AJ[Sperre holen\nPID schreiben]
        AJ --> AK{Ist Config konfiguriert?}
        AK -- Ja --> AL[Agent-Pfad\nplanManagedAutoMemoryDreamByAgent]
        AL --> AM{Hat Agent Dateien berührt?}
        AM -- Ja --> AN[Berührte topics notieren]
        AM -- "Nein/Fehler" --> AO
        AK -- Nein --> AO[Mechanischer Deduplizierungspfad\nParsen+Deduplizieren+alphabetisch sortieren]
        AO --> AP[Aktualisierte Themen-Dateien zurückschreiben]
        AN --> AQ[MEMORY.md Index neu erstellen\nmeta.json aktualisieren]
        AP --> AQ
        AQ --> AR[Sperre freigeben]
    end
```
## Extract – Extraktion

### Auslösezeitpunkt

Wird jedes Mal automatisch durch `scheduleAutoMemoryExtract` ausgelöst (im Hintergrund, nicht blockierend), nachdem die KI eine Antwortrunde abgeschlossen hat.

### Planungslogik (`extractScheduler.ts`)

```mermaid
flowchart TD
    A[scheduleAutoMemoryExtract 被调用] --> B{本轮历史记录中\n是否有写记忆文件的工具调用?}
    B -- 是 --> C[登记 skipped 任务\n原因: memory_tool]
    B -- 否 --> D{isExtractRunning?}
    D -- 是 --> E{是否已有 queued 请求?}
    E -- 是 --> F[更新 queued 请求的\nhistory 参数]
    E -- 否 --> G[注册 pending 任务\n放入 queue]
    D -- 否 --> H[注册 running 任务\n调用 runTask]
    H --> I[markExtractRunning\nsetCurrentTaskId]
    I --> J[runAutoMemoryExtract]
    J --> K[任务完成]
    K --> L[clearExtractRunning\n检查 queue → startQueuedIfNeeded]
    F --> M[返回 skipped: queued]
    G --> M
    C --> N[返回 skipped: memory_tool]
```

**Grund für Überspringen**:

| Grund             | Bedeutung                                        |
| ----------------- | ------------------------------------------------ |
| `memory_tool`     | Haupt‑Agent hat in dieser Runde direkt Gedächtnisdatei geschrieben, Überspringen zur Vermeidung von Konflikten |
| `already_running` | Extraktion läuft bereits und kann nicht eingereiht werden |
| `queued`          | Extraktion läuft bereits, diese Anfrage wurde in die Warteschlange gestellt |

### Kern‑Extraktionsablauf (`extract.ts`)

```mermaid
flowchart TD
    A[runAutoMemoryExtract] --> B[ensureAutoMemoryScaffold\n初始化目录和文件]
    B --> C[readExtractCursor\n读取上次处理到的位置]
    C --> D[history.slice startOffset\n只取未处理的消息切片]
    D --> E{slice 有新的 user 消息?}
    E -- 否 --> F[更新 cursor\n返回无 patches 结果]
    E -- 是 --> G[runAutoMemoryExtractionByAgent\n调用 forked agent 提取]
    G --> H{有 touched topics?}
    H -- 是 --> I[bumpMetadata\n更新 meta.json]
    I --> J[rebuildManagedAutoMemoryIndex\n重建 MEMORY.md]
    J --> K[writeExtractCursor\n记录最新 offset = history.length]
    H -- 否 --> K
    K --> L[返回 AutoMemoryExtractResult]
```

> **Hinweis:** Das `isUnderMemoryPressure`‑Gate befindet sich in `MemoryManager.runExtract()`, nicht in diesem Ablauf. Wenn der Monitor einen harten/kritischen Druck meldet, überspringt `MemoryManager` den Extract‑Aufruf und verschiebt den Cursor nicht.

**Extraktions‑Cursor**:

- Felder: `{ sessionId, processedOffset, updatedAt }`
- Vor der Extraktion wird der aktuelle Fortschritt via `readExtractCursor` gelesen, dann wird mit `history.slice(processedOffset)` nur der ungelesene Teil verarbeitet
- Nach jeder Extraktion wird `processedOffset` auf die aktuelle Historienlänge (`params.history.length`) aktualisiert
- Bei Sessionswechsel (`sessionId` ändert sich) wird wieder bei Offset 0 begonnen
- Hinweis: Es wird nicht mehr `buildTranscriptMessages` / `loadUnprocessedTranscriptSlice` verwendet – `hasNewUserMessages` wird durch `history.slice(startOffset).some(m => m.role === 'user' && partToString(m.parts).trim().length > 0)` ermittelt, nur auf dem un‑gelesenen Slice wird eine leichte Stringifikation durchgeführt, die gesamte Historie wird nicht mehr verarbeitet

**Patch‑Filterregeln**:

- Zusammenfassung kürzer als 12 Zeichen → verwerfen
- Zusammenfassung endet mit `?` → verwerfen (Fragesatz)
- Enthält temporäre Schlüsselwörter (today/now/currently/temporary etc.) → verwerfen
- Gleiche `topic:summary`‑Kombination → deduplizieren

---

## Dream – Integration

### Auslösezeitpunkt

Wird automatisch durch `scheduleManagedAutoMemoryDream` ausgelöst (im Hintergrund, nicht blockierend), nachdem die KI eine Antwortrunde abgeschlossen hat. Wird aber von mehreren Gates geschützt und in den meisten Fällen übersprungen.

### Planungs‑Gates (`dreamScheduler.ts`)

```mermaid
flowchart TD
    A[scheduleManagedAutoMemoryDream 被调用] --> B{Dream 功能是否启用?}
    B -- 否 --> C[跳过: disabled]
    B -- 是 --> D[ensureAutoMemoryScaffold\n读取 lastDreamSessionId]
    D --> E{当前 sessionId\n== lastDreamSessionId?}
    E -- 是 --> F[跳过: same_session]
    E -- 否 --> G{elapsedHours ≥ 24h\n或从未 dream?}
    G -- 否 --> H[跳过: min_hours]
    G -- 是 --> I{距上次 session scan\n< 10 分钟?}
    I -- 是 --> J[跳过: min_sessions\n等待下次扫描窗口]
    I -- 否 --> K[扫描 chats/*.jsonl mtime\n统计上次 Dream 后的新会话数]
    K --> L{新会话数 ≥ 5?}
    L -- 否 --> M[跳过: min_sessions]
    L -- 是 --> N{lockExists?\nPID 检查 + 过期检查}
    N -- 是 --> O[跳过: locked]
    N -- 否 --> P{dedupeKey 是否已有\n同项目 Dream 任务?}
    P -- 是 --> Q[跳过: running\n返回已有 taskId]
    P -- 否 --> R[调度后台任务\nBgTaskScheduler]
    R --> S[acquireDreamLock\n写入 PID 到 consolidation.lock]
    S --> T[runManagedAutoMemoryDream]
    T --> U[更新 meta.json\n释放锁]
```

**Gate‑Parameter**:

| Parameter                  | Standardwert | Beschreibung                                           |
| -------------------------- | ------------ | ------------------------------------------------------ |
| `minHoursBetweenDreams`    | 24 Stunden   | Mindestzeitabstand zwischen zwei Dreams                |
| `minSessionsBetweenDreams` | 5 Sessions   | Mindestanzahl neuer Sessions, um einen Dream auszulösen |
| `SESSION_SCAN_INTERVAL_MS` | 10 Minuten   | Drosselintervall für Session‑Datei‑Scans               |
| `DREAM_LOCK_STALE_MS`      | 1 Stunde     | Zeitgrenze, nach der eine Lock‑Datei als veraltet gilt |

**Lock‑Mechanismus**:

- Lock‑Datei liegt unter `<project-state-dir>/consolidation.lock`
- Inhalt ist die PID des haltenden Prozesses
- Bei Prüfung: Wenn der PID‑Prozess nicht mehr existiert (`kill(pid, 0)` schlägt fehl) oder das Lock älter als 1 Stunde ist → als veraltet betrachten, automatisch löschen

### Integrations‑Ausführungsablauf (`dream.ts`)

```mermaid
flowchart TD
    A[runManagedAutoMemoryDream] --> B{是否配置了 Config?}
    B -- 是 --> C[Agent 路径\nplanManagedAutoMemoryDreamByAgent]
    C --> D{Agent 是否修改了文件?}
    D -- 是 --> E[从文件路径推断 touched topics]
    E --> F[bumpMetadata\n重建 MEMORY.md 索引]
    F --> G[updateDreamMetadataResult]
    G --> H[记录遥测事件]
    H --> I[返回结果]
    B -- 否 --> J[机械去重路径]
    C -- 抛出异常 --> J
    D -- 否 --> J

    J --> K[scanAutoMemoryTopicDocuments\n读取所有主题文件]
    K --> L[对每个文件执行 buildDreamedBody]
    L --> M[解析 entries → 按 summary 去重\n按字母升序排序 → 重新渲染]
    M --> N{body 有变化?}
    N -- 是 --> O[写回文件]
    O --> P[记录 touched topic]
    N --> Q[检查跨文件重复\ndedupeKey = type:summary]
    Q --> R{发现重复文件?}
    R -- 是 --> S[合并 entries 到 canonical 文件\n删除重复文件]
    S --> P
    R -- 否 --> T{有 touched topics?}
    P --> T
    T -- 是 --> U[bumpMetadata\n重建 MEMORY.md 索引]
    U --> V[updateDreamMetadataResult\n记录遥测 → 返回结果]
    T -- 否 --> V
```

**Mechanische Deduplizierungslogik**:

1. Innerhalb jeder Themendatei: nach `summary.toLowerCase()` deduplizieren, Felder `why`/`howToApply` zusammenführen
2. Nach Summary‑alphabetischer Reihenfolge neu sortieren
3. Dateiübergreifend: Einträge mit gleichem `type:summary` in die zuerst gefundene Datei zusammenführen, doppelte Dateien löschen
## Recall — Abruf

### Auslösezeitpunkt

Vor jeder AI-Verarbeitung einer Benutzeranfrage wird automatisch `resolveRelevantAutoMemoryPromptForQuery` ausgelöst, um relevante Erinnerungen in den System-Prompt einzufügen.

### Abrufablauf (`recall.ts`)

```mermaid
flowchart TD
    A[resolveRelevantAutoMemoryPromptForQuery] --> B[scanAutoMemoryTopicDocuments\n扫描所有主题文件]
    B --> C[filterExcludedAutoMemoryDocuments\n过滤本轮已写入的文件]
    C --> D{query 为空\n或 docs 为空\n或 limit <= 0?}
    D -- 是 --> E[返回空 prompt\nstrategy: none]
    D -- 否 --> F{是否配置了 Config?}
    F -- 是 --> G[selectRelevantAutoMemoryDocumentsByModel\n发起 side query 请求模型选择]
    G --> H{模型返回结果?}
    H -- 有文档 --> I[strategy: model]
    H -- 无文档 --> J[strategy: none\n仍然返回空]
    G -- "失败/异常" --> K[回退到启发式选择]
    F -- 否 --> K
    K --> L[tokenize query\n提取 ≥3 字符的 token]
    L --> M[scoreDocument 打分\n关键词匹配 +2 / 类型关键词 +1 / 有内容 +1]
    M --> N[过滤 score=0 的文档\n按分数降序排列，取 Top 5]
    N --> O{有得分文档?}
    O -- 是 --> P[strategy: heuristic]
    O -- 否 --> J
    I --> Q[buildRelevantAutoMemoryPrompt\n构建 Relevant Memory 区块]
    P --> Q
    Q --> R[返回注入主系统提示的 prompt 片段]
```

**Bewertungsregeln (heuristisch)**:

| Bedingung                                       | Punkte          |
| ----------------------------------------------- | --------------- |
| query token kommt im Dokumentinhalt vor         | +2 (pro Token)  |
| query token ist ein charakteristisches Schlüsselwort dieses Typs | +1 (pro Token)  |
| Dokument-body ist nicht leer                    | +1              |

**Charakteristische Schlüsselwörter pro Typ**:

- `user`: user, preference, background, role, terse
- `feedback`: feedback, rule, avoid, style, summary
- `project`: project, goal, incident, deadline, release
- `reference`: reference, dashboard, ticket, docs, link

**Prompt-Aufbauregeln**:

- Maximal 5 Dokumente einfügen (`MAX_RELEVANT_DOCS`)
- Jeder Dokument-body wird auf 1200 Zeichen gekürzt (`MAX_DOC_BODY_CHARS`)
- Bei Überschreitung wird der Hinweis angehängt: „NOTE: Relevant memory truncated for prompt budget."
- Enthält Informationen zur Frische des Dokuments (basierend auf Datei-Mtime)

---

## Forget — Vergessen

### Auslösezeitpunkt

Wird durch manuelle Ausführung des Befehls `/forget <query>` durch den Benutzer ausgelöst.

### Vergessensablauf (`forget.ts`)

```mermaid
flowchart TD
    A[forgetManagedAutoMemoryEntries\nquery + config] --> B[ensureAutoMemoryScaffold]
    B --> C[listIndexedForgetCandidates\n扫描所有文件的所有 entry]
    C --> D[为每个 entry 生成稳定 ID\n单 entry 文件: relativePath\n多 entry 文件: relativePath:index]
    D --> E{是否配置了 Config?}
    E -- 是 --> F[selectByModel\n构建 selection prompt\n发起 side query temperature=0]
    F --> G{模型选择成功?}
    G -- 是 --> H[strategy: model]
    G -- 失败 --> I[selectByHeuristic\n关键词匹配]
    E -- 否 --> I
    I --> J[strategy: heuristic]
    H --> K[遍历选中的 candidates]
    J --> K
    K --> L{entries.length == 1?}
    L -- 是 --> M[删除整个文件\nfs.unlink]
    L -- 否 --> N[解析文件中的所有 entries\n移除目标 entry\n重新渲染写回]
    M --> O[记录 removedEntries]
    N --> O
    O --> P{有 touched topics?}
    P -- 是 --> Q[bumpMetadata\n重建 MEMORY.md 索引]
    P --> R[返回 AutoMemoryForgetResult]
    Q --> R
```

**Entry-ID-Design**:

- Datei mit einem Eintrag (häufig): `relativePath` (z. B. `feedback/no-summary.md`)
- Datei mit mehreren Einträgen: `relativePath:index` (z. B. `feedback/style.md:2`)
- Verwendung stabiler IDs, damit das Modell Einträge genau lokalisieren kann, ohne andere Einträge in derselben Datei zu beeinflussen.

---

## Index-Neuerstellung

`MEMORY.md` ist der Navigationsindex aller Themendateien. Nach jedem Extract oder Dream wird `rebuildManagedAutoMemoryIndex` aufgerufen, um ihn neu zu erstellen:

```
- [用户偏好](user/preferences.md) — 用户是资深 Go 工程师，第一次接触 React
- [反馈规范](feedback/style.md) — 保持回复简洁，不要尾部总结
- [项目里程碑](project/milestone.md) — 移动端发布切分支前的合并冻结窗口
```

**Index-Beschränkungen**:

- Maximal 150 Zeichen pro Zeile (bei Überschreitung mit `…` abgeschnitten)
- Maximal 200 Zeilen
- Gesamtgröße nicht mehr als 25.000 Bytes

---

## Telemetrie-Ereignisse

Das System enthält drei Arten von Telemetrie-Ereignissen zur Überwachung der Leistung und Effektivität von Speichervorgängen:

### Extract-Telemetrie

| Feld             | Typ                        | Beschreibung                                    |
| ---------------- | -------------------------- | ----------------------------------------------- |
| `trigger`        | `'auto'`                   | Auslöseart (derzeit nur automatisch)            |
| `status`         | `'completed'` \| `'failed'`| Ausführungsergebnis                             |
| `patches_count`  | number                     | Anzahl der extrahierten gültigen Patches        |
| `touched_topics` | string[]                   | Liste der beschriebenen Speichertypen           |
| `duration_ms`    | number                     | Gesamtdauer (Millisekunden)                     |

### Dream-Telemetrie

| Feld              | Typ                                     | Beschreibung                                  |
| ----------------- | --------------------------------------- | --------------------------------------------- |
| `trigger`         | `'auto'`                                | Auslöseart                                    |
| `status`          | `'updated'` \| `'noop'` \| `'failed'`   | Ausführungsergebnis                           |
| `deduped_entries` | number                                  | Anzahl der mechanisch deduplizierten Einträge |
| `touched_topics`  | string[]                                | Liste der geänderten Speichertypen            |
| `duration_ms`     | number                                  | Gesamtdauer (Millisekunden)                   |

### Recall-Telemetrie

| Feld            | Typ                                    | Beschreibung                                  |
| --------------- | -------------------------------------- | --------------------------------------------- |
| `query_length`  | number                                 | Länge der Abfragezeichenfolge                 |
| `docs_scanned`  | number                                 | Anzahl der gescannten Dokumente               |
| `docs_selected` | number                                 | Anzahl der endgültig eingefügten Dokumente    |
| `strategy`      | `'none'` \| `'heuristic'` \| `'model'` | Auswahlstrategie                              |
| `duration_ms`   | number                                 | Gesamtdauer (Millisekunden)                   |

---

## Index der zugehörigen Quelldateien

| Datei                                                | Aufgabe                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `packages/core/src/memory/types.ts`                  | Typdefinitionen: `AutoMemoryType`, `AutoMemoryMetadata`, `AutoMemoryExtractCursor` |
| `packages/core/src/memory/paths.ts`                  | Pfadberechnung: `getAutoMemoryRoot`, `isAutoMemPath`, verschiedene Dateipfad-Helfer |
| `packages/core/src/memory/store.ts`                  | Gerüstinitialisierung: `ensureAutoMemoryScaffold`, Index/Metadaten-Lesen/Schreiben |
| `packages/core/src/memory/scan.ts`                   | Scannen von Themendateien: `scanAutoMemoryTopicDocuments`, Frontmatter parsen       |
| `packages/core/src/memory/entries.ts`                | Eintrag-Parsen und Rendern: `parseAutoMemoryEntries`, `renderAutoMemoryBody`        |
| `packages/core/src/memory/extract.ts`                | Extraktionskernlogik: `runAutoMemoryExtract`, Cursor-Verwaltung, Patch-Deduplizierung |
| `packages/core/src/memory/extractScheduler.ts`       | Extraktionsplaner: `ManagedAutoMemoryExtractRuntime`, Warteschlange/Laufzustandsautomat |
| `packages/core/src/memory/extractionAgentPlanner.ts` | Extraktions-Agent: `runAutoMemoryExtractionByAgent`                                  |
| `packages/core/src/memory/dream.ts`                  | Integrationskernlogik: `runManagedAutoMemoryDream`, Agent-Pfad + mechanische Deduplizierung |
| `packages/core/src/memory/dreamScheduler.ts`         | Integrationsplaner: `ManagedAutoMemoryDreamRuntime`, Gate-Prüfung, Lock-Verwaltung   |
| `packages/core/src/memory/dreamAgentPlanner.ts`      | Integrations-Agent: `planManagedAutoMemoryDreamByAgent`                              |
| `packages/core/src/memory/recall.ts`                 | Abruflogik: `resolveRelevantAutoMemoryPromptForQuery`, heuristischer + Modell-Pfad  |
| `packages/core/src/memory/forget.ts`                 | Vergessenslogik: `forgetManagedAutoMemoryEntries`, Kandidatenerzeugung + genaues Löschen |
| `packages/core/src/memory/indexer.ts`                | Index-Neuerstellung: `rebuildManagedAutoMemoryIndex`, `buildManagedAutoMemoryIndex` |
| `packages/core/src/memory/prompt.ts`                 | System-Prompt-Vorlagen: Speichertyperklärungen, Formatbeispiele, Verwendungsrichtlinien |
| `packages/core/src/memory/governance.ts`             | Governance-Vorschlagstyp: `AutoMemoryGovernanceSuggestionType`                      |
| `packages/core/src/memory/state.ts`                  | Extraktionslaufstatus: `isExtractRunning`, `markExtractRunning`, `clearExtractRunning` |
| `packages/core/src/memory/memoryAge.ts`              | Frischebeschreibung: `memoryAge`, `memoryFreshnessText`                             |
