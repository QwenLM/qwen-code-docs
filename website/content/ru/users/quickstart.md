# Быстрый старт

> 👏 Добро пожаловать в Qwen Code!

Это руководство по быстрому старту поможет вам начать использовать AI-ассистента для программирования всего за несколько минут. К концу вы поймете, как использовать Qwen Code для типовых задач разработки.

## **Перед началом**

Убедитесь, что у вас есть:

- Открытый терминал или командная строка
- Проект с кодом для работы
- **Одно из следующего**:
  - Учетная запись Qwen с подпиской **Plus или Pro** на [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli), которая открывает доступ к **Qwen Code и Agent**
  - API-ключ или подписка Token Plan от платформы Qwen AI / **QwenCloud** ([Китай](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) / [Международная версия](https://docs.qwencloud.com/developer-guides/administration/api-keys)) — рекомендуемая настройка
  - API-ключ от **Alibaba Cloud ModelStudio** ([Пекин](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/))
  - Подписка **Alibaba Cloud Token Plan** ([Пекин](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model))

## Шаг 1: Установка Qwen Code

Для установки Qwen Code используйте один из следующих способов:

### Быстрая установка (рекомендуется)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> Рекомендуется перезапустить терминал после установки, чтобы переменные окружения вступили в силу.

### Ручная установка

**Предварительные требования**

Убедитесь, что у вас установлен Node.js 22 или новее. Скачайте его с [nodejs.org](https://nodejs.org/en/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Шаг 2: Настройка аутентификации

При запуске интерактивной сессии с помощью команды `qwen` вам будет предложено настроить аутентификацию:

```bash
# You'll be prompted to set up authentication on first use
qwen
```

```bash
# Or run /auth anytime to change authentication method
/auth
```

Меню первого запуска позволяет подключить провайдера модели. Выберите один из вариантов:

- [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) — войдите в свою учетную запись Qwen, чтобы получить доступ к **Qwen Code и Agent** с вашей подпиской **Plus или Pro**. Если у вас еще нет подписки, посетите [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli), чтобы оформить Plus или Pro, затем вернитесь в Qwen Code и выберите [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).
- **QwenCloud** — рекомендуемая настройка. Открывает подменю:
  - **Token Plan**: подписка с ежемесячной квотой кредитов на выделенной конечной точке (версии Personal и Team).
  - **Standard API Key**: оплата по мере использования, подключение с существующим API-ключом платформы.

  В любом случае вы затем явно выбираете платформу (Китай или Международная версия), поэтому язык интерфейса не определяет вашу конечную точку. Подробности см. в разделе [Authentication → Option 2: QwenCloud](./configuration/auth).

- **Alibaba ModelStudio** — открывает подменю:
  - **Coding Plan**: подключение с помощью API-ключа Alibaba Cloud Coding Plan. См. раздел [Authentication](./configuration/auth.md#-option-3-alibaba-cloud-coding-plan) для настройки.
  - **Token Plan**: оплата по факту использования с выделенной конечной точкой, предназначена для команд и компаний. Инструкции по настройке см. в [руководстве Token Plan](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ([intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)).
  - **Standard API Key**: подключение с существующим API-ключом от Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Подробнее см. в руководстве по настройке API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
- **Third-party Providers** — выберите встроенного провайдера (DeepSeek, Grok, MiniMax, Z.AI, Kimi, Idealab, ModelScope, OpenRouter, Requesty и другие) и подключите его с помощью API-ключа.
- **Custom Provider** — вручную подключите локальный сервер, прокси или неподдерживаемого провайдера.

> [!note]
>
> Qwen Code хранит свою конфигурацию и настройки в каталогах `.qwen`: `~/.qwen/` для пользовательских настроек (например, `settings.json`) и глобальных пользовательских команд, а `<project>/.qwen/` — для файлов проекта, таких как пользовательские команды и сводки.

> [!tip]
>
> Для настройки аутентификации запустите Qwen Code и выполните `/auth`. Используйте `/doctor`, чтобы в любое время проверить текущую конфигурацию. Подробнее см. на странице [Аутентификация](./configuration/auth).

## Шаг 3: Начните первую сессию

Откройте терминал в любой директории проекта и запустите Qwen Code:

```bash
# optional
cd /path/to/your/project
# start qwen
qwen
```

Вы увидите приветственный экран Qwen Code с информацией о сессии, недавними разговорами и последними обновлениями. Введите `/help` для получения списка доступных команд.

## Общение с Qwen Code

### Задайте свой первый вопрос

Qwen Code проанализирует ваши файлы и предоставит резюме. Вы также можете задавать более конкретные вопросы:

```
explain the folder structure
```

Вы также можете спрашивать Qwen Code о его собственных возможностях:

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code читает ваши файлы по мере необходимости — вам не нужно вручную добавлять контекст. У Qwen Code также есть доступ к собственной документации, и он может отвечать на вопросы о своих функциях и возможностях.

### Сделайте первое изменение кода

Теперь давайте заставим Qwen Code выполнить реальное программирование. Попробуйте простую задачу:

```
add a hello world function to the main file
```

Qwen Code будет:

1. Находить подходящий файл
2. Показывать вам предлагаемые изменения
3. Запрашивать ваше одобрение
4. Вносить правку

> [!note]
>
> Qwen Code всегда запрашивает разрешение перед изменением файлов. Вы можете одобрять отдельные изменения или включить режим "Accept all" для сессии.

### Использование Git с Qwen Code

Qwen Code делает операции с Git диалоговыми:

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

Вы также можете запросить более сложные операции с Git:

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### Исправление ошибки или добавление функции

Qwen Code хорошо справляется с отладкой и реализацией функций.

Опишите, что вы хотите, на естественном языке:

```
add input validation to the user registration form
```

Или исправьте существующие проблемы:

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code будет:

- Находить релевантный код
- Понимать контекст
- Реализовывать решение
- Запускать тесты, если они доступны

### Протестируйте другие распространенные рабочие процессы

Существует несколько способов работы с Qwen Code:

**Рефакторинг кода**

```
refactor the authentication module to use async/await instead of callbacks
```

**Написание тестов**

```
write unit tests for the calculator functions
```

**Обновление документации**

```
update the README with installation instructions
```

**Проверка кода**

```
review my changes and suggest improvements
```

> [!tip]
>
> **Запомните**: Qwen Code — это ваш ИИ-напарник по программированию. Общайтесь с ним как с полезным коллегой: опишите, чего вы хотите достичь, и он поможет вам в этом.

## Основные команды

Вот самые важные команды для повседневного использования:

| Команда               | Что она делает                                   | Пример                             |
| --------------------- | ------------------------------------------------ | ---------------------------------- |
| `qwen`                | Запуск Qwen Code                                              | `qwen`                        |
| `/auth`               | Изменить способ аутентификации (в сессии)                     | `/auth`                       |
| `/doctor`             | Проверить текущую аутентификацию и окружение                  | `/doctor`                     |
| `/help`               | Показать справку по доступным командам                        | `/help` или `/?`              |
| `/compress`           | Заменить историю чата сводкой для экономии токенов            | `/compress`                   |
| `/clear`              | Очистить историю разговора и освободить контекст             | `/clear` (алиасы: `reset`, `new`) |
| `/theme`              | Изменить визуальную тему Qwen Code                            | `/theme`                      |
| `/language`           | Просмотреть или изменить настройки языка                      | `/language`                   |
| → `ui [language]`     | Установить язык интерфейса                                    | `/language ui zh-CN`          |
| → `output [language]` | Установить язык вывода LLM                                    | `/language output Chinese`    |
| `/quit`               | Немедленно выйти из Qwen Code                                 | `/quit` или `/exit`           |

Полный список команд см. в [справочнике CLI](./features/commands).

## Советы для новичков

**Будьте конкретны в своих запросах**

- Вместо: "исправь баг"
- Попробуйте: "исправь баг со входом, когда пользователи видят пустой экран после ввода неверных учетных данных"

**Используйте пошаговые инструкции**

- Разбейте сложные задачи на шаги:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Позвольте Qwen Code сначала исследовать код**

- Перед внесением изменений позвольте Qwen Code понять ваш код:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Экономьте время с помощью горячих клавиш**

- Нажмите `?`, чтобы увидеть все доступные сочетания клавиш
- Используйте Tab для автодополнения команд
- Нажмите ↑ для просмотра истории команд
- Введите `/`, чтобы увидеть все слеш-команды

## Получение помощи

- **В Qwen Code**: Введите `/help` или спросите «как мне...»
- **Документация**: вы уже здесь! Просмотрите другие руководства
- **Сообщество**: Присоединяйтесь к обсуждению на [GitHub](https://github.com/QwenLM/qwen-code/discussions) для получения советов и поддержки
