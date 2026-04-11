# Аутентификация

Qwen Code поддерживает три метода аутентификации. Выберите тот, который соответствует вашему сценарию использования CLI:

- **Qwen OAuth**: вход через аккаунт `qwen.ai` в браузере. Бесплатно с дневным лимитом.
- **Alibaba Cloud Coding Plan**: использование API-ключа от Alibaba Cloud. Платная подписка с широким выбором моделей и увеличенными лимитами.
- **API Key**: использование собственного API-ключа. Гибкая настройка под ваши задачи — поддерживает OpenAI, Anthropic, Gemini и другие совместимые эндпоинты.

## Вариант 1: Qwen OAuth (бесплатно)

Выберите этот вариант, если вам нужна максимально простая настройка и вы используете модели Qwen.

- **Как это работает**: при первом запуске Qwen Code открывает страницу входа в браузере. После завершения авторизации учетные данные кэшируются локально, поэтому повторный вход обычно не требуется.
- **Требования**: аккаунт `qwen.ai` + доступ в интернет (как минимум для первого входа).
- **Преимущества**: не нужно управлять API-ключами, автоматическое обновление учетных данных.
- **Стоимость и лимиты**: бесплатно, лимит **60 запросов/минуту** и **1 000 запросов/день**.

Запустите CLI и следуйте инструкциям в браузере:

```bash
qwen
```

Или выполните аутентификацию напрямую, без запуска сессии:

```bash
qwen auth qwen-oauth
```

> [!note]
>
> В неинтерактивных или headless-средах (например, CI, SSH, контейнеры) обычно **невозможно** пройти браузерный поток авторизации OAuth.  
> В таких случаях используйте метод аутентификации Alibaba Cloud Coding Plan или API Key.

## 💳 Вариант 2: Alibaba Cloud Coding Plan

Выберите этот вариант, если вам нужны предсказуемые расходы, широкий выбор моделей и увеличенные лимиты использования.

