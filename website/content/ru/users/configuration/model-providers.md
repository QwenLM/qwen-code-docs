# Model Providers

Qwen Code позволяет настраивать несколько провайдеров моделей через параметр `modelProviders` в файле `settings.json`. Это даёт возможность переключаться между разными AI-моделями и провайдерами с помощью команды `/model`.

## Обзор

Используйте `modelProviders`, чтобы объявить модели для каждого типа аутентификации, между которыми можно переключаться через инструмент выбора `/model`. Ключи должны быть допустимыми типами аутентификации (`openai`, `anthropic`, `gemini` и т.д.). Каждый тип аутентификации сопоставляется с объектом `ProviderConfig`, содержащим поле `protocol` и поле `models` (массив определений моделей). Каждая запись в `models` требует `id`; `envKey` является **необязательным и рекомендуемым** (если опущен, используется ключ по умолчанию для данного типа аутентификации, например `OPENAI_API_KEY` для `openai`), также доступны опциональные поля `name`, `description`, `baseUrl` и `generationConfig`. Учётные данные никогда не сохраняются в настройках; среда выполнения считывает их из `process.env[envKey]`. Модели Qwen OAuth остаются жёстко заданными и не могут быть переопределены.

> [!note]
>
> Только команда `/model` предоставляет доступ к нестандартным типам аутентификации. Anthropic, Gemini и т.д. должны быть определены через `modelProviders`. Команда `/auth` отображает три основных варианта: **Alibaba ModelStudio** (с подменю Coding Plan, Token Plan и Standard API Key), **Third-party Providers** и **Custom Provider**. (Qwen OAuth больше не является доступным пунктом диалога; его бесплатный тариф был прекращён 15 апреля 2026 года.)

> [!note]
>
> **Уникальность моделей:** Модели в рамках одного `authType` однозначно идентифицируются комбинацией `id` + `baseUrl`. Это означает, что вы можете определить один и тот же ID модели (например, `"gpt-4o"`) несколько раз в одном `authType`, если каждая запись имеет разный `baseUrl` — например, одна указывает на OpenAI напрямую, а другая на прокси-эндпоинт. Если две записи имеют одинаковые `id` и `baseUrl` (или обе опускают `baseUrl`), побеждает первая, а последующие дубликаты пропускаются с предупреждением.

## Примеры конфигурации по типам аутентификации

Ниже приведены подробные примеры конфигурации для различных типов аутентификации, демонстрирующие доступные параметры и их комбинации.

### Поддерживаемые типы аутентификации

Ключи объекта `modelProviders` должны быть допустимыми значениями `authType`. В настоящее время поддерживаются следующие типы аутентификации:

| Auth Type    | Описание                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `openai`     | API, совместимые с OpenAI (OpenAI, Azure OpenAI, локальные серверы вывода, такие как vLLM/Ollama)                                                |
| `anthropic`  | Anthropic Claude API                                                                                                                             |
| `gemini`     | Google Gemini API                                                                                                                                |
| `qwen-oauth` | Qwen OAuth (жёстко задано, нельзя переопределить в `modelProviders`)                                                                             |
| `vertex-ai`  | Google Vertex AI (использует протокол `gemini` и SDK `@google/genai` в режиме Vertex AI; при выборе устанавливает `GOOGLE_GENAI_USE_VERTEXAI=true`) |

> [!warning]
> Если используется неизвестный ключ типа аутентификации (например, опечатка `"openai-custom"`), непустой ключ принимается как есть как отдельная группа типа аутентификации, но не сопоставляется с известным протоколом — поэтому его модели не будут работать должным образом и не будут корректно отображаться в инструменте выбора `/model`. Пропускаются только пустые ключи (содержащие только пробелы или пустые строки). Всегда используйте одно из поддерживаемых значений типа аутентификации, перечисленных выше.

### SDK, используемые для API-запросов

Qwen Code использует следующие официальные SDK для отправки запросов к каждому провайдеру:

| Auth Type    | SDK-пакет                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) — официальный Node.js SDK от OpenAI                |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — официальный Anthropic SDK  |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) — официальный Google GenAI SDK       |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) с кастомным провайдером (совместимо с DashScope)    |

