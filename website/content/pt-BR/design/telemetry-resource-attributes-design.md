# Telemetry: Atributos de Recurso Personalizados + Controles de Cardinalidade de Métricas

> Issue associada: [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> Issue pai: [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> Baseado na revisão de código do branch main do qwen-code em 21/05/2026

## 1. Contexto

O qwen-code já integra o SDK do OpenTelemetry, mas a forma como o Resource é construído o torna inutilizável em dois cenários comuns de produção:

1. **Impossível anexar dimensões personalizadas**: a equipe de operações deseja adicionar tags como `team` / `env` / `cost_center` / `user_id` a todos os dados de telemetria; atualmente não há nenhum mecanismo para fazer isso. Mesmo configurar a variável de ambiente padrão `OTEL_RESOURCE_ATTRIBUTES` **não funciona completamente**.
2. **Cardinalidade de métricas fora de controle**: `session.id` é injetado no nível de Resource e é anexado automaticamente a cada ponto de dado de métrica. Cada sessão CLI gera um novo valor, e os backends de métricas (Prometheus / Alibaba Cloud ARMS Metric / VictoriaMetrics) seriam sobrecarregados por time-series ilimitados.

Esses dois problemas estão acoplados: resolver o primeiro torna **mais fácil** para os usuários adicionarem campos de alta cardinalidade aos dados, então o segundo deve ser tratado em conjunto.

## 2. Estado Atual

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
  // pendentes e disparam um diag.error do OTel em qualquer leitura de atributo de resource
  // antes que os detectores se estabilizem (ex.: durante criação de span do HttpInstrumentation).
  autoDetectResources: false,
  ...
});
```

`autoDetectResources: false` desliga o `envDetector` padrão do OTel — que é a camada que normalmente leria `OTEL_RESOURCE_ATTRIBUTES` e `OTEL_SERVICE_NAME`. Isso tem um motivo (detector assíncrono, dispara `diag.error` antes de estabilizar), mas o efeito colateral é que essas duas variáveis de ambiente padrão são **completamente inúteis** no qwen-code.

### 2.2 `session.id` é na verdade uma tripla injeção

| Local                        | Linha                     | Impacto                                  |
| ---------------------------  | ------------------------  | --------------------------------------   |
| Resource                     | `sdk.ts:160`              | Todos os sinais (spans / logs / metrics) |
| Por-span                     | `session-tracing.ts:169`  | spans                                    |
| Por-log                      | `loggers.ts:128`          | logs                                     |
| **`getCommonAttributes()`**  | `metrics.ts:57`           | **Cada registro de métrica recebe explicitamente via spread** |

Ou seja, **remover `session.id` apenas do Resource não é suficiente** — `getCommonAttributes()` em `metrics.ts:57` é chamado por 30+ pontos de métrica que fazem `...spread`, reinserindo `session.id`.

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

Boas notícias: todos os pontos de métrica (30+) passam por essa única função, que é um gargalo natural.

### 2.3 Padrão do config resolver

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` usa uma cadeia de prioridade unificada:

```
argv (mais alta)  >  env QWEN_*  >  env OTEL_*  >  settings.json (mais baixa)
```

Novas adições seguem esse padrão.

### 2.4 Estado atual do schema de configurações

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
    additionalProperties: true,  // ← Atualmente não valida outras chaves telemetry.*
  },
}
```

`additionalProperties: true` significa que hoje o schema permite qualquer campo como `otlpEndpoint` / `otlpProtocol` / `resourceAttributes` sem validação. Ao adicionar os novos campos `resourceAttributes` / `metrics`, devemos atualizar o schema em paralelo para permitir autocomplete no IDE e renderização na UI de configurações.

### 2.5 Caminhos de código fora do escopo deste design

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` é o **canal de relatório próprio do qwen-code** (baseado no protocolo interno da Alibaba RUM `RumResourceEvent`), completamente independente do SDK OTel. Ele tem seu próprio endpoint, proxy e modelo de dados, **não sendo afetado por este design**. Consulte a seção 3 para detalhes.

