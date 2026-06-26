# Design do Recap de Sessão

> Um resumo breve (1-2 frases) "onde eu parei" exibido quando o usuário
> retorna a uma sessão ociosa, seja sob demanda (`/recap`) ou após o
> terminal ficar oculto (blur) por 5+ minutos.

## Visão Geral

Quando um usuário faz `/resume` de uma sessão antiga dias depois, rolar
para trás por páginas de histórico para lembrar **o que estava fazendo e o
que vinha a seguir** é um ponto de atrito real. Apenas recarregar as
mensagens não resolve esse problema de UX.

O objetivo é exibir proativamente um breve resumo de 1-2 frases quando o
usuário retornar:

- **Tarefa de alto nível** (o que está fazendo) → **próximo passo** (o que
  fazer em seguida).
- Visualmente distinto das respostas reais do assistente, para nunca ser
  confundido com uma nova saída do modelo.
- **Melhor esforço**: falhas devem ser silenciosas e nunca quebrar o fluxo
  principal.

## Gatilhos

| Gatilho        | Condições                                                                                     | Implementação                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manual**     | Usuário executa `/recap`                                                                      | `recapCommand.ts` chama o mesmo serviço subjacente                                                                                                |
| **Automático** | Terminal oculto (protocolo de foco DECSET 1004) por ≥ 5 min + foco retorna + stream está `Idle` | `useAwaySummary.ts` — timer de 5 min de blur + listener de evento `useFocus`                                                                      |
| **Daemon HTTP**| Cliente remoto chama `POST /session/:id/recap`                                                | Rota `server.ts` → `bridge.generateSessionRecap` (roundtrip ext-method) → `acpAgent.ts` chama `generateSessionRecap(session.getConfig(), signal)` |

Todos os três caminhos confluem para a mesma função `generateSessionRecap()`
em `core/services/sessionRecap.ts` para garantir comportamento idêntico. O
gatilho automático é controlado por `general.showSessionRecap` (padrão:
desligado — opt-in explícito, para que chamadas ambientais de LLM nunca
sejam adicionadas silenciosamente à conta do usuário); o comando manual e a
rota HTTP do daemon ignoram essa configuração (o chamador está fazendo uma
solicitação explícita).

### Caminho de acesso do daemon

A rota do daemon não tem restrição estrita (espelha a postura de
`/session/:id/prompt` — o recap consome tokens, mas não altera estado). A
tag de capacidade `session_recap` anuncia a rota em `/capabilities.features`.
Helpers do SDK: `DaemonClient.recapSession(sessionId, opts)` e
`DaemonSessionClient.recap(opts)`. Consulte
`docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap`
para o contrato de rede e envelope de erro.

O cancelamento está **ausente na v1**. A rota não escuta por desconexão do
cliente HTTP, nenhum `AbortSignal` é passado para
`bridge.generateSessionRecap`, e o manipulador filho do ACP passa um
`AbortController().signal` que nunca aborta para o helper central (ainda
não há infraestrutura de aborto entre processos). Os únicos limites são o
backstop de 60s `SESSION_RECAP_TIMEOUT_MS` da bridge e a corrida de
transporte fechado contra a morte do canal ACP. Conectar um AbortController
no lado HTTP isoladamente seria cosmético — a chamada LLM do lado filho
ainda seria executada até o fim, então o cancelamento ponta a ponta não é
viável sem a peça de aborto entre processos. Isso é aceitável para v1
porque o recap é curto (consulta lateral de tentativa única,
`maxOutputTokens: 300`, ~1–5s típicos). Um futuro ext-method de cancelamento
baseado em ID de requisição pode implementar cancelamento completo ponta a
ponta se/quando o custo de banda justificar.

