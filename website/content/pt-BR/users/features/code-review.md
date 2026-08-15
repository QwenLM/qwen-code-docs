# Revisão de Código

> Revise alterações de código quanto à correção, segurança, performance e qualidade de código usando o `/review`.

## Início Rápido

```bash
# Review local uncommitted changes
/review

# Review a pull request (by number or URL)
/review 123
/review https://github.com/org/repo/pull/123

# Review and post inline comments on the PR
/review 123 --comment

# Review local changes and apply the findings to your working tree
/review --fix

# Review a specific file
/review src/utils/auth.ts

# Quick unverified pass (no subagents)
/review --effort low
/review 123 --effort medium
```

Se não houver alterações pendentes de commit, o `/review` avisará e parará — nenhum agente será iniciado.

## Níveis de Esforço

`--effort low|medium|high` troca profundidade por velocidade:

| Nível    | O que executa                                                                                                                                                 | Limite de achados     | Veredito                              | Publica no PR    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------- | ---------------- |
| `low`    | 3-6 ângulos inline direcionados sobre o diff (escalados pelo tamanho do diff) mais um gap sweep — sem subagentes, sem build/teste, sem regras do projeto       | 10 (não verificados)  | Nenhum                                | Nunca            |
| `medium` | O pipeline high sem suas passagens mais caras: o fan-out paralelo do finder sobre um conjunto reduzido de dimensões, mais build/teste e uma única passagem de verificação | Ilimitado (verificado) | Approve limitado a Comment           | Nunca            |
| `high`   | Pipeline completo: 14 agentes paralelos → verificação em shards → auditoria reversa iterativa                                                                  | Ilimitado (verificado) | Approve / Request changes / Comment | Com `--comment` |

Padrões: **high** para revisões de PR, **medium** para revisões locais e de arquivo. Um `--comment` efetivo força o high (comentários publicados devem sobreviver à verificação) — em um alvo que não é PR, `--comment` é ignorado com um aviso e **não** altera o esforço. O medium mantém os agentes de segurança e cobertura de testes e o build/teste, e descarta as personas adversariais, os finders especializados e a auditoria reversa — então um Crítico sutil que apenas o segundo olhar revelaria pode passar; use `--effort high` para revisões sensíveis à segurança ou pré-release. Apenas o `low` é não verificado. O isolamento de worktree se aplica a revisões de PR no mesmo repositório; PRs entre repositórios são executados em modo leve (apenas diff, sem worktree ou build/teste). A passagem low é rotulada como não verificada, não emite veredito e nunca escreve no cache de revisão incremental, então uma execução posterior com `--effort high` nunca é ignorada como "já revisado"; o medium é verificado, mas seu Approve é limitado a Comment, porque nada olhou duas vezes para o que a primeira passagem deixou passar. A mecânica de obtenção do diff é idêntica em todos os níveis — revisões de PR sempre usam o worktree isolado e a mesma resolução de base, então a revisão nunca é contra a base errada. Uma diferença de escopo permanece: o cache incremental é apenas do high, então uma re-revisão high pode cobrir apenas os novos commits (`lastCommitSha..HEAD`), enquanto low/medium sempre revisam o diff completo do PR.

## Como Funciona

O comando `/review` executa um pipeline de múltiplos estágios:

```
Step 1:  Determine scope + effort level (local diff / PR worktree / file)
         Capture the diff to a file + partition it into chunks
Step 2:  Load project review rules (medium/high)
Step 3C: low effort: 3-6 inline angles + gap sweep     [0 subagent calls]
Step 3A: high, <=500 src AND <=3200 total: 14 agents       [14+ LLM calls]
           |-- Agent 0: Issue Fidelity & Root-Cause Ownership
           |-- Agent 1a: Correctness — line-by-line scan
           |     (incl. language-pitfall + wrapper-routing checks)
           |-- Agent 1b: Correctness — removed-behavior audit
           |-- Agent 1c: Correctness — cross-file tracer
           |-- Agent 2: Security
           |-- Agent 3a: Reuse & duplication
           |-- Agent 3b: Altitude & abstraction fit
           |-- Agent 3c: Consistency & clarity
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 personas: 6a/6b/6c)
           |-- Agent 8: Diff-specialized finders (0-2, only when
           |     the diff's domain calls for them)
           '-- Agent 7: Build & Test (runs shell commands)
Step 3B: high, >500 src OR >3200 total: territory x dim.   [N+5..7+3H calls]
           (N chunks, 5-7 whole-diff agents, 3 invariant
            agents per heavy file H)
           |-- 1 chunk agent per ~400 diff lines (all dimensions,
           |     its territory only, returns a coverage receipt)
           |-- 3 invariant agents per heavily-rewritten source
           |     file (whole file; state/timers, counters/
           |      returns/errors, config/early-returns)
           |-- Agent 0: Issue Fidelity      (whole diff)
           |-- Agent 7: Build & Test        (whole repo)
           |-- Agent 1b: Removed-behavior   (whole diff — the
           |     cross-chunk half; chunks keep the local half)
           |-- Agent 1c: Cross-file tracer  (whole diff)
           |-- Agent 8: Specialized finders (whole diff, 0-2)
           '-- Test coverage matrix         (whole diff)
Step 4:  Deduplicate --> Sharded verify (<=8 findings each)
           --> Aggregate                    [ceil(F/8) calls, F=findings]
Step 5:  Iterative reverse audit, fanned out per chunk;
           stop after 2 consecutive dry rounds (cap 5)
Step 6:  Present findings + verdict (high; low pass: findings only)
         Canonicalize findings -> .qwen/tmp/...-findings.json
Step 6B: Apply findings + record per-finding outcomes  (--fix only)
Step 7:  Submit PR review (inline comments, if requested; high only)
Step 8:  Save report + incremental cache (cache: high only)
Step 9:  Clean up (remove worktree + temp files)
```

