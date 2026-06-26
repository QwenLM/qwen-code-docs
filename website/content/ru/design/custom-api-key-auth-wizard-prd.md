# PRD: Мастер настройки собственного API-ключа

## Краткое описание

Улучшить процесс `/auth -> API Key -> Custom API Key`, заменив текущий экран с документацией на мастер настройки для пользовательских API-провайдеров, работающий внутри терминала.

Qwen Code поддерживает несколько протоколов API через ключи `authType` / `modelProviders`, включая `openai`, `anthropic` и `gemini`. Поэтому мастер настройки для собственных провайдеров должен начинаться с выбора протокола, затем собирать данные о конечной точке (endpoint), ключе и моделях для этого протокола.

Мастер проводит пользователя через следующие шаги:

```text
Выбор протокола → Ввод базового URL → Ввод API-ключа → Ввод идентификаторов моделей → Просмотр JSON → Сохранение + аутентификация
```

Это позволяет настраивать собственный API-ключ непосредственно в Qwen Code, уменьшает необходимость ручного редактирования `settings.json` и делает итоговую конфигурацию прозрачной, показывая сгенерированный JSON перед сохранением.

## Предыстория

Сегодня выбор `Custom API Key` в `/auth` показывает статический информационный экран:

```text
Custom Configuration

You can configure your API key and models in settings.json

Refer to the documentation for setup instructions
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

Esc to go back
```

Это требует, чтобы пользователь выходил из CLI, читал документацию, разбирался в `settings.json`, вручную настраивал `modelProviders`, выбирал `envKey`, добавлял API-ключи, а затем возвращался в Qwen Code. Пользователи сообщают, что этот процесс сложен и оторван от остального опыта работы с `/auth`.

Текущий путь стандартного API-ключа ModelStudio уже предоставляет направляемый процесс настройки:

```text
Alibaba Cloud ModelStudio Standard API Key
└─ Select Region
   └─ Enter API Key
      └─ Enter Model IDs
         └─ Save + authenticate
```

Настройка собственного API-ключа должна предлагать аналогичный направляемый опыт, а также учитывать, что Qwen Code поддерживает несколько протоколов провайдеров.

## Описание проблемы

Путь собственного API-ключ в настоящее время является тупиком внутри `/auth`:

```text
/auth
└─ Select Authentication Method
   ├─ Alibaba Cloud Coding Plan
   ├─ API Key
   │  └─ Select API Key Type
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Select Region
   │     │  ├─ Enter API Key
   │     │  ├─ Enter Model IDs
   │     │  └─ Save + authenticate
   │     │
   │     └─ Custom API Key
   │        └─ Documentation-only screen
   │
   └─ Qwen OAuth
```

Это вызывает несколько проблем с удобством использования:

- Пользователи не могут завершить настройку собственного провайдера из `/auth`.
- Пользователи должны понимать низкоуровневые концепции настроек, прежде чем они смогут пройти аутентификацию.
- Пользователи могут не знать, какие поля обязательны: `authType`, `baseUrl`, `envKey`, `modelProviders`, `model.name` и `security.auth.selectedType`.
- Пользователи могут случайно конфликтовать с существующими переменными окружения или перезаписывать существующую конфигурацию провайдера.
- Пользователи не получают немедленной обратной связи по аутентификации после ручного редактирования настроек.

## Цели

1. Позволить пользователям полностью настраивать пользовательского API-провайдера внутри `/auth`.
2. Поддерживать основные протоколы, которые Qwen Code поддерживает в `modelProviders`: `openai`, `anthropic` и `gemini`.
3. Сохранить процесс, близкий к существующему потоку ModelStudio Standard.
4. Считать `baseUrl` эквивалентом `region` для пользовательского провайдера.
5. Автоматически генерировать управляемый Qwen приватный `envKey` на основе выбранного протокола и введённого `baseUrl`.
6. Хранить API-ключ в `settings.json.env`, что согласуется с текущим шаблоном управления учётными данными Qwen.
7. Избегать конфликтов с пользовательскими переменными окружения оболочки, используя сгенерированное имя ключа, специфичное для Qwen.
8. Показывать сгенерированный JSON перед сохранением, чтобы пользователи могли просмотреть точные изменения настроек.
9. Сохранять существующие записи `modelProviders`, не связанные с настройкой.
10. Выполнять аутентификацию сразу после сохранения и показывать обратную связь об успехе или неудаче.

