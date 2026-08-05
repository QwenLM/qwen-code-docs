# Plano de implementação de confiabilidade de runtime do Ripgrep

## 1. Contexto e decisões

Quando o ripgrep está ausente, o Qwen Code já fornece as principais cadeias
de fallback:

```text
内置 ripgrep -> 系统 ripgrep -> GrepTool
                                 -> git grep
                                 -> 系统 grep
                                 -> JavaScript 文件遍历
```

O trabalho restante de alto ROI é garantir a integridade dos resultados em
runtime, em vez de introduzir mais uma dependência binária ou outra camada
genérica de fallback. Este plano implementa as quatro melhorias relacionadas
a seguir como uma única alteração com limites bem definidos:

1. Quando for confirmado que o ripgrep falhou com um erro `EAGAIN` ao criar
   threads, tentar novamente uma vez em modo single-thread.
2. Interpretar o código de saída 1 como "nenhuma correspondência" somente
   quando tanto stdout quanto stderr estiverem vazios.
3. Distinguir entre uma busca que não foi executada por completo e um
   truncamento comum de saída, e nunca reportar uma busca não concluída como
   "nenhuma correspondência encontrada".
4. Registrar telemetria de recuperação em runtime sem dados de privacidade,
   para que o ganho real possa ser medido.

### Fora do escopo

- Não introduzir `@vscode/ripgrep`; o Qwen Code já empacota binários para
  diferentes plataformas.
- Não alterar a ordem de seleção atual de "versão embutida primeiro, versão
  do sistema em seguida".
- Não reduzir permanentemente o número de threads do ripgrep.
- Não alternar automaticamente para `GrepTool` após cada falha em runtime.
  Erros de permissão, de argumentos e de sistema de arquivos devem
  permanecer visíveis e não devem ser ocultados atrás de uma busca
  semanticamente diferente e mais lenta.
- Não tentar novamente `EAGAIN` durante a fase de inicialização do processo
  filho do Node.js. Um processo que não foi iniciado com sucesso não pode se
  beneficiar do argumento `--threads 1` do ripgrep; esses problemas ainda
  devem ser tratados como uma falha explícita de `spawn`.

## 2. Propósito das mudanças e comportamento antes/depois

Esta mudança não serve para tornar a busca "infalível", mas para garantir
que o Qwen Code possa distinguir com precisão os três fatos a seguir: não há
mesmo correspondências; a busca falhou sem nenhum resultado disponível; a
busca falhou, mas produziu resultados parciais. Somente vendo os fatos
corretos o modelo pode decidir se reduz o escopo da busca, troca para outra
ferramenta ou continua usando os resultados parciais existentes.

### 2.1 Retentativa single-thread para EAGAIN

**Propósito da mudança:** em contêineres com recursos limitados ou ambientes
de CI, o processo do ripgrep pode ter sido iniciado com sucesso, mas não
consegue criar as threads de trabalho necessárias. Nesse caso a lógica e os
argumentos da busca em si não têm problema; reduzir a concorrência
normalmente ainda dá a chance de concluir a busca. A retentativa se aplica
apenas a falhas de criação de thread confirmadas, evitando tratar erros de
argumentos, erros de permissão ou falhas de inicialização do processo filho
como problemas recuperáveis.

**Antes:** `RipGrepTool` sempre passa `--threads 4`. `runRipgrep()` não tenta
novamente ao encontrar EAGAIN: se o erro não for primeiro interpretado como
nenhuma correspondência pelo ramo do código de saída 1 e não houver stdout,
a ferramenta retorna ao modelo um erro de grep explícito; se stdout já tiver
sido produzido, a lógica subsequente pode continuar consumindo esses
resultados parciais, mas não indicará que a busca foi encerrada
antecipadamente por EAGAIN.

```text
rg --threads 4
  -> 创建线程失败
  -> 不重试
  -> 退出码 1：被视为无匹配
  -> 其他错误且无 stdout：返回错误
  -> 有 stdout：可能被当作完整结果使用
```

**Depois:** somente quando stderr confirma EAGAIN de criação de thread
interna do ripgrep e a requisição ainda não foi cancelada, o `--threads 4`
da chamada atual é substituído por `--threads 1` e tentado novamente uma
vez. Após uma retentativa bem-sucedida, o resultado completo é retornado; se
a retentativa ainda falhar, um erro ou um resultado parcial explicitamente
marcado é retornado. Buscas subsequentes continuam usando 4 threads, sem
perda permanente de velocidade por causa de uma falha temporária.