Os estágios 3A/3B/4/5 são o pipeline de esforço high; com `--effort low|medium`, uma única passagem inline (Etapa 3C) os substitui.

### Agentes de Revisão

| Agente                              | Foco                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agente 0: Fidelidade da Issue       | Evidências da issue vinculada, responsabilidade pela causa raiz e se o PR resolve o problema relatado                                                                                                                                                                                                         |
| Agente 1a: Varredura linha a linha  | Percorre cada hunk mais sua função envolvente: condições erradas, off-by-one, `await` faltando, armadilhas específicas da linguagem, roteamento de wrapper/proxy                                                                                                                                             |
| Agente 1b: Auditoria de comportamento removido | Percorre cada linha excluída/substituída: nomeia a invariante que ela aplicava e busca onde o novo código a restabelece — incluindo **exports** removidos, cuja substituição geralmente vive em outro arquivo e alterou silenciosamente um padrão. No 3B, executa no diff inteiro (agentes de chunk mantêm a metade local) |
| Agente 1c: Rastreador entre arquivos | Percorre os chamadores de cada símbolo alterado (direção do consumidor) e os sites de leitura de cada campo adicionado (direção do produtor), mais alterações de callee no mesmo PR                                                                                                                          |
| Agente 2: Segurança                 | Injeção, XSS, SSRF, bypass de autenticação, exposição de dados sensíveis                                                                                                                                                                                                                                      |
| Agente 3a: Reuso e duplicação       | O codebase já tem isso? Faz grep do comportamento, nomeia o helper existente para chamar no lugar, e sinaliza código morto que o diff deixa para trás                                                                                                                                                         |
| Agente 3b: Altitude e abstração     | A correção está na profundidade certa — ou é um remendo em infraestrutura compartilhada, uma compensação downstream para um bug upstream, ou uma abstração servindo um único call site?                                                                                                                       |
| Agente 3c: Consistência e clareza   | Consistência entre irmãos (uma guarda que um membro de uma família paralela tem mas seu gêmeo não deriva), desvio de convenção contra um exemplo local citado, nomes/comentários enganosos, complexidade desnecessária                                                                                      |
| Agente 4: Performance e Eficiência  | Queries N+1, vazamentos de memória, re-renderizações desnecessárias, tamanho do bundle                                                                                                                                                                                                                        |
| Agente 5: Cobertura de Testes       | Caminhos de código não testados no diff, cobertura de branches faltando, asserções fracas                                                                                                                                                                                                                     |
| Agente 6: Auditoria Não Direcionada | 3 personas paralelas (atacante / plantão das 3am / mantenedor) — captura problemas entre dimensões                                                                                                                                                                                                            |
| Agente 7: Build e Teste             | Executa comandos de build e teste, relata falhas                                                                                                                                                                                                                                                              |
| Agente 8: Finders especializados em diff | 0-2 finders extras escritos por revisão quando o diff se concentra em um domínio com modos de falha conhecidos (lógica de reconexão, module loaders, agendadores, codecs)                                                                                                                                |

Os três agentes de Correção são **procedurais**: cada um é definido por como percorre o diff (linha a linha / linhas excluídas / arestas entre arquivos), não por uma taxonomia de bugs — então sua cobertura é complementar em vez de sobreposta. O mesmo raciocínio divide a **qualidade de código em três** (3a/3b/3c): um agente segurando um checklist de seis itens finaliza um item — medido em um arquivo fortemente reescrito, um agente segurando um checklist de oito itens encontrou 1 de 5 defeitos e o mesmo modelo dividido em três partes encontrou todos os 5 — então o checklist de qualidade é cortado onde as perguntas genuinamente diferem. Todos os agentes executam em paralelo (o Agente 1 lança 3 variantes procedurais, o Agente 3 lança 3 fatias do checklist, e o Agente 6 lança 3 variantes de persona concorrentemente, totalizando 14 tarefas paralelas para revisões de PR no mesmo repositório, mais 0-2 finders do Agente 8 quando o domínio do diff os exigir — então 14-16 na prática; o Agente 0 é ignorado em revisões de diff local e caminho de arquivo, que executam 13-15; o modo leve entre repositórios também ignora os Agentes 1c e 7, executando 12-14).

Todo achado deve declarar um **cenário de falha** — a entrada, estado ou timing concreto que o dispara e o resultado errado que resulta (para achados de qualidade, o custo concreto em vez disso). Um achado que não pode nomear seu cenário é descartado na origem, e a verificação re-rastreia o cenário reivindicado através do código real em vez de julgar a prosa do achado.

Uma vez que um PR carrega mais de 500 linhas de mudança de **código-fonte** — ou mais de 3.200 linhas de diff no total, além das quais os onze leitores do diff inteiro estão cada um diluídos demais para ler com atenção (um limite de atenção, não uma promessa de menos chamadas — arquivos pesados e finders especializados podem fazer o 3B custar mais) — esse fan-out por dimensão é substituído por um fan-out de **território × dimensão**: o diff é dividido em chunks de ~400 linhas — as fronteiras caem em limites de hunk, e um hunk grande demais para caber é dividido apenas em uma declaração de nível superior, nunca dentro de uma função — e cada chunk recebe seu próprio agente que aplica cada dimensão de revisão apenas àquele chunk.

