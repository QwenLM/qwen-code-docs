# Команды CLI

Qwen Code поддерживает несколько встроенных команд, которые помогут вам управлять сессией, настраивать интерфейс и контролировать его поведение. Эти команды начинаются с косой черты (`/`), символа @ (`@`) или восклицательного знака (`!`).

## Слэш-команды (`/`)

Слэш-команды предоставляют мета-уровень управления самим CLI.

### Built-in Commands

- **`/bug`**
  - **Description:** File an issue about Qwen Code. By default, the issue is filed within the GitHub repository for Qwen Code. The string you enter after `/bug` will become the headline for the bug being filed. The default `/bug` behavior can be modified using the `bugCommand` setting in your `.qwen/settings.json` files.

- **`/chat`**
  - **Description:** Save and resume conversation history for branching conversation state interactively, or resuming a previous state from a later session.
  - **Sub-commands:**
    - **`save`**
      - **Description:** Saves the current conversation history. You must add a `<tag>` for identifying the conversation state.
      - **Usage:** `/chat save <tag>`
      - **Details on Checkpoint Location:** The default locations for saved chat checkpoints are:
        - Linux/macOS: `~/.qwen/tmp/<project_hash>/`
        - Windows: `C:\Users\<YourUsername>\.qwen\tmp\<project_hash>\`
        - When you run `/chat list`, the CLI only scans these specific directories to find available checkpoints.
        - **Note:** These checkpoints are for manually saving and resuming conversation states. For automatic checkpoints created before file modifications, see the [Checkpointing documentation](../checkpointing.md).
    - **`resume`**
      - **Description:** Resumes a conversation from a previous save.
      - **Usage:** `/chat resume <tag>`
    - **`list`**
      - **Description:** Lists available tags for chat state resumption.
    - **`delete`**
      - **Description:** Deletes a saved conversation checkpoint.
      - **Usage:** `/chat delete <tag>`

- **`/clear`**
  - **Description:** Clear the terminal screen, including the visible session history and scrollback within the CLI. The underlying session data (for history recall) might be preserved depending on the exact implementation, but the visual display is cleared.
  - **Keyboard shortcut:** Press **Ctrl+L** at any time to perform a clear action.

- **`/summary`**
  - **Description:** Generate a comprehensive project summary from the current conversation history and save it to `.qwen/PROJECT_SUMMARY.md`. This summary includes the overall goal, key knowledge, recent actions, and current plan, making it perfect for resuming work in future sessions.
  - **Usage:** `/summary`
  - **Features:**
    - Analyzes the entire conversation history to extract important context
    - Creates a structured markdown summary with sections for goals, knowledge, actions, and plans
    - Automatically saves to `.qwen/PROJECT_SUMMARY.md` in your project root
    - Shows progress indicators during generation and saving
    - Integrates with the Welcome Back feature for seamless session resumption
  - **Note:** This command requires an active conversation with at least 2 messages to generate a meaningful summary.

- **`/compress`**
  - **Description:** Replace the entire chat context with a summary. This saves on tokens used for future tasks while retaining a high level summary of what has happened.

- **`/copy`**
  - **Description:** Copies the last output produced by Qwen Code to your clipboard, for easy sharing or reuse.

- **`/directory`** (or **`/dir`**)
  - **Description:** Manage workspace directories for multi-directory support.
  - **Sub-commands:**
    - **`add`**:
      - **Description:** Add a directory to the workspace. The path can be absolute or relative to the current working directory. Moreover, the reference from home directory is supported as well.
      - **Usage:** `/directory add <path1>,<path2>`
      - **Note:** Disabled in restrictive sandbox profiles. If you're using that, use `--include-directories` when starting the session instead.
    - **`show`**:
      - **Description:** Display all directories added by `/directory add` and `--include-directories`.
      - **Usage:** `/directory show`

- **`/directory`** (or **`/dir`**)
  - **Description:** Manage workspace directories for multi-directory support.
  - **Sub-commands:**
    - **`add`**:
      - **Description:** Add a directory to the workspace. The path can be absolute or relative to the current working directory. Moreover, the reference from home directory is supported as well.
      - **Usage:** `/directory add <path1>,<path2>`
      - **Note:** Disabled in restrictive sandbox profiles. If you're using that, use `--include-directories` when starting the session instead.
    - **`show`**:
      - **Description:** Display all directories added by `/directory add` and `--include-directories`.
      - **Usage:** `/directory show`

- **`/editor`**
  - **Description:** Open a dialog for selecting supported editors.

- **`/extensions`**
  - **Description:** Lists all active extensions in the current Qwen Code session. See [Qwen Code Extensions](../extension.md).

- **`/help`** (or **`/?`**)
  - **Description:** Display help information about the Qwen Code, including available commands and their usage.

- **`/mcp`**
  - **Description:** List configured Model Context Protocol (MCP) servers, their connection status, server details, and available tools.
  - **Sub-commands:**
    - **`desc`** or **`descriptions`**:
      - **Description:** Show detailed descriptions for MCP servers and tools.
    - **`nodesc`** or **`nodescriptions`**:
      - **Description:** Hide tool descriptions, showing only the tool names.
    - **`schema`**:
      - **Description:** Show the full JSON schema for the tool's configured parameters.
  - **Keyboard Shortcut:** Press **Ctrl+T** at any time to toggle between showing and hiding tool descriptions.

- **`/memory`**
  - **Description:** Manage the AI's instructional context (hierarchical memory loaded from `QWEN.md` files by default; configurable via `contextFileName`).
  - **Sub-commands:**
    - **`add`**:
      - **Description:** Adds the following text to the AI's memory. Usage: `/memory add <text to remember>`
    - **`show`**:
      - **Description:** Display the full, concatenated content of the current hierarchical memory that has been loaded from all context files (e.g., `QWEN.md`). This lets you inspect the instructional context being provided to the model.
    - **`refresh`**:
      - **Description:** Reload the hierarchical instructional memory from all context files (default: `QWEN.md`) found in the configured locations (global, project/ancestors, and sub-directories). This updates the model with the latest context content.
    - **Note:** For more details on how context files contribute to hierarchical memory, see the [CLI Configuration documentation](./configuration.md#context-files-hierarchical-instructional-context).

- **`/restore`**
  - **Description:** Restores the project files to the state they were in just before a tool was executed. This is particularly useful for undoing file edits made by a tool. If run without a tool call ID, it will list available checkpoints to restore from.
  - **Usage:** `/restore [tool_call_id]`
  - **Note:** Only available if the CLI is invoked with the `--checkpointing` option or configured via [settings](./configuration.md). See [Checkpointing documentation](../checkpointing.md) for more details.

- **`/settings`**
  - **Description:** Open the settings editor to view and modify Qwen Code settings.
  - **Details:** This command provides a user-friendly interface for changing settings that control the behavior and appearance of Qwen Code. It is equivalent to manually editing the `.qwen/settings.json` file, but with validation and guidance to prevent errors.
  - **Usage:** Simply run `/settings` and the editor will open. You can then browse or search for specific settings, view their current values, and modify them as desired. Changes to some settings are applied immediately, while others require a restart.

- **`/stats`**
  - **Description:** Display detailed statistics for the current Qwen Code session, including token usage, cached token savings (when available), and session duration. Note: Cached token information is only displayed when cached tokens are being used, which occurs with API key authentication but not with OAuth authentication at this time.

- [**`/theme`**](./themes.md)
  - **Description:** Open a dialog that lets you change the visual theme of Qwen Code.

- **`/auth`**
  - **Description:** Open a dialog that lets you change the authentication method.

- **`/approval-mode`**
  - **Description:** Change the approval mode for tool usage.
  - **Usage:** `/approval-mode [mode] [--session|--project|--user]`
  - **Available Modes:**
    - **`plan`**: Analyze only; do not modify files or execute commands
    - **`default`**: Require approval for file edits or shell commands
    - **`auto-edit`**: Automatically approve file edits
    - **`yolo`**: Automatically approve all tools
  - **Examples:**
    - `/approval-mode plan --project` (persist plan mode for this project)
    - `/approval-mode yolo --user` (persist YOLO mode for this user across projects)

- **`/about`**
  - **Description:** Show version info. Please share this information when filing issues.

- **`/agents`**
  - **Description:** Manage specialized AI subagents for focused tasks. Subagents are independent AI assistants configured with specific expertise and tool access.
  - **Sub-commands:**
    - **`create`**:
      - **Description:** Launch an interactive wizard to create a new subagent. The wizard guides you through location selection, AI-powered prompt generation, tool selection, and visual customization.
      - **Usage:** `/agents create`
    - **`manage`**:
      - **Description:** Open an interactive management dialog to view, edit, and delete existing subagents. Shows both project-level and user-level agents.
      - **Usage:** `/agents manage`
  - **Storage Locations:**
    - **Project-level:** `.qwen/agents/` (shared with team, takes precedence)
    - **User-level:** `~/.qwen/agents/` (personal agents, available across projects)
  - **Note:** For detailed information on creating and managing subagents, see the [Subagents documentation](../subagents.md).

- [**`/tools`**](../tools/index.md)
  - **Description:** Display a list of tools that are currently available within Qwen Code.
  - **Usage:** `/tools [desc]`
  - **Sub-commands:**
    - **`desc`** or **`descriptions`**:
      - **Description:** Show detailed descriptions of each tool, including each tool's name with its full description as provided to the model.
    - **`nodesc`** or **`nodescriptions`**:
      - **Description:** Hide tool descriptions, showing only the tool names.

- **`/privacy`**
  - **Description:** Display the Privacy Notice and allow users to select whether they consent to the collection of their data for service improvement purposes.

- **`/quit-confirm`**
  - **Description:** Show a confirmation dialog before exiting Qwen Code, allowing you to choose how to handle your current session.
  - **Usage:** `/quit-confirm`
  - **Features:**
    - **Quit immediately:** Exit without saving anything (equivalent to `/quit`)
    - **Generate summary and quit:** Create a project summary using `/summary` before exiting
    - **Save conversation and quit:** Save the current conversation with an auto-generated tag before exiting
  - **Keyboard shortcut:** Press **Ctrl+C** twice to trigger the quit confirmation dialog
  - **Note:** This command is automatically triggered when you press Ctrl+C once, providing a safety mechanism to prevent accidental exits.

- **`/quit`** (or **`/exit`**)
  - **Description:** Exit Qwen Code immediately without any confirmation dialog.

- **`/vim`**
  - **Description:** Toggle vim mode on or off. When vim mode is enabled, the input area supports vim-style navigation and editing commands in both NORMAL and INSERT modes.
  - **Features:**
    - **NORMAL mode:** Navigate with `h`, `j`, `k`, `l`; jump by words with `w`, `b`, `e`; go to line start/end with `0`, `$`, `^`; go to specific lines with `G` (or `gg` for first line)
    - **INSERT mode:** Standard text input with escape to return to NORMAL mode
    - **Editing commands:** Delete with `x`, change with `c`, insert with `i`, `a`, `o`, `O`; complex operations like `dd`, `cc`, `dw`, `cw`
    - **Count support:** Prefix commands with numbers (e.g., `3h`, `5w`, `10G`)
    - **Repeat last command:** Use `.` to repeat the last editing operation
    - **Persistent setting:** Vim mode preference is saved to `~/.qwen/settings.json` and restored between sessions
  - **Status indicator:** When enabled, shows `[NORMAL]` or `[INSERT]` in the footer

- **`/init`**
  - **Description:** Analyzes the current directory and creates a `QWEN.md` context file by default (or the filename specified by `contextFileName`). If a non-empty file already exists, no changes are made. The command seeds an empty file and prompts the model to populate it with project-specific instructions.

### Пользовательские команды

Для быстрого начала работы ознакомьтесь с [примером](#example-a-pure-function-refactoring-command) ниже.

Пользовательские команды позволяют сохранять и повторно использовать ваши любимые или наиболее часто используемые prompts в виде персональных shortcuts внутри Qwen Code. Вы можете создавать команды, специфичные для одного проекта, или команды, доступные глобально во всех ваших проектах, оптимизируя свой workflow и обеспечивая согласованность.

#### Расположение файлов и приоритет

Qwen Code обнаруживает команды из двух мест, загружая их в определённом порядке:

1.  **Пользовательские команды (глобальные):** Расположены в `~/.qwen/commands/`. Эти команды доступны во всех проектах, над которыми вы работаете.
2.  **Команды проекта (локальные):** Расположены в `<your-project-root>/.qwen/commands/`. Эти команды специфичны для текущего проекта и могут быть добавлены в систему контроля версий, чтобы быть доступными для вашей команды.

Если команда в директории проекта имеет то же имя, что и команда в пользовательской директории, **всегда будет использоваться команда проекта.** Это позволяет проектам переопределять глобальные команды своими версиями, специфичными для проекта.

#### Именование и пространства имён

Имя команды определяется путем к файлу относительно директории `commands`. Подкаталоги используются для создания команд с пространствами имён, при этом разделитель пути (`/` или `\`) преобразуется в двоеточие (`:`).

- Файл `~/.qwen/commands/test.toml` становится командой `/test`.
- Файл `<project>/.qwen/commands/git/commit.toml` становится командой с пространством имён `/git:commit`.

#### Формат TOML (v1)

Файлы определения команд должны быть написаны в формате TOML и иметь расширение `.toml`.

##### Обязательные поля

- `prompt` (String): Подсказка, которая будет отправлена модели при выполнении команды. Может быть однострочной или многострочной строкой.

##### Необязательные поля

- `description` (String): Краткое описание в одну строку того, что делает команда. Этот текст будет отображаться рядом с вашей командой в меню `/help`. **Если вы опустите это поле, будет сгенерировано общее описание на основе имени файла.**

#### Работа с аргументами

Пользовательские команды поддерживают два мощных метода обработки аргументов. CLI автоматически выбирает правильный метод на основе содержимого `prompt` вашей команды.

##### 1. Контекстно-зависимая инъекция с `{{args}}`

Если ваш `prompt` содержит специальный placeholder `{{args}}`, CLI заменит этот placeholder на текст, который пользователь ввел после имени команды.

Поведение этой инъекции зависит от места использования:

**A. Прямая инъекция (вне shell-команд)**

Когда используется в основном теле prompt, аргументы инжектируются точно так, как их ввел пользователь.

**Пример (`git/fix.toml`):**

```toml

