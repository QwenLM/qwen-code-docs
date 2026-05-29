---
description: "Use Qwen Code para AI code review e encontre bugs, problemas de estilo e riscos de segurança antes do commit, elevando a qualidade dos PRs."
---

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

Se não houver alterações não commitadas, o `/review` informará você e será interrompido — nenhum agente será iniciado.

## Como Funciona

O comando `/review` executa um pipeline em múltiplas etapas:

```
Step 1:  Determine scope (local diff / PR worktree / file)
Step 2:  Load project review rules
Step 3:  Run deterministic analysis (linter, typecheck)    [zero LLM cost]
Step 4:  9 parallel review agents                          [9 LLM calls]
           |-- Agent 1: Correctness
           |-- Agent 2: Security
           |-- Agent 3: Code Quality
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (runs shell commands)
Step 5:  Deduplicate --> Batch verify --> Aggregate         [1 LLM call]
Step 6:  Iterative reverse audit (1-3 rounds, gap finding) [1-3 LLM calls]
Step 7:  Present findings + verdict
Step 8:  Autofix (user-confirmed, optional)
Step 9:  Post PR inline comments (if requested)
Step 10: Save report + incremental cache
Step 11: Clean up (remove worktree + temp files)
```

### Agentes de Revisão

| Agente                              | Foco                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Agente 1: Correção                  | Erros de lógica, casos de borda, tratamento de null, condições de corrida, segurança de tipos |
| Agente 2: Segurança                 | Injeção, XSS, SSRF, bypass de autenticação, exposição de dados sensíveis                   |
| Agente 3: Qualidade do Código       | Consistência de estilo, nomenclatura, duplicação, código morto                             |
| Agente 4: Desempenho e Eficiência   | Consultas N+1, vazamentos de memória, re-renders desnecessários, tamanho do bundle         |
| Agente 5: Cobertura de Testes       | Caminhos de código não testados no diff, cobertura de branches ausente, asserções fracas   |
| Agente 6: Auditoria Não Direcionada | 3 personas paralelas (atacante / plantão às 3h / mantenedor) — detecta problemas multidimensionais |
| Agente 7: Build e Teste             | Executa comandos de build e teste, reporta falhas                                          |

Todos os agentes são executados em paralelo (o Agente 6 inicia 3 variantes de persona simultaneamente, totalizando 9 tarefas paralelas para revisões no mesmo repositório). As descobertas dos Agentes 1-6 são verificadas em uma **única passagem de verificação em lote** (um agente revisa todas as descobertas de uma vez, mantendo o custo de verificação fixo independentemente da quantidade de descobertas). Após a verificação, a **auditoria reversa iterativa** executa de 1 a 3 rodadas de busca por lacunas — cada rodada recebe a lista cumulativa de descobertas das rodadas anteriores, então as rodadas sucessivas focam no que ainda não foi descoberto. O loop é interrompido assim que uma rodada retorna "No issues found" ou após 3 rodadas (limite rígido). As descobertas da auditoria reversa pulam a verificação (o agente já tem o contexto completo) e são incluídas como resultados de alta confiança.

## Análise Determinística

Antes da execução dos agentes LLM, o `/review` executa automaticamente os linters e verificadores de tipos existentes no seu projeto:

| Linguagem             | Ferramentas detectadas                                               |
| --------------------- | -------------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                             |
| Python                | `ruff`, `mypy`, `flake8`                                             |
| Rust                  | `cargo clippy`                                                       |
| Go                    | `go vet`, `golangci-lint`                                            |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                       |
| C/C++                 | `clang-tidy` (se `compile_commands.json` estiver disponível)         |
| Outras                | Descoberta automática a partir da configuração de CI (`.github/workflows/*.yml`, etc.) |

Para projetos que não seguem os padrões convencionais (ex.: OpenJDK), o `/review` lê os arquivos de configuração de CI para descobrir quais comandos de lint/verificação o projeto utiliza. Nenhuma configuração do usuário é necessária.

