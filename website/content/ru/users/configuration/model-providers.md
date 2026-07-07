# Провайдеры моделей

Qwen Code позволяет настроить несколько провайдеров моделей через параметр `modelProviders` в файле `settings.json`. Это дает возможность переключаться между различными ИИ-моделями и провайдерами с помощью команды `/model`.

## Обзор

Используйте `modelProviders` для объявления моделей по типу аутентификации, между которыми можно переключаться в меню выбора `/model`. Ключи должны быть допустимыми типами аутентификации (`openai`, `anthropic`, `gemini` и т.д.). Каждый тип аутентификации сопоставляется с объектом `ProviderConfig`, содержащим поле `protocol` и поле `models` (массив определений моделей). Каждая запись в `models` требует указания `id`; поле `envKey` **необязательно, но рекомендуется** (если оно опущено, используется ключ окружения по умолчанию для данного типа аутентификации, например, `OPENAI_API_KEY` для `openai`), также доступны необязательные поля `name`, `description`, `baseUrl` и `generationConfig`. Учетные данные никогда не сохраняются в настройках; среда выполнения считывает их из `process.env[envKey]`. Модели Qwen OAuth остаются жестко заданными и не могут быть переопределены.

> [!note]
>
> Только команда `/model` предоставляет доступ к нестандартным типам аутентификации. Anthropic, Gemini и другие должны быть определены через `modelProviders`. Команда `/auth` выводит три варианта верхнего уровня: **Alibaba ModelStudio** (с подменю, содержащим Coding Plan, Token Plan и Standard API Key), **Third-party Providers** и **Custom Provider**. (Qwen OAuth больше не является выбираемым пунктом в диалоговом окне; его бесплатный тариф был отменен 15 апреля 2026 года.)

> [!note]
>
> **Уникальность моделей:** Модели внутри одного `authType` однозначно идентифицируются по комбинации `id` + `baseUrl`. Это означает, что вы можете определить один и тот же ID модели (например, `"gpt-4o"`) несколько раз в рамках одного `authType`, при условии, что у каждой записи будет свой `baseUrl` — например, одна указывает напрямую на OpenAI, а другая на прокси-эндпоинт. Если две записи имеют одинаковые `id` и `baseUrl` (или в обеих пропущен `baseUrl`), приоритет отдается первой, а последующие дубликаты пропускаются с выводом предупреждения.

## Примеры конфигурации по типам аутентификации

Ниже приведены подробные примеры конфигурации для различных типов аутентификации, демонстрирующие доступные параметры и их комбинации.

### Поддерживаемые типы аутентификации

Ключи объекта `modelProviders` должны быть допустимыми значениями `authType`. В настоящее время поддерживаются следующие типы аутентификации:

| Auth Type    | Description                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI-совместимые API (OpenAI, Azure OpenAI, локальные серверы инференса, такие как vLLM/Ollama)                                               |
| `anthropic`  | Anthropic Claude API                                                                                                                            |
| `gemini`     | Google Gemini API                                                                                                                               |
| `qwen-oauth` | Qwen OAuth (жестко задан, не может быть переопределен в `modelProviders`)                                                                       |
| `vertex-ai`  | Google Vertex AI (использует протокол `gemini` и SDK `@google/genai` в режиме Vertex AI; при выборе устанавливается `GOOGLE_GENAI_USE_VERTEXAI=true`) |

> [!warning]
> Если используется неизвестный ключ типа аутентификации (например, опечатка вроде `"openai-custom"`), непустой ключ принимается как есть и формирует собственную группу типов аутентификации, но он не будет сопоставлен с известным протоколом — поэтому его модели не будут работать должным образом и некорректно отобразятся в меню выбора `/model`. Пропускаются только пустые ключи (пустые или состоящие только из пробелов). Всегда используйте одно из поддерживаемых значений типа аутентификации, перечисленных выше.

### SDK, используемые для API-запросов

