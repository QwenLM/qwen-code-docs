# Поддержка Language Server Protocol (LSP)

Qwen Code предоставляет встроенную поддержку Language Server Protocol (LSP), что позволяет использовать расширенные функции анализа кода: переход к определению, поиск ссылок, диагностика и действия с кодом. Эта интеграция помогает AI-агенту глубже понимать ваш код и давать более точные рекомендации.

## Обзор

Поддержка LSP в Qwen Code работает путём подключения к языковым серверам, которые понимают ваш код. После настройки серверов через `.lsp.json` (или расширения) Qwen Code может запускать их и использовать для:

- Перехода к определениям символов
- Поиска всех ссылок на символ
- Получения информации при наведении (документация, информация о типе)
- Просмотра диагностических сообщений (ошибки, предупреждения)
- Выполнения действий с кодом (быстрые исправления, рефакторинг)
- Анализа иерархии вызовов

## Быстрый старт

LSP — это экспериментальная функция в Qwen Code. Чтобы её включить, используйте флаг командной строки `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

LSP-серверы настраиваются через конфигурацию. Вы должны определить их в файле `.lsp.json` (или через расширения), чтобы Qwen Code мог их запустить.

### Необходимые компоненты

Для вашего языка программирования должен быть установлен соответствующий языковой сервер:

| Язык                  | Языковой сервер             | Команда установки                                                                |
| --------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server  | `npm install -g typescript-language-server typescript`                           |
| Python                | pylsp                       | `pip install python-lsp-server`                                                  |
| Go                    | gopls                       | `go install golang.org/x/tools/gopls@latest`                                     |
| Rust                  | rust-analyzer               | [Руководство по установке](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                      | Установите LLVM/clangd через ваш пакетный менеджер                               |
| Java                  | jdtls                       | Установите JDTLS и JDK                                                            |

## Конфигурация

### Файл .lsp.json

Вы можете настроить языковые серверы с помощью файла `.lsp.json` в корне вашего проекта. Каждый ключ верхнего уровня — это идентификатор языка, а значение — объект конфигурации сервера.

**Базовый формат:**

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact"
    }
  }
}
```

### Конфигурация C/C++ (clangd)

Зависимости:

- clangd (LLVM) должен быть установлен и доступен в PATH.
- Требуется база компиляции (`compile_commands.json`) или `compile_flags.txt` для точных результатов.

Пример:

```json
{
  "cpp": {
    "command": "clangd",
    "args": [
      "--background-index",
      "--clang-tidy",
      "--header-insertion=iwyu",
      "--completion-style=detailed"
    ]
  }
}
```

### Конфигурация Java (jdtls)

Зависимости:

- JDK установлен и доступен в PATH (`java`).
- JDTLS установлен и доступен в PATH (`jdtls`).

Пример:

```json
{
  "java": {
    "command": "jdtls",
    "args": ["-configuration", ".jdtls-config", "-data", ".jdtls-workspace"]
  }
}
```

### Параметры конфигурации

#### Обязательные поля

| Параметр  | Тип    | Описание                                                                                                                            |
| --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Команда для запуска LSP-сервера. Поддерживаются имена команд, найденные через `PATH` (например, `clangd`), и абсолютные пути (например, `/opt/llvm/bin/clangd`) |

#### Необязательные поля

| Параметр                | Тип      | Значение по умолчанию | Описание                                                    |
| ----------------------- | -------- | --------------------- | ------------------------------------------------------------ |
| `args`                  | string[] | `[]`                  | Аргументы командной строки                                   |
| `transport`             | string   | `"stdio"`             | Тип транспорта: `stdio`, `tcp` или `socket`                  |
| `env`                   | object   | -                     | Переменные окружения                                         |
| `initializationOptions` | object   | -                     | Параметры инициализации LSP                                  |
| `settings`              | object   | -                     | Настройки сервера через `workspace/didChangeConfiguration`   |
| `extensionToLanguage`   | object   | -                     | Сопоставление расширений файлов с идентификаторами языков    |
| `workspaceFolder`       | string   | -                     | Переопределение рабочей папки (должна быть в корне проекта)  |
| `startupTimeout`        | number   | `10000`               | Тайм-аут запуска в миллисекундах                             |
| `shutdownTimeout`       | number   | `5000`                | Тайм-аут завершения работы в миллисекундах                   |
| `restartOnCrash`        | boolean  | `false`               | Автоматический перезапуск при сбое                           |
| `maxRestarts`           | number   | `3`                   | Максимальное количество попыток перезапуска                  |
| `trustRequired`         | boolean  | `true`                | Требовать доверенную рабочую область                         |

### Транспорт TCP/Socket

Для серверов, использующих TCP или Unix socket:

```json
{
  "remote-lsp": {
    "transport": "tcp",
    "socket": {
      "host": "127.0.0.1",
      "port": 9999
    },
    "extensionToLanguage": {
      ".custom": "custom"
    }
  }
}
```

