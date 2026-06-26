# Github Actions: qwen-code-action

## Обзор

`qwen-code-action` — это GitHub Action, который интегрирует [Qwen Code] в ваш процесс разработки через [Qwen Code CLI]. Он действует как автономный агент для критически важных рутинных задач по кодингу, а также как помощник по запросу, которому можно быстро делегировать работу.

Используйте его для ревью пул-реквестов, триажа задач, анализа и модификации кода и многого другого, общаясь с [Qwen Code] напрямую в ваших GitHub-репозиториях (например, `@qwencoder исправь эту проблему`).

## Возможности

- **Автоматизация**: Запуск рабочих процессов на основе событий (например, открытие задачи) или по расписанию (например, еженочно).
- **Работа по запросу**: Запуск рабочих процессов в комментариях к задачам и пул-реквестам с помощью упоминания [Qwen Code CLI](./features/commands) (например, `@qwencoder /review`).
- **Расширяемость с помощью инструментов**: Используйте возможности [Qwen Code](../developers/tools/introduction.md) для вызова инструментов, взаимодействуя с другими CLI, такими как [GitHub CLI] (`gh`).
- **Настройка**: Добавьте файл `QWEN.md` в ваш репозиторий, чтобы передать [Qwen Code CLI](./features/commands) инструкции и контекст, специфичные для проекта.

## Быстрый старт

Начните работу с Qwen Code CLI в своем репозитории всего за несколько минут:

### 1. Получите API-ключ Qwen

Получите API-ключ на [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (платформа AI от Alibaba Cloud).

### 2. Добавьте его как секрет GitHub

Сохраните ваш API-ключ как секрет с именем `QWEN_API_KEY` в репозитории:

- Перейдите в **Settings > Secrets and variables > Actions** вашего репозитория.
- Нажмите **New repository secret**.
- Имя: `QWEN_API_KEY`, значение: ваш API-ключ.

### 3. Обновите .gitignore

Добавьте следующие записи в файл `.gitignore`:

```gitignore
# настройки qwen-code-cli
.qwen/

# учетные данные GitHub App
gha-creds-*.json
```

### 4. Выберите рабочий процесс

У вас есть два варианта настройки рабочего процесса:

**Вариант A: используйте команду setup (рекомендуется)**

1. Запустите Qwen Code CLI в терминале:

   ```shell
   qwen
   ```

2. В Qwen Code CLI в терминале введите:

   ```
   /setup-github
   ```

**Вариант B: скопируйте рабочие процессы вручную**

1. Скопируйте готовые рабочие процессы из каталога [`examples/workflows`](./common-workflow) в каталог `.github/workflows` вашего репозитория. Обратите внимание: workflow `qwen-dispatch.yml` также необходимо скопировать — он запускает выполнение остальных рабочих процессов.

### 5. Попробуйте

**Ревью пул-реквеста:**

- Откройте пул-реквест в репозитории и дождитесь автоматического ревью.
- Оставьте комментарий `@qwencoder /review` на существующем пул-реквесте, чтобы вручную запустить ревью.

**Триаж задачи:**

- Откройте задачу и дождитесь автоматического триажа.
- Оставьте комментарий `@qwencoder /triage` к существующей задаче, чтобы вручную запустить триаж.

**Общая AI-помощь:**

- В любой задаче или пул-реквесте упомяните `@qwencoder`, а затем ваш запрос.
- Примеры:
  - `@qwencoder объясни это изменение кода`
  - `@qwencoder предложи улучшения для этой функции`
  - `@qwencoder помоги мне отладить эту ошибку`
  - `@qwencoder напиши модульные тесты для этого компонента`

## Рабочие процессы

Этот action предоставляет несколько готовых рабочих процессов для разных сценариев использования. Каждый workflow предназначен для копирования в каталог `.github/workflows` вашего репозитория и настройки по необходимости.

### Qwen Code Dispatch (диспетчер)

Этот workflow выступает центральным диспетчером для Qwen Code CLI, направляя запросы к соответствующему рабочему процессу в зависимости от вызывающего события и команды, указанной в комментарии. Подробное руководство по настройке workflow-диспетчера см. в [документации Qwen Code Dispatch workflow](./common-workflow).

### Триаж задач (Issue Triage)

Этот action можно использовать для автоматического триажа задач GitHub по расписанию или по событию. Рабочий пример настройки см. в [автоматическом триаже задач](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Ревью пул-реквестов (Pull Request Review)

Этот action автоматически проверяет пул-реквесты при их открытии. Подробное руководство по настройке системы ревью пул-реквестов см. в [документации GitHub PR Review workflow](./common-workflow).

### Qwen Code CLI Assistant

Этот action можно использовать для вызова универсального диалогового AI-ассистента Qwen Code в пул-реквестах и задачах для выполнения широкого круга задач. Подробное руководство по настройке универсального рабочего процесса Qwen Code CLI см. в [документации Qwen Code Assistant workflow](./common-workflow).

## Конфигурация

### Входные параметры (Inputs)

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Необязательно)\_ API-ключ для Qwen API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Необязательно, по умолчанию: `latest`)\_ Версия Qwen Code CLI для установки. Может быть "latest", "preview", "nightly", конкретным номером версии или веткой, тегом, коммитом. Подробнее см. в [релизах Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Необязательно)\_ Включает отладочное логирование и потоковый вывод.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Необязательно)\_ Модель для использования с Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Необязательно, по умолчанию: `You are a helpful assistant.`)_ Строка, передаваемая в Qwen Code CLI как аргумент [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments).

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Необязательно)_ JSON-строка, которая записывается в `.qwen/settings.json` для настройки _проектных_ параметров CLI.
  Подробнее см. в документации по [файлам настроек](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Необязательно, по умолчанию: `false`)\_ Использовать Code Assist для доступа к модели Qwen Code вместо API-ключа Qwen по умолчанию.
  Подробнее см. в [документации Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Необязательно, по умолчанию: `false`)\_ Использовать Vertex AI для доступа к модели Qwen Code вместо API-ключа Qwen по умолчанию.
  Подробнее см. в [документации Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Необязательно)_ Список расширений Qwen Code CLI для установки.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Необязательно, по умолчанию: `false`)\_ Загружать ли артефакты в GitHub Action.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Необязательно, по умолчанию: `false`)\_ Использовать pnpm вместо npm для установки qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Необязательно, по умолчанию: `${{ github.workflow }}`)\_ Имя рабочего процесса GitHub, используется для телеметрии.