Qwen Code использует следующие официальные SDK для отправки запросов к каждому провайдеру:

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - Официальный OpenAI Node.js SDK               |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Официальный Anthropic SDK |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Официальный Google GenAI SDK   |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) с кастомным провайдером (совместим с DashScope) |

Это означает, что настраиваемый вами `baseUrl` должен быть совместим с ожидаемым форматом API соответствующего SDK. Например, при использовании типа аутентификации `openai` эндпоинт должен принимать запросы в формате OpenAI API.

### OpenAI-совместимые провайдеры (`openai`)

Этот тип аутентификации поддерживает не только официальный API OpenAI, но и любой OpenAI-совместимый эндпоинт, включая агрегированные провайдеры моделей, такие как OpenRouter и Requesty.

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

Для локальных серверов, не требующих аутентификации, можно использовать любое значение-заглушку для API-ключа:

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Параметр `extra_body` **поддерживается только для OpenAI-совместимых провайдеров** (`openai`, `qwen-oauth`). Для провайдеров Anthropic и Gemini он игнорируется.

> [!note]
>
> **Об `envKey`**: Поле `envKey` задает **имя переменной окружения**, а не фактическое значение API-ключа. Чтобы конфигурация работала, необходимо убедиться, что соответствующая переменная окружения установлена с вашим реальным API-ключом. Есть два способа сделать это:
>
> - **Вариант 1: Использование файла `.env`** (рекомендуется из соображений безопасности):
>   ```bash
>   # ~/.qwen/.env (или корень проекта)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Обязательно добавьте `.env` в `.gitignore`, чтобы случайно не закоммитить секретные данные.
> - **Вариант 2: Использование поля `env` в `settings.json`** (как показано в примерах выше):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> В каждом примере провайдера присутствует поле `env`, чтобы проиллюстрировать, как следует настраивать API-ключ.
## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan предоставляет предварительно настроенный набор моделей Qwen, оптимизированных для задач написания кода. Эта функция доступна пользователям с доступом к API Alibaba Cloud Coding Plan и предлагает упрощенный процесс настройки с автоматическим обновлением конфигураций моделей.

### Обзор

При аутентификации с помощью API-ключа Alibaba Cloud Coding Plan через команду `/auth`, Qwen Code автоматически настраивает следующие модели:

| Model ID               | Name                 | Description                                               |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Продвинутая модель с включенным режимом рассуждений       |
| `qwen3.6-plus`         | qwen3.6-plus         | Последняя модель с включенным режимом рассуждений (только для Pro-подписчиков) |
| `qwen3.7-plus`         | qwen3.7-plus         | Продвинутая модель с включенным режимом рассуждений       |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Оптимизирована для задач написания кода                   |
| `qwen3-coder-next`     | qwen3-coder-next     | Экспериментальная модель для написания кода               |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Последняя max-модель с включенным режимом рассуждений     |
| `glm-5`                | glm-5                | GLM-модель с включенным режимом рассуждений               |
| `glm-4.7`              | glm-4.7              | GLM-модель с включенным режимом рассуждений               |
| `kimi-k2.5`            | kimi-k2.5            | Kimi-модель с поддержкой рассуждений, зрения и видео      |
| `MiniMax-M2.5`         | MiniMax-M2.5         | MiniMax-модель с включенным режимом рассуждений           |

### Настройка

1. Получите API-ключ Alibaba Cloud Coding Plan:
   - **Китай**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **Международный**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Выполните команду `/auth` в Qwen Code
3. Выберите **Alibaba ModelStudio**, затем выберите **Coding Plan** в подменю
4. Выберите ваш регион
5. Введите ваш API-ключ по запросу

Модели будут автоматически настроены и добавлены в селектор `/model`.

### Регионы

Alibaba Cloud Coding Plan поддерживает два региона:

| Region               | Endpoint                                        | Description             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Эндпоинт для материкового Китая |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Международный эндпоинт  |

Регион выбирается при аутентификации и сохраняется в `settings.json` в конфигурации `modelProviders`. Чтобы сменить регион, повторно выполните команду `/auth` и выберите другой регион.

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
- Сохранению любых пользовательских конфигураций моделей, добавленных вручную
- Автоматическому переключению на первую модель в обновленной конфигурации

Процесс обновления гарантирует, что у вас всегда будет доступ к последним конфигурациям моделей и функциям без необходимости ручного вмешательства.

### Ручная настройка (для продвинутых пользователей)

Если вы предпочитаете настраивать модели Coding Plan вручную, вы можете добавить их в `settings.json` так же, как и любого OpenAI-совместимого провайдера:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

> [!note]
>
> При использовании ручной настройки:
>
> - Вы можете использовать любое имя переменной окружения для `envKey`
> - Вам не нужно настраивать `codingPlan.*`
> - **Автоматические обновления не применяются** к моделям Coding Plan, настроенным вручную

> [!warning]
>
> Если вы также используете автоматическую настройку Coding Plan, автоматические обновления могут перезаписать ваши ручные конфигурации, если они используют те же `envKey` и `baseUrl`, что и автоматическая настройка. Чтобы избежать этого, по возможности убедитесь, что ваша ручная настройка использует другой `envKey`.

## Уровни разрешения и атомарность

Эффективные значения auth/model/credential выбираются для каждого поля в соответствии со следующим приоритетом (побеждает первое найденное). Вы можете комбинировать `--auth-type` с `--model`, чтобы напрямую указать на запись провайдера; эти CLI-флаги выполняются до других уровней.

| Layer (highest → lowest)   | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Программные переопределения | `/auth`                             | ввод `/auth`                                    | ввод `/auth`                                          | ввод `/auth`                                           | —                      | —                                 |
| Выбор провайдера модели    | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| Аргументы CLI              | `--auth-type`                       | `--model`                                       | `--openai-api-key`                                    | `--openai-base-url`                                    | —                      | —                                 |
| Переменные окружения       | —                                   | Специфичные для провайдера маппинги (напр. `OPENAI_MODEL`) | Специфичные для провайдера маппинги (напр. `OPENAI_API_KEY`)     | Специфичные для провайдера маппинги (напр. `OPENAI_BASE_URL`)     | —                      | —                                 |
| Настройки (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| По умолчанию / вычисляемые | Откат к `AuthType.QWEN_OAUTH`       | Встроенное значение по умолчанию (OpenAI ⇒ `qwen3.5-plus`) | —                                                     | —                                                      | —                      | `Config.getProxy()`, если настроено |

\*При наличии CLI-флаги аутентификации переопределяют настройки. В противном случае тип аутентификации определяется `security.auth.selectedType` или неявным значением по умолчанию. Qwen OAuth и OpenAI — это единственные типы аутентификации, доступные без дополнительной настройки.

> [!note]
>
> `--openai-api-key` и `--openai-base-url` — это единственные CLI-флаги для учетных данных. Они применяются к активному OpenAI-совместимому провайдеру независимо от его имени — флагов учетных данных `--anthropic-*` / `--gemini-*` не существует. Специфичные для провайдера учетные данные, которые не передаются через CLI, разрешаются из переменных окружения (см. строку ниже).

> [!warning]
>
> **Устаревание `security.auth.apiKey` и `security.auth.baseUrl`:** Прямая настройка учетных данных API через `security.auth.apiKey` и `security.auth.baseUrl` в `settings.json` устарела. Эти настройки использовались в предыдущих версиях для учетных данных, введенных через UI, но поток ввода учетных данных был удален в версии 0.10.1. Эти поля будут полностью удалены в будущем релизе. **Настоятельно рекомендуется перейти на `modelProviders`** для всех конфигураций моделей и учетных данных. Используйте `envKey` в `modelProviders` для ссылки на переменные окружения в целях безопасного управления учетными данными вместо жесткого кодирования учетных данных в файлах настроек.

## Слои конфигурации генерации: Непроницаемый слой провайдера

Разрешение конфигурации следует строгой многослойной модели с одним важным правилом: **слой modelProvider непроницаем**.

### Как это работает

1. **Если выбрана модель modelProvider** (например, через команду `/model`, выбирающую настроенную модель провайдера):
   - Весь `generationConfig` от провайдера применяется **атомарно**
   - **Слой провайдера полностью непроницаем** — нижние уровни (CLI, env, settings) вообще не участвуют в разрешении generationConfig
   - Все поля, определенные в `modelProviders[].generationConfig`, используют значения провайдера
   - Все поля, **не определенные** провайдером, устанавливаются в `undefined` (не наследуются из настроек)
   - Это гарантирует, что конфигурации провайдера действуют как полный, самодостаточный «запечатанный пакет»

   Если модель указана в `modelProviders`, поместите все специфичные для модели
   настройки генерации для этой модели в соответствующую запись провайдера. Значения
   `model.generationConfig` верхнего уровня, включая `contextWindowSize`,
   `modalities`, `customHeaders` и `extra_body`, игнорируются для моделей
   провайдера. Настройте эти поля в
   `modelProviders[authType][].generationConfig`, чтобы они применялись.

2. **Если НЕ выбрана модель modelProvider** (например, используется `--model` с необработанным ID модели, или напрямую используются CLI/env/settings):
   - Разрешение переходит к нижним уровням
   - Поля заполняются из CLI → env → settings → defaults
   - Это создает **Runtime Model** (см. следующий раздел)

### Приоритет для каждого поля `generationConfig`

| Priority | Source                                        | Behavior                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Программные переопределения                   | Изменения Runtime `/model`, `/auth`                                                                      |
| 2        | `modelProviders[authType][].generationConfig` | **Непроницаемый слой** - полностью заменяет все поля generationConfig; нижние уровни не участвуют        |
| 3        | `settings.model.generationConfig`             | Используется только для **Runtime Models** (когда не выбрана модель провайдера)                          |
| 4        | Значения по умолчанию генератора контента     | Специфичные для провайдера значения по умолчанию (напр., OpenAI или Gemini) - только для Runtime Models  |

### Атомарная обработка полей

Следующие поля обрабатываются как атомарные объекты — значения провайдера полностью заменяют весь объект, слияние не происходит:

- `samplingParams` - Temperature, top_p, max_tokens и т.д.
- `customHeaders` - Пользовательские HTTP-заголовки
- `extra_body` - Дополнительные параметры тела запроса

### Пример
```jsonc
// Пользовательские настройки (~/.qwen/settings.json)
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

