# Kernel de Projeção Compartilhado de ChatRecords Append-only para DaemonTranscriptBlocks

## Status do Documento

- Status: Implementado
- Data: 2026-07-14
- Data de implementação: 2026-07-15
- Escopo: core, acp-bridge, cli, sdk-typescript, web-shell
- Entrada: registros desconhecidos append-only já parseados de JSONL pelo chamador
- Saída: uma projeção `DaemonTranscriptBlock` com informações de diagnóstico e completude

## Conclusão

Resultado da implementação: preparação de registros, a máquina de replay ACP, builders puros live/replay, o adapter de CLI, compactação ciente de proveniência, o normalizer/reducer do SDK e a fachada opt-in do SDK foram todos entregues. O bundle de browser padrão do daemon permanece dentro do seu orçamento de 151 KiB; o bundle de browser de transcript minificado tem 67.730 bytes. Os artefatos separados de daemon e daemon/transcript totalizam 222.335 bytes, enquanto um artefato que importa ambos mede 222.722 bytes. Os 387 bytes adicionais são sobrecarga de wrapper de módulos combinados, então os chamadores devem tratar o subcaminho de transcript como um custo opt-in explícito. Baselines de desempenho síncrono e orientações para Web Worker estão documentadas no README do SDK.

Chamadores Web usam um subcaminho opt-in separado do SDK:

    import {
      projectChatRecordsToDaemonTranscript,
      type ChatRecordTranscriptProjection,
    } from "@qwen-code/sdk/daemon/transcript";

    const projection = projectChatRecordsToDaemonTranscript(records);
    const { blocks, diagnostics, complete, truncated } = projection;

Esta função síncrona não inicia o daemon, Express ou um processo filho ACP; não acessa o sistema de arquivos, rede, DOM ou armazenamento do browser; e não parseia texto JSONL. Ela aceita registros append-only brutos após `JSON.parse` e internamente executa:

    validação em runtime
      -> seleção de folha ativa
      -> reconstrução da cadeia parentUuid
      -> agregação de fragmentos com mesmo UUID
      -> replay de transcript persistido
      -> normalização de SessionUpdate
      -> projeção de DaemonTranscriptBlock

A implementação compartilhada é dividida em três módulos profundos com propriedade explícita:

    packages/core/src/utils/transcript-records.ts
      -> export de pacote @qwen-code/qwen-code-core/transcriptRecords
      -> preparação de registros segura para browser
      -> cadeia ativa, agregação, lacunas, diagnósticos

    packages/acp-bridge/src/transcript-replay.ts
      -> máquina de replay segura para browser
      -> builders puros compartilhados de SessionUpdate

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
      -> adapter do SDK
      -> normalizer/reducer/finalize
      -> interface pública de projeção

O `HistoryReplayer` da CLI e os emissores live `MessageEmitter`, `ToolCallEmitter` e `PlanEmitter` todos reutilizam os builders puros de update do acp-bridge. Isso impede que a divergência simplesmente se mova de "CLI versus Web" para "live versus replay": interpretação de registros e construção de updates têm cada uma uma única implementação.

O adapter do SDK envolve os mesmos valores `SessionUpdate` como valores `DaemonEvent` sem ID, reutiliza o `normalizeDaemonEvent` e o reducer de transcript existentes e, por fim, retorna `blocks`, `diagnostics`, `complete` e `truncated`.

## Contexto

O cenário alvo é a renderização somente leitura no WebShell de JSONL persistido gerado por `qwen -p`, por exemplo:

    /root/.qwen/projects/-root--qwen-workspace/chats/<session-id>.jsonl

O browser já obteve o conteúdo do arquivo através de um host, seletor de arquivo ou outro caminho de leitura confiável, e é responsável por parsear o texto JSONL em registros desconhecidos. O caminho completo depois disso é:

    registros append-only parseados
      -> preparação de registros compartilhada
      -> replay de transcript compartilhado
      -> projeção de DaemonTranscriptBlock
      -> WebShellTranscript

Chamadores não precisam entender a árvore `parentUuid`, o ramo ativo após rewind, fragmentos append com o mesmo UUID, registros de artefato de sessão ou lacunas de histórico. Deixar essas semânticas de persistência para os chamadores criaria um módulo raso: a interface pareceria uma única função, mas usá-la corretamente exigiria que os chamadores reimplementassem o conhecimento de `SessionService`.

Este design não usa `compactedReplay`. Essa é a janela de recuperação em memória limitada mantida pelo daemon para sessões ao vivo; este utilitário processa registros persistidos explicitamente fornecidos pelo chamador. A projeção offline não tem limite de contagem de blocos por padrão, mas retém o limite de segurança para um bloco de texto individual e reporta explicitamente todo processamento com perdas através de `diagnostics` e `truncated`.

## Baseline Existente: Como o `/load` do Daemon Faz Replay de JSONL

O `/load` atual em modo de resposta não passa JSONL diretamente ao SDK. O caminho completo é:

    SessionService.loadSession
      -> parse de JSONL
      -> última folha não-artefato
      -> buildOrderedUuidChain
      -> aggregateRecords de mesmo UUID
      -> ResumedSessionData.conversation.messages

    QwenAgent.loadSession
      -> collectHistoryReplayUpdates
      -> HistoryReplayer
      -> MessageEmitter / ToolCallEmitter / PlanEmitter
      -> SessionUpdate[] em LOAD_REPLAY_META_KEY

    acp-bridge restoreSession
      -> extractLoadReplayResponse
      -> BridgeClient.seedSessionUpdates
      -> prepareSessionUpdateFrames
      -> EventBus.seedReplayEvents
      -> compactedReplay + liveJournal

    DaemonSessionClient.load
      -> replaySnapshot
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> DaemonTranscriptState.blocks

