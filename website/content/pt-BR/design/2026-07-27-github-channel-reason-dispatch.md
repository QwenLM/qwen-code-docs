# Despacho por Reason de Notificação do GitHub

## Objetivo

Usar `notification.reason` para escolher o prompt enviado pelo canal do
GitHub sem mudar seu comportamento de polling, avanço de cursor, retry ou
reporte de erro.

| Reason              | Comportamento                                                   |
| ------------------- | --------------------------------------------------------------- |
| `mention`           | Enviar apenas conteúdo que realmente menciona o bot.            |
| `review_requested`  | Para pull requests, enviar um prompt de review com dados do pull request. |
| `assign`            | Enviar um prompt de triagem com dados da issue.                 |
| `author`, `comment` | Agregar os novos comentários da janela em um único prompt de acompanhamento. |
| Outras              | Manter o tratamento por comentário e identificar o reason da notificação. |

Eventos de review e de atribuição usam o ator do evento do GitHub como
remetente do envelope para que as verificações existentes de política de
remetente avaliem a pessoa que iniciou a ação, não o autor da issue ou do
pull request. A agregação inclui apenas remetentes permitidos e é limitada
aos 20 comentários mais recentes e 400 caracteres por comentário. A política
de pareamento mantém o despacho por comentário para que cada remetente seja
autorizado independentemente.

O cursor lembra até 500 IDs de nós de comentários despachados e de eventos
diretos. Um piso fixo no momento da instalação permite que notificações
atrasadas de review e atribuição encontrem seu evento sem reproduzir o
histórico anterior à instalação. IDs de notificação não são persistidos
porque o GitHub os reutiliza para atividade posterior no mesmo thread.

## Verificação

O teste focado do adapter cobre cada rota, metadata de disparo direto,
remoção de menções, autorização agregada e deduplicação de comentários e
eventos diretos.
