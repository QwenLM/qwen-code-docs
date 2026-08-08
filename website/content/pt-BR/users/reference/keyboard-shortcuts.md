# Atalhos de teclado do Qwen Code

Este documento lista os atalhos de teclado disponíveis no Qwen Code.

## Geral

| Atalho                           | Descrição                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                            | Fecha diálogos e sugestões. Com um prompt vazio, cancela uma solicitação em andamento; quando ocioso fora do modo IDE, pressione duas vezes para abrir o seletor de rewind.                                                                                              |
| `Ctrl+C`                         | Cancela a solicitação em andamento e limpa a entrada. Pressione duas vezes para sair do aplicativo.                                                                                                                                                                     |
| `Ctrl+D`                         | Sai do aplicativo se a entrada estiver vazia. Pressione duas vezes para confirmar.                                                                                                                                                                                      |
| `Ctrl+L`                         | Limpa a tela.                                                                                                                                                                                                                                                           |
| `Ctrl+O` / `Alt/Option+T`        | Alterna o modo de detalhes expandido: expande ou recolhe todos os blocos de pensamento e saídas de ferramentas inline. Pressione novamente para recolher. Quando `ui.useTerminalBuffer` está desligado, alternar redesenha a conversa completa com saída não truncada no scrollback do terminal. |
| `Ctrl+S`                         | Guarda a entrada não vazia para o projeto atual e a restaura no próximo lançamento. Com a entrada vazia, permite que respostas longas sejam impressas completamente, desativando o truncamento. Use o buffer de rolagem do seu terminal para ver toda a saída.              |
| `Ctrl+T`                         | Alterna a exibição das descrições das ferramentas.                                                                                                                                                                                                                      |
| `Alt/Option+M`                   | Alterna a saída de Markdown entre visualizações renderizadas avançadas e o modo bruto/código. No macOS, o terminal deve enviar Option como Meta.                                                                                                                                                                 |
| `Shift+Tab` (`Tab` no Windows)   | Alterna entre os modos de aprovação (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                |

## Prompt de entrada

| Atalho                                                | Descrição                                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Alterna para o modo shell quando a entrada está vazia.                                                                              |
| `?`                                                   | Alterna a exibição dos atalhos de teclado quando a entrada está vazia.                                                              |
| `/`                                                   | Abre a complementação de comandos slash.                                                                                            |
| `@`                                                   | Abre a complementação para arquivos, pastas e outros contextos.                                                                     |
| `Space` (prompt vazio)                                | Inicia a ditagem por voz quando ela e um modelo de voz estão configurados; o comportamento de segurar ou tocar segue `general.voice.mode`. |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Insere uma nova linha.                                                                                                              |
| `Down Arrow`                                          | Desce uma linha, depois salta para o final, e então avança no histórico.                                                            |
| `Enter`                                               | Envia o prompt atual. Enquanto uma resposta estiver em execução, direciona o turno atual.                                           |
| `Ctrl+Q`                                              | Enfileira o prompt ou comando atual para o próximo turno em vez de direcionar; ele é executado após o Qwen Code retornar ao estado ocioso. |
| `Up Arrow` (no topo) / `Esc`                          | Quando mensagens enfileiradas estão presentes, move-as de volta para a entrada para edição (`Up Arrow` no topo sempre que a entrada estiver visível; `Esc` apenas quando o agente estiver ocioso). Enquanto o agente estiver respondendo e a entrada estiver vazia, `Esc` cancela a solicitação em andamento (as mensagens enfileiradas são então movidas de volta para a entrada). |
| `Meta+D` / `Meta+Delete` / `Ctrl+Delete`              | Exclui a palavra à direita do cursor.                                                                                               |
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
| `Ctrl+V` / `Option+V` (Windows: `Alt+V`)              | Cola o conteúdo da área de transferência. Se a área de transferência contiver uma imagem, ela será salva e uma referência a ela será inserida no prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Exclui a palavra à esquerda do cursor.                                                                                              |
| `Ctrl+X`                                              | Abre a entrada atual em um editor externo.                                                                                          |
| `Ctrl+Z`                                              | Desfaz a última edição na entrada.                                                                                                  |
| `Ctrl+Shift+Z`                                        | Refaz a última edição desfeita na entrada.                                                                                          |

## Shell em primeiro plano

Estes atalhos se aplicam enquanto um comando shell interativo em primeiro plano estiver em execução.

| Atalho                              | Descrição                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl+F`                            | Alterna o foco do teclado entre o shell e o prompt. Quando nenhum shell está em execução, `Ctrl+F` move o cursor do prompt para a direita.                     |
| `Ctrl+Shift+Up` / `Ctrl+Shift+Down` | Rola o shell focado para cima ou para baixo.                                                                                                                   |
| `Ctrl+B`                            | Promove o shell para uma tarefa em segundo plano. O processo filho continua em execução, o turno do agente é desbloqueado, e o shell aparece em `/tasks` e no diálogo de Tarefas em segundo plano. |

## Diálogo de Tarefas em segundo plano

Foque o pill de Tarefas em segundo plano no rodapé (use `Down Arrow` a partir de um compositor vazio — isso atravessa o painel de agente ao vivo e, se presente, a barra de abas da Arena primeiro) e pressione `Enter` para abrir o diálogo. Ele lista agentes em segundo plano, shells, monitores, execuções de fluxo de trabalho e memory dreams.

| Atalho                    | Descrição                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Up Arrow` / `Down Arrow` | Move a seleção entre as tarefas.                                                                                                                                   |
| `Enter`                   | Abre a visualização de detalhes da tarefa selecionada.                                                                                                             |
| `x`                       | Para a tarefa selecionada (abandona um agente pausado). Um agente em primeiro plano que bloqueia seu turno precisa de um segundo `x` para confirmar.                 |
| `r`                       | Retoma o agente pausado selecionado.                                                                                                                               |
| `p`                       | Pausa ou retoma cooperativamente a execução de fluxo de trabalho em segundo plano selecionada. Nenhum novo agente é iniciado enquanto pausado, mas o código de script entre chamadas de agente continua executando. |
| `s`                       | Salva o script de uma execução de fluxo de trabalho finalizada (concluída, com falha ou cancelada) (somente na visualização de detalhes).                           |
| `Left Arrow` / `Esc`      | Retorna à lista a partir da visualização de detalhes, ou fecha o diálogo.                                                                                          |

## Sugestões

| Atalho                               | Descrição                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `Down Arrow` / `Ctrl+N`              | Navega para baixo nas sugestões.                                        |
| `Tab` / `Enter`                      | Aceita a sugestão selecionada.                                          |
| `Up Arrow` / `Ctrl+P`                | Navega para cima nas sugestões.                                         |
| `Right Arrow`                        | Aceita uma sugestão ghost-text quando o prompt está vazio.              |
| `Ctrl+Tab` / `Ctrl+Right Arrow`      | Muda para a próxima categoria de complementação quando as abas de categoria estão visíveis. |
| `Ctrl+Shift+Tab` / `Ctrl+Left Arrow` | Muda para a categoria anterior de complementação quando as abas de categoria estão visíveis. |

## Pesquisa no histórico

Pressione `Ctrl+R` para pesquisar no histórico de prompts, ou no histórico do shell enquanto o modo shell estiver ativo.

| Atalho                       | Descrição                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `Up Arrow` / `Down Arrow`    | Navega pelas entradas do histórico correspondentes.        |
| `Left Arrow` / `Right Arrow` | Recolhe ou expande uma entrada longa selecionada.          |
| `Tab`                        | Aceita a entrada selecionada no prompt sem enviar.         |
| `Enter`                      | Envia a entrada selecionada.                               |
| `Esc`                        | Fecha a pesquisa no histórico.                             |

## Seleção de botão de opção

| Atalho                        | Descrição                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` / `Ctrl+N` | Move a seleção para baixo.                                                                                    |
| `Enter`                       | Confirma a seleção.                                                                                           |
| `Up Arrow` / `k` / `Ctrl+P`   | Move a seleção para cima.                                                                                     |
| `1-9`                         | Seleciona um item pelo seu número.                                                                            |
| `(múltiplos dígitos)`         | Para itens com números maiores que 9, pressione os dígitos em rápida sucessão para selecionar o item correspondente. |

## Histórico de rolagem

Ativo quando `ui.useTerminalBuffer` está habilitado (Settings → UI → Virtualized History), o modo de leitor de tela está desativado e o Qwen Code está em execução em um terminal interativo compatível (`stdout` é um TTY, CI não está ativo e `TERM` não é `dumb`), que é o padrão para sessões normais sem leitor de tela. Nesse modo, o histórico de conversas é renderizado dentro de uma viewport no aplicativo em vez do buffer de rolagem do terminal host, então as teclas abaixo substituem a rolagem nativa do terminal.

| Atalho            | Descrição                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `Shift+Up`        | Rola o histórico uma linha para cima.                                           |
| `Shift+Down`      | Rola o histórico uma linha para baixo.                                          |
| `PgUp`            | Rola o histórico uma página para cima (altura da viewport).                     |
| `PgDn`            | Rola o histórico uma página para baixo (altura da viewport).                    |
| `Ctrl+Home`       | Pula para o topo da conversa.                                                   |
| `Ctrl+End`        | Pula para o final (e reativa o acompanhamento automático em tempo real).        |
| **Mouse wheel**   | Rola o histórico (3 linhas por passo). Requer `ui.mouseTracking` (ativado por padrão). |

Quando `ui.useTerminalBuffer` está ativado e `ui.mouseTracking` está habilitado (o padrão), o terminal encaminha os eventos do mouse para o qwen-code para que a roda do mouse possa controlar a viewport no aplicativo. Como efeito colateral, a seleção de texto nativa por clique e arrasto é consumida pelo programa, então o qwen-code fornece a sua própria: **arraste para selecionar texto na viewport do histórico, clique duas vezes para selecionar uma palavra, clique três vezes para selecionar uma linha.** A seleção é destacada e copiada para a área de transferência quando você solta o mouse (funciona localmente, via SSH por OSC 52 e dentro do tmux). Um único clique limpa a seleção; rolar ou receber nova saída também a limpa. A seleção está limitada à viewport visível por enquanto. Você ainda pode usar a seleção nativa do terminal segurando `Shift` (ou `Option` no Terminal do macOS / iTerm) enquanto arrasta. Defina `ui.mouseTracking` como `false` para impedir que o qwen-code capture o mouse completamente; isso restaura o menu nativo do botão direito do terminal, os cliques em hyperlinks OSC 8 e a seleção por clique e arrasto, mas a viewport no aplicativo não responderá mais ao mouse — use os atalhos de teclado acima para rolar.

### Rolagem com trackpad no tmux

Dentro do tmux, alguns terminais traduzem gestos de trackpad ou da roda do mouse em sequências simples de `Up Arrow` e `Down Arrow` antes que o `qwen-code` as receba. Esses bytes são idênticos aos pressionamentos reais das teclas de seta, então o `qwen-code` não consegue distinguir se você pretendia rolar a viewport ou navegar pelo histórico de prompts.

Se a rolagem com trackpad alterar o histórico de prompts no tmux, certifique-se de que `ui.useTerminalBuffer` esteja habilitado; em seguida, use `Shift+Up` / `Shift+Down`, ou a roda do mouse quando o tmux encaminhar os eventos da roda para o aplicativo (requer `ui.mouseTracking`). Se preferir o scrollback do host, ajuste as associações de mouse do tmux para os eventos da roda.

## Integração com IDE

| Atalho | Descrição |
| -------- | --------------------------------- |
| `Ctrl+G` | Ver contexto CLI recebido da IDE |
