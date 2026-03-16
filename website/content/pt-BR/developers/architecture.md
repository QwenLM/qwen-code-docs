# Visão Geral da Arquitetura do Qwen Code

Este documento fornece uma visão geral de alto nível da arquitetura do Qwen Code.

## Componentes Principais

O Qwen Code é composto principalmente por dois pacotes principais, além de um conjunto de ferramentas que podem ser usadas pelo sistema durante o processamento de entradas via linha de comando:

### 1. Pacote da CLI (`packages/cli`)

**Finalidade:** Este pacote contém a parte voltada para o usuário do Qwen Code, como o tratamento da entrada inicial do usuário, a apresentação da saída final e o gerenciamento da experiência geral do usuário.

**Funções principais:**

- **Processamento de entrada:** Lida com a entrada do usuário por meio de diversos métodos, incluindo digitação direta de texto, comandos com barra (`/help`, `/clear`, `/model`), comandos com arroba (`@arquivo` para incluir o conteúdo de um arquivo) e comandos com ponto de exclamação (`!comando` para execução no shell).
- **Gerenciamento de histórico:** Mantém o histórico de conversas e habilita recursos como retomada de sessões.
- **Renderização de exibição:** Formata e apresenta as respostas ao usuário no terminal com realce de sintaxe e formatação adequada.
- **Personalização de tema e interface do usuário:** Oferece suporte à personalização de temas e elementos da interface do usuário para uma experiência adaptada às preferências do usuário.
- **Configurações:** Gerencia diversas opções de configuração por meio de arquivos JSON de configuração, variáveis de ambiente e argumentos da linha de comando.

### 2. Pacote Principal (`packages/core`)

**Finalidade:** Este pacote atua como o backend do Qwen Code. Ele recebe as solicitações enviadas pelo `packages/cli`, orquestra as interações com a API do modelo configurado e gerencia a execução das ferramentas disponíveis.

**Funções Principais:**

- **Cliente de API:** Comunica-se com a API do modelo Qwen para enviar prompts e receber respostas.
- **Construção de Prompts:** Monta prompts adequados para o modelo, incorporando o histórico da conversa e as definições das ferramentas disponíveis.
- **Registro e Execução de Ferramentas:** Gerencia o registro das ferramentas disponíveis e as executa com base nas solicitações do modelo.
- **Gerenciamento de Estado:** Mantém as informações de estado da conversa e da sessão.
- **Configuração no Lado do Servidor:** Lida com a configuração e as definições no lado do servidor.

### 3. Ferramentas (`packages/core/src/tools/`)

**Finalidade:** São módulos individuais que ampliam as capacidades do modelo Qwen, permitindo que ele interaja com o ambiente local (por exemplo, sistema de arquivos, comandos de shell, busca na web).

**Interação:** O pacote `packages/core` invoca essas ferramentas com base em solicitações do modelo Qwen.

**Ferramentas comuns incluem:**

- **Operações com arquivos:** Leitura, gravação e edição de arquivos  
- **Comandos de shell:** Execução de comandos do sistema com aprovação do usuário para operações potencialmente perigosas  
- **Ferramentas de busca:** Localização de arquivos e pesquisa de conteúdo dentro do projeto  
- **Ferramentas web:** Busca de conteúdo na web  
- **Integração com MCP:** Conexão a servidores Model Context Protocol para funcionalidades expandidas

## Fluxo de Interação

Uma interação típica com o Qwen Code segue este fluxo:

1.  **Entrada do Usuário:** O usuário digita um *prompt* ou comando no terminal, gerenciado pelo pacote `packages/cli`.
2.  **Solicitação ao Núcleo (*Core*):** O pacote `packages/cli` envia a entrada do usuário para o pacote `packages/core`.
3.  **Processamento da Solicitação:** O pacote *core*:
    - Monta um *prompt* apropriado para a API do modelo configurado, incluindo possivelmente o histórico da conversa e as definições das ferramentas disponíveis.
    - Envia o *prompt* para a API do modelo.
4.  **Resposta da API do Modelo:** A API do modelo processa o *prompt* e retorna uma resposta. Essa resposta pode ser uma resposta direta ou uma solicitação para usar uma das ferramentas disponíveis.
5.  **Execução da Ferramenta (se aplicável):**
    - Quando a API do modelo solicita uma ferramenta, o pacote *core* prepara sua execução.
    - Se a ferramenta solicitada puder modificar o sistema de arquivos ou executar comandos de shell, o usuário recebe primeiro os detalhes da ferramenta e de seus argumentos, devendo aprovar explicitamente a execução.
    - Operações somente de leitura, como leitura de arquivos, podem não exigir confirmação explícita do usuário para prosseguir.
    - Após a confirmação (ou se ela não for necessária), o pacote *core* executa a ação relevante dentro da ferramenta correspondente, e o resultado é enviado de volta à API do modelo pelo próprio pacote *core*.
    - A API do modelo processa o resultado da ferramenta e gera uma resposta final.
6.  **Resposta ao CLI:** O pacote *core* envia a resposta final de volta ao pacote CLI.
7.  **Exibição ao Usuário:** O pacote CLI formata e exibe a resposta ao usuário no terminal.

## Opções de Configuração

O Qwen Code oferece várias maneiras de configurar seu comportamento:

### Camadas de Configuração (em ordem de precedência)

1. Argumentos da linha de comando  
2. Variáveis de ambiente  
3. Arquivo de configurações do projeto (`.qwen/settings.json`)  
4. Arquivo de configurações do usuário (`~/.qwen/settings.json`)  
5. Arquivos de configurações do sistema  
6. Valores padrão  

### Principais Categorias de Configuração

- **Configurações Gerais:** modo vim, editor preferido, preferências de atualização automática  
- **Configurações de Interface:** personalização do tema, visibilidade do banner, exibição do rodapé  
- **Configurações de Modelo:** seleção do modelo, limite de turnos por sessão, configurações de compactação  
- **Configurações de Contexto:** nomes dos arquivos de contexto, inclusão de diretórios, filtragem de arquivos  
- **Configurações de Ferramentas:** modos de aprovação, uso de sandbox, restrições a ferramentas  
- **Configurações de Privacidade:** coleta de estatísticas de uso  
- **Configurações Avançadas:** opções de depuração, comandos personalizados para relatórios de bugs

## Principais Princípios de Design

- **Modularidade:** Separar a CLI (interface) do Core (backend) permite desenvolvimento independente e possíveis extensões futuras (por exemplo, diferentes interfaces para o mesmo backend).
- **Extensibilidade:** O sistema de ferramentas foi projetado para ser extensível, permitindo que novas funcionalidades sejam adicionadas por meio de ferramentas personalizadas ou integração com servidores MCP.
- **Experiência do Usuário:** A CLI prioriza uma experiência rica e interativa no terminal, com recursos como realce de sintaxe, temas personalizáveis e estruturas de comandos intuitivas.
- **Segurança:** Implementa mecanismos de aprovação para operações potencialmente perigosas e opções de sandboxing para proteger o sistema do usuário.
- **Flexibilidade:** Suporta múltiplos métodos de configuração e pode se adaptar a diferentes fluxos de trabalho e ambientes.