# Telemetria: Atributos Personalizados de Resource + Controles de Cardinalidade de Métricas

> Issue relacionada: [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> Issue pai: [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> Com base na revisão de código do branch `main` do qwen-code em 21/05/2026

## 1. Contexto

O qwen-code já integra o SDK OpenTelemetry, mas a forma como o Resource é construído o torna inutilizável em dois cenários comuns de produção:

1. **Impossibilidade de anexar dimensões personalizadas**: O time de operações quer adicionar tags como `team` / `env` / `cost_center` / `user_id` a todos os dados de telemetria — hoje não há nenhum mecanismo para isso. Mesmo definir a variável de ambiente padrão `OTEL_RESOURCE_ATTRIBUTES` **não funciona de forma alguma**.
2. **Cardinalidade de métricas fora de controle**: O `session.id` é injetado na camada de Resource e anexado automaticamente a cada ponto de dado de métrica. Cada nova sessão do CLI gera um valor diferente, e o backend de métricas (Prometheus / Alibaba Cloud ARMS Metrics / VictoriaMetrics) será sobrecarregado por séries temporais ilimitadas.

Esses dois problemas estão acoplados: resolver o primeiro torna **mais fácil** para os usuários adicionarem campos de alta cardinalidade aos dados, portanto é necessário oferecer o segundo em conjunto.

## 2. Situação Atual

### 2.1 Construção do Resource

`packages/core/src/telemetry/sdk.ts:156-161`:

```ts
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  'session.id': config.getSessionId(),
});
```

`sdk.ts:274-278`:

```ts
sdk = new NodeSDK({
  resource,
  // Desabilita detectores assíncronos de host/process/env: eles deixam atributos
  // pendentes e disparam um diag.error do OTel em qualquer leitura de atributo
  // do Resource antes que os detectores se estabilizem (ex: durante criação de span do HttpInstrumentation).
  autoDetectResources: false,
  ...
});
```

`autoDetectResources: false` desativa o `envDetector` padrão do OTel — que é a camada que normalmente lê `OTEL_RESOURCE_ATTRIBUTES` e `OTEL_SERVICE_NAME`. Isso tem um motivo (o detector é assíncrono e dispara `diag.error` antes de estabilizar), mas o efeito colateral é que essas duas variáveis de ambiente padrão são **completamente ineficazes** no qwen-code.

### 2.2 `session.id` é, na verdade, uma tripla injeção

| Local                        | Linha                    | Impacto                                  |
| ---------------------------- | ------------------------ | ---------------------------------------- |
| Resource                     | `sdk.ts:160`             | Todos os sinais (spans / logs / metrics) |
| Por span                     | `session-tracing.ts:169` | spans                                    |
| Por log                      | `loggers.ts:128`         | logs                                     |
| **`getCommonAttributes()`**  | `metrics.ts:57`          | **Cada registro de métrica sobrescrito explicitamente** |

Ou seja, **remover `session.id` apenas do Resource não é suficiente** — o `getCommonAttributes()` de `metrics.ts:57` é expandido (`...spread`) em mais de 30 pontos de chamada de métrica, reinserindo `session.id`.

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

Boa notícia: todos os pontos de chamada de métrica (30+) passam por essa única função, criando um gargalo natural.

### 2.3 Padrão de resolução de configuração

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` usa uma cadeia de prioridade unificada:

```
argv (maior)  >  variáveis QWEN_*  >  variáveis OTEL_*  >  settings.json (menor)
```

Novos campos seguirão esse mesmo padrão.

### 2.4 Situação atual do schema de configuração

`packages/cli/src/config/settingsSchema.ts:998-1018` define o schema JSON para `telemetry`:

```ts
telemetry: {
  type: 'object',
  // ...
  jsonSchemaOverride: {
    type: 'object',
    properties: {
      includeSensitiveSpanAttributes: { ... },
    },
    additionalProperties: true,  // ← Hoje não valida outras chaves de telemetry.*
  },
}
```

`additionalProperties: true` significa que o schema atual não valida outros campos como `otlpEndpoint` / `otlpProtocol` / `resourceAttributes`. Ao adicionar novos campos `resourceAttributes` / `metrics`, devemos complementar o schema para facilitar o autocomplete do IDE e a renderização da interface de configuração.

### 2.5 Caminhos de código fora do escopo deste design

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` é o **canal de envio de uso próprio** do qwen-code (baseado no protocolo interno Alibaba RUM `RumResourceEvent`), completamente independente do SDK OTel. Possui seu próprio endpoint, proxy e modelo de dados, **não sendo afetado por este design**. Consulte a Seção 3 para mais detalhes.

### 2.6 Variáveis de ambiente `OTEL_*` já suportadas / não suportadas

| Variável de ambiente                                       | Situação atual                     |
| ---------------------------------------------------------- | ---------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                              | ✅ Suportada (`config.ts:79`)       |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT`        | ✅ Suportada                       |
| `OTEL_EXPORTER_OTLP_HEADERS`                               | ✅ Lida diretamente pelo exporter  |
| `OTEL_TRACES_SAMPLER`                                      | ✅ Suportada (`tracer.ts:247`)     |
| **`OTEL_RESOURCE_ATTRIBUTES`**                             | ❌ Não suportada                   |
| **`OTEL_SERVICE_NAME`**                                    | ❌ Não suportada                   |
| **`OTEL_METRICS_INCLUDE_*`**                               | ❌ Não suportada (estilo claude-code) |

## 3. Objetivos / Não Objetivos

### 3.1 Objetivos

- Permitir que a operação adicione atributos de Resource personalizados a todos os spans/logs/métricas exportados por OTLP, tanto via padrão `OTEL_RESOURCE_ATTRIBUTES` quanto via `settings.json` próprio.
- Fazer com que `OTEL_SERVICE_NAME` funcione conforme a especificação OTel (incluindo prioridade em relação a `service.name` dentro de `OTEL_RESOURCE_ATTRIBUTES`).
- Por padrão, as métricas **não** devem carregar `session.id` (proteger a cardinalidade do backend).
- Fornecer uma chave explícita para que usuários que precisam de correlação session-level nas métricas possam reativá-la.
- Manter `session.id` nos spans e logs (correlação de trace é obrigatória).
- Manter `autoDetectResources: false`, sem regredir o bug corrigido do `diag.error`.
- Atualizar `settingsSchema.ts` para que os novos campos fiquem visíveis para a interface de configuração e IDE.

### 3.2 Não Objetivos

- **Envio próprio do `qwen-logger`**: Canal RUM completamente independente, fora do escopo deste design. Os campos enviados (device id, user agent etc.) são definidos pelo protocolo RUM e não devem ser interferidos por atributos de Resource do usuário. Se no futuro for necessário adicionar dimensões personalizadas ao `qwen-logger`, será um design separado.
- **Hook de atributo dinâmico por span**: Permitir que o usuário escreva código/hook para calcular atributo de cada span. O claude-code também não resolveu essa questão; a complexidade é alta e o benefício baixo.
- **Controle de cardinalidade de `service.version`**: A frequência de alteração de versão é limitada (mensal), o crescimento de séries temporais é controlável. Se necessário, será abordado em v2 com a API OTel View.
- **Atributos de Resource por consulta no formato Agent SDK**: O qwen-code atualmente não tem cenário de chamada via SDK.
- **Configuração de cabeçalhos OTLP (auth headers)**: É outra linha de issue (#3731 P1), independente deste design.
- **Atributos de Resource via flag CLI**: Variáveis de ambiente + settings.json já cobrem cenários temporários e de baseline; flag CLI deixaria a linha de comando prolixa sem ganho significativo.

## 4. Design

### 4.1 Camadas gerais

```
┌─ Resource（sdk.ts:156）────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [reservado]    │
│   ...attrs do usuário ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id removido                                        │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169，mantido）
       ├──→ Logs      ＋ session.id（loggers.ts:128，mantido）
       └──→ Metrics   ＋ getCommonAttributes() —  padrão {}
                          toggle ON: { session.id }
```

### 4.2 Prioridade / Ordem de mesclagem

#### Atributo geral

Menor → Maior:

1. `OTEL_RESOURCE_ATTRIBUTES` (variável de ambiente padrão do OTel)
2. `settings.telemetry.resourceAttributes`
3. Chaves reservadas internas (sobrescrevem qualquer homônima acima)

**Justificativa**: Variáveis de ambiente são para sobrescrita temporária em operação (CI / debug local), settings.json é a linha de base da frota, e chaves internas são contrato do produto — a linha de base deve ter prioridade sobre variável temporária, e chaves internas devem ter prioridade sobre tudo.

#### Tratamento especial para `service.name`

`service.name` deve obedecer à [especificação OTel](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/):

> **`OTEL_SERVICE_NAME` tem precedência sobre `service.name` definido com a variável `OTEL_RESOURCE_ATTRIBUTES`.**

Portanto, para `service.name` aplicamos esta cadeia de prioridade (maior → menor):

1. `OTEL_SERVICE_NAME` (maior, conforme especificação OTel)
2. `settings.resourceAttributes.service.name` (settings tem prioridade sobre env, seguindo a regra geral deste design)
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. Padrão interno `'qwen-code'`

`service.name` pode ser sobrescrito via settings — é a identidade do serviço; é comum e razoável que frotas empresariais usem um settings.json unificado para configurar service.name. Impedir isso bloquearia cenários de distribuição via GitOps. `OTEL_SERVICE_NAME`, como canal de "maior prioridade" definido pela especificação OTel, ainda pode sobrescrever settings temporariamente em CI ou debug local.

Regras específicas:

| Origem                                                  | Escrever `service.name` funciona |
| ------------------------------------------------------- | -------------------------------- |
| `OTEL_SERVICE_NAME=foo`                                 | ✅ Maior prioridade (sobrescreve qualquer outra fonte) |
| `settings.resourceAttributes={ "service.name": "foo" }` | ✅ Só funciona se não houver `OTEL_SERVICE_NAME` |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`             | ✅ Só funciona se nem `OTEL_SERVICE_NAME` nem settings estiverem definidos |

### 4.3 Estratégia de chaves reservadas

| Chave               | Usuário pode sobrescrever?                                                 | Justificativa                                                                                           |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `service.name`      | ✅ Variável de ambiente + settings podem (veja §4.2 cadeia de prioridade)  | Identidade do serviço, deve permitir controle da operação                                               |
| `service.version`   | ❌ Qualquer fonte é descartada + warn                                      | Confiabilidade da telemetria — não permitir que o usuário informe versão falsa                          |
| `session.id`        | ❌ Qualquer fonte é descartada + warn (nas métricas há toggle para controle em tempo de execução) | Apenas runtime; o usuário escrever no Resource burlaria o toggle de cardinalidade de métricas (Resource attr é automaticamente anexado a todos os sinais) |
| Prefixo `qwen.*`    | ⚠️ Não é forçado, mas docs sugerem deixar para uso interno do produto      | Evitar conflitos futuros entre attr internos e attr do usuário                                          |

**Chaves reservadas mantidas centralmente como constantes**:

```ts
// telemetry/resource-attributes.ts (novo arquivo)
/** Chaves que não podem ser sobrescritas por nenhuma fonte (env ou settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` **não** está na lista RESERVED — segue sua própria cadeia de prioridade (§4.2), não se enquadra na semântica de "proibição global de sobrescrita". RESERVED significa "qualquer fonte que escreva isso é avisada e descartada", aplicando-se uniformemente às duas entradas: env e settings.

### 4.4 Parsing de `OTEL_RESOURCE_ATTRIBUTES`

Implementação síncrona, contornando o `envDetector` assíncrono do OTel:

```ts
function parseOtelResourceAttributes(
  raw: string | undefined,
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      diag.warn(
        `Ignorando entrada malformada de OTEL_RESOURCE_ATTRIBUTES: ${trimmed}`,
      );
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const valueRaw = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    let value: string;
    try {
      value = decodeURIComponent(valueRaw);
    } catch {
      diag.warn(
        `Percent-encoding inválido em OTEL_RESOURCE_ATTRIBUTES para a chave "${key}", usando valor bruto`,
      );
      value = valueRaw;
    }
    out[key] = value; // chaves duplicadas: a última vence (consistente com implementações de referência OTel)
  }
  return out;
}
```

Formato estritamente de acordo com a especificação OTel: `key1=val1,key2=val2`, valores percent-encoded.

### 4.5 Filtro de atributos de métrica

Único ponto de alteração `metrics.ts:55-59`:

```ts
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => {
    const out: Attributes = {};
    if (config.getTelemetryMetricsIncludeSessionId()) {
      out['session.id'] = config.getSessionId();
    }
    return out;
  },
};
```

Pontos de chamada (30+) com zero alterações — espalhar um objeto vazio equivale a não expandir nenhum campo.

### 4.6 Casos de borda e validação

| Entrada                                                           | Comportamento                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (string vazia)                      | Retorna `{}`, inicialização normal                                          |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (sem `=`)                          | Ignora a entrada + `diag.warn`, continua a processar as demais              |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (chave vazia)                   | Ignora a entrada, continua com as demais                                    |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (valor vazio)                 | `a=''`, `b='2'` (especificação OTel permite valor vazio)                    |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (percent-encoding inválido) | Mantém o original `val%ZZbad` + `diag.warn`                                |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (chave duplicada)            | A última sobrescreve: `a=2` (consistente com implementação de referência OTel SDK) |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (com espaços)              | Trim automático                                                             |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                      | Descarta silenciosamente `service.version` + `diag.warn`, mantém outras chaves |
| `settings.resourceAttributes={ "service.name": "x" }`            | Aceita (settings pode definir service.name, veja §4.2)                      |
| `settings.resourceAttributes={ "service.version": "x" }`         | Descarta silenciosamente + `diag.warn`                                      |
| `settings.resourceAttributes={ "team": 123 }` (não é string)     | TypeScript impede; se chegar em runtime, o validador JSON schema do settings rejeita |
| Tamanho total do Resource > limite OTel (4KB?)                    | Tratado pelo SDK OTel subjacente, não validamos nesta camada                |

**Por que não fazemos validação de nomenclatura de chave de atributo nesta camada** (como o padrão `[a-z][a-z0-9_.]*` recomendado pelo OTel): o próprio SDK OTel valida durante a exportação; validar novamente aqui seria lento e propenso a desvios do comportamento do SDK. Apenas fazemos parsing de formato, não validação semântica.

**A proteção forçada das chaves RESERVED se aplica às duas entradas**:

```ts
// Aplicado a atributos provenientes de env
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES não pode sobrescrever "${k}"; ignorando`);
    delete envAttrs[k];
  }
}