### 2.6 Variáveis de ambiente `OTEL_*` suportadas / não suportadas

| Variável de ambiente                                     | Status                            |
| ------------------------------------------------------- | --------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                            | ✅ Suportada (`config.ts:79`)     |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT`     | ✅ Suportada                     |
| `OTEL_EXPORTER_OTLP_HEADERS`                             | ✅ Lida diretamente pelo exporter |
| `OTEL_TRACES_SAMPLER`                                    | ✅ Suportada (`tracer.ts:247`)    |
| **`OTEL_RESOURCE_ATTRIBUTES`**                           | ❌ Não suportada                 |
| **`OTEL_SERVICE_NAME`**                                  | ❌ Não suportada                 |
| **`OTEL_METRICS_INCLUDE_*`**                             | ❌ Não suportada (estilo claude-code) |

## 3. Objetivos / Não Objetivos

### 3.1 Objetivos

- Permitir que a equipe de operações anexe atributos de resource personalizados a todos os spans / logs / metrics exportados via OTLP usando as variáveis de ambiente padrão `OTEL_RESOURCE_ATTRIBUTES` e o próprio `settings.json`
- Fazer `OTEL_SERVICE_NAME` funcionar de acordo com a especificação OTel (incluindo prioridade em relação a `service.name` dentro de `OTEL_RESOURCE_ATTRIBUTES`)
- Por padrão, **não** carregar `session.id` nas métricas (protegendo a cardinalidade do backend)
- Fornecer uma chave explícita para que usuários que precisam de correlação no nível de métrica possam reativá-la
- Manter `session.id` em spans e logs (correlação de trace é necessária)
- Manter `autoDetectResources: false`, não regredir o bug já corrigido do `diag.error`
- Atualizar `settingsSchema.ts` em conjunto para que os novos campos fiquem visíveis na UI de configurações e no IDE

### 3.2 Não Objetivos

- **Canal de relatório próprio `qwen-logger`**: Caminho RUM completamente independente, fora do escopo deste design. Os campos que ele reporta (device id, user agent, etc.) são determinados pelo protocolo RUM e não devem ser poluídos por atributos de resource do usuário. Se no futuro for necessário adicionar dimensões personalizadas ao `qwen-logger`, isso será tratado em outro design independente.
- **Hook de atributo dinâmico por span**: Permitir que o usuário escreva código / hook para calcular atributo a cada span. O claude-code também não resolveu isso; complexidade alta, benefício baixo.
- **Controle de cardinalidade de `service.version`**: A frequência de mudança de versão é limitada (mensal), o crescimento de time-series é gerenciável. Se necessário, será tratado em v2 com a API de View do OTel.
- **Atributos de resource por query no formato Agent SDK**: O qwen-code atualmente não possui cenário de chamada via SDK.
- **Configuração de cabeçalhos de requisição OTLP (auth headers)**: É outra linha de issue (#3731 P1), independente deste design.
- **Atributo de resource via flag CLI**: Variável de ambiente + settings.json já cobrem cenários temporários e de baseline. Flags CLI tornariam a linha de comando prolixa sem ganho significativo.
## 4. Design

### 4.1 Visão geral das camadas

```
┌─ Resource（sdk.ts:156）────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                         > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                         > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [reserved]     │
│   ...user attrs       ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id 移走                                            │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169，保留）
       ├──→ Logs      ＋ session.id（loggers.ts:128，保留）
       └──→ Metrics   ＋ getCommonAttributes() — 默认 {}
                          toggle ON: { session.id }