При выборе `gpt-4o` из `modelProviders`:

- `timeout` = 60000 (от провайдера, переопределяет настройки)
- `samplingParams.temperature` = 0.2 (от провайдера, полностью заменяет объект настроек)
- `samplingParams.max_tokens` = **undefined** (не определено у провайдера, и уровень провайдера не наследуется от настроек — поля явно устанавливаются в undefined, если не указаны)

При использовании "сырой" модели через `--model gpt-4` (не из `modelProviders`, создается Runtime Model):

- `timeout` = 30000 (из настроек)
- `samplingParams.temperature` = 0.5 (из настроек)
- `samplingParams.max_tokens` = 1000 (из настроек)

Стратегия слияния для самого `modelProviders` — REPLACE (замена): весь блок `modelProviders` из настроек проекта полностью переопределит соответствующую секцию в пользовательских настройках, а не объединится с ней.

## Конфигурация reasoning / thinking

Необязательное поле `reasoning` в `generationConfig` управляет тем, насколько интенсивно модель рассуждает перед ответом. Конвертеры Anthropic и Gemini всегда учитывают его. Пайплайн, совместимый с OpenAI, учитывает его, **если только** не задан `generationConfig.samplingParams` — см. предостережение "Взаимодействие с `samplingParams`" ниже.

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
            //   'low'    | 'medium' — на стороне сервера маппится на 'high' в DeepSeek
            //   'high'   — стандартная интенсивность рассуждений
            //   'max'    — специфичный для DeepSeek сверхсильный уровень
            // Или установите false, чтобы полностью отключить рассуждения.
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### Поведение для каждого провайдера

