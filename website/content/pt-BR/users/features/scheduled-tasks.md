# Executar Prompts em um Agendamento

> Use `/loop` e as ferramentas de agendamento cron para executar prompts repetidamente, verificar status ou definir lembretes únicos dentro de uma sessão do Qwen Code.

Tarefas agendadas permitem que o Qwen Code reexecute um prompt automaticamente em um intervalo. Use-as para verificar uma implantação, monitorar um PR, acompanhar uma build de longa duração ou lembrar-se de fazer algo mais tarde na sessão.

As tarefas são limitadas à sessão: elas vivem no processo atual do Qwen Code e desaparecem quando você sai. Nada é escrito em disco.

> **Dica:** As tarefas agendadas estão habilitadas por padrão. Para desabilitá-las, defina `experimental.cron: false` nas suas [configurações](../configuration/settings.md), ou defina `QWEN_CODE_DISABLE_CRON=1` no seu ambiente.

## Agendar um prompt recorrente com /loop

A `/loop` [skill incluída](skills.md) é a maneira mais rápida de agendar um prompt recorrente. Passe um intervalo opcional e um prompt, e o Qwen Code configura um job cron que dispara em segundo plano enquanto a sessão permanece aberta.

```text
/loop 5m check if the deployment finished and tell me what happened
```

O Qwen Code analisa o intervalo, converte para uma expressão cron, agenda o job e confirma a cadência e o ID do job. Em seguida, executa o prompt imediatamente uma vez — você não precisa esperar pelo primeiro disparo do cron.

### Sintaxe de intervalo

Os intervalos são opcionais. Você pode iniciar com eles, finalizar com eles ou omiti-los completamente.

| Forma                    | Exemplo                               | Intervalo analisado          |
| :----------------------- | :------------------------------------ | :--------------------------- |
| Token inicial            | `/loop 30m check the build`           | a cada 30 minutos            |
| Cláusula `every` final   | `/loop check the build every 2 hours` | a cada 2 horas               |
| Sem intervalo            | `/loop check the build`               | padrão: a cada 10 minutos    |

As unidades suportadas são `s` para segundos, `m` para minutos, `h` para horas e `d` para dias. Segundos são arredondados para o minuto mais próximo, pois o cron tem granularidade de um minuto. Intervalos que não dividem uniformemente em sua unidade, como `7m` ou `90m`, são arredondados para o intervalo limpo mais próximo e o Qwen Code informa o que foi escolhido.

### Loop sobre outro comando

O prompt agendado pode ser ele mesmo um comando ou invocação de skill. Isso é útil para reexecutar um workflow que você já empacotou.

```text
/loop 20m /review-pr 1234
```

Cada vez que o job dispara, o Qwen Code executa `/review-pr 1234` como se você tivesse digitado.

### Gerenciar loops

`/loop` também suporta dois subcomandos para gerenciar jobs existentes:

```text
/loop list
```

Lista todos os jobs agendados com seus IDs e expressões cron.

```text
/loop clear
```

Cancela todos os jobs agendados de uma vez.

## Definir um lembrete único

Para lembretes únicos, descreva o que você quer em linguagem natural, em vez de usar `/loop`. O Qwen Code agenda uma tarefa de disparo único que se exclui após executar.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

O Qwen Code fixa o horário de disparo em um minuto e hora específicos usando uma expressão cron e confirma quando vai disparar.

## Gerenciar tarefas agendadas

Peça ao Qwen Code em linguagem natural para listar ou cancelar tarefas, ou faça referência direta às ferramentas subjacentes.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

Por baixo dos panos, o Qwen Code usa estas ferramentas:

| Ferramenta   | Finalidade                                                                                                        |
| :----------- | :---------------------------------------------------------------------------------------------------------------- |
| `CronCreate` | Agenda uma nova tarefa. Aceita uma expressão cron de 5 campos, o prompt a ser executado e se ela recorre ou dispara uma vez. |
| `CronList`   | Lista todas as tarefas agendadas com seus IDs, cronogramas e prompts.                                             |
| `CronDelete` | Cancela uma tarefa pelo ID.                                                                                       |

