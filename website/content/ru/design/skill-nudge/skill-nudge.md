# AutoSkill: Документ проектирования системы автоматического извлечения навыков

## Обзор

В данном документе описывается план добавления возможности **AutoSkill** в существующую архитектуру Memory-Dream в QwenCode.

AutoSkill — это **механизм автоматического извлечения процедурной памяти**: когда агент завершает задачу, интенсивно использующую инструменты, система незаметно оценивает, существует ли в этом диалоге повторно используемый процесс, и автоматически сохраняет его как навык уровня проекта.

### Различие в позиционировании с Memory Extract

| Аспект                    | Memory Extract                           | AutoSkill                                    |
| ------------------------- | ---------------------------------------- | -------------------------------------------- |
| **Тип памяти**            | Декларативная память (кто пользователь, контекст проекта) | Процедурная память (как выполнять определённый тип задач) |
| **Момент запуска**        | После каждого завершения сессии          | Когда количество вызовов инструментов в сессии достигает порога |
| **Цель записи**           | `${projectRoot}/.qwen/memory/`           | `${projectRoot}/.qwen/skills/`               |
| **Содержание**            | Предпочтения пользователя, контекст проекта, правила обратной связи | Повторно используемые шаги, лучшие практики  |
| **Жизненный цикл**        | Периодическая интеграция/обрезка через Dream | Обновление по требованию, обслуживается review agent’ом |

---

## Ключевые принципы проектирования

1. **Никаких специальных инструментов для записи**: skill review agent использует стандартные инструменты `read_file`, `write_file`, `edit` для работы с `.qwen/skills/` без введения специализированного инструмента `skill_manage`. То же самое и для основной сессии — если пользователь хочет вручную поддерживать навыки, он использует те же стандартные инструменты.
2. **Обнаружение изменений навыков вместо сброса счётчика инструментов**: По аналогии с memory extract, который отслеживает вызовы `memory_tool`, система отслеживает, есть ли в основной сессии какие-либо операции записи, попадающие в директорию `.qwen/skills/`. Если да, это означает, что пользователь уже активно работал с навыками в этой сессии, и по окончании сессии автоматический skill review пропускается.
3. **Маркер `auto-skill` защищает навыки, созданные пользователем**: Навыки, созданные review agent’ом, должны содержать в YAML frontmatter маркер `source: auto-skill`. Skill review agent может изменять только навыки с этим маркером и не должен трогать навыки, созданные вручную пользователем.
4. **Запуск по плотности вызовов инструментов**: Запускается только при общем количестве вызовов инструментов в сессии ≥ 20, чтобы извлечение происходило только после действительно сложных задач.
5. **Чёткие границы защиты записи**: Менеджер разрешений review agent’а ограничивает `write_file` и `edit` директорией `${projectRoot}/.qwen/skills/`, не позволяя затрагивать уровни user / extension / bundled.
6. **Максимальное сохранение основного промпта Hermes**: Подсказка, используемая review agent’ом, напрямую переносится из `_SKILL_REVIEW_PROMPT` Hermes, с минимальной адаптацией.

---

## Изменения архитектуры

### 1. Счётчики: `toolCallCount` и обнаружение изменений навыков

В состоянии сессии поддерживаются два параллельно отслеживаемых параметра:

**Счётчик вызовов инструментов** (определяет, нужно ли запускать skill review):

```
Начало сессии
  toolCallCount = 0

Каждый завершённый вызов инструмента
  toolCallCount += 1

Конец сессии
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // по умолчанию 20
    Проверить skillsModifiedInSession
    ├─ true  → пропустить (в этой сессии уже вручную работали с навыками, автоматический review не нужен)
    └─ false → scheduleSkillReview()
```

**Обнаружение изменений навыков** (заменяет сброс при вызове `skill_manage`):

```
Каждый завершённый вызов инструмента
  if (целевой путь вызова инструмента находится в ${projectRoot}/.qwen/skills/):
    skillsModifiedInSession = true
```

