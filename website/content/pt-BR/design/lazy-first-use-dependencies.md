# Carregamento lazy no primeiro uso para dependências de codificação, terminal e Git

## Contexto

A issue #7264 rastreia dependências presentes na closure de import estático
eager do processo filho ACP mesmo que a maioria das sessões nunca as use. O
candidato 5 agrupa três pacotes com fronteiras de primeiro uso distintas:

| Pacote                   | Closure ACP baseline | Primeiro uso                                                      |
| ------------------------ | -------------------: | ----------------------------------------------------------------- |
| `iconv-lite`             |        551.713 bytes | Ler ou escrever texto não UTF-8 sem BOM                           |
| `@xterm/headless`        |        213.071 bytes | Iniciar um shell pelo caminho PTY                                 |
| `simple-git`             |        146.526 bytes | Executar uma operação Git de worktree, limpeza ou extensão GitHub |
| **Total direto de pacotes** |   **911.310 bytes** |                                                                   |

O total direto é de aproximadamente 890 KiB. A closure estática completa do
ACP também contém módulos que se tornam inalcançáveis quando esses pacotes
saem do caminho eager, então a redução medida no nível do bundle pode ser
maior.

## Objetivos

- Remover todos os três pacotes da closure de import estático do filho ACP.
- Preservar os helpers públicos síncronos atuais de codificação.
- Carregar cada pacote uma vez, no seu primeiro uso real, sem nova
  configuração.
- Preservar o comportamento de fallback de shell, comportamento de Git,
  metadados de codificação de arquivo, tratamento de BOM e escritas atômicas.
- Adicionar um guarda de bundle para que futuros imports não possam restaurar
  silenciosamente esses pacotes na closure eager.
- Validar a mudança usando a mesma disciplina de aceitação de 2 vCPU, 4 GiB
  dos outros candidatos em #7264.

## Não objetivos

- Alterar as APIs públicas de codificação de síncronas para assíncronas.
- Substituir `iconv-lite`, `@xterm/headless` ou `simple-git`.
- Alterar seleção de PTY, semântica de worktree, detecção de codificação ou
  política de erro.
- Otimizar código que roda depois que essas dependências já foram carregadas.

## Descobertas da closure de import

O bundle baseline construído a partir de
`febb43bc9266cc7a3363539df87d90d752ad782c` tem uma closure estática do ACP de
13.405.027 bytes em 144 saídas. Um percurso pelo metafile do esbuild atribui
551.713 bytes a `iconv-lite`, 213.071 bytes a `@xterm/headless` e 146.526
bytes a `simple-git`.

Os imports lazy iniciais no nível do pacote não foram suficientes. A CLI
continha imports dinâmicos de namespace de produção da raiz do pacote Core. Em
um build do esbuild com code-splitting, requisitar o namespace inteiro mantém
toda exportação da raiz alcançável, incluindo o export de compatibilidade de
codificação síncrona. O design, portanto, requer tanto carregadores locais de
dependência quanto módulos de entrada de runtime estreitos da CLI que
re-exportam apenas os símbolos que cada caminho adiado consome.

## Design

### Propriedades do carregador compartilhado

Cada pacote tem um carregador local de pacote apoiado por uma promise com
escopo de módulo. Primeiros usuários concorrentes compartilham o mesmo import,
e usuários posteriores reutilizam o módulo resolvido. Os carregadores
normalizam as formas de interop CommonJS emitidas pelo Node e pelo esbuild e
expõem apenas os membros de runtime que seus consumidores precisam.

Os carregadores usam deliberadamente `import()` em vez de `createRequire()`.
O bundle de produção é autônomo e não deve depender de uma árvore
`node_modules` instalada separadamente. Imports dinâmicos permitem que o
esbuild emita chunks autossuficientes enquanto mantém esses chunks fora da
closure estática do ACP.

### `@xterm/headless`

