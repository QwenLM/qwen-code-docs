# Atalhos de Teclado do Qwen Code

Este documento lista os atalhos de teclado disponíveis no Qwen Code.

## Geral

| Atalho                         | Descrição                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Fecha diálogos e sugestões.                                                                                                                                                                                                                                                                                 |
| `Ctrl+C`                       | Cancela a requisição em andamento e limpa a entrada. Pressione duas vezes para sair do aplicativo.                                                                                                                                                                                                          |
| `Ctrl+D`                       | Sai do aplicativo se a entrada estiver vazia. Pressione duas vezes para confirmar.                                                                                                                                                                                                                          |
| `Ctrl+L`                       | Limpa a tela.                                                                                                                                                                                                                                                                                               |
| `Ctrl+O`                       | Alterna o modo compacto (oculta/exibe saída da ferramenta e pensamento).                                                                                                                                                                                                                                    |
| `Ctrl+S`                       | Permite que respostas longas sejam impressas por completo, desabilitando a truncagem. Use o histórico de rolagem do seu terminal para ver toda a saída.                                                                                                                                                     |
| `Ctrl+T`                       | Alterna a exibição das descrições das ferramentas.                                                                                                                                                                                                                                                          |
| `Ctrl+B`                       | Enquanto um comando shell em primeiro plano está em execução: promove-o para uma tarefa em segundo plano. O processo filho continua executando, a vez do agente é desbloqueada e o shell aparece em `/tasks` + no diálogo de Tarefas em Segundo Plano. Sem efeito quando nenhum shell está em execução — Ctrl+B então cai para seu vínculo na área de prompt (cursor esquerdo). |
| `Alt/Option+M`                 | Alterna a saída Markdown entre visualizações renderizadas ricas e modo bruto/fonte. No macOS, o terminal deve enviar Option como Meta.                                                                                                                                                                     |
| `Shift+Tab` (`Tab` no Windows) | Alterna entre modos de aprovação (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                      |

## Prompt de Entrada

| Atalho                                                | Descrição                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Alterna o modo shell quando a entrada está vazia.                                                                                     |
| `?`                                                   | Alterna a exibição de atalhos de teclado quando a entrada está vazia.                                                                 |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Insere uma nova linha.                                                                                                                |
| `Seta para Baixo`                                     | Linha abaixo, depois encaixa no final, depois próximo histórico.                                                                      |
| `Enter`                                               | Envia o prompt atual.                                                                                                                 |
| `Meta+Delete` / `Ctrl+Delete`                         | Exclui a palavra à direita do cursor.                                                                                                 |
| `Tab`                                                 | Autocompleta a sugestão atual, se existir.                                                                                            |
| `Seta para Cima`                                      | Linha acima, depois encaixa no início, depois histórico anterior.                                                                     |
| `Ctrl+A` / `Home`                                     | Move o cursor para o início da linha.                                                                                                 |
| `Ctrl+B` / `Seta para Esquerda`                       | Move o cursor um caractere para a esquerda.                                                                                           |
| `Ctrl+C`                                              | Limpa o prompt de entrada.                                                                                                            |
| `Esc` (pressione duas vezes)                          | Limpa o prompt de entrada.                                                                                                            |
| `Ctrl+D` / `Delete`                                   | Exclui o caractere à direita do cursor.                                                                                               |
| `Ctrl+E` / `End`                                      | Move o cursor para o final da linha.                                                                                                  |
| `Ctrl+F` / `Seta para Direita`                        | Move o cursor um caractere para a direita.                                                                                            |
| `Ctrl+H` / `Backspace`                                | Exclui o caractere à esquerda do cursor.                                                                                              |
| `Ctrl+K`                                              | Exclui do cursor até o final da linha.                                                                                                |
| `Ctrl+Seta para Esquerda` / `Meta+Seta para Esquerda` / `Meta+B` | Move o cursor uma palavra para a esquerda.                                                                                           |
| `Ctrl+N`                                              | Linha abaixo, depois encaixa no final, depois próximo histórico.                                                                      |
| `Ctrl+P`                                              | Linha acima, depois encaixa no início, depois histórico anterior.                                                                     |
| `Ctrl+R`                                              | Pesquisa reversa no histórico de entrada/shell.                                                                                       |
| `Ctrl+Y`                                              | Repete a última requisição que falhou.                                                                                                |
| `Ctrl+Seta para Direita` / `Meta+Seta para Direita` / `Meta+F`  | Move o cursor uma palavra para a direita.                                                                                             |
| `Ctrl+U`                                              | Exclui do cursor até o início da linha.                                                                                               |
| `Ctrl+V` (Windows: `Alt+V`)                           | Cola o conteúdo da área de transferência. Se a área de transferência contiver uma imagem, ela será salva e uma referência a ela será inserida no prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Exclui a palavra à esquerda do cursor.                                                                                                |
| `Ctrl+X` / `Meta+Enter`                               | Abre a entrada atual em um editor externo.                                                                                            |

## Sugestões

| Atalho                    | Descrição                               |
| ------------------------- | --------------------------------------- |
| `Seta para Baixo` / `Ctrl+N` | Navega para baixo nas sugestões.        |
| `Tab` / `Enter`           | Aceita a sugestão selecionada.          |
| `Seta para Cima` / `Ctrl+P` | Navega para cima nas sugestões.         |

## Seleção por Botão de Rádio

| Atalho                        | Descrição                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Seta para Baixo` / `j` / `Ctrl+N` | Move a seleção para baixo.                                                                                   |
| `Enter`                       | Confirma a seleção.                                                                                           |
| `Seta para Cima` / `k` / `Ctrl+P` | Move a seleção para cima.                                                                                     |
| `1-9`                         | Seleciona um item pelo seu número.                                                                            |
| (vários dígitos)              | Para itens com números maiores que 9, pressione os dígitos em rápida sucessão para selecionar o item correspondente. |

## Histórico de Rolagem

Ativo apenas quando `ui.useTerminalBuffer` está habilitado (Configurações → Interface → Histórico Virtualizado). Nesse modo, o histórico da conversa é renderizado dentro de uma janela de visualização no aplicativo, em vez do histórico de rolagem do terminal hospedeiro, portanto as teclas abaixo substituem a rolagem nativa do terminal.

| Atalho          | Descrição                                              |
| --------------- | ------------------------------------------------------ |
| `Shift+Seta para Cima`  | Rola o histórico uma linha para cima.                  |
| `Shift+Seta para Baixo` | Rola o histórico uma linha para baixo.                 |
| `PgUp`          | Rola o histórico uma página para cima (altura da janela de visualização). |
| `PgDn`          | Rola o histórico uma página para baixo (altura da janela de visualização). |
| `Ctrl+Home`     | Vai para o início da conversa.                         |
| `Ctrl+End`      | Vai para o final (e reengaja o acompanhamento automático ao vivo). |
| **Roda do mouse** | Rola o histórico (3 linhas por movimento).             |

Quando `ui.useTerminalBuffer` está ativado, o terminal encaminha eventos do mouse para o qwen-code para que a roda possa controlar a janela de visualização no aplicativo. Como efeito colateral, **a seleção nativa de texto por clique e arrasto é consumida pelo programa** — mantenha `Shift` (ou `Option` no macOS Terminal / iTerm) pressionado enquanto arrasta para contornar a captura do mouse e selecionar texto da maneira usual.

### Rolagem por trackpad no tmux

Dentro do tmux, alguns terminais traduzem gestos do trackpad ou da roda em sequências simples de `Seta para Cima` e `Seta para Baixo` antes que o qwen-code as veja. Esses bytes são idênticos a pressionamentos reais de teclas de seta, então o qwen-code não consegue distinguir se você pretendia rolar a janela de visualização ou navegar pelo histórico do prompt.

Se a rolagem do trackpad altera o histórico do prompt no tmux, habilite `ui.useTerminalBuffer`; então use `Shift+Seta para Cima` / `Shift+Seta para Baixo` ou a roda do mouse quando o tmux encaminhar eventos da roda para o aplicativo. Se você preferir o histórico de rolagem do hospedeiro, ajuste os vínculos do mouse do tmux para eventos da roda.

## Integração com IDE

| Atalho | Descrição                              |
| ------ | -------------------------------------- |
| `Ctrl+G` | Ver o contexto que a CLI recebeu da IDE |