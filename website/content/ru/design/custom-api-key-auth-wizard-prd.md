# PRD: Мастер настройки Custom API Key Auth

## Краткое описание

Улучшить процесс `/auth -> API Key -> Custom API Key`, заменив текущий информационный экран на мастер настройки в терминале для кастомных API-провайдеров.

Qwen Code поддерживает несколько протоколов API через ключи `authType` / `modelProviders`, включая `openai`, `anthropic` и `gemini`. Поэтому мастер настройки должен начинаться с выбора протокола, затем собирать endpoint, ключ и информацию о моделях для этого протокола.

Мастер проводит пользователя через:

```text
Выбор протокола -> Ввод Base URL -> Ввод API Key -> Ввод Model IDs -> Просмотр JSON -> Сохранение + аутентификация
```

Это удерживает настройку кастомного API-ключа внутри Qwen Code, уменьшает необходимость вручную редактировать `settings.json` и делает итоговую конфигурацию прозрачной, показывая сгенерированный JSON перед сохранением.

## Предыстория

Сейчас выбор `Custom API Key` в `/auth` показывает статический информационный экран:

```text
Custom Configuration

You can configure your API key and models in settings.json

Refer to the documentation for setup instructions
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

Esc to go back
```

Это требует от пользователя выйти из CLI, прочитать документацию, разобраться с `settings.json`, вручную настроить `modelProviders`, выбрать `envKey`, добавить API-ключи, а затем вернуться в Qwen Code. Пользователи сообщают, что этот процесс сложен и оторван от остального опыта работы с `/auth`.

Текущий путь с API-ключом ModelStudio Standard уже предлагает пошаговую настройку:

```text
Alibaba Cloud ModelStudio Standard API Key
└─ Выбор региона
   └─ Ввод API Key
      └─ Ввод Model IDs
         └─ Сохранение + аутентификация
```

Настройка кастомного API-ключа должна предлагать аналогичный пошаговый опыт, учитывая при этом, что Qwen Code поддерживает несколько протоколов провайдеров.

## Описание проблемы

Путь кастомного API-ключ сейчас является тупиком внутри `/auth`:

```text
/auth
└─ Выбор способа аутентификации
   ├─ Alibaba Cloud Coding Plan
   ├─ API Key
   │  └─ Выбор типа API Key
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Выбор региона
   │     │  ├─ Ввод API Key
   │     │  ├─ Ввод Model IDs
   │     │  └─ Сохранение + аутентификация
   │     │
   │     └─ Custom API Key
   │        └─ Информационный экран (только документация)
   │
   └─ Qwen OAuth
```

Это вызывает несколько проблем с юзабилити:

- Пользователи не могут завершить настройку кастомного провайдера из `/auth`.
- Пользователям нужно понимать низкоуровневые концепции настроек, прежде чем они смогут аутентифицироваться.
- Пользователи могут не знать, какие поля обязательны: `authType`, `baseUrl`, `envKey`, `modelProviders`, `model.name` и `security.auth.selectedType`.
- Пользователи могут случайно создать конфликт с существующими переменными окружения или перезаписать существующую конфигурацию провайдера.
- Пользователи не получают немедленной обратной связи об аутентификации после ручного редактирования настроек.

## Цели

1. Позволить пользователям настраивать кастомный API-провайдер полностью внутри `/auth`.
2. Поддерживать основные протоколы, которые Qwen Code поддерживает в `modelProviders`: `openai`, `anthropic` и `gemini`.
3. Сделать процесс максимально близким к существующему потоку ModelStudio Standard.
4. Считать `baseUrl` эквивалентом выбора региона для кастомного провайдера.
5. Автоматически генерировать управляемый Qwen приватный `envKey` на основе выбранного протокола и введённого `baseUrl`.
6. Сохранять API-ключ в `settings.json.env`, в соответствии с текущим шаблоном управления учётными данными Qwen.
7. Избегать конфликтов с переменными окружения пользователя, используя сгенерированное имя ключа в пространстве имён Qwen.
8. Показывать сгенерированный JSON перед сохранением, чтобы пользователи могли проверить точные изменения в настройках.
9. Сохранять существующие записи `modelProviders`, не связанные с новым ключом.
10. Выполнять аутентификацию сразу после сохранения и показывать обратную связь об успехе или неудаче.

