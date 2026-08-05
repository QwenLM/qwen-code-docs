# Profiler de Início de Sessão

## Resumo

Esta alteração adiciona um profiler interno e opt-in para `GeminiClient.startChat()`, permitindo que o trabalho de acompanhamento da #6312 identifique os hotspots restantes de inicialização por sessão antes de escolher uma otimização.

Ela não altera o comportamento da sessão, campos de protocolo públicos, comportamento do SDK, flags da CLI, schema de configuração, schema de telemetria ou a semântica do profiler de inicialização.

## Formato de Medição

O profiler é habilitado apenas quando `QWEN_CODE_PROFILE_SESSION_START=1`.

Quando habilitado, o core grava registros JSONL em `Storage.getRuntimeBaseDir()/session-start-perf/`. Os nomes dos arquivos JSONL diários usam a data UTC do timestamp do registro. Cada registro inclui um timestamp, `SessionStartSource`, flag de sucesso, duração total, durações de estágios limitadas e pequenas contagens agregadas, como o comprimento do histórico e a contagem de snapshots renderizados. O acompanhamento de profiling do daemon da #4748 adiciona um Session ID opaco opcional quando o chamador fornece um, para que este registro de detalhes possa ser juntado ao trace entre processos.

Os estágios medidos seguem a sequência existente de `startChat()`: aquecimento do registro de ferramentas, varredura retomada de revelação de ferramentas adiadas, configuração de lembretes adiados, construção do histórico inicial do chat, semeadura de deduplicação de lembretes de skill, semeadura de deduplicação de lembretes de agent, construção da instrução do sistema, construção do `GeminiChat`, reparo de uso de ferramentas órfãs, hook SessionStart, aplicação opcional de contexto SessionStart e `setTools()`.

## Limites de Segurança

A saída exclui intencionalmente prompts, respostas do modelo, saída de hooks, nomes de ferramentas, caminhos de arquivo e diretórios de trabalho. Seu único identificador opcional é o Session ID opaco usado para correlacionar um registro opt-in com a telemetria do daemon; ele não adiciona identidade de usuário, tenant ou workspace. Os nomes dos estágios são strings estáticas pertencentes ao código.

Todas as gravações do profiler são best-effort. Falhas no sistema de arquivos são ignoradas para que o profiling não possa quebrar ou retardar uma sessão através do tratamento de erros.

O writer JSONL usa permissões restritivas e `O_NOFOLLOW` no arquivo de perfil. A substituição do diretório pai continua sendo best-effort porque o Node não expõe um caminho de append relativo a fd portátil aqui; o diretório de runtime é tratado como armazenamento de diagnóstico do mesmo usuário, não como uma barreira contra um atacante local do mesmo usuário.

Quando desabilitado, o helper não realiza gravações de arquivo e não lê o relógio de alta resolução.

`failedStage` registra apenas os estágios que lançam exceções através do wrapper do profiler. Estágios cujos helpers subjacentes capturam e suprimem seus próprios erros, como a semeadura de deduplicação de lembretes de agent e o hook SessionStart, permanecem bem-sucedidos da perspectiva do profiler.

## Não Objetivos

Esta alteração não otimiza `GeminiClient.initialize()` ou `startChat()`.

Ela não implementa o cache de extensões da Parte B, o lazy-loading do corpo de skill da Parte C, o cache de snapshot de comandos ou quaisquer alterações no protocolo do daemon.

A próxima otimização deve ser escolhida apenas após a coleta dos detalhamentos de estágios deste profiler e a comparação deles com fixtures pesados em extensões ou skills, quando relevante.