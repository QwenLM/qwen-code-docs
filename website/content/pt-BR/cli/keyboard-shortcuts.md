# Atalhos de Teclado do Qwen Code

Este documento lista os atalhos de teclado disponíveis no Qwen Code.

## Geral

| Atalho      | Descrição                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`       | Fecha diálogos e sugestões.                                                                                            |
| `Ctrl+C`    | Cancela a requisição em andamento e limpa a entrada. Pressione duas vezes para sair do aplicativo.                      |
| `Ctrl+D`    | Sai do aplicativo se a entrada estiver vazia. Pressione duas vezes para confirmar.                                      |
| `Ctrl+L`    | Limpa a tela.                                                                                                          |
| `Ctrl+O`    | Alterna a exibição do console de debug.                                                                                |
| `Ctrl+S`    | Permite que respostas longas sejam impressas completamente, desabilitando o truncamento. Use o scroll do seu terminal para ver a saída completa. |
| `Ctrl+T`    | Alterna a exibição das descrições das ferramentas.                                                                     |
| `Shift+Tab` | Alterna entre os modos de aprovação (`plan` → `default` → `auto-edit` → `yolo`).                                        |

## Input Prompt

| Atalho                                             | Descrição                                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Alterna para o modo shell quando o input está vazio.                                                                                |
| `\` (no final da linha) + `Enter`                  | Insere uma nova linha.                                                                                                              |
| `Seta para Baixo`                                  | Navega para baixo no histórico de inputs.                                                                                           |
| `Enter`                                            | Envia o prompt atual.                                                                                                               |
| `Meta+Delete` / `Ctrl+Delete`                      | Deleta a palavra à direita do cursor.                                                                                               |
| `Tab`                                              | Autocompleta a sugestão atual, se houver uma.                                                                                       |
| `Seta para Cima`                                   | Navega para cima no histórico de inputs.                                                                                            |
| `Ctrl+A` / `Home`                                  | Move o cursor para o início da linha.                                                                                               |
| `Ctrl+B` / `Seta para Esquerda`                    | Move o cursor um caractere para a esquerda.                                                                                         |
| `Ctrl+C`                                           | Limpa o prompt de input.                                                                                                            |
| `Esc` (pressionar duas vezes)                      | Limpa o prompt de input.                                                                                                            |
| `Ctrl+D` / `Delete`                                | Deleta o caractere à direita do cursor.                                                                                             |
| `Ctrl+E` / `End`                                   | Move o cursor para o final da linha.                                                                                                |
| `Ctrl+F` / `Seta para Direita`                     | Move o cursor um caractere para a direita.                                                                                          |
| `Ctrl+H` / `Backspace`                             | Deleta o caractere à esquerda do cursor.                                                                                            |
| `Ctrl+K`                                           | Deleta do cursor até o final da linha.                                                                                              |
| `Ctrl+Seta para Esquerda` / `Meta+Seta para Esquerda` / `Meta+B` | Move o cursor uma palavra para a esquerda.                                                                            |
| `Ctrl+N`                                           | Navega para baixo no histórico de inputs.                                                                                           |
| `Ctrl+P`                                           | Navega para cima no histórico de inputs.                                                                                            |
| `Ctrl+Seta para Direita` / `Meta+Seta para Direita` / `Meta+F`   | Move o cursor uma palavra para a direita.                                                                             |
| `Ctrl+U`                                           | Deleta do cursor até o início da linha.                                                                                             |
| `Ctrl+V`                                           | Cola o conteúdo da área de transferência. Se a área de transferência contiver uma imagem, ela será salva e uma referência será inserida no prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`     | Deleta a palavra à esquerda do cursor.                                                                                              |
| `Ctrl+X` / `Meta+Enter`                            | Abre o input atual em um editor externo.                                                                                            |

## Sugestões

| Atalho          | Descrição                              |
| --------------- | -------------------------------------- |
| `Down Arrow`    | Navegar para baixo pelas sugestões.    |
| `Tab` / `Enter` | Aceitar a sugestão selecionada.        |
| `Up Arrow`      | Navegar para cima pelas sugestões.     |

## Radio Button Select

| Atalho             | Descrição                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` | Move a seleção para baixo.                                                                                     |
| `Enter`            | Confirma a seleção.                                                                                            |
| `Up Arrow` / `k`   | Move a seleção para cima.                                                                                      |
| `1-9`              | Seleciona um item pelo seu número.                                                                             |
| (vários dígitos)   | Para itens com números maiores que 9, pressione os dígitos em sequência rápida para selecionar o item desejado. |

## Integração com IDE

| Atalho   | Descrição                          |
| -------- | ---------------------------------- |
| `Ctrl+G` | Ver contexto CLI recebido da IDE    |