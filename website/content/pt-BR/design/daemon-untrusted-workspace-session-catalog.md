# Catálogo de Sessões Somente Leitura de Workspace Não Confiável

## Resumo

Daemons multi-workspace expõem um catálogo estreito somente leitura para
workspaces registrados não primários cujo estado de confiança na inicialização é
`false`. O catálogo contém resumos de sessão persistidos e o sidecar de
organização de sessão. Ele não se anexa a uma sessão, inicia um child ACP, mescla
estado de runtime ativo ou interpreta definições de capability controladas pelo
workspace.

Esta é uma allowlist de rotas, não uma ACL de workspace. Um cliente que detém o
token bearer do daemon pode ler os dados permitidos para cada workspace
registrado. A confiança continua a controlar com gate a execução e a mutação; ela
não cria um principal de autenticação separado.

## Invariantes de Segurança

Todo caminho de leitura recém-permitido de workspace não confiável deve satisfazer
todas estas condições:

- Não chamar `loadSettings()` ou qualquer caminho de migração/reparo de
  configurações.
- Não criar, reparar, reescrever ou modificar de outra forma o armazenamento.
- Suprimir o log de depuração baseado em arquivo enquanto o leitor de catálogo
  está ativo, para que um registro malformado não possa criar ou anexar um log de
  depuração como efeito colateral de leitura.
- Não chamar `ensureChannel()` ou qualquer outro caminho de inicialização de child
  ACP.
- Não consultar ou mesclar o estado ativo da bridge do runtime não confiável.
- Não executar comandos externos.
- Não descobrir ou analisar agentes, skills, hooks, configuração MCP ou outras
  definições de capability controladas pelo projeto do workspace.

A implementação aplica a fronteira de estado ativo com uma política de leitura
interna `mergeLive: false` em todas as formas de lista de sessão: padrão,
organizada e filtrada por `parentSessionId`. A mesma fronteira de leitura
assíncrona suprime apenas o log de depuração baseado em arquivo para leituras de
catálogo não confiáveis; requisições confiáveis e log fora dessa fronteira
permanecem inalterados. Armazenamento ausente produz um catálogo vazio, e entradas
malformadas seguem o comportamento existente de leitura de melhor esforço sem
reparar arquivos.

## Matriz de Rotas

A tabela descreve um workspace secundário não confiável, a menos que indicado o
contrário.

| Superfície                                  | Resultado           | Fonte de dados e restrições                                                          |
| ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `GET /workspace/:id/sessions`               | 200                 | Apenas arquivos de sessão persistidos; seletor de id ou cwd canônico codificado      |
| `GET /workspaces/:workspace/sessions`       | 200                 | Mesmo catálogo somente persistido                                                     |
| `GET /workspace/:id/session-groups`         | 200                 | Apenas sidecar de organização; qualquer id registrado ou cwd codificado               |
| `GET /workspaces/:workspace/session-groups` | 200                 | Apenas sidecar de organização                                                         |
| Leitura de arquivo, bytes, stat, list, glob | Comportamento existente | Política existente de leitura do sistema de arquivos permanece inalterada          |
| GET/requisição de confiança do workspace    | Comportamento existente | Semântica existente de configuração de confiança permanece inalterada            |
| `/capabilities`, `/daemon/status`           | Comportamento existente | Diagnósticos existentes do daemon permanecem inalterados                         |
| Mutações plurais de sessão/grupo            | 403                 | Gate de confiança de mutação permanece inalterado                                    |
| Mutações singulares de grupo                | Comportamento existente | Permanecem apenas no primário; seletores secundários fazem fail closed        |
| Configurações, permissões, provedores       | 403                 | Carregamento de configurações pode migrar, fazer backup ou reparar arquivos          |
| Memória                                     | 403                 | Resposta atual inclui caminhos de memória global em vez de uma projeção somente do workspace |
| Env                                         | 403                 | Expõe presença de credenciais e diagnósticos de proxy/host                          |
| Preflight                                   | 403                 | Pode executar git, npm, ripgrep ou outras sondas                                     |
| MCP, ferramentas, hooks                     | 403                 | Acoplado ao estado ativo da bridge ou configuração de projeto                        |
| Skills, agentes                             | 403                 | Descobre e analisa definições controladas pelo projeto                                |
| Transcrição                                 | 403                 | Caminho atual pode iniciar ACP e inicialização de cursor pode escrever uma chave HMAC |
| Exportação, status/contexto/tarefas de sessão | 403               | Sem implementação somente persistida qualificada por workspace                        |
| ACP HTTP/WebSocket, voz, canais             | Rejeitado           | Capacidades de execução, processo ou runtime de longa duração                        |

