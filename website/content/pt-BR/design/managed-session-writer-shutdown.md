# Desligamento gerenciado do gravador de sessão

## Problema

Um substituto gerenciado de `qwen serve` pode iniciar em um novo hostname
enquanto o filho ACP anterior ainda é dono de um lock de gravador de sessão.
Um lock v1 de host externo não pode ser provado obsoleto, então o substituto
corretamente retorna `session_writer_conflict`. Reivindicar por hostname ou
idade permitiria que dois Pods vivos escrevessem a mesma transcrição.

## Escopo

Este P0 faz o desligamento gerenciado cooperativo liberar locks de gravador
antes do deadline de SIGKILL do pai. Ele não adiciona registros selados de
handoff, reivindicações de tomada de posse, TTL ou roubo por hostname,
cercamento de plataforma, leases de manutenção ou recuperação automática após
SIGKILL, uma parada do event-loop ou uma falha de armazenamento. Locks
históricos de host externo ainda requerem uma cerca de gravador externa e
limpeza manual.

Apenas um filho ACP que valida a capability privada existente do pai usa o
caminho gerenciado. O ACP autônomo mantém seu comportamento existente de
desligamento e recuperação de dono obsoleto local. A aquisição gerenciada
nunca reivindica um lock existente pela visibilidade de PID porque namespaces
de PID de contêiner tornam essa prova insegura.

## Terminal do gravador

O fechamento do gravador é single-flight e fecha a admissão de gravação
pública sincronamente. O fechamento normal finaliza metadados antes de fechar
e espera pelo trabalho aceito. O fechamento rápido gerenciado não espera por
um turno de modelo ativo e não anexa um registro de finalização adicional; ele
drena apenas o trabalho de gravador aceito antes do corte.

Uma falha de flush sela o gravador e ainda é reportada após uma tentativa de
liberação com dono exato, preservando o contrato de fechamento pré-existente.
Uma falha de propriedade ou liberação mantém o lock primário a menos que a
liberação já tenha sido consolidada. A única consolidação de liberação é um
rename no mesmo diretório do lock primário `P` para um caminho aposentado
único do dono `R`. O dono antigo pode limpar apenas seu `R` exato; ele nunca
retenta o rename primário ou toca no `P` de um sucessor. O desligamento
gerenciado emite um aviso visível ao operador com caminhos de lock candidatos
quando o terminal do gravador falha. A limpeza manual é segura apenas após
verificar que o gravador anterior não está mais em execução.

## Desligamento ACP gerenciado

A primeira ação de desligamento fecha a criação de sessão e a admissão de
turno e captura em snapshot as instâncias de Config com capability de gravador
ativas, inicializando e de limpeza adiada. Todos os terminais de gravador
iniciam antes do primeiro await e rodam em paralelo. Os hooks SessionEnd rodam
após a fase de gravador, enquanto os recursos de Config ainda estão
disponíveis. A limpeza de recurso então roda com o tempo restante.

O filho sai com zero apenas quando todo terminal de gravador está limpo. Um
lock pode ter sido liberado enquanto uma limpeza posterior de hook ou recurso
ainda torna o desligamento geral não limpo.

### Quiescência de recurso de Config

O desligamento do gravador e o desligamento de recurso de Config são terminais
separados. O fechamento do gravador ainda inicia antes do primeiro await do
desligamento gerenciado. A limpeza de recurso então se junta a qualquer
`Config.initialize()` em andamento antes de inspecionar e parar recursos, para
que a inicialização não possa criar um watcher, registro de ferramentas ou
gerenciador de MCP depois que a limpeza já retornou.

A inicialização de Config é selada assim que o desligamento começa, e a
limpeza de recurso é single-flight através do desligamento gerenciado e da
limpeza concorrente de falha de requisição. A chamada completa
`shutdown(options)` não é single-flight porque as opções de gravador e
telemetria permanecem específicas da chamada.

