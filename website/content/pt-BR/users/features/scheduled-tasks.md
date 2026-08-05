# Executar Prompts Agendados

> Use `/loop` e as ferramentas de agendamento cron para executar prompts repetidamente, verificar o status ou definir lembretes únicos dentro de uma sessão do Qwen Code.

As tarefas agendadas permitem que o Qwen Code reexecute um prompt automaticamente em um intervalo. Use-as para verificar o status de um deploy, monitorar um PR, verificar o andamento de um build demorado ou lembrar-se de fazer algo mais tarde na sessão.

As tarefas têm escopo de sessão: elas existem no processo atual do Qwen Code e desaparecem quando você sai. Nada é gravado no disco.

> **Dica:** As tarefas agendadas são habilitadas por padrão. Para desabilitá-las, defina `experimental.cron: false` nas suas [configurações](../configuration/settings.md) ou defina `QWEN_CODE_DISABLE_CRON=1` no seu ambiente.

## Agendar um prompt recorrente com /loop

A [skill integrada](./skills.md) `/loop` é a maneira mais rápida de agendar um prompt recorrente. Passe um intervalo opcional e um prompt, e o Qwen Code configurará um cron job que é executado em segundo plano enquanto a sessão permanecer aberta.

```text
/loop 5m verifique se o deploy terminou e me diga o que aconteceu
```

O Qwen Code analisa o intervalo, converte-o em uma expressão cron, agenda o job e confirma a cadência e o ID do job. Em seguida, ele executa o prompt imediatamente uma vez — você não precisa esperar a primeira execução do cron.

### Sintaxe de intervalo

Os intervalos são opcionais. Você pode colocá-los no início, no final ou omiti-los completamente.

| Forma                     | Exemplo                                     | Intervalo analisado          |
| :------------------------ | :------------------------------------------ | :--------------------------- |
| Token no início           | `/loop 30m verificar o build`               | a cada 30 minutos            |
| Cláusula `every` no final | `/loop verificar o build a cada 2 horas`    | a cada 2 horas               |
| Sem intervalo             | `/loop verificar o build`                   | padrão de 10 em 10 minutos   |

As unidades suportadas são `s` para segundos, `m` para minutos, `h` para horas e `d` para dias. Os segundos são arredondados para o minuto mais próximo, pois o cron tem granularidade de um minuto. Intervalos que não se dividem uniformemente em sua unidade, como `7m` ou `90m`, são arredondados para o intervalo limpo mais próximo e o Qwen Code informa qual foi escolhido.

### Executar loop de outro comando

O prompt agendado pode ser, ele mesmo, um comando ou uma invocação de skill. Isso é útil para reexecutar um workflow que você já empacotou.

```text
/loop 20m /review-pr 1234
```

Cada vez que o job é executado, o Qwen Code executa `/review-pr 1234` como se você o tivesse digitado.

### Modo autônomo

Executar `/loop` **sem prompt** inicia um loop autônomo em vez de repetir um prompt fixo. O Qwen Code atua como um curador do trabalho já estabelecido na conversa — ele mantém seu trabalho em andamento enquanto você está ausente:

```text
/loop
```

Um `/loop` simples (sem prompt, sem intervalo) executa um loop autônomo no próprio ritmo; `/loop <intervalo>` sem prompt executa o mesmo loop autônomo em uma cadência fixa (por exemplo, `/loop 10m`). A cada execução, ele avança o que a conversa já configurou — finalizando coisas que você começou, mantendo um PR em andamento (respondendo a threads de revisão, corrigindo CI com falha, resolvendo conflitos) e honrando compromissos de acompanhamento. Ele age apenas no trabalho que o histórico já estabeleceu: nunca inventa novo trabalho ou faz alterações irreversíveis (push, delete, send) sem autorização clara, e para assim que tudo estiver estável.

### Gerenciar loops

