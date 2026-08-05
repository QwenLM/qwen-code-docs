# Replay seguro após perda de conexão MCP

## Problema

Uma ferramenta MCP pode completar um efeito colateral antes que sua conexão de
resposta falhe. Reconectar e enviar o mesmo `tools/call` novamente pode,
portanto, repetir uma escrita enquanto o usuário vê apenas o segundo
resultado. Anotações de ferramenta MCP são opcionais e o padrão é
comportamento não idempotente, então anotações ausentes não podem justificar
replay automático.

## Política de replay

O Qwen Code faz replay automaticamente de uma invocação com falha apenas
quando todas as condições a seguir são verdadeiras:

- A falha é classificada como perda de conexão pelas verificações existentes de
  conexão MCP.
- O servidor MCP tem `trust: true`.
- O workspace atual passa no gate de confiança de workspace.
- A ferramenta declara `idempotentHint: true`, ou declara `readOnlyHint: true`
  sem `destructiveHint: true` ou `idempotentHint: false`.

Anotações conflitantes não são tratadas como seguras. Em particular, uma
ferramenta que se declara somente leitura enquanto também declara comportamento
destrutivo ou não idempotente não sofre replay. Uma declaração explícita de
idempotência pode cobrir uma operação mutante, mas não sobrescreve anotações
contraditórias de somente leitura.

A mesma decisão é aplicada a ambos os caminhos de execução: o cliente MCP
direto usado para chamadas cientes de progresso e o fallback chamável. Erros
de abort, erros que não são de conexão e resultados de protocolo MCP
`isError: true` mantêm seu comportamento existente.

Após reconectar, o Qwen Code aplica as mesmas verificações de confiança e
anotação à ferramenta recém-descoberta antes de enviar o replay. Ele não
carrega a confiança ou anotações do processo de servidor anterior para a nova
invocação.

## Comportamento de falha

Quando uma falha de conexão não é segura para replay, a invocação atual não
reconecta nem constrói uma segunda invocação. Ela retorna um erro estável
explicando que a operação pode ter completado e não deve ser retentada
automaticamente. O erro não inclui argumentos de ferramenta ou o erro de
transporte upstream.

A recuperação de conexão para chamadas posteriores e independentes permanece
responsabilidade do monitor de health existente, de uma reconexão explícita ou
do ciclo de vida normal de descoberta. Chamadas seguras mantêm o comportamento
existente limitado de reconexão.

## Compatibilidade

Esta é uma mudança conservadora intencional. Ferramentas sem anotações não
recebem mais replay transparente de perda de conexão, mesmo quando um release
mais antigo do Qwen Code as retentava. Servidores que desejam replay devem
fornecer anotações precisas, e administradores devem optar pela confiança no
servidor em um workspace confiável.

Anotações MCP são dicas de comportamento fornecidas pelo servidor, não uma
fronteira de autorização. O Qwen Code as usa para replay apenas depois que
ambos os gates de confiança de servidor e workspace passam.

## Verificação

Testes cobrem o cliente direto e o fallback chamável, declarações seguras
idempotentes e somente leitura, anotações ausentes e contraditórias, ambos os
gates de confiança, ferramentas redescobertas que perdem confiança ou
anotações, classificação de erro de conexão, aborts, erros de protocolo, falha
de reconexão e o limite de retry. Um registro E2E local separado exercita um
servidor que consolida um efeito colateral antes de derrubar a conexão de
resposta e verifica que uma chamada insegura alcança o servidor apenas uma
vez.
