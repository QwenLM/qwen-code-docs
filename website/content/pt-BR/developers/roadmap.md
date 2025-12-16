# Roteiro de Código do Qwen

> **Objetivo**: Alcançar a funcionalidade do produto Claude Code, refinar continuamente os detalhes e melhorar a experiência do usuário.

| Categoria                       | Fase 1                                                                                                                                                                             | Fase 2                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Experiência do Usuário          | ✅ Interface do Terminal<br>✅ Suporte ao Protocolo OpenAI<br>✅ Configurações<br>✅ OAuth<br>✅ Controle de Cache<br>✅ Memória<br>✅ Compressão<br>✅ Tema                  | Melhor Interface<br>Integração Inicial<br>Visualização de Logs<br>✅ Sessão<br>Permissão<br>🔄 Compatibilidade Multiplataforma |
| Fluxo de Trabalho de Codificação| ✅ Comandos com Barra (/)<br>✅ MCP<br>✅ Modo de Planejamento<br>✅ Escrita de Tarefas<br>✅ SubAgente<br>✅ Modelo Múltiplo<br>✅ Gerenciamento de Chat<br>✅ Ferramentas (WebFetch, Bash, Busca de Texto, Leitura de Arquivo, Edição de Arquivo) | 🔄 Hooks<br>SubAgente (aprimorado)<br>✅ Habilidade<br>✅ Modo Headless<br>✅ Ferramentas (Busca na Web) |
| Construção de Capacidades Abertas| ✅ Comandos Personalizados                                                                                                                                                          | ✅ SDK do QwenCode<br> Extensão                                                                   |
| Integração com o Ecossistema da Comunidade |                                                                                                                                                                                    | ✅ Plugin do VSCode<br>🔄 ACP/Zed<br>✅ GHA                                                           |
| Capacidades Administrativas     | ✅ Estatísticas<br>✅ Feedback                                                                                                                                                     | Custos<br>Painel de Controle                                                                        |

> Para mais detalhes, consulte a lista abaixo.

## Recursos

#### Funcionalidades Concluídas

