# Inspeção de Ramos de Conversa

## Motivação

Arquivos JSONL de sessão já formam uma árvore através de `uuid` e
`parentUuid`, mas o resume atualmente reconstrói apenas uma cauda fisicamente
selecionada. Um restart pode, portanto, esconder históricos irmãos válidos
quando mais de um escritor anexou à mesma sessão ou quando um rewind criou um
segundo ramo.

Esta mudança adiciona um inspetor de topologia somente leitura. Ele
identifica toda folha semântica, descreve sua relação com registros de rewind
explícitos e produz um pequeno resumo determinístico. Ele não decide qual ramo
está ativo.

## Fronteira

O inspetor aceita valores `ChatRecord` em memória e não tem dependência de
sistema de arquivos, serviço de sessão, modelo ou escritor. Comportamentos
existentes de resume, fork, paginação de transcrição, daemon, ACP e CLI
permanecem inalterados.

A reconstrução do ramo selecionado continua a usar `buildOrderedUuidChain`
com um `leafUuid` explícito. Uma mudança posterior do lado de escrita deve
obter um snapshot exclusivo e estável da transcrição, pedir ao usuário ou a
uma política durável para selecionar uma das folhas reportadas, persistir essa
seleção e semear o escritor retomado. Nenhuma dessas operações de posse
pertence ao inspetor.

O Claude Code tem um leitor de transcrição de todas as folhas para análise
enquanto seu caminho normal de resume ainda seleciona a folha mais recente que
não é sidechain. O Qwen não pode usar com segurança essa regra de seleção: um
rewind explícito prova uma relação estrutural, mas em uma transcrição
multi-escritor não prova que todo irmão foi abandonado intencionalmente.

## Folhas semânticas

O primeiro registro físico de um UUID define seu pai, correspondendo ao
caminhador de cadeia existente. Pais duplicados conflitantes são diagnosticados
em vez de adivinhados.

Registros terminais brutos são normalizados usando uma allowlist de cauda
neutra deliberadamente pequena: `custom_title`, `session_artifact_event` e
`session_artifact_snapshot`. Esses registros podem ser anexados ao lado ou
após uma cauda de conversa sem criar uma conversa recuperável distinta. Uma
sequência terminal deles colapsa para seu ancestral não neutro conhecido mais
próximo. Se tal ancestral não existe, a sequência somente de metadados é
omitida porque não é um ramo de conversa reconstruível. Candidatos colapsados
são deduplicados, então qualquer candidato que é um ancestral estrito de outro
candidato é removido. O resultado é uma antichain de folhas semânticas.

Todos os outros registros de sistema permanecem significantes. Em particular,
registros de rewind, compressão, atribuição e histórico de arquivos podem
carregar estado de recuperação e não devem ser descartados apenas porque não
têm texto visível ao usuário.

Pais ausentes interrompem uma cadeia na ilha de cauda alcançável. Ciclos de
pai são reportados e limitados. O lado de leitura nunca reconecta histórico
ausente nem rotula um ramo como ativo ou abandonado.

## Resumos e relações de rewind

Resumos são locais e determinísticos. Eles incluem o ponto de ramificação mais
próximo, contagens de mensagens, timestamps, o primeiro texto real de usuário
após o ponto de ramificação e o texto mais recente de usuário e de assistente
que não é de pensamento. Registros de notificação, cron e de usuário no meio
do turno não são tratados como prompts de usuário. O texto é normalizado em
espaços em branco e truncado; argumentos de ferramenta e partes não textuais
são ignorados. `updatedAt` usa o timestamp do último registro terminal físico
normalizado na folha semântica, para que atividade neutra de metadados não
seja perdida.

Um ramo é um descendente de rewind quando seu caminho contém um registro de
rewind. Ele é um irmão de rewind quando seu caminho diverge do caminho para um
registro de rewind. Esses são apenas rótulos estruturais e nunca implicam que
o irmão é obsoleto.
