# Github Actions：qwen-code-action

## Обзор

`qwen-code-action` — это GitHub Action, который интегрирует [Qwen Code] в ваш рабочий процесс через [Qwen Code CLI]. Он выступает как автономный агент для важных рутинных задач кодирования, так и коллаборатор по запросу, которому можно быстро делегировать работу.

Используйте его для ревью пул-реквестов GitHub, триажа задач, анализа и модификации кода и многого другого с помощью [Qwen Code] в диалоговом режиме (например, `@qwencoder исправь эту проблему`) прямо в ваших репозиториях GitHub.

## Возможности

- **Автоматизация**: Запускайте рабочие процессы на основе событий (например, открытие задачи) или по расписанию (например, ночью).
- **Коллаборация по запросу**: Запускайте рабочие процессы в комментариях к задачам и пул-реквестам, упоминая [Qwen Code CLI](./features/commands) (например, `@qwencoder /review`).
- **Расширяемость с помощью инструментов**: Используйте возможности [Qwen Code](../developers/tools/introduction.md) по вызову инструментов для взаимодействия с другими CLI, такими как [GitHub CLI] (`gh`).
- **Настраиваемость**: Используйте файл `QWEN.md` в репозитории для предоставления проектно-специфичных инструкций и контекста [Qwen Code CLI](./features/commands).

## Быстрый старт

Начните работу с Qwen Code CLI в вашем репозитории всего за несколько минут:

### 1. Получите API-ключ Qwen

Получите API-ключ на [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (платформа Alibaba Cloud для работы с ИИ).

### 2. Добавьте его как секрет GitHub

Сохраните ваш API-ключ как секрет с именем `QWEN_API_KEY` в вашем репозитории:

- Перейдите в **Settings > Secrets and variables > Actions** вашего репозитория.
- Нажмите **New repository secret**.
- Имя: `QWEN_API_KEY`, Значение: ваш API-ключ.

### 3. Обновите .gitignore

Добавьте следующие записи в ваш файл `.gitignore`:

```gitignore
# настройки qwen-code-cli
.qwen/

# учётные данные GitHub App
gha-creds-*.json
```

### 4. Выберите рабочий процесс

У вас есть два варианта настройки рабочего процесса:

**Вариант A: Используйте команду настройки (рекомендуется)**

1. Запустите Qwen Code CLI в терминале:

   ```shell
   qwen
   ```

2. В Qwen Code CLI в терминале введите:

   ```
   /setup-github
   ```

**Вариант B: Скопируйте рабочие процессы вручную**

1. Скопируйте готовые рабочие процессы из каталога [`examples/workflows`](./common-workflow) в каталог `.github/workflows` вашего репозитория. Обратите внимание: рабочий процесс `qwen-dispatch.yml` также должен быть скопирован, так как он запускает выполнение остальных рабочих процессов.

### 5. Попробуйте

**Ревью пул-реквеста:**

- Откройте пул-реквест в репозитории и дождитесь автоматического ревью.
- Напишите комментарий `@qwencoder /review` в существующем пул-реквесте, чтобы вручную запустить ревью.

**Триаж задачи:**

- Откройте задачу и дождитесь автоматического триажа.
- Напишите комментарий `@qwencoder /triage` в существующей задаче, чтобы вручную запустить триаж.

**Общая помощь ИИ:**

- В любой задаче или пул-реквесте укажите `@qwencoder` и ваш запрос.
- Примеры:
  - `@qwencoder объясни это изменение кода`
  - `@qwencoder предложи улучшения для этой функции`
  - `@qwencoder помоги мне отладить эту ошибку`
  - `@qwencoder напиши модульные тесты для этого компонента`

## Рабочие процессы

Этот action предоставляет несколько готовых рабочих процессов для различных сценариев использования. Каждый из них предназначен для копирования в каталог `.github/workflows` вашего репозитория и последующей настройки.

### Qwen Code Dispatch

Этот рабочий процесс выступает в качестве центрального диспетчера для Qwen Code CLI, направляя запросы в соответствующий рабочий процесс в зависимости от инициирующего события и команды, указанной в комментарии. Подробное руководство по настройке диспетчерского рабочего процесса см. в [документации по рабочему процессу Qwen Code Dispatch](./common-workflow).

### Триаж задач

Этот action можно использовать для автоматического триажа GitHub Issues по расписанию или по событию. Пример рабочей настройки триажа задач см. в [рабочем процессе автоматического триажа задач](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Ревью пул-реквестов

Этот action можно использовать для автоматического ревью пул-реквестов при их открытии. Подробное руководство по настройке системы ревью PR см. в [документации по рабочему процессу ревью PR GitHub](./common-workflow).

### Помощник Qwen Code CLI

Этот тип action можно использовать для вызова универсального диалогового ИИ-помощника Qwen Code в пул-реквестах и задачах для выполнения широкого круга задач. Подробное руководство по настройке универсального рабочего процесса Qwen Code CLI см. в [документации по рабочему процессу помощника Qwen Code](./common-workflow).

## Конфигурация

### Входные данные

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Необязательно)\_ API-ключ для Qwen API.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Необязательно, по умолчанию: `latest`)\_ Версия Qwen Code CLI для установки. Может быть "latest", "preview", "nightly", конкретным номером версии или git-веткой, тегом или коммитом. Для получения дополнительной информации см. [Релизы Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).
- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Необязательно)* Включить отладочное логирование и потоковый вывод.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Необязательно)* Модель для использования с Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Необязательно, по умолчанию: `You are a helpful assistant.`)_ Строка, передаваемая в аргумент [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) CLI Qwen Code.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Необязательно)_ Строка в формате JSON, записываемая в `.qwen/settings.json` для настройки _проектных_ параметров CLI.
  Подробнее см. в документации по [файлам настроек](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Необязательно, по умолчанию: `false`)* Использовать ли Code Assist для доступа к модели Qwen Code вместо стандартного ключа API Qwen Code.
  Дополнительную информацию см. в [документации CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Необязательно, по умолчанию: `false`)* Использовать ли Vertex AI для доступа к модели Qwen Code вместо стандартного ключа API Qwen Code.
  Дополнительную информацию см. в [документации CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Необязательно)_ Список расширений CLI Qwen Code для установки.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Необязательно, по умолчанию: `false`)* Загружать ли артефакты в GitHub Action.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Необязательно, по умолчанию: `false`)* Использовать ли pnpm вместо npm для установки qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Необязательно, по умолчанию: `${{ github.workflow }}`)* Имя рабочего процесса GitHub, используется для телеметрии.

