# Design do Session Recap

> Um breve resumo (1-2 frases) de "onde eu parei" exibido quando o usuário retorna a uma sessão inativa, seja sob demanda (`/recap`) ou após o terminal perder o foco (blur) por 5+ minutos.

## Overview

Quando um usuário executa `/resume` em uma sessão antiga dias depois, rolar páginas de histórico para lembrar **o que estava fazendo e qual era o próximo passo** é um ponto de atrito real. Apenas recarregar as mensagens não resolve esse problema de UX.

O objetivo é exibir proativamente um breve resumo de 1 a 2 frases quando o usuário retornar:

- **Tarefa de alto nível** (o que está fazendo) → **próximo passo** (o que fazer a seguir).
- **Visualmente distinto** das respostas reais do assistente, para nunca ser confundido com uma nova saída do modelo.
- **Best-effort**: falhas devem ser silenciosas e nunca interromper o fluxo principal.

## Triggers

| Gatilho    | Condições                                                                                   | Implementação                                                    |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Manual** | Usuário executa `/recap`                                                                     | `recapCommand.ts` chama o mesmo serviço subjacente               |
| **Automático**   | Terminal em blur (protocolo de foco DECSET 1004) por ≥ 5 min + foco retorna + stream está `Idle` | `useAwaySummary.ts` — timer de 5 min de blur + event listener `useFocus` |

Ambos os caminhos convergem para uma única função — `generateSessionRecap()` — para garantir comportamento idêntico. O gatilho automático é controlado por `general.showSessionRecap` (padrão: desativado — opt-in explícito, para que chamadas de LLM em segundo plano nunca sejam adicionadas silenciosamente à fatura do usuário); o comando manual ignora essa configuração.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ timer de 5 min de blur + gates de idle/dedupe        │
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
│       └─ AwayRecapMessage renderizado inline como qualquer outro item  │
│         de histórico (※ + "recap: " em negrito + conteúdo em itálico,  │
│         tudo esmaecido); rola naturalmente com a conversa. Espelha a   │
│         mensagem de sistema away_summary do Claude Code.               │
└────────────────────────────────────────────────────────────────────────┘
```

### Files

| File                                                         | Responsibility                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                 | Chamada LLM one-shot + filtro de histórico + extração de tags                    |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                | React hook de gatilho automático                                                 |
| `packages/cli/src/ui/commands/recapCommand.ts`               | Ponto de entrada manual para `/recap`                                            |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | Renderer do `AwayRecapMessage` (※ + `recap:` em negrito + conteúdo em itálico, tudo esmaecido) |
| `packages/cli/src/ui/types.ts`                               | Tipo `HistoryItemAwayRecap`                                                      |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | Encaminha itens de histórico `away_recap` para o renderer                        |
| `packages/cli/src/config/settingsSchema.ts`                  | Configurações `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` |

## Prompt Design

### System Prompt

`generationConfig.systemInstruction` substitui o prompt do sistema do agente principal nesta chamada única, para que o modelo atue apenas como gerador de resumo e não como assistente de codificação.

Observe que `GeminiClient.generateContent()` executa internamente o prompt através de `getCustomSystemPrompt()`, que anexa a memória do usuário (`QWEN.md` / auto-memória gerenciada) como sufixo. O prompt do sistema final é, portanto, `prompt de resumo + memória do usuário` — contexto útil do projeto para o resumo, não um vazamento.

Os itens abaixo correspondem 1:1 com `RECAP_SYSTEM_PROMPT`:

- Menos de 40 palavras, 1-2 frases simples (sem markdown / listas / títulos). Para chinês, considere o limite como aproximadamente 80 caracteres no total.
- Primeira frase: a tarefa de alto nível. Em seguida: o próximo passo concreto.
- Proibir explicitamente: listar o que foi feito, recitar chamadas de ferramentas ou relatórios de status.
- Corresponder ao idioma dominante da conversa (inglês ou chinês).
- Envolver a saída em `<recap>...</recap>`; nada fora das tags.

### Structured Output + Extraction

O modelo é instruído a envolver sua resposta em `<recap>...</recap>`:

```
<recap>Refactoring loopDetectionService.ts to address long-session OOM. Next step is to implement option B.</recap>
```

Por quê: alguns modelos (família GLM, modelos de raciocínio) escrevem um parágrafo de "pensamento" antes da resposta final. Retornar o texto bruto vazaria esse raciocínio na UI.

`extractRecap()` possui três níveis de fallback:

1. Ambas as tags presentes: pegar o conteúdo entre `<recap>...</recap>` (preferencial).
2. Apenas a tag de abertura (ex.: `maxOutputTokens` truncou a tag de fechamento): pegar tudo após a tag de abertura.
3. Tag completamente ausente: retornar string vazia → serviço retorna `null` → UI não renderiza nada.

O terceiro nível segue a lógica de "ignorar em vez de mostrar algo errado" — exibir o preâmbulo de raciocínio do modelo é pior do que não mostrar resumo algum.

### Call Parameters

| Parâmetro           | Valor                          | Motivo                                                |
| ------------------- | ------------------------------ | ----------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()` | O resumo não precisa de um modelo de ponta            |
| `tools`             | `[]`                           | Consulta one-shot, sem uso de ferramentas             |
| `maxOutputTokens`   | `300`                          | Margem para 1-2 frases curtas + tags                  |
| `temperature`       | `0.3`                          | Majoritariamente determinístico, com um pouco de variação natural |
| `systemInstruction` | O prompt de resumo acima       | Substitui a definição de papel do agente principal    |

