# Atalhos de Teclado do Qwen Code

Este documento lista os atalhos de teclado disponíveis no Qwen Code.

## Geral

| Atalho                         | Descrição                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Fecha diálogos e sugestões.                                                                                           |
| `Ctrl+C`                       | Cancela a solicitação em andamento e limpa a entrada. Pressione duas vezes para sair da aplicação.                    |
| `Ctrl+D`                       | Sai da aplicação se a entrada estiver vazia. Pressione duas vezes para confirmar.                                     |
| `Ctrl+L`                       | Limpa a tela.                                                                                                         |
| `Ctrl+O`                       | Alterna a exibição do console de depuração.                                                                           |
| `Ctrl+S`                       | Permite que respostas longas sejam impressas completamente, desativando o truncamento. Use o histórico de rolagem do seu terminal para visualizar toda a saída. |
| `Ctrl+T`                       | Alterna a exibição das descrições das ferramentas.                                                                    |
| `Shift+Tab` (`Tab` no Windows) | Alterna os modos de aprovação (`plan` → `default` → `auto-edit` → `yolo`)                                             |

## Prompt de Entrada

| Atalho                                             | Descrição                                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Alterna o modo shell quando a entrada está vazia.                                                                                   |
| `?`                                                | Alterna a exibição dos atalhos de teclado quando a entrada está vazia.                                                              |
| `\` (no final da linha) + `Enter`                  | Insere uma nova linha.                                                                                                              |
| `Seta para Baixo`                                  | Navega para baixo no histórico de entrada.                                                                                          |
| `Enter`                                            | Envia o prompt atual.                                                                                                               |
| `Meta+Delete` / `Ctrl+Delete`                      | Exclui a palavra à direita do cursor.                                                                                               |
| `Tab`                                              | Completa automaticamente a sugestão atual, se existir.                                                                              |
| `Seta para Cima`                                   | Navega para cima no histórico de entrada.                                                                                           |
| `Ctrl+A` / `Home`                                  | Move o cursor para o início da linha.                                                                                               |
| `Ctrl+B` / `Seta para Esquerda`                    | Move o cursor um caractere para a esquerda.                                                                                         |
| `Ctrl+C`                                           | Limpa o prompt de entrada                                                                                                           |
| `Esc` (pressionar duas vezes)                      | Limpa o prompt de entrada.                                                                                                          |
| `Ctrl+D` / `Delete`                                | Exclui o caractere à direita do cursor.                                                                                             |
| `Ctrl+E` / `End`                                   | Move o cursor para o final da linha.                                                                                                |
| `Ctrl+F` / `Seta para Direita`                     | Move o cursor um caractere para a direita.                                                                                          |
| `Ctrl+H` / `Backspace`                             | Exclui o caractere à esquerda do cursor.                                                                                            |
| `Ctrl+K`                                           | Exclui do cursor até o final da linha.                                                                                              |
| `Ctrl+Seta para Esquerda` / `Meta+Seta para Esquerda` / `Meta+B` | Move o cursor uma palavra para a esquerda.                                                                                      |
| `Ctrl+N`                                           | Navega para baixo no histórico de entrada.                                                                                          |
| `Ctrl+P`                                           | Navega para cima no histórico de entrada.                                                                                           |
| `Ctrl+R`                                           | Pesquisa reversa no histórico de entrada/comando.                                                                                   |
| `Ctrl+Seta para Direita` / `Meta+Seta para Direita` / `Meta+F` | Move o cursor uma palavra para a direita.                                                                                       |
| `Ctrl+U`                                           | Exclui do cursor até o início da linha.                                                                                             |
| `Ctrl+V` (Windows: `Alt+V`)                        | Cola o conteúdo da área de transferência. Se a área de transferência contiver uma imagem, ela será salva e uma referência será inserida no prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`     | Exclui a palavra à esquerda do cursor.                                                                                              |
| `Ctrl+X` / `Meta+Enter`                            | Abre a entrada atual em um editor externo.                                                                                          |

## Sugestões

| Atalho          | Descrição                                        |
| --------------- | ------------------------------------------------ |
| `Seta para baixo` | Navega para baixo nas sugestões.                 |
| `Tab` / `Enter` | Aceita a sugestão selecionada.                   |
| `Seta para cima`  | Navega para cima nas sugestões.                  |

## Seleção de Botão de Rádio

| Atalho             | Descrição                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Seta para baixo` / `j` | Mover seleção para baixo.                                                                                   |
| `Enter`            | Confirmar seleção.                                                                                            |
| `Seta para cima` / `k`   | Mover seleção para cima.                                                                                    |
| `1-9`              | Selecionar um item pelo seu número.                                                                           |
| (múltiplos dígitos)      | Para itens com números maiores que 9, pressione os dígitos em rápida sucessão para selecionar o item correspondente. |

## Integração com IDE

| Atalho   | Descrição                                |
| -------- | ---------------------------------------- |
| `Ctrl+G` | Ver o contexto da CLI recebido da IDE    |