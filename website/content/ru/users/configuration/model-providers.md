# Провайдеры моделей

Qwen Code позволяет настроить несколько провайдеров моделей через параметр `modelProviders` в файле `settings.json`. Это дает возможность переключаться между различными ИИ-моделями и провайдерами с помощью команды `/model`.

## Обзор

Используйте `modelProviders` для объявления моделей по идентификатору провайдера, между которыми может переключаться выбор `/model`. Каждый ключ — это идентификатор провайдера, а его значение — **массив определений моделей** (`ModelConfig[]`). Для встроенных провайдеров ключ должен быть допустимым типом авторизации (`openai`, `anthropic`, `gemini`, `vertex-ai`); пользовательский идентификатор провайдера (например, `idealab`) разрешен, если вы сопоставите его с протоколом через настройку верхнего уровня [`providerProtocol`](#custom-provider-ids-providerprotocol). Каждая запись модели требует наличия `id`; `envKey` является **необязательным и рекомендуемым** (при отсутствии возвращается к ключу среды по умолчанию для типа авторизации, например `OPENAI_API_KEY` для `openai`), с необязательными параметрами `name`, `description`, `baseUrl` и `generationConfig`. Учетные данные никогда не сохраняются в настройках; среда выполнения считывает их из `process.env[envKey]`. Старые бесплатные модели Qwen OAuth остаются жестко закодированными и не могут быть переопределены.

> [!note]
>
> В более ранних превью модели каждого провайдера оборачивались в объект `{ "protocol": ..., "models": [...] }`. Этот формат был отменён — текущее значение представляет собой голый массив `ModelConfig[]`, показанный на этой странице. Обёрнутая запись в уже мигрированном (`$version: 4`) файле настроек тихо пропускается, поэтому обновите любые старые конфигурации до формата массива.

> [!note]
>
> Настройте провайдеры API-ключей через `modelProviders`, затем выберите их с помощью `/model`. Для входа в аккаунт Qwen выберите [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) в `/auth`; API-ключ или ручная конфигурация `modelProviders` не требуются. Используйте `/model` для выбора из моделей, доступных с вашей подпиской. См. [Аутентификация](./auth.md) для инструкций по входу.

> [!note]
>
> **Уникальность моделей:** Модели идентифицируются по эффективному API-протоколу, `id` и настроенному `baseUrl`. Вы можете определить одну и ту же модель и URL как с `wireApi: "chat-completions"`, так и с `wireApi: "responses"`, или использовать разные URL для одной и той же модели и API. Если записи разделяют все три значения, первое вхождение имеет приоритет, а последующие дубликаты пропускаются с предупреждением.

> [!note]
>
> **Горячая перезагрузка против перезапуска:** Изменения `modelProviders` в `settings.json` подхватываются запущенной интерактивной сессией без перезапуска (наблюдатель за файлами использует дебаунс ~300 мс; повторно откройте `/model`, чтобы увидеть новые записи, текущий выбор сохраняется). Изменение `wireApi` активной модели создает другой маршрут; явно выберите этот маршрут или перезапустите приложение, чтобы использовать его. Недействительные изменения API оставляют предыдущий реестр работоспособным. `providerProtocol` читается один раз при запуске и **требует перезапуска**.

### Маршруты генерации изображений

Установите `supportsImageGeneration: true`, если маршрут может использоваться встроенным инструментом `image_gen`. Эта возможность не зависит от поддержки входных данных изображений, такой как `capabilities.vision` или `generationConfig.modalities.image`.

Используйте `imageOnly: true`, если маршрут предназначен исключительно для генерации изображений и не должен отображаться в обычных селекторах моделей. Для обратной совместимости `imageOnly: true` также подразумевает возможность генерации изображений, поэтому существующие настройки не требуют миграции.

Маршрут с двойной ролью можно выбрать как основную модель и через `/model --image`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "omni-model",
        "envKey": "MODEL_API_KEY",
        "baseUrl": "https://gateway.example.com/model-api",
        "supportsImageGeneration": true
      }
    ]
  }
}
```

Выделенный маршрут для изображений устанавливает оба поля. Устаревшая форма только с `imageOnly: true` остается допустимой:

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

Выбранный маршрут должен явно указывать HTTPS `baseUrl` и непустой `envKey`. Генерация изображений использует ту же конечную точку и учетные данные, что и маршрут; если для чата и генерации изображений требуются разные конечные точки или учетные данные, настройте два маршрута.

### Маршруты Live Voice

Установите `realtimeOnly: true` на маршруте, который использует протокол DashScope Realtime (преобразование речи в речь). Такой маршрут никогда не предлагается в качестве модели для чата, быстрой работы, зрения, голоса или изображений; его можно выбрать только в качестве модели Live Voice через `experimental.liveVoice.model` (`modelId` или `provider:modelId`, если тот же идентификатор существует у нескольких провайдеров).

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.5-omni-plus-realtime",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY",
        "realtimeOnly": true
      }
    ]
  },
  "experimental": {
    "liveVoice": {
      "enabled": true,
      "model": "qwen3.5-omni-plus-realtime",
      "voice": "Tina"
    }
  }
}
```

Когда выбранная модель указывает на маршрут `realtimeOnly`, Live Voice считывает ключ API через `envKey` маршрута (сначала переменные окружения процесса, затем блок `env` в `settings.json`) и выводит WebSocket-конечную точку из его `baseUrl` (`https://<host>/compatible-mode/v1` становится `wss://<host>/api-ws/v1/realtime`). Маршрут должен объявлять как `baseUrl`, так и `envKey`, а хост должен быть конечной точкой DashScope.