Это означает, что настраиваемый `baseUrl` должен быть совместим с ожидаемым форматом API соответствующего SDK. Например, при использовании типа аутентификации `openai` эндпоинт должен принимать запросы в формате API OpenAI.

### Провайдеры, совместимые с OpenAI (`openai`)

Этот тип аутентификации поддерживает не только официальный API OpenAI, но и любые эндпоинты, совместимые с OpenAI, включая агрегированных провайдеров моделей, таких как OpenRouter и Requesty.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
        },
        {
          "id": "openai/gpt-4o-mini",
          "name": "GPT-4o Mini (via Requesty)",
          "envKey": "REQUESTY_API_KEY",
          "baseUrl": "https://router.requesty.ai/v1",
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
}
```

### Anthropic (`anthropic`)

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": {
      "protocol": "anthropic",
      "models": [
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
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": {
      "protocol": "gemini",
      "models": [
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
}
```

### Локальные самостоятельно размещённые модели (через API, совместимый с OpenAI)

Большинство локальных серверов вывода (vLLM, Ollama, LM Studio и т.д.) предоставляют эндпоинт API, совместимый с OpenAI. Настройте их, используя тип аутентификации `openai` с локальным `baseUrl`:

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

Для локальных серверов, не требующих аутентификации, можно использовать любое значение-заполнитель для API-ключа:

```bash
# Для Ollama (аутентификация не требуется)
export OLLAMA_API_KEY="ollama"

# Для vLLM (если аутентификация не настроена)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Параметр `extra_body` **поддерживается только для провайдеров, совместимых с OpenAI** (`openai`, `qwen-oauth`). Для провайдеров Anthropic и Gemini он игнорируется.

> [!note]
>
> **О `envKey`**: Поле `envKey` указывает **имя переменной окружения**, а не фактическое значение API-ключа. Чтобы конфигурация работала, необходимо, чтобы соответствующая переменная окружения была установлена с вашим реальным API-ключом. Есть два способа это сделать:
>
> - **Вариант 1: Использование файла `.env`** (рекомендуется для безопасности):
>   ```bash
>   # ~/.qwen/.env (или корень проекта)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Обязательно добавьте `.env` в ваш `.gitignore`, чтобы случайно не зафиксировать секреты.
> - **Вариант 2: Использование поля `env` в `settings.json`** (как показано в примерах выше):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Каждый пример провайдера включает поле `env`, чтобы проиллюстрировать, как должен быть настроен API-ключ.

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan предоставляет предварительно настроенный набор моделей Qwen, оптимизированных для задач кодирования. Эта функция доступна пользователям с доступом к API Alibaba Cloud Coding Plan и предлагает упрощённую настройку с автоматическим обновлением конфигурации моделей.

### Обзор

Когда вы проходите аутентификацию с помощью API-ключа Alibaba Cloud Coding Plan через команду `/auth`, Qwen Code автоматически настраивает следующие модели:

| Model ID               | Name                 | Description                                               |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Продвинутая модель с включённым мышлением                 |
| `qwen3.6-plus`         | qwen3.6-plus         | Новейшая модель с включённым мышлением (только Pro)       |
| `qwen3.7-plus`         | qwen3.7-plus         | Продвинутая модель с включённым мышлением                 |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Оптимизирована для задач кодирования                     |
| `qwen3-coder-next`     | qwen3-coder-next     | Экспериментальная модель для кодирования                  |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Новейшая max-модель с включённым мышлением                |
| `glm-5`                | glm-5                | Модель GLM с включённым мышлением                         |
| `glm-4.7`              | glm-4.7              | Модель GLM с включённым мышлением                         |
| `kimi-k2.5`            | kimi-k2.5            | Модель Kimi с поддержкой мышления и vision/video          |
| `MiniMax-M2.5`         | MiniMax-M2.5         | Модель MiniMax с включённым мышлением                     |

### Настройка

1. Получите API-ключ Alibaba Cloud Coding Plan:
   - **Китай**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **Международный**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Выполните команду `/auth` в Qwen Code
3. Выберите **Alibaba ModelStudio**, затем выберите **Coding Plan** из подменю
4. Выберите ваш регион
5. Введите ваш API-ключ по запросу

Модели будут автоматически настроены и добавлены в инструмент выбора `/model`.

### Регионы

