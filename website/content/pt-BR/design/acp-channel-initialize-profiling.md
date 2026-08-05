# Profiling de Initialize do Canal ACP

## Resumo

O span `channel.initialize` do daemon começa depois que o filho ACP é gerado
e termina quando o filho retorna sua resposta de initialize do ACP. Ele,
portanto, inclui inicialização do Node e do ESM, bootstrap do CLI,
carregamento de módulos do ACP, `Config.initialize()` de bootstrap,
configuração do transport e o handler de initialize. O handler em si apenas
retorna capabilities e não se espera que explique a latência observada.

Este design adiciona um perfil fixo, opt-in, de inicialização do filho à
resposta de initialize do ACP e copia as durações validadas para o span pai
existente `channel.initialize`. Ele não muda prontidão do canal, ordenação de
inicialização, tratamento de falhas ou comportamento de sessão.

## Protocolo

A bridge requisita a versão 1 do perfil através de metadata da requisição de
initialize:

```json
{
  "_meta": {
    "qwen.daemon.channelStartupProfile": { "v": 1 }
  }
}
```

Filhos compatíveis retornam o perfil sob a mesma chave de metadata de
resposta de nível superior. A resposta contém apenas campos fixos de duração,
um flag de completude, o timestamp de parede de construção da resposta e a
duração total do processo filho até a resposta. Nunca contém caminhos, nomes
de extensões, configurações ou outros valores derivados do usuário.

O perfil divide a inicialização do filho em fases de nível superior não
sobrepostas:

- início do processo até prontidão do profiler;
- import do módulo Gemini;
- parsing de argumentos;
- carregamento de configurações;
- construção do Config;
- inicialização genérica da aplicação;
- import de módulos do ACP;
- inicialização do Config de bootstrap;
- construção do transport;
- execução do handler de initialize;
- tempo não atribuído entre as fases fixas.

A inicialização do Config de bootstrap é dividida em refresh inicial de
extensão, hooks, skills, refresh final de extensão, memória hierárquica,
registro de ferramentas, warmup de ferramentas e tempo residual. A sondagem
de ripgrep é reportada como filha do tempo de registro de ferramentas e não é
subtraída novamente ao calcular o tempo residual. O tempo não atribuído de
nível superior também inclui a espera entre a configuração do transport e a
requisição de initialize chegar ao handler do filho.

Todas as durações usam `performance.now()` e são arredondadas para duas casas
decimais. O epoch de construção da resposta usa `performance.timeOrigin` mais
o mark da resposta e é usado apenas para a estimativa opcional de transporte
no lado do pai.

## Ciclo de vida da coleta

O CLI inicializa dinamicamente o profiler do ACP apenas quando os argumentos
brutos contêm `--acp` ou `--experimental-acp`, antes de importar o runtime
Gemini. O profiler armazena o primeiro timestamp para uma união finita de
nomes de mark. Ele não executa I/O de arquivo, captura de heap,
inicialização de telemetria ou retenção dinâmica de eventos.

O sink de eventos de inicialização do core encaminha eventos fixos de fase do
Config ao profiler do ACP apenas enquanto o Config de bootstrap do ACP está
inicializando. Isso impede que a inicialização posterior de Config por sessão
contamine o perfil de inicialização. Fases do Config puladas ainda emitem
marks adjacentes de início e fim para que uma inicialização bem-sucedida
possa produzir um perfil completo em modo bare ou safe.

O handler de initialize congela o profiler após construir a primeira
resposta, independentemente de o chamador ter negociado o perfil. Marks
ausentes produzem `complete: false`; a coleta nunca atrasa nem falha a
resposta de initialize.

## Enriquecimento do span pai

A bridge valida a metadata da resposta antes de adicionar atributos numéricos
fixos ao span ativo `channel.initialize`. Versões desconhecidas de perfil são
ignoradas. Campos desconhecidos são ignorados. Valores conhecidos devem ser
finitos, não negativos e não maiores que 600 segundos. Campos conhecidos
inválidos ou ausentes são omitidos e tornam o flag de completude efetivo
falso.

A estimativa opcional de transporte da resposta é o tempo de recebimento do
pai menos o epoch de construção da resposta do filho. É registrada apenas
quando finita, não negativa e não maior que o timeout configurado de
initialize.

O parsing do perfil e o enriquecimento de telemetria são fail-open. Um perfil
ausente, malformado ou não suportado não deve mudar o sucesso do initialize,
o teardown do canal, o comportamento coalescido do chamador ou o
comportamento de retry. Novos pais permanecem compatíveis com filhos antigos
porque a metadata do ACP é extensível; novos filhos não retornam perfil para
pais antigos que não optaram.

## Verificação

Testes focados cobrem ativação e congelamento do coletor, aritmética de fases
fixas, tamanho do payload, negociação de protocolo, perfis malformados,
enriquecimento de span, isolamento de falhas de telemetria, ordenação de
eventos do Config e o limite de bundle do fast path do serve. O candidato
construído como release é comparado com a base exata do merge do #6907 no
host representativo 2C4G com execuções frias pareadas e alternadas antes que
qualquer otimização seja selecionada.

