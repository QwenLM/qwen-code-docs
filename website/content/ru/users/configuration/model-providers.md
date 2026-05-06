# Провайдеры моделей

Qwen Code позволяет настраивать несколько провайдеров моделей через параметр `modelProviders` в файле `settings.json`. Это позволяет переключаться между различными ИИ-моделями и провайдерами с помощью команды `/model`.

## Обзор

Используйте `modelProviders` для объявления списков моделей по типам аутентификации, между которыми может переключаться селектор `/model`. Ключи должны быть валидными типами аутентификации (`openai`, `anthropic`, `gemini` и т.д.). Каждая запись требует `id` и **обязательно должна включать `envKey`**, а также опциональные `name`, `description`, `baseUrl` и `generationConfig`. Учетные данные никогда не сохраняются в настройках; среда выполнения считывает их из `process.env[envKey]`. Модели Qwen OAuth остаются захардкоженными и не могут быть переопределены.

> [!note]
>
> Только команда `/model` предоставляет доступ к нестандартным типам аутентификации. Anthropic, Gemini и другие должны быть определены через `modelProviders`. Команда `/auth` отображает Qwen OAuth, Alibaba Cloud Coding Plan и API Key как встроенные варианты аутентификации.

> [!warning]
>
> **Дублирующиеся ID моделей в одном authType:** Определение нескольких моделей с одинаковым `id` в рамках одного `authType` (например, две записи с `"id": "gpt-4o"` в `openai`) в настоящее время не поддерживается. При наличии дубликатов **применяется первое вхождение**, а последующие пропускаются с предупреждением. Обратите внимание, что поле `id` используется как идентификатор конфигурации, так и как фактическое имя модели, отправляемое в API, поэтому использование уникальных ID (например, `gpt-4o-creative`, `gpt-4o-balanced`) не является рабочим обходным путем. Это известное ограничение, которое мы планируем исправить в будущих релизах.

## Примеры конфигурации по типам аутентификации

Ниже приведены подробные примеры конфигурации для различных типов аутентификации, демонстрирующие доступные параметры и их комбинации.

### Поддерживаемые типы аутентификации

Ключи объекта `modelProviders` должны быть валидными значениями `authType`. В настоящее время поддерживаются следующие типы:

| Auth Type    | Описание                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | OpenAI-совместимые API (OpenAI, Azure OpenAI, локальные серверы инференса, такие как vLLM/Ollama) |
| `anthropic`  | Anthropic Claude API                                                                    |
| `gemini`     | Google Gemini API                                                                       |
| `qwen-oauth` | Qwen OAuth (захардкожен, нельзя переопределить в `modelProviders`)                       |

> [!warning]
> Если используется невалидный ключ типа аутентификации (например, опечатка вроде `"openai-custom"`), конфигурация будет **тихо пропущена**, и модели не появятся в селекторе `/model`. Всегда используйте один из поддерживаемых значений, перечисленных выше.

### SDK, используемые для API-запросов

Qwen Code использует следующие официальные SDK для отправки запросов каждому провайдеру:

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) — Официальный OpenAI Node.js SDK                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — Официальный Anthropic SDK |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) — Официальный Google GenAI SDK      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) с кастомным провайдером (совместим с DashScope)    |

Это означает, что настраиваемый вами `baseUrl` должен быть совместим с ожидаемым форматом API соответствующего SDK. Например, при использовании типа аутентификации `openai` эндпоинт должен принимать запросы в формате OpenAI API.

### OpenAI-совместимые провайдеры (`openai`)

