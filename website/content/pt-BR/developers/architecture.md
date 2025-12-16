# Visão Geral da Arquitetura do Qwen Code

Este documento fornece uma visão geral de alto nível da arquitetura do Qwen Code.

## Componentes Principais

O Qwen Code é composto principalmente por dois pacotes principais, juntamente com um conjunto de ferramentas que podem ser utilizadas pelo sistema no processo de tratamento da entrada via linha de comando:

### 1. Pacote CLI (`packages/cli`)

**Propósito:** Este contém a parte voltada ao usuário do Qwen Code, como o tratamento da entrada inicial do usuário, a apresentação da saída final e o gerenciamento da experiência geral do usuário.

**Funções Principais:**

- **Processamento de Entrada:** Trata a entrada do usuário por meio de vários métodos, incluindo digitação direta, comandos com barra (por exemplo, `/help`, `/clear`, `/model`), comandos com arroba (`@arquivo` para inclusão de conteúdo de arquivo) e comandos com ponto de exclamação (`!comando` para execução no shell).
- **Gerenciamento de Histórico:** Mantém o histórico das conversas e permite recursos como retomada de sessão.
- **Renderização de Exibição:** Formata e apresenta as respostas ao usuário no terminal com destaque de sintaxe e formatação adequada.
- **Personalização de Tema e Interface:** Oferece suporte a temas personalizáveis e elementos de interface para uma experiência adaptada.
- **Configurações:** Gerencia várias opções de configuração por meio de arquivos JSON, variáveis de ambiente e argumentos de linha de comando.

### 2. Pacote Principal (`packages/core`)

**Propósito:** Este age como o backend do Qwen Code. Ele recebe solicitações enviadas pelo `packages/cli`, orquestra interações com a API do modelo configurado e gerencia a execução das ferramentas disponíveis.

**Funções Principais:**

- **Cliente da API:** Comunica-se com a API do modelo Qwen para enviar prompts e receber respostas.
- **Construção de Prompts:** Cria prompts adequados para o modelo, incorporando histórico de conversa e definições das ferramentas disponíveis.
- **Registro e Execução de Ferramentas:** Gerencia o registro das ferramentas disponíveis e as executa com base nas solicitações do modelo.
- **Gerenciamento de Estado:** Mantém informações sobre o estado da conversa e da sessão.
- **Configuração no Servidor:** Trata das configurações e parâmetros do lado do servidor.

### 3. Ferramentas (`packages/core/src/tools/`)

**Propósito:** São módulos individuais que estendem as capacidades do modelo Qwen, permitindo que ele interaja com o ambiente local (por exemplo, sistema de arquivos, comandos shell, busca na web).

**Interação:** `packages/core` invoca essas ferramentas com base em solicitações do modelo Qwen.

**Ferramentas Comuns Incluem:**

- **Operações com Arquivos:** Leitura, escrita e edição de arquivos
- **Comandos Shell:** Execução de comandos do sistema com aprovação do usuário para operações potencialmente perigosas
- **Ferramentas de Busca:** Localização de arquivos e pesquisa de conteúdo dentro do projeto
- **Ferramentas Web:** Obtenção de conteúdo da web
- **Integração MCP:** Conexão a servidores do Model Context Protocol para funcionalidades estendidas

## Fluxo de Interação

Uma interação típica com o Qwen Code segue este fluxo:

1.  **Entrada do Usuário:** O usuário digita um prompt ou comando no terminal, que é gerenciado por `packages/cli`.
2.  **Requisição ao Core:** `packages/cli` envia a entrada do usuário para `packages/core`.
3.  **Processamento da Requisição:** O pacote core:
    - Constrói um prompt apropriado para a API do modelo configurado, possivelmente incluindo o histórico da conversa e as definições de ferramentas disponíveis.
    - Envia o prompt para a API do modelo.
4.  **Resposta da API do Modelo:** A API do modelo processa o prompt e retorna uma resposta. Esta resposta pode ser uma resposta direta ou uma solicitação para usar uma das ferramentas disponíveis.
5.  **Execução da Ferramenta (se aplicável):**
    - Quando a API do modelo solicita uma ferramenta, o pacote core se prepara para executá-la.
    - Se a ferramenta solicitada puder modificar o sistema de arquivos ou executar comandos shell, primeiro são fornecidos ao usuário os detalhes da ferramenta e seus argumentos, e o usuário deve aprovar a execução.
    - Operações somente leitura, como ler arquivos, podem não exigir confirmação explícita do usuário para prosseguir.
    - Uma vez confirmada, ou se a confirmação não for necessária, o pacote core executa a ação relevante dentro da ferramenta relevante, e o resultado é enviado de volta à API do modelo pelo pacote core.
    - A API do modelo processa o resultado da ferramenta e gera uma resposta final.
6.  **Resposta ao CLI:** O pacote core envia a resposta final de volta ao pacote CLI.
7.  **Exibição ao Usuário:** O pacote CLI formata e exibe a resposta ao usuário no terminal.

## Opções de Configuração

O Qwen Code oferece múltiplas formas de configurar seu comportamento:

### Camadas de Configuração (em ordem de precedência)

1. Argumentos de linha de comando
2. Variáveis de ambiente
3. Arquivo de configurações do projeto (`.qwen/settings.json`)
4. Arquivo de configurações do usuário (`~/.qwen/settings.json`)
5. Arquivos de configurações do sistema
6. Valores padrão

### Principais Categorias de Configuração

- **Configurações Gerais:** modo vim, editor preferido, preferências de atualização automática
- **Configurações da Interface:** Personalização de tema, visibilidade do banner, exibição do rodapé
- **Configurações do Modelo:** Seleção de modelo, limites de turnos da sessão, configurações de compactação
- **Configurações de Contexto:** Nomes de arquivos de contexto, inclusão de diretórios, filtragem de arquivos
- **Configurações de Ferramentas:** Modos de aprovação, sandboxing, restrições de ferramentas
- **Configurações de Privacidade:** Coleta de estatísticas de uso
- **Configurações Avançadas:** Opções de depuração, comandos personalizados para relatórios de bugs

## Princípios de Design Principais

- **Modularidade:** Separar o CLI (frontend) do Core (backend) permite desenvolvimento independente e possíveis extensões futuras (por exemplo, diferentes frontends para o mesmo backend).
- **Extensibilidade:** O sistema de ferramentas é projetado para ser extensível, permitindo que novas funcionalidades sejam adicionadas por meio de ferramentas personalizadas ou integração com servidores MCP.
- **Experiência do Usuário:** O CLI foca em fornecer uma experiência rica e interativa no terminal com recursos como destaque de sintaxe, temas personalizáveis e estruturas de comandos intuitivas.
- **Segurança:** Implementa mecanismos de aprovação para operações potencialmente perigosas e opções de sandboxing para proteger o sistema do usuário.
- **Flexibilidade:** Suporta múltiplos métodos de configuração e pode se adaptar a diferentes fluxos de trabalho e ambientes.