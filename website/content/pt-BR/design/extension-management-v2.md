# Gerenciamento de Extensão V2

## Status

Este design estende o protocolo de daemon `v1` sob a capability aditiva
`extension_management_v2`. A capability já publicada `workspace_extensions` e as
rotas `/workspace/extensions/*` permanecem disponíveis como um adaptador de
compatibilidade do workspace primário.

## Modelo de recurso

Uma extensão instalada é um artefato de nível de usuário em
`QWEN_HOME/extensions`. Ativação é política, não uma segunda cópia daquele
artefato:

1. Um override exato de workspace (`enabled` ou `disabled`).
2. Uma máscara `inherit` exata interna criada durante a migração de regras de
   caminho legadas.
3. Uma regra de caminho V1 ordenada.
4. O padrão global.

A identidade do workspace usa o caminho canônico de workspace do daemon. Uma rota
de workspace seleciona um runtime existente primeiro por id de workspace e depois
por cwd canônico. Leituras são permitidas para runtimes não confiáveis; alterações
de ativação, refresh e instalação com escopo de workspace exigem um alvo
confiável. Mutação global usa a autenticação de mutação normal do daemon e
consentimento de instalação, não o estado de confiança de qualquer workspace que
iniciou a requisição.

## Fronteira de store e transação

`ExtensionStore` é o único gravador de diretórios finais de extensão e estado de
ativação V2. `ExtensionManager` permanece como a fachada voltada ao workspace, mas
operações apoiadas por CLI, TUI, atualização automática, daemon e SDK delegam
mutações ao store.

O layout é:

```text
~/.qwen/
├── extensions/
└── extension-store/
    ├── lock
    ├── state.json
    ├── state.previous.json
    ├── staging/
    ├── rollback/
    └── transactions/
```

O store e os artefatos compartilham um sistema de arquivos para que trocas de
artefato sejam renomeações de diretório. Um mutex no processo e um lock
`proper-lockfile` serializam commits entre todos os processos cientes de V2. Toda
mutação relê o estado enquanto mantém o lock e incrementa uma geração monotônica,
prevenindo atualizações perdidas.

A preparação de instalação/atualização acontece fora do diretório final do
artefato. O commit escreve um journal `prepared`, move o artefato antigo para
rollback, move o staging para o lugar e escreve atomicamente `state.json`. Aquela
renomeação de estado é o ponto de commit. Antes dele, a recuperação faz rollback;
depois dele, a recuperação apenas conclui projeção e limpeza. Uma política
confirmada nunca sofre rollback porque um refresh de runtime falhou. Se tanto uma
operação pré-commit quanto seu rollback falharem, o chamador recebe ambos os erros
e o journal permanece para recuperação fail-closed; o store não continua escrevendo
através de um estado de artefato ambíguo.

Arquivos do store usam permissões apenas do proprietário e escritas atômicas
no-follow. Ids de extensão, caminhos de artefato de filho direto, caminhos de
transação e nomes são validados. Falhas são reportadas com fontes com credenciais
ocultadas.

## Migração V1 e projeção de downgrade

O primeiro processo ciente de V2 importa regras ordenadas de
`extension-enablement.json` sem materializar o conjunto atual de workspaces
registrados como overrides exatos. V2 escreve uma projeção compatível após cada
commit de estado e armazena seu hash em `state.json`.

Se os hashes diferirem, a ordem de modificação decide a direção da recuperação:
uma projeção mais antiga é reparada a partir do estado autoritativo V2; uma
projeção modificada após o estado V2 é tratada como uma escrita sequencial por um
binário com downgrade e é reimportada com uma nova geração. Gravadores V1 e V2
concorrentes compartilhando um `QWEN_HOME` são intencionalmente não suportados.

Limpar um override público de workspace normalmente exclui o registro exato. Se
uma regra de caminho mais antiga então mudaria o valor efetivo, o store escreve
uma máscara `inherit` interna para que DELETE ainda signifique "herdar o padrão
global".