```text
rg --threads 4
  -> 确认线程创建 EAGAIN
  -> rg --threads 1，仅重试一次
     -> 成功：返回完整结果
     -> 失败且无 stdout：返回明确错误
     -> 失败但有 stdout：返回明确标记的部分结果
```

### 2.2 Restringir a determinação de sem correspondências do código de saída 1

**Propósito da mudança:** impedir que o Qwen Code interprete qualquer código
de saída 1 com mensagens de erro ou saída anômala como "este conteúdo não
existe no repositório". "Nenhuma correspondência" é uma conclusão forte que
afeta o raciocínio subsequente do modelo, e só pode ser usada quando o
ripgrep realmente expressou sem correspondências de forma normal.

**Antes:** `runRipgrep()` retorna stdout vazio imediatamente ao ver
`error.code === 1`, descartando o stdout e o stderr que a chamada carregava.
Mesmo que o código de saída 1 venha acompanhado de mensagens de erro, o
modelo acaba vendo `No matches found`.

```text
退出码 1 + 空 stdout + 空 stderr -> No matches found
退出码 1 + 非空 stderr           -> No matches found
退出码 1 + 非空 stdout           -> stdout 被丢弃，No matches found
```

**Depois:** o resultado normal de sem correspondências é retornado somente
quando o código de saída é 1 e stderr está vazio. Código de saída 1 com
stderr não vazio é tratado como falha de execução. stdout não participa da
determinação: o código de saída 1 do ripgrep não pode carregar resultados de
correspondência, e no modo `--json` o ripgrep emite um evento de summary ao
final do stdout mesmo com zero correspondências.

```text
退出码 1 + 空 stderr   -> No matches found
退出码 1 + 非空 stderr -> 明确的执行错误
```

### 2.3 Distinguir resultado truncado de resultado não concluído

**Propósito da mudança:** deixar claro para o modelo que "apenas uma parte
foi exibida para controlar o tamanho da saída" e "a busca subjacente não foi
executada até o fim" são duas coisas completamente diferentes. A primeira
ainda prova que essas correspondências existem na busca completa; a segunda
não pode ser usada para provar que não há correspondências em outros
arquivos.

**Antes:** `runRipgrep()` usa `truncated` para carregar simultaneamente
encerramentos subjacentes como timeout e estouro do buffer máximo, e
`RipGrepTool` o combina com limites de linhas e caracteres para exibição.
Quando ocorre um erro mas stdout já foi produzido, a ferramenta só lança um
erro se stdout estiver vazio; stdout não vazio continua sendo analisado.
Isso pode se manifestar como um resultado comum, `(truncated)`, ou até mesmo
entrar em um dos dois ramos `No matches found` quando stdout está vazio ou
nenhuma correspondência válida foi analisada. O modelo não consegue
determinar com confiabilidade se a busca foi realmente concluída.

**Depois:** o corte ativo da camada de exibição usa apenas `truncated`;
encerramentos antecipados causados por timeout, estouro do buffer máximo ou
outros erros de execução usam `incomplete`. A ordem de tratamento primeiro
verifica a integridade da execução e depois verifica se existem
correspondências válidas:

| Resultado de execução após a mudança                 | Resultado visto pelo modelo                        | Conclusão que o modelo pode tirar                                     |
| ---------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Execução completa e sem correspondências             | `No matches found`                                 | Pode considerar que não há correspondências no escopo desta busca      |
| Execução completa mas exibição acima do limite       | Resultado com `(truncated)`                        | A busca foi concluída, apenas nem todas as linhas correspondentes foram exibidas |
| Execução incompleta e sem correspondências válidas   | Erro explícito de busca não concluída              | Não se pode concluir que não há correspondências no repositório; deve ajustar a busca ou usar outro método |
| Execução incompleta mas com correspondências válidas | Resultado parcial com `(incomplete)` e aviso fixo  | Pode usar as correspondências retornadas, mas não pode com isso excluir outros locais |
| Corte de exibição e execução incompleta simultâneos  | Mostra `(truncated)` e `(incomplete)` ao mesmo tempo | Nem todos os resultados obtidos foram exibidos, e a busca subjacente também não foi concluída |

### 2.4 Telemetria de recuperação em runtime

