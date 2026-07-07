# Revisão de Código

> Revise alterações de código quanto à correção, segurança, desempenho e qualidade do código usando `/review`.

## Início Rápido

```bash
# Review local uncommitted changes
/review

# Review a pull request (by number or URL)
/review 123
/review https://github.com/org/repo/pull/123

# Review and post inline comments on the PR
/review 123 --comment

# Review a specific file
/review src/utils/auth.ts
```

Se não houver alterações não commitadas, o `/review` avisará e parará — nenhum agente será iniciado.

## Como Funciona

O comando `/review` executa um pipeline de múltiplos estágios:

```
Step 1:  Determine scope (local diff / PR worktree / file)
Step 2:  Load project review rules
Step 3:  10 parallel review agents                         [10 LLM calls]
           |-- Agent 0: Issue Fidelity & Root-Cause Ownership
           |-- Agent 1: Correctness
           |-- Agent 2: Security
           |-- Agent 3: Code Quality
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (runs shell commands)
Step 4:  Deduplicate --> Batch verify --> Aggregate         [1 LLM call]
Step 5:  Iterative reverse audit (1-3 rounds, gap finding) [1-3 LLM calls]
Step 6:  Present findings + verdict
Step 7:  Submit PR review (inline comments, if requested)
Step 8:  Save report + incremental cache
Step 9:  Clean up (remove worktree + temp files)
```

### Agentes de Revisão

| Agente                             | Foco                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agente 0: Fidelidade à Issue           | Evidências da issue vinculada, responsabilidade pela causa raiz e se o PR resolve o problema relatado |
| Agente 1: Correção              | Erros de lógica, casos de borda, tratamento de nulos, condições de corrida, segurança de tipos                       |
| Agente 2: Segurança                 | Injeção, XSS, SSRF, bypass de autenticação, exposição de dados sensíveis                                  |
| Agente 3: Qualidade do Código             | Consistência de estilo, nomenclatura, duplicação, código morto                                           |
| Agente 4: Desempenho e Eficiência | Consultas N+1, vazamentos de memória, re-renderizações desnecessárias, tamanho do bundle                              |
| Agente 5: Cobertura de Testes            | Caminhos de código não testados no diff, cobertura de branches faltando, asserções fracas                   |
| Agente 6: Auditoria Não Direcionada         | 3 personas paralelas (atacante / plantão de 3h da manhã / mantenedor) — captura problemas multidimensionais |
| Agente 7: Build e Teste             | Executa comandos de build e teste, relata falhas                                              |

Todos os agentes são executados em paralelo (o Agente 6 lança 3 variantes de persona simultaneamente, totalizando 10 tarefas paralelas para revisões de PR no mesmo repositório; o Agente 0 é ignorado para revisões de diff local e caminho de arquivo, que executam 9). Os achados dos Agentes 0-6 são verificados em uma **única passagem de verificação em lote** (um agente revisa todos os achados de uma vez, mantendo o custo de verificação fixo independentemente da quantidade de achados). Após a verificação, a **auditoria reversa iterativa** executa de 1 a 3 rodadas de busca de lacunas — cada rodada recebe a lista cumulativa de achados das rodadas anteriores, para que as rodadas sucessivas foquem no que ainda não foi descoberto. O loop para assim que uma rodada retornar "Nenhum problema encontrado" ou após 3 rodadas (limite rígido). Os achados da auditoria reversa pulam a verificação (o agente já tem o contexto completo) e são incluídos como resultados de alta confiança.

## Níveis de Severidade

| Severidade         | Significado                                                             | Postado como comentário no PR?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Crítico**     | Deve ser corrigido antes do merge (bugs, segurança, perda de dados, falhas de build) | Sim (apenas alta confiança) |
| **Sugestão**   | Melhoria recomendada                                             | Sim (apenas alta confiança) |
| **Desejável** | Otimização opcional                                               | Não (apenas terminal)         |

Achados de baixa confiança aparecem em uma seção separada "Necessita Revisão Humana" no terminal e nunca são postados como comentários no PR.

## Isolamento de Worktree