Два правила являются сознательными:

- Настройки рабочего пространства никогда не используются, только пользовательские и системные. Файл `.qwen/settings.json` проекта не может добавить или перенаправить маршрут Live Voice.
- **Простой** `modelId`, который не соответствует ни одному маршруту `realtimeOnly`, использует отдельные поля `experimental.liveVoice.endpoint` и `experimental.liveVoice.apiKey`, как раньше, поэтому существующие конфигурации продолжают работать без изменений. Селектор `provider:modelId`, у которого провайдер существует, но нет такого маршрута, вызывает ошибку: удаленный или неправильно набранный маршрут никогда молча не возвращается к сохраненному ключу.
- Пока выбран маршрут, `experimental.liveVoice.apiKey` и `experimental.liveVoice.endpoint` не используются, и API настройки отказывается сохранять новые значения.

На отдельном пути настройки Qwen Live в Web Shell напрямую задают конечную точку и модель. Введите базовый URL OpenAI-совместимого региона или выделенного домена, к которому принадлежит ваш ключ, например `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`; если оставить пустым, Live использует Пекин (`https://dashscope.aliyuncs.com/compatible-mode/v1`), а ключ из другого региона будет отклонен с ошибкой `401`. Базовый URL сохраняется в введенном виде и преобразуется в `wss://<host>/api-ws/v1/realtime` при начале вызова; хост должен быть конечной точкой DashScope или `*.maas.aliyuncs.com`. Пока включен Live Voice, новая конечная точка проверяется рукопожатием Realtime перед сохранением.

## Переопределение возможностей рассуждения [#override-reasoning-capabilities]

Установите `capabilities.reasoning` в записи модели, чтобы переопределить её формат рассуждений, доступные уровни усилий и значение по умолчанию. Известные модели наследуют опущенные поля из каталога провайдера на выбранной конечной точке; например, `"capabilities": { "reasoning": { "defaultEffort": "medium" } }` заставляет маршрут DashScope `qwen3.8-max` использовать medium, если явное усилие не выбрано. Для неизвестного псевдонима объявите все три поля:

```json
{
  "id": "company-model-v2",
  "baseUrl": "https://gateway.example.com/v1",
  "envKey": "COMPANY_MODEL_API_KEY",
  "capabilities": {
    "reasoning": {
      "profile": "openai-effort",
      "efforts": ["low", "medium", "high"],
      "defaultEffort": "medium"
    }
  }
}
```

`efforts` заменяет поддерживаемое подмножество `low/medium/high/xhigh/max`. Явное значение по умолчанию должно принадлежать этому подмножеству. Профили повторно используют существующие форматы: Chat принимает `openai-effort`, `openai-reasoning`, `deepseek-openai`, `dashscope-effort`, `dashscope-thinking` и `qwen-chat-template`; Responses принимает `openai-reasoning`; Anthropic принимает `anthropic-manual`, `anthropic-adaptive` и `deepseek-anthropic`; Gemini/Vertex использует `gemini`. Два профиля с только переключателями опускают `efforts` и `defaultEffort`. Gemini использует low/medium/high. Адаптивный профиль выбирает адаптивное мышление даже при настроенном устаревшем ручном бюджете. Существующие полные объявления возможностей продолжают работать.

Изменения рассуждений применяются перед следующим запросом пользователя. Его запросы, повторные попытки и дочерние агенты разделяют захваченную конфигурацию рассуждений. Недействительные обновления сохраняют предыдущую конфигурацию и записывают ошибку модели/поля в журнал. Недействительные объявления в новых сессиях безопасно возвращаются к существующему поведению модели. Явный выбор пользователя и нативные переопределения провайдера в `reasoning`, `samplingParams` и `extra_body` сохраняют свой существующий приоритет; значение по умолчанию для модели не сохраняется как выбор пользователя. Этот механизм не изменяет жизненные циклы конечных точек, учетных данных или моделей изображений.

## Примеры конфигурации по типам аутентификации

Ниже приведены подробные примеры конфигурации для различных типов аутентификации, демонстрирующие доступные параметры и их комбинации.

### Поддерживаемые типы аутентификации

Используйте один из встроенных идентификаторов провайдеров ниже или сопоставьте пользовательский идентификатор с помощью `providerProtocol`:

| Действующий протокол | Описание                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`           | API, совместимые с OpenAI. По умолчанию Chat Completions; установите `wireApi` модели в `responses` для API Responses.                             |
| `anthropic`        | API Anthropic Claude                                                                                                                            |
| `gemini`           | API Google Gemini                                                                                                                               |
| `vertex-ai`        | Google Vertex AI (использует протокол `gemini` и SDK `@google/genai` в режиме Vertex AI; его выбор устанавливает `GOOGLE_GENAI_USE_VERTEXAI=true`) |

> [!note]
> Записи Vertex AI могут аутентифицироваться с помощью **Application Default Credentials**. Установите `GOOGLE_CLOUD_PROJECT` (и, при необходимости, `GOOGLE_CLOUD_LOCATION`, по умолчанию `global`) и оставьте `envKey` не установленным, равно как и все остальные источники ключей, которые читает резолвер: `GOOGLE_API_KEY`, `settings.security.auth.apiKey` и CLI-флаги ключей. Любое значение API-ключа, достигающее записи Vertex, переключает Google SDK в режим Vertex Express, который игнорирует проект, локацию и ваши учётные данные ADC. Запись, объявляющая `envKey`, никогда не маршрутизируется к ADC, поэтому ключ, который не удалось инжектировать, продолжит падать на этой переменной, а не молча аутентифицируется как другой принципал безопасности.

> [!warning]
> Provider id, который не является ни встроенным протоколом, ни сопоставлен через `providerProtocol` (например, опечатка вроде `"openai-custom"`), не может быть маршрутизирован, поэтому вся его запись **пропускается** с предупреждением — его модели просто не появятся в меню выбора `/model`. Используйте одно из поддерживаемых значений типа аутентификации, перечисленных выше, для встроенных провайдеров, или добавьте сопоставление [`providerProtocol`](#custom-provider-ids-providerprotocol) для пользовательского id.

### Пользовательские provider id (`providerProtocol`) [#custom-provider-ids-providerprotocol]

Встроенные provider id (`openai`, `gemini`, `anthropic`, `vertex-ai`, `qwen-oauth`) автоматически маршрутизируются к их SDK-протоколу. Чтобы использовать **пользовательский** provider id — например, для объединения нескольких OpenAI-совместимых эндпоинтов под более удобным именем — объявите его в `modelProviders` и сопоставьте с встроенным протоколом через настройку `providerProtocol` верхнего уровня:

```json
{
  "modelProviders": {
    "idealab": [
      {
        "id": "my-model",
        "envKey": "IDEALAB_API_KEY",
        "baseUrl": "https://idealab.example.com/v1"
      }
    ]
  },
  "providerProtocol": {
    "idealab": "openai"
  }
}
```

Без соответствующей записи `providerProtocol` пользовательский provider id пропускается (см. предупреждение выше).

### Выбор API OpenAI

Установите `wireApi` рядом с `id`, `envKey` и `baseUrl` в модели, совместимой с OpenAI:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "my-model",
        "wireApi": "responses",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ]
  },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "my-model" }
}
```

Поддерживаемые значения — `chat-completions` и `responses`. Пропуск `wireApi` использует Chat Completions для `openai`, включая пользовательских провайдеров, сопоставленных с `openai`. Другие значения, или `wireApi` в моделях Anthropic, Gemini, Vertex AI или Qwen OAuth, являются ошибками конфигурации.

Используйте `openai` с параметром `wireApi` для каждой модели в новых конфигурациях. Формат `modelProviders.openai-responses` и сопоставления `providerProtocol` к `openai-responses`, выпущенные в v0.23.3, остаются читаемыми. Явные сопоставления провайдеров имеют приоритет над именами групп; явный `wireApi` имеет приоритет над любым протоколом OpenAI. Загрузка не переписывает настройки и не изменяет ссылки на учетные данные. Переконфигурация записывает выбранные маршруты в новом формате и удаляет только соответствующие им старые записи в области записи; записи под идентификатором провайдера, содержащим точку, оставляются на месте, а несвязанные модели, конечные точки, API и области остаются неизменными. `api` не является псевдонимом для `wireApi`.

`wireApi` — это метаданные локальной маршрутизации; они не относятся к `generationConfig` или `extra_body` и не отправляются в теле запроса. Новая настройка пользовательского провайдера разделяет один слот учетных данных для одной и той же конечной точки OpenAI через оба API, поэтому ротация этого ключа обновляет оба маршрута. Модели, настроенные вручную, могут использовать различные явные ссылки `envKey`, когда нужны независимые учетные данные. В `/auth` → Custom Provider выберите OpenAI-compatible, а затем формат API.

При запуске `selectedType: "openai"` может разрешить явно настроенную модель с помощью `wireApi: "responses"`, если на выбранной настроенной конечной точке нет соответствующего маршрута Chat. Выбор модели и сохранённые сессии сохраняют эффективный протокол (`openai` или `openai-responses`), поэтому оба маршрута можно выбирать и возобновлять независимо. При ошибке API-запроса определение конечной точки или автоматический откат не выполняются.

### Транспорты, используемые для API-запросов

Эффективный протокол модели определяет транспорт. Оба OpenAI API используют группу провайдеров `openai`; `wireApi` выбирает Chat Completions или Responses:

| Эффективный протокол | Транспорт                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `openai`           | [`openai`](https://www.npmjs.com/package/openai) — Официальный SDK Node.js для OpenAI                                     |
| `openai-responses` | Прямые HTTP/SSE вызовы к `/v1/responses` (без SDK); эмбеддинги используют [`openai`](https://www.npmjs.com/package/openai) |
| `anthropic`        | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — Официальный SDK Anthropic                    |
| `gemini`           | [`@google/genai`](https://www.npmjs.com/package/@google/genai) — Официальный SDK Google GenAI                         |
| `qwen-oauth`       | [`openai`](https://www.npmjs.com/package/openai) с пользовательским провайдером (совместимым с DashScope)                       |

Это означает, что настроенная вами `baseUrl` должна быть совместима с ожидаемым форматом API соответствующего транспорта. Например, `wireApi: "responses"` требует конечной точки, совместимой с Responses.

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
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "retryInitialDelayMs": 3000,
          "retryMaxDelayMs": 30000,
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
```

При указании записи на хостинговый шлюз, совместимый с OpenAI, установите `baseUrl` в корень API `/v1` (например, `https://gateway.example.com/v1`), а не полный путь `/v1/chat/completions` — SDK сам добавляет путь запроса.

### OpenAI Responses API (`openai-responses`)

Используйте `openai` вместе с `wireApi: "responses"` для целевой конечной точки `/v1/responses` OpenAI. Когда конечная точка возвращает зашифрованные рассуждения с видимым текстом мыслей, она воспроизводит рассуждения предыдущих ходов между ходами и `--resume` через `reasoning.encrypted_content`. Совместимые конечные точки, которые транслируют `response.reasoning_text.delta`, также отображают свои рассуждения, но конечные точки без `encrypted_content` не могут воспроизвести непрозрачное состояние рассуждений. Используйте `reasoning.effort` (а не `extra_body.enable_thinking`, который используется проводками Chat Completions) для управления интенсивностью рассуждений.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-5.1",
        "wireApi": "responses",
        "name": "GPT-5.1 (Responses API)",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "reasoning": {
            "effort": "high"
          },
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

> [!note]
> `extra_body` на этом проводе работает только как заполнитель: ключ записывается в тело запроса только тогда, когда сгенерированный запрос не имеет значения для него, поэтому он не может переопределить поле, уже установленное конвейером (`model`, `input`, `reasoning`, `temperature`, `max_output_tokens`, ...). Устаревший ключ `enable_thinking` является единственным исключением из этого правила — он удаляется, а не передаётся дальше (это не поле API Responses), и преобразуется в `reasoning.effort: "medium"`, если явный `reasoning` не установлен. Вместо `extra_body.enable_thinking` напрямую устанавливайте `reasoning.effort` для этого провайдера.

### Anthropic (`anthropic`)

Claude Opus 5.5, Sonnet 5.5, Fable 5.1 и Mythos 5.1 отвергают принудительный выбор инструмента. Для структурированных побочных запросов Qwen Code использует автоматический выбор инструмента с явной инструкцией ответа по схеме на этих моделях. Модели, поддерживающие принудительный выбор, сохраняют его. Автоматический выбор не гарантирует вызов инструмента; JSON-запросы могут также читать необъектный JSON из текста ответа, без Markdown-ограждений или окружающего текста. См. [ограничения выбора инструмента у Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use).

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

Для vision-модели, которая также может следовать обычной политике агента Qwen Code и использовать инструменты, включите маршрутизацию изображений полного хода с обеими возможностями:

```json
"capabilities": {
  "vision": true,
  "agent": true
}
```

Когда текстовая основная модель использует эту модель как настроенный vision-фолбэк, полный ход с изображениями остаётся на этом же провайдере, модели и эндпоинте на протяжении вызовов инструментов и повторов. Следующий независимый ход возвращается к основной модели, и каждый запрос модели получает только те модальности медиа, которые поддерживает его цель. Пропустите `agent` (или установите `false`), чтобы сохранить более безопасный поток транскрибации Vision Bridge.

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
          "streamIdleTimeoutMs": 600000,
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

Для серверов OpenAI-совместимых локальных серверов с очередью или медленных `streamIdleTimeoutMs` контролирует, как долго эта модель может молчать между потоковыми фрагментами. Он переопределяет глобальное значение `QWEN_STREAM_IDLE_TIMEOUT_MS` для выбранной записи провайдера; установите его в `0`, чтобы отключить защиту от простоя. Отдельное ограничение времени жизни потока в 15 минут по-прежнему применяется, если `QWEN_STREAM_MAX_LIFETIME_MS` не увеличен или не отключен.

Для локальных серверов, не требующих аутентификации, можно использовать любое значение-заглушку для API-ключа:

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Параметр `extra_body` поддерживается **только для провайдеров, совместимых с OpenAI** (`openai`, `qwen-oauth`). Он игнорируется для провайдеров Anthropic и Gemini. На `openai-responses` ключ `enable_thinking` преобразуется, а не передаётся дальше — см. примечание к [OpenAI Responses API](#openai-responses-api-openai-responses).

> [!note]
>
> **Об `envKey`**: Поле `envKey` задает **имя переменной окружения**, а не фактическое значение API-ключа. Чтобы конфигурация работала, необходимо убедиться, что соответствующая переменная окружения установлена с вашим реальным API-ключом. Есть два способа сделать это:
>
> - **Вариант 1: Использование файла `.env`** (рекомендуется из соображений безопасности):
>   ```bash
>   # ~/.qwen/.env (or project root)
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

#### Qwen3.x под пользовательским именем модели

Управление размышлениями и контекстное окно определяются на основе идентификатора модели. Если сервер vLLM или SGLang предоставляет модель Qwen3.x под идентификатором, который не начинается с `qwen` (например, `--served-model-name chat`), ни то, ни другое не применяется: побочные запросы, такие как классификатор разрешений для автоматического режима, продолжают использовать размышления, а размер контекстного окна возвращается к значению по умолчанию 200K. Объявите оба параметра в записи модели, как описано в [Переопределение возможностей рассуждения](#override-reasoning-capabilities):

```json
{
  "id": "chat",
  "name": "Qwen3.6 35B A3B (vLLM)",
  "envKey": "VLLM_API_KEY",
  "baseUrl": "http://localhost:8000/v1",
  "capabilities": { "reasoning": { "profile": "qwen-chat-template" } },
  "generationConfig": { "contextWindowSize": 262144 }
}
```

`qwen-chat-template` отправляет `chat_template_kwargs.enable_thinking`, которые эти серверы передают в шаблон чата Qwen; поле верхнего уровня `enable_thinking` ими не читается. Установите `contextWindowSize` равным максимальной длине модели на сервере (vLLM сообщает её как `max_model_len` в `/v1/models`). Qwen Code отправляет определения инструментов в каждом запросе, поэтому на сервере также должны быть включены вызовы инструментов и парсер рассуждений; для vLLM это `--enable-auto-tool-choice`, `--tool-call-parser` для модели (например, `qwen3_xml`) и `--reasoning-parser qwen3`. Названия парсеров меняются между релизами сервера, поэтому сверяйтесь с документацией вашего сервера.

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan предоставляет заранее настроенный набор моделей Qwen, оптимизированных для задач программирования. Эта функция доступна пользователям с доступом к API Alibaba Cloud Coding Plan и предлагает упрощенный процесс настройки с автоматическим обновлением конфигурации моделей.

### Обзор

При аутентификации с помощью API-ключа Alibaba Cloud Coding Plan через команду `/auth`, Qwen Code автоматически настраивает следующие модели:

| ID модели              | Название             | Описание                                                |
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

| Регион                 | Конечная точка                                   | Описание                |
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
- Оставьте выбранную вами модель без изменений; если её больше нет в обновленной конфигурации, используйте `/model`, чтобы выбрать новую

Процесс обновления обновляет конфигурации моделей и функции, не изменяя выбранную вами модель.

### Ручная настройка (для продвинутых пользователей)

Если вы предпочитаете настраивать модели Coding Plan вручную, вы можете добавить их в `settings.json` так же, как и любого OpenAI-совместимого провайдера:

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

\*Если присутствует, флаги аутентификации CLI переопределяют настройки. В противном случае тип аутентификации определяется через `security.auth.selectedType` или неявное значение по умолчанию. См. [Аутентификация](./auth.md) для вариантов входа. Устаревший бесплатный провайдер Qwen OAuth отделен от [Аккаунта Qwen с подпиской](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).

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

   Если модель указана в `modelProviders`, поместите все специфичные для этой модели настройки генерации в соответствующую запись провайдера. Значения верхнего уровня `model.generationConfig`, включая `contextWindowSize`, `modalities`, `customHeaders` и `extra_body`, игнорируются для моделей провайдера. Настройте эти поля в `modelProviders[authType][].generationConfig`, чтобы они применялись.

2. **Если НЕ выбрана модель modelProvider** (например, используется `--model` с необработанным ID модели, или напрямую используются CLI/env/settings):
   - Разрешение переходит к нижним уровням
   - Поля заполняются из CLI → env → settings → defaults
   - Это создает **Runtime Model** (см. следующий раздел)

### Приоритет для каждого поля `generationConfig`

| Приоритет | Источник                                      | Поведение                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Программные переопределения                   | Изменения Runtime `/model`, `/auth`                                                                      |
| 2        | `modelProviders[authType][].generationConfig` | **Непроницаемый слой** - полностью заменяет все поля generationConfig; нижние уровни не участвуют        |
| 3        | `settings.model.generationConfig`             | Используется только для **Runtime Models** (когда не выбрана модель провайдера)                          |
| 4        | Значения по умолчанию генератора контента     | Специфичные для провайдера значения по умолчанию (напр., OpenAI или Gemini) - только для Runtime Models  |

### Динамические значения в `customHeaders` [#dynamic-values-in-customheaders]

Значение `customHeaders` может содержать заполнитель `${session_id}`, который расширяется при каждом запросе с текущим идентификатором сеанса Qwen Code. Используйте его для шлюзов, требующих стабильного идентификатора для каждого диалога — например, OpenCode Go отклоняет запросы без `x-opencode-session`:

```json
{
  "generationConfig": {
    "customHeaders": {
      "x-opencode-session": "${session_id}"
    }
  }
}
```

Поскольку значение вычисляется при каждом запросе, а не фиксируется в клиенте SDK, `/new` и `/resume` ротируют его без перезапуска.

⚠️ **Требуется два шага.** Приведенная выше запись провайдера — это только половина дела — заполнитель неактивен, пока вы также не включите [`outboundCorrelation.allowDynamicHeaderValues`](./settings.md#outboundcorrelation):

```json
{
  "outboundCorrelation": {
    "allowDynamicHeaderValues": true
  }
}
```

Пока вы этого не сделаете, значение, содержащее заполнитель, **отбрасывается**, а не отправляется, и Qwen Code выводит предупреждение при запуске с указанием имени заголовка и этого параметра. Заголовок никогда не отправляется с буквальным `${session_id}` внутри.

**Один заголовок зарезервирован.** На конечных точках MaaS QwenCloud — записи `/auth` `China — Qianwen AI Platform` и `International — QwenCloud` — Qwen Code владеет `X-DashScope-Source-Config` и записывает в него значение атрибуции первой стороны. Запись с этим именем — в любом регистре — удаляется перед формированием запроса, поэтому заполнитель `${session_id}` в нем никогда не сохраняется, и `allowDynamicHeaderValues` это не меняет. Сам заголовок по-прежнему отправляется; заменяется только ваше значение. См. [`customHeaders`](./settings.md#model) для того же правила, изложенного со стороны настроек.

Переключатель является глобальным, поскольку представляет собой решение о согласии, отдельное от _места_ назначения значения: расширенное значение передает активное состояние сеанса тому, кто его получает, а переключатель контролирует только возможность расширения `${session_id}`. Он не определяет, какой источник настроек предоставил заголовок.

**Примечание о конфиденциальности:** идентификатор сеанса является стабильным идентификатором на время жизни диалога, поэтому любой хост, которому вы его отправляете, может группировать все запросы этого диалога. Какие именно хосты получают этот заголовок, определяется тем, какие записи провайдеров содержат его — нет отдельного списка хостов, который нужно синхронизировать с вашим `baseUrl`.

### Атомарная обработка полей

Следующие поля обрабатываются как атомарные объекты — значения провайдера полностью заменяют весь объект, слияние не происходит:

- `samplingParams` - Temperature, top_p, max_tokens и т.д.
- `customHeaders` - Пользовательские HTTP-заголовки (могут содержать `${session_id}`; см. [Динамические значения](#dynamic-values-in-customheaders))
- `extra_body` - Дополнительные параметры тела запроса

### Пример

```jsonc
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

Когда `gpt-4o` выбран из modelProviders:

- `timeout` = 60000 (из провайдера, переопределяет настройки)
- `samplingParams.temperature` = 0.2 (из провайдера, полностью заменяет объект настроек)
- `samplingParams.max_tokens` = **undefined** (не определен в провайдере, и слой провайдера не наследует от настроек — поля явно устанавливаются в undefined, если не предоставлены)

При использовании сырой модели через `--model gpt-4` (не из modelProviders, создает Runtime Model):

- `timeout` = 30000 (из настроек)
- `samplingParams.temperature` = 0.5 (из настроек)
- `samplingParams.max_tokens` = 1000 (из настроек)

Стратегия слияния для самого `modelProviders` — REPLACE (замена): весь блок `modelProviders` из настроек проекта полностью переопределит соответствующую секцию в пользовательских настройках, а не объединится с ней.

## Конфигурация reasoning / thinking

Необязательное поле `reasoning` внутри `generationConfig` контролирует, насколько агрессивно модель рассуждает перед ответом. Конвертеры Anthropic и Gemini всегда учитывают его. Конвейер OpenAI-compatible учитывает его, **если** не установлено `generationConfig.samplingParams`. Известные модели GPT-5 и GPT-6 Astra являются исключением: несвязанные ключи сэмплирования не подавляют настроенное усилие. См. «Взаимодействие с `samplingParams`» ниже.

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
          // The effort tiers:
          //   'low'    — lightest reasoning
          //   'medium' | 'xhigh' — mapped to 'high' on DeepSeek
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

| Протокол / провайдер                           | Формат передачи данных                                                                               | Примечания                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (семейство `qwen3.8-max`) | Плоский параметр тела `reasoning_effort: <effort>`                                         | Уровни `/effort` передаются для любого идентификатора модели, начинающегося с `qwen3.8-max` (включая датированные снимки и алиасы `-latest`), предварительных версий `qwen-latest-series-invite-*` только по приглашению и семейства `qwen4*` (регистронезависимо); DashScope применяет любое специфичное для модели сопоставление. Лестница уровней этого семейства останавливается на `xhigh`, поэтому настроенный `max` ограничивается до `xhigh` (логируется один раз), а не отправляется и отклоняется. Явный `reasoning_effort` в `samplingParams` или `extra_body` является дословным переопределением и не ограничивается. Когда `reasoning_effort` и `thinking_budget` конфликтуют, обычный приоритет `extra_body` > `samplingParams` > `reasoning` сохраняет только поле с более высоким приоритетом; явная пара на одном уровне сохраняет `reasoning_effort`, что соответствует поведению провайдера до разрешения между уровнями. Если побеждает статическое поле, `/effort` сообщает об этом поле вместо того, чтобы подразумевать эффективность запрошенного уровня. Когда побеждает уровень усилий, конфликтующий `enable_thinking` также отбрасывается. Явный `enable_thinking: false` в `extra_body` учитывается, а не отбрасывается: он переопределяет настроенный уровень как `reasoning_effort: 'none'`, что является одним из немногих мест, где `extra_body` не побеждает дословно. Другие модели Qwen продолжают сопоставлять выбранные усилия с `enable_thinking: true`; переопределение `reasoning_effort` проходит там, если оно не конфликтует с `thinking_budget` (пара, которую DashScope отклоняет), в этом случае инертный `reasoning_effort` отбрасывается, а оба `enable_thinking` и `thinking_budget` сохраняются. |
| **OpenAI / DeepSeek** (`api.deepseek.com`)    | Плоский параметр тела `reasoning_effort: <effort>`                                         | Когда `reasoning.effort` установлен во вложенной структуре конфигурации, он перезаписывается в плоский `reasoning_effort`; для встроенных моделей DeepSeek `'low'`, `'high'` и `'max'` проходят напрямую, а `'medium'`/`'xhigh'` нормализуются до `'high'` — это отражает [сопоставление усилий](https://api-docs.deepseek.com/guides/thinking_mode) DeepSeek. Эта прямая передача и нормализация описывают официальную конечную точку: на MaaS и сторонних хостах точные идентификаторы `deepseek-v4-pro` / `deepseek-v4-flash` предлагают только `high`/`max` (настроенный `low` повышается до `high`, а `xhigh` нормализуется до `max`), тогда как новые алиасы Flash (`deepseek-v4.1-flash*`) сохраняют `low`/`high`/`max` с `xhigh → high`. Переопределения верхнего уровня `samplingParams.reasoning_effort` или `extra_body.reasoning_effort` пропускают эту нормализацию и отправляются дословно. `max` принимается на реальном хосте DeepSeek и для любого идентификатора модели `deepseek-v4*` (регистронезависимо, включая датированные снимки), который распознается на любом хосте, совместимом с OpenAI (сторонние шлюзы получают контракт `enable_thinking` в стиле MaaS); другие модели с именем `deepseek` на другом хосте сохраняют общий потолок `xhigh`, что соответствует проверке имени хоста при преобразовании формы данных.                                                                                                                                                                                                                                                                                                                                           |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`)     | Плоский параметр тела запроса `reasoning_effort: <effort>`                                         | GLM-5.2+ на хосте Z.ai использует полную шкалу уровней, включая `max`, а вложенный объект `reasoning.effort` переписывается в плоское поле. Старые идентификаторы моделей GLM и модель `glm-*`, доступная на любом другом хосте, сохраняют общий предел `xhigh`: само название модели ничего не говорит о том, что принимает данная конечная точка.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OpenAI** (другие совместимые серверы)         | Известные GPT-5 / GPT-6 Astra: плоский формат `reasoning_effort`; другие модели: вложенный формат `reasoning`     | Уровень усилий для GPT ограничивается с обеих сторон до поддерживаемого подмножества для известной модели. GPT-5.6 и GPT-6 Astra допускают `max`, тогда как у более ранних моделей пределы ниже. Уровни ниже минимального порога модели повышаются: GPT-5 Pro принимает только `high`; GPT-5.2 Pro, GPT-5.4 Pro и GPT-5.5 Pro повышают `low` до `medium`. OpenRouter сохраняет вложенную структуру `reasoning`. Неизвестные названия моделей сохраняют общий предел `xhigh` и вложенную структуру. Явные значения рассуждений в `samplingParams` / `extra_body` обходят ограничение настроенного уровня.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **OpenAI Responses** (`openai-responses`)     | `reasoning: { effort, summary: "auto" }` плюс `include: ["reasoning.encrypted_content"]` | Каждый уровень передается дословно без ограничений. `extra_body.enable_thinking: true` преобразуется в `reasoning: { effort: "medium" }`, если явно не задан `reasoning` (и сам по себе никогда не пересылается — он не имеет смысла в этом протоколе); предпочтительно напрямую задавать `reasoning.effort`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Anthropic** (реальный `api.anthropic.com`)      | `output_config: { effort }` плюс заголовок beta `effort-2025-11-24`                     | Реальный Anthropic принимает только `'low'`/`'medium'`/`'high'`. `'max'` **ограничивается значением `'high'`** с помощью строки `debugLogger.warn` (один раз на генератор); если вы хотите максимальных усилий, переключите baseURL на конечную точку, совместимую с DeepSeek, которая это поддерживает.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Anthropic** (`api.deepseek.com/anthropic`)  | Тот же `output_config: { effort }` + заголовок beta                                           | `'low'`, `'high'` и `'max'` передаются без изменений; `'medium'`/`'xhigh'` отображаются на `'high'`, что соответствует серверному отображению DeepSeek.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                  | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                               | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, остальные → `THINKING_LEVEL_UNSPECIFIED` (у Gemini нет уровня `MAX`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `reasoning: false`

Явное значение `reasoning: false` (булево) отключает размышления на моделях, которые это поддерживают — полезно для дешёвых побочных запросов, где рассуждения не нужны. Это также учитывается на уровне запроса через `request.config.thinkingConfig.includeThoughts: false` для одноразовых вызовов (например, генерация предложений).

На baseURL `api.deepseek.com` конвейер OpenAI отправляет явное поле `thinking: { type: 'disabled' }`, требуемое DeepSeek V4+ — серверное значение по умолчанию равно `'enabled'`, поэтому простое пропускание `reasoning_effort` всё равно приведёт к задержке и стоимости размышлений. Самохостинговые бэкенды DeepSeek (sglang/vllm) и другие совместимые с OpenAI серверы **не** получают это поле; если вам нужно отключить размышления на них, внедрите `thinking: { type: 'disabled' }` (или любой другой параметр, предоставляемый вашим фреймворком инференса) через `samplingParams`/`extra_body`. Исключение составляет любой идентификатор модели `deepseek-v4*` (без учёта регистра): на любом стороннем хосте, совместимом с OpenAI, он следует контракту MaaS и получает `enable_thinking: false` при отключении размышлений. На любом newly recognized маршруте (сторонний хост или новый алиас на установленном хосте) устаревшее объявление `capabilities.reasoning` без профиля рассуждений сохраняет свою собственную сетевую семантику: встроенный нормализатор отступает и не ни flattens nor re-tiers объявленное или статическое усилие. Объявление должно указывать параметр, который модель читает в `disableField` (`thinking`, `enable_thinking` или `reasoning_effort`); то, которое его пропускает, не разрешает никаких возможностей, поэтому поле отключения не отправляется, и применяется значение по умолчанию сервера (размышления включены).

Для известных моделей GPT, допускающих отключение, эндпоинты, отличные от OpenRouter, получают `reasoning_effort: 'none'`; OpenRouter вместо этого получает вложенный `reasoning: { enabled: false }`. Модели с обязательным размышлением отвергают выключение в элементах управления моделью и исключают неподдерживаемые значения отключения из запросов, поэтому `reasoning: false` не может отключить их размышления. Явная возможность рассуждения модели имеет приоритет над встроенным списком уровней и выбирает нативное поле отключения; OpenRouter сохраняет своё поведение отключения на уровне провайдера. Встроенный набор обязательных моделей включает `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.2-codex`, `gpt-5.3-codex`, `gpt-5.2-pro`, `gpt-5.4-pro`, `gpt-5.5-pro` и `gpt-6-astra`.

На baseURL `openrouter.ai` конвейер OpenAI отправляет поле уровня провайдера OpenRouter `reasoning: { enabled: false }`, когда рассуждения отключены. Модели с обязательным размышлением не получают это поле отключения. Другие серверы, совместимые с OpenAI, не получают автоматически это специфичное для OpenRouter поле; используйте их нативный параметр отключения.

### Взаимодействие с `samplingParams` (только для OpenAI-совместимых)

> [!warning]
>
> За исключением известных моделей GPT и моделей с явными возможностями рассуждения, когда `generationConfig.samplingParams` установлен на провайдере, совместимом с OpenAI, конвейер отправляет эти ключи в сеть **дословно** и полностью пропускает отдельное внедрение `reasoning`. Таким образом, конфигурация вроде `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` молча удалит поле рассуждения в запросах к OpenAI/DeepSeek. Объект `reasoning`, помещённый внутрь `samplingParams`, является вашим собственным значением и отправляется без изменений, пока рассуждения включены: ограничение уровня усилия выше применяется только к уровню, который конвейер внедряет из `/effort`.
>
> Известные модели GPT-5 и GPT-6 Astra сохраняют настроенное усилие вместе с несвязанными ключами выборки. Например, `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` отправляет `temperature: 0.5` и плоский `reasoning_effort: 'xhigh'` на GPT-5.4, или `'max'` на GPT-5.6 / GPT-6 Astra. На baseURL `openrouter.ai` тот же ограниченный уровень отправляется как вложенный `reasoning: { effort }`. На эндпоинтах, отличных от OpenRouter, явные плоские переопределения рассуждения имеют приоритет; nullish или пустые строковые плоские заполнители позволяют использовать настроенный уровень. На OpenRouter плоское переопределение выборки подавляет настроенное вложенное усилие, если явные возможности модели не внедряют его; переопределение плоского значения только в extra-body не заменяет настроенное вложенное усилие.
>
> Модели DashScope Qwen являются ещё одним исключением: их провайдер читает `reasoning` напрямую и отображает его в `reasoning_effort` или `enable_thinking`. На семействах с уровнем усилия (`qwen3.8-max`, `qwen-latest-series-invite-*`, `qwen4*`) специфичные для провайдера поля `samplingParams` всё ещё имеют приоритет, когда параметры сети конфликтуют; на более старых гибридах qwen настроенный уровень усилия сводится к `enable_thinking: true`, который переопределяет значение `samplingParams.enable_thinking`.
>
> Для других моделей включайте параметр рассуждения провайдера напрямую при использовании `samplingParams` — для DeepSeek это `samplingParams.reasoning_effort`. Известные модели GPT автоматически сопоставляют настроенное усилие; добавляйте необработанное переопределение только при намеренном обходе этого сопоставления. Необработанные вложенные `reasoning`, включая `null`, остаются переопределением всего объекта, пока рассуждение включено. Отключение через `reasoning: false` или на уровне запроса `includeThoughts: false` удаляет вложенное значение, включая необработанные переопределения в любом из этих уровней. Запросы к не-OpenRouter GPT затем отправляют `reasoning_effort: 'none'`, когда отключение разрешено; OpenRouter вместо этого использует своё поле вложенного отключения. Модели с обязательным размышлением не получают замен. Вне OpenRouter его смысл зависит от шлюза, поэтому элементы управления моделью показывают значение по умолчанию для модели. Любое необработанное переопределение, блокирующее настроенный уровень, приводит к сбою явного изменения уровня без сохранения предпочтения. Переключатель мышления восстанавливает настроенные необработанные значения по умолчанию после отключения только тогда, когда они допускают мышление. Если необработанное состояние или настроенное значение по умолчанию для рассуждений выключены, переключатель мышления нельзя включить, и сохранённое предпочтение остаётся неизменным. Это также применимо, когда явные возможности опускают уровень по умолчанию или предоставляют только переключатель мышления. Явная команда сброса по умолчанию всё равно сбрасывает предпочтение. Удалите блокирующее необработанное переопределение, чтобы выбрать другой уровень.
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
- Не определено в `modelProviders`
- Конфигурация строится путём «проецирования» через слои разрешения (CLI → env → settings → defaults)
- Автоматически захватывается как **RuntimeModelSnapshot**, когда обнаружена полная конфигурация
- Позволяет повторно использовать конфигурацию без повторного ввода учётных данных

### Жизненный цикл RuntimeModelSnapshot

Когда вы настраиваете модель без использования `modelProviders`, Qwen Code автоматически создаёт RuntimeModelSnapshot для сохранения вашей конфигурации:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Снимок:

- Захватывает ID модели, API-ключ, базовый URL и конфигурацию генерации
- Сохраняется между сессиями (хранится в памяти во время выполнения)
- Появляется в списке команд `/model` как вариант времени выполнения
- Можно переключиться на неё с помощью `/model $runtime|openai|my-custom-model`

### Ключевые отличия

| Аспект | Провайдерная модель | Runtime-модель |
| ----------------------- | --------------------------------- | ------------------------------------------ |
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
- Без `modelProviders` резолвер смешивает слои CLI/env/settings, создавая Runtime Models. Это нормально для setups с одним провайдером, но неудобно при частом переключении. Определяйте каталоги провайдеров всякий раз, когда распространены многопользовательские рабочие процессы с несколькими моделями, чтобы переключения оставались атомарными, атрибутированными по источнику и отлаживаемыми.
