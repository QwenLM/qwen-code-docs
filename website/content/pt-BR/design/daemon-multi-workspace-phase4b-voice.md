# Voice Qualificado por Workspace

## Objetivo

Expor as superfícies existentes de configurações de Voice do daemon,
transcrição em lote e transcrição em streaming para todos os runtimes de
workspace confiáveis, sem alterar as rotas legadas somente primárias.

## Design

`GET`/`POST /workspaces/:workspace/voice`,
`POST /workspaces/:workspace/voice/transcribe` e
`WS /workspaces/:workspace/voice/stream` resolvem um runtime registrado
confiável por id ou cwd codificado. Eles usam o cwd, o ambiente efetivo, a
bridge e as configurações de workspace desse runtime. Escritas de
configurações de Voice através do REST plural sempre usam escopo de
workspace; escritas de voice do ACP secundário usam o mesmo escopo para que
não possam alterar configurações compartilhadas do usuário.

Um `WorkspaceVoiceCoordinator` com escopo de processo é dono do limite
existente de oito operações de Voice ativas. Ele contabiliza tanto o trabalho
em lote WebSocket quanto REST pelos caminhos legado e qualificado por
workspace. Uma drenagem de remoção rejeita nova admissão, mas deixa o trabalho
de Voice existente visível ao snapshot de atividade de remoção não forçada. O
descarte de runtime aborta apenas os leases de Voice do runtime selecionado
antes que sua bridge seja desligada.

## Compatibilidade

`/workspace/voice`, `/workspace/voice/transcribe` e `/voice/stream` legados
permanecem vinculados ao workspace primário. Os nomes de métodos do ACP e o
esquema de configurações de Voice são inalterados.
`workspace_qualified_voice` anuncia todas as modalidades de Voice
qualificadas quando o listener WebSocket compartilhado de ACP/Voice está
habilitado. As tags de capability existentes de modalidade de Voice permanecem
sinais do workspace primário e não são pré-requisitos para um runtime
secundário, cuja configuração é validada pela rota selecionada.

Seletores de workspace desconhecidos retornam `400 workspace_mismatch`;
runtimes registrados mas não confiáveis retornam `403 untrusted_workspace`
antes que configurações de Voice ou áudio sejam lidos. O teto compartilhado de
admissão de oito operações cobre trabalho em lote e em streaming tanto para as
rotas legadas quanto plurais. Falhas de capacidade em lote retornam
`503 voice_capacity_exceeded` com `Retry-After: 5`; falhas de capacidade de
streaming enviam um frame de erro e fecham com código `1013`.
