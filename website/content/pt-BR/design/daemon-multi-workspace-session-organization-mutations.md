# Mutações de organização de sessão multi-workspace

## Resumo

Adicionar `PATCH /workspaces/:workspace/session/:id/organization` como uma
mutação de organização de sessão qualificada por workspace.

A rota aplica alterações de pin, grupo e cor ao armazenamento de organização
de sessão pertencente ao workspace selecionado. Ela estende a superfície REST
plural existente sem alterar capabilities, esquemas de requisição ou resposta,
ACP ou comportamento de UI.

## Problema

Leituras de sessão qualificadas por workspace já miram o workspace
selecionado. `GET /workspaces/:workspace/sessions` pode retornar sessões
persistidas, arquivadas e ao vivo de um runtime não primário confiável e pode
aplicar visualizações organizadas e filtros de grupo contra o armazenamento de
organização desse runtime.

A única mutação de organização hoje é `PATCH /session/:id/organization`. Essa
rota legada é somente do workspace primário. Consequentemente, um cliente pode
ler o estado de organização de um workspace secundário, mas não pode
atualizá-lo através da superfície REST qualificada por workspace
correspondente.

## Decisão

Registrar `PATCH /workspaces/:workspace/session/:id/organization` ao lado das
outras rotas de armazenamento de sessão qualificadas por workspace.

O seletor `:workspace` resolve exatamente como as rotas plurais existentes:

1. Corresponder a um id exato de workspace registrado.
2. Caso contrário, decodificar e canonicalizar um seletor cwd absoluto.
3. Retornar o erro existente de workspace desconhecido se nenhum resolver.

O runtime selecionado é o escopo completo da operação. Busca de sessão,
validação de grupo, mutação de organização e persistência usam todos o cwd e
os armazenamentos do workspace desse runtime. O handler nunca faz fallback
para o runtime primário nem busca em outro workspace registrado.

## Fluxo de dados

1. A requisição passa pelos middlewares normais de host, bearer e JSON do
   daemon.
2. A rota plural resolve `:workspace` para um runtime registrado.
3. O gate de confiança de mutação plural exige que esse runtime seja
   confiável.
4. O runtime alvo verifica `:id` em seu armazenamento ativo persistido,
   armazenamento arquivado persistido ou bridge ativa.
5. O corpo da requisição passa pela validação existente de requisição de
   organização.
6. Se `groupId` está presente e não é nulo, o armazenamento de grupos do
   runtime alvo valida esse grupo.
7. O armazenamento de organização do runtime alvo aplica `isPinned`, `groupId`
   e `color` com a semântica existente.
8. A rota retorna a mesma resposta de organização que a mutação legada.

Sessões ativas persistidas, sessões arquivadas persistidas e sessões somente
ao vivo correspondentes são alvos válidos. A organização permanece estado
sidecar: a mutação não reescreve o JSONL da transcrição nem altera o tempo de
modificação da transcrição.

## Confiança e ordem de erros

As convenções de rotas plurais determinam a ordem observável:

1. Um seletor de workspace desconhecido retorna a resposta existente
   `400 { code: "workspace_mismatch" }`.
2. Um workspace conhecido mas não confiável retorna
   `403 { code: "untrusted_workspace" }` antes que a existência de sessão ou
   grupo seja divulgada.
3. Uma sessão ausente dos conjuntos ativo, arquivado e ao vivo do runtime
   selecionado retorna o `404` existente de sessão não encontrada.
4. Campos de atualização de organização inválidos retornam o erro de validação
   de organização existente depois que a sessão alvo confiável foi
   encontrada.
5. Um id de grupo não nulo ausente do armazenamento de grupos do runtime
   selecionado retorna `404 { code: "group_not_found" }`.
6. Um sidecar de organização ilegível retorna
   `500 { code: "session_organization_store_unreadable" }`.

Conflitos de arquivamento e exclusão mantêm os erros existentes do coordenador
de arquivamento.

Não há fallback entre workspaces em nenhum estágio de erro. Uma sessão ou
grupo que existe apenas no workspace primário permanece desconhecido quando um
workspace secundário é selecionado, e vice-versa.

## Compatibilidade legada

`PATCH /session/:id/organization` retém seu comportamento atual somente
primário, incluindo seu gate de mutação, validação, busca, persistência,
formatos de erro e esquema de resposta. Clientes existentes, portanto, mantêm
o mesmo roteamento e comportamento de id duplicado.

Clientes usam a mutação plural apenas depois que tanto
`session_organization` quanto `workspace_qualified_rest_core` são anunciadas.
Nenhuma nova tag de capability é introduzida.

## Comportamento do ACP

O despacho do ACP não muda. O dispatcher qualificado já opera em `rt.bridge` e
`rt.workspaceCwd`, então ações de sessão ACP qualificadas por workspace já
estão vinculadas ao runtime selecionado. Esta alteração se limita à mutação de
organização REST que estava faltando na superfície plural.

## Concorrência e locks de armazenamento

`SessionOrganizationService` usa seu lock por sidecar existente apenas para
serializar operações de leitura-modificação-escrita de organização de grupo e
sessão contra esse mesmo sidecar. O coordenador de arquivamento existente
coordena atualizações de organização com transições de arquivamento e
exclusão. Esta rota não adiciona nenhum lock de todo o daemon nem nenhuma nova
transação entre serviços ou garantia de atomicidade.

## Testes e aceitação

Os testes automatizados e a estratégia de aceitação E2E real juntos cobrem:

- Seletores de id de workspace e cwd canônico codificado para URL alcançam o
  mesmo runtime.
- Um workspace secundário confiável pode alterar a organização para sessões
  ativas persistidas, arquivadas persistidas e somente ao vivo.
- Fixação, agrupamento, desagrupamento e atualizações de cor suportadas ou
  `null` retornam o formato de resposta existente.
- Listas organizadas e filtros de fixados/grupo refletem a mutação.
- O estado de organização sobrevive ao reinício do daemon para sessões
  persistidas.
- Uma mutação secundária não modifica o estado de organização do workspace
  primário.
- A rota legada permanece somente primária e retorna `404` para uma sessão que
  existe apenas em um workspace secundário.
- Workspaces conhecidos não confiáveis retornam `403` antes da busca de sessão
  ou grupo.
- Seletores desconhecidos, sessões desconhecidas com escopo do alvo e grupos
  desconhecidos com escopo do alvo retornam seus erros existentes sem fallback
  entre workspaces.

A aceitação também inclui build, typecheck, testes focados de rota e SDK e uma
passagem E2E cobrindo dois workspaces confiáveis mais casos negativos de
confiança e de seletor.

## Não objetivos explícitos

Esta alteração não introduz nenhuma tag de capability nem alteração de payload
de capability, nenhuma alteração de esquema de requisição ou resposta, nenhuma
alteração de comportamento do ACP e nenhuma alteração de UI. Ela não torna a
rota legada ciente de multi-workspace, não adiciona descoberta de sessão entre
workspaces nem altera semânticas de arquivamento, listagem, grupo ou
transcrição.