As descobertas determinísticas são marcadas com `[linter]` ou `[typecheck]` e pulam a verificação por LLM — elas representam a verdade absoluta.

- **Erros** → Severidade crítica
- **Avisos** → Bom ter (apenas no terminal, não postados como comentários no PR)

Se uma ferramenta não estiver instalada ou atingir o tempo limite, ela será ignorada com uma nota informativa.

## Níveis de Severidade

| Severidade         | Significado                                                             | Postado como comentário no PR? |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------ |
| **Crítica**        | Deve ser corrigido antes do merge (bugs, segurança, perda de dados, falhas de build) | Sim (apenas alta confiança)    |
| **Sugestão**       | Melhoria recomendada                                                    | Sim (apenas alta confiança)    |
| **Bom ter**        | Otimização opcional                                                     | Não (apenas no terminal)       |

Descobertas de baixa confiança aparecem em uma seção separada `"Needs Human Review"` no terminal e nunca são postadas como comentários no PR.

## Correção Automática (Autofix)

Após apresentar as descobertas, o `/review` oferece a aplicação automática de correções para descobertas Críticas e Sugestões que possuem soluções claras:

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- As correções são aplicadas usando a ferramenta `edit` (substituições direcionadas, não reescritas completas do arquivo)
- Verificações de linter por arquivo são executadas após as correções para garantir que não introduzam novos problemas
- Para revisões de PR, as correções são commitadas e enviadas (push) a partir do worktree automaticamente — sua árvore de trabalho local permanece limpa
- Descobertas "Bom ter" e de baixa confiança nunca são corrigidas automaticamente
- O envio da revisão do PR sempre usa o **veredito pré-correção** (ex.: "Request changes") já que o PR remoto não foi atualizado até que o push da correção automática seja concluído

## Isolamento de Worktree

Ao revisar um PR, o `/review` cria um git worktree temporário (`.qwen/tmp/review-pr-<number>`) em vez de alternar sua branch atual. Isso significa que:

- Sua árvore de trabalho, alterações staged e branch atual **nunca são modificadas**
- As dependências são instaladas no worktree (`npm ci`, etc.) para que linting e build/teste funcionem
- Comandos de build e teste são executados em isolamento, sem poluir seu cache de build local
- Se algo der errado, seu ambiente não é afetado — basta excluir o worktree
- O worktree é limpo automaticamente após a conclusão da revisão
- Se uma revisão for interrompida (Ctrl+C, crash), a próxima execução de `/review` para o mesmo PR limpará automaticamente o worktree obsoleto antes de começar do zero
- Relatórios de revisão e cache são salvos no diretório principal do projeto (não no worktree)

## Revisão de PR entre Repositórios

Você pode revisar PRs de outros repositórios passando a URL completa:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Isso é executado no **modo leve** — sem worktree, sem linter, sem build/teste, sem autofix. A revisão é baseada apenas no texto do diff (obtido via GitHub API). Comentários no PR ainda podem ser postados se você tiver acesso de escrita.

| Recurso                                              | Mesmo repositório | Entre repositórios              |
| ---------------------------------------------------- | ----------------- | ------------------------------- |
| Revisão LLM (Agentes 1-6 + verificação + auditoria reversa iterativa) | ✅                | ✅                              |
| Agente 7: Build e teste                              | ✅                | ❌ (sem base de código local)   |
| Análise determinística (linter/verificação de tipos) | ✅                | ❌                              |
| Análise de impacto entre arquivos                    | ✅                | ❌                              |
| Correção automática (Autofix)                        | ✅                | ❌                              |
| Comentários inline no PR                             | ✅                | ✅ (se tiver acesso de escrita) |
| Cache de revisão incremental                         | ✅                | ❌                              |

## Comentários Inline no PR

Use `--comment` para postar descobertas diretamente no PR:

```bash
/review 123 --comment
```

