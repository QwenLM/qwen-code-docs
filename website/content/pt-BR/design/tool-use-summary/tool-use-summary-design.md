# Design do Resumo de Uso de Ferramentas

> Rótulos de modelo rápido para lotes paralelos de ferramentas — motivação, análise competitiva com Claude Code, arquitetura e a lógica de Static somente anexação que impulsionou a renderização atual do modo completo.
>
> Documentação do usuário: [Resumos de Uso de Ferramentas](../../users/features/tool-use-summaries.md).

## 1. Resumo Executivo

Após cada lote de ferramentas ser concluído, o Qwen Code dispara uma chamada curta de modelo rápido que retorna um rótulo no estilo de assunto de commit git resumindo o lote. O rótulo aparece como uma linha `● <label>` esmaecida em linha no modo completo e substitui o cabeçalho genérico `Tool × N` no modo compacto. A geração é executada de forma assíncrona (fire-and-forget) em paralelo com a transmissão da próxima iteração da API, de modo que sua latência de ~1s fica oculta por trás da transmissão do modelo principal.

| Dimensão | Claude Code | Qwen Code |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Ponto de disparo | `query.ts` — após um lote de ferramentas ser finalizado | `useGeminiStream.ts` → `handleCompletedTools` — mesmo ponto no ciclo de vida |
| Modelo de geração | Haiku via `queryHaiku` | `fastModel` configurado via `GeminiClient.generateContent` |
| Comportamento do subagente | `!toolUseContext.agentId` — apenas sessão principal | Implícito — subagentes executam via `agents/runtime/`, não `useGeminiStream` |
| Agendamento | Fire-and-forget, aguardado antes da emissão da próxima iteração | Fire-and-forget, anexado ao histórico quando resolvido |
| Formato de saída | `ToolUseSummaryMessage` inserido no stream do SDK | `HistoryItemToolUseSummary` adicionado ao histórico da UI + fábrica exportada para uso futuro no SDK |
| Portão | Variável de ambiente `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES`, padrão **desligado** | Configuração `experimental.emitToolUseSummaries` (padrão **ligado**) + sobrescrita por variável de ambiente |
| Consumidor principal | Clientes Mobile / SDK | CLI modo compacto + modo completo, futuro SDK |
| Prompt | Assunto de commit git, passado, substantivo mais distintivo (porta literal) | Prompt de sistema idêntico |
| Truncamento de entrada | 300 caracteres por campo de ferramenta via `truncateJson` | Idêntico |
| Prefixo de intenção | Primeiros 200 caracteres da última mensagem do assistente | Idêntico |
| Cache de prompt | `enablePromptCaching: true` na chamada Haiku | Ainda não implementado (rota de agente bifurcado disponível; sinalizado como otimização futura) |
| Pós-processamento do rótulo | Texto bruto do modelo | `cleanSummary` (remove markdown, aspas, prefixos de erro; limita a 100 caracteres, com limite ReDoS) |
| Persistência de sessão | Apenas stream; cada sessão regenera | Apenas histórico da UI; `ChatRecordingService` não persiste entradas `tool_use_summary` |

## 2. Análise da Implementação do Claude Code

### 2.1 Fluxo

O Claude Code executa o loop de ferramentas em `query.ts`. Após um lote de ferramentas ser executado e seus resultados normalizados, a função geradora bifurca uma chamada Haiku, mantém a promessa pendente em `nextPendingToolUseSummary` e continua com a chamada de API da próxima iteração. A latência do Haiku (~1s) se sobrepõe à transmissão do modelo principal (5–30s), de modo que o usuário não vê latência adicional. Imediatamente antes de emitir o conteúdo da próxima iteração, o gerador aguarda o resumo pendente e produz uma mensagem `tool_use_summary` no stream.

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

### 2.2 Principais arquivos fonte

