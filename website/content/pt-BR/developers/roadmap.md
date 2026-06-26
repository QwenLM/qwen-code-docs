# RoadMap do Qwen Code

> **Objetivo**: Acompanhar a funcionalidade do produto Claude Code, refinar continuamente os detalhes e melhorar a experiência do usuário.

| Categoria                        | Fase 1                                                                                                                                                                                      | Fase 2                                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experiência do Usuário          | ✅ Interface de Terminal<br>✅ Suporte ao Protocolo OpenAI<br>✅ Configurações<br>✅ OAuth<br>✅ Controle de Cache<br>✅ Memória<br>✅ Compressão<br>✅ Tema                                    | Melhor UI<br>OnBoarding<br>LogView<br>✅ Sessão<br>Permissão<br>🔄 Compatibilidade entre Plataformas<br>✅ Coding Plan<br>✅ Provedor Anthropic<br>✅ Entrada Multimodal<br>✅ WebUI Unificado |
| Fluxo de Codificação            | ✅ Comandos de Barra<br>✅ MCP<br>✅ PlanMode<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi Modelo<br>✅ Gerenciamento de Chat<br>✅ Ferramentas (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Modo Headless<br>✅ Ferramentas (WebSearch)<br>✅ Suporte LSP<br>✅ Executor Concorrente                                                                                      |
| Construção de Capacidades Abertas | ✅ Comandos Personalizados                                                                                                                                                                 | ✅ SDK do QwenCode<br>✅ Sistema de Extensões                                                                                                                                                          |
| Integração com Ecossistema da Comunidade |                                                                                                                                                                                    | ✅ Plugin VSCode<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                               |
| Capacidades Administrativas     | ✅ Estatísticas<br>✅ Feedback                                                                                                                                                              | Custos<br>Dashboard<br>✅ Diálogo de Feedback do Usuário                                                                                                                                                  |

> Para mais detalhes, veja a lista abaixo.

## Funcionalidades

#### Funcionalidades Concluídas

| Funcionalidade          | Versão     | Descrição                                                              | Categoria                                  | Fase |
| ----------------------- | ---------- | ---------------------------------------------------------------------- | ------------------------------------------ | ---- |
| **Coding Plan**         | `V0.10.0`  | Autenticação e modelos do Coding Plan da Alibaba Cloud                 | Experiência do Usuário                     | 2    |
| Unified WebUI           | `V0.9.0`   | Biblioteca de componentes WebUI compartilhada para VSCode/CLI          | Experiência do Usuário                     | 2    |
| Export Chat             | `V0.8.0`   | Exportar sessões para Markdown/HTML/JSON/JSONL                         | Experiência do Usuário                     | 2    |
| Extension System        | `V0.8.0`   | Gerenciamento completo de extensões com comandos de barra              | Construção de Capacidades Abertas          | 2    |
| LSP Support             | `V0.7.0`   | Serviço LSP experimental (`--experimental-lsp`)                        | Fluxo de Codificação                       | 2    |
| Anthropic Provider      | `V0.7.0`   | Suporte ao provedor de API Anthropic                                   | Experiência do Usuário                     | 2    |
| User Feedback Dialog    | `V0.7.0`   | Coleta de feedback no aplicativo com mecanismo de fadiga               | Capacidades Administrativas                | 2    |
| Concurrent Runner       | `V0.6.0`   | Execução em lote de CLI com integração ao Git                          | Fluxo de Codificação                       | 2    |
| Multimodal Input        | `V0.6.0`   | Suporte a entrada de imagem, PDF, áudio e vídeo                        | Experiência do Usuário                     | 2    |
| Skill                   | `V0.6.0`   | Habilidades de IA personalizadas e extensíveis (experimental)          | Fluxo de Codificação                       | 2    |
| Github Actions          | `V0.5.0`   | qwen-code-action e automação                                           | Integração com Ecossistema da Comunidade   | 1    |
| VSCode Plugin           | `V0.5.0`   | Plugin de extensão para VSCode                                         | Integração com Ecossistema da Comunidade   | 1    |
| QwenCode SDK            | `V0.4.0`   | SDK aberto para integração de terceiros                                | Construção de Capacidades Abertas          | 1    |
| Session                 | `V0.4.0`   | Gerenciamento aprimorado de sessões                                    | Experiência do Usuário                     | 1    |
| i18n                    | `V0.3.0`   | Internacionalização e suporte a vários idiomas                         | Experiência do Usuário                     | 1    |
| Headless Mode           | `V0.3.0`   | Modo headless (não interativo)                                         | Fluxo de Codificação                       | 1    |
| ACP/Zed                 | `V0.2.0`   | Integração com os editores ACP e Zed                                   | Integração com Ecossistema da Comunidade   | 1    |
| Terminal UI             | `V0.1.0+`  | Interface de usuário interativa no terminal                            | Experiência do Usuário                     | 1    |
| Settings                | `V0.1.0+`  | Sistema de gerenciamento de configuração                               | Experiência do Usuário                     | 1    |
| Theme                   | `V0.1.0+`  | Suporte a múltiplos temas                                              | Experiência do Usuário                     | 1    |
| Support OpenAI Protocol | `V0.1.0+`  | Suporte ao protocolo de API da OpenAI                                  | Experiência do Usuário                     | 1    |
| Chat Management         | `V0.1.0+`  | Gerenciamento de sessões (salvar, restaurar, navegar)                  | Fluxo de Codificação                       | 1    |
| MCP                     | `V0.1.0+`  | Integração do Model Context Protocol                                   | Fluxo de Codificação                       | 1    |
| Multi Model             | `V0.1.0+`  | Suporte e alternância entre múltiplos modelos                          | Fluxo de Codificação                       | 1    |
| Slash Commands          | `V0.1.0+`  | Sistema de comandos de barra                                           | Fluxo de Codificação                       | 1    |
| Tool: Bash              | `V0.1.0+`  | Ferramenta de execução de comandos no shell (com parâmetro is_background) | Fluxo de Codificação                     | 1    |
| Tool: FileRead/EditFile | `V0.1.0+`  | Ferramentas de leitura/escrita e edição de arquivos                     | Fluxo de Codificação                       | 1    |
| Custom Commands         | `V0.1.0+`  | Carregamento de comandos personalizados                                | Construção de Capacidades Abertas          | 1    |
| Feedback                | `V0.1.0+`  | Mecanismo de feedback (comando /bug)                                   | Capacidades Administrativas                | 1    |
| Stats                   | `V0.1.0+`  | Estatísticas de uso e exibição de cotas                                | Capacidades Administrativas                | 1    |
| Memory                  | `V0.0.9+`  | Gerenciamento de memória em nível de projeto e global                  | Experiência do Usuário                     | 1    |
| Cache Control           | `V0.0.9+`  | Controle de cache de prompt (Anthropic, DashScope)                     | Experiência do Usuário                     | 1    |
| PlanMode                | `V0.0.14`  | Modo de planejamento de tarefas                                        | Fluxo de Codificação                       | 1    |
| Compress                | `V0.0.11`  | Mecanismo de compressão de chat                                        | Experiência do Usuário                     | 1    |
| SubAgent                | `V0.0.11`  | Sistema de subagente dedicado                                          | Fluxo de Codificação                       | 1    |
| TodoWrite               | `V0.0.10`  | Gerenciamento de tarefas e acompanhamento de progresso                 | Fluxo de Codificação                       | 1    |
| Tool: TextSearch        | `V0.0.8+`  | Ferramenta de busca textual (grep, suporta .qwenignore)                | Fluxo de Codificação                       | 1    |
| Tool: WebFetch          | `V0.0.7+`  | Ferramenta de obtenção de conteúdo web                                 | Fluxo de Codificação                       | 1    |
| Tool: WebSearch         | `V0.0.7+`  | Ferramenta de pesquisa web (usando API Tavily)                         | Fluxo de Codificação                       | 1    |
| OAuth                   | `V0.0.5+`  | Autenticação de login via OAuth (Qwen OAuth)                           | Experiência do Usuário                     | 1    |

#### Funcionalidades a Desenvolver

| Funcionalidade                 | Prioridade | Status         | Descrição                                | Categoria                     |
| ------------------------------ | ---------- | -------------- | ---------------------------------------- | ----------------------------- |
| Better UI                      | P1         | Planejado      | Interação otimizada na interface do terminal | Experiência do Usuário       |
| OnBoarding                     | P1         | Planejado      | Fluxo de integração para novos usuários  | Experiência do Usuário        |
| Permission                     | P1         | Planejado      | Otimização do sistema de permissões      | Experiência do Usuário        |
| Cross-platform Compatibility   | P1         | Em Andamento   | Compatibilidade Windows/Linux/macOS      | Experiência do Usuário        |
| LogView                        | P2         | Planejado      | Visualização de logs e depuração         | Experiência do Usuário        |
| Hooks                          | P2         | Em Andamento   | Sistema de hooks de extensão             | Fluxo de Codificação          |
| Costs                          | P2         | Planejado      | Rastreamento e análise de custos         | Capacidades Administrativas   |
| Dashboard                      | P2         | Planejado      | Painel de gerenciamento                  | Capacidades Administrativas   |

#### Funcionalidades Distintivas em Discussão

| Funcionalidade      | Status   | Descrição                                                    |
| ------------------- | -------- | ------------------------------------------------------------ |
| Home Spotlight      | Pesquisa | Descoberta de projetos e inicialização rápida                |
| Competitive Mode    | Pesquisa | Modo competitivo                                             |
| Pulse               | Pesquisa | Análise de pulsação de atividade do usuário (referência OpenAI Pulse) |
| Code Wiki           | Pesquisa | Sistema de wiki/documentação da base de código do projeto    |