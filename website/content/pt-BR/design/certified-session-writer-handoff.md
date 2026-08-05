# Handoff de escritor de sessão certificado

## Problema

O encerramento gerenciado cooperativo atualmente libera cada lock de escritor
de sessão antes que o filho ACP saia. Isso corrige o caminho de substituição
ordinário, mas não consegue distinguir um escritor que parou de gravar
deliberadamente de um escritor em host estrangeiro que desapareceu sem liberar
seu lock ativo. Tratar hostname, visibilidade de PID, idade do lock ou
inatividade da transcrição como prova de morte permitiria que dois Pods vivos
anexassem à mesma transcrição.

## Escopo

Esta mudança adiciona um estado de handoff protegido por integridade para
escritores ACP gerenciados. Após fechar a admissão e drenar duravelmente o
trabalho de gravador aceito, um filho gerenciado confiável pode substituir seu
lock ativo por um registro selado. Um substituto gerenciado confiável pode
tomar posse apenas após validar esse registro contra a transcrição exata
requisitada pela nova Config.

Os caminhos de transcrição devem estar ausentes ou resolver para o mesmo
arquivo regular aberto para a prova. Um symlink pendurado não é tratado como
transcrição ausente.

O protocolo permanece controlado por gate de
`experimental.sessionWriterLease`, que está desabilitado por padrão e é
capturado em snapshot na inicialização do processo ACP. Gravadores ACP
autônomos, interativos e headless não ganham tomada de posse certificada. O
fechamento normal por sessão ainda libera seu lock em vez de deixar um
registro selado.

Esta mudança não recupera um lock ativo deixado por SIGKILL, estol do loop de
eventos, crash não tratado ou falha de armazenamento antes que o selamento
seja concluído. Ela não adiciona TTLs, heartbeats, roubo de hostname,
consultas à API do Kubernetes, endpoints de roubo forçado pelo operador,
leases de manutenção ou suporte a versões mistas. Esses casos de lock ativo
ainda requerem uma cerca de escritor externa autoritativa e recuperação
explícita.

## Registros de lock

Novos donos gravam registros de schema v2. Um registro ativo retém os
diagnósticos imutáveis existentes do dono e adiciona:

```json
{
  "schema_version": 2,
  "state": "active"
}
```

Um registro selado retém os diagnósticos do dono anterior e adiciona:

```json
{
  "schema_version": 2,
  "state": "sealed",
  "sealed_at": "2026-07-28T00:00:00.000Z",
  "transcript": {
    "relative_path": "<runtime-relative transcript key>",
    "exists": true,
    "byte_length": 1234,
    "sha256": "<lowercase hex digest>"
  }
}
```

A chave relativa deve resolver para o caminho de transcrição já fornecido pela
nova Config. Ela nunca é usada para selecionar um caminho arbitrário do
sistema de arquivos. Registros schema v1 permanecem registros ativos válidos
para compatibilidade durante rollback, mas nunca podem ser interpretados como
selados.

## Claim fixo

O caminho fixo do claim é:

```text
<primary lock path>.claim
```

Ele serializa as duas transições que removem temporariamente o caminho
primário: active-to-sealed e sealed-to-active. O claim é criado com a
primitiva existente de escrita-sincronizada-e-hard-link. Erros de link
ambíguos são reconciliados contra os bytes exatos do claim antes que a
transição continue ou faça limpeza. Um claim nunca é recuperado por PID,
hostname ou idade. Qualquer claim pré-existente retorna
`session_writer_unavailable`; limpeza manual é permitida apenas após uma cerca
de escritor externa autoritativa.

A aquisição ordinária verifica o claim antes de toda tentativa de instalar um
lock primário ausente. Ela verifica novamente após a instalação e remove
apenas seu próprio candidato exato se uma transição concorrente adquiriu o
claim. Isso mantém o fast path atual do lock ativo e a recuperação local de
dono obsoleto enquanto faz ambos os caminhos respeitarem uma transição de
handoff. Escritores de versões mistas permanecem sem suporte porque um
escritor mais antigo não conhece o claim fixo.

Um adquirente pode passar pela sua primeira verificação de claim
imediatamente antes de uma transição criar o claim, então instalar seu
candidato ativo durante a lacuna do caminho primário da transição. A transição
reconhece esse registro ativo schema-v2 da mesma sessão como um candidato
ciente do claim, preserva o predecessor aposentado e espera que a segunda
verificação obrigatória do candidato o remova antes de tentar o hard link
novamente. Essa espera é limitada; se o candidato estolar ou sair antes da sua
segunda verificação, a transição falha indisponível enquanto retém seu claim e
predecessor aposentado. Sucessores desconhecidos, malformados ou de outra
sessão nunca são removidos nem sobrescritos.

## Selamento

O encerramento gerenciado para de forma síncrona a admissão de sessão e de
gravador, então inicia todos os terminais de escritor em paralelo. Um terminal
de escritor:

1. drena toda operação de gravador aceita antes do corte;
2. abre a transcrição esperada sem seguir um symlink, verifica o dono e o
   snapshot de transcrição existentes e faz o hash dos bytes através desse
   descritor de arquivo mantido aberto;
3. grava e sincroniza um candidato selado único do dono;
4. adquire o claim fixo e revalida o dono ativo mais a identidade e metadados
   da transcrição mantida aberta;
5. renomeia o primário ativo exato para um caminho de aposentado único do
   dono;
6. faz hard link do candidato selado no caminho primário agora ausente sem
   substituição; e
7. remove apenas seus registros exatos de aposentado, candidato e claim.

A transição do caminho primário é logicamente atômica para escritores que
cooperam porque toda instalação respeita o claim fixo, e o hard link final não
pode sobrescrever um lock criado por outro processo. Um erro após efeito é
reconciliado a partir dos bytes exatos do registro. O dono antigo nunca
exclui nem sobrescreve um primário desconhecido.