// Aplicado a atributos provenientes de settings
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in settingsAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes não pode sobrescrever "${k}"; ignorando`,
    );
    delete settingsAttrs[k];
  }
}
```

### 4.7 Ciclo de vida e multiprocesso

- **Momento de inicialização do SDK**: O Resource é construído uma vez em `initializeTelemetry()`, sendo **imutável dentro do processo**. Isso é consistente com o design do SDK OTel.
- **Subprocesso (subagent)**: O subagent do qwen-code é intra-processo (`subagent-runtime.ts`), compartilhando o Resource. Se no futuro houver subprocesso entre processos, o processo filho fará **nova inicialização do SDK**, relendo variáveis de ambiente e settings — desde que o env seja repassado, o comportamento será consistente.
- **Hot reload**: Alterações no settings **não reconstroem o Resource**. A operadora precisa reiniciar o CLI para que as alterações tenham efeito. A documentação deve deixar isso claro.
- **`refreshSessionContext()`** (`sdk.ts:306`): Apenas atualiza o contexto ALS da sessão, **não reconstrói o Resource** — pois o Resource não terá mais `session.id` (uma das alterações principais deste design).

## 5. Alterações no schema de configuração

### 5.1 Interface `TelemetrySettings` (`packages/core/src/config/config.ts:293`)

