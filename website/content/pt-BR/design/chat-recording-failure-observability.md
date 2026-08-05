# Observabilidade de falhas de gravação de chat

## Contexto

O `ChatRecordingService` para permanentemente de aceitar gravações após sua
primeira falha de gravação JSONL assíncrona. A transcrição permanece um
prefixo válido, mas sem um sinal separado usuários e clientes remotos podem
assumir incorretamente que mensagens posteriores ainda estão sendo gravadas.

## Ciclo de vida principal

`Config.onChatRecordingFailure()` é a fronteira de assinatura local do
processo. Cada gravador criado por uma `Config` encaminha sua primeira falha
de gravação assíncrona para um snapshot dos listeners registrados. O evento
carrega o ID de sessão do registro falho e um `Error` normalizado; falhas de
listener são isoladas da promessa do escritor. Assinaturas sobrevivem à
substituição do gravador e são removidas independentemente pelos seus
disposers. `Config.shutdown()` mantém os listeners vivos durante a
finalização e o flush do gravador, então os limpa.

Falhas síncronas de criação de arquivo de conversa não emitem o evento porque
o gravador não entrou no seu estado de falha permanente e uma chamada
posterior pode tentar novamente. Um gravador falho emite uma vez;
descendentes pulados, acréscimos posteriores e flushes repetidos não emitem
novamente.

## Superfícies locais do CLI

TUI e saída de texto renderizam um aviso genérico acionável sem caminhos de
sistema de arquivos, valores de errno ou o erro subjacente. JSON, stream-json
e saída dupla emitem uma mensagem `system/session_recording_degraded` cujos
IDs de sessão de nível superior e do payload vêm ambos do evento de falha em
vez da sessão atual da `Config`.

Saída estruturada one-shot finaliza o gravador e espera até dois segundos pelo
seu flush antes de emitir o resultado terminal. Sessões stream-json de longa
duração assinam uma vez, fazem flush entre turnos sem finalizar e finalizam
apenas no encerramento da sessão. Um timeout preserva a capacidade de resposta
e não cancela a gravação subjacente.

## Protocolo do daemon e estado ao vivo durável

O filho ACP envia `qwen/notify/session/recording-degraded` com versão 1 do
protocolo, o ID da sessão afetada e `reason: "write_failed"`. A bridge valida
o payload, publica `session_recording_degraded` e marca a entrada da sessão ao
vivo como degradada. Notificações que chegam antes do registro da entrada usam
o buffer limitado existente de eventos antecipados; drenar o buffer atualiza
tanto o replay ring quanto o estado da entrada.

`session_snapshot.recordingDegraded` preserva o estado depois que o evento ao
vivo sai do replay ring. É estado apenas de memória do daemon: um restart do
daemon cria um novo gravador e começa saudável. O evento é aditivo sob
`EVENT_SCHEMA_VERSION = 1`; nenhuma mudança de capability é necessária.

## SDK e WebUI

O SDK valida o evento ao vivo e o campo opcional de snapshot. O redutor de
sessão trata o evento ao vivo como uma atualização sticky segura para
ressincronização. Um campo de snapshot presente é autoritativo, enquanto um
campo ausente preserva o estado para compatibilidade com daemons mais
antigos.

O normalizador da UI mapeia qualquer representação degradada para o mesmo erro
de gravação recuperável. A WebUI usa o ID explícito de aviso
`daemon.session_recording_degraded:<sessionId>` para que um evento
reproduzido seguido por um snapshot seja idempotente. Dispensar um aviso
remove a instância atual; um snapshot posterior pode fazer o risco ainda ativo
aparecer novamente.

## Fronteira de fechamento

Caminhos de fechamento estritos que requerem um flush bem-sucedido mantêm a
entrada do daemon viva quando o flush falha, para que o evento permaneça
entregável. A ordem existente de fechamento best-effort não muda: se seu
EventBus já estiver fechado quando uma falha tardia for descoberta, apenas o
log de debug retém essa falha.

## Não objetivos

Este design não tenta novamente gravações, não recupera um gravador degradado,
não muda o conteúdo do JSONL nem links de pai, não adiciona fsync, não expõe
erros brutos de sistema de arquivos nem coordena escritores concorrentes entre
processos.
