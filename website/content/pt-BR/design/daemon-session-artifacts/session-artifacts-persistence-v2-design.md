# Design de Persistência V2 de Session Artifacts do Daemon do Qwen Code

Este documento continua a API V1 de session artifact do PR #5895 e projeta a capacidade de persistência V2. O design da V1 está em [session-artifacts-daemon-api-implementation-design.md](./session-artifacts-daemon-api-implementation-design.md), no mesmo diretório.

O objetivo da V2 é permitir que os metadados de artifact sejam recuperados após reinício do daemon e após session load/replay, sem quebrar a semântica de live session da V1. O PR atual não copia, não congela e não hospeda o conteúdo dos artifacts; para arquivos de workspace, apenas o caminho, size, mtimeMs e sha256 são salvos como verificação de integridade após a recuperação.

## 1. Conclusões do design

A V2 é uma fase de persistência de metadados. O escopo de implementação do PR #6259 converge para restore de metadados, journal/snapshot/rebuild/fork remap de JSONL de artifact, recuperação de metadados de artifact após reinício/load/replay do daemon e exposição da persistência de metadados via REST/ACP/SDK. A retenção de conteúdo (workspace content pin, managed copy com escopo de sessão, manifest, quota, TTL, GC/fsck com escopo de sessão) não está no escopo atual; se houver uma necessidade real de auditoria/arquivamento no futuro, ela deve ser reavaliada como um novo design de content archive. O client não deve inferir funcionalidades a partir do nome de fase "V2", e sim ler a capability.

Capacidades atuais:

1. Restore de metadados: por padrão recupera os metadados estruturados e as referências de recurso do artifact, sem copiar o conteúdo real.
2. Verificação de integridade de workspace: o artifact de workspace registra size + mtimeMs + sha256 no momento do registro; no restore / GET, retorna `available` / `missing` / `changed` com base no arquivo em tempo real.

Capabilities correspondentes:

- `session_artifacts_persistence`: suporta persistência de metadados e recuperação em session load/replay.
- `session_artifacts_content_retention`: não declarada atualmente; se o design de content archive for retomado posteriormente, ela só deve ser declarada depois que cópia/hospedagem de conteúdo, quotas, manifest e GC/fsck estiverem todos concluídos.

Princípios centrais:

- O `SessionArtifactStore` da V1 continua sendo o índice autoritativo em memória para a live session.
- A V2 adiciona um journal/snapshot JSONL de artifact, usado para semear o estado inicial quando o store ao vivo é criado no lado do daemon; o append no JSONL deve ser feito pelo caminho do core/ACP child que atualmente possui o chat recording, e o store do lado do daemon não pode escrever diretamente na transcrição.
- A V2 é JSONL-only por padrão. O cache sidecar não faz parte dos critérios de lançamento da V2; somente se o custo de session load medido for inaceitável, um cache removível será projetado separadamente.
- Não buscar o conteúdo de URLs remotas para o local.
- Não copiar arquivos de workspace por padrão.
- Não tratar `source`, `clientId`, `trustedPublisher` fornecidos pelo client como base de autorização.
- Revalidar obrigatoriamente durante a recuperação; não confiar em metadados antigos no disco.

Reduções importantes do PR atual:

- A API pública de retenção de conteúdo, o managed content store, pin/unpin, deleteContent, quota/manifest/fsck/gc e a capability `session_artifacts_content_retention` não são entregues no PR #6259. O PR atual mantém apenas o caminho de compatibilidade de downgrade/strip para payloads de journal antigos `pinned` / `contentRef`, evitando que registros antigos quebrem o restore de metadados.
- Os detalhes de pin/save, content quota e managed content GC/fsck mantidos abaixo são o blueprint do futuro content archive, não o wire contract ou itens de aceitação do PR #6259; a menos que uma subseção esteja explicitamente marcada como HTTP mapping / comportamento de metadados do PR #6259, a implementação não deve expor essas APIs ou capabilities no #6259.
- A live view atual e os metadados persistidos usam o mesmo conjunto visível de 200 itens. Para evitar over-restore após reinício, a eviction durável/restaurável acima do limite grava um evento de remoção `reason: "eviction"`; isso equivale a um prune de metadados nesta implementação, não apenas ocultação live-only da V1 pura.
- O DELETE explícito atualmente adota live-first: primeiro remove do live store e retorna um warning se a gravação do tombstone falhar. Isso prioriza ocultar itens sensíveis; se o daemon for reiniciado dentro da janela de falha, ele ainda pode recuperar esse artifact do journal antigo, e o client deve tratar o warning como um sinal de "remoção não durável".
- O fork atualmente grava no arquivo JSONL de destino por meio de uma criação exclusiva (exclusive-create) de uma vez; ele não faz streaming de registros de artifact de fork um a um, portanto não é necessário um `session_artifact_fork_marker` para detectar um lote parcial no caminho de gravação atual. Se no futuro o fork se tornar streaming, marcadores begin/complete serão introduzidos.

## 2. Semântica visível ao usuário

### 2.1 Atualização de página, troca e reinício

O comportamento após a V2 deve ser:

- Atualização da página: igual à V1; desde que o daemon/sessão ainda esteja vivo, o frontend simplesmente refaz `GET /session/:id/artifacts`.
- Troca de sessão: cada live session ainda tem seu próprio store de artifacts.
- Reinício da instância do frontend: enquanto o daemon estiver vivo, é possível fazer GET do live store atual.
- Reinício do daemon/bridge: se a sessão for recarregada, a V2 recupera a lista de artifacts a partir dos metadados persistidos.
- Load/replay de histórico: se a sessão tiver registros de persistência V2, recupera a lista de artifacts; caso contrário, retorna uma lista vazia.

O upgrade ao vivo da V1 para a V2 precisa de tratamento separado: os artifacts ao vivo da V1 já em memória não têm journal JSONL. Quando a V2 tocar essas live sessions pela primeira vez, ela deve gravar um `session_artifact_snapshot` inicial por meio do artifact persistence writer fornecido pelo proprietário do chat recording, e só então aceitar novas mutações de artifact restauráveis. O backfill não pode serializar o live store como está; ele deve reexecutar a validação de ingest, a minimização de privacidade e a materialização de `retention` para cada artifact. Se um único artifact não passar, ele é pulado ou rebaixado, sem permitir que um registro ruim derrube todo o backfill. Se o writer não estiver disponível ou o backfill falhar por completo, a sessão continua com o comportamento V1 live-only e um warning estruturado é registrado; o usuário não deve ser levado a pensar que os live artifacts existentes já são recuperáveis.

O backfill não pode escrever eventos de artifact em streaming, um a um, no JSONL. A implementação deve primeiro concluir a validação, a minimização e o rebaixamento em memória, formar um snapshot candidato completo e, então, acrescentar o `session_artifact_snapshot` de uma só vez. Se a construção do candidato ou o append do snapshot falhar, nenhum estado durável parcial de artifact pode ser deixado para trás. O PR atual não implementa o backfill do live store da V1; se for complementado posteriormente, o número de entradas candidatas, o número de entradas puladas e os motivos de falha de validação devem ser gravados em telemetria estruturada ou nos metadados do snapshot, para que o fsck e os warnings de restore possam distinguir "completo, mas com entradas puladas pela validação" de "gravação parcial/corrompida".

### 2.2 Camadas de retention

Novo campo opcional. O caminho público de mutação do PR #6259 aceita apenas `ephemeral` e `restorable`; o `pinned` de journals antigos é rebaixado para `restorable` somente de metadados no restore / fork:

```ts
type ArtifactRetention = 'ephemeral' | 'restorable';
```

Significado:

- `ephemeral`: existe apenas no live store. Não é recuperado após o desaparecimento do daemon/sessão.
- `restorable`: os metadados são gravados no journal de persistência. Após session load/replay, é recuperado como um item de artifact, mas não há garantia de que o recurso subjacente ainda exista.

Regras padrão:

- Tool result, `record_artifact`, hook artifact: padrão `restorable`, mas apenas os metadados são persistidos.
- Client POST artifact registrado manualmente pelo usuário em um frontend interativo: padrão `restorable`; continua a aparecer na lista de artifacts após a recuperação.
- Client POST de segundo plano/automatizado: se for apenas estado de UI temporário, deve solicitar explicitamente `retention: "ephemeral"`; o SDK deve fornecer um helper efêmero explícito.
- Artifact `published`: padrão `restorable`; atualmente apenas o published locator é recuperado, o conteúdo não é hospedado.

Se o chat recording estiver desabilitado, a persistência de metadados é desabilitada por padrão e a capability não é declarada.

### 2.3 Semântica de recuperação de artifact registrado pelo usuário

Os artifacts registrados manualmente pelo usuário devem continuar a existir após a recuperação da V2, mas o que é recuperado é o "item de metadados do artifact", não um backup incondicional de conteúdo.

O resultado após a recuperação é diferenciado pelo estado do recurso:

- `external_url`: recupera title, description, url, metadata. O daemon não acessa a URL remota; se a URL ainda pode ser aberta é decidido pelo client no momento do clique.
- `workspace`: recupera workspacePath e metadata; se o arquivo ainda estiver no workspace e size + mtimeMs não tiverem mudado, ou se o mtime mudou mas o sha256 ainda corresponder ao registrado, `status: "available"`; se o arquivo foi excluído, movido ou houve escape de symlink, `status: "missing"`; se o arquivo ainda existe mas o size ou o sha256 diferem do registrado, `status: "changed"`.
- `managed`: recupera o managedId; `available` somente se o manifest do managed storage ainda puder ser resolvido.
- `published`: recupera o published locator; o published trust é mantido somente se a validação do manifest do trusted publisher ainda passar.