O gate deliberadamente conta linhas de código-fonte em vez de linhas de diff. Código de teste, prosa e lockfiles dominam o tamanho do diff — nos últimos 40 PRs mergeados deste repositório, o diff mediano é 41% testes — então um gate no tamanho bruto dividiria uma mudança de produção de 173 linhas em territórios só porque ela embarcou 489 linhas de novos testes, deixando esse código de produção com um revisor em vez de dez lentes (os agentes de leitura de diff — doze menos Fidelidade da Issue e Build & Teste). O chunking ainda cobre cada linha de qualquer forma, testes incluídos; o que o gate decide é quantos revisores existem e o que cada um deve fazer. Dez lentes de leitura de diff todas percorrendo um diff grande leem os mesmos hunks iniciais dez vezes; um agente por chunk significa que cada linha do diff tem exatamente um revisor responsável. Cada agente de chunk retorna um recibo `Covered:`, e um chunk sem recibo é re-revisado antes da execução prosseguir — então "sem bloqueadores" nunca pode ser reportado sobre código que ninguém leu.

Um arquivo **fonte** que é majoritariamente reescrito (um arquivo existente de 300+ linhas que agora é 40%+ novo, ou tem 800+ linhas alteradas) também recebe **três agentes de invariante do arquivo inteiro**. Arquivos de teste e gerados nunca se qualificam — o checklist pergunta sobre campos, timers e taxonomias de erro, que um arquivo de teste reescrito não tem. Seus bugs geralmente não estão dentro de um hunk específico, mas _entre_ as novas linhas — um timer armado perto do topo do arquivo e um caminho de teardown dois mil linhas abaixo. Cada agente lê o arquivo inteiro pós-alteração e percorre dois ou três itens de um checklist fixo: campos mutáveis limpos em todo caminho de saída, timers cancelados em todo fechamento (e cancelamento não descarta dados capturados), inserções em mapas correspondidas por remoções, contadores de retry incrementados em toda entrada, valores de retorno de status realmente verificados, códigos de erro classificados exaustivamente como permanentes vs transitórios, campos de configuração honrados em todo caminho, e returns antecipados que pulam um efeito colateral obrigatório.

O checklist é dividido em três partes de propósito. Entregar todas as oito verificações para um agente em um arquivo de 2.400 linhas faz com que uma seja feita corretamente; três agentes com duas ou três verificações cada fazem todas elas. Agentes de chunk não substituem isso — no PR #6457 eles continham cada um desses defeitos dentro de seu território atribuído e não reportaram nenhum. O que lhes faltava não eram as linhas, mas a pergunta.

Os achados são verificados em **shards** (no máximo 8 achados por agente de verificação, todos lançados juntos). Um verificador pode rejeitar um Crítico apenas citando o código que o contradiz (ou quando os próprios comentários do diff documentam o comportamento sinalizado como deliberado); qualquer coisa menos certa é rebaixada para baixa confiança em vez de deletada — um Crítico silenciosamente rejeitado é invisível para todo estágio posterior, enquanto um rebaixado ainda chega a um humano. Após a verificação, a **auditoria reversa iterativa** busca lacunas, com um auditor por chunk por rodada, cada um com a lista cumulativa de achados. O loop para após **duas rodadas consecutivas sem achados** (ou 5 rodadas, limite rígido — reportado como tal em vez de como convergência). Uma rodada sem achados não é evidência de convergência, e achados da auditoria reversa são verificados como qualquer outro.

## Níveis de Severidade

| Severidade         | Significado                                                             | Publicado como comentário no PR?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Crítico**     | Deve ser corrigido antes do merge (bugs, segurança, perda de dados, falhas de build) | Sim (apenas alta confiança) |
| **Sugestão**   | Melhoria recomendada                                             | Sim (apenas alta confiança) |
| **Desejável** | Otimização opcional                                               | Não (apenas terminal)         |

Achados de baixa confiança aparecem em uma seção separada "Necessita Revisão Humana" no terminal e nunca são publicados como comentários no PR.

## Isolamento de Worktree

Ao revisar um PR, o `/review` cria um worktree temporário do git (`.qwen/tmp/review-pr-<number>`) em vez de trocar o seu branch atual. Isso significa que:

- Sua árvore de trabalho, alterações staged e branch atual **nunca são modificados**
- As dependências são instaladas no worktree (`npm ci`, etc.) para que o build/teste funcione
- Os comandos de build e teste são executados em isolamento, sem poluir o seu cache de build local
- Se algo der errado, seu ambiente não é afetado — basta deletar o worktree
- O worktree é limpo automaticamente após a conclusão da revisão
- Se uma revisão for interrompida (Ctrl+C, crash), o próximo `/review` do mesmo PR limpa automaticamente o worktree obsoleto antes de começar do zero
- Os relatórios de revisão e o cache são salvos no diretório principal do projeto (não no worktree)

## Revisão de PR entre Repositórios

Você pode revisar PRs de outros repositórios passando a URL completa:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Isso é executado no **modo leve** — sem worktree, sem build/teste. A revisão é baseada apenas no texto do diff (buscado via API do GitHub). Comentários no PR ainda podem ser publicados se você tiver acesso de escrita.

| Recurso                                                            | Mesmo repositório | Entre repositórios               |
| ------------------------------------------------------------------ | ----------------- | -------------------------------- |
| Revisão por LLM (Agentes 0, 1a, 1b, 2-6 + verificação + auditoria reversa iterativa) | ✅        | ✅                               |
| Agente 1c: Rastreador entre arquivos                               | ✅                | ❌ (sem codebase local para grep) |
| Agente 7: Build e teste                                            | ✅                | ❌ (sem codebase local)           |
| Agente 8: Finders especializados em diff (0-2, quando o domínio exigir) | ✅                | ✅ (precisa apenas do diff)       |
| Comentários inline no PR                                           | ✅                | ✅ (se você tiver acesso de escrita) |
| Cache de revisão incremental                                       | ✅                | ❌                               |

