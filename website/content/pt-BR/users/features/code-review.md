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

Se não houver alterações não confirmadas (uncommitted), o `/review` informará e será interrompido — nenhum agente será iniciado.

## Como Funciona

O comando `/review` executa um pipeline em múltiplas etapas:

```
Step 1:  Determine scope (local diff / PR worktree / file)
Step 2:  Load project review rules
Step 3:  Run deterministic analysis (linter, typecheck)    [zero LLM cost]
Step 4:  5 parallel review agents                          [5 LLM calls]
           |-- Agent 1: Correctness & Security
           |-- Agent 2: Code Quality
           |-- Agent 3: Performance & Efficiency
           |-- Agent 4: Undirected Audit
           '-- Agent 5: Build & Test (runs shell commands)
Step 5:  Deduplicate --> Batch verify --> Aggregate         [1 LLM call]
Step 6:  Reverse audit (find coverage gaps)                 [1 LLM call]
Step 7:  Present findings + verdict
Step 8:  Autofix (user-confirmed, optional)
Step 9:  Post PR inline comments (if requested)
Step 10: Save report + incremental cache
Step 11: Clean up (remove worktree + temp files)
```

### Agentes de Revisão

| Agente                             | Foco                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Agente 1: Correção e Segurança   | Erros de lógica, tratamento de null, condições de corrida, injeção, XSS, SSRF |
| Agente 2: Qualidade do Código             | Consistência de estilo, nomenclatura, duplicação, código morto                  |
| Agente 3: Desempenho e Eficiência | Consultas N+1, vazamentos de memória, re-renders desnecessários, tamanho do bundle     |
| Agente 4: Auditoria Não Direcionada         | Lógica de negócio, interações de fronteira, acoplamento oculto             |
| Agente 5: Build e Teste             | Executa comandos de build e teste, reporta falhas                     |

Todos os agentes são executados em paralelo. As descobertas dos Agentes 1-4 são verificadas em uma **única passagem de verificação em lote** (um agente revisa todas as descobertas de uma vez, mantendo o número de chamadas ao LLM fixo). Após a verificação, um **agente de auditoria reversa** relê todo o diff com conhecimento de todas as descobertas confirmadas para identificar problemas que os outros agentes deixaram passar. As descobertas da auditoria reversa pulam a etapa de verificação (o agente já tem o contexto completo) e são incluídas diretamente como resultados de alta confiança.

## Análise Determinística

Antes da execução dos agentes LLM, o `/review` executa automaticamente os linters e verificadores de tipo existentes no seu projeto:

| Linguagem              | Ferramentas detectadas                                                   |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (se `compile_commands.json` disponível)              |
| Outras                 | Descoberta automática a partir da configuração de CI (`.github/workflows/*.yml`, etc.) |

Para projetos que não seguem padrões convencionais (ex.: OpenJDK), o `/review` lê os arquivos de configuração de CI para descobrir quais comandos de lint/verificação o projeto utiliza. Nenhuma configuração manual é necessária.

Descobertas determinísticas são marcadas com `[linter]` ou `[typecheck]` e pulam a verificação do LLM — elas são consideradas verdade absoluta.

- **Erros** → Severidade crítica
- **Avisos** → Bom ter (apenas no terminal, não postados como comentários no PR)

Se uma ferramenta não estiver instalada ou atingir o tempo limite, ela será ignorada com uma nota informativa.

## Níveis de Severidade

| Severidade         | Significado                                                             | Postado como comentário no PR?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Crítica**     | Deve ser corrigida antes do merge (bugs, segurança, perda de dados, falhas de build) | Sim (apenas alta confiança) |
| **Sugestão**   | Melhoria recomendada                                             | Sim (apenas alta confiança) |
| **Bom ter** | Otimização opcional                                               | Não (apenas no terminal)         |

Descobertas de baixa confiança aparecem em uma seção separada "Necessita Revisão Humana" no terminal e nunca são postadas como comentários no PR.

## Autofix

