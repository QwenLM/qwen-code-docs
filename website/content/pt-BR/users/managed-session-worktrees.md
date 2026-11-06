# Managed Session worktrees


Em uma implantação Managed local suportada, selecione um projeto Git ao criar uma Session. Abra o botão de branch Git ao lado do workspace abaixo do composer e escolha **Worktree**. O seletor fecha; ao enviar sua primeira mensagem, um checkout isolado é criado automaticamente a partir do HEAD atual em sua própria branch. Não há formulário de branch ou diretório para preencher. Arquivos não commitados, configuração ignorada e dependências instaladas permanecem no diretório de origem.

Antes de enviar, escolha **Current branch** ou limpe o chip Worktree para trabalhar diretamente na branch de origem. O chip exibe a branch de origem real, como **main**, quando o isolamento não está selecionado.

A Session reporta a preparação e pode aguardar outras ferramentas que usem o mesmo
armazenamento. Referências de arquivo e uploads do Workspace ficam disponíveis após o
worktree estar pronto. As instruções do projeto vêm do diretório de destino; as configurações
de modelo Managed, aprovação, Skills, MCP e Extensions mantêm seus pins de Session.

No chat Home, o cartão de mais informações da sessão contém o status do worktree, branch e commit base. Os detalhes do worktree pronto não ocupam mais o topo da conversa; as mensagens de preparação e erro permanecem visíveis ali quando necessário.

Fechar, arquivar ou excluir o chat mantém o checkout e a branch. Abra
**Session worktrees** no popover do composer de nova tarefa do mesmo Workspace para inspecionar os diretórios retidos. Feche
a Session e conclua seu trabalho em background antes da limpeza. Faça commit ou salve
de outra forma o conteúdo rastreado/não rastreado/ignorado primeiro. A limpeza remove apenas um checkout
limpo e mantém todas as branches; ela não faz merge das alterações na origem.

As implantações habilitam `qwen.managed-agent.runtime-broker.session-worktrees-enabled`.
O padrão é desativado; `qwen serve --managed` habilita hosts locais elegíveis. Esta versão
suporta armazenamento LOCAL macOS/Linux, workers de processo local duráveis isolados por Session
e Git 2.40 ou posterior. O repositório e seu diretório comum do Git devem estar
dentro da raiz de armazenamento registrada. Para um checkout vinculado existente com metadados Git
em outro local, selecione o checkout original ou peça ao administrador para
registrar uma raiz que contenha ambos. SSH e CSI não são suportados nesta versão.

Reiniciar uma Session pronta reutiliza seu checkout original. Diretórios ausentes ou substituídos
bloqueiam a execução. Se o servidor for encerrado enquanto o Git está criando ou
removendo um worktree, um processo Git original não verificado deixa a operação
bloqueada e sua trava de manutenção intacta. A reverificação não força a recuperação;
a recuperação automática do macOS para este caso está fora desta versão. Preserve o
diretório e a branch até que a execução original possa ser reconciliada.

A requisição pública de criação de Session adiciona `worktree: {"base_ref":"main"}`;
`worktree: {}` seleciona HEAD e a omissão usa o diretório atual. Envie um
`workspace` autorizado explícito e mantenha a mesma Idempotency-Key na tentativa.
Consulte o `worktree.state` da Session retornada antes de enviar entrada subsequente.

Esta versão de desenvolvimento atualiza o baseline do schema V1 compartilhado. Use um
catálogo de desenvolvimento recriado a partir desse baseline; uma migration de upgrade para um
catálogo mais antigo não está incluída.
