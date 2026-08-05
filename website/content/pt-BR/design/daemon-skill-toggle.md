# Alternância de Skill do Daemon

## Objetivo

Expor o comportamento de habilitar/desabilitar no workspace do painel `/skills` da
CLI por meio do REST do daemon e do SDK TypeScript, incluindo o refresh imediato
das sessões ACP ativas.

## Contrato público

- `POST /workspace/skills/:name/enable`
- `POST /workspaces/:workspace/skills/:name/enable`
- Corpo da requisição: `{ "enabled": boolean }`
- SDK: `DaemonClient.setWorkspaceSkillEnabled` e
  `WorkspaceDaemonClient.setWorkspaceSkillEnabled`
- Capability: `workspace_skill_toggle`

A resposta contém o nome canônico do skill, o estado solicitado, se a persistência
mudou, o estado de ativação e as contagens de refresh de sessão. `applied`
significa que todas as sessões ativas foram atualizadas, `deferred` significa que
nenhum child ACP estava em execução, e `partial` significa que pelo menos uma
sessão falhou ao atualizar após a persistência ser confirmada.

## Semântica

A API altera `skills.disabled` e `skills.enabled` do workspace conforme
necessário. A busca de skill não diferencia maiúsculas de minúsculas, mas o nome
canônico descoberto é persistido. Habilitar um skill desabilitado por padrão
escreve um opt-in explícito; desabilitá-lo remove o opt-in e escreve uma
desabilitação rígida de workspace. Atualizar um alvo remove duplicatas de alvo e
variantes de maiúsculas/minúsculas sem excluir entradas órfãs de skills
indisponíveis. Uma segunda requisição idêntica é um no-op.

A rota rejeita estados que o painel da CLI não pode alternar:

- skill desconhecido: `404 skill_not_found`;
- `userInvocable === false`: `409 skill_not_toggleable`;
- skill de uma extensão inativa: `409 skill_not_toggleable`;
- desabilitado nos padrões de sistema, escopo de usuário ou de sistema:
  `409 skill_not_toggleable` com o escopo de bloqueio;
- workspace não confiável: `403 untrusted_workspace`.

A verificação de bloqueio de escopo e a leitura-modificação-escrita do workspace
acontecem dentro do lock de configurações por workspace do daemon. Uma escrita com
falha para antes do refresh e da publicação de evento.

## Disponibilidade de skill versus `disable-model-invocation`

`skills.disabled` é uma denylist rígida do operador, mesclada como uma união sem
diferenciação de maiúsculas/minúsculas entre escopos. `skills.defaultDisabled`
fornece padrões sobrescrevíveis e `skills.enabled` fornece opt-ins explícitos, com
precedência `disabled > enabled > defaultDisabled`. Desabilitações efetivas removem
comandos slash de skill correspondentes e entradas de skill visíveis ao modelo, e a
validação em tempo de execução rejeita o skill. O endpoint do daemon escreve os
membros de workspace de `disabled` e `enabled`.

`disable-model-invocation` são metadados do SKILL.md. Ele oculta um skill da
invocação do modelo enquanto preserva a invocação direta do usuário. A operação ACP
de skill gerenciado existente edita esses metadados e não é reutilizada por esta
API intencionalmente.

## Fluxo de ativação

1. Resolve o skill canônico e alternável a partir do snapshot de status do
   workspace.
2. Sob o lock de configurações do workspace, relê todos os escopos, rejeita
   bloqueios de escopo superior e confirma a lista canônica do workspace.
3. Invalida o status de skill em cache do daemon.
4. Se um child ACP estiver ativo, invoca `qwen/control/workspace/skills/refresh`.
5. O child recarrega as configurações de escopo de workspace e atualiza todas as
   sessões ativas, incluindo sessões ocupadas.
6. Cada sessão recarrega suas próprias configurações de workspace, reconstrói e
   envia `available_commands_update`, e notifica os consumidores do SkillManager.
7. Publica o evento `settings_changed` de workspace existente para cada chave de
   configuração de skill alterada.

Uma requisição de modelo em andamento não pode ser reescrita. Verificações
subsequentes de execução de skill, snapshots de comando e contextos de modelo leem
o novo estado.

## Consumidores downstream

- Mesclagem de configurações: padrões de sistema, listas de usuário, workspace e
  sistema formam o conjunto efetivo de nomes desabilitados com precedência
  `disabled > enabled > defaultDisabled`.
- Status do workspace: o mapeamento de skill ACP e local do daemon expõe o estado
  de desabilitação, o motivo da desabilitação, o escopo de bloqueio e
  `userInvocable` apenas falso.
- Comandos slash: a construção de comandos disponíveis remove skills desabilitados
  e envia metadados de comando atualizados para os clientes do daemon.
- Contexto do modelo: os listeners de alteração do SkillManager atualizam a
  descrição da ferramenta Skill e o contexto de skills disponíveis.
- Validação de execução: a ferramenta Skill relê o provedor de nomes desabilitados
  antes da invocação, de modo que chamadas posteriores são rejeitadas
  imediatamente.
- Estado da extensão: skills de extensões inativas permanecem não alternáveis mesmo
  quando não estão desabilitados por configurações.
- Cache do daemon: o snapshot de skill do child ativo em cache é invalidado após a
  persistência, de modo que requisições GET posteriores não possam reproduzir em
  replay um estado obsoleto.
- Consumidores do SDK: tanto os clientes de workspace primário quanto os
  qualificados por workspace compartilham o contrato de resposta e erro.
- Eventos: os consumidores existentes de `settings_changed` observam cada valor
  confirmado de `skills.disabled` ou `skills.enabled`; não há um novo tipo de
  evento.

## Comportamento de falha

- Falha de persistência: a requisição HTTP falha; sem refresh de ACP e sem evento.
- Sem child: a persistência tem sucesso com `deferred`; o próximo child carrega a
  configuração na inicialização.
- Falha de refresh por sessão: a persistência permanece confirmada; as sessões
  bem-sucedidas permanecem atualizadas e a resposta é `partial`.
- Corrida de transporte do child: se o child desaparecer após a verificação de
  atividade, a resposta é `deferred`; outras falhas de refresh são reportadas como
  `partial`.