**Propósito da mudança:** medir a frequência, a taxa de sucesso e os tipos de
falha das retentativas de EAGAIN e da proteção de integridade de resultados
em ambientes reais, para decidir com dados se vale a pena continuar
investindo em capacidades mais complexas de fallback em runtime, evitando ao
mesmo tempo coletar o conteúdo das consultas dos usuários e informações do
repositório.

**Antes:** o `RipgrepFallbackEvent` existente é emitido apenas quando a
sonda de inicialização falha e o Qwen Code alterna de `RipGrepTool` para
`GrepTool`. EAGAINS, timeouts, estouros do buffer máximo, encerramentos
anômalos ou falhas de spawn após a inicialização não têm métricas
estruturadas dedicadas, então não é possível responder se "a recuperação em
runtime é realmente útil".

**Depois:** um novo `RipgrepRuntimeRecoveryEvent` semanticamente independente,
emitido apenas quando uma retentativa ocorre ou quando a execução final é
anômala. O evento registra a escolha do binário embutido/sistema, se uma
retentativa foi disparada, se a retentativa teve sucesso e uma classificação
fixa de falha, mas não registra a expressão de busca, caminhos, stdout,
stderr, nomes de arquivo ou mensagens de erro brutas. Buscas normais bem-
-sucedidas não emitem evento, evitando aumentar o volume de log sem sentido.

### 2.5 Proteção de liquidação única

**Propósito da mudança:** garantir que a nova lógica de retentativa seja
executada no máximo uma vez. O callback de `execFile` e o evento `error` do
processo filho podem chegar em sequência para a mesma falha de
inicialização; se os dois canais decidirem separadamente tentar novamente,
duas buscas single-thread podem ser iniciadas.

**Antes:** ambos os canais podiam tentar resolver a mesma Promise. Como a
Promise aceita apenas a primeira liquidação e atualmente não há lógica de
retentativa, normalmente não surge execução duplicada visível ao usuário,
mas a estrutura não é adequada para receber um ramo de recuperação.

**Depois:** o helper de execução única usa um guard de liquidação
compartilhado e produz apenas um resultado de execução estruturado. A lógica
externa deve esperar esse resultado antes de decidir se tenta novamente,
portanto uma busca inicia no máximo uma chamada de recuperação.

### 2.6 Mudança geral de comportamento

```text
修改前
执行 rg
  -> code 0：处理结果
  -> code 1：一律视为无匹配
  -> 其他错误且无 stdout：返回错误
  -> 其他错误但有 stdout：可能作为完整或截断结果继续处理

修改后
执行 rg
  -> code 0：处理完整结果
  -> code 1 + stdout/stderr 均为空：确认无匹配
  -> 已确认线程 EAGAIN：单线程重试一次
  -> 最终失败且无 stdout：返回明确错误
  -> 最终失败但有 stdout：保留可用匹配项并标记 incomplete
  -> 除取消外的最终异常或恢复：发送不包含查询内容的结构化 telemetry
```

## 3. Semânticas de runtime obrigatórias

### 3.1 Resultado de execução única

Refatore `runRipgrep()` em `packages/core/src/utils/ripgrepUtils.ts`,
extraindo um helper interno de execução única. Esse helper deve preservar os
comportamentos existentes de buffer de 20 MB, timeout dependente de
plataforma, `AbortSignal`, stdout parcial e remoção da última linha
possivelmente incompleta.

O helper deve garantir liquidação única. `execFile` pode reportar uma falha
de inicialização simultaneamente pelo callback e pelo evento `error` do
processo filho, então o callback e o tratamento do evento devem
compartilhar a mesma proteção de liquidação. Somente após a primeira chamada
do helper retornar é que se pode decidir por uma retentativa; nenhum canal
de conclusão pode iniciar diretamente uma retentativa.

Use valores fixos e sem informações sensíveis para classificar falhas:

```typescript
type RipgrepFailureKind =
  | 'eagain'
  | 'timeout'
  | 'max_buffer'
  | 'exit'
  | 'spawn';
```

Cancelamentos não pertencem à telemetria de falha em runtime e não devem
disparar retentativa.

### 3.2 Determinação de sem correspondências

Somente quando as duas condições a seguir forem atendidas simultaneamente,
uma chamada é interpretada como concluída com sucesso mas sem
correspondências:

```text
退出码 === 1
stderr.trim() === ''
```