| Протокол / провайдер | Формат в запросе | Примечания |
| --- | --- | --- |
| **OpenAI / DeepSeek** (`api.deepseek.com`) | Плоский параметр тела `reasoning_effort: <effort>` | Когда `reasoning.effort` задан во вложенной конфигурации, он переписывается в плоский `reasoning_effort`, а `'low'`/`'medium'` нормализуются до `'high'`, `'xhigh'` до `'max'` — зеркально [обратной совместимости на стороне сервера](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) DeepSeek. Переопределения через `samplingParams.reasoning_effort` или `extra_body.reasoning_effort` верхнего уровня пропускают эту нормализацию и отправляются как есть. |
| **OpenAI** (другие совместимые серверы) | `reasoning: { effort, ... }` передается как есть | Задается через `samplingParams` (например, `samplingParams.reasoning_effort` для GPT-5/o-series), если провайдер ожидает другой формат. |
| **Anthropic** (реальный `api.anthropic.com`) | `output_config: { effort }` плюс бета-заголовок `effort-2025-11-24` | Настоящий Anthropic принимает только `'low'`/`'medium'`/`'high'`. `'max'` **ограничивается до `'high'`** с выводом строки `debugLogger.warn` (один раз на генератор); если вам нужна максимальная интенсивность, переключите baseURL на DeepSeek-совместимый эндпоинт, который это поддерживает. |
| **Anthropic** (`api.deepseek.com/anthropic`) | Тот же `output_config: { effort }` + бета-заголовок | `'max'` передается без изменений. |
| **Gemini** (`@google/genai`) | `thinkingConfig: { includeThoughts: true, thinkingLevel }` | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, остальные → `THINKING_LEVEL_UNSPECIFIED` (в Gemini нет уровня `MAX`). |