## History Filtering

`geminiClient.getChat().getHistory()` retorna um `Content[]` que inclui:

- mensagens de texto `user` / `model`
- partes `functionCall` do `model`
- partes `functionResponse` do `user` (que podem conter o conteúdo completo de arquivos)
- partes de pensamento do `model` (`part.thought` / `part.thoughtSignature`, o raciocínio oculto do modelo)

`filterToDialog()` mantém apenas as partes `user` / `model` que possuem **texto não vazio e não são pensamentos**. Dois motivos:

- **Chamadas/respostas de ferramentas**: um único `functionResponse` pode ter 10K+ tokens. 30 mensagens assim afogariam o LLM de resumo em detalhes irrelevantes, desperdiçando tokens e enviesando o resumo para ruídos de implementação como "chamou a ferramenta X para ler o arquivo Y".
- **Partes de pensamento**: carregam o raciocínio interno do modelo. Incluí-las corre o risco de tratar a cadeia de pensamentos oculta como diálogo e exibi-la no texto do resumo.

Após descartar mensagens vazias, `takeRecentDialog` fatia para as últimas 30 mensagens e se recusa a iniciar o corte em uma resposta de modelo/ferramenta solta.

## Concurrency and Edge Cases

### Auto-trigger hook state machine

`useAwaySummary` mantém três refs:

| Ref               | Significado                                           |
| ----------------- | ------------------------------------------------- |
| `blurredAtRef`    | Horário de início do blur (não é limpo até o foco retornar) |
| `recapPendingRef` | Se há uma chamada de LLM em andamento                  |
| `inFlightRef`     | O `AbortController` atual em andamento                 |

Deps do `useEffect`: `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`.