```markdown
# Вызывается через: /git:fix "Button is misaligned"

description = "Генерирует фикс для указанной проблемы."
prompt = "Пожалуйста, предоставьте код для исправления описанной здесь проблемы: {{args}}."
```

Модель получает: `Пожалуйста, предоставьте код для исправления описанной здесь проблемы: "Button is misaligned".`

**B. Использование аргументов в Shell командах (внутри блоков `!{...}`)**

Когда вы используете `{{args}}` внутри блока shell-инъекции (`!{...}`), аргументы автоматически **экранируются для shell** перед подстановкой. Это позволяет безопасно передавать аргументы в shell-команды, гарантируя, что результирующая команда будет синтаксически корректной и безопасной, предотвращая уязвимости типа command injection.

**Пример (`/grep-code.toml`):**

```toml
prompt = """
Пожалуйста, суммируйте результаты поиска по паттерну `{{args}}`.

Результаты поиска:
!{grep -r {{args}} .}
"""
```

Когда вы запускаете `/grep-code It's complicated`:

1. CLI видит, что `{{args}}` используется и вне, и внутри `!{...}`.
2. Вне: Первый `{{args}}` заменяется как есть на `It's complicated`.
3. Внутри: Второй `{{args}}` заменяется на экранированную версию (например, в Linux: `"It's complicated"`).
4. Выполняемая команда: `grep -r "It's complicated" .`.
5. CLI предлагает вам подтвердить выполнение именно этой безопасной команды.
6. Финальный prompt отправляется.
```

##### 2. Обработка аргументов по умолчанию

Если ваш `prompt` **не содержит** специальный placeholder `{{args}}`, CLI использует поведение по умолчанию для обработки аргументов.

Если вы передаёте аргументы команде (например, `/mycommand arg1`), CLI добавит полную команду, которую вы ввели, в конец prompt через два символа новой строки. Это позволяет модели видеть как оригинальные инструкции, так и конкретные аргументы, которые вы только что передали.

Если вы **не передаёте** никаких аргументов (например, `/mycommand`), prompt отправляется модели в точности как есть, без каких-либо дополнений.

**Пример (`changelog.toml`):**

Этот пример показывает, как создать надежную команду, определив роль для модели, объяснив, где искать пользовательский ввод, и указав ожидаемый формат и поведение.

```toml