## Не-цели

1. Не требовать от пользователей вручную вводить `envKey`.
2. Не вводить имя провайдера как отдельную концепцию.
3. Не добавлять в мастер расширенные настройки `generationConfig`, `capabilities` или переопределения для отдельных моделей.
4. Не удалять ссылку на документацию полностью; она должна оставаться доступной для расширенной настройки.
5. Не менять существующие процессы Coding Plan или ModelStudio Standard API Key.
6. Не пытаться автоматически определять протокол из `baseUrl` в первой версии; пользователи выбирают протокол явно.

## Целевые пользователи

- Пользователи, которые приносят свой собственный кастомный API-эндпоинт.
- Пользователи, настраивающие провайдеров, таких как OpenAI-совместимые API, Anthropic-совместимые API, Gemini-совместимые API, vLLM, Ollama, LM Studio или внутренние шлюзы.
- Пользователи, предпочитающие настраивать аутентификацию из CLI, а не редактировать `settings.json` вручную.

## Поддерживаемые протоколы

Мастер изначально должен предлагать следующие варианты протоколов:

```text
openai
anthropic
gemini
```

Каждый протокол напрямую сопоставляется с ключом `modelProviders` и значением `security.auth.selectedType`.

| Вариант протокола       | Ключ Auth type / modelProviders | Примечания                                                                 |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| OpenAI-совместимые      | `openai`                        | OpenAI, OpenRouter, Fireworks, локальные OpenAI-совместимые серверы, внутренние шлюзы |
| Anthropic-совместимые   | `anthropic`                     | Anthropic-совместимые эндпоинты                                            |
| Gemini-совместимые      | `gemini`                        | Gemini-совместимые эндпоинты                                               |

## Обзор пользовательского опыта

### Обновлённое дерево `/auth`

```text
/auth
└─ Выбор способа аутентификации
   ├─ Alibaba Cloud Coding Plan
   │  └─ Выбор региона
   │     └─ Ввод API Key
   │        └─ Сохранение + аутентификация
   │
   ├─ API Key
   │  └─ Выбор типа API Key
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Выбор региона
   │     │  ├─ Ввод API Key
   │     │  ├─ Ввод Model IDs
   │     │  └─ Сохранение + аутентификация
   │     │
   │     └─ Custom API Key
   │        ├─ Выбор протокола
   │        ├─ Ввод Base URL
   │        ├─ Ввод API Key
   │        ├─ Ввод Model IDs
   │        ├─ Просмотр сгенерированного JSON
   │        └─ Сохранение + аутентификация
   │
   └─ Qwen OAuth
```

### Конечный автомат Custom API Key

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
      │ generate envKey из protocol + baseUrl
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

## Детальный дизайн взаимодействия