## Comentários Inline no PR

Use `--comment` para publicar achados diretamente no PR:

```bash
/review 123 --comment
```

Ou, após executar `/review 123`, digite `post comments` para publicar os achados sem reexecutar a revisão.

**O que é publicado:**

- Achados Críticos e de Sugestão de alta confiança como comentários inline em linhas específicas, cada um prefixado com `**[Critical]**` ou `**[Suggestion]**` para que os bloqueadores sejam distinguíveis das recomendações
- Quando a correção é uma edição localizada única, um bloco ` ```suggestion ` que você pode aplicar com um clique
- Para vereditos de Approve/Request changes: um resumo da revisão com o veredito
- Para o veredito Comment com todos os comentários inline publicados: nenhum resumo separado (os comentários inline são suficientes)
- Rodapé de atribuição do modelo e da versão da CLI em cada comentário (ex.: _— qwen3-coder via Qwen Code /review (v0.21.2)_); defina `review.attribution` como `false` no seu `settings.json` de usuário ou sistema (o `.qwen/settings.json` do workspace é ignorado para configurações `review.*`) para publicar sem ele

**O que fica apenas no terminal:**

- Achados Desejáveis
- Achados de baixa confiança

**PRs de autoria própria:** O GitHub não permite que você submeta revisões `APPROVE` ou `REQUEST_CHANGES` no seu próprio pull request — ambas falham com HTTP 422. Quando o `/review` detecta que o autor do PR corresponde ao usuário autenticado atual, ele rebaixa automaticamente o evento da API para `COMMENT`, independentemente do veredito, para que a submissão ainda tenha sucesso. O terminal ainda mostra o veredito real ("Approve" / "Request changes" / "Comment") — apenas o evento de revisão no lado do GitHub é neutralizado. Os achados reais ainda aparecem como comentários inline em linhas específicas, então o feedback substancial não é alterado.

**Revisar novamente um PR com comentários anteriores do Qwen Code:** quando o `/review` é executado em um PR que já possui comentários de revisão anteriores do Qwen Code, ele os classifica antes de publicar novos. Apenas **sobreposição na mesma linha** (um comentário existente no mesmo `(path, line)` de um novo achado) solicita que você confirme — esse é o caso em que você veria um duplicado visual na mesma linha de código. Comentários de commits mais antigos, comentários respondidos (tratados como resolvidos) e comentários que simplesmente não se sobrepõem a nenhum novo achado são ignorados silenciosamente, com uma linha de log no terminal para que você saiba o que foi filtrado.

**Verificação de status de CI / build antes do APPROVE:** se o veredito for "Approve", o `/review` consulta as check-runs e os status de commit do PR antes de submeter. Se alguma verificação falhou (ou todas as verificações ainda estão pendentes), o evento da API é rebaixado automaticamente de `APPROVE` para `COMMENT`, com o corpo da revisão explicando o motivo. Justificativa: a revisão por LLM lê o código estaticamente e não consegue ver falhas de testes em tempo de execução; aprovar enquanto o CI está vermelho seria enganoso. Os achados inline ainda são publicados inalterados. Se você quiser aprovar mesmo assim (ex.: uma falha de CI conhecida por ser instável), submeta a aprovação no GitHub manualmente após verificar.

## Aplicando os Achados (`--fix`)

`--fix` é o `--comment` refletido. `--comment` escreve em um **pull request**, então precisa de um; `--fix` escreve em uma **árvore de trabalho**, então precisa de uma que sobreviva à revisão:

```bash
/review --fix                 # alterações locais não commitadas
/review src/auth.ts --fix     # um único arquivo
```

Em um **alvo de PR, é ignorado com um aviso** — uma revisão de PR executa em um worktree efêmero que é deletado quando a revisão termina, então edições "corrigidas" lá são descartadas minutos depois. Use `--comment` para publicar os achados.

Um `--fix` efetivo **fixa o esforço no mínimo em medium**, porque edita seus arquivos e o `low` não executa verificação: aplicar um achado não verificado é o mesmo erro que publicar um, direcionado à sua árvore de trabalho em vez do PR de alguém. Não força o `high` — os achados do medium são verificados, e a auditoria reversa que o `high` adiciona busca achados que estão _faltando_, o que não é o que decide se deve aplicar um ou não.

Após a revisão, cada achado é aplicado com a ferramenta `edit` e então **registrado**, de três formas:

| Resultado          | Significado                                          | Continua na sua conta? |
| ------------------ | ---------------------------------------------------- | ---------------------- |
| `fixed`            | A edição está na sua árvore                          | Não                    |
| `skipped`          | Real, não aplicado — o motivo é reportado junto      | Sim                    |
| `no_change_needed` | O achado estava errado, ou o código já tratava isso  | Não                    |

Um achado é ignorado quando sua correção alteraria o comportamento pretendido, precisaria de mudanças bem fora do diff revisado, ou se revela um falso positivo em uma segunda análise.

**Todo achado recebe um resultado, e isso é imposto em vez de solicitado.** O registro passa por `qwen review findings --outcomes`, que recusa um conjunto que não cubra todos — um fixer que aplica seis de nove achados e reporta seis não mentiu sobre nenhum deles, ele encurtou a lista silenciosamente, e você não teria como ver os três que caíram.

## Achados como Dados

Achados confirmados são canonicalizados em `.qwen/tmp/qwen-review-<target>-findings.json` antes de qualquer outra coisa consumi-los — o relatório do terminal, o relatório Markdown salvo e o JSON da revisão do PR leem esse único artefato em vez de re-digitar a lista. Cada achado carrega um `id` único (no que resultados e âncoras resolvidas se juntam), `severity`, `confidence`, `source`, `summary`, um `shortSummary` limitado a 60 caracteres para renderização em listas, `failureScenario`, e uma ou mais `locations` — um achado agregado por padrão mantém **uma localização por ocorrência**, então cada um ainda recebe seu próprio comentário inline.

**Antes de qualquer outra coisa, a revisão verifica se está executando o seu código.** Cada etapa do `qwen review …` executa o bundle compilado, não a árvore de trabalho, então um comando de revisão editado desde o último build não faz efeito e a execução mede o comportamento antigo. O build registra um digest das fontes de revisão que empacotou; `parse-args` o re-deriva e compara, e `drive` verifica novamente, porque o brief do verificador envia os agentes diretamente para lá sem uma etapa 1. Em uma incompatibilidade, diz no stderr que o bundle não foi construído a partir dessas fontes e o que reconstruir. A verificação é executada quando o CLI resolve para o `dist/cli.js` empacotado (o binário `qwen`, ou `node dist/cli.js`); launchers que executam output não empacotado, como `npm start` e `npm run dev`, a ignoram. Dois casos em que não pode comparar são tratados de forma diferente: um checkout cujo build é anterior à gravação recebe a informação de que a verificação não pôde ser executada e o motivo, e um pacote instalado — que não tem fontes das quais diferir — é deixado em silêncio. O digest cobre os comandos de revisão, o arquivo que os registra, o lease exclusivo de revisão que importam de fora do seu diretório e o skill de revisão empacotado; não os segue até os helpers compartilhados que importam, então uma execução silenciosa significa que o código de revisão corresponde ao bundle, não que a árvore inteira corresponde.

**Um Crítico que a árvore base já falhou é retido, não registrado.** Quando um comando de teste falhou e a base de merge pôde ser compilada, o `test-delta` registra quais arquivos com falha também falham sem o pull request. A canonicalização lê essa medição de volta (`qwen review findings --test-delta`, ao lado de `--outcomes`): um Crítico cujo próprio texto nomeia um desses arquivos é rebaixado para Sugestão, mantém sua evidência, ganha a medição que o rebaixou e um campo `heldByMeasurement`, e o rebaixamento é anunciado. Um teste que já estava vermelho não é um teste que este pull request torna vermelho — e se agora falhar por um motivo _novo_, diga qual teste, cite ambos os lados e registre como Crítico novamente: um achado que já carrega a medição e é elevado mesmo assim é deixado onde você o colocou.

O comando valida na escrita: um id duplicado, um achado sem cenário de falha, um array de locations vazio, ou uma severidade desconhecida são um erro em vez de uma entrada silenciosamente corrompida.

## Imagens de Evidência em Comentários no PR

A API do GitHub não pode anexar imagens a comentários de revisão, então o `/review` pode hospedar imagens de evidência (screenshots da TUI, comparações de output renderizado) em um repositório que você designar e incorporá-las por URL:

```bash
export QWEN_REVIEW_ASSETS_REPO=your-org/your-repo   # um repositório onde você pode fazer push
/review 123 --comment
```

Os mantenedores tipicamente apontam para o repositório em revisão; qualquer outra pessoa pode usar um fork ou um repositório temporário. As imagens vão para o branch `pr-assets/<pr>-review` com nomes de hash de conteúdo, e os comentários as referenciam por URL com **pin de commit** — imutável mesmo que o branch se mova depois, e funcionando inalteradamente no GitHub Enterprise.

Para revisões disparadas pelo GitHub (o workflow de revisão de PR), a mesma variável é configurada a partir de uma **variável do repositório** com o mesmo nome: com a variável não configurada, o workflow passa um valor vazio e a publicação recusa — nada muda. Um mantenedor que configura `QWEN_REVIEW_ASSETS_REPO` nas variáveis de Actions do repositório (tipicamente para o próprio repositório) permite que comentários de revisão incorporem PNGs de captura; os branches que ele escreve são limpos pelo workflow de limpeza de visuais quando a variável aponta para o mesmo repositório, enquanto um destino fork ou temporário gerencia sua própria retenção.

A publicação é controlada exatamente como a postagem: sem repositório designado significa sem publicação, e uma execução não autorizada (sem `--comment` efetivo) é recusada da mesma forma que o `submit` recusa. Apenas tipos de imagem são aceitos (SVG é excluído deliberadamente), com limites de tamanho, e os bytes de cada arquivo devem corresponder ao formato que sua extensão declara — conteúdo rotulado incorretamente ou não reconhecido é recusado. Um manifesto registra cada arquivo enviado. Sem uma designação, os achados mantêm suas evidências como caminhos de arquivo locais no terminal e no relatório salvo — nada quebra, os comentários apenas permanecem apenas texto.

## Ações de Acompanhamento

Após a revisão, dicas conscientes do contexto aparecem como texto fantasma (ghost text). Pressione Tab para aceitar:

| Estado após a revisão                | Dica               | O que acontece                            |
| ------------------------------------ | ------------------ | ----------------------------------------- |
| Revisão local, `--fix` não passado   | `fix these issues` | O LLM corrige interativamente cada achado |
| Revisão de PR com achados            | `post comments`    | Publica comentários inline no PR (sem reexecutar a revisão) |
| Revisão de PR, zero achados          | `post comments`    | Aprova o PR no GitHub (LGTM)              |
| Revisão local, tudo limpo            | `commit`           | Faz o commit das suas alterações          |

Nota: `fix these issues` está disponível apenas para revisões locais, pelo mesmo motivo que o `--fix` — para revisões de PR, o worktree é limpo após a revisão, então a correção interativa pós-revisão não é possível; use `--comment` ou `post comments` para publicar os achados. Quando `--fix` foi passado, os achados já carregam resultados e nenhuma dica de correção é oferecida.

## Regras de Revisão do Projeto

Você pode personalizar os critérios de revisão por projeto. O `/review` lê as regras destes arquivos (na ordem):

1. `.qwen/review-rules.md` (nativo do Qwen Code)
2. `.github/copilot-instructions.md` (preferencial) ou `copilot-instructions.md` (fallback — apenas um é carregado, não ambos)
3. `AGENTS.md` — seção `## Code Review`
4. `QWEN.md` — seção `## Code Review`

