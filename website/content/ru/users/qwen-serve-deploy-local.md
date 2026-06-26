# Локальные шаблоны запуска для `qwen serve` (v0.16-alpha)

Эталонные шаблоны для запуска `qwen serve` как долгоживущего фонового процесса на рабочей станции разработчика. Сочетается с [известными ограничениями v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) — только локально, один пользователь, собственный bearer-токен. Контейнеризированные / многопользовательские / развертывания с TLS-фронтендом откладываются до v0.16.x.

> **Аудитория**: разработчики, использующие собственную разработку (dogfooding), которым нужен работающий демон после перезагрузок, логи, сохраняющиеся в надежном месте, и чистая логика `restart-on-failure`. Если вам нужен демон только на время одной сессии в оболочке, обычный `qwen serve` (на переднем плане, Ctrl-C для остановки) подойдет.

## Сгенерировать bearer-токен (один раз)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # управляется пользователем, НЕ встроенный путь
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

Путь и имя файла выбираете вы; v0.16-alpha не генерирует автоматически и не находит файл токена (отложено до v0.16.x). Смотрите раздел [Аутентификация](./qwen-serve.md#authentication) руководства пользователя для канонической настройки BYO.

> **Ограничьте этот `export` только текущей сессией оболочки.** Не добавляйте его в `~/.bashrc` / `~/.zshrc` — экспорт на уровне профиля раскрывает bearer-токен для каждого процесса, порожденного из этой оболочки (подпроцессы IDE, отладчики браузера, скрипты `npm` из несвязанных проектов). Для долгоживущих настроек используйте механизмы `EnvironmentFile=` для systemd / `EnvironmentVariables` для launchd, описанные ниже — оба ограничивают токен только процессом демона.

Демон читает bearer-токен либо из `--token <value>` в CLI, либо из переменной окружения `QWEN_SERVER_TOKEN` (пробелы обрезаются в обоих случаях). Конструктор TypeScript SDK `DaemonClient` использует запасной вариант `QWEN_SERVER_TOKEN`, если не передан параметр `token` (запасной вариант из PR 27 — клиентам с установленной переменной окружения никогда не нужно передавать значение через свой скрипт).

Одного `export` на уровне оболочки достаточно и для запуска сервера, и для создания клиента SDK (только не забудьте ограничить его сессией, как указано выше).

## Linux: пользовательский юнит systemd

> **Сначала найдите ваш бинарный файл `qwen`.** В директиве `ExecStart=` юнит-файла должен быть **абсолютный путь** — менеджеры служб не читают `PATH` вашей оболочки. Выполните `which qwen`, чтобы узнать его. Типичные расположения: `/usr/local/bin/qwen` (Linuxbrew, ручные установки), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.fnm/aliases/default/bin/qwen` (fnm), `~/.volta/bin/qwen` (Volta). Замените на фактический путь везде, где в шаблонах ниже указано `/PATH/TO/qwen`.

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Демон Qwen Code (loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# Замените на ваш проект; %h раскрывается в $HOME для пользовательских юнитов.
WorkingDirectory=%h/your-project
# Выполните `which qwen`, чтобы узнать абсолютный путь. systemd НЕ читает $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Читайте bearer-токен из файла с правами chmod 600, а не встраивайте его
# в юнит. `Environment=` раскрыла бы токен в файле юнита
# (обычно 644 — доступен для чтения всем). EnvironmentFile хранит токен в
# вашем секретном файле, который вы уже создали с помощью `chmod 600`.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Создайте файл окружения один раз (файл токена из шага настройки содержит сырое значение; здесь он оборачивается в форму `KEY=value`, чтобы systemd прочитал его как присваивание переменной окружения):

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

Управление:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # держать менеджер пользователя запущенным после выхода из системы и после перезагрузки
journalctl --user -u qwen-serve -f               # просмотр логов в реальном времени
systemctl --user restart qwen-serve.service     # после ротации токена
systemctl --user disable --now qwen-serve.service
```

Без `loginctl enable-linger` экземпляр systemd на уровне пользователя завершается при выходе пользователя и запускается снова только при следующем входе — на безголовой (headless) машине разработчика демон не переживет завершение сессии SSH. Именно `enable-linger` обеспечивает работу «после перезагрузок».

**Системная альтернатива** (общие машины разработчиков, встречается реже): поместите юнит в `/etc/systemd/system/qwen-serve@.service` с `User=%i`, управляйте через `sudo systemctl enable --now qwen-serve@<username>.service`. В остальном та же секция `[Service]` — но раскрытие `Environment=` для всех читающих на этом уровне еще более проблематично, поэтому всегда используйте `EnvironmentFile=`, указывающий на файл пользователя с правами `chmod 600`. Выбирайте пользовательский уровень + linger для однопользовательских рабочих станций.

## macOS: пользовательский агент launchd

> **Сначала найдите ваш бинарный файл `qwen`.** То же ограничение, что и для systemd — в `ProgramArguments` должен быть **абсолютный путь**. Выполните `which qwen`, чтобы узнать его. Типичные расположения на macOS: `/opt/homebrew/bin/qwen` (Homebrew на Apple Silicon), `/usr/local/bin/qwen` (Homebrew на Intel, ручные установки), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.volta/bin/qwen` (Volta). Замените ниже везде, где в шаблоне указано `/PATH/TO/qwen`.
`~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.qwenlm.qwen-serve</string>
  <key>ProgramArguments</key>
  <array>
    <!-- Выполните `which qwen`, чтобы узнать абсолютный путь; launchd НЕ читает $PATH. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd НЕ раскрывает `~` или `$HOME` — используйте абсолютные пути. -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- НЕ КОММИТЬТЕ этот файл с настоящим токеном. Также выполните chmod 600
         самого plist, чтобы встраиваемый токен не был доступен всем на чтение. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>PASTE-YOUR-TOKEN-HERE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Перезапускать только при ненулевом коде выхода (аналог systemd Restart=on-failure).
       Простое `<true/>` перезапускало бы даже после чистого SIGTERM, что сделало бы
       `kill <pid>` бесполезным для остановки — пришлось бы использовать
       `launchctl unload`. SuccessfulExit=false исправляет это. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Ограничение частоты перезапусков при постоянных сбоях (аналог systemd
       RestartSec=5; по умолчанию launchd перезапускал бы каждую секунду). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Журналировать в пользовательскую папку Library, а не в /tmp. /tmp доступен
       для записи всем (риск симлинк-атаки на общих рабочих станциях) и очищается
       periodic-daily через 3 дня; `~/Library/Logs/qwen-serve/` привязан к
       пользователю и не удаляется. launchd усекает эти файлы при каждом
       `load`, поэтому цикл unload→load для ротации токена стирает предыдущие
       диагностические логи — делайте резервные копии, если нужен разбор инцидента. -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

Управление:

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # только первый раз
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist содержит встроенный токен
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # для остановки
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

После редактирования plist (например, ротации токена) нужно выполнить `unload`, а затем снова `load` — `launchctl` не перезагружает plist автоматически, в отличие от `systemd daemon-reload`. Обратите внимание: каждый `load` усекает файлы журнала, поэтому перед ротацией при расследовании инцидента сохраните их.

## Сессия tmux (интерактивное управление)

Предполагается, что `QWEN_SERVER_TOKEN` уже экспортирован в вашей оболочке (см. раздел настройки выше):

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # просмотр логов в реальном времени; Ctrl-b d — отключиться
tmux kill-session -t qwen-serve
```

`tmux new -d` наследует окружение родительской оболочки, поэтому `QWEN_SERVER_TOKEN` передаётся автоматически. Лучше всего, когда нужно время от времени смотреть stdout демона (предупреждения аутентификации, прогресс обнаружения MCP, предупреждения о медленных клиентах) без создания сервисного юнита. Переживает закрытие терминала, но не перезагрузку хоста.

## Однострочник через nohup (быстро и грязно)

Предполагается, что `QWEN_SERVER_TOKEN` уже экспортирован в вашей оболочке:

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # PID демона; запишите, если хотите потом чисто завершить через `kill`
```

Обёртка `bash -c '...'` гарантирует, что демон привяжется к каталогу `~/your-project`, а не к тому, откуда вы выполнили команду. Без этого `cd` `qwen serve` использует `process.cwd()`, и `POST /session` от клиента, ожидающего рабочий каталог вашего проекта, вернёт `400 workspace_mismatch` — тихая подстава.

Подходит для одноразовых сценариев «запущу-ка в фоне, пока тыкаю API». **Не рекомендуется** для чего-то дольше одной сессии — нет перезапуска при сбое, файл журнала растёт бесконечно, нет чистого способа найти демон, если забыли PID. Для интерактивного управления предпочтительнее tmux, а для работы после перезагрузки — systemd или launchd.

## Проверка, что демон запущен

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # набор возможностей демона
```

Если настроена аутентификация (т.е. демон запущен с `--token` / установлен `QWEN_SERVER_TOKEN`, ИЛИ `--require-auth=true`), каждый маршрут, кроме `/health`, на loopback требует `Authorization: Bearer <token>`. Если вы запустили демон без токена на петлевом интерфейсе по умолчанию (путь `qwen serve` без конфигурации), ни один из запросов не требует заголовка. Все шаблоны выше настраивают токен, поэтому на практике заголовок `Authorization` нужен. Если `/capabilities` возвращает `401`, значит токен в юните / plist не совпадает с токеном, экспортированным в окружение, которое использует ваш `curl`.
## Ротация токенов

1. Сгенерируйте новый токен + запишите env-файл, на который ссылается unit:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (Для шаблонов launchd / nohup / tmux: отредактируйте значение `<string>` в plist или повторно выполните `export QWEN_SERVER_TOKEN`. Не забудьте сделать `chmod 600` для plist, если пересоздаёте его.)
2. Перезапустите демон:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>`, затем запустите заново с новым токеном в переменной окружения
3. Обновите клиентские SDK / скрипты. TypeScript SDK (`DaemonClient`) читает `QWEN_SERVER_TOKEN` автоматически (запасной вариант из PR 27) — повторно выполните `export` нового значения в оболочке клиента и пересоздайте клиент.

## Поведение при перезапуске и сбоях

Семантика перезапуска менеджером служб различается в зависимости от шаблона:

- **systemd `Restart=on-failure`** — перезапуск только при ненулевом коде завершения / сигнале. Чистый SIGTERM (`systemctl stop`) **не** вызывает цикл перезапусков.
- **launchd `KeepAlive` с `SuccessfulExit=false`** (шаблон выше) — соответствует поведению systemd. Простое `<true/>` привело бы к перезапуску даже после чистого завершения. `ThrottleInterval=10` ограничивает частоту перезапусков при постоянных сбоях, аналогично `RestartSec=5` в systemd.
- **tmux / nohup** — автоматического перезапуска нет. Сбой демона оставляет мёртвый PID до тех пор, пока вы не запустите его заново.

В течение **времени жизни одного экземпляра демона** отключения клиентов восстанавливаются через возобновление SSE с `Last-Event-ID` согласно разделу [Модель устойчивости](./qwen-serve.md#durability-model) руководства пользователя — кольцевой буфер повтора находится в памяти.

**Перезапуск** демона сбрасывает все сеансы в памяти; клиенты подключаются заново и начинают с чистого листа. Устойчивость содержимого сеансов (подсказок, вызовов инструментов, истории бесед) после перезапуска **НЕ** предусмотрена в v0.16-alpha.

## Вне рамок (откладывается на v0.16.x или позже)

- **Контейнерная установка** — Dockerfile, docker-compose, манифесты Kubernetes, nginx + TLS обратный прокси, изоляция токенов для нескольких экземпляров. Откладывается на v0.16.x, как только будет утверждён пилотный проект для предприятия; иначе документация устареет из-за отсутствия валидации.
- **Многоузловая федерация / координация нескольких демонов на одном хосте** — действует правило `1 демон = 1 рабочее пространство × N сеансов`. Привязка токенов к пути экземпляра и очистка устаревших токенов откладываются на v0.16.x.
- **Автоматическая генерация токенов демона** — в альфа-версии токен предоставляется пользователем. Инфраструктура автогенерации и хранения токенов откладывается на v0.16.x.
- **Нативная служба Windows** (`nssm`, обёртка Service Control Manager) — на данный момент используйте [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) и следуйте разделу о systemd выше.

Полный перечень отложенных возможностей см. в заметке [v0.16-alpha известные ограничения](./qwen-serve.md#v016-alpha-known-limits) в основном руководстве пользователя, а также в задаче отслеживания внедрения v0.16-alpha [#4175](https://github.com/QwenLM/qwen-code/issues/4175).
