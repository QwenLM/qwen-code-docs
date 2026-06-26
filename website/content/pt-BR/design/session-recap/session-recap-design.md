# Design do Resumo de Sessão

> Um resumo breve (1-2 frases) do tipo "onde eu parei" que é exibido quando o usuário
> retorna a uma sessão ociosa, seja sob demanda (`/recap`) ou após o
> terminal ter ficado desfocado por 5+ minutos.

## Visão Geral

Quando um usuário retoma uma sessão antiga dias depois, rolar para trás por
páginas de histórico para lembrar **o que estava fazendo e qual era o próximo passo**
é um ponto de atrito real. Apenas recarregar mensagens não resolve esse
problema de UX.

O objetivo é exibir proativamente um breve resumo de 1-2 frases quando o usuário
retornar:

- **Tarefa de alto nível** (o que está fazendo) → **próximo passo** (o que fazer em seguida).
- Visualmente distinto de respostas reais do assistente, para nunca ser confundido
  com uma nova saída do modelo.
- **Melhor esforço**: falhas devem ser silenciosas e nunca quebrar o fluxo principal.

## Gatilhos

| Gatilho           | Condições                                                                                  | Implementação                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manual**        | Usuário executa `/recap`                                                                   | `recapCommand.ts` chama o mesmo serviço subjacente                                                                                                |
| **Automático**    | Terminal desfocado (protocolo de foco DECSET 1004) por ≥ 5 min + foco retorna + stream está `Idle` | `useAwaySummary.ts` — timer de 5min de desfoque + listener de evento `useFocus`                                                                  |
| **HTTP do Daemon**| Cliente remoto chama `POST /session/:id/recap`                                                | `server.ts` rota → `bridge.generateSessionRecap` (viagem de ida-e-volta do ext-method) → `acpAgent.ts` chama `generateSessionRecap(session.getConfig(), signal)` |

Todos os três caminhos confluem na mesma função `generateSessionRecap()`
em `core/services/sessionRecap.ts` para garantir comportamento idêntico. O
gatilho automático é controlado por `general.showSessionRecap` (padrão: desligado —
opt-in explícito, para que chamadas LLM em segundo plano nunca sejam adicionadas silenciosamente
à conta do usuário); o comando manual e a rota HTTP do daemon ignoram essa
configuração (o chamador está fazendo uma requisição explícita).

### Caminho de acesso do Daemon

A rota do daemon não tem restrição estrita (espelha a postura de `/session/:id/prompt` —
o resumo custa tokens, mas não altera estado). A tag de capacidade
`session_recap` anuncia a rota em `/capabilities.features`. Helpers do SDK:
`DaemonClient.recapSession(sessionId, opts)` e
`DaemonSessionClient.recap(opts)`. Consulte
`docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap`
para o contrato de comunicação e envelope de erro.

Cancelamento está **ausente na v1**. A rota não escuta por desconexão do cliente HTTP,
nenhum `AbortSignal` é passado para `bridge.generateSessionRecap`, e o handler ACP filho passa
um `AbortController().signal` que nunca aborta para o helper principal (ainda não há
encanamento de abort entre processos). Os únicos tetos são o backstop de 60s
`SESSION_RECAP_TIMEOUT_MS` da bridge e a condição de corrida de transporte fechado contra
a morte do canal ACP. Encanar um AbortController do lado HTTP isoladamente seria
cosmético — a chamada LLM do lado filho ainda executaria até o fim,
portanto cancelamento ponta-a-ponta não é alcançável sem a peça de abort
entre processos. Isso é aceitável para v1 porque o resumo é curto
(consulta lateral de tentativa única, `maxOutputTokens: 300`, tipicamente ~1–5s).
Um futuro método ext de cancelamento baseado em ID de requisição pode encanar cancelamento
completo ponta-a-ponta se/quando o custo de largura de banda justificar.

