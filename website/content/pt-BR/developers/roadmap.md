# Qwen Code RoadMap

> **Objetivo**: Acompanhar a funcionalidade do produto do Claude Code, refinar continuamente os detalhes e melhorar a experiência do usuário.

| Categoria                        | Fase 1                                                                                                                                                                            | Fase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experiência do Usuário                 | ✅ Terminal UI<br>✅ Suporte ao Protocolo OpenAI<br>✅ Configurações<br>✅ OAuth<br>✅ Controle de Cache<br>✅ Memória<br>✅ Compressão<br>✅ Tema                                                | UI Melhorada<br>Onboarding<br>LogView<br>✅ Sessão<br>Permissões<br>🔄 Compatibilidade Cross-platform<br>✅ Coding Plan<br>✅ Provedor Anthropic<br>✅ Entrada Multimodal<br>✅ WebUI Unificada |
| Fluxo de Trabalho de Codificação                 | ✅ Comandos Slash<br>✅ MCP<br>✅ PlanMode<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi Model<br>✅ Gerenciamento de Chat<br>✅ Ferramentas (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Modo Headless<br>✅ Ferramentas (WebSearch)<br>✅ Suporte a LSP<br>✅ Executor Concorrente                                                                              |
| Construção de Capacidades Abertas      | ✅ Comandos Personalizados                                                                                                                                                                 | ✅ QwenCode SDK<br>✅ Sistema de Extensões                                                                                                                                                  |
| Integração com o Ecossistema da Comunidade |                                                                                                                                                                                    | ✅ Plugin do VSCode<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Capacidades Administrativas     | ✅ Estatísticas<br>✅ Feedback                                                                                                                                                            | Custos<br>Dashboard<br>✅ Diálogo de Feedback do Usuário                                                                                                                                           |

> Para mais detalhes, consulte a lista abaixo.

## Funcionalidades

#### Funcionalidades Concluídas

| Funcionalidade                 | Versão   | Descrição                                             | Categoria                        | Fase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Coding Plan**         | `V0.10.0` | Autenticação e modelos do Alibaba Cloud Coding Plan       | Experiência do Usuário                 | 2     |
| WebUI Unificada           | `V0.9.0`  | Biblioteca de componentes WebUI compartilhada para VSCode/CLI           | Experiência do Usuário                 | 2     |
| Exportar Chat             | `V0.8.0`  | Exportar sessões para Markdown/HTML/JSON/JSONL             | Experiência do Usuário                 | 2     |
| Sistema de Extensões        | `V0.8.0`  | Gerenciamento completo de extensões com comandos slash           | Construção de Capacidades Abertas      | 2     |
| Suporte a LSP             | `V0.7.0`  | Serviço LSP experimental (`--experimental-lsp`)         | Fluxo de Trabalho de Codificação                 | 2     |
| Provedor Anthropic      | `V0.7.0`  | Suporte ao provedor de API da Anthropic                          | Experiência do Usuário                 | 2     |
| Diálogo de Feedback do Usuário    | `V0.7.0`  | Coleta de feedback no aplicativo com mecanismo de fadiga       | Capacidades Administrativas     | 2     |
| Executor Concorrente       | `V0.6.0`  | Execução de CLI em lote com integração Git                | Fluxo de Trabalho de Codificação                 | 2     |
| Entrada Multimodal        | `V0.6.0`  | Suporte a entrada de imagem, PDF, áudio e vídeo                  | Experiência do Usuário                 | 2     |
| Skill                   | `V0.6.0`  | Skills de IA personalizadas e extensíveis (experimental)              | Fluxo de Trabalho de Codificação                 | 2     |
| GitHub Actions          | `V0.5.0`  | qwen-code-action e automação                         | Integração com o Ecossistema da Comunidade | 1     |
| Plugin do VSCode           | `V0.5.0`  | Plugin de extensão do VSCode                                 | Integração com o Ecossistema da Comunidade | 1     |
| QwenCode SDK            | `V0.4.0`  | SDK aberto para integração de terceiros                    | Construção de Capacidades Abertas      | 1     |
| Sessão                 | `V0.4.0`  | Gerenciamento de sessões aprimorado                             | Experiência do Usuário                 | 1     |
| i18n                    | `V0.3.0`  | Internacionalização e suporte multilíngue           | Experiência do Usuário                 | 1     |
| Modo Headless           | `V0.3.0`  | Modo headless (não interativo)                         | Fluxo de Trabalho de Codificação                 | 1     |
| ACP/Zed                 | `V0.2.0`  | Integração com o editor ACP e Zed                          | Integração com o Ecossistema da Comunidade | 1     |
| Terminal UI             | `V0.1.0+` | Interface de usuário de terminal interativa                     | Experiência do Usuário                 | 1     |
| Configurações                | `V0.1.0+` | Sistema de gerenciamento de configurações                         | Experiência do Usuário                 | 1     |
| Tema                   | `V0.1.0+` | Suporte a múltiplos temas                                     | Experiência do Usuário                 | 1     |
| Suporte ao Protocolo OpenAI | `V0.1.0+` | Suporte ao protocolo de API da OpenAI                         | Experiência do Usuário                 | 1     |
| Gerenciamento de Chat         | `V0.1.0+` | Gerenciamento de sessões (salvar, restaurar, navegar)              | Fluxo de Trabalho de Codificação                 | 1     |
| MCP                     | `V0.1.0+` | Integração com o Model Context Protocol                      | Fluxo de Trabalho de Codificação                 | 1     |
| Multi Model             | `V0.1.0+` | Suporte e alternância entre múltiplos modelos                       | Fluxo de Trabalho de Codificação                 | 1     |
| Comandos Slash          | `V0.1.0+` | Sistema de comandos slash                                    | Fluxo de Trabalho de Codificação                 | 1     |
| Ferramenta: Bash              | `V0.1.0+` | Ferramenta de execução de comandos shell (com parâmetro is_background) | Fluxo de Trabalho de Codificação                 | 1     |
| Ferramenta: FileRead/EditFile | `V0.1.0+` | Ferramentas de leitura/escrita e edição de arquivos                          | Fluxo de Trabalho de Codificação                 | 1     |
| Comandos Personalizados         | `V0.1.0+` | Carregamento de comandos personalizados                                  | Construção de Capacidades Abertas      | 1     |
| Feedback                | `V0.1.0+` | Mecanismo de feedback (comando /bug)                       | Capacidades Administrativas     | 1     |
| Estatísticas                   | `V0.1.0+` | Estatísticas de uso e exibição de cotas                      | Capacidades Administrativas     | 1     |
| Memória                  | `V0.0.9+` | Gerenciamento de memória em nível de projeto e global              | Experiência do Usuário                 | 1     |
| Controle de Cache           | `V0.0.9+` | Controle de cache de prompts (Anthropic, DashScope)           | Experiência do Usuário                 | 1     |
| PlanMode                | `V0.0.14` | Modo de planejamento de tarefas                                      | Fluxo de Trabalho de Codificação                 | 1     |
| Compressão                | `V0.0.11` | Mecanismo de compressão de chat                              | Experiência do Usuário                 | 1     |
| SubAgent                | `V0.0.11` | Sistema dedicado de sub-agentes                              | Fluxo de Trabalho de Codificação                 | 1     |
| TodoWrite               | `V0.0.10` | Gerenciamento de tarefas e rastreamento de progresso                   | Fluxo de Trabalho de Codificação                 | 1     |
| Ferramenta: TextSearch        | `V0.0.8+` | Ferramenta de pesquisa de texto (grep, suporta .qwenignore)           | Fluxo de Trabalho de Codificação                 | 1     |
| Ferramenta: WebFetch          | `V0.0.7+` | Ferramenta de busca de conteúdo web                               | Fluxo de Trabalho de Codificação                 | 1     |
| Ferramenta: WebSearch         | `V0.0.7+` | Ferramenta de pesquisa web (usando a API do Tavily)                      | Fluxo de Trabalho de Codificação                 | 1     |
| OAuth                   | `V0.0.5+` | Autenticação de login OAuth (Qwen OAuth)                 | Experiência do Usuário                 | 1     |

#### Funcionalidades a Desenvolver

| Funcionalidade                      | Prioridade | Status      | Descrição                       | Categoria                    |
| ---------------------------- | -------- | ----------- | --------------------------------- | --------------------------- |
| UI Melhorada                    | P1       | Planejada     | Interação de UI de terminal otimizada | Experiência do Usuário             |
| Onboarding                   | P1       | Planejado     | Fluxo de onboarding para novos usuários          | Experiência do Usuário             |
| Permissões                   | P1       | Planejado     | Otimização do sistema de permissões    | Experiência do Usuário             |
| Compatibilidade Cross-platform | P1       | Em Progresso | Compatibilidade com Windows/Linux/macOS | Experiência do Usuário             |
| LogView                      | P2       | Planejado     | Recurso de visualização e depuração de logs | Experiência do Usuário             |
| Hooks                        | P2       | Em Progresso | Sistema de hooks de extensão            | Fluxo de Trabalho de Codificação             |
| Custos                        | P2       | Planejado     | Rastreamento e análise de custos        | Capacidades Administrativas |
| Dashboard                    | P2       | Planejado     | Dashboard de gerenciamento              | Capacidades Administrativas |

#### Funcionalidades Exclusivas a Discutir

| Funcionalidade          | Status   | Descrição                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Pesquisa | Descoberta e inicialização rápida de projetos                    |
| Competitive Mode | Pesquisa | Modo competitivo                                      |
| Pulse            | Pesquisa | Análise de pulso de atividade do usuário (referência ao OpenAI Pulse) |
| Code Wiki        | Pesquisa | Sistema de wiki/documentação da base de código do projeto            |