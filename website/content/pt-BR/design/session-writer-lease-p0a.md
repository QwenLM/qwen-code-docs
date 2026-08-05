# Lease de gravador de sessão P0a

## Problema

Uma sessão persistida pode atualmente ser carregada por um segundo processo
Qwen enquanto o processo original ainda está produzindo e gravando um turno.
Ambos os gravadores fazem cache do mesmo UUID pai. Quando eles anexam
independentemente, a transcrição JSONL ganha dois filhos não marcados desse
pai. A retomada segue a cauda física e pode portanto ocultar a resposta
completa do primeiro processo.

O incidente de produção teve exatamente esta ordem: o processo original
gravou um resultado de ferramenta, o daemon carregou aquela sessão do zero,
o processo original gravou o trabalho de ferramenta restante e a resposta
final, e o daemon posteriormente gravou uma mensagem do usuário usando o
resultado de ferramenta anterior como seu pai.

## Escopo

O P0a estabelece um único gravador entre processos para cada
`(base do runtime, ID de sessão)` de ACP/daemon e protege o caminho linear
comum de anexo envolvido neste incidente. Ele inclui:

- um lease com token de dono atômico com recuperação de processo morto;
- um recarregamento autoritativo da transcrição após a aquisição do lease;
- cercamento por dono, identidade de arquivo e comprimento em bytes em cada
  anexo JSONL;
- admissão de turno antes do início de trabalho de usuário, cron, notificação
  e teammate;
- reutilização de uma sessão já ativa dentro de um mesmo daemon;
- leituras com barreira de dono para replay da transcrição ao vivo e
  atualização do histórico do Desktop;
- erros de conflito ACP/HTTP determinísticos; e
- drenagem e liberação do lease no fechamento da sessão e em inicialização
  com falha.

O P0a não torna transacionais a troca de sessão, o retrocesso, branch/fork,
migração de diretório de trabalho, manutenção de arquivar/excluir/renomear ou
o reparo de transcrição. Ele também não introduz uma entrada de registro em
inicialização que serializa todo load/resume no mesmo daemon contra o
fechamento; um load repetido reutiliza o dono depois que esse dono é
registrado, enquanto o lease entre processos ainda rejeita um segundo
gravador durante a inicialização. A coalescência completa de resultados de
load/close pertence ao P0b. Troca de sessão e migração de raiz de
persistência falham com fail closed enquanto um Config ACP possui um lease. A
mudança lógica de diretório de trabalho do ACP continua suportada porque ela
mantém o gravador e o SessionService vinculados à raiz de persistência
original. O retrocesso com o mesmo dono carrega por meio desse SessionService
fixado no Config sob a barreira de escrita do gravador; rename e branch
mantêm seus caminhos existentes de gravador ou de flush antes da cópia.
Arquivar/excluir do daemon e a manutenção de sessões não ativas mantêm sua
semântica existente. Manutenção concorrente vinda de fora do dono ativo
continua sem suporte e faz parte da fronteira do P0b. Gravadores de CLI
interativos e headless mantêm seu comportamento existente sem lease, de modo
que `/clear`, `/resume`, `/branch` e `/cd` não regridam; eles não devem
escrever na mesma sessão concorrentemente com um dono ACP até que o P0b
amplie o protocolo.

O protocolo é controlado pelo gate `experimental.sessionWriterLease` e fica
desabilitado por padrão. O valor efetivo é capturado como snapshot do Config
de bootstrap quando o filho ACP inicia e permanece fixo para toda sessão
atendida por esse processo; recargas de configuração por sessão não podem
alterá-lo. Habilitá-lo requer uma reinicialização do processo. A configuração
afeta apenas gravadores ACP/daemon; gravadores interativos e headless
continuam usando o caminho legado mesmo quando a configuração está
habilitada.

## Invariantes

1. No máximo um processo ACP cooperante possui um lease de gravador de sessão
   sob uma base do runtime.
2. Um gravador ACP com lease fica inativo até possuir o lease e ter
   recarregado a transcrição enquanto o possui.
3. Dados de pré-visualização carregados antes do lease nunca são a cauda
   autoritativa do gravador.
4. Cada anexo ACP com lease verifica o token de dono, o estado físico da
   transcrição e o comprimento em bytes. Desvio apenas de timestamp é aceito
   somente após verificação estável do conteúdo.
5. Uma falha de propriedade ou de integridade da transcrição rejeita
   permanentemente turnos de nível superior posteriores naquele Config ACP
   com lease.
6. Um daemon nunca constrói um segundo Config gravável para uma sessão já
   ativa naquele daemon.
