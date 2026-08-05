# Controle de entrada do loop de objetivo

## Problema

Um `/goal` ativo é implementado como um hook de Stop bloqueante. Enquanto o
modelo está em execução, a fila interativa normalmente adia comandos slash até
que o stream fique ocioso. Um loop de objetivo pode nunca alcançar essa
fronteira de ociosidade, então `/goal clear` e comandos `/goal` de
substituição não podem ter efeito.

A resposta de Stop também pode agregar o hook de objetivo com hooks
configurados não relacionados. Limpar um objetivo não deve descartar uma
decisão bloqueante pertencente a outro hook.

## Design

Durante um turno ativo, a fila de mensagens drena comandos `/goal` junto com
mensagens de direcionamento em texto simples. Outros comandos slash permanecem
enfileirados para o processamento ocioso normal.

A CLI executa comandos de objetivo drenados pelo processador de comandos slash
existente:

- Comandos de limpeza aplicam seu efeito colateral sem produzir entrada para o
  modelo.
- Comandos de substituição substituem a instrução de objetivo pendente.
- Quando múltiplos comandos de objetivo são drenados juntos, apenas a
  instrução do objetivo ativo final é enviada.
- A instrução sobrevivente mantém sua posição relativa às mensagens de
  direcionamento em texto simples.
- Comandos de objetivo executados não são restaurados se a preparação de
  direcionamento posterior for cancelada; mensagens não executadas em texto
  simples são restauradas.

O core amostra a fila antes dos hooks de Stop e novamente após um hook de Stop
bloqueante retornar. Uma saída de objetivo bloqueante carrega o ID do seu hook
de objetivo e mantém seu motivo de continuação separado dos motivos comuns de
hook. A ponte de hook também reporta se outra saída de Stop está bloqueando.
Se o objetivo mudar na segunda fronteira, o core remove apenas a continuação
do objetivo antigo; ele ainda segue um motivo de bloqueio independente. Saídas
de hook não bloqueantes não forçam uma iteração extra de objetivo.

## Verificação

- Testes de fila cobrem drenagem de objetivo em turno ativo e adiamento em
  fronteira de ociosidade.
- Testes de stream da CLI cobrem limpeza, substituição, comandos em lote,
  ordenação e comportamento de restauração.
- Testes de core cobrem limpeza e substituição durante a avaliação do hook de
  Stop, incluindo um bloqueador independente agregado.
- Uma sessão tmux local exercita limpeza e substituição contra a CLI
  interativa construída.