As regras são injetadas nos agentes de revisão por LLM (0-6) como critérios adicionais. Para revisões de PR, as regras são lidas a partir do **branch base** para evitar que um PR malicioso injete regras de bypass.

## Contexto do Repositório

Repositórios podem fornecer aos revisores orientações limitadas e específicas do repositório commitando um manifesto JSON estrito em `.qwen/review-context.json`. No esforço medium ou high, o `/review` lê o manifesto após capturar o plano e anexa a orientação correspondente antes de qualquer agente ser iniciado:

```json
{
  "version": 1,
  "label": "Example repository",
  "rules": [
    {
      "paths": ["packages/*/src/**"],
      "domains": ["runtime"],
      "relatedPaths": ["packages/runtime/src/**"],
      "recommendedTests": ["npm run test:runtime"],
      "requiredConfigurations": ["debug"],
      "requiredAgents": ["test-matrix"],
      "unverifiedDimensions": ["Alternate runtime was not exercised"],
      "verificationNotes": ["Use the repository native test runner"]
    }
  ]
}
```

Uma regra se aplica quando qualquer arquivo alterado corresponde a um de seus globs em `paths` (`*`, `?` e segmentos `**`; case-sensitive). Todas as regras correspondentes combinam suas orientações: domínios e arquivos relacionados para os agentes de revisão, testes recomendados e configurações obrigatórias para o agente de build-e-teste, papéis extras de revisor (honrados apenas quando o esforço e a topologia escolhidos os executam) e limites de prova que a revisão final divulga como dimensões não verificadas. Arrays podem ser escritos em qualquer ordem; entradas duplicadas são rejeitadas.

