# Ferramenta Monitor (`monitor`)

Este documento descreve a ferramenta `monitor` para o Qwen Code.

## Descrição

Use `monitor` para iniciar um comando shell de longa duração que transmite linhas stdout e stderr de volta para o agente como notificações de tarefas em segundo plano. É destinado a comandos do tipo watch onde uma nova saída é importante ao longo do tempo, como acompanhar logs, observar a saída de build, verificar um endpoint de saúde ou observar alterações em arquivos.

O monitor é executado em segundo plano, para que o agente possa continuar trabalhando enquanto os eventos chegam. Cada linha de saída não vazia se torna um evento de notificação, sujeito a limite.

### Argumentos

`monitor` aceita os seguintes argumentos:

- `command` (string, obrigatório): O comando shell a ser executado e monitorado.
- `description` (string, opcional): Uma breve descrição do que o monitor está observando. O texto de exibição é truncado para 80 caracteres.
- `max_events` (number, opcional): Pare após este número de eventos de notificação. Deve ser um número inteiro positivo. O padrão é `1000`; o máximo é `10000` (valores fora desse intervalo são rejeitados, não ajustados silenciosamente).
- `idle_timeout_ms` (number, opcional): Pare se o comando não produzir saída por esse número de milissegundos. Deve ser um número inteiro positivo. O padrão é `300000` (5 minutos); o máximo é `600000` (10 minutos), e valores fora desse intervalo são rejeitados.
- `directory` (string, opcional): Um caminho absoluto para executar o comando. Deve resolver (após canonicalização de links simbólicos) dentro de um dos diretórios de espaço de trabalho registrados e não deve estar dentro do diretório user-skills. Se omitido, o Qwen Code usa a raiz do projeto.

## Como usar `monitor` com o Qwen Code

O modelo escolhe a ferramenta `monitor` quando precisa observar um processo ao longo do tempo em vez de coletar um único resultado de comando. Uma invocação bem-sucedida retorna um ID do monitor, o comando, o limite de eventos e o tempo limite de inatividade.

Uso:

```
monitor(command="tail -f logs/app.log", description="app log stream")
```

A saída do monitor fica visível na conversa como notificações de tarefas. Você também pode inspecionar monitores ativos e concluídos com `/tasks` ou o diálogo interativo de Tarefas em Segundo Plano.

Para parar um monitor em execução, use a ferramenta `task_stop` com o ID do monitor:

```
task_stop(task_id="mon_abc123def4567890")
```

## `monitor` exemplos

Monitorar um log de aplicação:

```
monitor(
  command="tail -f logs/app.log",
  description="application log stream",
  max_events=200
)
```

Monitorar um servidor de desenvolvimento ou watcher de build:

```
monitor(
  command="npm run build -- --watch",
  description="watch build output",
  idle_timeout_ms=600000
)
```

Verificar um endpoint de saúde local:

```
monitor(
  command="while true; do curl -s http://localhost:8080/health; sleep 5; done",
  description="local health check",
  max_events=120
)
```

Executar a partir de um diretório de espaço de trabalho específico:

```
monitor(
  command="npm run dev",
  description="frontend dev server",
  directory="/absolute/path/to/workspace/packages/web"
)
```

## Monitor vs. comandos shell em segundo plano

Use `monitor` quando o agente precisar reagir a saída em streaming enquanto o comando continua em execução. Use `run_shell_command` quando você precisar de um resultado único ou da saída completa do comando.

| Necessidade                                                   | Use                                      |
| :------------------------------------------------------------ | :--------------------------------------- |
| Monitorar logs, saída de build ou atualizações de status periódicas | `monitor`                                |
| Executar um comando único e ler a saída completa              | `run_shell_command(is_background=false)` |
| Iniciar um daemon que não produz saída significativa          | `run_shell_command(is_background=true)`  |

Não adicione `&` a comandos monitor. Um `&` no final, como `tail -f log &`, é removido porque o monitor gerencia a execução em segundo plano por conta própria. Um `&` não final, como `cmd1 & cmd2`, é rejeitado imediatamente; reestruture esses comandos sem usar segundo plano.

## Notas importantes

- **Comportamento de parada automática:** Monitores param automaticamente quando atingem `max_events`, quando `idle_timeout_ms` expira sem saída, ou quando o comando subjacente é encerrado por conta própria. O status do monitor reflete o resultado do comando, não um erro da ferramenta: uma saída limpa (`código 0`) se torna `completed`, um código de saída diferente de zero se torna `failed` com a mensagem `Exit code N`, e a terminação por sinal se torna `failed` com a mensagem `Killed by signal SIG`. Comandos não podem ser interativos porque o stdin está fechado. Quando um monitor para, o Qwen Code envia `SIGTERM` para o grupo de processos do comando e escala para `SIGKILL` após cerca de 200 ms. No Windows, usa `taskkill /f /t`. Se o próprio processo do Qwen Code for morto à força, travar ou ficar sem memória, o grupo de processos destacado não é limpo automaticamente; recupere parando o monitor com `task_stop` antes de sair ou terminando o grupo de processos manualmente.
- **Limite de concorrência:** O Qwen Code permite até 16 monitores em execução por sessão CLI como um único pool compartilhado. Monitores iniciados por subagentes contam para o mesmo limite que monitores iniciados pelo agente principal. Pare um monitor existente antes de iniciar outro se o limite for atingido.
- **Manipulação de saída:** Stdout e stderr são mesclados em um único fluxo de notificação sem prefixo de fluxo. Linhas vazias são ignoradas, caracteres de controle e cores ANSI são removidos, e linhas individuais com mais de 2000 caracteres são truncadas. Saída de alto volume é limitada com uma rajada de 5 eventos e cerca de 1 evento por segundo depois disso; linhas além do limite são descartadas, não armazenadas em buffer. A saída do monitor flui para o contexto do agente como conteúdo `<task-notification>`. Tags estruturais de notificação são desarmadas, mas o modelo ainda lê o texto de cada linha, portanto evite monitorar fluxos onde terceiros possam escrever, a menos que você confie que o modelo ignorará instruções incorporadas.
- **Permissões:** `monitor` tem seu próprio limite de permissão e regras de permissão, como `Monitor(git status)`. Comandos somente leitura são automaticamente permitidos; comandos que modificam estado exigem aprovação do usuário; comandos contendo substituição de comando (`$(...)`, crases, `<(...)`, ou `>(...)`) são rejeitados imediatamente. As configurações `tools.core` e `tools.exclude` para `run_shell_command` não se aplicam a `monitor`.
- **Restrição de espaço de trabalho:** O `directory` opcional deve ser um caminho absoluto que resolva dentro de um diretório de espaço de trabalho registrado e fora do diretório user-skills. Links simbólicos que apontam para fora do espaço de trabalho são rejeitados.