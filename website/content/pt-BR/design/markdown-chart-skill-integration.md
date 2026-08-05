# Integração da skill de gráficos Markdown

Status: aceito

## Contrato de integração

O Qwen Code WebShell é dono do lado de renderização do contrato:

- `@qwen-code/web-shell` inclui o renderizador `markdown-chart` e o runtime
  ECharts.
- Hosts instalam a
  [`markdown-chart` skill](https://github.com/datafe/markdown-chart/tree/main/skills/markdown-chart)
  canônica para que o modelo emita blocos de gráfico renderizáveis.
- O core do Qwen Code não empacota nem injeta a skill. Um projeto pode
  instalá-la em `.qwen/skills/markdown-chart/SKILL.md`; a instalação de skill
  em nível de usuário também é suportada.

Para a saída normal `data.kind="inline"` produzida pela skill, o host WebShell
não precisa de código específico de gráfico:

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
/>;
```

## Dados referenciados

Se o host expõe datasets controlados reais à skill e permite
`data.kind="ref"`, ele fornece `resolveDataRef` por meio de um registro
personalizado:

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

O renderizador nunca busca um ref ou lê um caminho local por conta própria.
`resolveDataRef` é a fronteira pertencente ao host, de uma referência visível
ao modelo para um dataset confiável. O registro padrão aceita refs
`artifact://` e `session-file://` normalizados, interpreta o bloco como JSON,
valida a opção e então passa o ref normalizado mais o formato e as dimensões
declarados ao resolvedor. Esperas do resolvedor são limitadas a 30 segundos.
Mantenha os overrides `markdown`, `chart` e `labels` referencialmente estáveis
enquanto gráficos estão montados.

## Comportamento de streaming

O adaptador React compartilhado distingue uma cerca de gráfico fechada da cerca
final ativa não terminada:

- Um bloco `markdown-chart` fechado renderiza imediatamente e permanece
  montado enquanto o texto posterior da resposta flui, inclusive quando a
  cerca está dentro de um blockquote.
- Apenas a cerca de gráfico ativa não terminada exibe o estado de
  carregamento.

## Escopo

- A skill define o contrato de saída do modelo; ela não carrega o
  renderizador.
- O WebShell define o contrato de renderização; ele não instala a skill
  automaticamente.
- Nenhuma mudança de negociação de capability de daemon, ACP ou cliente é
  necessária.
- Nenhum acesso automático de rede ou sistema de arquivos é introduzido.