## Arquitetura

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ timer de 5 min de blur + portas idle/deduplicatação  │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand (barra) ─→ generateSessionRecap(config, signal) │
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
│       └─ AwayRecapMessage renderizado inline como qualquer outro item  │
│         de histórico (※ + negrito "recap: " + conteúdo itálico, tudo   │
│         com opacidade reduzida); rola naturalmente com a conversa.     │
│         Espelha a mensagem de sistema away_summary do Claude Code.     │
└────────────────────────────────────────────────────────────────────────┘
```

### Arquivos

| Arquivo                                                        | Responsabilidade                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                   | Chamada LLM única + filtro de histórico + extração de tag                       |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                  | Hook React de gatilho automático                                                |
| `packages/cli/src/ui/commands/recapCommand.ts`                 | Ponto de entrada manual `/recap`                                                |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx`   | Renderizador `AwayRecapMessage` (`※` + negrito `recap:` + conteúdo itálico, opacidade reduzida) |
| `packages/cli/src/ui/types.ts`                                 | Tipo `HistoryItemAwayRecap`                                                     |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`        | Despacha itens de histórico `away_recap` para o renderizador                    |
| `packages/cli/src/config/settingsSchema.ts`                    | Configurações `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` |

## Design do Prompt

### Prompt do Sistema

`generationConfig.systemInstruction` substitui o prompt de sistema do agente
principal para esta chamada única, de modo que o modelo se comporte apenas
como um gerador de recap e não como um assistente de codificação.

Observe que `GeminiClient.generateContent()` internamente executa o prompt
através de `getCustomSystemPrompt()`, que anexa a memória do usuário
(QWEN.md / memória automática gerenciada) como um sufixo. O prompt de sistema
final é, portanto, `prompt de recap + memória do usuário` — contexto de
projeto útil para o recap, não um vazamento.

Os bullets abaixo correspondem 1:1 com `RECAP_SYSTEM_PROMPT`:

- Abaixo de 40 palavras, 1-2 frases simples (sem markdown / listas / cabeçalhos). Para chinês, trate o orçamento como aproximadamente 80 caracteres no total.
- Primeira frase: a tarefa de alto nível. Em seguida: o próximo passo concreto.
- Proibir explicitamente: listar o que foi feito, recitar chamadas de ferramenta, relatórios de status.
- Corresponder ao idioma dominante da conversa (inglês ou chinês).
- Envolver a saída em `<recap>...</recap>`; nada fora das tags.

### Saída Estruturada + Extração

O modelo é instruído a envolver sua resposta em `<recap>...</recap>`:

```
<recap>Refatorando loopDetectionService.ts para resolver OOM em sessões longas. O próximo passo é implementar a opção B.</recap>
```

Por quê: alguns modelos (família GLM, modelos de raciocínio) escrevem um
parágrafo de "pensamento" antes da resposta final. Retornar o texto bruto
vazaria esse raciocínio para a interface.

`extractRecap()` tem três níveis de fallback:

1. Ambas as tags presentes: pegar o que está entre `<recap>...</recap>` (preferido).
2. Apenas a tag de abertura (ex.: `maxOutputTokens` truncou a tag de fechamento):
   pegar tudo após a tag de abertura.
3. Tag ausente totalmente: retornar string vazia → serviço retorna `null`
   → interface não renderiza nada.

O terceiro nível é "pular em vez de mostrar a coisa errada" — exibir o
preâmbulo de raciocínio do modelo é pior do que não mostrar recap algum.

### Parâmetros da Chamada

| Parâmetro         | Valor                          | Motivo                                                 |
| ----------------- | ------------------------------ | ------------------------------------------------------ |
| `model`           | `getFastModel() ?? getModel()` | Recap não precisa de um modelo de fronteira            |
| `tools`           | `[]`                           | Consulta única, sem uso de ferramenta                  |
| `maxOutputTokens` | `300`                          | Margem para 1-2 frases curtas + tags                   |
| `temperature`     | `0.3`                          | Majoritariamente determinístico, com um pouco de variação natural |
| `systemInstruction` | O prompt apenas de recap acima | Substitui a definição de papel do agente principal       |

## Filtragem de Histórico

`geminiClient.getChat().getHistory()` retorna um `Content[]` que
inclui:

- mensagens de texto `user` / `model`
- partes `functionCall` do `model`
- partes `functionResponse` do `user` (que podem conter o conteúdo completo de arquivos)
- partes de pensamento do `model` (`part.thought` / `part.thoughtSignature`,
  o raciocínio oculto do modelo)

`filterToDialog()` mantém apenas partes `user` / `model` que têm **texto não vazio
e não são pensamentos**. Duas razões:

- **Chamadas de ferramenta / respostas**: uma única `functionResponse` pode ter 10K+
  tokens. 30 dessas mensagens afogariam o LLM de recap em detalhes irrelevantes,
  desperdiçando tokens e tendendo o recap para ruído de implementação como
  "chamou a ferramenta X para ler o arquivo Y".
- **Partes de pensamento**: carregam o raciocínio interno do modelo. Incluí-las
  arrisca tratar cadeia de pensamento oculta como diálogo e exibi-la no texto do recap.

Após descartar mensagens vazias, `takeRecentDialog` fatia para as últimas 30
mensagens e se recusa a iniciar a fatia em uma resposta de modelo/ferramenta
solta.

## Concorrência e Casos Extremos

### Máquina de estados do hook de gatilho automático

`useAwaySummary` mantém três refs:

| Ref               | Significado                                         |
| ----------------- | --------------------------------------------------- |
| `blurredAtRef`    | Horário de início do blur (não limpo até o foco retornar) |
| `recapPendingRef` | Se uma chamada LLM está em andamento                |
| `inFlightRef`     | O `AbortController` atual em andamento              |

`useEffect` deps: `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Evento                                                          | Ação                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                         | Abortar chamada em andamento + limpar `inFlightRef` + limpar `blurredAtRef`                                                           |
| `!isFocused` e `blurredAtRef === null`                          | Definir `blurredAtRef = Date.now()`                                                                                                   |
| `isFocused` e `blurredAtRef === null`                           | Retornar cedo (nenhum ciclo de blur para tratar — primeira renderização ou logo após um reset de blur breve)                          |
| `isFocused` e duração do blur < 5 min                           | Limpar `blurredAtRef`, aguardar próximo ciclo de blur                                                                                 |
| `isFocused` e blur ≥ 5 min e `recapPendingRef`                  | Retornar (deduplicar)                                                                                                                 |
| `isFocused` e blur ≥ 5 min e `!isIdle`                          | **Preservar** `blurredAtRef` e aguardar a conclusão da rodada (`isIdle` está nas deps, então o efeito é reexecutado quando o streaming termina) |
| `isFocused` e blur ≥ 5 min e `shouldFireRecap` retorna `false`  | Limpar `blurredAtRef` e retornar — a conversa não mudou o suficiente desde o último recap (≥ 2 turnos de usuário necessários, espelha o Claude Code) |
| `isFocused` e todas as condições atendidas                      | Limpar `blurredAtRef`, definir `recapPendingRef = true`, criar `AbortController`, enviar requisição LLM                               |

