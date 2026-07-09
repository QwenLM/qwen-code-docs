# Design de Capacidades Requeridas para Skills

Status: nota de design; este PR prossegue com a Opção B e deixa
`required-capabilities` como uma proposta futura.

## Contexto

O Web Shell pode renderizar blocos de código delimitados personalizados por meio de seu renderizador de markdown. A proposta do renderizador de gráficos usa um bloco de código delimitado `echarts-fulldata` para que o modelo possa retornar uma opção completa do ECharts e um payload de dataset que o Web Shell renderiza como um gráfico interativo.

Esse contrato de saída só é útil em clientes que podem renderizá-lo. Na CLI, em clientes ACP ou em qualquer outra superfície sem um renderizador correspondente, a mesma resposta apareceria como um grande bloco de código em vez de um gráfico.

A proposta inicial da skill de gráficos integrada dependia de texto para informar ao modelo que o formato é para o Web Shell. Esta é uma proteção suave. Se a skill for exposta em uma sessão que não seja do Web Shell, o modelo ainda poderá escolher um formato de saída que o cliente não consegue renderizar.

Para o PR atual, o Qwen Code mantém o ponto de extensão do renderizador no Web Shell, mas não integra o `qwencode-viz` no core. O pacote do Web Shell inclui um modelo de skill copiável e não carregado automaticamente, e os hosts devem instalar ou injetar essa skill somente quando também registrarem um renderizador `echarts-fulldata`.

## Problema

O Qwen Code precisa de uma maneira clara de decidir se uma skill específica do host deve ser mostrada ao modelo e aos usuários.

Para o `qwencode-viz`, a questão concreta é:

- O core deve suportar um campo de metadados de skill `required-capabilities` genérico?
- Ou o `qwencode-viz` não deve ser uma skill integrada ao core, e sim fornecida apenas por clientes do Web Shell que a instalam ou injetam?

## Objetivos

- Impedir que skills específicas de renderizador sejam expostas quando o cliente atual não puder satisfazer seu contrato de saída.
- Manter lembretes de skill na inicialização, ativação explícita de skills, descoberta de comandos de barra e validação de skills consistentes.
- Evitar codificar o `qwencode-viz` como um caso especial.
- Preservar o comportamento existente das skills quando nenhum requisito de capacidade for declarado.
- Manter o design extensível para capacidades futuras do host, não apenas para o ECharts.

## Não objetivos

- Implementar o próprio renderizador do ECharts.
- Redesenhar toda a negociação de capacidades entre cliente e servidor.
- Alterar a semântica do frontmatter de skills existentes.
- Resolver alterações de capacidade em sessões compartilhadas por múltiplos clientes na primeira versão.

## Mecanismos Relacionados Atuais

A base de código já possui vários controles de visibilidade, mas nenhum representa capacidades de renderização do cliente:

- `disable-model-invocation`: impede que uma skill seja invocada automaticamente pelo modelo.
- `user-invocable`: controla se uma skill integrada está disponível como um comando.
- `paths`: restringe a disponibilidade da skill aos caminhos do workspace correspondentes.
- `skills.disabled`: desativa skills configuradas.
- `allowedTools`: atualmente usado pelo carregamento de skills integradas para ocultar skills orientadas a cron quando as ferramentas de cron não estão disponíveis.
- `supportedModes` de comandos de barra: filtra comandos por modo de execução.
- Objetos de capacidade do Daemon e ACP: descrevem suporte a protocolo ou cliente, mas atualmente não estão conectados à exposição de skills.

Não existe um `required-capabilities` ou frontmatter de skill equivalente. Adicioná-lo seria um novo contrato de skill.

## Opção A: Adicionar `required-capabilities`

Adicione um campo de frontmatter de skill genérico:

```yaml
---
name: qwencode-viz
description: Render analytical charts in Web Shell using echarts-fulldata fenced code blocks.
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
---
```

Quando o cliente/sessão atual não anuncia todas as capacidades listadas, a skill é tratada como indisponível.

### Nomenclatura de Capacidades

Use capacidades de string com namespace:

```text
markdown.codeBlock.echarts-fulldata
```

Isso mantém o campo genérico, tornando o contrato preciso:

- `markdown`: a capacidade pertence ao markdown renderizado.
- `codeBlock`: a capacidade se aplica à renderização de blocos de código delimitados.
- `echarts-fulldata`: a string de linguagem/info específica suportada pelo renderizador.

Exemplos futuros podem ser:

- `markdown.codeBlock.vega-lite`
- `markdown.codeBlock.mermaid-interactive`
- `artifact.openUrl`

### Metadados da Skill

