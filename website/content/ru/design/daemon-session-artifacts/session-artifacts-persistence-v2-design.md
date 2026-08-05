# Дизайн персистентности Qwen Code Daemon Session Artifacts V2

Этот документ продолжает V1 session artifact API из PR #5895 и проектирует возможность персистентности V2. Дизайн V1 см. в [session-artifacts-daemon-api-implementation-design.md](./session-artifacts-daemon-api-implementation-design.md) в том же каталоге.

Цель V2 — сделать так, чтобы метаданные artifact можно было восстановить после перезапуска демона и загрузки/воспроизведения (load/replay) сессии, не ломая семантику live session из V1. Текущий PR не копирует, не замораживает и не хостит содержимое artifact; для файлов workspace сохраняются только путь, size, mtimeMs и sha256 — для проверки целостности после восстановления.

## 1. Итоги проектирования

V2 — это фаза персистентности метаданных (metadata persistence). Объём реализации PR #6259 сужен до восстановления метаданных (metadata restore), журнала/снапшота/rebuild/fork remap артефактов в JSONL, восстановления метаданных artifact после перезапуска/загрузки/воспроизведения демона и экспонирования персистентности метаданных через REST/ACP/SDK. Удержание контента (content retention: workspace content pin, управляемые копии в рамках сессии, manifest, квота, TTL, session-scoped GC/fsck) не входит в текущий scope; если в будущем появятся реальные потребности аудита/архивирования, это следует пересмотреть как новый дизайн content archive. Client не должен выводить функциональность из названия фазы «V2» — следует читать возможность (capability).

Текущие возможности:

1. Metadata restore: по умолчанию восстанавливаются структурированные метаданные artifact и ссылки на ресурсы без копирования фактического содержимого.
2. Проверка целостности workspace: при регистрации workspace artifact записываются size + mtimeMs + sha256; при restore / GET по актуальному файлу возвращается `available` / `missing` / `changed`.

Соответствующие capability:

- `session_artifacts_persistence`: поддерживает персистентность метаданных и восстановление при load/replay сессии.
- `session_artifacts_content_retention`: сейчас не заявляется; если дизайн content archive будет перезапущен, заявлять его можно только после того, как будут готовы копирование/хостинг контента, квоты, manifest и GC/fsck.

Ключевые принципы:

- `SessionArtifactStore` из V1 остаётся авторитетным индексом в памяти для live session.
- V2 добавляет JSONL-журнал/снапшот артефактов для seed начального состояния при создании live store на стороне демона; append в JSONL должен выполняться через код core/ACP child, который в данный момент владеет chat recording, — daemon-side store не может писать transcript напрямую.
- V2 по умолчанию JSONL-only. Sidecar-кэш не входит в критерии выпуска V2; только если замеры покажут, что стоимость load session неприемлема, будет отдельно спроектирован удаляемый кэш.
- Содержимое удалённых URL не извлекается локально.
- Файлы workspace по умолчанию не копируются.
- `source`, `clientId`, `trustedPublisher`, переданные client, не считаются основанием для авторизации.
- При восстановлении обязательна повторная валидация; старым метаданным на диске доверять нельзя.

Важные сужения текущего PR:

- Публичный API content retention, managed content store, pin/unpin, deleteContent, quota/manifest/fsck/gc и capability `session_artifacts_content_retention` не поставляются в PR #6259. Текущий PR сохраняет лишь путь совместимости downgrade/strip для старых journal payload с `pinned` / `contentRef`, чтобы старые записи не ломали metadata restore.
- Оставленные ниже детали pin/save, квот контента и managed content GC/fsck — это черновик future content archive, а не wire contract и не критерии приёмки PR #6259; если раздел явно не помечен как PR #6259 HTTP mapping / metadata behavior, реализация не должна экспонировать эти API или capability в #6259.
- Текущие live view и персистентные метаданные используют один и тот же видимый набор из 200 записей. Чтобы избежать over-restore после перезапуска, durable/restorable eviction при превышении лимита пишет remove event с `reason: "eviction"`; это эквивалентно metadata prune в данной реализации, а не чисто V1 live-only hiding.
- Явный DELETE сейчас использует live-first: сначала запись удаляется из live store, при неудаче записи tombstone возвращается warning. Это позволяет прежде всего скрыть чувствительные записи; если демон перезапустится в окне неудачи, этот artifact всё ещё может быть восстановлен из старого журнала, и client должен воспринимать warning как сигнал «удаление не durable».
- Форк сейчас записывает целевой JSONL-файл одной операцией exclusive-create; потоковой записи fork artifact records по одной нет, поэтому `session_artifact_fork_marker` для обнаружения partial batch текущего пути записи не требуется. Если форк станет потоковым, begin/complete marker будут введены тогда.

## 2. Видимая пользователем семантика

### 2.1 Обновление и переключение страницы, перезапуск

Поведение после V2 должно быть таким:

- Обновление страницы: как и в V1 — пока демон/сессия живы, фронтенд просто повторно делает `GET /session/:id/artifacts`.
- Переключение сессии: у каждой live session по-прежнему собственный artifact store.
- Перезапуск экземпляра фронтенда: пока демон жив, можно делать GET текущего live store.
- Перезапуск демона/bridge: если сессия загружена заново, V2 восстанавливает список artifact из персистентных метаданных.
- Загрузка/воспроизведение истории: если у сессии есть V2 persistence records, восстанавливается список artifact; иначе возвращается пустой список.

Live upgrade с V1 на V2 требует отдельной обработки: у V1 live artifacts, уже находящихся в памяти, нет JSONL-журнала. Когда V2 впервые обращается к этим live sessions, следует через artifact persistence writer, предоставленный владельцем chat recording, записать начальный `session_artifact_snapshot` и лишь затем принимать новые restorable artifact mutation. Backfill не должен сериализовать live store как есть; для каждого artifact необходимо заново выполнить ingest validation, минимизацию приватности и материализацию `retention`. Негодную единичную запись следует пропустить или понизить — одна плохая запись не должна обрушить весь backfill. Если writer недоступен или backfill целиком не удался, сессия продолжает поведение V1 live-only и записывается structured warning; нельзя вводить пользователя в заблуждение, будто существующие live artifacts уже восстанавливаемы.

Backfill не должен потоково писать artifact events в JSONL по одному. Реализация обязана сначала завершить в памяти валидацию, минимизацию и downgrade, сформировать полный candidate snapshot и лишь затем одним append добавить `session_artifact_snapshot`. Если построение candidate или append снапшота не удалось, частичного durable artifact state остаться не должно. Текущий PR не реализует backfill live-store V1; если он будет добавлен позже, число записей в candidate, число пропущенных записей и причины неудач валидации следует писать в структурированную телеметрию или метаданные снапшота, чтобы fsck и restore warning могли отличить «полный, но часть записей пропущена валидацией» от «частично записан/повреждён».

### 2.2 Уровни retention

Новое опциональное поле. Публичный mutation path в PR #6259 принимает только `ephemeral` и `restorable`; `pinned` из старых журналов при restore / форке понижается до metadata-only `restorable`:

```ts
type ArtifactRetention = 'ephemeral' | 'restorable';
```

Значения:

- `ephemeral`: существует только в live store. После исчезновения демона/сессии не восстанавливается.
- `restorable`: метаданные пишутся в персистентный журнал. После load/replay сессии восстанавливается как artifact item, но наличие нижележащего ресурса не гарантируется.

Правила по умолчанию:

- Tool result, `record_artifact`, hook artifact: по умолчанию `restorable`, но персистентны только метаданные.
- Client POST artifact, зарегистрированные пользователем вручную в интерактивном фронтенде: по умолчанию `restorable`, после восстановления продолжают появляться в списке artifact.
- Фоновые/автоматизированные client POST: если это лишь временное UI-состояние, следует явно запрашивать `retention: "ephemeral"`; SDK должен предоставлять явный ephemeral helper.
- `published` artifact: по умолчанию `restorable`; сейчас восстанавливается только published locator, контент не хостится.

Если chat recording отключена, персистентность метаданных по умолчанию отключена, capability не заявляется.

### 2.3 Семантика восстановления artifact, зарегистрированных пользователем

Artifact, зарегистрированные пользователем вручную, после восстановления V2 должны продолжать существовать, но восстанавливается «artifact metadata item», а не безусловный бэкап контента.

Результат после восстановления различается по состоянию ресурса:

- `external_url`: восстанавливаются title, description, url, metadata. Демон не обращается к удалённым URL; открывается ли URL ещё, решает client при клике.
- `workspace`: восстанавливаются workspacePath и metadata; если файл всё ещё в workspace и size + mtimeMs не изменились, либо mtime изменился, но sha256 совпадает с зарегистрированным, — `status: "available"`; если файл удалён, перемещён или symlink выходит за пределы — `status: "missing"`; если файл ещё есть, но size или sha256 отличаются от зарегистрированных — `status: "changed"`.
- `managed`: восстанавливается managedId; `available` только если manifest managed storage всё ещё разрешим.
- `published`: восстанавливается published locator; published trust сохраняется только если проверка trusted publisher manifest по-прежнему проходит.

