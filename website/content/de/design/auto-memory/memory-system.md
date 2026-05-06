# Memory-Verwaltungssystem

> Dieser Artikel beschreibt den Mechanismus, die Auslösebedingungen und die Implementierungsdetails des **Managed Auto-Memory** (verwalteter automatischer Speicher) in Qwen Code.

---

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Speicherstruktur](#speicherstruktur)
3. [Speichertypen](#speichertypen)
4. [Format der Speichereinträge](#format-der-speichereinträge)
5. [Kernlebenszyklus](#kernlebenszyklus)
6. [Extract – Extraktion](#extract--extraktion)
7. [Dream – Konsolidierung](#dream--konsolidierung)
8. [Recall – Abruf](#recall--abruf)
9. [Forget – Vergessen](#forget--vergessen)
10. [Index-Neuaufbau](#index-neuaufbau)
11. [Telemetrie](#telemetrie)

---

## Übersicht

Managed Auto-Memory ist ein persistentes Speichersystem, das während KI-Sitzungen benutzerbezogenes Wissen **automatisch** sammelt, konsolidiert und abruft. Es verwaltet den Lebenszyklus der Erinnerungen über vier Kernoperationen:

| Operation | Englisch | Auslöser | Zweck |
| ---- | ------- | -------------------------- | -------------------------------------- |
| Extraktion | Extract | Automatisch (nach jeder Konversationsrunde) | Extrahiert neues Wissen aus dem Gesprächsverlauf und schreibt es in die Speicherdatei |
| Konsolidierung | Dream | Automatisch (periodischer Hintergrundtask) | Dedupliziert und zusammenführt Speicherdateien, um sie übersichtlich zu halten |
| Abruf | Recall | Automatisch (vor jeder Konversationsrunde) | Ruft relevante Erinnerungen zur aktuellen Anfrage ab und injiziert sie in den System-Prompt |
| Vergessen | Forget | Manuell (Benutzerbefehl `/forget`) | Löscht gezielt angegebene Speichereinträge |

---

## Speicherstruktur

### Verzeichnislayout

```
~/.qwen/                                      ← 全局基础目录（默认）
└── projects/
    └── <sanitized-git-root>/                 ← 项目标识（基于 Git 根路径）
        ├── meta.json                         ← 元数据（提取/整合时间戳、状态）
        ├── extract-cursor.json               ← 提取游标（已处理的对话偏移量）
        ├── consolidation.lock                ← Dream 进程互斥锁
        └── memory/                           ← 记忆主目录
            ├── MEMORY.md                     ← 索引文件（自动生成，汇总所有条目）
            ├── user.md                       ← 用户偏好记忆（示例）
            ├── feedback.md                   ← 反馈规范记忆（示例）
            ├── project/
            │   └── milestone.md              ← 项目记忆（支持子目录）
            └── reference/
                └── grafana.md                ← 外部资源记忆
```

> **Überschreibung durch Umgebungsvariablen**:
>
> - `QWEN_CODE_MEMORY_BASE_DIR`: Ersetzt das globale Basisverzeichnis
> - `QWEN_CODE_MEMORY_LOCAL=1`: Verwendet stattdessen den projektspezifischen Pfad `.qwen/memory/`

### Beschreibung der Schlüsseldateien

| Datei | Beschreibung |
| --------------------- | ---------------------------------------------------------------------- |
| `meta.json` | Protokolliert Zeitpunkt des letzten Extract/Dream, Session-ID, beteiligte Speichertypen und Ausführungsstatus |
| `extract-cursor.json` | Speichert den aktuellen Offset im Gesprächsverlauf der Session, um doppelte Extraktionen zu vermeiden |
| `consolidation.lock` | Dateisperre während der Dream-Ausführung; enthält die PID des Besitzers und läuft nach 1 Stunde automatisch ab |
| `MEMORY.md` | Index aller Themendateien; wird nach jedem Extract/Dream neu aufgebaut und als Markdown-Liste formatiert |

---

## Speichertypen

Das System unterstützt vier integrierte Speichertypen, die jeweils unterschiedliche Informationsdimensionen abdecken:

| Typ | Gespeicherter Inhalt | Wann geschrieben | Wann gelesen |
| ----------- | ----------------------------------------------------- | ---------------------------------------- | ---------------------------- |
| `user` | Rolle, fachlicher Hintergrund und Arbeitsgewohnheiten des Nutzers | Wenn Rolle/Präferenzen/Wissen des Nutzers erkannt werden | Wenn Antworten an den Nutzerhintergrund angepasst werden müssen |
| `feedback` | Anweisungen des Nutzers zum KI-Verhalten: Was zu vermeiden ist, was beibehalten werden soll | Wenn der Nutzer die KI korrigiert oder eine nicht offensichtliche Vorgehensweise bestätigt | Wenn es das Verhalten der KI beeinflusst |
| `project` | Projektfortschritt, Ziele, Entscheidungen, Deadlines, Bug-Tracking | Wenn bekannt wird, wer was warum bis wann macht | Wenn es der KI hilft, den Arbeitskontext und die Motivation zu verstehen |
| `reference` | Verweise auf externe Systemressourcen (Dashboards, Ticket-Systeme, Slack-Kanäle etc.) | Wenn eine externe Ressource und ihr Zweck bekannt werden | Wenn der Nutzer externe Systeme oder relevante Informationen erwähnt |

**Inhalte, die nicht gespeichert werden sollten**: Code-Patterns/Konventionen, Git-Historie, Debugging-Ansätze, temporäre Task-Status, Inhalte, die bereits in `QWEN.md`/`AGENTS.md` dokumentiert sind.

---

## Format der Speichereinträge

Jede Themendatei verwendet das Format **YAML-Frontmatter + Markdown-Body**:

```markdown
---
name: 记忆名称
description: 一句话描述（用于判断召回相关性，要具体）
type: user|feedback|project|reference
---

记忆主体内容（summary 行）

Why: 背后原因（让 AI 能理解边界情况而不是盲目遵守规则）
How to apply: 适用场景和使用方式
```

Für die Typen `feedback` und `project` wird dringend empfohlen, `Why` und `How to apply` auszufüllen, damit die Erinnerung auch in Grenzfällen korrekt angewendet werden kann.

---

## Kernlebenszyklus

```mermaid
flowchart TD
    A([用户发送请求]) --> B

    subgraph "召回 Recall"
        B[扫描所有主题文件] --> C{文档数量和\n查询内容是否有效?}
        C -- 否 --> D[返回空提示词\nstrategy: none]
        C -- 是 --> E{是否配置了 Config?}
        E -- 是 --> F[模型驱动选择\nside query]
        F --> G{选出相关文档?}
        G -- 是 --> H[strategy: model]
        G -- 否 --> I[strategy: none]
        E -- 否 --> J[启发式关键词评分]
        F -- 失败 --> J
        J --> K{有得分 > 0 的文档?}
        K -- 是 --> L[strategy: heuristic]
        K -- 否 --> I
        H --> M[构建 Relevant Memory 提示词\n注入系统提示]
        L --> M
        I --> N[不注入记忆]
    end

    M --> O([AI 处理请求])
    N --> O
    D --> O

    O --> P([AI 返回响应])

    subgraph "提取 Extract（后台）"
        P --> Q{本轮 AI 是否\n直接写了记忆文件?}
        Q -- 是 --> R[跳过\nmemory_tool]
        Q -- 否 --> S{提取任务是否\n正在运行?}
        S -- 是 --> T[放入队列或跳过\nalready_running / queued]
        S -- 否 --> U[加载未处理的对话切片\n基于 extract cursor]
        U --> V[调用提取 Agent\nrunAutoMemoryExtractionByAgent]
        V --> W[去重规范化 patches]
        W --> X{有 touched topics?}
        X -- 是 --> Y[更新 meta.json\n重建 MEMORY.md 索引]
        X -- 否 --> Z[仅更新 extract cursor]
        Y --> Z
    end

    subgraph "Dream 整合（后台，周期性）"
        P --> AA{Dream 调度门控检查}
        AA --> AB{是否同一会话?}
        AB -- 是 --> AC[跳过\nsame_session]
        AB -- 否 --> AD{距上次 Dream\n≥ 24 小时?}
        AD -- 否 --> AE[跳过\nmin_hours]
        AD -- 是 --> AF{距上次 Dream 后\n新会话数 ≥ 5?}
        AF -- 否 --> AG[跳过\nmin_sessions]
        AF -- 是 --> AH{consolidation.lock\n是否存在?}
        AH -- 是 --> AI[跳过\nlocked]
        AH -- 否 --> AJ[获取锁\n写入 PID]
        AJ --> AK{是否配置了 Config?}
        AK -- 是 --> AL[Agent 路径\nplanManagedAutoMemoryDreamByAgent]
        AL --> AM{Agent 是否触碰了文件?}
        AM -- 是 --> AN[记录触碰的 topics]
        AM -- "否/失败" --> AO
        AK -- 否 --> AO[机械去重路径\n解析+去重+按字母排序]
        AO --> AP[写回更新后的主题文件]
        AN --> AQ[重建 MEMORY.md 索引\n更新 meta.json]
        AP --> AQ
        AQ --> AR[释放锁]
    end
```

---

## Extract – Extraktion

### Auslösebedingungen

Wird nach jeder abgeschlossenen KI-Antwort automatisch durch `scheduleAutoMemoryExtract` ausgelöst (nicht blockierend im Hintergrund).

### Scheduling-Logik (`extractScheduler.ts`)

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

**Erläuterung der Skip-Gründe**:

| Grund | Bedeutung |
| ----------------- | ----------------------------------------------- |
| `memory_tool` | Der Haupt-Agent hat in dieser Runde direkt Speicherdateien geschrieben; wird übersprungen, um Konflikte zu vermeiden |
| `already_running` | Extraktion läuft bereits und kann nicht in die Warteschlange gestellt werden |
| `queued` | Eine Extraktion läuft bereits, die aktuelle Anfrage wurde in die Warteschlange gestellt |

### Kern-Extraktionsablauf (`extract.ts`)

```mermaid
flowchart TD
    A[runAutoMemoryExtract] --> B[ensureAutoMemoryScaffold\n初始化目录和文件]
    B --> C[buildTranscriptMessages\n将 Content[] 转换为带 offset 的消息列表]
    C --> D[readExtractCursor\n读取上次处理到的位置]
    D --> E[loadUnprocessedTranscriptSlice\n截取未处理的消息段]
    E --> F{slice 为空?}
    F -- 是 --> G[返回无 patches 结果]
    F -- 否 --> H[runAutoMemoryExtractionByAgent\n调用 forked agent 提取 patches]
    H --> I[dedupeExtractPatches\n去重+规范化]
    I --> J{有 touched topics?}
    J -- 是 --> K[bumpMetadata\n更新 meta.json]
    K --> L[rebuildManagedAutoMemoryIndex\n重建 MEMORY.md]
    L --> M[writeExtractCursor\n记录最新 offset]
    J -- 否 --> M
    M --> N[返回 AutoMemoryExtractResult]
```

**Extraktions-Cursor**:

- Felder: `{ sessionId, processedOffset, updatedAt }`
- `processedOffset` wird nach jeder Extraktion auf die aktuelle Verlaufslänge aktualisiert
- Bei der nächsten Extraktion werden nur Nachrichten mit `offset >= processedOffset` verarbeitet
- Bei Session-Wechsel (`sessionId` ändert sich) wird bei Offset 0 neu begonnen

**Patch-Filterregeln**:

- Zusammenfassung < 12 Zeichen → wird verworfen
- Zusammenfassung endet mit `?` → wird verworfen (Fragesatz)
- Enthält temporäre Keywords (today/now/currently/temporary etc.) → wird verworfen
- Gleiche `topic:summary`-Kombination → wird dedupliziert

---

## Dream – Konsolidierung

### Auslösebedingungen

Wird nach jeder abgeschlossenen KI-Antwort automatisch durch `scheduleManagedAutoMemoryDream` ausgelöst (nicht blockierend im Hintergrund). Durch mehrere Gate-Bedingungen geschützt, wird es in den meisten Fällen jedoch übersprungen.

### Scheduling-Gates (`dreamScheduler.ts`)

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

**Gate-Parameter**:

| Parameter | Standardwert | Beschreibung |
| -------------------------- | -------- | ----------------------------- |
| `minHoursBetweenDreams` | 24 Stunden | Minimaler Zeitabstand zwischen zwei Dreams |
| `minSessionsBetweenDreams` | 5 Sessions | Minimale Anzahl neuer Sessions zum Auslösen eines Dreams |
| `SESSION_SCAN_INTERVAL_MS` | 10 Minuten | Drosselungsintervall für das Scannen von Session-Dateien |
| `DREAM_LOCK_STALE_MS` | 1 Stunde | Zeitschwelle, nach der eine Lock-Datei als abgelaufen gilt |

**Lock-Mechanismus**:

- Lock-Datei befindet sich unter `<project-state-dir>/consolidation.lock`
- Inhalt ist die PID des haltenden Prozesses
- Bei Prüfung: Wenn der PID-Prozess nicht mehr existiert (`kill(pid, 0)` fehlschlägt) oder der Lock älter als 1 Stunde ist → gilt als abgelaufen und wird automatisch entfernt

### Konsolidierungsablauf (`dream.ts`)

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

**Algorithmische Deduplizierungslogik**:

1. Innerhalb jeder Themendatei: Deduplizierung nach `summary.toLowerCase()`, Zusammenführung der `why`/`howToApply`-Felder
2. Neusortierung nach alphabetischer Reihenfolge der Summary
3. Dateiübergreifend: Einträge mit gleichem `type:summary` werden in die zuerst gefundene Datei zusammengeführt, Duplikate werden gelöscht

---

## Recall – Abruf

### Auslösebedingungen

Wird vor jeder Verarbeitung einer Nutzeranfrage durch die KI automatisch durch `resolveRelevantAutoMemoryPromptForQuery` ausgelöst, um relevante Erinnerungen in den System-Prompt zu injizieren.

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

| Bedingung | Punkte |
| -------------------------------- | ---------------- |
| Query-Token erscheint im Dokumentinhalt | +2 (pro Token) |
| Query-Token ist ein charakteristisches Keyword des Typs | +1 (pro Token) |
| Dokument-Body ist nicht leer | +1 |

**Charakteristische Keywords pro Typ**:

- `user`: user, preference, background, role, terse
- `feedback`: feedback, rule, avoid, style, summary
- `project`: project, goal, incident, deadline, release
- `reference`: reference, dashboard, ticket, docs, link

**Regeln zur Prompt-Erstellung**:

- Maximal 5 Dokumente werden injiziert (`MAX_RELEVANT_DOCS`)
- Der Body jedes Dokuments wird auf 1200 Zeichen gekürzt (`MAX_DOC_BODY_CHARS`)
- Bei Überschreitung wird der Hinweis angehängt: "NOTE: Relevant memory truncated for prompt budget."
- Enthält Frische-Informationen des Dokuments (basierend auf Datei-mtime)

---

## Forget – Vergessen

### Auslösebedingungen

Wird durch manuelle Ausführung des Befehls `/forget <query>` durch den Nutzer ausgelöst.

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

**Design der Entry-IDs**:

- Einzeldateien (häufigster Fall): `relativePath` (z. B. `feedback/no-summary.md`)
- Mehrfachdateien: `relativePath:index` (z. B. `feedback/style.md:2`)
- Stabile IDs ermöglichen es dem Modell, Einträge präzise zu adressieren, ohne andere Einträge in derselben Datei zu beeinträchtigen

---

## Index-Neuaufbau

`MEMORY.md` ist der Navigationsindex aller Themendateien und wird nach jedem Extract oder Dream durch Aufruf von `rebuildManagedAutoMemoryIndex` neu aufgebaut:

```
- [用户偏好](user/preferences.md) — 用户是资深 Go 工程师，第一次接触 React
- [反馈规范](feedback/style.md) — 保持回复简洁，不要尾部总结
- [项目里程碑](project/milestone.md) — 移动端发布切分支前的合并冻结窗口
```

**Index-Limits**:

- Maximal 150 Zeichen pro Zeile (Überschreitung wird mit `…` gekürzt)
- Maximal 200 Zeilen
- Gesamtgröße maximal 25.000 Byte

---

## Telemetrie

Das System enthält drei Arten von Telemetrie-Events zur Überwachung der Performance und Effektivität von Speicheroperationen:

### Extract-Telemetrie

| Feld | Typ | Beschreibung |
| ---------------- | --------------------------- | ----------------------- |
| `trigger` | `'auto'` | Auslöseart (derzeit nur automatisch) |
| `status` | `'completed'` \| `'failed'` | Ausführungsergebnis |
| `patches_count` | number | Anzahl extrahierter gültiger Patches |
| `touched_topics` | string[] | Liste der geschriebenen Speichertypen |
| `duration_ms` | number | Gesamtdauer (Millisekunden) |

### Dream-Telemetrie

| Feld | Typ | Beschreibung |
| ----------------- | ------------------------------------- | ---------------------- |
| `trigger` | `'auto'` | Auslöseart |
| `status` | `'updated'` \| `'noop'` \| `'failed'` | Ausführungsergebnis |
| `deduped_entries` | number | Anzahl deduplizierter Einträge im algorithmischen Pfad |
| `touched_topics` | string[] | Liste der geänderten Speichertypen |
| `duration_ms` | number | Gesamtdauer (Millisekunden) |

### Recall-Telemetrie

| Feld | Typ | Beschreibung |
| --------------- | -------------------------------------- | ---------------- |
| `query_length` | number | Länge des Query-Strings |
| `docs_scanned` | number | Gesamtzahl gescannter Dokumente |
| `docs_selected` | number | Anzahl final injizierter Dokumente |
| `strategy` | `'none'` \| `'heuristic'` \| `'model'` | Auswahlstrategie |
| `duration_ms` | number | Gesamtdauer (Millisekunden) |

---

## Index relevanter Quelldateien

| Datei | Verantwortung |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/core/src/memory/types.ts` | Typdefinitionen: `AutoMemoryType`, `AutoMemoryMetadata`, `AutoMemoryExtractCursor` |
| `packages/core/src/memory/paths.ts` | Pfadberechnung: `getAutoMemoryRoot`, `isAutoMemPath`, diverse Pfad-Helper |
| `packages/core/src/memory/store.ts` | Scaffold-Initialisierung: `ensureAutoMemoryScaffold`, Lesen/Schreiben von Index/Metadaten |
| `packages/core/src/memory/scan.ts` | Scannen von Themendateien: `scanAutoMemoryTopicDocuments`, Frontmatter-Parsing |
| `packages/core/src/memory/entries.ts` | Eintrags-Parsing und Rendering: `parseAutoMemoryEntries`, `renderAutoMemoryBody` |
| `packages/core/src/memory/extract.ts` | Kernlogik Extraktion: `runAutoMemoryExtract`, Cursor-Management, Patch-Deduplizierung |
| `packages/core/src/memory/extractScheduler.ts` | Extraktions-Scheduler: `ManagedAutoMemoryExtractRuntime`, Queue/Laufzeit-Statusmaschine |
| `packages/core/src/memory/extractionAgentPlanner.ts` | Extraktions-Agent: `runAutoMemoryExtractionByAgent` |
| `packages/core/src/memory/dream.ts` | Kernlogik Konsolidierung: `runManagedAutoMemoryDream`, Agent-Pfad + algorithmische Deduplizierung |
| `packages/core/src/memory/dreamScheduler.ts` | Konsolidierungs-Scheduler: `ManagedAutoMemoryDreamRuntime`, Gate-Prüfungen, Lock-Management |
| `packages/core/src/memory/dreamAgentPlanner.ts` | Konsolidierungs-Agent: `planManagedAutoMemoryDreamByAgent` |
| `packages/core/src/memory/recall.ts` | Abruflogik: `resolveRelevantAutoMemoryPromptForQuery`, heuristischer + modellbasierter Dual-Pfad |
| `packages/core/src/memory/forget.ts` | Vergessenslogik: `forgetManagedAutoMemoryEntries`, Kandidatengenerierung + gezieltes Löschen |
| `packages/core/src/memory/indexer.ts` | Index-Neuaufbau: `rebuildManagedAutoMemoryIndex`, `buildManagedAutoMemoryIndex` |
| `packages/core/src/memory/prompt.ts` | System-Prompt-Templates: Erläuterung der Speichertypen, Formatbeispiele, Nutzungsrichtlinien |
| `packages/core/src/memory/governance.ts` | Governance-Empfehlungstypen: `AutoMemoryGovernanceSuggestionType` |
| `packages/core/src/memory/state.ts` | Extraktionslaufzeitstatus: `isExtractRunning`, `markExtractRunning`, `clearExtractRunning` |
| `packages/core/src/memory/memoryAge.ts` | Frische-Beschreibung: `memoryAge`, `memoryFreshnessText` |