Cada tarefa agendada tem um ID de 8 caracteres que você pode passar para `CronDelete`. Uma sessão pode conter até 50 tarefas agendadas de uma vez.

## Como as tarefas agendadas são executadas

O agendador verifica a cada segundo as tarefas pendentes e as coloca na fila quando a sessão está ociosa. Um prompt agendado é disparado entre suas interações, não enquanto o Qwen Code está no meio de uma resposta. Se o Qwen Code estiver ocupado quando uma tarefa vencer, o prompt espera até que a rodada atual termine.

Todos os horários são interpretados no seu fuso horário local. Uma expressão cron como `0 9 * * *` significa 9h onde quer que você esteja executando o Qwen Code, não UTC.

### Jitter

Para evitar que toda sessão atinja a API no mesmo horário real, o agendador adiciona um pequeno deslocamento determinístico aos horários de disparo:

- **Tarefas recorrentes** disparam com até 10% de atraso em relação ao período, limitado a 15 minutos. Um job horário pode disparar de `:00` a `:06`.
- **Tarefas únicas** agendadas para a hora cheia ou meia hora (minuto `:00` ou `:30`) disparam até 90 segundos antes.
O deslocamento é derivado do ID da tarefa, então a mesma tarefa sempre recebe o mesmo deslocamento. Se a precisão do horário for importante, escolha um minuto que não seja `:00` ou `:30`, por exemplo `3 9 * * *` em vez de `0 9 * * *`, e o jitter de execução única não será aplicado.

### Expiração de três dias

Tarefas recorrentes expiram automaticamente 3 dias após a criação. A tarefa é executada uma última vez e depois se exclui. Isso limita o tempo que um loop esquecido pode rodar. Se você precisar que uma tarefa recorrente dure mais, cancele e recrie-a antes que expire.

Tarefas de execução única não expiram por tempo — elas simplesmente se excluem após serem executadas uma vez.

## Referência de expressão cron

`CronCreate` aceita expressões cron padrão de 5 campos: `minuto hora dia-do-mês mês dia-da-semana`. Todos os campos suportam curingas (`*`), valores únicos (`5`), passos (`*/15`), intervalos (`1-5`) e listas separadas por vírgula (`1,15,30`).

| Exemplo        | Significado                      |
| :------------- | :--------------------------- |
| `*/5 * * * *`  | A cada 5 minutos              |
| `0 * * * *`    | A cada hora em ponto          |
| `7 * * * *`    | A cada hora aos 7 minutos     |
| `0 9 * * *`    | Todos os dias às 9h (local)   |
| `0 9 * * 1-5`  | Dias úteis às 9h (local)      |
| `30 14 15 3 *` | 15 de março às 14h30 (local)  |

Dia-da-semana usa `0` ou `7` para domingo até `6` para sábado. Quando tanto dia-do-mês quanto dia-da-semana são restritos (nenhum é `*`), uma data corresponde se qualquer um dos campos corresponder — isso segue a semântica padrão vixie-cron.

Sintaxe estendida como `L`, `W`, `?` e aliases de nome como `MON` ou `JAN` não são suportados.

## Limitações

O agendamento no escopo da sessão tem restrições inerentes:

- As tarefas são executadas apenas enquanto o Qwen Code estiver em execução e ocioso. Fechar o terminal ou deixar a sessão encerrar cancela tudo.
- Não há recuperação de execuções perdidas. Se o horário agendado de uma tarefa passar enquanto o Qwen Code estiver ocupado com uma solicitação de longa duração, ela será executada uma vez quando o Qwen Code ficar ocioso, não uma vez por intervalo perdido.
- Não há persistência entre reinicializações. Reiniciar o Qwen Code limpa todas as tarefas no escopo da sessão.
