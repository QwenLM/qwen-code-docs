# GitHub Actions: qwen-code-action

## Обзор

`qwen-code-action` — это GitHub Action, который интегрирует [Qwen Code] в ваш процесс разработки через [Qwen Code CLI]. Он работает как автономный агент для выполнения важных рутинных задач по написанию кода, а также как помощник по запросу, которому можно быстро делегировать работу.

Используйте его для ревью pull request'ов в GitHub, сортировки и обработки issues, анализа и модификации кода и многого другого, взаимодействуя с [Qwen Code] в диалоговом режиме (например, `@qwencoder fix this issue`) прямо внутри ваших репозиториев GitHub.

## Возможности

- **Автоматизация**: Запуск workflow на основе событий (например, создание issue) или по расписанию (например, по ночному расписанию).
- **Совместная работа по запросу**: Запуск workflow через комментарии к issue и pull request с упоминанием [Qwen Code CLI](./features/commands) (например, `@qwencoder /review`).
- **Расширяемость с помощью инструментов**: Используйте возможности вызова инструментов (tool-calling) моделей [Qwen Code](../developers/tools/introduction.md) для взаимодействия с другими CLI, такими как [GitHub CLI] (`gh`).
- **Настраиваемость**: Создайте файл `QWEN.md` в вашем репозитории, чтобы передать [Qwen Code CLI](./features/commands) специфичные для проекта инструкции и контекст.

## Быстрый старт

Начните использовать Qwen Code CLI в вашем репозитории всего за несколько минут:

### 1. Получите Qwen API Key

Получите API key на платформе [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (AI-платформа Alibaba Cloud)

### 2. Добавьте его как GitHub Secret

Сохраните ваш API key как секрет с именем `QWEN_API_KEY` в вашем репозитории:

- Перейдите в **Settings > Secrets and variables > Actions** вашего репозитория
- Нажмите **New repository secret**
- Name: `QWEN_API_KEY`, Value: ваш API key

### 3. Обновите ваш .gitignore

Добавьте следующие строки в файл `.gitignore`:

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. Выберите workflow

У вас есть два варианта настройки workflow:

**Вариант A: Использовать команду настройки (Рекомендуется)**

1. Запустите Qwen Code CLI в терминале:

   ```shell
   qwen
   ```

2. В интерфейсе Qwen Code CLI введите:

   ```
   /setup-github
   ```

**Вариант B: Вручную скопировать workflow**

1. Скопируйте готовые workflow из директории [`examples/workflows`](./common-workflow) в директорию `.github/workflows` вашего репозитория. Примечание: необходимо также скопировать workflow `qwen-dispatch.yml`, который запускает выполнение остальных workflow.

### 5. Проверьте работу

**Ревью Pull Request:**

- Создайте pull request в вашем репозитории и дождитесь автоматического ревью
- Оставьте комментарий `@qwencoder /review` в существующем pull request, чтобы запустить ревью вручную

**Сортировка Issues:**

- Создайте issue и дождитесь автоматической сортировки
- Оставьте комментарий `@qwencoder /triage` в существующих issues, чтобы запустить сортировку вручную

**Общая AI-помощь:**

- В любом issue или pull request упомяните `@qwencoder` и укажите ваш запрос
- Примеры:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Workflow

Это действие предоставляет несколько готовых workflow для различных сценариев использования. Каждый workflow предназначен для копирования в директорию `.github/workflows` вашего репозитория и последующей настройки по необходимости.

### Qwen Code Dispatch

Этот workflow выступает в роли центрального диспетчера для Qwen Code CLI, направляя запросы в соответствующий workflow на основе события-триггера и команды, указанной в комментарии. Подробное руководство по настройке dispatch workflow см. в [документации по Qwen Code Dispatch workflow](./common-workflow).

### Issue Triage

Это действие позволяет автоматически или по расписанию сортировать GitHub Issues. Подробное руководство по настройке системы сортировки issues см. в [документации по GitHub Issue Triage workflow](./examples/workflows/issue-triage).

### Pull Request Review

Это действие можно использовать для автоматического ревью pull request'ов при их создании. Подробное руководство по настройке системы ревью pull request'ов см. в [документации по GitHub PR Review workflow](./common-workflow).

### Qwen Code CLI Assistant

Этот тип действия позволяет вызывать универсального диалогового AI-ассистента Qwen Code внутри pull request'ов и issues для выполнения широкого спектра задач. Подробное руководство по настройке универсального workflow Qwen Code CLI см. в [документации по Qwen Code Assistant workflow](./common-workflow).

## Конфигурация

### Inputs

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Необязательно)\_ API key для Qwen API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Необязательно, по умолчанию: `latest`)\_ Версия Qwen Code CLI для установки. Может быть "latest", "preview", "nightly", конкретным номером версии или git-веткой, тегом или коммитом. Подробнее см. [релизы Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Необязательно)\_ Включает debug-логирование и потоковый вывод.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Необязательно)\_ Модель, используемая с Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Необязательно, по умолчанию: `You are a helpful assistant.`)_ Строка, передаваемая в аргумент [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Необязательно)_ JSON-строка, записываемая в `.qwen/settings.json` для настройки _проектных_ параметров CLI.
  Подробнее см. документацию по [файлам настроек](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Необязательно, по умолчанию: `false`)\_ Определяет, использовать ли Code Assist для доступа к моделям Qwen Code вместо стандартного Qwen Code API key.
  Подробнее см. [документацию Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Необязательно, по умолчанию: `false`)\_ Определяет, использовать ли Vertex AI для доступа к моделям Qwen Code вместо стандартного Qwen Code API key.
  Подробнее см. [документацию Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Необязательно)_ Список расширений Qwen Code CLI для установки.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Необязательно, по умолчанию: `false`)\_ Определяет, загружать ли артефакты в GitHub Action.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Необязательно, по умолчанию: `false`)\_ Определяет, использовать ли pnpm вместо npm для установки qwen-code-cli

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Необязательно, по умолчанию: `${{ github.workflow }}`)\_ Имя GitHub workflow, используется для телеметрии.