## Нецели

1. Не требовать от пользователей ручного ввода `envKey`.
2. Не вводить имя провайдера как отдельную концепцию.
3. Не добавлять в мастер расширенные параметры `generationConfig`, `capabilities` или переопределения для отдельных моделей.
4. Не удалять ссылку на документацию полностью; она должна оставаться доступной для расширенной конфигурации.
5. Не изменять существующие потоки Coding Plan или стандартного API-ключа ModelStudio.
6. Не пытаться автоматически определять протокол из `baseUrl` в первой версии; пользователи выбирают протокол явно.

## Целевые пользователи

- Пользователи, которые используют собственную пользовательскую конечную точку API.
- Пользователи, настраивающие провайдеров, таких как OpenAI-совместимые API, Anthropic-совместимые API, Gemini-совместимые API, vLLM, Ollama, LM Studio или внутренние шлюзы.
- Пользователи, предпочитающие настраивать аутентификацию из CLI, а не вручную редактировать `settings.json`.

## Поддерживаемые протоколы

Мастер должен изначально предлагать следующие варианты протоколов:

```text
openai
anthropic
gemini
```

Каждый протокол напрямую соответствует ключу `modelProviders` и значению `security.auth.selectedType`.

| Вариант протокола    | Ключ authType / modelProviders | Примечания                                                                        |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| OpenAI-совместимый   | `openai`                       | OpenAI, OpenRouter, Fireworks, локальные OpenAI-совместимые серверы, внутренние шлюзы |
| Anthropic-совместимый| `anthropic`                    | Anthropic-совместимые конечные точки                                               |
| Gemini-совместимый   | `gemini`                       | Gemini-совместимые конечные точки                                                  |
## Обзор пользовательского опыта

### Обновлённое дерево `/auth`

```text
/auth
└─ Выбор метода аутентификации
   ├─ Alibaba Cloud Coding Plan
   │  └─ Выбор региона
   │     └─ Ввод API-ключа
   │        └─ Сохранение + аутентификация
   │
   ├─ API-ключ
   │  └─ Выбор типа API-ключа
   │     ├─ Стандартный API-ключ Alibaba Cloud ModelStudio
   │     │  ├─ Выбор региона
   │     │  ├─ Ввод API-ключа
   │     │  ├─ Ввод идентификаторов моделей
   │     │  └─ Сохранение + аутентификация
   │     │
   │     └─ Пользовательский API-ключ
   │        ├─ Выбор протокола
   │        ├─ Ввод базового URL
   │        ├─ Ввод API-ключа
   │        ├─ Ввод идентификаторов моделей
   │        ├─ Просмотр сгенерированного JSON
   │        └─ Сохранение + аутентификация
   │
   └─ Qwen OAuth
```

### Автомат состояний пользовательского API-ключа

```text
api-key-type-select
  │
  └─ CUSTOM_API_KEY
      │
      ▼
custom-protocol-select
      │ Enter
      ▼
custom-base-url-input
      │ Enter
      │ generate envKey from protocol + baseUrl
      ▼
custom-api-key-input
      │ Enter
      ▼
custom-model-id-input
      │ Enter
      ▼
custom-review-json
      │ Enter
      ▼
save settings + refreshAuth(selectedProtocol)
```

### Поведение при нажатии Esc

```text
custom-review-json
  Esc -> custom-model-id-input

custom-model-id-input
  Esc -> custom-api-key-input

custom-api-key-input
  Esc -> custom-base-url-input

custom-base-url-input
  Esc -> custom-protocol-select

custom-protocol-select
  Esc -> api-key-type-select
```

## Подробный дизайн взаимодействия

### Шаг 1: Выбор протокола

```text
┌──────────────────────────────────────────────────────────────┐
│ Пользовательский API-ключ · Выбор протокола                  │
│                                                              │
│  ◉ Совместимый с OpenAI                                       │
│    OpenAI, OpenRouter, Fireworks, vLLM, Ollama, LM Studio    │
│                                                              │
│  ○ Совместимый с Anthropic                                    │
│    Совместимые с Anthropic конечные точки                     │
│                                                              │
│  ○ Совместимый с Gemini                                       │
│    Совместимые с Gemini конечные точки                       │
│                                                              │
│ Enter для выбора, ↑↓ для навигации, Esc для возврата         │
└──────────────────────────────────────────────────────────────┘
```