## API do Daemon

A superfície global é:

```text
GET    /extensions
POST   /extensions/install
POST   /extensions/check-updates
POST   /extensions/:extensionId/update
DELETE /extensions/:extensionId
PUT    /extensions/:extensionId/activation
GET    /extensions/operations/:operationId
```

Instalação exige consentimento explícito e ativação inicial:

```ts
type InitialActivation =
  | { scope: 'user' }
  | { scope: 'workspace'; workspaceId: string };
```

O endpoint de instalação do daemon aceita fontes HTTPS Git, GitHub Release e npm
sob a política de rede pública. Fontes SSH e locais/vinculadas permanecem
recursos locais da CLI. Atualização preserva o id da extensão, nome do manifesto,
configurações e política de ativação. "Já atualizado" é um resultado bem-sucedido
`updated: false`. Desinstalação é idempotente e remove tanto o artefato quanto a
política.

A projeção de workspace é:

```text
GET    /workspaces/:workspace/extensions
PUT    /workspaces/:workspace/extensions/:extensionId/activation
DELETE /workspaces/:workspace/extensions/:extensionId/activation
POST   /workspaces/:workspace/extensions/refresh
```

Ela intencionalmente não tem rotas de mutação de artefato de workspace. Entradas
de projeção incluem padrão, valor exato de workspace, valor efetivo e fonte.
Geração desejada e geração aplicada localmente são campos de resposta de nível
superior.

Mutações potencialmente lentas retornam `202`, `Location` e `Retry-After`. O
registro de operação é memória local do daemon, retém no máximo 100 registros
terminais e pode desaparecer na reinicialização. A recuperação de catálogo/store é
autoritativa. O timeout de polling do SDK para apenas o polling; ele nunca cancela
trabalho aceito.

O daemon admite no máximo 10 operações de extensão não concluídas. Uma fila FIFO
de preparação de todo o daemon executa no máximo dois downloads, extrações,
conversões ou verificações de atualização de extensão única por vez. Instalação e
atualização usam um ciclo de vida explícito `prepare -> commit/dispose`: a
preparação possui arquivos de staging e snapshots de credenciais revisionados, mas
não altera o store, cache, runtime ou credenciais selecionadas pelo artefato
instalado. Mutações preparadas entram em uma fila de commit FIFO separada de
concorrência única na ordem em que a preparação termina. Ativação e desinstalação
entram apenas na fila de commit; check-updates entra apenas na fila de preparação.
Refresh manual é serializado pela fila de commit. Seu timeout HTTP libera aquela
lane para que um refresh de runtime travado não possa bloquear permanentemente
mutações de extensão posteriores; o refresh já iniciado ainda pode se estabilizar
depois. Configurações sensíveis são colocadas em staging como um único bundle de
segredo atômico sob uma revisão por preparação. Um seletor não secreto registra
aquela revisão e o backend de armazenamento seguro dentro do artefato em staging,
de modo que apenas o commit do artefato vencedor ativa um bundle completo. O
commit do store é, portanto, o ponto de durabilidade e libera a lane de commit
imediatamente. Recarregamento de extensão, sincronização legada de configurações
por chave, refresh de runtime do gerenciador, limpeza de arquivos preparados e
reconciliação de runtime do daemon são executados fora dela. Esses passos
pós-commit não ocupam nenhum dos slots, então commits posteriores podem prosseguir
enquanto uma geração anterior está sendo aplicada ou limpa.

Descartar uma mutação preparada remove seu snapshot de credencial não selecionado,
e um commit bem-sucedido remove o snapshot previamente selecionado em melhor
esforço. Um crash rígido de processo antes do descarte pode deixar uma entrada
inalcançável no backend seguro; nenhum seletor de artefato a referencia, então ela
não pode se tornar ativa nem ser confundida com as credenciais confirmadas.

