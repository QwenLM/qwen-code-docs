# Interações de Instalação de Extensões do Daemon

## Contexto

O daemon instala extensões como operações assíncronas de workspace. Algumas
extensões exigem que o usuário selecione um plugin do marketplace Claude ou
forneça valores de configuração enquanto a instalação está em andamento.

## Design

Uma operação de extensão pode entrar em `waiting_for_input`. Seu status expõe
uma interação não sensível por vez:

- `marketplace_plugin` inclui o nome do marketplace e os plugins selecionáveis.
- `setting` inclui o nome da configuração, descrição, variável de ambiente e
  se o valor é sensível.

O cliente faz polling no endpoint de status de operação existente e então
envia a resposta para
`POST /workspace/extensions/operations/:operationId/interactions/:interactionId`.
O callback em memória da operação retoma depois que a resposta é validada.

Valores de configuração nunca são incluídos no status da operação, em
resultados ou em logs. O mecanismo existente de configurações de extensão
continua responsável por armazená-los.

## Tempo de vida

Operações de instalação e atualização têm um tempo de vida compartilhado de
vinte minutos. Cada interação pode usar até dez minutos do tempo de vida
restante da operação. Outras mutações de extensão mantêm seu timeout
existente. Uma operação em espera permanece na fila serializada de mutações
existente, então nenhuma outra mutação de extensão pode observar um estado
parcialmente instalado.
