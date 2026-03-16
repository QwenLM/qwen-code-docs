# Atalhos de Teclado do Qwen Code

Este documento lista os atalhos de teclado disponíveis no Qwen Code.

## Geral

| Atalho                         | Descrição                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`                            | Fecha diálogos e sugestões.                                                                                           |
| `Ctrl+C`                         | Cancela a solicitação em andamento e limpa a entrada. Pressione duas vezes para sair do aplicativo.                   |
| `Ctrl+D`                         | Sai do aplicativo se a entrada estiver vazia. Pressione duas vezes para confirmar.                                    |
| `Ctrl+L`                         | Limpa a tela.                                                                                                         |
| `Ctrl+O`                         | Alterna a exibição do console de depuração.                                                                            |
| `Ctrl+S`                         | Permite que respostas longas sejam exibidas integralmente, desativando o truncamento. Use o recurso de rolagem para trás (scrollback) do seu terminal para visualizar toda a saída. |
| `Ctrl+T`                         | Alterna a exibição das descrições das ferramentas.                                                                    |
| `Shift+Tab` (`Tab` no Windows)   | Alterna entre os modos de aprovação (`plan` → `default` → `auto-edit` → `yolo`)                                       |

## Prompt de Entrada

| Atalho                                             | Descrição                                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Ativa/desativa o modo shell quando a entrada estiver vazia.                                                                       |
| `?`                                                | Ativa/desativa a exibição dos atalhos de teclado quando a entrada estiver vazia.                                                  |
| `\` (no final da linha) + `Enter`                  | Insere uma nova linha.                                                                                                            |
| `Seta para baixo`                                  | Navega para baixo no histórico de entradas.                                                                                       |
| `Enter`                                            | Envia o prompt atual.                                                                                                             |
| `Meta+Delete` / `Ctrl+Delete`                      | Exclui a palavra à direita do cursor.                                                                                             |
| `Tab`                                              | Conclui automaticamente a sugestão atual, se houver.                                                                              |
| `Seta para cima`                                   | Navega para cima no histórico de entradas.                                                                                       |
| `Ctrl+A` / `Home`                                  | Move o cursor para o início da linha.                                                                                             |
| `Ctrl+B` / `Seta para esquerda`                    | Move o cursor um caractere para a esquerda.                                                                                      |
| `Ctrl+C`                                           | Limpa o prompt de entrada.                                                                                                        |
| `Esc` (pressionado duas vezes)                     | Limpa o prompt de entrada.                                                                                                        |
| `Ctrl+D` / `Delete`                                | Exclui o caractere à direita do cursor.                                                                                           |
| `Ctrl+E` / `End`                                   | Move o cursor para o final da linha.                                                                                              |
| `Ctrl+F` / `Seta para direita`                     | Move o cursor um caractere para a direita.                                                                                       |
| `Ctrl+H` / `Backspace`                             | Exclui o caractere à esquerda do cursor.                                                                                         |
| `Ctrl+K`                                           | Exclui do cursor até o final da linha.                                                                                            |
| `Ctrl+Seta para esquerda` / `Meta+Seta para esquerda` / `Meta+B` | Move o cursor uma palavra para a esquerda.                                                                                       |
| `Ctrl+N`                                           | Navega para baixo no histórico de entradas.                                                                                       |
| `Ctrl+P`                                           | Navega para cima no histórico de entradas.                                                                                        |
| `Ctrl+R`                                           | Realiza uma pesquisa reversa no histórico de entradas/comandos shell.                                                             |
| `Ctrl+Y`                                           | Reenvia a última solicitação que falhou.                                                                                          |
| `Ctrl+Seta para direita` / `Meta+Seta para direita` / `Meta+F` | Move o cursor uma palavra para a direita.                                                                                         |
| `Ctrl+U`                                           | Exclui do cursor até o início da linha.                                                                                           |
| `Ctrl+V` (Windows: `Alt+V`)                        | Cola o conteúdo da área de transferência. Se a área de transferência contiver uma imagem, ela será salva e uma referência será inserida no prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`     | Exclui a palavra à esquerda do cursor.                                                                                            |
| `Ctrl+X` / `Meta+Enter`                            | Abre a entrada atual em um editor externo.                                                                                        |

## Sugestões

| Atalho          | Descrição                                    |
| --------------- | -------------------------------------------- |
| `Seta para baixo` | Navegue para baixo pelas sugestões.          |
| `Tab` / `Enter`   | Aceite a sugestão selecionada.               |
| `Seta para cima`  | Navegue para cima pelas sugestões.           |

## Seleção com Botão de Opção

| Atalho             | Descrição                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Seta para baixo` / `j` | Move a seleção para baixo.                                                                                   |
| `Enter`            | Confirma a seleção.                                                                                           |
| `Seta para cima` / `k`  | Move a seleção para cima.                                                                                     |
| `1-9`              | Seleciona um item pelo seu número.                                                                            |
| (vários dígitos)   | Para itens com números maiores que 9, pressione os dígitos em rápida sucessão para selecionar o item correspondente. |

## Integração com IDE

| Atalho   | Descrição                                 |
| -------- | ----------------------------------------- |
| `Ctrl+G` | Visualizar o contexto recebido da IDE via CLI |