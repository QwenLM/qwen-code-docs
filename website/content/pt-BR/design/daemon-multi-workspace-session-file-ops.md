# Rewind e Shell de Sessão Multi-Workspace do Daemon

## Status

Design final de implementação. Este documento substitui a afirmação somente
primária da Fase 2a para snapshots de rewind de sessão ao vivo, rewind e
shell.

## Problema

O daemon expõe APIs singulares de sessão, enquanto um daemon multi-workspace
possui uma bridge por runtime de workspace. A maioria das rotas de sessão ao
vivo já resolve o proprietário da sessão, mas snapshots de rewind, rewind e
shell ainda estavam vinculados à bridge primária ou rejeitavam um proprietário
secundário. Isso tornava uma sessão secundária válida ao vivo indistinguível
de uma rota não suportada para os clientes.

## Decisão

Manter a API REST singular e resolver o runtime proprietário ao vivo em cada
requisição:

- `GET /session/:id/rewind/snapshots` usa roteamento de leitura ciente do
  proprietário.
- `POST /session/:id/rewind` e `POST /session/:id/shell` usam roteamento
  mutável ciente do proprietário e o coordenador de arquivamento de sessão
  compartilhado.
- Chamadas de rewind do SDK sempre selecionam REST direto, mesmo quando o
  cliente está configurado com transporte ACP. Isso preserva o gate estrito de
  mutações REST.
- O shell do SDK mantém seu transporte configurado. O transporte REST padrão
  ganha roteamento por proprietário; um cliente ACP qualificado por workspace
  mantém `_qwen/session/shell`.
- Nenhuma API REST de sessão qualificada por workspace, método de rewind do
  ACP, alteração no core, alteração no filho ACP ou migração de FileHistory é
  introduzida.

## Propriedade e autorização

O registro de workspaces busca em todos os resumos de bridge ativas pelo id de
sessão. Exatamente um proprietário confiável despacha para esse runtime.
Nenhum proprietário retorna `404 session_not_found`; um proprietário não
confiável retorna `403 untrusted_workspace`; múltiplos proprietários retornam
`500 ambiguous_session_owner`. Todos os três resultados ocorrem antes que a
operação da bridge alvo seja executada. Sessões persistidas devem primeiro ser
carregadas ou retomadas em um runtime.

Rewind e shell retêm `mutate({ strict: true })`. O shell adicionalmente exige
habilitação efetiva de shell, um id de cliente vinculado à sessão válido e um
comando não vazio. O rewind encaminha um id de cliente opcional e aceita
`rewindFiles` apenas quando omitido ou booleano. Omitido significa `true`;
qualquer outro tipo JSON retorna `400 invalid_rewind_files_flag`.

## Limites de comportamento

O shell inicia no cwd do workspace da sessão proprietária e não é um sandbox
de caminho de sistema de arquivos. O rewind restaura apenas snapshots
registrados para `edit` e `write_file`. Ele não desfaz alterações de shell,
Git, script ou manuais. A restauração de arquivos é de melhor esforço: a
conversa pode já ter sido retrocedida quando a resposta reporta
`rewound: false` com `filesFailed[]`. Prompts ativos mantêm
`409 session_busy` e `Retry-After: 5`; alvos inválidos mantêm
`400 invalid_rewind_target`. O Web Shell continua a requisitar
`rewindFiles: false`.

O layout existente `~/.qwen/file-history/<sessionId>` é inalterado. Uma
colisão de UUID ao vivo, portanto, falha de forma fechada (fail closed) por
ambiguidade de proprietário em vez de selecionar o runtime primário.

## Capabilities

`multi_workspace_session_rewind` é anunciada apenas enquanto mais de um
runtime existe. `multi_workspace_session_shell` adicionalmente exige
habilitação efetiva de shell de sessão, o que significa tanto a flag de
habilitação quanto um token configurado.

O preflight do cliente é aditivo:

- Rewind primário: `session_rewind`.
- Rewind secundário: `session_rewind` e `multi_workspace_session_rewind`.
- Shell primário: `session_shell_command`.
- Shell secundário: `session_shell_command` e
  `multi_workspace_session_shell`.

Clientes nativos ACP usam o `_qwen.methods` do initialize; o daemon não
anuncia um método de fornecedor de rewind do ACP.

## Verificação

A cobertura unitária fixa o despacho por proprietário, zero chamadas a bridges
não proprietárias, falhas de confiança e ambiguidade, ordem estrita de
validação, semântica de `rewindFiles`, fallback REST do SDK, transporte de
shell inalterado, anúncio condicional de capability e a ausência de
mapeamentos de rewind do ACP. Os testes de workspace do ACP retêm a invariante
de que uma conexão A não pode operar uma sessão de B enquanto um shell de B
qualificado por workspace é bem-sucedido.

O cenário E2E cria uma sessão e edições rastreadas no workspace B, verifica
que os snapshots e o cwd do shell têm escopo de B, verifica ambos os modos de
arquivos do rewind, prova que um arquivo criado pelo shell sobrevive ao
rewind e registra resultados de ocupado, restauração parcial e secundário não
confiável.
