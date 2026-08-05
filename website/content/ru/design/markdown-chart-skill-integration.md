# Интеграция навыка Markdown Chart

Статус: accepted

## Контракт интеграции

Qwen Code WebShell владеет рендерящей стороной контракта:

- `@qwen-code/web-shell` включает рендерер `markdown-chart` и рантайм ECharts.
- Хосты устанавливают канонический
  [навык `markdown-chart`](https://github.com/datafe/markdown-chart/tree/main/skills/markdown-chart),
  чтобы модель испускала рендерящиеся блоки графиков.
- Ядро Qwen Code не бандлит и не внедряет навык. Проект может установить его
  в `.qwen/skills/markdown-chart/SKILL.md`; установка навыка на уровне
  пользователя также поддерживается.

Для обычного вывода `data.kind="inline"`, создаваемого навыком, хосту WebShell
не нужен специфичный для графиков код:

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
/>;
```

## Данные по ссылке

Если хост выставляет реальные управляемые датасеты навыку и разрешает
`data.kind="ref"`, он предоставляет `resolveDataRef` через кастомный реестр:

```tsx
import {
  createMarkdownChartRegistry,
  WebShellWithProviders,
} from '@qwen-code/web-shell';

const chartRegistry = createMarkdownChartRegistry({
  resolveDataRef: async (ref, context) =>
    loadControlledChartDataset(ref, context),
});
const markdown = { chart: { registry: chartRegistry } };

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={markdown}
/>;
```

Рендерер никогда сам не запрашивает ref и не читает локальный путь.
`resolveDataRef` — принадлежащая хосту граница от видимой модели ссылки до
доверенного датасета. Реестр по умолчанию принимает нормализованные ссылки
`artifact://` и `session-file://`, парсит блок как JSON, валидирует опцию и
затем передает нормализованный ref плюс объявленные формат и размеры
резолверу. Ожидания резолвера ограничены 30 секундами. Держите переопределения
`markdown`, `chart` и `labels` референциально стабильными, пока графики
смонтированы.

## Поведение стриминга

Общий React-адаптер различает закрытый забор графика и активный незавершенный
хвостовой забор:

- Закрытый блок `markdown-chart` рендерится немедленно и остается
  смонтированным, пока стримится последующий текст ответа, включая случай,
  когда забор находится внутри blockquote.
- Только активный незавершенный забор графика отображает состояние загрузки.

## Область

- Навык определяет контракт вывода модели; он не загружает рендерер.
- WebShell определяет контракт рендеринга; он не устанавливает навык
  автоматически.
- Изменения демона, ACP или согласования возможностей клиента не требуются.
- Автоматический сетевой или файловый доступ не вводится.