```

### 4.2 Prioridade / ordem de mesclagem

#### Atributos gerais

Baixo → Alto:

1. `OTEL_RESOURCE_ATTRIBUTES` (variável de ambiente padrão do OTel)
2. `settings.telemetry.resourceAttributes`
3. Chaves reservadas internas (sobrescrevem qualquer homônimo acima)

**Justificativa**: Variáveis de ambiente são substituições temporárias em tempo de operação (CI / depuração local), settings.json é a linha de base aplicada por frota, internas são contrato do produto — a linha de base deve ter prioridade maior que variáveis temporárias, e as internas devem ter prioridade máxima.

#### Tratamento especial de `service.name`

`service.name` deve seguir a [especificação OTel](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/):

> **`OTEL_SERVICE_NAME` tem precedência sobre `service.name` definido com a variável `OTEL_RESOURCE_ATTRIBUTES`.**

Portanto, para `service.name` aplica-se esta cadeia de prioridade (alto → baixo):

1. `OTEL_SERVICE_NAME` (maior, conforme especificação padrão do OTel)
2. `settings.resourceAttributes.service.name` (configurações têm prioridade sobre env, seguindo a regra geral deste design)
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. Padrão interno `'qwen-code'`

`service.name` pode ser sobrescrito via settings — é a identidade do serviço; configurar o service.name com um settings.json unificado por frota empresarial é comum e razoável, e proibir isso bloquearia cenários de distribuição via GitOps. O `OTEL_SERVICE_NAME`, como canal de "maior prioridade" definido pela especificação OTel, ainda pode sobrescrever temporariamente as configurações em CI / depuração local.

Regras específicas:

| Fonte                                                    | Efeito na escrita de `service.name`           |
| ------------------------------------------------------- | --------------------------------------------- |
| `OTEL_SERVICE_NAME=foo`                                 | ✅ Maior prioridade (sobrescreve qualquer outra fonte) |
| `settings.resourceAttributes={ "service.name": "foo" }` | ✅ Só é válido se não houver `OTEL_SERVICE_NAME` |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`             | ✅ Só é válido se nenhum dos anteriores estiver presente |

### 4.3 Estratégia de chaves reservadas

| Chave               | Sobrescrita pelo usuário?                                                             | Justificativa                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `service.name`      | ✅ Tanto variável de ambiente quanto configurações (veja cadeia de prioridade §4.2)    | Identidade do serviço, deve permitir controle operacional                                                      |
| `service.version`   | ❌ Descartado de qualquer fonte + aviso                                               | Credibilidade da telemetria — não permitir que o usuário falsifique a versão                                   |
| `session.id`        | ❌ Descartado de qualquer fonte + aviso (adicionalmente há uma alternância para controlar injeção em tempo de execução nas métricas) | Apenas em tempo de execução; se o usuário escrever no Recurso, contornará a alternância de cardinalidade das métricas (atributos de Recurso são anexados automaticamente a todos os sinais) |
| `qwen.*` prefixo    | ⚠️ Não é obrigatório, mas a documentação sugere reservar para uso próprio do produto  | Evitar conflitos futuros entre atributos internos e atributos do usuário                                       |

**Chaves reservadas mantidas centralmente como constantes**:

```ts
// telemetry/resource-attributes.ts (new file)
/** Keys that cannot be overridden from any source (env or settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` **não** está na lista RESERVED — ele segue sua própria cadeia de prioridade (§4.2), não faz parte da semântica de "proibição global de sobrescrita". RESERVED significa "qualquer fonte que escrever isso será avisado e descartado", aplica-se uniformemente às entradas de ambiente e de configurações.

### 4.4 Análise de `OTEL_RESOURCE_ATTRIBUTES`