Adicione `requiredCapabilities?: string[]` à configuração da skill após analisar a chave `required-capabilities` do frontmatter.

Ambos os caminhos de análise da skill devem entender o campo:

- `packages/core/src/skills/skill-load.ts`
- `packages/core/src/skills/skill-manager.ts`

O campo deve ser opcional. Ausente ou vazio significa que a skill não tem requisito de capacidade do cliente.

### Fonte de Capacidade em Runtime

Adicione as capacidades do cliente/sessão à configuração de runtime:

```ts
interface ConfigParameters {
  clientCapabilitiesProvider?: () => ReadonlySet<string>;
}
```

Exponha um helper no `Config`, por exemplo:

```ts
config.getClientCapabilities(): ReadonlySet<string>
```

Em seguida, centralize a verificação:

```ts
function skillMeetsRequiredCapabilities(skill: Skill, config: Config): boolean {
  return skill.config.requiredCapabilities.every((capability) =>
    config.getClientCapabilities().has(capability),
  );
}
```

### Pontos de Filtragem

O filtro de capacidade deve ser aplicado antes que as skills sejam expostas ao modelo ou ao usuário:

- `collectAvailableSkillEntries` em `packages/core/src/tools/skill-utils.ts` deve ignorar skills cujas capacidades requeridas estão faltando. Isso mantém os lembretes de skill na inicialização, lembretes de delta, validação do `SkillTool` e ativação invocável pelo modelo alinhados.
- `BundledSkillLoader` deve ignorar skills integradas indisponíveis ao criar comandos voltados para o usuário.
- `SkillCommandLoader` deve ignorar skills do sistema de arquivos indisponíveis ao criar comandos voltados para o usuário.

O invariante importante é que uma skill oculta do modelo não deve continuar aparecendo como um comando invocável, a menos que o projeto suporte intencionalmente uma substituição manual.

### Registro no Web Shell

O Web Shell deve anunciar o suporte ao renderizador explicitamente, em vez de depender da presença de um callback `renderCodeBlock` opaco.

Por exemplo:

```tsx
<WebShell
  customization={{
    markdown: {
      renderableCodeBlockLanguages: ['echarts-fulldata'],
      renderCodeBlock(info) {
        // render custom blocks
      },
    },
  }}
/>
```

O cliente do Web Shell pode mapear isso para:

```text
markdown.codeBlock.echarts-fulldata
```

Isso torna a declaração de capacidade estável, mesmo que o callback do renderizador contenha lógica personalizada, fallbacks ou múltiplos idiomas suportados.

### Propagação para Daemon e ACP

Para sessões hospedadas ou baseadas em daemon, o conjunto de capacidades do cliente precisa chegar ao core antes que as skills sejam carregadas ou listadas. Uma versão mínima pode passar as capacidades ao criar uma sessão:

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

O bridge do daemon, o SDK e o fluxo de criação de sessão do ACP podem armazenar isso como uma configuração com escopo de sessão.

Na primeira versão, as capacidades podem ter escopo de sessão. Se vários clientes se conectarem à mesma sessão, o comportamento deve ser documentado como o uso das capacidades do momento da criação da sessão.

### Prós

- Mantém o `qwencode-viz` como uma skill integrada canônica.
- Impede que contratos de saída específicos do host vazem para clientes não suportados.
- Cria um mecanismo reutilizável para skills futuras específicas de renderizador ou de host.
- Torna a dependência explícita e testável.

### Contras

- Adiciona um novo campo de metadados de skill transversal.
- Requer o encadeamento de capacidades de cliente/sessão através das superfícies do Web Shell, daemon, SDK e ACP.
- Necessita de documentação cuidadosa para o comportamento de sessão compartilhada.
- Pode ser mais infraestrutura do que o necessário se o `qwencode-viz` for a única skill esperada condicionada a capacidades.

## Opção B: Skill Fornecida pelo Cliente

Não adicione um campo `required-capabilities` genérico. Em vez disso, evite integrar o `qwencode-viz` no core. O cliente do Web Shell, ou qualquer cliente que suporte o renderizador, fornece a própria skill.

Modelos de distribuição possíveis:

- O host do Web Shell instala `.qwen/skills/qwencode-viz/SKILL.md`.
- O pacote do Web Shell distribui um modelo de skill opcional e não carregado automaticamente que um host pode copiar ou instalar quando a renderização de gráficos está habilitada.
- A integração do Web Shell distribui um pacote de skill de extensão.
- A integração do Web Shell injeta instruções de modelo equivalentes somente quando seu renderizador de gráficos está habilitado.