Alibaba Cloud Coding Plan поддерживает два региона:

| Регион                | Endpoint                                        | Описание                      |
| --------------------- | ----------------------------------------------- | ----------------------------- |
| Китай                 | `https://coding.dashscope.aliyuncs.com/v1`      | Эндпоинт для материкового Китая |
| Международный         | `https://coding-intl.dashscope.aliyuncs.com/v1` | Международный эндпоинт          |

Регион выбирается во время аутентификации и сохраняется в `settings.json` в конфигурации `modelProviders`. Чтобы сменить регион, повторно выполните команду `/auth` и выберите другой регион.

### Хранение API-ключа

При настройке Coding Plan через команду `/auth` API-ключ сохраняется с использованием зарезервированного имени переменной окружения `BAILIAN_CODING_PLAN_API_KEY`. По умолчанию он хранится в поле `env` вашего файла `settings.json`.

> [!warning]
>
> **Рекомендация по безопасности**: Для лучшей безопасности рекомендуется переместить API-ключ из `settings.json` в отдельный файл `.env` и загружать его как переменную окружения. Например:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Затем убедитесь, что этот файл добавлен в ваш `.gitignore`, если вы используете настройки на уровне проекта.

### Автоматические обновления

Конфигурации моделей Coding Plan имеют версии. Когда Qwen Code обнаруживает более новую версию шаблона модели, вам будет предложено обновить её. Принятие обновления приведёт к:

- Замене существующих конфигураций моделей Coding Plan на последние версии
- Сохранению любых пользовательских конфигураций моделей, добавленных вручную
- Автоматическому переключению на первую модель в обновлённой конфигурации

Процесс обновления гарантирует, что вы всегда имеете доступ к последним конфигурациям и функциям моделей без ручного вмешательства.

### Ручная конфигурация (продвинутая)

Если вы предпочитаете настроить модели Coding Plan вручную, вы можете добавить их в свой `settings.json` как любого другого провайдера, совместимого с OpenAI:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "description": "Qwen3-Coder через Alibaba Cloud Coding Plan",
          "envKey": "YOUR_CUSTOM_ENV_KEY",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
        }
      ]
    }
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
> Если вы также используете автоматическую конфигурацию Coding Plan, автоматические обновления могут перезаписать ваши ручные конфигурации, если они используют те же `envKey` и `baseUrl`, что и автоматическая конфигурация. Чтобы избежать этого, убедитесь, что ваша ручная конфигурация использует другой `envKey`, если это возможно.

## Уровни разрешения и атомарность

Результирующие значения auth/model/credential выбираются для каждого поля по следующему приоритету (первый найденный выигрывает). Вы можете комбинировать `--auth-type` с `--model`, чтобы напрямую указать на запись провайдера; эти флаги CLI выполняются перед остальными уровнями.