<!-- END_AUTOGEN_INPUTS -->

### Выходные параметры (Outputs)

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Суммарный вывод выполнения Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Вывод ошибки выполнения Qwen Code CLI (если есть).

<!-- END_AUTOGEN_OUTPUTS -->

### Переменные репозитория

Рекомендуется задавать следующие значения как переменные репозитория, чтобы их можно было переиспользовать во всех рабочих процессах. Альтернативно можно задавать их как входные параметры action в отдельных рабочих процессах или для переопределения значений уровня репозитория.

| Имя                 | Описание                                                    | Тип      | Обязательно | Когда требуется                             |
| ------------------- | ----------------------------------------------------------- | -------- | ----------- | ------------------------------------------- |
| `DEBUG`             | Включает отладочное логирование Qwen Code CLI.              | Variable | Нет         | Никогда                                     |
| `QWEN_CLI_VERSION`  | Определяет версию Qwen Code CLI для установки.              | Variable | Нет         | При фиксации версии CLI                     |
| `APP_ID`            | ID GitHub App для кастомной аутентификации.                 | Variable | Нет         | При использовании кастомного GitHub App     |

Чтобы добавить переменную репозитория:

1. Перейдите в **Settings > Secrets and variables > Actions > New variable** вашего репозитория.
2. Введите имя и значение переменной.
3. Сохраните.

Подробнее о переменных репозитория см. в [документации GitHub по переменным][variables].

### Секреты

Вы можете задать следующие секреты в вашем репозитории:

| Имя               | Описание                                           | Обязательно | Когда требуется                                     |
| ----------------- | -------------------------------------------------- | ----------- | --------------------------------------------------- |
| `QWEN_API_KEY`    | Ваш API-ключ Qwen с DashScope.                     | Да          | Требуется для всех рабочих процессов, вызывающих Qwen. |
| `APP_PRIVATE_KEY` | Приватный ключ для вашего GitHub App (формат PEM). | Нет         | При использовании кастомного GitHub App.              |

Чтобы добавить секрет:

1. Перейдите в **Settings > Secrets and variables > Actions > New repository secret** вашего репозитория.
2. Введите имя и значение секрета.
3. Сохраните.

Подробнее см. в [официальной документации GitHub по созданию и использованию зашифрованных секретов][secrets].

## Аутентификация

Этот action требует аутентификации в GitHub API и, опционально, в сервисах Qwen Code.

### Аутентификация GitHub

Вы можете аутентифицироваться в GitHub двумя способами:

1. **По умолчанию `GITHUB_TOKEN`:** Для простых сценариев action может использовать стандартный `GITHUB_TOKEN`, предоставляемый рабочим процессом.
2. **Кастомный GitHub App (рекомендуется):** Для наиболее безопасной и гибкой аутентификации рекомендуется создать собственный GitHub App.

Подробные инструкции по настройке аутентификации как для Qwen, так и для GitHub см. в [**документации по аутентификации**](./configuration/auth).

## Расширения

Функциональность Qwen Code CLI может быть расширена с помощью дополнительных расширений. Они устанавливаются из исходного кода из соответствующих репозиториев GitHub.

Подробные инструкции по установке и настройке расширений см. в [документации по расширениям](./extension/introduction.md).

## Лучшие практики

Для обеспечения безопасности, надежности и эффективности ваших автоматизированных рабочих процессов настоятельно рекомендуется следовать нашим лучшим практикам. Эти рекомендации охватывают такие ключевые области, как безопасность репозитория, конфигурация рабочих процессов и мониторинг.

Основные рекомендации:

- **Обеспечение безопасности репозитория:** Внедрение защиты веток и тегов, ограничение числа утверждающих пул-реквесты.
- **Мониторинг и аудит:** Регулярно просматривайте логи action и включите OpenTelemetry для более глубокого понимания производительности и поведения.

Полное руководство по безопасности репозитория и рабочих процессов см. в нашей [**документации по лучшим практикам**](./common-workflow).

## Настройка

Создайте файл QWEN.md в корне вашего репозитория, чтобы передать [Qwen Code CLI](./common-workflow) контекст и инструкции, специфичные для проекта. Это полезно для определения соглашений по кодированию, архитектурных паттернов и других правил, которым модель должна следовать для данного репозитория.

## Вклад

Вклад приветствуется! Ознакомьтесь с **руководством по внесению вклада** в Qwen Code CLI, чтобы узнать, как начать.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context