# In: <project>/.qwen/commands/changelog.toml

# Вызывается через: /changelog 1.2.0 added "Support for default argument parsing."

description = "Добавляет новую запись в файл CHANGELOG.md проекта."
prompt = """

# Задача: Обновление Changelog

Вы являетесь экспертом по сопровождению данного программного проекта. Пользователь вызвал команду для добавления новой записи в changelog.

**Необработанная команда пользователя приведена ниже ваших инструкций.**

Ваша задача — распарсить `<version>`, `<change_type>` и `<message>` из ввода пользователя и использовать инструмент `write_file`, чтобы правильно обновить файл `CHANGELOG.md`.

## Ожидаемый формат
Команда имеет следующий формат: `/changelog <version> <type> <message>`
- `<type>` должен быть одним из: "added", "changed", "fixed", "removed".

## Поведение
1. Прочитать файл `CHANGELOG.md`.
2. Найти секцию для указанной `<version>`.
3. Добавить `<message>` под правильным заголовком `<type>`.
4. Если секция версии или типа не существует, создать её.
5. Строго придерживаться формата "Keep a Changelog".
"""
```

Когда вы запускаете `/changelog 1.2.0 added "New feature"`, финальный текст, отправляемый модели, будет состоять из оригинального prompt, за которым следуют два символа новой строки и введённая вами команда.

##### 3. Выполнение Shell-команд с помощью `!{...}`

Вы можете сделать свои команды динамическими, выполняя shell-команды прямо внутри вашего `prompt` и подставляя их вывод. Это идеально подходит для сбора контекста из локального окружения, например, чтения содержимого файлов или проверки статуса Git.

Когда кастомная команда пытается выполнить shell-команду, Qwen Code теперь будет запрашивать у вас подтверждение перед выполнением. Это мера безопасности, чтобы гарантировать, что выполняются только намеренные команды.

**Как это работает:**

1.  **Инъекция команд:** Используйте синтаксис `!{...}`.
2.  **Подстановка аргументов:** Если внутри блока присутствует `{{args}}`, он автоматически экранируется в shell (см. [Context-Aware Injection](#1-context-aware-injection-with-args) выше).
3.  **Надежный парсинг:** Парсер корректно обрабатывает сложные shell-команды, включая вложенные фигурные скобки, такие как JSON-полезные нагрузки. **Примечание:** Содержимое внутри `!{...}` должно иметь сбалансированные фигурные скобки (`{` и `}`). Если вам нужно выполнить команду, содержащую несбалансированные скобки, рассмотрите возможность обернуть её во внешний скрипт и вызвать этот скрипт внутри блока `!{...}`.
4.  **Проверка безопасности и подтверждение:** CLI выполняет проверку безопасности финальной, резолвнутой команды (после экранирования и подстановки аргументов). Появится диалоговое окно с точным списком команд, которые будут выполнены.
5.  **Выполнение и отчет об ошибках:** Команда выполняется. Если команда завершается с ошибкой, в вывод, внедряемый в prompt, будут включены сообщения об ошибках (stderr), за которыми следует строка статуса, например, `[Shell command exited with code 1]`. Это помогает модели понять контекст сбоя.

**Пример (`git/commit.toml`):**

Эта команда получает staged git diff и использует его, чтобы попросить модель написать сообщение коммита.

````toml

```markdown
# In: <project>/.qwen/commands/git/commit.toml