| Уровень (высший → низший) | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| ------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Программные переопределения | `/auth`                             | Ввод `/auth`                                   | Ввод `/auth`                                         | Ввод `/auth`                                          | —                      | —                                 |
| Выбор провайдера модели   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| Аргументы CLI              | `--auth-type`                       | `--model`                                       | `--openai-api-key` (или эквиваленты для провайдеров)  | `--openai-base-url` (или эквиваленты для провайдеров)  | —                      | —                                 |
| Переменные окружения      | —                                   | Специфичное для провайдера (напр. `OPENAI_MODEL`) | Специфичное для провайдера (напр. `OPENAI_API_KEY`)   | Специфичное для провайдера (напр. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Настройки (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| По умолчанию / вычисленное | По умолчанию `AuthType.QWEN_OAUTH`  | Встроенный умолчательный (OpenAI ⇒ `qwen3.5-plus`) | —                                                     | —                                                      | —                      | `Config.getProxy()`, если настроен |
\*Если присутствуют, флаги аутентификации CLI переопределяют настройки. В противном случае `security.auth.selectedType` или неявное значение по умолчанию определяют тип аутентификации. Qwen OAuth и OpenAI — единственные типы аутентификации, доступные без дополнительной настройки.

> [!warning]
>
> **Устаревание `security.auth.apiKey` и `security.auth.baseUrl`:** Прямая настройка учетных данных API через `security.auth.apiKey` и `security.auth.baseUrl` в `settings.json` устарела. Эти настройки использовались в исторических версиях для учетных данных, введенных через UI, но процесс ввода учетных данных был удален в версии 0.10.1. Эти поля будут полностью удалены в одном из будущих релизов. **Настоятельно рекомендуется перейти на `modelProviders`** для всех конфигураций моделей и учетных данных. Используйте `envKey` в `modelProviders` для ссылки на переменные окружения для безопасного управления учетными данными, а не для жесткого кодирования учетных данных в файлах настроек.

## Наслоение конфигурации генерации: непроницаемый слой провайдера

Разрешение конфигурации следует строгой модели наслоения с одним ключевым правилом: **слой modelProvider непроницаем**.

### Как это работает

1. **Когда выбрана модель из modelProvider** (например, через команду `/model` с выбором модели, настроенной у провайдера):
   - Весь `generationConfig` от провайдера применяется **атомарно**
   - **Слой провайдера полностью непроницаем** — нижние слои (CLI, env, settings) вообще не участвуют в разрешении generationConfig
   - Все поля, определенные в `modelProviders[].generationConfig`, используют значения провайдера
   - Все поля, **не определенные** провайдером, устанавливаются в `undefined` (не наследуются из настроек)
   - Это гарантирует, что конфигурации провайдера действуют как полный самодостаточный "запечатанный пакет"

   Если модель перечислена в `modelProviders`, поместите все настройки генерации, специфичные для этой модели, в соответствующую запись провайдера. Значения `model.generationConfig` верхнего уровня, включая `contextWindowSize`, `modalities`, `customHeaders` и `extra_body`, игнорируются для моделей провайдера. Чтобы они применялись, настройте эти поля в `modelProviders[authType][].generationConfig`.

2. **Когда ни одна модель из modelProvider не выбрана** (например, при использовании `--model` с raw ID модели, или при прямом использовании CLI/env/settings):
   - Разрешение опускается на нижние слои
   - Поля заполняются из CLI → env → settings → defaults
   - Это создает **Runtime Model** (см. следующий раздел)

### Приоритет полей для `generationConfig`

| Приоритет | Источник                                        | Поведение                                                                                                 |
| --------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1         | Программные переопределения                     | Изменения во время выполнения через `/model`, `/auth`                                                     |
| 2         | `modelProviders[authType][].generationConfig`   | **Непроницаемый слой** — полностью заменяет все поля generationConfig; нижние слои не участвуют           |
| 3         | `settings.model.generationConfig`               | Используется только для **Runtime Models** (когда не выбрана модель провайдера)                           |
| 4         | Значения по умолчанию генератора контента        | Специфичные для провайдера значения по умолчанию (например, OpenAI vs Gemini) — только для Runtime Models |

### Обработка атомарных полей

Следующие поля обрабатываются как атомарные объекты — значения провайдера полностью заменяют весь объект, слияния не происходит:

- `samplingParams` — Temperature, top_p, max_tokens и т.д.
- `customHeaders` — Пользовательские HTTP-заголовки
- `extra_body` — Дополнительные параметры тела запроса

### Пример

```jsonc
// Файл настроек пользователя (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// Конфигурация modelProviders
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [{
        "id": "gpt-4o",
        "envKey": "OPENAI_API_KEY",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": { "temperature": 0.2 }
        }
      }]
    }
  }
}
```

Когда выбран `gpt-4o` из modelProviders:

- `timeout` = 60000 (от провайдера, переопределяет настройки)
- `samplingParams.temperature` = 0.2 (от провайдера, полностью заменяет объект из настроек)
- `samplingParams.max_tokens` = **undefined** (не определено у провайдера, и слой провайдера не наследует из настроек — поля явно устанавливаются в undefined, если не предоставлены)

При использовании raw модели через `--model gpt-4` (не из modelProviders, создает Runtime Model):

- `timeout` = 30000 (из настроек)
- `samplingParams.temperature` = 0.5 (из настроек)
- `samplingParams.max_tokens` = 1000 (из настроек)

Стратегия слияния для самого `modelProviders` — REPLACE: весь `modelProviders` из настроек проекта переопределяет соответствующий раздел в пользовательских настройках, а не сливается с ним.

## Конфигурация рассуждения / мышления

Необязательное поле `reasoning` в `generationConfig` управляет тем, насколько интенсивно модель рассуждает перед ответом. Конвертеры Anthropic и Gemini всегда соблюдают его. Конвейер, совместимый с OpenAI, соблюдает его **если** не задан `generationConfig.samplingParams` — см. примечание "Взаимодействие с `samplingParams`" ниже.

```jsonc
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "deepseek-v4-pro",
          "name": "DeepSeek V4 Pro",
          "baseUrl": "https://api.deepseek.com/v1",
          "envKey": "DEEPSEEK_API_KEY",
          "generationConfig": {
            // Четырехуровневая шкала:
            //   'low'    | 'medium' — на сервере преобразуется в 'high' для DeepSeek
            //   'high'   — интенсивность рассуждения по умолчанию
            //   'max'    — дополнительный сильный уровень, специфичный для DeepSeek
            // Или установите `false`, чтобы полностью отключить рассуждение.
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### Поведение по провайдерам

| Протокол / провайдер                        | Формат в запросе                                                           | Примечания                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)  | Плоский параметр тела `reasoning_effort: <effort>`                         | Когда `reasoning.effort` задан во вложенной конфигурации, он переписывается в плоский `reasoning_effort`, а `'low'`/`'medium'` нормализуются в `'high'`, `'xhigh'` в `'max'` — зеркально отражая серверную обратную совместимость DeepSeek. Переопределения верхнего уровня `samplingParams.reasoning_effort` или `extra_body.reasoning_effort` пропускают эту нормализацию и передаются как есть.                           |
| **OpenAI** (другие совместимые серверы)     | `reasoning: { effort, ... }` передается без изменений                      | Задается через `samplingParams` (например, `samplingParams.reasoning_effort` для GPT-5/o-серии), если провайдер ожидает другую структуру.                                                                                                                                                                                                                                                                                     |
| **Anthropic** (настоящий `api.anthropic.com`) | `output_config: { effort }` плюс бета-заголовок `effort-2025-11-24`        | Настоящий Anthropic принимает только `'low'`/`'medium'`/`'high'`. `'max'` **ограничивается до `'high'`** с выводом `debugLogger.warn` (один раз на генератор); если нужна максимальная интенсивность, переключите baseURL на конечную точку, совместимую с DeepSeek, которая её поддерживает.                                                                                                                                |
| **Anthropic** (`api.deepseek.com/anthropic`) | То же `output_config: { effort }` + бета-заголовок                         | `'max'` передается без изменений.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                 | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, остальные → `THINKING_LEVEL_UNSPECIFIED` (у Gemini нет уровня `MAX`).                                                                                                                                                                                                                                                                                                             |

### `reasoning: false`

Установка `reasoning: false` (буквальное логическое значение) явно отключает мышление у всех провайдеров — полезно для дешевых побочных запросов, которым не нужно рассуждение. Это также соблюдается на уровне запроса через `request.config.thinkingConfig.includeThoughts: false` для разовых вызовов (например, генерация предложений).

На baseURL `api.deepseek.com` конвейер OpenAI передает явное поле `thinking: { type: 'disabled' }`, необходимое для DeepSeek V4+ — серверное значение по умолчанию — `'enabled'`, поэтому простое опускание `reasoning_effort` все равно будет оплачивать задержку/стоимость рассуждения. Самостоятельно размещенные бэкенды DeepSeek (sglang/vllm) и другие серверы, совместимые с OpenAI, **не** получают это поле; если нужно отключить мышление на них, добавьте `thinking: { type: 'disabled' }` (или другой параметр, предоставляемый вашим фреймворком инференса) через `samplingParams`/`extra_body`.

### Взаимодействие с `samplingParams` (только OpenAI-совместимые)

> [!warning]
>
> Когда `generationConfig.samplingParams` установлен у провайдера, совместимого с OpenAI, конвейер передает эти ключи в запрос **как есть** и полностью пропускает отдельное внедрение `reasoning`. Таким образом, конфигурация вида `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` будет молча игнорировать поле reasoning в запросах к OpenAI/DeepSeek.
>
> Если вы указываете `samplingParams`, включайте параметр рассуждения прямо в него — для DeepSeek это `samplingParams.reasoning_effort`, для GPT-5/o-серии это `samplingParams.reasoning_effort` (их плоское поле) или `samplingParams.reasoning` (вложенный объект). Для OpenRouter и других провайдеров имя поля может различаться; сверяйтесь с документацией провайдера.
>
> Конвертеры Anthropic и Gemini не затронуты — они всегда читают `reasoning.effort` напрямую, независимо от `samplingParams`.

### `budget_tokens`

Вы можете задать точный бюджет токенов на мышление, включив `budget_tokens` вместе с `effort`:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Для Anthropic это превращается в `thinking.budget_tokens`. Для OpenAI/DeepSeek поле сохраняется, но в настоящее время игнорируется сервером — рабочим параметром является `reasoning_effort`.

## Provider Models vs Runtime Models

Qwen Code различает два типа конфигураций моделей:

### Provider Model

- Определен в конфигурации `modelProviders`
- Имеет полный, атомарный пакет конфигурации
- При выборе его конфигурация применяется как непроницаемый слой
- Появляется в списке команды `/model` с полными метаданными (имя, описание, возможности)
- Рекомендуется для многомодельных рабочих процессов и согласованности в команде

### Runtime Model

- Создается динамически при использовании raw ID моделей через CLI (`--model`), переменные окружения или настройки
- Не определен в `modelProviders`
- Конфигурация строится путем "проекции" через слои разрешения (CLI → env → settings → defaults)
- Автоматически захватывается как **RuntimeModelSnapshot**, когда обнаружена полная конфигурация
- Позволяет повторно использовать без повторного ввода учетных данных

### Жизненный цикл RuntimeModelSnapshot

Когда вы настраиваете модель без использования `modelProviders`, Qwen Code автоматически создает RuntimeModelSnapshot для сохранения вашей конфигурации:

```bash
# Это создает RuntimeModelSnapshot с ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Снимок:

- Захватывает ID модели, API-ключ, base URL и конфигурацию генерации
- Сохраняется между сессиями (хранится в памяти во время выполнения)
- Появляется в списке команды `/model` как runtime-опция
- На него можно переключиться с помощью `/model $runtime|openai|my-custom-model`

### Ключевые различия

| Аспект                     | Provider Model                    | Runtime Model                              |
| -------------------------- | --------------------------------- | ------------------------------------------ |
| Источник конфигурации      | `modelProviders` в настройках     | Слои CLI, env, settings                    |
| Атомарность конфигурации   | Полный, непроницаемый пакет       | Многослойный, каждое поле разрешается независимо |
| Возможность повторного использования | Всегда доступен в списке `/model` | Захвачен как снимок, появляется, если конфигурация полна |
| Совместное использование в команде | Да (через фиксированные настройки) | Нет (локально для пользователя)            |
| Хранение учетных данных    | Ссылка только через `envKey`      | Может захватить фактический ключ в снимке  |

### Когда что использовать

- **Используйте Provider Models**, когда: У вас есть стандартные модели, используемые всей командой, требуется согласованная конфигурация или вы хотите предотвратить случайные переопределения.
- **Используйте Runtime Models**, когда: Вы быстро тестируете новую модель, используете временные учетные данные или работаете с ad-hoc конечными точками.

## Персистентность выбора и рекомендации

> [!important]
>
> По возможности определяйте `modelProviders` в пользовательском файле `~/.qwen/settings.json` и избегайте сохранения переопределений учетных данных в любой области. Хранение каталога провайдеров в пользовательских настройках предотвращает конфликты слияния/переопределения между областями проекта и пользователя, а также гарантирует, что обновления `/auth` и `/model` всегда записываются в согласованную область.

- `/model` и `/auth` сохраняют `model.name` (где применимо) и `security.auth.selectedType` в ближайшую доступную для записи область, которая уже определяет `modelProviders`; в противном случае они возвращаются к пользовательской области. Это поддерживает файлы рабочего пространства/пользователя в синхронизации с активным каталогом провайдеров.
- Без `modelProviders` резолвер смешивает слои CLI/env/settings, создавая Runtime Models. Это нормально для однопровайдерных настроек, но неудобно при частом переключении. Определяйте каталоги провайдеров, если многомодельные рабочие процессы распространены, чтобы переключения оставались атомарными, привязанными к источнику и отлаживаемыми.