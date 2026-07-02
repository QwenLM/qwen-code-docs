# Аутентификация

Меню `/auth` при первом запуске Qwen Code содержит три основных варианта. Выберите тот, который соответствует вашему способу использования CLI:

- **Alibaba ModelStudio**: официальный рекомендуемый вариант. Открывает подменю с **Coding Plan** (для индивидуальных разработчиков · включена недельная квота), **Token Plan** (для команд и компаний · оплата по мере использования с выделенным эндпоинтом) или **Standard API Key** (подключение с существующим API-ключом ModelStudio).
- **Third-party Providers**: выберите встроенного провайдера и подключитесь с помощью API-ключа (DeepSeek, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: вручную подключите локальный сервер, прокси или неподдерживаемого провайдера — поддерживаются OpenAI, Anthropic, Gemini и другие совместимые эндпоинты.

> [!note]
>
> **Qwen OAuth** больше не доступен для выбора в диалоговом окне — его бесплатный тариф был отменен 15 апреля 2026 года. Ниже он описан только как жестко заданный, отмененный провайдер.

## Вариант 1: Qwen OAuth (Отменен)

> [!warning]
>
> Бесплатный тариф Qwen OAuth был отменен 15 апреля 2026 года. Существующие кэшированные токены могут продолжать работать некоторое время, но новые запросы будут отклоняться. Пожалуйста, перейдите на Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) или другого провайдера. Запустите `qwen` и используйте `/auth` для настройки.

- **Как это работает**: при первом запуске Qwen Code открывает страницу входа в браузере. После завершения учетные данные кэшируются локально, поэтому обычно вам не придется входить снова.
- **Требования**: аккаунт `qwen.ai` + доступ в интернет (хотя бы для первого входа).
- **Преимущества**: не нужно управлять API-ключами, автоматическое обновление учетных данных.
- **Стоимость и квоты**: бесплатный тариф отменен с 15 апреля 2026 года.

Запустите CLI и следуйте инструкциям в браузере:

```bash
qwen
```

Qwen OAuth больше не предлагается как доступный для выбора пункт в диалоге `/auth`; вместо этого запустите `/auth` и выберите один из текущих вариантов (Alibaba ModelStudio, Third-party Providers или Custom Provider).

> [!note]
>
> В неинтерактивных или headless-окружениях (например, CI, SSH, контейнеры) обычно **невозможно** пройти процесс входа через браузер OAuth.
> В таких случаях, пожалуйста, используйте Alibaba Cloud Coding Plan или метод аутентификации по API-ключу.

## 💳 Вариант 2: Alibaba Cloud Coding Plan

Используйте этот вариант, если вам нужны предсказуемые расходы, широкий выбор моделей и более высокие квоты использования.

- **Как это работает**: Оформите подписку на Coding Plan с фиксированной ежемесячной платой, затем настройте Qwen Code на использование выделенного эндпоинта и вашего API-ключа подписки.
- **Требования**: Получите активную подписку Coding Plan в [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) или [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), в зависимости от региона вашего аккаунта.
- **Преимущества**: широкий выбор моделей, более высокие квоты использования, предсказуемые ежемесячные расходы, доступ к широкому спектру моделей (Qwen, GLM, Kimi, Minimax и другим).
- **Стоимость и квоты**: См. документацию Aliyun ModelStudio Coding Plan [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Alibaba Cloud Coding Plan доступен в двух регионах:

| Регион                       | URL консоли                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Интерактивная настройка

Введите `qwen` в терминале, чтобы запустить Qwen Code, затем выполните команду `/auth`, выберите **Alibaba ModelStudio** и выберите **Coding Plan** в подменю. Выберите ваш регион, затем введите ваш ключ `sk-sp-xxxxxxxxx`.

После аутентификации используйте команду `/model` для переключения между всеми поддерживаемыми моделями Alibaba Cloud Coding Plan (включая qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 и MiniMax-M2.5).

### Настройка для headless-окружений или скриптов

Для CI, контейнеров или скриптов настройте Coding Plan с помощью переменных окружения или `settings.json` вместо удаленной команды `qwen auth coding-plan`.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Используйте `https://coding.dashscope.aliyuncs.com/v1` для эндпоинта China (Beijing) или `https://coding-intl.dashscope.aliyuncs.com/v1` для международного эндпоинта.

### Альтернатива: настройка через `settings.json`

Если вы предпочитаете пропустить интерактивный процесс `/auth`, добавьте следующее в `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus (Coding Plan)",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
          "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
          "envKey": "BAILIAN_CODING_PLAN_API_KEY"
        }
      ]
    }
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
> Coding Plan использует выделенный эндпоинт (`https://coding.dashscope.aliyuncs.com/v1`), который отличается от стандартного эндпоинта Dashscope. Убедитесь, что используете правильный `baseUrl`.

## 🚀 Вариант 3: API Key (гибкий)

Используйте этот вариант, если хотите подключиться к сторонним провайдерам, таким как OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope, или к self-hosted эндпоинту. Поддерживается множество протоколов и провайдеров.

### Рекомендуется: настройка в одном файле через `settings.json`

Самый простой способ начать работу с аутентификацией по API-ключу — поместить всё в один файл `~/.qwen/settings.json`. Вот полный, готовый к использованию пример:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
          "description": "Qwen3-Coder via Dashscope",
          "envKey": "DASHSCOPE_API_KEY"
        }
      ]
    }
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

