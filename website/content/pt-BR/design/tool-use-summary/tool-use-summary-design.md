# Design de Resumo de Uso de Ferramentas

> Rótulos de modelo rápido para lotes paralelos de ferramentas — motivação, análise competitiva com o Claude Code, arquitetura e a justificativa do `<Static>` append-only que direcionou a renderização atual no modo completo.
>
> Documentação do usuário: [Resumos de Uso de Ferramentas](../../users/features/tool-use-summaries.md).

## 1. Resumo Executivo

Após a conclusão de cada lote de ferramentas, o Qwen Code dispara uma chamada rápida para um modelo rápido que retorna um rótulo no estilo de assunto de commit do Git, resumindo o lote. O rótulo aparece como uma linha inline atenuada `● <label>` no modo completo e substitui o cabeçalho genérico `Tool × N` no modo compacto. A geração é executada em modo fire-and-forget em paralelo com o stream da API da próxima interação, de modo que sua latência de ~1s fica oculta pelo streaming do modelo principal.

| Dimensão             | Claude Code                                                           | Qwen Code                                                                                  |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Ponto de acionamento         | `query.ts` — após a finalização de um lote de ferramentas                             | `useGeminiStream.ts` → `handleCompletedTools` — mesmo ponto do ciclo de vida                       |
| Modelo de geração      | Haiku via `queryHaiku`                                                | `fastModel` configurado via `GeminiClient.generateContent`                                  |
| Comportamento de subagentes     | `!toolUseContext.agentId` — apenas sessão principal                         | Implícito — subagentes executam via `agents/runtime/`, não `useGeminiStream`                  |
| Agendamento            | Fire-and-forget, aguardado logo antes do stream da próxima interação emitir    | Fire-and-forget, anexado ao histórico quando resolvido                                         |
| Formato de saída          | `ToolUseSummaryMessage` produzido no stream do SDK                   | `HistoryItemToolUseSummary` adicionado ao histórico da UI + factory exportada para uso futuro no SDK      |
| Gate                  | Variável de ambiente `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES`, padrão **desativado**            | Configuração `experimental.emitToolUseSummaries` (padrão **ativado**) + substituição por variável de ambiente                |
| Consumidor principal      | Clientes Mobile / SDK                                                  | Modo compacto e completo da CLI, SDK futuro                                                   |
| Prompt                | Assunto de commit do Git, tempo passado, substantivo mais distintivo (porta literal) | Prompt de sistema idêntico                                                                    |
| Truncamento de entrada      | 300 caracteres por campo de ferramenta via `truncateJson`                           | Idêntico                                                                                  |
| Prefixo de intenção         | Primeiros 200 caracteres da última mensagem do assistente                       | Idêntico                                                                                  |
| Cache de prompt        | `enablePromptCaching: true` na chamada do Haiku                         | Ainda não conectado (rota `forked-agent` disponível; sinalizado como otimização futura)               |
| Pós-processamento do rótulo | Texto bruto do modelo                                                        | `cleanSummary` (remove markdown, aspas, prefixos de erro; limita a 100 caracteres, seguro contra ReDoS) |
| Persistência de sessão   | Apenas stream; cada sessão regenera                                 | Apenas histórico da UI; `ChatRecordingService` não persiste entradas `tool_use_summary`        |

## 2. Análise da Implementação do Claude Code

### 2.1 Fluxo

O Claude Code executa o loop de ferramentas em `query.ts`. Após a execução de um lote de ferramentas e a normalização dos resultados, a função geradora bifurca uma chamada para o Haiku, mantém a promise pendente em `nextPendingToolUseSummary` e continua com a chamada de API da próxima interação. A latência do Haiku (~1s) se sobrepõe ao streaming do modelo principal (5–30s), portanto o usuário não percebe latência adicional. Imediatamente antes de emitir o conteúdo da próxima interação, o gerador aguarda o resumo pendente e produz uma mensagem `tool_use_summary` no stream.

