# Protocolo entre sessões

Esta página é o contrato para um programa que deseja participar da
comunicação entre sessões sem ser uma sessão do Qwen Code: um front-end
de voz, um daemon de relay, um script que monitora um build. Descreve
o que uma sessão escreve no registro, o que sua inbox lê de uma
conexão e o que ela envia de volta. Tudo aqui é o que o código faz
hoje no schema version 1 e frame version 1; a última seção diz o que
pode mudar e como você será avisado.

Todo valor que cruza uma fronteira de processo é não confiável na
chegada e validado pelo leitor. Onde esta página diz que um campo
"must" ter uma determinada forma, um valor que não a tenha é descartado,
nunca rejeitado com um erro.

## 1. O registro de sessões

Uma sessão em execução publica um registro:

```
$QWEN_HOME/sessions/<pid>.json        (directory 0700, file 0600)
```

`$QWEN_HOME` tem como padrão `~/.qwen`. O nome do arquivo é o PID do
escritor e nada mais; um registro cujo campo `pid` não concorda com o
nome do arquivo é ignorado.

```json
{
  "schemaVersion": 1,
  "pid": 41337,
  "procStart": "a1b2c3d4-…-boot-uuid:8895124",
  "pidNs": 4026531836,
  "sessionId": "8e016be8-5b48-4c13-ad22-1f5326ae64ac",
  "cwd": "/home/me/project",
  "name": "project-3f",
  "startedAt": 1788959000000,
  "qwenVersion": "0.23.0",
  "kind": "tui",
  "ipcPath": "/run/user/1000/qwen-socks/41337.sock",
  "ipcToken": "c0ffee…64 hex…"
}
```

| Campo           | Significado                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | Sempre `1`. Um leitor pula um registro com versão maior e nunca o deleta.                                                                                                                                                                                                                                       |
| `pid`           | O id do processo do escritor. Deve ser igual ao nome do arquivo.                                                                                                                                                                                                                                                |
| `procStart`     | `<boot id>:<process start ticks>` no Linux (`/proc/sys/kernel/random/boot_id` e campo 22 de `/proc/<pid>/stat`); `null` nos demais. Protege contra reutilização de PID e contra registros escritos em outra máquina que compartilha este diretório home.                                                       |
| `pidNs`         | Número do inode de `/proc/self/ns/pid` no Linux; `null` nos demais. Um leitor só lista e varre registros do seu próprio namespace.                                                                                                                                                                              |
| `sessionId`     | O id da sessão. `/clear` e `/resume` trocam esse id sob o mesmo PID, então releia o registro antes de cada envio.                                                                                                                                                                                               |
| `cwd`           | Diretório de trabalho no momento do registro.                                                                                                                                                                                                                                                                   |
| `name`          | Nome de exibição. Derivado do basename do cwd (letras Unicode, marcas, dígitos, `.`, `_`, `-`; até 32 code points) mais `-` e os dois primeiros caracteres hex de `sha256(sessionId)`, a menos que o escritor tenha escolhido um. Não é único.                                                                   |
| `startedAt`     | Milissegundos desde epoch. Mais recente primeiro é a ordem da listagem e o critério de desempate entre gêmeos.                                                                                                                                                                                                  |
| `qwenVersion`   | Texto livre ou `null`.                                                                                                                                                                                                                                                                                          |
| `kind`          | O que registrou: `tui` (alguém em um terminal), `headless`, `serve`, `external`. ASCII minúsculo, dígitos e hífens, no máximo 16 caracteres; qualquer outra coisa é descartada na leitura. Ausente significa um escritor anterior ao campo, que é lido como `tui`. Um rótulo para listagens — nunca uma credencial; veja abaixo. |
| `ipcPath`       | O socket da inbox, presente apenas enquanto estiver vinculado. Ausente significa descobrível, mas não endereçável para mensagens.                                                                                                                                                                               |
| `ipcToken`      | 64 caracteres hex. O que uma conexão para `ipcPath` apresenta em sua linha de autenticação. Ausente significa que a inbox não requer nenhum (registros de builds mais antigos).                                                                                                                                |

**Um registro é uma autodeclaração.** Cada campo nele foi escrito pelo
processo que descreve, então `name`, `cwd` e `kind` são afirmações, não
fatos nos quais um leitor possa se basear. Nada que decide o que um
remetente pode fazer os lê — isso é resolvido pelo que uma conexão
apresenta (§3) e pela política da própria sessão receptora (§6).
Defina `kind` para que uma listagem possa agrupar sessões
honestamente; não espere que isso lhe garanta algo.

