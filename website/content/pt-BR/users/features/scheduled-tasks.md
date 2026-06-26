# Executar Prompts em um Agendamento

> Use `/loop` e as ferramentas de agendamento cron para executar prompts repetidamente, consultar status ou definir lembretes únicos em uma sessão do Qwen Code.

Tarefas agendadas permitem que o Qwen Code reexecute um prompt automaticamente em um intervalo. Use-as para consultar um deployment, monitorar um PR, verificar uma compilação longa ou lembrar-se de algo mais tarde na sessão.

As tarefas têm escopo de sessão: elas vivem no processo atual do Qwen Code e desaparecem quando você sai. Nada é gravado em disco.

> **Dica:** As tarefas agendadas são habilitadas por padrão. Para desativá-las, defina `experimental.cron: false` nas suas [configurações](../configuration/settings.md) ou defina `QWEN_CODE_DISABLE_CRON=1` no seu ambiente.

## Agendar um prompt recorrente com /loop

O `/loop` [skill integrado](skills.md) é a maneira mais rápida de agendar um prompt recorrente. Informe um intervalo opcional e um prompt, e o Qwen Code configura um cron job que executa em segundo plano enquanto a sessão estiver aberta.

```text
/loop 5m check if the deployment finished and tell me what happened
```

O Qwen Code analisa o intervalo, converte em uma expressão cron, agenda o job e confirma a cadência e o ID do job. Em seguida, ele executa o prompt imediatamente — você não precisa esperar pela primeira execução do cron.

### Sintaxe do intervalo

Os intervalos são opcionais. Você pode colocá-los no início, no final ou omiti-los completamente.

| Forma                         | Exemplo                                 | Intervalo analisado      |
| :---------------------------- | :-------------------------------------- | :----------------------- |
| Token no início               | `/loop 30m check the build`             | a cada 30 minutos        |
| Cláusula `every` no final     | `/loop check the build every 2 hours`   | a cada 2 horas           |
| Sem intervalo                 | `/loop check the build`                 | padrão a cada 10 minutos |

As unidades suportadas são `s` para segundos, `m` para minutos, `h` para horas e `d` para dias. Segundos são arredondados para cima para o minuto mais próximo, já que o cron tem granularidade de um minuto. Intervalos que não dividem uniformemente sua unidade, como `7m` ou `90m`, são arredondados para o intervalo limpo mais próximo e o Qwen Code informa o que foi escolhido.

### Repetir sobre outro comando

O prompt agendado pode ser ele mesmo um comando ou invocação de skill. Isso é útil para reexecutar um fluxo de trabalho que você já empacotou.

```text
/loop 20m /review-pr 1234
```

Cada vez que o job é acionado, o Qwen Code executa `/review-pr 1234` como se você o tivesse digitado.

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

Para lembretes únicos, descreva o que você deseja em linguagem natural em vez de usar `/loop`. O Qwen Code agenda uma tarefa de execução única que se exclui após a execução.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

O Qwen Code fixa o horário de execução em um minuto e hora específicos usando uma expressão cron e confirma quando será acionado.

## Gerenciar tarefas agendadas

Peça ao Qwen Code em linguagem natural para listar ou cancelar tarefas, ou faça referência diretamente às ferramentas subjacentes.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

Por baixo dos panos, o Qwen Code utiliza estas ferramentas:

| Ferramenta    | Finalidade                                                                                                  |
| :------------ | :---------------------------------------------------------------------------------------------------------- |
| `CronCreate`  | Agendar uma nova tarefa. Aceita uma expressão cron de 5 campos, o prompt a ser executado e se ele se repete ou é executado uma vez. |
| `CronList`    | Listar todas as tarefas agendadas com seus IDs, agendamentos e prompts.                                     |
| `CronDelete`  | Cancelar uma tarefa por ID.                                                                                 |

Cada tarefa agendada tem um ID de 8 caracteres que você pode passar para `CronDelete`. Uma sessão pode conter até 50 tarefas agendadas de uma vez.

## Como as tarefas agendadas são executadas

O agendador verifica a cada segundo as tarefas pendentes e as enfileira quando a sessão está ociosa. Um prompt agendado é acionado entre suas interações, não enquanto o Qwen Code está respondendo. Se o Qwen Code estiver ocupado quando uma tarefa vencer, o prompt espera até que a interação atual termine.

Todos os horários são interpretados no seu fuso horário local. Uma expressão cron como `0 9 * * *` significa 9h onde quer que você esteja executando o Qwen Code, não UTC.

### Jitter

Para evitar que todas as sessões atinjam a API no mesmo instante de relógio, o agendador adiciona um pequeno deslocamento determinístico aos horários de execução:

- **Tarefas recorrentes** disparam com até 10% de atraso do período, limitado a 15 minutos. Uma tarefa horária pode disparar de `:00` a `:06`.
- **Tarefas únicas** agendadas para a hora cheia ou meia hora (minuto `:00` ou `:30`) disparam com até 90 segundos de antecedência.

O deslocamento é derivado do ID da tarefa, então a mesma tarefa sempre recebe o mesmo deslocamento. Se o tempo exato for importante, escolha um minuto que não seja `:00` ou `:30`, por exemplo `3 9 * * *` em vez de `0 9 * * *`, e o jitter de tarefa única não será aplicado.

### Expiração de três dias

Tarefas recorrentes expiram automaticamente 3 dias após a criação. A tarefa é executada uma última vez e depois se exclui. Isso limita quanto tempo um loop esquecido pode rodar. Se você precisar que uma tarefa recorrente dure mais, cancele e recrie-a antes que expire.

Tarefas únicas não expiram em um temporizador — elas simplesmente se excluem após serem executadas uma vez.

## Referência de expressão cron

`CronCreate` aceita expressões cron padrão de 5 campos: `minuto hora dia-do-mês mês dia-da-semana`. Todos os campos suportam curingas (`*`), valores únicos (`5`), passos (`*/15`), intervalos (`1-5`) e listas separadas por vírgulas (`1,15,30`).

| Exemplo        | Significado                       |
| :------------- | :-------------------------------- |
| `*/5 * * * *`  | A cada 5 minutos                  |
| `0 * * * *`    | A cada hora em ponto              |
| `7 * * * *`    | A cada hora aos 7 minutos         |
| `0 9 * * *`    | Todos os dias às 9h locais        |
| `0 9 * * 1-5`  | Dias úteis às 9h locais           |
| `30 14 15 3 *` | 15 de março às 14h30 locais       |

Dia-da-semana usa `0` ou `7` para domingo até `6` para sábado. Quando tanto dia-do-mês quanto dia-da-semana são restritos (nenhum é `*`), uma data corresponde se qualquer um dos campos corresponder — isso segue a semântica padrão do vixie-cron.

Sintaxe estendida como `L`, `W`, `?` e aliases de nome como `MON` ou `JAN` não são suportados.

## Limitações

O agendamento com escopo de sessão tem restrições inerentes:

- As tarefas só são executadas enquanto o Qwen Code está em execução e ocioso. Fechar o terminal ou permitir que a sessão termine cancela tudo.
- Sem recuperação para execuções perdidas. Se o horário agendado de uma tarefa passar enquanto o Qwen Code está ocupado em uma solicitação de longa duração, ela é executada uma vez quando o Qwen Code fica ocioso, não uma vez por intervalo perdido.
- Sem persistência entre reinicializações. Reiniciar o Qwen Code limpa todas as tarefas com escopo de sessão.