# Поддержка Language Server Protocol (LSP)

Qwen Code предоставляет встроенную поддержку Language Server Protocol (LSP), что позволяет использовать расширенные функции анализа кода, такие как переход к определению, поиск ссылок, диагностика и действия с кодом. Эта интеграция позволяет ИИ-агенту глубже понимать ваш код и предоставлять более точные рекомендации.

## Обзор

Поддержка LSP в Qwen Code работает за счёт подключения к языковым серверам, которые анализируют ваш код. После настройки серверов через `.lsp.json` (или расширения) Qwen Code может запускать их и использовать для:

- Перехода к определениям символов
- Поиска всех ссылок на символ
- Получения информации при наведении (документация, информация о типах)
- Просмотра диагностических сообщений (ошибки, предупреждения)
- Доступа к действиям с кодом (быстрые исправления, рефакторинг)
- Анализа иерархии вызовов

## Быстрый старт

LSP является экспериментальной функцией в Qwen Code. Чтобы включить её, используйте флаг командной строки `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

Запуск LSP-серверов управляется конфигурацией. Вы должны определить их в `.lsp.json` (или через расширения), чтобы Qwen Code мог их запустить.

### Предварительные требования

У вас должен быть установлен языковой сервер для вашего языка программирования:

| Language              | Language Server            | Install Command                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Руководство по установке](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | Установите LLVM/clangd через ваш менеджер пакетов                              |
| Java                  | jdtls                      | Установите JDTLS и JDK                                                         |

## Конфигурация

### Файл .lsp.json

Вы можете настроить языковые серверы с помощью файла `.lsp.json` в корне вашего проекта. Каждый ключ верхнего уровня — это идентификатор языка, а его значение — объект конфигурации сервера.

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

- clangd (LLVM) должен быть установлен и доступен в `PATH`.
- Для получения точных результатов требуется база данных компиляции (`compile_commands.json`) или файл `compile_flags.txt`.

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

- JDK должен быть установлен и доступен в `PATH` (`java`).
- JDTLS должен быть установлен и доступен в `PATH` (`jdtls`).

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

| Option    | Type   | Description                                                                                                                                       |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Команда для запуска LSP-сервера. Поддерживает простые имена команд, разрешаемые через `PATH` (например, `clangd`), и абсолютные пути (например, `/opt/llvm/bin/clangd`) |

#### Необязательные поля

| Option                  | Type     | Default   | Description                                             |
| ----------------------- | -------- | --------- | ------------------------------------------------------- |
| `args`                  | string[] | `[]`      | Аргументы командной строки                              |
| `transport`             | string   | `"stdio"` | Тип транспорта: `stdio`, `tcp` или `socket`             |
| `env`                   | object   | -         | Переменные окружения                                    |
| `initializationOptions` | object   | -         | Параметры инициализации LSP                             |
| `settings`              | object   | -         | Настройки сервера через `workspace/didChangeConfiguration`  |
| `extensionToLanguage`   | object   | -         | Сопоставляет расширения файлов с идентификаторами языков            |
| `workspaceFolder`       | string   | -         | Переопределяет папку рабочей области (должна находиться в корне проекта) |
| `startupTimeout`        | number   | `10000`   | Таймаут запуска в миллисекундах                         |
| `shutdownTimeout`       | number   | `5000`    | Таймаут завершения работы в миллисекундах               |
| `restartOnCrash`        | boolean  | `false`   | Автоматический перезапуск при падении                   |
| `maxRestarts`           | number   | `3`       | Максимальное количество попыток перезапуска             |
| `trustRequired`         | boolean  | `true`    | Требует доверенной рабочей области                      |

### Транспорт TCP/Socket

Для серверов, использующих транспорт TCP или Unix-сокеты:

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

Qwen Code предоставляет функциональность LSP через унифицированный инструмент `lsp`. Ниже перечислены доступные операции:

Операции, основанные на местоположении (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` и `prepareCallHierarchy`), требуют точного указания позиции `filePath` + `line` + `character`. Если вы не знаете точную позицию, сначала используйте `workspaceSymbol` или `documentSymbol`, чтобы найти символ.

### Навигация по коду

#### Переход к определению

Находит место определения символа.

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

### Информация о символах

#### Наведение (Hover)

Получает документацию и информацию о типах для символа.

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

Получает элемент иерархии вызовов в указанной позиции.

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Входящие вызовы

Находит все функции, которые вызывают указанную функцию.

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### Исходящие вызовы

Находит все функции, вызываемые указанной функцией.

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

