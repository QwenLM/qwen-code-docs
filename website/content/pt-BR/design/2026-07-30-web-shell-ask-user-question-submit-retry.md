# Retry de Envio do AskUserQuestion no Web Shell

## Problema

`AskUserQuestion` trava imediatamente após uma decisão ser clicada, mas seu
callback não expõe o resultado assíncrono da permissão. Uma requisição falha,
portanto, deixa um painel aparentemente habilitado que silenciosamente ignora
retries. O caminho de envio também retorna silenciosamente quando o payload
de permissão não tem a opção `allow_once`.

## Design

- Dar ao `AskUserQuestion` um callback de confirmação que retorna promise e
  um reportador de erro fornecido pela sua superfície de chat de posse.
- Enquanto a requisição está em andamento, desabilitar as ações e mostrar um
  indicador de envio.
- Manter travada uma decisão aceita com sucesso enquanto o evento de permissão
  remove o painel. Isso também cobre votos de consenso que foram registrados
  mas ainda não são finais.
- Na rejeição ou em um resultado `false`, reportar o erro e destravar as
  ações para que o usuário possa tentar novamente.
- Reportar imediatamente uma opção `allow_once` ausente em vez de retornar
  silenciosamente.