Итак, ответ на вопрос «существует ли artifact, зарегистрированный пользователем, после восстановления?»: в V2 он должен быть в списке, если только пользователь не выполнил DELETE, метаданные не уничтожены GC/tombstone, валидация восстановления не обнаружила, что запись повреждена настолько, что её нельзя безопасно отобразить, либо не отключены chat recording / persistence. Откроется ли нижележащий контент, зависит от типа storage и актуального состояния ресурса; файлы workspace демоном не резервируются, а `changed` предотвращает тихое открытие неверной версии.

Демон не может определять «вручную» или «фоном» только по request payload. На реализации источник интерактивной регистрации должен обозначаться connection principal, SDK helper или UI action path; client, чьё интерактивное намерение не подтверждено, обрабатывается по явному `retention`, по умолчанию по-прежнему принимается `restorable`, но с ограничениями квоты метаданных сессии и журналом аудита.

## 3. Модель данных

### 3.1 Расширение public artifact

V2 добавляет опциональные поля к response artifact из V1:

```ts
interface DaemonSessionArtifact {
  // V1 fields...
  status: 'available' | 'missing' | 'changed';
  retention?: 'ephemeral' | 'restorable';
  persistedAt?: string;
  restoreState?: 'live' | 'restored' | 'unverified' | 'blocked';
  persistenceWarning?:
    | 'persistence_unavailable'
    | 'metadata_only_restore'
    | 'restore_validation_failed'
    | 'sticky_override_active';
  metadata?: {
    'qwen.workspace.sha256'?: string;
    'qwen.workspace.mtimeMs'?: number;
    [key: string]: string | number | boolean | null | undefined;
  };
}
```

Описание полей:

- `retention`: уровень персистентности artifact. Порядок разрешения: явное значение в теле запроса имеет приоритет; системные внутренние artifact подчиняются политике демона по умолчанию из §2.2; если client POST не указал значение — используется настроенный пользователем `defaultRetention`; без конфигурации откат к `restorable`. Только если persistence capability не заявлена или читаются записи эпохи V1, обрабатывается как V1-совместимый live-only. V2 writer при записи журнала обязан материализовать `retention` и не может полагаться на опциональное значение по умолчанию.
- `persistedAt`: время последнего успешного сохранения метаданных на диск.
- `restoreState`: подсказка источника восстановления; не заменяет `status`.
- `persistenceWarning`: неблокирующие риски персистентности/восстановления; фронтенд может использовать его для состояний вида «этот artifact не сохранится после перезапуска». Текущая wire shape — фиксированная строка, чтобы в response не попадали абсолютные пути хоста, credential, токены, внутренние storage path или connection id. Более структурированный `{ code, message }` может быть добавлен позже как совместимое расширение.
- `status: "changed"`: только для workspace artifact. Демон при регистрации пишет `sizeBytes`, `metadata["qwen.workspace.sha256"]` и `metadata["qwen.workspace.mtimeMs"]`; refresh после GET/list/restore сначала делает stat текущего файла: при изменении size сразу возвращается `changed`, при неизменных size/mtime файл не перечитывается, и только если mtime изменился при том же size, в качестве страховки пересчитывается sha256.

### 3.2 Связь status и restoreState

`status` из V1 по-прежнему отражает доступность текущего ресурса:

- `available`
- `missing`
- `changed`

V2 добавляет лишь одно новое состояние целостности workspace — `changed`. Оно означает, что путь всё ещё доступен, но size актуального файла изменился, либо после изменения mtime sha256 расходится с зарегистрированными метаданными. `blocked` — это не `status`, а только `restoreState`:

- `restored`: восстановлено из персистентных метаданных.
- `unverified`: метаданные восстановлены, но проверка workspace/managed ещё не завершена.
- `blocked`: при восстановлении обнаружено нарушение границы безопасности, например выход workspace path за пределы.
- `live`: создано заново в текущем процессе либо подтверждено refresh.

## 4. Дизайн персистентного хранилища

### 4.1 JSONL-only как единственный источник истины

V2 по умолчанию использует только системные записи Chat JSONL:

1. Журнал JSONL — источник для аудита, восстановления и миграции между версиями.
2. `session_artifact_snapshot` — точка ускорения восстановления внутри JSONL, а не отдельный файл.
3. Sidecar-кэш в V2 не вводится. Sidecar добавляет проблемы синхронизации путей, проверки устаревания, связки archive/unarchive/delete, GC сирот и доверия к кэшу; текущий load session и так читает JSONL, и artifact records можно извлечь в том же проходе parse.

Если будущие замеры покажут, что sidecar нужен, он должен войти отдельным дизайном и удовлетворять двум ограничениям:

- Sidecar может быть только удаляемым кэшем и не может нести корректность протокола.
- Даже при попадании в sidecar для каждого artifact должна выполняться валидация восстановления; обходить JSONL restore validation нельзя.

Sidecar не является correctness requirement для персистентности V2. Текущий `loadSession()` для восстановления читает полный JSONL сессии и перестраивает дерево диалога; когда artifact restore извлекает записи снапшота/event в том же проходе чтения, дополнительного файлового I/O не возникает. Поэтому sidecar в текущей архитектуре может сэкономить лишь небольшие затраты на parse/replay artifact records, но не устраняет основные затраты чтения load session.

Включение sidecar в текущий PR заметно расширит поверхность реализации:

- Порядок двойной записи JSONL и sidecar, fsync и crash recovery.
- Проверка, инвалидация и fallback для stale/corrupt sidecar.
- Синхронизация жизненного цикла sidecar при archive/unarchive/delete/fork/remap.
- Доверие к sidecar и граница безопасности: может ли он обойти restore validation.
- Очистка sidecar/кэша-сирот и дополнительная тестовая матрица.

Поэтому критерии выпуска V2 остаются JSONL-only. Sidecar войдёт отдельным дизайном лишь после того, как profiling или продуктовые требования обоснуют любое из условий:

- `loadSession()` больше не требует чтения полного JSONL, и sidecar позволяет избежать полного сканирования при холодном старте.
- Список artifact должен отображаться с холодного старта без загрузки истории сессии.
- Замеры показывают, что восстановление artifact, а не перестроение истории диалога, становится основной статьёй времени load session.
- Требуется поиск artifact между сессиями/проектами или глобальный индекс.

### 4.2 Владение writer JSONL и модель веток

Artifact persistence records — часть chat transcript и должны соблюдать существующую parent/leaf-семантику `ChatRecord`:

- Append в JSONL может выполняться только процессом, владеющим `ChatRecordingService.appendRecord`, либо через явно экспонированный им RPC. Daemon-side `SessionArtifactStore` может координировать порядок live state, SSE и persistence request через operation queue, но не может сам открывать и писать chat JSONL.
- Каждая запись `session_artifact_event` / `session_artifact_snapshot` должна прикрепляться к текущему conversation leaf как обычная системная `ChatRecord` и получать штатные `uuid` / `parentUuid`.
- Chat tree builder и renderer должны трактовать системные записи `session_artifact_*` как side-effect records: они участвуют в порядке parent/leaf и в воспроизведении, но не рендерятся в видимые пользователю conversation node. Минимально необходимо, чтобы даже старые версии при загрузке JSONL с записями V2 трактовали неизвестный системный subtype как opaque/ignored side effect, а не роняли load session.
- Load/replay сессии применяет только artifact records из active leaf chain. Artifact upsert/remove, отправленные `/rewind` в заброшенную ветку, больше не влияют на текущий список artifact.
- При `/rewind` или любом leaf switch daemon-side live `SessionArtifactStore` должен заново выровняться по artifact state новой active-chain: либо сделать reseed из результата воспроизведения active-chain, либо в ходе операции rewind записать top-up текущего снапшота артефактов в выжившую цепочку. V2 по умолчанию принимает branch-scoped семантику; мутации вне ветки не должны оставаться в live flat map в ожидании исчезновения при следующем перезапуске.
- fork/branch копирует только artifact records из active chain; записи вне цепочки не участвуют в восстановлении целевой сессии.
- Если фаза реализации ещё не может подключать системные записи артефактов к active leaf chain, она не должна заявлять capability `session_artifacts_persistence`; иначе после rewind будут воскресать старые upsert или старые tombstone.

Это означает, что V2 не проектирует отдельный файл artifact log и не проектирует side log в обход chat tree. Корректность персистентности artifact проистекает из одной и той же active chat history, а не из текущего состояния памяти демона.

### 4.3 Системные записи JSONL

В `ChatRecord.subtype` добавляются:

```ts
'session_artifact_event' | 'session_artifact_snapshot';
```

Payload:

```ts
interface SessionArtifactEventRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  changes: Array<{
    action: 'created' | 'updated' | 'removed';
    artifactId: string;
    artifact?: PersistedSessionArtifact;
    reason?: 'explicit' | 'eviction' | 'unpin_to_ephemeral';
  }>;
}

interface SessionArtifactSnapshotRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  artifacts: PersistedSessionArtifact[];
  tombstonedIds?: string[];
  stickyEphemeralIds: string[];
}

type PersistedSessionArtifact = Pick<
  DaemonSessionArtifact,
  | 'id'
  | 'kind'
  | 'storage'
  | 'source'
  | 'status'
  | 'title'
  | 'description'
  | 'workspacePath'
  | 'managedId'
  | 'url'
  | 'mimeType'
  | 'sizeBytes'
  | 'metadata'
  | 'createdAt'
  | 'updatedAt'
> & {
  retention: ArtifactRetention;
  persistedAt: string;
  clientRetained: boolean;
  toolCallId?: string;
  toolName?: string;
  hookEventName?: string;
};
```

`sequence` — это durable счётчик мутаций внутри artifact store каждой сессии; он используется для упорядочивания снапшотов/event и диагностики аномалий. При восстановлении приоритет по-прежнему у порядка active JSONL chain; `sequence` не служит для межсессионной авторизации и не является глобальным источником упорядочивания.

`PersistedSessionArtifact` должен быть позитивным allowlist (явный `Pick` или отдельный интерфейс), а не негативным исключением `Omit<DaemonSessionArtifact, ...>`. Если в будущем `DaemonSessionArtifact` получит новые runtime-only поля, compile-time-утверждения должны требовать от мейнтейнера явно решать, включать ли их в persisted allowlist, чтобы избежать загрязнения схемы.

Пишется только минимизированная форма artifact, прошедшая валидацию/нормализацию store. Помимо `clientRetained` и подсказок отображения tool/hook, не пишутся внутренние поля V1 и поля, выведенные в рантайме:

- не пишется `identityKey`
- не пишется `trustedPublisher`
- не пишется абсолютный `workspaceCwd`
- не пишутся transport token / auth principal
- не пишется `restoreState`
- не пишется `persistenceWarning`
- не пишется `clientId` или owner principal live-процесса; `source` служит лишь подсказкой отображения/аудита и не может использоваться для авторизации

Удаление artifact обязано писать tombstone change, чтобы после воспроизведения истории запись не воскресла старым upsert. Tombstone не запрещает навсегда повторное появление того же id: он лишь перекрывает собственные предшествующие upsert, пока не появится явный upsert с более высоким sequence. `reason: "unpin_to_ephemeral"` из старых журналов продолжает работать как совместимость sticky override: последующие неявные/default upsert того же artifact id по-прежнему обрабатываются как live-only, и только запрос с явным `retention: "restorable"` через аутентифицированный REST/ACP mutate route может его заместить; ни tool/hook/background/default retention, ни restore backfill, ни неявный re-ingest не могут заместить sticky override.

Sticky override не может существовать только в исторических tombstone event. Snapshot writer обязан записывать состояния `unpin_to_ephemeral`, ещё не замещённые явно, в `stickyEphemeralIds`; restore reader сначала восстанавливает sticky set из снапшота, затем применяет upsert/remove после снапшота. Иначе после продвижения базовой линии снапшота старые tombstone больше не нужно воспроизводить, и sticky override теряется.

### 4.4 Инварианты снапшота и tombstone

Снапшот артефактов лишь уменьшает число применяемых при воспроизведении artifact event; он не уменьшает объём чтения самого файла JSONL.

Должно выполняться:

- Генерация снапшота должна выполняться серийно в одной и той же artifact operation queue и строго после всех предшествующих мутаций.
- Снапшот — авторитетное текущее состояние: он содержит только те артефакты, которые действительны на момент генерации снапшота.
- `tombstonedIds` записывает только tombstone, которые после снапшота всё ещё должны перекрывать старые upsert; старые tombstone, перекрытые снапшотом, не попадают в payload нового снапшота, чтобы массив не рос бесконечно вместе с историей.
- `stickyEphemeralIds` записывает artifact id, всё ещё находящиеся под sticky ephemeral override, даже если соответствующий старый tombstone больше не нужно воспроизводить — состояние override должно сохраняться.
- `stickyEphemeralIds` должен быть ограничен; по умолчанию он того же порядка, что и лимит персистентных метаданных `maxPersistedMetadata`, и учитывается в working-set budget журнала артефактов. Если воспроизведение старого журнала `unpin_to_ephemeral` превысит лимит sticky set, restore/prune обязан записать warning и повторить попытку позже; нельзя молча расти, случайно обрезать старые sticky override или позволять неявным upsert восстанавливать персистентность.
- Снапшот может содержать artifact id, ранее tombstoned, при условии, что этот tombstone уже замещён явным upsert с более высоким sequence.
- При загрузке от новых к старым выбирается новейший валидный снапшот, после чего применяются только artifact events после него.
- Если новейший снапшот не распарсивается, записывается warning `snapshot_invalid` и пробуется предыдущий валидный снапшот; один повреждённый снапшот не должен терять метаданные артефактов всей сессии.
- Если валидных снапшотов нет вовсе, разрешается однократное последовательное воспроизведение artifact event по active JSONL leaf chain. Изолированные повреждённые artifact records пропускаются с записью warning; записи персистентности артефактов сессии отбрасываются только тогда, когда порядок веток, record envelope или состояние tombstone уже не позволяют установить достоверный порядок.

Продвижение базовой линии снапшота (snapshot baseline advance) здесь не переписывает и не удаляет старые записи в JSONL. Старые `session_artifact_snapshot`, event и tombstone остаются в append-only chat transcript; подсистема артефактов лишь продвигает базовую линию восстановления внутри payload новейшего снапшота и сбрасывает счётчик рабочего набора.

### 4.5 Потребление хранилища

V2 не пишет двойную запись в sidecar, поэтому дублирования метаданных JSONL + sidecar нет. Потребление хранилища делится на журнал метаданных и content retention:

- Одна запись метаданных обычно ~0,5–2 КБ в зависимости от размеров title, description, url и metadata.
- Лимит действительных персистентных метаданных на сессию по умолчанию выровнен с live store — 200 записей; один снапшот ~100–400 КБ.
- Журнал JSONL хранит инкрементальные события, снапшоты и tombstone; сам append-only chat transcript растёт.
- Content retention — главный источник объёма, например 50 МБ на artifact, 200 МБ на сессию, 1 ГБ на проект.

Стратегии контроля:

- Когда журнал artifact event достигает фиксированного порога, пишется `session_artifact_snapshot` — например, раз в 100 мутаций артефактов или раз в 256 КБ журнала артефактов.
- Artifact persistence records следуют жизненному циклу chat transcript; отдельный файловый GC не выполняется.
- На сессию добавляется working-set byte budget журнала артефактов, например 4 МБ. Этот budget измеряет рабочий набор артефактов, который необходимо прочитать и применить при восстановлении, то есть новейший валидный снапшот плюс artifact events после него; старые artifact records в chat transcript, уже перекрытые снапшотом, нельзя включать в budget, иначе append-only JSONL станет невосстанавливаемым одноразовым лимитом.
- Writer должен явно отслеживать байты рабочего набора: после каждой записи снапшота фиксировать размер снапшота в байтах артефактов, позицию append в JSONL или индекс строки как `postSnapshotBase`, после чего каждый append artifact event увеличивает `postSnapshotEventBytes`. Проверка budget использует `snapshotBytes + postSnapshotEventBytes`; после успешного продвижения базовой линии снапшота счётчик сбрасывается. Если writer не может подтвердить позицию базы или состояние счётчика, он обязан консервативно записать новый снапшот; если подтвердить всё равно не удаётся — downgrade или ошибка, бесконечное дописывание недопустимо.
- Когда budget близок к лимиту, сначала пробуется запись нового снапшота. Если новейший снапшот плюс post-snapshot events всё равно превышают budget, новые restorable-метаданные больше не пишутся, обычные артефакты понижаются до `ephemeral` с `persistenceWarning.code = "journal_budget_exceeded"`.
- Байты контента не пишутся в JSONL; PR #6259 также не пишет daemon-managed хранилище контента артефактов.

## 5. Процессы записи и восстановления

### 5.1 Валидация при ingest

Любой artifact перед попаданием в live store и JSONL обязан проходить ingest-time validation; валидации только при восстановлении недостаточно:

- `workspacePath`: должен быть относительным путём; после resolve/realpath не должен выходить за пределы текущего workspace.
- `url`: проверяются scheme, userinfo, secret-like query/fragment в соответствии с типом storage.
- `managedId`: отклоняются формы пути, `..`, абсолютные пути, разделители.
- `published`: может создаваться только внутренним trusted publisher демона или путём, прошедшим проверку manifest; client payload не может заявлять его сам.
- Старые `contentRef` / `expiresAt`: принимаются только как входные данные legacy журнала; при появлении в client payload их необходимо отклонить или вырезать, текущий PR не должен генерировать новые поля.
- `restoreState` / `persistenceWarning`: runtime-only поля ответа; при появлении в client payload их необходимо отклонить или вырезать, в персистентный artifact они не пишутся.
- `clientRetained`: может быть только boolean, означает намерение пользователя сохранить запись и подсказку стабильной сортировки, а не сигнал авторизации. Установить могут только явные действия REST/SDK/UI; фоновый автоматический ingest не может подделывать его под сохранение пользователем.
- `metadata`: выполняются проверки primitive-only, лимит размера, secret key/value и небезопасный display payload.

При неудаче валидации:

- Явно злонамеренный или выходящий за границы ввод: запрос отклоняется.
- Вероятно содержит чувствительные locator, но пользователь хочет отображать live artifact: можно понизить до `ephemeral` и записать `persistenceWarning.code = "validation_downgraded"`; в JSONL писать нельзя.

### 5.2 Процесс записи artifact

Процесс V1:

```text
ingest input -> normalize/validate -> upsert live store -> publish artifact_changed
```

Процесс V2:

```text
ingest input
  -> normalize/validate
  -> in SessionArtifactStore operationQueue: compute effective mutation
  -> for restorable changes: request chat-recording writer append
     artifact journal/snapshot on the active leaf chain
  -> apply live-store mutation
  -> publish artifact_changed with effective retention/warning fields
```

Operation queue `SessionArtifactStore` отвечает за сериализацию порядка live мутаций, persistence request и SSE одной сессии; фактический append в JSONL по-прежнему выполняет владелец chat recording. Обычные tool/hook артефакты при недоступном persistence writer могут быть понижены до live-only `ephemeral`, после чего попадают в live store.

Если sticky ephemeral override подавил персистентность неявного/default upsert, live artifact обязан нести `persistenceWarning.code = "sticky_override_active"`, а также structured log `action=sticky_override_suppressed` и counter metric. Иначе при разборе инцидентов будет виден законный ввод upsert, но не будет найден соответствующий durable record.

В текущем PR нет скрытого постраничного представления персистентных метаданных; live list и есть набор метаданных, экспонируемый client после восстановления. Поэтому обработка лимита использует суженную стратегию:

- `ephemeral` artifact можно просто выбросить из live view, не записывая в журнал.
- Когда `restorable` artifact обрезается лимитом, пишется remove event с `reason: "eviction"`, чтобы следующая загрузка/воспроизведение не воскресила все обрезанные записи.

### 5.3 Семантика отказа записи

Различаются две точки входа:

- Обычный tool/hook artifact: неудача персистентности не должна ронять вызов инструмента; artifact всё равно может попасть в live store, но сначала нужно понизить `retention` в live store до `ephemeral`, установить `persistenceWarning` и лишь затем публиковать `artifact_changed`.
  Для мутаций удаления, влияющих на результат восстановления, текущий PR различает причины:

- `eviction`: durable remove event, гарантирует соблюдение лимита в 200 записей и после перезапуска.
- legacy unpin-to-`ephemeral`: при чтении старого журнала durable remove event по-прежнему распознаётся, а id записывается в ограниченный `stickyEphemeralIds`; последующие неявные/default upsert остаются live-only, пока их не заместит явный `retention: "restorable"`.
- Явный DELETE: live-first. Сначала запись удаляется из live store и публикуется событие удаления, затем по мере возможности (best-effort) пишется explicit remove tombstone. Если запись tombstone не удалась, в ответе возвращается warning (сейчас — строковый warning), означающий, что удаление не durable; если демон перезапустится до успешной дозаписи, старый журнал всё ещё может восстановить этот artifact.
- `deleteContent: true` не входит в публичный API PR #6259. Content GC и контракт warning будут определены в follow-up по content-retention; явный DELETE текущего PR обрабатывает только metadata tombstone и live removal.

Рекомендуемые warning:

```text
[artifacts] session=<id> action=persist_failed artifact=<id> reason=<code>
[artifacts] session=<id> action=remove_not_persisted artifact=<id>
[artifacts] session=<id> action=sticky_override_suppressed artifact=<id> prior_reason=unpin_to_ephemeral
```

### 5.4 Процесс восстановления

При load/replay сессии:

1. `SessionService.loadSession()` читает JSONL и в том же проходе parse извлекает записи снапшотов/event артефактов.
2. На основе active leaf chain извлекается новейший валидный `session_artifact_snapshot` и последующие `session_artifact_event`. Artifact records в заброшенных ветках игнорируются.
3. Перестраивается снапшот артефактов, применяются tombstone.
4. Для каждого artifact заново выполняется V2 restore validation.
5. Результат загрузки несёт `artifactSnapshot` обратно в daemon-side bridge.
6. Daemon bridge при `createSessionEntry` / завершении восстановления инициализирует снапшотом `SessionArtifactStore` на стороне демона.
7. `GET /session/:id/artifacts` читает именно этот store на стороне демона.

Не сейдите `SessionArtifactStore` в объектах agent/session дочернего процесса ACP: store, видимый через production HTTP API, создаётся в daemon-side bridge.

`loadSession()` обязан быть read-only: он не может писать tombstone в процессе парсинга и не может напрямую запускать content GC. Если после восстановления выясняется, что текущий live cap или политика строже исторических, store на стороне демона после создания и при доступном persistence writer запишет remove event `eviction` через штатный operation queue; при недоступном writer записи сверх лимита лишь скрываются в live view с записью warning — следующая загрузка снова может увидеть эти ожидающие обрезки записи.

Обработка live store при rewind/воспроизведении должна совпадать с загрузкой: как только active leaf меняется, flat live store не может дальше удерживать мутации артефактов вне ветки. Если в текущей реализации нет результата воспроизведения active-chain для прямого reseed, необходимо в момент завершения rewind записать top-up снапшот артефактов, иначе capability persistence включать нельзя.

Конкретная точка интеграции должна быть явным hook, а не ленивым исправлением при следующем GET. Рекомендуется, чтобы реализация rewind/leaf-switch вызывала `onActiveLeafChanged(sessionId, artifactSnapshot)` daemon bridge либо несла эквивалентное событие в существующем результате load/replay сессии; artifact store по получении выполняет reseed или записывает top-up снапшот в operation queue той же сессии.

### 5.5 Валидация при восстановлении

При восстановлении обязательна повторная валидация:

- `workspacePath`: по-прежнему должен быть относительным путём, заново resolve/realpath/stat по workspace root на момент восстановления, не должен выходить за пределы текущего workspace. После перемещения workspace, если тот же относительный путь существует, восстанавливается как `available`; если файл отсутствует или layout нового workspace несовместим — `missing`. V2 не делает автоматический remap путей.
- `external_url`: разрешены только `http:` / `https:`; credential вида username/password отклоняются; secret-like query/fragment должны маскироваться (redact), понижаться до неоткрываемого locator, либо весь artifact понижается/блокируется.
- `published`: `file:` locator можно восстановить, но только если повторная проверка trusted publisher manifest прошла и цель относится к daemon-managed published storage. Обычный `external_url` никогда не может пройти как `file:`.
- `managedId`: отклоняются формы пути, `..`, абсолютные пути, разделители.
- Старый `contentRef`: валидируется только как входные данные legacy журнала и вырезается; PR #6259 не разрешает контент через daemon-managed manifest и не экспонирует старый `contentRef` как обещание открываемого контента.
- `metadata`: повторно выполняются проверки primitive-only, лимит размера, secret key/value и небезопасный display payload.

При неудаче восстановления:

- Сбой безопасности: запись сохраняется, но с `restoreState: "blocked"`, `status: "missing"`, открываемый locator не предоставляется.
- Отсутствие ресурса: `status: "missing"`.
- Повреждение полей без нарушения безопасности: artifact пропускается с записью warning.

### 5.6 Семантика веток / форка

Существующий `/branch` копирует active JSONL record chain и переписывает `sessionId`. V2 artifact records копируются только из active leaf chain; artifact records, оставшиеся в заброшенной ветке после rewind, в форк не попадают. При копировании artifact id должен обрабатываться явно:

- Один и тот же ресурс в новой сессии должен получить новый artifact id, поскольку identity V1 включает `sessionId`.
- При записи форка в целевую сессию artifact id следует пересчитывать по целевому `sessionId + locator`.
- Tombstone также переписываются по новому id целевой сессии. Если artifact id tombstone можно безопасно переназначить (remap), его следует сохранить в целевую сессию, даже если в active chain цели временно не находится соответствующего upsert; orphan tombstone без совпадающего upsert безвреден, но его потеря может лишить подавления последующий upsert с тем же id.
- `forkedFrom` может записывать исходный session id / исходный artifact id как информацию аудита, но не может участвовать в принятии решений о правах новой сессии.
- При наследовании форком метаданных старого `pinned` artifact их необходимо понизить до `restorable` и удалить старый `contentRef`.
- Копия форка обязана заново выполнять ingest/restore validation, минимизацию приватности и маскирование (redaction). Locator в workspace / url / metadata, которые нельзя безопасно выразить в целевой сессии, должны быть понижены, вырезаны или отброшены — копировать только потому, что исходная сессия когда-то прошла валидацию, нельзя.
- `managedId` нельзя вслепую копировать из исходной сессии. Если в целевой сессии новый `managedId` можно вывести из целевого workspace / daemon-managed manifest, его необходимо пересчитать; если безопасный вывод невозможен — `managedId` удаляется либо отбрасываются сами метаданные artifact.

Fork remap — критерий выпуска: если какой-либо путь не может безопасно переписать artifact id и tombstone, то при форке artifact persistence records должны быть отброшены; переносить artifact id исходной сессии в новую сессию как есть нельзя. Если существующая реализация форка имеет top-up-механизм вроде `file_history_snapshot`, артефакты также могут генерировать top-up только из результата воспроизведения active-chain, а не дописываться как есть из текущего live store демона, иначе в новую сессию попадут артефакты, не принадлежащие истории после rewind.

Текущая реализация форка не дописывает по одной записи: сначала из active chain источника генерируется полный список целевых записей, затем целевой JSONL-файл записывается через exclusive-create; при неудаче записи файл целевой сессии не считается успешным форком. Поэтому текущий PR не пишет `session_artifact_fork_marker`. Если форк станет потоковым append или пакетным копированием между процессами, тогда будут добавлены begin/complete marker, проверка счётчика и правила восстановления `fork_incomplete`.

Семантика rewind форка — branch-scoped: целевая сессия копирует только результат текущей active chain. Если пользователь сделает rewind до явного DELETE и затем форк, этот DELETE tombstone и так не находится в active chain, и повторное появление artifact в новой ветке — ожидаемое поведение исторического ветвления. Если продукту потребуется «глобально невозвратимое удаление» или семантика приватного стирания, это должно быть отдельным дизайном политики, не смешиваемым с дефолтной моделью веток V2.

Форк-амплификация метаданных в V2 принимается как ограниченный trade-off: форк требует прав на мутацию сессии, каждый форк ограничен лимитом в 200 персистентных метаданных, одна запись метаданных невелика, а байты контента не наследуются. V2 не вводит project-level квоту метаданных; реализация обязана записывать метрику/лог числа форкнутых артефактов, и если возникнет реальное злоупотребление, вводится project-level cap.

## 6. Дизайн API

### 6.1 Capability

В `GET /capabilities` добавляется:

```json
"session_artifacts_persistence"
```

Одновременно заявляется, лишь когда станет доступна реализация в отдельном PR content retention:

```json
"session_artifacts_content_retention"
```

Текущий `/capabilities` — это строковый список feature, поэтому `enabled: false` нельзя выразить как «реализация существует, но сейчас выключена». Правила:

- Соответствующая feature-строка заявляется только если поведение доступно и включено текущей конфигурацией.
- Если chat recording отключена, персистентность метаданных отключена или writer недоступен — `session_artifacts_persistence` не заявляется.
- `session_artifacts_content_retention` заявляется только когда доступны явное сохранение контента workspace, квоты, manifest и session-scoped GC/fsck будущего content archive. PR #6259 эту capability не заявляет.
- Если client нужно читать лимиты/default retention, следует спроектировать отдельный config endpoint или SDK config query; не примешивайте структурированные детали к существующему строковому контракту capability.

### 6.2 Добавление artifact

`POST /session/:id/artifacts` допускает опционально:

```json
{
  "title": "Report",
  "kind": "html",
  "storage": "workspace",
  "workspacePath": "reports/run.html",
  "retention": "restorable",
  "clientRetained": true
}
```

Ограничения:

- Client может запросить `ephemeral` или `restorable`.
- Client не может запросить `pinned`.
- `clientRetained` опционален, означает лишь намерение пользователя сохранить запись и подсказку сортировки; сервер обязан валидировать источник по §5.1 и не может считать это авторизацией.

### 6.3 Pin/save artifact

PR #6259 не экспонирует endpoint pin/save. Явное архивирование контента, content archive, семантика pin/save — при необходимости в будущем следует перепроектировать на основе новых продуктовых требований; их нельзя выводить из текущего контракта персистентности метаданных этого документа.

### 6.4 Unpin

PR #6259 не экспонирует endpoint unpin и не генерирует новые unpin tombstone. `reason: "unpin_to_ephemeral"` из старых журналов продолжает воспроизводиться только как совместимый ввод, чтобы не менять семантику восстановления истории. Для удаления из списка по-прежнему используется V1 DELETE.

### 6.5 Удаление artifact

DELETE в V2 остаётся идемпотентным, как в V1, и принимает live-first семантику текущего PR:

- Сначала artifact удаляется из live store, чтобы видимое пользователю удаление срабатывало немедленно.
- Затем по мере возможности добавляется remove tombstone `session_artifact_event`; после успешного tombstone запись не воскресает при восстановлении метаданных.
- При неудаче tombstone возвращается успешный результат мутации, но с warning; в текущем жизненном цикле демона этот artifact уже удалён, но если демон перезапустится до персистентности tombstone, старый durable artifact всё ещё может быть восстановлен. Пользователь или вышестоящий UI может повторить DELETE после восстановления storage.
- DELETE для несуществующего artifact остаётся идемпотентно успешным; если durable tombstone уже есть, повторный DELETE не обязан писать тот же tombstone снова.
- DELETE в PR #6259 не принимает `deleteContent` и не запускает daemon-managed content GC; старые метаданные `contentRef` лишь понижаются или удаляются при восстановлении/сериализации.

### 6.6 Ответы на mutation

PR #6259 поставляет только ответ на mutation DELETE.

Успех:

- DELETE: `200 OK` возвращает `{ "deleted": true, "artifactId": string, "warnings"?: [...] }`.
- При неудаче персистентности DELETE tombstone по-прежнему возвращается результат мутации `200 OK`, а в `warnings` включается причина неудачи персистентности; текущая реализация использует строковый warning, например `remove_not_persisted`. Это значит, что live-удаление сработало, но не гарантировано после перезапуска; его нельзя показывать как успешное durable-удаление.

Отказ:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "retention must be ephemeral or restorable"
  }
}
```

HTTP mapping PR #6259:

- `400 VALIDATION_FAILED`: некорректное тело, client запрашивает `pinned`, artifact не существует, квота метаданных заполнена и нет записей для обрезки, либо writer недоступен, а мутация обязана завершиться строго durable.
- `403 FORBIDDEN`: нет прав на мутацию сессии.
- DELETE остаётся идемпотентным; несуществующий artifact возвращает пустой результат мутации, а не ошибку.
- Неудача персистентности DELETE tombstone возвращает `200 OK` + warning, поскольку текущее live-удаление уже сработало, но не гарантировано после перезапуска.

Более детальные коды ошибок HTTP `INVALID_ARGUMENT`, `NOT_FOUND`, `CONFLICT`, `METADATA_QUOTA_EXCEEDED`, `QUOTA_EXCEEDED` или `PERSISTENCE_UNAVAILABLE` — последующая полировка API, не wire contract текущего PR.

## 7. Дизайн безопасности

### 7.1 Принципы авторизации

Не считайте публичный `clientId` границей авторизации. Реальная граница доверия HTTP в V2 по-прежнему bearer token демона + read/mutate permission на уровне route; в существующей модели auth `session_owner` нельзя безопасно выпустить (mint) или персистентно сохранить между перезапусками демона. Поэтому V2 не вводит уровень owner сильнее держателя токена.

Внутренние principal используются только для аудита, политики по умолчанию и предотвращения спуфинга payload; это не durable источник авторизации:

```ts
type ArtifactPrincipal =
  | { kind: 'token_holder' }
  | { kind: 'client_connection'; id: string }
  | { kind: 'trusted_publisher'; id: string }
  | { kind: 'hook'; extensionId: string };