Para revisões de PR, o manifesto é lido a partir da base de merge, para que o PR em revisão não possa se incluir ou excluir de orientações; revisões locais o leem a partir do worktree atual. Revisões de esforço low e entre repositórios ignoram o contexto do repositório. O contrato completo e o modelo de confiança estão no [design doc](../../design/review-repository-context.md).

## Fidelidade da Issue

Para PRs de correção de bugs, o agente de Fidelidade da Issue busca evidências da issue diretamente, em vez de depender do texto de descrição do PR. Ele executa o subcomando `qwen review issue-context <pr> --repo <owner/repo> --out <file>`, que resolve os metadados fortes de issues fechadas do GitHub e então busca o título de cada issue referenciada, o **corpo** (a reprodução original do reportador) e o thread completo de comentários — cada um a partir do repositório próprio da issue (um PR pode fechar uma issue em um repositório diferente). Este agente é executado apenas para alvos de PR; revisões de diff local e caminho de arquivo o ignoram.

O conjunto de issues fechadas é uma dica de descoberta, não uma prova de que o autor vinculou a issue correta: se estiver vazio, mas o PR referenciar uma issue alvo aparente, o agente ainda a busca após julgar a relevância (re-executando com `--issue <n>`; um número simples resolve no repositório do PR, enquanto `--issue <owner>/<repo>#<n>` busca uma referência entre repositórios a partir do repositório próprio dela). O texto da issue buscada é tratado como dados não confiáveis (fatos extraídos, instruções embutidas ignoradas). Para issues relevantes, a reprodução original, o payload observado, o comportamento esperado e os comentários do mantenedor são tratados como a evidência de maior prioridade para saber se o PR resolve o problema certo.

Se a evidência da issue mostrar que um serviço upstream ou provedor retornou dados malformados fora do contrato do cliente, alterações no parser ou sanitizador do lado do cliente não são tratadas como uma correção de causa raiz válida, a menos que um mantenedor tenha solicitado explicitamente uma solução defensiva (workaround). Um teste que replica a saída upstream malformada prova apenas que a solução lida com esse formato; não prova que a solução é arquiteturalmente apropriada.

Exemplo de `.qwen/review-rules.md`:

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## Revisão Incremental

Ao revisar um PR que já foi revisado anteriormente, o `/review` examina apenas as alterações desde a última revisão:

```bash
# Primeira revisão — revisão completa, cache criado
/review 123

# PR atualizado com novos commits — apenas as novas alterações são revisadas
/review 123
```

### Revisão entre modelos

Se você trocar de modelo (via `/model`) e revisar o mesmo PR novamente, o `/review` detecta a mudança de modelo e executa uma revisão completa em vez de pular:

```bash
# Revisão com o modelo A
/review 123

# Trocar de modelo
/model

# Revisar novamente — revisão completa com o modelo B (não ignorada)
/review 123
# → "A revisão anterior usou qwen3-coder. Executando revisão completa com gpt-4o para uma segunda opinião."
```

O cache é armazenado em `.qwen/review-cache/` e rastreia tanto o SHA do commit quanto o ID do modelo. Certifique-se de que este diretório esteja no seu `.gitignore` (uma regra mais ampla como `.qwen/*` também funciona). Se o commit em cache foi removido por um rebase, o sistema volta a fazer uma revisão completa. Apenas revisões de esforço high consultam ou escrevem o cache — uma passagem rápida com `--effort low|medium` nunca conta como "já revisado".

