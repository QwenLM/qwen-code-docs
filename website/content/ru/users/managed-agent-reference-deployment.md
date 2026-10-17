# Эталонное развертывание Managed Agent


Распределённая сборка Managed Agent носит экспериментальный характер. Принятая начальная топология: одна управляющая плоскость Java и встроенный Runtime Broker на одном доверенном Linux-хосте, одна база данных MySQL и один совместимый Qwen Hosted Harness. Манифест совместимости в каждом релизе является авторитетным для этого релиза.

## Проверка и распаковка

Загрузите архив, отдельный манифест и `SHA256SUMS.txt` из одного и того же GitHub-пререлиза. Проверьте их перед распаковкой:

```bash
sha256sum --check SHA256SUMS.txt
tar -xzf qwen-managed-agent-reference-<version>.tar.gz
cd qwen-managed-agent-reference-<version>
sha256sum --check SHA256SUMS
```

Изучите `manifest.json`. Убедитесь, что `source.revision` — это проверенная ревизия, `compatibility.qwenCodeVersion` совпадает с установленной версией CLI/Harness, а `compatibility.databaseSchema.latestMigrationVersion` приемлема для целевой базы данных. Релиз считается недействительным, если какая-либо проверка контрольных сумм или совместимости не пройдена.

## Предварительные требования

- Linux на доверенном хосте приложений.
- JDK 21 или новее.
- Node.js, соответствующая `compatibility.node`, и Qwen Code, соответствующая `compatibility.qwenCodeVersion`.
- MySQL 8 с пустой базой данных или базой данных, ранее управляемой более старой совместимой эталонной сборкой.
- Закрытые, постоянные каталоги для состояния Runtime и авторизованного рабочего пространства.
- Стабильные учетные данные базы данных, ключ учетных данных Runtime и токен Harness, хранящиеся отдельно от архива.

Java-архив не содержит npm CLI. Установите или соберите точную совместимую ревизию Qwen Code отдельно и укажите путь к `dist/cli.js` для воркеров Runtime.

## Запуск Hosted Harness

Выберите один токен и дайджест возможностей и передайте те же значения Harness и Java-сервису:

```bash
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

QWEN_SERVER_TOKEN="$QWEN_MANAGED_AGENT_HARNESS_TOKEN" \
QWEN_HOSTED_HARNESS_CAPABILITY_DIGEST="$QWEN_MANAGED_AGENT_CAPABILITY_DIGEST" \
qwen serve --profile hosted-harness --port 4170 --hostname 127.0.0.1 --no-web
```

Оставьте Harness на loopback. Запишите порт, который он сообщает; `--port` может увеличиться, если запрошенный порт уже занят.

## Запуск управляющей плоскости Java

В другом терминале настройте тот же Harness и базу данных:

```bash
export SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:3306/qwen_managed_agent'
export SPRING_DATASOURCE_USERNAME='qwen'
export SPRING_DATASOURCE_PASSWORD='<private-password>'
export QWEN_MANAGED_AGENT_HARNESS_ENABLED='true'
export QWEN_MANAGED_AGENT_HARNESS_BASE_URL='http://127.0.0.1:4170'
export QWEN_MANAGED_AGENT_HARNESS_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_CAPABILITY_DIGEST='sha256:<64-hex-digest>'

bin/qwen-managed-agent-server
```

Лаунчер использует серверный JAR из этого архива. Spring Flyway применяет прямые миграции базы данных перед тем, как сервис станет готов. Дождитесь:

```bash
curl --fail http://127.0.0.1:8080/actuator/health
```

Эта базовая конфигурация поддерживает текстовые Hosted-сессии. Оставьте слушатель на loopback, если не настроен подписанный или аутентифицированный вход. Полная конфигурация аутентификации, API и возможностей содержится в `docs/server-reference.md`.

## Включение принятого пути выполнения инструментов на локальном процессе

Выполнение инструментов требует существующей настройки Runtime и рабочего пространства с fail-closed. Как минимум, настройте:

```bash
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_ENABLED='true'
export QWEN_MANAGED_AGENT_RUNTIME_BROKER_TOKEN='<private-random-token>'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY_ID='reference-v1'
export QWEN_MANAGED_AGENT_RUNTIME_CREDENTIAL_KEY='<base64-encoded-32-byte-key>'
export QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY='/var/lib/qwen-managed-agent/runtime'
export QWEN_MANAGED_AGENT_NODE_EXECUTABLE='/usr/bin/node'
export QWEN_MANAGED_AGENT_RUNTIME_WORKER_ENTRY='/opt/qwen-code/dist/cli.js'
export QWEN_MANAGED_AGENT_WORKSPACE_ID='reference-workspace'
export QWEN_MANAGED_AGENT_WORKSPACE_CWD='/srv/qwen-workspace'
export QWEN_MANAGED_AGENT_RUNTIME_VERIFIED_WORKSPACE_RECOVERY_ENABLED='true'
```

Перед допуском работы с файлами, Shell или дочерними Git, выполните регистрацию нативного хранилища и проверку идентичности монтирования, описанную в разделе «Verified physical Workspace recovery» файла `docs/server-reference.md`. Незарегистрированное или неоднозначное монтирование должно оставаться недоступным. Публичная реклама Shell и возможностей v2 остается отключенной до завершения их отдельной квалификации.

## Обновление

1. Загрузите и проверьте новый архив, прочитайте оба манифеста. Подтвердите новые требования Qwen Code/Harness, Java, протокола и базы данных до внесения изменений в работающее развертывание.
2. Остановите новый входной трафик. Дождитесь завершения допущенной работы согласно существующей процедуре дренирования развертывания.
3. Сделайте резервную копию MySQL, `QWEN_MANAGED_AGENT_RUNTIME_STATE_DIRECTORY`, ключа учетных данных Runtime и точной старой сборки. Не ротируйте ключ учетных данных во время обновления.
4. Остановите Java-сервис и Hosted Harness. Сохраните рабочее пространство и долговременное состояние Runtime.
5. Установите совместимую версию Qwen Code/Harness по манифесту и запустите её с существующим токеном и дайджестом возможностей.
6. Запустите новый `bin/qwen-managed-agent-server` с теми же настройками базы данных и долговременными настройками. Flyway выполнит миграцию схемы вперед.
7. Дождитесь здорового ответа actuator, прочитайте существующую сессию и историю, затем выполните один новый ход без инструментов перед открытием входного трафика. Повторно квалифицируйте любую дополнительную возможность инструмента перед её включением.

Понижение версии базы данных не поддерживается. Если запуск или проверка не удались до возобновления трафика, исправьте конфигурацию и повторите попытку с тем же артефактом. Чтобы вернуться к версии, манифест которой имеет более старый диапазон схем, восстановите резервную копию базы данных и состояния Runtime до обновления вместе, прежде чем принимать любую новую запись; никогда не запускайте более старый сервер против мигрированной базы данных по предположению.

## Восстановление оператором

`bin/qwen-managed-agent-operator-recovery` запускает отдельно упакованную точку входа восстановления. Она отключена, если не установлено специфичное для восстановления окружение, и не запускает HTTP-сервис или воркер. Следуйте `docs/hosted-workspace-recovery.md`; никогда не делайте предположений о физической остановке и не удаляйте долговременные строки для обхода страховочного предела.

## Границы области

Данная сборка не сертифицирует множественные управляющие плоскости Java, кросс-хостовый перехват, публичный CSI, вывод из эксплуатации Kubernetes, публичный Shell, рекламу v2 или стабильную производственную поддержку. Эти возможности требуют отдельных доказательств в релизе.