Логика обнаружения: сканировать пути файлов, задействованные в результатах вызова инструментов, и проверять, попадают ли они в директорию skills. Конкретная реализация основана на шаблоне `historyCallsSkillManage()` — перебирать результаты вызовов инструментов в `history`, извлекать целевые пути для операций записи (`write_file`, `edit` и т.п.) и выполнять проверку по префиксу.

> **Почему обнаружение изменений навыков вместо обнаружения по имени инструмента?**
> Специализированного инструмента `skill_manage` больше нет, и основная сессия, и review agent используют стандартные `write_file`/`edit`. Поэтому измерение изменилось с «был ли вызван определённый инструмент» на «была ли операция записи в директорию `.qwen/skills/`», что семантически точнее: если пользователь уже активно работал с файлами навыков в этой сессии, автоматический review пропускается.

> **Почему количество вызовов инструментов, а не количество оборотов диалога?**
> Количество вызовов инструментов отражает сложность задачи — одно сообщение пользователя может вызвать 1 или 30 вызовов инструментов. Высокая плотность вызовов означает больше проб, ошибок, корректировок стратегии и, следовательно, выше вероятность получения повторно используемого опыта. Порог 20 более консервативен, чем 10 у Hermes, потому что QwenCode обычно использует более мелкие вызовы инструментов (например, построчное редактирование).

### 2. Точка запуска

Существующая точка вызова `MemoryManager` (завершение сессии) используется как единый вход, расширенный для возможности запуска skill review.

```
Конец сессии
  ├─ scheduleExtract(params)           // существующая логика без изменений
  └─ scheduleSkillReview(params)       // новый вызов
       Условия: toolCallCount >= AUTO_SKILL_THRESHOLD
                && !skillsModifiedInSession
```

Extract и skill review запускаются независимо, параллельно через `MemoryManager.track()`, не блокируя друг друга.

### 3. Права доступа к инструментам Skill Review Agent

Skill review agent **не использует** специализированный инструмент `skill_manage`, а работает напрямую со стандартными файловыми инструментами:

| Инструмент   | Назначение                                                         | Ограничения по области                                           |
| ------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `read_file`  | Чтение существующего навыка, проверка frontmatter                  | Без ограничений                                                  |
| `ls`         | Сканирование структуры директории `.qwen/skills/`                  | Без ограничений                                                  |
| `write_file` | Создание нового файла навыка                                       | Только внутри `${projectRoot}/.qwen/skills/`                     |
| `edit`       | Изменение существующего навыка                                     | Только внутри `${projectRoot}/.qwen/skills/`, целевой файл должен содержать `source: auto-skill` |
| `shell`      | Только команды для чтения (например, `cat`, `find`)                | Разрешены только команды для чтения (статический анализ Shell AST) |

**Дополнительное ограничение для `edit` (защита `auto-skill`)**:

Перед выполнением `edit` или `write_file` (перезапись существующего файла) менеджер разрешений skill review agent’а читает YAML frontmatter целевого файла и проверяет наличие поля `source: auto-skill`. Если поле отсутствует, запись отклоняется с сообщением об ошибке:

```
skill_review_agent: edit is only allowed on skills with 'source: auto-skill' in frontmatter.
This skill appears to be user-created. Modify it manually or ask the user.
```

Эта проверка реализована на уровне разрешений в `createSkillScopedAgentConfig`, а не только в system prompt, чтобы гарантировать, что даже при ошибке модели навыки, созданные вручную пользователем, не будут перезаписаны.

**Доступ к инструментам в основной сессии**: Основной агент не ограничивает чтение/запись `.qwen/skills/` — пользователь может управлять навыками через обычные команды `write_file`/`edit`. Такие операции вызывают `skillsModifiedInSession = true`, что приводит к пропуску автоматического skill review при завершении сессии.

### 4. Песочница разрешений: `SkillScopedPermissionManager`

По аналогии с `createMemoryScopedAgentConfig` в `extractionAgentPlanner.ts`, создаётся специализированная область разрешений для skill review agent’а:

```typescript
// Разрешённые операции для skill review agent
read_file:    без ограничений по пути (требуется для чтения любых файлов для понимания контекста проекта)
ls:           без ограничений по пути
shell:        только команды для чтения (статический анализ Shell AST, используется существующий isShellCommandReadOnlyAST)
write_file:   только файлы в ${projectRoot}/.qwen/skills/ (создание нового навыка)
edit:         только файлы в ${projectRoot}/.qwen/skills/, содержащие source: auto-skill
```

**Уровни реализации защиты `auto-skill`**:

1. **Уровень менеджера разрешений** (жёсткое ограничение): перед `edit` читается frontmatter, если нет `source: auto-skill` — отказ
2. **Уровень system prompt** (мягкое ограничение): явно сообщается агенту, что можно изменять только навыки с маркером `source: auto-skill`
3. **Двойная гарантия**: даже если ограничение из system prompt будет обойдено, менеджер разрешений перехватит попытку

---

## Проектирование Skill Review Agent

### Запускающий промпт (перенесён из Hermes, минимальная адаптация)

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

### Конфигурация агента

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // чтение существующего навыка, проверка source: auto-skill
    "ls",          // сканирование директории .qwen/skills/
    "write_file",  // создание нового файла навыка (менеджер разрешений ограничивает путь)
    "edit",        // изменение существующего auto-skill (менеджер разрешений проверяет frontmatter)
    "shell",       // только команды для чтения (например, find, cat)
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // передаётся снимок полной истории диалога
}
```

---

## Интеграция с существующим MemoryManager

### `ScheduleSkillReviewParams` (новый тип)

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // снимок полной истории сессии
  toolCallCount: number; // количество вызовов инструментов в этой сессии
  skillsModified: boolean; // были ли операции записи в .qwen/skills/ в этой сессии
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

### `MemoryManager.scheduleSkillReview()` (новый метод)

```typescript
scheduleSkillReview(params: ScheduleSkillReviewParams): SkillReviewScheduleResult {
  // 1. Проверка включения
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. Проверка порога
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. Если в этой сессии уже активно работали с навыками, пропускаем автоматический review
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. Независимый запуск
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### Расширение типов задач

```typescript
// Расширяем существующий MemoryTaskRecord.taskType
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// Константы
export const AUTO_SKILL_THRESHOLD = 20; // порог количества вызовов инструментов
```

---

## Поток данных

```
Сессия в процессе
  Основной цикл агента
    ├─ каждый вызов инструмента → toolCallCount += 1
    └─ если целевой путь операции записи находится в ${projectRoot}/.qwen/skills/
         → skillsModifiedInSession = true

Завершение сессии (событие sessionEnd)
  ├─ scheduleExtract(params)
  │     └─ [существующая логика: fork extraction agent → запись в .qwen/memory/]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ нет → пропустить (недостаточная плотность или в этой сессии уже работали с навыками)
       └─ да → scheduleSkillReview(params)
                 └─ независимый fork skill review agent
                        ↓
                 Skill review agent (макс. 8 шагов, 2 мин, песочница разрешений)
                 Инструменты: read_file, ls, write_file, edit, shell
                 Передаётся полный sessionHistory
                        ↓
                 Модель оценивает, есть ли повторно используемый метод
                 ├─ есть → чтение существующего навыка (проверка source: auto-skill)
                 │         → write_file создание нового навыка (с source: auto-skill)
                 │         → edit обновление существующего auto-skill
                 │         → инвалидация кэша SkillManager (notifyChangeListeners)
                 └─ нет → "Nothing to save." завершение

Следующая сессия
  SkillManager.listSkills({ level: 'project' })
  → сканирование .qwen/skills/ обнаружение нового навыка
  → внедрение в блок <available_skills> system prompt (Tier 1)
```

---

## Соглашение о формате SKILL.md (project-level)

Автоматически извлечённый навык записывается в `${projectRoot}/.qwen/skills/<name>/SKILL.md`, формат полностью совместим с существующим SkillManager:

```yaml
---
name: <skill-name> # обязательно, строчные буквы + дефис
description: <description> # обязательно, ≤ 1024 символа
version: 1.0.0
metadata:
  source: auto-skill # обязательно (принудительно записывается при создании review agent’ом)
  extracted_at: '2026-04-24T12:00:00Z'
---
# <Заголовок навыка>

<Шаги выполнения / Лучшие практики / Примечания>
```

**Семантика ограничения `source: auto-skill`**:

| Значение маркера | Создатель              | Может изменять review agent? | Может изменять пользователь? |
| ---------------- | ---------------------- | ---------------------------- | ---------------------------- |
| `auto-skill`     | review agent           | ✅ Да                        | ✅ Да                        |
| Нет такого поля  | Создано вручную пользователем | ❌ Нет (перехват менеджером разрешений) | ✅ Да                        |

Если пользователь добавит `source: auto-skill` к своему навыку, это означает, что он разрешает review agent’у автоматически обновлять его в будущем.

---

## Соображения безопасности

| Риск                                              | Меры смягчения                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Автоматическое извлечение перезаписывает тщательно проработанный навык пользователя | Менеджер разрешений читает frontmatter, отклоняет `edit` при отсутствии `source: auto-skill`; system prompt также явно указывает, что можно изменять только auto-skill |
| Неограниченный рост навыков                       | Промпт review чётко говорит «приоритет обновления существующего навыка»; обновление существующего навыка предпочтительнее создания нового |
| Запись за пределами проекта                       | Разрешения `write_file`/`edit` ограничены `${projectRoot}/.qwen/skills/`; `assertRealProjectSkillPath` отклоняет обход через symlink |
| Извлечение контента с риском инъекций             | Используется существующая логика сканирования безопасности контента                                             |
| Review agent удаляет навык                        | Набор инструментов review agent’а не содержит операций удаления (нет `rm`, нет операций записи через `shell`); system prompt явно запрещает удаление |
| Review запускается после ручного редактирования навыков в основной сессии | Проверка `skillsModifiedInSession`: если в основной сессии были операции записи в `.qwen/skills/`, review пропускается |
| Обход через symlink для записи за пределы директории skills | `assertRealProjectSkillPath` (async): использует `fs.realpath()` для определения реального пути, проверяет, что он находится внутри настоящего корня skills, прежде чем разрешить запись |

---

## Параметры конфигурации

В конфигурацию QwenCode добавляются следующие опциональные параметры (со значениями по умолчанию):

```typescript
// Новое в схеме конфигурации (в разделе memory)
memory?: {
  enableAutoSkill?: boolean;   // по умолчанию true
}
```

Пример конфигурации в QWEN.md / `~/.qwen/config.json`:

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## Контрольный список E2E-тестов

После завершения реализации, следуя процедуре из `.qwen/skills/e2e-testing/SKILL.md`, сначала выполните `npm run build && npm run bundle`, затем используйте локально собранный артефакт `node dist/cli.js` для сквозной проверки.

### 1. Низкая плотность вызовов инструментов не запускает review

- Запустите headless-режим, используя временную директорию проекта.
- Настройте `memory.enableAutoSkill: true`.
- Выполните простую задачу, требующую небольшого количества вызовов инструментов, и корректно завершите сессию.
- Убедитесь, что в `.qwen/skills/` не появился новый навык с `source: auto-skill`; в JSON-потоке не должно быть операций записи в `.qwen/skills/`.

### 2. Запуск skill review после достижения порога

- Запустите headless-режим, используя временную директорию проекта (`AUTO_SKILL_THRESHOLD` жёстко закодирован как 20, можно уменьшить в тестовой обвязке).
- Отправьте задачу, требующую множества вызовов инструментов и содержащую повторно используемый процесс.
- Убедитесь, что после завершения сессии был запланирован skill review; если модель решит, что навык стоит сохранить, `.qwen/skills/<name>/SKILL.md` будет создан, а frontmatter будет содержать `source: auto-skill`.
- Если модель решит "Nothing to save.", убедитесь, что процесс завершился корректно и без ошибок прав доступа.

### 3. Пропуск review, если в основной сессии работали с навыками

- Создайте сессию, в которой при достижении порога вызовов инструментов также выполняется `write_file` или `edit` в файл внутри `.qwen/skills/` (имитация ручного управления навыками пользователем).
- Убедитесь, что при завершении сессии `skillsModifiedInSession = true`, а `scheduleSkillReview` возвращает `skippedReason: 'skills_modified_in_session'`.
- Убедитесь, что review agent не запускается, чтобы избежать дублирования записи.

### 4. Защита записи разрешает только project-level навыки

- Попробуйте через skill review agent записать в путь за пределами проекта, в user-level навык или bundled-навык.
- Убедитесь, что запись отклонена с сообщением об ошибке о том, что запись разрешена только в `${projectRoot}/.qwen/skills/`.
- Убедитесь, что запись в `${projectRoot}/.qwen/skills/<name>/SKILL.md` разрешена.

### 5. Маркер `auto-skill` защищает навыки, созданные пользователем

- Разместите в `.qwen/skills/` предварительно созданный пользовательский навык без `source: auto-skill`.
- Запустите skill review agent и направьте модель на попытку изменения этого навыка.
- Убедитесь, что запись отклонена менеджером разрешений с сообщением о том, что навык не является auto-skill.
- Убедитесь, что навык с `source: auto-skill` в той же директории может быть успешно обновлён.

### 6. Обход через symlink отклоняется

- Создайте в `.qwen/skills/` символическую ссылку на директорию за пределами проекта.
- Запустите skill review agent, пытающийся записать по этому пути через symlink.
- Убедитесь, что `assertRealProjectSkillPath` отклоняет запись с ошибкой "symlink traversal detected".

### 7. Работа переключателя конфигурации

- Настройте `memory.enableAutoSkill: false`; даже после превышения порога вызовов инструментов review не запускается.
- Проверьте, что при значении по умолчанию (включено, `enableAutoSkill` не задан или `true`) после достижения порога вызовов инструментов review запускается корректно.

### 8. Проверка с локально собранным артефактом

- Используя e2e-testing skill, выполните headless JSON-вывод:
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`.
- При необходимости добавьте `--openai-logging --openai-logging-dir <tmp-dir>` для проверки схем инструментов, промпта и конфигурации разрешений в теле запроса.
- Для сценариев, связанных с видимым состоянием TUI или sessionEnd, используйте tmux interactive-процесс для захвата окончательного вывода.

## Связь с существующей системой

```
Существующий MemoryManager
  ├─ scheduleExtract()       ← без изменений
  ├─ scheduleDream()         ← без изменений
  ├─ recall()                ← без изменений
  ├─ forget()                ← без изменений
  └─ scheduleSkillReview()   ← новое (данный документ)

Существующий SkillManager
  ├─ listSkills()            ← без изменений (автоматически обнаруживает новые файлы в .qwen/skills/)
  └─ loadSkill()             ← без изменений

Существующие файловые инструменты (read_file / write_file / edit)
  ├─ в основной сессии: пользователь может управлять навыками через эти инструменты
  │   └─ операции записи в .qwen/skills/ → skillsModifiedInSession = true
  └─ в skill review agent: используются напрямую для создания/обновления auto-skill
      └─ менеджер разрешений ограничивает путь и проверяет source: auto-skill

Точка запуска (существующий хук sessionEnd)
  └─ одновременно вызывает scheduleExtract + scheduleSkillReview (при соблюдении условий)
```

Сторона чтения SkillManager (`listSkills`, `loadSkill`) не требует никаких изменений — после того как review agent записывает в `${projectRoot}/.qwen/skills/`, `SkillManager` через существующий file watcher (`chokidar`) автоматически обнаруживает изменения, вызывает `notifyChangeListeners()` для сброса кэша, и новый навык будет виден в system prompt при следующем диалоге.