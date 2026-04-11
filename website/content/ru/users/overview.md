# Обзор Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Узнайте больше о Qwen Code — агентном инструменте для программирования от Qwen, который работает прямо в вашем терминале и помогает превращать идеи в код быстрее, чем когда-либо.

## Начните работу за 30 секунд

### Установка Qwen Code:

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (запустите CMD от имени администратора)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> После установки рекомендуется перезапустить терминал, чтобы переменные окружения вступили в силу. Если установка завершилась ошибкой, обратитесь к разделу [Ручная установка](./quickstart#manual-installation) в руководстве по быстрому старту.

### Начало работы с Qwen Code:

```bash
cd your-project
qwen
```

Выберите аутентификацию **Qwen OAuth (Free)** и следуйте инструкциям для входа. Затем начнём с анализа вашей кодовой базы. Попробуйте одну из этих команд:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

При первом использовании вам будет предложено войти в систему. На этом всё! [Перейти к руководству по быстрому старту (5 мин) →](./quickstart)

> [!tip]
>
> Если возникнут проблемы, см. раздел [устранение неполадок](./support/troubleshooting).

> [!note]
>
> **Новое расширение для VS Code (бета)**: Предпочитаете графический интерфейс? Наше новое **расширение для VS Code** обеспечивает удобный нативный опыт работы в IDE без необходимости привыкать к терминалу. Просто установите его из маркетплейса и начните программировать с Qwen Code прямо в боковой панели. Скачайте и установите [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) прямо сейчас.

## Что умеет Qwen Code

- **Создание функций по описанию**: Опишите Qwen Code, что вы хотите создать, обычным языком. Он составит план, напишет код и убедится, что всё работает.
- **Отладка и исправление ошибок**: Опишите баг или вставьте текст ошибки. Qwen Code проанализирует вашу кодовую базу, найдёт проблему и исправит её.
- **Навигация по любой кодовой базе**: Задайте любой вопрос по кодовой базе вашей команды и получите развёрнутый ответ. Qwen Code понимает структуру всего вашего проекта, может находить актуальную информацию в интернете, а с помощью [MCP](./features/mcp) — получать данные из внешних источников, таких как Google Drive, Figma и Slack.
- **Автоматизация рутинных задач**: Исправление мелких предупреждений линтера, разрешение конфликтов слияния и написание примечаний к релизу. Выполняйте всё это одной командой на своей машине или автоматически в CI.
- **[Предложения продолжения](./features/followup-suggestions)**: Qwen Code предугадывает, что вы хотите ввести дальше, и показывает это в виде полупрозрачного текста. Нажмите Tab для принятия или просто продолжайте печатать, чтобы отклонить.

## Почему разработчики любят Qwen Code

- **Работает прямо в терминале**: Никаких новых окон чата. Никаких новых IDE. Qwen Code работает там, где вы уже привыкли работать, с инструментами, которые вам нравятся.
- **Выполняет действия**: Qwen Code может напрямую редактировать файлы, запускать команды и создавать коммиты. Нужно больше? [MCP](./features/mcp) позволяет Qwen Code читать документацию по дизайну в Google Drive, обновлять задачи в Jira или использовать _ваши_ собственные инструменты разработки.
- **Философия Unix**: Qwen Code легко комбинируется и поддерживает скриптование. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _работает_. Ваш CI может выполнить `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.