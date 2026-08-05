# Comandos slash não bloqueantes durante streaming

## Problema

O roteador de entrada interativo atualmente enfileira todo comando slash,
exceto `/btw`, enquanto uma resposta de modelo está em streaming. Isso faz
controles locais de UI esperarem pelo turno de conversa ativo mesmo quando seu
resultado não depende daquele turno.

## Design

`SlashCommand` ganha uma capability opt-in `canRunDuringStreaming`. O padrão
permanece falso. Enquanto o modelo principal está respondendo, o roteador de
entrada resolve o comando submetido pela árvore de comandos slash existente.
Um comando opt-in é enviado diretamente ao processador de comandos slash;
todos os outros comandos slash continuam usando a fila de mensagens
serializada existente.

O caminho direto não passa por `submitQuery`. Essa função é dona do ciclo de
vida do turno de modelo e deliberadamente rejeita turnos de nível superior
concorrentes. Manter comandos locais fora dela evita compartilhar controladores
de abort, flags de submissão ou contadores de stream de modelo com a resposta
ativa.

O processador de comandos slash e os resultados de comando já atualizam o Ink
por meio de estado React. Os comandos iniciais, portanto, não escrevem
diretamente no stdout do terminal enquanto o Ink está renderizando.

## Conjunto inicial de comandos

- `/status`, `/about` e `/status paths`: leem informação local de runtime e
  anexam um item de histórico do Ink.
- `/settings`: abre o diálogo de configurações; mudanças salvas são aplicadas
  pelos hooks de configurações existentes sem substituir o turno de conversa
  ativo.
- `/help`: abre o diálogo estático de ajuda.

As seguintes categorias permanecem serializadas:

- Comandos que submetem ou transformam um turno de modelo, como skills,
  `/summary`, `/compress`, `/model <model> <prompt>` e `/goal`.
- Comandos que substituem, limpam, retrocedem, retomam, ramificam ou de outra
  forma mutam o estado de conversa.
- Comandos que agendam ferramentas ou executam trabalho externo demorado.
- Comandos que leem estado sendo mutado pelo turno ativo, como `/context`,
  `/stats`, `/copy`, `/diff` e `/recap`.

`/btw` mantém seu caminho especializado de requisição de modelo concorrente.
`/quit` mantém seu caminho existente de cancelamento imediato. Ctrl+Q continua
a forçar qualquer submissão a esperar pela ociosidade, incluindo um comando
que de outra forma seria opt-in.

## Verificação

A cobertura unitária verifica que comandos opt-in contornam tanto
`submitQuery` quanto a fila de mensagens durante uma resposta, enquanto
comandos slash não marcados permanecem enfileirados. Testes de comando fixam
as declarações iniciais de capability. Verificações E2E interativas devem
iniciar uma resposta visivelmente em streaming, abrir cada comando opt-in,
fechar qualquer diálogo e confirmar que a resposta original continua e
completa.