| Componente | Arquivo | Lógica chave |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Gerador | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97` | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })` |
| Disparo | `query.ts:1411-1482`                                       | Guarda por `emitToolUseSummaries` + sem subagente; bifurca Haiku; carrega promessa |
| Aguardar + emitir | `query.ts:1055-1060`                                       | Aguarda `pendingToolUseSummary` no limite da próxima iteração, produz mensagem |
| Fábrica de mensagens | `utils/messages.ts:5105-5116`                              | `createToolUseSummaryMessage(summary, precedingToolUseIds)` |
| Portão de funcionalidade | `query/config.ts:23,36-38`                                 | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)` |

### 2.3 Decisões de design

1. **Sempre gerar quando o portão está ativado, independentemente do estado compacto/detalhado.** O resumo é um artefato de nível de stream; a UI decide se deve renderizá-lo.
2. **Emitir como um tipo de mensagem de primeira classe.** `tool_use_summary` fica ao lado de `user`, `assistant`, `tool_result` no stream do SDK com um campo `precedingToolUseIds` para que os consumidores possam correlacionar com o lote.
3. **Subagentes são excluídos.** `!toolUseContext.agentId` — a saída dos subagentes é agregada upstream; lotes individuais de subagentes produziriam rótulos ruidosos que nunca apareceriam na UI principal.
4. **Desligado por padrão.** O portão somente por variável de ambiente mantém o custo zero, a menos que um consumidor downstream do SDK opte por ativar. O próprio terminal do CC não renderiza a mensagem.
5. **Truncamento de entrada em 300 caracteres por campo.** Cobre o principal risco de custo — um único resultado grande de ferramenta que exploda o prompt — enquanto mantém sinal suficiente para o rótulo.

## 3. Implementação do Qwen Code

### 3.1 Fluxo

O Qwen Code conecta o mesmo ponto do ciclo de vida (`useGeminiStream.handleCompletedTools`), mas renderiza em ambos os lados de `ui.compactMode` para que o recurso seja útil para usuários da CLI sem qualquer encanamento do SDK.

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

### 3.2 Principais arquivos fonte

| Componente | Arquivo | Lógica chave |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Serviço | `packages/core/src/services/toolUseSummary.ts` | `generateToolUseSummary`, `truncateJson`, `cleanSummary`, fábrica de mensagens |
| Portão de configuração | `packages/core/src/config/config.ts:getEmitToolUseSummaries` | Sobrescrita por env → configurações → padrão (true) |
| Disparo | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools` | Dispara chamada de modelo rápido, addItem na resolução |
| Renderização modo completo | `packages/cli/src/ui/components/HistoryItemDisplay.tsx` | Renderiza linha `● <label>` quando `!compactMode` |
| Consulta modo compacto | `packages/cli/src/ui/components/MainContent.tsx` | Mapa `summaryByCallId` → prop `compactLabel` para cada tool_group |
| Cabeçalho compacto | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Substitui o padrão `Tool × N` por `<Summary> · N tools` quando o rótulo está presente |
| Tratamento de mesclagem | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts` | Trata `tool_use_summary` como oculto em modo compacto para adjacência |
| Tipo na UI | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary` | `{ type: 'tool_use_summary', summary, precedingToolUseIds }` |

### 3.3 A restrição de anexação somente do `<Static>`

A principal decisão arquitetural neste PR é **por que o rótulo no modo completo é um item de histórico independente e não uma decoração no próprio tool_group**.

O Qwen Code renderiza o transcripto via `<Static>` do Ink. Static é somente anexação: uma vez que um item é commitado no buffer do terminal, o Ink não repintará aquela região a menos que `refreshStatic()` seja chamado para limpar e re-renderizar o transcripto inteiro. Este é o modelo de desempenho do qual a CLI depende — itens estáticos não re-renderizam a cada pressionamento de tecla.

Agora considere o tempo da chamada do modelo rápido:

```
T0   tool batch completes, tool_group is pushed to history
T0+ε tool_group renders through <Static> and is committed to the buffer
T0+1s fast-model call resolves with a label
```

Em T0+1s, não podemos adicionar retroativamente o rótulo ao tool_group já commitado. Duas opções existem:

1. **Atualizar as props do tool_group + chamar `refreshStatic()`.** Funciona, mas causa uma repintura completa do transcripto a cada lote — uma das operações de UI mais caras do aplicativo. Flash visível. Inaceitável para um rótulo cosmético.
2. **Renderizar o resumo como seu próprio novo item de histórico anexado _após_ o tool_group.** O Static lida com isso nativamente — novos itens são anexados de forma limpa, sem repintura.

Este PR adota a opção 2 no modo completo. A entrada `tool_use_summary` é um item de histórico real, renderizado como uma única linha `● <label>` esmaecida pelo `HistoryItemDisplay`. Nenhum `refreshStatic` é necessário.

O modo compacto é diferente por causa de `mergeCompactToolGroups`. Quando tool_groups consecutivos são mesclados, `MainContent` já chama `refreshStatic()` — esse é um caminho de código existente, e ele re-renderiza o grupo mesclado com o rótulo consultado do histórico. Portanto, o modo compacto _obtém_ o rótulo como uma substituição de cabeçalho. Para evitar renderizar o mesmo rótulo duas vezes (uma vez como cabeçalho compacto e outra como linha `● <label>` final), o `HistoryItemDisplay` oculta a linha independente quando `compactMode` é true.

```
Full mode              Compact mode (with merge)
───────────            ─────────────────────────
[tool_group]           [merged tool_group — header replaced via lookup]
● <label>              (● <label> line is hidden)
```

### 3.4 Semântica do portão