Выбранный протокол определяет:

- Ключ `modelProviders` для обновления.
- Значение `security.auth.selectedType` для сохранения.
- Метку протокола, отображаемую на последующих экранах.
- Тип аутентификации `refreshAuth()`, используемый после сохранения.

### Шаг 2: Ввод базового URL

`baseUrl` — это эквивалент выбора региона для пользовательского провайдера. Он должен быть перед вводом API-ключа, так как определяет, к какой конечной точке относится API-ключ.

Для совместимого с OpenAI:

```text
┌──────────────────────────────────────────────────────────────┐
│ Пользовательский API-ключ · Базовый URL                      │
│                                                              │
│ Протокол: Совместимый с OpenAI                                │
│                                                              │
│ Введите API-конечную точку, совместимую с OpenAI.             │
│                                                              │
│ Базовый URL: https://openrouter.ai/api/v1_                   │
│                                                              │
│ Примеры:                                                     │
│   OpenAI:      https://api.openai.com/v1                     │
│   OpenRouter: https://openrouter.ai/api/v1                   │
│   Fireworks:  https://api.fireworks.ai/inference/v1          │
│   Ollama:     http://localhost:11434/v1                      │
│   LM Studio:  http://localhost:1234/v1                       │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```

Для совместимого с Anthropic:

```text
┌──────────────────────────────────────────────────────────────┐
│ Пользовательский API-ключ · Базовый URL                      │
│                                                              │
│ Протокол: Совместимый с Anthropic                              │
│                                                              │
│ Введите API-конечную точку, совместимую с Anthropic.           │
│                                                              │
│ Базовый URL: https://api.anthropic.com/v1_                   │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```

Для совместимого с Gemini:

```text
┌──────────────────────────────────────────────────────────────┐
│ Пользовательский API-ключ · Базовый URL                      │
│                                                              │
│ Протокол: Совместимый с Gemini                                │
│                                                              │
│ Введите API-конечную точку, совместимую с Gemini.             │
│                                                              │
│ Базовый URL: https://generativelanguage.googleapis.com_       │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```
Валидация:

- Обязательное поле.
- Должно начинаться с `http://` или `https://`.
- Удалить ведущие и завершающие пробельные символы.
- Сохранять нормализованную строку как введено, за исключением удаления пробелов.

При успешной отправке:

- Сгенерировать управляемый Qwen `envKey` из выбранного протокола и `baseUrl`.
- Перейти к вводу API-ключа.

### Шаг 3: Введите API-ключ

```text
┌──────────────────────────────────────────────────────────────┐
│ Пользовательский API-ключ · API-ключ                         │
│                                                              │
│ Протокол: OpenAI-совместимый                                 │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Введите API-ключ для этого endpoint.                         │
│                                                              │
│ API-ключ: sk-or-v1-••••••••••••••••_                         │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```

Валидация:

- Обязательное поле.
- Удалить ведущие и завершающие пробельные символы.

Примечания:

- Поле ввода может изначально использовать существующее поведение текстового ввода для единообразия с соседними потоками.
- На экране проверки API-ключ должен быть замаскирован.

### Шаг 4: Введите идентификаторы моделей

```text
┌──────────────────────────────────────────────────────────────┐
│ Пользовательский API-ключ · Идентификаторы моделей           │
│                                                              │
│ Протокол: OpenAI-совместимый                                 │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Введите один или несколько идентификаторов моделей через запятую.│
│                                                              │
│ Идентификаторы моделей: qwen/qwen3-coder,openai/gpt-4.1_    │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```

Валидация:

- Обязательное поле.
- Разделить по запятой.
- Удалить пробельные символы у каждого идентификатора модели.
- Удалить пустые записи.
- Удалить дубликаты с сохранением порядка.
- Должен остаться как минимум один идентификатор модели.

Именование моделей:

- `id` и `name` должны совпадать.
- Отдельное имя провайдера у пользователя не запрашивается.

Пример:

```text
Ввод:
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Нормализовано:
qwen/qwen3-coder, openai/gpt-4.1
```

### Шаг 5: Проверка JSON

Перед сохранением покажите сгенерированный фрагмент JSON, который будет записан или объединён с `settings.json`.

Пример для OpenAI-совместимого:

```text
┌──────────────────────────────────────────────────────────────┐
│ Пользовательский API-ключ · Проверка                         │
│                                                              │
│ Следующий JSON будет сохранён в settings.json:               │
│                                                              │
│ {                                                            │
│   "env": {                                                   │
│     "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1":│
│       "sk-••••••••••••••••"                                  │
│   },                                                         │
│   "modelProviders": {                                        │
│     "openai": [                                              │
│       {                                                      │
│         "id": "qwen/qwen3-coder",                           │
│         "name": "qwen/qwen3-coder",                         │
│         "baseUrl": "https://openrouter.ai/api/v1",          │
│         "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"│
│       }                                                      │
│     ]                                                        │
│   },                                                         │
│   "security": {                                              │
│     "auth": {                                                │
│       "selectedType": "openai"                              │
│     }                                                        │
│   },                                                         │
│   "model": {                                                 │
│     "name": "qwen/qwen3-coder"                              │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Enter для сохранения, Esc для возврата                       │
└──────────────────────────────────────────────────────────────┘
```

Пример для Anthropic-совместимого:

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1": "sk-••••"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-sonnet-4-5",
        "name": "claude-sonnet-4-5",
        "baseUrl": "https://api.anthropic.com/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "anthropic"
    }
  },
  "model": {
    "name": "claude-sonnet-4-5"
  }
}
```
Отображаемый JSON должен:

- Использовать выбранный протокол в качестве ключа `modelProviders`.
- Использовать выбранный протокол как `security.auth.selectedType`.
- Использовать фактически сгенерированный `envKey`.
- Маскировать API-ключ.
- Использовать введённый пользователем `baseUrl`.
- Использовать `id === name` для каждой модели.
- Показывать `model.name`, установленный в первый нормализованный идентификатор модели.

Если JSON слишком широк для текущего терминала, перенос строк допустим. Цель — прозрачность, а не идеальное форматирование для копирования.

### Шаг 6: Сохранение и аутентификация

При нажатии Enter на экране проверки:

```text
save:
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...new custom configs using generatedEnvKey,
    ...existing configs whose envKey !== generatedEnvKey
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

Сообщение об успехе:

```text
Custom API Key authenticated successfully. Settings updated with generated env key and model provider config.
Tip: Use /model to switch between configured models.
```

Сообщение об ошибке должно сохранять существующий шаблон ошибки аутентификации, по возможности с дополнительными подсказками для пользователя:

```text
Failed to authenticate. Message: <error>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## Генерация env-ключа

Мастер не должен просить пользователя вводить `envKey`.

API-ключи, управляемые Qwen, хранятся в `settings.json.env`, поэтому env-ключ должен генерироваться автоматически в пространстве имён Qwen. Это предотвращает коллизии с переменными окружения, управляемыми пользователем, и не даёт нескольким собственным конечным точкам перезаписывать друг друга.

### Формат

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Включение протокола предотвращает коллизии, когда одна и та же конечная точка используется с разными адаптерами протоколов.

### Примеры

```text
Protocol: openai
Base URL: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protocol: openai
Base URL: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protocol: anthropic
Base URL: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protocol: gemini
Base URL: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protocol: openai
Base URL: http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### Правило нормализации

```text
protocol
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _

baseUrl
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _
  -> collapse consecutive _ characters
  -> remove leading/trailing _

return QWEN_CUSTOM_API_KEY_${NORMALIZED_PROTOCOL}_${NORMALIZED_BASE_URL}
```

Псевдокод:

```ts
function generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string {
  const normalize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

  return `QWEN_CUSTOM_API_KEY_${normalize(protocol)}_${normalize(baseUrl)}`;
}
```

## Проектирование записи настроек

Даны входные данные пользователя:

```text
Protocol: openai
Base URL: https://openrouter.ai/api/v1
API key: sk-or-v1-xxx
Model IDs: qwen/qwen3-coder,openai/gpt-4.1
```