Portanto, a resposta a "o artifact registrado pelo usuário ainda existe após a recuperação?" é: na V2 ele deve estar presente na lista, a menos que o usuário o tenha removido com DELETE, os metadados tenham sofrido GC/tombstone, a validação de recuperação descubra que o registro está corrompido demais para ser exibido com segurança, ou o chat recording / persistência esteja desabilitado. Se o conteúdo subjacente ainda pode ser aberto depende do tipo de storage e do estado do recurso em tempo real; arquivos de workspace não são copiados pelo daemon, e `changed` serve para evitar abrir silenciosamente uma versão errada.

O daemon não pode determinar "manual" ou "segundo plano" apenas pelo request payload. Na implementação, a origem do registro interativo deve ser identificada pelo principal da conexão, pelo helper do SDK ou pelo caminho da ação da UI; clients cuja intenção interativa não puder ser confirmada devem ser tratados conforme o `retention` explícito, aceitando `restorable` por padrão, mas sujeitos à quota de metadados da sessão e aos registros de auditoria.

## 3. Modelo de dados

### 3.1 Extensão do artifact público

A V2 adiciona campos opcionais ao artifact de resposta da V1:

```ts
interface DaemonSessionArtifact {
  // campos da V1...
  status: 'available' | 'missing' | 'changed';
  retention?: 'ephemeral' | 'restorable';
  persistedAt?: string;
  restoreState?: 'live' | 'restored' | 'unverified' | 'blocked';
  persistenceWarning?:
    | 'persistence_unavailable'
    | 'metadata_only_restore'
    | 'restore_validation_failed'
    | 'sticky_override_active';
  metadata?: {
    'qwen.workspace.sha256'?: string;
    'qwen.workspace.mtimeMs'?: number;
    [key: string]: string | number | boolean | null | undefined;
  };
}
```

Descrição dos campos:

- `retention`: o nível de persistência do artifact. A ordem de resolução é: valor explícito do corpo da requisição tem prioridade; artifacts internos do sistema seguem a política padrão do daemon da §2.2; quando o client POST não especifica, usa o `defaultRetention` configurado pelo usuário; sem configuração, o fallback é `restorable`. Somente quando a capability de persistência não está declarada ou ao ler registros da era V1 é tratado como live-only compatível com a V1. O writer da V2 deve materializar `retention` ao escrever no journal, não pode depender do padrão opcional.
- `persistedAt`: o momento da última gravação bem-sucedida dos metadados no disco.
- `restoreState`: indicação da origem da recuperação; não substitui `status`.
- `persistenceWarning`: riscos de persistência/recuperação não bloqueantes; o frontend pode usá-lo para indicar estados como "este artifact não será mantido entre reinícios". O formato de wire atual é uma string fixa, evitando escrever caminhos absolutos do host, credenciais, tokens, caminhos internos de storage ou ids de conexão na resposta. Um formato mais estruturado `{ code, message }` pode ser uma extensão compatível posterior.
- `status: "changed"`: usado apenas para artifacts de workspace. O daemon grava `sizeBytes`, `metadata["qwen.workspace.sha256"]` e `metadata["qwen.workspace.mtimeMs"]` no registro; após GET/list/restore, o refresh primeiro faz stat do arquivo atual, retorna `changed` diretamente se o size mudou, não relê o arquivo se size/mtime não mudaram, e somente recalcula o sha256 como salvaguarda quando o mtime mudou mas o size é o mesmo.

### 3.2 Relação entre Status e restoreState

O `status` da V1 continua indicando se o recurso atual está disponível:

- `available`
- `missing`
- `changed`

A V2 adiciona apenas `changed` como novo estado de integridade de workspace. Ele indica que o caminho ainda está acessível, mas o size do arquivo em tempo real mudou, ou o sha256 após a mudança de mtime não corresponde aos metadados registrados. `blocked` não é um `status`, pertence apenas ao `restoreState`:

- `restored`: recuperado a partir dos metadados persistidos.
- `unverified`: metadados recuperados, mas a validação de workspace/managed ainda não foi concluída.
- `blocked`: durante a recuperação, descobriu-se que um limite de segurança não é atendido, por exemplo, escape de caminho de workspace.
- `live`: produzido novamente no processo atual ou confirmado por refresh.

## 4. Design do armazenamento de persistência

### 4.1 Fonte da verdade JSONL-only

A V2 usa por padrão apenas os registros de sistema do JSONL do Chat:

1. O journal JSONL é a fonte de auditoria, a fonte de recuperação e a fonte de migração entre versões.
2. `session_artifact_snapshot` é um ponto de aceleração de recuperação dentro do JSONL, não um arquivo independente.
3. A V2 não introduz cache sidecar. O sidecar aumentaria problemas de sincronização de caminho, validação de obsolescência, coordenação com archive/unarchive/delete, GC de órfãos e confiança de cache; o session load atual já lê o JSONL, e os registros de artifact podem ser extraídos na mesma passada de parse.

Se no futuro testes reais exigirem um sidecar, ele deve entrar como um design separado e atender a duas restrições:

- O sidecar só pode ser um cache removível, não pode sustentar a correção do protocolo.
- Mesmo com sidecar hit, a validação de recuperação deve ser executada para cada artifact, não pode contornar a validação de restore do JSONL.

O sidecar não é um requisito de correção para a persistência da V2. Atualmente, `loadSession()` lê o JSONL completo da sessão para recuperação e reconstrói a árvore de conversa; quando o restore de artifact extrai registros de snapshot/evento na mesma passada de leitura, nenhum E/S de arquivo extra é adicionado. Portanto, sob a arquitetura atual, o sidecar só pode economizar uma pequena quantidade de custo de parse/replay dos registros de artifact, não pode eliminar o principal custo de leitura do session load.

Incluir o sidecar no PR atual expandiria claramente a superfície de implementação:

- Ordem de dupla escrita entre JSONL e sidecar, fsync e crash recovery.
- Validação, invalidação e fallback para sidecar stale/corrompido.
- Sincronização do ciclo de vida do sidecar durante archive/unarchive/delete/fork/remap.
- Se o sidecar é confiável e se pode contornar os limites de segurança da validação de restore.
- Limpeza de sidecar/cache órfão e matriz de testes adicional.

Portanto, os critérios de lançamento da V2 permanecem JSONL-only. O sidecar só entrará em um design separado depois que uma das seguintes condições for comprovada por profiling ou necessidade de produto:

- `loadSession()` não precisar mais ler o JSONL completo, e o sidecar puder evitar uma varredura completa de cold-start.
- A lista de artifacts precisar ser exibida em cold-start sem carregar o histórico da sessão.
- O restore de artifact medido, e não a reconstrução do histórico de conversa, tornar-se o principal consumo de tempo do session load.
- For necessária busca de artifacts entre sessões/projetos ou um índice global.

### 4.2 Propriedade do writer JSONL e modelo de branch

Os registros de persistência de artifact fazem parte da transcrição de chat e devem seguir a semântica existente de parent/leaf do `ChatRecord`:

- O append no JSONL só pode ser feito pelo processo que possui `ChatRecordingService.appendRecord` ou por um RPC explícito por ele exposto. O `SessionArtifactStore` do lado do daemon pode usar uma fila de operações para coordenar a ordem do estado ao vivo, do SSE e das requisições de persistência, mas não pode abrir e escrever ele mesmo no JSONL do chat.
- Cada `session_artifact_event` / `session_artifact_snapshot` deve ser anexado ao leaf atual da conversa como um `ChatRecord` de sistema comum, obtendo o `uuid` / `parentUuid` normais.
- O builder e o renderer da árvore de chat devem tratar os registros de sistema `session_artifact_*` como registros de efeito colateral: eles participam da ordem e do replay de parent/leaf, mas não são renderizados como nós de conversa visíveis ao usuário. No mínimo, ao suportar versões antigas carregando JSONL que contém registros V2, o subtipo de sistema desconhecido deve ser tratado como efeito colateral opaco/ignorado, em vez de fazer o session load falhar.
- O session load/replay aplica apenas os registros de artifact na cadeia de leaf ativa. Upserts/remoções de artifact descartados em um branch abandonado pelo `/rewind` não afetam mais a lista atual de artifacts.
- Quando ocorre `/rewind` ou qualquer troca de leaf, o `SessionArtifactStore` ao vivo do lado do daemon deve ser realinhado ao novo estado de artifact da cadeia ativa: ou faz reseed a partir do resultado do replay da cadeia ativa, ou grava um top-up do snapshot atual de artifact na cadeia sobrevivente durante a operação de rewind. A V2 adota por padrão a semântica com escopo de branch; mutações fora do branch não devem continuar no flat map ao vivo esperando o próximo reinício para desaparecer.
- fork/branch copia apenas os registros de artifact da cadeia ativa; registros fora da cadeia não participam da recuperação da sessão de destino.
- Se alguma fase de implementação ainda não puder conectar os registros de sistema de artifact à cadeia de leaf ativa, ela não pode declarar a capability `session_artifacts_persistence`; caso contrário, após o rewind haverá o problema de ressurreição de upserts ou tombstones antigos.

Isso significa que a V2 não projeta um arquivo de log de artifact independente, nem um side log que contorne a árvore de chat. A correção da persistência de artifact vem da mesma cadeia ativa de histórico de chat, não do estado de memória atual do daemon.

### 4.3 Registro de sistema JSONL

Adicionar a `ChatRecord.subtype`:

```ts
'session_artifact_event' | 'session_artifact_snapshot';
```

Payload:

