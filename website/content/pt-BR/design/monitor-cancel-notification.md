# Notificações explícitas de cancelamento de monitor

## Problema

`task_stop` já retorna um resultado de ferramenta síncrono confirmando que um
monitor foi cancelado. O registro de monitores também emite uma notificação
terminal `cancelled`, que clientes registram como uma mensagem de usuário de
notificação e submetem como um novo turno de modelo. Um evento `running`
enfileirado logo antes do cancelamento pode causar o mesmo turno extra mesmo
que a notificação terminal seja suprimida.

## Design

- Cancelar monitores silenciosamente quando o cancelamento vem de `task_stop`;
  o resultado de ferramenta permanece a confirmação visível ao usuário e ao
  modelo.
- Manter inalterado o comportamento padrão de cancelamento do registro para
  outros chamadores.
- No momento da drenagem, descartar notificações de monitor `running`
  enfileiradas cuja entrada de registro agora está explicitamente
  `cancelled`. Esta verificação se aplica à fila interativa, à fila
  stream-json persistente e à fila headless de uso único.
- Continuar entregando notificações naturais de `completed` e `failed`, junto
  com notificações terminais emitidas por caminhos de cancelamento que não
  `task_stop`.

O ACP já rejeita notificações de monitor `running`, então o cancelamento
explícito silencioso é suficiente para esse cliente.

Notificações de monitor roteadas por dono permanecem dentro da fila de entrada
de um agente em vez da conversa do usuário. Elas estão fora desta correção de
notificação de sessão; no caminho comum de chamada de ferramenta, qualquer
evento enfileirado é entregue junto com o já necessário resultado de
ferramenta `task_stop` em vez de criar um turno de sessão.

## Verificação

- `task_stop` cancela e aborta um monitor sem invocar seu callback de
  notificação.
- Cada cliente descarta um evento `running` enfileirado depois que o monitor é
  explicitamente cancelado.
- Testes existentes de notificação terminal continuam demonstrando que
  conclusão e falha naturais são entregues.
- Uma execução real dirigida por modelo de `monitor` seguido de `task_stop`
  não produz turno de notificação subsequente.