### Шаг 1: Выбор протокола

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Выбор протокола                             │
│                                                              │
│  ◉ OpenAI-совместимые                                        │
│    OpenAI, OpenRouter, Fireworks, vLLM, Ollama, LM Studio    │
│                                                              │
│  ○ Anthropic-совместимые                                      │
│    Anthropic-совместимые эндпоинты                            │
│                                                              │
│  ○ Gemini-совместимые                                         │
│    Gemini-совместимые эндпоинты                               │
│                                                              │
│ Enter для выбора, ↑↓ для навигации, Esc для возврата          │
└──────────────────────────────────────────────────────────────┘
```

Выбранный протокол определяет:

- Ключ `modelProviders`, который будет обновлён.
- Значение `security.auth.selectedType`, которое будет сохранено.
- Метку протокола, отображаемую на последующих экранах.
- Тип аутентификации `refreshAuth()`, используемый после сохранения.

### Шаг 2: Ввод Base URL

`baseUrl` — это эквивалент выбора региона для кастомного провайдера. Он должен быть перед вводом API-ключа, потому что определяет, к какому эндпоинту относится ключ.

Для OpenAI-совместимых:

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Протокол: OpenAI-совместимые                                 │
│                                                              │
│ Введите эндпоинт API, совместимый с OpenAI.                   │
│                                                              │
│ Base URL: https://openrouter.ai/api/v1_                      │
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

Для Anthropic-совместимых:

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Протокол: Anthropic-совместимые                              │
│                                                              │
│ Введите эндпоинт API, совместимый с Anthropic.                │
│                                                              │
│ Base URL: https://api.anthropic.com/v1_                      │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```

Для Gemini-совместимых:

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Протокол: Gemini-совместимые                                 │
│                                                              │
│ Введите эндпоинт API, совместимый с Gemini.                   │
│                                                              │
│ Base URL: https://generativelanguage.googleapis.com_         │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```

Валидация:

- Обязательное поле.
- Должно начинаться с `http://` или `https://`.
- Убрать начальные и конечные пробелы.
- Сохранить нормализованную строку как есть, за исключением обрезки.

При успешной отправке:

- Сгенерировать управляемый Qwen `envKey` на основе выбранного протокола и `baseUrl`.
- Перейти к вводу API-ключа.

### Шаг 3: Ввод API Key

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · API Key                                     │
│                                                              │
│ Протокол: OpenAI-совместимые                                 │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Введите API-ключ для этого эндпоинта.                         │
│                                                              │
│ API key: sk-or-v1-••••••••••••••••_                          │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```

Валидация:

- Обязательное поле.
- Убрать начальные и конечные пробелы.

Примечания:

- Поле ввода изначально может использовать существующее поведение текстового ввода для согласованности с соседними потоками.
- На экране просмотра API-ключ должен быть замаскирован.

### Шаг 4: Ввод Model IDs

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Model IDs                                   │
│                                                              │
│ Протокол: OpenAI-совместимые                                 │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Введите один или несколько ID моделей, разделённых запятыми.  │
│                                                              │
│ Model IDs: qwen/qwen3-coder,openai/gpt-4.1_                  │
│                                                              │
│ Enter для продолжения, Esc для возврата                      │
└──────────────────────────────────────────────────────────────┘
```

Валидация:

- Обязательное поле.
- Разделить по запятой.
- Обрезать каждый ID модели.
- Удалить пустые записи.
- Удалить дубликаты, сохраняя порядок.
- Должен остаться хотя бы один ID модели.

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

### Шаг 5: Просмотр JSON

Перед сохранением показать сгенерированный фрагмент JSON, который будет записан или объединён с `settings.json`.

Пример для OpenAI-совместимых:

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Просмотр                                    │
│                                                              │
│ Следующий JSON будет сохранён в settings.json:                │
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
│ Enter для сохранения, Esc для возврата                        │
└──────────────────────────────────────────────────────────────┘
```

Пример для Anthropic-совместимых:

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

- Использовать выбранный протокол как ключ `modelProviders`.
- Использовать выбранный протокол как `security.auth.selectedType`.
- Использовать фактически сгенерированный `envKey`.
- Маскировать API-ключ.
- Использовать введённый пользователем `baseUrl`.
- Использовать `id === name` для каждой модели.
- Показывать `model.name`, установленный в первый нормализованный ID модели.

Если JSON слишком широк для текущего терминала, допустим перенос строк. Цель — прозрачность, а не идеальное форматирование для копирования.

### Шаг 6: Сохранение и аутентификация

При нажатии Enter на экране просмотра:

```text
save:
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...новая кастомная конфигурация с generatedEnvKey,
    ...существующие конфигурации, у которых envKey !== generatedEnvKey
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

