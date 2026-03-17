# Ferramentas do Qwen Code

O Qwen Code inclui ferramentas integradas que o modelo usa para interagir com seu ambiente local, acessar informações e executar ações. Essas ferramentas ampliam as capacidades da CLI, permitindo que ela vá além da geração de texto e auxilie em uma ampla variedade de tarefas.

## Visão geral das ferramentas do Qwen Code

No contexto do Qwen Code, ferramentas são funções ou módulos específicos que o modelo pode solicitar para execução. Por exemplo, se você pedir ao modelo para “Resumir o conteúdo de `my_document.txt`”, ele provavelmente identificará a necessidade de ler esse arquivo e solicitará a execução da ferramenta `read_file`.

O componente principal (`packages/core`) gerencia essas ferramentas, apresenta suas definições (esquemas) ao modelo, executa-as quando solicitadas e retorna os resultados ao modelo para processamento adicional em uma resposta voltada ao usuário.

Essas ferramentas oferecem as seguintes capacidades:

- **Acesso a informações locais:** As ferramentas permitem que o modelo acesse seu sistema de arquivos local, leia conteúdos de arquivos, liste diretórios etc.
- **Execução de comandos:** Com ferramentas como `run_shell_command`, o modelo pode executar comandos de shell (com as devidas medidas de segurança e confirmação do usuário).
- **Interação com a web:** As ferramentas podem buscar conteúdo de URLs.
- **Realização de ações:** As ferramentas podem modificar arquivos, criar novos arquivos ou executar outras ações no seu sistema (novamente, normalmente com mecanismos de proteção).
- **Fundamentação das respostas:** Ao usar ferramentas para buscar dados em tempo real ou dados locais específicos, as respostas tornam-se mais precisas, relevantes e fundamentadas no seu contexto real.

## Como usar as ferramentas do Qwen Code

Para usar as ferramentas do Qwen Code, forneça um *prompt* à CLI. O processo funciona da seguinte forma:

1.  Você fornece um *prompt* à CLI.
2.  A CLI envia o *prompt* para o núcleo (*core*).
3.  O núcleo, juntamente com seu *prompt* e o histórico da conversa, envia uma lista das ferramentas disponíveis e suas descrições/esquemas à API do modelo configurado.
4.  O modelo analisa sua solicitação. Se determinar que uma ferramenta é necessária, sua resposta incluirá uma solicitação para executar uma ferramenta específica com determinados parâmetros.
5.  O núcleo recebe essa solicitação de ferramenta, valida-a e (geralmente após confirmação do usuário para operações sensíveis) executa a ferramenta.
6.  A saída da ferramenta é enviada de volta ao modelo.
7.  O modelo usa a saída da ferramenta para formular sua resposta final, que é então enviada de volta pelo núcleo à CLI e exibida para você.

Normalmente, você verá mensagens na CLI indicando quando uma ferramenta está sendo chamada e se ela teve sucesso ou falhou.

## Segurança e confirmação

Muitas ferramentas, especialmente aquelas que podem modificar seu sistema de arquivos ou executar comandos (`write_file`, `edit`, `run_shell_command`), são projetadas com segurança em mente. O Qwen Code normalmente:

- **Exige confirmação:** Solicita sua autorização antes de executar operações potencialmente sensíveis, mostrando exatamente qual ação será realizada.
- **Utiliza sandboxing:** Todas as ferramentas estão sujeitas às restrições impostas pelo sandboxing (veja [Sandboxing no Qwen Code](../sandbox.md)). Isso significa que, ao operar em um sandbox, quaisquer ferramentas (incluindo servidores MCP) que você desejar usar devem estar disponíveis _dentro_ do ambiente do sandbox. Por exemplo, para executar um servidor MCP por meio do `npx`, o executável `npx` deve estar instalado na imagem Docker do sandbox ou disponível no ambiente `sandbox-exec`.

É fundamental sempre analisar com atenção os prompts de confirmação antes de permitir que uma ferramenta prossiga.

## Saiba mais sobre as ferramentas do Qwen Code

As ferramentas embutidas do Qwen Code podem ser amplamente categorizadas da seguinte forma:

- **[Ferramentas do Sistema de Arquivos](./file-system.md):** Para interagir com arquivos e diretórios (leitura, gravação, listagem, pesquisa etc.).
- **[Ferramenta Shell](./shell.md) (`run_shell_command`):** Para executar comandos shell.
- **[Ferramenta de Busca na Web](./web-fetch.md) (`web_fetch`):** Para recuperar conteúdo de URLs.
- **[Ferramenta de Pesquisa na Web](./web-search.md) (`web_search`):** Para pesquisar na web.
- **[Ferramenta de Leitura de Múltiplos Arquivos](./multi-file.md) (`read_many_files`):** Uma ferramenta especializada para ler conteúdo de múltiplos arquivos ou diretórios, frequentemente usada pelo comando `@`.
- **[Ferramenta de Memória](./memory.md) (`save_memory`):** Para salvar e recuperar informações entre sessões.
- **[Ferramenta de Escrita de Tarefas](./todo-write.md) (`todo_write`):** Para criar e gerenciar listas estruturadas de tarefas durante sessões de programação.
- **[Ferramenta de Tarefa](./task.md) (`task`):** Para delegar tarefas complexas a subagentes especializados.
- **[Ferramenta para Sair do Modo de Planejamento](./exit-plan-mode.md) (`exit_plan_mode`):** Para sair do modo de planejamento e prosseguir com a implementação.

Além disso, essas ferramentas incorporam:

- **[Servidores MCP](./mcp-server.md)**: Servidores MCP atuam como uma ponte entre o modelo e seu ambiente local ou outros serviços, como APIs.
  - **[Guia Rápido de Início com MCP](../mcp-quick-start.md)**: Comece a usar o MCP em 5 minutos com exemplos práticos
  - **[Configurações Exemplo de MCP](../mcp-example-configs.md)**: Configurações prontas para uso em cenários comuns
  - **[Testes e Validação de MCP](../mcp-testing-validation.md)**: Teste e valide suas configurações de servidores MCP
- **[Sandboxing](../sandbox.md)**: O sandboxing isola o modelo e suas alterações do seu ambiente para reduzir riscos potenciais.