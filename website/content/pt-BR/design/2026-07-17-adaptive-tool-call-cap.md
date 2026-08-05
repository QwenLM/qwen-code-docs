# Limite adaptativo de chamadas de ferramenta por turno

Data: 2026-07-17
Status: Implementado
Área: detecção de loop em `packages/core`

## Problema

O limite de chamadas de ferramenta por turno sempre ativo (`model.maxToolCallsPerTurn`, padrão 100)
é um circuit breaker bruto: ele interrompe o turno na 101ª chamada de ferramenta, independentemente
de o modelo estar realmente travado ou fazendo trabalho produtivo. Turnos grandes de
implementação multi-pacote legitimamente excedem 100 chamadas de ferramenta, então o
limite mata trabalho produtivo — um falso positivo.

Caso concreto: sessão `80db472f-…` (qwen-code-x1, "Web Shell git status/diff
chip"). O turno `继续Phase 2` fez exatamente 100 chamadas de ferramenta e foi interrompido rigidamente
no meio de um `npm run build`, sem nenhum resumo de conclusão. Análise desse turno e dos seus
irmãos:

| turno | chamadas de ferramenta | chaves (ferramenta,args) distintas | repetição máxima de uma chave | sequência máxima de mesmo nome |
| ----- | ---------------------- | ---------------------------------- | ----------------------------- | ------------------------------ |
| 7     | 96                     | 96                                 | 1                             | 7                              |
| 8     | 100                    | 99                                 | 2                             | 3                              |
| 9     | 95                     | 95                                 | 1                             | 7                              |

Turnos produtivos são altamente diversos: nenhuma única chamada `(ferramenta, args)` se repete mais
de duas vezes. Um turno genuinamente travado repete a mesma chamada muitas vezes.

## Design

O comportamento depende se `maxToolCallsPerTurn` foi **configurado explicitamente**
(rastreado por `Config.isMaxToolCallsPerTurnExplicit()`):

- **Valor explícito `N`** → um **limite rígido** (o contrato publicado): o turno
  é interrompido na chamada que excede `N`, sem extensão adaptativa. Isso preserva
  a compatibilidade retroativa — um usuário que definiu o valor para limitar custo não supervisionado
  ainda obtém exatamente esse limite. (A v0.19.10 publicou o limite como limite rígido; uma
  iteração anterior deste PR multiplicava valores explícitos por 3, o que era uma
  mudança com quebra — revertida.)
- **Padrão (não definido, `S = 100`)** → **adaptativo**: distinguir um turno longo
  produtivo de um travado usando um sinal de repetição, e interromper rigidamente apenas o último
  (mais um teto absoluto). Modelos modernos legitimamente fazem centenas de chamadas
  por tarefa, então o padrão não deve interromper rigidamente turnos longos produtivos.

Dois limites para o limite adaptativo (padrão):

- **Limite suave `S`** (100): quando o turno excede `S` chamadas de ferramenta, interromper apenas se um
  sinal de repetição de travamento estiver presente; caso contrário, tratar o turno como produtivo e
  deixá-lo continuar.
- **Limite rígido `S * ADAPTIVE_CAP_HARD_MULTIPLIER`** (multiplicador 10 → 1000):
  teto absoluto. Interromper independentemente da repetição uma vez excedido, para que uma execução
  descontrolada que varia os argumentos em cada chamada (que nenhum sinal de repetição captura) ainda
  seja limitada. O multiplicador é alto o suficiente para que turnos produtivos de centenas de chamadas
  não sejam falsos positivos.

Sinal de repetição de travamento: o número máximo de vezes que qualquer única chave
`(ferramenta, args)` apareceu no turno atinge `GLOBAL_DUPLICATE_THRESHOLD` (6). Isso
reutiliza a semântica existente de duplicado global e tem uma ampla margem de segurança
(turnos produtivos observados ≤ 2).

A sequência de mesmo nome intencionalmente NÃO é usada como sinal de gate: lotes paralelos de
ferramentas (por exemplo, vários `read_file` de arquivos diferentes em uma mensagem de assistente)
legitimamente produzem sequências de mesmo nome de 6–7, muito perto do limiar de
estagnação de ação de 8.

### Rastreamento sempre ativo

O limite é sempre ativo (não gateado por `skipLoopDetection`), mas o mapa
`globalToolCallCounts` existente só é mantido dentro do caminho heurístico gateado.
Para manter o limite sempre ativo independente do caminho gateado, o limite mantém seu
próprio pequeno rastreador sempre ativo:

- `capKeyCounts: Map<string, number>` — contagens por `(ferramenta,args)` neste turno.
- `capMaxKeyRepeat: number` — máximo corrente da contagem de qualquer chave única.

Mantido em `checkAlwaysOnSafeties` para todo `ToolCallRequest`, limpo em
`reset()` e em `Retry` (consistente com a forma como o caminho heurístico limpa
`globalToolCallCounts` no retry).

## Matriz de comportamento

Valor explícito `N` (limite rígido):

| chamadas totais | resultado   |
| --------------- | ----------- |
| `≤ N`           | permitir    |
| `> N`           | interromper (rígido) |

Padrão (não definido), limite suave `S = 100`, limite rígido `H = 1000`:

| chamadas totais | sinal de repetição         | resultado               |
| --------------- | -------------------------- | ----------------------- |
| `≤ S`           | qualquer                   | permitir                |
| `S < total ≤ H` | repetição máxima de chave `< 6` | permitir (produtivo) |
| `S < total ≤ H` | repetição máxima de chave `≥ 6` | interromper (travado) |
| `> H`           | qualquer                   | interromper (teto)      |

Quando `S ≤ 0`, o limite é desabilitado (`getMaxToolCallsPerTurn()` retorna
`Infinity`); o comportamento é inalterado (nunca dispara).

## Arquivos alterados

- `packages/core/src/config/config.ts` — rastrear `maxToolCallsPerTurnExplicit` +
  getter `isMaxToolCallsPerTurnExplicit()`.
- `packages/core/src/services/loopDetectionService.ts` — lógica de limite
  explícito versus padrão + rastreador sempre ativo + chave de chamada de ferramenta canonizada.
- `packages/core/src/services/loopDetectionService.test.ts` — regressão de limite
  rígido explícito + casos adaptativos (padrão).
- `packages/core/src/core/client.test.ts` — teste de orçamento de Stop hook (limite
  rígido explícito).
- `packages/core/src/config/config.test.ts` — rastreamento da flag explícita.
- `packages/cli/src/config/settingsSchema.ts` — descrição de
  `maxToolCallsPerTurn`.
- `docs/users/configuration/settings.md` — idem.

## Não objetivos / acompanhamentos

- Retomar um turno interrompido no lugar (arquiteturalmente inviável: o turno já
  foi retornado quando o diálogo aparece).
- Mudar a UI do diálogo de loop detectado (melhoria separada).
- Uma configuração separada para o limite rígido (derivado do limite suave; aumentar
  `maxToolCallsPerTurn` escala ambos).
- Um sinal de travamento com janela de recência ou ciente de resultado. O sinal atual é um
  máximo monotônico por turno: o mesmo `(ferramenta, args)` repetido 6 vezes em qualquer lugar do
  turno o marca como travado, mesmo que essas repetições sejam legítimas (por exemplo, reexecutar
  o mesmo build/teste após correções sucessivas). Isso nunca é uma regressão — o
  sinal só atua além do limite suave, onde o limite antigo sempre interrompia — mas essa
  classe produtiva não se beneficia. A evidência de "turnos produtivos repetem ≤ 2"
  vem de três turnos de uma sessão; revisar com um sinal de janela se
  a telemetria mostrar esse padrão de falso travamento.
- Diferenciação por telemetria dos dois motivos de interrupção. Travamento por limite suave e
  teto rígido ambos emitem `TURN_TOOL_CALL_CAP`; um booleano/atributo em
  `LoopDetectedEvent` diria qual disparou na prática (útil para validar
  o multiplicador 10×). A mensagem headless já se resguarda para cobrir ambos.
- O caminho ACP/daemon (`recordDaemonToolCalls` em
  `packages/cli/src/acp-integration/session/Session.ts`) tem seu próprio limite bruto
  por turno que não usa `LoopDetectionService`. Ele sempre trata o
  valor como limite rígido, independentemente da repetição. Alinhá-lo com o padrão
  adaptativo é
  um acompanhamento separado (ele rastreia chamadas de ferramenta em lotes e precisaria do seu próprio
  rastreamento de repetição por `(ferramenta,args)`). O caminho da TUI interativa que produziu
  o falso positivo reportado é corrigido aqui.
