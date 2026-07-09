# Esforço de Raciocínio Unificado (/effort)

> **Status de implementação.** Implementado: a escada de 5 níveis + `core/reasoning-effort.ts`
> (clamp/normalização de rank), a configuração global `model.reasoningEffort` + 
> `Config.setReasoningEffort`/`getReasoningEffort` em runtime (reaplicado nas trocas de modelo
> em `handleModelChange`), o comando `/effort`, o adaptador de achatamento literal do GLM
> (`provider/zai.ts`), o mapeamento `medium`/`xhigh` do Gemini,
> **gating por modelo da Anthropic** (`anthropicSupportedEffortTiers` + clamp: as famílias
> Opus 4.7/4.8 e 5.x passam `xhigh`/`max` adiante; Opus 4.6/Sonnet 4.6 aceitam apenas
> `max`; Opus 4.5 e IDs sem versão sofrem clamp para `high`), e a
> linha de status `model-with-reasoning` (atualizada em tempo real no `/effort`), o
> mapeamento tier→bool do DashScope (um esforço definido ativa `enable_thinking` para modelos
> híbridos qwen; a única coluna a ser estendida quando o qwen lançar um campo
> `reasoning_effort` real), e o `EffortDialog` interativo — o `/effort` puro
> abre um seletor de nível no modo interativo (e lista os níveis de forma não interativa),
> conectado via `use-effort-command`, os contextos de UI, `DialogManager` e
> `useDialogClose`. Nada está diferido.

## Problem

Cada provedor com capacidade de raciocínio expõe um controle diferente para "o quão forte o modelo deve pensar": OpenAI/DeepSeek/GLM usam uma string plana `reasoning_effort`, Anthropic usa `output_config.effort` (mais o legado `thinking.budget_tokens`), Gemini 3 usa `thinking_level` (Gemini 2.5 usava `thinkingConfig.thinkingBudget`), e Qwen/DashScope tem apenas um booleano `enable_thinking`.

O core já carrega um formato de configuração unificado `reasoning: { effort }` e cada adaptador de provedor já o traduz (veja Current State), mas não há uma maneira voltada ao usuário para escolher um nível de esforço em runtime. O nível só pode ser definido editando manualmente a configuração de geração por modelo. Queremos um único comando `/effort` que ofereça um pequeno conjunto de níveis, mapeie-os para o que o provedor ativo suporta e persista a escolha.

A camada unificada também deve tornar trivial a adição de um novo provedor: quando um modelo que atualmente tem apenas um interruptor liga/desliga (ex.: qwen3) ganhar níveis de esforço reais, a única alteração deve ser uma linha na tabela de mapeamento/capacidade.

## Goals

- Uma escada de esforço unificada exposta ao usuário: **`low | medium | high | xhigh | max`** (5 níveis).
- Um comando slash `/effort`: `/effort <tier>` define diretamente; o `/effort` puro abre um diálogo seletor.
- Uma configuração **global única** que se aplica a todos os modelos, persistida entre sessões.
- Uma camada de tradução por provedor + **clamp**: um nível não suportado faz fallback para o nível suportado mais próximo do modelo ativo, com um aviso único (reutilizando a UX de clamp existente da Anthropic).
- Exibição em tempo real via o preset de linha de status `model-with-reasoning` existente.
- Adicionar/ajustar um provedor = editar uma tabela de capacidade/mapeamento, sem novas conexões.

## Non-Goals

- Sem nível `off`. Desativar o raciocínio completamente continua sendo o conceito separado e existente de `reasoning: false`; o `/effort` apenas alterna entre níveis ativos.
- Sem esforço persistido por modelo (decisão: configuração global única).
- Sem UI para `budget_tokens` bruto. Provedores com formato de budget (Gemini 2.5, Anthropic legado) são acionados pelo mapeamento tier→bucket, não expostos numericamente.
- Nenhuma alteração na conexão de requisição por provedor existente, além de preencher lacunas de mapeamento e clamps.
- Sem integração com desktop (o desktop tem sua própria infraestrutura de `thinkingLevel`; fora do escopo).

## Current State

Tipo de configuração unificado — [`packages/core/src/core/contentGenerator.ts:104-118`]:

```ts
reasoning?: false | { effort?: 'low' | 'medium' | 'high' | 'max'; budget_tokens?: number }
```

Tradutores existentes por provedor:

| Provider             | File                                                                                   | Behavior                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| DeepSeek             | `provider/deepseek.ts:176-218`                                                         | aninhado → `reasoning_effort` plano; `low/medium→high`, `xhigh→max`                             |
| Anthropic            | `anthropicContentGenerator.ts:521-593`, clamp `665-693`, beta hdr `393-431`            | `output_config.effort` + thinking; clamp `max`→`high` + aviso único; beta `effort-2025-11-24`   |
| Gemini               | `geminiContentGenerator.ts:107-146`                                                    | `thinkingConfig`/`thinkingLevel`; `low→LOW`, `high/max→HIGH`                                    |
| OpenAI/GLM/DashScope | `openaiContentGenerator/pipeline.ts:689-717` (`buildReasoningConfig`), strip `597-602` | encaminha/remove `reasoning_effort`; DashScope adiciona `preserve_thinking`                     |

Lacunas: a união carece de `xhigh`; o Gemini carece de `medium` e de uma regra `xhigh→high`; deve-se confirmar que o pipeline genérico emite `reasoning_effort` para OpenAI/GLM puro e faz o clamp `max→xhigh`; o DashScope não tem mapeamento tier→bool.

## Prior art: openclaw

`openclaw/openclaw` resolve o mesmo problema com uma forma mais madura da qual nos baseamos (estudada em `~/Documents/openclaw`):

- **Escada canônica única + ranks numéricos** (`src/auto-reply/thinking.shared.ts`):
  `ThinkLevel = off|minimal|low|medium|high|xhigh|adaptive|max` com
  `THINKING_LEVEL_RANKS` (off:0 … high:40, xhigh:60, max:70; adaptive≡30).
- **Clamp baseado em rank** (`src/llm/model-utils.ts:59` `clampThinkingLevel`): se o
  modelo suporta o nível, use-o; uma exclusão `null` explícita para xhigh/max é um
  limite rígido (desça primeiro); caso contrário, prefira o próximo nível suportado mais forte,
  senão desça — nunca aumente silenciosamente o custo acima do limite do modelo.
- **Capacidade por modelo**, não apenas por provedor: o catálogo carrega
  `compat.supportedReasoningEfforts` e um `thinkingLevelMap` por modelo
  (valor ou `null`).
- **Três mapeadores de formato**, um por família de API:
  - Compatível com OpenAI — `mapThinkingLevelToReasoningEffort()`: `off→none`,
    `adaptive→medium`, `max→xhigh`, senão passa direto → `none|minimal|low|medium|high|xhigh`.
  - Anthropic — `mapThinkingLevelToEffort(model, level)`: clamp, então emite
    `output_config.effort` para modelos de pensamento adaptativo, ou converte para
    `thinkingBudgetTokens` (com `adjustMaxTokensForThinking`) para os mais antigos.
  - Gemini — `resolveGoogleGemini3ThinkingLevel()`: Gemini 3 Pro → LOW/HIGH,
    Flash → MINIMAL/LOW/MEDIUM/HIGH; Gemini 2.5 mapeia um budget para um nível
    (`≤0→MINIMAL, ≤2048→LOW, ≤8192→MEDIUM, senão HIGH`; `gemini-2.5-pro` rejeita
    budget 0 — pensamento obrigatório).
  - Wrapper do DeepSeek V4: `off`→remove; `xhigh|max→max`, senão `high`.
- **Perfil de pensamento do provedor** (`src/plugins/provider-thinking.types.ts`):
  declara `levels`/`defaultLevel`; provedores binários armazenam `low` mas exibem `on`.
- **Sanitizador de raciocínio** (`extensions/opencode-go/reasoning-sanitizer.ts`):
  remove `reasoning_content`/`reasoning_effort` e partes de pensamento ao reproduzir
  o histórico para provedores que os rejeitam.

O que aproveitamos: o **clamp central baseado em rank**, a **declaração de capacidade
por modelo**, os **três mapeadores de formato** e os **buckets de budget exatos do Gemini 2.5**. O que descartamos para a v1: níveis de usuário `minimal`/`adaptive` (decisão = 5
níveis) — eles permanecem como alvos de normalização _internos_ válidos para que um catálogo de modelos ainda possa declará-los.

## Design

### Escada de esforço e tabela de capacidade

Escada ordenada canônica: `low < medium < high < xhigh < max`.

