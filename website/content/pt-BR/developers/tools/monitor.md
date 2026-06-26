# Ferramenta Monitor (`monitor`)

Este documento descreve a ferramenta `monitor` para o Qwen Code.

## Descrição

Use `monitor` para iniciar um comando shell de longa duração que envia as linhas de stdout e stderr de volta ao agente como notificações de tarefa em segundo plano. É destinado a comandos do estilo "watch" onde nova saída é relevante ao longo do tempo, como acompanhar logs, observar a saída de uma compilação, fazer polling em um endpoint de saúde ou observar alterações em arquivos.

O monitor executa em segundo plano, permitindo que o agente continue trabalhando enquanto os eventos chegam. Cada linha não vazia de saída se torna um evento de notificação, sujeito a limitação de taxa.

### Argumentos

`monitor` aceita os seguintes argumentos:

- `command` (string, obrigatório): O comando shell a ser executado e monitorado.
- `description` (string, opcional): Uma breve descrição do que o monitor está observando. O texto exibido é truncado em 80 caracteres.
- `max_events` (número, opcional): Pare após este número de eventos de notificação. Deve ser um inteiro positivo. O padrão é `1000`; máximo `10000` (valores fora desse intervalo são rejeitados, não silenciosamente ajustados).
- `idle_timeout_ms` (número, opcional): Pare se o comando não produzir saída por este número de milissegundos. Deve ser um inteiro positivo. O padrão é `300000` (5 minutos); máximo `600000` (10 minutos), e valores fora desse intervalo são rejeitados.
- `directory` (string, opcional): Um caminho absoluto para executar o comando. Deve resolver (após canonicalização de links simbólicos) dentro de um dos diretórios de workspace registrados, e não deve estar dentro do diretório de habilidades do usuário. Se omitido, o Qwen Code usa a raiz do projeto.

## Como usar `monitor` com o Qwen Code

O modelo escolhe a ferramenta `monitor` quando precisa observar um processo ao longo do tempo em vez de coletar um único resultado de comando. Uma invocação bem-sucedida retorna um ID de monitor, o comando, o limite de eventos e o tempo limite de ociosidade.

Uso:

```
monitor(command="tail -f logs/app.log", description="stream de log do app")
```

A saída do monitor é visível na conversa como notificações de tarefa. Você também pode inspecionar monitores em execução e concluídos com `/tasks` ou o diálogo interativo de Tarefas em segundo plano.

Para parar um monitor em execução, use a ferramenta `task_stop` com o ID do monitor:

```
task_stop(task_id="mon_abc123def4567890")
```

## Exemplos de `monitor`

Observar um log de aplicação:

```
monitor(
  command="tail -f logs/app.log",
  description="stream de log da aplicação",
  max_events=200
)
```

Monitorar um servidor de desenvolvimento ou watcher de build:

```
monitor(
  command="npm run build -- --watch",
  description="observar saída da compilação",
  idle_timeout_ms=600000
)
```

Fazer polling em um endpoint de saúde local:

```
monitor(
  command="while true; do curl -s http://localhost:8080/health; sleep 5; done",
  description="verificação de saúde local",
  max_events=120
)
```

Executar a partir de um diretório de workspace específico:

```
monitor(
  command="npm run dev",
  description="servidor de desenvolvimento frontend",
  directory="/caminho/absoluto/para/workspace/packages/web"
)
```

## Monitor vs. comandos shell em segundo plano

Use `monitor` quando o agente precisar reagir a saída em streaming enquanto o comando continua em execução. Use `run_shell_command` em vez disso quando precisar de um resultado único ou da saída completa do comando.

| Necessidade                                                   | Use                                      |
| :------------------------------------------------------------ | :--------------------------------------- |
| Observar logs, saída de compilação ou atualizações de status periódicas | `monitor`                                |
| Executar um comando único e ler a saída completa              | `run_shell_command(is_background=false)` |
| Iniciar um daemon que não produz saída significativa         | `run_shell_command(is_background=true)`  |

Não adicione `&` a comandos monitorados. Um `&` final, como `tail -f log &`, é removido porque o monitor gerencia a execução em segundo plano por conta própria. Um `&` não final, como `cmd1 & cmd2`, é rejeitado imediatamente; reestruture tais comandos sem execução em segundo plano.

## Notas importantes

- **Comportamento de parada automática:** Monitores param automaticamente quando atingem `max_events`, quando `idle_timeout_ms` expira sem saída, ou quando o comando subjacente termina por si só. O status de um monitor reflete o resultado do comando, não um erro da ferramenta: uma saída limpa (`código 0`) torna-se `completed`, um código de saída diferente de zero torna-se `failed` com a mensagem `Código de saída N`, e a terminação por sinal torna-se `failed` com a mensagem `Morto pelo sinal SIG`. Comandos não podem ser interativos porque a entrada padrão (stdin) está fechada. Quando um monitor para, o Qwen Code envia `SIGTERM` para o grupo de processos do comando e escala para `SIGKILL` após cerca de 200 ms. No Windows, usa `taskkill /f /t`. Se o processo do Qwen Code em si for morto à força, falhar ou ficar sem memória, o grupo de processos destacado não é limpo automaticamente; recupere parando o monitor com `task_stop` antes de sair ou terminando o grupo de processos manualmente.
- **Limite de concorrência:** O Qwen Code permite até 16 monitores em execução por sessão CLI como um único pool compartilhado. Monitores iniciados por subagentes contam para o mesmo limite que monitores iniciados pelo agente principal. Pare um monitor existente antes de iniciar outro se o limite for atingido.
- **Tratamento de saída:** Stdout e stderr são mesclados em um único fluxo de notificações sem prefixo de fluxo. Linhas vazias são ignoradas, caracteres de controle e cores ANSI são removidos, e linhas individuais com mais de 2000 caracteres são truncadas. Saída de alto volume é limitada com uma rajada de 5 eventos e aproximadamente 1 evento por segundo após isso; linhas além do limite são descartadas, não enfileiradas. A saída do monitor flui para o contexto do agente como conteúdo `<task-notification>`. Tags estruturais de notificação são desarmadas, mas o modelo ainda lê o texto de cada linha, portanto evite monitorar fluxos que partes externas possam escrever, a menos que confie no modelo para ignorar instruções incorporadas.
- **Permissões:** `monitor` tem seu próprio limite de permissão e regras de permissão, como `Monitor(git status)`. Comandos somente leitura são automaticamente permitidos; comandos que modificam estado exigem aprovação do usuário; comandos contendo substituição de comando (`$(...)`, crases, `<(...)`, ou `>(...)`) são rejeitados imediatamente. As configurações `tools.core` e `tools.exclude` para `run_shell_command` não se aplicam a `monitor`.
- **Restrição de workspace:** O `directory` opcional deve ser um caminho absoluto que resolva dentro de um diretório de workspace registrado e fora do diretório de habilidades do usuário. Links simbólicos que apontam para fora do workspace são rejeitados.