Ao revisar um PR, o `/review` cria um git worktree temporário (`.qwen/tmp/review-pr-<number>`) em vez de trocar o seu branch atual. Isso significa que:

- Sua árvore de trabalho, alterações staged e branch atual **nunca são modificados**
- As dependências são instaladas no worktree (`npm ci`, etc.) para que o build/teste funcione
- Os comandos de build e teste são executados em isolamento sem poluir o cache de build local
- Se algo der errado, seu ambiente não é afetado — basta deletar o worktree
- O worktree é limpo automaticamente após a conclusão da revisão
- Se uma revisão for interrompida (Ctrl+C, crash), a próxima `/review` do mesmo PR limpa automaticamente o worktree obsoleto antes de começar do zero
- Os relatórios de revisão e o cache são salvos no diretório principal do projeto (não no worktree)

## Revisão de PR entre Repositórios

Você pode revisar PRs de outros repositórios passando a URL completa:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Isso é executado no **modo leve** — sem worktree, sem build/teste. A revisão é baseada apenas no texto do diff (buscado via API do GitHub). Comentários no PR ainda podem ser postados se você tiver acesso de escrita.

| Capacidade                                                 | Mesmo repositório | Entre repositórios                    |
| ---------------------------------------------------------- | --------- | ----------------------------- |
| Revisão por LLM (Agentes 0-6 + verificação + auditoria reversa iterativa) | ✅        | ✅                            |
| Agente 7: Build e teste                                      | ✅        | ❌ (sem codebase local)        |
| Análise de impacto entre arquivos                                 | ✅        | ❌                            |
| Comentários inline no PR                                         | ✅        | ✅ (se você tiver acesso de escrita) |
| Cache de revisão incremental                                   | ✅        | ❌                            |

## Comentários Inline no PR

Use `--comment` para postar achados diretamente no PR:

```bash
/review 123 --comment
```

Ou, após executar `/review 123`, digite `post comments` para publicar os achados sem reexecutar a revisão.

**O que é postado:**

- Achados Críticos e de Sugestão de alta confiança como comentários inline em linhas específicas
- Para vereditos de Approve/Request changes: um resumo da revisão com o veredito
- Para veredito de Comment com todos os comentários inline postados: nenhum resumo separado (os comentários inline são suficientes)
- Rodapé de atribuição do modelo em cada comentário (ex.: _— qwen3-coder via Qwen Code /review_)

**O que permanece apenas no terminal:**

- Achados Desejáveis
- Achados de baixa confiança

**PRs de autoria própria:** O GitHub não permite que você submeta revisões `APPROVE` ou `REQUEST_CHANGES` no seu próprio pull request — ambos falham com HTTP 422. Quando o `/review` detecta que o autor do PR corresponde ao usuário autenticado atual, ele rebaixa automaticamente o evento da API para `COMMENT`, independentemente do veredito, para que a submissão ainda tenha sucesso. O terminal ainda mostra o veredito honesto ("Approve" / "Request changes" / "Comment") — apenas o evento de revisão do lado do GitHub é neutralizado. Os achados reais ainda aparecem como comentários inline em linhas específicas, então o feedback substantivo não é alterado.

**Revisar novamente um PR com comentários anteriores do Qwen Code:** quando o `/review` é executado em um PR que já possui comentários de revisão anteriores do Qwen Code, ele os classifica antes de postar novos. Apenas a **sobreposição na mesma linha** (um comentário existente no mesmo `(path, line)` que um novo achado) solicita que você confirme — esse é o caso em que você veria um duplicado visual na mesma linha de código. Comentários de commits mais antigos, comentários respondidos (tratados como resolvidos) e comentários que simplesmente não se sobrepõem a nenhum novo achado são ignorados silenciosamente, com uma linha de log no terminal para que você saiba o que foi filtrado.

**Verificação de status de CI / build antes de APPROVE:** se o veredito for "Approve", o `/review` consulta as check-runs e os commit statuses do PR antes de submeter. Se alguma verificação falhou (ou todas as verificações ainda estão pendentes), o evento da API é automaticamente rebaixado de `APPROVE` para `COMMENT`, com o corpo da revisão explicando o motivo. Justificativa: a revisão por LLM lê o código estaticamente e não pode ver falhas de testes em tempo de execução; aprovar enquanto o CI está vermelho seria enganoso. Os achados inline ainda são postados inalterados. Se você quiser aprovar mesmo assim (ex.: uma falha de CI conhecida como instável), submeta a aprovação no GitHub manualmente após verificar.