Cada provedor declara um subconjunto suportado; o tradutor faz o clamp de um nível solicitado **para baixo** na escada até o nível suportado mais próximo. Mapeamento (canônico → valor de wire), com `↓` marcando um clamp:

| Tier   | OpenAI `reasoning_effort` | DeepSeek `reasoning_effort` | GLM-5.2+ `reasoning_effort` | Anthropic `output_config.effort` | Gemini 3 `thinking_level` | Qwen DashScope       |
| ------ | ------------------------- | --------------------------- | --------------------------- | -------------------------------- | ------------------------- | -------------------- |
| low    | low                       | high¹                       | low                         | low                              | low                       | enable_thinking:true |
| medium | medium                    | high¹                       | medium                      | medium                           | medium                    | true                 |
| high   | high                      | high                        | high                        | high (default)                   | high                      | true                 |
| xhigh  | xhigh                     | max¹                        | xhigh                       | xhigh ↓high²                     | high ↓²                   | true                 |
| max    | xhigh ↓ (no `max`)        | max                         | max                         | max ↓high²                       | high ↓²                   | true                 |

¹ Agrupamento interno documentado do DeepSeek/GLM (low/medium ≡ high, xhigh ≡ max).
² Clamp no limite documentado do modelo (varia conforme o modelo da Anthropic; Gemini 3
tem limite em `high`). Modelos Gemini 2.5 mapeiam o nível para um bucket `thinkingConfig.thinkingBudget`
em vez de `thinking_level`.

O clamp é **central e baseado em rank** (emprestado do `clampThinkingLevel` do openclaw): atribua um rank a cada nível
(`low:20, medium:30, high:40, xhigh:60, max:70`); um provedor/modelo declara seu
conjunto suportado (e limites rígidos `null` opcionais para `xhigh`/`max`); o clamp escolhe
o nível suportado mais próximo — requisições com limite rígido descem na escada, caso contrário, prefira o
próximo nível suportado igual ou inferior à solicitação. Isso substitui os clamps ad-hoc por adaptador
(ex.: o atual `max→high` da Anthropic).

A capacidade é declarada **por modelo, não apenas por provedor** (lição do openclaw):
a entrada de catálogo do modelo / preset do provedor carrega
`supportedReasoningEfforts?: EffortTier[]` (e um mapa de substituição por modelo
opcional). Padrão quando não definido = conjunto suportado completo do provedor. Um novo
provedor/modelo é uma linha na tabela; o clamp + três mapeadores de formato permanecem inalterados.

Três mapeadores de formato cuidam da tradução de wire (um por família de API), recebendo o nível já submetido a clamp:

- `toReasoningEffort(tier)` — `reasoning_effort` plano para OpenAI/DeepSeek/GLM/DashScope
  (DashScope em vez disso → booleano `enable_thinking`).
- `toAnthropicThinking(tier, model)` — `output_config.effort` para modelos
  adaptativos, senão `thinking.budget_tokens`.
- `toGeminiThinking(tier, model)` — `thinking_level` (Gemini 3) ou
  bucket `thinkingConfig.thinkingBudget` (Gemini 2.5, limites por openclaw).

### Higiene de parâmetros de amostragem

DeepSeek e GLM rejeitam `temperature`/`top_p`/`presence_penalty`/`frequency_penalty`
no modo de pensamento. Quando um tradutor ativa o pensamento para esses provedores, ele deve
remover esses parâmetros de amostragem do corpo da requisição.

### Divergência de formato de campo compatível com OpenAI

"Compatível com OpenAI" NÃO implica um único campo de esforço. A configuração canônica é o
objeto aninhado `reasoning: { effort }`; `buildReasoningConfig()`
(`pipeline.ts:689-717`) o repassa **literalmente, sem mapeamento de valores**. Cada
provedor cujo campo de wire difere deve remodelá-lo em seu hook `buildRequest`.
Formatos conhecidos:

| Wire shape                           | Providers                                             | qwen-code handling                                                                                       |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| aninhado `reasoning: { effort }`     | OpenAI Responses, OpenRouter, gpt-5.x                 | passa direto (padrão) ✅                                                                                 |
| `reasoning_effort` plano no nível superior | DeepSeek, **GLM/z.ai**, OpenAI Chat Completions, Groq | adaptador do DeepSeek achata ✅; **GLM não tem adaptador → atualmente envia o formato aninhado, provavelmente errado ❌** |
| booleano `enable_thinking`           | qwen3 / DashScope                                     | adaptador emite booleano (apenas desativa); sem níveis de esforço ainda                                  |
| alternador `extra_body.thinking.enabled` | GLM                                                 | controle liga/desliga separado do valor de esforço                                                       |
Implicação: o repasse puro só "simplesmente funciona" para provedores que aceitam o formato aninhado. **O PR1 deve adicionar o achatamento para GLM/z.ai** (espelhando `deepseek.ts`) e, quando o Qwen adicionar um campo de effort, estender o adaptador do DashScope para emitir qualquer que seja o formato documentado pela API do Qwen (provavelmente `reasoning_effort` plano). Um novo provedor é suportado automaticamente apenas se aceitar o formato canônico aninhado; caso contrário, precisará de uma remodelagem em um único hook.

### Fluxo de configuração e persistência

- Nova configuração global **`model.reasoningEffort`**: `'low' | 'medium' | 'high' | 'xhigh' | 'max'`, adicionada ao `settingsSchema.ts` (próximo ao nó `generationConfig`, `1412-1504`).
- No momento da construção do content-generator, a camada de configuração mapeia `model.reasoningEffort` para `generationConfig.reasoning.effort` (fonte única de verdade para os tradutores existentes). Um valor global para todos os modelos.
- Alteração em tempo de execução: adicionar `config.setReasoningEffort(tier)` (ao lado de `switchModel`, `config.ts:~2047`), que atualiza o `generationConfig.reasoning.effort` em memória e refresca o ContentGenerator ativo, seguido de `persistSetting('model.reasoningEffort', tier)`.

### Superfície da CLI

- Novo `effortCommand.ts` (modelado a partir de `modelCommand.ts:39-79`):
  - `/effort` → `{ type: 'dialog', dialog: 'effort' }`
  - `/effort high` → validar tier, chamar `config.setReasoningEffort`, persistir, mensagem de confirmação.
  - `completion()` oferece os 5 tiers.
- Novo componente Ink `EffortDialog` + registrar o tipo de diálogo `'effort'` em `commands/types.ts:168-198`. O diálogo lista os 5 tiers e anota quais serão limitados (clamped) para o modelo atual (ex.: "max → high neste modelo").
- Linha de status: o preset existente `model-with-reasoning` (`statusLinePresets.ts:13,46-51`) lê o effort em tempo real — sem novo preset.

### Alteração de tipo

Estender a união de effort em `contentGenerator.ts:104-118` para adicionar `'xhigh'`. O caminho de desativação `reasoning: false` permanece inalterado.

## Fases (PRs pequenos, cada um vinculado a uma issue)

1. **core: escada + mapeamentos + clamps.** Estender união com `xhigh`; adicionar o clamp central baseado em rank + `supportedReasoningEfforts` por modelo; refatorar os três mapeadores de formato; preencher os buckets de orçamento `medium`/`xhigh↓` + 2.5 do Gemini, confirmar a emissão de `reasoning_effort` da OpenAI/GLM + `max↓xhigh`, adicionar tier→bool do DashScope; remoção de parâmetros de amostragem; verificar se o caminho existente de remoção de reasoning (`pipeline.ts:597-602`) cobre a repetição de histórico como o sanitizador do openclaw. Testes unitários por tradutor de provedor + limites de clamp. Sem UI.
2. **cli: setting + direct command.** Schema de `model.reasoningEffort`, mapeamento de configuração + refresh em tempo de execução de `setReasoningEffort`, `/effort <tier>`, leitura em tempo real da linha de status. Testes.
3. **cli: diálogo de seleção.** `EffortDialog` + `/effort` simples, dicas de clamp por modelo.
4. **docs.** Página de effort em `docs/users/`; link cruzado para as docs de reasoning/token-caching.

## Cobertura de Testes

Verificações de maior valor: cada tradutor de provedor emite o campo wire correto para cada tier, incluindo os limites de clamp (`max` na OpenAI→`xhigh`, `xhigh`/`max` em um modelo Gemini-3 / Anthropic com limite→`high`); parâmetros de amostragem removidos quando o thinking está habilitado para DeepSeek/GLM; `model.reasoningEffort` faz round-trip pelas configurações e entra em `generationConfig.reasoning.effort`; `setReasoningEffort` reconstrói o ContentGenerator; aviso de clamp único dispara uma vez por modelo+tier.