## Arquitetura

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ 5 min blur timer + idle/dedupe gates                 │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand (slash) ─→ generateSessionRecap(config, signal) │
│                                          │                             │
│                                          ↓                             │
│                              ┌─────────────────────────┐               │
│                              │ packages/core/services/ │               │
│                              │   sessionRecap.ts       │               │
│                              └─────────────────────────┘               │
│                                          │                             │
│                                          ↓                             │
│                              GeminiClient.generateContent              │
│                              (fastModel + tools:[])                    │
│                                                                        │
│   addItem({type: 'away_recap', text}) ─→ HistoryItemDisplay            │
│       └─ AwayRecapMessage rendered inline like any other history       │
│         item (※ + bold "recap: " + italic content, all dim);           │
│         scrolls naturally with the conversation. Mirrors Claude        │
│         Code's away_summary system message.                            │
└────────────────────────────────────────────────────────────────────────┘
```
### Arquivos

| Arquivo                                                       | Responsabilidade                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                  | Chamada única ao LLM + filtro de histórico + extração de tags                     |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                 | Hook React de disparo automático                                                   |
| `packages/cli/src/ui/commands/recapCommand.ts`                | Ponto de entrada manual `/recap`                                                   |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx`  | Renderizador de `AwayRecapMessage` (`※` + **`recap:`** em negrito + conteúdo itálico, tudo escurecido) |
| `packages/cli/src/ui/types.ts`                                | Tipo `HistoryItemAwayRecap`                                                        |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`       | Direciona itens de histórico `away_recap` para o renderizador                      |
| `packages/cli/src/config/settingsSchema.ts`                   | Configurações `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` |

## Design do Prompt

### Prompt de Sistema

`generationConfig.systemInstruction` substitui o prompt de sistema do agente principal
nesta chamada única, de modo que o modelo se comporte apenas como um gerador de
recap e não como um assistente de codificação.

Observe que `GeminiClient.generateContent()` internamente executa o prompt
através de `getCustomSystemPrompt()`, que anexa a memória do usuário
(QWEN.md / memória automática gerenciada) como sufixo. O prompt de sistema final é,
portanto, `recap prompt + memória do usuário` — contexto útil do projeto para o
recap, e não um vazamento.

Os itens abaixo correspondem 1:1 com `RECAP_SYSTEM_PROMPT`:

- Menos de 40 palavras, 1-2 frases simples (sem markdown / listas / cabeçalhos). Para Chinês, trate o orçamento como aproximadamente 80 caracteres no total.
- Primeira frase: a tarefa de alto nível. Em seguida: o próximo passo concreto.
- Proibir explicitamente: listar o que foi feito, recitar chamadas de ferramentas, relatórios de status.
- Corresponder ao idioma dominante da conversa (Inglês ou Chinês).
- Envolver a saída em `<recap>...</recap>`; nada fora das tags.

### Saída Estruturada + Extração

O modelo é instruído a envolver sua resposta em `<recap>...</recap>`:

```
<recap>Refatorando loopDetectionService.ts para lidar com OOM em sessões longas. Próximo passo é implementar a opção B.</recap>
```

Por quê: alguns modelos (família GLM, modelos de raciocínio) escrevem um parágrafo
de "pensamento" antes da resposta final. Retornar o texto bruto vazaria esse
raciocínio na interface.

`extractRecap()` possui três níveis de fallback:

1. Ambas as tags presentes: pegar o que está entre `<recap>...</recap>` (preferido).
2. Apenas a tag de abertura (ex.: `maxOutputTokens` truncou a tag de fechamento):
   pegar tudo após a tag de abertura.
3. Tag completamente ausente: retornar string vazia → serviço retorna `null`
   → interface não renderiza nada.

O terceiro nível é "pular em vez de mostrar algo errado" — exibir o preâmbulo
de raciocínio do modelo é pior do que não mostrar recap algum.

### Parâmetros da Chamada

| Parâmetro           | Valor                           | Motivo                                                |
| ------------------- | ------------------------------- | ----------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()`  | Recap não precisa de um modelo de fronteira           |
| `tools`             | `[]`                            | Consulta única, sem uso de ferramentas                |
| `maxOutputTokens`   | `300`                           | Margem para 1-2 frases curtas + tags                  |
| `temperature`       | `0.3`                           | Principalmente determinista, com um pouco de variação natural |
| `systemInstruction` | O prompt exclusivo para recap acima | Substitui a definição de papel do agente principal    |

## Filtragem do Histórico

`geminiClient.getChat().getHistory()` retorna um `Content[]` que
inclui:

- Mensagens de texto `user` / `model`
- Partes `functionCall` do `model`
- Partes `functionResponse` do `user` (que podem conter o conteúdo completo de arquivos)
- Partes de pensamento do `model` (`part.thought` / `part.thoughtSignature`,
  o raciocínio oculto do modelo)

`filterToDialog()` mantém apenas as partes `user` / `model` que possuem **texto não vazio
e não são pensamentos**. Dois motivos:

- **Chamadas / respostas de ferramentas**: um único `functionResponse` pode ter 10K+
  tokens. 30 mensagens dessas afogariam o LLM do recap em detalhes
  irrelevantes, desperdiçando tokens e enviesando o recap para
  ruído de implementação como "chamou ferramenta X para ler arquivo Y".
- **Partes de pensamento**: carregam o raciocínio interno do modelo. Incluí-las
  arrisca tratar cadeia de pensamento oculta como diálogo e
  exibi-la no texto do recap.

Após descartar mensagens vazias, `takeRecentDialog` fatia as últimas 30
mensagens e se recusa a iniciar a fatia em uma resposta pendente do modelo/ferramenta.
## Concorrência e Casos de Borda

### Máquina de estados do hook de acionamento automático

`useAwaySummary` mantém três refs:

| Ref               | Significado                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `blurredAtRef`    | Instante do início do blur (não limpo até o foco retornar)          |
| `recapPendingRef` | Indica se uma chamada LLM está em andamento                         |
| `inFlightRef`     | O `AbortController` atual em andamento                              |