<!-- END_AUTOGEN_INPUTS -->

### Выходные данные

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Суммарный вывод выполнения CLI Qwen Code.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Вывод ошибки выполнения CLI Qwen Code, если таковая была.

<!-- END_AUTOGEN_OUTPUTS -->

### Переменные репозитория

Рекомендуется задать следующие значения как переменные репозитория, чтобы их можно было переиспользовать во всех workflows. Как вариант, вы можете задать их прямо во входах действия в отдельных workflows или для переопределения значений уровня репозитория.

| Имя                | Описание                                                  | Тип        | Обязательно | Когда обязательно                |
| ------------------ | --------------------------------------------------------- | ---------- | ----------- | -------------------------------- |
| `DEBUG`            | Включает отладочное логирование для CLI Qwen Code.        | Переменная | Нет         | Никогда                          |
| `QWEN_CLI_VERSION` | Управляет устанавливаемой версией CLI Qwen Code.          | Переменная | Нет         | Фиксация версии CLI              |
| `APP_ID`           | Идентификатор GitHub App для кастомной аутентификации.    | Переменная | Нет         | Использование кастомного GitHub App |

Чтобы добавить переменную репозитория:

1. Перейдите в **Settings > Secrets and variables > Actions > New variable** вашего репозитория.
2. Введите имя переменной и значение.
3. Сохраните.

Подробнее о переменных репозитория см. в [документации GitHub по переменным][variables].

### Секреты

Вы можете задать следующие секреты в вашем репозитории:

| Имя               | Описание                                    | Обязательно | Когда обязательно                              |
| ----------------- | ------------------------------------------- | ----------- | ---------------------------------------------- |
| `QWEN_API_KEY`    | Ваш ключ API Qwen из DashScope.             | Да          | Требуется во всех workflows, вызывающих Qwen.  |
| `APP_PRIVATE_KEY` | Приватный ключ для вашего GitHub App (формат PEM). | Нет         | Использование кастомного GitHub App.           |

Чтобы добавить секрет:

1. Перейдите в **Settings > Secrets and variables > Actions > New repository secret**.
2. Введите имя секрета и значение.
3. Сохраните.

Дополнительную информацию см. в [официальной документации GitHub по созданию и использованию зашифрованных секретов][secrets].
## Аутентификация

Для этого действия требуется аутентификация в GitHub API и, опционально, в сервисах Qwen Code.

### Аутентификация в GitHub

Вы можете аутентифицироваться в GitHub двумя способами:

1. **Стандартный `GITHUB_TOKEN`:** Для простых сценариев использования действие может использовать
   стандартный `GITHUB_TOKEN`, предоставляемый рабочим процессом.
2. **Пользовательское приложение GitHub (рекомендуется):** Для наиболее безопасной и гибкой
   аутентификации мы рекомендуем создать собственное приложение GitHub.

Подробные инструкции по настройке аутентификации как для Qwen, так и для GitHub можно найти в
[**документации по аутентификации**](./configuration/auth).

## Расширения

CLI Qwen Code можно расширить с помощью дополнительных функций через расширения.
Эти расширения устанавливаются из исходного кода из их репозиториев GitHub.

Подробные инструкции по настройке и конфигурированию расширений можно найти в
[документации по расширениям](./extension/introduction.md).

## Рекомендации

Для обеспечения безопасности, надежности и эффективности ваших автоматизированных рабочих процессов мы настоятельно рекомендуем следовать нашим рекомендациям. Эти рекомендации охватывают ключевые области, такие как безопасность репозитория, конфигурация рабочего процесса и мониторинг.

Основные рекомендации включают:

- **Обеспечение безопасности репозитория:** Внедрение защиты веток и тегов, а также ограничение числа утверждающих запросы на слияние.
- **Мониторинг и аудит:** Регулярная проверка журналов действий и включение OpenTelemetry для более глубокого понимания производительности и поведения.

Полное руководство по обеспечению безопасности вашего репозитория и рабочих процессов см. в [**документации по рекомендациям**](./common-workflow).

## Кастомизация

Создайте файл QWEN.md в корне вашего репозитория, чтобы предоставить
контекст и инструкции, специфичные для проекта, для [CLI Qwen Code](./common-workflow). Это полезно для определения
соглашений о кодировании, архитектурных шаблонов или других правил, которым модель
должна следовать для данного репозитория.

## Участие в разработке

Мы приветствуем вклад в проект! Ознакомьтесь с **Руководством по участию** CLI Qwen Code для получения более подробной информации о том, как начать.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context
