# Аутентификация

Меню `/auth` при первом запуске Qwen Code содержит пять основных опций. Выберите ту, которая соответствует вашему способу запуска CLI:

- [**Qwen Account с подпиской**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli): войдите в свою учетную запись Qwen через **Qwen OAuth**, чтобы получить доступ к **Qwen Code и Agent** с вашей **подпиской Plus или Pro** на [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli). Если у вас еще нет подписки, посетите [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli), чтобы оформить подписку Plus или Pro, затем вернитесь в Qwen Code и выберите [**Qwen Account с подпиской**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).
- **QwenCloud**: официально рекомендуемая настройка. Открывает подменю с **Token Plan** (подписка с ежемесячной квотой кредитов · выделенная конечная точка, редакции Personal и Team) или **Standard API Key** (оплата по мере использования). Затем вы явно выбираете платформу — **China — Qianwen AI Platform** или **International — QwenCloud** — так что язык интерфейса никогда не определяет вашу конечную точку. Оба способа доступа также включают встроенный инструмент [`web_search`](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) без дополнительной настройки.
- **Alibaba ModelStudio**: открывает подменю с **Coding Plan** (для индивидуальных разработчиков · включена недельная квота), **Token Plan** (для команд и компаний · тарификация по использованию с выделенной конечной точкой) или **Standard API Key** (подключение с существующим ключом API ModelStudio). Token Plan и Standard API Key также включают встроенный инструмент [`web_search`](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) без дополнительной настройки. Сохраненные учетные данные, конечные точки и модели ModelStudio продолжают работать без изменений.
- **Third-party Providers**: выберите встроенного провайдера и подключитесь с помощью API-ключа (DeepSeek, Grok, MiniMax, Z.AI, Kimi, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: вручную подключите локальный сервер, прокси или неподдерживаемого провайдера — поддерживаются OpenAI, Anthropic, Gemini и другие совместимые эндпоинты.

## **Вариант 1: Qwen OAuth —** [**Qwen Account с подпиской**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)

Qwen OAuth позволяет войти в свою учетную запись Qwen и использовать вашу **подписку Plus или Pro** с [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) для доступа к **Qwen Code и Agent**. В меню первого запуска или в диалоге `/auth` выберите [**Qwen Account с подпиской**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli), чтобы начать.

- **Как это работает**: выберите [**Qwen Account с подпиской**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) и следуйте инструкциям по входу через браузер, чтобы авторизовать Qwen Code со своей учетной записью Qwen.
- **Требования**: учетная запись Qwen с активной **подпиской Plus или Pro** на [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) и доступ в интернет.
- **Преимущества**: доступ к **Qwen Code и Agent** через вашу подписку Qwen без ручной настройки ключа API.
- **Стоимость и квота**: использование зависит от вашего плана подписки. Посетите [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) для получения информации о планах Plus и Pro.

### **Интерактивная настройка**

1. Если у вас еще нет подписки, посетите [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) и оформите подписку **Plus или Pro**. Если у вас уже есть активная подписка, переходите к следующему шагу.
2. Запустите Qwen Code в терминале:

   ```bash
   qwen
   ```

3. В меню первого запуска выберите [**Qwen Account с подпиской**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli). Если Qwen Code уже запущен, введите `/auth`, чтобы открыть меню аутентификации, и выберите ту же опцию.
4. Завершите процесс входа и авторизации в браузере, используя **ту же учетную запись Qwen, которую вы использовали для оформления подписки на** [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).
5. Вернитесь в Qwen Code, чтобы начать работу с вашей подпиской.

Для неинтерактивных сред, где невозможно завершить процесс входа через браузер, таких как CI или контейнеры без сопровождения, используйте метод аутентификации на основе ключа API.

## ☁️ Вариант 2: QwenCloud

Официальный вход на платформу. Выбирайте его, если ваш ключ API получен от Qianwen AI Platform (Китай) или QwenCloud (Международная версия).

- **Как это работает**: выберите способ доступа, затем явно выберите платформу — язык интерфейса никогда не определяет вашу конечную точку. Введите ключ, выпущенный этой платформой, и Qwen Code настроит соответствующую конечную точку.
- **Способы доступа**: **Token Plan** (подписка с ежемесячной квотой кредитов на выделенной конечной точке; редакции Personal и Team) или **Standard API Key** (оплата по мере использования). Coding Plan _не_ предлагается здесь — это продукт Alibaba ModelStudio, см. Вариант 3.
- **Требования**: ключ Token Plan (с префиксом `sk-sp-`), сгенерированный в консоли Token Plan, или ключ оплаты по мере использования (с префиксом `sk-` или `sk-ws-`) со страницы ключей API платформы.
- **Преимущества**: оба способа доступа включают встроенный инструмент [`web_search`](../../developers/tools/web-search.md) без дополнительной настройки.

| Платформа                 | Способ доступа   | Конечная точка                                                | API-ключ                                                                                 |
| ------------------------- | ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Китай — Qianwen AI Platform        | Стандартный API-ключ | `https://maas.qianwenaiapi.com/compatible-mode/v1`            | [API-ключи](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) |
| Китай — Qianwen AI Platform        | Token Plan       | `https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1` | [Token Plan](https://platform.qianwenai.com/docs/token-plan/overview)                    |
| Международная версия — QwenCloud | Стандартный API-ключ | `https://maas.qwencloudapi.com/compatible-mode/v1`            | [API-ключи](https://docs.qwencloud.com/developer-guides/administration/api-keys)          |
| Международная версия — QwenCloud | Token Plan       | `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` | [Token Plan](https://docs.qwencloud.com/token-plan/overview)                             |

### Интерактивная настройка

Введите `qwen` в терминале, чтобы запустить Qwen Code, затем выполните команду `/auth`, выберите **QwenCloud** и укажите **Token Plan** или **Стандартный API-ключ** в подменю. Выберите платформу (**Китай — Qianwen AI Platform** или **Международная версия — QwenCloud**), затем введите свой API-ключ.

При запуске Qwen Code проверяет список моделей конечной точки с использованием сохраненного ключа; см. [Обновления встроенных провайдеров](#built-in-provider-updates).

### Настройка для headless-окружений или скриптов

Для CI, контейнеров или скриптов настройте платформу с помощью переменных окружения вместо интерактивного процесса `/auth`.

```bash
# Pay-as-you-go (Standard API Key), International
export QWENCLOUD_API_KEY="sk-your-api-key"
export OPENAI_BASE_URL="https://maas.qwencloudapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

```bash
# Token Plan, China
export QWENCLOUD_TOKEN_PLAN_API_KEY="sk-sp-your-api-key"
export OPENAI_BASE_URL="https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

### Альтернатива: настройка через `settings.json`

Если вы предпочитаете пропустить интерактивный процесс `/auth`, добавьте следующее в `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-max",
        "name": "qwen3.8-max (QwenCloud)",
        "baseUrl": "https://maas.qwencloudapi.com/compatible-mode/v1",
        "description": "qwen3.8-max from QwenCloud Standard API Key",
        "envKey": "QWENCLOUD_API_KEY"
      }
    ]
  },
  "env": {
    "QWENCLOUD_API_KEY": "sk-your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.8-max"
  }
}
```

> [!note]
>
> `capabilities` — это единственный идентификатор провайдера, который никогда не выводится из названия модели, поэтому вручную созданная запись разрешается без объявления логики вывода, а `/effort` предлагает общий список тарифов вместо курируемых `low` / `medium` / `xhigh` от QwenCloud. Используйте `/auth` для установки провайдера, если вам нужен курируемый набор.

Как и другие специфичные для провайдера ключи, `QWENCLOUD_API_KEY` и `QWENCLOUD_TOKEN_PLAN_API_KEY` вступают в силу только тогда, когда запись провайдера `settings.json` объявляет их как `envKey`; чтобы выбрать авторизацию, совместимую с OpenAI, только через переменные окружения, экспортируйте `OPENAI_API_KEY`.

> [!note]
>
> QwenCloud и Alibaba ModelStudio — это отдельные записи с разными ключами окружения и конечными точками. Выбор QwenCloud не перезаписывает и не удаляет сохраненные учетные данные, конечные точки или выбранные модели ModelStudio.

## 💳 Вариант 3: Alibaba Cloud Coding Plan [#-option-3-alibaba-cloud-coding-plan]

Используйте этот вариант, если вам нужны предсказуемые расходы, широкий выбор моделей и более высокие квоты использования.

- **Как это работает**: Оформите подписку на Coding Plan с фиксированной ежемесячной платой, затем настройте Qwen Code на использование выделенного эндпоинта и вашего API-ключа подписки.
- **Требования**: Получите активную подписку Coding Plan в [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) или [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), в зависимости от региона вашего аккаунта.
- **Преимущества**: широкий выбор моделей, более высокие квоты использования, предсказуемые ежемесячные расходы, доступ к широкому спектру моделей (Qwen, GLM, Kimi, Minimax и другим).
- **Стоимость и квоты**: См. документацию Aliyun ModelStudio Coding Plan [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Alibaba Cloud Coding Plan доступен в двух регионах:

| Регион                       | URL консоли                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Пекин) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (международная версия)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Интерактивная настройка

Введите `qwen` в терминале, чтобы запустить Qwen Code, затем выполните команду `/auth`, выберите **Alibaba ModelStudio** и выберите **Coding Plan** в подменю. Выберите ваш регион, затем введите ваш ключ `sk-sp-xxxxxxxxx`.

При запуске Qwen Code проверяет список моделей конечной точки с использованием сохраненного ключа; см. [Обновления встроенных провайдеров](#built-in-provider-updates).

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
> Coding Plan использует выделенный эндпоинт (`https://coding.dashscope.aliyuncs.com/v1`), который отличается от стандартного эндпоинта Dashscope. Убедитесь, что используете правильный `baseUrl`.

## 🪙 Вариант 4: Alibaba Cloud Token Plan

Используйте этот вариант, если ваша команда или компания предпочитает оплату по мере использования на выделенном эндпоинте ModelStudio.

- **Как это работает**: Оформите подписку на Token Plan в Alibaba Cloud ModelStudio, затем настройте Qwen Code на использование регионального эндпоинта Token Plan и вашего API-ключа. Вы оплачиваете фактическое использование токенов, а не фиксированную ежемесячную плату.
- **Требования**: Получите API-ключ Token Plan в [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) или [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model), в зависимости от региона вашего аккаунта.
- **Преимущества**: оплата по мере использования для команд и компаний, выделенные региональные эндпоинты, доступ к широкому спектру моделей (Qwen, DeepSeek, GLM, Kimi, Minimax и другим).
- **Стоимость и квоты**: См. документацию Alibaba Cloud ModelStudio Token Plan [Beijing](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model).

Token Plan доступен в двух регионах, каждый со своим выделенным эндпоинтом:

| Регион                    | Эндпоинт                                                                 | URL консоли                                                                                         |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Китай (Пекин)           | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`     | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing)                         |
| Сингапур (Международная версия) | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1) |

### Интерактивная настройка

Введите `qwen` в терминале, чтобы запустить Qwen Code, затем выполните команду `/auth`, выберите **Alibaba ModelStudio** и укажите **Token Plan** в подменю. Выберите регион (**Китай (Пекин)** или **Сингапур (Международная версия)**), затем введите свой API-ключ. После этого мастер покажет последний шаг (Шаг 3/3 · ID моделей), где вы выбираете настраиваемые ID моделей: там предлагаются модели, обслуживаемые вашей конечной точкой, и они применяются только при явном выборе. Ключи API Token Plan для ModelStudio не имеют требований к префиксу, в отличие от ключей Coding Plan, которые начинаются с `sk-sp-`, и отдельных ключей Token Plan для QwenCloud из Варианта 2, которые также начинаются с `sk-sp-`.

После аутентификации используйте команду `/model` для просмотра и переключения между моделями, настроенными для вашего Token Plan. Набор моделей со временем меняется, поэтому он намеренно не перечислен здесь; обнаружение моделей от эндпоинта происходит на этапе настройки `/auth` выше (список моделей эндпоинта предлагается там и должен быть выбран явно), а затем `/model` показывает модели, настроенные для вашего плана.

Qwen Code также проверяет список моделей конечной точки при запуске с использованием вашего сохраненного API-ключа, как описано в [Обновления встроенных провайдеров](#built-in-provider-updates).

### Настройка для headless-окружений или скриптов

Для CI, контейнеров или скриптов настройте Token Plan с помощью переменных окружения или `settings.json` вместо интерактивного процесса `/auth`.

```bash
export BAILIAN_TOKEN_PLAN_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.7-plus"
```

Используйте `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` для эндпоинта China (Beijing) или `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` для международного эндпоинта (Singapore). Замените `qwen3.7-plus` на любую модель, включенную в ваш план.

Обратите внимание, что `BAILIAN_TOKEN_PLAN_API_KEY` — это специфичный для провайдера ключ: он вступает в силу после создания записи провайдера в `settings.json` в следующем разделе, потому что эта запись объявляет его как `envKey`. Для выбора OpenAI-совместимой аутентификации только через переменные окружения экспортируйте `OPENAI_API_KEY` вместо этого — специфичные для провайдера ключи сами по себе не выбирают тип аутентификации.

### Альтернатива: настройка через `settings.json`

Если вы предпочитаете пропустить интерактивный процесс `/auth`, добавьте следующее в `~/.qwen/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "name": "qwen3.7-plus (Token Plan)",
        "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "description": "qwen3.7-plus from Alibaba Cloud Token Plan",
        "envKey": "BAILIAN_TOKEN_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_TOKEN_PLAN_API_KEY": "your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.7-plus"
  }
}
```

> [!note]
>
> Token Plan использует выделенные региональные эндпоинты (`*.maas.aliyuncs.com`), которые отличаются от стандартного эндпоинта DashScope. Убедитесь, что `baseUrl` соответствует региону вашей подписки.

## 🚀 Вариант 5: API-ключ (гибкий)

Используйте этот вариант, если хотите подключиться к сторонним провайдерам, таким как OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope, или к self-hosted эндпоинту. Поддерживается множество протоколов и провайдеров.

### Рекомендуется: настройка в одном файле через `settings.json` [#recommended-one-file-setup-via-settingsjson]

Самый простой способ начать работу с аутентификацией по API-ключу — поместить всё в один файл `~/.qwen/settings.json`. Вот полный, готовый к использованию пример:

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
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY` + `GOOGLE_MODEL` (устанавливает `GOOGLE_GENAI_USE_VERTEXAI=true`) или `GOOGLE_CLOUD_PROJECT` + `GOOGLE_MODEL` (беспарольная ADC); использует протокол `gemini` | Google Vertex AI                                                                                      |

#### Шаг 1: Настройка моделей и провайдеров в `~/.qwen/settings.json`

Определите, какие модели доступны для каждого протокола. Каждая запись модели требует как минимум `id`; `envKey` (имя переменной окружения, содержащей ваш API-ключ) необязателен, но рекомендуется — если он пропущен, используется ключ окружения по умолчанию для типа аутентификации (например, `OPENAI_API_KEY` для `openai`).

> [!important]
>
> Рекомендуется определять `modelProviders` в `~/.qwen/settings.json` в области пользователя, чтобы избежать конфликтов слияния между настройками проекта и пользователя.

Отредактируйте `~/.qwen/settings.json` (создайте его, если он не существует). Вы можете смешивать несколько протоколов в одном файле — вот пример с несколькими провайдерами, показывающий только раздел `modelProviders`:

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
> Не забудьте также установить `env`, `security.auth.selectedType` и `model.name` вместе с `modelProviders` — см. [полный пример выше](#recommended-one-file-setup-via-settingsjson) для справки.

**Поля `ModelConfig` (каждая запись внутри `modelProviders`):**

| Поле               | Обязательно | Описание                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Да      | ID модели, отправляемый в API (например, `gpt-4o`, `claude-sonnet-4-20250514`)                                                                               |
| `wireApi`          | Нет      | Формат запроса, совместимый с OpenAI: `chat-completions` или `responses`. Оставьте пустым, чтобы наследовать протокол провайдера.                                        |
| `name`             | Нет       | Отображаемое имя в селекторе `/model` (по умолчанию равно `id`)                                                                                             |
| `envKey`           | Нет       | Имя переменной окружения для API-ключа (например, `OPENAI_API_KEY`); необязательно/рекомендуется — по умолчанию используется ключ окружения типа аутентификации, если пропущено |
| `baseUrl`          | Нет       | Переопределение эндпоинта API (полезно для прокси или пользовательских эндпоинтов)                                                                                     |
| `generationConfig` | Нет       | Тонкая настройка `timeout`, `maxRetries`, `samplingParams` и т.д.                                                                                          |

> [!note]
>
> При использовании поля `env` в `settings.json` учетные данные хранятся в открытом виде. Для большей безопасности предпочитайте файлы `.env` или `export` в shell — см. [Шаг 2](#step-2-set-environment-variables).

Полную схему `modelProviders` и расширенные параметры, такие как `generationConfig`, `customHeaders` и `extra_body`, см. в [Model Providers Reference](./model-providers.md).

#### Шаг 2: Установка переменных окружения [#step-2-set-environment-variables]

Qwen Code считывает API-ключи из переменных окружения (указанных в `envKey` в конфигурации модели). Существует несколько способов их предоставления, перечисленных ниже от **наивысшего к наименьшему приоритету**:

**1. Окружение shell / `export` (наивысший приоритет)**

Установите напрямую в профиле вашего shell (`~/.zshrc`, `~/.bashrc` и т.д.) или инлайн перед запуском:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
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

Вы также можете определить API-ключи непосредственно в `~/.qwen/settings.json` под ключом `env`. Они загружаются как резервный вариант с **наименьшим приоритетом** — применяются только в том случае, если переменная еще не установлена системным окружением или файлами `.env`.

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
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## Обновления встроенных провайдеров [#built-in-provider-updates]

Установленные провайдеры со встроенным списком моделей могут предложить **Обновление встроенного провайдера**, когда выходит более новая предустановка.

QwenCloud (Token Plan и стандартный API-ключ) и Alibaba ModelStudio (Coding Plan, Token Plan и стандартный API-ключ) также проверяют `/models` при запуске. Эта проверка использует переменную API-ключа конкретного провайдера, сохраненную через `/auth` (например, `BAILIAN_TOKEN_PLAN_API_KEY`), включая значения из `settings.env`. Ключ, предоставленный только через флаг CLI, `OPENAI_API_KEY` или общие настройки аутентификации, не активирует эту проверку; общие ключи не передаются на эндпоинты других провайдеров.

Успешное обнаружение ограничивает обновление встроенными моделями, доступными для вашего ключа, сохраняя при этом модели, добавленные пользователем. Оно также может предложить обновление, когда набор доступных моделей меняется без выпуска новой предустановки, например, после смены тарифного плана. Само по себе обнаружение сохраняет выбранную модель; однако если вы переключитесь на другую, последующая проверка при запуске может предложить удалить прежнюю. Если фильтрация не оставляет ни одной встроенной модели для установки, существующая конфигурация провайдера сохраняется без запроса. Когда меняется только набор доступных моделей, обновление добавляет лишь те, что стали доступны недавно, поэтому модель, исключенная вами во время `/auth`, не будет возвращена обратно. Если никаких изменений не требуется, проверка фиксируется без вывода запроса.

Если обнаружение недоступно, завершается ошибкой или не совпадает ни с одной встроенной моделью, обновление предустановки использует полный встроенный список; уже актуальная установка остается без изменений. Провайдеры без поддержки обнаружения продолжают использовать встроенный список.

**Позже** откладывает повторный запрос об этой же версии или наборе моделей на 24 часа; другое изменение все еще может вызвать запрос. Обновление, пропуск или молчаливая фиксация более нового решения сбрасывают предыдущую отсрочку. **Пропустить** сохраняет вашу конфигурацию, включая оставшиеся модели: пропущенная версия предустановки не предлагается снова до выхода более новой, а пропущенный набор доступных моделей не предлагается снова до его изменения.

## Удаленная CLI-команда `qwen auth`

Отдельная CLI-команда `qwen auth` была удалена. Вместо нее используйте следующие замены:

| Предыдущий вариант использования                | Замена                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Интерактивная настройка аутентификации | Запустите `qwen`, затем используйте `/auth`                                                                |
| Настройка Coding Plan                | Используйте `/auth` или установите `BAILIAN_CODING_PLAN_API_KEY` с базовым URL Coding Plan               |
| Настройка Token Plan                 | Используйте `/auth` или установите `BAILIAN_TOKEN_PLAN_API_KEY` с базовым URL Token Plan для вашего региона |
| Настройка OpenRouter                 | Используйте `/auth` или установите `OPENROUTER_API_KEY` и `OPENAI_BASE_URL=https://openrouter.ai/api/v1`   |
| Настройка Requesty                   | Используйте `/auth` или установите `REQUESTY_API_KEY` и `OPENAI_BASE_URL=https://router.requesty.ai/v1`  |
| Настройка API-ключа или пользовательского провайдера | Настройте `~/.qwen/settings.json`, `.env` или специфичные для провайдера переменные окружения       |
| Проверка текущей аутентификации     | Запустите `/doctor` внутри Qwen Code                                                              |
| Процесс OAuth в браузере               | Запустите `qwen` интерактивно и используйте `/auth`; OAuth нельзя настроить только с помощью переменных окружения    |

Устаревшие вызовы, такие как `qwen auth status`, теперь выводят уведомление об удалении с кратким описанием этих путей миграции, включая запись Token Plan с базовыми URL для обоих регионов.

## Примечания по безопасности [#security-notes]

- Не коммитьте API-ключи в систему контроля версий.
- Предпочитайте `.qwen/.env` для секретов на уровне проекта (и держите его вне git).
- Считайте вывод терминала конфиденциальным, если он отображает учетные данные для проверки.