```ts
interface SessionArtifactEventRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  changes: Array<{
    action: 'created' | 'updated' | 'removed';
    artifactId: string;
    artifact?: PersistedSessionArtifact;
    reason?: 'explicit' | 'eviction' | 'unpin_to_ephemeral';
  }>;
}

interface SessionArtifactSnapshotRecordPayload {
  v: 2;
  sessionId: string;
  sequence: number;
  recordedAt: string;
  artifacts: PersistedSessionArtifact[];
  tombstonedIds?: string[];
  stickyEphemeralIds: string[];
}

type PersistedSessionArtifact = Pick<
  DaemonSessionArtifact,
  | 'id'
  | 'kind'
  | 'storage'
  | 'source'
  | 'status'
  | 'title'
  | 'description'
  | 'workspacePath'
  | 'managedId'
  | 'url'
  | 'mimeType'
  | 'sizeBytes'
  | 'metadata'
  | 'createdAt'
  | 'updatedAt'
> & {
  retention: ArtifactRetention;
  persistedAt: string;
  clientRetained: boolean;
  toolCallId?: string;
  toolName?: string;
  hookEventName?: string;
};
```

`sequence` é um contador de mutação durável dentro de cada store de artifact da sessão, usado para ordenação de snapshot/evento e diagnóstico de anomalias. Durante a recuperação, a ordem da cadeia JSONL ativa ainda é a autoridade; `sequence` não é usado como autorização entre sessões ou fonte de ordenação global.

`PersistedSessionArtifact` deve ser uma allowlist positiva (`Pick` explícito ou interface independente), não uma exclusão negativa via `Omit<DaemonSessionArtifact, ...>`. Se no futuro `DaemonSessionArtifact` ganhar novos campos somente de runtime, uma asserção em tempo de compilação deve exigir que o mantenedor decida explicitamente se eles entram na allowlist persistida, evitando poluição de schema.

Gravar apenas o formato mínimo do artifact após validação/normalização do store. Além de `clientRetained` e das dicas de exibição de tool/hook, não gravar campos internos da V1 ou campos derivados em runtime:

- não gravar `identityKey`
- não gravar `trustedPublisher`
- não gravar o `workspaceCwd` absoluto
- não gravar token de transporte / principal de autenticação
- não gravar `restoreState`
- não gravar `persistenceWarning`
- não gravar `clientId` ou o principal proprietário do processo ao vivo; `source` serve apenas como dica de exibição/auditoria, não pode ser usado para autorização

A exclusão de um artifact deve gravar um tombstone change, evitando a ressurreição por um upsert antigo após o replay do histórico. O tombstone não é uma proibição permanente do reaparecimento do mesmo id: ele apenas cobre seus próprios upserts anteriores, até que um upsert explícito com sequence mais alto apareça depois. O `reason: "unpin_to_ephemeral"` de journals antigos continua como compatibilidade de sticky override: upserts implícitos/padrão subsequentes do mesmo artifact id ainda são tratados como live-only; somente uma requisição que passe explicitamente `retention: "restorable"` em uma rota de mutação REST/ACP autenticada pode suplantar; retention de tool/hook/segundo plano/padrão, backfill de restore e re-ingest implícito não podem suplantar o sticky override.

O sticky override não pode existir apenas no evento de tombstone histórico. O writer do snapshot deve gravar o estado `unpin_to_ephemeral` ainda não suplantado explicitamente em `stickyEphemeralIds`; o reader do restore primeiro recupera o conjunto sticky do snapshot e depois aplica os upserts/remoções após o snapshot. Caso contrário, após o avanço da baseline do snapshot, os tombstones antigos não precisam mais de replay e o sticky override seria perdido.

### 4.4 Invariantes de Snapshot e tombstone

O snapshot de artifact serve apenas para reduzir a quantidade de eventos de artifact aplicados durante o replay; ele não reduz a quantidade de leitura do próprio arquivo JSONL.

Deve satisfazer:

- A geração do snapshot deve ser executada serialmente na mesma fila de operações de artifact e estar estritamente após todas as mutações precedentes.
- O snapshot é o estado atual autoritativo: ele contém apenas os artifacts ainda válidos no momento da geração do snapshot.
- `tombstonedIds` registra apenas os tombstones que ainda precisam cobrir upserts antigos após o snapshot; tombstones antigos cobertos pelo snapshot não entram mais no payload do novo snapshot, evitando que o array cresça infinitamente com o histórico.
- `stickyEphemeralIds` registra os ids de artifact ainda sob sticky ephemeral override; mesmo que o tombstone antigo correspondente não precise mais de replay, o estado de override deve ser preservado.
- `stickyEphemeralIds` deve ser limitado, por padrão compartilhando a mesma ordem de grandeza do limite de metadados persistidos `maxPersistedMetadata`, e contando para o budget do conjunto de trabalho do journal de artifact. Se o replay de journals antigos `unpin_to_ephemeral` exceder o limite do conjunto sticky, o restore/prune deve registrar um warning e tentar novamente mais tarde, não pode crescer silenciosamente, podar aleatoriamente sticky overrides antigos ou permitir que upserts implícitos restaurem a persistência.
- O snapshot pode conter um id de artifact que já sofreu tombstone, desde que esse tombstone tenha sido suplantado por um upsert explícito com sequence mais alto.
- No load, escolher o snapshot válido mais recente do mais novo para o mais antigo e, então, aplicar apenas os eventos de artifact após esse snapshot.
- Se o parse do snapshot mais recente falhar, registrar um warning `snapshot_invalid` e continuar tentando o snapshot válido anterior; um snapshot corrompido não pode fazer com que os metadados de artifact de toda a sessão sejam perdidos.
- Se não houver nenhum snapshot válido, é permitido fazer um único replay sequencial de eventos de artifact na cadeia de leaf ativa do JSONL. Registros de artifact corrompidos isolados devem ser pulados com um warning; somente quando a ordem do branch, o envelope do registro ou o estado do tombstone não puderem mais estabelecer uma ordem confiável, os registros de persistência de artifact dessa sessão são descartados.

O avanço da baseline do snapshot aqui não reescreve nem exclui registros antigos no JSONL. `session_artifact_snapshot` antigos, eventos e tombstones permanecem na transcrição de chat append-only; o subsistema de artifact apenas avança a baseline de recuperação dentro do payload do snapshot mais recente e reinicia as contagens do conjunto de trabalho.

### 4.5 Consumo de armazenamento

A V2 não faz dupla escrita com sidecar, portanto não há armazenamento duplicado de metadados em JSONL + sidecar. O consumo de armazenamento é dividido em journal de metadados e retenção de conteúdo:

- Um único registro de metadados costuma ter cerca de 0,5 KB a 2 KB, dependendo do tamanho de title, description, url e metadata.
- O limite de metadados persistidos válidos por sessão é, por padrão, alinhado com o live store em 200 itens; um único snapshot tem cerca de 100 KB a 400 KB.
- O journal JSONL guarda eventos incrementais, snapshots e tombstones; a própria transcrição de chat append-only cresce.
- A retenção de conteúdo é a principal fonte de espaço, por exemplo, 50 MB por artifact, 200 MB por sessão, 1 GB por projeto.

Estratégias de controle:

- Quando o journal de eventos de artifact atinge um limiar fixo, gravar um `session_artifact_snapshot`, por exemplo, a cada 100 mutações de artifact ou a cada 256 KB de journal de artifact.
- Os registros de persistência de artifact seguem o ciclo de vida da transcrição de chat; não há GC de arquivo independente.
- Adicionar um budget em bytes do conjunto de trabalho do journal de artifact por sessão, por exemplo, 4 MB. Esse budget mede o conjunto de trabalho de artifact que deve ser lido e aplicado para recuperação, ou seja, o snapshot válido mais recente mais os eventos de artifact subsequentes; registros antigos de artifact já cobertos pelo snapshot na transcrição de chat não podem ser contados no budget, caso contrário o JSONL append-only se tornaria um limite único irrecuperável.
- O writer deve rastrear explicitamente os bytes do conjunto de trabalho: após cada gravação de snapshot, registrar o tamanho em bytes dos artifacts desse snapshot, a posição de append do JSONL ou o índice de linha como `postSnapshotBase`, e então cada append de evento de artifact aumenta `postSnapshotEventBytes`. A verificação de budget usa `snapshotBytes + postSnapshotEventBytes`, reiniciando os contadores após um avanço bem-sucedido da baseline do snapshot. Se o writer não puder confirmar a posição base ou o estado dos contadores, ele deve escrever um novo snapshot de forma conservadora; se ainda assim não puder confirmar, deve rebaixar ou reportar erro, não pode acrescentar sem limites.
- Quando o budget se aproxima do limite, tentar primeiro escrever um novo snapshot. Se o snapshot mais recente mais os eventos pós-snapshot ainda excederem o budget, novos metadados restauráveis deixam de ser gravados, artifacts comuns são rebaixados para `ephemeral` com `persistenceWarning.code = "journal_budget_exceeded"`.
- Não gravar bytes de conteúdo no JSONL; o PR #6259 também não grava armazenamento de conteúdo de artifact gerenciado pelo daemon.

## 5. Fluxos de escrita e recuperação

### 5.1 Validação no momento do ingest

Antes que qualquer artifact entre no live store e no JSONL, deve ser feita a validação no momento do ingest; não se pode validar apenas no restore:

- `workspacePath`: deve ser caminho relativo; após resolve/realpath não pode escapar do workspace atual.
- `url`: validar scheme, userinfo, query/fragment com aparência de segredo conforme o tipo de storage.
- `managedId`: rejeitar formato de caminho, `..`, caminho absoluto, separadores.
- `published`: só pode ser produzido por um trusted publisher interno do daemon ou por um caminho validado por manifest; o client payload não pode alegar por conta própria.
- `contentRef` / `expiresAt` antigos: apenas como compatibilidade de entrada de journal legado; se aparecerem no client payload, devem ser rejeitados ou removidos (strip); o PR atual não pode gerar novos campos.
- `restoreState` / `persistenceWarning`: campos de resposta somente de runtime; se aparecerem no client payload, devem ser rejeitados ou removidos, não podem ser gravados no artifact persistido.
- `clientRetained`: só pode ser booleano, indicando a intenção de retenção do usuário e uma dica de ordenação estável, não é um sinal de autorização. Apenas ações REST/SDK/UI explícitas podem defini-lo; o ingest automático de segundo plano não pode forjar retenção do usuário.
- `metadata`: executar verificações de apenas-primitivos, limite de tamanho, chave/valor de segredo e payload de exibição inseguro.