Implementação síncrona, contornando o envDetector assíncrono do OTel:

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
        `Skipping malformed OTEL_RESOURCE_ATTRIBUTES entry: ${trimmed}`,
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
        `Invalid percent-encoding in OTEL_RESOURCE_ATTRIBUTES for key "${key}", using raw value`,
      );
      value = valueRaw;
    }
    out[key] = value; // duplicate keys: last wins (matches OTel reference impls)
  }
  return out;
}
```

O formato segue estritamente a especificação do OTel: `key1=val1,key2=val2`, valores codificados em percent-encoding.

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
调用点（30+ 个）零改动——`...spread` 一个空对象等价于不展开任何字段。

### 4.6 边界情况与校验

| 输入                                                             | 行为                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (空字符串)                         | 返回 `{}`，正常启动                                                     |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (无 `=`)                          | 跳过该项 + `diag.warn`，继续解析其余                                    |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (空 key)                       | 跳过该项，继续解析其余                                                  |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (空 value)                   | `a=''`, `b='2'`（OTel 规范允许空 value）                                |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (无效 percent-encoding) | 保留原始 `val%ZZbad` + `diag.warn`                                      |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (duplicate key)             | 后写胜出 `a=2`（与 OTel SDK 参考实现一致）                              |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (含空格)                  | 自动 trim                                                               |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                     | 静默丢弃 `service.version` + `diag.warn`，保留其他键                    |
| `settings.resourceAttributes={ "service.name": "x" }`            | 接受（settings 可设 service.name，见 §4.2）                             |
| `settings.resourceAttributes={ "service.version": "x" }`         | 静默丢弃 + `diag.warn`                                                  |
| `settings.resourceAttributes={ "team": 123 }` (非 string)        | TypeScript 类型阻挡；runtime 传入则 settings JSON schema validator 拒绝 |
| Resource 总大小 > OTel 限制 (4KB?)                               | 由底层 OTel SDK 处理，不在本层校验                                      |

**为什么不在本层做 attribute key 命名校验**（如 OTel 推荐的 `[a-z][a-z0-9_.]*` 模式）：OTel SDK 自己会在 export 时校验，本层重复校验既慢又容易和 SDK 行为偏移。我们只做格式解析，不做语义校验。

**RESERVED 键的强制保护对两个入口都生效**：

```ts
// 应用于 env-parsed attrs
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envAttrs[k];
  }
}

// 应用于 settings attrs
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in settingsAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsAttrs[k];
  }
}
```

### 4.7 生命周期与多进程

- **SDK init 时机**：Resource 在 `initializeTelemetry()` 时一次性构造，**进程内不可变**。这与 OTel SDK 设计一致。
- **Subagent fork**：qwen-code 的 subagent 是同进程内的 (`subagent-runtime.ts`)，共享 Resource。若未来引入跨进程 subagent，子进程会**重新 init SDK**，重新读 env var 和 settings——只要 env 透传过去，行为一致。
- **Hot reload**：settings 修改后**不会重新构造 Resource**。需要操作员重启 CLI 才能生效。文档应明确说明。
- **`refreshSessionContext()`** (`sdk.ts:306`)：仅刷新 session ALS context，**不重建 Resource**——因为 Resource 上已经没有 `session.id` 了（本设计的核心改动之一）。

## 5. Config schema 改动

### 5.1 `TelemetrySettings` 接口（`packages/core/src/config/config.ts:293`）

```ts
export interface TelemetrySettings {
  // ... existing fields
  /** Static resource attributes attached to every span/log/metric. */
  resourceAttributes?: Record<string, string>;
  /** Per-signal cardinality controls. */
  metrics?: {
    /** Include session.id on metric data points (default: false). */
    includeSessionId?: boolean;
  };
}
```

### 5.2 `Config` getter（同文件）

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

### 5.3 `resolveTelemetrySettings()` 新增

```ts
const envResourceAttrs = parseOtelResourceAttributes(
  env['OTEL_RESOURCE_ATTRIBUTES'],
);
const settingsResourceAttrs = { ...(settings.resourceAttributes ?? {}) };

// Strip RESERVED keys from both sources (warn if user tried to set them).
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envResourceAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envResourceAttrs[k];
  }
  if (k in settingsResourceAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsResourceAttrs[k];
  }
}

// Merge: env < settings (settings wins on conflict).
const merged: Record<string, string> = {
  ...envResourceAttrs,
  ...settingsResourceAttrs,
};

// service.name precedence: OTEL_SERVICE_NAME (env-only escape) wins over
// everything else. settings already overwrote env in the spread above.
if (env['OTEL_SERVICE_NAME']) {
  merged['service.name'] = env['OTEL_SERVICE_NAME'];
}

const resourceAttributes = merged;

const metricsIncludeSessionId =
  parseBooleanEnvFlag(env['QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID']) ??
  settings.metrics?.includeSessionId ??
  false;