Convenção de códigos de saída do ripgrep: 0 = correspondência encontrada,
1 = sem correspondências e sem erro, 2 = ocorreu um erro. O código de saída
1 não pode carregar resultados de correspondência, então não é necessário
verificar stdout. No modo `--json`, o ripgrep emite um evento `summary` ao
final do stdout mesmo com zero correspondências, então stdout vazio ou não
não pode servir de critério.

Código de saída 1 com stderr não vazio é uma falha de execução.

### 3.3 Recuperação de EAGAIN

Somente quando todas as condições a seguir forem atendidas simultaneamente,
tente novamente uma vez:

- É a primeira execução, não uma retentativa.
- A requisição ainda não foi cancelada.
- stderr confirma falha de criação de thread interna do ripgrep: corresponde
  ao marcador curto `os error 11`, ou exige que o contexto de criação de
  thread e a mensagem completa de erro de recurso indisponível estejam
  presentes ao mesmo tempo. Não deve corresponder apenas ao texto genérico
  de recurso indisponível.
- A lista de argumentos existente contém o par atual de argumentos
  `--threads 4`.

Na retentativa, substitua o valor do número de threads por `1`. Não
adicione atraso, não suporte outras formas de escrita de argumentos sem
demanda real, nem persista o modo single-thread para buscas subsequentes.
Após uma retentativa bem-sucedida, retorne o resultado completo de sucesso,
sem preservar o erro ou o estado incompleto produzido pela primeira
tentativa.

### 3.4 Completo, truncado e execução incompleta

Distinga claramente os três estados a seguir:

- **Completo:** o ripgrep foi executado até o fim normalmente.
- **Truncado:** o Qwen Code limitou ativamente, por número de linhas ou
  caracteres, uma saída originalmente completa, para fins de exibição.
- **Execução incompleta:** o ripgrep terminou por um erro de execução após
  produzir stdout, incluindo encerramento por timeout e por estouro do
  buffer máximo; as correspondências existentes são apenas parte do
  resultado da busca no repositório.

Estenda `RipgrepRunResult` com metadados estruturados, em vez de stderr
bruto ou texto de erro:

```typescript
interface RipgrepRecoveryMetadata {
  selectionMode: 'builtin' | 'system';
  retryTriggered: boolean;
  retrySucceeded?: boolean;
  failureKind?: RipgrepFailureKind;
}

interface RipgrepRunResult {
  stdout: string;
  incomplete: boolean;
  error?: Error;
  recovery: RipgrepRecoveryMetadata;
}
```

A implementação pode simplificar ainda mais a estrutura concreta, mas o
resultado do utilitário não pode continuar usando o campo atual `truncated`
para representar falhas de timeout ou estouro do buffer máximo. O corte da
camada de exibição é calculado por `RipGrepTool`; o utilitário é
responsável por reportar o estado de execução não concluída e o resultado da
retentativa. Os metadados de recuperação não devem conter expressão de
busca, caminhos de busca, stdout, stderr ou mensagens de erro brutas.

Em `packages/core/src/tools/ripGrep.ts`, primeiro é preciso verificar se a
execução foi completa antes de entrar nos dois ramos existentes de
`No matches found`:

| Resultado de execução                                              | Comportamento da ferramenta                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Ocorreu erro e não há stdout                                       | Retorna erro explícito de execução de grep                      |
| Ocorreu erro e há stdout, mas nenhuma correspondência válida foi analisada | Retorna erro explícito de busca não concluída; nunca retorna sem correspondências |
| Ocorreu erro e pelo menos uma correspondência válida foi analisada | Retorna as correspondências parciais e usa um aviso fixo indicando que a busca não foi concluída |
| Execução completa mas sem correspondências válidas                 | Retorna o resultado existente de sem correspondências            |

Resultados parciais usam `(incomplete)` em `returnDisplay` e emitem um aviso
fixo para o LLM, por exemplo: `Busca não executada por completo: os resultados acima podem não incluir todas as correspondências.` Os limites comuns
de quantidade de resultado continuam usando `(truncated)`. Esses dois
rótulos podem coexistir, mas não podem substituir um ao outro. Quando a
execução falha, o atual aviso enganoso `[0 lines truncated]` não pode
continuar sendo produzido.

## 4. Telemetria de runtime