Quando a validação falha:

- Entrada claramente maliciosa ou fora dos limites: rejeitar a requisição.
- Pode conter um locator sensível, mas o usuário ainda quer exibir o artifact ao vivo: pode ser rebaixado para `ephemeral` com `persistenceWarning.code = "validation_downgraded"`; não pode ser gravado no JSONL.

### 5.2 Fluxo de escrita do artifact

Fluxo da V1:

```text
ingest input -> normalize/validate -> upsert live store -> publish artifact_changed
```

Fluxo da V2:

```text
ingest input
  -> normalize/validate
  -> in SessionArtifactStore operationQueue: compute effective mutation
  -> for restorable changes: request chat-recording writer append
     artifact journal/snapshot on the active leaf chain
  -> apply live-store mutation
  -> publish artifact_changed with effective retention/warning fields
```

A fila de operações do `SessionArtifactStore` é responsável por serializar a ordem das mutações ao vivo, requisições de persistência e SSE da mesma sessão; o append real no JSONL ainda é feito pelo proprietário do chat recording. Se o writer de persistência não estiver disponível, artifacts comuns de tool/hook podem ser rebaixados para `ephemeral` live-only antes de entrar no live store.

Se o sticky ephemeral override suprimiu a persistência de um upsert implícito/padrão, o artifact ao vivo deve trazer `persistenceWarning.code = "sticky_override_active"`, e registrar o log estruturado `action=sticky_override_suppressed` e uma métrica de contador. Caso contrário, durante o troubleshooting veríamos uma entrada de upsert legítima sem encontrar o registro durável correspondente.

O PR atual não tem uma visão oculta paginada de metadados persistidos; a lista ao vivo é exatamente o conjunto de metadados exposto ao client após a recuperação. Portanto, o tratamento do limite adota uma estratégia estreita:

- Artifacts `ephemeral` podem ser descartados apenas da visão ao vivo, sem gravar no journal.
- Quando um artifact `restorable` é podado pelo limite, gravar um evento de remoção `reason: "eviction"`, evitando que o próximo load/replay ressuscite todos os itens podados.

### 5.3 Semântica de falha de escrita

Distinguir duas entradas:

- Artifacts comuns de tool/hook: a falha de persistência não deve fazer a chamada de ferramenta falhar; o artifact ainda pode entrar no live store, mas deve primeiro rebaixar o `retention` no live store para `ephemeral`, definir `persistenceWarning` e então publicar `artifact_changed`.
  Para mutações de remoção que afetam o resultado da recuperação, o PR atual distingue por motivo:

- `eviction`: evento de remoção durável, garantindo que o limite de 200 itens continue a ser respeitado após o reinício.
- unpin-to-`ephemeral` legado: ao ler journals antigos, continuar reconhecendo o evento de remoção durável e gravar o id no `stickyEphemeralIds` limitado; upserts implícitos/padrão subsequentes permanecem live-only, até serem suplantados por um `retention: "restorable"` explícito.
- DELETE explícito: live-first. Primeiro remove do live store e publica o evento de remoção, então grava o tombstone de remoção explícita em best-effort. Se a gravação do tombstone falhar, a resposta retorna um warning (atualmente um warning em string), indicando que a remoção não é durável; se o daemon for reiniciado antes que a gravação complementar seja bem-sucedida, o journal antigo ainda pode recuperar esse artifact.
- `deleteContent: true` não faz parte da API pública do PR #6259. Apenas o follow-up de retenção de conteúdo definirá o GC de conteúdo e o contrato de warning; o DELETE explícito do PR atual trata apenas do tombstone de metadados e da remoção ao vivo.

Warnings sugeridos:

```text
[artifacts] session=<id> action=persist_failed artifact=<id> reason=<code>
[artifacts] session=<id> action=remove_not_persisted artifact=<id>
[artifacts] session=<id> action=sticky_override_suppressed artifact=<id> prior_reason=unpin_to_ephemeral
```

### 5.4 Fluxo de recuperação

Durante o session load/replay:

1. `SessionService.loadSession()` lê o JSONL e extrai os registros de snapshot/evento de artifact na mesma passada de parse.
2. Com base na cadeia de leaf ativa, extrair o `session_artifact_snapshot` válido mais recente e os `session_artifact_event` subsequentes. Registros de artifact em branches abandonados devem ser ignorados.
3. Reconstruir o snapshot de artifact e aplicar os tombstones.
4. Reexecutar a validação de restore da V2 para cada artifact.
5. O resultado do load carrega `artifactSnapshot` de volta para a bridge do lado do daemon.
6. A bridge do daemon usa o snapshot para inicializar o `SessionArtifactStore` do lado do daemon em `createSessionEntry` / conclusão do restore.
7. `GET /session/:id/artifacts` lê exatamente esse store do lado do daemon.

Não semear o `SessionArtifactStore` nos objetos de agente/sessão do processo filho do ACP: o store visível à API HTTP de produção é criado na bridge do lado do daemon.

`loadSession()` deve ser somente leitura: não pode gravar tombstones durante o parse, nem disparar GC de conteúdo diretamente. Se após o restore o limite ao vivo atual ou a política for mais restritiva que a histórica, o store do lado do daemon, após ser criado e com o writer de persistência disponível, grava o evento de remoção `eviction` pela fila de operações normal; quando o writer não estiver disponível, apenas oculta os itens acima do limite na visão ao vivo e registra um warning, e o próximo load ainda pode rever esses registros pendentes de poda.

O tratamento do live store durante rewind/replay deve ser consistente com o load: assim que o leaf ativo muda, o flat live store não pode continuar mantendo mutações de artifact fora do branch. Se a implementação atual não tiver um resultado de replay da cadeia ativa para reseed diretamente, deve gravar um top-up do snapshot de artifact ao concluir o rewind; caso contrário, a capability de persistência não pode ser habilitada.

Os pontos de integração específicos devem ser hooks explícitos, e não reparo preguiçoso no próximo GET. Recomenda-se que a implementação de rewind/troca de leaf chame `onActiveLeafChanged(sessionId, artifactSnapshot)` da bridge do daemon, ou carregue um evento equivalente no resultado existente de session load/replay; ao receber, o store de artifact faz reseed ou grava um top-up de snapshot na mesma fila de operações da sessão.

### 5.5 Validação durante a recuperação

A recuperação deve revalidar:

- `workspacePath`: ainda deve ser caminho relativo; re-resolve/realpath/stat com base no workspace root do momento do restore, não pode escapar do workspace atual. Após a relocação do workspace, se o mesmo caminho relativo ainda existir, pode ser recuperado como `available`; se o arquivo estiver ausente ou o layout do novo workspace for inconsistente, é recuperado como `missing`. A V2 não faz remapeamento automático de caminho.
- `external_url`: permitir apenas `http:` / `https:`; rejeitar credenciais username/password; query/fragment com aparência de segredo devem ser redigidos, rebaixados para locator não-abrível, ou o artifact inteiro é rebaixado/bloqueado.
- `published`: pode recuperar o locator `file:`, mas apenas quando a revalidação do manifest do trusted publisher passar e o destino pertencer ao published storage gerenciado pelo daemon. Um `external_url` comum nunca pode passar por `file:`.
- `managedId`: rejeitar formato de caminho, `..`, caminho absoluto, separadores.
- `contentRef` antigo: validado e removido (strip) apenas como entrada de journal legado; o PR #6259 não resolve conteúdo via manifest gerenciado pelo daemon, nem expõe o `contentRef` antigo como uma promessa de conteúdo abrível.
- `metadata`: reexecutar as verificações de apenas-primitivos, limite de tamanho, chave/valor de segredo e payload de exibição inseguro.

Quando a recuperação falha:

- Falha de segurança: manter a entrada, mas com `restoreState: "blocked"`, `status: "missing"`, sem fornecer locator abrível.
- Recurso ausente: `status: "missing"`.
- Corrupção de campo não relacionada à segurança: pular esse artifact e registrar um warning.

### 5.6 Semântica de Branch / fork

O `/branch` existente copia a cadeia de registros JSONL ativa e reescreve o `sessionId`. Os registros de artifact da V2 são copiados apenas da cadeia de leaf ativa; registros de artifact que caíram em um branch abandonado após o rewind não entram no fork. Durante a cópia, o id do artifact deve ser tratado explicitamente:

- O mesmo recurso deve receber um novo id de artifact na nova sessão, porque a identidade da V1 inclui o `sessionId`.
- Ao escrever no fork da sessão de destino, o id do artifact deve ser recalculado com base no `sessionId + locator` de destino.
- Os tombstones também devem ser reescritos com o novo id da sessão de destino. Desde que o id do artifact do tombstone possa ser remapeado com segurança, ele deve ser preservado na sessão de destino, mesmo que nenhum upsert correspondente seja encontrado temporariamente na cadeia ativa de destino; um tombstone órfão é inofensivo quando não há upsert correspondente, mas descartá-lo pode fazer com que um upsert posterior do mesmo id perca a supressão.
- `forkedFrom` pode registrar o id da sessão original / id do artifact original, como informação de auditoria, mas não pode participar das decisões de permissão da nova sessão.
- Quando o fork herda metadados de artifact `pinned` antigos, ele deve rebaixar para `restorable` e remover o `contentRef` antigo.
- A cópia do fork deve reexecutar a validação de ingest/restore, a minimização de privacidade e a redação. Locators em workspace / url / metadata que não podem ser expressos com segurança na sessão de destino devem ser rebaixados, removidos ou descartados; não podem ser copiados diretamente só porque a sessão de origem passou na validação.
- `managedId` não pode ser copiado cegamente da sessão de origem. Se na sessão de destino um novo `managedId` puder ser derivado do workspace de destino / manifest gerenciado pelo daemon, ele deve ser recalculado; se não puder ser derivado com segurança, o `managedId` deve ser removido ou esse metadado de artifact deve ser descartado.