Мастер должен создать:

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1": "sk-or-v1-xxx"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen/qwen3-coder",
        "name": "qwen/qwen3-coder",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      },
      {
        "id": "openai/gpt-4.1",
        "name": "openai/gpt-4.1",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen/qwen3-coder"
  }
}
```

Для `anthropic` используется та же структура, за исключением:

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

Для `gemini` используется та же структура, за исключением:

```text
modelProviders.gemini
security.auth.selectedType = gemini
refreshAuth(gemini)
```

### Область сохранения

Используется та же стратегия области сохранения, что и при выборе модели, и в существующих потоках API-ключей:

```text
getPersistScopeForModelSelection(settings)
```

Это обеспечивает согласованность поведения с существующими правилами владения `modelProviders`.

### Резервное копирование

Перед записью создаётся резервная копия целевого файла настроек, как в существующих потоках Coding Plan и ModelStudio Standard.

### Синхронизация переменной окружения процесса

После записи `settings.json.env[generatedEnvKey]` немедленно выполняется синхронизация:

```text
process.env[generatedEnvKey] = apiKey
```

Это гарантирует, что `refreshAuth(selectedProtocol)` сможет использовать только что введённый ключ в той же сессии.
### Правило слияния провайдеров моделей

Для сгенерированного ключа окружения:

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Обновить `modelProviders[selectedProtocol]` следующим образом:

```text
newConfigs = normalizedModelIds.map(modelId => ({
  id: modelId,
  name: modelId,
  baseUrl,
  envKey: generatedEnvKey,
}))

existingConfigs = settings.merged.modelProviders?.[selectedProtocol] ?? []

preservedConfigs = existingConfigs.filter(config =>
  config.envKey !== generatedEnvKey
)

updatedConfigs = [
  ...newConfigs,
  ...preservedConfigs,
]
```

Обоснование:

- Перенастройка того же протокола + `baseUrl` заменяет старые модели для этой конечной точки.
- Настройка другого протокола или `baseUrl` использует другой ключ окружения и не перезаписывает предыдущие пользовательские конечные точки.
- Coding Plan, ModelStudio Standard и другие конфигурации пользователя сохраняются, если только они не используют тот же сгенерированный ключ окружения в рамках того же протокола.
- Новые конфигурации размещаются первыми, чтобы только что настроенные модели были сразу видны и выбраны по умолчанию.

## Обработка ошибок

### Ошибка проверки протокола

Протокол должен быть одним из:

```text
openai
anthropic
gemini
```

### Ошибка проверки базового URL

```text
Base URL не может быть пустым.
```

```text
Base URL должен начинаться с http:// или https://.
```

### Ошибка проверки API-ключа

```text
API-ключ не может быть пустым.
```

### Ошибка проверки идентификаторов моделей

```text
Идентификаторы моделей не могут быть пустыми.
```

### Ошибка аутентификации

Используйте существующий механизм обработки ошибок, но сообщение для пользователя должно помочь ему исправить ситуацию:

```text
Не удалось выполнить аутентификацию. Сообщение: <message>

Проверьте:
- Base URL совместим с выбранным протоколом
- API-ключ действителен для этой конечной точки
- Идентификатор модели существует для этого провайдера
```

## Ссылка на документацию

Мастер должен по-прежнему предоставлять ссылку на существующую документацию по провайдерам моделей для продвинутых пользователей.

Рекомендуемое размещение:

- В нижнем колонтитуле экрана просмотра, или
- В качестве дополнительного текста на экране базового URL.

Предлагаемый текст:

```text
Нужны продвинутые настройки generationConfig или возможности? См.:
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## Примечания по реализации

Ожидаемые уровни представления `AuthDialog`:

```ts
type ViewLevel =
  | 'main'
  | 'region-select'
  | 'api-key-input'
  | 'api-key-type-select'
  | 'alibaba-standard-region-select'
  | 'alibaba-standard-api-key-input'
  | 'alibaba-standard-model-id-input'
  | 'custom-protocol-select'
  | 'custom-base-url-input'
  | 'custom-api-key-input'
  | 'custom-model-id-input'
  | 'custom-review-json';
```

Ожидаемый тип пользовательского протокола:

```ts
type CustomApiProtocol =
  | AuthType.USE_OPENAI
  | AuthType.USE_ANTHROPIC
  | AuthType.USE_GEMINI;
```

Ожидаемые новые состояния в `AuthDialog`:

```ts
const [customProtocol, setCustomProtocol] = useState<CustomApiProtocol>(
  AuthType.USE_OPENAI,
);
const [customProtocolIndex, setCustomProtocolIndex] = useState<number>(0);
const [customBaseUrl, setCustomBaseUrl] = useState('');
const [customBaseUrlError, setCustomBaseUrlError] = useState<string | null>(
  null,
);
const [customApiKey, setCustomApiKey] = useState('');
const [customApiKeyError, setCustomApiKeyError] = useState<string | null>(null);
const [customModelIds, setCustomModelIds] = useState('');
const [customModelIdsError, setCustomModelIdsError] = useState<string | null>(
  null,
);
```