return {
  // ... existing fields
  resourceAttributes,
  metrics: { includeSessionId: metricsIncludeSessionId },
};
```
### 5.4 `sdk.ts` Alteração na construção de Resource

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version sempre é embutido; service.name passa por userAttrs
// (já foi resolvido com precedência OTEL_SERVICE_NAME no resolver).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id deliberadamente NÃO colocado no Resource — veja doc de design §4.1
});
```

### 5.5 Alteração em `settingsSchema.ts`

Em `packages/cli/src/config/settingsSchema.ts:998-1018`, dentro de `telemetry.jsonSchemaOverride.properties`, adicionar:

```ts
{
  // ... existing includeSensitiveSpanAttributes
  resourceAttributes: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Atributos de recurso estáticos anexados a todos os dados de telemetria. ' +
      'As chaves devem ser strings; os valores devem ser strings. ' +
      'Chaves reservadas (service.name, service.version) são descartadas silenciosamente.',
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
          'Inclui session.id em todo ponto de dado de métrica. ' +
          'AVISO: cada sessão da CLI cria um novo valor, causando expansão ilimitada ' +
          'de séries temporais de métrica. Ative apenas para depuração de curto prazo.',
      },
    },
  },
}
```

Também reavaliar `additionalProperties: true` — atualmente é permissivo, pode mantê-lo ou tornar estrito. Sugere-se manter permissivo para evitar alteração disruptiva em outros campos `telemetry.*` não declarados no schema, mas deixar claro na documentação que "campos não declarados serão ignorados".

## 6. Lista de alterações de arquivos

| Arquivo                                                            | Alteração                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                               | Modificação na construção de Resource (mescla user attrs, remove `session.id`)          |
| `packages/core/src/telemetry/resource-attributes.ts` (novo)        | `parseOtelResourceAttributes()` + constante `RESERVED_RESOURCE_ATTRIBUTE_KEYS`          |
| `packages/core/src/telemetry/config.ts`                            | Resolver adiciona `resourceAttributes` + análise e mesclagem de `metrics.includeSessionId` |
| `packages/core/src/telemetry/metrics.ts`                           | `getCommonAttributes()` com gate de toggle                                               |
| `packages/core/src/config/config.ts`                               | Schema `TelemetrySettings` + dois getters                                                 |
| `packages/cli/src/config/settingsSchema.ts`                        | `jsonSchemaOverride` adiciona `resourceAttributes` + `metrics`                           |
| `docs/developers/development/telemetry.md`                         | Adiciona seções "Atributos de recurso" + "Controles de cardinalidade" + nota de migração + exemplos |
| `packages/core/src/telemetry/resource-attributes.test.ts` (novo)   | Testes unitários do parser (cobrindo todos os casos de §4.6)                             |
| `packages/core/src/telemetry/sdk.test.ts`                          | Prioridade de mesclagem / chaves preservadas / `OTEL_SERVICE_NAME`                       |
| `packages/core/src/telemetry/metrics.test.ts`                      | Aparecimento ou não de `session.id` com toggle desligado/ligado                         |
| `packages/core/src/telemetry/config.test.ts`                       | Mesclagem de env / settings                                                              |
| `CHANGELOG.md` ou notas de release                                 | Descrição da alteração disruptiva do PR 2                                                |

## 7. Divisão em PRs

Para facilitar a revisão e reduzir o raio de impacto, dividir em três PRs:

### PR 1 — Atributos de recurso customizados (aditivo, sem quebras)