Этот тип аутентификации поддерживает не только официальный API OpenAI, но и любые OpenAI-совместимые эндпоинты, включая агрегаторы моделей, такие как OpenRouter.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "enableCacheControl": true,
          "contextWindowSize": 128000,
          "modalities": {
            "image": true
          },
          "customHeaders": {
            "X-Client-Request-ID": "req-123"
          },
          "extra_body": {
            "enable_thinking": true,
            "service_tier": "priority"
          },
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 4096,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.1
          }
        }
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 30000,
          "samplingParams": {
            "temperature": 0.5,
            "max_tokens": 2048
          }
        }
      },
      {
        "id": "openai/gpt-4o",
        "name": "GPT-4o (via OpenRouter)",
        "envKey": "OPENROUTER_API_KEY",
        "baseUrl": "https://openrouter.ai/api/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      }
    ]
  }
}
```

### Anthropic (`anthropic`)

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "contextWindowSize": 200000,
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 0.9
          }
        }
      },
      {
        "id": "claude-3-opus",
        "name": "Claude 3 Opus",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 180000,
          "samplingParams": {
            "temperature": 0.3,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "capabilities": {
          "vision": true
        },
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 2,
          "contextWindowSize": 1000000,
          "schemaCompliance": "auto",
          "samplingParams": {
            "temperature": 0.4,
            "top_p": 0.95,
            "max_tokens": 8192,
            "top_k": 40
          }
        }
      }
    ]
  }
}
```

### Локальные self-hosted модели (через OpenAI-совместимый API)

Большинство локальных серверов инференса (vLLM, Ollama, LM Studio и др.) предоставляют OpenAI-совместимый API-эндпоинт. Настройте их, используя тип аутентификации `openai` с локальным `baseUrl`:

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1",
        "generationConfig": {
          "timeout": 300000,
          "maxRetries": 1,
          "contextWindowSize": 32768,
          "samplingParams": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 4096
          }
        }
      },
      {
        "id": "llama-3.1-8b",
        "name": "Llama 3.1 8B (vLLM)",
        "envKey": "VLLM_API_KEY",
        "baseUrl": "http://localhost:8000/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 2,
          "contextWindowSize": 128000,
          "samplingParams": {
            "temperature": 0.6,
            "max_tokens": 8192
          }
        }
      },
      {
        "id": "local-model",
        "name": "Local Model (LM Studio)",
        "envKey": "LMSTUDIO_API_KEY",
        "baseUrl": "http://localhost:1234/v1",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": {
            "temperature": 0.5
          }
        }
      }
    ]
  }
}
```

Для локальных серверов, не требующих аутентификации, можно использовать любое placeholder-значение для API-ключа:

```bash
# Для Ollama (аутентификация не требуется)
export OLLAMA_API_KEY="ollama"

# Для vLLM (если аутентификация не настроена)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Параметр `extra_body` **поддерживается только для OpenAI-совместимых провайдеров** (`openai`, `qwen-oauth`). Он игнорируется для провайдеров Anthropic и Gemini.