`useEffect` deps: `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Evento                                                          | Ação                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                         | Aborta chamada em andamento + limpa `inFlightRef` + limpa `blurredAtRef`                                                                   |
| `!isFocused` e `blurredAtRef === null`                          | Define `blurredAtRef = Date.now()`                                                                                                        |
| `isFocused` e `blurredAtRef === null`                           | Retorna antecipadamente (nenhum ciclo de blur para gerenciar — primeira renderização ou logo após um reset de blur breve)                 |
| `isFocused` e duração do blur < 5 min                           | Limpa `blurredAtRef`, aguarda o próximo ciclo de blur                                                                                     |
| `isFocused` e blur ≥ 5 min e `recapPendingRef`                  | Retorna (deduplicação)                                                                                                                    |
| `isFocused` e blur ≥ 5 min e `!isIdle`                          | **Preserva** `blurredAtRef` e aguarda o fim da rodada (`isIdle` está nas dependências, então o efeito é reexecutado quando o streaming é concluído) |
| `isFocused` e blur ≥ 5 min e `shouldFireRecap` retorna `false`  | Limpa `blurredAtRef` e retorna — a conversa não avançou o suficiente desde o último resumo (≥ 2 turnos do usuário necessários, espelha o Claude Code) |
| `isFocused` e todas as condições atendidas                      | Limpa `blurredAtRef`, define `recapPendingRef = true`, cria `AbortController`, envia a requisição LLM                                     |

O callback `.then` **reverifica** `isIdleRef.current`: se o usuário iniciou um novo turno enquanto o LLM estava em execução, o resumo que chega tardiamente é descartado para evitar inseri-lo no meio do turno.

O `.finally` limpa `recapPendingRef` e limpa `inFlightRef` apenas se `inFlightRef.current === controller` (para não sobrescrever um controlador mais recente).

Um segundo `useEffect` aborta o controlador em andamento ao desmontar.

### Proteção do `/recap`

`CommandContext.ui.isIdleRef` expõe o estado atual do stream (espelhando o padrão existente `btwAbortControllerRef`). No modo interativo, `recapCommand` recusa quando `!isIdleRef.current` **ou** `pendingItem !== null`. Apenas `pendingItem` é insuficiente porque uma resposta normal do modelo é executada com `streamingState === Responding` e `pendingItem` nulo.

## Configuração e Seleção de Modelo

### Opções visíveis ao usuário

| Configuração                                 | Padrão     | Observações                                                                                              |
| -------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `general.showSessionRecap`                   | `false`    | Apenas acionamento automático. O `/recap` manual ignora isso.                                            |
| `general.sessionRecapAwayThresholdMinutes`   | `5`        | Minutos de blur antes do resumo automático ser disparado ao focar. Corresponde ao padrão do Claude Code. |
| `fastModel`                                  | não definido | Recomendado (ex.: `qwen3-coder-flash`) para resumos rápidos e baratos.                                  |

### Fallback de modelo

`config.getFastModel() ?? config.getModel()`:

- Usuário tem um `fastModel` definido e ele é válido para o tipo de autenticação atual → usa `fastModel`.
- Caso contrário → recorre ao modelo principal da sessão (funciona, mas mais caro e lento).

## Observabilidade

`createDebugLogger('SESSION_RECAP')` emite:

- exceções capturadas do caminho do resumo (`debugLogger.warn`).

Todas as falhas são **totalmente transparentes** para o usuário — o resumo é um recurso auxiliar e nunca gera exceções na interface. Desenvolvedores podem buscar pela tag `[SESSION_RECAP]` no arquivo de log de depuração: gravado por padrão em `~/.qwen/debug/<sessionId>.txt` (`latest.txt` faz symlink para a sessão atual); desative via `QWEN_DEBUG_LOG_FILE=0`.

## Fora do Escopo

| Item                                                       | Por que não                                                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Interface de progresso para `/recap` (spinner / pendingItem) | Aguardar 3-5 segundos é tolerável; adiciona complexidade.                                                                                |
| Testes automatizados                                       | O serviço é pequeno (~150 linhas), testado ponta a ponta manualmente primeiro; testes unitários podem ser enviados em um PR separado.    |
| Prompts localizados                                        | O prompt do sistema é para o modelo; inglês é o substrato mais confiável. O modelo seleciona o idioma de saída a partir da conversa.     |
| Variável de ambiente `QWEN_CODE_ENABLE_AWAY_SUMMARY`       | O Claude Code usa isso para manter o recurso ativado quando a telemetria está desabilitada; o modelo atual de telemetria do Qwen Code não precisa disso. |
| Resumo automático na conclusão do `/resume`                | Um acompanhamento natural, mas precisa de um ponto de hook em `useResumeCommand`; fora do escopo deste PR.                               |