O callback `.then` **reverifica** `isIdleRef.current`: se o usuário
iniciou uma nova rodada enquanto o LLM estava em execução, o recap que
chega tarde é descartado para evitar inseri-lo no meio da rodada.

O `.finally` limpa `recapPendingRef`, e limpa `inFlightRef` apenas
se `inFlightRef.current === controller` (para não sobrescrever um
controlador mais novo).

Um segundo `useEffect` aborta o controlador em andamento ao desmontar.

### Bloqueio do `/recap`

`CommandContext.ui.isIdleRef` expõe o estado atual do stream
(espelhando o padrão existente `btwAbortControllerRef`). Em modo
interativo, `recapCommand` recusa quando `!isIdleRef.current` **ou**
`pendingItem !== null`. Apenas `pendingItem` é insuficiente porque
uma resposta normal do modelo executa com `streamingState === Responding`
e `pendingItem` nulo.

## Configuração e Seleção de Modelo

### Opções para o usuário

| Configuração                              | Padrão | Observações                                                                          |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `general.showSessionRecap`                | `false`| Apenas gatilho automático. O `/recap` manual ignora isso.                            |
| `general.sessionRecapAwayThresholdMinutes`| `5`    | Minutos ocultos antes do recap automático disparar ao ganhar foco. Espelha o padrão do Claude Code. |
| `fastModel`                               | não definido | Recomendado (ex.: `qwen3-coder-flash`) para recaps rápidos e baratos.                  |

### Fallback de modelo

`config.getFastModel() ?? config.getModel()`:

- Usuário definiu um `fastModel` e ele é válido para o tipo de autenticação atual
  → usar `fastModel`.
- Caso contrário → recorrer ao modelo principal da sessão (funciona, apenas mais caro
  e lento).

## Observabilidade

`createDebugLogger('SESSION_RECAP')` emite:

- exceções capturadas do caminho de recap (`debugLogger.warn`).

Todas as falhas são **totalmente transparentes** para o usuário — recap é um
recurso auxiliar e nunca lança exceção na interface. Desenvolvedores podem
buscar pela tag `[SESSION_RECAP]` no arquivo de log de depuração: escrito por
padrão em `~/.qwen/debug/<sessionId>.txt` (`latest.txt` faz um link simbólico
para a sessão atual); desabilitar via `QWEN_DEBUG_LOG_FILE=0`.

## Fora do Escopo

| Item                                             | Por que não                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Interface de progresso para `/recap` (spinner / pendingItem) | A espera de 3-5 segundos é tolerável; adiciona complexidade.                                                                                |
| Testes automatizados                             | Serviço é pequeno (~150 linhas), testado ponta a ponta manualmente primeiro; testes unitários podem entrar em um PR separado.              |
| Prompts localizados                              | O prompt de sistema é para o modelo; inglês é o substrato mais confiável. O modelo seleciona o idioma de saída a partir da conversa.       |
| Variável de ambiente `QWEN_CODE_ENABLE_AWAY_SUMMARY` | Claude Code a usa para manter o recurso ativo quando a telemetria está desabilitada; o modelo de telemetria atual do Qwen Code não precisa disso. |
| Recap automático ao concluir `/resume`           | Um acompanhamento natural, mas precisa de um ponto de hook em `useResumeCommand`; fora do escopo para este PR.                             |