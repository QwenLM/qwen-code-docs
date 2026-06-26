# Revisão de Código

> Revise mudanças de código quanto a corretude, segurança, desempenho e qualidade usando `/review`.

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

Se não houver mudanças não commitadas, `/review` informará e interromperá — nenhum agente é iniciado.

## Como Funciona

O comando `/review` executa um pipeline de múltiplos estágios:

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

| Agente                                | Foco                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| Agente 1: Corretude                   | Erros lógicos, casos extremos, tratamento de null, condições de corrida, segurança de tipos |
| Agente 2: Segurança                   | Injeção, XSS, SSRF, bypass de autenticação, exposição de dados sensíveis                |
| Agente 3: Qualidade de Código         | Consistência de estilo, nomenclatura, duplicação, código morto                           |
| Agente 4: Desempenho e Eficiência     | Consultas N+1, vazamentos de memória, re-renderizações desnecessárias, tamanho do bundle |
| Agente 5: Cobertura de Testes         | Caminhos de código não testados no diff, cobertura de branch ausente, asserções fracas   |
| Agente 6: Auditoria Não Direcionada   | 3 personas paralelas (atacante / plantão às 3h da manhã / mantenedor) — captura problemas entre dimensões |
| Agente 7: Build & Test                | Executa comandos de build e teste, reporta falhas                                        |

Todos os agentes são executados em paralelo (o Agente 6 lança 3 variantes de persona simultaneamente, totalizando 9 tarefas paralelas para revisões no mesmo repositório). Os achados dos Agentes 1-6 são verificados em um **único passo de verificação em lote** (um agente revisa todos os achados de uma vez, mantendo o custo de verificação fixo independentemente da quantidade de achados). Após a verificação, **auditoria reversa iterativa** executa 1-3 rodadas de busca de lacunas — cada rodada recebe a lista cumulativa de achados das rodadas anteriores, então as rodadas sucessivas focam no que ainda não foi descoberto. O loop para assim que uma rodada retorna "Nenhum problema encontrado", ou após 3 rodadas (limite máximo). Os achados da auditoria reversa pulam a verificação (o agente já tem contexto completo) e são incluídos como resultados de alta confiança.

## Análise Determinística

Antes da execução dos agentes LLM, o `/review` executa automaticamente os linters e verificadores de tipo existentes no seu projeto:

| Linguagem            | Ferramentas detectadas                                               |
| -------------------- | -------------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                             |
| Python               | `ruff`, `mypy`, `flake8`                                             |
| Rust                 | `cargo clippy`                                                       |
| Go                   | `go vet`, `golangci-lint`                                            |
| Java                 | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                       |
| C/C++                | `clang-tidy` (se `compile_commands.json` disponível)                 |
| Outros               | Descoberto automaticamente da config de CI (`.github/workflows/*.yml`, etc.) |

Para projetos que não seguem padrões comuns (ex.: OpenJDK), `/review` lê os arquivos de configuração de CI para descobrir quais comandos de lint/check o projeto utiliza. Nenhuma configuração do usuário é necessária.

Os achados determinísticos são marcados com `[linter]` ou `[typecheck]` e pulam a verificação LLM — são verdade absoluta.

- **Erros** → Severidade Crítica
- **Avisos** → Nice to have (apenas no terminal, não postados como comentários de PR)

Se uma ferramenta não estiver instalada ou exceder o tempo limite, ela é ignorada com uma nota informativa.

## Níveis de Severidade

| Severidade     | Significado                                                       | Postado como comentário de PR? |
| -------------- | ----------------------------------------------------------------- | ------------------------------ |
| **Crítico**    | Deve ser corrigido antes do merge (bugs, segurança, perda de dados, falhas de build) | Sim (apenas alta confiança)    |
| **Sugestão**   | Melhoria recomendada                                              | Sim (apenas alta confiança)    |
| **Nice to have** | Otimização opcional                                             | Não (apenas no terminal)       |

Achados de baixa confiança aparecem em uma seção separada "Requer Revisão Humana" no terminal e nunca são postados como comentários de PR.

## Autofix

Após apresentar os achados, `/review` oferece aplicar correções automaticamente para achados Críticos e Sugestão que possuem soluções claras:

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- As correções são aplicadas usando a ferramenta `edit` (substituições direcionadas, não reescritas completas do arquivo)
- Verificações de linter por arquivo são executadas após as correções para verificar se não introduzem novos problemas
- Para revisões de PR, as correções são commitadas e enviadas (push) a partir da worktree automaticamente — sua árvore de trabalho permanece limpa
- Achados Nice to have e de baixa confiança nunca são corrigidos automaticamente
- A submissão da revisão do PR sempre usa o **veredito pré-correção** (ex.: "Request changes") já que o PR remoto não foi atualizado até que o push de autofix seja concluído

## Isolamento da Worktree

Ao revisar um PR, `/review` cria uma worktree git temporária (`.qwen/tmp/review-pr-<numero>`) em vez de alternar sua branch atual. Isso significa que:

- Sua árvore de trabalho, mudanças em staged e branch atual **nunca são tocados**
- As dependências são instaladas na worktree (`npm ci`, etc.) para que linting e build/teste funcionem
- Os comandos de build e teste são executados em isolamento, sem poluir seu cache local de build
- Se algo der errado, seu ambiente não é afetado — basta deletar a worktree
- A worktree é limpa automaticamente após a conclusão da revisão
- Se uma revisão for interrompida (Ctrl+C, crash), o próximo `/review` do mesmo PR limpa automaticamente a worktree obsoleta antes de começar do zero
- Os relatórios de revisão e cache são salvos no diretório principal do projeto (não na worktree)

## Revisão de PR de Outro Repositório

Você pode revisar PRs de outros repositórios passando a URL completa:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Isso é executado em **modo leve** — sem worktree, sem linter, sem build/teste, sem autofix. A revisão é baseada apenas no texto do diff (obtido via API do GitHub). Comentários de PR ainda podem ser postados se você tiver acesso de escrita.

| Capacidade                                                  | Mesmo repositório | Outro repositório              |
| ----------------------------------------------------------- | ----------------- | ------------------------------ |
| Revisão LLM (Agentes 1-6 + verificação + auditoria reversa iterativa) | ✅                | ✅                             |
| Agente 7: Build & teste                                     | ✅                | ❌ (sem base de código local)  |
| Análise determinística (linter/typecheck)                   | ✅                | ❌                             |
| Análise de impacto entre arquivos                           | ✅                | ❌                             |
| Autofix                                                     | ✅                | ❌                             |
| Comentários em linha no PR                                  | ✅                | ✅ (se tiver acesso de escrita) |
| Cache de revisão incremental                                | ✅                | ❌                             |

## Comentários em Linha no PR

Use `--comment` para postar achados diretamente no PR:

```bash
/review 123 --comment
```

Ou, após executar `/review 123`, digite `post comments` para publicar os achados sem reexecutar a revisão.

**O que é postado:**

- Achados de alta confiança Críticos e Sugestão como comentários em linhas específicas
- Para vereditos Aprovar/Solicitar alterações: um resumo da revisão com o veredito
- Para veredito Comentar com todos os comentários em linha postados: nenhum resumo separado (os comentários em linha são suficientes)
- Rodapé de atribuição do modelo em cada comentário (ex.: _— qwen3-coder via Qwen Code /review_)

**O que fica apenas no terminal:**

- Achados Nice to have (incluindo avisos de linter)
- Achados de baixa confiança

**PRs próprios:** O GitHub não permite que você envie revisões `APPROVE` ou `REQUEST_CHANGES` em seu próprio pull request — ambos falham com HTTP 422. Quando `/review` detecta que o autor do PR corresponde ao usuário autenticado atual, ele automaticamente rebaixa o evento da API para `COMMENT` independentemente do veredito, para que a submissão ainda seja bem-sucedida. O terminal ainda mostra o veredito honesto ("Approve" / "Request changes" / "Comment") — apenas o evento de revisão do lado do GitHub é neutralizado. Os achados reais ainda aparecem como comentários em linha em linhas específicas, portanto o feedback substantivo permanece inalterado.

**Re-revisando um PR com comentários anteriores do Qwen Code:** quando `/review` é executado em um PR que já possui comentários de revisão anteriores do Qwen Code, ele os classifica antes de postar novos. Apenas **sobreposição na mesma linha** (um comentário existente no mesmo `(caminho, linha)` que um novo achado) solicita sua confirmação — esse é o caso em que você veria uma duplicata visual na mesma linha de código. Comentários de commits mais antigos, comentários respondidos (tratados como resolvidos) e comentários que simplesmente não se sobrepõem a nenhum novo achado são silenciosamente ignorados, com uma linha de log no terminal para que você saiba o que foi filtrado.

**Verificação de status de CI / build antes de APPROVE:** se o veredito for "Approve", `/review` consulta as execuções de check e status de commit do PR antes de submeter. Se alguma verificação falhou (ou todas as verificações ainda estão pendentes), o evento da API é automaticamente rebaixado de `APPROVE` para `COMMENT`, com o corpo da revisão explicando o motivo. Justificativa: a revisão LLM lê o código estaticamente e não pode ver falhas de teste em tempo de execução; aprovar enquanto a CI está vermelha seria enganoso. Os achados em linha ainda são postados inalterados. Se você quiser aprovar de qualquer maneira (ex.: uma falha de CI conhecida como instável), submeta a aprovação manualmente no GitHub após verificar.

## Ações de Acompanhamento

Após a revisão, dicas sensíveis ao contexto aparecem como texto fantasma. Pressione Tab para aceitar:

| Estado após revisão                       | Dica                   | O que acontece                                   |
| ----------------------------------------- | ---------------------- | ------------------------------------------------ |
| Revisão local com achados não corrigidos  | `fix these issues`     | LLM corrige interativamente cada achado         |
| Revisão de PR com achados                 | `post comments`        | Posta comentários em linha no PR (sem re-revisão) |
| Revisão de PR, zero achados               | `post comments`        | Aprova o PR no GitHub (LGTM)                     |
| Revisão local, tudo limpo                 | `commit`               | Commita suas mudanças                            |

