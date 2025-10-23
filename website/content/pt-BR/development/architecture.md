# Visão Geral da Arquitetura do Qwen Code

Este documento fornece uma visão geral de alto nível da arquitetura do Qwen Code.

## Componentes principais

O Qwen Code é composto principalmente por dois pacotes principais, juntamente com um conjunto de ferramentas que podem ser utilizadas pelo sistema durante o processamento de comandos via CLI:

1.  **Pacote CLI (`packages/cli`):**
    - **Propósito:** Contém a parte voltada ao usuário do Qwen Code, como o tratamento da entrada inicial do usuário, a apresentação da saída final e o gerenciamento da experiência geral do usuário.
    - **Principais funções contidas no pacote:**
      - [Processamento de entrada](./cli/commands.md)
      - Gerenciamento de histórico
      - Renderização de display
      - [Customização de tema e UI](./cli/themes.md)
      - [Configurações do CLI](./cli/configuration.md)

2.  **Pacote Core (`packages/core`):**
    - **Propósito:** Atua como o backend do Qwen Code. Ele recebe requisições enviadas pelo `packages/cli`, orquestra interações com a API do modelo configurado e gerencia a execução das ferramentas disponíveis.
    - **Principais funções contidas no pacote:**
      - Cliente da API para comunicação com a Google Gemini API
      - Construção e gerenciamento de prompts
      - Lógica de registro e execução de ferramentas
      - Gerenciamento de estado para conversas ou sessões
      - Configurações do lado do servidor

3.  **Ferramentas (`packages/core/src/tools/`):**
    - **Propósito:** São módulos individuais que estendem as capacidades do modelo Gemini, permitindo que ele interaja com o ambiente local (ex: sistema de arquivos, comandos shell, requisições web).
    - **Interação:** O `packages/core` invoca essas ferramentas com base nas requisições feitas pelo modelo Gemini.

## Fluxo de Interação

Uma interação típica com o Qwen Code segue este fluxo:

1.  **Entrada do usuário:** O usuário digita um prompt ou comando no terminal, que é gerenciado pelo `packages/cli`.
2.  **Requisição para o core:** O `packages/cli` envia a entrada do usuário para o `packages/core`.
3.  **Processamento da requisição:** O pacote core:
    - Constrói um prompt apropriado para a API do modelo configurado, possivelmente incluindo o histórico da conversa e as definições das ferramentas disponíveis.
    - Envia o prompt para a API do modelo.
4.  **Resposta da API do modelo:** A API do modelo processa o prompt e retorna uma resposta. Essa resposta pode ser uma resposta direta ou uma solicitação para usar uma das ferramentas disponíveis.
5.  **Execução da ferramenta (se aplicável):**
    - Quando a API do modelo solicita uma ferramenta, o pacote core se prepara para executá-la.
    - Se a ferramenta solicitada puder modificar o sistema de arquivos ou executar comandos shell, primeiro são exibidos ao usuário os detalhes da ferramenta e seus argumentos, e o usuário deve aprovar a execução.
    - Operações somente leitura, como ler arquivos, podem não exigir confirmação explícita do usuário para prosseguir.
    - Uma vez confirmada, ou se a confirmação não for necessária, o pacote core executa a ação relevante dentro da ferramenta correspondente, e o resultado é enviado de volta à API do modelo pelo pacote core.
    - A API do modelo processa o resultado da ferramenta e gera uma resposta final.
6.  **Resposta para o CLI:** O pacote core envia a resposta final de volta ao pacote CLI.
7.  **Exibição ao usuário:** O pacote CLI formata e exibe a resposta ao usuário no terminal.

## Princípios de Design

- **Modularidade:** Separar o CLI (frontend) do Core (backend) permite desenvolvimento independente e possíveis extensões futuras (ex.: diferentes frontends para o mesmo backend).
- **Extensibilidade:** O sistema de tools foi projetado para ser extensível, permitindo que novas funcionalidades sejam adicionadas.
- **Experiência do usuário:** O CLI foca em fornecer uma experiência de terminal rica e interativa.