O prazo de preparação começa quando uma operação adquire pela primeira vez um slot
de preparação, não enquanto ela espera. O abort é propagado para operações de rede
e streams ativos de varredura e extração de arquivo. Uma tarefa iniciada continua
a ocupar seu slot até que sua promise subjacente se estabilize, mesmo que ignore o
abort. Commit não é cancelável. Atualizações preparadas carregam a geração do
artefato alvo: alterações não relacionadas de extensão ou ativação fazem rebase
com segurança, enquanto uma atualização obsoleta do mesmo artefato falha com
`extension_conflict`.

Metadados npm remotos são transmitidos em stream com um limite de resposta de 10
MiB. Arquivos npm e GitHub têm limites de download separados de 100 MiB, prazos de
requisição, limites de redirecionamento e validação de entrada de arquivo antes da
extração.

## Reconciliação de runtime

Um commit bem-sucedido invalida o status local e atualiza runtimes afetados.
Alterações globais de artefato/padrão reconciliam todos os runtimes neste daemon;
um override exato de workspace reconcilia apenas seu alvo. A reconciliação de
runtime atualiza caches de extensão e skill, ferramentas de extensão, memória
hierárquica, instruções de sistema do chat ativo e comandos disponíveis. Um
componente com falha não pula os componentes de atualização restantes; o RPC da
sessão reporta a falha combinada após todos os componentes terem sido tentados. A
reconciliação de geração de runtime usa um FIFO de todo o daemon compartilhado por
mutações e o poller de geração. Uma mutação reserva sua posição no callback de
commit durável, então gerações posteriores não podem atualizar um runtime primeiro
mesmo quando trabalho pós-commit anterior termina depois. A bridge ACP limita cada
refresh de sessão a 30 segundos. Se o refresh agregado ainda exceder o prazo da
rota, o controlador libera a lane de commit sem cancelar o RPC subjacente. Aplicar
a geração N também satisfaz aguardantes de gerações mais antigas, e um refresh
tardio de geração inferior, portanto, não pode mover a geração aplicada para
trás. Falha parcial de refresh ou falha de recarregamento/limpeza pós-commit
produz `succeeded_with_warnings` com diagnósticos específicos de workspace ou de
commit, sem fazer rollback do artefato.

A migração legada de workspace trata um artefato confirmado como falho apenas
quando ele não pôde ser recarregado. Avisos de sincronização de compatibilidade de
configurações, limpeza ou refresh de runtime não disparam um retry de um artefato
que já está duravelmente instalado. Chamadores de atualização recebem detalhes de
aviso; avisos de compatibilidade e limpeza usam um estado distinto
`updated with warnings`, enquanto falhas de recarregamento ou refresh de runtime
permanecem `updated, needs restart`.

O watcher de arquivos de extensão observa apenas `extension-store/state.json` para
geração de política e continua a observar conteúdo de extensão instalada/vinculada
para alterações de comando, skill, agente, hook e MCP. Um poll de geração de 30
segundos repara eventos de sistema de arquivos perdidos e limita a convergência
para outros daemons que compartilham o store.

## Compatibilidade

`workspace_extensions` permanece como a capability para a superfície singular
existente. Seus handlers chamam o mesmo gerenciador/coordenador e adaptam
respostas: ativação de projeto torna-se um override de workspace primário;
ativação de usuário mantém o comportamento legado de limpeza de regras; mutação
global reconcilia todo runtime local. O endpoint de operação legado mapeia a
conclusão com aviso V2 de volta ao status publicado legado de erro de refresh.

Clientes devem verificar `extension_management_v2`; nem o modo daemon nem outra
capability de workspace implicam esta API. A proposta abandonada
`workspace_qualified_extensions` não faz parte do protocolo.

## Não objetivos

- Cópias de artefato por workspace.
- Um registro de daemon ou protocolo de reconhecimento remoto.
- Cancelamento pelo usuário de operações aceitas.
- Escritas concorrentes de binário antigo e cientes de V2 em um `QWEN_HOME`.
- Remover o adaptador V1 antes de uma futura migração de protocolo v2.