## Relatórios de Revisão

Para revisões no mesmo repositório, os resultados são salvos como um arquivo Markdown no diretório `.qwen/reviews/` do seu projeto (revisões leves entre repositórios ignoram a persistência do relatório):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Os relatórios incluem: timestamp, estatísticas do diff, resultados de build/teste, todas as descobertas com status de verificação e o veredito. Os títulos de seção e a prosa descritiva seguem a preferência de idioma de saída; identificadores técnicos (SHAs, caminhos de arquivo, nomes de gate, ids de achados) permanecem verbatim.

Revisões de esforço medium e high também salvam um companion JSON estruturado com o mesmo stem (por exemplo, `2026-04-06-143022-pr-123.json`) contendo os achados canônicos e o veredito composto como dados. O Web Shell do Qwen Code renderiza esse documento como uma visualização interativa de revisão com achados filtráveis; o relatório Markdown permanece como o arquivo legível por humanos.

As metades determinísticas do pipeline — análise de argumentos (`qwen review parse-args`) e a decisão de evento/corpo (`qwen review compose-review`) — são subcomandos testados em vez de texto de prompt, então a gramática de `--effort`, o forçamento de `--comment`, os limites de veredito e o comportamento de downgrade são fixados por testes unitários e não podem divergir com o modelo.

**GitHub Enterprise:** revisar uma URL de PR em um host diferente de `github.com` roteia todas as chamadas do GitHub nesse host — os subcomandos de revisão (`match-remote`, `meta`, `fetch-pr`, `pr-context`, `comment-status`, `issue-context`, `fetch-diff`, `comment-body`, `plan-diff`, `test-plan`, `presubmit`, `compose-review`, `submit`, `publish-assets`) aceitam `--host` e o definem no código, então um host esquecido não pode redirecionar silenciosamente a revisão para `github.com`.

Cada execução termina com uma linha legível por máquina (`Review complete: <target> — <disposition>`), então scripts e wrappers de CI podem detectar a conclusão e o resultado com um único match `^Review complete: `.

## Execuções Headless (`qwen review run`)

O `/review` é interativo. Quando um script ou job de CI precisa executar uma revisão e agir sobre seu resultado, use o wrapper headless:

```bash
qwen review run [target] [--json] [--fail-on request-changes] [--comment] [--quiet]
```

`target` é um número de PR, uma URL de PR ou um caminho de arquivo; omita para revisar a árvore de trabalho local. O comando executa o próprio CLI desta build de forma não interativa (com stdin fechado, para que a detecção de comando slash sobreviva), transmite o progresso do filho para o **stderr**, e imprime o veredito no **stdout** — ou, com `--json`, o objeto de resultado completo. O veredito é lido do artefato que o `compose-review` escreve (o mesmo JSON que a skill trata como autoridade do veredito), nunca analisado da prosa do modelo.

O código de saída é o contrato que um gate deve ler:

| Saída | Significado                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------- |
| `0`   | A revisão completou (independentemente do que decidiu)                                              |
| `1`   | Não chegou a um veredito — o filho falhou, expirou ou não deixou artefato composto                  |
| `3`   | Completou com `REQUEST_CHANGES` **e** `--fail-on request-changes` estava definido (bloqueio opt-in) |

`3` (não `2`) permite que um gate distinga "a revisão está bloqueando" de "a ferramenta quebrou" — o yargs já usa `1` para erros de uso — sem analisar nenhuma saída. `--timeout-minutes` (padrão 120, mínimo 1) termina uma revisão travada e sai com `1`, e cancelar o comando (Ctrl+C / SIGTERM) termina o grupo de processos da revisão em vez de orphaná-lo.

Uma execução com orçamento de tempo também pode exportar um deadline **soft** para que a revisão pare seu loop de auditoria reversa aberta enquanto ainda há tempo para verificar, compor e publicar: `QWEN_REVIEW_DEADLINE_EPOCH` é o momento em segundos Unix em que a execução será encerrada, e `QWEN_REVIEW_DEADLINE_RESERVE_SECONDS` (padrão 3600; `0` mantém apenas a estimativa da rodada) é a cauda que deve restar para a verificação da última rodada, `compose-review` e submissão. Quando o orçamento restante não cabe mais uma rodada mais essa cauda, o construtor de rodadas recusa construí-la, e o veredito composto divulga a auditoria truncada (um veredito Approve é limitado a Comment). Um deadline ausente ou malformado deixa a revisão sem gate — o timeout externo ainda limita a execução.

Aninhado dentro dessa reserva há um **compose floor** menor, `QWEN_REVIEW_DEADLINE_COMPOSE_FLOOR_SECONDS` (padrão 1200; `0` desabilita este gate inteiramente, em todo ponto incluindo após o deadline). A reserva é um número que cobre "verificar a última rodada **mais** compor **mais** submeter", o que cabe em uma re-rastreamento normal por achado, mas não em uma revisão de segurança cuja verificação re-executa cargas de trabalho reais de filesystem/git sem limite. Então o verificador — não o construtor de rodadas — é controlado por este floor: quando resta o floor ou menos, `agent-prompt --role verify` recusa construir (uma linha `VERIFY BUDGET:`, saída **4**), os achados em mãos mantêm sua tag de não verificados (o que limita o veredito), e o `compose-review` e a submissão executam. O floor é estritamente abaixo da reserva, então uma execução saudável atinge o gate de auditoria reversa primeiro e nunca chega a ele; é a cobertura para o único intervalo que a reserva não consegue delimitar.

