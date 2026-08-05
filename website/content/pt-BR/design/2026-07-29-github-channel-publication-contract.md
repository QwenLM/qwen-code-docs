# Contrato de Publicação do Canal GitHub

## Objetivo

Tornar as respostas do canal GitHub seguras para publicação automática e
rastreáveis após o fato. O canal publica apenas a resposta final do agente
através do adapter; raciocínio intermediário, saída de ferramenta e chunks de
streaming nunca se tornam comentários no GitHub.

## Contrato

- O adapter do GitHub desabilita streaming de blocos, então cada evento de
  entrada aceito produz no máximo uma tentativa de entrega de resposta final.
- A entrega final usa o thread de issue/PR do prompt ativo em vez de um alvo
  de sessão compartilhada potencialmente obsoleto.
- As instruções do canal dizem ao agente para não usar `gh` ou a API do
  GitHub para criar comentários ou reviews. O adapter é dono da entrega
  pública.
- Uma resposta final cujo conteúdo aparado é apenas a sentinela `<no-reply/>`
  é suprimida intencionalmente. Espaços em branco, maiúsculas/minúsculas, um
  espaço antes de `/>` e uma única cerca de código envolvente são
  normalizados; qualquer outro conteúdo é publicado inalterado.
- Supressão e publicação são registradas em um arquivo de auditoria JSONL
  local append-only em
  `~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-audit.jsonl`.
  Os registros contêm hora, canal, sessão, mensagem de origem, thread,
  resultado, identidade/URL do comentário do GitHub quando presente, e um
  SHA-256 mais contagem de caracteres da resposta. Nunca contêm texto da
  resposta, credenciais ou um token do GitHub.
- Escritas de auditoria são best effort. Uma falha de auditoria é registrada
  no log sem mudar o resultado da publicação. Uma falha ambígua da API do
  GitHub permanece uma falha de entrega e não sofre retry; respostas
  definitivas de não escrita são gravadas em um arquivo privado de entregas
  pendentes e sofrem retry na próxima inicialização do canal.

## Fluxo

1. O adapter do GitHub despacha um evento aceito para `ChannelBase`.
2. O prompt ativo mantém a mensagem de entrada e o thread de issue/PR
   disponíveis até a entrega final terminar.
3. O agente retorna uma resposta final.
4. O adapter suprime a sentinela exata ou cria um comentário de issue.
5. O adapter anexa um registro de auditoria de publicação. O ciclo de vida
   terminal da tarefa permanece de posse de `ChannelBase`.
6. Se a entrega final falhar com uma resposta definitiva de não escrita, o
   adapter armazena o texto final em
   `~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-pending-deliveries.json`
   com permissões de arquivo privado e faz retry após reinício sem reexecutar
   o agente.

## Não objetivos

- Isto não faz retry de falhas de publicação ambíguas, não cria comentários
  de status e não habilita streaming de resposta. Essas são partes separadas
  da issue #8012.
- A instrução contra publicação direta via `gh`/API é um limite operacional
  para o agente, não aplicação de sandbox. Aplicar restrições de escrita do
  GitHub no nível de ferramenta pertence ao modelo de permissões do runtime.
- A política de retenção de entregas pendentes, incluindo máximo de
  tentativas, idade máxima, limites de tamanho, tratamento de respostas
  obsoletas e limpeza de arquivos temporários órfãos, é acompanhada
  separadamente na #8142.

## Verificação

Testes focados do adapter do GitHub cobrem supressão de sentinela, entrega
normal de comentário final, campos de auditoria sem texto da resposta e
falhas de escrita de auditoria não bloqueantes. Testes existentes de
roteamento e entrega permanecem inalterados.
