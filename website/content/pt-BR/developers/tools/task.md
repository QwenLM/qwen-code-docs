# Ferramenta Agent (`agent`)

Este documento descreve a ferramenta `agent` para Qwen Code.

## Descrição

Use `agent` para iniciar um subagente especializado para lidar com tarefas complexas e de múltiplas etapas de forma autônoma. A ferramenta Agent delega trabalho para agentes especializados que podem trabalhar de forma independente com acesso a seu próprio conjunto de ferramentas, permitindo execução paralela de tarefas e expertise especializada.

### Argumentos

`agent` aceita os seguintes argumentos:

- `description` (string, required): Uma breve descrição (3-5 palavras) da tarefa para visibilidade e rastreamento do usuário.
- `prompt` (string, required): O prompt detalhado da tarefa para o subagente executar. Deve conter instruções abrangentes para execução autônoma.
- `subagent_type` (string, optional): O tipo de agente especializado a ser usado para esta tarefa. O padrão é `general-purpose` se omitido.
- `run_in_background` (boolean, optional): Defina como `true` para executar o agente em segundo plano. Você será notificado quando ele concluir.
- `isolation` (string, optional): Defina como `"worktree"` para executar o agente em uma worktree git isolada.

## Como usar `agent` com Qwen Code

A ferramenta Agent carrega dinamicamente os subagentes disponíveis a partir da sua configuração e delega tarefas a eles. Cada subagente é executado de forma independente e pode usar seu próprio conjunto de ferramentas, permitindo expertise especializada e execução paralela.

Quando você usa a ferramenta Agent, o subagente irá:

1. Receber o prompt da tarefa com total autonomia
2. Executar a tarefa usando suas ferramentas disponíveis
3. Retornar uma mensagem de resultado final
4. Terminar (subagentes são stateless e de uso único)

Uso:

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## Subagentes Disponíveis

Os subagentes disponíveis dependem da sua configuração. Tipos comuns de subagentes podem incluir:

- **general-purpose**: Para tarefas complexas de múltiplas etapas que exigem várias ferramentas
- **code-reviewer**: Para revisar e analisar a qualidade do código
- **test-runner**: Para executar testes e analisar resultados
- **documentation-writer**: Para criar e atualizar documentação

Você pode visualizar os subagentes disponíveis usando o comando `/agents` no Qwen Code.

## Recursos da Ferramenta Agent

### Atualizações de Progresso em Tempo Real

A ferramenta Agent fornece atualizações ao vivo mostrando:

- Status de execução do subagente
- Chamadas individuais de ferramentas sendo feitas pelo subagente
- Resultados das chamadas de ferramentas e eventuais erros
- Progresso geral da tarefa e status de conclusão

### Execução Paralela

Você pode iniciar vários subagentes simultaneamente chamando a ferramenta Agent várias vezes em uma única mensagem, permitindo execução paralela de tarefas e maior eficiência.

### Expertise Especializada

Cada subagente pode ser configurado com:

- Permissões específicas de acesso a ferramentas
- Prompts e instruções especializados do sistema
- Configurações personalizadas de modelo
- Conhecimento e capacidades específicos do domínio

## Exemplos de `agent`

### Delegando para um agente de propósito geral

```
agent(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### Executando tarefas paralelas

```
# Launch code review and test execution in parallel
agent(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="general-purpose"
)

agent(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-engineer"
)
```

### Geração de documentação

```
agent(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="general-purpose"
)
```

## Quando Usar a Ferramenta Agent

Use a ferramenta Agent quando:

1. **Tarefas complexas de múltiplas etapas** — Tarefas que exigem várias operações que podem ser tratadas autonomamente
2. **Expertise especializada** — Tarefas que se beneficiam de conhecimento ou ferramentas específicas do domínio
3. **Execução paralela** — Quando você tem várias tarefas independentes que podem ser executadas simultaneamente
4. **Necessidade de delegação** — Quando você quer passar uma tarefa completa em vez de microgerenciar etapas
5. **Operações intensivas em recursos** — Tarefas que podem levar tempo significativo ou recursos computacionais

## Quando NÃO Usar a Ferramenta Agent

Não use a ferramenta Agent para:

- **Operações simples de etapa única** — Use ferramentas diretas como Read, Edit, etc.
- **Tarefas interativas** — Tarefas que exigem comunicação de ida e volta
- **Leituras específicas de arquivos** — Use a ferramenta Read diretamente para melhor desempenho
- **Buscas simples** — Use as ferramentas Grep ou Glob diretamente

## Notas Importantes

- **Execução stateless**: Cada invocação de subagente é independente, sem memória de execuções anteriores
- **Comunicação única**: Subagentes fornecem uma mensagem de resultado final — sem comunicação contínua
- **Prompts abrangentes**: Seu prompt deve conter todo o contexto e instruções necessários para execução autônoma
- **Acesso a ferramentas**: Subagentes só têm acesso às ferramentas configuradas em sua configuração específica
- **Capacidade paralela**: Vários subagentes podem ser executados simultaneamente para maior eficiência
- **Dependente de configuração**: Os tipos de subagentes disponíveis dependem da configuração do seu sistema
## Configuração

Os subagentes são configurados através do sistema de configuração de agentes do Qwen Code. Use o comando `/agents` para:

- Visualizar subagentes disponíveis
- Criar novas configurações de subagentes
- Modificar configurações existentes de subagentes
- Definir permissões de ferramentas e capacidades

Para mais informações sobre como configurar subagentes, consulte a documentação de subagentes.
