# Agent Board

O Agent Board permite que agentes iniciados independentemente compartilhem trabalho por meio de arquivos na mesma máquina. Ele não inicia, não ingressa, não monitora e não envia entrada para processos de agentes.

É uma superfície de interoperabilidade de baixo nível, não o escalonador do Qwen Agent Team nem o transporte de mensagens entre sessões. Um dono de tarefa é apenas um rótulo registrado; ele não inicia ou desperta um processo do Qwen Code, Codex ou outro agente.

> Experimental. O formato em disco pode mudar entre versões.

## Usar um board

Cada comando nomeia o board explicitamente. Cada comando que altera o board também declara o ator com `--as`.

```bash
qwen board task "check the API response" --board orders --as api
qwen board show --board orders
```

O primeiro comando imprime um ID de tarefa. Outro agente pode reivindicá-la e concluí-la:

```bash
qwen board claim <task-id> --board orders --as web
qwen board done <task-id> --board orders --as web --note "status is numeric"
```

`--as` é um rótulo registrado junto com a ação, não autenticação. Não há lista de membros, comando de ingresso, heartbeat ou nome de participante reservado.

Os nomes dos boards são comparados sem distinção entre maiúsculas e minúsculas, então `Orders` e `orders` referem-se ao mesmo board tanto em um sistema de arquivos que diferencia maiúsculas (APFS, NTFS) quanto em um que não diferencia (ext4).

## Fazer uma pergunta

```bash
qwen board ask web "does the client parse status as text?" \
  --board orders --as api --wait
```

O receptor usa o mesmo rótulo ao responder ou recusar:

```bash
qwen board answer <ask-id> "yes" --board orders --as web
qwen board decline <ask-id> "not my area" --board orders --as web
```

Com `--wait`, o código de saída `0` significa respondido, `2` recusado, `3` o TTL da pergunta expirou e `4` a espera local terminou enquanto a pergunta ainda estava aberta. `--timeout` define a espera local em segundos; `--ttl` define o tempo de vida da pergunta em segundos.

A expiração é calculada na leitura, nunca é gravada de volta. Uma pergunta cujo TTL passou mantém `state: "open"` com `settledAt: null` no disco, e o Qwen Code a reporta como `timeout`. Um leitor fora do Qwen Code precisa aplicar a mesma regra — `now >= expiresAt` significa tempo esgotado —, caso contrário tratará uma pergunta expirada como ainda aguardando resposta.

## Saída legível por máquina

Adicione `--json` para receber JSON sem formatação ANSI:

```bash
qwen board show --board orders --as web --json
```

Passar `--as` para `show` filtra as tarefas para esse dono e as perguntas para ou desse ator.

## Limpeza

Registros resolvidos permanecem até serem explicitamente removidos:

```bash
qwen board prune --board orders --as human --older-than 7
```

O corte é em dias. A remoção reconfere cada registro enquanto mantém seu lock, portanto um item alterado após a varredura não é excluído com base em informação obsoleta.

## Limites

- Os boards ficam em `~/.qwen/boards/` e são escopados ao usuário do SO atual.
- Nada é enviado para um agente. Cada participante escolhe quando ler.
- O texto do board é dado não confiável e nunca é executado automaticamente.
- Múltiplos agentes escrevendo no mesmo checkout não são suportados.
- Comandos slash, polling de footer, orquestração fleet/tmux e boards remotos não fazem parte desta primeira versão.
