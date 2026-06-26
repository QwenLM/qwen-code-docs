# Ferramentas do Qwen Code

O Qwen Code inclui ferramentas integradas que o modelo utiliza para interagir com seu ambiente local, acessar informações e executar ações. Essas ferramentas ampliam as capacidades da CLI, permitindo que ela vá além da geração de texto e auxilie em uma ampla variedade de tarefas.

## Visão geral das ferramentas do Qwen Code

No contexto do Qwen Code, ferramentas são funções ou módulos específicos que o modelo pode solicitar que sejam executados. Por exemplo, se você pedir ao modelo para "Resumir o conteúdo de `my_document.txt`", ele provavelmente identificará a necessidade de ler esse arquivo e solicitará a execução da ferramenta `read_file`.

O componente central (`packages/core`) gerencia essas ferramentas, apresenta suas definições (schemas) ao modelo, as executa quando solicitado e retorna os resultados ao modelo para processamento adicional em uma resposta para o usuário.

Essas ferramentas oferecem as seguintes capacidades:

- **Acessar informações locais:** As ferramentas permitem que o modelo acesse seu sistema de arquivos local, leia conteúdos de arquivos, liste diretórios, etc.
- **Executar comandos:** Com ferramentas como `run_shell_command`, o modelo pode executar comandos shell (com medidas de segurança adequadas e confirmação do usuário).
- **Interagir com a web:** As ferramentas podem buscar conteúdo de URLs.
- **Realizar ações:** As ferramentas podem modificar arquivos, escrever novos arquivos ou realizar outras ações em seu sistema (novamente, normalmente com salvaguardas).
- **Fundamentar respostas:** Ao usar ferramentas para buscar dados em tempo real ou dados locais específicos, as respostas podem ser mais precisas, relevantes e fundamentadas em seu contexto real.

## Como usar as ferramentas do Qwen Code

Para usar as ferramentas do Qwen Code, forneça um prompt para a CLI. O processo funciona da seguinte forma:

1.  Você fornece um prompt para a CLI.
2.  A CLI envia o prompt para o core.
3.  O core, juntamente com seu prompt e histórico da conversa, envia uma lista de ferramentas disponíveis e suas descrições/schemas para a API do modelo configurada.
4.  O modelo analisa sua solicitação. Se determinar que uma ferramenta é necessária, sua resposta incluirá uma solicitação para executar uma ferramenta específica com determinados parâmetros.
5.  O core recebe essa solicitação de ferramenta, valida-a e (geralmente após confirmação do usuário para operações sensíveis) executa a ferramenta.
6.  A saída da ferramenta é enviada de volta ao modelo.
7.  O modelo usa a saída da ferramenta para formular sua resposta final, que é então enviada de volta pelo core para a CLI e exibida para você.

Você normalmente verá mensagens na CLI indicando quando uma ferramenta está sendo chamada e se ela foi bem-sucedida ou falhou.

## Segurança e confirmação

Muitas ferramentas, especialmente aquelas que podem modificar seu sistema de arquivos ou executar comandos (`write_file`, `edit`, `run_shell_command`), são projetadas com a segurança em mente. O Qwen Code normalmente irá:

- **Exigir confirmação:** Solicitar sua confirmação antes de executar operações potencialmente sensíveis, mostrando qual ação está prestes a ser tomada.
- **Utilizar sandboxing:** Todas as ferramentas estão sujeitas a restrições impostas pelo sandboxing (veja [Sandboxing no Qwen Code](./sandbox.md)). Isso significa que, ao operar em um sandbox, todas as ferramentas (incluindo servidores MCP) que você deseja usar devem estar disponíveis _dentro_ do ambiente de sandbox. Por exemplo, para executar um servidor MCP via `npx`, o executável `npx` deve estar instalado na imagem Docker do sandbox ou estar disponível no ambiente `sandbox-exec`.

É importante sempre revisar os prompts de confirmação cuidadosamente antes de permitir que uma ferramenta prossiga.

## Saiba mais sobre as ferramentas do Qwen Code

As ferramentas integradas do Qwen Code podem ser amplamente categorizadas da seguinte forma:

- **[Ferramentas do Sistema de Arquivos](./file-system.md):** Para interagir com arquivos e diretórios (ler, escrever, listar, pesquisar, etc.).
- **[Ferramenta Shell](./shell.md) (`run_shell_command`):** Para executar comandos shell.
- **[Ferramenta Monitor](./monitor.md) (`monitor`):** Para executar comandos shell de longa duração que transmitem saída como notificações de tarefas em segundo plano.
- **[Ferramenta Web Fetch](./web-fetch.md) (`web_fetch`):** Para recuperar conteúdo de URLs.
- **[Ferramenta Todo Write](./todo-write.md) (`todo_write`):** Para criar e gerenciar listas de tarefas estruturadas durante sessões de codificação.
- **[Ferramenta Agent](./task.md) (`agent`):** Para delegar tarefas complexas a subagentes especializados.
- **[Ferramenta Exit Plan Mode](./exit-plan-mode.md) (`exit_plan_mode`):** Para sair do modo de planejamento e prosseguir com a implementação.

Além disso, essas ferramentas incorporam:

- **[Servidores MCP](./mcp-server.md)**: Os servidores MCP atuam como uma ponte entre o modelo e seu ambiente local ou outros serviços como APIs.
  - **[Guia do Usuário MCP](../../users/features/mcp.md)**: Configure servidores MCP e gerencie-os a partir do Qwen Code
  - **[Pesquisa Web via MCP](./web-search.md)**: Conecte-se a serviços de pesquisa web (Bailian, Tavily, GLM) através do MCP
- **[Sandboxing](./sandbox.md)**: O sandboxing isola o modelo e suas alterações do seu ambiente para reduzir riscos potenciais.