Neste modelo, a skill está disponível apenas porque o cliente de renderização escolheu fornecê-la.

### Integração do Host do Web Shell

Um host do Web Shell que deseja saída de gráficos deve optar por ambas as partes do contrato:

1. Registrar um renderizador de bloco de código Markdown `echarts-fulldata`.
2. Fornecer a skill de gráficos correspondente de `packages/web-shell/docs/examples/qwencode-viz/SKILL.md`.

Por exemplo:

```tsx
import * as echarts from 'echarts';
import {
  WebShellWithProviders,
  createEchartsFullDataRenderer,
} from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={{
    renderCodeBlock: createEchartsFullDataRenderer({
      loadEcharts: () => echarts,
      resolveDataRef: async (ref, meta) =>
        loadControlledChartDataset(ref, meta),
    }),
  }}
/>;
```

Nesta configuração de renderizador, `loadEcharts` permite que o host forneça o runtime aprovado do ECharts, seja como uma importação estática ou um módulo carregado sob demanda (lazy-loaded). `resolveDataRef` é usado apenas para blocos de gráficos `data.kind="ref"`; é a bridge de propriedade do host de uma referência de dados visível pelo modelo para um dataset confiável. O formato de envelope voltado para o modelo é descrito pelo modelo de skill opcional em `packages/web-shell/docs/examples/qwencode-viz/SKILL.md`; a validação do lado do renderizador fica em `packages/web-shell/client/components/messages/EchartsFullDataBlock.tsx`.

O arquivo da skill deve ser instalado ou injetado apenas por hosts que realizam este registro. Uma integração simples baseada em arquivo pode copiar:

```text
packages/web-shell/docs/examples/qwencode-viz/SKILL.md
```

para o diretório de skills do workspace ou do usuário, por exemplo:

```text
.qwen/skills/qwencode-viz/SKILL.md
```

Uma integração com sua própria camada de distribuição de skills pode, em vez disso, carregar o mesmo arquivo como o conteúdo de origem canônico e expô-lo através dessa camada. Em ambos os casos, o core não carrega a skill automaticamente; o host é responsável por habilitá-la porque o host é dono do renderizador.

Para envelopes `data.kind="ref"`, o renderizador integrado valida que `data.ref` usa uma referência normalizada `artifact://` ou `session-file://` antes de chamar a implementação `resolveDataRef(ref, meta)` controlada pelo host. O renderizador também analisa o bloco como JSON e sanitiza a opção do ECharts antes de renderizar; ele não avalia JavaScript fornecido pelo modelo, não busca URLs arbitrárias nem lê arquivos locais por conta própria. Um renderizador personalizado deve preservar a mesma divisão: validação de JSON/ref/opção no nível do renderizador primeiro, resolução de artefatos de propriedade do host em segundo lugar.

Um host com suporte de daemon pode tratar a API de arquivos do workspace como um backend de artefatos. Por exemplo, o host pode persistir artefatos de gráficos em um diretório de workspace controlado, como `.qwen/artifacts/`, expor referências visíveis pelo modelo como `artifact://chart-data/orders.csv` e resolvê-las através do daemon `GET /file?path=.qwen/artifacts/chart-data/orders.csv`. Isso mantém `artifact://` como o contrato público de gráficos, permitindo que a primeira implementação reutilize os arquivos de workspace do daemon.

O resolvedor ainda deve impor a raiz do artefato antes de chamar o daemon:

```tsx
const ARTIFACT_ROOT = '.qwen/artifacts/';
const MAX_CHART_DATA_BYTES = 256 * 1024;

async function resolveDataRef(
  ref: string,
  meta: { format?: string; dimensions?: string[] },
) {
  const artifactPrefix = 'artifact://';
  if (!ref.startsWith(artifactPrefix)) {
    throw new Error(`Unsupported chart data ref: ${ref}`);
  }

  const artifactPath = ref.slice(artifactPrefix.length);
  if (
    artifactPath.length === 0 ||
    artifactPath.startsWith('/') ||
    artifactPath.includes('\\') ||
    artifactPath.split('/').includes('..')
  ) {
    throw new Error(`Invalid chart data ref: ${ref}`);
  }

  const url = new URL('/file', daemonBaseUrl);
  url.searchParams.set('path', `${ARTIFACT_ROOT}${artifactPath}`);
  url.searchParams.set('maxBytes', String(MAX_CHART_DATA_BYTES));

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Failed to read chart data: ${response.status}`);
  }

  const file = (await response.json()) as { content: string };
  return meta.format === 'csv'
    ? parseCsvAsArrayRows(file.content, meta.dimensions)
    : JSON.parse(file.content);
}
```
Este exemplo mapeia intencionalmente apenas caminhos normalizados `artifact://` sob `.qwen/artifacts/`. Se um host posteriormente mover os artefatos para um armazenamento de objetos ou um serviço de artefatos com escopo de sessão, apenas `resolveDataRef` precisará ser alterado; o bloco `echarts-fulldata` voltado para o modelo pode continuar usando o mesmo formato de referência.