## Decisão de otimização P0-B

O perfil P0-A no 2C4G atribuiu 67,3% do P50 de inicialização do filho ao
carregamento de módulos Gemini e ACP. Perfis de CPU então mostraram que a
compilação de módulos fonte era o maior custo de CPU e que o grafo de import
estático do ACP carregava Ink, React, React Reconciler e Yoga mesmo que o
filho ACP não renderize uma TUI.

As arestas opcionais eram dependências existentes apenas de UI em vez de um
novo ponto de entrada do ACP. A Session do ACP importava um classificador de
erro de API através de um hook do React; a conclusão de extensão importava
seu formato de dados e limite de resultado através de um componente de
renderização; o registro de comandos carregava estaticamente suporte de UI
necessário apenas quando `/init` pede confirmação, o modo de aprovação entra
em modo auto ou o histórico recolhido expande. A otimização move os dois
helpers de dados puros para fora dos módulos de renderização, torna o import
de tipos do React apenas de tipos e carrega as três dependências de ações
interativas apenas quando essas ações executam.

A resposta de initialize do ACP, a ordenação de inicialização, a
inicialização do Config, o conteúdo do registro de comandos, o tratamento de
falhas e o comportamento da Session permanecem inalterados. Uma verificação
de bundle-metafile segue a closure de saída estática do agente ACP e rejeita
entradas de Ink, React, React Reconciler ou Yoga enquanto continua
permitindo-os atrás de imports dinâmicos.

A comparação causal usou artefatos de release construídos do mesmo commit de
main, `af6a9b640c5d9097c5151b8705dd73aee8e180d0`, com apenas esta otimização
aplicada ao candidato. Duas execuções frias alternadas produziram 60 pares
após um warmup excluído; uma execução alternada pré-aquecida separada
produziu 30 pares. A segunda execução fria foi iniciada depois que a primeira
execução expôs duas paralisações de listener do pai no lado do candidato
antes do caminho ACP. Nenhuma amostra de nenhuma das execuções foi
descartada. Os resultados P50 frios agrupados foram:

| Métrica                   | Controle pareado | Candidato P0-B |          Mudança |
| ------------------------- | ---------------: | -------------: | ---------------: |
| Import do ACP             |        115,06 ms |        52,00 ms | -63,06 ms (-54,8%) |
| Processo filho até resposta |      1102,88 ms |      1041,09 ms |        -61,80 ms |
| `channel.initialize`      |       1098,25 ms |      1035,61 ms |        -62,64 ms |
| Processo até primeira Session |    2046,88 ms |      1980,03 ms |        -66,85 ms |
| Requisição de Session fria |      1358,95 ms |      1290,23 ms |        -68,72 ms |

Todos os 60 perfis frios em cada variante e todos os 30 perfis pré-aquecidos
em cada variante estavam completos. Toda execução saiu limpamente, e Sessions
iniciais concorrentes, inicialização com telemetria desabilitada e
comportamento legado padrão `single` tiveram sucesso em ambas as rodadas
funcionais. Nos dados frios agrupados, o P95 de Session quente mudou de
137,53 ms para 104,98 ms, o P95 de primeiro health de 962,99 ms para 824,14
ms e o P95 de RSS da árvore de processos de 442,27 MiB para 435,70 MiB. Nos
dados pré-aquecidos, o P50 de Session mudou de 73,90 ms para 73,75 ms e o
P95 de 88,38 ms para 76,17 ms.

Paralisações transitórias do host inteiro afetaram ambas as variantes e foram
retidas. Na primeira execução de 30 pares, duas paralisações de listener do
pai do candidato elevaram o P95 de primeiro health de 803,82 ms para 1175,67
ms mesmo que as próprias requisições de health levassem 6-11 ms e o caminho
ACP alterado não tivesse iniciado. O retry de diagnóstico inverteu a direção,
com P95 de primeiro health controle/candidato de 1522,44/727,64 ms; agrupar
todos os 60 pares retidos produziu os valores acima. O merge exato do P0-A
também foi comparado com o candidato como uma verificação secundária de 30
pares e mostrou independentemente a mesma redução de import do ACP e nenhuma
regressão de P95.

O candidato de carregamento de módulos, portanto, passa no gate P0-B: a fase
selecionada melhora mais de 30% e 10 ms, enquanto tanto `channel.initialize`
quanto o P50 de processo-até-primeira-Session melhoram mais de 10 ms.
Construtores de comando yargs de nível superior lazy foram rejeitados porque
sua melhoria na fase selecionada não passou do gate de 30%. Registro de
ferramentas e warmup permanecem um design separado de desacoplamento de
descritores; refresh de extensão, memória hierárquica e transporte eram
pequenos demais para justificar uma mudança de comportamento P0.