Um Config inicializado de forma incompleta inicia a liberação com dono exato
assim que seu lease pendente é exposto, antes de se juntar à inicialização.
Leituras de snapshot de transcrição observam essa liberação entre chunks e
param sem publicar um gravador tardio. Um Config inicializado com sucesso
mantém a ordem normal de finalização, flush e fechamento. A junção de
inicialização não tem timeout local: expirar a espera deixaria a
inicialização subjacente em execução e reintroduziria a criação tardia de
recursos. O deadline do processo do daemon permanece o limite rígido, depois
que a liberação do gravador pendente já completou ou falhou explicitamente.

## Ciclo de vida do processo pai

Cada handle de daemon é dono de um registro de processos compartilhado pelas
fábricas de canal de workspace primário, secundário e dinâmico. A reserva de
spawn e o selo de desligamento competem sincronamente. Um spawn bem-sucedido é
anexado ao registro no mesmo turno.

Um erro antes do evento `spawn` do Node sem PID é `no_process`; após a
confirmação do spawn, apenas o `exit` bruto prova o reaping. Uma falha de
construção de canal pós-spawn imediatamente dá SIGKILL no filho não publicado
e se junta ao terminal do canal antes de retornar o erro de construção. Após
uma fábrica de canal retornar, a ponte é dona do canal antes de construir ou
publicar seu ChannelInfo completo.

O desligamento do daemon usa uma única linha de tempo monotônica de registro
de processos: SIGTERM em `t0`, desligamento não limpo estável se o filho sair
com valor diferente de zero ou por sinal, SIGKILL em `t0 + 5s` e falha estável
`not_reaped` em `t0 + 10s`. Uma saída zero é o reconhecimento cooperativo do
terminal de gravador do filho gerenciado; o exit bruto sozinho prova apenas o
reaping. Os deadlines do registro nunca reiniciam, e um exit bruto tardio não
pode alterar seu terminal com falha para sucesso. O daemon mantém seu caminho
de retry existente para um worker de canal gerenciado independentemente que
depois se torna reapável; tal retry se junta ao mesmo terminal estabelecido de
registro de processos ACP em vez de iniciar uma nova linha de tempo de
desligamento ACP.

O deadline do pai intencionalmente não se expande para corresponder aos
orçamentos de hook SessionEnd, inicialização de Config ou limpeza de MCP
porque a janela de término da plataforma pode ser menor e fora do controle do
daemon. Essas fases pós-gravador usam o tempo restante após a liberação do
gravador e podem ser interrompidas, produzindo uma saída não limpa do daemon
sem restaurar o lock de gravador liberado. Apenas uma saída não confirmada de
worker de canal mantém o daemon vivo para uma segunda tentativa de
desligamento gracioso; outras falhas de ACP ou ponte saem com valor diferente
de zero no primeiro sinal.

## Compatibilidade e lançamento

A capability privada e os payloads públicos ACP/REST não mudam. Um
ChannelFactory assíncrono personalizado é coberto apenas depois que resolve um
AcpChannel; a fábrica gerenciada padrão é coberta a partir da reserva de spawn
em diante.

Operação de gravador com versões mistas permanece não suportada. Implantação
e rollback devem drenar gravadores ACP antigos antes que o substituto aceite
sessões.

## Verificação

A verificação deve distinguir:

1. lock liberado e o desligamento inteiro do daemon limpo;
2. lock liberado, mas limpeza posterior torna o desligamento não limpo; e
3. lock mantido, sucessor recebe 409 e a recuperação manual permanece
   necessária.

A cobertura determinística necessária inclui falha de flush, erro de rename
após efeito, aquisição por sucessor, fechamento normal para rápido, aquisição
em cada fronteira de corte, falha assíncrona de `ENOENT` em spawn, erro
pós-spawn, construção parcial de canal, saída de canal pré-resolvida com uma
resposta initialize em buffer, corridas de D1/D2 e exit bruto, saída tardia,
dois sinais, desligamento paralelo multi-runtime, desligamento durante
inicialização de Config, limpeza concorrente de Config, inicialização após
admissão de desligamento, ACP autônomo e salvaguardas de lançamento com
versões mistas.
