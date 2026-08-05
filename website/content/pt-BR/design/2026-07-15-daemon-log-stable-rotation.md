# Logs do Daemon Estáveis e Limitados

- **Status:** Implementado
- **Data:** 2026-07-15
- **Escopo:** logging em arquivo do `qwen serve`, propriedade de ciclo de vida, admissão de access-log, status do daemon e o espelho de status do SDK TypeScript

## Decisão

Cada namespace de log de runtime tem um único caminho ativo estável:

```text
${runtimeBaseDir}/debug/daemon/daemon.log
```

Reinícios normais anexam nesse caminho. A política fixa é:

| Limite                                        |       Valor |
| --------------------------------------------- | ----------: |
| Arquivo ativo                                 |      10 MiB |
| Arquivos por família                          |           4 |
| Registro de arquivo renderizado               |     256 KiB |
| Payload de arquivo aceito mas não liquidado   |       4 MiB |
| Lease estável stale/atualização               | 60 s / 10 s |
| Orçamento de aquisição estável/manutenção     | 1 s / 250 ms |
| Orçamento de fechamento público do logger     |         2 s |

Esses valores são intencionalmente não flags de CLI, variáveis de ambiente ou settings. Uma família estável saudável ocupa no máximo cerca de 50 MiB. Reter a família de fallback inativa mais recente traz o namespace convergido para cerca de 100 MiB. Donos de fallback vivos ou ainda não stale nunca são excluídos, então o uso temporário pode crescer com o número de daemons possivelmente vivos.

Toda inicialização gera um `runId` aleatório de 128 bits. Todo registro de arquivo começa com o contexto imutável de `runId` e PID do daemon. O contexto do chamador não pode substituir esses valores. O stderr mantém a formatação existente e a ordem dos campos.

## Namespace e propriedade

O diretório de log configurado é o namespace de propriedade e retenção. Workspace, porta do listener e PID não são identidades de armazenamento: um daemon pode hospedar vários workspaces, a porta zero é dinâmica, portas podem avançar em caso de conflito e daemons embutidos podem compartilhar um PID.

A família estável é de propriedade de um lease `proper-lockfile` vitalício. Um competidor que não consegue adquiri-lo grava em:

```text
debug/daemon/runs/run-<32-hex-runId>/daemon.log
```

Ele mantém o `.owner.lock` daquela família durante seu tempo de vida e nunca é promovido para a família estável durante a execução. O banner de inicialização e o status completo do daemon são autoritativos para o caminho selecionado. `runs/recent-fallback` é apenas uma dica de descoberta validada.

A alocação e a limpeza de fallback são serializadas por `runs/.maintenance.lock`. A limpeza retém toda família de dono ocupada e no máximo uma família inativa. Ela prefere um localizador válido, depois o mtime de log ativo mais recente, depois o basename como desempate determinístico. Um erro de limpeza não relacionado a lock ou uma exclusão falha rejeita a alocação, para que um namespace danificado não acumule um novo diretório a cada inicialização.

O fechamento limpo de fallback adquire a propriedade de manutenção, libera seu lease de dono, retém a família atual, remove outras famílias inativas e repara o localizador. Se a propriedade de manutenção não estiver disponível, o fechamento libera apenas o lease de dono e deixa o reparo para uma inicialização posterior.

## Layout do sistema de arquivos

```text
debug/daemon/
├── daemon.log
├── latest -> daemon.log
├── .stable-writer.lock/
├── archive/
│   └── daemon-000000000001-20260715T031415926Z-a1b2c3d4.log
└── runs/
    ├── .maintenance.lock/
    ├── recent-fallback
    └── run-6a45c211000000000000000000000000/
        ├── .owner.lock/
        ├── daemon.log
        └── archive/
```

Apenas arquivos de arquivo regulares estritamente correspondentes participam da retenção. Arquivos legados `serve-<pid>.log` e `serve-<pid>-<workspaceHash>.log` não são migrados nem excluídos.

Novos diretórios usam o modo `0700`; novos logs ativos e arquivos temporários de localizador usam `0600`. Permissões de objetos existentes não são regravadas. `latest` é atualizado apenas por um dono estável bem-sucedido e permanece best-effort onde symlinks não estão disponíveis.

## Registros de arquivo e fila

Registros de arquivo são truncados em uma fronteira UTF-8 válida. O registro final, incluindo um marcador de contagem de bytes original e newline, tem no máximo 256 KiB. Sua cópia para stderr não é truncada.

Uma fila de Promises preserva a ordem de mutação de arquivo. Bytes de registros aceitos mas não liquidados são contabilizados sincronicamente. Um registro que elevaria a fila acima de 4 MiB perde apenas sua cópia de arquivo; o logger incrementa `droppedRecords` e `droppedBytes` e avisa uma vez para esse episódio de overflow.