O remap de fork é um critério de lançamento: se algum caminho não puder reescrever com segurança o id do artifact e os tombstones, os registros de persistência de artifact devem ser descartados no fork; o id do artifact da sessão de origem não pode ser levado para a nova sessão como está. Se a implementação atual de fork tiver um mecanismo de top-up semelhante a `file_history_snapshot`, o artifact só pode gerar o top-up a partir do resultado do replay da cadeia ativa, não pode ser complementado como está a partir do live store atual do daemon; caso contrário, levaria para a nova sessão artifacts que, após o rewind, não pertencem mais ao histórico.

A implementação atual de fork não faz append um a um, mas primeiro gera a lista completa de registros de destino a partir da cadeia ativa da origem e depois escreve no arquivo JSONL de destino com criação exclusiva; se a gravação falhar, o arquivo da sessão de destino não é usado como um fork bem-sucedido. Portanto, o PR atual não grava `session_artifact_fork_marker`. Se no futuro o fork se tornar streaming append ou cópia em lote entre processos, serão introduzidos marcadores begin/complete, verificação de contagem e regras de recuperação `fork_incomplete`.

A semântica de rewind do fork tem escopo de branch: a sessão de destino copia apenas o resultado da cadeia ativa atual. Se o usuário fizer rewind para antes de um DELETE explícito e então fizer fork, esse tombstone de DELETE não está na cadeia ativa, e o reaparecimento do artifact no novo branch é o comportamento esperado de branch histórico. Se o produto precisar de "exclusão por rewind globalmente irrevogável" ou semântica de apagamento de privacidade, isso deve ser um design de política separado, não pode ser misturado ao modelo de branch padrão da V2.

A amplificação de fork de metadados é aceita na V2 como um trade-off limitado: o fork requer permissão de mutação de sessão, cada fork ainda está sujeito ao limite de 200 metadados persistidos, cada registro de metadados é pequeno e não herda bytes de conteúdo. A V2 não introduz quota de metadados no nível de projeto; a implementação deve registrar uma métrica/log da contagem de artifacts bifurcados, e só introduzir um limite no nível de projeto se houver abuso real.

## 6. Design da API

### 6.1 Capability

`GET /capabilities` adiciona:

```json
"session_artifacts_persistence"
```

Somente quando a implementação do PR dividido de retenção de conteúdo estiver disponível, declarar também:

```json
"session_artifacts_content_retention"
```

Atualmente, `/capabilities` é uma lista de features em string, portanto não é possível expressar "implementação existe, mas atualmente desligada" com `enabled: false`. As regras são:

- Declarar a feature string correspondente somente quando o comportamento estiver disponível e habilitado na configuração atual.
- Quando o chat recording estiver desabilitado, a persistência de metadados desabilitada ou o writer indisponível, não declarar `session_artifacts_persistence`.
- Somente quando o salvamento explícito de conteúdo de workspace, quota, manifest e GC/fsck com escopo de sessão do futuro content archive estiverem todos disponíveis, declarar `session_artifacts_content_retention`. O PR #6259 não declara essa capability.
- Se o client precisar ler limites/retention padrão, um endpoint de configuração ou uma consulta de configuração do SDK deve ser projetado separadamente; não misturar detalhes estruturados no contrato de capability existente, que é apenas string.

### 6.2 Adicionar artifact

`POST /session/:id/artifacts` permite opcionalmente:

```json
{
  "title": "Report",
  "kind": "html",
  "storage": "workspace",
  "workspacePath": "reports/run.html",
  "retention": "restorable",
  "clientRetained": true
}
```

Restrições:

- O client pode solicitar `ephemeral` ou `restorable`.
- O client não pode solicitar `pinned`.
- `clientRetained` é opcional, indicando apenas a intenção de retenção do usuário e uma dica de ordenação; o servidor deve validar a origem conforme a §5.1 e não pode tratá-lo como autorização.

### 6.3 Pin/save de artifact

O PR #6259 não expõe um endpoint de pin/save. Arquivamento explícito de conteúdo, content archive e pin/save pertencem ao futuro design de content archive.

### 6.4 Unpin

O PR #6259 não expõe um endpoint de unpin, nem gera novos tombstones de unpin. O `reason: "unpin_to_ephemeral"` de journals antigos continua sendo reproduzido apenas como entrada de compatibilidade, evitando mudanças na semântica de recuperação do histórico. Para remover da lista, ainda se usa o DELETE da V1.

### 6.5 Excluir artifact

O DELETE da V2 mantém a idempotência da V1 e adota a semântica live-first do PR atual:

- Primeiro remove o artifact do live store, mantendo a remoção visível ao usuário com efeito imediato.
- Em seguida, acrescenta o tombstone de remoção `session_artifact_event` em best-effort; após o tombstone ser bem-sucedido, o metadata restore não o ressuscita mais.
- Se o tombstone falhar, retorna um mutation result de sucesso, mas com um warning; o artifact já foi removido dentro do ciclo de vida atual do daemon, mas se o daemon for reiniciado antes que o tombstone seja persistido, o artifact durável antigo ainda pode ser recuperado. O usuário ou a UI superior pode tentar o DELETE novamente após a recuperação do storage.
- O DELETE mantém sucesso idempotente para artifacts inexistentes; se já houver um tombstone durável, DELETEs repetidos não precisam gravar o mesmo tombstone novamente.
- O DELETE do PR #6259 não aceita `deleteContent` e não dispara o GC de conteúdo gerenciado pelo daemon; os metadados antigos de `contentRef` são apenas rebaixados ou removidos durante restore/serialização.

### 6.6 Respostas de mutação

O PR #6259 entrega apenas a resposta de mutação do DELETE.

Sucesso:

- DELETE: `200 OK` retorna `{ "deleted": true, "artifactId": string, "warnings"?: [...] }`.
- Quando a persistência do tombstone do DELETE falha, ainda retorna um mutation result `200 OK` e inclui o motivo da falha de persistência em `warnings`; a implementação atual usa um warning em string, por exemplo, `remove_not_persisted`. Isso indica que o delete ao vivo teve efeito, mas não é garantido entre reinícios, e não deve ser exibido como sucesso de delete durável.

Falha:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "retention must be ephemeral or restorable"
  }
}
```

HTTP mapping do PR #6259:

- `400 VALIDATION_FAILED`: corpo inválido, client solicitando `pinned`, artifact inexistente, quota de metadados cheia sem candidato podável, ou writer indisponível mas a mutação deve ser concluída como estritamente durável.
- `403 FORBIDDEN`: falta de permissão de mutação de sessão.
- O DELETE permanece idempotente; um artifact inexistente retorna um mutation result vazio em vez de erro.
- A falha de persistência do tombstone do DELETE retorna `200 OK` + warning, porque o delete ao vivo atual teve efeito, mas não é garantido entre reinícios.

Códigos de erro HTTP mais refinados `INVALID_ARGUMENT`, `NOT_FOUND`, `CONFLICT`, `METADATA_QUOTA_EXCEEDED`, `QUOTA_EXCEEDED` ou `PERSISTENCE_UNAVAILABLE` são polimento posterior da API e não fazem parte do wire contract do PR atual.

## 7. Design de segurança

### 7.1 Princípios de autorização

Não tratar o `clientId` público como limite de autorização. O limite real de confiança HTTP da V2 ainda é o token bearer do daemon + permissão de leitura/mutação no nível da rota; sob o modelo de autenticação existente, `session_owner` não pode ser emitido com segurança nem persistido entre reinícios do daemon. Portanto, a V2 não introduz um nível de proprietário mais forte que o portador do token.

O principal interno é usado apenas para auditoria, política padrão e prevenção de falsificação de payload; não é uma fonte durável de autorização:

```ts
type ArtifactPrincipal =
  | { kind: 'token_holder' }
  | { kind: 'client_connection'; id: string }
  | { kind: 'trusted_publisher'; id: string }
  | { kind: 'hook'; extensionId: string };
