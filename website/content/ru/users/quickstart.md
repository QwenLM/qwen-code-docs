# Quickstart

> 👏 Добро пожаловать в Qwen Code!

Это руководство по быстрому старту поможет вам начать использовать ИИ-помощника для программирования всего за несколько минут. К концу вы узнаете, как использовать Qwen Code для типовых задач разработки.

## Перед началом

Убедитесь, что у вас есть:

- Открытый **терминал** или командная строка
- Ваш код-проект для работы
- Ключ API от Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)) или подписка Alibaba Cloud Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index))

## Шаг 1: Установка Qwen Code

Чтобы установить Qwen Code, используйте один из следующих способов:

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

### Установка вручную

**Предварительные требования**

Убедитесь, что установлен Node.js версии 22 или новее. Скачайте его с [nodejs.org](https://nodejs.org/en/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Шаг 2: Настройка аутентификации

При запуске интерактивного сеанса с командой `qwen` вам будет предложено настроить аутентификацию:

```bash
# При первом запуске будет предложено настроить аутентификацию
qwen
```

```bash
# Или выполните /auth в любой момент, чтобы изменить способ аутентификации
/auth
```

Меню первого запуска позволяет подключить провайдера моделей. Выберите один из вариантов:

- **Alibaba ModelStudio** — рекомендуемая настройка. Открывает подменю:
  - **Coding Plan**: для индивидуальных разработчиков, с еженедельной квотой и разнообразными моделями. Инструкции по настройке см. в руководстве по Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).
  - **Token Plan**: оплата по факту использования с выделенной конечной точкой, предназначен для команд и компаний.
  - **Standard API Key**: подключитесь с помощью существующего ключа API от Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Детали см. в руководстве по настройке API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
- **Third-party Providers** — выберите встроенного провайдера (DeepSeek, MiniMax, Z.AI, ModelScope, OpenRouter, Requesty и другие) и подключитесь с помощью ключа API.
- **Custom Provider** — вручную подключите локальный сервер, прокси или неподдерживаемого провайдера.

> ⚠️ **Примечание**: Qwen OAuth был отключён 15 апреля 2026 года. Если вы ранее использовали Qwen OAuth, переключитесь на один из указанных выше способов.

> [!note]
>
> При первой аутентификации Qwen Code с вашей учётной записью Qwen для вас автоматически создаётся рабочее пространство «.qwen». Оно обеспечивает централизованный учёт и управление затратами на всё использование Qwen Code в вашей организации.

> [!tip]
>
> Для настройки аутентификации запустите Qwen Code и выполните `/auth`. Используйте `/doctor`, чтобы в любой момент проверить текущую конфигурацию. Подробнее см. на странице [Аутентификация](./configuration/auth).

## Шаг 3: Начните первый сеанс

Откройте терминал в любом каталоге проекта и запустите Qwen Code:

```bash
# optional
cd /path/to/your/project
# start qwen
qwen
```

Вы увидите приветственный экран Qwen Code с информацией о сеансе, последними разговорами и последними обновлениями. Введите `/help`, чтобы увидеть доступные команды.

## Общайтесь с Qwen Code

### Задайте первый вопрос

Qwen Code проанализирует ваши файлы и предоставит сводку. Вы также можете задавать более конкретные вопросы:

```
объясни структуру папок
```

Вы также можете спросить Qwen Code о его собственных возможностях:

```
что умеет Qwen Code?
```

> [!note]
>
> Qwen Code читает ваши файлы по мере необходимости — вам не нужно добавлять контекст вручную. Qwen Code также имеет доступ к собственной документации и может отвечать на вопросы о своих функциях и возможностях.

### Внесите первое изменение в код

Теперь давайте заставим Qwen Code заняться настоящим программированием. Попробуйте простую задачу:

```
добавь функцию hello world в главный файл
```

Qwen Code:

1. Найдёт подходящий файл
2. Покажет предлагаемые изменения
3. Запросит ваше одобрение
4. Внесёт правку

> [!note]
>
> Qwen Code всегда запрашивает разрешение перед изменением файлов. Вы можете одобрять отдельные изменения или включить режим «Принять всё» для всего сеанса.

### Используйте Git с Qwen Code

Qwen Code превращает операции Git в диалог:

```
какие файлы я изменил?
```
```
commit my changes with a descriptive message
```

Вы также можете попросить более сложные операции с Git:

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

Qwen Code отлично справляется с отладкой и реализацией функций.

Опишите, что вы хотите, на естественном языке:

```
add input validation to the user registration form
```

Или исправьте существующую проблему:

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code:

- Найдет соответствующий код
- Поймет контекст
- Реализует решение
- Запустит тесты, если они доступны

### Попробуйте другие типовые сценарии работы

Есть много способов работать с Qwen Code:

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

**Code review**

```
review my changes and suggest improvements
```

> [!tip]
>
> **Запомните**: Qwen Code — это ваш ИИ-напарник по программированию. Общайтесь с ним как с полезным коллегой — опишите, чего хотите достичь, и он поможет вам это сделать.

## Основные команды

Вот самые важные команды для ежедневного использования:

| Команда              | Что делает                                        | Пример                        |
| -------------------- | ------------------------------------------------- | ----------------------------- |
| `qwen`               | запустить Qwen Code                               | `qwen`                        |
| `/auth`              | изменить способ аутентификации (в сессии)         | `/auth`                       |
| `/doctor`            | проверить текущую аутентификацию и окружение       | `/doctor`                     |
| `/help`              | показать справку по доступным командам             | `/help` или `/?`               |
| `/compress`          | заменить историю чата кратким содержанием (экономит токены) | `/compress`                   |
| `/clear`             | очистить содержимое терминала                      | `/clear` (горячая клавиша: `Ctrl+L`) |
| `/theme`             | изменить визуальную тему Qwen Code                 | `/theme`                      |
| `/language`          | просмотреть или изменить языковые настройки        | `/language`                   |
| → `ui [language]`    | установить язык интерфейса                         | `/language ui zh-CN`          |
| → `output [language]`| установить язык вывода LLM                         | `/language output Chinese`    |
| `/quit`              | немедленно выйти из Qwen Code                      | `/quit` или `/exit`           |

Полный список команд см. в [справочнике CLI](./features/commands).

## Советы для новичков

**Будьте конкретны в своих запросах**

- Вместо: "исправь ошибку"
- Попробуйте: "исправь ошибку входа, из-за которой пользователи видят пустой экран после ввода неверных учётных данных"

**Используйте пошаговые инструкции**

- Разбивайте сложные задачи на шаги:

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Позвольте Qwen Code сначала изучить код**

- Прежде чем вносить изменения, дайте Qwen Code понять ваш код:

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Экономьте время с помощью сочетаний клавиш**

- Нажмите `?`, чтобы увидеть все доступные сочетания клавиш
- Используйте Tab для автодополнения команд
- Нажмите ↑ для просмотра истории команд
- Введите `/`, чтобы увидеть все слэш-команды

## Получение справки

- **В Qwen Code**: введите `/help` или спросите "как мне..."
- **Документация**: вы уже здесь! Изучайте другие руководства
- **Сообщество**: присоединяйтесь к [обсуждению на GitHub](https://github.com/QwenLM/qwen-code/discussions) для советов и поддержки