A primeira metade do `/load` em modo de stream ainda é produzida pelo `HistoryReplayer`; os updates entram no `EventBus` de restauração pendente como notificações ACP em vez de serem incluídos na resposta de load. Ambos os modos passam, por fim, pela mesma preparação de frame da bridge, normalizer e reducer.

A implementação atual tem três ramificações que devem convergir:

- `SessionService` e `SessionTranscriptReader` têm cada um sua própria implementação de `aggregateRecords`.
- `SessionService` escolhe o último registro não-artefato como folha, enquanto `SessionTranscriptReader` atualmente escolhe o último registro estruturalmente válido. Suas semânticas diferem quando um artefato está por acaso no fim do arquivo.
- O replay de JSONL depende de classes emissoras da CLI, então o browser não pode reutilizá-lo sem trazer `Config` e o runtime do Node.

Este design não cria um atalho separado de JSONL para blocos. Em vez disso, ele extrai a preparação de registros segura para browser e a construção de `SessionUpdate` do caminho acima, e então continua usando a cauda de normalização/redução existente do daemon.

## Objetivos

- Fornecer uma função síncrona, em memória e segura para browser que projeta registros brutos parseados para um transcript.
- Consolidar seleção de cadeia ativa, agregação de mesmo UUID e lacunas de histórico em um único módulo de preparação de registros.
- Fazer o replay da CLI, o load do daemon e a projeção offline Web compartilharem regras de interpretação de registros e construção de `SessionUpdate`.
- Fazer emissores live e a máquina de replay compartilharem builders puros de update para preservar localidade live/replay.
- Preservar timestamps, identidade de registros de origem, ordenação de partes, correlação de início/resultado de ferramentas, estado de paginação e limpeza de pendências no EOF.
- Produzir uma projeção determinística para entrada idêntica, usando fallbacks determinísticos para campos que não dependem do `Config` atual.
- Tratar JSON persistido como entrada não confiável e distinguir erros do chamador, corrupção recuperável e valores desconhecidos com compatibilidade futura.
- Emitir diagnósticos estruturados para cada pulo, ambiguidade e truncatura; nunca apresentar uma projeção parcial como completa.

## Não objetivos

- Ler arquivos ou parsear texto JSONL.
- Simular `EventBus`, cursores SSE, `Last-Event-ID` ou `compactedReplay`.
- Inferir a partir de registros blocos apenas-live não persistidos, como permission, shell, user_shell ou cancelamento.
- Trazer o leitor somente-Node do core, tipos de provider ou o runtime completo para o bundle do browser.
- Garantir recuperação não ambígua de chamadas de ferramenta concorrentes com o mesmo nome quando um ID de chamada persistido está ausente.
- Retornar o armazenamento de artefatos de sessão; artefatos permanecem um canal lateral separado.
- Mover toda a hierarquia de classes emissoras da CLI para uma folha compartilhada; apenas builders puros de update são compartilhados.

## Arquitetura

### 1. Módulo de Preparação de Registros

A preparação de registros pertence ao modelo de sessões persistidas do core. Adicionar uma folha segura para browser:

    packages/core/src/utils/transcript-records.ts
      -> @qwen-code/qwen-code-core/transcriptRecords

Este módulo:

- realiza validação em runtime sobre registros desconhecidos;
- seleciona um `leafUuid` explícito ou, por padrão, o último registro de conversa válido não-artefato;
- percorre da folha até a raiz através de `parentUuid`;
- para em um pai ausente sem juntar uma ilha anterior e produz um `HistoryGap`;
- agrega fragmentos com o mesmo UUID na ordem da cadeia ativa;
- usa as regras de mesclagem de campos atualmente usadas por `SessionService`;
- identifica ciclos, valores `parentUuid` conflitantes, registros corrompidos e registros de artefato pulados; e
- retorna novos registros de nível superior e arrays de partes sem modificar a entrada. Payloads aninhados validados são reutilizados como valores readonly em vez de serem clonados profundamente sem benefício.

Arrays completos e índices de streaming são lidos de forma diferente, então eles compartilham as mesmas primitivas semânticas em vez de forçar o `SessionTranscriptReader` a carregar o arquivo inteiro em memória:

    validateTranscriptRecord
    isTranscriptConversationRecord
    selectTranscriptLeaf
    walkTranscriptUuidChain(lookup)
    aggregateTranscriptRecordFragments

`prepareTranscriptRecords` compõe essas primitivas para arrays brutos. `SessionService` usa a função composta diretamente. `SessionTranscriptReader` retém seu índice por offset de bytes e leituras paginadas, mas usa o mesmo classificador, caminhador de cadeia baseado em lookup e agregador. O `buildOrderedUuidChain` existente é incorporado nesta implementação e não deve permanecer como um segundo caminhamento.

Isso remove as duas implementações de `aggregateRecords` e também corrige a divergência semântica do leitor quando um artefato é o último registro, sem sacrificar seu índice de streaming ou leituras paginadas.

Esta folha pode importar apenas tipos seguros para browser e funções puras. Ela não deve importar `fs`, `path`, `Buffer`, a classe `ChatRecordingService` ou código de runtime de provider.

