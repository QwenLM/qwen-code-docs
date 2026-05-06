# Подключение Qwen Code к инструментам через MCP

Qwen Code может подключаться к внешним инструментам и источникам данных через [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). MCP-серверы предоставляют Qwen Code доступ к вашим инструментам, базам данных и API.

## Возможности MCP

При подключении MCP-серверов вы можете попросить Qwen Code:

- Работать с файлами и репозиториями (чтение/поиск/запись в зависимости от включённых инструментов)
- Выполнять запросы к базам данных (просмотр схемы, запросы, отчёты)
- Интегрировать внутренние сервисы (оборачивать ваши API в виде MCP-инструментов)
- Автоматизировать рабочие процессы (повторяющиеся задачи, доступные как инструменты/промпты)

> [!tip]
>
> Если вы ищете «одну команду для быстрого старта», перейдите к разделу [Быстрый старт](#quick-start).

## Быстрый старт

Qwen Code загружает MCP-серверы из раздела `mcpServers` в вашем `settings.json`. Настроить серверы можно двумя способами:

- Отредактировав `settings.json` напрямую
- Используя команды `qwen mcp` (см. [Справочник по CLI](#qwen-mcp-cli))

### Добавление первого сервера

1. Добавьте сервер (пример: удалённый HTTP MCP-сервер):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Откройте диалог управления MCP для просмотра и настройки серверов:

```bash
qwen mcp
```

3. Перезапустите Qwen Code в том же проекте (или запустите его, если он ещё не работал), затем попросите модель использовать инструменты с этого сервера.

## Где хранится конфигурация (области видимости)

Большинству пользователей достаточно двух областей видимости:

- **Область проекта (по умолчанию)**: `.qwen/settings.json` в корне вашего проекта
- **Область пользователя**: `~/.qwen/settings.json` для всех проектов на вашем компьютере

Запись в область пользователя:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Подробнее о расширенных слоях конфигурации (системные настройки по умолчанию и правила приоритета) см. в разделе [Settings](../configuration/settings).

## Настройка серверов

### Выбор транспорта

| Транспорт | Когда использовать | Поле(я) в JSON |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Рекомендуется для удалённых сервисов; хорошо подходит для облачных MCP-серверов | `httpUrl` (+ опционально `headers`)            |
| `sse`     | Устаревшие/неподдерживаемые серверы, поддерживающие только Server-Sent Events    | `url` (+ опционально `headers`)                |
| `stdio`   | Локальный процесс (скрипты, CLI, Docker) на вашем компьютере             | `command`, `args` (+ опционально `cwd`, `env`) |

> [!note]
>
> Если сервер поддерживает оба варианта, отдавайте предпочтение **HTTP** вместо **SSE**.

### Настройка через `settings.json` или `qwen mcp add`

Оба подхода создают одинаковые записи `mcpServers` в вашем `settings.json` — используйте тот, который вам удобнее.

#### Stdio-сервер (локальный процесс)

JSON (`.qwen/settings.json`):

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

CLI (по умолчанию записывает в область проекта):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP-сервер (удалённый потоковый HTTP)

JSON:

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token"
      },
      "timeout": 5000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### SSE-сервер (удалённый Server-Sent Events)

JSON:

```json
{
  "mcpServers": {
    "sseServer": {
      "url": "http://localhost:8080/sse",
      "timeout": 30000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## Безопасность и контроль

### Доверие (пропуск подтверждений)

- **Доверие к серверу** (`trust: true`): пропускает запросы подтверждения для этого сервера (используйте с осторожностью).

### OAuth-аутентификация

Qwen Code поддерживает OAuth 2.0 аутентификацию для MCP-серверов. Это полезно при работе с удалёнными серверами, требующими авторизации.

#### Базовое использование

При добавлении MCP-сервера с OAuth-учётными данными Qwen Code автоматически обработает процесс аутентификации:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Важно: настройка Redirect URI

Для OAuth-процесса требуется redirect URI, на который провайдер авторизации отправляет код аутентификации.

- **Локальная разработка**: По умолчанию Qwen Code использует `http://localhost:7777/oauth/callback`. Это работает при запуске Qwen Code на локальном компьютере с локальным браузером.

- **Удалённые/облачные развёртывания**: При запуске Qwen Code на удалённых серверах, в облачных IDE или веб-терминалах редирект на `localhost` по умолчанию НЕ сработает. Вы ОБЯЗАНЫ настроить `--oauth-redirect-uri`, указав общедоступный URL, способный принимать OAuth-колбэк.

Пример для удалённых серверов:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### Ручная настройка через settings.json

Вы также можете настроить OAuth, отредактировав `settings.json` напрямую:

```json
{
  "mcpServers": {
    "oauthServer": {
      "url": "https://api.example.com/sse/",
      "oauth": {
        "enabled": true,
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authorizationUrl": "https://provider.example.com/authorize",
        "tokenUrl": "https://provider.example.com/token",
        "redirectUri": "https://your-server.com/oauth/callback",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

Свойства конфигурации OAuth:

| Свойство           | Описание                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | Включить OAuth для этого сервера (boolean)                                                                                |
| `clientId`         | Идентификатор OAuth-клиента (string, опционально при динамической регистрации)                                                  |
| `clientSecret`     | Секрет OAuth-клиента (string, опционально для публичных клиентов)                                                             |
| `authorizationUrl` | Эндпоинт авторизации OAuth (string, определяется автоматически, если не указан)                                                     |
| `tokenUrl`         | Эндпоинт получения токена OAuth (string, определяется автоматически, если не указан)                                                             |
| `scopes`           | Требуемые OAuth-скопы (массив строк)                                                                              |
| `redirectUri`      | Пользовательский redirect URI (string). **Критично для удалённых развёртываний**. По умолчанию `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | Имя параметра запроса для токенов в SSE-URL (string)                                                                  |
| `audiences`        | Аудитории, для которых действителен токен (массив строк)                                                                   |

#### Управление токенами

OAuth-токены автоматически:

- **Безопасно сохраняются** в `~/.qwen/mcp-oauth-tokens.json`
- **Обновляются** при истечении срока действия (если доступны refresh-токены)
- **Проверяются** перед каждой попыткой подключения

Используйте команду `/mcp auth` внутри Qwen Code для интерактивного управления OAuth-аутентификацией.

### Фильтрация инструментов (разрешение/запрет инструментов для каждого сервера)

Используйте `includeTools` / `excludeTools` для ограничения инструментов, предоставляемых сервером (с точки зрения Qwen Code).

Пример: включение только нескольких инструментов:

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      "timeout": 30000
    }
  }
}
```

### Глобальные списки разрешений/запретов

Объект `mcp` в вашем `settings.json` задаёт глобальные правила для всех MCP-серверов:

- `mcp.allowed`: список разрешённых имён MCP-серверов (ключи в `mcpServers`)
- `mcp.excluded`: список запрещённых имён MCP-серверов

Пример:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## Устранение неполадок

- **Сервер показывает “Disconnected” в `qwen mcp list`**: убедитесь, что URL/команда указаны верно, затем увеличьте `timeout`.
- **Stdio-сервер не запускается**: используйте абсолютный путь в `command` и перепроверьте `cwd`/`env`.
- **Переменные окружения в JSON не подставляются**: убедитесь, что они существуют в окружении, где запущен Qwen Code (окружение оболочки и GUI-приложений может отличаться).

## Справочник

### Структура `settings.json`

#### Конфигурация конкретного сервера (`mcpServers`)

Добавьте объект `mcpServers` в ваш файл `settings.json`:

```json
// ... file contains other config objects
{
  "mcpServers": {
    "serverName": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-directory",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Свойства конфигурации:

Обязательные (одно из следующего):

| Свойство  | Описание                                            |
| --------- | ------------------------------------------------------ |
| `command` | Путь к исполняемому файлу для транспорта Stdio             |
| `url`     | URL эндпоинта SSE (например, `"http://localhost:8080/sse"`) |
| `httpUrl` | URL эндпоинта потоковой передачи HTTP                            |

Опциональные:

| Свойство               | Тип/По умолчанию                 | Описание                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Аргументы командной строки для транспорта Stdio                                                                                                                                                                                                                        |
| `headers`              | object                       | Пользовательские HTTP-заголовки при использовании `url` или `httpUrl`                                                                                                                                                                                                                 |
| `env`                  | object                       | Переменные окружения для процесса сервера. Значения могут ссылаться на переменные окружения с использованием синтаксиса `$VAR_NAME` или `${VAR_NAME}`                                                                                                                                |
| `cwd`                  | string                       | Рабочая директория для транспорта Stdio                                                                                                                                                                                                                             |
| `timeout`              | number<br>(по умолчанию: 600 000) | Таймаут запроса в миллисекундах (по умолчанию: 600 000 мс = 10 минут)                                                                                                                                                                                                 |
| `trust`                | boolean<br>(по умолчанию: false)  | При значении `true` пропускает все подтверждения вызова инструментов для этого сервера (по умолчанию: `false`)                                                                                                                                                                              |
| `includeTools`         | array                        | Список имён инструментов, которые нужно включить с этого MCP-сервера. Если указано, доступны будут только перечисленные здесь инструменты (режим белого списка). Если не указано, по умолчанию включены все инструменты сервера.                                       |
| `excludeTools`         | array                        | Список имён инструментов, которые нужно исключить с этого MCP-сервера. Перечисленные здесь инструменты не будут доступны модели, даже если сервер их предоставляет.<br>Примечание: `excludeTools` имеет приоритет над `includeTools` — если инструмент указан в обоих списках, он будет исключён. |
| `targetAudience`       | string                       | OAuth Client ID, добавленный в белый список защищённого IAP-приложения, к которому вы пытаетесь получить доступ. Используется с `authProviderType: 'service_account_impersonation'`.                                                                                                         |
| `targetServiceAccount` | string                       | Адрес электронной почты сервисного аккаунта Google Cloud, от имени которого выполняется действие. Используется с `authProviderType: 'service_account_impersonation'`.                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### Управление MCP-серверами через `qwen mcp`

Вы всегда можете настроить MCP-серверы, вручную отредактировав `settings.json`, но CLI обычно быстрее.

#### Добавление сервера (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Аргумент/Опция             | Описание                                                         | По умолчанию                                | Пример                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | Уникальное имя сервера.                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | Команда для выполнения (для `stdio`) или URL (для `http`/`sse`). | —                                      | `/usr/bin/python` или `http://localhost:8`                          |
| `[args...]`                 | Опциональные аргументы для команды `stdio`.                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | Область конфигурации (user или project).                              | `project`                              | `-s user`                                                          |
| `-t`, `--transport`         | Тип транспорта (`stdio`, `sse`, `http`).                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | Установка переменных окружения.                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | Установка HTTP-заголовков для транспортов SSE и HTTP.                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | Установка таймаута подключения в миллисекундах.                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | Доверять серверу (пропускать все запросы подтверждения вызова инструментов).       | — (`false`)                            | `--trust`                                                          |
| `--description`             | Установка описания сервера.                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | Список инструментов для включения через запятую.                         | включены все инструменты                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | Список инструментов для исключения через запятую.                         | нет                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | OAuth client ID для аутентификации MCP-сервера.                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | OAuth client secret для аутентификации MCP-сервера.                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | OAuth redirect URI для колбэка аутентификации.                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth authorization URL.                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth token URL.                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth scopes (через запятую).                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |

> Флаги `--oauth-*` применяются только к `--transport sse` и `--transport http`. Их комбинация с `--transport stdio` будет отклонена.

#### Удаление сервера (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```