# Обзор Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Узнайте о Qwen Code — агентивном инструменте для написания кода от Qwen, который работает в вашем терминале и помогает воплощать идеи в код быстрее, чем когда-либо.

## Начало работы за 30 секунд

### Установка Qwen Code:

Рекомендуемый установщик использует автономный архив, если он доступен для вашей платформы. Если же он использует npm, Node.js 22 или более поздней версии с npm должен быть доступен в PATH.

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
> Рекомендуется перезапустить терминал после установки, если `qwen` не сразу доступен в PATH. Если установка не удалась, обратитесь к разделу [Ручная установка](./quickstart#manual-installation) в руководстве Быстрый старт. Для автономной установки загрузите архив релиза и запустите установщик с флагом `--archive PATH`; поместите `SHA256SUMS` рядом с архивом.

### Начать использование Qwen Code:

```bash
cd your-project
qwen
```

При первом запуске вам будет предложено подключить провайдера моделей. Меню предлагает **Alibaba ModelStudio** (Coding Plan, Token Plan или Standard API Key), **Сторонние провайдеры** (встроенные провайдеры, такие как DeepSeek, MiniMax, Z.AI и OpenRouter, подключаемые через API-ключ) и **Пользовательский провайдер** (локальный сервер, прокси или неподдерживаемый провайдер). Для [Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([международная версия](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) выберите **Alibaba ModelStudio → Coding Plan**; чтобы использовать API-ключ ModelStudio, выберите **Alibaba ModelStudio → Standard API Key** и следуйте руководству по настройке API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [международная версия](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Затем давайте начнём с понимания вашей кодовой базы. Попробуйте одну из этих команд:

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

При первом использовании вам будет предложено войти в систему. Вот и всё! [Продолжить с Быстрым стартом (5 мин) →](./quickstart)

> [!tip]
>
> См. [устранение неполадок](./support/troubleshooting), если возникли проблемы.

> [!note]
>
> **Новое расширение для VS Code (Бета-версия)**: Предпочитаете графический интерфейс? Наше новое **расширение для VS Code** предоставляет простой в использовании нативный интерфейс IDE, не требующий знакомства с терминалом. Просто установите из маркетплейса и начните писать код с Qwen Code прямо в боковой панели. Скачайте и установите [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) сейчас.

## Что Qwen Code делает для вас

- **Создаёт функции по описанию**: Расскажите Qwen Code на простом языке, что вы хотите создать. Он составит план, напишет код и убедится, что он работает.
- **Отладка и исправление ошибок**: Опишите ошибку или вставьте сообщение об ошибке. Qwen Code проанализирует вашу кодовую базу, определит проблему и внедрит исправление.
- **Навигация по любой кодовой базе**: Спросите что угодно о кодовой базе вашей команды и получите продуманный ответ. Qwen Code сохраняет осведомлённость о всей структуре вашего проекта, может находить актуальную информацию в интернете и с помощью [MCP](./features/mcp) извлекать данные из внешних источников, таких как Google Drive, Figma и Slack.
- **Автоматизация рутинных задач**: Исправляйте мелочные проблемы линтинга, разрешайте конфликты слияния и пишите примечания к релизам. Выполняйте всё это одной командой с вашего компьютера разработчика или автоматически в CI.
- **[Рекомендации продолжения](./features/followup-suggestions)**: Qwen Code предсказывает, что вы хотите ввести далее, и показывает это в виде призрачного текста. Нажмите Tab, чтобы принять, или просто продолжайте печатать, чтобы отклонить.

## Почему разработчики любят Qwen Code

- **Работает в вашем терминале**: Не очередное окно чата. Не очередная IDE. Qwen Code встречает вас там, где вы уже работаете, с инструментами, которые вы уже любите.
- **Принимает меры**: Qwen Code может напрямую редактировать файлы, выполнять команды и создавать коммиты. Нужно больше? [MCP](./features/mcp) позволяет Qwen Code читать ваши проектные документы в Google Drive, обновлять тикеты в Jira или использовать _ваши_ собственные инструменты разработчика.
- **Философия Unix**: Qwen Code является компонуемым и скриптуемым. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _работает_. Ваш CI может выполнить `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.