```ts
export interface TelemetrySettings {
  // ... campos existentes
  /** Atributos de Resource estáticos anexados a cada span/log/métrica. */
  resourceAttributes?: Record<string, string>;
  /** Controles de cardinalidade por sinal. */
  metrics?: {
    /** Incluir session.id nos pontos de dados de métrica (padrão: false). */
    includeSessionId?: boolean;
  };
}
```

### 5.2 Getter `Config` (mesmo arquivo)

```ts
class Config {
  getTelemetryResourceAttributes(): Record<string, string> {
    return this.telemetrySettings.resourceAttributes ?? {};
  }
  getTelemetryMetricsIncludeSessionId(): boolean {
    return this.telemetrySettings.metrics?.includeSessionId ?? false;
  }
}
```

### 5.3 Novas adições em `resolveTelemetrySettings()`

```ts
const envResourceAttrs = parseOtelResourceAttributes(
  env['OTEL_RESOURCE_ATTRIBUTES'],
);
const settingsResourceAttrs = { ...(settings.resourceAttributes ?? {}) };

// Remove chaves RESERVED de ambas as fontes (avisa se o usuário tentou defini-las).
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envResourceAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES não pode sobrescrever "${k}"; ignorando`);
    delete envResourceAttrs[k];
  }
  if (k in settingsResourceAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes não pode sobrescrever "${k}"; ignorando`,
    );
    delete settingsResourceAttrs[k];
  }
}

// Mescla: env < settings (settings vence em conflito).
const merged: Record<string, string> = {
  ...envResourceAttrs,
  ...settingsResourceAttrs,
};

// Precedência de service.name: OTEL_SERVICE_NAME (escape apenas de env) vence sobre
// qualquer outra coisa. settings já sobrescreveu env no spread acima.
if (env['OTEL_SERVICE_NAME']) {
  merged['service.name'] = env['OTEL_SERVICE_NAME'];
}

const resourceAttributes = merged;

const metricsIncludeSessionId =
  parseBooleanEnvFlag(env['QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID']) ??
  settings.metrics?.includeSessionId ??
  false;

return {
  // ... campos existentes
  resourceAttributes,
  metrics: { includeSessionId: metricsIncludeSessionId },
};
```

### 5.4 Alterações na construção do Resource em `sdk.ts`

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version é sempre interno; service.name flui através dos userAttrs
// (já resolvido com prioridade OTEL_SERVICE_NAME no resolver).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id deliberadamente NÃO colocado no Resource — veja documento de design §4.1
});
```

### 5.5 Alterações em `settingsSchema.ts`

Em `packages/cli/src/config/settingsSchema.ts:998-1018`, dentro de `telemetry.jsonSchemaOverride.properties`, adicionar:

```ts
{
  // ... includeSensitiveSpanAttributes existente
  resourceAttributes: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Atributos de Resource estáticos anexados a todos os dados de telemetria. ' +
      'As chaves devem ser strings; os valores devem ser strings. ' +
      'Chaves reservadas (service.name, service.version) são ignoradas silenciosamente.',
    default: {},
  },
  metrics: {
    type: 'object',
    additionalProperties: false,
    properties: {
      includeSessionId: {
        type: 'boolean',
        default: false,
        description:
          'Incluir session.id em cada ponto de dado de métrica. ' +
          'AVISO: cada nova sessão do CLI gera um novo valor, causando ' +
          'fan-out ilimitado de séries temporais de métricas. Ative apenas para depuração de curto prazo.',
      },
    },
  },
}
```

Também deve ser reavaliado `additionalProperties: true` — atualmente é permissivo; pode permanecer assim ou ser alterado para estrito. Recomenda-se manter permissivo para evitar alterações disruptivas em outros campos `telemetry.*` não declarados no schema, mas documentar claramente que "campos não declarados serão ignorados".

## 6. Lista de alterações de arquivos

| Arquivo                                                        | Alteração                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                           | Modificar construção do Resource (mesclar attrs do usuário, remover `session.id`) |
| `packages/core/src/telemetry/resource-attributes.ts` (novo)    | `parseOtelResourceAttributes()` + constante `RESERVED_RESOURCE_ATTRIBUTE_KEYS` |
| `packages/core/src/telemetry/config.ts`                        | Resolver incluir `resourceAttributes` + `metrics.includeSessionId`, parsing e mesclagem |
| `packages/core/src/telemetry/metrics.ts`                       | `getCommonAttributes()` adicionar toggle gate                                  |
| `packages/core/src/config/config.ts`                           | Schema `TelemetrySettings` + dois getters                                      |
| `packages/cli/src/config/settingsSchema.ts`                    | `jsonSchemaOverride` adicionar `resourceAttributes` + `metrics`                |
| `docs/developers/development/telemetry.md`                     | Adicionar seções "Atributos de Resource" e "Controles de cardinalidade" + notas de migração + exemplos |
| `packages/core/src/telemetry/resource-attributes.test.ts` (novo) | Testes unitários do parser (cobrindo todos os casos da §4.6)                   |
| `packages/core/src/telemetry/sdk.test.ts`                      | Prioridade de mesclagem / chaves reservadas / `OTEL_SERVICE_NAME`              |
| `packages/core/src/telemetry/metrics.test.ts`                  | Aparição de `session.id` com toggle off/on                                   |
| `packages/core/src/telemetry/config.test.ts`                   | Mesclagem env / settings                                                       |
| `CHANGELOG.md` ou release notes                                | Nota de breaking change do PR 2                                                |

## 7. Divisão em PRs

Três PRs para facilitar a revisão e controlar o raio de impacto:

### PR 1 — Atributos de Resource personalizados (aditivo, sem quebra)

- Novo arquivo `resource-attributes.ts`: `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- Campo `TelemetrySettings.resourceAttributes` + lógica de mesclagem no resolver
- Integração com `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES`, seguindo prioridade da §4.2
- Mesclar no Resource (`sdk.ts`)
- Adicionar `resourceAttributes` ao schema JSON em `settingsSchema.ts`
- **Não mexer** na posição de `session.id` no Resource
- Docs adicionar seção "Atributos de Resource"
**Risco:** Baixo. Totalmente aditivo, não modifica nenhum comportamento existente. A menos que o usuário defina ativamente variáveis de ambiente ou configurações, os dados exportados não mudam.

