# Atalhos de teclado do Qwen Code

Este documento lista os atalhos de teclado disponíveis no Qwen Code.

## Geral

| Atalho                           | Descrição                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                            | Fecha diálogos e sugestões.                                                                                                                                                                                                                                                                                       |
| `Ctrl+C`                         | Cancela a solicitação em andamento e limpa a entrada. Pressione duas vezes para sair do aplicativo.                                                                                                                                                                                                               |
| `Ctrl+D`                         | Sai do aplicativo se a entrada estiver vazia. Pressione duas vezes para confirmar.                                                                                                                                                                                                                                |
| `Ctrl+L`                         | Limpa a tela.                                                                                                                                                                                                                                                                                                     |
| `Ctrl+O`                         | Alterna o modo compacto (oculta/mostra a saída da ferramenta e o raciocínio).                                                                                                                                                                                                                                     |
| `Ctrl+S`                         | Permite que respostas longas sejam impressas completamente, desativando o truncamento. Use o buffer de rolagem do seu terminal para ver toda a saída.                                                                                                                                                             |
| `Ctrl+T`                         | Alterna a exibição das descrições das ferramentas.                                                                                                                                                                                                                                                                |
| `Ctrl+B`                         | Enquanto um comando de shell em primeiro plano estiver em execução: promove-o para uma tarefa em segundo plano. O processo filho continua em execução, o turno do agente é desbloqueado e o shell aparece em `/tasks` + no diálogo de Tarefas em segundo plano. Não executa nenhuma ação quando nenhum shell está em execução — o Ctrl+B então é propagado para seu atalho na área do prompt (cursor para a esquerda). |
| `Alt/Option+M`                   | Alterna a saída de Markdown entre visualizações renderizadas avançadas e o modo bruto/código. No macOS, o terminal deve enviar Option como Meta.                                                                                                                                                                  |
| `Shift+Tab` (`Tab` no Windows)   | Alterna entre os modos de aprovação (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                          |

## Prompt de entrada

| Atalho                                                | Descrição                                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Alterna para o modo shell quando a entrada está vazia.                                                                              |
| `?`                                                   | Alterna a exibição dos atalhos de teclado quando a entrada está vazia.                                                              |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Insere uma nova linha.                                                                                                              |
| `Down Arrow`                                          | Desce uma linha, depois salta para o final, e então avança no histórico.                                                            |
| `Enter`                                               | Envia o prompt atual.                                                                                                               |
| `Meta+Delete` / `Ctrl+Delete`                         | Exclui a palavra à direita do cursor.                                                                                               |
| `Tab`                                                 | Preenche automaticamente a sugestão atual, se houver uma.                                                                           |
| `Up Arrow`                                            | Sobe uma linha, depois salta para o início, e então retrocede no histórico.                                                         |
| `Ctrl+A` / `Home`                                     | Move o cursor para o início da linha.                                                                                               |
| `Ctrl+B` / `Left Arrow`                               | Move o cursor um caractere para a esquerda.                                                                                         |
| `Ctrl+C`                                              | Limpa o prompt de entrada                                                                                                           |
| `Esc` (pressione duas vezes)                          | Limpa o prompt de entrada.                                                                                                          |
| `Ctrl+D` / `Delete`                                   | Exclui o caractere à direita do cursor.                                                                                             |
| `Ctrl+E` / `End`                                      | Move o cursor para o final da linha.                                                                                                |
| `Ctrl+F` / `Right Arrow`                              | Move o cursor um caractere para a direita.                                                                                          |
| `Ctrl+H` / `Backspace`                                | Exclui o caractere à esquerda do cursor.                                                                                            |
| `Ctrl+K`                                              | Exclui do cursor até o final da linha.                                                                                              |
| `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`      | Move o cursor uma palavra para a esquerda.                                                                                          |
| `Ctrl+N`                                              | Desce uma linha, depois salta para o final, e então avança no histórico.                                                            |
| `Ctrl+P`                                              | Sobe uma linha, depois salta para o início, e então retrocede no histórico.                                                         |
| `Ctrl+R`                                              | Pesquisa reversa no histórico de entrada/shell.                                                                                     |
| `Ctrl+Y`                                              | Repete a última solicitação com falha.                                                                                              |
| `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F`    | Move o cursor uma palavra para a direita.                                                                                           |
| `Ctrl+U`                                              | Exclui do cursor até o início da linha.                                                                                             |
| `Ctrl+V` (Windows: `Alt+V`)                           | Cola o conteúdo da área de transferência. Se a área de transferência contiver uma imagem, ela será salva e uma referência a ela será inserida no prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Exclui a palavra à esquerda do cursor.                                                                                              |
| `Ctrl+X`                                              | Abre a entrada atual em um editor externo.                                                                                          |

## Sugestões

| Atalho                  | Descrição                              |
| ----------------------- | -------------------------------------- |
| `Down Arrow` / `Ctrl+N` | Navega para baixo nas sugestões.       |
| `Tab` / `Enter`         | Aceita a sugestão selecionada.         |
| `Up Arrow` / `Ctrl+P`   | Navega para cima nas sugestões.        |

## Seleção de botão de opção

| Atalho                        | Descrição                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` / `Ctrl+N` | Move a seleção para baixo.                                                                                    |
| `Enter`                       | Confirma a seleção.                                                                                           |
| `Up Arrow` / `k` / `Ctrl+P`   | Move a seleção para cima.                                                                                     |
| `1-9`                         | Seleciona um item pelo seu número.                                                                            |
| `(múltiplos dígitos)`         | Para itens com números maiores que 9, pressione os dígitos em rápida sucessão para selecionar o item correspondente. |

## Histórico de rolagem

Ativo apenas quando `ui.useTerminalBuffer` está habilitado (Settings → UI → Virtualized History). Nesse modo, o histórico de conversas é renderizado dentro de uma viewport no aplicativo em vez do buffer de rolagem do terminal host, então as teclas abaixo substituem a rolagem nativa do terminal.

| Atalho            | Descrição                                            |
| ----------------- | ---------------------------------------------------- |
| `Shift+Up`        | Rola o histórico uma linha para cima.                |
| `Shift+Down`      | Rola o histórico uma linha para baixo.               |
| `PgUp`            | Rola o histórico uma página para cima (altura da viewport). |
| `PgDn`            | Rola o histórico uma página para baixo (altura da viewport). |
| `Ctrl+Home`       | Pula para o topo da conversa.                        |
| `Ctrl+End`        | Pula para o final (e reativa o acompanhamento automático em tempo real). |
| **Mouse wheel**   | Rola o histórico (3 linhas por passo).               |
Quando `ui.useTerminalBuffer` está ativado, o terminal encaminha os eventos do mouse para o `qwen-code` para que a roda do mouse possa controlar o viewport dentro do aplicativo. Como efeito colateral, **a seleção de texto nativa por clique e arrasto é consumida pelo programa** — segure `Shift` (ou `Option` no Terminal do macOS / iTerm) enquanto arrasta para ignorar a captura do mouse e selecionar o texto da maneira usual.

### Rolagem com trackpad no tmux

Dentro do tmux, alguns terminais traduzem gestos de trackpad ou da roda do mouse em sequências simples de `Up Arrow` e `Down Arrow` antes que o `qwen-code` as receba. Esses bytes são idênticos aos pressionamentos reais das teclas de seta, então o `qwen-code` não consegue distinguir se você pretendia rolar o viewport ou navegar pelo histórico de prompts.

Se a rolagem com trackpad alterar o histórico de prompts no tmux, ative `ui.useTerminalBuffer`; em seguida, use `Shift+Up` / `Shift+Down` ou a roda do mouse quando o tmux encaminhar os eventos da roda para o aplicativo. Se preferir o scrollback do host, ajuste as associações de mouse do tmux para os eventos da roda.

## Integração com IDE

| Atalho | Descrição |
| -------- | --------------------------------- |
| `Ctrl+G` | Ver contexto CLI recebido da IDE |