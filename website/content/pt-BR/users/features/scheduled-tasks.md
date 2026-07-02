# Executar Prompts Agendados

> Use `/loop` e as ferramentas de agendamento cron para executar prompts repetidamente, monitorar o status ou definir lembretes únicos dentro de uma sessão do Qwen Code.

As tarefas agendadas permitem que o Qwen Code reexecute um prompt automaticamente em um intervalo. Use-as para monitorar um deploy, acompanhar um PR, verificar o andamento de um build demorado ou lembrar-se de fazer algo mais tarde na sessão.

As tarefas têm escopo de sessão: elas existem no processo atual do Qwen Code e desaparecem quando você sai. Nada é gravado no disco.

> **Dica:** As tarefas agendadas são habilitadas por padrão. Para desativá-las, defina `experimental.cron: false` nas suas [configurações](../configuration/settings.md) ou defina `QWEN_CODE_DISABLE_CRON=1` no seu ambiente.

## Agendar um prompt recorrente com /loop

A [skill integrada](skills.md) `/loop` é a maneira mais rápida de agendar um prompt recorrente. Passe um intervalo opcional e um prompt, e o Qwen Code configurará um cron job que é executado em segundo plano enquanto a sessão permanece aberta.

```text
/loop 5m check if the deployment finished and tell me what happened
```

O Qwen Code analisa o intervalo, converte-o em uma expressão cron, agenda o job e confirma a cadência e o ID do job. Em seguida, ele executa o prompt imediatamente uma vez — você não precisa esperar a primeira execução do cron.

### Sintaxe de intervalo

Os intervalos são opcionais. Você pode colocá-los no início, no final ou omiti-los completamente.

| Forma | Exemplo | Intervalo analisado |
| :--- | :--- | :--- |
| Token inicial | `/loop 30m check the build` | a cada 30 minutos |
| Cláusula `every` final | `/loop check the build every 2 hours` | a cada 2 horas |
| Sem intervalo | `/loop check the build` | padrão de 10 em 10 minutos |

As unidades suportadas são `s` para segundos, `m` para minutos, `h` para horas e `d` para dias. Os segundos são arredondados para o minuto mais próximo, pois o cron tem granularidade de um minuto. Intervalos que não se dividem uniformemente em sua unidade, como `7m` ou `90m`, são arredondados para o intervalo limpo mais próximo e o Qwen Code informa qual foi escolhido.

### Fazer loop em outro comando

O prompt agendado pode ser, ele mesmo, um comando ou uma invocação de skill. Isso é útil para reexecutar um workflow que você já empacotou.

```text
/loop 20m /review-pr 1234
```

Cada vez que o job é executado, o Qwen Code executa `/review-pr 1234` como se você o tivesse digitado.

### Modo autônomo

Executar `/loop` **sem prompt** inicia um loop autônomo em vez de repetir um prompt fixo. O Qwen Code atua como um gestor do trabalho já estabelecido na conversa — ele mantém seu trabalho em andamento enquanto você está ausente:

```text
/loop
```

Um `/loop` simples (sem prompt, sem intervalo) executa um loop autônomo no próprio ritmo; `/loop <intervalo>` sem prompt executa o mesmo loop autônomo em uma cadência fixa (por exemplo, `/loop 10m`). Em cada execução, ele avança o que a conversa já configurou — finalizando coisas que você começou, mantendo um PR em andamento (respondendo a threads de revisão, corrigindo CI falhando, resolvendo conflitos) e honrando compromissos de acompanhamento. Ele só atua no trabalho que a transcrição já estabeleceu: nunca inventa um novo trabalho ou faz alterações irreversíveis (push, delete, send) sem autorização clara, e para assim que tudo estiver quieto.

### Gerenciar loops

O `/loop` também oferece suporte a dois subcomandos para gerenciar jobs existentes:

```text
/loop list
```

Lista todos os jobs agendados com seus IDs e expressões cron.

```text
/loop clear
```

Cancela todos os jobs agendados de uma vez.

## Definir um lembrete único

Para lembretes de execução única, descreva o que você deseja em linguagem natural em vez de usar `/loop`. O Qwen Code agenda uma tarefa de execução única que se exclui após ser executada.

```text
remind me at 3pm to push the release branch
```

```text
in 45 minutes, check whether the integration tests passed
```

O Qwen Code fixa o horário de execução em um minuto e hora específicos usando uma expressão cron e confirma quando ela será executada.

## Gerenciar tarefas agendadas