### `reasoning: false`

Установка `reasoning: false` (именно булево значение) явно отключает рассуждения на всех провайдерах — полезно для дешевых вспомогательных запросов, которым не нужны рассуждения. Это также учитывается на уровне запроса через `request.config.thinkingConfig.includeThoughts: false` для разовых вызовов (например, генерации подсказок).

На baseURL `api.deepseek.com` пайплайн OpenAI отправляет явное поле `thinking: { type: 'disabled' }`, которое требуется для DeepSeek V4+ — по умолчанию на сервере установлено `'enabled'`, поэтому простое отсутствие `reasoning_effort` всё равно приведет к задержкам и затратам на рассуждения. Самостоятельно развернутые бэкенды DeepSeek (sglang/vllm) и другие OpenAI-совместимые серверы **не получают** это поле; если вам нужно отключить рассуждения на них, внедрите `thinking: { type: 'disabled' }` (или любой другой переключатель, который предоставляет ваш фреймворк инференса) через `samplingParams`/`extra_body`.

### Взаимодействие с `samplingParams` (только для OpenAI-совместимых)

> [!warning]
>
> Когда `generationConfig.samplingParams` задан для OpenAI-совместимого провайдера, пайплайн отправляет эти ключи в запрос **как есть** и полностью пропускает отдельную инъекцию `reasoning`. Таким образом, конфигурация вроде `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` молча отбросит поле reasoning в запросах к OpenAI/DeepSeek.
>
> Если вы задаете `samplingParams`, включите переключатель reasoning напрямую в него — для DeepSeek это `samplingParams.reasoning_effort`, для GPT-5/o-series это `samplingParams.reasoning_effort` (их плоское поле) или `samplingParams.reasoning` (вложенный объект). Для OpenRouter и других провайдеров имя поля может отличаться; обратитесь к документации провайдера.
>
> Конвертеры Anthropic и Gemini не затрагиваются — они всегда читают `reasoning.effort` напрямую, независимо от `samplingParams`.

