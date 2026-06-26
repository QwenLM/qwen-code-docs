# Ferramenta Agent (`agent`)

Este documento descreve a ferramenta `agent` do Qwen Code.

## Descrição

Use `agent` para iniciar um subagente especializado para lidar com tarefas complexas de várias etapas de forma autônoma. A ferramenta Agent delega trabalho a agentes especializados que podem trabalhar de forma independente, com acesso ao seu próprio conjunto de ferramentas, permitindo execução paralela de tarefas e expertise especializada.

### Argumentos

`agent` aceita os seguintes argumentos:

- `description` (string, obrigatório): Uma descrição curta (3-5 palavras) da tarefa para visibilidade e rastreamento por parte do usuário.
- `prompt` (string, obrigatório): O prompt detalhado da tarefa para o subagente executar. Deve conter instruções abrangentes para execução autônoma.
- `subagent_type` (string, opcional): O tipo de agente especializado a ser usado para esta tarefa. O padrão é `general-purpose` se omitido.
- `run_in_background` (boolean, opcional): Defina como `true` para executar o agente em segundo plano. Você será notificado quando ele concluir.
- `isolation` (string, opcional): Defina como `"worktree"` para executar o agente em uma git worktree isolada.

## Como usar `agent` com Qwen Code

A ferramenta Agent carrega dinamicamente os subagentes disponíveis a partir da sua configuração e delega tarefas a eles. Cada subagente é executado de forma independente e pode usar seu próprio conjunto de ferramentas, permitindo expertise especializada e execução paralela.

Quando você usa a ferramenta Agent, o subagente irá:

1. Receber o prompt da tarefa com autonomia total
2. Executar a tarefa usando suas ferramentas disponíveis
3. Retornar uma mensagem de resultado final
4. Encerrar (subagentes são stateless e de uso único)

Uso:

```
agent(description="Breve descrição da tarefa", prompt="Instruções detalhadas da tarefa para o subagente", subagent_type="agent_name")
```

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

- **Execução stateless**: Cada invocação de subagente é independente, sem memória de execuções anteriores
- **Comunicação única**: Subagentes fornecem uma mensagem de resultado final – sem comunicação contínua
- **Prompts abrangentes**: Seu prompt deve conter todo o contexto e instruções necessários para execução autônoma
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