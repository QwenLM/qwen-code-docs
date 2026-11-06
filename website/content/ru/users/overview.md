# Обзор Qwen Code

[![@qwen-code/qwen-code загрузок](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code) [![@qwen-code/qwen-code версия](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Узнайте о Qwen Code — агентном инструменте для программирования от Qwen, который работает в терминале и помогает превращать идеи в код быстрее, чем когда-либо.

## Начните работу за 30 секунд

### Установите Qwen Code:

Рекомендуемый установщик использует автономный архив, если он доступен для вашей платформы. Если происходит откат к npm, в PATH должны быть доступны Node.js версии 22 или выше вместе с npm.

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
> После установки рекомендуется перезапустить терминал, если `qwen` не появляется в PATH сразу. Если установка завершается ошибкой, см. раздел [Ручная установка](./quickstart#manual-installation) в руководстве по быстрому старту. Для офлайн-установки загрузите релизный архив и запустите установщик с помощью `--archive PATH`; держите `SHA256SUMS` рядом с архивом.

### Начните использовать Qwen Code:

```bash
cd your-project
qwen
```

При первом запуске вам будет предложено подключиться к провайдеру моделей. В меню доступны варианты: [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code) (использование подписки Qwen Plus или Pro с сайта [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code)), **QwenCloud** (официально рекомендуемая настройка), **Alibaba ModelStudio**, **Third-party Providers** (встроенные провайдеры, такие как DeepSeek, MiniMax, Z.AI, Kimi и OpenRouter, подключаемые через API-ключ) и **Custom Provider** (локальный сервер, прокси или неподдерживаемый провайдер).

Чтобы использовать вашу подписку Qwen, выберите [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code) и войдите в свой аккаунт Qwen. Подписка **Plus или Pro** открывает доступ к **Qwen Code и Agent**. Если у вас еще нет подписки, посетите [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code), чтобы оформить подписку Plus или Pro, затем вернитесь в Qwen Code и выберите [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code).

Для ключа QwenCloud выберите **QwenCloud → Token Plan** или **QwenCloud → Standard API Key**, а затем укажите платформу (Китай или Международная) — см. [Аутентификация](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/).

Для [Alibaba Cloud Token Plan](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ([intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)) выберите **Alibaba ModelStudio → Token Plan**; чтобы использовать API-ключ ModelStudio, выберите **Alibaba ModelStudio → Standard API Key** и следуйте руководству по настройке API ([Пекин](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).

Затем давайте начнем с понимания вашей кодовой базы. Попробуйте одну из этих команд:

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