Nota: `fix these issues` está disponível apenas para revisões locais. Para revisões de PR, use Autofix (Etapa 8) — a worktree é limpa após a revisão, portanto a correção interativa pós-revisão não é possível.

## Regras de Revisão do Projeto

Você pode personalizar os critérios de revisão por projeto. `/review` lê regras destes arquivos (nesta ordem):

1. `.qwen/review-rules.md` (nativo do Qwen Code)
2. `.github/copilot-instructions.md` (preferido) ou `copilot-instructions.md` (fallback — apenas um é carregado, não ambos)
3. `AGENTS.md` — seção `## Code Review`
4. `QWEN.md` — seção `## Code Review`

As regras são injetadas nos agentes de revisão LLM (1-6) como critérios adicionais. Para revisões de PR, as regras são lidas da **branch base** para evitar que um PR malicioso injete regras de bypass.

Exemplo `.qwen/review-rules.md`:

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## Revisão Incremental

Ao revisar um PR que já foi revisado anteriormente, `/review` examina apenas as mudanças desde a última revisão:

```bash
# Primeira revisão — revisão completa, cache criado
/review 123

# PR atualizado com novos commits — apenas novas mudanças revisadas
/review 123
```

### Revisão entre modelos

Se você trocar de modelo (via `/model`) e re-revisar o mesmo PR, `/review` detecta a mudança de modelo e executa uma revisão completa em vez de pular:

```bash
# Revisão com modelo A
/review 123

# Trocar modelo
/model

# Revisão novamente — revisão completa com modelo B (não pulada)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

O cache é armazenado em `.qwen/review-cache/` e rastreia tanto o SHA do commit quanto o ID do modelo. Certifique-se de que este diretório esteja no seu `.gitignore` (uma regra mais ampla como `.qwen/*` também funciona). Se o commit em cache foi removido por rebase, ele cai para uma revisão completa.

## Relatórios de Revisão

Para revisões no mesmo repositório, os resultados são salvos como um arquivo Markdown no diretório `.qwen/reviews/` do seu projeto (revisões leves de outros repositórios pulam a persistência do relatório):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Os relatórios incluem: timestamp, estatísticas do diff, resultados da análise determinística, todos os achados com status de verificação e o veredito.

## Análise de Impacto entre Arquivos

Quando as mudanças de código modificam funções, classes ou interfaces exportadas, os agentes de revisão automaticamente buscam todos os chamadores e verificam a compatibilidade:

- Mudanças na quantidade/tipo de parâmetros
- Mudanças no tipo de retorno
- Métodos públicos removidos ou renomeados
- Mudanças de API que quebram compatibilidade

Para diffs grandes (>10 símbolos modificados), a análise prioriza funções com mudanças de assinatura.

## Eficiência de Tokens

O pipeline de revisão usa um número limitado de chamadas LLM independentemente da quantidade de achados produzidos:

| Estágio                                          | Chamadas LLM | Notas                                               |
| ------------------------------------------------ | ------------ | --------------------------------------------------- |
| Análise determinística (Etapa 3)                 | 0            | Apenas comandos shell                               |
| Agentes de revisão (Etapa 4)                     | 9 (ou 8)     | Executados em paralelo; Agente 7 pulado no modo entre repositórios |
| Verificação em lote (Etapa 5)                    | 1            | Um único agente verifica todos os achados de uma vez |
| Auditoria reversa iterativa (Etapa 6)            | 1-3          | Loop até "Nenhum problema encontrado" ou limite de 3 rodadas |
| **Total**                                        | **11-13 (10-12)** | Mesmo repositório: 11-13; outro repositório: 10-12 (sem Agente 7) |

A maioria dos PRs converge para o extremo inferior do intervalo (1 rodada de auditoria reversa); o limite impede custos excessivos em casos patológicos.

## O que NÃO é Sinalizado

A revisão exclui intencionalmente:

- Problemas pré-existentes em código não alterado (foco apenas no diff)
- Problemas de estilo/ formatação/ nomenclatura que correspondem às convenções do seu código
- Problemas que um linter ou verificador de tipo pegaria (tratados pela análise determinística)
- Sugestões subjetivas do tipo "considere fazer X" sem um problema real
- Refatorações menores que não corrigem um bug ou risco
- Documentação ausente, a menos que a lógica seja genuinamente confusa
- Problemas já discutidos em comentários existentes do PR (evita duplicar feedback humano)

## Filosofia de Design

> **Silêncio é melhor que ruído.** Cada comentário deve valer o tempo do leitor.

- Se não tiver certeza se algo é um problema → não reporte
- Problemas de linter/typecheck são tratados por ferramentas, não por palpites do LLM
- Mesmo padrão em N arquivos → agregado em um único achado
- Comentários de PR são apenas de alta confiança
- Problemas de estilo/ formatação que correspondem às convenções do código são excluídos