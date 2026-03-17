# Ferramenta de Tarefa (`task`)

Este documento descreve a ferramenta `task` para o Qwen Code.

## Descrição

Use `task` para iniciar um subagente especializado que lida com tarefas complexas e de várias etapas de forma autônoma. A ferramenta de tarefa delega o trabalho a agentes especializados, que podem operar de forma independente com acesso a seu próprio conjunto de ferramentas, permitindo a execução paralela de tarefas e expertise especializada.

### Argumentos

`task` aceita os seguintes argumentos:

- `description` (string, obrigatório): Uma breve descrição da tarefa (3–5 palavras) para fins de visibilidade e rastreamento pelo usuário.
- `prompt` (string, obrigatório): O prompt detalhado da tarefa a ser executado pelo subagente. Deve conter instruções completas para execução autônoma.
- `subagent_type` (string, obrigatório): O tipo de agente especializado a ser usado para essa tarefa. Deve corresponder a um dos subagentes configurados disponíveis.

## Como usar `task` com o Qwen Code

A ferramenta Task carrega dinamicamente os subagentes disponíveis a partir da sua configuração e delega tarefas a eles. Cada subagente é executado de forma independente e pode utilizar seu próprio conjunto de ferramentas, permitindo especialização e execução em paralelo.

Ao usar a ferramenta Task, o subagente:

1. Recebe o prompt da tarefa com total autonomia  
2. Executa a tarefa usando as ferramentas disponíveis  
3. Retorna uma mensagem final com o resultado  
4. É encerrado (subagentes são sem estado e de uso único)  

Uso:

```
task(description="Descrição breve da tarefa", prompt="Instruções detalhadas da tarefa para o subagente", subagent_type="nome_do_agente")
```

## Subagentes Disponíveis

Os subagentes disponíveis dependem da sua configuração. Tipos comuns de subagentes podem incluir:

- **finalidade-geral**: Para tarefas complexas de várias etapas que exigem diversas ferramentas  
- **revisor-de-código**: Para revisar e analisar a qualidade do código  
- **executador-de-testes**: Para executar testes e analisar os resultados  
- **escritor-de-documentação**: Para criar e atualizar documentação  

Você pode visualizar os subagentes disponíveis usando o comando `/agents` no Qwen Code.

## Recursos da Ferramenta de Tarefas

### Atualizações de Progresso em Tempo Real

A ferramenta de Tarefas fornece atualizações ao vivo que mostram:

- O status de execução dos subagentes  
- As chamadas individuais de ferramentas feitas pelo subagente  
- Os resultados das chamadas de ferramentas e quaisquer erros  
- O progresso geral da tarefa e seu status de conclusão  

### Execução Paralela

Você pode iniciar vários subagentes simultaneamente chamando a ferramenta de Tarefas várias vezes em uma única mensagem, permitindo a execução paralela de tarefas e maior eficiência.

### Especialização Específica

Cada subagente pode ser configurado com:

- Permissões específicas de acesso a ferramentas  
- Instruções e prompts de sistema especializados  
- Configurações personalizadas de modelo  
- Conhecimento e capacidades específicos de domínio  

## Exemplos de `task`

### Delegando para um agente de propósito geral

```
task(
  description="Refatoração de código",
  prompt="Por favor, refatore o módulo de autenticação em src/auth/ para usar padrões modernos async/await em vez de callbacks. Certifique-se de que todos os testes continuem passando e atualize qualquer documentação relacionada.",
  subagent_type="general-purpose"
)
```

### Executando tarefas em paralelo

# Iniciar revisão de código e execução de testes em paralelo
task(
  description="Revisão de código",
  prompt="Revise as alterações recentes no módulo de gerenciamento de usuários quanto à qualidade do código, questões de segurança e conformidade com as melhores práticas.",
  subagent_type="code-reviewer"
)

task(
  description="Executar testes",
  prompt="Execute a suíte completa de testes e analise quaisquer falhas. Forneça um resumo da cobertura de testes e recomendações para melhoria.",
  subagent_type="test-runner"
)
```

### Geração de documentação

```
task(
  description="Atualizar documentação",
  prompt="Gere uma documentação abrangente da API para os novos endpoints REST implementados no módulo de pedidos. Inclua exemplos de requisição/resposta e códigos de erro.",
  subagent_type="documentation-writer"
)
```

## Quando Usar a Ferramenta de Tarefa

Use a ferramenta de tarefa quando:

1. **Tarefas complexas com várias etapas** — Tarefas que exigem múltiplas operações e podem ser executadas de forma autônoma  
2. **Especialização técnica** — Tarefas que se beneficiam de conhecimento ou ferramentas específicas de um domínio  
3. **Execução em paralelo** — Quando você tem várias tarefas independentes que podem ser executadas simultaneamente  
4. **Necessidade de delegação** — Quando deseja atribuir uma tarefa completa, em vez de gerenciar detalhadamente cada etapa  
5. **Operações intensivas em recursos** — Tarefas que podem levar muito tempo ou consumir significativamente recursos computacionais  

## Quando NÃO Usar a Ferramenta de Tarefa

Não use a ferramenta de tarefa para:

- **Operações simples e de única etapa** — Use ferramentas diretas, como Ler, Editar etc.  
- **Tarefas interativas** — Tarefas que exigem comunicação bidirecional (ida e volta)  
- **Leituras específicas de arquivos** — Use diretamente a ferramenta Ler para melhor desempenho  
- **Pesquisas simples** — Use diretamente as ferramentas Grep ou Glob

## Observações Importantes

- **Execução sem estado**: Cada invocação de subagente é independente e não mantém memória de execuções anteriores  
- **Comunicação única**: Os subagentes fornecem apenas uma mensagem final com o resultado — não há comunicação contínua  
- **Prompts abrangentes**: Seu prompt deve conter todo o contexto e as instruções necessárias para execução autônoma  
- **Acesso a ferramentas**: Os subagentes têm acesso apenas às ferramentas configuradas especificamente em sua configuração  
- **Capacidade paralela**: Vários subagentes podem ser executados simultaneamente para maior eficiência  
- **Dependente da configuração**: Os tipos de subagentes disponíveis dependem da configuração do seu sistema  

## Configuração

Os subagentes são configurados por meio do sistema de configuração de agentes do Qwen Code. Use o comando `/agents` para:

- Visualizar os subagentes disponíveis  
- Criar novas configurações de subagentes  
- Modificar as configurações existentes de subagentes  
- Definir permissões e capacidades das ferramentas  

Para obter mais informações sobre como configurar subagentes, consulte a documentação de subagentes.