Peça ao Qwen Code em linguagem natural para listar ou cancelar tarefas, ou referencie as ferramentas subjacentes diretamente.

```text
what scheduled tasks do I have?
```

```text
cancel the deploy check job
```

Nos bastidores, o Qwen Code usa estas ferramentas:

| Ferramenta | Propósito |
| :--- | :--- |
| `CronCreate` | Agenda uma nova tarefa. Aceita uma expressão cron de 5 campos, o prompt a ser executado e se ele é recorrente ou de execução única. |
| `CronList` | Lista todas as tarefas agendadas com seus IDs, programações e prompts. |
| `CronDelete` | Cancela uma tarefa pelo ID. |

Cada tarefa agendada tem um ID de 8 caracteres que você pode passar para `CronDelete`. Uma sessão pode conter até 50 tarefas agendadas de uma vez.

## Como as tarefas agendadas são executadas

O agendador verifica a cada segundo se há tarefas vencidas e as enfileira quando a sessão está ociosa. Um prompt agendado é executado entre as suas interações, não enquanto o Qwen Code está no meio de uma resposta. Se o Qwen Code estiver ocupado quando uma tarefa vencer, o prompt aguarda até que a interação atual termine.

Todos os horários são interpretados no seu fuso horário local. Uma expressão cron como `0 9 * * *` significa 9h da manhã onde quer que você esteja executando o Qwen Code, não UTC.

### Jitter

Para evitar que todas as sessões atinjam a API no mesmo momento exato do relógio, o agendador adiciona um pequeno deslocamento determinístico aos horários de execução:

- **Tarefas recorrentes** são executadas com um atraso de até 10% do seu período, limitado a 15 minutos. Um job horário pode ser executado em qualquer momento entre `:00` e `:06`.
- **Tarefas de execução única** agendadas para o início ou a metade da hora (minuto `:00` ou `:30`) são executadas com até 90 segundos de antecedência.

O deslocamento é derivado do ID da tarefa, portanto, a mesma tarefa sempre obtém o mesmo deslocamento. Se o tempo exato for importante, escolha um minuto que não seja `:00` ou `:30`, por exemplo, `3 9 * * *` em vez de `0 9 * * *`, e o jitter de execução única não será aplicado.

### Expiração de três dias

As tarefas recorrentes expiram automaticamente 3 dias após a criação. A tarefa é executada uma última vez e depois se exclui. Isso limita por quanto tempo um loop esquecido pode ser executado. Se você precisar que uma tarefa recorrente dure mais tempo, cancele-a e recrie-a antes que expire.

As tarefas de execução única não expiram por um temporizador — elas simplesmente se excluem após serem executadas uma vez.

## Referência de expressões cron

O `CronCreate` aceita expressões cron padrão de 5 campos: `minuto hora dia-do-mês mês dia-da-semana`. Todos os campos suportam curingas (`*`), valores únicos (`5`), passos (`*/15`), intervalos (`1-5`) e listas separadas por vírgula (`1,15,30`).

| Exemplo | Significado |
| :--- | :--- |
| `*/5 * * * *` | A cada 5 minutos |
| `0 * * * *` | A cada hora, na hora exata |
| `7 * * * *` | A cada hora, aos 7 minutos |
| `0 9 * * *` | Todos os dias às 9h no horário local |
| `0 9 * * 1-5` | Dias da semana às 9h no horário local |
| `30 14 15 3 *` | 15 de março às 14h30 no horário local |

O dia da semana usa `0` ou `7` para domingo até `6` para sábado. Quando tanto o dia do mês quanto o dia da semana são restritos (nenhum deles é `*`), uma data corresponde se qualquer um dos campos corresponder — isso segue a semântica padrão do vixie-cron.

Sintaxe estendida como `L`, `W`, `?` e aliases de nome como `MON` ou `JAN` não são suportados.

## Limitações

O agendamento com escopo de sessão tem restrições inerentes:

- As tarefas só são executadas enquanto o Qwen Code estiver em execução e ocioso. Fechar o terminal ou deixar a sessão encerrar cancela tudo.
- Não há recuperação para execuções perdidas. Se o horário agendado de uma tarefa passar enquanto o Qwen Code estiver ocupado com uma solicitação de longa duração, ela será executada uma vez quando o Qwen Code ficar ocioso, e não uma vez por intervalo perdido.
- Não há persistência entre reinicializações. Reiniciar o Qwen Code limpa todas as tarefas com escopo de sessão.