7. Uma entrada ativa é removida somente depois que seu gravador drenou e
   liberou o lease.
8. As raízes de saída do runtime são fixadas por Config, de modo que o lock e
   a transcrição não possam resolver por meio de contextos de workspace
   assíncronos diferentes.

## Protocolo de lease

O lock é armazenado em:

```text
<base do runtime>/tmp/session-writer-locks/<id de sessão codificado>.lock
```

Seu registro imutável contém um token de dono aleatório, PID, host, tipo de
processo, horário de aquisição, versão do Qwen e (quando disponível) uma
identidade estável de início de processo do SO. O Linux usa o ID de boot do
kernel mais os ticks de início do processo, de modo que correções de relógio
não possam fazer um dono ativo parecer obsoleto. O Darwin normaliza a sonda
de início de processo para o locale C e UTC, de modo que dois processos com
ambientes diferentes comparem a mesma identidade. A identidade distingue a
reutilização de PID quando a plataforma a expõe de forma confiável. Um dono
de host externo e qualquer estado cuja segurança não possa ser provada falham
com fail closed.

A aquisição cria um registro temporário totalmente escrito e o vincula
atomicamente ao nome do lock. Um dono ativo válido retorna
`session_writer_conflict`. Um dono local morto válido pode ser renomeado,
reverificado e recuperado. Guardas de recuperação formam gerações de dono
limitadas, de modo que outro processo possa se recuperar se o próprio
recuperador travar. Um lock malformado, symlink ou não regular retorna
`session_writer_unavailable` em vez de ser considerado obsoleto por palpite.

O lease captura como snapshot se a transcrição existe, sua identidade de
arquivo, metadados de segurança, comprimento em bytes e um estado SHA-256
incremental em memória. Mudanças de existência, comprimento, device/inode,
modo, dono/grupo e contagem de links falham com fail closed. Timestamps de
criação, mudança e modificação são consultivos: desvio apenas de timestamp
dispara uma verificação completa de conteúdo estável por meio de um único
handle de arquivo e é aceito somente quando o digest permanece inalterado.
Atributos estendidos e entradas de ACL que não mudam o modo não têm
fingerprint separado. Quando tal operação surge como desvio de
timestamp, ela é aceita após a mesma verificação de conteúdo se todo o estado
físico permanecer inalterado; se o sistema de arquivos não expõe nenhuma
diferença de timestamp observada, a operação não é detectada. `appendJsonLine`
aplica a mesma verificação após abrir seu handle de anexo, avança um digest
candidato com os bytes conhecidos e confirma o digest e o estado esperado
somente após um anexo durável bem-sucedido, verificação do caminho pós-escrita
e verificação final do dono. A criação de uma nova transcrição usa criação
exclusiva.

Adquirir uma transcrição existente realiza uma única leitura em streaming
O(n) para estabelecer a baseline do digest, usando um buffer limitado a
1 MiB; anexos comuns permanecem incrementais. Uma varredura de reconciliação
requer que os timestamps permaneçam estáveis do seu estado pré-leitura até o
seu estado pós-leitura e tenta novamente instabilidade apenas de timestamp no
máximo três vezes. Esse intervalo de estabilidade é necessário porque um
digest sequencial pode corresponder ao conteúdo esperado mesmo quando um
gravador não cooperante muda um offset já lido atrás do cursor de leitura. Se
os timestamps continuarem mudando, o lease retorna `session_writer_unavailable`
em vez de aceitar um snapshot potencialmente rasgado.

O digest incremental é uma verificação de compatibilidade de processo ativo,
não uma prova persistida para handoff certificado. Um gravador não cooperante
ainda pode sobrescrever um prefixo de mesmo comprimento durante um anexo sem
deixar uma diferença de timestamp visível em uma das observações de estado
deste processo. Fechar essa fronteira existente exigiria uma varredura
pós-escrita O(n) incondicional, tornaria anexos repetidos quadráticos e está
fora do P0a.

## Ativação e fechamento

Quando o gate da funcionalidade está habilitado, um `Config.initialize()` do
ACP adquire o lease antes da inicialização de extensões, hooks, ferramentas,
modelo ou agendador. Enquanto mantém o lease, ele resolve o estado
ativa/arquivada, recarrega a transcrição ativa quando uma existe, verifica se
a transcrição não mudou durante o recarregamento, substitui qualquer
pré-visualização pré-lock e ativa o gravador. Configs ACP sem opt-in e todos
os Configs não ACP continuam pelo caminho legado do gravador sem adquirir
este lease P0a.

