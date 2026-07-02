# Revisão de Código

> Revise alterações de código quanto à correção, segurança, desempenho e qualidade do código usando o `/review`.

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
Step 3:  9 parallel review agents                          [9 LLM calls]
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
| Agente 1: Correção              | Erros de lógica, casos extremos, tratamento de nulos, condições de corrida, segurança de tipos                       |
| Agente 2: Segurança                 | Injeção, XSS, SSRF, bypass de autenticação, exposição de dados sensíveis                                  |
| Agente 3: Qualidade do Código             | Consistência de estilo, nomenclatura, duplicação, código morto                                           |
| Agente 4: Desempenho e Eficiência | Consultas N+1, vazamentos de memória, re-renderizações desnecessárias, tamanho do bundle                              |
| Agente 5: Cobertura de Testes            | Caminhos de código não testados no diff, cobertura de branches faltando, asserções fracas                   |
| Agente 6: Auditoria Não Direcionada         | 3 personas paralelas (atacante / oncall das 3h / mantenedor) — captura problemas multidimensionais |
| Agente 7: Build e Teste             | Executa comandos de build e teste, relata falhas                                              |

Todos os agentes são executados em paralelo (o Agente 6 lança 3 variantes de persona simultaneamente, totalizando 9 tarefas paralelas para revisões no mesmo repositório). Os achados dos Agentes 1-6 são verificados em uma **única passagem de verificação em lote** (um agente revisa todos os achados de uma vez, mantendo o custo de verificação fixo independentemente da quantidade de achados). Após a verificação, a **auditoria reversa iterativa** executa de 1 a 3 rodadas de busca por lacunas — cada rodada recebe a lista cumulativa de achados das rodadas anteriores, para que as rodadas sucessivas foquem no que ainda não foi descoberto. O loop para assim que uma rodada retornar "Nenhum problema encontrado" ou após 3 rodadas (limite rígido). Os achados da auditoria reversa pulam a verificação (o agente já tem o contexto completo) e são incluídos como resultados de alta confiança.

## Níveis de Severidade

| Severidade         | Significado                                                             | Postado como comentário no PR?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Crítico**     | Deve ser corrigido antes do merge (bugs, segurança, perda de dados, falhas de build) | Sim (apenas alta confiança) |
| **Sugestão**   | Melhoria recomendada                                             | Sim (apenas alta confiança) |
| **Desejável** | Otimização opcional                                               | Não (apenas no terminal)         |

Achados de baixa confiança aparecem em uma seção separada de "Necessita Revisão Humana" no terminal e nunca são postados como comentários no PR.

## Isolamento de Worktree

Ao revisar um PR, o `/review` cria um worktree temporário do git (`.qwen/tmp/review-pr-<number>`) em vez de trocar o seu branch atual. Isso significa que:

- Sua árvore de trabalho, alterações em staging e o branch atual **nunca são alterados**
- As dependências são instaladas no worktree (`npm ci`, etc.) para que o build/teste funcione
- Os comandos de build e teste são executados em isolamento sem poluir o seu cache de build local
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
| Revisão por LLM (Agentes 1-6 + verificação + auditoria reversa iterativa) | ✅        | ✅                            |
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
- Para vereditos de Aprovar/Solicitar alterações: um resumo da revisão com o veredito
- Para o veredito de Comentário com todos os comentários inline postados: nenhum resumo separado (os comentários inline são suficientes)
- Rodapé de atribuição do modelo em cada comentário (ex.: _— qwen3-coder via Qwen Code /review_)

**O que permanece apenas no terminal:**

- Achados Desejáveis
- Achados de baixa confiança

**PRs de autoria própria:** O GitHub não permite que você envie revisões `APPROVE` ou `REQUEST_CHANGES` no seu próprio pull request — ambos falham com HTTP 422. Quando o `/review` detecta que o autor do PR corresponde ao usuário autenticado atual, ele rebaixa automaticamente o evento da API para `COMMENT`, independentemente do veredito, para que o envio ainda seja bem-sucedido. O terminal ainda mostra o veredito honesto ("Aprovar" / "Solicitar alterações" / "Comentar") — apenas o evento de revisão do lado do GitHub é neutralizado. Os achados reais ainda aparecem como comentários inline em linhas específicas, então o feedback substantivo não é alterado.

**Revisar novamente um PR com comentários anteriores do Qwen Code:** quando o `/review` é executado em um PR que já possui comentários de revisão anteriores do Qwen Code, ele os classifica antes de postar novos. Apenas a **sobreposição na mesma linha** (um comentário existente no mesmo `(path, line)` que um novo achado) solicita que você confirme — esse é o caso em que você veria uma duplicata visual na mesma linha de código. Comentários de commits mais antigos, comentários respondidos (tratados como resolvidos) e comentários que simplesmente não se sobrepõem a nenhum novo achado são ignorados silenciosamente, com uma linha de log no terminal para que você saiba o que foi filtrado.

**Verificação de status de CI / build antes de APPROVE:** se o veredito for "Aprovar", o `/review` consulta as check-runs e os status de commit do PR antes de enviar. Se alguma verificação falhou (ou todas as verificações ainda estão pendentes), o evento da API é automaticamente rebaixado de `APPROVE` para `COMMENT`, com o corpo da revisão explicando o motivo. Justificativa: a revisão do LLM lê o código estaticamente e não pode ver falhas de testes em tempo de execução; aprovar enquanto o CI está vermelho seria enganoso. Os achados inline ainda são postados inalterados. Se você quiser aprovar mesmo assim (ex.: uma falha de CI conhecida como instável), envie a aprovação do GitHub manualmente após verificar.

