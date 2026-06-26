# AutoSkill: Система автоматического извлечения навыков — проектный документ

## Обзор

В данном документе описывается проект добавления возможности **AutoSkill** в существующую архитектуру Memory-Dream QwenCode.

AutoSkill — это **механизм автоматического извлечения процедурной памяти**: после выполнения агентом задачи, интенсивно использующей инструменты, система в фоновом режиме оценивает, содержит ли текущий диалог повторяемые последовательности операций, и автоматически сохраняет их как навык на уровне проекта.

### Различия с Memory Extract

| Измерение             | Memory Extract                           | AutoSkill                                    |
| --------------------- | ---------------------------------------- | -------------------------------------------- |
| **Тип памяти**        | Декларативная (кто пользователь, контекст проекта) | Процедурная (как выполнять определённый тип задач) |
| **Момент запуска**    | После завершения каждого сеанса          | Достижение порога вызовов инструментов в сеансе |
| **Цель записи**       | `${projectRoot}/.qwen/memory/`           | `${projectRoot}/.qwen/skills/`               |
| **Содержание**        | Предпочтения пользователя, контекст проекта, правила обратной связи | Повторяемые шаги операций, лучшие практики   |
| **Жизненный цикл**    | Периодическое слияние/обрезка Dream      | Обновление по мере необходимости, обслуживание агентом ревью |

---

## Основные принципы проектирования

1. **Отсутствие выделенного инструмента записи**: агент ревью навыков использует общие инструменты `read_file`, `write_file`, `edit` для работы с `.qwen/skills/`; не вводится специальный инструмент `skill_manage`. То же самое для основного сеанса — если пользователь хочет вручную вести навыки, он использует те же общие инструменты.
2. **Обнаружение изменений навыков вместо сброса счётчика инструментов**: по аналогии с тем, как Memory Extract отслеживает вызовы `memory_tool`, система проверяет, пришёлся ли какой-либо вызов записи в этом сеансе на каталог `.qwen/skills/`. Если да — значит, пользователь уже вручную изменял навыки, и при завершении сеанса автоматический ревью навыков пропускается.
3. **Метка `auto-skill` защищает навыки, созданные пользователем**: навыки, созданные агентом ревью, должны содержать в YAML frontmatter метку `source: auto-skill`. Агент ревью навыков может изменять только навыки с этой меткой и не должен трогать навыки, созданные вручную пользователем.
4. **Запуск по плотности вызовов инструментов**: запуск происходит только если за текущий сеанс инструменты вызывались ≥ 20 раз, что гарантирует извлечение только после действительно сложных задач.
5. **Чёткая граница защиты записи**: менеджер разрешений агента ревью ограничивает `write_file` и `edit` каталогом `${projectRoot}/.qwen/skills/`, запрещая доступ к слоям user/extension/bundled.
6. **Максимальное сохранение основного промпта Hermes**: промпт, используемый агентом ревью, напрямую переносится из `_SKILL_REVIEW_PROMPT` Hermes с минимальной адаптацией.

---

## Изменения архитектуры

### 1. Счётчики: `toolCallCount` и обнаружение изменений навыков

В состоянии сеанса поддерживаются два параллельно отслеживаемых значения:

**Счётчик вызовов инструментов** (определяет, нужно ли запускать ревью навыков):

```
Начало сеанса
  toolCallCount = 0

После каждого завершённого вызова инструмента
  toolCallCount += 1

Завершение сеанса
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // по умолчанию 20
    проверить skillsModifiedInSession
    ├─ true  → пропустить (навыки уже изменялись вручную, автоматический ревью не требуется)
    └─ false → scheduleSkillReview()
```

**Обнаружение изменений навыков** (заменяет сброс при вызове `skill_manage`):

```
После каждого завершённого вызова инструмента
  if (целевой путь инструмента находится в ${projectRoot}/.qwen/skills/):
    skillsModifiedInSession = true
```