```

Правила авторизации:

- list: требуется read-право на сессию.
- add ephemeral/restorable: требуется mutate-право на сессию.
- delete metadata: требуется mutate-право на сессию. Same-principal delete guard из V1 может служить лишь live-process UX guard и подсказкой аудита; он зависит от текущего контекста подключения и не может доказать владельца artifact после перезапуска демона. После восстановления ownership нельзя подделать из публичного `clientId`, авторизация удаления редуцируется до session-level mutate-права с записью аудита `ownership_unverified`.
- content archive / delete content: в текущем PR не включено. Если content archive будет перезапущен в будущем, потребуются mutate-право на сессию, отдельная capability, явный вызов REST/SDK и проверяемое текущим процессом совпадение creator-principal либо явная override/admin-политика; фоновые сессии/hook не могут напрямую инициировать удаление контента.

Если в будущем потребуется настоящий `session_owner`, сначала нужно спроектировать durable capability или ACL на сессию; это нельзя неявно предполагать в этом документе V2.

### 7.2 Границы future content archive

Этот раздел — черновик future content archive; он не входит в объём реализации или приёмки PR #6259.

По умолчанию не копируются:

- контент внешних URL
- произвольные файлы workspace
- обычные ссылки ассистента

Если content archive будет включён в будущем, можно рассмотреть разрешённые источники:

- `published` артефакты, созданные trusted `ArtifactTool` / publisher.
- Артефакты workspace, явно закреплённые пользователем, при условии что файл внутри workspace, а тип/размер контролируемы.
- Managed артефакты, загруженные или зарегистрированные client, при условии приёма и валидации через daemon API.

Daemon-managed хранилище артефактов обязано иметь явные root:

- Корень контента `managed_copy` находится в области контента артефактов каталога данных демона, например `<daemonDataDir>/artifacts/content/`.
- Корень файлов `published` находится в области published-артефактов каталога данных демона, например `<daemonDataDir>/artifacts/published/`, либо в эквивалентном daemon-owned root, объявленном конфигурацией; root id обязан быть записан в manifest publisher.
- JSONL не должен хранить напрямую доверенные абсолютные пути хоста. При восстановлении читаются только root id и относительные locator из manifest; после resolve/realpath путь должен по-прежнему находиться внутри соответствующего root, symlink/path escape отклоняются.
- Manifest trusted publisher записывает как минимум publisher id, artifact id, storage root id, относительный путь или content id, sha256, sizeBytes и createdAt. `file:` locator может быть регенерирован только из этого manifest, а не из client payload или старых полей JSONL.

Копирование контента обязано быть race-safe:

- Проверка нахождения в workspace прошла.
- Разрешены только regular file; каталоги, FIFO, device, socket и прочие специальные файлы отклоняются.
- Файл открывается с no-follow семантикой; на Linux можно использовать `openat2(RESOLVE_NO_SYMLINKS)`, на других платформах — доступные комбинации no-follow/open-handle revalidation.
- После открытия над file handle выполняется fstat/revalidate, подтверждающие, что это по-прежнему regular file и он по-прежнему внутри workspace.
- Hardlink с аномальным link count отклоняется, пока не появится явный allowlist.
- Чтение принудительно ограничено максимальным числом байт по потоку; полагаться на stat size заранее нельзя.
- Хэшируются ровно скопированные байты, сохраняются sha256, size, mimeType.
- Перед открытием/скачиванием удерживаемого контента manifest/hash проверяются повторно.

### 7.3 Приватность и чувствительная информация

Перед персистентностью обязательна минимизация:

- Абсолютные пути хоста не сохраняются.
- username/password URL не сохраняются.
- Secret-like query/fragment внешних URL должны отклоняться, маскироваться (redact) или понижать artifact до `ephemeral` / неоткрываемого locator; их нельзя писать в JSONL как есть.
- Metadata используют allowlist или denylist secret-ключей; key/value вида `token`, `password`, `secret`, `cookie`, `authorization` должны отклоняться, маскироваться или понижаться до `ephemeral`.
- Лимит metadata по-прежнему 4 КБ.
- Для title/description/metadata продолжают выполняться проверки небезопасного display payload.
- `persistenceWarning.message` даже как поле live-ответа обязано использовать шаблоны без путей или обезличенный текст; в warning нельзя писать пути хоста, credential, токены, корни контента, connection id.

Позже могут быть добавлены настройки:

```json
{
  "sessionArtifacts": {
    "persistence": {
      "enabled": true,
      "defaultRetention": "restorable",
      "maxLiveArtifacts": 200,
      "maxPersistedMetadata": 200,
      "snapshotThresholdMutations": 100,
      "snapshotThresholdBytes": 262144,
      "contentRetention": {
        "enabled": false,
        "maxArtifactBytes": 52428800,
        "maxTotalBytes": 268435456,
        "maxTtlDays": 365,
        "ttlScanIntervalSeconds": 900
      }
    }
  }
}
```

Текущий PR не добавляет схему конфигурации оператора; приведённые значения выпускаются как константы кода, а доступность поведения выражается через capability. Экспонирование этих значений как операторских tunables — последующее улучшение; client не должен выводить детали конфигурации из capability-строк.

## 8. Квоты, GC и стабильность

### 8.1 Квота метаданных

Рекомендуемые значения по умолчанию:

- Лимит live store остаётся 200.
- Лимит персистентных метаданных — 200 на сессию, выровнен с live store.
- Запись снапшота хранит не более 200 актуальных артефактов.

Лимит live store в текущей реализации также является лимитом видимого при восстановлении набора:

- Live eviction V2 должен в первую очередь вытеснять `ephemeral` артефакты.
- Если для live view приходится выбирать среди durable-артефактов, текущая реализация делает детерминированный выбор по source reservation, source, status, retention, clientRetained и порядку вставки.
- Когда durable artifact вытесняется live cap, текущая реализация пишет remove event с `reason: "eviction"`, чтобы следующее восстановление многократно не воскресило записи, уже вытесненные демоном.
- `clientRetained` — намерение пользователя сохранить запись; входит в `PersistedSessionArtifact`, используется для стабильной сортировки после восстановления и выбора при live cap; это защита сортировки, а не абсолютная защита.

При превышении лимита персистентных метаданных:

- `ephemeral` и так не пишется в журнал, не учитывается в квоте персистентных метаданных и ограничен только лимитом live store.
- `restorable` обязан обрезаться в детерминированном порядке с записью remove event `eviction`: сначала обрезаются `restorable` артефакты без `clientRetained`; если места всё равно нет, обрезаются `restorable` артефакты с `clientRetained`. `clientRetained` — защита сортировки, а не абсолютная защита.

Restore seed не может превышать лимит live store; если в истории действительных персистентных артефактов больше текущего live cap, store на стороне демона сейдит видимое подмножество по тем же детерминированным правилам и через operation queue пишет remove event `eviction` для обрезанных durable-записей. Сам процесс парсинга `loadSession()` остаётся read-only и не может писать durable prune напрямую.

### 8.2 Квота контента

Этот раздел — объём реализации последующего PR по content-retention; PR #6259 не вводит квоты content store.

Рекомендуемые значения по умолчанию для последующего отдельного PR:

- Один artifact: 50 МБ.
- Весь content store: 256 МБ.

При достижении лимита:

- Новый pin/save возвращает `QUOTA_EXCEEDED`.
- Автоматически не удаляется закреплённый контент, на который всё ещё ссылаются live артефакты текущей сессии.
- Форк не наследует закреплённые contentRef, чтобы форк не обходил квоту.

### 8.3 GC

Этот раздел — объём реализации последующего PR по content-retention. GC обрабатывает только управляемые демоном session-scoped managed копии:

- Content manifest хранит `sessionId` и `artifactId`; GC удаляет только контент, чей manifest принадлежит текущей сессии и на который не ссылается текущее live-множество `contentRefs()`.
- `pinWorkspaceFile()`, GC и очистка tmp сериализуются одной очередью записи и используют in-flight lease, чтобы параллельные pin/GC не удаляли только что скопированный, но ещё не записанный в журнал контент.
- Истечение `expiresAt` через лёгкий prune перед `GET /artifacts` понижает закреплённые артефакты до `restorable`, удаляет `contentRef` и затем запускает GC.
- Закрытие / явное удаление / unpin / явный GC endpoint по мере возможности делают sweep; неудача GC не блокирует поток prompt/tool.

Триггеры GC:

- Удаление артефакта, unpin, проверка истечения TTL, закрытие сессии или явный `POST /session/:id/artifacts/gc`.
- Устаревшие записи `.tmp` очищаются во время GC.

Перестроение ссылок уровня проекта, отслеживание неполных сканирований, grace period для сирот и глобальная библиотека артефактов — последующие улучшения. Границы безопасности future content archive должны проистекать из «contentRef не наследуется между сессиями» и «удаляется только контент manifest текущей сессии, на который не ссылаются текущие live refs».

### 8.4 Crash consistency

Требования:

- Мутации artifact store серийны.
- Неудача append журнала JSONL не повреждает live store.
- Явный DELETE live-first: удаление из live store не должно блокироваться неудачей журнала; warning в ответе сообщает client, когда tombstone не durable.
- Явный DELETE с `deleteContent: true` доступен только в follow-up по content-retention; этот PR обязан после live-удаления выполнить session-scoped content GC по мере возможности и показать warning удаления контента.
- Eviction durable-артефактов при live cap пишет remove event `eviction`, чтобы восстановление соблюдало лимит.
- Reader терпим к оборванным JSONL и повреждённым artifact records.
- При аномальном порядке tombstone/снапшотов выбирается не восстанавливать, а не угадывать.

Порядок записи future content archive:

1. Контент копируется в staging path, хэшируются ровно скопированные байты, байты fsync.
2. Атомарно перемещается в daemon-managed корень контента, пишется и fsync content manifest.
3. Добавляется событие журнала артефактов со ссылкой на этот contentRef, JSONL fsync.
4. Обновляется live store и публикуется `artifact_changed`.

Если шаг 2 удался, но произошёл crash до шага 3, остаётся orphan-контент без ссылки в журнале; это допустимо — future session-scoped GC по мере возможности удалит его, убедившись, что manifest не используется текущими live refs. Если шаг 3 удался, восстановление обязано находить контент через manifest. Явный API может вернуть успех только после успешного шага 3.

### 8.5 Стоимость чтения файлов, CPU и I/O

V2 не должен превращать восстановление артефактов в новое узкое место load session.

Рекомендуемый путь чтения:

1. Когда `SessionService.loadSession()` уже читает JSONL, artifact records извлекаются в том же проходе parse.
2. Находится новейший валидный `session_artifact_snapshot`, воспроизводятся только artifact events после него.
3. При отсутствии валидного снапшота разрешается однократное последовательное сканирование artifact records, но нельзя повторно сканировать один и тот же файл в процессе загрузки.

Границы затрат CPU:

- Metadata restore только парсит JSON и проверяет поля; сложность O(число артефактов + число событий после новейшего снапшота).
- Восстановление `external_url` не делает сетевых запросов.
- Load/replay `workspace` восстанавливает только метаданные; refresh при GET/list повторно делает stat одного или группы файлов workspace в пределах TTL/batch, при необходимости хэширует — для различения `available` / `missing` / `changed`.
- Восстановление `managed` / `published` лишь читает manifest, не читая контент больших файлов.
- Хэширование контента workspace не выполняется в полном объёме на этапе парсинга JSONL в `loadSession()`. Refresh при GET/list сначала использует дешёвый stat-гейт по size + mtimeMs; файловый поток читается для вычисления sha256 только если stat показывает возможную перезапись того же размера.

Границы затрат I/O:

- V2 не читает дополнительно файлы sidecar.
- Проверка состояния workspace переиспользует стратегию TTL/batch из V1 и не делает неограниченный stat всех артефактов на горячем пути GET.
- Для больших файлов workspace на этапе восстановления контент не читается; при регистрации читается актуальный файловый поток для вычисления sha256, последующий refresh перечитывает файловый поток только если size/mtimeMs показывают возможное изменение, без копирования в daemon-managed хранилище.

Рекомендуемые значения по умолчанию:

- Лимит снапшота артефактов — 200 записей.
- Batch size восстановления состояния workspace — 20, как в V1.
- Порог снапшота журнала артефактов — 100 мутаций или 256 КБ.
- sha256 workspace выполняется синхронно при регистрации; проверка состояния после восстановления — ленивый refresh по TTL/batch, а size + mtimeMs позволяют избегать повторного полного хэширования неизменённых файлов.

### 8.6 Наблюдаемость

Новые пути отказов V2 обязаны иметь structured logs в том же формате:

```text
[artifacts] session=<id> action=<action> key=value
```

Рекомендуемые action:

- `persist_failed`
- `retention_downgraded`
- `restore_skipped`
- `restore_blocked`
- `remove_not_persisted`
- `eviction`
- `fork_artifact_discarded`
- `fork_incomplete`
- `snapshot_invalid`
- `sticky_override_suppressed`
- `tombstone_conflict`
- `v2_writer_version_gate_failed`

Future checker / content archive может позже добавить fsck, копирование контента, TTL, GC-связанные action; PR #6259 эти логи не генерирует.

Эти логи не заменяют `persistenceWarning` в API/SSE, а предназначены для production-разбора инцидентов.

Рекомендуемые метрики:

- counter: `artifact_journal_append_total{result,reason}`
- counter: `artifact_restore_total{result,restore_state}`
- gauge: `artifact_pending_tombstone_count`
- gauge: `artifact_metadata_quota_used{session}`
- counter: `artifact_sticky_override_suppressed_total`

Экспорт использует существующий механизм телеметрии/метрик демона; если Prometheus endpoint сейчас нет, данные должны как минимум попадать в structured telemetry sink и агрегироваться по сессиям/проектам.

Диагностические инструменты — последующее улучшение, не wire contract PR #6259. Checker только для метаданных может сканировать журнал/снапшоты/tombstone артефактов и сбои restore validation; полный checker контента после перепроектирования future content archive будет сканировать также content manifests и daemon-managed хранилище. Будущий CLI или внутренний API демона (например, `qwen artifact fsck`) должен поддерживать dry-run:

- Режим только метаданных сообщает о несоответствиях снапшотов/tombstone и сбоях restore validation.
- Режим полного контента сообщает о висящих `contentRef`, отсутствии manifest и orphan-контенте.
- По умолчанию только чтение; режим исправления выполняет только проверяемые безопасные действия, например регенерацию снапшота или пометку orphan-контента для GC.

## 9. План реализации

Ниже — вехи реализации одной фазы дизайна V2. Инженерно их можно разбить по PR; наружу фактические возможности экспонируются через capability.

### Milestone A: Типы и persistence service

- Новые reader/writer персистентности артефактов:
  - writer находится на стороне владельца chat recording либо экспонируется этой стороной через явный RPC; он добавляет записи event/снапшота в active leaf chain.
  - reader находится в пути parse/replay `SessionService.loadSession()` и отвечает за перестроение снапшота артефактов из active leaf chain.
  - Общие restore validation, проверки согласованности снапшотов/tombstone и нормализация персистентной формы.
- Расширение `ChatRecord.subtype` и union `systemPayload`.
- Добавление `artifactSnapshot?` в результат загрузки.
- Checker только для метаданных — последующее улучшение; в dry-run может обнаруживать повреждённые artifact records, несоответствия снапшотов/tombstone и сбои restore validation.

### Milestone B: Интеграция daemon-side store

- `createSessionEntry` daemon bridge поддерживает seed артефактов.
- `SessionArtifactStore` поддерживает seed артефактов.
- `upsertMany()` вычисляет в operation queue эффективный `retention`, quota prune и live view, затем через writer добавляет durable-записи.
- `remove()` различает явный DELETE и eviction; явный DELETE — live-first, tombstone пишется по мере возможности, durable eviction пишется в журнал. Старый `unpin_to_ephemeral` сохраняется только в воспроизведении журнала / sticky state снапшота для совместимости.
- Backfill-снапшот при первом включении V2 для live-сессий V1 не входит в объём текущего PR; текущая реализация восстанавливает из свежезаписанных журнала/снапшотов V2.
- Форма события V1 `artifact_changed` не меняется, добавляются только опциональные поля.

### Milestone C: Интеграция load/replay

- `SessionService.loadSession()` извлекает записи снапшотов/event артефактов из active leaf chain, игнорируя заброшенные ветки.
- Результат загрузки передаёт снапшот daemon bridge, а не сейдит store в дочернем процессе ACP.
- Обрезка при восстановлении сверх лимита записывается только после создания store на стороне демона и при доступном writer; парсинг загрузки остаётся read-only.
- После rewind/leaf switch live store на стороне демона заново выравнивается по результату воспроизведения active-chain либо фиксирует текущее состояние выжившей цепочки top-up снапшотом артефактов.
- rewind/leaf-switch обязаны вызывать явный hook, например `onActiveLeafChanged(sessionId, artifactSnapshot)`, чтобы store на стороне демона завершал reseed/top-up в operation queue.
- При воспроизведении истории артефакты с той же identity не создаются повторно.
- `/branch` копирует artifact records из active chain и переназначает session id/artifact id; текущему пути записи всего файла через exclusive-create fork marker не нужен.

### Milestone D: REST/SDK

- Типы SDK получают опциональные поля.
- `POST /session/:id/artifacts` поддерживает `retention: "ephemeral" | "restorable"`.
- `POST /session/:id/artifacts` поддерживает boolean-подсказку `clientRetained` и отклоняет переданные client поля runtime, доступные только демону.
- Capability гейтит UI.

### Milestone E: Future content archive

Не входит в PR #6259. Если появятся потребности аудита/архивирования, потребуется отдельный дизайн daemon-managed manifest контента workspace, квот, race-safe копирования, проверки хэшей, GC/fsck с защитой write-queue/lease и привязки контента published-артефактов.

## 10. План тестирования

Текущий PR #6259 обязан покрывать:

- Восстановление списка артефактов после перезапуска/загрузки демона после append журнала метаданных.
- Append журнала артефактов в active leaf chain через владельца chat recording; store на стороне демона не может писать JSONL напрямую.
- Artifact upsert/remove в заброшенных ветках после `/rewind` не участвуют в восстановлении и не копируются в форк.
- Live store после `/rewind` немедленно выравнивается по artifact state active-chain; список артефактов не ждёт перезапуска демона.
- Backfill-снапшот при апгрейде live-сессий V1 до V2 — последующее улучшение; текущий PR проверяет, что старые live артефакты без записи в журнал V2 не считаются ошибочно восстанавливаемыми.
- После DELETE tombstone загрузка не воскресает artifact.
- После воспроизведения legacy tombstone `unpin_to_ephemeral` загрузка не воскресает artifact.
- После legacy `unpin_to_ephemeral` неявный/default re-upsert того же artifact id остаётся live-only; явный `restorable` может заместить sticky override.
- После продвижения базовой линии снапшота `stickyEphemeralIds` по-прежнему удерживают неявные/default re-upsert в live-only и порождают log/метерику/warning `sticky_override_suppressed`.
- При достижении лимита `stickyEphemeralIds` legacy unpin-to-ephemeral возвращает ошибку или откладывается на повторную попытку, при этом старые sticky override молча не теряются.
- Явный DELETE live-first: live view удаляется немедленно; при неудаче записи tombstone ответ несёт warning; тесты покрывают, что неудача персистентности не блокирует live-удаление.
- Durable eviction артефактов пишет remove event `eviction`; после восстановления live cap не превышается.
- Продвижение базовой линии снапшота: периодический снапшот сжимает текущий список артефактов, явные tombstone после успешного снапшота не растут бесконечно, `stickyEphemeralIds` сохраняют sticky state.
- При ingest и восстановлении workspace artifact три состояния: файл существует / отсутствует / symlink escape.
- Перемещение корня workspace: тот же относительный путь существует — восстанавливается как available; отсутствует или layout несовместим — missing; path remap не выполняется.
- Внешние URL восстанавливают только метаданные, без сетевых запросов.
- URL query/fragment с секретами и metadata key/value не пишутся в JSONL.
- Published локальный `file:` восстанавливается только при успешной повторной валидации trusted manifest.
- `managedId` при ingest, восстановлении и fork remap отклоняет разделители, `..`, абсолютные пути и формы пути; форк не копирует вслепую `managedId` исходной сессии.
- Повреждённые записи JSONL пропускаются и не влияют на другие артефакты.
- При отключённых chat recording / persistence восстановление метаданных не заявляется и не включается.
- При неудаче персистентности tool artifact понижается до live-only и становится видим client через `persistenceWarning`.
- Обработка sessionId/id записей артефактов при ветвлении/форке, используется только результат воспроизведения active-chain.
- Запись всего файла форком: после remap active-chain целевой JSONL записывается через exclusive-create, неудача не порождает успешный форк; если форк станет потоковым, позже добавятся тесты begin/complete marker.
- Форк / восстановление при чтении старых `pinned` артефактов понижает их до restorable и не наследует contentRef.
- Orphan tombstone при fork remap сохраняются и безопасно переназначаются; отбрасываются только tombstone, которые нельзя безопасно переназначить.
- Fork remap заново выполняет валидацию, минимизацию приватности и маскирование; небезопасные locator вырезаются, понижаются или отбрасываются.
- Restore seed сериализуется с параллельным POST, без потерь записи и дублирования.
- Границы квоты: 200 записей, обрезка 201-й, двухуровневая сортировка clientRetained/non-clientRetained, даже все clientRetained restorable обрезаются по детерминированным правилам.
- Сеттер clientRetained: запрос добавления артефакта может установить boolean-подсказку; фоновый автоматический ingest не может подделать сохранение пользователем.
- Три состояния workspace: при регистрации пишутся size + `metadata["qwen.workspace.sha256"]` + `metadata["qwen.workspace.mtimeMs"]`; refresh при GET/list различает `available`, `missing` и `changed`, при этом неизменённые файлы идут только по stat быстрому пути.
- Авторизация: разрешённые и запрещённые случаи пути аудита token-holder/principal; live same-principal guard из V1 служит лишь live UX/audit-подсказкой, а не durable-границей безопасности.
- Продвижение базовой линии снапшота JSONL: срабатывание порога, ограниченное воспроизведение после снапшота, payload снапшота больше не несёт перекрытых явных tombstone, замещённый sticky tombstone допускает явное повторное появление с тем же id, `stickyEphemeralIds` сохраняют sticky state; сам файл JSONL подсистемой артефактов не переписывается.
- Fallback при повреждении новейшего снапшота: откат к более старому валидному снапшоту или однократное последовательное воспроизведение артефактов.
- Значения retention по умолчанию: tool artifact без явного retention, `pinned` в client POST отклоняется.
- Capability: строковый список заявляется только если поведение доступно сейчас; не полагается на детали `enabled:false`.
- Идемпотентность воспроизведения: двукратное воспроизведение одной истории сессии не дублирует артефакты.
- Старые client SDK игнорируют опциональные поля и по-прежнему отображают артефакты V1.
- Совместимость отката V2 -> V1: старый демон обязан парсить или игнорировать неизвестный `system` subtype, не роняя загрузку сессии; если персистентность артефактов после отката не восстанавливается — допустимая деградация. Если текущая минимальная поддерживаемая версия этого не гарантирует, V2 writer обязан гейтиться по capability до версии, поддерживающей неизвестные системные записи.
- Preflight отката: минимальная поддерживаемая версия старого демона загружает JSONL с V2 event/снапшотом; если будут добавлены fork marker, fixture отката расширяются.
- PR #6259 покрывает контракт ответов metadata API: тело успешного удаления, неудачу валидации квоты метаданных, warning `remove_not_persisted` / `persistence_unavailable`, текущий mapping 400/403/200+warning.

Future content archive / checker покрывается отдельно:

- `deleteContent: true` показывает warning `content_delete_preserved`, когда tombstone/content GC рискованны.
- При pin/save контента отклоняются symlink, специальные файлы, потоки сверх размера, аномальные hardlink и TOCTOU swap.
- Dry-run checker только метаданных: повреждённые записи, fallback снапшота, orphan tombstone, сбои restore validation.
- Dry-run полного checker контента: висящие `contentRef`, отсутствие manifest, orphan-контент и стратегии исправления GC.

## 11. Что не рекомендуется делать в V2

- Автоматически извлекать обычные markdown-ссылки.
- Автоматически сканировать изменения файлов workspace.
- По умолчанию копировать контент всех workspace артефактов.
- Делать reachability poll внешних URL.
- Использовать `clientId` как учётные данные для удаления.
- Делать автоматический remap путей для перемещённого workspace.
- Делать массовые проверки fs/сети на горячем пути GET.
- Превращать неудачу персистентности в неудачу обычного хода инструмента.
- Вводить sidecar-кэш без замеров, доказывающих необходимость.

## 12. Рекомендуемая позиция по выпуску

V2 рекомендуется выпускать как полноценную фазу дизайна, но возможности экспонируются через capability:

- `session_artifacts_persistence` может сначала выпустить восстановление метаданных.
- `session_artifacts_content_retention` сейчас не выпускается; для future content archive нужен перепроект и отдельное заявление capability.
- По умолчанию восстанавливаются метаданные явно зарегистрированных артефактов.
- Артефакты, зарегистрированные пользователем вручную, по умолчанию `restorable` и продолжают появляться в списке после load/replay сессии.
- В пользовательской документации чётко указывается: восстановление метаданных возвращает «индекс результатов», а не «бэкап контента»; состояние `changed` для workspace лишь означает, что актуальный файл расходится по size с зарегистрированным, либо после изменения mtime расходится хэш.

Процедура отката:

- Записи V2 остаются в chat JSONL и при откате не удаляются; если старый демон умеет игнорировать неизвестный `system` subtype, загрузка сессии должна продолжать работать без восстановления персистентности артефактов.
- Daemon-managed хранилище контента не входит в PR #6259; последующий PR по content-retention должен отдельно определить очистку удержанных байтов после отката.
- Если текущая минимальная поддерживаемая старая версия не может безопасно игнорировать системные записи V2, writer обязан гейтиться по capability до безопасной версии либо перед апгрейдом предоставляется migration guard, запрещающий запись V2-записей.
- CI перед выпуском обязан загрузить JSONL с `session_artifact_event` и `session_artifact_snapshot` минимальной поддерживаемой старой версией демона и убедиться, что загрузка сессии успешна, а неизвестный subtype игнорируется. Перед первой инициализацией V2 writer также проверяет гейт версии/feature; при неудаче запись V2-записей отклоняется, записывается `v2_writer_version_gate_failed`, сохраняется поведение V1. Если будут добавлены fork marker, этот subtype тоже войдёт в fixture отката.
- После отката client не может полагаться на `session_artifacts_persistence` / `session_artifacts_content_retention`, поскольку старый демон эти capability не заявляет.

Так можно чётко объяснить полную семантику текущего V2: список восстанавливается по умолчанию, контент не сохраняется, size/mtime/hash workspace предотвращают тихое открытие неверной версии и одновременно избегают повторного полного хэширования неизменённых файлов.