- **Как это работает**: оформите подписку на Coding Plan с фиксированной ежемесячной платой, затем настройте Qwen Code на использование выделенного эндпоинта и вашего API-ключа подписки.
- **Требования**: получите активную подписку Coding Plan в [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) или [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) в зависимости от региона вашего аккаунта.
- **Преимущества**: широкий выбор моделей, увеличенные лимиты, предсказуемая ежемесячная стоимость, доступ к множеству моделей (Qwen, GLM, Kimi, Minimax и другие).
- **Стоимость и лимиты**: ознакомьтесь с документацией по тарифам Aliyun ModelStudio Coding Plan [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Alibaba Cloud Coding Plan доступен в двух регионах:

| Регион                       | URL консоли                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Интерактивная настройка

Настроить аутентификацию Coding Plan можно двумя способами:

**Вариант A: Из терминала (рекомендуется для первичной настройки)**

```bash
# Интерактивный режим — запрос региона и API-ключа
qwen auth coding-plan

# Или неинтерактивный режим — передача региона и ключа напрямую
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx
```

**Вариант B: Внутри сессии Qwen Code**

Введите `qwen` в терминале для запуска Qwen Code, затем выполните команду `/auth` и выберите **Alibaba Cloud Coding Plan**. Укажите регион, затем введите ваш ключ `sk-sp-xxxxxxxxx`.

После аутентификации используйте команду `/model` для переключения между всеми моделями, поддерживаемыми Alibaba Cloud Coding Plan (включая qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max, glm-4.7 и kimi-k2.5).

### Альтернатива: настройка через `settings.json`

Если вы предпочитаете пропустить интерактивный поток `/auth`, добавьте следующее в `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> Coding Plan использует выделенный эндпоинт (`https://coding.dashscope.aliyuncs.com/v1`), который отличается от стандартного эндпоинта Dashscope. Убедитесь, что указан правильный `baseUrl`.

## 🚀 Вариант 3: API Key (гибкий)

Выберите этот вариант, если хотите подключиться к сторонним провайдерам, таким как OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope, или к собственному хостингу. Поддерживает несколько протоколов и провайдеров.

### Рекомендуется: настройка в одном файле через `settings.json`

Самый простой способ начать работу с аутентификацией по API-ключу — разместить все настройки в одном файле `~/.qwen/settings.json`. Вот полный готовый пример:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

Описание полей:

| Поле                         | Описание                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Определяет доступные модели и параметры подключения к ним. Ключи (`openai`, `anthropic`, `gemini`) соответствуют протоколу API.              |
| `env`                        | Хранит API-ключи напрямую в `settings.json` в качестве резервного варианта (наименьший приоритет — переменные окружения через `export` и файлы `.env` имеют приоритет).                  |
| `security.auth.selectedType` | Указывает Qwen Code, какой протокол использовать при запуске (например, `openai`, `anthropic`, `gemini`). Без этого параметра потребуется интерактивный запуск `/auth`. |
| `model.name`                 | Модель по умолчанию, активируемая при запуске Qwen Code. Должна совпадать с одним из значений `id` в `modelProviders`.                                |

После сохранения файла просто запустите `qwen` — интерактивная настройка `/auth` не потребуется.

> [!tip]
>
> В разделах ниже подробно описана каждая часть. Если приведенный выше пример работает для вас, можете сразу перейти к [Примечаниям по безопасности](#security-notes).

Ключевая концепция — **Model Providers** (`modelProviders`): Qwen Code поддерживает несколько API-протоколов, а не только OpenAI. Вы настраиваете доступные провайдеры и модели, редактируя `~/.qwen/settings.json`, а затем переключаетесь между ними во время работы с помощью команды `/model`.

#### Поддерживаемые протоколы

| Протокол          | Ключ `modelProviders` | Переменные окружения                                        | Провайдеры                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| OpenAI-compatible | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud, любой OpenAI-совместимый эндпоинт |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                               |

#### Шаг 1: Настройка моделей и провайдеров в `~/.qwen/settings.json`

Укажите, какие модели доступны для каждого протокола. Каждая запись модели требует как минимум `id` и `envKey` (имя переменной окружения, содержащей ваш API-ключ).

> [!important]
>
> Рекомендуется определять `modelProviders` в `~/.qwen/settings.json` на уровне пользователя, чтобы избежать конфликтов слияния между настройками проекта и пользователя.

Отредактируйте `~/.qwen/settings.json` (создайте файл, если его нет). В одном файле можно комбинировать несколько протоколов — вот пример с несколькими провайдерами, показывающий только секцию `modelProviders`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> Не забудьте также настроить `env`, `security.auth.selectedType` и `model.name` вместе с `modelProviders` — для примера см. [полный пример выше](#recommended-one-file-setup-via-settingsjson).

**Поля `ModelConfig` (каждая запись внутри `modelProviders`):**

| Поле              | Обязательно | Описание                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | Да      | ID модели, отправляемый в API (например, `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`             | Нет       | Отображаемое имя в селекторе `/model` (по умолчанию равно `id`)               |
| `envKey`           | Да      | Имя переменной окружения для API-ключа (например, `OPENAI_API_KEY`)    |
| `baseUrl`          | Нет       | Переопределение эндпоинта API (полезно для прокси или кастомных эндпоинтов)       |
| `generationConfig` | Нет       | Тонкая настройка `timeout`, `maxRetries`, `samplingParams` и т.д.            |

> [!note]
>
> При использовании поля `env` в `settings.json` учетные данные хранятся в открытом виде. Для повышения безопасности предпочтительнее использовать файлы `.env` или `export` в оболочке — см. [Шаг 2](#step-2-set-environment-variables).

Полную схему `modelProviders` и расширенные опции, такие как `generationConfig`, `customHeaders` и `extra_body`, см. в [Справочнике по Model Providers](model-providers.md).

#### Шаг 2: Настройка переменных окружения

Qwen Code считывает API-ключи из переменных окружения (указанных в `envKey` в конфигурации модели). Существует несколько способов их передачи, перечисленных ниже в порядке **от высшего к низшему приоритету**:

**1. Окружение оболочки / `export` (высший приоритет)**

Установите напрямую в профиле оболочки (`~/.zshrc`, `~/.bashrc` и т.д.) или inline перед запуском:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-совместимые
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Файлы `.env`**

Qwen Code автоматически загружает **первый** найденный файл `.env` (переменные **не объединяются** из нескольких файлов). Загружаются только те переменные, которых еще нет в `process.env`.

Порядок поиска (от текущей директории вверх к `/`):

1. `.qwen/.env` (рекомендуется — изолирует переменные Qwen Code от других инструментов)
2. `.env`

Если ничего не найдено, поиск продолжается в **домашней директории**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` рекомендуется вместо `.env`, чтобы избежать конфликтов с другими инструментами. Некоторые переменные (например, `DEBUG` и `DEBUG_MODE`) исключены из `.env` на уровне проекта, чтобы не влиять на поведение Qwen Code.

**3. `settings.json` → поле `env` (низший приоритет)**

Вы также можете задать API-ключи напрямую в `~/.qwen/settings.json` в ключе `env`. Они загружаются как **резервный вариант с наименьшим приоритетом** — применяются только если переменная еще не установлена в системном окружении или файлах `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Этот подход используется в [примере настройки в одном файле](#recommended-one-file-setup-via-settingsjson) выше. Он удобен для хранения всего в одном месте, но учитывайте, что `settings.json` может быть расшарен или синхронизирован — для конфиденциальных данных предпочтительнее файлы `.env`.

**Сводка по приоритетам:**

| Приоритет    | Источник                         | Поведение при переопределении                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (высший) | Флаги CLI (`--openai-api-key`) | Всегда имеет приоритет                                  |
| 2           | Системное окружение (`export`, inline)  | Переопределяет `.env` и `settings.json` → `env` |
| 3           | Файл `.env`                    | Устанавливается, только если отсутствует в системном окружении               |
| 4 (низший)  | `settings.json` → `env`        | Устанавливается, только если отсутствует в системном окружении или `.env`     |

#### Шаг 3: Переключение моделей через `/model`

После запуска Qwen Code используйте команду `/model` для переключения между всеми настроенными моделями. Модели сгруппированы по протоколам:

```
/model
```

Селектор покажет все модели из вашей конфигурации `modelProviders`, сгруппированные по протоколу (например, `openai`, `anthropic`, `gemini`). Ваш выбор сохраняется между сессиями.

Вы также можете переключать модели напрямую через аргумент командной строки, что удобно при работе в нескольких терминалах.

```bash
# В одном терминале

qwen --model "qwen3-coder-plus"

# В другом терминале

qwen --model "qwen3.5-plus"
```

## CLI-команда `qwen auth`

Помимо слэш-команды `/auth` внутри сессии, Qwen Code предоставляет отдельную CLI-команду `qwen auth` для управления аутентификацией напрямую из терминала — без предварительного запуска интерактивной сессии.

### Интерактивный режим

Запустите `qwen auth` без аргументов, чтобы открыть интерактивное меню:

```bash
qwen auth
```

Вы увидите селектор с навигацией стрелками:

```
Select authentication method:

> Qwen OAuth - Free · Up to 1,000 requests/day · Qwen latest models
  Alibaba Cloud Coding Plan - Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models

(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)
```

### Подкоманды

| Команда                                              | Описание                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | Интерактивная настройка аутентификации                  |
| `qwen auth qwen-oauth`                               | Аутентификация через Qwen OAuth                      |
| `qwen auth coding-plan`                              | Аутентификация через Alibaba Cloud Coding Plan       |
| `qwen auth coding-plan --region china --key sk-sp-…` | Неинтерактивная настройка Coding Plan (для скриптов) |
| `qwen auth status`                                   | Показать текущий статус аутентификации                |

**Примеры:**

```bash
# Прямая аутентификация через Qwen OAuth
qwen auth qwen-oauth

# Интерактивная настройка Coding Plan (запрос региона и ключа)
qwen auth coding-plan

# Неинтерактивная настройка Coding Plan (полезно для CI/скриптов)
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx

# Проверка текущей конфигурации аутентификации
qwen auth status
```

## Примечания по безопасности

- Не коммитьте API-ключи в систему контроля версий.
- Используйте `.qwen/.env` для локальных секретов проекта (и исключите его из git).
- Считайте вывод терминала конфиденциальным, если в нем отображаются учетные данные для проверки.