Adicione um `RipgrepRuntimeRecoveryEvent` independente; não reutilize
`RipgrepFallbackEvent`, que representa especificamente a alternância da
ferramenta registrada na fase de inicialização de `RipGrepTool` para
`GrepTool`.

Emita o novo evento apenas quando uma retentativa ocorre ou quando a
execução final é anômala. Os campos obrigatórios são:

```typescript
selection_mode: 'builtin' | 'system';
retry_triggered: boolean;
retry_succeeded?: boolean;
failure_kind: 'eagain' | 'timeout' | 'max_buffer' | 'exit' | 'spawn';
```

Não registre expressão de busca, caminhos, stdout, stderr, mensagens de erro
brutas ou nomes de arquivo. Buscas normais bem-sucedidas sem recuperação não
emitem o novo evento.

`ripgrepUtils.ts` continua sem depender de `Config` nem de telemetria. Ele
apenas retorna os metadados de recuperação; `RipGrepTool.performRipgrepSearch()`,
que possui o `Config`, emite o evento antes de retornar resultados parciais
ou lançar o erro final.

Integre o evento pela camada de telemetria existente:

- `packages/core/src/telemetry/types.ts`
- `packages/core/src/telemetry/constants.ts`
- `packages/core/src/telemetry/loggers.ts`
- `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`
- Exportação pública de telemetria em `packages/core/src/telemetry/index.ts`

Cubra os caminhos existentes do Qwen logger e de log do OpenTelemetry. Não é
necessário projetar uma integração separada de Clearcut.

## 5. Ordem de implementação

1. Adicione o helper de execução única e uma estrutura de testes unitários
   focados com mock de `execFile`, incluindo o `EventEmitter` do processo
   filho e o comportamento de liquidação única.
2. Restrinja a determinação do código de saída 1 e adicione a classificação
   de falhas, sem ainda alterar o comportamento de retentativa.
3. Adicione a retentativa única para EAGAIN de thread confirmado,
   substituindo `--threads 4` por `--threads 1`.
4. Passe `incomplete` estruturado e os metadados de recuperação de
   `runRipgrep()` para `RipGrepTool`.
5. Atualize os dois pontos de determinação de sem correspondências para
   renderizar os avisos de execução incompleta e de truncamento,
   respectivamente.
6. Adicione e integre o evento independente de telemetria de recuperação em
   runtime na camada da ferramenta.
7. Execute a verificação focada e depois o build, o typecheck e o processo
   de auto-revisão exigidos pelo repositório.

Manter esses passos independentes entre si ajuda a localizar rapidamente
problemas de regressão e também evita que o trabalho de telemetria obscureça
as mudanças centrais de semântica de resultado.

## 6. Plano de testes

### `packages/core/src/utils/ripgrepUtils.test.ts`

Use mocks hoisted do Vitest para simular `node:child_process` e cubra:

- Código de saída 1 com stdout e stderr ambos vazios resulta em resultado
  completo de sem correspondências.
- Código de saída 1 com stderr não vazio resulta em falha `exit`.
- Código de saída 1 com stdout não vazio preserva o stdout e marca execução
  incompleta.
- Após EAGAIN de thread confirmado, tenta novamente uma vez e conclui com
  sucesso usando `--threads 1`.
- Após EAGAIN de thread confirmado, tenta novamente uma vez, mas a
  retentativa ainda falha.
- A retentativa substitui apenas o número de threads existente e não
  modifica o array de argumentos passado pelo chamador.
- `AbortError`/`ABORT_ERR` não disparam retentativa.
- `EAGAIN` durante a fase de inicialização do processo filho não dispara
  retentativa e é classificado como `spawn`.
- Em timeout e estouro do buffer máximo, a saída parcial remove a última
  linha possivelmente incompleta.
- O callback e o evento `error` do processo filho não podem causar liquidação
  duplicada nem iniciar duas retentativas.

### `packages/core/src/tools/ripGrep.test.ts`

Cubra a semântica voltada ao chamador da ferramenta:

- Execução completa produzindo saída vazia ainda retorna `No matches found`.
- Execução incompleta contendo correspondências válidas retorna essas
  correspondências e um aviso claro de não concluída.
- Stdout de execução incompleta sem nenhuma correspondência válida analisada
  retorna erro de execução incompleta, em vez de `No matches found`.
- Ocorrendo erro e sem stdout, ainda retorna erro explícito de execução de
  grep.
- Os rótulos de truncamento e de execução incompleta permanecem
  independentes e podem coexistir.