Depois que a capacidade se recupera, o próximo registro de chamador é precedido por um aviso somente de arquivo chamado `daemon file log records dropped`. Ele reporta os totais não reportados de registros e bytes e não contribui recursivamente para eles. O fechamento faz uma tentativa final após drenar a fila.

Cada tarefa da fila captura sua própria falha e libera sua contabilização de bytes pendentes em `finally`; a cauda compartilhada nunca permanece rejeitada. Se um append ativo rejeitar, seu resultado é desconhecido: o logger registra `write_failed`, para toda mutação de arquivo subsequente para aquela execução e não afirma que o registro falho foi uma perda exata. Registros posteriores que são deliberadamente pulados são contados.

A perda de lease igualmente para novas mutações de arquivo imediatamente. Uma única operação de sistema de arquivos que já começou pode terminar, mas nenhum append, rotação ou exclusão posterior inicia através daquela família.

## Transação de rotação

Antes que um registro faça o arquivo ativo exceder 10 MiB, o logger:

1. verifica que `archive/` é um diretório real, não symlink;
2. remove os arquivos gerados mais antigos até que no máximo três permaneçam;
3. escolhe um nome inexistente contendo uma geração de 12 dígitos, timestamp UTC e sufixo aleatório;
4. renomeia atomicamente o caminho ativo para esse nome de arquivo;
5. anexa o registro disparador em um novo `daemon.log` com modo `0600`; e
6. confirma o tamanho em memória e o estado de geração.

Assim, uma família produzida por esta implementação tem no máximo um arquivo ativo e quatro arquivos. Se o append no novo ativo falhar, o arquivo ativo anterior permanece completo no arquivo mais recente.

Falha de validação, poda, nomeação ou renomeação de arquivo descarta o registro em vez de permitir que o arquivo ativo ultrapasse 10 MiB. A rotação é tentada novamente no máximo uma vez a cada 60 segundos enquanto registros menores que ainda cabem podem continuar. Não há protocolo especial de exclusão-e-retry para ENOSPC/EDQUOT nem rollback de truncamento de append rejeitado, porque nenhum dos dois pode provar o estado resultante do arquivo.

A inicialização lê o tamanho real do arquivo ativo. Se seu último byte não for um newline e o registro de inicialização não o rotacionar primeiro, o logger insere um newline e marca o registro de inicialização com `previousTailIncomplete=true`. Se a sonda de inicialização estável não puder gravar com segurança, ela libera o lease estável e tenta uma família de fallback. Uma sonda de fallback falha resulta em logging degradado apenas para stderr.

## Estado e ciclo de vida do logger

```ts
type DaemonLogMode = 'stable' | 'fallback' | 'stderr-only';
type DaemonLogHealth = 'ok' | 'degraded';
type DaemonLogIssue =
  | 'init_failed'
  | 'rotation_failed'
  | 'retention_failed'
  | 'queue_overflow'
  | 'write_failed'
  | 'lease_compromised';
```

`getStatus()` retorna a identidade da execução, modo, saúde, issues ordenados e contadores de perda. `QWEN_DAEMON_LOG_FILE=0|false|off|no` retorna um logger saudável apenas para stderr sem acessar o sistema de arquivos: `info`, `warn` e `error` ainda gravam em stderr, enquanto `raw` permanece apenas para arquivo e, portanto, não faz nada.

`close()` é idempotente e não rejeita. Ele para sincronicamente de aceitar cópias de arquivo, enquanto chamadas estruturadas para stderr permanecem utilizáveis. Seu finalizador em segundo plano drena a fila, tenta o resumo final de perdas, realiza a limpeza de fallback e libera o lease vitalício. A Promise pública espera no máximo dois segundos; um timeout não libera o lease antecipadamente, e o finalizador permanece vivo até que a E/S iniciada se estabilize. `flush()` mantém sua semântica de snapshot de fila sem limites. Caminhos de sinal forçados e falhas de fechamento de recurso com retry disputam-no contra 250 ms.

A propriedade do logger passa por:

```text
startup -> handle publicado -> fechamento terminal
       \-> sinal de startup -> fechamento terminal
```

Um fechamento interno antes da publicação do handle drena os recursos do daemon sem esperar pela fila do logger, e então deixa o logger para o dono do erro de startup externo. Esse dono registra `daemon startup failed` e o fecha. Um fechamento terminal publicado ou de propriedade de sinal sela o logging de acesso, registra `daemon stopped` e fecha o logger mesmo quando o fechamento de recursos retorna um erro sem retry; o erro original de recurso permanece o erro retornado. Gravações diagnósticas terminais são best-effort, então um stderr indisponível não pode substituir a falha original nem pular a limpeza do logger. Uma falha com retry de channel worker/lease de serviço mantém o logger aberto, usa o flush limitado acima e não registra `daemon stopped`.