> [!note]
>
> **О `envKey`**: Поле `envKey` указывает **имя переменной окружения**, а не фактическое значение API-ключа. Чтобы конфигурация работала, необходимо убедиться, что соответствующая переменная окружения установлена с вашим реальным API-ключом. Есть два способа сделать это:
>
> - **Вариант 1: Использование файла `.env`** (рекомендуется для безопасности):
>   ```bash
>   # ~/.qwen/.env (или корень проекта)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Обязательно добавьте `.env` в `.gitignore`, чтобы случайно не закоммитить секреты.
> - **Вариант 2: Использование поля `env` в `settings.json`** (как показано в примерах выше):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Каждый пример провайдера включает поле `env` для демонстрации того, как должен быть настроен API-ключ.

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan предоставляет предварительно настроенный набор моделей Qwen, оптимизированных для задач программирования. Эта функция доступна пользователям с доступом к API Alibaba Cloud Coding Plan и предлагает упрощенную настройку с автоматическим обновлением конфигурации моделей.

### Обзор

При аутентификации с помощью API-ключа Alibaba Cloud Coding Plan через команду `/auth`, Qwen Code автоматически настраивает следующие модели:

| Model ID               | Name                 | Описание                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Продвинутая модель с включенным режимом мышления   |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Оптимизирована для задач программирования             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Последняя max-модель с включенным режимом мышления |

### Настройка

1. Получите API-ключ Alibaba Cloud Coding Plan:
   - **Китай**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **Международный**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Выполните команду `/auth` в Qwen Code
3. Выберите **Alibaba Cloud Coding Plan**
4. Выберите ваш регион
5. Введите API-ключ по запросу

Модели будут автоматически настроены и добавлены в ваш селектор `/model`.

### Регионы

Alibaba Cloud Coding Plan поддерживает два региона:

| Region               | Endpoint                                        | Описание             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Эндпоинт для материкового Китая |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Международный эндпоинт  |

Регион выбирается во время аутентификации и сохраняется в `settings.json` в поле `codingPlan.region`. Чтобы сменить регион, повторно выполните команду `/auth` и выберите другой регион.

### Хранение API-ключа

При настройке Coding Plan через команду `/auth` API-ключ сохраняется с использованием зарезервированного имени переменной окружения `BAILIAN_CODING_PLAN_API_KEY`. По умолчанию он сохраняется в поле `env` вашего файла `settings.json`.

> [!warning]
>
> **Рекомендация по безопасности**: Для повышения безопасности рекомендуется переместить API-ключ из `settings.json` в отдельный файл `.env` и загружать его как переменную окружения. Например:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Затем убедитесь, что этот файл добавлен в `.gitignore`, если вы используете настройки на уровне проекта.

### Автоматические обновления

Конфигурации моделей Coding Plan версионируются. Когда Qwen Code обнаруживает более новую версию шаблона модели, вам будет предложено обновиться. Принятие обновления приведет к следующему:

- Замене существующих конфигураций моделей Coding Plan на последние версии
- Сохранению любых кастомных конфигураций моделей, добавленных вами вручную
- Автоматическому переключению на первую модель в обновленной конфигурации

Процесс обновления гарантирует, что у вас всегда есть доступ к последним конфигурациям и функциям моделей без необходимости ручного вмешательства.

### Ручная конфигурация (для продвинутых)

Если вы предпочитаете вручную настраивать модели Coding Plan, вы можете добавить их в `settings.json` так же, как любой OpenAI-совместимый провайдер:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via Alibaba Cloud Coding Plan",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
>
> При использовании ручной конфигурации:
>
> - Вы можете использовать любое имя переменной окружения для `envKey`
> - Вам не нужно настраивать `codingPlan.*`
> - **Автоматические обновления не будут применяться** к моделям Coding Plan, настроенным вручную

> [!warning]
>
> Если вы также используете автоматическую конфигурацию Coding Plan, автоматические обновления могут перезаписать ваши ручные настройки, если они используют те же `envKey` и `baseUrl`, что и автоматическая конфигурация. Чтобы избежать этого, по возможности убедитесь, что ваша ручная конфигурация использует другой `envKey`.

## Слои разрешения и атомарность

Эффективные значения аутентификации/модели/учетных данных выбираются для каждого поля согласно следующему приоритету (побеждает первое найденное). Вы можете комбинировать `--auth-type` с `--model`, чтобы напрямую указать на запись провайдера; эти флаги CLI обрабатываются до других слоев.

| Layer (highest → lowest)   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatic overrides     | `/auth`                             | `/auth` input                                   | `/auth` input                                       | `/auth` input                                        | —                      | —                                 |
| Model provider selection   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI arguments              | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (or provider-specific equivalents) | `--openaiBaseUrl` (or provider-specific equivalents) | —                      | —                                 |
| Environment variables      | —                                   | Provider-specific mapping (e.g. `OPENAI_MODEL`) | Provider-specific mapping (e.g. `OPENAI_API_KEY`)   | Provider-specific mapping (e.g. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Settings (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Default / computed         | Falls back to `AuthType.QWEN_OAUTH` | Built-in default (OpenAI ⇒ `qwen3-coder-plus`)  | —                                                   | —                                                    | —                      | `Config.getProxy()` if configured |

\*При наличии флаги аутентификации CLI переопределяют настройки. В противном случае тип аутентификации определяется `security.auth.selectedType` или неявным значением по умолчанию. Qwen OAuth и OpenAI — единственные типы аутентификации, доступные без дополнительной конфигурации.

> [!warning]
>
> **Устаревание `security.auth.apiKey` и `security.auth.baseUrl`:** Прямая настройка учетных данных API через `security.auth.apiKey` и `security.auth.baseUrl` в `settings.json` объявлена устаревшей. Эти настройки использовались в старых версиях для учетных данных, введенных через UI, но поток ввода учетных данных был удален в версии 0.10.1. Эти поля будут полностью удалены в будущем релизе. **Настоятельно рекомендуется перейти на `modelProviders`** для всех конфигураций моделей и учетных данных. Используйте `envKey` в `modelProviders` для ссылки на переменные окружения в целях безопасного управления учетными данными вместо хардкодинга их в файлах настроек.

## Слои конфигурации генерации: Непроницаемый слой провайдера

Разрешение конфигурации следует строгой модели слоев с одним ключевым правилом: **слой modelProvider является непроницаемым**.

### Как это работает

1. **Когда модель modelProvider ВЫБРАНА** (например, через команду `/model`, выбирающую модель, настроенную провайдером):
   - Вся `generationConfig` от провайдера применяется **атомарно**
   - **Слой провайдера полностью непроницаем** — нижние слои (CLI, env, настройки) вообще не участвуют в разрешении generationConfig
   - Все поля, определенные в `modelProviders[].generationConfig`, используют значения провайдера
   - Все поля, **не определенные** провайдером, устанавливаются в `undefined` (не наследуются из настроек)
   - Это гарантирует, что конфигурации провайдеров действуют как полный, самодостаточный "запечатанный пакет"

2. **Когда модель modelProvider НЕ ВЫБРАНА** (например, использование `--model` с сырым ID модели или прямое использование CLI/env/настроек):
   - Разрешение переходит к нижним слоям
   - Поля заполняются из CLI → env → настройки → значения по умолчанию
   - Это создает **Runtime Model** (см. следующий раздел)

### Приоритет по полям для `generationConfig`

| Priority | Source                                        | Behavior                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Programmatic overrides                        | Изменения во время выполнения через `/model`, `/auth`                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **Непроницаемый слой** — полностью заменяет все поля generationConfig; нижние слои не участвуют |
| 3        | `settings.model.generationConfig`             | Используется только для **Runtime Models** (когда модель провайдера не выбрана)                                    |
| 4        | Content-generator defaults                    | Значения по умолчанию генератора контента (например, OpenAI vs Gemini) — только для Runtime Models                            |

### Атомарная обработка полей

Следующие поля обрабатываются как атомарные объекты — значения провайдера полностью заменяют весь объект, слияние не происходит:

- `samplingParams` — Temperature, top_p, max_tokens и т.д.
- `customHeaders` — Кастомные HTTP-заголовки
- `extra_body` — Дополнительные параметры тела запроса

### Пример

```json
// User settings (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders configuration
{
  "modelProviders": {
    "openai": [{
      "id": "gpt-4o",
      "envKey": "OPENAI_API_KEY",
      "generationConfig": {
        "timeout": 60000,
        "samplingParams": { "temperature": 0.2 }
      }
    }]
  }
}
```

При выборе `gpt-4o` из modelProviders:

- `timeout` = 60000 (от провайдера, переопределяет настройки)
- `samplingParams.temperature` = 0.2 (от провайдера, полностью заменяет объект настроек)
- `samplingParams.max_tokens` = **undefined** (не определено в провайдере, и слой провайдера не наследует значения из настроек — поля явно устанавливаются в undefined, если не предоставлены)

При использовании сырой модели через `--model gpt-4` (не из modelProviders, создает Runtime Model):

- `timeout` = 30000 (из настроек)
- `samplingParams.temperature` = 0.5 (из настроек)
- `samplingParams.max_tokens` = 1000 (из настроек)

Стратегия слияния для самого `modelProviders` — REPLACE: весь `modelProviders` из настроек проекта переопределит соответствующий раздел в пользовательских настройках, вместо их слияния.

## Конфигурация рассуждений / мышления

Опциональное поле `reasoning` внутри `generationConfig` управляет тем, насколько интенсивно модель рассуждает перед ответом. Конвертеры Anthropic и Gemini всегда учитывают его. OpenAI-совместимый пайплайн учитывает его, **если только** не установлен `generationConfig.samplingParams` — см. примечание "Взаимодействие с `samplingParams`" ниже.

```jsonc
{
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "baseUrl": "https://api.deepseek.com/v1",
        "envKey": "DEEPSEEK_API_KEY",
        "generationConfig": {
          // The four-tier scale:
          //   'low'    | 'medium' — server-mapped to 'high' on DeepSeek
          //   'high'   — default reasoning intensity
          //   'max'    — DeepSeek-specific extra-strong tier
          // Or set `false` to disable reasoning entirely.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### Поведение для каждого провайдера

| Protocol / provider                          | Wire shape                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | Flat `reasoning_effort: <effort>` body parameter                     | Когда `reasoning.effort` установлен во вложенной конфигурации, он перезаписывается в плоский `reasoning_effort`, а `'low'`/`'medium'` нормализуются до `'high'`, `'xhigh'` до `'max'` — это отражает [обратную совместимость на стороне сервера DeepSeek](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion). Переопределения через `samplingParams.reasoning_effort` или `extra_body.reasoning_effort` верхнего уровня пропускают эту нормализацию и отправляются как есть. |
| **OpenAI** (другие совместимые серверы)        | `reasoning: { effort, ... }` passed through verbatim                 | Устанавливается через `samplingParams` (например, `samplingParams.reasoning_effort` для GPT-5/o-series), когда провайдер ожидает другую структуру.                                                                                                                                                                                                                                                                                                |
| **Anthropic** (реальный `api.anthropic.com`)     | `output_config: { effort }` plus the `effort-2025-11-24` beta header | Реальный Anthropic принимает только `'low'`/`'medium'`/`'high'`. `'max'` **ограничивается до `'high'`** с записью `debugLogger.warn` (один раз на генератор); если вам нужна максимальная интенсивность, переключите baseURL на эндпоинт, совместимый с DeepSeek, который это поддерживает.                                                                                                                                                                                  |
| **Anthropic** (`api.deepseek.com/anthropic`) | Same `output_config: { effort }` + beta header                       | `'max'` передается без изменений.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, остальные → `THINKING_LEVEL_UNSPECIFIED` (у Gemini нет уровня `MAX`).                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

Установка `reasoning: false` (буквальный boolean) явно отключает мышление на всех провайдерах — полезно для дешевых побочных запросов, которые не выигрывают от рассуждений. Это также учитывается на уровне запроса через `request.config.thinkingConfig.includeThoughts: false` для разовых вызовов (например, генерация подсказок).

На baseURL `api.deepseek.com` OpenAI-пайплайн отправляет явное поле `thinking: { type: 'disabled' }`, которое требуется DeepSeek V4+ — значение по умолчанию на сервере `'enabled'`, поэтому простое опускание `reasoning_effort` все равно приведет к задержке/затратам на мышление. Self-hosted бэкенды DeepSeek (sglang/vllm) и другие OpenAI-совместимые серверы **не получают** это поле; если вам нужно отключить мышление на них, внедрите `thinking: { type: 'disabled' }` (или любой другой регулятор, предоставляемый вашим фреймворком инференса) через `samplingParams`/`extra_body`.

### Взаимодействие с `samplingParams` (только для OpenAI-совместимых)

> [!warning]
>
> Когда `generationConfig.samplingParams` установлен для OpenAI-совместимого провайдера, пайплайн отправляет эти ключи в сеть **как есть** и полностью пропускает отдельную инъекцию `reasoning`. Таким образом, конфигурация вида `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` молча проигнорирует поле reasoning в запросах к OpenAI/DeepSeek.
>
> Если вы устанавливаете `samplingParams`, включите регулятор reasoning прямо в него — для DeepSeek это `samplingParams.reasoning_effort`, для GPT-5/o-series это `samplingParams.reasoning_effort` (их плоское поле) или `samplingParams.reasoning` (вложенный объект). Для OpenRouter и других провайдеров имя поля может отличаться; сверяйтесь с документацией провайдера.
>
> Конвертеры Anthropic и Gemini не затрагиваются — они всегда читают `reasoning.effort` напрямую, независимо от `samplingParams`.

### `budget_tokens`

Вы можете зафиксировать точный бюджет токенов мышления, указав `budget_tokens` вместе с `effort`:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Для Anthropic это становится `thinking.budget_tokens`. Для OpenAI/DeepSeek поле сохраняется, но в настоящее время игнорируется сервером — `reasoning_effort` является основным регулятором.

## Модели провайдеров vs Runtime Models

Qwen Code различает два типа конфигураций моделей:

### Модель провайдера

- Определяется в конфигурации `modelProviders`
- Имеет полный, атомарный пакет конфигурации
- При выборе ее конфигурация применяется как непроницаемый слой
- Отображается в списке команды `/model` с полными метаданными (name, description, capabilities)
- Рекомендуется для рабочих процессов с несколькими моделями и обеспечения согласованности в команде

### Runtime Model

- Создается динамически при использовании сырых ID моделей через CLI (`--model`), переменные окружения или настройки
- Не определена в `modelProviders`
- Конфигурация строится путем "проецирования" через слои разрешения (CLI → env → настройки → значения по умолчанию)
- Автоматически фиксируется как **RuntimeModelSnapshot** при обнаружении полной конфигурации
- Позволяет повторно использовать без повторного ввода учетных данных

### Жизненный цикл RuntimeModelSnapshot

Когда вы настраиваете модель без использования `modelProviders`, Qwen Code автоматически создает RuntimeModelSnapshot для сохранения вашей конфигурации:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

Снимок (snapshot):

- Фиксирует ID модели, API-ключ, базовый URL и конфигурацию генерации
- Сохраняется между сессиями (хранится в памяти во время выполнения)
- Отображается в списке команды `/model` как опция времени выполнения
- Можно переключиться с помощью `/model $runtime|openai|my-custom-model`

### Ключевые отличия

| Aspect                  | Provider Model                    | Runtime Model                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Configuration source    | `modelProviders` в настройках      | Слои CLI, env, настройки                  |
| Configuration atomicity | Полный, непроницаемый пакет     | Слоистая, каждое поле разрешается независимо |
| Reusability             | Всегда доступна в списке `/model` | Фиксируется как снимок, появляется при полной конфигурации  |
| Team sharing            | Да (через закоммиченные настройки)      | Нет (локально для пользователя)                            |
| Credential storage      | Только ссылка через `envKey`       | Может захватить фактический ключ в снимке         |

### Когда использовать каждый тип

- **Используйте модели провайдеров**, когда: у вас есть стандартные модели, общие для команды, требуются согласованные конфигурации или вы хотите предотвратить случайные переопределения
- **Используйте Runtime Models**, когда: быстро тестируете новую модель, используете временные учетные данные или работаете с ad-hoc эндпоинтами

## Сохранение выбора и рекомендации

> [!important]
>
> Определяйте `modelProviders` в пользовательской области `~/.qwen/settings.json` по возможности и избегайте сохранения переопределений учетных данных в любой области. Хранение каталога провайдеров в пользовательских настройках предотвращает конфликты слияния/переопределения между настройками проекта и пользователя, а также гарантирует, что обновления `/auth` и `/model` всегда записываются в согласованную область.

- `/model` и `/auth` сохраняют `model.name` (где применимо) и `security.auth.selectedType` в ближайшую доступную для записи область, которая уже определяет `modelProviders`; в противном случае происходит откат к пользовательской области. Это синхронизирует файлы рабочей области/пользователя с активным каталогом провайдеров.
- Без `modelProviders` резолвер смешивает слои CLI/env/настроек, создавая Runtime Models. Это нормально для конфигураций с одним провайдером, но неудобно при частом переключении. Определяйте каталоги провайдеров, когда распространены рабочие процессы с несколькими моделями, чтобы переключения оставались атомарными, имели явный источник и были удобны для отладки.