<!-- END_AUTOGEN_INPUTS -->

### Outputs

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Суммарный вывод после выполнения Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Вывод ошибок при выполнении Qwen Code CLI (если есть).

<!-- END_AUTOGEN_OUTPUTS -->

### Переменные репозитория

Рекомендуем задать следующие значения как переменные репозитория, чтобы их можно было переиспользовать во всех workflow. В качестве альтернативы вы можете указать их inline как inputs действия в отдельных workflow или для переопределения значений на уровне репозитория.

| Имя               | Описание                                               | Тип     | Обязательно | Когда требуется             |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | Включает debug-логирование для Qwen Code CLI.              | Variable | Нет       | Никогда                     |
| `QWEN_CLI_VERSION` | Управляет версией устанавливаемого Qwen Code CLI. | Variable | Нет       | Фиксация версии CLI   |
| `APP_ID`           | ID GitHub App для кастомной аутентификации.                  | Variable | Нет       | Использование кастомного GitHub App |

Чтобы добавить переменную репозитория:

1. Перейдите в **Settings > Secrets and variables > Actions > New variable** вашего репозитория.
2. Введите имя и значение переменной.
3. Сохраните.

Подробности о переменных репозитория см. в [документации GitHub по переменным][variables].

### Secrets

Вы можете задать следующие секреты в вашем репозитории:

| Имя              | Описание                                   | Обязательно | Когда требуется                              |
| ----------------- | --------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | Ваш Qwen API key из DashScope.             | Да      | Требуется для всех workflow, вызывающих Qwen. |
| `APP_PRIVATE_KEY` | Приватный ключ вашего GitHub App (формат PEM). | Нет       | Использование кастомного GitHub App.                 |

Чтобы добавить секрет:

1. Перейдите в **Settings > Secrets and variables > Actions > New repository secret** вашего репозитория.
2. Введите имя и значение секрета.
3. Сохраните.

Дополнительную информацию см. в [официальной документации GitHub по созданию и использованию зашифрованных секретов][secrets].

## Аутентификация

Для работы этого действия требуется аутентификация в GitHub API и, опционально, в сервисах Qwen Code.

### Аутентификация в GitHub

Аутентифицироваться в GitHub можно двумя способами:

1. **Стандартный `GITHUB_TOKEN`:** Для простых сценариев действие может использовать стандартный `GITHUB_TOKEN`, предоставляемый workflow.
2. **Кастомный GitHub App (Рекомендуется):** Для максимальной безопасности и гибкости аутентификации рекомендуем создать кастомный GitHub App.

Подробные инструкции по настройке аутентификации для Qwen и GitHub см. в [**документации по аутентификации**](./configuration/auth).

## Расширения

Функциональность Qwen Code CLI можно расширить с помощью расширений. Эти расширения устанавливаются из исходного кода их репозиториев на GitHub.

Подробные инструкции по настройке и конфигурации расширений см. в [документации по расширениям](../developers/extensions/extension).

## Лучшие практики

Для обеспечения безопасности, надежности и эффективности ваших автоматизированных workflow настоятельно рекомендуем следовать нашим лучшим практикам. Эти рекомендации охватывают ключевые аспекты: безопасность репозитория, конфигурацию workflow и мониторинг.

Ключевые рекомендации включают:

- **Защита репозитория:** Настройка защиты веток и тегов, а также ограничение круга лиц, утверждающих pull request'ы.
- **Мониторинг и аудит:** Регулярный просмотр логов действий и включение OpenTelemetry для глубокого анализа производительности и поведения.

Полное руководство по защите вашего репозитория и workflow см. в нашей [**документации по лучшим практикам**](./common-workflow).

## Кастомизация

Создайте файл `QWEN.md` в корне вашего репозитория, чтобы передать [Qwen Code CLI](./common-workflow) специфичный для проекта контекст и инструкции. Это полезно для определения соглашений по написанию кода, архитектурных паттернов или других правил, которым модель должна следовать в данном репозитории.

## Участие в разработке

Мы приветствуем вклад в проект! Ознакомьтесь с **руководством по участию в разработке** Qwen Code CLI, чтобы узнать, как начать.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context