Логика обнаружения: сканирование путей файлов, упомянутых в результатах вызова инструментов, и проверка, попадают ли они под префикс каталога навыков. Реализация по образцу `historyCallsSkillManage()` — перебор `history` для извлечения целевых путей операций записи (`write_file`, `edit` и т.п.) и сопоставление с префиксом.

> **Почему обнаружение изменений вместо проверки имени инструмента?**
> Больше нет специального инструмента `skill_manage`; и основной сеанс, и агент ревью используют общие `write_file`/`edit`. Поэтому проверка меняется с «был ли вызван определённый инструмент» на «была ли операция записи в каталог `.qwen/skills/`». Это семантически точнее: если пользователь вручную изменял файлы навыков, автоматический ревью пропускается.

> **Почему количество вызовов инструментов, а не количество оборотов диалога?**
> Количество вызовов инструментов отражает сложность задачи — одно сообщение пользователя может вызвать 1 или 30 вызовов. Высокая плотность инструментов означает больше проб, ошибок и корректировок стратегии, что повышает вероятность появления полезного опыта. Порог 20 более консервативен, чем 10 в Hermes, поскольку вызовы инструментов в QwenCode обычно более мелкие (например, построчное редактирование).

### 2. Точка планирования

Существующая точка вызова `MemoryManager` (завершение сеанса) используется как единая точка входа и расширяется для возможности одновременно планировать ревью навыков.

```
Завершение сеанса
  ├─ scheduleExtract(params)           // существующая логика без изменений
  └─ scheduleSkillReview(params)       // новая
        условие: toolCallCount >= AUTO_SKILL_THRESHOLD
             && !skillsModifiedInSession
```

Extract и ревью навыков планируются независимо и выполняются параллельно через `MemoryManager.track()`, не блокируя друг друга.

### 3. Права доступа агента ревью навыков к инструментам

Агент ревью навыков **не использует** специальный инструмент `skill_manage`, а напрямую использует общие файловые инструменты:

| Инструмент  | Назначение                                  | Ограничение области                                        |
| ----------- | ------------------------------------------- | --------------------------------------------------------- |
| `read_file` | Чтение существующего содержимого навыка, проверка frontmatter | Без ограничений                                           |
| `ls`        | Сканирование структуры каталога `.qwen/skills/` | Без ограничений                                           |
| `write_file`| Создание нового файла навыка                | Только внутри `${projectRoot}/.qwen/skills/`              |
| `edit`      | Изменение существующего содержимого навыка  | Только внутри `${projectRoot}/.qwen/skills/`, и целевой файл должен содержать `source: auto-skill` |
| `shell`     | Только команды чтения (например, `cat`, `find`) | Разрешены только команды чтения (статический анализ Shell AST) |

**Дополнительное ограничение для `edit` (защита `auto-skill`)**:

Перед выполнением `edit` или `write_file` (перезапись существующего файла) менеджер разрешений агента ревью навыков читает YAML frontmatter целевого файла и проверяет наличие поля `source: auto-skill`. Если оно отсутствует, запись отклоняется с ошибкой:

```
skill_review_agent: edit разрешён только для навыков с полем 'source: auto-skill' в frontmatter.
Этот навык, по-видимому, создан пользователем. Измените его вручную или спросите пользователя.
```

Эта проверка реализуется на уровне разрешений в `createSkillScopedAgentConfig`, а не только через системный промпт, чтобы гарантировать защиту даже в случае ошибки модели.

**Доступ к инструментам в основном сеансе**: основной агент не ограничивает чтение/запись `.qwen/skills/` — пользователь может управлять навыками через обычные `write_file`/`edit`. Такие операции устанавливают `skillsModifiedInSession = true`, что приводит к пропуску автоматического ревью навыков при завершении сеанса.

### 4. Песочница разрешений: `SkillScopedPermissionManager`

По аналогии с `createMemoryScopedAgentConfig` из `extractionAgentPlanner.ts` для агента ревью навыков создаётся выделенная область разрешений:

