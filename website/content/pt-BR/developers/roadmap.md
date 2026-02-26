# Qwen Code RoadMap

> **Objetivo**: Alcançar a funcionalidade de produto do Claude Code, refinar continuamente os detalhes e melhorar a experiência do usuário.

| Categoria                       | Fase 1                                                                                                                                                                             | Fase 2                                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experiência do Usuário          | ✅ Interface de terminal<br>✅ Suporte ao protocolo OpenAI<br>✅ Configurações<br>✅ OAuth<br>✅ Controle de cache<br>✅ Memória<br>✅ Compactação<br>✅ Tema                         | Interface melhor<br>Integração inicial<br>Visualização de logs<br>✅ Sessão<br>Permissões<br>🔄 Compatibilidade entre plataformas<br>✅ Plano de codificação<br>✅ Provedor Anthropic<br>✅ Entrada multimodal<br>✅ WebUI unificada |
| Fluxo de trabalho de codificação| ✅ Comandos com barra<br>✅ MCP<br>✅ Modo de planejamento<br>✅ Gravação de tarefas<br>✅ SubAgente<br>✅ Múltiplos modelos<br>✅ Gerenciamento de chat<br>✅ Ferramentas (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Habilidade<br>✅ Modo headless<br>✅ Ferramentas (WebSearch)<br>✅ Suporte a LSP<br>✅ Executor concorrente                                                               |
| Construção de capacidades abertas| ✅ Comandos personalizados                                                                                                                                                          | ✅ SDK QwenCode<br>✅ Sistema de extensões                                                                                                                                               |
| Integração com ecossistema da comunidade |                                                                                                                                                                                   | ✅ Plugin para VSCode<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                           |
| Capacidades administrativas     | ✅ Estatísticas<br>✅ Feedback                                                                                                                                                     | Custos<br>Painel de controle<br>✅ Diálogo de feedback do usuário                                                                                                                      |

> Para mais detalhes, consulte a lista abaixo.

## Recursos

#### Recursos Concluídos

| Recurso                 | Versão    | Descrição                                               | Categoria                       | Fase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ---- |
| **Plano de Codificação**| `V0.10.0` | Autenticação e modelos do Bailian Coding Plan           | Experiência do Usuário          | 2    |
| WebUI Unificada         | `V0.9.0`  | Biblioteca de componentes WebUI compartilhada para VSCode/CLI | Experiência do Usuário          | 2    |
| Exportar Chat           | `V0.8.0`  | Exportar sessões para Markdown/HTML/JSON/JSONL          | Experiência do Usuário          | 2    |
| Sistema de Extensões    | `V0.8.0`  | Gerenciamento completo de extensões com comandos de barra | Construção de Capacidades Abertas | 2    |
| Suporte a LSP           | `V0.7.0`  | Serviço experimental de LSP (`--experimental-lsp`)      | Fluxo de Trabalho de Codificação | 2    |
| Provedor Anthropic      | `V0.7.0`  | Suporte ao provedor da API Anthropic                    | Experiência do Usuário          | 2    |
| Diálogo de Feedback do Usuário | `V0.7.0` | Coleta de feedback dentro do aplicativo com mecanismo de fadiga | Capacidades Administrativas     | 2    |
| Executor Concorrente    | `V0.6.0`  | Execução em lote via CLI com integração ao Git          | Fluxo de Trabalho de Codificação | 2    |
| Entrada Multimodal      | `V0.6.0`  | Suporte a entrada de imagem, PDF, áudio e vídeo         | Experiência do Usuário          | 2    |
| Skill                   | `V0.6.0`  | Skills personalizadas extensíveis para IA (experimental) | Fluxo de Trabalho de Codificação | 2    |
| Ações do Github         | `V0.5.0`  | qwen-code-action e automação                            | Integração com o Ecossistema da Comunidade | 1    |
| Plugin do VSCode        | `V0.5.0`  | Plugin de extensão do VSCode                            | Integração com o Ecossistema da Comunidade | 1    |
| SDK do QwenCode         | `V0.4.0`  | SDK aberto para integração de terceiros                 | Construção de Capacidades Abertas | 1    |
| Sessão                  | `V0.4.0`  | Gerenciamento aprimorado de sessões                     | Experiência do Usuário          | 1    |
| i18n                    | `V0.3.0`  | Internacionalização e suporte multilíngue               | Experiência do Usuário          | 1    |
| Modo Headless           | `V0.3.0`  | Modo headless (não interativo)                          | Fluxo de Trabalho de Codificação | 1    |
| ACP/Zed                 | `V0.2.0`  | Integração com os editores ACP e Zed                    | Integração com o Ecossistema da Comunidade | 1    |
| Interface de Terminal   | `V0.1.0+` | Interface de usuário interativa no terminal             | Experiência do Usuário          | 1    |
| Configurações           | `V0.1.0+` | Sistema de gerenciamento de configurações               | Experiência do Usuário          | 1    |
| Tema                    | `V0.1.0+` | Suporte a múltiplos temas                               | Experiência do Usuário          | 1    |
| Suporte ao Protocolo OpenAI | `V0.1.0+` | Suporte ao protocolo da API OpenAI                    | Experiência do Usuário          | 1    |
| Gerenciamento de Chat   | `V0.1.0+` | Gerenciamento de sessão (salvar, restaurar, navegar)    | Fluxo de Trabalho de Codificação | 1    |
| MCP                     | `V0.1.0+` | Integração do Protocolo de Contexto de Modelo (MCP)     | Fluxo de Trabalho de Codificação | 1    |
| Múltiplos Modelos       | `V0.1.0+` | Suporte e alternância entre múltiplos modelos           | Fluxo de Trabalho de Codificação | 1    |
| Comandos de Barra       | `V0.1.0+` | Sistema de comandos de barra                            | Fluxo de Trabalho de Codificação | 1    |
| Ferramenta: Bash        | `V0.1.0+` | Ferramenta de execução de comandos shell (com parâmetro is_background) | Fluxo de Trabalho de Codificação | 1    |
| Ferramenta: FileRead/EditFile | `V0.1.0+` | Ferramentas de leitura/gravação e edição de arquivos | Fluxo de Trabalho de Codificação | 1    |
| Comandos Personalizados | `V0.1.0+` | Carregamento de comandos personalizados                 | Construção de Capacidades Abertas | 1    |
| Feedback                | `V0.1.0+` | Mecanismo de feedback (comando /bug)                    | Capacidades Administrativas     | 1    |
| Estatísticas            | `V0.1.0+` | Exibição de estatísticas de uso e cotas                 | Capacidades Administrativas     | 1    |
| Memória                 | `V0.0.9+` | Gerenciamento de memória por projeto e global           | Experiência do Usuário          | 1    |
| Controle de Cache       | `V0.0.9+` | Controle de cache de prompts (Anthropic, DashScope)     | Experiência do Usuário          | 1    |
| Modo de Planejamento    | `V0.0.14` | Modo de planejamento de tarefas                         | Fluxo de Trabalho de Codificação | 1    |
| Compactação             | `V0.0.11` | Mecanismo de compactação de chat                        | Experiência do Usuário          | 1    |
| SubAgente               | `V0.0.11` | Sistema dedicado de subagentes                          | Fluxo de Trabalho de Codificação | 1    |
| TodoWrite               | `V0.0.10` | Gerenciamento de tarefas e acompanhamento de progresso  | Fluxo de Trabalho de Codificação | 1    |
| Ferramenta: TextSearch  | `V0.0.8+` | Ferramenta de busca de texto (grep, suporta .qwenignore)| Fluxo de Trabalho de Codificação | 1    |
| Ferramenta: WebFetch    | `V0.0.7+` | Ferramenta de captura de conteúdo web                   | Fluxo de Trabalho de Codificação | 1    |
| Ferramenta: WebSearch   | `V0.0.7+` | Ferramenta de busca na web (usando API Tavily)          | Fluxo de Trabalho de Codificação | 1    |
| OAuth                   | `V0.0.5+` | Autenticação de login via OAuth (Qwen OAuth)            | Experiência do Usuário          | 1    |

#### Recursos para Desenvolver

| Recurso                      | Prioridade | Status      | Descrição                                | Categoria                 |
| ---------------------------- | ---------- | ----------- | ---------------------------------------- | ------------------------- |
| Melhor UI                    | P1         | Planejado   | Interação otimizada com a interface do terminal | Experiência do Usuário    |
| OnBoarding                   | P1         | Planejado   | Fluxo de integração para novos usuários  | Experiência do Usuário    |
| Permissão                    | P1         | Planejado   | Otimização do sistema de permissões      | Experiência do Usuário    |
| Compatibilidade entre Plataformas | P1 | Em Andamento | Compatibilidade entre Windows/Linux/macOS | Experiência do Usuário    |
| Visualização de Logs         | P2         | Planejado   | Funcionalidade de visualização e depuração de logs | Experiência do Usuário    |
| Hooks                        | P2         | Em Andamento | Sistema de extensão por hooks            | Fluxo de Trabalho de Codificação |
| Custos                       | P2         | Planejado   | Acompanhamento e análise de custos       | Capacidades Administrativas |
| Dashboard                    | P2         | Planejado   | Painel de gerenciamento                  | Capacidades Administrativas |

#### Recursos Distintivos para Discussão

| Recurso          | Status   | Descrição                                             |
| ---------------- | -------- | ----------------------------------------------------- |
| Destaque Inicial | Pesquisa | Descoberta de projetos e inicialização rápida         |
| Modo Competitivo | Pesquisa | Modo competitivo                                      |
| Pulso            | Pesquisa | Análise de atividade do usuário (referência OpenAI Pulse) |
| Wiki de Código   | Pesquisa | Sistema de wiki/documentação da base de código do projeto |