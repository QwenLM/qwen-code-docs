# Janela de Replay de Snapshot Limitada

## Problema

Sessões de daemon ao vivo atualmente retêm histórico de replay em memória para que `POST /session/:id/load` possa injetar replay para clientes que se conectam depois que a sessão já existe. Essa retenção de replay deve ser limitada independentemente do anel SSE: a restauração em modo de resposta pode semear grandes atualizações históricas em lote, e turnos ao vivo concluídos podem se acumular indefinidamente em sessões de longa duração.

O histórico de sessão em disco permanece como a fonte autoritativa da transcrição completa. O PR-1 apenas limita a janela de replay em memória ao vivo do daemon; ele não adiciona um endpoint de transcrição completa.

## Objetivos

- Limitar os eventos de replay retidos por bytes serializados por sessão ao vivo, com padrão de 4 MiB e rejeitando configuração inválida na inicialização.
- Aplicar o limite tanto aos segmentos de replay de turnos ao vivo concluídos quanto ao replay histórico restaurado em modo de resposta ou modo de stream.
- Preservar o formato de wire existente do snapshot: `compactedReplay`, `liveJournal` e `lastEventId`.
- Manter pelo menos um evento de replay real ou um segmento de turno ao vivo concluído mesmo quando essa unidade única exceder o limite.
- Expor a truncatura com um marcador `history_truncated` sem id no início de `compactedReplay`.
- Tratar `history_truncated` apenas como status. Ele não deve disparar `state_resync_required`, loops de recarga ou persistência de volta na janela de replay.

## Não Objetivos

- ~~Sem limite para um único turno ao vivo em andamento no PR-1; `liveJournal` continua a reter o turno ativo até uma fronteira.~~ Adicionado pelo DAEMON-009 (PR #7622): `liveJournal` agora é limitado por `maxJournalEvents` (padrão 10 000) e `maxJournalBytes` (padrão 8 MiB), configuráveis via `--max-journal-events` / `--max-journal-bytes`.
- Sem limite por contagem de turnos. Contagens de turnos são apenas diagnósticas quando o engine consegue contar exatamente segmentos de turnos concluídos descartados.
- Sem tag de feature em `/capabilities` para este evento aditivo. O limite resolvido é exposto no status do daemon.
- Sem endpoint de transcrição completa. O PR-2 deve projetar leituras de transcrição paginadas ou em streaming e não deve expor uma resposta de array completo em uma única chamada.

## Design

O `TurnBoundaryCompactionEngine` armazena o replay retido como segmentos ordenados em vez de um array plano ilimitado. Um turno ao vivo concluído é um segmento. O replay de restauração/semeadura em lote é armazenado como segmentos em nível de evento, de modo que os eventos de restauração mais antigos possam ser descartados independentemente quando o limite de bytes for excedido.

O dimensionamento reutiliza a semântica de dimensionamento de JSON seguro do EventBus. Falhas de dimensionamento registram diagnóstico e contam esse evento como zero bytes, para que os caminhos de publicação e semeadura mantenham seu contrato de nunca lançar exceção.

Quando `replayBytes > maxReplayBytes`, o engine descarta os segmentos mais antigos enquanto mais de um segmento permanecer. Ele incrementa `truncatedEvents` e incrementa `truncatedTurns` apenas para segmentos de turnos ao vivo descartados. `snapshot()` achata os segmentos retidos e antepõe:

```json
{
  "type": "history_truncated",
  "data": {
    "reason": "replay_window_exceeded",
    "truncatedEvents": 12,
    "retainedEvents": 8,
    "maxBytes": 4194304,
    "truncatedTurns": 3,
    "fullTranscriptAvailable": true
  }
}
```

O marcador é sintético e sem id. Ele é excluído da contabilização de bytes e da retenção transitória de replay. `ingest()`, `seed(snapshot)` e `seedReplayEvents()` todos o filtram, de modo que carregar um snapshot limitado não pode acumular marcadores.

`EventBus.seedReplayEvents()` atribui ids e timestamps aos eventos de replay de restauração, chama o método dedicado de semeadura do engine de compactação e limpa o anel SSE como antes. Isso impede que o replay de restauração em lote seja anexado ao `liveJournal`.

O wiring da CLI passa um único limite resolvido através do yargs, do parser de fast-path, de `ServeOptions`, do wiring do servidor, de `BridgeOptions`, do status da bridge e da renderização do status do daemon. Valores inválidos (`0`, negativos, não inteiros, `NaN`, `Infinity` ou valores acima de 256 MiB) falham de forma fail closed.

O SDK e a WebUI conhecem `history_truncated`, validam seu payload, projetam-no em contadores de estado de visão e status de transcrição e renderizam uma linha de status terminal. O evento não é um evento desconhecido/de debug e não faz parte do gating de resincronização.

## Notas de Auditoria

Rodada 1: Um limite apenas em turnos ao vivo concluídos é insuficiente porque a restauração em modo de resposta pode semear grandes replays históricos sem fronteiras ao vivo. O design, portanto, adiciona `seedReplayEvents()` e segmentos históricos em nível de evento.

Rodada 2: Reutilizar `state_resync_required` para truncatura criaria loops de recarga porque `/load` continuaria retornando a mesma janela limitada. O design usa um marcador de status separado que nunca define `awaitingResync`.

Rodada 3: Um limite por contagem de turnos não limita a memória quando um turno contém saída de ferramenta grande. O PR-1 usa aplicação apenas por bytes e deixa o limite de turno ativo fora do escopo.

Rodada 4: Retornar a transcrição completa como um array recriaria o mesmo problema de pico de memória no momento da requisição. O PR-2 é explicitamente restrito a paginação ou streaming.

Rodada 5: Replay vazio após truncatura faria os clientes perderem todo o estado visível. O engine preserva o segmento mais novo mesmo quando acima do tamanho.

## Plano de Verificação

- Testar unitariamente o aparar de turnos ao vivo, o aparar de semeadura de restauração, posicionamento de marcador, filtragem de marcador transitório, retenção do mais recente acima do tamanho, falha de dimensionamento seguro e comportamento de nunca lançar exceção do EventBus.
- Testar unitariamente a restauração em modo de resposta da bridge e o comportamento de carga de sessão ao vivo com a janela limitada.
- Testar unitariamente o parsing da CLI, o parsing de fast-path, a validação do runQwenServe, o wiring da bridge do servidor e os limites do status do daemon.
- Testar unitariamente a validação de eventos conhecidos do SDK, o estado do reducer, o normalizador de UI, o status de transcrição, a renderização de terminal e a injeção de replay da WebUI.
- Manter a verificação final em `npm run build`, `npm run typecheck` e `npm run lint`.