`ShellExecutionService.execute()` já é assíncrono. O serviço primeiro obtém a
implementação de PTY, então carrega `@xterm/headless` imediatamente antes de
entrar no caminho de execução PTY. Ele reverifica o sinal de abort após o
import assíncrono e passa o construtor `Terminal` resolvido para os helpers
síncronos existentes de PTY e replay.

Se o chunk de terminal falhar ao carregar, o erro permanece dentro da
fronteira de falha PTY existente e a execução cai no fallback para
`child_process`, correspondendo à política de fallback atual. Nenhum
carregamento de pacote ocorre quando o suporte a PTY está indisponível ou o
caminho de processo filho é selecionado.

### `simple-git`

Todas as operações Git reais nos consumidores auditados são assíncronas.
`GitWorktreeService` mantém a construção sem efeitos colaterais e resolve uma
promise `SimpleGit` por instância apenas quando seu primeiro método Git é
chamado. Outros consumidores do Core usam o mesmo carregador local de pacote
diretamente.

A limpeza de inicialização usa primeiro a descoberta leve existente de raiz de
repositório. Ela carrega `simple-git` apenas quando um repositório real está
presente e a inspeção de worktree obsoleto é necessária. Um import com falha
rejeita a operação na mesma fronteira assíncrona onde uma falha de
inicialização de Git já era reportada.

### `iconv-lite`

Este pacote tem o principal requisito de compatibilidade:
`decodeBufferWithEncodingInfo()` e `encodeTextFileContent()` são APIs públicas
síncronas. O import dinâmico de JavaScript é assíncrono, então tornar essas
funções diretamente lazy seria uma quebra de API.

As APIs síncronas permanecem disponíveis por meio de um módulo de
compatibilidade que importa estaticamente `iconv-lite`. Apenas a borda de
re-exportação da raiz do Core é marcada como livre de efeitos colaterais para
o bundle, permitindo que o esbuild descarte o módulo de compatibilidade quando
uma entrada específica não usa esses exports. Outros imports do módulo mantêm
o tratamento normal de efeitos colaterais.

Caminhos internos assíncronos de serviço de arquivo usam variantes lazy:

- Escritas vazias, marcadas com BOM, UTF-8 válido, ASCII e UTF-8 completam sem
  carregar `iconv-lite`.
- Uma leitura detectada como não UTF-8 carrega o codec antes de decodificar.
- Uma escrita que preserva metadados não UTF-8 carrega o codec antes de
  codificar.
- Uma falha de carregamento ou decodificação no lado da leitura mantém o aviso
  atual e o fallback de substituição UTF-8.
- Uma falha de carregamento ou codificação no lado da escrita rejeita a
  escrita em vez de corromper bytes.

Os imports adiados de namespace do Core da CLI são substituídos por módulos de
entrada de runtime locais estreitos. Isso evita reter toda exportação da raiz
do Core enquanto preserva a mesma instância empacotada do Core e identidade de
classe.

## Guarda de bundle

O guarda de fast path do ACP trata `iconv-lite`, `@xterm/headless` e
`simple-git` como pacotes estáticos proibidos. Um caminho estático a partir da
entrada do ACP falha na verificação; caminhos apenas dinâmicos são permitidos.
Testes cobrem tanto a rejeição quanto as fronteiras dinâmicas permitidas.

Este guarda avalia o grafo de import do metafile em vez do texto do bundle,
então um chunk renomeado ou símbolo minificado não pode contorná-lo.

## Auditoria de compatibilidade e falha

| Área                                        | Comportamento preservado                                   | Nova fronteira                                                          |
| ------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Execução de shell                           | Tratamento de saída PTY, replay, abort, fallback de processo filho | O chunk de terminal é carregado após a seleção de PTY            |
| Worktrees e extensões GitHub                | Opções existentes de `simple-git` e propagação de erros    | O módulo Git é carregado na primeira operação Git assíncrona            |
| Leituras de texto                           | Fast paths de BOM e UTF-8, metadados de codificação, decodificação de fallback | O codec é carregado apenas para um fallback detectado não UTF-8 |
| Escritas de texto                           | Preservação de BOM, codificação não UTF-8, comportamento de escrita atômica | O codec é carregado apenas quando metadados não UTF-8 o exigem |
| API pública do Core                         | Assinaturas e comportamento dos helpers síncronos de codificação | O export de compatibilidade pode sofrer tree-shake de entradas que não o usam |

