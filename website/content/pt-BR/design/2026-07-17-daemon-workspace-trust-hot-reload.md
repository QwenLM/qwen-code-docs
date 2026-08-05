# Hot Reload de Confiança de Workspace do Daemon

## Status

Implementado para QwenLM/qwen-code#6378.

## Problema

O daemon atualmente avalia a confiança de workspace durante a construção de um
`WorkspaceRuntime`. `GET /workspace/trust` reporta esse snapshot e
`POST /workspace/trust/request` apenas publica `trust_change_requested`.
Alterar `trustedFolders.json`, a confiança da IDE ou a configuração de confiança
de pastas do usuário/sistema não reconstrói o runtime, então configurações,
ambiente, sistema de arquivos, sessões ACP, MCP, extensões, workers de canal e
trabalho agendado permanecem no antigo limite de confiança até que o daemon seja
reiniciado.

A confiança não pode ser atualizada no lugar. A factory de sistema de arquivos,
a bridge, as configurações, o ambiente, o mount ACP e vários managers com escopo
de workspace capturam suas entradas de runtime durante a construção.

## Invariantes de segurança

1. Uma diminuição de confiança fecha o guarda de geração do runtime afetado antes
   do primeiro passo assíncrono de drenagem. Nenhum novo efeito colateral
   privilegiado pode iniciar depois desse ponto.
2. Um guarda de geração fechado nunca reabre. Um substituto recebe um novo
   guarda e um id de geração monotonicamente crescente.
3. Uma revogação com falha nunca restaura o runtime confiável anterior.
4. Configurações de sistema/usuário malformadas ou ilegíveis falham de forma
   fechada (fail closed). Um arquivo de pastas confiáveis malformado ou ilegível
   falha de forma fechada quando a confiança por arquivo é necessária, mas é
   irrelevante quando a confiança por pasta está desabilitada ou a confiança da
   IDE já resolveu o workspace primário.
5. Donos de sessão em transição, bloqueados e obsoletos nunca fazem fallback para
   o runtime primário.
6. Todo caminho de ativação de runtime valida a revisão da política imediatamente
   antes da publicação.

## Política de confiança

O daemon usa um carregador de política sem efeitos colaterais que lê apenas
overrides de sistema, configurações do usuário, padrões de sistema, confiança da
IDE e `trustedFolders.json`. Configurações de workspace e arquivos de ambiente de
projeto são excluídos da avaliação da política. A precedência existente das
regras de confiança e o comportamento de comparação de caminhos são preservados.

O carregador produz um snapshot semântico imutável. Um workspace materializa esse
snapshot em um booleano operacional de confiança e uma lista de raízes permitidas.
Apenas uma mudança de materialização reconstrói um runtime. Mudanças apenas na
fonte avançam a revisão da política aplicada sem reconstrução.

O sistema de arquivos primário mantém o comportamento existente de multi-root de
IDE confiável. Quando uma raiz secundária é removida da lista de raízes
permitidas do primário, tanto a geração secundária quanto a primária são fechadas
antes que qualquer uma delas seja drenada.

O monitor relê as entradas da política uma vez por segundo e publica apenas
quando o hash semântico delas muda. Escritas de pasta confiável vindas da IDE e
do mesmo processo também disparam uma leitura imediata. `/workspace/reload` e o
registro dinâmico de workspace solicitam uma reconciliação explicitamente.

Escritas de pasta confiável adquirem `proper-lockfile`, releem sob o lock,
preservam comentários e substituem atomicamente um arquivo regular 0600 sem
seguir symlinks. Um arquivo malformado não é reescrito silenciosamente.

## Posse do runtime

O registry possui objetos `WorkspaceEntry` estáveis. Uma entrada ativa refere-se
a um `RuntimeGeneration` imutável, que possui o runtime e seu guarda de geração.
A identidade do workspace, os metadados de registro persistentes e o estado da
política aplicada vivem na entrada, não na geração. A construção e a limpeza do
runtime permanecem coordenadas pelo host do daemon.

Rotas de plano de dados qualificadas por workspace resolvem seu runtime no
momento da requisição. Rotas primárias que retêm caminhos de todo o processo
usam delegates ao vivo para o runtime atual. Mutações REST privilegiadas
capturam o guarda de geração e o reverificam em seu limite de commit. ACP, Voice,
workers de canal e admissão de sessão usam seus mecanismos de drenagem
existentes. O status de confiança e o inventário do daemon leem entradas estáveis
sem adquirir um runtime.

O índice de donos de sessão é ciente da geração. A criação e a restauração de
sessão registram a posse explicitamente, e a substituição do runtime invalida a
posse antiga. A varredura de bridge ativa existente permanece como um caminho de
reparo de compatibilidade para sessões anteriores à indexação.

A limpeza do runtime encerra a bridge e os canais filhos, o estado do Voice,
sub-sessões, mounts ACP, workers de canal, keepalive agendado e estado de git.
Managers pertencentes ao runtime substituto são reconstruídos com novas entradas
de configurações, ambiente, sistema de arquivos, confiança, política e cache.
Locks de caminho compartilhados e telemetria de processo sobrevivem à
substituição porque não carregam nenhuma capacidade de workspace.

## Reconciliação

A reconciliação de confiança e a publicação do runtime compartilham um único gate
de topologia do daemon; adição e reload de workspace solicitam reconciliação por
esse gate após sua própria operação. Snapshots de confiança são coalescidos para
que a última revisão observada seja aplicada antes que o chamador seja liberado.
O shutdown para o monitor e espera pelo gate de topologia antes de tirar seu
snapshot de limpeza.

Para uma diminuição de confiança, o controlador fecha sincronamente toda geração
afetada antes da primeira drenagem assíncrona, fecha os caminhos de admissão,
faz o dispose do runtime antigo, constrói um novo runtime, reverifica a revisão
da política e instala a nova geração da entrada e o mount ACP. Os caminhos
existentes de encerramento de bridge e ACP fornecem limpeza limitada ou
forçado. Um candidato obsoleto é descartado (disposed) e reconstruído.

Uma concessão usa a mesma substituição destrutiva. Se ela falhar, o controlador
tenta um novo runtime não confiável e reporta a revisão configurada como com
falha até que uma reconciliação posterior tenha sucesso. Se a contenção do
runtime não puder ser confirmada, a entrada permanece bloqueada e a saúde
profunda (deep health) fica degradada; outros workspaces permanecem disponíveis.

## Protocolo

O endpoint apenas de requisição permanece apenas de requisição. O status de
confiança v1 permanece como a visão de compatibilidade padrão. Clientes solicitam
v2 com `statusVersion=2`; servidores antigos podem retornar v1. V2 separa a
política configurada do estado efetivo do runtime e reporta `stable`, `applying`
ou `failed`, uma revisão opaca e um código de erro estável. O daemon anuncia
`workspace_trust_hot_reload` apenas depois que o roteamento primário e secundário
usar resolução ciente de geração.

Nenhum bus de eventos aplicados confiável é introduzido. O status GET é a fonte
da verdade. Uma requisição de mudança de confiança requer uma geração ativa para
publicar o evento existente; caso contrário, retorna um 503 tentável novamente.

## Não objetivos

- Aprovação remota direta de confiança.
- Runtimes duplos com zero downtime ou migração de sessão.
- Identificadores de geração públicos.
- Reconstruções paralelas de runtime.
- Reconstruir a aplicação Express completa.
- Alterar a semântica de confiança do CLI standalone.