- Novo arquivo `resource-attributes.ts`: `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- Campo `TelemetrySettings.resourceAttributes` + lógica de mesclagem no resolver
- Integração com `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES`, seguindo prioridade §4.2
- Mesclagem no Resource (`sdk.ts`)
- Adicionar `resourceAttributes` no JSON schema de `settingsSchema.ts`
- **Não** mexer na posição de `session.id` no Resource
- Documentação adiciona seção "Atributos de recurso"

**Risco**: Baixo. Totalmente aditivo, não altera comportamento existente. A menos que o usuário ative explicitamente variáveis de ambiente ou configurações, os dados exportados não mudam.

### PR 2 — Controles de cardinalidade (quebra semântica)

- Remover `session.id` do Resource (linha `sdk.ts:160`)
- Adicionar toggle `metrics.includeSessionId` (settings + env) + gate em `getCommonAttributes()`
- Adicionar JSON schema de `metrics` em `settingsSchema.ts`
- CHANGELOG / nota de migração
- Testes de snapshot fixam o conjunto de atributos de métrica (para evitar regressão)
- Documentação adiciona seção "Controles de cardinalidade" + guia de migração

**Risco**: Moderado. Qualquer query Prometheus / dashboard Grafana / regra de alerta que dependa de `session.id` nas métricas será afetada. Necessária nota de release explícita e janela de migração de 1 a 2 versões.

**Estratégia de transição opt-in** (candidata, mas **não recomendada** para este ciclo):

> O PR 2 poderia inicialmente ser implementado como "opt-out" — ainda injetar `session.id` nas métricas por padrão, mas adicionar um log de aviso "este padrão será alterado na v0.X". Após um release, inverter o padrão.

Motivos para não recomendar: (1) a base de usuários do qwen-code atual é pequena, o impacto é limitado; (2) isso é um bug de cardinalidade, quanto antes o padrão for seguro, melhor; (3) uma liberação em dois estágios aumenta a carga de documentação. Caso o responsável pelo issue pai queira ser mais conservador, pode-se adotar.
### PR 3 — Docs polish + samples (cleanup)

- `docs/developers/development/telemetry.md` adicione exemplos (ver §10)
- Exemplos de integração com Alibaba Cloud ARMS / Prometheus / Grafana
- Adicione trechos de `settings.json` para todos os casos de uso típicos

## 8. Plano de Testes

### 8.1 Testes Unitários de `parseOtelResourceAttributes()`

Cobertura parametrizada de todas as linhas da tabela §4.6 (recomenda-se usar vitest `it.each`):

```ts
it.each([
  ['', {}],
  ['a=1', { a: '1' }],
  ['a=1,b=2', { a: '1', b: '2' }],
  ['a=hello%20world', { a: 'hello world' }],
  ['a=val%ZZbad', { a: 'val%ZZbad' }], // invalid percent
  ['malformed', {}],
  ['=val', {}],
  ['a=', { a: '' }],
  ['a=1,a=2', { a: '2' }],
  [' a = 1 , b = 2 ', { a: '1', b: '2' }],
])('parses %j → %j', (input, expected) => {
  expect(parseOtelResourceAttributes(input)).toEqual(expected);
});
```

### 8.2 Teste de Merge do Resolver

| Cenário                                                                 | `service.name` esperado                             | user attr esperado                   |
| ----------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| Tudo vazio                                                              | `'qwen-code'`                                       | inexistente                          |
| Apenas env `OTEL_SERVICE_NAME=A`                                        | `'A'`                                               | —                                    |
| Apenas env `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                    | `'B'`                                               | —                                    |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`       | `'A'` (OTEL_SERVICE_NAME tem prioridade)            | —                                    |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                     | `'A'` (OTEL_SERVICE_NAME tem prioridade)            | —                                    |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}` | `'C'` (settings tem prioridade sobre env, sem OTEL_SERVICE_NAME) | —                                    |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                 | `'qwen-code'`                                       | `team='y'` (settings tem prioridade) |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                         | `'qwen-code'` + aviso                               | service.version ainda é a versão real do cli |
| `settings={service.version:fake}`                                       | `'qwen-code'` + aviso                               | service.version ainda é a versão real do cli |

### 8.3 Teste de Snapshot do Conteúdo do Resource

Use `InMemorySpanExporter` para obter um span e afirme:

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // crucial
expect(span.resource.attributes['team']).toBe('platform'); // adicionado pelo usuário
```

### 8.4 Teste do Toggle de Atributos de Métrica

```ts
it('does not emit session.id on metrics by default', async () => {
  // emit one tool call counter
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBeUndefined();
});