Qualquer falha de inicialização posterior fecha o gravador e libera o lease.
O encerramento normal e o fechamento de sessão ACP finalizam metadados
pendentes, drenam a fila do gravador, liberam o token de dono e somente então
removem a entrada de sessão ativa. A limpeza é verificada por identidade, de
modo que uma inicialização antiga com falha não possa fechar uma entrada mais
nova com o mesmo ID. A limpeza de aquisição usa a liberação exata de registro
single-flight do lease; uma falha terminal retém o lock primário, chamadas de
liberação posteriores observam a mesma falha em vez de tentar um segundo
rename, e outro gravador permanece cercado até a recuperação por saída de
processo. Uma recusa definitiva do filho deixa a sessão ativa para que o
fechamento possa ser tentado novamente. A drenagem do fechamento é limitada;
um timeout ou falha de transporte tem resultado desconhecido, então a bridge
encerra o canal ACP compartilhado e seus leases de propriedade do processo se
tornam recuperáveis como obsoletos. Outras sessões naquele canal também são
recolhidas por essa ação de recuperação.

## Contrato de erro

| Tipo                         | JSON-RPC | HTTP | Significado                                             |
| ---------------------------- | -------: | ---: | ------------------------------------------------------- |
| `session_writer_conflict`    | `-32020` |  409 | Outro processo ativo possui a sessão.                   |
| `session_writer_lost`        | `-32021` |  409 | Este Config não possui mais seu lock.                   |
| `session_transcript_changed` | `-32022` |  409 | O JSONL mudou fora da sequência de anexos esperada.     |
| `session_writer_unavailable` | `-32023` |  503 | A propriedade não pôde ser verificada com segurança.    |

As respostas externas usam mensagens fixas e `errorKind`; elas não expõem PID,
host, token de dono, caminho do lock ou caminho da transcrição.

Um caminho de transcrição symlink ou não regular sem uma baseline prévia de
arquivo regular é `session_writer_unavailable`. Depois que um lease
estabelece uma baseline de arquivo regular, substituir esse caminho por um
symlink ou outro arquivo não regular é uma substituição externa de
transcrição e é classificado como `session_transcript_changed`.

## Compatibilidade e rollout

O protocolo coordena apenas gravadores ACP com a funcionalidade habilitada.
Implantação e rollback devem drenar processos gravadores ACP/daemon antigos
antes de habilitar ou desabilitar a configuração. Operação ACP com versões ou
configurações mistas não é segura, porque um gravador legado ignora o lock.
Acesso interativo ou headless concorrente à mesma sessão persistida permanece
fora do P0a e não é suportado até o P0b.

O sistema de arquivos do runtime deve suportar hard links no mesmo diretório
com comportamento atômico sem substituição. Se esse pré-requisito não estiver
disponível, a aquisição falha com fail closed com
`session_writer_unavailable`.

Transcrições com branch existentes não são reparadas automaticamente. O P0a
impede um novo branch por load obsoleto após o rollout; reparo e semântica
explícita de branch permanecem como trabalho separado.

## Verificação

A cobertura unitária exercita os gates padrão-desabilitado e opt-in
explícito, contenção de lock, recuperação de dono morto e de recuperador que
travou, locks malformados e não regulares, liberação concorrente de token de
dono, pré-verificações limitadas de liberação, falhas terminais de limpeza,
transcrições truncadas e alteradas externamente, reconciliação apenas por
timestamp, substituição in-place de mesmo comprimento e atômica, mudanças de
metadados de segurança, contabilidade de bytes UTF-8,
ativação/cercamento/fechamento do gravador, recarregamento autoritativo,
limpeza de inicialização, fixação de raiz do runtime, admissão de turno,
reutilização de replay no mesmo daemon, compatibilidade com gravação
desabilitada, comportamento do gravador interativo legado e sanitização de
erros. A cobertura no Darwin também verifica que processos com fusos horários
diferentes derivam a mesma identidade de dono. O tratamento de reutilização
de PID está implementado, mas não é reivindicado como evidência de teste,
porque a sonda de início de processo depende da plataforma.

Com o gate da funcionalidade habilitado, uma regressão real com dois
processos recria o timing do incidente: o processo A mantém o gravador após
uma cauda de resultado de ferramenta, o processo B é rejeitado antes de
carregar como gravador, A anexa sua resposta final e fecha, e B então adquire,
recarrega aquela resposta final e anexa o próximo registro do usuário com a
resposta final como seu pai.

A cobertura do Desktop verifica que um conflito de gravador é apresentado ao
usuário em vez de silenciosamente substituir a sessão persistida requisitada
por uma sessão nova. A atualização do histórico ao vivo é atendida por meio
da barreira de escrita do dono e do SessionService fixado no Config,
inclusive após um `/cd` lógico.