O core atualmente não tem um exports map. A implementação deve preservar explicitamente exports para a raiz, `transcriptRecords`, `package.json` e os imports profundos existentes `./dist/*`. Adicionar uma folha de browser não deve acidentalmente fechar os caminhos `@qwen-code/qwen-code-core/dist/...` registrados como compatíveis pelo repositório.

### 2. Módulo de Replay de Transcript

As semânticas de `SessionUpdate` pertencem ao ACP, então a máquina de replay e os builders puros de update vivem em:

    packages/acp-bridge/src/transcript-replay.ts
      -> @qwen-code/acp-bridge/transcriptReplay

Este módulo esconde:

- despacho de tipo/subtipo de registro;
- ordenação de partes de mensagem;
- conversão de texto, thought, imagem e function-call;
- estado de início/resultado/pendência de ferramentas;
- Todo/plan, diff/content, usage e proveniência;
- resultados de notificação, cron, mensagem de meio de turno e slash command;
- metadata de registros de origem; e
- estado de replay paginado.

Deletar este módulo redistribuiria a complexidade pelo replay da CLI, emissores live e projeção do SDK, então ele passa no teste de deleção e tem profundidade suficiente.

### 3. Builders de Update Compartilhados

A máquina de replay não duplica as regras existentes de construção de update em `MessageEmitter`, `ToolCallEmitter` e `PlanEmitter`. A folha do acp-bridge fornece builders puros usados apenas por adapters, como:

    createUserMessageUpdate
    createAgentMessageUpdate
    createAgentThoughtUpdate
    createUsageUpdate
    createToolCallStartUpdate
    createToolCallResultUpdate
    createPlanUpdate

Os builders aceitam apenas parâmetros estruturados e retornam `SessionUpdate`. Eles não acessam `Config`, registries, i18n ou rede.

Emissores live da CLI:

    entrada de runtime
      -> adapter de metadata da CLI
      -> builder compartilhado
      -> sendUpdate

`HistoryReplayer`:

    ChatRecord preparado
      -> máquina de replay
      -> builder compartilhado
      -> sendUpdate

Projeção offline do SDK:

    ChatRecord preparado
      -> máquina de replay
      -> builder compartilhado
      -> DaemonEvent sem id
      -> normalizer/reducer

Previews de diff, extração de Todo, transformação de conteúdo de ferramentas, ordenação de usage para plan e fallbacks de proveniência devem viver nos builders compartilhados ou em seus helpers privados. Emissores live retêm apenas envio assíncrono e enriquecimento de runtime.

### 4. Adapter de Projeção do SDK

A fachada do SDK vive em uma entrada opt-in separada:

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
    packages/sdk-typescript/src/daemon/transcript.ts
    @qwen-code/sdk/daemon/transcript

Ela reutiliza o normalizer e o reducer de UI do daemon, mas não entra no bundle de browser padrão de `@qwen-code/sdk/daemon`. Chamadores só precisam instalar o SDK e não dependem diretamente de subcaminhos de core ou acp-bridge.

## Costuras de Pacote Seguras para Browser

Adicionar dois exports de folha internos:

    @qwen-code/qwen-code-core/transcriptRecords
    @qwen-code/acp-bridge/transcriptReplay

Restrições:

- Sem imports de built-ins do Node em runtime.
- Sem acesso a `process`, `Buffer`, DOM ou armazenamento.
- Preferir imports somente de tipo para pacotes de provider e ACP.
- A entrada de transcript do SDK embute a implementação no bundle publicado.
- O `.d.ts` publicado do SDK deve embutir os tipos públicos de entrada/projeção e não deve referenciar um subcaminho do acp-bridge que existe apenas como dependência de desenvolvimento.
- Adicionar guards de built-ins do Node para os bundles de transcript do core, acp-bridge e SDK.

## Interface de Preparação de Registros