## Ações de Acompanhamento

Após a revisão, dicas conscientes do contexto aparecem como texto fantasma (ghost text). Pressione Tab para aceitar:

| Estado após a revisão                 | Dica                | O que acontece                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Revisão local com achados não corrigidos | `fix these issues` | O LLM corrige interativamente cada achado    |
| Revisão de PR com achados            | `post comments`    | Posta comentários inline no PR (sem reexecutar a revisão) |
| Revisão de PR, zero achados           | `post comments`    | Aprova o PR no GitHub (LGTM)        |
| Revisão local, tudo limpo            | `commit`           | Faz commit das suas alterações                    |

Nota: `fix these issues` está disponível apenas para revisões locais. Para revisões de PR, o worktree é limpo após a revisão, então a correção interativa pós-revisão não é possível — use `--comment` ou `post comments` para publicar os achados.

## Regras de Revisão do Projeto

Você pode personalizar os critérios de revisão por projeto. O `/review` lê as regras destes arquivos (na ordem):

1. `.qwen/review-rules.md` (nativo do Qwen Code)
2. `.github/copilot-instructions.md` (preferencial) ou `copilot-instructions.md` (fallback — apenas um é carregado, não ambos)
3. `AGENTS.md` — seção `## Code Review`
4. `QWEN.md` — seção `## Code Review`

As regras são injetadas nos agentes de revisão do LLM (1-6) como critérios adicionais. Para revisões de PR, as regras são lidas do **branch base** para evitar que um PR malicioso injete regras de bypass.

Exemplo de `.qwen/review-rules.md`:

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## Revisão Incremental

Ao revisar um PR que foi revisado anteriormente, o `/review` examina apenas as alterações desde a última revisão:

```bash
# First review — full review, cache created
/review 123

# PR updated with new commits — only new changes reviewed
/review 123
```

### Revisão entre modelos

Se você trocar de modelo (via `/model`) e revisar o mesmo PR novamente, o `/review` detecta a mudança de modelo e executa uma revisão completa em vez de pular:

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

O cache é armazenado em `.qwen/review-cache/` e rastreia tanto o SHA do commit quanto o ID do modelo. Certifique-se de que este diretório esteja no seu `.gitignore` (uma regra mais ampla como `.qwen/*` também funciona). Se o commit em cache foi removido por um rebase, ele volta para uma revisão completa.

## Relatórios de Revisão

Para revisões no mesmo repositório, os resultados são salvos como um arquivo Markdown no diretório `.qwen/reviews/` do seu projeto (revisões leves entre repositórios pulam a persistência do relatório):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Os relatórios incluem: timestamp, estatísticas do diff, resultados de build/teste, todos os achados com status de verificação e o veredito.

## Análise de Impacto entre Arquivos

Quando as alterações de código modificam funções, classes ou interfaces exportadas, os agentes de revisão buscam automaticamente todos os chamadores e verificam a compatibilidade:

- Alterações na contagem/tipo de parâmetros
- Alterações no tipo de retorno
- Métodos públicos removidos ou renomeados
- Alterações incompatíveis na API

Para diffs grandes (>10 símbolos modificados), a análise prioriza funções com alterações de assinatura.

## Eficiência de Tokens

O pipeline de revisão usa um número limitado de chamadas de LLM, independentemente de quantos achados sejam produzidos:

| Estágio                            | Chamadas de LLM         | Notas                                               |
| -------------------------------- | ----------------- | --------------------------------------------------- |
| Agentes de revisão (Etapa 3)           | 9 (ou 8)          | Executados em paralelo; Agente 7 pulado no modo entre repositórios |
| Verificação em lote (Etapa 4)      | 1                 | Um único agente verifica todos os achados de uma vez          |
| Auditoria reversa iterativa (Etapa 5) | 1-3               | Loop até "Nenhum problema encontrado" ou limite de 3 rodadas        |
| **Total**                        | **11-13 (10-12)** | Mesmo repositório: 11-13; entre repositórios: 10-12 (sem Agente 7)    |

A maioria dos PRs converge para o extremo inferior do intervalo (1 rodada de auditoria reversa); o limite evita custos excessivos em casos patológicos.

## O que NÃO é Sinalizado

A revisão exclui intencionalmente:

- Problemas pré-existentes em código inalterado (foco apenas no diff)
- Estilo ou formatação que um formatador normalizaria automaticamente, ou nomenclatura que corresponde às convenções do seu codebase — mas NÃO problemas substantivos que um linter ou type checker sinalizaria (variáveis não utilizadas, código inalcansável, erros de tipo), que estão no escopo
- Sugestões subjetivas de "considere fazer X" sem um problema real
- Refatoração menor que não corrige um bug ou risco
- Documentação ausente, a menos que a lógica seja genuinamente confusa
- Problemas já discutidos em comentários existentes no PR (evita duplicar o feedback humano)

## Filosofia de Design

> **O silêncio é melhor que o ruído.** Cada comentário deve valer o tempo do leitor.

- Se não tiver certeza se algo é um problema → não reporte
- Mesmo padrão em N arquivos → agregado em um único achado
- Comentários no PR são apenas de alta confiança
- Estilo/formatação cosmética que corresponde às convenções do codebase é excluída