# GitHub Actions: qwen-code-action

## Обзор

`qwen-code-action` — это GitHub Action, который интегрирует [Qwen Code] в ваш процесс разработки через [Qwen Code CLI]. Он выступает как в роли автономного агента для критически важных рутинных задач по написанию кода, так и в роли помощника по запросу, которому можно быстро делегировать работу.

Используйте его для ревью pull request в GitHub, сортировки issues, анализа и модификации кода, а также для многого другого, взаимодействуя с [Qwen Code] в диалоговом режиме (например, `@qwencoder fix this issue`) прямо в ваших GitHub-репозиториях.

## Возможности

- **Автоматизация**: Запуск workflow на основе событий (например, создание issue) или по расписанию (например, nightly).
- **Совместная работа по запросу**: Запуск workflow в комментариях к issues и pull request путем упоминания [Qwen Code CLI](./features/commands) (например, `@qwencoder /review`).
- **Расширяемость с помощью инструментов**: Используйте возможности вызова инструментов моделей [Qwen Code](../developers/tools/introduction.md) для взаимодействия с другими CLI, такими как [GitHub CLI] (`gh`).
- **Настраиваемость**: Используйте файл `QWEN.md` в вашем репозитории, чтобы предоставить специфичные для проекта инструкции и контекст для [Qwen Code CLI](./features/commands).

## Быстрый старт

Начните работу с Qwen Code CLI в вашем репозитории всего за несколько минут:

### 1. Получите Qwen API key

Получите ваш API key на платформе [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (AI-платформа Alibaba Cloud)

### 2. Добавьте его как GitHub Secret

Сохраните ваш API key как secret с именем `QWEN_API_KEY` в вашем репозитории:

- Перейдите в **Settings > Secrets and variables > Actions** вашего репозитория
- Нажмите **New repository secret**
- Name: `QWEN_API_KEY`, Value: ваш API key

### 3. Обновите ваш .gitignore

Добавьте следующие записи в ваш файл `.gitignore`:

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. Выберите workflow

У вас есть два варианта настройки workflow:

**Вариант A: Использование команды setup (Рекомендуется)**

1. Запустите Qwen Code CLI в вашем терминале:

   ```shell
   qwen
   ```

2. В Qwen Code CLI в вашем терминале введите:

   ```
   /setup-github
   ```

**Вариант B: Ручное копирование workflows**

1. Скопируйте готовые workflows из директории [`examples/workflows`](./common-workflow) в директорию `.github/workflows` вашего репозитория. Примечание: также необходимо скопировать workflow `qwen-dispatch.yml`, который запускает остальные workflows.

### 5. Попробуйте в действии

**Ревью Pull Request:**

- Откройте pull request в вашем репозитории и дождитесь автоматического ревью
- Оставьте комментарий `@qwencoder /review` в существующем pull request, чтобы вручную запустить ревью

**Сортировка Issues:**

- Создайте issue и дождитесь автоматической сортировки
- Оставьте комментарий `@qwencoder /triage` в существующих issues, чтобы вручную запустить сортировку

**Общая AI-помощь:**

- В любом issue или pull request упомяните `@qwencoder` и напишите ваш запрос
- Примеры:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Workflows

Этот action предоставляет несколько готовых workflows для различных сценариев использования. Каждый workflow предназначен для копирования в директорию `.github/workflows` вашего репозитория и дальнейшей настройки по мере необходимости.

### Qwen Code Dispatch

Этот workflow выступает в роли центрального диспетчера для Qwen Code CLI, направляя запросы в соответствующий workflow на основе события-триггера и команды, указанной в комментарии. Подробное руководство по настройке dispatch workflow см. в [документации по Qwen Code Dispatch workflow](./common-workflow).

### Сортировка Issues

Этот action можно использовать для автоматической сортировки GitHub Issues или по расписанию. Пример работающей настройки сортировки issues см. в [workflow для автоматической сортировки issues](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Ревью Pull Request

Этот action можно использовать для автоматического ревью pull request при их открытии. Подробное руководство по настройке системы ревью pull request см. в [документации по GitHub PR Review workflow](./common-workflow).

### Qwen Code CLI Assistant

Этот тип action можно использовать для вызова универсального диалогового AI-ассистента Qwen Code в pull request и issues для выполнения широкого спектра задач. Подробное руководство по настройке универсального Qwen Code CLI workflow см. в [документации по Qwen Code Assistant workflow](./common-workflow).

## Конфигурация

### Inputs

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)\_ API key для Qwen API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, default: `latest`)\_ Версия устанавливаемого Qwen Code CLI. Может быть "latest", "preview", "nightly", конкретный номер версии, git-ветка, тег или коммит. Дополнительную информацию см. в разделе [Qwen Code CLI releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)\_ Включить логирование отладки и потоковую передачу вывода.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)\_ Модель для использования с Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Optional, default: `You are a helpful assistant.`)_ Строка, передаваемая в [`--prompt` аргумент](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Optional)_ JSON-строка, записываемая в `.qwen/settings.json` для настройки _проектных_ параметров CLI. Подробнее см. в документации по [файлам настроек](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, default: `false`)\_ Использовать ли Code Assist для доступа к моделям Qwen Code вместо стандартного Qwen Code API key. Дополнительную информацию см. в [документации Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, default: `false`)\_ Использовать ли Vertex AI для доступа к моделям Qwen Code вместо стандартного Qwen Code API key. Дополнительную информацию см. в [документации Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Optional)_ Список расширений Qwen Code CLI для установки.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, default: `false`)\_ Загружать ли артефакты в github action.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, default: `false`)\_ Использовать ли pnpm вместо npm для установки qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, default: `${{ github.workflow }}`)\_ Имя GitHub workflow, используется для целей телеметрии.