### Vantagens

- Alteração mínima no core.
- Nenhum novo contrato de metadados de skill global.
- A disponibilidade de capacidades é naturalmente de responsabilidade do cliente que implementa o renderizador.
- Evita a infraestrutura de daemon ou ACP, a menos que o cliente já possua um mecanismo de injeção de skill.

### Desvantagens

- Nenhum skill empacotado canônico, a menos que todos os clientes copiem o mesmo conteúdo.
- Maior carga para cada integrador do Web Shell.
- Usuários que alternam entre clientes podem ver uma disponibilidade de skills inconsistente.
- Não cria uma salvaguarda geral para skills específicos do host no futuro.
- Mais difícil de testar no core, pois a disponibilidade depende de instalação ou injeção externa.

## Recomendação

Para este PR, use a Opção B.

Isso mantém o sistema de skills do core inalterado e evita expor as instruções `echarts-fulldata` em clientes não suportados. O hook do renderizador do Web Shell continua útil para qualquer renderizador de bloco pertencente ao host, enquanto as instruções do modelo específicas de gráficos se tornam um opt-in explícito do host.

A longo prazo, discuta isso como uma decisão de limite de produto/API.

Escolha a Opção A se os mantenedores esperam que o Qwen Code suporte mais contratos de saída renderizados pelo cliente ao longo do tempo. Nesse caso, `required-capabilities` é um pequeno contrato geral que mantém a exposição de skills consistente entre CLI, Web Shell, ACP e clientes futuros.

Escolha a Opção B se for esperado que o `qwencode-viz` permaneça como uma extensão exclusiva do Web Shell e os mantenedores não queiram que as skills do core dependam de recursos de renderização do cliente. Nesse caso, a skill empacotada atual deve ser removida do core e fornecida pelos clientes Web Shell que suportam `echarts-fulldata`.

O padrão futuro recomendado é a Opção A apenas se os mantenedores estiverem confortáveis em tornar as capacidades do cliente/sessão parte do sistema de skills. Caso contrário, mantenha as skills de renderizador do host como propriedade do cliente.

## Questões em Aberto

- As capacidades devem ter escopo de sessão, escopo de requisição ou escopo de cliente?
- Capacidades ausentes devem ocultar comandos invocáveis pelo usuário ou apenas ocultar a ativação de skills invocáveis pelo modelo?
- Os nomes das capacidades devem ser strings de forma livre ou validados contra um registro conhecido?
- Skills indisponíveis devem ser totalmente ocultadas de `/skills` ou mostradas como desabilitadas com um motivo?
- Deve haver uma substituição manual para usuários que desejam intencionalmente emitir blocos brutos `echarts-fulldata` em clientes não suportados?
- O nome do campo deve ser `required-capabilities`, `requires-capabilities` ou `client-capabilities`?

## Plano de Validação

Se a Opção A for implementada, adicione testes para:

- Parsing de frontmatter em ambos os caminhos de parsing de skill.
- `collectAvailableSkillEntries` ocultando uma skill quando as capacidades estão ausentes.
- A mesma skill aparecendo quando as capacidades estão presentes.
- Interação com `paths`, `skills.disabled` e `disable-model-invocation`.
- Visibilidade dos comandos `BundledSkillLoader` e `SkillCommandLoader`.
- Mapeamento do Web Shell de linguagens de bloco de código suportadas para capacidades do cliente.
- Criação de sessão de daemon ou ACP preservando o conjunto de capacidades.
- Testes de integração de skills empacotadas existentes, para garantir que skills sem `required-capabilities` permaneçam inalteradas.

## Migração

Skills existentes não requerem migração porque o novo campo é opcional.

Para o caminho atual da Opção B, remova a skill de gráfico das skills empacotadas do core. O template do pacote Web Shell não deve ser carregado automaticamente pelo core; os hosts fazem o opt-in instalando-o ou injetando-o.

Se a Opção A for aceita, adicione:

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

a um futuro `qwencode-viz` empacotado.

Se a Opção B for aceita, remova a skill de gráfico das skills empacotadas do core e documente como os clientes Web Shell podem instalá-la ou injetá-la quando registrarem um renderizador `echarts-fulldata`.