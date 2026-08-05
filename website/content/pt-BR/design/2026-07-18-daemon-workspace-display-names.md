# Nomes de exibição de workspace do daemon

## Objetivo

Permitir que clientes do daemon e do SDK TypeScript anexem um nome de exibição
opcional e legível por humanos a um workspace registrado, sem alterar a
identidade ou o roteamento do workspace. Permitir que usuários do Web Shell
definam esse nome ao adicionar um workspace e o vejam na lista de workspaces.
Permitir que clientes da API atualizem ou limpem os metadados de apresentação
de um workspace ativo.

## Contrato

- Entradas de `workspaces[]` ganham metadados opcionais `displayName`.
- `POST /workspaces` aceita um `displayName` opcional ao registrar ou promover
  persistentemente um workspace secundário.
- `PATCH /workspaces/:workspace` é o endpoint de atualização de workspace. Seu
  formato de requisição atual é `{ displayName: string | null }`; `null` limpa
  o nome.
- `POST /workspaces`, `PATCH /workspaces/:workspace` e as listagens de registro
  persistente retornam o nome de exibição efetivo quando ele existe.
- `workspace_display_name` anuncia o contrato. O SDK TypeScript expõe a opção
  de registro e `updateWorkspace()`.
- Quando a capability é anunciada, o diálogo de adição de workspace do Web
  Shell aceita um nome de exibição opcional e o usa nos rótulos de workspace.

`id` e `cwd` permanecem como os únicos seletores de workspace. Um nome de
exibição nunca é usado para lookup e não precisa ser único.

## Runtime e persistência

O runtime é dono do nome de exibição efetivo. Atualizar qualquer workspace
ativo muda os metadados daquele runtime. Quando o runtime tem identidades de
registro persistente correspondentes, a mesma atualização é escrita
atomicamente em todas elas; caso contrário, a atualização permanece local ao
processo. Workspaces locais ao processo perdem tanto o runtime quanto seu nome
quando o daemon para e nunca dependem do store de registro para atualizações de
nome de exibição.

O arquivo de registro schema-v1 existente mantém seu formato
`workspaces: string[]` e adiciona um objeto `displayNames` opcional chaveado
pelo id de registro estável existente. Atualizações reutilizam o lock
existente do store, a releitura sob lock e a escrita atômica. Daemons mais
antigos ignoram o campo aditivo, e daemons mais novos continuam lendo arquivos
que não o contêm. Remover um registro também remove sua entrada de nome de
exibição.

## Validação e falhas

Nomes de exibição de workspace são limitados a 256 caracteres após o trimming
de espaços em branco nas extremidades. Caracteres de controle C0 internos e DEL
são rejeitados; um resultado vazio é tratado como ausência de nome. Entrada
inválida retorna `400 invalid_display_name` antes que qualquer trabalho de
sistema de arquivos ou de runtime comece. Nomes de exibição duplicados são
permitidos.

Quando um workspace local ao processo é persistido pela primeira vez, a escrita
no store de registro é concluída antes que o nome de exibição persistido seja
exposto no runtime. Da mesma forma, um PATCH atualiza os registros persistentes
correspondentes antes de expor o novo valor do runtime, então uma falha comum
do store deixa o runtime inalterado.

## Compatibilidade

Toda mudança de wire é aditiva no protocolo v1. SDKs mais antigos ignoram
`displayName`; SDKs mais novos o tipam como opcional e continuam funcionando
com daemons mais antigos que omitem tanto o campo quanto a tag de capability.
O Web Shell oculta os controles de nome de exibição quando a tag de capability
está ausente.

## Verificação

- Testes do store de registro cobrem arquivos legados, nomes iniciais,
  validação, atualização atômica de alias, restauração após reinício e limpeza
  na remoção.
- Testes de gerenciamento de workspace cobrem criação local ao processo e
  persistente, atualização/limpeza, erros de persistência e promoção
  idempotente.
- Testes de capability/status e de SDK cobrem o campo aditivo, formatos de
  requisição, `updateWorkspace()` e o anúncio de `workspace_display_name`.
- Testes do Web Shell cobrem a entrada opcional, o encaminhamento da opção do
  SDK e o fallback de rótulo. Screenshots do navegador verificam o formulário
  real de adição de workspace e o rótulo resultante na barra lateral.
- A verificação manual ponta a ponta cobre o registro local ao processo e a
  restauração persistente após reinício.

Formulário de adição de workspace preenchido:

![Formulário de nome de exibição de workspace](../assets/workspace-display-name-web-shell.jpg)

Workspace criado exibido pelo nome de exibição:

![Resultado do nome de exibição de workspace](../assets/workspace-display-name-web-shell-result.jpg)