**Escrevendo seu próprio registro.** Um processo externo que deseja ser
encontrado — listado por `qwen sessions ps`, endereçável por
`send_message`, capaz de receber recibos — escreve o mesmo registro
para si mesmo: seu próprio `pid`, `procStart` e `pidNs` calculados da
mesma forma, um `sessionId` que ele gera (qualquer UUID), `kind:
"external"`, um `name` (o seu, ou derivado da mesma forma; é achatado
para uma linha e limitado quando exibido), e `ipcPath` + `ipcToken`
para uma inbox que ele mesmo vincula (§2). Escreva em um arquivo
temporário no mesmo diretório e faça `rename` sobre o alvo; crie o
arquivo 0600; recuse escrever através de um symlink. Remova o registro
ao sair. Um registro cujo processo não existe mais é varrido pela
próxima sessão que listar, mas apenas quando `procStart` prova que o
PID não foi simplesmente reutilizado.

**Leitura.** Qualquer coisa que possa ler o diretório pode ler todos os
registros, incluindo tokens: poder descobrir uma sessão e poder se
autenticar nela são uma única capability por design. Não imprima
`ipcToken` em nenhum lugar onde um modelo ou um log possa vê-lo.

**Atividade.** Um registro está ativo quando todas estas condições são
atendidas: o nome do arquivo corresponde a `pid`; `pidNs` é igual ao do
leitor; o boot id dentro de `procStart` é igual ao do leitor (ou
`procStart` é `null`); e o PID está vivo com os mesmos start ticks. Um
registro ativo com um `ipcPath` ainda precisa ter o socket conectado
antes de ser anunciado como alcançável — um arquivo de socket sobrevive
a um crash.

**Refs.** Handles de exibição usam `ref = sha256(sessionId)[0:6]`. Duas
sessões podem compartilhar um `name`; a gramática de endereçamento que
um remetente digita é `name`, `name [ref]`, `[ref]` ou o `ref` puro, e
um `name` ambíguo é um erro em vez de uma suposição.

## 2. O socket da inbox

Um socket de domínio UNIX por sessão, no primeiro que conseguir bind:

1. `$XDG_RUNTIME_DIR/qwen-socks/<pid>.sock`
2. `$TMPDIR/qwen-socks-<16 hex>/<pid>.sock`
3. `/tmp/qwen-socks-<16 hex>/<pid>.sock`

O diretório é 0700 e o socket 0600. Um caminho maior que 103 bytes é
ignorado. Quando o nome com chave de PID já está em uso por um listener
ativo (dois namespaces de PID compartilhando um diretório runtime), a
sessão faz bind de `<pid>-<8 hex>.sock` ao lado dele. Peers nunca
derivam um caminho de socket; eles leem `ipcPath` do registro.

Uma conexão carrega JSON delimitado por novas linhas, um objeto por
linha, UTF-8. Uma única linha maior que 1 MiB (medida em code units
UTF-16) derruba a conexão. Uma conexão que ficar 30 segundos sem
completar uma linha que faça parse é derrubada; linhas inválidas não
estendem o prazo. O listener aceita no máximo 64 conexões
simultâneas.

A troca esperada é uma mensagem por conexão: conecte, escreva a linha
de autenticação e o frame em uma única escrita, half-close, aguarde o
peer fechar. O receptor nunca escreve na mesma conexão; qualquer coisa
que tenha a dizer volta como uma conexão separada para o seu próprio
`ipcPath`.

## 3. A linha de autenticação

Quando o registro alvo tem um `ipcToken`, a primeira linha deve ser:

```json
{ "msgV": 1, "type": "auth", "token": "<token>" }
```

Três tipos de token são aceitos, e a inbox lembra qual deles viu:

| Apresentado                                                                   | A inbox conclui                | Efeito                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| O `ipcToken` do registro da sessão alvo                                       | um peer comum                  | sujeito à política e paridade de modo (§6)                                        |
| `QWEN_CODE_MESSAGING_TOKEN` do próprio ambiente da sessão alvo                | um processo que aquela sessão iniciou | entregue sob a paridade padrão; `origin="own-process"`                        |
| Um token de controller `qpc_<64 hex>` gerado com `qwen sessions controllers add` | um programa no qual o usuário confia | entregue sob a paridade padrão; `origin="controller"` com o rótulo da grant |

Uma primeira linha que não seja uma linha de autenticação, ou que
apresente um token que não corresponda a nenhum dos três, derruba a
conexão silenciosamente. Quando o registro não tem `ipcToken`, não
envie uma linha de autenticação; uma inbox mais antiga a lê como um
tipo de frame desconhecido e a ignora, então começar com uma é sempre
seguro.

Nada aqui autentica o _remetente_: um token prova que a conexão é
permitida, não quem a abriu. `from`, `fromName`, `fromMode` e cada
campo do registro são afirmações.