Ou, após executar `/review 123`, digite `post comments` para publicar as descobertas sem reexecutar a revisão.

**O que é postado:**

- Descobertas Críticas e Sugestões de alta confiança como comentários inline em linhas específicas
- Para vereditos de `Approve`/`Request changes`: um resumo da revisão com o veredito
- Para veredito `Comment` com todos os comentários inline postados: nenhum resumo separado (os comentários inline são suficientes)
- Rodapé de atribuição do modelo em cada comentário (ex.: _— qwen3-coder via Qwen Code /review_)

**O que fica apenas no terminal:**

- Descobertas "Bom ter" (incluindo avisos de linter)
- Descobertas de baixa confiança

**PRs de autoria própria:** O GitHub não permite que você envie revisões `APPROVE` ou `REQUEST_CHANGES` no seu próprio pull request — ambas falham com HTTP 422. Quando o `/review` detecta que o autor do PR corresponde ao usuário autenticado atual, ele rebaixa automaticamente o evento da API para `COMMENT` independentemente do veredito, garantindo que o envio seja bem-sucedido. O terminal ainda mostra o veredito honesto ("Approve" / "Request changes" / "Comment") — apenas o evento de revisão no lado do GitHub é neutralizado. As descobertas reais ainda aparecem como comentários inline em linhas específicas, então o feedback substantivo permanece inalterado.

**Revisar novamente um PR com comentários anteriores do Qwen Code:** quando o `/review` é executado em um PR que já possui comentários de revisão anteriores do Qwen Code, ele os classifica antes de postar novos. Apenas a **sobreposição na mesma linha** (um comentário existente no mesmo `(path, line)` de uma nova descoberta) solicitará sua confirmação — esse é o caso em que você veria uma duplicata visual na mesma linha de código. Comentários de commits mais antigos, comentários respondidos (tratados como resolvidos) e comentários que simplesmente não se sobrepõem a nenhuma nova descoberta são ignorados silenciosamente, com uma linha de log no terminal para que você saiba o que foi filtrado.

**Verificação de status de CI/build antes de APPROVE:** se o veredito for "Approve", o `/review` consulta os check-runs e status de commit do PR antes do envio. Se alguma verificação falhou (ou todas ainda estão pendentes), o evento da API é rebaixado automaticamente de `APPROVE` para `COMMENT`, com o corpo da revisão explicando o motivo. Justificativa: a revisão do LLM lê o código estaticamente e não consegue ver falhas de teste em tempo de execução; aprovar enquanto o CI está vermelho seria enganoso. As descobertas inline ainda são postadas inalteradas. Se você quiser aprovar mesmo assim (ex.: uma falha de CI conhecida e intermitente), envie a aprovação do GitHub manualmente após verificar.

## Ações de Acompanhamento

Após a revisão, dicas contextuais aparecem como ghost text. Pressione Tab para aceitar:

| Estado após a revisão                | Dica               | O que acontece                            |
| ------------------------------------ | ------------------ | ----------------------------------------- |
| Revisão local com descobertas não corrigidas | `fix these issues` | O LLM corrige interativamente cada descoberta |
| Revisão de PR com descobertas        | `post comments`    | Posta comentários inline no PR (sem re-revisão) |
| Revisão de PR, zero descobertas      | `post comments`    | Aprova o PR no GitHub (LGTM)              |
| Revisão local, tudo limpo            | `commit`           | Commita suas alterações                   |

Nota: `fix these issues` está disponível apenas para revisões locais. Para revisões de PR, use o Autofix (Etapa 8) — o worktree é limpo após a revisão, portanto a correção interativa pós-revisão não é possível.

## Regras de Revisão do Projeto

Você pode personalizar os critérios de revisão por projeto. O `/review` lê as regras destes arquivos (na ordem):

1. `.qwen/review-rules.md` (nativo do Qwen Code)
2. `.github/copilot-instructions.md` (preferido) ou `copilot-instructions.md` (fallback — apenas um é carregado, não ambos)
3. `AGENTS.md` — seção `## Code Review`
4. `QWEN.md` — seção `## Code Review`