```
tool_batch_complete → fork queryHaiku (fire-and-forget)
                          ↓
               next_turn_stream_starts
                          ↓
       ← summary Promise resolves during streaming →
                          ↓
       await pendingToolUseSummary → yield ToolUseSummaryMessage
                          ↓
                continue with next turn
```

### 2.2 Arquivos de origem principais

| Componente       | Arquivo                                                       | Lógica principal                                                                               |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Gerador       | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97` | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })` |
| Acionador         | `query.ts:1411-1482`                                       | Guardado pelo gate `emitToolUseSummaries` + sem subagente; bifurca Haiku; carrega promise           |
| Aguardar + emitir    | `query.ts:1055-1060`                                       | Aguarda `pendingToolUseSummary` no limite da próxima interação, produz mensagem                      |
| Factory de mensagem | `utils/messages.ts:5105-5116`                              | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                             |
| Feature gate    | `query/config.ts:23,36-38`                                 | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                |

### 2.3 Decisões de design

1. **Sempre gerar quando o gate estiver ativado, independentemente do estado compacto/detalhado.** O resumo é um artefato em nível de stream; a UI decide se deve renderizá-lo.
2. **Emitir como um tipo de mensagem de primeira classe.** `tool_use_summary` fica ao lado de `user`, `assistant`, `tool_result` no stream do SDK, com um campo `precedingToolUseIds` para que os consumidores possam correlacionar com o lote.
3. **Subagentes são excluídos.** `!toolUseContext.agentId` — a saída do subagente é agregada a montante; lotes individuais de subagentes gerariam rótulos ruidosos que nunca apareceriam na UI principal.
4. **Desativado por padrão.** O gate baseado apenas em variável de ambiente mantém o custo em zero, a menos que um consumidor do SDK a jusante opte por ativá-lo. O próprio terminal do CC não renderiza a mensagem.
5. **Truncamento de entrada em 300 caracteres por campo.** Cobre o principal risco de custo — um único resultado de ferramenta grande inflando o prompt — mantendo sinal suficiente para o rótulo.

## 3. Implementação no Qwen Code

### 3.1 Fluxo

O Qwen Code se conecta ao mesmo ponto do ciclo de vida (`useGeminiStream.handleCompletedTools`), mas renderiza em ambos os lados de `ui.compactMode`, tornando o recurso útil para usuários da CLI sem necessidade de integração com o SDK.

```
tool_batch_complete (handleCompletedTools)
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   fork generateToolUseSummary (fire-and-forget)
           ↓
  submitQuery() for next turn (streaming starts)
           ↓
   ← summary Promise resolves during streaming →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay renders:
    compactMode=false → ● <label> standalone line
    compactMode=true  → hidden; MainContent lookup injects into CompactToolGroupDisplay header
```

### 3.2 Arquivos de origem principais