# Invoked via: /git:commit

description = "Генерирует сообщение Git commit на основе staged изменений."

# В prompt используется !{...} для выполнения команды и подстановки её вывода.
prompt = """
Пожалуйста, сгенерируй сообщение Conventional Commit на основе следующего git diff:

```diff
!{git diff --staged}
```

"""

```

Когда вы запускаете `/git:commit`, CLI сначала выполняет `git diff --staged`, затем заменяет `!{git diff --staged}` на вывод этой команды, после чего отправляет окончательный prompt в модель.
```

##### 4. Вставка содержимого файлов с помощью `@{...}`

Вы можете напрямую вставлять содержимое файла или список файлов в директории в ваш prompt, используя синтаксис `@{...}`. Это удобно для создания команд, работающих с конкретными файлами.

**Как это работает:**

- **Вставка файла**: `@{path/to/file.txt}` заменяется содержимым `file.txt`.
- **Поддержка мультимодальных данных**: Если путь указывает на поддерживаемый формат изображения (например, PNG, JPEG), PDF, аудио или видео, файл будет корректно закодирован и вставлен как мультимодальный input. Другие бинарные файлы обрабатываются корректно и пропускаются.
- **Список файлов в директории**: `@{path/to/dir}` обрабатывается рекурсивно, и все файлы в директории и её поддиректориях вставляются в prompt. При этом учитываются `.gitignore` и `.qwenignore`, если они включены.
- **Работа с рабочим пространством**: Поиск пути осуществляется в текущей директории и других директориях рабочего пространства. Допускаются абсолютные пути, если они находятся в пределах рабочего пространства.
- **Порядок обработки**: Вставка содержимого файлов через `@{...}` происходит _до_ выполнения shell-команд (`!{...}`) и подстановки аргументов (`{{args}}`).
- **Парсинг**: Парсер требует, чтобы содержимое внутри `@{...}` (путь) содержало сбалансированные фигурные скобки (`{` и `}`).