### Testes de telemetria

Estenda os testes do logger e do Qwen logger para verificar:

- O evento de retentativa bem-sucedida contém modo de seleção, estado de
  disparo, estado de sucesso e classificação EAGAIN.
- O resultado de exceção final contém a classificação fixa de falha.
- Uma busca normal bem-sucedida não produz evento de recuperação em runtime.
- Nome de evento do OpenTelemetry, body e atributos do Qwen logger estão
  corretos.
- Não existem campos de expressão de busca, caminhos, stdout, stderr ou erro
  bruto no evento.

## 7. Condições de verificação e aceitação

Conforme exigido por `AGENTS.md`, execute a partir do package correspondente
ou da posição do repositório:

```bash
cd packages/core && npx vitest run src/utils/ripgrepUtils.test.ts
cd packages/core && npx vitest run src/tools/ripGrep.test.ts
cd packages/core && npx vitest run src/telemetry/loggers.test.ts
npm run typecheck
npm run build
```

Se a implementação modificar testes dedicados do Qwen logger além de
`loggers.test.ts`, os arquivos de teste focado correspondentes também devem
ser executados.

Somente quando as condições a seguir forem atendidas a alteração pode ser
considerada concluída:

- Um EAGAIN de thread do ripgrep confirmado dispara no máximo uma
  retentativa single-thread.
- Cancelamentos e falhas de inicialização do processo filho nunca disparam
  essa retentativa.
- Somente código de saída 1 com stderr vazio indica sem correspondências
  (sem verificar stdout).
- Nenhum caminho de execução incompleta pode entrar nos dois ramos de
  retorno `No matches found`.
- Correspondências parciais ainda são úteis para o modelo, mas devem ser
  explicitamente marcadas como execução incompleta.
- A telemetria consegue medir a recuperação sem coletar conteúdo de consulta
  ou conteúdo do repositório.
- Testes focados, typecheck e build passam completamente.
- Auto-revisão do diff completo conforme exigido pelo repositório, com duas
  verificações consecutivas sem problemas após a última correção.

## 8. Custo, benefícios e rollback

O custo de implementação estimado é de cerca de 1,5 a 3 dias de trabalho de
engenharia, incluindo testes e integração de telemetria. O escopo foi
intencionalmente mantido menor que um refactor geral de fallback em runtime.

Os benefícios diretos incluem:

- Quando o ripgrep não consegue criar o número normal de threads de
  trabalho, a busca pode ser recuperada em ambientes de CI ou contêineres
  com recursos limitados.
- Elimina falsos negativos produzidos quando o código de saída 1 vem
  acompanhado de erro.
- Elimina o problema de resultados parciais de busca se passarem por
  evidência completa do repositório.
- Obtém dados de produção para julgar se vale a pena continuar investindo em
  outras capacidades de recuperação.

O escopo de rollback é localizado: o ramo de retentativa e o evento de
runtime podem ser removidos sem alterar a seleção de binário ou a lógica
existente de fallback de inicialização. Mesmo revertendo a retentativa em
si, a determinação mais estrita de sem correspondências e a semântica de
execução incompleta devem ser preservadas, porque sua proteção de correção
é independente da frequência real de ocorrência de EAGAIN.

## 9. Opiniões de review incorporadas

Um subagente já revisou este plano com base no código-fonte atual do
repositório. Seu review fez os seguintes ajustes substanciais ao rascunho
inicial:

- Não reutilizar a telemetria de fallback de inicialização, trocando por um
  evento de runtime independente;
- Mover o ponto de emissão da telemetria da camada do utilitário para
  `RipGrepTool`;
- Remover a retentativa especulativa com atraso para `EAGAIN` na fase de
  inicialização do processo filho;
- Restringir a detecção de EAGAIN a falhas confirmadas de criação de thread;
- Remover o suporte a argumentos de thread ausentes e outras formas de
  escrita de argumentos atualmente impossíveis de ocorrer;
- Distinguir `incomplete` de `truncated`;
- Exigir a verificação de integridade da execução antes dos dois ramos de
  sem correspondências;
- Exigir que a determinação de sem correspondências do código de saída 1 se
  baseie em stderr vazio (sem verificar stdout);
- Adicionar testes de regressão de liquidação única e de zero
  correspondências válidas;
- Restaurar o passo de build do repositório necessário para verificação
  futura da implementação.