| Componente           | Arquivo                                                                  | Lógica principal                                                                 |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Serviço             | `packages/core/src/services/toolUseSummary.ts`                        | `generateToolUseSummary`, `truncateJson`, `cleanSummary`, factory de mensagem |
| Gate de configuração         | `packages/core/src/config/config.ts:getEmitToolUseSummaries`          | Substituição por variável de ambiente → configurações → padrão (true)                                  |
| Acionador             | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`   | Dispara chamada do modelo rápido, addItem ao resolver                                 |
| Renderização modo completo    | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Renderiza linha `● <label>` quando `!compactMode`                              |
| Busca modo compacto | `packages/cli/src/ui/components/MainContent.tsx`                      | Mapa `summaryByCallId` → prop `compactLabel` para cada `tool_group`            |
| Cabeçalho compacto      | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Substitui `Tool × N` padrão por `<Summary> · N tools` quando rótulo presente |
| Tratamento de mesclagem      | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                 | Trata `tool_use_summary` como oculto no modo compacto para adjacência              |
| Tipo da UI             | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`              | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`              |

### 3.3 A restrição append-only do `<Static>`

A decisão arquitetural central neste PR é **por que o rótulo no modo completo é um item de histórico independente e não uma decoração no próprio `tool_group`**.

O Qwen Code renderiza o transcript por meio do `<Static>` do Ink. O Static é append-only: uma vez que um item é confirmado no buffer do terminal, o Ink não repintará essa região a menos que `refreshStatic()` seja chamado para limpar e renderizar novamente todo o transcript. Esse é o modelo de desempenho do qual a CLI depende — itens estáticos não são renderizados novamente a cada tecla pressionada.

Agora, considere o tempo da chamada do modelo rápido:

```
T0   tool batch completes, tool_group is pushed to history
T0+ε tool_group renders through <Static> and is committed to the buffer
T0+1s fast-model call resolves with a label
```

Em T0+1s, não podemos adicionar retroativamente o rótulo ao `tool_group` já confirmado. Existem duas opções:

1. **Atualizar as props do `tool_group` + chamar `refreshStatic()`.** Funciona, mas causa uma repintura completa do transcript em cada lote — uma das operações de UI mais caras no app. Flash visível. Inaceitável para um rótulo cosmético.
2. **Renderizar o resumo como um novo item de histórico próprio, anexado _após_ o `tool_group`.** O Static lida com isso nativamente — novos itens são anexados sem problemas, sem repintura.

Este PR adota a opção 2 no modo completo. A entrada `tool_use_summary` é um item de histórico real, renderizado como uma única linha atenuada `● <label>` pelo `HistoryItemDisplay`. Não é necessário `refreshStatic`.

O modo compacto é diferente por causa do `mergeCompactToolGroups`. Quando `tool_group`s consecutivos são mesclados, o `MainContent` já chama `refreshStatic()` — esse é um caminho de código existente, e ele renderiza novamente o grupo mesclado com o rótulo buscado no histórico. Portanto, o modo compacto _sim_ recebe o rótulo como substituição do cabeçalho. Para evitar renderizar o mesmo rótulo duas vezes (uma vez como cabeçalho compacto, outra como linha `● <label>` à direita), o `HistoryItemDisplay` oculta a linha independente quando `compactMode` é true.

```
Full mode              Compact mode (with merge)
───────────            ─────────────────────────
[tool_group]           [merged tool_group — header replaced via lookup]
● <label>              (● <label> line is hidden)
```

### 3.4 Semântica do gate

Três camadas, resolvidas em ordem de precedência:

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` — substituição por variável de ambiente, maior prioridade.
2. `experimental.emitToolUseSummaries` em `settings.json` — padrão `true`.
3. Ignorância implícita — se `config.getFastModel()` retornar `undefined`, a geração é ignorada independentemente do gate. Sem erro, sem alteração visível ao usuário.

### 3.5 Limpeza de saída

`cleanSummary` é executado em cada resposta do modelo antes de ser adicionada ao histórico:

1. Pega apenas a primeira linha (descarta preâmbulos de raciocínio do modelo).
2. Remove prefixos de lista (`-`, `*`, `•`) — os modelos às vezes retornam o rótulo como um item de lista.
3. Remove aspas/backticks ao redor por meio de uma regex limitada `{1,10}` (segura para CodeQL; nenhum rótulo real tem mais do que algumas aspas de envolvimento).
4. Remove rótulos de prefixo (`Label:`, `Summary:`, `Result:`, `Output:`) que alguns modelos adicionam no início.
5. Rejeita formatos de mensagem de erro (`API error: ...`, `Error: ...`, `I cannot ...`, `I can't ...`, `Unable to ...`) — retorna string vazia para que nenhum item de histórico seja adicionado.
6. Limite rígido de 100 caracteres (a UI móvel trunca por volta de 30; a margem cobre frases em CJK).