<!-- END_AUTOGEN_INPUTS -->

### Outputs

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Суммаризированный вывод от выполнения Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Вывод ошибок при выполнении Qwen Code CLI, если таковые имеются.

<!-- END_AUTOGEN_OUTPUTS -->

### Переменные репозитория

Мы рекомендуем установить следующие значения как переменные репозитория, чтобы их можно было повторно использовать во всех workflows. В качестве альтернативы, вы можете задать их inline как входные параметры action в отдельных workflows или для переопределения значений на уровне репозитория.

| Имя                | Описание                                                | Тип        | Обязательно | Когда обязательно           |
| ------------------ | ------------------------------------------------------- | ---------- | ------------ | --------------------------- |
| `DEBUG`            | Включает логирование отладки для Qwen Code CLI.         | Переменная | Нет          | Никогда                     |
| `QWEN_CLI_VERSION` | Контролирует, какая версия Qwen Code CLI будет установлена. | Переменная | Нет          | Фиксация версии CLI         |
| `APP_ID`           | GitHub App ID для пользовательской аутентификации.      | Переменная | Нет          | Использование пользовательского GitHub App |

Чтобы добавить переменную репозитория:

1. Перейдите в **Settings > Secrets and variables > Actions > New variable** вашего репозитория.
2. Введите имя и значение переменной.
3. Сохраните.

Подробнее о переменных репозитория см. в [документации GitHub по переменным][variables].

### Secrets

Вы можете установить следующие секреты в вашем репозитории:

| Имя               | Описание                                      | Обязательно | Когда обязательно                            |
| ----------------- | --------------------------------------------- | ----------- | -------------------------------------------- |
| `QWEN_API_KEY`    | Ваш Qwen API key из DashScope.                | Да          | Требуется для всех workflows, вызывающих Qwen. |
| `APP_PRIVATE_KEY` | Приватный ключ для вашего GitHub App (формат PEM). | Нет          | Использование пользовательского GitHub App.  |

Чтобы добавить secret:

1. Перейдите в **Settings > Secrets and variables > Actions > New repository secret** вашего репозитория.
2. Введите имя и значение секрета.
3. Сохраните.

Дополнительную информацию см. в [официальной документации GitHub по созданию и использованию зашифрованных секретов][secrets].

## Аутентификация

Этот action требует аутентификации в GitHub API и, опционально, в сервисах Qwen Code.

### Аутентификация в GitHub

Вы можете аутентифицироваться в GitHub двумя способами:

1. **Стандартный `GITHUB_TOKEN`:** Для более простых сценариев action может использовать стандартный `GITHUB_TOKEN`, предоставляемый workflow.
2. **Пользовательский GitHub App (Рекомендуется):** Для наиболее безопасной и гибкой аутентификации мы рекомендуем создать пользовательский GitHub App.

Подробные инструкции по настройке аутентификации как для Qwen, так и для GitHub см. в [**документации по аутентификации**](./configuration/auth).

## Расширения

Qwen Code CLI можно расширить дополнительным функционалом с помощью расширений.
Эти расширения устанавливаются из исходного кода из их GitHub-репозиториев.

Подробные инструкции по настройке и конфигурации расширений см. в [документации по расширениям](./extension/introduction.md).

## Лучшие практики

Чтобы обеспечить безопасность, надежность и эффективность ваших автоматизированных workflows, мы настоятельно рекомендуем следовать нашим лучшим практикам. Эти рекомендации охватывают ключевые области, такие как безопасность репозитория, конфигурация workflow и мониторинг.

Ключевые рекомендации включают:

- **Защита вашего репозитория:** Настройка защиты веток и тегов, а также ограничение круга лиц, одобряющих pull request.
- **Мониторинг и аудит:** Регулярный просмотр логов action и включение OpenTelemetry для более глубокого анализа производительности и поведения.

Подробное руководство по защите вашего репозитория и workflows см. в нашей [**документации по лучшим практикам**](./common-workflow).

## Кастомизация

Создайте файл QWEN.md в корне вашего репозитория, чтобы предоставить специфичный для проекта контекст и инструкции для [Qwen Code CLI](./common-workflow). Это полезно для определения соглашений по написанию кода, архитектурных паттернов или других правил, которым модель должна следовать в данном репозитории.
## Участие в разработке

Будем рады вашему вкладу! Ознакомьтесь с **руководством по участию в разработке** Qwen Code CLI, чтобы узнать подробнее о том, как начать.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context