Сообщение об успехе:

```text
Custom API Key аутентифицирован успешно. Настройки обновлены с сгенерированным env key и конфигурацией провайдера моделей.
Подсказка: используйте /model для переключения между настроенными моделями.
```

Сообщение об ошибке должно повторять существующий шаблон ошибок аутентификации, с дополнительными подсказками для пользователя, если возможно:

```text
Не удалось аутентифицироваться. Сообщение: <error>

Пожалуйста, проверьте:
- Base URL совместим с выбранным протоколом
- API-ключ действителен для этого эндпоинта
- ID модели существует у этого провайдера
```

## Генерация ключа окружения (envKey)

Мастер не должен запрашивать у пользователя ввод `envKey`.

Управляемые Qwen API-ключи хранятся в `settings.json.env`, поэтому ключ окружения должен генерироваться автоматически в пространстве имён Qwen. Это позволяет избежать коллизий с управляемыми пользователем переменными окружения оболочки и предотвращает перезапись нескольких кастомных эндпоинтов.

### Формат

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Включение протокола позволяет избежать коллизий, когда один и тот же эндпоинт используется с разными адаптерами протоколов.

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
  -> обрезать
  -> перевести в верхний регистр
  -> заменить все символы, не являющиеся A-Z / 0-9, на _

baseUrl
  -> обрезать
  -> перевести в верхний регистр
  -> заменить все символы, не являющиеся A-Z / 0-9, на _
  -> схлопнуть последовательные символы _
  -> удалить начальные/конечные _

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

Данные, введённые пользователем:

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

Используйте ту же стратегию области сохранения, что и для выбора модели и существующих потоков API-ключей:

```text
getPersistScopeForModelSelection(settings)
```

Это обеспечивает согласованность с существующими правилами владения `modelProviders`.

### Резервное копирование

Перед записью создайте резервную копию целевого файла настроек — как в существующих потоках Coding Plan и ModelStudio Standard.

### Синхронизация с process.env

После записи `settings.json.env[generatedEnvKey]` немедленно синхронизируйте:

```text
process.env[generatedEnvKey] = apiKey
```

Это гарантирует, что `refreshAuth(selectedProtocol)` сможет использовать только что введённый ключ в той же сессии.

### Правило слияния провайдеров моделей

Для сгенерированного ключа окружения:

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Обновите `modelProviders[selectedProtocol]` следующим образом:

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
- Конфигурации Coding Plan, ModelStudio Standard и других пользовательских настроек сохраняются, если они не используют тот же сгенерированный ключ окружения в рамках того же протокола.
- Новые конфигурации размещаются первыми, чтобы только что настроенные модели были сразу видны и выбраны по умолчанию.

## Обработка ошибок

### Ошибка валидации протокола

Протокол должен быть одним из:

```text
openai
anthropic
gemini
```

### Ошибка валидации базового URL

```text
Base URL cannot be empty.
```

```text
Base URL must start with http:// or https://.
```

### Ошибка валидации API-ключа

```text
API key cannot be empty.
```

### Ошибка валидации идентификаторов моделей

```text
Model IDs cannot be empty.
```

### Ошибка аутентификации

Используйте существующий механизм ошибок, где это возможно, но сообщение для пользователя должно помочь ему исправить ситуацию:

```text
Failed to authenticate. Message: <message>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## Ссылка на документацию

Мастер по-прежнему должен предоставлять доступ к существующей документации провайдеров моделей для опытных пользователей.

Рекомендуемое расположение:

- В нижнем колонтитуле экрана сводки, или
- Как дополнительный текст на экране ввода базового URL.

Предлагаемый текст:

```text
Need advanced generationConfig or capabilities? See:
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## Примечания по реализации

Ожидаемые уровни отображения `AuthDialog`:

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

