# Локальные шаблоны запуска для `qwen serve` (v0.16-alpha)

Эталонные шаблоны для запуска `qwen serve` как долгоживущего фонового процесса на рабочей станции разработчика. Используются совместно с [известными ограничениями v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) — только локально, для одного пользователя, со своим собственным bearer token. Контейнерные развертывания, многохостовая и с TLS-терминацией откладываются до v0.16.x.

> **Аудитория**: разработчики, использующие dogfooding, которым нужен демон, работающий после перезагрузки, с логами в надежном месте и чистой историей «перезапуск при сбое». Если демон нужен только на время одной сессии в терминале, можно просто запустить `qwen serve` (в интерактивном режиме, Ctrl-C для остановки).

## Создать bearer token (один раз)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # управляется пользователем, НЕ встроенный путь
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

Путь и имя файла вы выбираете сами; v0.16-alpha не генерирует и не ищет токен автоматически (отложено до v0.16.x). См. раздел [Аутентификация](./qwen-serve.md#authentication) руководства пользователя для стандартной настройки BYO.

> **Ограничьте этот `export` только текущей сессией в терминале.** Не добавляйте его в `~/.bashrc` или `~/.zshrc` — экспорт на уровне профиля откроет доступ к bearer token для всех процессов, порожденных из этой оболочки (подпроцессы IDE, отладчики браузера, скрипты `npm` из несвязанных проектов). Для долгоживущих настроек используйте механизмы `EnvironmentFile=` (systemd) / `EnvironmentVariables` (launchd), описанные ниже — они ограничивают токен только процессом демона.

Демон читает bearer token либо из `--token <значение>` в командной строке, либо из переменной окружения `QWEN_SERVER_TOKEN` (пробелы в начале и конце игнорируются). Конструктор `DaemonClient` из TypeScript SDK использует `QWEN_SERVER_TOKEN` как запасной вариант, если не передан параметр `token` (запасной вариант PR 27 — клиенты с установленной переменной окружения никогда не должны передавать значение в своем скрипте).

Один `export` на уровне оболочки покрывает как запуск сервера, так и создание клиента SDK (просто держите его ограниченным сессией, как указано выше).

## Linux: пользовательский модуль systemd

> **Сначала найдите ваш исполняемый файл `qwen`.** В `ExecStart=` файла модуля должен быть **абсолютный путь** — менеджеры служб не читают ваш `PATH`. Выполните `which qwen`, чтобы узнать его. Типичные расположения: `/usr/local/bin/qwen` (Linuxbrew, ручная установка), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.fnm/aliases/default/bin/qwen` (fnm), `~/.volta/bin/qwen` (Volta). Везде, где в шаблонах ниже указано `/PATH/TO/qwen`, подставьте актуальный путь.

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Демон Qwen Code (loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# Замените на ваш проект; %h раскрывается в $HOME для пользовательских модулей.
WorkingDirectory=%h/ваш-проект
# Выполните `which qwen`, чтобы найти абсолютный путь. systemd НЕ читает $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Читать bearer token из файла с chmod 600, а не встраивать в модуль.
# `Environment=` раскроет токен в файле модуля (обычно 644 = читается всеми).
# EnvironmentFile хранит токен в защищенном файле, который вы уже создали с `chmod 600`.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Создайте файл окружения один раз (файл токена из шага настройки хранит сырое значение; здесь он оборачивается в форму `KEY=value`, чтобы systemd прочитал его как присваивание переменной окружения):

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

Управление:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # оставить менеджер пользователя работающим после выхода из системы / после перезагрузки
journalctl --user -u qwen-serve -f               # просмотр логов в реальном времени
systemctl --user restart qwen-serve.service     # после ротации токена
systemctl --user disable --now qwen-serve.service
```

Без `loginctl enable-linger` пользовательский экземпляр systemd выключается при выходе пользователя из системы и запускается снова только при следующем входе — на безголовой dev-машине демон не переживет завершение SSH-сессии. `enable-linger` — это то, что действительно обеспечивает работу «после перезагрузок».

**Системная альтернатива** (общие dev-хосты, встречается реже): поместите модуль в `/etc/systemd/system/qwen-serve@.service` с `User=%i`, управляйте через `sudo systemctl enable --now qwen-serve@<имя_пользователя>.service`. Тело `[Service]` в остальном то же — но общедоступное `Environment=` на этом уровне ещё более проблематично, поэтому всегда используйте `EnvironmentFile=`, указывающий на файл с `chmod 600` пользователя. Для однопользовательских рабочих станций выбирайте пользовательский уровень + linger.

## macOS: пользовательский агент launchd

> **Сначала найдите ваш исполняемый файл `qwen`.** То же ограничение, что и для systemd — `ProgramArguments` должен содержать **абсолютный путь**. Выполните `which qwen`, чтобы узнать его. Типичные расположения на macOS: `/opt/homebrew/bin/qwen` (Homebrew на Apple Silicon), `/usr/local/bin/qwen` (Homebrew на Intel, ручная установка), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.volta/bin/qwen` (Volta). Замените в шаблоне ниже, где указано `/PATH/TO/qwen`.

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
    <!-- Выполните `which qwen`, чтобы найти абсолютный путь; launchd НЕ читает $PATH. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd НЕ раскрывает `~` или `$HOME` — используйте абсолютные пути. -->
  <key>WorkingDirectory</key>
  <string>/Users/ВАШЕ-ИМЯ/ваш-проект</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- НЕ КОММИТЬТЕ этот файл с реальным токеном. Также установите chmod 600
         на сам plist, чтобы встроенный токен не был виден всем. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>ВСТАВЬТЕ-ВАШ-ТОКЕН-СЮДА</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Перезапускать только при ненулевых кодах завершения (аналог systemd Restart=on-failure).
       Простое `<true/>` перезапускало бы даже после корректного SIGTERM, что не позволило бы
       использовать `kill <pid>` для остановки — оператору пришлось бы выполнять `launchctl unload`.
       SuccessfulExit=false исправляет это. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Ограничение частоты перезапусков при постоянных сбоях (аналог systemd RestartSec=5;
       поведение launchd по умолчанию перезапускало бы каждую секунду). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Логировать в библиотеку пользователя, а не в /tmp. /tmp доступен для записи всем
       (риск симлинк-атаки на общих рабочих станциях) и очищается фоновой задачей periodic-daily
       через 3 дня; `~/Library/Logs/qwen-serve/` привязан к пользователю и сохраняется.
       launchd усекает эти файлы при каждом `load`, поэтому цикл unload→load при ротации токена
       стирает предыдущие диагностические логи — сделайте резервную копию, если нужно
       исследование после инцидента. -->
  <key>StandardOutPath</key>
  <string>/Users/ВАШЕ-ИМЯ/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/ВАШЕ-ИМЯ/Library/Logs/qwen-serve/err.log</string>
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

После редактирования plist (например, ротации токена) необходимо выполнить `unload`, затем `load` снова — `launchctl` не перезагружает plist автоматически, как это делает `systemd daemon-reload`. Обратите внимание: каждый `load` усекает файлы журналов, поэтому перед ротацией сохраните их, если расследуете инцидент.

## Сессия tmux (интерактивное наблюдение)

Предполагается, что `QWEN_SERVER_TOKEN` уже экспортирован в вашем shell (см. раздел настройки выше):

```bash
tmux new -d -s qwen-serve "cd ~/ваш-проект && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # просмотр логов в реальном времени; Ctrl-b d для открепления
tmux kill-session -t qwen-serve
```

`tmux new -d` наследует окружение родительского shell, поэтому `QWEN_SERVER_TOKEN` передаётся автоматически. Лучше всего подходит, когда вы хотите время от времени смотреть stdout демона (предупреждения аутентификации, прогресс обнаружения MCP, предупреждения о медленных клиентах) без необходимости создавать системную службу. Переживает закрытие терминала, но не перезагрузку хоста.

## Однострочник с nohup (быстро и грязно)

Предполагается, что `QWEN_SERVER_TOKEN` уже экспортирован в вашем shell:

```bash
nohup bash -c 'cd ~/ваш-проект && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # PID демона; запомните, если хотите потом чисто завершить через `kill`
```

Обёртка `bash -c '...'` гарантирует, что демон запустится в `~/ваш-проект`, а не в том месте, откуда вы выполнили команду. Без этого `cd` `qwen serve` использует `process.cwd()` по умолчанию, и `POST /session` от клиента, ожидающего рабочее пространство вашего проекта, вернёт `400 workspace_mismatch` — скрытая грабля.

Подходит для разовых рабочих процессов «дай запустить это в фоне, пока я тыкаю API». **Не рекомендуется** для чего-либо, выходящего за рамки одной сессии — нет перезапуска при сбое, файл лога неограниченно растёт, нет чистого способа найти демона, если вы забыли PID. Для интерактивного наблюдения используйте tmux, а для того, что должно пережить перезагрузку — systemd или launchd.

## Проверка работоспособности демона

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # набор возможностей демона
```

Если настроена аутентификация (т.е. демон запущен с `--token` / установлен `QWEN_SERVER_TOKEN`, или `--require-auth=true`), то все маршруты, кроме `/health` (на loopback), требуют заголовка `Authorization: Bearer <token>`. Если вы запустили демон без токена на loopback (путь `qwen serve` без конфигурации), ни один из вызовов не требует заголовка. Все шаблоны выше настраивают токен, поэтому на практике заголовок `Authorization` необходим. Если `/capabilities` возвращает `401`, токен в модуле/plist не совпадает с токеном, экспортированным в окружении, который использует ваш `curl`.

## Ротация токена

1. Создайте новый токен и запишите файл окружения, на который ссылается модуль:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (Для launchd / nohup / tmux: отредактируйте значение `<string>` в plist или заново выполните `export QWEN_SERVER_TOKEN`. Не забудьте `chmod 600` для plist, если вы его пересоздаёте.)
2. Перезапустите демона:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>`, затем запустите заново с новым токеном в окружении
3. Обновите клиентские SDK / скрипты. TypeScript SDK `DaemonClient` автоматически читает `QWEN_SERVER_TOKEN` (запасной вариант PR 27) — повторно экспортируйте новое значение в shell клиента и создайте клиент заново.

## Поведение при перезапуске и сбое

Семантика перезапуска менеджером служб различается для разных шаблонов:

- **systemd `Restart=on-failure`** — перезапуск только при ненулевом коде завершения / сигнале. Чистый SIGTERM (`systemctl stop`) **не** вызывает цикл перезапуска.
- **launchd `KeepAlive` с `SuccessfulExit=false`** (шаблон выше) — соответствует поведению systemd. Простое `<true/>` перезапускало бы даже после чистого завершения. `ThrottleInterval=10` ограничивает частоту перезапусков при постоянных сбоях, аналогично `RestartSec=5` в systemd.
- **tmux / nohup** — автоматический перезапуск отсутствует. Сбой демона оставляет вас с мёртвым PID, пока вы не запустите заново.

В течение **времени жизни одного процесса демона** при отключениях клиентов восстановление происходит через SSE `Last-Event-ID` resume, как описано в разделе [Модель устойчивости](./qwen-serve.md#durability-model) руководства пользователя — кольцо воспроизведения находится в памяти.

**Перезапуск** демона приводит к потере всех сессий в памяти; клиенты переподключаются и начинают с чистого листа. Устойчивость содержимого сессий (подсказки, вызовы инструментов, история диалогов) при перезапуске **НЕ реализована** в v0.16-alpha.

## Вне рамок (откладывается до v0.16.x или позже)

- **Контейнерное развертывание** — Dockerfile, docker-compose, манифесты Kubernetes, nginx + обратный прокси TLS, изоляция токенов для нескольких экземпляров. Откладывается до v0.16.x, как только появится обязательство по пилотному проекту для предприятия; иначе документация устареет из-за отсутствия проверки.
- **Федерация на разных хостах / координация нескольких демонов на одном хосте** — принудительно действует `1 демон = 1 рабочее пространство × N сессий`. Привязка токенов к пути экземпляра + очистка устаревших токенов откладывается до v0.16.x.
- **Автоматическая генерация токенов демона** — в альфе используется свой токен. Инфраструктура автоматической генерации + хранилища токенов откладывается до v0.16.x.
- **Собственная служба Windows** (`nssm`, обёртка Service Control Manager) — пока используйте [WSL2](https://learn.microsoft.com/ru-ru/windows/wsl/) и следуйте разделу про systemd выше.

См. предупреждение [известные ограничения v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) в основном руководстве пользователя для полного списка отложенных возможностей и [#4175](https://github.com/QwenLM/qwen-code/issues/4175) для отслеживания статуса v0.16-alpha.