### PR 2 — Controles de cardinalidade (ruptura semântica)

- Remover `session.id` do Resource (linha `sdk.ts:160`)
- Adicionar toggle `metrics.includeSessionId` (configurações + env) + barreira `getCommonAttributes()`
- Adicionar esquema JSON `metrics` em `settingsSchema.ts`
- CHANGELOG / instruções de migração
- Teste de snapshot para fixar o conjunto de atributos de métrica (prevenir regressão)
- Docs: adicionar seção "Cardinality controls" + guia de migração

**Risco:** Médio. Qualquer consulta Prometheus / dashboard Grafana / regra de alerta que dependa de `session.id` em métricas será quebrada. Requer nota de lançamento explícita e janela de migração de 1-2 versões.

**Plano de transição opt-in** (candidato, **não adotado** nesta edição):

> O PR 2 poderia ser implementado como "opt-out" inicialmente – ainda injetar `session.id` em métricas por padrão, mas adicionar um log de aviso "este padrão mudará na v0.X". Um release depois, inverter o padrão.

Motivos para não adotar: (1) a base de usuários atual do qwen-code é pequena, superfície de impacto limitada; (2) é um bug de cardinalidade, quanto mais cedo o padrão seguro, melhor; (3) lançamento em duas etapas aumenta a carga de documentação. Se o dono da issue pai preferir ser conservador, pode adotar.

