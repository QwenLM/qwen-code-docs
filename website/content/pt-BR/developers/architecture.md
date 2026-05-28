---
description: "Entenda a arquitetura do Qwen Code com módulos principais, fluxo de dados e limites de extensão para contribuir, depurar problemas e planejar features."
---

# Visão geral da arquitetura do Qwen Code

Este documento fornece uma visão geral de alto nível da arquitetura do Qwen Code.

## Componentes principais

O Qwen Code é composto principalmente por dois pacotes principais, além de um conjunto de ferramentas que podem ser usadas pelo sistema durante o processamento de entradas na linha de comando:

### 1. Pacote CLI (`packages/cli`)

**Propósito:** Contém a parte do Qwen Code voltada ao usuário, como o processamento da entrada inicial, a apresentação da saída final e o gerenciamento da experiência geral do usuário.

**Funções principais:**

- **Processamento de entrada:** Gerencia a entrada do usuário por meio de vários métodos, incluindo digitação direta de texto, comandos com barra (ex.: `/help`, `/clear`, `/model`), comandos com `@` (`@file` para incluir conteúdo de arquivos) e comandos com `!` (`!command` para execução no shell).
- **Gerenciamento de histórico:** Mantém o histórico de conversas e permite recursos como retomada de sessão.
- **Renderização de exibição:** Formata e apresenta as respostas ao usuário no terminal com destaque de sintaxe e formatação adequada.
- **Personalização de tema e UI:** Suporta temas e elementos de UI personalizáveis para uma experiência personalizada.
- **Configurações:** Gerencia diversas opções de configuração por meio de arquivos de configuração JSON, variáveis de ambiente e argumentos de linha de comando.

### 2. Pacote Core (`packages/core`)

**Propósito:** Atua como o backend do Qwen Code. Recebe as solicitações enviadas pelo `packages/cli`, orquestra as interações com a API do modelo configurado e gerencia a execução das ferramentas disponíveis.

**Funções principais:**

- **Cliente de API:** Comunica-se com a API do modelo Qwen para enviar prompts e receber respostas.
- **Construção de prompts:** Cria prompts adequados para o modelo, incorporando o histórico de conversas e as definições das ferramentas disponíveis.
- **Registro e execução de ferramentas:** Gerencia o registro das ferramentas disponíveis e as executa com base nas solicitações do modelo.
- **Gerenciamento de estado:** Mantém as informações de estado da conversa e da sessão.
- **Configuração do lado do servidor:** Gerencia a configuração e as definições do lado do servidor.

### 3. Ferramentas (`packages/core/src/tools/`)

**Propósito:** São módulos individuais que estendem as capacidades do modelo Qwen, permitindo que ele interaja com o ambiente local (ex.: sistema de arquivos, comandos de shell, busca na web).

**Interação:** O `packages/core` invoca essas ferramentas com base nas solicitações do modelo Qwen.

**Ferramentas comuns incluem:**

- **Operações com arquivos:** Leitura, escrita e edição de arquivos
- **Comandos de shell:** Execução de comandos do sistema com aprovação do usuário para operações potencialmente perigosas
- **Ferramentas de busca:** Localização de arquivos e busca de conteúdo dentro do projeto
- **Ferramentas web:** Busca de conteúdo na web
- **Integração com MCP:** Conexão com servidores do Model Context Protocol para capacidades estendidas

## Fluxo de interação

Uma interação típica com o Qwen Code segue este fluxo:

1.  **Entrada do usuário:** O usuário digita um prompt ou comando no terminal, que é gerenciado pelo `packages/cli`.
2.  **Solicitação ao Core:** O `packages/cli` envia a entrada do usuário para o `packages/core`.
3.  **Processamento da solicitação:** O pacote core:
    - Constrói um prompt adequado para a API do modelo configurado, possivelmente incluindo o histórico de conversas e as definições das ferramentas disponíveis.
    - Envia o prompt para a API do modelo.
4.  **Resposta da API do modelo:** A API do modelo processa o prompt e retorna uma resposta. Essa resposta pode ser uma resposta direta ou uma solicitação para usar uma das ferramentas disponíveis.
5.  **Execução de ferramenta (se aplicável):**
    - Quando a API do modelo solicita uma ferramenta, o pacote core se prepara para executá-la.
    - Se a ferramenta solicitada puder modificar o sistema de arquivos ou executar comandos de shell, o usuário recebe primeiro os detalhes da ferramenta e seus argumentos, e deve aprovar a execução.
    - Operações somente leitura, como a leitura de arquivos, podem não exigir confirmação explícita do usuário para prosseguir.
    - Após a confirmação, ou se a confirmação não for necessária, o pacote core executa a ação relevante na ferramenta correspondente e o resultado é enviado de volta à API do modelo pelo pacote core.
    - A API do modelo processa o resultado da ferramenta e gera uma resposta final.
6.  **Resposta para a CLI:** O pacote core envia a resposta final de volta ao pacote CLI.
7.  **Exibição para o usuário:** O pacote CLI formata e exibe a resposta para o usuário no terminal.

## Opções de configuração

O Qwen Code oferece várias maneiras de configurar seu comportamento:

### Camadas de configuração (em ordem de precedência)

1. Argumentos de linha de comando
2. Variáveis de ambiente
3. Arquivo de configurações do projeto (`.qwen/settings.json`)
4. Arquivo de configurações do usuário (`~/.qwen/settings.json`)
5. Arquivos de configurações do sistema
6. Valores padrão

### Principais categorias de configuração

- **Configurações gerais:** modo vim, editor preferido, preferências de atualização automática
- **Configurações de UI:** Personalização de tema, visibilidade do banner, exibição do rodapé
- **Configurações do modelo:** Seleção de modelo, limites de turnos da sessão, configurações de compressão
- **Configurações de contexto:** Nomes de arquivos de contexto, inclusão de diretórios, filtragem de arquivos
- **Configurações de ferramentas:** Modos de aprovação, sandboxing, restrições de ferramentas
- **Configurações de privacidade:** Coleta de estatísticas de uso
- **Configurações avançadas:** Opções de debug, comandos personalizados para relatar bugs

## Princípios de design principais

- **Modularidade:** Separar a CLI (frontend) do Core (backend) permite desenvolvimento independente e extensões futuras em potencial (ex.: diferentes frontends para o mesmo backend).
- **Extensibilidade:** O sistema de ferramentas é projetado para ser extensível, permitindo que novas capacidades sejam adicionadas por meio de ferramentas personalizadas ou integração com servidores MCP.
- **Experiência do usuário:** A CLI foca em fornecer uma experiência de terminal rica e interativa com recursos como destaque de sintaxe, temas personalizáveis e estruturas de comando intuitivas.
- **Segurança:** Implementa mecanismos de aprovação para operações potencialmente perigosas e opções de sandboxing para proteger o sistema do usuário.
- **Flexibilidade:** Suporta múltiplos métodos de configuração e pode se adaptar a diferentes fluxos de trabalho e ambientes.