# Endpoint agregado `session-info` do workspace

## Problema

`GET /workspace/:id/sessions` é paginado por cursor e não retorna um total.
`GET /daemon/status` expõe apenas o `sessionCount` ao vivo em memória.
Workspaces com muitas sessões persistidas (por exemplo, de tarefas agendadas)
não conseguem saber o tamanho do store local sem paginar todas as sessões.

## Proposta

Adicionar:

```http
GET /workspace/:id/session-info
GET /workspaces/:workspace/session-info
```

Resposta (ilustrativa):

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`live` é omitido para um workspace secundário não confiável porque essas
leituras de catálogo não devem consultar a bridge ao vivo. Se a varredura
atingir seu limite de segurança ou não conseguir classificar um arquivo JSONL
candidato, a resposta inclui `"truncated": true`; as contagens persistidas são
então limites inferiores.

## Modelo de custo

As contagens persistidas reutilizam o padrão existente de varredura de
diretório completo já usado pela busca de título de sessão
(`SessionService.findSessionsByTitle` / `findSessionTitlesByPrefix`):

1. `readdir` no diretório de chats do projeto (e seu gêmeo de arquivamento)
2. filtrar `*.jsonl` com UUID
3. limitar ao mesmo teto de segurança de processamento de arquivos
4. ler apenas o primeiro registro JSONL para pertinência do project-hash

Sem hidratação de título/prompt. Isso é O(n) em disco e **não deve sofrer
polling**. A resposta sempre define `expensive: true` e `cost: "disk_scan"`
para que clientes possam falhar de forma fechada (fail closed) em caminhos
quentes. A documentação destaca isso explicitamente.

A paginação padrão de listagem permanece inalterada e não calcula totais. Não
reutilize `listAllPersistedSummaries` de visões organizadas para contagens —
esse caminho hidrata metadados completos de lista para até 50 mil sessões.

## Capability

`session_info` sempre ativa em `/capabilities`, ao lado de `session_list`.

## Não objetivos

- Contadores em cache / contabilização por hook de mutação (possível
  acompanhamento se os pontos de chamada precisarem de latência menor)
- Enfiar `total` em toda página de listagem
- Totais por grupo organizado ou filtrados por pai na v1