### PR 3 — Polimento de docs + exemplos (limpeza)

- `docs/developers/development/telemetry.md` adicionar exemplos (ver §10)
- Exemplos de integração com Alibaba Cloud ARMS / Prometheus / Grafana
- Incluir snippets de settings.json para todos os casos de uso típicos

## 8. Plano de testes

### 8.1 Testes unitários de `parseOtelResourceAttributes()`

Cobertura parametrizada para todas as linhas da tabela §4.6 (sugerido usar `it.each` do vitest):

```ts
it.each([
  ['', {}],
  ['a=1', { a: '1' }],
  ['a=1,b=2', { a: '1', b: '2' }],
  ['a=hello%20world', { a: 'hello world' }],
  ['a=val%ZZbad', { a: 'val%ZZbad' }], // percent inválido
  ['malformed', {}],
  ['=val', {}],
  ['a=', { a: '' }],
  ['a=1,a=2', { a: '2' }],
  [' a = 1 , b = 2 ', { a: '1', b: '2' }],
])('analisa %j → %j', (input, expected) => {
  expect(parseOtelResourceAttributes(input)).toEqual(expected);
});
```

### 8.2 Testes de merge do Resolver

| Cenário                                                                 | `service.name` esperado                           | Atributo de usuário esperado       |
| ----------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| Tudo vazio                                                              | `'qwen-code'`                                     | Não existe                         |
| Apenas env `OTEL_SERVICE_NAME=A`                                        | `'A'`                                             | —                                  |
| Apenas env `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                    | `'B'`                                             | —                                  |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`       | `'A'` (OTEL_SERVICE_NAME tem prioridade)          | —                                  |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                     | `'A'` (OTEL_SERVICE_NAME tem prioridade)          | —                                  |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}` | `'C'` (settings tem prioridade sobre env, sem OTEL_SERVICE_NAME) | — |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                 | `'qwen-code'`                                     | `team='y'` (settings tem prioridade) |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                         | `'qwen-code'` + aviso                             | service.version ainda é a versão real da CLI |
| `settings={service.version:fake}`                                       | `'qwen-code'` + aviso                             | service.version ainda é a versão real da CLI |

### 8.3 Testes de snapshot do conteúdo do Resource

Usar `InMemorySpanExporter` para obter um span e afirmar:

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // crucial
expect(span.resource.attributes['team']).toBe('platform'); // adicionado pelo usuário
```

