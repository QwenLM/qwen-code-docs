# Roadmap do Qwen Code

> **Objetivo**: Alinhar-se com a funcionalidade do produto do Claude Code, refinar continuamente os detalhes e aprimorar a experiência do usuário.

| Categoria                         | Fase 1                                                                                                                                                                            | Fase 2                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experiência do Usuário              | ✅ Interface de terminal<br>✅ Suporte ao protocolo OpenAI<br>✅ Configurações<br>✅ OAuth<br>✅ Controle de cache<br>✅ Memória<br>✅ Compactação<br>✅ Tema                          | Interface de usuário aprimorada<br>Assistente de primeiros passos (OnBoarding)<br>Visualizador de logs (LogView)<br>✅ Sessão<br>Permissões<br>🔄 Compatibilidade entre plataformas<br>✅ Plano de codificação<br>✅ Provedor Anthropic<br>✅ Entrada multimodal<br>✅ Interface web unificada |
| Fluxo de Trabalho de Codificação    | ✅ Comandos com barra (/)<br>✅ MCP<br>✅ Modo de planejamento (PlanMode)<br>✅ Escrita de tarefas (TodoWrite)<br>✅ Subagente<br>✅ Múltiplos modelos<br>✅ Gerenciamento de conversas<br>✅ Ferramentas (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks (gatilhos)<br>✅ Habilidade (Skill)<br>✅ Modo sem interface (Headless Mode)<br>✅ Ferramentas (WebSearch)<br>✅ Suporte a LSP<br>✅ Executor concorrente                                                                              |
| Construção de Capacidades Abertas  | ✅ Comandos personalizados                                                                                                                                                         | ✅ SDK do QwenCode<br>✅ Sistema de extensões                                                                                                                                          |
| Integração com o Ecossistema Comunitário |                                                                                                                                                                                    | ✅ Plugin para VS Code<br>✅ ACP/Zed<br>✅ GitHub Actions (GHA)                                                                                                                        |
| Capacidades Administrativas         | ✅ Estatísticas<br>✅ Feedback                                                                                                                                                      | Custos<br>Painel de controle (Dashboard)<br>✅ Diálogo de feedback do usuário                                                                                                          |

> Para mais detalhes, consulte a lista abaixo.

## Recursos

#### Recursos Concluídos

| Recurso                 | Versão    | Descrição                                                 | Categoria                         | Fase  |
| ----------------------- | --------- | --------------------------------------------------------- | --------------------------------- | ----- |
| **Plano de Codificação** | `V0.10.0` | Autenticação e modelos do Plano de Codificação da Alibaba Cloud | Experiência do Usuário            | 2     |
| Interface Web Unificada | `V0.9.0`  | Biblioteca compartilhada de componentes da interface web para VSCode/CLI | Experiência do Usuário            | 2     |
| Exportar Conversa       | `V0.8.0`  | Exportar sessões para Markdown/HTML/JSON/JSONL           | Experiência do Usuário            | 2     |
| Sistema de Extensões    | `V0.8.0`  | Gerenciamento completo de extensões com comandos em barra | Construção de Capacidades Abertas | 2     |
| Suporte a LSP           | `V0.7.0`  | Serviço experimental de LSP (`--experimental-lsp`)        | Fluxo de Trabalho de Codificação  | 2     |
| Provedor Anthropic      | `V0.7.0`  | Suporte ao provedor de API Anthropic                      | Experiência do Usuário            | 2     |
| Diálogo de Feedback do Usuário | `V0.7.0`  | Coleta de feedback dentro do aplicativo com mecanismo de fadiga | Capacidades Administrativas       | 2     |
| Executor Concorrente    | `V0.6.0`  | Execução em lote pela CLI com integração ao Git           | Fluxo de Trabalho de Codificação  | 2     |
| Entrada Multimodal      | `V0.6.0`  | Suporte a entrada de imagens, PDF, áudio e vídeo         | Experiência do Usuário            | 2     |
| Skill                   | `V0.6.0`  | Skills de IA personalizáveis e extensíveis (experimental) | Fluxo de Trabalho de Codificação  | 2     |
| Ações do GitHub         | `V0.5.0`  | qwen-code-action e automação                              | Integração ao Ecossistema Comunitário | 1     |
| Plugin do VSCode        | `V0.5.0`  | Extensão do VSCode                                        | Integração ao Ecossistema Comunitário | 1     |
| SDK do QwenCode         | `V0.4.0`  | SDK aberto para integração de terceiros                  | Construção de Capacidades Abertas | 1     |
| Sessão                  | `V0.4.0`  | Gerenciamento aprimorado de sessões                       | Experiência do Usuário            | 1     |
| Internacionalização (i18n) | `V0.3.0`  | Internacionalização e suporte a múltiplos idiomas          | Experiência do Usuário            | 1     |
| Modo Headless           | `V0.3.0`  | Modo headless (não interativo)                            | Fluxo de Trabalho de Codificação  | 1     |
| ACP/Zed                 | `V0.2.0`  | Integração com editores ACP e Zed                         | Integração ao Ecossistema Comunitário | 1     |
| Interface de Terminal   | `V0.1.0+` | Interface de usuário interativa no terminal             | Experiência do Usuário            | 1     |
| Configurações           | `V0.1.0+` | Sistema de gerenciamento de configurações                 | Experiência do Usuário            | 1     |
| Temas                   | `V0.1.0+` | Suporte a múltiplos temas                                | Experiência do Usuário            | 1     |
| Suporte ao Protocolo OpenAI | `V0.1.0+` | Suporte ao protocolo da API OpenAI                        | Experiência do Usuário            | 1     |
| Gerenciamento de Conversas | `V0.1.0+` | Gerenciamento de sessões (salvar, restaurar, navegar)    | Fluxo de Trabalho de Codificação  | 1     |
| MCP                     | `V0.1.0+` | Integração ao Model Context Protocol                      | Fluxo de Trabalho de Codificação  | 1     |
| Múltiplos Modelos       | `V0.1.0+` | Suporte a múltiplos modelos e alternância entre eles      | Fluxo de Trabalho de Codificação  | 1     |
| Comandos em Barra       | `V0.1.0+` | Sistema de comandos em barra                             | Fluxo de Trabalho de Codificação  | 1     |
| Ferramenta: Bash        | `V0.1.0+` | Ferramenta de execução de comandos shell (com parâmetro `is_background`) | Fluxo de Trabalho de Codificação  | 1     |
| Ferramenta: FileRead/EditFile | `V0.1.0+` | Ferramentas de leitura/gravação e edição de arquivos     | Fluxo de Trabalho de Codificação  | 1     |
| Comandos Personalizados | `V0.1.0+` | Carregamento de comandos personalizados                   | Construção de Capacidades Abertas | 1     |
| Feedback                | `V0.1.0+` | Mecanismo de feedback (comando `/bug`)                   | Capacidades Administrativas       | 1     |
| Estatísticas            | `V0.1.0+` | Estatísticas de uso e exibição de cotas                  | Capacidades Administrativas       | 1     |
| Memória                 | `V0.0.9+` | Gerenciamento de memória no nível de projeto e global    | Experiência do Usuário            | 1     |
| Controle de Cache       | `V0.0.9+` | Controle de cache de prompts (Anthropic, DashScope)       | Experiência do Usuário            | 1     |
| Modo de Planejamento (PlanMode) | `V0.0.14` | Modo de planejamento de tarefas                           | Fluxo de Trabalho de Codificação  | 1     |
| Compactação             | `V0.0.11` | Mecanismo de compactação de conversas                    | Experiência do Usuário            | 1     |
| Subagente               | `V0.0.11` | Sistema dedicado de subagentes                           | Fluxo de Trabalho de Codificação  | 1     |
| TodoWrite               | `V0.0.10` | Gerenciamento de tarefas e acompanhamento de progresso    | Fluxo de Trabalho de Codificação  | 1     |
| Ferramenta: TextSearch  | `V0.0.8+` | Ferramenta de busca de texto (grep, com suporte a `.qwenignore`) | Fluxo de Trabalho de Codificação  | 1     |
| Ferramenta: WebFetch    | `V0.0.7+` | Ferramenta de obtenção de conteúdo da web                 | Fluxo de Trabalho de Codificação  | 1     |
| Ferramenta: WebSearch   | `V0.0.7+` | Ferramenta de busca na web (usando a API Tavily)         | Fluxo de Trabalho de Codificação  | 1     |
| OAuth                   | `V0.0.5+` | Autenticação de login OAuth (Qwen OAuth)                 | Experiência do Usuário            | 1     |

#### Recursos a Desenvolver

| Recurso                      | Prioridade | Status      | Descrição                                 | Categoria                   |
| ---------------------------- | ---------- | ----------- | ----------------------------------------- | --------------------------- |
| Interface de Usuário Aprimorada | P1         | Planejado   | Interação otimizada com a interface do terminal | Experiência do Usuário       |
| Primeiros Passos             | P1         | Planejado   | Fluxo de integração para novos usuários | Experiência do Usuário       |
| Permissões                   | P1         | Planejado   | Otimização do sistema de permissões       | Experiência do Usuário       |
| Compatibilidade Multiplataforma | P1         | Em Andamento | Compatibilidade com Windows/Linux/macOS | Experiência do Usuário       |
| Visualizador de Logs         | P2         | Planejado   | Recurso para visualização e depuração de logs | Experiência do Usuário       |
| Hooks                        | P2         | Em Andamento | Sistema de hooks para extensões         | Fluxo de Trabalho em Código  |
| Custos                       | P2         | Planejado   | Acompanhamento e análise de custos      | Capacidades Administrativas |
| Painel de Controle           | P2         | Planejado   | Painel de gerenciamento                 | Capacidades Administrativas |

#### Características Distintivas para Discutir

| Característica     | Status   | Descrição                                                     |
| ------------------ | -------- | ------------------------------------------------------------- |
| Destaque na Página Inicial | Pesquisa | Descoberta de projetos e inicialização rápida                 |
| Modo Competitivo   | Pesquisa | Modo competitivo                                              |
| Pulso              | Pesquisa | Análise do pulso de atividade do usuário (referência OpenAI Pulse) |
| Wiki de Código     | Pesquisa | Sistema wiki/documentação da base de código do projeto        |