## Ações de Acompanhamento

Após a revisão, dicas conscientes do contexto aparecem como ghost text. Pressione Tab para aceitar:

| Estado após a revisão                 | Dica                | O que acontece                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Revisão local com achados não corrigidos | `fix these issues` | O LLM corrige interativamente cada achado    |
| Revisão de PR com achados            | `post comments`    | Posta comentários inline no PR (sem reexecutar a revisão) |
| Revisão de PR, zero achados           | `post comments`    | Aprova o PR no GitHub (LGTM)        |
| Revisão local, tudo limpo            | `commit`           | Faz o commit das suas alterações                    |

Nota: `fix these issues` está disponível apenas para revisões locais. Para revisões de PR, o worktree é limpo após a revisão, então a correção interativa pós-revisão não é possível — use `--comment` ou `post comments` para publicar os achados.

## Regras de Revisão do Projeto

Você pode personalizar os critérios de revisão por projeto. O `/review` lê as regras destes arquivos (na ordem):

1. `.qwen/review-rules.md` (nativo do Qwen Code)
2. `.github/copilot-instructions.md` (preferencial) ou `copilot-instructions.md` (fallback — apenas um é carregado, não ambos)
3. `AGENTS.md` — seção `## Code Review`
4. `QWEN.md` — seção `## Code Review`

As regras são injetadas nos agentes de revisão por LLM (0-6) como critérios adicionais. Para revisões de PR, as regras são lidas do **branch base** para evitar que um PR malicioso injete regras de bypass.

## Fidelidade à Issue

Para PRs de correção de bugs, o agente de Fidelidade à Issue busca evidências da issue diretamente em vez de depender do texto da descrição do PR. Ele usa `gh pr view <pr> --repo <owner/repo> --json closingIssuesReferences` para os metadados fortes de issue de fechamento do GitHub, e então `gh issue view <number> --repo <issue_owner>/<issue_repo> --json title,body,comments` para o relatório original e discussão — a forma `--json` inclui o **corpo** da issue (a reprodução original do reportador), que apenas `--comments` omite, e o repositório próprio da issue é lido de cada referência (um PR pode fechar uma issue em um repositório diferente). Este agente é executado apenas para alvos de PR; revisões de diff local e caminho de arquivo o ignoram.

O `closingIssuesReferences` é uma dica de descoberta, não uma prova de que o autor vinculou a issue correta: se estiver vazio, mas o PR referenciar uma issue alvo aparente, o agente ainda a busca após julgar a relevância. O texto da issue buscada é tratado como dados não confiáveis (fatos extraídos, instruções embutidas ignoradas). Para issues relevantes, a reprodução original, o payload observado, o comportamento esperado e os comentários do mantenedor são tratados como a evidência de maior prioridade para saber se o PR resolve o problema certo.

Se a evidência da issue mostrar que um serviço upstream ou provedor retornou dados malformados fora do contrato do cliente, alterações no parser ou sanitizador do lado do cliente não são tratadas como uma correção de causa raiz válida, a menos que um mantenedor solicite explicitamente uma solução defensiva. Um teste que repete a saída upstream malformada prova apenas que a solução alternativa lida com esse formato; não prova que a solução alternativa é arquiteturalmente apropriada.

## Gate de Infraestrutura Core

Para PRs externos que tocam a infraestrutura core, o `/review` aplica o gate do repositório antes da revisão normal (logo após o PR ser buscado, antes da instalação de dependências). A autoria de mantenedor é decidida a partir do `authorAssociation` do PR (`OWNER`/`MEMBER`/`COLLABORATOR` são isentos). Grandes alterações core (500+ adições mais deleções **dentro de caminhos de infraestrutura core**) são reportadas como um bloqueio rígido, a menos que sejam de autoria de mantenedor — uma varredura de baixo risco que toca em muitos arquivos, mas altera uma ou duas linhas em cada um, é escalada em vez de auto-rejeitada pela contagem de linhas. Alterações core menores exigem 100% de confiança e consciência do consumidor downstream; caso contrário, o `/review` escala para um mantenedor (submetido como Comment, nunca como Approve).
Exemplo de `.qwen/review-rules.md`:

```markdown
# Regras de Review

- Todos os endpoints da API devem validar a autenticação
- As consultas ao banco de dados devem usar instruções parametrizadas
- Os componentes React não devem usar estilos inline
- As mensagens de erro não devem expor caminhos internos
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

# Trocar modelo
/model

# Revisar novamente — revisão completa com o modelo B (não pulada)
/review 123
# → "A revisão anterior usou qwen3-coder. Executando revisão completa com gpt-4o para uma segunda opinião."
```

O cache é armazenado em `.qwen/review-cache/` e rastreia tanto o SHA do commit quanto o ID do modelo. Certifique-se de que este diretório esteja no seu `.gitignore` (uma regra mais ampla como `.qwen/*` também funciona). Se o commit em cache foi removido por um rebase, o sistema volta a fazer uma revisão completa.

## Relatórios de Revisão

Para revisões no mesmo repositório, os resultados são salvos como um arquivo Markdown no diretório `.qwen/reviews/` do seu projeto (revisões leves entre repositórios pulam a persistência do relatório):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Os relatórios incluem: timestamp, estatísticas do diff, resultados de build/teste, todas as descobertas com status de verificação e o veredito.

## Análise de Impacto entre Arquivos

Quando as alterações de código modificam funções, classes ou interfaces exportadas, os agentes de revisão buscam automaticamente todos os chamadores e verificam a compatibilidade:

- Alterações na contagem/tipo de parâmetros
- Alterações no tipo de retorno
- Métodos públicos removidos ou renomeados
- Alterações que quebram a API

Para diffs grandes (>10 símbolos modificados), a análise prioriza funções com alterações de assinatura.

## Eficiência de Tokens

O pipeline de revisão usa um número limitado de chamadas de LLM, independentemente de quantas descobertas sejam produzidas:

| Estágio                            | Chamadas de LLM     | Observações                                         |
| ---------------------------------- | ------------------- | --------------------------------------------------- |
| Agentes de revisão (Etapa 3)       | 10 (ou 9)           | Executados em paralelo; Agente 7 pulado no modo entre repositórios |
| Verificação em lote (Etapa 4)      | 1                   | Um único agente verifica todas as descobertas de uma vez |
| Auditoria reversa iterativa (Etapa 5) | 1-3              | Faz loops até "Nenhum problema encontrado" ou limite de 3 rodadas |
| **Total**                          | **12-14 (11-13)**   | Mesmo repositório: 12-14; entre repositórios: 11-13 (sem Agente 7) |

A maioria dos PRs converge para o limite inferior do intervalo (1 rodada de auditoria reversa); o limite evita custos excessivos em casos patológicos.

## O que NÃO é Sinalizado

A revisão exclui intencionalmente:

- Problemas pré-existentes em código inalterado (foco apenas no diff)
- Estilo ou formatação que um formatador normalizaria automaticamente, ou nomenclatura que siga as convenções do seu codebase — mas NÃO problemas substanciais que um linter ou verificador de tipos sinalizaria (variáveis não utilizadas, código inacessível, erros de tipo), que estão no escopo
- Sugestões subjetivas do tipo "considere fazer X" sem um problema real
- Refatorações menores que não corrigem um bug ou risco
- Documentação ausente, a menos que a lógica seja genuinamente confusa
- Problemas já discutidos em comentários existentes no PR (evita duplicar o feedback humano)

## Filosofia de Design

> **O silêncio é melhor que o ruído.** Cada comentário deve valer o tempo do leitor.

- Se não tiver certeza se algo é um problema → não reporte
- Mesmo padrão em N arquivos → agregado em uma única descoberta
- Comentários no PR são apenas de alta confiança
- Estilo/formatação cosmética que siga as convenções do codebase é excluída