### 8.4 Testes do toggle de atributo de métrica

```ts
it('não emite session.id em métricas por padrão', async () => {
  // emitir um contador de chamada de ferramenta
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBeUndefined();
});

it('emite session.id quando o toggle é verdadeiro', async () => {
  config.telemetrySettings.metrics = { includeSessionId: true };
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBe(KNOWN_SESSION_ID);
});
```

### 8.5 Testes de manutenção de comportamento em Spans / Logs

- spans ainda contêm `session.id` (não afetado pelo toggle de métrica)
- logs ainda contêm `session.id` (não afetado pelo toggle de métrica)

### 8.6 Proteção contra regressão

- `autoDetectResources: false` permanece inalterado (afirmação na configuração)
- Nenhum `diag.error` novo durante a inicialização (capturar logs diag do OTel para afirmação)
- Todos os testes de telemetria existentes passam (CI)

### 8.7 Testes de aviso Diag

Verificar que as seguintes entradas disparam `diag.warn` uma vez:

- `settings.resourceAttributes = { 'service.version': 'x' }` (reservado)
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x` (reservado, env também deve avisar)
- `OTEL_RESOURCE_ATTRIBUTES=malformed` (sem `=`)
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ` (percent-encoding inválido)

Verificar que as seguintes entradas **não** disparam aviso (caminho legítimo):