```typescript
// разрешённые операции для агента ревью навыков
read_file:    без ограничений по пути (требуется чтение любых файлов для понимания контекста проекта)
ls:           без ограничений по пути
shell:        только команды чтения (статический анализ Shell AST, используется существующая isShellCommandReadOnlyAST)
write_file:   только файлы по пути ${projectRoot}/.qwen/skills/ (создание нового навыка)
edit:         только внутри ${projectRoot}/.qwen/skills/ и целевой файл должен содержать source: auto-skill
```

**Уровни реализации защиты `auto-skill`**:

1. **Уровень менеджера разрешений** (жёсткое ограничение): перед `edit` проверяется frontmatter, без `source: auto-skill` — отказ.
2. **Уровень системного промпта** (мягкое ограничение): агенту явно сообщается, что он может изменять только навыки с меткой `source: auto-skill`.
3. **Двойная защита**: даже если ограничение из системного промпта будет обойдено, менеджер разрешений перехватит запись.
---

## Skill Review Agent 设计

### 触发 prompt（移植自 Hermes，最小化适配）

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

### Agent 配置

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // 读取现有 skill 内容，检查 source: auto-skill
    "ls",          // 扫描 .qwen/skills/ 目录
    "write_file",  // 创建新 skill 文件（权限管理器限制路径）
    "edit",        // 修改已有 auto-skill（权限管理器验证 frontmatter）
    "shell",       // 只读命令（如 find、cat）
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // 传入完整对话历史快照
}
```

---

## 与现有 MemoryManager 的集成

### `ScheduleSkillReviewParams`（新增类型）

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // 完整会话历史快照
  toolCallCount: number; // 本次会话的工具调用次数
  skillsModified: boolean; // 本次会话是否有写操作落在 .qwen/skills/
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

### `MemoryManager.scheduleSkillReview()`（新增方法）

```typescript
scheduleSkillReview(params: ScheduleSkillReviewParams): SkillReviewScheduleResult {
  // 1. 配置门控
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. 阈值检查
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. 本轮已主动操作 skill，跳过自动 review
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. 独立调度
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### 任务类型扩展

```typescript
// 扩展现有 MemoryTaskRecord.taskType
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// 常量
export const AUTO_SKILL_THRESHOLD = 20; // 工具调用次数阈值
```

---

## 数据流

```
会话进行中
  agent 主循环
    ├─ 每次工具调用 → toolCallCount += 1
    └─ 若写操作目标路径在 ${projectRoot}/.qwen/skills/ 下
         → skillsModifiedInSession = true

会话结束（sessionEnd 事件）
  ├─ scheduleExtract(params)
  │     └─ [现有逻辑：fork extraction agent → 写 .qwen/memory/]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ 否 → skip（密度不足 或 本轮已手动操作 skill）
       └─ 是 → scheduleSkillReview(params)
                 └─ 独立 fork skill review agent
                        ↓
                 skill review agent（最多 8 轮，2 分钟，沙箱权限）
                 工具：read_file, ls, write_file, edit, shell
                 传入完整 sessionHistory
                        ↓
                 模型判断是否有可复用方法
                 ├─ 有 → 读取已有 skill（检查 source: auto-skill）
                 │         → write_file 创建新 skill（含 source: auto-skill）
                 │         → edit 更新已有 auto-skill
                 │         → SkillManager 缓存失效（notifyChangeListeners）
                 └─ 无 → "Nothing to save." 结束

下次会话
  SkillManager.listSkills({ level: 'project' })
  → 扫描 .qwen/skills/ 发现新建 skill
  → 注入 system prompt 的 <available_skills> 块（Tier 1）
```

---

## SKILL.md 格式约定（project-level）

自动提炼的 skill 写入 `${projectRoot}/.qwen/skills/<name>/SKILL.md`，格式与现有 SkillManager 完全兼容：

```yaml
---
name: <skill-name> # 必填，小写字母 + 连字符
description: <description> # 必填，≤ 1024 字符
version: 1.0.0
metadata:
  source: auto-skill # 必填（review agent 创建时强制写入）
  extracted_at: '2026-04-24T12:00:00Z'
---
# <技能标题>

<操作步骤 / 最佳实践 / 注意事项>
```
**`source: auto-skill` 的约束语义**：

| Значение поля | Создатель | Может ли skill review agent изменять? | Может ли пользователь изменять? |
|---------------|-----------|---------------------------------------|----------------------------------|
| `auto-skill` | review agent | ✅ Да | ✅ Да |
| Отсутствует | Пользователь (создано вручную) | ❌ Нет (блокируется менеджером прав) | ✅ Да |

Если пользователь добавляет `source: auto-skill` к своему собственному skill, это означает, что review agent разрешено автоматически обновлять его в будущем.

---

## Соображения безопасности

| Риск | Способы смягчения |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Автоматическое извлечение перезаписывает тщательно написанный пользователем skill | Менеджер прав читает frontmatter; если отсутствует `source: auto-skill`, то отказывает в `edit`; system prompt также явно сообщает, что можно изменять только auto-skill |
| Бесконечный рост количества skills | review prompt явно требует: «приоритетно обновлять существующие skills»; обновление существующих skills имеет приоритет над созданием новых |
| Запись в пути вне проекта | Разрешения `write_file`/`edit` ограничены `${projectRoot}/.qwen/skills/`; `assertRealProjectSkillPath` отклоняет попытки обхода через symlink |
| Извлечение контента с риском инъекции | Переиспользование существующей логики сканирования контента на безопасность |
| Удаление skill'ов агентом review | Набор инструментов review agent не содержит операций удаления (нет `rm`, нет записи через `shell`); system prompt явно запрещает удаление |
| Запуск review после ручного изменения skill'ов в основной сессии | Проверка `skillsModifiedInSession`: если в основной сессии были операции записи в `.qwen/skills/`, то review пропускается |
| Запись в файлы вне каталога skills через обход симлинков | `assertRealProjectSkillPath` (асинхронно): использует `fs.realpath()` для разрешения реального пути, разрешает запись только если путь находится внутри реального корня skills |

---

## Параметры конфигурации

Добавлены следующие параметры в конфигурацию QwenCode (необязательно, есть значения по умолчанию):

```typescript
// config schema 新增（在 memory 下）
memory?: {
  enableAutoSkill?: boolean;   // 默认 true
}
```

Соответствующие примеры конфигурации в QWEN.md / `~/.qwen/config.json`:

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## Контрольный список E2E-тестов

После реализации функциональности, следуя процедуре из `.qwen/skills/e2e-testing/SKILL.md`, сначала выполните `npm run build && npm run bundle`, затем используйте локально собранный артефакт `node dist/cli.js` для сквозной проверки.

### 1. Низкая плотность вызовов инструментов не запускает

- Запустите headless-режим во временной директории проекта.
- Настройте `memory.enableAutoSkill: true`.
- Выполните простую задачу, требующую лишь несколько вызовов инструментов, и завершите сессию.
- Утверждайте, что в `.qwen/skills/` не появилось ни одного skill с `source: auto-skill`; в JSON-потоке не должно быть операций записи в `.qwen/skills/`.

### 2. Достижение порога запускает skill review

- Запустите headless-режим во временной директории проекта (`AUTO_SKILL_THRESHOLD` жестко задано как 20, в тестовом фикстуре можно уменьшить).
- Отправьте задачу, требующую множественных вызовов инструментов и содержащую повторно используемый процесс.
- Утверждайте, что после завершения сессии запланирован skill review; если модель решит, что стоит сохранить, создается `.qwen/skills/<name>/SKILL.md`, и frontmatter содержит `source: auto-skill`.
- Если модель решает `Nothing to save.`, утверждайте, что процесс завершился нормально без ошибок прав доступа.

### 3. Ручное изменение skill в основной сессии пропускает review

- Создайте сессию, в которой при достижении порога вызовов инструментов также выполняются операции `write_file` или `edit` над файлами в `.qwen/skills/` (имитируя ручное управление skill'ами пользователем).
- Утверждайте, что при завершении сессии `skillsModifiedInSession = true`, `scheduleSkillReview` возвращает `skippedReason: 'skills_modified_in_session'`.
- Утверждайте, что review agent не запускается, чтобы избежать повторной записи.

### 4. Защита записи разрешает только project-level skills

- Попробуйте записать через skill review agent в пути вне проекта, в пути user-level skill или bundled skill.
- Утверждайте, что запись отклоняется, сообщение об ошибке указывает на разрешение записи только в `${projectRoot}/.qwen/skills/`.
- Утверждайте, что разрешена запись в `${projectRoot}/.qwen/skills/<name>/SKILL.md`.

### 5. Флаг `auto-skill` защищает созданные пользователем skill'ы

- Предварительно разместите в `.qwen/skills/` пользовательский skill без `source: auto-skill`.
- Запустите skill review agent и направьте модель попытаться изменить этот skill.
- Утверждайте, что запись отклоняется менеджером прав, сообщение об ошибке указывает, что skill не является auto-skill.
- Утверждайте, что skill'ы с `source: auto-skill` в том же каталоге могут обновляться нормально.

### 6. Обход симлинков отклоняется

- Создайте внутри `.qwen/skills/` симлинк, указывающий на каталог вне проекта.
- Запустите skill review agent, попытавшись записать по этому симлинку.
- Утверждайте, что `assertRealProjectSkillPath` отклоняет запись, возвращая ошибку `symlink traversal detected`.

### 7. Конфигурационный переключатель работает

- Настройте `memory.enableAutoSkill: false`; убедитесь, что даже при превышении порога вызовов инструментов review не запускается.
- Убедитесь, что при включении по умолчанию (`enableAutoSkill` не задан или равен `true`) при достижении порога вызовов инструментов review запускается нормально.

### 8. Проверка локально собранного артефакта

- Используя e2e-testing skill с headless JSON-выводом:
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`
- При необходимости добавьте `--openai-logging --openai-logging-dir <tmp-dir>` для проверки схем инструментов, prompt и конфигурации прав в теле запроса.
- Для сценариев, включающих TUI или видимое состояние sessionEnd, используйте tmux interactive-процесс для захвата конечного вывода.

## Связь с существующими системами

```
Существующий MemoryManager
  ├─ scheduleExtract()       ← без изменений
  ├─ scheduleDream()         ← без изменений
  ├─ recall()                ← без изменений
  ├─ forget()                ← без изменений
  └─ scheduleSkillReview()   ← новый метод (описан в этом документе)

Существующий SkillManager
  ├─ listSkills()            ← без изменений (автоматическое обнаружение новых файлов в .qwen/skills/)
  └─ loadSkill()             ← без изменений

Существующие файловые инструменты (read_file / write_file / edit)
  ├─ в основной сессии: пользователь может управлять skill'ами вручную
  │   └─ операции записи в .qwen/skills/ → skillsModifiedInSession = true
  └─ в skill review agent: напрямую используются для создания/обновления auto-skill
      └─ менеджер прав ограничивает путь + проверяет source: auto-skill

Точка запуска (существующий хук sessionEnd)
  └─ одновременно вызываются scheduleExtract + scheduleSkillReview (при выполнении условий)
```

Сторона чтения SkillManager (`listSkills`, `loadSkill`) полностью не требует изменений — после того, как review agent записывает в `${projectRoot}/.qwen/skills/`, `SkillManager` автоматически обнаруживает изменения через существующий файловый мониторинг `chokidar`, вызывает `notifyChangeListeners()` для сброса кэша, и в следующем диалоге новый skill естественным образом появится в system prompt.