Ожидаемое новое состояние в `AuthDialog`:

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

Ожидаемое новое действие UI:

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

## Критерии приемки

### UX

- Выбор `/auth -> API Key -> Custom API Key` открывает мастер настройки пользовательского API-ключа вместо страницы с документацией.
- Первый шаг мастера запрашивает протокол.
- Второй шаг запрашивает базовый URL и отображает выбранный протокол.
- Третий шаг запрашивает API-ключ и отображает выбранный протокол и конечную точку.
- Четвёртый шаг запрашивает идентификаторы моделей и отображает выбранный протокол и конечную точку.
- Экран сводки отображает сгенерированный JSON, включая маскированный API-ключ, выбранный протокол и сгенерированный ключ окружения.
- Нажатие Enter на экране сводки сохраняет настройки и пытается выполнить аутентификацию.
- Нажатие Esc пошагово возвращает на один шаг назад.

### Настройки

- API-ключ записывается в `settings.json.env[generatedEnvKey]`.
- `generatedEnvKey` формируется из выбранного протокола и `baseUrl` с использованием приватного пространства имён Qwen.
- `modelProviders[selectedProtocol]` получает одну запись на каждый нормализованный идентификатор модели.
- Каждая запись пользовательской модели использует `id === name`.
- `security.auth.selectedType` устанавливается в выбранный протокол.
- `model.name` устанавливается в первый нормализованный идентификатор модели.
- Существующие записи в `modelProviders[selectedProtocol]` с другим `envKey` сохраняются.
- Существующие записи в `modelProviders[selectedProtocol]` с тем же сгенерированным `envKey` заменяются.
- Записи в других ключах протокола `modelProviders` сохраняются.

### Аутентификация

- Сгенерированный ключ окружения синхронизируется с `process.env` перед обновлением аутентификации.
- Приложение перезагружает конфигурацию провайдера модели перед `refreshAuth(selectedProtocol)`.
- Успешная аутентификация закрывает диалог аутентификации и показывает сообщение об успехе.
- Неудачная аутентификация оставляет пользователя в потоке аутентификации и показывает сообщение с описанием действия.

### Тесты

- Добавьте или обновите тесты `AuthDialog`, чтобы охватить путь мастера.
- Добавьте тесты для выбора протокола.
- Добавьте тесты для генерации ключа окружения из протокола и базового URL.
- Добавьте тесты для нормализации и дедупликации идентификаторов моделей.
- Добавьте тесты для поведения слияния настроек:
  - один и тот же сгенерированный ключ окружения заменяет старые пользовательские записи в том же протоколе;
  - разные ключи окружения сохраняются;
  - другие ключи протоколов сохраняются;
  - записи Coding Plan и ModelStudio Standard сохраняются.
- Добавьте тесты для предварительного просмотра сгенерированного JSON, где это практически возможно.

## Открытые вопросы

1. Должен ли API-ключ маскироваться во время ввода или только на экране сводки?
2. Следует ли разрешить пустые или заполнительные API-ключи для локальных конечных точек, таких как `http://localhost:11434/v1`, для серверов, не требующих аутентификации?
3. Должен ли предварительный просмотр сгенерированного JSON показывать только применяемый патч или итоговое полное поддерево настроек после слияния?
4. Следует ли включить Vertex AI в этот мастер пользовательского API-ключа или оставить за его пределами, поскольку настройка аутентификации для него отличается от простых провайдеров API-ключей?

Для первой версии рекомендуются следующие значения по умолчанию:

- Поддержка `openai`, `anthropic` и `gemini`.
- Использование существующего поведения ввода во время набора.
- Требование непустого API-ключа для согласованности с потоками аутентификации по API-ключам.
- Отображение JSON в стиле патча, который будет сохранён или обновлён.
- Исключение Vertex AI из мастера пользовательского API-ключа до отдельного продуктового решения.