# Atalhos de Teclado do Qwen Code

Este documento lista os atalhos de teclado disponíveis no Qwen Code.

## Geral

| Atalho                         | Descrição                                                                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Fecha diálogos e sugestões.                                                                                                                                                                                                                                                                               |
| `Ctrl+C`                       | Cancela a requisição em andamento e limpa a entrada. Pressione duas vezes para sair do aplicativo.                                                                                                                                                                                                        |
| `Ctrl+D`                       | Sai do aplicativo se a entrada estiver vazia. Pressione duas vezes para confirmar.                                                                                                                                                                                                                        |
| `Ctrl+L`                       | Limpa a tela.                                                                                                                                                                                                                                                                                             |
| `Ctrl+O`                       | Alterna o modo compacto (oculta/exibe saída de ferramentas e raciocínio).                                                                                                                                                                                                                                 |
| `Ctrl+S`                       | Permite que respostas longas sejam impressas por completo, desabilitando a truncagem. Use a rolagem do seu terminal para visualizar toda a saída.                                                                                                                                                          |
| `Ctrl+T`                       | Alterna a exibição das descrições das ferramentas.                                                                                                                                                                                                                                                        |
| `Ctrl+B`                       | Enquanto um comando de shell em primeiro plano está sendo executado: promova-o para uma tarefa em segundo plano. O filho continua sendo executado, o turno do agente é desbloqueado e o shell aparece em `/tasks` + o diálogo de Tarefas em Segundo Plano. Nenhuma operação quando nenhum shell está sendo executado — Ctrl+B então cai para seu vínculo de área de prompt (cursor-left). |
| `Alt/Option+M`                 | Alterna a saída Markdown entre visualizações renderizadas ricas e modo bruto/fonte. No macOS, o terminal deve enviar Option como Meta.                                                                                                                                                                    |
| `Shift+Tab` (`Tab` no Windows) | Percorre os modos de aprovação (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                       |

## Prompt de Entrada

| Atalho                                               | Descrição                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Alterna o modo shell quando a entrada está vazia.                                                                                   |
| `?`                                                   | Alterna a exibição dos atalhos de teclado quando a entrada está vazia.                                                              |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Insere uma nova linha.                                                                                                              |
| `Down Arrow`                                          | Linha abaixo, depois encaixa no final, depois próximo histórico.                                                                    |
| `Enter`                                               | Envia o prompt atual.                                                                                                               |
| `Meta+Delete` / `Ctrl+Delete`                         | Deleta a palavra à direita do cursor.                                                                                               |
| `Tab`                                                 | Autocompleta a sugestão atual, se existir.                                                                                          |
| `Up Arrow`                                            | Linha acima, depois encaixa no início, depois anterior do histórico.                                                                |
| `Ctrl+A` / `Home`                                     | Move o cursor para o início da linha.                                                                                               |
| `Ctrl+B` / `Left Arrow`                               | Move o cursor um caractere para a esquerda.                                                                                         |
| `Ctrl+C`                                              | Limpa o prompt de entrada.                                                                                                          |
| `Esc` (pressione duas vezes)                          | Limpa o prompt de entrada.                                                                                                          |
| `Ctrl+D` / `Delete`                                   | Deleta o caractere à direita do cursor.                                                                                             |
| `Ctrl+E` / `End`                                      | Move o cursor para o final da linha.                                                                                                |
| `Ctrl+F` / `Right Arrow`                              | Move o cursor um caractere para a direita.                                                                                          |
| `Ctrl+H` / `Backspace`                                | Deleta o caractere à esquerda do cursor.                                                                                            |
| `Ctrl+K`                                              | Deleta do cursor até o final da linha.                                                                                              |
| `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`      | Move o cursor uma palavra para a esquerda.                                                                                          |
| `Ctrl+N`                                              | Linha abaixo, depois encaixa no final, depois próximo histórico.                                                                    |
| `Ctrl+P`                                              | Linha acima, depois encaixa no início, depois anterior do histórico.                                                                |
| `Ctrl+R`                                              | Pesquisa reversa no histórico de entrada/shell.                                                                                     |
| `Ctrl+Y`                                              | Tenta novamente a última requisição falha.                                                                                          |
| `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F`    | Move o cursor uma palavra para a direita.                                                                                           |
| `Ctrl+U`                                              | Deleta do cursor até o início da linha.                                                                                             |
| `Ctrl+V` (Windows: `Alt+V`)                           | Cola o conteúdo da área de transferência. Se a área de transferência contiver uma imagem, ela será salva e uma referência a ela será inserida no prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Deleta a palavra à esquerda do cursor.                                                                                              |
| `Ctrl+X` / `Meta+Enter`                               | Abre a entrada atual em um editor externo.                                                                                          |
## Sugestões

| Atalho                        | Descrição                                  |
| ----------------------------- | ------------------------------------------ |
| `Seta para baixo` / `Ctrl+N`  | Navegar para baixo pelas sugestões.        |
| `Tab` / `Enter`               | Aceitar a sugestão selecionada.            |
| `Seta para cima` / `Ctrl+P`   | Navegar para cima pelas sugestões.         |

## Seleção de Botão de Rádio

| Atalho                            | Descrição                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Seta para baixo` / `j` / `Ctrl+N` | Mover a seleção para baixo.                                                                                 |
| `Enter`                           | Confirmar a seleção.                                                                                        |
| `Seta para cima` / `k` / `Ctrl+P`  | Mover a seleção para cima.                                                                                  |
| `1-9`                             | Selecionar um item pelo seu número.                                                                         |
| (vários dígitos)                  | Para itens com números maiores que 9, pressione os dígitos em sucessão rápida para selecionar o item correspondente. |

## Rolagem do Histórico

Ativo apenas quando `ui.useTerminalBuffer` está habilitado (Configurações → UI → Histórico Virtualizado). Nesse modo, o histórico da conversa é renderizado dentro de uma viewport interna ao aplicativo, em vez da rolagem nativa do terminal do host, então as teclas abaixo substituem a rolagem nativa do terminal.

| Atalho            | Descrição                                              |
| ----------------- | ------------------------------------------------------ |
| `Shift+Seta cima` | Rolar o histórico uma linha para cima.                 |
| `Shift+Seta baixo`| Rolar o histórico uma linha para baixo.                |
| `PgUp`            | Rolar o histórico uma página (altura da viewport).     |
| `PgDn`            | Rolar o histórico uma página (altura da viewport).     |
| `Ctrl+Home`       | Ir para o início da conversa.                          |
| `Ctrl+End`        | Ir para o final (e reativar o acompanhamento automático ao vivo). |
| **Roda do mouse** | Rolar o histórico (3 linhas por passo).                |

Quando `ui.useTerminalBuffer` está ativado, o terminal encaminha eventos de mouse para o qwen-code para que a roda possa controlar a viewport interna. Como efeito colateral, **a seleção de texto nativa com clique e arrasto é consumida pelo programa** — mantenha pressionado `Shift` (ou `Option` no Terminal do macOS / iTerm) enquanto arrasta para contornar a captura do mouse e selecionar texto da maneira usual.

### Rolagem com trackpad no tmux

Dentro do tmux, alguns terminais traduzem gestos do trackpad ou da roda em sequências simples de `Seta para cima` e `Seta para baixo` antes que o qwen-code as veja. Esses bytes são idênticos a pressionamentos reais das teclas de seta, então o qwen-code não consegue distinguir se você pretendia rolar a viewport ou navegar pelo histórico de comandos.

Se a rolagem com trackpad estiver alterando o histórico de comandos no tmux, ative `ui.useTerminalBuffer`; em seguida, use `Shift+Seta cima` / `Shift+Seta baixo`, ou a roda do mouse quando o tmux encaminhar eventos de roda para o aplicativo. Se preferir a rolagem nativa do host, ajuste os bindings do mouse no tmux para eventos de roda.

## Integração com IDE

| Atalho | Descrição                               |
| ------ | --------------------------------------- |
| `Ctrl+G` | Ver contexto que a CLI recebeu da IDE. |
