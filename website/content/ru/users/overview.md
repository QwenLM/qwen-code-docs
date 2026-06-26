# Обзор Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Узнайте о Qwen Code — агентивном инструменте для написания кода от Qwen, который живёт в вашем терминале и помогает воплощать идеи в код быстрее, чем когда-либо.

## Начало работы за 30 секунд

### Установите Qwen Code:

Рекомендуемый установщик использует отдельный архив, если он доступен для вашей платформы. Если не удаётся, он использует npm — тогда Node.js 22 или новее с npm должны быть доступны в PATH.

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
> Рекомендуется перезапустить терминал после установки, если `qwen` сразу не стал доступен в PATH. Если установка не удалась, обратитесь к разделу [Ручная установка](./quickstart#manual-installation) в руководстве по быстрому старту. Для установки в офлайн-режиме скачайте архив релиза и запустите установщик с `--archive PATH`; поместите `SHA256SUMS` рядом с архивом.

### Начните использовать Qwen Code:

```bash
cd your-project
qwen
```

При первом запуске вам будет предложено подключить провайдера модели. В меню доступны **Alibaba ModelStudio** (Coding Plan, Token Plan или Standard API Key), **Сторонние провайдеры** (встроенные провайдеры, такие как DeepSeek, MiniMax, Z.AI и OpenRouter, подключаются по API-ключу) и **Пользовательский провайдер** (локальный сервер, прокси или неподдерживаемый провайдер). Для [Coding Plan от Alibaba Cloud](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([международная версия](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) выберите **Alibaba ModelStudio → Coding Plan**; чтобы использовать API-ключ ModelStudio, выберите **Alibaba ModelStudio → Standard API Key** и следуйте инструкции по настройке API ([Пекин](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [международная версия](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Затем давайте начнём с понимания вашей кодовой базы. Попробуйте одну из этих команд:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

При первом использовании вам будет предложено войти в систему. Вот и всё! [Продолжить с быстрого старта (5 минут) →](./quickstart)

> [!tip]
>
> Обратитесь к разделу [устранение неполадок](./support/troubleshooting), если возникли проблемы.

> [!note]
>
> **Новое расширение для VS Code (бета-версия)**: Предпочитаете графический интерфейс? Наше новое **расширение для VS Code** предоставляет удобный нативный опыт работы в IDE, не требующий знакомства с терминалом. Просто установите его из маркетплейса и начните писать код с Qwen Code прямо в боковой панели. Загрузите и установите [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) сейчас.

## Что Qwen Code делает для вас

- **Создаёт функции из описаний**: Расскажите Qwen Code на простом языке, что вы хотите создать. Он составит план, напишет код и убедится, что он работает.
- **Отлаживает и исправляет ошибки**: Опишите баг или вставьте сообщение об ошибке. Qwen Code проанализирует вашу кодовую базу, найдёт проблему и реализует исправление.
- **Навигация по любой кодовой базе**: Задайте любой вопрос о кодовой базе вашей команды и получите продуманный ответ. Qwen Code отслеживает структуру всего вашего проекта, может находить актуальную информацию из интернета, а с помощью [MCP](./features/mcp) подключаться к внешним источникам данных, таким как Google Drive, Figma и Slack.
- **Автоматизация рутинных задач**: Исправляйте назойливые ошибки линтинга, разрешайте конфликты слияния и пишите заметки к релизам. Делайте всё это одной командой с ваших машин разработки или автоматически в CI.
- **[Подсказки продолжения](./features/followup-suggestions)**: Qwen Code предсказывает, что вы хотите ввести дальше, и показывает это в виде призрачного текста. Нажмите Tab, чтобы принять, или просто продолжайте печатать, чтобы отклонить.

## Почему разработчики любят Qwen Code

- **Работает в вашем терминале**: Не очередное окно чата. Не очередная IDE. Qwen Code работает там, где вы уже работаете, с инструментами, которые вы уже любите.
- **Совершает действия**: Qwen Code может напрямую редактировать файлы, запускать команды и создавать коммиты. Нужно больше? [MCP](./features/mcp) позволяет Qwen Code читать ваши дизайн-документы в Google Drive, обновлять задачи в Jira или использовать ваши собственные инструменты разработки.
- **Философия Unix**: Qwen Code компонуем и скриптуем. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _работает_. Ваш CI может выполнять `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.