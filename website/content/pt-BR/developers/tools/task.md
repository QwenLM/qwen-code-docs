# Ferramenta Agent (`agent`)

Este documento descreve a ferramenta `agent` do Qwen Code.

## Descrição

Use `agent` para iniciar um subagente especializado para lidar com tarefas complexas de várias etapas de forma autônoma. A ferramenta Agent delega trabalho a agentes especializados que podem trabalhar de forma independente, com acesso ao seu próprio conjunto de ferramentas, permitindo execução paralela de tarefas e expertise especializada.

### Argumentos

`agent` aceita os seguintes argumentos:

- `description` (string, obrigatório): Uma descrição curta (3-5 palavras) da tarefa para visibilidade e rastreamento por parte do usuário.
- `prompt` (string, obrigatório): O prompt detalhado da tarefa para o subagente executar. Deve conter instruções abrangentes para execução autônoma.
- `subagent_type` (string, opcional): O tipo de agente especializado a ser usado para esta tarefa. O padrão é `general-purpose` se omitido.
- `fork_turns` (string, opcional): Válido apenas com `subagent_type="fork"`. Omita ou use `all` para a conversa completa do pai, ou use uma string de inteiro positivo como `"3"` para os três turnos reais de usuário mais recentes. Respostas de ferramentas e lembretes puros do sistema não contam como turnos.
- `fork_tools` (array de strings, opcional): Válido apenas com `subagent_type="fork"`. Restringe a execução a nomes de ferramentas canônicos exatos ou padrões de servidor MCP enquanto mantém as declarações de ferramentas visíveis ao modelo do fork inalteradas para compartilhamento de cache de prompt. Entradas não podem ter espaços ao redor; wildcards são limitados a `mcp__*` ou um padrão de prefixo de ferramenta MCP como `mcp__github__read_*`. Forks nunca executam `ask_user_question`; omita `fork_tools` para permitir todas as outras ferramentas herdadas, ou use um array vazio para rejeitar todas as chamadas de ferramenta.
- `fork_profile` (string, opcional): Válido apenas com `subagent_type="fork"`. Carrega um arquivo regular `.qwen/fork-profiles/<name>.md` somente frontmatter de no máximo 64 KiB a partir da raiz do projeto ativo e aplica seu array `tools` obrigatório mais um `promptHint` opcional de no máximo 200 caracteres. O arquivo não pode resolver fora do diretório de perfis do projeto. `fork_profile` não pode ser combinado com `fork_tools` ou um teammate nomeado, e está indisponível em safe mode ou bare mode.
- `run_in_background` (boolean, opcional): Padrão `true` para agentes regulares de nível superior. Defina como `false` para aguardar o resultado de um agente regular inline. Forks headless sempre executam em background. Agentes aninhados executam em foreground a menos que `run_in_background` seja explicitamente `true`, que é rejeitado porque agentes aninhados não podem receber notificações de conclusão em background. Lançamentos com `working_dir` pertencente ao chamador executam em foreground e rejeitam execução em background explícita ou configurada.
- `isolation` (string, opcional): Defina como `"worktree"` para executar um agente explicitamente nomeado e não-fork em uma git worktree isolada que o Qwen Code cria e gerencia.
- `working_dir` (string, opcional): Fixe um agente explicitamente nomeado e não-fork em uma git worktree registrada existente dentro do repositório atual. O chamador possui o ciclo de vida da worktree, então este modo executa em foreground. Se ambos `working_dir` e `isolation` forem fornecidos, `working_dir` tem precedência.

## Como usar `agent` com Qwen Code

A ferramenta Agent carrega dinamicamente os subagentes disponíveis a partir da sua configuração e delega tarefas a eles. Cada subagente é executado de forma independente e pode usar seu próprio conjunto de ferramentas, permitindo expertise especializada e execução paralela.

Quando você usa a ferramenta Agent, o subagente irá:

1. Receber o prompt da tarefa e, para um fork, o contexto selecionado da conversa do pai
2. Executar a tarefa usando suas ferramentas disponíveis
3. Reportar uma notificação de conclusão por padrão, ou retornar uma mensagem de resultado final quando um agente regular executa em foreground
4. Permanecer endereçável após uma execução em background quando seu estado retido suporta continuação

Uso:

```
agent(description="Breve descrição da tarefa", prompt="Instruções detalhadas da tarefa para o subagente", subagent_type="agent_name")
agent(description="Breve descrição da tarefa", prompt="Instruções detalhadas da tarefa para o fork", subagent_type="fork", fork_turns="3")
agent(description="Investigação somente leitura", prompt="Inspecione a implementação", subagent_type="fork", fork_tools=["read_file", "grep_search", "mcp__github"])
agent(description="Investigação com perfil", prompt="Inspecione a implementação", subagent_type="fork", fork_profile="ro-research")
```

Defina `run_in_background=false` quando o turno atual precisa usar o resultado do subagente antes de continuar.

## Subagentes Disponíveis

Os subagentes disponíveis dependem da sua configuração. Tipos comuns de subagentes podem incluir:

- **general-purpose**: Para tarefas complexas de várias etapas que exigem várias ferramentas
- **code-reviewer**: Para revisar e analisar a qualidade do código
- **test-runner**: Para executar testes e analisar resultados
- **documentation-writer**: Para criar e atualizar documentação

Você pode visualizar os subagentes disponíveis usando o comando `/agents` no Qwen Code.

## Recursos da Ferramenta Agent

### Atualizações de Progresso em Tempo Real

A ferramenta Agent fornece atualizações ao vivo mostrando:

- Status de execução do subagente
- Chamadas de ferramentas individuais sendo feitas pelo subagente
- Resultados das chamadas de ferramentas e quaisquer erros
- Progresso geral da tarefa e status de conclusão

### Execução Paralela

Você pode iniciar vários subagentes simultaneamente chamando a ferramenta Agent várias vezes em uma única mensagem, permitindo execução paralela de tarefas e maior eficiência.

### Expertise Especializada

Cada subagente pode ser configurado com:

- Permissões específicas de acesso a ferramentas
- Prompts e instruções de sistema especializados
- Configurações de modelo personalizadas
- Conhecimento e capacidades específicos de domínio

### Continuação de Agente em Background

Agentes em background podem receber trabalho de follow-up após sua conclusão inicial:

1. Chame `list_agents` para descobrir os agentes em background endereçáveis da sessão atual e seus valores de `task_id`. Isso inclui agentes compatíveis restaurados após a sessão pai retomar.
2. Chame `send_message` com um `task_id` e instrução de follow-up. Agentes em execução recebem a mensagem no próximo boundary de rodada de ferramenta, agentes pausados retomam com ela, e agentes completados continuam em um runtime residente quando disponível ou revivem de sua transcrição retida.
3. Aguarde a próxima notificação de conclusão antes de usar o resultado do follow-up.

Se um agente não pode ser continuado, `list_agents` retorna um `resume_blocked_reason`. Trate a saída de agente restaurado ou continuado como evidência e verifique-a antes de integrar alterações.

## Exemplos de `agent`

### Delegando para um agente de propósito geral

```
agent(
  description="Refatoração de código",
  prompt="Por favor, refatore o módulo de autenticação em src/auth/ para usar padrões modernos de async/await em vez de callbacks. Garanta que todos os testes ainda passem e atualize qualquer documentação relacionada.",
  subagent_type="general-purpose"
)
```

### Executando tarefas em paralelo

```
# Iniciar revisão de código e execução de testes em paralelo
agent(
  description="Revisão de código",
  prompt="Revise as alterações recentes no módulo de gerenciamento de usuários quanto à qualidade do código, questões de segurança e conformidade com as melhores práticas.",
  subagent_type="general-purpose"
)

agent(
  description="Executar testes",
  prompt="Execute a suíte de testes completa e analise quaisquer falhas. Forneça um resumo da cobertura de testes e recomendações para melhoria.",
  subagent_type="test-engineer"
)
```