it('emits session.id when toggle is true', async () => {
  config.telemetrySettings.metrics = { includeSessionId: true };
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBe(KNOWN_SESSION_ID);
});
```

### 8.5 Teste de Comportamento Mantido para Spans/Logs

- spans ainda têm `session.id` (não afetado pelo toggle de métrica)
- logs ainda têm `session.id` (não afetado pelo toggle de métrica)

### 8.6 Proteção de Regressão

- `autoDetectResources: false` permanece inalterado (asserção na configuração)
- Nenhum novo `diag.error` deve aparecer durante a inicialização (capturar logs diag do OTel para asserção)
- Todos os testes de telemetria existentes passam (CI)

### 8.7 Teste de Aviso do Diag

Verifique se as seguintes entradas disparam `diag.warn` uma vez cada:

- `settings.resourceAttributes = { 'service.version': 'x' }` (reservado)
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x` (reservado, env também deve avisar)
- `OTEL_RESOURCE_ATTRIBUTES=malformed` (sem `=`)
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ` (percent-encoding inválido)

Verifique se as seguintes entradas **não** disparam warn (caminhos válidos):

- `settings.resourceAttributes = { 'service.name': 'x' }` (settings permite definir service.name)
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }` (OTEL_SERVICE_NAME tem prioridade, não precisa de aviso)

## 9. Migração / Mudanças Disruptivas

### 9.1 Mudanças Disruptivas (PR 2)

**O `session.id` nas métricas desaparece por padrão**. Isso afeta:

- Agregações em consultas Prometheus com `by (session_id)` / `group_left(session_id)`
- Gráficos no Grafana dashboard que fatiam por sessão
- Qualquer regra de alerta que agrupa por session.id

Nota: O `session.id` em spans e logs **não é afetado**.

### 9.2 Caminho de Migração

O documento fornece duas opções:

**Opção A**: Restaurar comportamento antigo (recomendado para debug de curto prazo)

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

ou `settings.json`:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **Aviso**: Manter ativo por muito tempo fará com que o número de séries temporais de métricas seja igual ao número de sessões históricas, sobrecarregando o backend. Use apenas para debug de curto prazo.

**Opção B**: Use spans/logs para segmentação por sessão (recomendado)
- spans / logs ainda possuem `session.id`, permitindo fatiar por sessão no trace backend (ex: Jaeger / Aliyun ARMS Tracing) e log backend (ex: Loki / SLS)
- Esses dois tipos de dados já são armazenados por evento, então a cardinalidade não explode
- Adequado para análise drill-down no nível da sessão

### 9.3 Modelo de nota de release

```
**Breaking change (metric attribute):**

The `session.id` attribute is no longer attached to metric data
points by default. This protects metric backends from unbounded
time-series fan-out.

- Spans and logs are unaffected — `session.id` is still present.
- To restore the previous behavior (short-term debugging only), set
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` or in settings.json:
  `telemetry.metrics.includeSessionId: true`.
- For long-term session correlation, query against trace / log
  backends instead of metric backends.

See docs/developers/development/telemetry.md "Migration" for details.
```

## 10. Exemplos de configuração (para documentação)

### 10.1 Fatiar toda telemetria por team / env

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

Efeito: todos os spans / logs / metrics carregam `team=platform`, `env=prod`, `cost_center=eng-123`.

### 10.2 Usar `OTEL_SERVICE_NAME` para roteamento em collector compartilhado

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

Efeito: `service.name=qwen-code-ci`. O collector OTel multi‑tenant pode rotear por service.name para diferentes backends.

### 10.3 Baseline da frota + override local

`~/.qwen/settings.json` da frota (distribuído via GitOps):

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

Override temporário local (sem modificar settings):

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# deployment.environment / service.namespace do settings continuam valendo
# esta execução adicionalmente carrega debug_run=true
```

### 10.4 Debug curto com metric session.id

```bash
# execução única de debug
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "Análise de investimento"
```

Após o debug, desligue – não persista no settings.

### 10.5 Integração Aliyun ARMS Metric (configuração recomendada)

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