Após apresentar as descobertas, o `/review` oferece a opção de aplicar correções automaticamente para descobertas Críticas e Sugestões que possuem soluções claras:

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- As correções são aplicadas usando a ferramenta `edit` (substituições direcionadas, não reescritas completas do arquivo)
- Verificações de linter por arquivo são executadas após as correções para garantir que não introduzam novos problemas
- Para revisões de PR, as correções são commitadas e enviadas (push) a partir do worktree automaticamente — sua working tree permanece limpa
- Descobertas "Bom ter" e de baixa confiança nunca são corrigidas automaticamente
- O envio da revisão do PR sempre usa o **veredito pré-correção** (ex.: "Request changes"), já que o PR remoto não é atualizado até que o push do autofix seja concluído

## Isolamento de Worktree

Ao revisar um PR, o `/review` cria um git worktree temporário (`.qwen/tmp/review-pr-<number>`) em vez de alternar sua branch atual. Isso significa que:

- Sua working tree, alterações staged e branch atual **nunca são modificadas**
- As dependências são instaladas no worktree (`npm ci`, etc.) para que linting e build/teste funcionem
- Comandos de build e teste são executados em isolamento, sem poluir seu cache de build local
- Se algo der errado, seu ambiente não é afetado — basta excluir o worktree
- O worktree é limpo automaticamente após a conclusão da revisão
- Se uma revisão for interrompida (Ctrl+C, crash), o próximo `/review` do mesmo PR limpará automaticamente o worktree obsoleto antes de começar do zero
- Relatórios de revisão e cache são salvos no diretório principal do projeto (não no worktree)

## Revisão de PR Cross-repo

Você pode revisar PRs de outros repositórios passando a URL completa:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Isso é executado no **modo leve** — sem worktree, sem linter, sem build/teste, sem autofix. A revisão é baseada apenas no texto do diff (obtido via GitHub API). Comentários no PR ainda podem ser postados se você tiver acesso de escrita.

| Capacidade                                       | Mesmo repositório | Cross-repo                    |
| ------------------------------------------------ | --------- | ----------------------------- |
| Revisão LLM (Agentes 1-4 + verificação + auditoria reversa) | ✅        | ✅                            |
| Agente 5: Build e teste                            | ✅        | ❌ (sem codebase local)        |
| Análise determinística (linter/typecheck)        | ✅        | ❌                            |
| Análise de impacto cross-file                       | ✅        | ❌                            |
| Autofix                                          | ✅        | ❌                            |
| Comentários inline no PR                               | ✅        | ✅ (se você tiver acesso de escrita) |
| Cache de revisão incremental                         | ✅        | ❌                            |

## Comentários Inline no PR

Use `--comment` para postar descobertas diretamente no PR:

```bash
/review 123 --comment
```

Ou, após executar `/review 123`, digite `post comments` para publicar as descobertas sem executar a revisão novamente.

**O que é postado:**

- Descobertas Críticas e Sugestões de alta confiança como comentários inline em linhas específicas
- Para vereditos de Approve/Request changes: um resumo da revisão com o veredito
- Para veredito Comment com todos os comentários inline postados: nenhum resumo separado (os comentários inline são suficientes)
- Rodapé de atribuição do modelo em cada comentário (ex.: _— qwen3-coder via Qwen Code /review_)

**O que fica apenas no terminal:**

- Descobertas "Bom ter" (incluindo avisos do linter)
- Descobertas de baixa confiança

## Ações de Acompanhamento

Após a revisão, dicas contextuais aparecem como ghost text. Pressione Tab para aceitar:

| Estado após a revisão                 | Dica                | O que acontece                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Revisão local com descobertas não corrigidas | `fix these issues` | O LLM corrige interativamente cada descoberta    |
| Revisão de PR com descobertas            | `post comments`    | Posta comentários inline no PR (sem re-revisão) |
| Revisão de PR, zero descobertas           | `post comments`    | Aprova o PR no GitHub (LGTM)        |
| Revisão local, tudo limpo            | `commit`           | Faz commit das suas alterações                    |

