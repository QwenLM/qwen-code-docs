# Ferramentas de Código Qwen

O Qwen Code inclui ferramentas integradas que o modelo utiliza para interagir com seu ambiente local, acessar informações e realizar ações. Essas ferramentas ampliam os recursos da CLI, permitindo que ela vá além da geração de texto e auxilie em uma ampla variedade de tarefas.

## Visão geral das ferramentas do Qwen Code

No contexto do Qwen Code, as ferramentas são funções ou módulos específicos que o modelo pode solicitar para serem executados. Por exemplo, se você pedir ao modelo para "Resumir o conteúdo de `my_document.txt`", ele provavelmente identificará a necessidade de ler esse arquivo e solicitará a execução da ferramenta `read_file`.

O componente principal (`packages/core`) gerencia essas ferramentas, apresenta suas definições (esquemas) ao modelo, as executa quando solicitado e retorna os resultados ao modelo para processamento adicional em uma resposta voltada ao usuário.

Essas ferramentas fornecem os seguintes recursos:

- **Acesso a informações locais:** As ferramentas permitem que o modelo acesse seu sistema de arquivos local, leia conteúdos de arquivos, liste diretórios, etc.
- **Execução de comandos:** Com ferramentas como `run_shell_command`, o modelo pode executar comandos shell (com medidas de segurança adequadas e confirmação do usuário).
- **Interação com a web:** As ferramentas podem buscar conteúdo de URLs.
- **Execução de ações:** As ferramentas podem modificar arquivos, escrever novos arquivos ou realizar outras ações em seu sistema (novamente, normalmente com proteções).
- **Respostas embasadas:** Ao usar ferramentas para buscar dados em tempo real ou específicos do ambiente local, as respostas podem ser mais precisas, relevantes e embasadas no seu contexto real.

## Como usar as ferramentas de código do Qwen

Para usar as ferramentas de código do Qwen, forneça um prompt ao CLI. O processo funciona da seguinte forma:

1.  Você fornece um prompt ao CLI.
2.  O CLI envia o prompt para o núcleo.
3.  O núcleo, juntamente com seu prompt e histórico de conversa, envia uma lista das ferramentas disponíveis e suas descrições/esquemas para a API do modelo configurado.
4.  O modelo analisa sua solicitação. Se determinar que uma ferramenta é necessária, sua resposta incluirá uma solicitação para executar uma ferramenta específica com determinados parâmetros.
5.  O núcleo recebe essa solicitação de ferramenta, a valida e (geralmente após confirmação do usuário para operações sensíveis) executa a ferramenta.
6.  A saída da ferramenta é enviada de volta ao modelo.
7.  O modelo usa a saída da ferramenta para formular sua resposta final, que é então enviada de volta através do núcleo ao CLI e exibida para você.

Você normalmente verá mensagens no CLI indicando quando uma ferramenta está sendo chamada e se ela teve sucesso ou falhou.

## Segurança e confirmação

Muitas ferramentas, especialmente aquelas que podem modificar seu sistema de arquivos ou executar comandos (`write_file`, `edit`, `run_shell_command`), são projetadas com segurança em mente. O Qwen Code normalmente irá:

- **Exigir confirmação:** Solicitar sua aprovação antes de executar operações potencialmente sensíveis, mostrando qual ação está prestes a ser realizada.
- **Utilizar sandboxing:** Todas as ferramentas estão sujeitas a restrições impostas pelo sandboxing (veja [Sandboxing no Qwen Code](../sandbox.md)). Isso significa que, ao operar em um ambiente sandbox, qualquer ferramenta que você deseje usar (incluindo servidores MCP) deve estar disponível _dentro_ do ambiente sandbox. Por exemplo, para executar um servidor MCP através do `npx`, o executável `npx` deve estar instalado dentro da imagem Docker do sandbox ou estar disponível no ambiente `sandbox-exec`.

É importante sempre revisar cuidadosamente os prompts de confirmação antes de permitir que uma ferramenta prossiga.

## Saiba mais sobre as ferramentas do Qwen Code

As ferramentas integradas do Qwen Code podem ser categorizadas da seguinte forma:

- **[Ferramentas do Sistema de Arquivos](./file-system.md):** Para interagir com arquivos e diretórios (leitura, escrita, listagem, busca, etc.).
- **[Ferramenta Shell](./shell.md) (`run_shell_command`):** Para executar comandos shell.
- **[Ferramenta Web Fetch](./web-fetch.md) (`web_fetch`):** Para recuperar conteúdo de URLs.
- **[Ferramenta Web Search](./web-search.md) (`web_search`):** Para pesquisar na web.
- **[Ferramenta Multi-File Read](./multi-file.md) (`read_many_files`):** Uma ferramenta especializada para ler conteúdo de múltiplos arquivos ou diretórios, frequentemente usada pelo comando `@`.
- **[Ferramenta de Memória](./memory.md) (`save_memory`):** Para salvar e recuperar informações entre sessões.
- **[Ferramenta Todo Write](./todo-write.md) (`todo_write`):** Para criar e gerenciar listas de tarefas estruturadas durante sessões de codificação.
- **[Ferramenta Task](./task.md) (`task`):** Para delegar tarefas complexas a subagentes especializados.
- **[Ferramenta Exit Plan Mode](./exit-plan-mode.md) (`exit_plan_mode`):** Para sair do modo plano e prosseguir com a implementação.

Além disso, essas ferramentas incorporam:

- **[Servidores MCP](./mcp-server.md)**: Os servidores MCP atuam como uma ponte entre o modelo e seu ambiente local ou outros serviços como APIs.
  - **[Guia Rápido de Início com MCP](../mcp-quick-start.md)**: Comece a usar o MCP em 5 minutos com exemplos práticos
  - **[Configurações de Exemplo do MCP](../mcp-example-configs.md)**: Configurações prontas para uso em cenários comuns
  - **[Teste e Validação do MCP](../mcp-testing-validation.md)**: Teste e valide suas configurações de servidor MCP
- **[Sandboxing](../sandbox.md)**: O sandboxing isola o modelo e suas alterações do seu ambiente para reduzir riscos potenciais.