## 11. Comparação com a implementação do claude‑code

| Dimensão                     | claude‑code                                      | qwen‑code (este design)                          | Base da decisão                                  |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| Variável de ambiente OTel padrão | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ Idêntico                                      | Contrato padrão                                  |
| Prioridade do `OTEL_SERVICE_NAME` | Segue a especificação OTel                     | ✅ Segue                                         | Spec define claramente                           |
| Nome do toggle de cardinalidade | `OTEL_METRICS_INCLUDE_*`                        | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | Não polui o namespace OTel padrão                |
| Escopo do toggle             | Apenas metrics                                  | ✅ Apenas metrics                                | Spans/logs são por evento – sem explosão de cardinalidade |
| Valor padrão                 | Atributo de alta cardinalidade default false     | ✅ Default false                                 | Segurança em primeiro lugar                      |
| Granularidade por atributo   | Um toggle por atributo                          | ✅ Idêntico                                      | Flexível, alinhado com necessidades reais de diagnóstico |
| Equivalente a settings.json  | ❌ Inexistente                                   | ✅ Possui `telemetry.resourceAttributes` + `metrics` | Implantação em frota empresarial com config base |
| Hook dinâmico por span       | ❌ Inexistente                                   | ❌ Inexistente                                   | Alta complexidade; claude‑code também não tem; não fazemos nesta versão |
| `account_uuid` multi‑tenant  | Sim                                              | ❌ Inexistente                                   | qwen‑code não possui esse atributo nas metrics   |
| Agent SDK `options.env`      | Sim                                              | ❌ Inexistente                                   | qwen‑code não possui modo equivalente            |
| Política de chaves reservadas| Não permite sobrescrever built‑in id            | ✅ Idêntico                                      | Confiabilidade da telemetria                     |
| Canal de report próprio      | claude‑code também possui canal próprio independente (isolado do OTel) | ✅ qwen‑logger também isolado | Separação de responsabilidades entre canal próprio e de terceiros |

**Dois pontos mais valiosos a aproveitar**:

1. **Convenção de nomenclatura**: `*_INCLUDE_*` é semanticamente claro à primeira vista, muito mais legível que nomes negativos (como `*_EXCLUDE_*` / `*_DROP_*`)
2. **Escopo contido**: limita‑se a metrics, sem afetar spans/logs – claude‑code claramente já enfrentou esse limite, e nós colhemos o benefício direto

**Pontos onde qwen‑code faz melhor**:

- Suporte a settings.json: claude‑code depende exclusivamente de variáveis de ambiente, o que não é amigável para cenários de frota empresarial
- Política explícita de chaves reservadas (`service.version` não pode ser sobrescrito): reduz possibilidade de poluição na telemetria
- Isolamento do canal próprio: qwen‑logger envia por canal independente, totalmente desacoplado das configurações OTLP do usuário

## 12. Trabalho futuro (v2 + candidatos)

- **Controle de cardinalidade do `service.version`**: usar OTel View API para dropar o atributo no nível de métrica
- **Mais toggles de cardinalidade**: se no futuro `user.account_uuid` / `model` forem introduzidos nas métricas, adicionar toggles conforme necessidade
- **Hook dinâmico de atributo por span**: inspirado no sistema de hooks do próprio qwen‑code, adicionar callback `OnSpanStart(span, context) => attrs`. Requer design independente.
- **Validação de schema de resource attributes**: limitar namespace de chaves (ex.: impedir sobrescrita de atributos internos além do prefixo `service.*`). Por ora, a lista fixa de chaves reservadas é suficiente.
- **Hot reload de Resource**: quando settings.json for modificado dentro do processo (cenário hipotético de daemon qwen‑serve), atualmente o Resource não é reconstruído. Se o cenário de daemon amadurecer, adicionar um caminho de recarga.
- **Propagação de contexto para subagent entre processos**: quando subagent cruza processos, transmitir o trace context do pai (incluindo resource) via cabeçalhos padrão de propagação de contexto OTel. Requer design independente.