As regras são injetadas nos agentes de revisão LLM (1-6) como critérios adicionais. Para revisões de PR, as regras são lidas da **branch base** para evitar que um PR malicioso injete regras de bypass.

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
# First review — full review, cache created
/review 123

# PR updated with new commits — only new changes reviewed
/review 123
```

### Revisão entre modelos

Se você alternar modelos (via `/model`) e revisar novamente o mesmo PR, o `/review` detecta a mudança de modelo e executa uma revisão completa em vez de pular:

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

O cache é armazenado em `.qwen/review-cache/` e rastreia tanto o SHA do commit quanto o ID do modelo. Certifique-se de que este diretório esteja no seu `.gitignore` (uma regra mais ampla como `.qwen/*` também funciona). Se o commit em cache foi removido por um rebase, o sistema recorre a uma revisão completa.

## Relatórios de Revisão

Para revisões no mesmo repositório, os resultados são salvos como um arquivo Markdown no diretório `.qwen/reviews/` do seu projeto (revisões leves entre repositórios ignoram a persistência do relatório):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Os relatórios incluem: timestamp, estatísticas do diff, resultados da análise determinística, todas as descobertas com status de verificação e o veredito.

## Análise de Impacto entre Arquivos

Quando alterações de código modificam funções, classes ou interfaces exportadas, os agentes de revisão buscam automaticamente todos os chamadores e verificam a compatibilidade:

- Alterações na quantidade/tipo de parâmetros
- Alterações no tipo de retorno
- Métodos públicos removidos ou renomeados
- Breaking changes na API

Para diffs grandes (>10 símbolos modificados), a análise prioriza funções com alterações de assinatura.

## Eficiência de Tokens

O pipeline de revisão usa um número limitado de chamadas LLM, independentemente de quantas descobertas são produzidas:

| Etapa                              | Chamadas LLM    | Notas                                                |
| ---------------------------------- | --------------- | ---------------------------------------------------- |
| Análise determinística (Etapa 3)   | 0               | Apenas comandos de shell                             |
| Agentes de revisão (Etapa 4)       | 9 (ou 8)        | Executados em paralelo; Agente 7 ignorado no modo entre repositórios |
| Verificação em lote (Etapa 5)      | 1               | Um único agente verifica todas as descobertas de uma vez |
| Auditoria reversa iterativa (Etapa 6) | 1-3          | Executa em loop até "No issues found" ou limite de 3 rodadas |
| **Total**                          | **11-13 (10-12)** | Mesmo repositório: 11-13; entre repositórios: 10-12 (sem Agente 7) |

A maioria dos PRs converge para o limite inferior do intervalo (1 rodada de auditoria reversa); o limite impede custos descontrolados em casos extremos.

## O que NÃO é Sinalizado

A revisão exclui intencionalmente:

- Problemas pré-existentes em código não alterado (foco apenas no diff)
- Estilo/formatação/nomenclatura que correspondem às convenções da sua base de código
- Problemas que um linter ou verificador de tipos capturaria (tratados pela análise determinística)
- Sugestões subjetivas do tipo "considere fazer X" sem um problema real
- Refatorações menores que não corrigem um bug ou risco
- Documentação ausente, a menos que a lógica seja genuinamente confusa
- Problemas já discutidos em comentários existentes no PR (evita duplicar feedback humano)

## Filosofia de Design

> **O silêncio é melhor que o ruído.** Cada comentário deve valer o tempo do leitor.

- Se não tiver certeza se algo é um problema → não o reporte
- Problemas de linter/verificação de tipos são tratados por ferramentas, não por suposições do LLM
- Mesmo padrão em N arquivos → agregado em uma única descoberta
- Comentários no PR são apenas de alta confiança
- Problemas de estilo/formatação que correspondem às convenções da base de código são excluídos