### 3.6 Telemetria

A chamada de geração do resumo define `promptId: 'tool_use_summary_generation'` para que seu uso de tokens seja contabilizado separadamente em `/stats`. Isso permite que os usuários vejam o custo incremental exato do recurso sem confundi-lo com sugestões de prompt ou com o uso da sessão principal.

## 4. Desvios em relação ao Claude Code (e o porquê)

| Desvio                                                                | Motivo                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camada de configurações além do gate de variável de ambiente                                   | O Qwen Code renderiza o rótulo na CLI; os usuários precisam de uma opção persistente, não de uma exportação de variável de ambiente por shell.                                                                                     |
| Padrão **ativado** em vez de desativado                                            | O rótulo é imediatamente visível ao usuário em ambos os modos de exibição; usuários que configuram `fastModel` já estão optando por recursos de modelo rápido.                                                     |
| Pós-processamento dedicado `cleanSummary`                                 | O Qwen Code oferece suporte a provedores mais heterogêneos que o CC; alguns modelos adicionam `Label:` no início ou envolvem em aspas. Normalizar na fronteira mantém a UI consistente.                           |
| Armazena `HistoryItemToolUseSummary` em vez de emitir uma mensagem de stream | Implementação com foco na CLI; a rota de stream do SDK será um PR futuro. A factory `ToolUseSummaryMessage` já está exportada para esse trabalho.                                                   |
| Cache de prompt ainda não conectado                                             | O modelo rápido geralmente é o mesmo que o modelo principal para usuários que não configuraram um separado. Adicionar compartilhamento de cache requer roteamento via `forkedAgent.ts`; rastreado como uma tarefa futura. |
| Caminhos de renderização duplos (inline no modo completo + cabeçalho no modo compacto)               | O padrão do Qwen Code é `ui.compactMode: false`; sem a renderização inline no modo completo, o recurso ficaria invisível para a maioria dos usuários.                                                      |

## 5. Limitações conhecidas

- **Sem persistência de sessão.** `tool_use_summary` não é gravado no JSONL de gravação do chat. Retomar uma sessão perde os rótulos; os grupos de ferramentas são renderizados com o cabeçalho genérico como fallback. Baixa prioridade: os rótulos são regenerados naturalmente conforme o usuário continua a sessão.
- **Sem emissão no stream do SDK ainda.** A factory de mensagens está exportada, mas a CLI ainda não alimenta `tool_use_summary` na bridge do SDK. PR futuro.
- **Sem cache de prompt.** Cada lote incorre em um novo custo de tokens de entrada. Negligenciável em termos absolutos (~300 tokens), mas mensurável se você executar dezenas de lotes por interação.
- **O resumo para grupos compactos mesclados seleciona o rótulo do primeiro lote contribuinte.** Se um usuário disparar dez lotes dissimilares em sequência (loop apertado, não típico), o cabeçalho compacto mesclado mostrará apenas a intenção do lote inicial. Trade-off aceito: distribuir rótulos por lote em uma visualização mesclada é visualmente mais ruidoso do que pegar o primeiro.
- **Modelo rápido obrigatório.** Sem um `fastModel` configurado, a geração é ignorada. O fallback para o modelo principal é deliberadamente desabilitado para manter o perfil de custo controlado.

## 6. Trabalho futuro

1. Conectar `ToolUseSummaryMessage` à bridge do SDK para que a factory existente seja usada a jusante.
2. Roteirizar a geração via `forkedAgent.ts` com `enablePromptCaching` para que prefixos repetidos de nomes de ferramentas acionem os caches do provedor.
3. Opcional: persistir entradas `tool_use_summary` no `ChatRecordingService` e reproduzi-las ao retomar a sessão.
4. Opcional: atalhos de rótulo por nome de ferramenta (ex.: sempre `Read <filename>` para uma única chamada `read_file`) como um caminho rápido pré-LLM.