## Admissão de access-log

Cada app Express de runtime possui um token bucket de espaço constante com burst 60 e reabastecimento de 2 registros/segundo, medido com um relógio monotônico. O retrocesso do relógio nunca move a linha de base de reabastecimento para trás. Exclusões de health, heartbeat e SSE bem-sucedido permanecem inalteradas.

Rota, ID de sessão e a primeira ocorrência bruta de `x-qwen-client-id` são limitados a 2 KiB, 256 bytes e 256 bytes em fronteiras UTF-8. Valores truncados carregam um campo de contexto com a contagem de bytes original. Usar o primeiro header bruto evita que headers duplicados mesclados se tornem uma nova fonte de cardinalidade.

Quando nenhum token está disponível, apenas cinco contadores fixos são retidos: 2xx, 3xx, 4xx, 5xx e other. Na recuperação, um resumo WARN `access logs suppressed` consome o próximo token antes de qualquer registro individual. Se esse era o único token, a requisição atual junta-se ao próximo resumo. O encerramento sela o controlador após a drenagem normal do listener ou o prazo secundário, emite um resumo final, ignora callbacks de conclusão tardios e então registra `daemon stopped`.

O rate limiting afeta apenas o diagnóstico; ele nunca muda o resultado HTTP. Registros individuais suprimidos não chegam nem a stderr nem ao arquivo, enquanto resumos chegam a ambos.

## Status do daemon e SDK

Cada resposta de status obtém um snapshot do logger. Respostas de resumo e completas podem conter:

- `daemon.runId`
- `daemon.logMode`
- `daemon.logHealth`

Respostas completas podem conter adicionalmente `daemon.logPath`, `daemon.logIssues`, `daemon.logDroppedRecords` e `daemon.logDroppedBytes`. Logging degradado adiciona um aviso `daemon_log_degraded` de nível superior sem caminho ao rollup existente. O SDK TypeScript espelha os campos opcionais e as uniões fechadas. Nenhuma tag de capability ou upgrade de cliente é necessária.

O opt-out reporta `stderr-only/ok`; a contenção estável comum reporta `fallback/ok`; falha de inicialização do sistema de arquivos reporta logging degradado com `init_failed`.

## Fronteiras operacionais e de compatibilidade

- Use diretórios de runtime separados para namespaces de retenção ou auditoria independentes.
- No macOS/Linux use `tail -F daemon.log`; em toda plataforma, visualizadores devem reabrir o caminho após a rotação.
- Não configure logrotate externo para modificar o `daemon.log`. Copiá-lo ou enviá-lo é seguro; renomeá-lo, truncá-lo ou excluí-lo quebra o modelo de tamanho em memória.
- Não há expiração por idade, compressão, durabilidade fsync ou limite absoluto durante tempestades de daemons concorrentes ou reinício por crash dentro da janela stale.
- Adulteração pelo mesmo usuário, tomada de controle stale falsa, chamadas de sistema de arquivos que nunca retornam, perda súbita de energia e leitores Windows que impedem renomeação são tratados por degradação segura, não por protocolos específicos de plataforma de no-follow, fsync ou admissão de processo.
- O downgrade permanece possível; versões mais antigas simplesmente retomam a criação de arquivos com nome de PID.

## Estratégia de verificação

A cobertura unitária inclui formatação, contexto de arquivo imutável, reutilização estável, truncamento UTF-8, limites de rotação, caudas incompletas, resumos de overflow de fila, appends envenenados, leases comprometidos ativos e pós-liberação, fechamento limitado e flushes com retry, concorrência estável/fallback, retenção de fallback, recusa de limpeza, falhas de diagnóstico de ciclo de vida, admissão de token de acesso, selamento de encerramento, snapshots de status, namespaces de runtime de teste isolados e superfície de tipos do SDK.

A verificação em nível de processo usa um bundle construído e diretório de runtime isolado para reutilização em reinício, rotação com limites reais, concorrência estável/fallback, liberação de lease por sinal, comportamento de janela stale com SIGKILL, agregação de acesso, preservação de arquivos legados e opt-out sem acesso ao sistema de arquivos. A matriz de plataformas do CI deve exercitar caminhos ativos diretos no macOS, Linux e Windows; o Windows verifica adicionalmente a degradação segura quando um leitor impede o renomeio ativo/arquivo.
