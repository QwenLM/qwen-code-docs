# Qwen Code RoadMap

> **Objetivo**: Alcançar o nível de funcionalidade do Claude Code, refinar continuamente os detalhes e melhorar a experiência do usuário.

| Categoria                       | Fase 1                                                                                                                                                                           | Fase 2                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Experiência do Usuário          | ✅ Interface de terminal<br>✅ Suporte ao protocolo OpenAI<br>✅ Configurações<br>✅ OAuth<br>✅ Controle de cache<br>✅ Memória<br>✅ Compactação<br>✅ Tema | Melhor interface<br>Integração inicial<br>Visualização de logs<br>✅ Sessão<br>Permissões<br>🔄 Compatibilidade entre plataformas |
| Fluxo de Trabalho de Programação | ✅ Comandos com barra (/)<br>✅ MCP<br>✅ Modo Planejamento<br>✅ TodoWrite<br>✅ SubAgente<br>✅ Múltiplos Modelos<br>✅ Gerenciamento de conversas<br>✅ Ferramentas (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>SubAgente (melhorado)<br>✅ Habilidades<br>✅ Modo headless<br>✅ Ferramentas (WebSearch) |
| Construção de Capacidades Abertas | ✅ Comandos personalizados                                                                                                                                                         | ✅ SDK QwenCode<br> Extensão                                                                      |
| Integração com Ecossistema da Comunidade |                                                                                                                                                                                    | ✅ Plugin para VSCode<br>🔄 ACP/Zed<br>✅ GHA                                                     |
| Capacidades Administrativas     | ✅ Estatísticas<br>✅ Feedback                                                                                                                                                     | Custos<br>Painel de controle                                                                      |

> Para mais detalhes, consulte a lista abaixo.

## Recursos

#### Recursos Concluídos

| Recurso                 | Versão    | Descrição                                               | Categoria                       |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- |
| Skill                   | `V0.6.0`  | Habilidades personalizadas extensíveis de IA            | Fluxo de Trabalho de Codificação|
| Github Actions          | `V0.5.0`  | qwen-code-action e automação                            | Integração com Ecossistema da Comunidade |
| Plugin do VSCode        | `V0.5.0`  | Plugin de extensão do VSCode                            | Integração com Ecossistema da Comunidade |
| SDK do QwenCode         | `V0.4.0`  | SDK aberto para integração de terceiros                 | Construção de Capacidades Abertas |
| Sessão                  | `V0.4.0`  | Gerenciamento aprimorado de sessões                     | Experiência do Usuário          |
| i18n                    | `V0.3.0`  | Internacionalização e suporte multilíngue               | Experiência do Usuário          |
| Modo Headless           | `V0.3.0`  | Modo headless (não interativo)                          | Fluxo de Trabalho de Codificação|
| ACP/Zed                 | `V0.2.0`  | Integração com editores ACP e Zed                       | Integração com Ecossistema da Comunidade |
| Interface de Terminal   | `V0.1.0+` | Interface de usuário interativa no terminal             | Experiência do Usuário          |
| Configurações           | `V0.1.0+` | Sistema de gerenciamento de configurações               | Experiência do Usuário          |
| Tema                    | `V0.1.0+` | Suporte a múltiplos temas                               | Experiência do Usuário          |
| Suporte ao Protocolo OpenAI | `V0.1.0+` | Suporte ao protocolo da API OpenAI                    | Experiência do Usuário          |
| Gerenciamento de Chat   | `V0.1.0+` | Gerenciamento de sessão (salvar, restaurar, navegar)    | Fluxo de Trabalho de Codificação|
| MCP                     | `V0.1.0+` | Integração com Protocolo de Contexto do Modelo          | Fluxo de Trabalho de Codificação|
| Múltiplos Modelos       | `V0.1.0+` | Suporte e alternância entre múltiplos modelos           | Fluxo de Trabalho de Codificação|
| Comandos com Barra      | `V0.1.0+` | Sistema de comandos com barra                           | Fluxo de Trabalho de Codificação|
| Ferramenta: Bash        | `V0.1.0+` | Execução de comandos shell (com parâmetro is_background)| Fluxo de Trabalho de Codificação|
| Ferramenta: FileRead/EditFile | `V0.1.0+` | Ferramentas de leitura/gravação e edição de arquivos | Fluxo de Trabalho de Codificação|
| Comandos Personalizados | `V0.1.0+` | Carregamento de comandos personalizados                 | Construção de Capacidades Abertas |
| Feedback                | `V0.1.0+` | Mecanismo de feedback (/bug command)                    | Capacidades Administrativas     |
| Estatísticas            | `V0.1.0+` | Exibição de estatísticas de uso e cotas                 | Capacidades Administrativas     |
| Memória                 | `V0.0.9+` | Gerenciamento de memória em nível de projeto e global   | Experiência do Usuário          |
| Controle de Cache       | `V0.0.9+` | Controle de cache de prompts (Anthropic, DashScope)     | Experiência do Usuário          |
| Modo de Planejamento    | `V0.0.14` | Modo de planejamento de tarefas                         | Fluxo de Trabalho de Codificação|
| Compactação             | `V0.0.11` | Mecanismo de compactação de chat                        | Experiência do Usuário          |
| SubAgente               | `V0.0.11` | Sistema dedicado de subagentes                          | Fluxo de Trabalho de Codificação|
| TodoWrite               | `V0.0.10` | Gerenciamento de tarefas e acompanhamento de progresso  | Fluxo de Trabalho de Codificação|
| Ferramenta: TextSearch  | `V0.0.8+` | Ferramenta de busca de texto (grep, suporta .qwenignore)| Fluxo de Trabalho de Codificação|
| Ferramenta: WebFetch    | `V0.0.7+` | Ferramenta de captura de conteúdo web                   | Fluxo de Trabalho de Codificação|
| Ferramenta: WebSearch   | `V0.0.7+` | Ferramenta de busca na web (usando API Tavily)          | Fluxo de Trabalho de Codificação|
| OAuth                   | `V0.0.5+` | Autenticação de login via OAuth (Qwen OAuth)            | Experiência do Usuário          |

#### Recursos para Desenvolver

| Recurso                      | Prioridade | Status      | Descrição                                | Categoria                 |
| ---------------------------- | ---------- | ----------- | ---------------------------------------- | ------------------------- |
| Melhor UI                    | P1         | Planejado   | Interação otimizada com a interface do terminal | Experiência do Usuário    |
| Integração                   | P1         | Planejado   | Fluxo de integração para novos usuários | Experiência do Usuário    |
| Permissão                    | P1         | Planejado   | Otimização do sistema de permissões     | Experiência do Usuário    |
| Compatibilidade entre Plataformas | P1 | Em Andamento | Compatibilidade com Windows/Linux/macOS | Experiência do Usuário    |
| Visualização de Logs         | P2         | Planejado   | Funcionalidade de visualização e depuração de logs | Experiência do Usuário    |
| Hooks                        | P2         | Em Andamento | Sistema de extensão com hooks           | Fluxo de Trabalho de Codificação |
| Extensão                     | P2         | Planejado   | Sistema de extensões                    | Construção de Capacidades Abertas |
| Custos                       | P2         | Planejado   | Acompanhamento e análise de custos      | Capacidades Administrativas |
| Painel de Controle           | P2         | Planejado   | Painel de gerenciamento                 | Capacidades Administrativas |

#### Recursos Distintivos para Discussão

| Recurso          | Status   | Descrição                                             |
| ---------------- | -------- | ----------------------------------------------------- |
| Destaque Inicial | Pesquisa | Descoberta de projetos e inicialização rápida         |
| Modo Competitivo | Pesquisa | Modo competitivo                                      |
| Pulso            | Pesquisa | Análise de atividade do usuário (referência OpenAI Pulse) |
| Wiki de Código   | Pesquisa | Sistema de wiki/documentação da base de código do projeto |