O design não introduz configuração mutável global de processo. As promises de
carregador são locais de processo e idempotentes. Imports rejeitados
permanecem rejeitados, o que é apropriado porque um chunk empacotado ausente
ou corrompido não pode se recuperar durante o mesmo tempo de vida do processo.

## Alternativas consideradas

### Converter as APIs síncronas de codificação para promises

Rejeitado porque quebra chamadores públicos e amplia uma otimização de
inicialização que de outra forma seria interna.

### Usar `createRequire()` no primeiro uso

Rejeitado porque tornaria a CLI empacotada dependente de uma instalação
`node_modules` em runtime e não produziria um artefato de release
autossuficiente.

### Reimplementar as tabelas de codificação ou o comportamento de terminal

Rejeitado como substancialmente mais arriscado do que adiar os pacotes
existentes.

### Lançar apenas `@xterm/headless` e `simple-git`

Isso seria mais simples, mas deixaria o maior pacote do grupo no caminho eager
e não satisfaria o candidato 5. A fachada de compatibilidade e os módulos de
entrada de runtime estreitos removem `iconv-lite` sem alterar sua API pública.

## Plano de verificação

1. Construir os artefatos de produção apenas da CLI e empacotá-los com code
   splitting do esbuild.
2. Percorrer a closure estática do metafile da entrada do ACP e exigir zero
   bytes atribuídos para todos os três pacotes.
3. Executar testes unitários focados para leituras e escritas de codificação,
   execução e fallback de shell, comportamento de worktree Git, limpeza,
   operações de extensão GitHub, cada carregador e o guarda de bundle.
4. Executar os testes da CLI afetados, o build e o typecheck completo.
5. No host de referência de 2 vCPU, 4 GiB, executar um smoke test pareado
   seguido de 30 pares frios seriais alternados e 30 pares pré-aquecidos.
   Reportar `channel.initialize`, latência processo→primeira sessão, pico de
   RSS da árvore de processos, concorrência, comportamento com telemetria
   desativada, comportamento legado de sessão única e processos residuais.

## Resultado estático medido

| Variante  | Saídas do ACP | Closure estática do ACP |   `iconv-lite` | `@xterm/headless` |   `simple-git` |
| --------- | ------------: | ----------------------: | -------------: | ----------------: | -------------: |
| Baseline  |           144 |        13.405.027 bytes |  551.713 bytes |     213.071 bytes |  146.526 bytes |
| Candidato |           142 |        12.314.617 bytes |        0 bytes |           0 bytes |        0 bytes |
| Diferença |            −2 |   **−1.090.410 bytes** | −551.713 bytes |    −213.071 bytes | −146.526 bytes |

O resultado de desempenho remoto deve ser avaliado separadamente porque bytes
de bundle não implicam melhoria de latência.

## Resultado medido em 2C4G

O host remoto tinha 2 vCPUs, 3,5 GiB de RAM total, sem swap, e Node.js
22.23.1. Uma execução de smoke separada de um par e seus cenários funcionais
passaram antes da execução formal. A execução formal então completou 30 pares
frios seriais alternados e 30 pares pré-aquecidos alternados, seguidos por
outro conjunto de cenários funcionais, sem sessões com falha ou processos
residuais.

O candidato formal era o artefato de protótipo copiado com SHA-256
`f0ac7edc7665752efac7b7bfbb4fb055ce2d8ef1a8ae5dd1af630305a2c84d28`, rotulado
`febb43bc9266cc7a3363539df87d90d752ad782c+candidate5` pelo harness. O
resultado se aplica àquele artefato exato, não a um SHA de commit futuro; um
PR deve manter o hash do artefato ou reexecutar o gate se seu código de
produção mudar.

