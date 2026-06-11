# Быстрый старт

> 👏 Добро пожаловать в Qwen Code!

Это руководство поможет вам начать использовать AI-ассистента для программирования всего за несколько минут. К концу вы узнаете, как применять Qwen Code для решения типичных задач разработки.

## Перед началом работы

Убедитесь, что у вас есть:

- Открытый **терминал** или командная строка
- Проект с кодом для работы
- API-ключ от Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)) или подписка на Alibaba Cloud Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index))

## Шаг 1: Установка Qwen Code

Для установки Qwen Code используйте один из следующих способов:

### Быстрая установка (рекомендуется)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (запуск от имени администратора)**

```cmd
powershell -Command "Invoke-WebRequest 'https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat' -OutFile (Join-Path $env:TEMP 'install-qwen.bat'); & (Join-Path $env:TEMP 'install-qwen.bat')"
```

> [!note]
>
> Рекомендуется перезапустить терминал после установки, чтобы переменные окружения применились.

### Ручная установка

**Требования**

Убедитесь, что установлен Node.js версии 20 или выше. Скачать его можно на [nodejs.org](https://nodejs.org/en/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Шаг 2: Настройка аутентификации

При запуске интерактивной сессии командой `qwen` вам будет предложено настроить аутентификацию:

```bash
# Вам будет предложено настроить аутентификацию при первом запуске
qwen
```

```bash
# Или выполните /auth в любой момент, чтобы сменить метод аутентификации
/auth
```

Выберите предпочтительный способ аутентификации:

- **Alibaba Cloud Coding Plan**: выберите `Alibaba Cloud Coding Plan` для оплаты по фиксированной ежемесячной ставке с доступом к различным моделям. Инструкции по настройке см. в [руководстве по Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).
- **API Key**: выберите `API Key`, затем введите ваш API-ключ от Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Подробную информацию см. в руководстве по настройке API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).

> ⚠️ **Примечание**: поддержка Qwen OAuth прекращена 15 апреля 2026 года. Если вы ранее использовали Qwen OAuth, переключитесь на один из указанных выше способов.

> [!note]
>
> При первой аутентификации Qwen Code через ваш аккаунт Qwen автоматически создается рабочее пространство `.qwen`. Оно обеспечивает централизованный учет затрат и управление использованием Qwen Code в вашей организации.

> [!tip]
>
> Вы также можете настроить аутентификацию напрямую из терминала без запуска сессии, выполнив команду `qwen auth`. В любой момент проверить текущую конфигурацию можно с помощью `qwen auth status`. Подробнее см. на странице [Аутентификация](./configuration/auth).

## Шаг 3: Запуск первой сессии

Откройте терминал в директории любого проекта и запустите Qwen Code:

```bash
# опционально
cd /path/to/your/project
# запуск qwen
qwen
```

Вы увидите экран приветствия Qwen Code с информацией о сессии, недавними диалогами и последними обновлениями. Введите `/help`, чтобы увидеть доступные команды.

## Общение с Qwen Code

### Задайте первый вопрос

Qwen Code проанализирует ваши файлы и предоставит краткое описание. Вы также можете задавать более конкретные вопросы:

```
explain the folder structure
```

Вы также можете спросить Qwen Code о его собственных возможностях:

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code читает файлы по мере необходимости — вам не нужно вручную добавлять контекст. У Qwen Code также есть доступ к собственной документации, и он может отвечать на вопросы о своих функциях и возможностях.

### Внесите первое изменение в код

Теперь заставим Qwen Code написать код. Попробуйте выполнить простую задачу:

```
add a hello world function to the main file
```

Qwen Code выполнит следующие действия:

1. Найдет подходящий файл
2. Покажет предлагаемые изменения
3. Запросит ваше подтверждение
4. Внесет правки

> [!note]
>
> Qwen Code всегда запрашивает разрешение перед изменением файлов. Вы можете подтверждать изменения по отдельности или включить режим «Принимать все» для текущей сессии.

### Работа с Git в Qwen Code

Qwen Code позволяет управлять Git через диалог:

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

Вы также можете запрашивать более сложные операции Git:

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### Исправление багов и добавление функций

Qwen Code отлично справляется с отладкой и реализацией новых функций.

Опишите, что вам нужно, на естественном языке:

```
add input validation to the user registration form
```

Или исправьте существующие проблемы:

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code выполнит следующее:

- Найдет соответствующий код
- Проанализирует контекст
- Реализует решение
- Запустит тесты (если они есть)

### Попробуйте другие типичные сценарии

Существует множество способов работы с Qwen Code:

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

**Код-ревью**

```
review my changes and suggest improvements
```

> [!tip]
>
> **Помните**: Qwen Code — ваш AI-напарник по программированию. Общайтесь с ним как с полезным коллегой: опишите, чего хотите достичь, и он поможет вам этого добиться.

## Основные команды

Ниже приведены самые важные команды для ежедневного использования:

| Команда               | Описание                                           | Пример                        |
| --------------------- | -------------------------------------------------- | ----------------------------- |
| `qwen`                | Запуск Qwen Code                                   | `qwen`                        |
| `/auth`               | Смена метода аутентификации (в сессии)             | `/auth`                       |
| `qwen auth`           | Настройка аутентификации из терминала              | `qwen auth`                   |
| `qwen auth api-key`   | Настройка аутентификации по API-ключу              | `qwen auth api-key`           |
| `qwen auth status`    | Проверка текущего статуса аутентификации           | `qwen auth status`            |
| `/help`               | Вывод справки по доступным командам                | `/help` или `/?`              |
| `/compress`           | Замена истории чата на сводку для экономии Tokens  | `/compress`                   |
| `/clear`              | Очистка экрана терминала                           | `/clear` (горячая клавиша: `Ctrl+L`) |
| `/theme`              | Смена визуальной темы Qwen Code                    | `/theme`                      |
| `/language`           | Просмотр или изменение настроек языка              | `/language`                   |
| → `ui [language]`     | Установка языка интерфейса                         | `/language ui zh-CN`          |
| → `output [language]` | Установка языка вывода LLM                         | `/language output Chinese`    |
| `/quit`               | Немедленный выход из Qwen Code                     | `/quit` или `/exit`           |

Полный список команд см. в [справочнике по CLI](./features/commands).

## Советы для начинающих

**Формулируйте запросы конкретно**

- Вместо: "исправь баг"
- Попробуйте: "исправь баг авторизации, из-за которого пользователи видят пустой экран после ввода неверных учетных данных"

**Используйте пошаговые инструкции**

- Разбивайте сложные задачи на шаги:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Дайте Qwen Code сначала изучить проект**

- Перед внесением изменений позвольте Qwen Code проанализировать ваш код:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Экономьте время с помощью горячих клавиш**

- Нажмите `?`, чтобы увидеть все доступные горячие клавиши
- Используйте Tab для автодополнения команд
- Нажмите ↑ для просмотра истории команд
- Введите `/`, чтобы увидеть все slash-команды

## Получение помощи

- **В Qwen Code**: введите `/help` или спросите "как мне..."
- **Документация**: вы уже здесь! Изучите другие руководства
- **Сообщество**: присоединяйтесь к нашему [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) для обмена советами и получения поддержки