## Análise de Impacto Entre Arquivos

Um rastreador entre arquivos dedicado (Agente 1c) possui essa varredura de ponta a ponta. Quando alterações de código modificam funções, classes ou interfaces exportadas, ele busca todos os chamadores e verifica a compatibilidade:

- Alterações na contagem/tipo de parâmetros
- Alterações no tipo de retorno
- Métodos públicos removidos ou renomeados
- Breaking changes na API

Ele também percorre a **direção do produtor**: cada campo, opção ou parâmetro opcional que o diff adiciona é rastreado até seus sites de leitura — incluindo arquivos que o diff nunca toca. Um caminho de código ativo lendo um campo que nada popula significa que a feature que ele controla silenciosamente não faz nada, e isso é sinalizado como Crítico no site de leitura.

Para diffs grandes (>10 símbolos modificados), a análise na direção dos chamadores prioriza funções com alterações de assinatura; a direção do produtor nunca é limitada por orçamento, porque uma assinatura inalterada é exatamente o seu ponto.

## Orçamento de Revisão

As partes do pipeline que são elásticas em tamanho de diff são escaladas a partir dele, e a escala é escrita no plano de diff para que cada estágio leia um número em vez de cada um decidir por si:

| Campo de orçamento  | O que escopo                              | Como escala                                                        |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `inlineAngles`      | Quantos ângulos `low` executam (Etapa 3C) | 3, mais um por 60 linhas de fonte, limitado aos 6 ângulos que existem |
| `sweep`             | Se o gap sweep do `low` executa           | Desligado abaixo de 25 linhas de fonte                             |
| `specialistCap`     | O teto do Agente 8                        | 0 abaixo de 80 linhas de fonte, caso contrário 2                   |
| `verifyShard`       | Achados por agente de verificação         | Fixo em 8 — uma propriedade do verificador, não do diff            |

Duas coisas que ele deliberadamente não faz. Ele **nunca remove uma dimensão**: quais agentes uma revisão deve é decidido pelo roster, que lê o nível de esforço, então um diff pequeno ainda recebe sua passagem de segurança e sua passagem de cobertura de testes. E lê linhas de **código-fonte**, não linhas de diff — uma mudança de produção de 40 linhas embarcando 900 linhas de novos testes é uma mudança pequena, e o mesmo raciocínio já governa o gate de fan-out por território.

Por que os pisos são onde estão: em uma correção de typo de nove linhas, seis caminhadas inline são cinco caminhadas sobre o nada, e o sweep — um leitor fresco buscando o que a primeira passagem não alcançou — não tem nada para buscar quando a primeira passagem alcançou tudo. O piso do Agente 8 é o substantivo: "um domínio domina o diff" é um julgamento, e um julgamento feito sobre quarenta linhas encontra um domínio dominante toda vez, porque quarenta linhas geralmente são uma coisa só.

## Eficiência de Tokens

O pipeline de esforço high limita cada estágio (tamanho de shard, rodadas de auditoria), mas as chamadas totais escalam com os achados — `ceil(F/8)` shards de verificação — e, sob o 3B, com a contagem de chunks (a auditoria reversa executa por chunk por rodada). Perfil típico do 3A:

| Estágio                              | Chamadas de LLM                | Observações                                                                                                     |
| ------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Agentes de revisão (Etapa 3)         | 14 (+0-2)                      | Executados em paralelo; entre repositórios ignora Agentes 1c e 7 (12), local/arquivo ignora Agente 0 (13)       |
| Verificação em shards (Etapa 4)      | ceil(F/8)                      | F = achados; no máximo 8 por agente de verificação, lançados juntos                                             |
| Auditoria reversa iterativa (Etapa 5) | 2-5 (3A); rodadas × chunks (3B) | Duas rodadas consecutivas sem achados para parar (limite 5); 3B lança um auditor por chunk por rodada           |
| **Total**                            | **~17-23 (~15-22)**            | 3A mesmo repositório: ~17-23 (típico ~17-19); entre repositórios ou local/arquivo: ~15-22; 3B escala com chunks (ver DESIGN.md) |

A maioria dos PRs converge para o extremo inferior da faixa; os limites previnem custos descontrolados em casos patológicos. Com `--effort low`, a revisão é executada inteiramente inline — **0 chamadas de subagentes** — percorrendo o diff uma vez por ângulo em vez de uma vez no total.

## O que NÃO é Sinalizado

A revisão exclui intencionalmente:

- Problemas pré-existentes em código inalterado (foco apenas no diff)
- Estilo ou formatação que um formatador normalizaria automaticamente, ou nomenclatura que siga as convenções do seu codebase — mas NÃO problemas substantivos que um linter ou verificador de tipos sinalizaria (variáveis não utilizadas, código inacessível, erros de tipo), que estão no escopo
- Sugestões subjetivas do tipo "considere fazer X" sem um problema real
- Refatorações menores que não corrigem um bug ou risco
- Documentação ausente, a menos que a lógica seja genuinamente confusa
- Problemas já discutidos em comentários existentes no PR (evita duplicar o feedback humano)

## Filosofia de Design

> **O silêncio é melhor que o ruído.** Cada comentário deve valer o tempo do leitor.

- Se não tiver certeza se algo é um problema → não reporte
- Todo achado nomeia um cenário de falha concreto (gatilho → resultado errado) ou um custo concreto — um achado que não pode é descartado antes de chegar a você
- Mesmo padrão em N arquivos → agregado em uma única descoberta
- Comentários no PR são apenas de alta confiança (e apenas de revisões verificadas de esforço high)
- Estilo/formatamento cosmético que segue as convenções do codebase é excluído