| Cenário      | Métrica                 | Baseline P50 / P95 | Candidato P50 / P95 | Diferença P50 | Mediana pareada | Candidato vence |
| ------------ | ----------------------- | -----------------: | ------------------: | ------------: | --------------: | --------------: |
| Frio         | `channel.initialize`    |   896,2 / 915,5 ms |    831,5 / 848,5 ms |  **−64,7 ms** |        −60,1 ms |           30/30 |
| Frio         | `POST /session`         | 1273,8 / 1305,3 ms |  1156,5 / 1181,1 ms | **−117,4 ms** |       −105,1 ms |           30/30 |
| Frio         | processo → primeira sessão | 1877,7 / 1921,0 ms |  1733,3 / 1763,8 ms | **−144,4 ms** |       −136,2 ms |           30/30 |
| Frio         | pico de RSS da árvore de processos |   417,0 / 451,4 MB |    408,1 / 419,2 MB |   **−8,9 MB** |         −8,5 MB |           18/30 |
| Pré-aquecido | `channel.initialize`    |   895,3 / 926,3 ms |    837,2 / 861,6 ms |  **−58,1 ms** |        −49,2 ms |           30/30 |
| Pré-aquecido | `POST /session`         |     90,0 / 94,2 ms |      83,3 / 86,7 ms |   **−6,7 ms** |         −6,5 ms |           28/30 |
| Pré-aquecido | processo → primeira sessão | 3697,3 / 3723,0 ms |  3666,0 / 3676,6 ms |  **−31,3 ms** |        −29,6 ms |           30/30 |
| Pré-aquecido | pico de RSS da árvore de processos |   430,5 / 433,1 MB |    403,0 / 419,3 MB |  **−27,5 MB** |        −13,9 MB |           19/30 |

O candidato também passou em primeiras sessões concorrentes, inicialização com
telemetria desativada e inicialização legada de sessão única. Uma sonda de
primeiro uso com configuração de produção passou em codificação/decodificação
GBK, construção e escrita de terminal headless, identidade single-flight de
carregador e uma inicialização real de repositório `simple-git` local. O host
remoto não tem executável `git`, então a sonda remota de `simple-git`
verificou carregamento de módulo e construção de fábrica, mas não pôde
executar um comando Git real; as suítes locais completas do serviço Git cobrem
essas operações.

O gate de aceitação é satisfeito: as vitórias no caminho frio são consistentes
em todos os 30 pares de latência, permanecem visíveis na métrica de
inicialização de canal pré-aquecida e não trocam latência por memória mais
alta.

## Riscos e lançamento

O principal risco é uma falha apenas de primeiro uso que imports eager
anteriormente expunham na inicialização. Testes focados exercitam os caminhos
de primeiro uso, e o guarda de bundle de produção verifica que os imports
permanecem dinâmicos. Execuções remotas de smoke e aceitação exercitam sessões
ACP empacotadas reais e verificam processos residuais.

Este candidato deve permanecer um PR separado, como exigido por #7264, para
que sua superfície de regressão e efeito de desempenho permaneçam atribuíveis.
Se o gate 2C4G não mostrar benefício de inicialização repetível ou uma
regressão significativa de primeiro uso, a implementação não deve ser lançada
apenas pela redução de tamanho de bundle.

## Referências

- [Code splitting do esbuild](https://esbuild.github.io/api/#splitting)
- [Análise de metafile do esbuild](https://esbuild.github.io/api/#metafile)
- [Expressões de import dinâmico do Node.js](https://nodejs.org/api/esm.html#import-expressions)
- [Interoperabilidade CommonJS do Node.js](https://nodejs.org/api/esm.html#interoperability-with-commonjs)