| Evento                                                            | Ação                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                          | Abortar chamada em andamento + limpar `inFlightRef` + limpar `blurredAtRef`                                                                      |
| `!isFocused` e `blurredAtRef === null`                         | Definir `blurredAtRef = Date.now()`                                                                                                        |
| `isFocused` e `blurredAtRef === null`                          | Retornar cedo (sem ciclo de blur para tratar — primeira renderização ou logo após um reset de blur breve)                                                |
| `isFocused` e duração do blur < 5 min                            | Limpar `blurredAtRef`, aguardar próximo ciclo de blur                                                                                         |
| `isFocused` e blur ≥ 5 min e `recapPendingRef`               | Retornar (dedupe)                                                                                                                        |
| `isFocused` e blur ≥ 5 min e `!isIdle`                       | **Preservar** `blurredAtRef` e aguardar o término do turno (`isIdle` está nas deps, então o efeito é disparado novamente quando o streaming é concluído) |
| `isFocused` e blur ≥ 5 min e `shouldFireRecap` retorna false | Limpar `blurredAtRef` e retornar — a conversa não avançou o suficiente desde o último resumo (exigidos ≥ 2 turnos do usuário, espelha o Claude Code) |
| `isFocused` e todas as condições atendidas                               | Limpar `blurredAtRef`, definir `recapPendingRef = true`, criar `AbortController`, enviar a requisição ao LLM                                     |

O callback `.then` **re-verifica** `isIdleRef.current`: se o usuário iniciou um novo turno enquanto o LLM estava executando, o resumo que chega atrasado é descartado para evitar inseri-lo no meio do turno.

O `.finally` limpa `recapPendingRef` e limpa `inFlightRef` apenas se `inFlightRef.current === controller` (para não sobrescrever um controller mais recente).

Um segundo `useEffect` aborta o controller em andamento no unmount.

### `/recap` gating

`CommandContext.ui.isIdleRef` expõe o estado atual do stream (espelhando o padrão existente `btwAbortControllerRef`). No modo interativo, `recapCommand` recusa quando `!isIdleRef.current` **ou** `pendingItem !== null`. `pendingItem` sozinho é insuficiente porque uma resposta normal do modelo executa com `streamingState === Responding` e um `pendingItem` nulo.

## Configuration and Model Selection

### User-facing knobs

| Configuração                                    | Padrão | Notas                                                                               |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `general.showSessionRecap`                 | `false` | Apenas gatilho automático. `/recap` manual ignora isso.                                    |
| `general.sessionRecapAwayThresholdMinutes` | `5`     | Minutos em blur antes do auto-recap ser disparado ao recuperar o foco. Corresponde ao padrão do Claude Code. |
| `fastModel`                                | não definido   | Recomendado (ex.: `qwen3-coder-flash`) para resumos rápidos e baratos.                   |

### Model fallback

`config.getFastModel() ?? config.getModel()`:

- O usuário tem um `fastModel` configurado e ele é válido para o tipo de auth atual → usar `fastModel`.
- Caso contrário → fallback para o modelo principal da sessão (funciona, apenas mais caro e lento).

## Observability

`createDebugLogger('SESSION_RECAP')` emite:

- exceções capturadas do fluxo de resumo (`debugLogger.warn`).

Todas as falhas são **totalmente transparentes** para o usuário — o resumo é um recurso auxiliar e nunca lança erros na UI. Desenvolvedores podem usar `grep` pela tag `[SESSION_RECAP]` no arquivo de log de debug: gravado por padrão em `~/.qwen/debug/<sessionId>.txt` (`latest.txt` é um symlink para a sessão atual); desative via `QWEN_DEBUG_LOG_FILE=0`.

## Out of Scope

| Item                                             | Por que não                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| UI de progresso para `/recap` (spinner / `pendingItem`) | Espera de 3-5 segundos é tolerável; adiciona complexidade.                                                                                           |
| Testes automatizados                                  | O serviço é pequeno (~150 linhas), testado manualmente end-to-end primeiro; testes unitários podem entrar em um PR separado.                                   |
| Prompts localizados                                | O prompt do sistema é para o modelo; o inglês é a base mais confiável. O modelo seleciona o idioma de saída com base na conversa. |
| Variável de ambiente `QWEN_CODE_ENABLE_AWAY_SUMMARY`          | O Claude Code a usa para manter o recurso ativo quando a telemetria está desativada; o modelo de telemetria atual do Qwen Code não precisa disso.            |
| Auto-recap na conclusão de `/resume`               | Um acompanhamento natural, mas precisa de um hook em `useResumeCommand`; fora do escopo deste PR.                                              |