| Funcionalidade          | Versão    | Descrição                                               | Categoria                        |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- |
| Skill                   | `V0.6.0`  | Habilidades de IA personalizadas e extensíveis          | Fluxo de Trabalho de Codificação |
| Github Actions          | `V0.5.0`  | qwen-code-action e automação                            | Integração com Ecossistema Comunitário |
| VSCode Plugin           | `V0.5.0`  | Plugin de extensão para VSCode                          | Integração com Ecossistema Comunitário |
| QwenCode SDK            | `V0.4.0`  | SDK aberto para integração de terceiros                 | Construção de Capacidades Abertas |
| Session                 | `V0.4.0`  | Gerenciamento avançado de sessões                       | Experiência do Usuário          |
| i18n                    | `V0.3.0`  | Internacionalização e suporte multilíngue               | Experiência do Usuário          |
| Headless Mode           | `V0.3.0`  | Modo headless (não interativo)                          | Fluxo de Trabalho de Codificação |
| ACP/Zed                 | `V0.2.0`  | Integração com os editores ACP e Zed                    | Integração com Ecossistema Comunitário |
| Terminal UI             | `V0.1.0+` | Interface de usuário interativa no terminal             | Experiência do Usuário          |
| Settings                | `V0.1.0+` | Sistema de gerenciamento de configurações               | Experiência do Usuário          |
| Theme                   | `V0.1.0+` | Suporte a múltiplos temas                                | Experiência do Usuário          |
| Support OpenAI Protocol | `V0.1.0+` | Suporte ao protocolo da API OpenAI                      | Experiência do Usuário          |
| Chat Management         | `V0.1.0+` | Gerenciamento de sessões (salvar, restaurar, navegar)   | Fluxo de Trabalho de Codificação |
| MCP                     | `V0.1.0+` | Integração com o Modelo Context Protocol                | Fluxo de Trabalho de Codificação |
| Multi Model             | `V0.1.0+` | Suporte e alternância entre múltiplos modelos           | Fluxo de Trabalho de Codificação |
| Slash Commands          | `V0.1.0+` | Sistema de comandos via barra (/)                        | Fluxo de Trabalho de Codificação |
| Tool: Bash              | `V0.1.0+` | Ferramenta de execução de comandos shell (com parâmetro is_background) | Fluxo de Trabalho de Codificação |
| Tool: FileRead/EditFile | `V0.1.0+` | Ferramentas de leitura/escrita e edição de arquivos     | Fluxo de Trabalho de Codificação |
| Custom Commands         | `V0.1.0+` | Carregamento de comandos personalizados                 | Construção de Capacidades Abertas |
| Feedback                | `V0.1.0+` | Mecanismo de feedback (comando /bug)                    | Capacidades Administrativas     |
| Stats                   | `V0.1.0+` | Estatísticas de uso e exibição de quotas                | Capacidades Administrativas     |
| Memory                  | `V0.0.9+` | Gerenciamento de memória em nível de projeto e global   | Experiência do Usuário          |
| Cache Control           | `V0.0.9+` | Controle de cache do DashScope                          | Experiência do Usuário          |
| PlanMode                | `V0.0.14` | Modo de planejamento de tarefas                         | Fluxo de Trabalho de Codificação |
| Compress                | `V0.0.11` | Mecanismo de compressão de conversas                    | Experiência do Usuário          |
| SubAgent                | `V0.0.11` | Sistema dedicado de subagentes                          | Fluxo de Trabalho de Codificação |
| TodoWrite               | `V0.0.10` | Gerenciamento de tarefas e acompanhamento de progresso  | Fluxo de Trabalho de Codificação |
| Tool: TextSearch        | `V0.0.8+` | Ferramenta de busca textual (grep, suporta .qwenignore)| Fluxo de Trabalho de Codificação |
| Tool: WebFetch          | `V0.0.7+` | Ferramenta de busca de conteúdo web                     | Fluxo de Trabalho de Codificação |
| Tool: WebSearch         | `V0.0.7+` | Ferramenta de busca na web (usando Tavily API)          | Fluxo de Trabalho de Codificação |
| OAuth                   | `V0.0.5+` | Autenticação via OAuth (Qwen OAuth)                     | Experiência do Usuário          |

#### Funcionalidades a Desenvolver

| Funcionalidade               | Prioridade | Status      | Descrição                          | Categoria                   |
| ---------------------------- | ---------- | ----------- | ---------------------------------- | --------------------------- |
| Melhor UI                    | P1         | Planejado   | Interação otimizada com UI do terminal | Experiência do Usuário      |
| OnBoarding                   | P1         | Planejado   | Fluxo de integração para novos usuários | Experiência do Usuário      |
| Permissão                    | P1         | Planejado   | Otimização do sistema de permissões | Experiência do Usuário      |
| Compatibilidade Multiplataforma | P1      | Em Andamento | Compatibilidade Windows/Linux/macOS | Experiência do Usuário      |
| LogView                      | P2         | Planejado   | Visualização de logs e depuração   | Experiência do Usuário      |
| Hooks                        | P2         | Em Andamento | Sistema de ganchos para extensões  | Fluxo de Codificação        |
| Extensão                     | P2         | Planejado   | Sistema de extensões               | Construção de Capacidades Abertas |
| Custos                       | P2         | Planejado   | Rastreamento e análise de custos   | Capacidades Administrativas |
| Painel de Controle           | P2         | Planejado   | Painel de gerenciamento            | Capacidades Administrativas |

#### Recursos Distintos para Discutir

| Recurso          | Status   | Descrição                                             |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Pesquisa | Descoberta de projetos e inicialização rápida         |
| Modo Competitivo | Pesquisa | Modo competitivo                                      |
| Pulse            | Pesquisa | Análise do pulso de atividade do usuário (referência OpenAI Pulse) |
| Code Wiki        | Pesquisa | Sistema de wiki/documentação da base de código do projeto |