Três camadas, resolvidas em ordem de precedência:

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` — sobrescrita por env, maior prioridade.
2. `experimental.emitToolUseSummaries` em `settings.json` — padrão `true`.
3. Pulada implicitamente — se `config.getFastModel()` retorna `undefined`, a geração é pulada independentemente do portão. Nenhum erro, nenhuma alteração visível ao usuário.

### 3.5 Limpeza de saída

`cleanSummary` é executado em cada resposta do modelo antes de ser adicionada ao histórico:

1. Pega apenas a primeira linha (descarta preâmbulos de raciocínio do modelo).
2. Remove prefixos de marcadores (`-`, `*`, `•`) — modelos às vezes retornam o rótulo como um item de lista.
3. Remove aspas/backticks circundantes via regex limitado `{1,10}` (seguro para CodeQL; nenhum rótulo real tem mais do que algumas aspas envolvendo).
4. Remove rótulos de prefixo (`Label:`, `Summary:`, `Result:`, `Output:`) que alguns modelos preprendem.
5. Rejeita formas de mensagem de erro (`API error: ...`, `Error: ...`, `I cannot ...`, `I can't ...`, `Unable to ...`) — retorna string vazia para que nenhum item de histórico seja adicionado.
6. Limita o comprimento a 100 caracteres (UI móvel trunca em cerca de 30; a folga cobre frases em CJK).

### 3.6 Telemetria

A chamada de geração do resumo define `promptId: 'tool_use_summary_generation'` para que seu uso de tokens seja contabilizado separadamente em `/stats`. Isso permite que os usuários vejam o custo incremental exato do recurso sem confundi-lo com sugestões de prompt ou o uso da sessão principal.

## 4. Desvios do Claude Code (e por quê)

| Desvio | Por quê |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camada de configurações além do portão de env | O Qwen Code renderiza o rótulo na CLI; os usuários precisam de uma chave persistente, não de uma exportação de env por shell. |
| Padrão **ligado** em vez de desligado | O rótulo é imediatamente visível ao usuário em ambos os modos de exibição; usuários que configuram `fastModel` já estão optando por recursos de modelo rápido. |
| Pós-processamento dedicado `cleanSummary` | O Qwen Code suporta provedores mais heterogêneos que o CC; alguns modelos preprendem `Label:` ou envolvem em aspas. Normalizar na fronteira mantém a UI consistente. |
| Armazena `HistoryItemToolUseSummary` em vez de emitir uma mensagem de stream | Implementação focada em CLI; a rota de stream do SDK é um PR futuro. A fábrica `ToolUseSummaryMessage` já está exportada para esse trabalho. |
| Cache de prompt ainda não implementado | O modelo rápido é frequentemente o mesmo que o modelo principal para usuários que não configuraram um separado. Adicionar compartilhamento de cache requer roteamento via `forkedAgent.ts`; rastreado como acompanhamento. |
| Caminhos de renderização duplos (inline modo completo + cabeçalho modo compacto) | O padrão do Qwen Code é `ui.compactMode: false`; sem a renderização inline no modo completo, o recurso seria invisível para a maioria dos usuários. |

## 5. Limitações conhecidas

- **Sem persistência de sessão.** `tool_use_summary` não é escrito no JSONL de gravação de chat. Retomar uma sessão perde rótulos; grupos de ferramentas renderizam com o cabeçalho genérico como fallback. Baixa prioridade: os rótulos são regenerados naturalmente conforme o usuário continua a sessão.
- **Sem emissão de stream no SDK ainda.** A fábrica de mensagens está exportada, mas a CLI ainda não alimenta `tool_use_summary` na ponte do SDK. PR de acompanhamento.
- **Sem cache de prompt.** Cada lote incorre em um custo de tokens de entrada novo. Insignificante em termos absolutos (~300 tokens), mas mensurável se você executar dezenas de lotes por turno.
- **Resumo para grupos compactos mesclados pega o rótulo do primeiro lote contribuinte.** Se um usuário disparar dez lotes diferentes consecutivos (loop apertado, não típico), o cabeçalho compacto mesclado mostrará apenas a intenção do lote líder. Trade-off aceito: distribuir rótulos por lote em uma visão mesclada é visualmente mais ruidoso do que pegar o primeiro.
- **Modelo rápido necessário.** Sem um `fastModel` configurado, a geração é pulada. Cair para o modelo principal é deliberadamente desabilitado para manter o perfil de custo limitado.

## 6. Trabalho futuro

1. Conectar `ToolUseSummaryMessage` na ponte do SDK para que a fábrica existente seja usada downstream.
2. Roteirizar a geração via `forkedAgent.ts` com `enablePromptCaching` para que prefixos repetidos de nomes de ferramentas atinjam caches do provedor.
3. Opcional: persistir entradas `tool_use_summary` no `ChatRecordingService` e reproduzir na retomada da sessão.
4. Opcional: atalhos de rótulo por nome de ferramenta (por exemplo, sempre `Read <filename>` para uma única chamada `read_file`) como um caminho rápido pré-LLM.