- `settings.resourceAttributes = { 'service.name': 'x' }` (settings permite definir service.name)
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }` (OTEL_SERVICE_NAME tem prioridade, não precisa de aviso)

## 9. Migração / Mudanças disruptivas

### 9.1 Mudança disruptiva (PR 2)

**`session.id` em métricas desaparece por padrão.** Isso afeta:

- Agregações em consultas Prometheus com `by (session_id)` / `group_left(session_id)`
- Gráficos em dashboard Grafana segmentados por sessão
- Quaisquer regras de alerta agrupadas por session.id

Nota: `session.id` em spans e logs **não é afetado**.

### 9.2 Caminho de migração

Documentar duas opções:

**Opção A**: Restaurar comportamento antigo (recomendado para debug de curto prazo)

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

ou em `settings.json`:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **Aviso**: Manter ativado por longo prazo fará com que o número de séries temporais de métricas seja igual ao número de sessões históricas, sobrecarregando o backend. Use apenas para debug de curto prazo.

**Opção B**: Usar spans / logs para segmentação por sessão (recomendado)

- `session.id` ainda está presente em spans / logs, permitindo segmentação por sessão em backends de trace (como Jaeger / Aliyun ARMS Tracing) / backends de log (como Loki / SLS)
- Esses dois tipos de dados são armazenados por evento, a cardinalidade não explode
- Adequado para análise drill-down no nível de sessão

### 9.3 Template de nota de lançamento

```
**Mudança disruptiva (atributo de métrica):**

O atributo `session.id` não é mais anexado aos pontos de dados de métrica
por padrão. Isso protege os backends de métrica de uma expansão ilimitada
de séries temporais.

- Spans e logs não são afetados — `session.id` ainda está presente.
- Para restaurar o comportamento anterior (apenas debug de curto prazo), defina
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` ou em settings.json:
  `telemetry.metrics.includeSessionId: true`.
- Para correlação de sessão de longo prazo, consulte backends de trace / log
  em vez de backends de métrica.

Consulte docs/developers/development/telemetry.md "Migração" para detalhes.
```

## 10. Exemplos de configuração (para documentação)

### 10.1 Segmentar toda telemetria por team / env

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

Efeito: todos os spans / logs / métricas terão `team=platform` `env=prod` `cost_center=eng-123`.

### 10.2 Usar `OTEL_SERVICE_NAME` para roteamento em collector compartilhado

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

Efeito: `service.name=qwen-code-ci`, collector OTel multi-tenant pode rotear para diferentes backends com base em service.name.

### 10.3 Baseline da frota + override de máquina individual

`~/.qwen/settings.json` da frota corporativa (distribuído via GitOps):

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