## Доступные операции LSP

Qwen Code предоставляет функциональность LSP через единый инструмент `lsp`. Вот доступные операции:

Операции, основанные на позиции (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` и `prepareCallHierarchy`), требуют точной позиции `filePath` + `line` + `character`. Если вы не знаете точную позицию, сначала воспользуйтесь `workspaceSymbol` или `documentSymbol`, чтобы найти символ.

### Навигация по коду

#### Переход к определению

Находит, где определён символ.

```
Operation: goToDefinition
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Поиск ссылок

Находит все ссылки на символ.

```
Operation: findReferences
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
  - includeDeclaration: Include the declaration itself (optional)
```

#### Переход к реализации

Находит реализации интерфейса или абстрактного метода.

```
Operation: goToImplementation
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

### Информация о символе

#### Наведение

Получает документацию и информацию о типе для символа.

```
Operation: hover
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Символы документа

Получает все символы в документе.

```
Operation: documentSymbol
Parameters:
  - filePath: Path to the file
```

#### Поиск символов в рабочей области

Ищет символы во всей рабочей области.

```
Operation: workspaceSymbol
Parameters:
  - query: Search query string
  - limit: Maximum results (optional)
```

### Иерархия вызовов

#### Подготовка иерархии вызовов

Получает элемент иерархии вызовов в заданной позиции.

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Входящие вызовы

Находит все функции, которые вызывают данную функцию.

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### Исходящие вызовы

Находит все функции, вызываемые данной функцией.

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

### Диагностика

#### Диагностика файла

Получает диагностические сообщения (ошибки, предупреждения) для файла.

```
Operation: diagnostics
Parameters:
  - filePath: Path to the file
```

#### Диагностика рабочей области

Получает все диагностические сообщения во всей рабочей области.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximum results (optional)
```

### Действия с кодом

#### Получение действий с кодом

Получает доступные действия с кодом (быстрые исправления, рефакторинг) в заданной позиции.

```
Operation: codeActions
Parameters:
  - filePath: Path to the file
  - line: Start line number (1-based)
  - character: Start column number (1-based)
  - endLine: End line number (optional, defaults to line)
  - endCharacter: End column (optional, defaults to character)
  - diagnostics: Diagnostics to get actions for (optional)
  - codeActionKinds: Filter by action kind (optional)
```

Виды действий с кодом:

- `quickfix` — Быстрые исправления для ошибок/предупреждений
- `refactor` — Операции рефакторинга
- `refactor.extract` — Извлечение в функцию/переменную
- `refactor.inline` — Встраивание функции/переменной
- `source` — Действия с исходным кодом
- `source.organizeImports` — Упорядочить импорты
- `source.fixAll` — Исправить все автоматически исправляемые проблемы

## Безопасность

По умолчанию LSP-серверы запускаются только в доверенных рабочих областях. Это связано с тем, что языковые серверы работают с вашими правами пользователя и могут выполнять код.

### Контроль доверия

- **Доверенная рабочая область**: LSP-серверы запускаются, если настроены
- **Не доверенная рабочая область**: LSP-серверы не запускаются, если только в конфигурации сервера не установлено `trustRequired: false`

Чтобы пометить рабочую область как доверенную, используйте команду `/trust`.

### Переопределение доверия для конкретного сервера

Вы можете переопределить требования доверия для отдельных серверов в их конфигурации:

```json
{
  "safe-server": {
    "command": "safe-language-server",
    "args": ["--stdio"],
    "trustRequired": false,
    "extensionToLanguage": {
      ".safe": "safe"
    }
  }
}
```

## Устранение неполадок

### Сервер не запускается

1. **Проверьте флаг `--experimental-lsp`**: Убедитесь, что вы используете этот флаг при запуске Qwen Code
2. **Проверьте, установлен ли сервер**: Выполните команду вручную (например, `clangd --version`)
3. **Проверьте команду**: Исполняемый файл сервера должен быть в вашем `PATH` или указан как абсолютный путь (например, `/opt/llvm/bin/clangd`). Относительные пути, выходящие за пределы рабочей области, блокируются
4. **Проверьте доверие рабочей области**: Рабочая область должна быть доверенной для LSP (используйте `/trust`)
5. **Проверьте журналы**: Запустите Qwen Code с `--debug`, затем найдите записи, связанные с LSP, в отладочном журнале (см. раздел «Отладка» ниже)
6. **Проверьте процесс**: Выполните `ps aux | grep <server-name>`, чтобы убедиться, что процесс сервера запущен

### Низкая производительность

1. **Большие проекты**: Рассмотрите возможность исключения `node_modules` и других больших каталогов
2. **Тайм-аут сервера**: Увеличьте `startupTimeout` в конфигурации сервера для медленных серверов

### Нет результатов

1. **Сервер ещё не готов**: Сервер может всё ещё индексировать. Для C/C++ проектов с clangd убедитесь, что в аргументах есть `--background-index`, а в корне проекта или родительском каталоге существует `compile_commands.json` (или `compile_flags.txt`). Используйте `--compile-commands-dir=<path>`, если он находится в подкаталоге сборки
2. **Файл не сохранён**: Сохраните файл, чтобы сервер зафиксировал изменения
3. **Неправильный язык**: Проверьте, работает ли правильный сервер для вашего языка
4. **Проверьте процесс**: Выполните `ps aux | grep <server-name>`, чтобы убедиться, что сервер действительно запущен

### Отладка

У LSP нет отдельного флага отладки. Используйте обычный режим отладки Qwen Code вместе с флагом LSP:

```bash
qwen --experimental-lsp --debug
```

Отладочные журналы записываются в каталог отладочного журнала сессии. Чтобы проверить записи, связанные с LSP:

```bash
# Стандартный каталог среды выполнения
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# Или, без ripgrep:
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# Если настроен QWEN_RUNTIME_DIR
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

Полезные записи включают:

- `[LSP] ...`: Журналы, генерируемые собственным LSP-сервисом и менеджером серверов.
- `[CONFIG] Native LSP status after discovery: ...`: Обнаруженная конфигурация LSP-сервера для сессии.
- `[CONFIG] Native LSP status after startup: ...`: Результат запуска сервера, включая количество готовых/неудачных.
- `[STATUS] LSP status snapshot for /status: ...`: Снимок состояния, выводимый при выполнении `/status` в режиме отладки.

Вы также можете выполнить `/status` в CLI, чтобы увидеть краткую сводку LSP:

```text
LSP: disabled
LSP: enabled, 1/1 ready
LSP: enabled, 0/1 ready (1 failed)
LSP: enabled, no servers configured
LSP: enabled, status unavailable
```

Для детальной информации по каждому серверу выполните `/lsp`:

```text
**LSP Server Status**

| Server | Command | Languages | Status |
|--------|---------|-----------|--------|
| clangd | `clangd` | c, cpp | READY |
| pyright | `pyright-langserver` | python | FAILED - startup failed |
```

Распространённые сообщения об ошибках:

```text
command path is unsafe        -> относительный путь выходит за пределы рабочей области, используйте абсолютный путь или добавьте в PATH
command not found             -> исполняемый файл сервера не установлен или не найден в PATH
requires trusted workspace    -> сначала выполните /trust
LSP connection closed         -> сервер запустился, но завершился или закрыл stdio до ответа на инициализацию
```

При проблемах с запуском clangd проверьте сервер напрямую из корня проекта:

```bash
clangd --version
clangd --check=/path/to/file.cpp --log=verbose
```

C/C++ проекты обычно должны содержать `compile_commands.json` или `compile_flags.txt`. Если база компиляции находится в каталоге сборки, передайте её clangd:

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # или typescript-language-server, jdtls и т.д.
```

## Конфигурация LSP через расширения

Расширения могут предоставлять конфигурации LSP-серверов через поле `lspServers` в своём `plugin.json`. Это может быть как встроенный объект, так и путь к файлу `.lsp.json`. Qwen Code загружает эти конфигурации, когда расширение включено. Формат — такая же разметка по языкам, как в проектных файлах `.lsp.json`.

## Рекомендации

1. **Устанавливайте языковые серверы глобально**: Это гарантирует их доступность во всех проектах
2. **Используйте настройки для конкретного проекта**: Настраивайте параметры сервера для каждого проекта при необходимости через файл `.lsp.json`
3. **Регулярно обновляйте серверы**: Обновляйте языковые серверы для лучших результатов
4. **Доверяйте с умом**: Доверяйте только рабочим областям из надёжных источников

## Часто задаваемые вопросы

### В: Как включить LSP?

Используйте флаг `--experimental-lsp` при запуске Qwen Code:

```bash
qwen --experimental-lsp
```

### В: Как узнать, какие языковые серверы запущены?

Запустите Qwen Code с LSP и режимом отладки:

```bash
qwen --experimental-lsp --debug
```

Затем выполните `/status` для краткой сводки, `/lsp` для состояния по каждому серверу или просмотрите отладочный журнал:

```bash
# Стандартный каталог среды выполнения
rg "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest
# Или:
grep -E "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest

# Если настроен QWEN_RUNTIME_DIR
rg "LSP|Native LSP|<server-name>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP использует обычный режим `--debug` Qwen Code; отдельного флага отладки LSP нет.

### В: Могу ли я использовать несколько языковых серверов для одного типа файлов?

Да, но для каждой операции будет использоваться только один. Побеждает первый сервер, вернувший результат.

### В: Работает ли LSP в режиме песочницы?

LSP-серверы запускаются вне песочницы для доступа к вашему коду. Они подчиняются контролю доверия рабочей области.