Este também é o todo do modelo de confiança. Um programa no qual o
usuário quer dirigindo suas sessões recebe um token de controller,
gerado manualmente e entregue àquele programa específico; é isso que faz
a diferença entre uma mensagem que é entregue e uma que aguarda
revisão. Escrever `kind: "external"` ou um `name` que pareça familiar
não garante nada.

## 4. O frame do usuário

```json
{
  "msgV": 1,
  "msgId": "5f1d0c9e-3b2a-4e8f-9c7d-1a2b3c4d5e6f",
  "type": "user",
  "from": "/run/user/1000/qwen-socks/40011.sock",
  "replyToken": "<meu próprio ipcToken>",
  "fromName": "project-3f",
  "fromMode": "prompting",
  "toSessionId": "8e016be8-…",
  "priority": "next",
  "message": { "role": "user", "content": "build finished, 0 failures" }
}
```

| Campo         | Regra                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `msgV`        | Número. Deve ser ≤ 1; valores maiores são descartados.                                                                                                                                                                        |
| `msgId`       | `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`, e não deve canonicalizar (hífens removidos, minúsculas) para `all`. Use um UUID novo por mensagem: o receptor lembra ids que já decidiu e repete o veredito anterior para um reenvio. |
| `type`        | `"user"`.                                                                                                                                                                                                                     |
| `from`        | Seu `ipcPath`, se tiver um. Para onde os recibos vão. Ausente significa sem recibos.                                                                                                                                          |
| `replyToken`  | Seu `ipcToken`, para que o receptor possa autenticar seus recibos para você.                                                                                                                                                  |
| `fromName`    | Nome de exibição; achatado para uma linha, no máximo 200 caracteres.                                                                                                                                                          |
| `fromMode`    | `"prompting"` (uma pessoa revisa cada ação) ou `"bypass"` (algumas ações são aplicadas sem revisão). Ausente significa "não afirma nada", que é retido para revisão (§6).                                                      |
| `toSessionId` | O `sessionId` que você leu do registro. Um receptor com um id diferente responde `misaddressed`. Sempre o envie.                                                                                                              |
| `priority`    | `"now"` ou `"next"`; qualquer outra coisa é lida como `"next"`. Carregado para um futuro caminho de interrupção; hoje o receptor enfileira ambos para o próximo turno.                                                        |
| `message`     | `role` deve ser `"user"`; `content` uma string não vazia.                                                                                                                                                                     |

Campos desconhecidos são ignorados.

## 5. O frame de status de entrega

O receptor reporta o que aconteceu com uma mensagem usando um frame de
controle por resultado, enviado para o `from` da mensagem e autenticado
com seu `replyToken`:

```json
{
  "msgV": 1,
  "msgId": "<id novo>",
  "type": "control",
  "action": "delivery_status",
  "status": "held",
  "origMsgId": "5f1d0c9e-…",
  "from": "/run/user/1000/qwen-socks/41337.sock",
  "reason": "Your message is held for the recipient user to review …"
}
```

| `status`       | Quando                                                                                                                                                  | O que fazer                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `held`         | Aguardando revisão do usuário. Repetido em uma tentativa e em um release que não pôde ser enfileirado.                                                  | Aguarde; uma decisão ou expiração se segue.                                        |
| `delivered`    | Enfileirado para o modelo.                                                                                                                              | Nada. Não é prova de que foi lido.                                                 |
| `denied`       | Uma pessoa revisou e disse não.                                                                                                                         | Não reenvie.                                                                       |
| `refused`      | A política da sessão rejeita mensagens de peers; ninguém a viu. Sempre apenas o primeiro recibo.                                                        | Pare; alcance aquele usuário de outra forma.                                       |
| `expired`      | Uma mensagem retida esgotou seu tempo de espera, a sessão saiu sem lê-la, ou chegou enquanto a sessão estava encerrando. Pode seguir `held` ou `delivered`. | Reenvie depois se ainda for relevante.                                             |
| `misaddressed` | `toSessionId` não corresponde à sessão naquele endereço.                                                                                                | Releia o registro.                                                                 |
| `dropped`      | A inbox rejeitou antes de qualquer política executar (§6).                                                                                               | Trate como não enviada. Não reenvie em loop; consolide o que for importante em uma mensagem posterior. |

Um recibo `dropped` carrega dois campos adicionais. `dropReason` é
`rate-limited`, `duplicate` ou `queue-full`. `droppedMsgIds` lista até
256 ids adicionais que o mesmo recibo decide: uma rajada é respondida
com um único recibo em vez de um para cada, então um remetente move
cada mensagem que perdeu para um estado terminal a partir de um único
frame. Ambos não fazem sentido em qualquer outro status e são ignorados
lá.

`reason` é texto livre para um humano. A ordem dos recibos não é
garantida entre conexões; aplique-os como transições de estado:

```
pending   → held | delivered | denied | refused | expired | misaddressed | dropped
held      → delivered | denied | expired | misaddressed
delivered → expired | misaddressed
```

Qualquer outra coisa é uma repetição e deve ser ignorada. Um recibo
para um id que você nunca enviou é ruído; ignore-o. Recibos são
best-effort do lado do receptor: um limite de saída cheio ou um `from`
morto os perde silenciosamente, então um remetente deve tolerar nunca
receber resposta.

Sua própria inbox recebe esses frames das sessões para as quais você
enviou mensagens. Se você apenas envia, vincule uma inbox e informe
`from` mesmo assim: sem uma você fica cego para todo resultado acima.

## 6. O que o receptor faz com uma mensagem

Na ordem:

1. **Admissão.** Por remetente: uma rajada de 30, depois uma mensagem a
cada dois segundos. Todos os remetentes juntos: uma rajada de 32,
depois uma por segundo — um remetente se identifica no frame, então
rotacionar esse nome garante uma nova cota do primeiro limite, mas não
do segundo. O mesmo corpo de outra sessão dentro de 30 segundos é um
`duplicate`; um processo iniciado pela sessão e um controller confiável
são isentos dessa verificação, e limitados por taxa como qualquer outro.
Uma mensagem descartada nunca é retida, nunca é entregue e não deixa
registro, então um remetente que aguarda sua rajada passar e tenta
novamente ainda consegue entregar.
2. **Ids decididos.** Um `msgId` que o gate já decidiu repete seu
veredito anterior.
3. **Política.** `agents.crossSessionInbound` definido como `accept`,
`hold` ou `refuse` prevalece. Não definido: um processo iniciado pela
sessão ou um controller confiável é aceito; caso contrário, uma
mensagem é aceita apenas quando `fromMode` nomeia a mesma classe de
revisão do receptor, e retida em todos os outros casos, inclusive
quando `fromMode` está ausente.
4. **Retenção.** Até 50 mensagens aguardam. Uma mensagem que chega a um
buffer cheio é `dropped` com `queue-full` em vez de expulsar uma já
retida. Uma mensagem retida expira após `agents.crossSessionHeldExpiry`
(`1m`, `5m`, `10m`, `never`; padrão `5m`). O usuário libera ou recusa
a partir de `/peers`; uma mudança de modo reavalia a fila.
5. **Fila.** Uma mensagem aceita entra na fila de entrada da sessão,
que comporta no máximo 50 de peers. Uma fila cheia resulta em `dropped`
com `queue-full` também.

Um remetente não precisa descobrir os limites na tentativa e erro: uma
sessão do Qwen Code espelha esses limites por endereço e recusa seu
próprio envio antes de escrevê-lo, orientando seu modelo a fazer
batch.

O modelo vê uma mensagem entregue como:

```
<cross_session_message from="/run/user/1000/qwen-socks/40011.sock" name="project-3f">
build finished, 0 failures
</cross_session_message>
```

seguido de um aviso declarando a autoridade do remetente.
`origin="own-process"` ou `origin="controller" controller="<label>"` é
adicionado pelo receptor a partir do que a conexão apresentou, nunca do
frame; o rótulo de um controller vem da grant que o usuário gerou, não
de `fromName`. Tags que pareçam com o envelope são neutralizadas dentro
de `content`.

## 7. Compatibilidade

- Um leitor ignora campos que não conhece. Adicionar um campo a um
  registro ou a um frame não é uma mudança incompatível.
- `schemaVersion` e `msgV` são incrementados apenas para uma mudança na
  forma de campos existentes. Um leitor descarta um frame ou pula um
  registro com versão acima do que conhece, e nunca deleta tal
  registro.
- Novos valores de `status` podem aparecer; trate um desconhecido como
  "sem transição" e continue aguardando. O mesmo vale para um `kind`
  que você não reconhece: exiba-o, não o corrija.
- Constantes que podem mudar sem aviso: os valores de rajada e taxa, o
  limite de retenção e as opções de expiração, o limite de 1 MiB por
  linha, o prazo de 30 segundos por linha, o limite de 64 conexões.

## 8. Ainda não definido

- **Cessão de nome.** Duas sessões em um diretório podem registrar o
  mesmo `name`; hoje elas são distinguidas apenas por `ref`. Um registro
  que cede a um nome ativo, e um frame de controle que informa aos
  peers que uma sessão mudou de nome, ainda estão por vir.
- **Relatório de nomes iguais.** `qwen sessions ps` e `list_agents` não
  sinalizam registros que ainda colidem.
- **Sessões gerenciadas pelo daemon.** Apenas a UI interativa registra
  hoje, então uma sessão que `qwen serve` controla não está no
  registro, não pode ser endereçada e não pode enviar. Os kinds `serve`
  e `headless` estão reservados para isso.