Что делает каждое поле:

| Поле                         | Описание                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Объявляет, какие модели доступны и как к ним подключаться. Ключи (`openai`, `anthropic`, `gemini`) представляют протокол API.              |
| `env`                        | Хранит API-ключи непосредственно в `settings.json` в качестве резервного варианта (наименьший приоритет — `export` в shell и файлы `.env` имеют приоритет).                  |
| `security.auth.selectedType` | Указывает Qwen Code, какой протокол использовать при запуске (например, `openai`, `anthropic`, `gemini`). Без этого вам придется запускать `/auth` интерактивно. |
| `model.name`                 | Модель по умолчанию, активируемая при запуске Qwen Code. Должна совпадать с одним из значений `id` в ваших `modelProviders`.                                |

После сохранения файла просто запустите `qwen` — интерактивная настройка `/auth` не требуется.

> [!tip]
>
> В разделах ниже каждая часть объясняется более подробно. Если приведенный выше быстрый пример вам подходит, можете сразу перейти к [Примечаниям по безопасности](#security-notes).

Ключевая концепция — **Model Providers** (`modelProviders`): Qwen Code поддерживает несколько протоколов API, а не только OpenAI. Вы настраиваете доступных провайдеров и модели, редактируя `~/.qwen/settings.json`, а затем переключаетесь между ними во время выполнения с помощью команды `/model`.

#### Поддерживаемые протоколы

| Протокол          | Ключ `modelProviders` | Переменные окружения                                                                                | Провайдеры                                                                                             |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI-совместимый | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (алиас: `QWEN_MODEL`)                            | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, любой OpenAI-совместимый эндпоинт |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                         | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                     | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY`, `GOOGLE_MODEL` (устанавливает `GOOGLE_GENAI_USE_VERTEXAI=true`; использует протокол `gemini`) | Google Vertex AI                                                                                      |

#### Шаг 1: Настройка моделей и провайдеров в `~/.qwen/settings.json`

Определите, какие модели доступны для каждого протокола. Каждая запись модели требует как минимум `id`; `envKey` (имя переменной окружения, содержащей ваш API-ключ) необязателен, но рекомендуется — если он пропущен, используется ключ окружения по умолчанию для типа аутентификации (например, `OPENAI_API_KEY` для `openai`).

> [!important]
>
> Рекомендуется определять `modelProviders` в `~/.qwen/settings.json` в области пользователя, чтобы избежать конфликтов слияния между настройками проекта и пользователя.

Отредактируйте `~/.qwen/settings.json` (создайте его, если он не существует). Вы можете смешивать несколько протоколов в одном файле — вот пример с несколькими провайдерами, показывающий только раздел `modelProviders`:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "envKey": "OPENAI_API_KEY",
          "baseUrl": "https://api.openai.com/v1"
        }
      ]
    },
    "anthropic": {
      "protocol": "anthropic",
      "models": [
        {
          "id": "claude-sonnet-4-20250514",
          "name": "Claude Sonnet 4",
          "envKey": "ANTHROPIC_API_KEY"
        }
      ]
    },
    "gemini": {
      "protocol": "gemini",
      "models": [
        {
          "id": "gemini-2.5-pro",
          "name": "Gemini 2.5 Pro",
          "envKey": "GEMINI_API_KEY"
        }
      ]
    }
  }
}
```

> [!tip]
>
> Не забудьте также установить `env`, `security.auth.selectedType` и `model.name` вместе с `modelProviders` — см. [полный пример выше](#recommended-one-file-setup-via-settingsjson) для справки.

**Поля `ModelConfig` (каждая запись внутри `modelProviders`):**

| Поле               | Обязательно | Описание                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Да      | ID модели, отправляемый в API (например, `gpt-4o`, `claude-sonnet-4-20250514`)                                                                               |
| `name`             | Нет       | Отображаемое имя в селекторе `/model` (по умолчанию равно `id`)                                                                                             |
| `envKey`           | Нет       | Имя переменной окружения для API-ключа (например, `OPENAI_API_KEY`); необязательно/рекомендуется — по умолчанию используется ключ окружения типа аутентификации, если пропущено |
| `baseUrl`          | Нет       | Переопределение эндпоинта API (полезно для прокси или пользовательских эндпоинтов)                                                                                     |
| `generationConfig` | Нет       | Тонкая настройка `timeout`, `maxRetries`, `samplingParams` и т.д.                                                                                          |

> [!note]
>
> При использовании поля `env` в `settings.json` учетные данные хранятся в открытом виде. Для большей безопасности предпочитайте файлы `.env` или `export` в shell — см. [Шаг 2](#step-2-set-environment-variables).

Полную схему `modelProviders` и расширенные параметры, такие как `generationConfig`, `customHeaders` и `extra_body`, см. в [Model Providers Reference](model-providers.md).

#### Шаг 2: Установка переменных окружения

Qwen Code читает API-ключи из переменных окружения (указанных в `envKey` в конфигурации вашей модели). Есть несколько способов их предоставить, перечисленных ниже от наивысшего к наименьшему приоритету:

**1. Окружение shell / `export` (наивысший приоритет)**

Установите напрямую в профиле вашего shell (`~/.zshrc`, `~/.bashrc` и т.д.) или инлайн перед запуском:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-совместимый
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. Файлы `.env`**

Qwen Code автоматически загружает **первый** найденный файл `.env` (переменные **не объединяются** из нескольких файлов). Загружаются только те переменные, которых еще нет в `process.env`.

Порядок поиска (от текущего каталога, поднимаясь вверх к `/`):

1. `.qwen/.env` (предпочтительно — изолирует переменные Qwen Code от других инструментов)
2. `.env`

Если ничего не найдено, используется резервный вариант в вашем **домашнем каталоге**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` рекомендуется вместо `.env`, чтобы избежать конфликтов с другими инструментами. Некоторые переменные (например, `DEBUG` и `DEBUG_MODE`) исключаются из файлов `.env` на уровне проекта, чтобы не влиять на поведение Qwen Code.

**3. `settings.json` → поле `env` (наименьший приоритет)**

Вы также можете определить API-ключи непосредственно в `~/.qwen/settings.json` под ключом `env`. Они загружаются как резервный вариант с наименьшим приоритетом — применяются только тогда, когда переменная еще не установлена системным окружением или файлами `.env`.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Это подход, использованный в [примере настройки в одном файле](#recommended-one-file-setup-via-settingsjson) выше. Это удобно для хранения всего в одном месте, но имейте в виду, что `settings.json` может быть общим или синхронизированным — для конфиденциальных секретов предпочитайте файлы `.env`.

**Сводка по приоритетам:**

| Приоритет    | Источник                         | Поведение переопределения                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (наивысший) | Флаги CLI (`--openai-api-key`) | Всегда выигрывает                                  |
| 2           | Системное окружение (`export`, инлайн)  | Переопределяет `.env` и `settings.json` → `env` |
| 3           | Файл `.env`                    | Устанавливает, только если нет в системном окружении               |
| 4 (наименьший)  | `settings.json` → `env`        | Устанавливает, только если нет в системном окружении или `.env`     |

#### Шаг 3: Переключение моделей с помощью `/model`

После запуска Qwen Code используйте команду `/model` для переключения между всеми настроенными моделями. Модели сгруппированы по протоколу:

```
/model
```

Селектор покажет все модели из вашей конфигурации `modelProviders`, сгруппированные по их протоколу (например, `openai`, `anthropic`, `gemini`). Ваш выбор сохраняется между сессиями.

Вы также можете переключать модели напрямую с помощью аргумента командной строки, что удобно при работе в нескольких терминалах.

```bash
# В одном терминале

qwen --model "qwen3-coder-plus"

# В другом терминале

qwen --model "qwen3.5-plus"
```

## Удаленная CLI-команда `qwen auth`

Отдельная CLI-команда `qwen auth` была удалена. Вместо нее используйте следующие замены:

| Предыдущий вариант использования                | Замена                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Интерактивная настройка аутентификации | Запустите `qwen`, затем используйте `/auth`                                                                |
| Настройка Coding Plan                | Используйте `/auth` или установите `BAILIAN_CODING_PLAN_API_KEY` с базовым URL Coding Plan             |
| Настройка OpenRouter                 | Используйте `/auth` или установите `OPENROUTER_API_KEY` и `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Настройка Requesty                   | Используйте `/auth` или установите `REQUESTY_API_KEY` и `OPENAI_BASE_URL=https://router.requesty.ai/v1`  |
| Настройка API-ключа или пользовательского провайдера | Настройте `~/.qwen/settings.json`, `.env` или специфичные для провайдера переменные окружения       |
| Проверка текущей аутентификации     | Запустите `/doctor` внутри Qwen Code                                                              |
| Процесс OAuth в браузере               | Запустите `qwen` интерактивно и используйте `/auth`; OAuth нельзя настроить только с помощью переменных окружения    |

Устаревшие вызовы, такие как `qwen auth status`, теперь выводят уведомление об удалении с этими путями миграции.

## Примечания по безопасности

- Не коммитьте API-ключи в систему контроля версий.
- Предпочитайте `.qwen/.env` для секретов на уровне проекта (и держите его вне git).
- Относитесь к выводу вашего терминала как к конфиденциальному, если он выводит учетные данные для проверки.