**Пример (`review.toml`):**

Эта команда вставляет содержимое _фиксированного_ файла с лучшими практиками (`docs/best-practices.md`) и использует аргументы пользователя для контекста ревью.

```toml

```markdown
# In: <project>/.qwen/commands/review.toml

# Invoked via: /review FileCommandLoader.ts

description = "Reviews the provided context using a best practice guide."
prompt = """
You are an expert code reviewer.

Your task is to review {{args}}.

Use the following best practices when providing your review:

@{docs/best-practices.md}
"""
```

Когда вы запускаете `/review FileCommandLoader.ts`, placeholder `@{docs/best-practices.md}` заменяется содержимым этого файла, а `{{args}}` заменяется текстом, который вы указали, после чего финальный prompt отправляется в модель.

#### Пример: Команда рефакторинга "Чистая функция"

Давайте создадим глобальную команду, которая будет запрашивать у модели рефакторинг фрагмента кода.

**1. Создайте файл и директории:**

Сначала убедитесь, что директория пользовательских команд существует, затем создайте поддиректорию `refactor` для организации и конечный TOML-файл.

```bash
mkdir -p ~/.qwen/commands/refactor
touch ~/.qwen/commands/refactor/pure.toml
```

**2. Добавьте содержимое в файл:**

Откройте `~/.qwen/commands/refactor/pure.toml` в вашем редакторе и добавьте следующее содержимое. Мы включаем опциональное поле `description` для лучшей практики.

```toml