Seletores de workspace absolutos, aninhados ou não registrados desconhecidos
continuam a fazer fail closed com a resposta `400 workspace_mismatch` existente.
Um seletor singular legado malformado mantém sua mensagem de validação `400`
existente. Nenhum dos casos faz fallback para o workspace primário. Rotas plurais
continuam retornando `403 untrusted_workspace` para um workspace primário não
confiável. Rotas singulares primárias mantêm seu comportamento de compatibilidade
existente.

## Semântica do Catálogo de Sessões

O modo somente persistido mantém o comportamento existente de `archiveState`,
`view=organized`, `group`, `parentSessionId`, cursor e tamanho de página. Ele nunca
preenche interações pendentes, erros de turno ou estado de cliente a partir do
runtime ativo; padrões existentes de resumo persistido como `clientCount: 0` e
`hasActivePrompt: false` permanecem compatíveis em wire. Ele nunca chama
`bridge.listWorkspaceSessions()`.

Workspaces secundários e primários confiáveis mantêm a mesclagem existente
persistido/ativo. Nenhuma rota, campo de wire, esquema ou tag de capability é
adicionada: clientes mais antigos continuam a tratar `403`, enquanto o Web Shell
incluído consome a nova resposta `200` quando distribuído com o daemon.

## Comportamento do Web Shell

Um workspace secundário não confiável permanece expansível e é rotulado tanto como
`untrusted` quanto `read-only`. Expandi-lo realiza uma leitura de catálogo. Uma
alteração de `reloadToken` realiza outra leitura, mas o poll usual de dez segundos
é desabilitado porque este daemon não pode criar sessões naquele workspace.

Expandir não seleciona nem ativa o workspace. Sessões persistidas são renderizadas
como linhas não interativas com `role="note"` e um nome acessível que inclui o nome
da sessão, a data e uma explicação de que o workspace deve ser confiável antes que
uma sessão possa ser aberta. A linha não vincula ativação por mouse ou teclado nem
recebe estilo de sessão ativa. O comportamento de workspace confiável permanece
inalterado. Um primário não confiável permanece desabilitado aguardando um design
separado de modo seguro primário.

## Comportamento de Falha e Compatibilidade

- Armazenamento de sessão ou organização ausente retorna um catálogo vazio.
- Registros JSONL não analisáveis e não objeto são pulados pelo leitor de sessão
  existente. Esta alteração não adiciona validação de esquema para registros de
  objeto estruturalmente inválidos.
- Um sidecar de organização ilegível retorna a visão de leitura vazia existente e
  aviso; leituras não o reparam.
- Falhas de requisição do Web Shell mantêm o estado vazio existente e aviso de
  console.
- O GET de confiança continua a observar a configuração de confiança atual em disco
  e informa aos chamadores que alterações de runtime exigem reinicialização. Ele
  não é convertido para um snapshot de inicialização nesta alteração.

## Trabalho Adiado

- Um carregador de snapshot de configurações e confiança sem efeitos colaterais.
- Uma projeção de memória somente do workspace.
- Inspeção de ambiente e configuração com dados sensíveis ocultados.
- Inventário de skills e agentes que não analisa definições de projeto.
- Um leitor de transcrição local do daemon que nem inicia ACP nem inicializa uma
  chave HMAC de cursor, além de um visualizador de sessão verdadeiramente somente
  leitura.
- Aplicação dinâmica de confiança, reconstrução de runtime e remoção/drenagem de
  workspace.