`/loop` também oferece suporte a dois subcomandos para gerenciar jobs existentes:

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
lembre-me às 15h de fazer push da branch de release
```

```text
em 45 minutos, verifique se os testes de integração passaram
```

O Qwen Code fixa o horário de execução em um minuto e hora específicos usando uma expressão cron e confirma quando ela será executada.

## Gerenciar tarefas agendadas

Peça ao Qwen Code em linguagem natural para listar ou cancelar tarefas, ou referencie as ferramentas subjacentes diretamente.

```text
quais tarefas agendadas eu tenho?
```

```text
cancelar o job de verificação de deploy
```

Por baixo dos panos, o Qwen Code usa estas ferramentas:

| Ferramenta   | Propósito                                                                                                       |
| :----------- | :-------------------------------------------------------------------------------------------------------------- |
| `CronCreate` | Agenda uma nova tarefa. Aceita uma expressão cron de 5 campos, o prompt a ser executado e se ela é recorrente ou de execução única. |
| `CronList`   | Lista todas as tarefas agendadas com seus IDs, programações e prompts.                                          |
| `CronDelete` | Cancela uma tarefa pelo ID.                                                                                     |

Cada tarefa agendada tem um ID de 8 caracteres que você pode passar para `CronDelete`. Uma sessão pode conter até 50 tarefas agendadas de uma vez.

## Como as tarefas agendadas são executadas

O agendador verifica a cada segundo se há tarefas vencidas e as enfileira quando a sessão está ociosa. Um prompt agendado é executado entre as suas interações, não enquanto o Qwen Code está no meio de uma resposta. Se o Qwen Code estiver ocupado quando uma tarefa vencer, o prompt aguarda até que o turno atual termine.

Todos os horários são interpretados no seu fuso horário local. Uma expressão cron como `0 9 * * *` significa 9h da manhã onde quer que você esteja executando o Qwen Code, não UTC.

### Jitter

Para evitar que todas as sessões acessem a API no mesmo momento exato, o agendador adiciona um pequeno deslocamento determinístico aos horários de execução:

- **Tarefas recorrentes** são executadas com um atraso de até 10% do seu período, limitado a 15 minutos. Um job horário pode ser executado em qualquer momento entre `:00` e `:06`.
- **Tarefas de execução única** agendadas para o início ou a metade da hora (minuto `:00` ou `:30`) são executadas com até 90 segundos de antecedência.

O deslocamento é derivado do ID da tarefa, então a mesma tarefa sempre obtém o mesmo deslocamento. Se o tempo exato for importante, escolha um minuto que não seja `:00` ou `:30`, por exemplo, `3 9 * * *` em vez de `0 9 * * *`, e o jitter de execução única não será aplicado.

### Expiração de tarefas recorrentes

As tarefas recorrentes expiram automaticamente 7 dias após a criação, por padrão. A tarefa é executada uma última vez e depois se exclui. Isso limita por quanto tempo um loop esquecido pode ser executado.

Para alterar o limite, defina `experimental.cronRecurringMaxAgeDays` nas suas [configurações](../configuration/settings.md) ou defina a variável de ambiente `QWEN_CODE_CRON_MAX_AGE_DAYS` (a variável de ambiente tem precedência — conveniente para deploys em nuvem ou contêineres, onde editar `settings.json` é impraticável). Um valor de `0` desabilita a expiração completamente, então as tarefas são executadas até que você as exclua — útil para deploys de daemon de longa duração que hospedam relatórios diários, resumos ou monitoramento contínuo. O limite configurado também se aplica a tarefas duráveis restauradas do disco após uma reinicialização.

As tarefas de execução única não expiram por tempo — elas simplesmente se excluem após serem executadas uma vez.

## Referência de expressões cron

`CronCreate` aceita expressões cron padrão de 5 campos: `minuto hora dia-do-mês mês dia-da-semana`. Todos os campos suportam wildcards (`*`), valores únicos (`5`), passos (`*/15`), intervalos (`1-5`) e listas separadas por vírgula (`1,15,30`).

| Exemplo        | Significado                  |
| :------------- | :--------------------------- |
| `*/5 * * * *`  | A cada 5 minutos             |
| `0 * * * *`    | A cada hora, na hora exata   |
| `7 * * * *`    | A cada hora, aos 7 minutos   |
| `0 9 * * *`    | Todos os dias às 9h locais   |
| `0 9 * * 1-5`  | Dias úteis às 9h locais      |
| `30 14 15 3 *` | 15 de março às 14h30 locais  |

O dia da semana usa `0` ou `7` para domingo até `6` para sábado. Quando tanto o dia do mês quanto o dia da semana são restritos (nenhum deles é `*`), uma data corresponde se qualquer um dos campos corresponder — isso segue a semântica padrão do vixie-cron.

Sintaxe estendida como `L`, `W`, `?` e aliases de nomes como `MON` ou `JAN` não são suportados.

## Limitações

O agendamento com escopo de sessão tem restrições inerentes:

- As tarefas só são executadas enquanto o Qwen Code estiver em execução e ocioso. Fechar o terminal ou deixar a sessão encerrar cancela tudo.
- Não há recuperação para execuções perdidas. Se o horário agendado de uma tarefa passar enquanto o Qwen Code estiver ocupado com uma solicitação de longa duração, ela será executada uma vez quando o Qwen Code ficar ocioso, e não uma vez por intervalo perdido.
- Não há persistência entre reinicializações. Reiniciar o Qwen Code limpa todas as tarefas com escopo de sessão.