# In: ~/.qwen/commands/refactor/pure.toml

```markdown
# Эта команда будет вызываться через: /refactor:pure

description = "Просит модель рефакторить текущий контекст в чистую функцию (pure function)."

prompt = """
Пожалуйста, проанализируй код, который я предоставил в текущем контексте.
Рефактори его в чистую функцию (pure function).

Твой ответ должен включать:
1. Блок кода с рефакторингом в чистую функцию.
2. Краткое объяснение ключевых изменений, которые ты сделал, и почему они способствуют чистоте функции.
"""
```

**3. Запусти команду:**

Вот и всё! Теперь ты можешь запустить свою команду в CLI. Сначала добавь файл в контекст, а затем вызови команду:

```
> @my-messy-function.js
> /refactor:pure
```

Qwen Code выполнит многострочный prompt, определённый в твоем TOML-файле.

## Команды с символом @

Команды с символом `@` используются для включения содержимого файлов или директорий в ваш запрос к модели. Эти команды поддерживают фильтрацию с учетом Git.

- **`@<путь_к_файлу_или_директории>`**
  - **Описание:** Вставляет содержимое указанного файла или файлов в текущий запрос. Это удобно, когда вы хотите задать вопрос о конкретном коде, тексте или наборе файлов.
  - **Примеры:**
    - `@path/to/your/file.txt Объясни этот текст.`
    - `@src/my_project/ Кратко опиши код в этой директории.`
    - `О чём этот файл? @README.md`
  - **Подробности:**
    - Если указан путь к одному файлу, будет прочитано его содержимое.
    - Если указан путь к директории, команда попытается прочитать содержимое всех файлов в этой директории и её поддиректориях.
    - Пробелы в путях нужно экранировать обратным слэшем (например, `@My\ Documents/file.txt`).
    - Внутри команда использует инструмент `read_many_files`. Содержимое файлов загружается и вставляется в ваш запрос перед отправкой модели.
    - **Фильтрация с учётом Git:** По умолчанию файлы, игнорируемые Git (например, `node_modules/`, `dist/`, `.env`, `.git/`), исключаются. Это поведение можно изменить через настройку `fileFiltering`.
    - **Типы файлов:** Команда предназначена для работы с текстовыми файлами. Хотя она может попытаться прочитать любой файл, бинарные или очень большие файлы могут быть пропущены или обрезаны инструментом `read_many_files` ради производительности и релевантности. Инструмент сообщает, если какие-то файлы были пропущены.
  - **Вывод:** CLI покажет сообщение о вызове инструмента `read_many_files`, а также информацию о статусе и путях, которые были обработаны.

