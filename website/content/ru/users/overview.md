---
description: "Познакомьтесь с Qwen Code: ключевые возможности, старт за 30 секунд и сценарии, где терминальный AI-агент помогает понимать и менять код."
---

# Обзор Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Узнайте больше о Qwen Code — агентном инструменте для разработки от Qwen, который работает прямо в вашем терминале и помогает превращать идеи в код быстрее, чем когда-либо.

## Начните работу за 30 секунд

### Установка Qwen Code:

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
> Рекомендуется перезапустить терминал после установки, чтобы переменные окружения вступили в силу. Если установка завершилась ошибкой, обратитесь к разделу [Ручная установка](./quickstart#manual-installation) в руководстве по быстрому старту.

### Начало работы с Qwen Code:

```bash
cd your-project
qwen
```

Выберите метод аутентификации — **API Key** или **[Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)** ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) — и следуйте инструкциям для настройки. Пошаговые инструкции см. в руководстве по настройке API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Затем начнем с анализа вашей кодовой базы. Попробуйте одну из этих команд:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

При первом использовании вам будет предложено войти в систему. Готово! [Продолжить с руководством по быстрому старту (5 мин) →](./quickstart)

> [!tip]
>
> Если возникнут проблемы, см. раздел [устранение неполадок](./support/troubleshooting).

> [!note]
>
> **Новое расширение для VS Code (бета)**: Предпочитаете графический интерфейс? Наше новое **расширение для VS Code** предоставляет удобный нативный опыт работы в IDE без необходимости привыкать к терминалу. Просто установите его из маркетплейса и начните программировать с Qwen Code прямо в боковой панели. Скачайте и установите [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) прямо сейчас.

## Что умеет Qwen Code

- **Создание функций по описанию**: Опишите Qwen Code, что вы хотите создать, простым языком. Он составит план, напишет код и убедится, что всё работает.
- **Отладка и исправление ошибок**: Опишите баг или вставьте текст ошибки. Qwen Code проанализирует кодовую базу, выявит проблему и применит исправление.
- **Навигация по любой кодовой базе**: Задайте любой вопрос по кодовой базе вашей команды и получите развернутый ответ. Qwen Code понимает структуру всего вашего проекта, может находить актуальную информацию в интернете, а с помощью [MCP](./features/mcp) — получать данные из внешних источников, таких как Google Drive, Figma и Slack.
- **Автоматизация рутинных задач**: Исправляйте мелкие предупреждения линтера, разрешайте конфликты слияния и пишите примечания к релизам. Делайте всё это одной командой с вашей рабочей машины или автоматически в CI.
- **[Подсказки продолжения](./features/followup-suggestions)**: Qwen Code предугадывает, что вы хотите ввести дальше, и показывает это в виде полупрозрачного текста. Нажмите Tab для принятия или просто продолжайте печатать, чтобы отклонить.

## Почему разработчики любят Qwen Code

- **Работает в вашем терминале**: Никаких новых окон чата. Никаких новых IDE. Qwen Code работает там, где вы уже находитесь, с инструментами, которые вы уже любите.
- **Переходит к действиям**: Qwen Code может напрямую редактировать файлы, запускать команды и создавать коммиты. Нужно больше? [MCP](./features/mcp) позволяет Qwen Code читать документацию по дизайну в Google Drive, обновлять задачи в Jira или использовать _ваши_ собственные инструменты разработки.
- **Философия Unix**: Qwen Code легко комбинируется и поддерживает автоматизацию. Команда `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _работает_. Ваш CI может выполнить `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.