Override temporário em máquina individual (sem modificar settings):

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# Os deployment.environment / service.namespace das settings ainda valem
# Além disso, esta execução terá debug_run=true adicional
```

### 10.4 Ativar metric session.id para debug de curto prazo

```bash
# Execução única de debug
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "análise de investimento"
```

Desligar após o uso, não persistir em settings.

### 10.5 Integração com Alibaba Cloud ARMS Metric (configuração recomendada)

```json
{
  "telemetry": {
    "enabled": true,
    "otlpEndpoint": "http://<arms-endpoint>/api/v1/...",
    "otlpProtocol": "http",
    "resourceAttributes": {
      "team": "platform",
      "deployment.environment": "production"
    },
    "metrics": {
      "includeSessionId": false
    }
  }
}
```

## 11. Comparação com a implementação do claude-code

| Dimensão                        | claude-code                                      | qwen-code este design                             | Base da decisão                                      |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------- |
| Variável de ambiente OTel padrão | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ Consistente                                   | Contrato padrão                                      |
| Prioridade de `OTEL_SERVICE_NAME` | Segue especificação OTel                       | ✅ Segue                                         | Spec define claramente                               |
| Nomenclatura do toggle de cardinalidade | `OTEL_METRICS_INCLUDE_*`                   | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | Não poluir namespace OTel padrão                     |
| Escopo do toggle                | Apenas métrica                                  | ✅ Apenas métrica                                 | Spans / logs são por evento, sem problema de cardinalidade |
| Valor padrão                    | Atributo de alta cardinalidade padrão false     | ✅ Padrão false                                   | Segurança primeiro                                   |
| Granularidade por atributo      | Um toggle por atributo                          | ✅ Consistente                                    | Flexível, atende necessidades reais de diagnóstico   |
| Equivalente em settings.json    | ❌ Não tem                                       | ✅ Tem `telemetry.resourceAttributes` + `metrics` | Empresas implantam base config para frota            |
| Hook dinâmico por span          | ❌ Não tem                                       | ❌ Não tem                                        | Complexidade alta, claude-code também não resolveu, não feito nesta edição |
| `account_uuid` multi-tenant     | Sim                                             | ❌ Não tem                                        | qwen-code não tem este atributo em métricas           |
| `options.env` do Agent SDK      | Sim                                             | ❌ Não tem                                        | qwen-code não tem modo equivalente                   |
| Política de chave reservada     | Não permite sobrescrever id built-in            | ✅ Consistente                                    | Credibilidade da telemetria                          |
| Canal de envio próprio          | claude-code também tem canal próprio independente (isolado do OTel) | ✅ qwen-logger também isolado | Separar responsabilidades entre canal próprio e de terceiros |

**Dois pontos mais valiosos para aproveitar:**

1. **Convenção de nomenclatura**: `*_INCLUDE_*` indica semântica de imediato, mais clara que nomes negados (`*_EXCLUDE_*` / `*_DROP_*`)
2. **Escopo contido**: apenas barreira em métrica, não em span/log — claramente claude-code já passou por esse limite e nós nos beneficiamos diretamente

**O que qwen-code faz melhor:**

- Suporte a settings.json: claude-code depende exclusivamente de variáveis de ambiente, não é amigável para cenários de frota corporativa
- Política de chave reservada explícita (`service.version` não pode ser sobrescrito): reduz possibilidade de poluição da telemetria
- Isolamento do canal próprio: qwen-logger usa canal independente, completamente desacoplado das configurações OTLP do usuário

## 12. Trabalhos futuros (v2 + candidatos)

- **Controle de cardinalidade de `service.version`**: usar OTel View API para descartar atributo no nível de métrica
- **Mais toggles de cardinalidade**: se no futuro atributos como `user.account_uuid` / `model` forem introduzidos em métricas, adicionar toggles conforme necessário
- **Hook dinâmico de atributo por span**: pode aproveitar o sistema de hooks próprio do qwen-code, adicionar callback `OnSpanStart(span, context) => attrs`. Requer design independente.
- **Validação de esquema de atributos de Resource**: limitar namespace das chaves (ex.: proibir sobrescrever atributos built-in além do prefixo `service.*`). Atualmente, a lista de chaves reservadas codificada é suficiente.
- **Hot reload de Resource**: quando settings.json é modificado dentro do processo (cenário de daemon qwen-serve), atualmente o Resource não é recriado. Se o cenário de daemon amadurecer, pode-se adicionar um caminho de recarga.
- **Propagação de contexto subagent entre processos**: quando subagent cruza processos, propagar o contexto de trace do pai (incluindo Resource) através dos cabeçalhos padrão de propagação de contexto OTel. Requer design independente.