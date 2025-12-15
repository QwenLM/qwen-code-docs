# Ferramenta Task (`task`)

Este documento descreve a ferramenta `task` para o Qwen Code.

## Descrição

Use `task` para iniciar um subagente especializado que lide com tarefas complexas e de múltiplas etapas de forma autônoma. A ferramenta Task delega o trabalho a agentes especializados que podem operar independentemente com acesso ao seu próprio conjunto de ferramentas, permitindo execução paralela de tarefas e expertise especializada.

### Argumentos

`task` aceita os seguintes argumentos:

- `description` (string, obrigatório): Uma descrição curta (3 a 5 palavras) da tarefa para fins de visibilidade e rastreamento pelo usuário.
- `prompt` (string, obrigatório): O prompt detalhado da tarefa a ser executado pelo subagente. Deve conter instruções abrangentes para execução autônoma.
- `subagent_type` (string, obrigatório): O tipo de agente especializado a ser usado para esta tarefa. Deve corresponder a um dos subagentes configurados disponíveis.

## Como usar `task` com Qwen Code

A ferramenta Task carrega dinamicamente os subagentes disponíveis a partir da sua configuração e delega tarefas a eles. Cada subagente é executado de forma independente e pode utilizar seu próprio conjunto de ferramentas, permitindo especialização e execução paralela.

Quando você utiliza a ferramenta Task, o subagente irá:

1. Receber o prompt da tarefa com total autonomia
2. Executar a tarefa usando suas ferramentas disponíveis
3. Retornar uma mensagem com o resultado final
4. Encerrar (subagentes são stateless e de uso único)

Uso:

```
task(description="Breve descrição da tarefa", prompt="Instruções detalhadas da tarefa para o subagente", subagent_type="nome_do_agente")
```

## Subagentes Disponíveis

Os subagentes disponíveis dependem da sua configuração. Tipos comuns de subagentes podem incluir:

- **general-purpose**: Para tarefas complexas de múltiplas etapas que requerem várias ferramentas
- **code-reviewer**: Para revisar e analisar a qualidade do código
- **test-runner**: Para executar testes e analisar resultados
- **documentation-writer**: Para criar e atualizar documentação

Você pode visualizar os subagentes disponíveis usando o comando `/agents` no Qwen Code.

## Recursos da Ferramenta de Tarefas

### Atualizações de Progresso em Tempo Real

A ferramenta de tarefas fornece atualizações ao vivo mostrando:

- Status de execução do subagente
- Chamadas individuais de ferramentas sendo feitas pelo subagente
- Resultados das chamadas de ferramentas e quaisquer erros
- Progresso geral da tarefa e status de conclusão

### Execução Paralela

Você pode iniciar vários subagentes simultaneamente chamando a ferramenta de tarefas várias vezes em uma única mensagem, permitindo a execução paralela de tarefas e maior eficiência.

### Especialização

Cada subagente pode ser configurado com:

- Permissões específicas de acesso a ferramentas
- Prompts e instruções especializadas do sistema
- Configurações personalizadas de modelo
- Conhecimento e capacidades específicos do domínio

## Exemplos de `task`

### Delegando para um agente de propósito geral

```
task(
  description="Refatoração de código",
  prompt="Por favor, refatore o módulo de autenticação em src/auth/ para usar padrões modernos de async/await em vez de callbacks. Certifique-se de que todos os testes ainda passem e atualize qualquer documentação relacionada.",
  subagent_type="general-purpose"
)
```

### Executando tarefas paralelas

```

# Iniciar revisão de código e execução de testes em paralelo
task(
  description="Revisão de código",
  prompt="Revise as mudanças recentes no módulo de gerenciamento de usuários quanto à qualidade do código, problemas de segurança e conformidade com as melhores práticas.",
  subagent_type="code-reviewer"
)

task(
  description="Executar testes",
  prompt="Execute a suíte completa de testes e analise quaisquer falhas. Forneça um resumo da cobertura dos testes e recomendações para melhoria.",
  subagent_type="test-runner"
)
```

### Geração de documentação

```
task(
  description="Atualizar documentação",
  prompt="Gere uma documentação abrangente da API para os novos endpoints REST implementados no módulo de pedidos. Inclua exemplos de requisições/respostas e códigos de erro.",
  subagent_type="documentation-writer"
)
```

## Quando Usar a Ferramenta de Tarefas

Use a ferramenta de tarefas quando:

1. **Tarefas complexas com múltiplos passos** - Tarefas que requerem várias operações que podem ser tratadas de forma autônoma
2. **Expertise especializada** - Tarefas que se beneficiam de conhecimento ou ferramentas específicas do domínio
3. **Execução paralela** - Quando você tem várias tarefas independentes que podem ser executadas simultaneamente
4. **Necessidades de delegação** - Quando você deseja delegar uma tarefa completa em vez de gerenciar cada etapa
5. **Operações intensivas em recursos** - Tarefas que podem consumir tempo significativo ou recursos computacionais

## Quando NÃO Usar a Ferramenta de Tarefas

Não use a ferramenta de tarefas para:

- **Operações simples de único passo** - Use ferramentas diretas como Read, Edit, etc.
- **Tarefas interativas** - Tarefas que requerem comunicação bidirecional
- **Leituras específicas de arquivos** - Use a ferramenta Read diretamente para melhor desempenho
- **Buscas simples** - Use as ferramentas Grep ou Glob diretamente

## Notas Importantes

- **Execução stateless**: Cada invocação de subagente é independente, sem memória das execuções anteriores
- **Comunicação única**: Os subagentes fornecem uma única mensagem de resultado final - não há comunicação contínua
- **Prompts abrangentes**: Seu prompt deve conter todo o contexto e instruções necessários para execução autônoma
- **Acesso às ferramentas**: Os subagentes só têm acesso às ferramentas configuradas em sua configuração específica
- **Capacidade paralela**: Vários subagentes podem ser executados simultaneamente para melhor eficiência
- **Dependente da configuração**: Os tipos de subagentes disponíveis dependem da configuração do seu sistema

## Configuração

Os subagentes são configurados através do sistema de configuração de agentes do Qwen Code. Use o comando `/agents` para:

- Visualizar os subagentes disponíveis
- Criar novas configurações de subagentes
- Modificar as configurações existentes dos subagentes
- Definir permissões e capacidades das ferramentas

Para mais informações sobre como configurar subagentes, consulte a documentação dos subagentes.