Nota: `fix these issues` está disponível apenas para revisões locais. Para revisões de PR, use o Autofix (Etapa 8) — o worktree é limpo após a revisão, portanto, a correção interativa pós-revisão não é possível.

## Regras de Revisão do Projeto

Você pode personalizar os critérios de revisão por projeto. O `/review` lê as regras destes arquivos (na ordem):

1. `.qwen/review-rules.md` (nativo do Qwen Code)
2. `.github/copilot-instructions.md` (preferido) ou `copilot-instructions.md` (fallback — apenas um é carregado, não ambos)
3. `AGENTS.md` — seção `## Code Review`
4. `QWEN.md` — seção `## Code Review`

As regras são injetadas nos agentes de revisão LLM (1-4) como critérios adicionais. Para revisões de PR, as regras são lidas da **branch base** para evitar que um PR malicioso injete regras de bypass.

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

### Revisão cross-model

Se você alternar modelos (via `/model`) e revisar o mesmo PR novamente, o `/review` detecta a mudança de modelo e executa uma revisão completa em vez de pular:

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

O cache é armazenado em `.qwen/review-cache/` e rastreia tanto o commit SHA quanto o ID do modelo. Certifique-se de que este diretório esteja no seu `.gitignore` (uma regra mais ampla como `.qwen/*` também funciona). Se o commit em cache foi removido por um rebase, o sistema recorre a uma revisão completa.

## Relatórios de Revisão

Para revisões no mesmo repositório, os resultados são salvos como um arquivo Markdown no diretório `.qwen/reviews/` do seu projeto (revisões cross-repo no modo leve pulam a persistência do relatório):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Os relatórios incluem: timestamp, estatísticas do diff, resultados da análise determinística, todas as descobertas com status de verificação e o veredito.

## Análise de Impacto Cross-file

Quando alterações de código modificam funções, classes ou interfaces exportadas, os agentes de revisão buscam automaticamente todos os chamadores e verificam a compatibilidade:

- Alterações na quantidade/tipo de parâmetros
- Alterações no tipo de retorno
- Métodos públicos removidos ou renomeados
- Alterações breaking na API

Para diffs grandes (>10 símbolos modificados), a análise prioriza funções com alterações de assinatura.

## Eficiência de Tokens

O pipeline de revisão usa um número fixo de chamadas ao LLM, independentemente de quantas descobertas são produzidas:

| Etapa                           | Chamadas ao LLM  | Notas                                               |
| ------------------------------- | ---------- | --------------------------------------------------- |
| Análise determinística (Etapa 3) | 0          | Apenas comandos de shell                                 |
| Agentes de revisão (Etapa 4)          | 5 (ou 4)   | Executados em paralelo; Agente 5 pulado no modo cross-repo |
| Verificação em lote (Etapa 5)     | 1          | Um único agente verifica todas as descobertas de uma vez          |
| Auditoria reversa (Etapa 6)          | 1          | Identifica lacunas de cobertura; descobertas pulam a verificação     |
| **Total**                       | **7 ou 6** | Mesmo repositório: 7; cross-repo: 6 (sem Agente 5)            |

## O que NÃO é Sinalizado

A revisão exclui intencionalmente:

- Problemas pré-existentes em código não alterado (foco apenas no diff)
- Estilo/formatação/nomenclatura que correspondem às convenções da sua codebase
- Problemas que um linter ou type checker capturaria (tratados pela análise determinística)
- Sugestões subjetivas do tipo "considere fazer X" sem um problema real
- Refatorações menores que não corrigem um bug ou risco
- Documentação ausente, a menos que a lógica seja genuinamente confusa
- Problemas já discutidos em comentários existentes no PR (evita duplicar feedback humano)

## Filosofia de Design

> **Silêncio é melhor que ruído.** Cada comentário deve valer o tempo do leitor.

- Se estiver em dúvida se algo é um problema → não reporte
- Problemas de linter/typecheck são tratados por ferramentas, não por suposições do LLM
- Mesmo padrão em N arquivos → agregado em uma única descoberta
- Comentários no PR são apenas de alta confiança
- Problemas de estilo/formatação que correspondem às convenções da codebase são excluídos