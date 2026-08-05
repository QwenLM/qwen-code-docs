# Deep health global do daemon

## Problema

`GET /health?deep=1` foi introduzido quando um daemon possuía um runtime de
workspace único. A rota ainda estava conectada à ponte primária após o suporte
multi-workspace chegar, então seus contadores podiam reportar o daemon como
ocioso enquanto um workspace secundário tinha sessões, prompts ou permissões
pendentes.

O endpoint raso é intencionalmente diferente: `GET /health` apenas prova que o
listener consegue responder. Ele deve permanecer barato e não deve acessar o
estado do runtime.

## Decisão

O deep health é um snapshot informacional de todo o daemon. Ele agrega todos
os runtimes retornados por `WorkspaceRegistry.listManaged()`, incluindo
workspaces que estão sendo drenados mas não concluíram a limpeza da ponte.

| Campo                | Agregação                                                            |
| -------------------- | -------------------------------------------------------------------- |
| `workspaceCount`     | Número de runtimes gerenciados no snapshot                            |
| `sessions`           | Soma                                                                  |
| `pendingPermissions` | Soma                                                                  |
| `activePrompts`      | Soma                                                                  |
| `connectedClients`   | Contagem existente de SSE REST de todo o daemon                       |
| `channelAlive`       | Verdadeiro quando qualquer canal de runtime gerenciado está ao vivo   |
| `lastActivityAt`     | Tempo mais recente não nulo de atividade da ponte                     |
| `idleSinceMs`        | Um snapshot `Date.now()` menos o tempo mais recente de atividade      |
| `rateLimitHits`      | Contagens opcionais existentes de rate-limit de todo o daemon         |

A rota lê os getters obrigatórios de cada runtime antes de combinar os valores.
Ela não faz short-circuit nas leituras de canal. Se o registro ou qualquer
getter lançar exceção, toda a sonda profunda falha com
`503 {"status":"degraded","reason":"aggregation_failed"}` em vez de retornar
um snapshot parcial. Falhas de getter identificam o runtime de workspace no
log stderr do daemon sem expor esse identificador na resposta HTTP.

Enquanto o listener de bootstrap está de pé mas o registro de runtimes não
está pronto, uma requisição profunda retorna um corpo degradado com
`reason: "bootstrap"` e `Retry-After: 1`. No modo de inicialização
health-first, completar essa resposta ainda dispara a inicialização do
runtime. A resposta rasa de bootstrap permanece `200 {"status":"ok"}`.

## Compatibilidade e limites

- `deep=1`, `deep=true` e `deep` simples habilitam o snapshot; todos os outros
  valores usam health raso.
- Respostas profundas de workspace único retêm seus valores existentes e
  adicionam `workspaceCount: 1`.
- Autenticação, allowlist de Host, CORS e comportamento de rate-limit não
  mudam.
- A resposta não expõe IDs de workspace, caminhos, estado de confiança nem
  detalhes por workspace.
- Nenhuma alteração de capability ou SDK é necessária. `workspaceCount`
  permite aos consumidores identificar o contrato global do daemon.

O deep health não é uma verificação de prontidão de todos os workspaces nem um
lease de recuperação atômica. Acessores de contadores não fazem ping em
processos filhos, e `connectedClients` representa apenas SSE REST. Um
reivindicador deve exigir amostras ociosas repetidas e desligamento gracioso;
operadores que precisam de diagnóstico de transporte ou por workspace devem
usar o endpoint autenticado `/daemon/status`.

## Alternativas rejeitadas

- Agregar apenas `WorkspaceRegistry.list()` ocultaria runtimes em drenagem
  antes que sua limpeza de ponte terminasse e poderia reportar ocioso cedo
  demais.
- Reutilizar `/daemon/status` faria o health depender de um snapshot mais
  pesado com um escopo de workspace ativo e contrato de falha diferentes.
- Adicionar um seletor de workspace preservaria um problema de fan-out do lado
  do chamador e não satisfaria a detecção de ociosidade no nível do daemon.
- Definir `channelAlive` como "todos os canais ao vivo" mudaria silenciosamente
  seu significado existente compatível com o daemon-status. Falhas por
  workspace pertencem ao `/daemon/status`.