### Geração de documentação

```
agent(
  description="Atualizar docs",
  prompt="Gere documentação abrangente da API para os endpoints REST recém-implementados no módulo de pedidos. Inclua exemplos de requisição/resposta e códigos de erro.",
  subagent_type="general-purpose"
)
```

## Quando Usar a Ferramenta Agent

Use a ferramenta Agent quando:

1. **Tarefas complexas de várias etapas** – Tarefas que exigem múltiplas operações e podem ser tratadas de forma autônoma
2. **Expertise especializada** – Tarefas que se beneficiam de conhecimento ou ferramentas específicas do domínio
3. **Execução paralela** – Quando você tem várias tarefas independentes que podem ser executadas simultaneamente
4. **Necessidade de delegação** – Quando você deseja passar uma tarefa completa em vez de microgerenciar etapas
5. **Operações que consomem muitos recursos** – Tarefas que podem levar tempo ou recursos computacionais significativos

## Quando NÃO Usar a Ferramenta Agent

Não use a ferramenta Agent para:

- **Operações simples de etapa única** – Use ferramentas diretas como Read, Edit, etc.
- **Tarefas interativas** – Tarefas que exigem comunicação de ida e volta
- **Leituras de arquivos específicas** – Use a ferramenta Read diretamente para melhor desempenho
- **Pesquisas simples** – Use as ferramentas Grep ou Glob diretamente

## Notas Importantes

- **Contexto independente**: Subagentes regulares iniciam sem o histórico da conversa do pai. Forks herdam a conversa completa por padrão e aceitam `fork_turns` quando uma janela recente limitada é suficiente.
- **Interação com subagentes**: Subagentes regulares não recebem `ask_user_question`. Forks mantêm a lista de declarações do pai para compartilhamento de cache mas rejeitam essa ferramenta antes do agendamento ou aprovação; quando entrada do usuário ausente bloqueia o trabalho, o subagente reporta o bloqueador ao seu pai.
- **Restrições de execução de fork**: `fork_tools` restringe ainda mais quais ferramentas já declaradas um fork pode executar. Chamadas não permitidas retornam um erro antes do agendamento ou aprovação; a mesma lista de declarações permanece visível ao modelo para compartilhamento de cache. Esta é uma restrição por chamada escolhida pelo chamador, não um sandbox imposto pelo administrador.
- **Perfis de fork**: Um perfil de projeto sob `.qwen/fork-profiles/` reutiliza o mesmo portão de execução que `fork_tools`. É resolvido uma vez antes do lançamento; a lista resolvida é persistida para revival, e um `promptHint` opcional é adicionado apenas à diretiva da tarefa.
- **Entrega de resultados**: Resultados em background chegam através de notificações de conclusão em um turno posterior. Não assuma um resultado antes da notificação chegar.
- **Continuação**: Use `list_agents` e `send_message` para trabalho de follow-up relacionado em vez de lançar um agente duplicado. A continuação depende de estado retido compatível e pode estar indisponível.
- **Prompts abrangentes**: Seu prompt inicial deve conter todo o contexto e instruções necessários para execução autônoma. Um subagente regular não vê a conversa do pai.
- **Acesso a ferramentas**: Subagentes têm acesso apenas às ferramentas configuradas em sua configuração específica
- **Capacidade paralela**: Vários subagentes podem ser executados simultaneamente para maior eficiência
- **Dependente de configuração**: Os tipos de subagentes disponíveis dependem da configuração do seu sistema

## Configuração

Os subagentes são configurados através do sistema de configuração de agentes do Qwen Code. Use o comando `/agents` para:

- Visualizar subagentes disponíveis
- Criar novas configurações de subagentes
- Modificar configurações existentes de subagentes
- Definir permissões e capacidades de ferramentas

Para mais informações sobre como configurar subagentes, consulte a documentação de subagentes.