```

Regras de autorização:

- list: requer permissão de leitura de sessão.
- add ephemeral/restorable: requer permissão de mutação de sessão.
- delete metadata: requer permissão de mutação de sessão. O guarda de exclusão por mesmo principal da V1 só pode servir como guarda de UX de processo ao vivo e dica de auditoria; ele depende do contexto de conexão atual e não pode provar o proprietário do artifact entre reinícios do daemon. Após o restore, a propriedade não pode ser forjada a partir do `clientId` público; a autorização de exclusão degenera para a permissão de mutação no nível da sessão e registra uma auditoria `ownership_unverified`.
- content archive / delete content: não habilitado no PR atual. Se no futuro o content archive for retomado, são necessários permissão de mutação de sessão, capability independente, chamada REST/SDK explícita, e correspondência de principal criador verificável no processo atual ou uma política explícita de override/admin; sessões de segundo plano/hook não podem iniciar diretamente a exclusão de conteúdo.

Se no futuro um `session_owner` real for necessário, uma capability ou ACL durável por sessão deve ser projetada primeiro; isso não pode ser assumido implicitamente neste documento da V2.

### 7.2 Limites do futuro content archive

Esta seção é o blueprint do futuro content archive e não faz parte do escopo de implementação ou aceitação do PR #6259.

Não copiar por padrão:

- Conteúdo de URL externa
- Arquivos arbitrários de workspace
- Links comuns do assistant

Se no futuro o content archive for habilitado, as origens que podem ser consideradas permitidas:

- Artifacts `published` gerados por `ArtifactTool` / publisher confiáveis.
- Artifacts de workspace explicitamente fixados pelo usuário, desde que o arquivo esteja no workspace e o tipo/tamanho seja controlável.
- Artifacts gerenciados enviados ou registrados pelo client, desde que recebidos e validados via API do daemon.

O armazenamento de artifact gerenciado pelo daemon deve ter um root explícito:

- O content root de `managed_copy` fica na área de conteúdo de artifact sob o diretório de dados do daemon, por exemplo, `<daemonDataDir>/artifacts/content/`.
- O file root de `published` fica na área de artifacts publicados sob o diretório de dados do daemon, por exemplo, `<daemonDataDir>/artifacts/published/`, ou em um root equivalente de propriedade do daemon declarado na configuração; o id do root deve ser gravado no manifest do publisher.
- O JSONL não pode salvar caminhos absolutos do host diretamente confiáveis. No restore, apenas o id do root e o locator relativo do manifest podem ser lidos; após resolve/realpath, ainda deve estar dentro do root correspondente, e escape de symlink/caminho deve ser rejeitado.
- O manifest do trusted publisher deve registrar pelo menos o id do publisher, id do artifact, id do root de storage, caminho relativo ou id do conteúdo, sha256, sizeBytes e createdAt. O locator `file:` só pode ser regenerado a partir desse manifest, não pode vir do client payload ou de campos antigos do JSONL.

A cópia de conteúdo deve ser segura contra corrida:

- A verificação de contenção de workspace passa.
- Apenas arquivos regulares são permitidos; rejeitar diretórios, FIFOs, devices, sockets e outros arquivos especiais.
- Usar semântica no-follow ao abrir o arquivo; no Linux, usar `openat2(RESOLVE_NO_SYMLINKS)`; em outras plataformas, usar a combinação disponível de no-follow/revalidação de handle aberto.
- Após abrir, executar fstat/revalidação no handle do arquivo, confirmando que ainda é um arquivo regular e ainda está dentro da contenção do workspace.
- Rejeitar hardlinks com contagem de links anômala, a menos que haja posteriormente uma allowlist explícita.
- Durante a leitura, impor um máximo de bytes por stream; não confiar primeiro no size do stat.
- Fazer o hash exatamente dos bytes copiados e salvar sha256, size, mimeType.
- Revalidar o manifest/hash antes de abrir/baixar o conteúdo retido.

### 7.3 Privacidade e informações sensíveis

A minimização deve ser feita antes da persistência:

- Não salvar caminhos absolutos do host.
- Não salvar username/password de URL.
- Query/fragment de URL externa com aparência de segredo devem ser rejeitados, redigidos, ou o artifact rebaixado para `ephemeral` / locator não-abrível; não podem ser gravados como estão no JSONL.
- A metadata usa allowlist ou uma denylist de chaves de segredo; chave/valor como `token`, `password`, `secret`, `cookie`, `authorization` devem ser rejeitados, redigidos ou rebaixados para `ephemeral`.
- A metadata ainda é limitada a 4 KB.
- title/description/metadata continuam a executar as verificações de payload de exibição inseguro.
- Mesmo `persistenceWarning.message` sendo apenas um campo de resposta ao vivo, ele deve usar um modelo sem caminho ou texto dessensibilizado; caminhos do host, credenciais, tokens, content root e ids de conexão não podem ser gravados no warning.

Configurações que podem ser adicionadas posteriormente:

```json
{
  "sessionArtifacts": {
    "persistence": {
      "enabled": true,
      "defaultRetention": "restorable",
      "maxLiveArtifacts": 200,
      "maxPersistedMetadata": 200,
      "snapshotThresholdMutations": 100,
      "snapshotThresholdBytes": 262144,
      "contentRetention": {
        "enabled": false,
        "maxArtifactBytes": 52428800,
        "maxTotalBytes": 268435456,
        "maxTtlDays": 365,
        "ttlScanIntervalSeconds": 900
      }
    }
  }
}
```

O PR atual não adiciona um schema de configuração de operador; os valores acima são lançados como constantes de código e a disponibilidade do comportamento é expressa via capability. Expor esses valores como ajustes de operador é um aprimoramento posterior, e o client não deve inferir detalhes de configuração a partir da string de capability.

## 8. Quotas, GC e estabilidade

### 8.1 Quota de metadados

Padrões sugeridos:

- O limite do live store permanece 200.
- O limite de metadados persistidos é 200 por sessão, alinhado com o live store.
- O registro de snapshot retém no máximo 200 artifacts atualmente válidos.

O limite do live store também é, na implementação atual, o limite do conjunto visível do restore:

- A eviction ao vivo da V2 deve eliminar primeiro os artifacts `ephemeral`.
- Se for necessário escolher a visão ao vivo entre artifacts duráveis, a implementação atual faz uma seleção determinística por reserva de origem, origem, status, retention, clientRetained e ordem de inserção.
- Quando um artifact durável é eliminado pelo limite ao vivo, a implementação atual grava um evento de remoção `reason: "eviction"`, garantindo que o próximo restore não ressuscite repetidamente itens já eliminados pelo daemon.
- `clientRetained` é a intenção de retenção do usuário, entra em `PersistedSessionArtifact` e é usada para ordenação estável após o restore e seleção do limite ao vivo; é uma proteção de ordenação, não uma proteção absoluta.

Acima do limite de metadados persistidos:

- `ephemeral` por natureza não é gravado no journal, não conta para a quota de metadados persistidos, sujeito apenas ao limite do live store.
- `restorable` deve ser podado em ordem determinística com a gravação de um evento de remoção `eviction`: primeiro podar os artifacts `restorable` sem `clientRetained`; se ainda não houver espaço, podar os artifacts `restorable` com `clientRetained`. `clientRetained` é proteção de ordenação, não proteção absoluta.

O seed do restore não pode exceder o limite do live store; se o histórico tiver mais artifacts persistidos válidos que o limite ao vivo atual, o store do lado do daemon semeia o subconjunto visível pelas mesmas regras determinísticas e, pela fila de operações, grava um evento de remoção `eviction` para os itens duráveis podados. O processo de parse de `loadSession()` em si permanece somente leitura e não pode gravar diretamente um prune durável.

### 8.2 Quota de conteúdo

Esta seção é o escopo de implementação do futuro PR de retenção de conteúdo; o PR #6259 não introduz quota de content store.

Padrões sugeridos para o futuro PR dividido:

- Artifact único: 50 MB.
- Total do content store: 256 MB.

Ao atingir o limite:

- Um novo pin/save retorna `QUOTA_EXCEEDED`.
- Não excluir automaticamente o conteúdo fixado ainda referenciado por artifacts ao vivo da sessão atual.
- O fork não herda o contentRef fixado, evitando que o fork contorne a quota.

### 8.3 GC

Esta seção é o escopo de implementação do futuro PR de retenção de conteúdo. O GC trata apenas das managed copies com escopo de sessão gerenciadas pelo daemon:

- O manifest de conteúdo salva `sessionId` e `artifactId`; o GC exclui apenas o conteúdo cujo manifest pertence à sessão atual e não está no conjunto atual de referências ao vivo `contentRefs()`.
- `pinWorkspaceFile()`, GC e limpeza de tmp são serializados pela mesma fila de escrita e usam um lease em andamento para evitar que pin/GC concorrentes removam conteúdo recém-copiado, mas ainda não registrado no journal.
- A expiração de `expiresAt` é feita por um prune leve antes de `GET /artifacts`, rebaixando o artifact fixado para `restorable`, removendo o `contentRef` e então disparando o GC.
- close / exclusão explícita / unpin / endpoint explícito de GC fazem uma varredura em best-effort; falhas de GC não bloqueiam o fluxo de prompt/ferramenta.

Disparadores de GC:

- Exclusão de artifact, unpin, verificação de expiração de TTL, fechamento de sessão ou `POST /session/:id/artifacts/gc` explícito.
- Entradas `.tmp` obsoletas são limpas durante o GC.

Reconstrução de referência com escopo de projeto, rastreamento de varredura incompleta, período de tolerância para órfãos e biblioteca global de artifacts são todos aprimoramentos posteriores. Os limites de segurança do futuro content archive devem vir de "não herdar contentRef entre sessões" e "excluir apenas o conteúdo do manifest da sessão atual que não é referenciado pelas referências ao vivo atuais".

### 8.4 Consistência em caso de crash

Requisitos:

- Mutações do store de artifact seriais.
- A falha de append no journal JSONL não corrompe o live store.
- DELETE explícito live-first: a remoção do live store não deve ser bloqueada pela falha do journal; o warning na resposta informa aos clients quando o tombstone não foi durável.
- O DELETE explícito com `deleteContent: true` só está disponível no follow-up de retenção de conteúdo; esse PR deve executar o GC de conteúdo com escopo de sessão em best-effort após a remoção ao vivo e expor os warnings de exclusão de conteúdo.
- A eviction por limite ao vivo de artifacts duráveis grava um evento de remoção `eviction` para que o restore respeite o limite.
- O reader tolera JSONL pela metade e registros de artifact corrompidos.
- Quando a ordem de tombstone/snapshot é anômala, optar por não recuperar, em vez de adivinhar.

Ordem de escrita do futuro content archive:

1. Copiar o conteúdo para um staging path, fazer o hash exatamente dos bytes copiados e fazer fsync dos bytes.
2. Mover atomicamente para o content root gerenciado pelo daemon, gravar e fazer fsync do manifest de conteúdo.
3. Acrescentar o evento de journal de artifact, referenciando esse contentRef, e fazer fsync do JSONL.
4. Atualizar o live store e publicar `artifact_changed`.

Se o passo 2 for bem-sucedido, mas houver crash antes do passo 3, restará um conteúdo órfão sem referência no journal; isso é permitido, e o futuro GC com escopo de sessão o remove em best-effort após confirmar que o manifest não é referenciado pelas referências ao vivo atuais. Se o passo 3 for bem-sucedido, o restore deve ser capaz de encontrar o conteúdo pelo manifest. A API explícita só pode retornar sucesso após o passo 3 ser bem-sucedido.

### 8.5 Custo de leitura de arquivos, CPU e E/S

A V2 deve evitar que a recuperação de artifacts se torne um novo gargalo do session load.

Caminho de leitura sugerido:

1. Quando `SessionService.loadSession()` já lê o JSONL, extrair os registros de artifact na mesma passada de parse.
2. Encontrar o `session_artifact_snapshot` válido mais recente e reproduzir apenas os eventos de artifact subsequentes.
3. Sem um snapshot válido, é permitida uma única varredura sequencial dos registros de artifact, mas o mesmo arquivo não pode ser varrido repetidamente dentro do fluxo de load.

Limites de custo de CPU:

- O restore de metadados faz apenas parse de JSON e validação de campos, complexidade O(número de artifacts + número de eventos após o snapshot mais recente).
- A recuperação de `external_url` não faz requisições de rede.
- O load/replay de `workspace` recupera apenas os metadados; o refresh de GET/list refaz o stat de um arquivo ou lote de arquivos de workspace sob limites de TTL/lote e só faz o hash quando necessário, para distinguir `available` / `missing` / `changed`.
- A recuperação de `managed` / `published` consulta apenas o manifest, não lê o conteúdo de arquivos grandes.
- O hash do conteúdo de workspace não é executado por completo na fase de parse do JSONL de `loadSession()`. O refresh de GET/list primeiro usa um stat gate barato com size + mtimeMs; apenas quando o stat indica uma possível reescrita com o mesmo tamanho é que o stream do arquivo é lido para calcular o sha256.

Limites de custo de E/S:

- A V2 não lê arquivos sidecar extras.
- A validação de estado de workspace reutiliza a estratégia de TTL/lote da V1, não faz stat ilimitado de todos os artifacts no caminho quente do GET.
- Para arquivos grandes de workspace, o conteúdo não é lido na fase de recuperação; no registro, o stream do arquivo em tempo real é lido para calcular o sha256, e o refresh subsequente só relê o stream do arquivo quando size/mtimeMs indicarem possível alteração, sem copiar para o armazenamento gerenciado pelo daemon.

Padrões recomendados:

- Limite do snapshot de artifact de 200 itens.
- Tamanho de lote do restore de estado de workspace 20, consistente com a V1.
- Limiar do snapshot do journal de artifact de 100 mutações ou 256 KB.
- O sha256 de workspace é concluído sincronamente no registro; a validação de estado após a recuperação é feita por refresh preguiçoso via TTL/lote, e size + mtimeMs são usados para evitar refazer o hash completo de arquivos inalterados.

### 8.6 Observabilidade

Os novos caminhos de falha da V2 devem ter logs estruturados, seguindo o formato:

```text
[artifacts] session=<id> action=<action> key=value
```

Ações sugeridas:

- `persist_failed`
- `retention_downgraded`
- `restore_skipped`
- `restore_blocked`
- `remove_not_persisted`
- `eviction`
- `fork_artifact_discarded`
- `fork_incomplete`
- `snapshot_invalid`
- `sticky_override_suppressed`
- `tombstone_conflict`
- `v2_writer_version_gate_failed`

O futuro checker / content archive pode adicionar ações relacionadas a fsck, cópia de conteúdo, TTL e GC; o PR #6259 não gera esses logs.

Esses logs não substituem o `persistenceWarning` na API/SSE, são usados para troubleshooting em produção.

Métricas sugeridas:

- contador: `artifact_journal_append_total{result,reason}`
- contador: `artifact_restore_total{result,restore_state}`
- gauge: `artifact_pending_tombstone_count`
- gauge: `artifact_metadata_quota_used{session}`
- contador: `artifact_sticky_override_suppressed_total`

O mecanismo de exportação segue a telemetria/métricas existente do daemon; se não houver um endpoint Prometheus atualmente, pelo menos devem entrar no sink de telemetria estruturada e poder ser agregados por sessão/projeto.

Ferramentas de diagnóstico são aprimoramentos posteriores e não fazem parte do wire contract do PR #6259. Um checker apenas de metadados pode varrer o journal/snapshot/tombstone de artifact e falhas de validação de restore; um checker de conteúdo completo aguardará o redesign do futuro content archive e então varrerá os manifests de conteúdo e o armazenamento gerenciado pelo daemon. No futuro, a CLI ou uma API interna do daemon (por exemplo, `qwen artifact fsck`) deve suportar dry-run:

- O modo apenas-metadados reporta inconsistências de snapshot/tombstone e falhas de validação de restore.
- O modo de conteúdo completo reporta `contentRef` pendurados, manifest ausente e conteúdo órfão.
- Por padrão, somente leitura; o modo de reparo só pode executar ações seguras verificáveis, como regenerar um snapshot ou marcar conteúdo órfão aguardando GC.

## 9. Plano de implementação

A seguir estão os marcos de implementação dentro da mesma fase de design da V2. Em termos de engenharia, podem ser divididos em PRs; externamente, a capability declara as capacidades realmente disponíveis.

### Marco A: Tipos e serviço de persistência

- Adicionar reader/writer de persistência de artifact:
  - O writer fica no lado do proprietário do chat recording, ou é exposto por esse lado via RPC explícito; ele é responsável por acrescentar registros de evento/snapshot à cadeia de leaf ativa.
  - O reader fica no caminho de parse/replay de `SessionService.loadSession()`, responsável por reconstruir o snapshot de artifact a partir da cadeia de leaf ativa.
  - Compartilham validação de restore, verificações de consistência de snapshot/tombstone e normalização do formato persistido.
- Estender o union de `ChatRecord.subtype` e `systemPayload`.
- Adicionar `artifactSnapshot?` ao resultado do load.
- O checker apenas de metadados é um aprimoramento posterior, podendo detectar em dry-run registros de artifact corrompidos, inconsistências de snapshot/tombstone e falhas de validação de restore.

### Marco B: Integração do store do lado do daemon

- O `createSessionEntry` da bridge do daemon suporta semear artifacts.
- O `SessionArtifactStore` suporta semear artifacts.
- `upsertMany()` calcula na fila de operações o `retention` efetivo, o prune de quota e a visão ao vivo, e então acrescenta os registros duráveis via writer.
- `remove()` distingue DELETE explícito de eviction; o DELETE explícito é live-first e grava o tombstone em best-effort, a eviction durável grava no journal. O `unpin_to_ephemeral` antigo é mantido apenas como compatibilidade no replay do journal / estado sticky do snapshot.
- O snapshot de backfill quando uma live session da V1 habilita a V2 pela primeira vez não está no escopo de implementação do PR atual; a implementação atual recupera a partir de journal/snapshot V2 recém-gravados.
- Manter o formato do evento `artifact_changed` da V1 inalterado, apenas adicionando campos opcionais.

### Marco C: Integração de load/replay

- `SessionService.loadSession()` extrai registros de snapshot/evento de artifact da cadeia de leaf ativa, ignorando branches abandonados.
- O resultado do load entrega o snapshot à bridge do daemon, em vez de semear o store no processo filho do ACP.
- O prune acima do limite durante o restore só pode ser gravado após o store do lado do daemon ser criado e o writer estar disponível; o processo de parse do load permanece somente leitura.
- Após rewind/troca de leaf, o live store do lado do daemon é realinhado ao resultado do replay da cadeia ativa, ou o estado atual da cadeia sobrevivente é solidificado por um top-up do snapshot de artifact.
- rewind/troca de leaf deve chamar um hook explícito, por exemplo, `onActiveLeafChanged(sessionId, artifactSnapshot)`, para que o store do lado do daemon complete o reseed/top-up na fila de operações.
- Ao reproduzir o histórico, artifacts com a mesma identidade não são criados duplicados.
- `/branch` copia registros de artifact da cadeia ativa e remapeia o id da sessão/id do artifact; o caminho atual de escrita com criação exclusiva de arquivo completo não requer marcador de fork.

### Marco D: REST/SDK

- Os tipos do SDK adicionam campos opcionais.
- `POST /session/:id/artifacts` suporta `retention: "ephemeral" | "restorable"`.
- `POST /session/:id/artifacts` suporta a dica booleana `clientRetained` e rejeita campos de runtime exclusivos do daemon fornecidos pelo client.
- A capability controla a UI por gate.

### Marco E: Futuro content archive

Não faz parte do PR #6259. Se no futuro houver necessidade de auditoria/arquivamento, é necessário projetar separadamente o manifest de conteúdo de workspace gerenciado pelo daemon, quota, cópia segura contra corrida, verificação de hash, GC/fsck protegido por fila de escrita/lease e vinculação de conteúdo de artifact publicado.

## 10. Plano de testes

O PR #6259 deve cobrir atualmente:

- Após o append no journal de metadados, o reinício/load do daemon recupera a lista de artifacts.
- O append no journal de artifact é feito pelo proprietário do chat recording na cadeia de leaf ativa; o store do lado do daemon não pode escrever diretamente no JSONL.
- Após o `/rewind`, upserts/remoções de artifact em branches abandonados não participam da recuperação nem são copiados no fork.
- Após o `/rewind`, o live store é imediatamente alinhado ao estado de artifact da cadeia ativa; não espera o reinício do daemon para mudar a lista de artifacts.
- O snapshot de backfill ao atualizar uma live session da V1 para a V2 é um aprimoramento posterior; os testes do PR atual devem confirmar que live artifacts antigos não gravados no journal V2 não são reportados incorretamente como recuperáveis.
- Após o tombstone do DELETE, o load não ressuscita o artifact.
- Após o replay do tombstone legado `unpin_to_ephemeral`, o load não ressuscita o artifact.
- Após o `unpin_to_ephemeral` legado, um re-upsert implícito/padrão do mesmo artifact id ainda permanece live-only; um `restorable` explícito pode suplantar o sticky override.
- Após o avanço da baseline do snapshot, `stickyEphemeralIds` ainda mantém um re-upsert implícito/padrão como live-only e produz o log/métrica/warning `sticky_override_suppressed`.
- Quando `stickyEphemeralIds` atinge o limite, o unpin-to-ephemeral legado retorna erro ou adia a tentativa, e o sticky override antigo não é perdido silenciosamente.
- DELETE explícito live-first: a visão ao vivo é removida imediatamente; quando a gravação do tombstone falha, a resposta traz um warning, e os testes cobrem que a remoção ao vivo não é bloqueada pela falha de persistência.
- A eviction de artifact durável grava um evento de remoção `eviction`; após o restore, não excede o limite ao vivo.
- Avanço da baseline do snapshot: o snapshot periódico compacta a lista atual de artifacts, os tombstones explícitos não crescem mais sem limites após o sucesso do snapshot, e `stickyEphemeralIds` preserva o estado sticky.
- Estados de arquivo presente/ausente/escape de symlink no ingest e restore do artifact de workspace.
- Relocação do workspace root: se o mesmo caminho relativo existir, recuperar como available; se ausente ou com layout inconsistente, recuperar como missing; sem remapeamento de caminho.
- A URL externa recupera apenas os metadados, sem requisições de rede.
- Query/fragment de URL com segredo e chave/valor de metadata não são gravados no JSONL.
- O `file:` local publicado só é recuperado quando a revalidação do manifest confiável passa.
- `managedId` rejeita separadores, `..`, caminho absoluto e formato de caminho no ingest, restore e remap de fork; o fork não pode copiar cegamente o `managedId` da sessão de origem.
- Registros JSONL corrompidos são pulados sem afetar os demais artifacts.
- Quando o chat recording / persistência está desabilitado, o restore de metadados não é declarado nem habilitado.
- Quando a persistência de um artifact de ferramenta falha, ele é rebaixado para live-only e tornado visível ao client via `persistenceWarning`.
- O tratamento de sessionId/id dos registros de artifact durante branch/fork, usando apenas o resultado do replay da cadeia ativa.
- Escrita de arquivo completo do fork: após o remap da cadeia ativa, criação exclusiva no JSONL de destino; a falha não produz um fork bem-sucedido; se no futuro for fork streaming, adicionar testes de marcador begin/complete.
- Quando o fork/restore lê um artifact `pinned` antigo, ele é rebaixado para restorable e não herda o contentRef.
- Tombstones órfãos são preservados e remapeados com segurança no remap de fork; apenas tombstones que não podem ser remapeados com segurança são descartados.
- O remap de fork reexecuta a validação, a minimização de privacidade e a redação; locators inseguros são removidos, rebaixados ou descartados.
- O seed do restore é serializado com o POST concorrente, sem perder escritas nem duplicar.
- Limites de quota: 200 itens, poda de 201, duas camadas de ordenação clientRetained/non-clientRetained, todos os restorable clientRetained ainda podem ser podados por regras determinísticas.
- Setter de clientRetained: a requisição de Adicionar artifact pode definir a dica booleana; o ingest automático de segundo plano não pode forjar retenção do usuário.
- Três estados de workspace: no registro, gravar size + `metadata["qwen.workspace.sha256"]` + `metadata["qwen.workspace.mtimeMs"]`; o refresh de GET/list distingue `available`, `missing` e `changed`, e arquivos inalterados usam apenas o caminho rápido de stat.
- Autorização: casos permitidos e negados do caminho de auditoria token-holder/principal; o guarda ao vivo por mesmo principal da V1 serve apenas como dica de UX/auditoria ao vivo, não como limite durável de segurança.
- Avanço da baseline do snapshot do JSONL: disparo por limiar, replay pós-snapshot limitado, o payload do snapshot não carrega mais tombstones explícitos já cobertos, um tombstone sticky suplantado permite o reaparecimento explícito do mesmo id, `stickyEphemeralIds` preserva o estado sticky; o próprio arquivo JSONL não é reescrito pelo subsistema de artifact.
- Fallback de snapshot mais recente corrompido: retroceder para um snapshot válido mais antigo ou para um único replay sequencial de artifact.
- Padrões de retention: artifact de ferramenta sem retention explícito, `pinned` em client POST é rejeitado.
- Capability: a lista de strings é declarada apenas quando o comportamento está atualmente disponível; não depende de detalhes `enabled:false`.
- Idempotência de replay: reproduzir o mesmo histórico de sessão duas vezes não duplica artifacts.
- O client antigo do SDK ainda consegue exibir os artifacts da V1 após ignorar os campos opcionais.
- Compatibilidade de rollback V2 -> V1: o daemon antigo deve conseguir fazer parse ou ignorar o subtipo `system` desconhecido, sem causar crash no session load; após o rollback, a não recuperação da persistência de artifact é uma degradação aceitável. Se a versão mínima suportada atual não puder garantir isso, o writer da V2 deve ser controlado por gate de capability para uma versão posterior àquela que suporta registros de sistema desconhecidos.
- Preflight de rollback: a versão mínima suportada do daemon antigo carrega o JSONL contendo eventos/snapshots da V2; se no futuro forem adicionados marcadores de fork, a fixture de rollback é estendida.
- O PR #6259 cobre o contrato de resposta da API de metadados: corpo de sucesso do delete, falha de validação de quota de metadados, warning `remove_not_persisted` / `persistence_unavailable`, mapeamento atual 400/403/200+warning.

O futuro content archive / checker cobre separadamente:

- `deleteContent: true` expõe o warning `content_delete_preserved` quando o tombstone/GC de conteúdo tem riscos.
- Ao fazer pin/save de conteúdo, rejeitar symlink, arquivo especial, stream acima do tamanho, hardlink anômalo e troca TOCTOU.
- Dry-run do checker apenas-metadados: registro corrompido, fallback de snapshot, tombstone órfão, falha de validação de restore.
- Dry-run do checker de conteúdo completo: `contentRef` pendurado, manifest ausente, conteúdo órfão e estratégia de reparo de GC.

## 11. O que não é recomendado fazer na V2

- Buscar automaticamente links comuns de markdown.
- Varrer automaticamente alterações de arquivos de workspace.
- Copiar por padrão todo o conteúdo de artifacts de workspace.
- Fazer polling de alcançabilidade em URLs externas.
- Usar `clientId` como credencial de autorização de exclusão.
- Fazer remapeamento automático de caminho para workspaces relocados.
- Fazer muitas validações de fs/rede no caminho quente do GET.
- Transformar falha de persistência em falha comum de turno de ferramenta.
- Introduzir cache sidecar sem medição que prove a necessidade.

## 12. Postura de lançamento recomendada

Recomenda-se lançar a V2 como uma fase de design completa, mas as capacidades são expostas por capability:

- `session_artifacts_persistence` pode lançar primeiro o restore de metadados.
- `session_artifacts_content_retention` não é lançada atualmente; o futuro content archive precisa ser redesenhado e declarado com capability independente.
- Por padrão, recupera os metadados de artifacts registrados explicitamente.
- Artifacts registrados manualmente pelo usuário são `restorable` por padrão e continuam a aparecer na lista após session load/replay.
- A documentação do usuário deixa claro: o restore de metadados recupera o "índice de produtos", não o "backup de conteúdo dos produtos"; o estado `changed` de workspace apenas indica que o arquivo em tempo real e o size registrado são inconsistentes, ou que o hash é inconsistente após a mudança de mtime.

Procedimento de rollback:

- Os registros da V2 permanecem no JSONL do chat, não são excluídos no rollback; quando o daemon antigo consegue ignorar o subtipo `system` desconhecido, o session load deve continuar funcionando, mas sem recuperar a persistência de artifact.
- O armazenamento de conteúdo gerenciado pelo daemon não faz parte do PR #6259; o futuro PR de retenção de conteúdo precisa definir separadamente o fluxo de limpeza dos bytes retidos após o rollback.
- Se a versão antiga mínima suportada atual não puder ignorar com segurança os registros de sistema da V2, o writer deve ser controlado por gate de capability para uma versão segura posterior, ou um guarda de migração deve ser fornecido antes do upgrade, impedindo a gravação de registros da V2.
- Antes do lançamento, o CI deve carregar com a versão mínima suportada do daemon antigo um JSONL contendo `session_artifact_event` e `session_artifact_snapshot`, e afirmar que o session load tem sucesso e que o subtipo desconhecido é ignorado. Antes da primeira inicialização do writer da V2, o gate de versão/feature também deve ser verificado; em caso de falha, recusar a gravação de registros da V2, registrar `v2_writer_version_gate_failed` e manter o comportamento da V1. Se no futuro forem adicionados marcadores de fork, esse subtipo deve ser incluído na fixture de rollback.
- Após o rollback, o client não pode depender de `session_artifacts_persistence` / `session_artifacts_content_retention`, porque o daemon antigo não declara essas capabilities.

Isso permite explicar claramente a semântica completa da V2 atual: por padrão recupera a lista, não salva o conteúdo, usa size/mtime/hash do workspace para evitar abrir silenciosamente uma versão errada e, ao mesmo tempo, evita refazer o hash completo de arquivos inalterados.