### `budget_tokens`

Вы можете задать точный лимит токенов на рассуждения, указав `budget_tokens` вместе с `effort`:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Для Anthropic это становится `thinking.budget_tokens`. Для OpenAI/DeepSeek поле сохраняется, но в настоящее время игнорируется сервером — основным переключателем является `reasoning_effort`.

## Провайдерные модели и Runtime-модели

Qwen Code различает два типа конфигурации моделей:

### Провайдерная модель

- Определяется в конфигурации `modelProviders`
- Имеет полный, атомарный пакет конфигурации
- При выборе её конфигурация применяется как непроницаемый слой
- Отображается в списке команд `/model` с полными метаданными (имя, описание, возможности)
- Рекомендуется для рабочих процессов с несколькими моделями и обеспечения согласованности в команде

### Runtime-модель

- Создается динамически при использовании сырых ID моделей через CLI (`--model`), переменные окружения или настройки
- Не определяется в `modelProviders`
- Конфигурация собирается путем "проецирования" через уровни разрешения (CLI → env → settings → defaults)
- Автоматически сохраняется как **RuntimeModelSnapshot**, когда обнаруживается полная конфигурация
- Позволяет повторно использовать модель без повторного ввода учетных данных

### Жизненный цикл RuntimeModelSnapshot

Когда вы настраиваете модель без использования `modelProviders`, Qwen Code автоматически создает RuntimeModelSnapshot для сохранения вашей конфигурации:

```bash
# Это создает RuntimeModelSnapshot с ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Снимок:

- Сохраняет ID модели, API-ключ, базовый URL и конфигурацию генерации
- Сохраняется между сессиями (хранится в памяти во время выполнения)
- Отображается в списке команд `/model` как runtime-опция
- Можно переключиться на неё с помощью `/model $runtime|openai|my-custom-model`

### Ключевые отличия

| Аспект | Провайдерная модель | Runtime-модель |
| --- | --- | --- |
| Источник конфигурации | `modelProviders` в настройках | CLI, env, слои настроек |
| Атомарность конфигурации | Полный, непроницаемый пакет | Послойная, каждое поле разрешается независимо |
| Возможность повторного использования | Всегда доступна в списке `/model` | Сохраняется как снимок, появляется, если конфигурация полная |
| Совместное использование в команде | Да (через закоммиченные настройки) | Нет (только локально у пользователя) |
| Хранение учетных данных | Только ссылка через `envKey` | Может сохранять реальный ключ в снимке |

### Когда что использовать

- **Используйте Провайдерные модели**, когда: у вас есть стандартные модели, используемые всей командой, нужна согласованная конфигурация или вы хотите предотвратить случайные переопределения.
- **Используйте Runtime-модели**, когда: быстро тестируете новую модель, используете временные учетные данные или работаете с ad-hoc эндпоинтами.

## Сохранение выбора и рекомендации

> [!important]
>
> По возможности определяйте `modelProviders` в пользовательской области `~/.qwen/settings.json` и избегайте сохранения переопределений учетных данных в любой области. Хранение каталога провайдеров в пользовательских настройках предотвращает конфликты слияния/переопределения между областями проекта и пользователя, а также гарантирует, что обновления `/auth` и `/model` всегда будут записываться в согласованную область.

- `/model` и `/auth` сохраняют `model.name` (где применимо) и `security.auth.selectedType` в ближайшую доступную для записи область, в которой уже определен `modelProviders`; в противном случае они откатываются к пользовательской области. Это синхронизирует файлы рабочего пространства и пользователя с активным каталогом провайдеров.
- Без `modelProviders` резолвер смешивает слои CLI/env/settings, создавая Runtime Models. Это нормально для конфигураций с одним провайдером, но обременительно при частом переключении. Определяйте каталоги провайдеров везде, где часто используются рабочие процессы с несколькими моделями, чтобы переключения оставались атомарными, имели отслеживаемый источник и были удобны для отладки.