- **`@` (одиночный символ @)**
  - **Описание:** Если вы вводите только символ `@` без пути, запрос передаётся модели как есть. Это может быть полезно, если вы намеренно говорите _о самом символе_ `@` в своём запросе.

### Обработка ошибок для команд `@`

- Если путь, указанный после `@`, не найден или является недопустимым, будет отображено сообщение об ошибке, и запрос может не быть отправлен в модель, либо будет отправлен без содержимого файла.
- Если инструмент `read_many_files` столкнется с ошибкой (например, проблемы с правами доступа), это также будет сообщено.

## Режим Shell и команды прямого выполнения (`!`)

Префикс `!` позволяет напрямую взаимодействовать с shell вашей системы прямо из Qwen Code.

- **`!<shell_command>`**
  - **Описание:** Выполняет указанную `<shell_command>` с использованием `bash` в Linux/macOS или `cmd.exe` в Windows. Весь вывод и ошибки отображаются в терминале.
  - **Примеры:**
    - `!ls -la` (выполняет `ls -la` и возвращается в Qwen Code)
    - `!git status` (выполняет `git status` и возвращается в Qwen Code)

- **`!` (Переключение режима shell)**
  - **Описание:** Ввод только символа `!` переключает режим shell.
    - **Вход в режим shell:**
      - При активации режима shell используется другая цветовая схема и отображается «индикатор режима Shell».
      - В этом режиме весь ввод интерпретируется как команды shell.
    - **Выход из режима shell:**
      - После выхода интерфейс возвращается к стандартному виду, и работа Qwen Code продолжается в обычном режиме.

- **Предупреждение по поводу всех команд с `!`:** Команды, выполняемые в режиме shell, имеют те же права доступа и такой же эффект, как если бы вы запускали их непосредственно в терминале.

- **Переменная окружения:** Когда команда выполняется через `!` или в режиме shell, в среде подпроцесса устанавливается переменная окружения `QWEN_CODE=1`. Это позволяет скриптам и инструментам определить, были ли они запущены из CLI.