Um flush gerenciado ou falha de prova retém o lock ativo. O fechamento normal
por sessão preserva o comportamento de liberação existente, incluindo limpeza
de dono exato. Se uma liberação normal competir com o encerramento gerenciado
e confirmar primeiro, o primário ausente já é um handoff seguro e o substituto
executa a aquisição ordinária.

A limpeza de falha remove o claim fixo apenas após provar que o primário exato
pré-transição foi restaurado. Se o rollback não consegue restaurar nem
verificar esse registro, o claim permanece mesmo quando outro primário
aparece, porque esse caminho pode ser um candidato perdedor de aquisição
ordinária que se removerá após observar o claim. O próprio rollback só é
tentado enquanto o claim fixo ainda contém o registro exato desta transição;
um claim ausente ou substituído significa que o primário atual não deve ser
mudado. A recuperação então requer a mesma cerca de escritor externa
autoritativa que qualquer outro claim residual.

Falhas antes de a transição primária iniciar são diferentes: o claimant não
criou uma lacuna no caminho primário nem moveu o predecessor, então ele libera
apenas seu próprio claim exato mesmo se outro competidor certificado já
substituiu o primário selado observado. Isso impede que um competidor perdedor
atrasado abandone um claim depois que o vencedor se torna ativo.

## Tomada de posse certificada

Apenas uma Config criada sob um pai gerenciado confiável habilita a tomada de
posse certificada. Quando a aquisição observa um registro selado, ela:

1. verifica que a chave relativa do registro corresponde à transcrição
   esperada da Config;
2. abre e faz o hash dessa transcrição fora do claim fixo, retendo o descritor
   de arquivo e sua identidade;
3. adquire o claim fixo;
4. relê o primário selado exato e revalida o descritor mantido aberto,
   identidade de caminho, metadados, tamanho em bytes e digest;
5. renomeia o primário selado para um caminho de aposentado único do
   candidato;
6. faz hard link do candidato ativo sincronizado a partir do claim no caminho
   primário sem substituição; e
7. remove apenas o registro aposentado exato e seu próprio claim.

O lease então executa o recarregamento autoritativo de sessão e a cerca de
transcrição existentes antes da ativação do gravador. Dois substitutos
competindo pelo mesmo registro selado podem produzir no máximo um dono ativo.
Um perdedor recebe um resultado de conflito ou indisponível dependendo de
observar o primário ativo do vencedor ou um claim em andamento/residual.

## Contrato de falha

| Condição                                                                               | Resultado                            |
| -------------------------------------------------------------------------------------- | ------------------------------------ |
| Dono ativo válido, incluindo registro de host estrangeiro ou PID morto gerenciado      | `session_writer_conflict` / 409      |
| Prova selada não corresponde à transcrição esperada                                    | `session_transcript_changed` / 409   |
| Registro malformado, caminho não regular, claim residual ou resultado incerto do sistema de arquivos | `session_writer_unavailable` / 503   |
| Escritor atual não possui mais seu registro ativo exato                                | `session_writer_lost` / 409          |

Erros públicos permanecem sanitizados. Logs bem-sucedidos de selamento e
tomada de posse incluem o ID de sessão, hostname/PID anterior e horário de
selamento, mas nunca o token do dono nem o caminho da transcrição.

## Compatibilidade e lançamento

O gate da funcionalidade deve permanecer desabilitado durante um lançamento
com versões mistas. Habilitá-lo ou desabilitá-lo requer drenar processos ACP
antigos. Um leitor schema v2 ainda aceita registros ativos schema v1, mas um
leitor mais antigo não entende schema v2. Rollback, portanto, requer drenar
todos os novos escritores e confirmar que nenhum registro ativo, selado ou
claim deste protocolo permanece.

Um escritor que não adquire um lease — por exemplo uma sessão `qwen --resume`
simples, porque gravadores autônomos, interativos e headless executam fora
deste protocolo — ainda pode anexar a uma transcrição que um escritor
gerenciado selou. Essa anexação invalida a prova selada, então uma tomada de
posse certificada posterior da mesma sessão falha fail closed com
`session_transcript_changed` e o daemon permanece cercado até que uma cerca de
escritor externa autoritativa limpe o registro residual. O lançamento,
portanto, deve manter escritores sem lease longe de qualquer transcrição que
participe do handoff certificado.

O hash é intencionalmente executado no selamento e na tomada de posse em vez
de adicionar um digest incremental a cada anexação. Isso mantém a primeira
implementação pequena e torna a prova independente da memória do processo. Uma
transcrição muito grande pode fazer o selamento gerenciado exceder o prazo do
pai; isso falha fail closed com o lock ativo retido e é observável como um
encerramento não limpo.

## Verificação

Cobertura unitária e multiprocesso deve provar:

- locks ativos schema v1 e v2 mantêm seu comportamento vivo/obsoleto
  existente;
- aquisição gerenciada nunca recupera um lock ativo de PID morto ou host
  estrangeiro;
- selamento bem-sucedido grava a chave relativa exata, existência, tamanho em
  bytes e digest SHA-256;
- um substituto certificado recarrega a transcrição selada e se torna ativo;
- dois substitutos competindo por um registro selado elegem exatamente um
  dono;
- modificação, substituição, truncamento de transcrição, corrupção de prova,
  registros selados malformados e claims residuais falham fail closed;
- falhas antes e depois de cada transição de caminho primário nunca
  sobrescrevem nem excluem um sucessor desconhecido;
- falha de flush gerenciado retém o primário ativo;
- fechamento normal do gravador libera em vez de selar; e
- os caminhos padrão desabilitado e ACP autônomo permanecem inalterados.
