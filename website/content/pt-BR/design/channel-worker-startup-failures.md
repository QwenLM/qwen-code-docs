# Relatório de falhas de inicialização do channel worker

## Contexto

A [Issue #6909](https://github.com/QwenLM/qwen-code/issues/6909) identifica
uma lacuna de diagnóstico em canais gerenciados pelo daemon. Uma rejeição de
`connect()` do adaptador é registrada no log pelo worker, mas o worker então
reporta apenas pronto ou sai com `No channels connected.` O supervisor, a API
de controle dinâmico, o SDK e o CLI, portanto, perdem o erro acionável do
provedor.

Esta mudança carrega falhas de `connect()` limitadas e sanitizadas através da
fronteira de inicialização do worker. Ela não muda parsing de configuração,
carregamento de extensão, construção de adaptador, comportamento fail-fast de
boot do daemon ou histórico de falhas pós-inicialização.

## Comportamento

- Se pelo menos um adaptador selecionado conecta, o worker fica pronto. Seu
  snapshot atual contém os nomes e razões dos canais que falharam, e a
  habilitação dinâmica ainda retorna sucesso com `partial: true`.
- Se todos os adaptadores falham durante uma habilitação dinâmica,
  substituição ou recarregamento, a requisição retorna
  `502 channel_worker_start_failed` com as falhas tentadas. `state` descreve o
  estado atual pós-rollback; as falhas tentadas não são persistidas nesse
  estado.
- Se todos os adaptadores falham durante o boot do daemon, a inicialização
  permanece fail-fast. Como o listener do daemon não permanece disponível,
  nenhum GET posterior é prometido.
- Uma nova geração de worker limpa as falhas de inicialização da geração
  anterior.

Apenas rejeições de `connect()` produzem esses registros. `phase` atualmente é
`connect`; o SDK deliberadamente o amplia para `string` para que uma futura
fase aditiva não requeira uma mudança de tipo com quebra. Os valores de `code`
do adaptador são diagnósticos e não uma taxonomia estável entre adaptadores.

## Contrato

Um snapshot atual do worker pode conter:

```ts
interface ChannelStartupFailure {
  channel: string;
  phase: 'connect';
  code?: string;
  message: string;
}

interface ChannelWorkerSnapshot {
  startupFailures?: ChannelStartupFailure[];
  startupFailuresTruncated?: boolean;
}
```

Uma falha de inicialização dinâmica pode conter adicionalmente falhas anotadas
com o workspace confiável do supervisor:

```ts
interface ChannelStartupAttemptFailure extends ChannelStartupFailure {
  workspaceCwd: string;
}
```

A string de erro existente de nível superior, campos de rollback e estado
permanecem compatíveis. Todos os novos campos são opcionais.

## IPC e ciclo de vida

O filho envia uma mensagem `channel_startup_failure` de cada catch de
`connect()` e espera por `channel_startup_report_ack` antes de tentar o
próximo adaptador. O pai valida, sanitiza, armazena e só então reconhece o
item. O callback de envio não é a fronteira de durabilidade: ele prova apenas
que o Node aceitou a mensagem, enquanto o ACK prova que o supervisor a
processou antes que o worker possa sair de forma síncrona.

No máximo 64 falhas são transferidas. A falha 65 produz um marcador
`channel_startup_failures_truncated`, que também é reconhecido; falhas
posteriores permanecem apenas no stderr. Apenas um relatório está pendente,
então o ACK não precisa de identificador de requisição.

Mensagens de protocolo de inicialização malformadas, excessivamente longas,
fora de ordem ou irreconhecíveis falham a inicialização limitada e encerram o
filho. Mensagens IPC desconhecidas não relacionadas mantêm seu comportamento
existente. O schema e a validação existentes de pronto são intencionalmente
inalterados.

Todo caminho terminal pré-pronto envolve falhas já aceitas em
`ChannelWorkerStartupError`. Erros de reconciliação e do gerenciador clonam
esses detalhes enquanto preservam problemas de limpeza ou restauração
separadamente como `rollbackError`. O workspace é adicionado a partir da
configuração do supervisor, nunca do IPC do filho.

## Segurança e limites

Worker e supervisor ambos normalizam caracteres de controle e invisíveis,
redigem exatamente o token do daemon e valores sensíveis de ambiente, aplicam
regras genéricas de credenciais e truncam por code point Unicode. Os limites
de resposta HTTP de falha dinâmica e exibição do CLI validam novamente,
aplicam redação genérica, limitam a saída e ignoram entradas malformadas.

Os limites são 64 falhas, 128 code points para canal, 64 para código e 512
para mensagem. Objetos de falha e snapshots são clonados nas fronteiras de
posse para impedir que chamadores mutem o estado do supervisor.

## Alternativas rejeitadas

- Ler o stderr no supervisor é ambíguo, acopla o comportamento à prosa do log
  e não pode fornecer atribuição confiável de canal.
- Esperar apenas pelo callback de `process.send()` ainda corre contra a saída
  síncrona do worker.
- Persistir uma última tentativa falha mudaria a semântica do ciclo de vida e
  sobrepõe o trabalho separado de último erro/histórico; falhas dinâmicas, em
  vez disso, vivem apenas na resposta que falhou.
- Inventar categorias de auth/rede/configuração criaria uma taxonomia instável
  entre adaptadores. A implementação preserva apenas uma string fornecida
  pelo adaptador ou um código numérico finito.

## Verificação

Cobertura unitária exercita ordenação de ACK, falha total/parcial, caminhos
de interrupção e timeout, entrada de protocolo malformada, falha de ACK,
acesso seguro a exceções, redação exata e genérica, cópias profundas, reset de
geração, truncamento 64/65, propagação de rollback, validação HTTP, exports do
SDK e formatação do CLI. O teste de integração real de plugin-example usa uma
porta alocada localmente e depois fechada para produzir `ECONNREFUSED`
determinístico sem credenciais externas ou dependências de rede.