A fachada pública do SDK aceita `readonly unknown[]`. Após validação interna, a folha do core produz:

    export interface TranscriptRecordInput {
      readonly uuid: string;
      readonly parentUuid: string | null;
      readonly sessionId: string;
      readonly timestamp?: string;
      readonly type: "user" | "assistant" | "tool_result" | "system";
      readonly subtype?: string;
      readonly message?: {
        readonly role?: string;
        readonly parts?: readonly unknown[];
      };
      readonly usageMetadata?: unknown;
      readonly toolCallResult?: unknown;
      readonly systemPayload?: unknown;
    }

    export interface TranscriptReplayGapInput {
      readonly childUuid: string;
      readonly missingParentUuid: string;
    }

    export interface PreparedTranscriptRecords {
      readonly sessionId?: string;
      readonly records: readonly TranscriptRecordInput[];
      readonly gaps: readonly TranscriptReplayGapInput[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
    }

### Política de Validação

Erros fatais do chamador lançam `TranscriptProjectionInputError` diretamente e não retornam resultado parcial:

    export type TranscriptProjectionInputErrorCode =
      | "invalid_records"
      | "invalid_max_blocks"
      | "leaf_not_found"
      | "mixed_session_ids";

    export class TranscriptProjectionInputError extends TypeError {
      readonly code: TranscriptProjectionInputErrorCode;
    }

- `records` não é um array.
- `options.maxBlocks` não é um inteiro positivo seguro.
- Um `leafUuid` explícito não existe.
- Dois ou mais valores `sessionId` estruturalmente válidos e diferentes são misturados em uma projeção.

A entrada do SDK exporta esse erro de forma consistente. O erro de validação interno do core é mapeado na fronteira da fachada para que uma classe de pacote interno não vaze para o `.d.ts` público. Fora desses casos, um registro individual malformado não deve fazer a projeção inteira lançar exceção.

Quando um registro individual ou payload aninhado é malformado, preservar o histórico recuperável onde possível e emitir um diagnóstico:

- Pular não-objetos, registros sem UUID, valores `parentUuid` inválidos e tipos de registro desconhecidos.
- Reter registros com timestamps inválidos, mas omitir `serverTimestamp` para esses registros.
- Para valores `parentUuid` conflitantes entre fragmentos com UUID duplicado, manter o primeiro fragmento e reportar o conflito.
- Parar a cadeia e reportar uma lacuna quando um `parentUuid` está ausente.
- Parar a cadeia e reportar um ciclo quando valores `parentUuid` formam um ciclo.
- Pular uma parte malformada de um tipo reconhecido e marcar a projeção como incompleta.
- Pular subtipos/partes desconhecidos com compatibilidade futura e emitir um aviso em vez de lançar exceção.
- Pular subtipos de sistema reconhecidos que não produzem conteúdo de transcript, como `chat_compression`, `ui_telemetry`, `file_history_snapshot` e registros de artefato, conforme as semânticas existentes, sem afetar `complete`.

Entrada vazia retorna `blocks` vazios com `complete` definido como `true`. Entrada apenas de artefatos igualmente retorna um transcript vazio, com um diagnóstico informativo.

Um `leafUuid` explícito deve apontar para um registro de conversa. Corresponder apenas a um registro de artefato equivale à folha não existir. Registros de artefato não entram na cadeia de UUID nem participam da detecção de conflito de pai duplicado.

### Diagnósticos

    export interface TranscriptProjectionDiagnostic {
      readonly code: string;
      readonly severity: "info" | "warning" | "error";
      readonly message: string;
      readonly affectsCompleteness: boolean;
      readonly recordIndex?: number;
      readonly recordId?: string;
      readonly path?: string;
    }

Mensagens de diagnóstico não devem conter argumentos, resultados, tokens ou credenciais sem redação. Chamadores devem ramificar por `code`; `message` é apenas para log e apresentação padrão.

`projection.complete` significa:

- nenhum diagnóstico tem `affectsCompleteness` definido como `true`;
- nenhuma truncatura de bloco ou texto ocorreu;
- a finalização do replay foi concluída; e
- nenhuma correlação ambígua de ferramenta ocorreu.

A primeira versão estabiliza pelo menos os seguintes códigos de diagnóstico. Códigos são um contrato de compatibilidade; mensagens não são.

| código                          | affectsCompleteness | Significado                                   |
| ------------------------------- | ------------------- | --------------------------------------------- |
| invalid_record                  | true                | Um registro inteiro foi pulado                |
| invalid_timestamp               | false               | Conteúdo foi retido sem horário histórico     |
| conflicting_parent_uuid         | true                | Fragmentos de mesmo UUID têm pais conflitantes |
| history_gap                     | true                | A cadeia ativa está sem um pai                |
| parent_cycle                    | true                | A cadeia ativa contém um ciclo                |
| malformed_part                  | true                | Uma parte reconhecida malformada foi pulada   |
| unknown_record_or_part          | true                | Uma extensão desconhecida pode conter dados visíveis |
| ambiguous_tool_call_correlation | true                | Um resultado de ferramenta não pode ser correlacionado unicamente |
| missing_tool_result             | true                | Uma chamada de ferramenta não tem resultado persistido |
| presentation_fallback           | false               | Adapter de apresentação falhou; fallback usado |
| transcript_blocks_truncated     | true                | `maxBlocks` removeu blocos mais antigos       |
| transcript_text_truncated       | true                | Um bloco de texto excedeu o limite de caracteres |

Entrada apenas de artefatos pode usar um diagnóstico informativo sem afetar `complete`. Adicionar um código posteriormente não deve mudar a semântica de `affectsCompleteness` de um código existente.

## Interface de Emissão de Replay

A camada compartilhada emite valores `SessionUpdate` completos e preserva a proveniência da projeção:

    import type { SessionUpdate } from "@agentclientprotocol/sdk";

    export interface TranscriptReplayEmission {
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
      readonly emissionOrdinal: number;
      readonly update: SessionUpdate;
    }

Uma emissão corresponde à projeção de um registro, então o formato externo retém um `sourceRecordId` singular. Quando gravado no `SessionUpdate`, ele se torna um array `sourceRecordIds` de elemento único para mesclagem segura por operações subsequentes de compactação/upsert.

    export interface TranscriptReplayUsageState {
      readonly promptTokens: number;
      readonly cachedTokens: number;
      readonly candidateTokens: number;
      readonly apiTimeMs: number;
    }

    export interface PendingTranscriptToolCall {
      readonly callId: string;
      readonly toolName: string;
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
    }

    export interface TranscriptReplayStateV1 {
      readonly v: 1;
      readonly pendingToolCalls: readonly PendingTranscriptToolCall[];
      readonly cumulativeUsage: TranscriptReplayUsageState;
    }

    export interface TranscriptReplayMachineOptions {
      readonly initialState?: TranscriptReplayStateV1;
      readonly gaps?: readonly TranscriptReplayGapInput[];
      readonly presentation?: TranscriptReplayPresentationAdapter;
      readonly onDiagnostic?: (
        diagnostic: TranscriptProjectionDiagnostic,
      ) => void;
    }

O estado de replay deve ser versionado, e `snapshot` retorna uma cópia desacoplada. Entradas pendentes malformadas em `initialState` são filtradas com um diagnóstico; usage inválido ou não finito é zerado com um diagnóstico. Uma versão de estado desconhecida é rejeitada diretamente para evitar continuar a paginação com estado incorreto.

Para compatibilidade com cursores de transcript emitidos antes do deploy, um estado legado sem `v` é promovido diretamente para v1 quando corresponde estritamente ao formato atual `{ pendingToolCalls, cumulativeUsage }`. Um `v` desconhecido explícito ainda é rejeitado. O ramo legado parseia apenas este único formato publicado e não evolui para um segundo schema de estado.

## Máquina de Replay Incremental

    export interface TranscriptReplayMachine {
      project(
        record: TranscriptRecordInput,
      ): Iterable<TranscriptReplayEmission>;
      finalize(): Iterable<TranscriptReplayEmission>;
      snapshot(): TranscriptReplayStateV1;
    }

    export function createTranscriptReplayMachine(
      options?: TranscriptReplayMachineOptions,
    ): TranscriptReplayMachine;

`project` retorna um iterador preguiçoso. A CLI aguarda imediatamente `sendUpdate` após obter cada emissão e requisita a próxima emissão apenas depois que o envio tem sucesso. Mudanças de estado após o `yield` de um generator, portanto, só são confirmadas depois que o envio anterior tem sucesso.

A interface deve documentar explicitamente estas restrições de iteração:

- Adapters devem iterar completamente cada valor retornado por `project`.
- Depois que uma emissão comum falha no envio, parar o registro atual e todos os registros subsequentes.
- Preservar o timing atual para remoção de um resultado de ferramenta pendente.
- Adicionar um início de ferramenta ao pendente apenas depois que ele é enviado com sucesso.
- Confirmar usage antes que o builder de plan relacionado leia valores cumulativos.
- `finalize` é idempotente; sua segunda chamada retorna um iterador vazio.
- O adapter da CLI para `finalize` deve capturar erros de envio individualmente, continuar tentando a limpeza de pendências restante e reter o primeiro erro de limpeza.
- Continuar usando `AggregateError` quando tanto um erro de replay quanto um erro de limpeza existem.

O adapter do SDK não tem falha de envio assíncrono externo e pode consumir cada iterador completamente.

## Correlação de Chamadas de Ferramenta

Os IDs de chamada seguem esta precedência:

1. Um ID explicitamente persistido em `functionCall.id`, `toolCallResult.callId` ou `functionResponse.id`.
2. Se um início não tem ID explícito, gerar um ID sintético estável com um prefixo reservado que inclui o UUID do registro de origem e o índice da parte.
3. Se um resultado não tem ID explícito, correlacioná-lo apenas quando exatamente uma chamada pendente tem o mesmo nome.
4. Quando nenhuma chamada pendente ou múltiplas chamadas pendentes têm esse nome, não adivinhar. Gerar um ID de resultado sintético independente e emitir um diagnóstico `ambiguous_tool_call_correlation`.
5. Tratar inícios não correlacionados como ferramentas pendentes durante `finalize`.

IDs sintéticos usam o prefixo `qwen-replay-tool:`. A máquina os verifica quanto a colisões com IDs explícitos e IDs sintéticos anteriores, anexando um sufixo de ocorrência estável em caso de colisão.

Um fallback estável garante apenas identidade determinística; não pode garantir correlação correta quando a informação está ausente.

## Proveniência de Registros de Origem

A identidade do registro deve viajar através da CLI, do daemon e do SDK, em vez de existir apenas na emissão externa. Um bloco de texto normalmente vem de um registro, enquanto um bloco de ferramenta absorve tanto registros de início quanto de resultado, então eventos de wire e blocos usam um array ordenado e deduplicado. Builders de replay adicionam isto ao `SessionUpdate._meta`:

    {
      qwenTranscript: {
        sourceRecordIds: ["..."]
      },
      timestamp: 1783958400000
    }

Restrições:

- `sourceRecordIds` não são IDs de `EventBus` e não devem ser gravados em `event.id` nem participar de `Last-Event-ID`.
- Converter `sourceTimestamp` para um valor de época finito em milissegundos na costura do adapter e continuar reutilizando o campo `timestamp` existente.
- Uma emissão de lacuna de histórico usa `[gap.childUuid]` e o timestamp do registro filho.
- Emissores live sem contexto de registro persistido não gravam `qwenTranscript`.
- O normalizer promove `sourceRecordIds` de `qwenTranscript` e então remove o objeto de transporte interno do metadata de apresentação.
- Adicionar `sourceRecordIds` readonly opcional a `DaemonUiEventBase` e `DaemonTranscriptBlockBase`.
- O reducer mescla texto/thought/imagem apenas quando `sourceRecordIds` são iguais e todas as outras condições de mesclagem são satisfeitas.
- Blocos de ferramenta continuam fazendo upsert por `toolCallId` e unindo `sourceRecordIds` na ordem dos eventos. Blocos de plan e outros upsert usam a mesma regra de união estável.
- A chave de slot de texto do engine de compactação também inclui `sourceRecordIds`, impedindo mesclagens através de fronteiras de registro.
- Quando o engine de compactação mescla o mesmo `toolCallId`, ele deve unir estavelmente `qwenTranscript.sourceRecordIds`; o metadata de resultado não deve sobrescrever a proveniência de início.
- Comparar e indexar `sourceRecordIds` usando igualdade estruturada e `Map`, não um join com delimitador sem escape que permita a um UUID malicioso causar colisões de chave.
- Eventos live sem `qwenTranscript` retêm o comportamento atual de compactação.

Isso preserva segmentação de registros idêntica para ambos os modos de `/load` do daemon e projeção offline, de modo que testes de conformidade não precisam de um contexto `activeRecordId` apenas para testes.

## Costura de Adapter para Dados Mutáveis de Apresentação

    export interface TranscriptReplayPresentationAdapter {
      resolveToolMetadata(
        toolName: string,
        args: Readonly<Record<string, unknown>>,
      ): TranscriptReplayToolMetadata;

      formatHistoryGap(gap: TranscriptReplayGapInput): string;
    }

- O adapter da CLI usa o `Config`/registry de ferramentas atual para resolver título, tipo e localizações, e usa o i18n da CLI para formatar lacunas de histórico.
- O adapter de browser usa fallbacks determinísticos: o título é o nome da ferramenta mais um argumento de descrição persistido, o tipo é `other`, localizações são vazias e lacunas de histórico usam texto fixo do SDK.

Se o adapter lançar exceção, a máquina de replay usa um fallback determinístico e emite um diagnóstico em vez de permitir que o enriquecimento de apresentação encerre o transcript inteiro.

Proveniência, Todo/diff/content, usage e correlação de chamadas não pertencem a esta costura e devem ser decididos pela implementação compartilhada.

## Adapter de CLI

`HistoryReplayer` retém sua interface de chamada existente, mas é reduzido a um adapter assíncrono:

    registros preparados
      -> semear estado de replay
      -> machine.project(record)
      -> await sendUpdate(emission.update) em ordem
      -> machine.finalize() quando solicitado
      -> copiar machine.snapshot()
      -> limpar contexto de replay ativo

O seguinte comportamento permanece na CLI:

- Enriquecimento de `Config`/registry de ferramentas;
- Texto de lacuna de histórico da CLI localizado;
- `messageRewriter.interceptUpdate`;
- Tratamento de falha assíncrona de `sendUpdate`;
- Combinar erros de replay e erros de limpeza de pendências em um `AggregateError`; e
- Goals apenas-live, stop hooks e outros eventos não persistidos.

Caminhos de load, transcript paginado e export devem usar a mesma preparação de registros e máquina de replay para que o mesmo JSONL não produza valores `SessionUpdate` diferentes através de pontos de entrada diferentes.

## Interface de Transcript do SDK

    export interface ChatRecordTranscriptOptions {
      readonly leafUuid?: string;
      readonly maxBlocks?: number;
    }

    export interface ChatRecordTranscriptProjection {
      readonly blocks: readonly DaemonTranscriptBlock[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
      readonly complete: boolean;
      readonly truncated: boolean;
    }

    export function projectChatRecordsToDaemonTranscript(
      records: readonly unknown[],
      options?: ChatRecordTranscriptOptions,
    ): ChatRecordTranscriptProjection;

Quando `options.maxBlocks` é omitido, a projeção offline não apara a contagem de blocos. Um valor explícito deve ser um inteiro positivo seguro. Quando o aparo ocorre:

- `truncated` é `true`;
- `complete` é `false`;
- `diagnostics` inclui `transcript_blocks_truncated`; e
- índices de ferramenta, permissão e pai continuam a seguir as regras de limpeza segura do reducer.

O adapter offline passa explicitamente `Number.MAX_SAFE_INTEGER` como padrão. Ele não muda `DEFAULT_MAX_BLOCKS` para `createDaemonTranscriptState` online nem coloca `Infinity` no estado do reducer.

O caminho de eventos do adapter do SDK é:

    TranscriptReplayEmission
      -> DaemonEvent sem ID (type = session_update)
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> finalizeOfflineDaemonTranscriptState
      -> ChatRecordTranscriptProjection

Eventos não têm ID porque não vêm do `EventBus`. `sourceTimestamp` se torna `serverTimestamp`, e `sourceRecordIds` permanece proveniência de projeção separada.

O adapter offline usa um relógio fixo de reducer de `0`, impedindo que `Date.now` entre em campos observáveis. A mesma entrada, opções e adapter de apresentação devem produzir uma projeção profundamente igual; `serverTimestamp` representa o horário histórico real.

O novo `finalizeOfflineDaemonTranscriptState` privado realiza apenas limpeza de projeção offline e não é exportado da entrada padrão do daemon:

- definir `streaming` de blocos ativos de assistant/thought como `false`;
- limpar ponteiros de texto ativos;
- não fabricar um evento de wire ou bloco visível; e
- não modificar status de ferramentas finalizados.

Um bloco de texto individual continua a usar o limite de caracteres de segurança do SDK. Quando a truncatura por caracteres ocorre, o hook de diagnóstico do reducer deve reportar `transcript_text_truncated` e definir `truncated=true` e `complete=false`; não deve depender apenas de um sufixo `[truncated]` visível.

Para tornar a truncatura de bloco/texto observável, adicionar um `onTruncation(detail)` opcional a `DaemonTranscriptReducerOptions`. O detalhe inclui pelo menos o tipo, o ID do bloco e `sourceRecordIds` quando presente. Stores comuns não passam este callback; o adapter offline coleta e deduplica detalhes em diagnósticos de projeção. Não inferir truncatura escaneando por `[truncated]`, porque texto do usuário pode conter o mesmo sufixo.

## Segurança de Identificadores Não Confiáveis

UUIDs, IDs de chamada e IDs de pai na entrada offline são strings não confiáveis. Antes da integração, mudar estes índices do transcript reducer para `Map` ou objetos de protótipo nulo:

- `blockIndexById`;
- `toolBlockByCallId`;
- `permissionBlockByRequestId`;
- `activeAssistantBlockByParent`;
- `activeThoughtBlockByParent`; e
- mapas de notificação aparados.

Testes devem cobrir `__proto__`, `constructor`, `prototype`, `toString` e IDs excessivamente longos para garantir que eles não possam quebrar lookup, relações pai-filho ou limpeza de aparo.

## Artefatos

O builder de resultado de ferramenta pode continuar colocando artefatos persistidos no metadata de `SessionUpdate` para uso pelo canal lateral de artefatos da bridge do daemon. `DaemonTranscriptBlock` não tem campo de artefato, no entanto, e a projeção offline do SDK não retorna um armazenamento de artefatos.

A conformidade é, portanto, dividida em duas camadas:

- A conformidade de `SessionUpdate` inclui artefatos.
- A conformidade de `DaemonTranscriptBlock` explicitamente ignora o canal lateral de artefatos.

Se `WebShellTranscript` precisar de cards de artefato no futuro, adicionar uma projeção de artefato separada em vez de contrabandear artefatos para dentro de blocos de transcript.

## Contrato de Consistência

### Comportamento Fortemente Consistente

O replay da CLI e a projeção offline do SDK compartilham a máquina, então o seguinte deve corresponder:

- cadeia ativa e agregação de mesmo UUID;
- filtragem de registro/subtipo e ordem de updates;
- formatos suportados de texto/thought/imagem de mensagem e ordenação de partes;
- IDs de chamadas de ferramenta e estado de início/resultado/pendência;
- Todo/plan, diff/content e entrada/saída brutas;
- uso, uso de execução de tarefa e ordem de estatísticas de plan;
- posições de inserção de notificação, cron, mensagem de meio de turno, slash command e lacuna; e
- timestamps, `sourceRecordIds` e diagnósticos de replay.

Emissores live e a máquina de replay compartilham builders de update, então campos no `SessionUpdate` gerados para o mesmo evento semântico devem corresponder.

### Diferenças de Adapter Explicitamente Permitidas

- Título, tipo e localizações de ferramenta computados a partir do `Config`/registry de ferramentas atual da CLI.
- Texto de lacuna de histórico no locale atual da CLI.
- Mensagens derivadas adicionadas pela reescrita de mensagem da CLI.
- O canal lateral de artefatos.
- Eventos de permissão, shell, cancelamento e sessão apenas-live.

Se o produto exigir metadata de ferramenta idêntico campo a campo, o metadata de replay deve ser persistido quando a chamada de ferramenta é registrada e seguir "valor persistido primeiro, fallback determinístico". A verdade histórica não deve ser recomputada do registry atual.

## Testes de Conformidade

Testes têm seis camadas:

1. Testes golden de preparação de registros do core: fixtures append-only brutos para cadeia ativa, agregação, lacunas e diagnósticos.
2. Testes de builders do acp-bridge: entradas live/replay assertem valores `SessionUpdate` completos.
3. Testes de máquina de replay/compactação: ordem, estado versionado, paginação, IDs sintéticos, correlação ambígua, finalização e retenção de `sourceRecordIds` durante compactação de texto/ferramenta.
4. Testes de regressão do adapter de CLI: envio assíncrono, reescrita de mensagem, falha parcial, limpeza de pendências e `AggregateError`.
5. Testes de projeção do SDK: eventos sem ID, `sourceRecordIds`, normalização, segmentação de registros, truncatura, identificadores maliciosos e blocos determinísticos.
6. Conformidade entre pacotes: o mesmo fixture bruto passa pelo replay real da CLI e pela projeção offline do SDK.

Caminhos entre pacotes:

    registros brutos
      -> projectChatRecordsToDaemonTranscript do SDK
      -> sdkProjection

    registros brutos
      -> preparação de registros compartilhada
      -> HistoryReplayer da CLI
      -> SessionUpdate capturado com metadata qwenTranscript
      -> normalizer/reducer/finalize do SDK
      -> cliProjection

Realizar igualdade profunda na projeção canônica. O canonizador pode ignorar apenas diferenças de adapter explicitamente permitidas; ele não deve remover `sourceRecordIds`, timestamps, status de ferramenta, diagnósticos ou truncatura.

Também adicionar fixtures de integração do daemon que verificam que o replay retido de `/load` em modo de resposta e modo de stream corresponde à projeção offline quando nenhuma truncatura de janela ocorre. Testes devem cruzar uma fronteira de turno subsequente para cobrir a retenção pela bridge/compactação do metadata `qwenTranscript` e timestamps.

## Integração com WebShellTranscript

    import { useMemo } from "react";
    import {
      projectChatRecordsToDaemonTranscript,
    } from "@qwen-code/sdk/daemon/transcript";
    import { WebShellTranscript } from "@qwen-code/web-shell";

    function ReadonlyHistory({ records }: { records: readonly unknown[] }) {
      const projection = useMemo(
        () => projectChatRecordsToDaemonTranscript(records),
        [records],
      );

      return (
        <>
          {projection.complete ? null : (
            <TranscriptDiagnostics diagnostics={projection.diagnostics} />
          )}
          <WebShellTranscript blocks={projection.blocks} />
        </>
      );
    }

O SDK é dono da preparação de dados e da projeção; o WebShell é dono apenas da renderização somente leitura. `WebShellTranscript` não adiciona uma prop `records` nem inicia um provider, sessão ou conexão de rede.

## Contrato de Desempenho Síncrono

A fachada pública é uma projeção síncrona O(registros + partes) e varre toda a entrada mesmo se um `maxBlocks` explícito no fim retém apenas os blocos finais. `maxBlocks` limita memória de saída, não computação.

Antes da implementação, estabelecer baselines de tempo e pico de memória usando fixtures reais pequenos, médios e grandes, e documentar o limite recomendado de main thread na documentação do SDK. Hosts acima desse limite devem invocar a mesma interface segura para browser em um Web Worker e passar a projeção para a main thread.

A primeira versão não adiciona um wrapper async/worker separado. Reconsiderar esse adapter depois que um segundo chamador real aparecer, evitando uma costura falsa com apenas um adapter.

## Restrições de Bundle e Publicação

O conversor não entra no bundle padrão de `@qwen-code/sdk/daemon`. Adicionar este export de pacote:

    "./daemon/transcript": {
      "types": "./dist/daemon/transcript.d.ts",
      "import": "./dist/daemon/transcript.js",
      "require": "./dist/daemon/transcript.cjs"
    }

Requisitos de build:

- Bundles separados de ESM para browser e CJS para Node.
- Um guard separado de built-ins do Node.
- Um orçamento de tamanho separado com o commit de baseline e o comando de medição registrados.
- Arquivos `.d.ts` públicos não vazam dependências de desenvolvimento de core/acp-bridge.
- Medir código duplicado em um build de amostra que importa tanto `daemon` quanto `daemon/transcript`.
- Não depender de importar a raiz do pacote ou tree shaking incidental para segurança de browser.

O orçamento padrão do daemon de 151 KiB não aumenta para esta feature.

## Ordem de Migração

1. Adicionar a folha segura para browser de preparação de registros de transcript ao core e fazer `SessionService` e `SessionTranscriptReader` compartilharem classificação, seleção de folha, caminhamento de cadeia e agregação.
2. Adicionar builders puros de `SessionUpdate` ao acp-bridge e migrar emissores live para eles gradualmente.
3. Adicionar a máquina de replay e testes golden.
4. Converter `HistoryReplayer` em um adapter de CLI, preservando sua interface de chamada existente e semântica de erro.
5. Adicionar metadata `qwenTranscript` e estender o tratamento de `sourceRecordIds` pela bridge, compactação, normalizer e reducer.
6. Endurecer os índices de identificadores não confiáveis e os diagnósticos de truncatura do reducer.
7. Adicionar a fachada opt-in `daemon/transcript` e artefatos de publicação separados ao SDK.
8. Adicionar conformidade entre pacotes e fixtures de integração do daemon.
9. Conectar a página somente leitura do WebShell a `projection.blocks` e exibir diagnósticos.

Em cada passo, migrar consumidores existentes antes de deletar a implementação antiga para que nenhum estágio tenha dois conjuntos de regras ativos de cadeia ativa, agregação ou builder de update ao mesmo tempo.

## Estimativa de Tamanho de Código

- Preparação de registros do core e migração de dois consumidores existentes: aproximadamente 180–280 linhas de código de produção.
- Builders e máquina de replay do acp-bridge: aproximadamente 400–550 linhas.
- Adapter `HistoryReplayer` da CLI: aproximadamente 60–100 linhas.
- Fachada de projeção do SDK, identidade e cola de diagnósticos: aproximadamente 140–220 linhas.
- Suporte de segurança/truncatura do reducer: aproximadamente 60–120 linhas.
- O resto é principalmente fixtures, testes de regressão e testes de conformidade.

Esta é uma mudança de core entre pacotes. Um mantenedor deve confirmar o escopo sob o gate de triagem de core do repositório antes da implementação. Agregação ou builders de update duplicados não devem ser retidos apenas para reduzir a contagem de linhas.

## Escopo com Perdas

A projeção pode recuperar apenas informações presentes nos registros. O seguinte é explicitamente irrecuperável ou potencialmente com perdas:

- blocos apenas-live como permission, shell, user_shell e prompt_cancelled;
- o armazenamento de artefatos de sessão;
- a verdade histórica para o `Config`/registry/locale atual;
- binary/audio/fileData não suportados;
- aninhamento antigo de sub-agente de sidechain sem `parentToolCallId`;
- correlação exata quando IDs de chamada explícitos estão ausentes e múltiplas ferramentas de mesmo nome estão pendentes;
- conteúdo após o limite de caracteres de segurança de um bloco de texto individual;
- blocos mais antigos removidos por um `maxBlocks` explícito fornecido pelo chamador; e
- conteúdo pulado por causa de entrada corrompida, extensões desconhecidas ou cadeia quebrada.

Todo caso que afeta a completude deve emitir um diagnóstico e definir `complete=false`. Todo aparo real também deve definir `truncated=true`.