Ожидаемое новое действие пользовательского интерфейса:

```ts
handleCustomApiKeySubmit: (
  protocol: CustomApiProtocol,
  baseUrl: string,
  apiKey: string,
  modelIdsInput: string,
) => Promise<void>;
```

Ожидаемые вспомогательные функции:

```ts
generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string
normalizeCustomModelIds(modelIdsInput: string): string[]
maskApiKey(apiKey: string): string
```

## Критерии приёмки

### UX

- Выбор `/auth -> API Key -> Custom API Key` открывает пользовательский мастер вместо страницы только с документацией.
- Первый шаг мастера запрашивает протокол.
- Второй шаг запрашивает базовый URL и отображает выбранный протокол.
- Третий шаг запрашивает API-ключ и отображает выбранный протокол и конечную точку.
- Четвёртый шаг запрашивает идентификаторы моделей и отображает выбранный протокол и конечную точку.
- На шаге просмотра отображается сгенерированный JSON, включая замаскированный API-ключ, выбранный протокол и сгенерированный ключ окружения.
- Нажатие Enter на шаге просмотра сохраняет настройки и пытается выполнить аутентификацию.
- Нажатие Esc возвращает на один шаг назад.

### Настройки

- API-ключ записывается в `settings.json.env[generatedEnvKey]`.
- `generatedEnvKey` формируется на основе выбранного протокола и `baseUrl` с использованием приватного пространства имён Qwen.
- `modelProviders[selectedProtocol]` получает одну запись на каждый нормализованный идентификатор модели.
- Каждая запись пользовательской модели использует `id === name`.
- `security.auth.selectedType` устанавливается в выбранный протокол.
- `model.name` устанавливается в первый нормализованный идентификатор модели.
- Существующие записи в `modelProviders[selectedProtocol]` с другим `envKey` сохраняются.
- Существующие записи в `modelProviders[selectedProtocol]` с тем же сгенерированным `envKey` заменяются.
- Записи в других ключах протокола `modelProviders` сохраняются.
### Аутентификация

- Сгенерированный ключ окружения синхронизируется с `process.env` до обновления аутентификации.
- Приложение перезагружает конфигурацию провайдера модели перед вызовом `refreshAuth(selectedProtocol)`.
- Успешная аутентификация закрывает диалог аутентификации и показывает сообщение об успехе.
- Неудачная аутентификация оставляет пользователя в процессе аутентификации и показывает понятное сообщение об ошибке.

### Тесты

- Добавьте или обновите тесты для `AuthDialog`, чтобы они покрывали путь пользовательского мастера.
- Добавьте тесты для выбора протокола.
- Добавьте тесты для генерации ключа окружения на основе протокола и базового URL.
- Добавьте тесты для нормализации и дедупликации идентификаторов моделей.
- Добавьте тесты для поведения слияния настроек:
  - один и тот же сгенерированный ключ окружения заменяет старые пользовательские записи в рамках того же протокола;
  - разные ключи окружения сохраняются;
  - ключи окружения других протоколов сохраняются;
  - записи Coding Plan и ModelStudio Standard сохраняются.
- Добавьте тесты для предварительного просмотра сгенерированного JSON там, где это целесообразно.

## Открытые вопросы

1. Должен ли ввод ключа API маскироваться во время ввода или только на экране проверки?
2. Должны ли локальные конечные точки, такие как `http://localhost:11434/v1`, допускать пустые или заполнительные ключи API для серверов, не требующих аутентификации?
3. Должен ли предварительный просмотр сгенерированного JSON показывать только применяемый патч или полное результирующее поддерево настроек после слияния?
4. Должен ли Vertex AI быть включён в этот мастер пользовательских ключей API или оставаться за его пределами, поскольку его настройка аутентификации отличается от простых поставщиков ключей API?

Для первой версии рекомендуемые значения по умолчанию:

- Поддержка `openai`, `anthropic` и `gemini`.
- Использовать существующее поведение ввода во время набора.
- Требовать непустой ключ API для согласованности с потоками аутентификации по ключу API.
- Показывать JSON в стиле патча, который будет сохранён или обновлён.
- Оставить Vertex AI вне мастера пользовательских ключей API до отдельного программного решения.