Получает все диагностические сообщения в рабочей области.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximum results (optional)
```

### Действия с кодом

#### Получение действий с кодом

Получает доступные действия с кодом (быстрые исправления, рефакторинг) в указанном месте.

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

Типы действий с кодом:

- `quickfix` - Быстрые исправления ошибок/предупреждений
- `refactor` - Операции рефакторинга
- `refactor.extract` - Выделение в функцию/переменную
- `refactor.inline` - Встраивание функции/переменной
- `source` - Действия с исходным кодом
- `source.organizeImports` - Организация импортов
- `source.fixAll` - Исправление всех автоматически исправляемых проблем

## Безопасность

По умолчанию LSP-серверы запускаются только в доверенных рабочих областях. Это связано с тем, что языковые серверы работают с правами вашего пользователя и могут выполнять код.

### Управление доверием

- **Доверенная рабочая область**: LSP-серверы запускаются, если они настроены
- **Недоверенная рабочая область**: LSP-серверы не запустятся, если в конфигурации сервера не указано `trustRequired: false`

Чтобы пометить рабочую область как доверенную, используйте команду `/trust`.

### Переопределение доверия для отдельного сервера

Вы можете переопределить требования к доверию для конкретных серверов в их конфигурации:

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
2. **Проверьте установку сервера**: Запустите команду вручную (например, `clangd --version`) для проверки
3. **Проверьте команду**: Бинарный файл сервера должен находиться в системном `PATH` или быть указан абсолютным путём (например, `/opt/llvm/bin/clangd`). Относительные пути, выходящие за пределы рабочей области, заблокированы
4. **Проверьте доверие к рабочей области**: Для работы LSP рабочая область должна быть доверенной (используйте `/trust`)
5. **Проверьте логи**: Ищите записи `[LSP]` в отладочном логе (см. раздел Отладка ниже)
6. **Проверьте процесс**: Выполните `ps aux | grep <server-name>`, чтобы убедиться, что процесс сервера запущен

### Низкая производительность

1. **Большие проекты**: Рассмотрите возможность исключения `node_modules` и других крупных директорий
2. **Таймаут сервера**: Увеличьте `startupTimeout` в конфигурации сервера для медленных серверов

### Нет результатов

1. **Сервер не готов**: Сервер всё ещё может индексировать файлы. Для проектов C/C++ с clangd убедитесь, что в аргументах указан `--background-index`, а файл `compile_commands.json` (или `compile_flags.txt`) находится в корне проекта или в родительской директории. Используйте `--compile-commands-dir=<path>`, если он находится в поддиректории сборки
2. **Файл не сохранён**: Сохраните файл, чтобы сервер обнаружил изменения
3. **Неверный язык**: Проверьте, запущен ли правильный сервер для вашего языка
4. **Проверьте процесс**: Выполните `ps aux | grep <server-name>`, чтобы убедиться, что сервер действительно запущен

### Отладка

Отладочные логи LSP автоматически записываются в файлы логов сессии в `~/.qwen/debug/`. Чтобы проверить записи, связанные с LSP:

```bash
# View the latest session log
grep '\[LSP\]' ~/.qwen/debug/latest

# Common error messages to look for:
#   "command path is unsafe"  → relative path escapes workspace, use absolute path or add to PATH
#   "command not found"       → server binary not installed or not in PATH
#   "requires trusted workspace" → run /trust first
```

Вы также можете проверить, запущен ли процесс сервера:

```bash
ps aux | grep clangd   # or typescript-language-server, jdtls, etc.
```

## Конфигурация LSP для расширений

Расширения могут предоставлять конфигурации LSP-серверов через поле `lspServers` в своём `plugin.json`. Это может быть как встроенный объект, так и путь к файлу `.lsp.json`. Qwen Code загружает эти конфигурации при включении расширения. Формат соответствует той же структуре с ключами языков, которая используется в файлах `.lsp.json` проекта.

## Рекомендации

1. **Устанавливайте языковые серверы глобально**: Это гарантирует их доступность во всех проектах
2. **Используйте настройки для конкретного проекта**: При необходимости настраивайте параметры сервера для каждого проекта через `.lsp.json`
3. **Обновляйте серверы**: Регулярно обновляйте языковые серверы для получения наилучших результатов
4. **Доверяйте с осторожностью**: Помечайте как доверенные только рабочие области из надёжных источников

## Часто задаваемые вопросы (FAQ)

### В: Как включить LSP?

Используйте флаг `--experimental-lsp` при запуске Qwen Code:

```bash
qwen --experimental-lsp
```

### В: Как узнать, какие языковые серверы запущены?

Проверьте отладочный лог на наличие записей `[LSP]` (`grep '\[LSP\]' ~/.qwen/debug/latest`) или проверьте процесс напрямую с помощью `ps aux | grep <server-name>`.

### В: Можно ли использовать несколько языковых серверов для одного типа файлов?

Да, но для каждой операции будет использоваться только один. Побеждает первый сервер, который вернёт результаты.

### В: Работает ли LSP в режиме песочницы?

LSP-серверы работают вне песочницы для доступа к вашему коду. Они подчиняются правилам управления доверием к рабочей области.