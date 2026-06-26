# Code Review

> Revise alterações de código em relação a correção, segurança, desempenho e qualidade de código usando `/review`.

## Início Rápido

```bash
# Revisar alterações locais não commitadas
/review

# Revisar um pull request (por número ou URL)
/review 123
/review https://github.com/org/repo/pull/123

# Revisar e postar comentários inline no PR
/review 123 --comment

# Revisar um arquivo específico
/review src/utils/auth.ts
```

Se não houver alterações não commitadas, `/review` informará e interromperá — nenhum agente é iniciado.

## Como Funciona

O comando `/review` executa um pipeline de múltiplas etapas:

```
Etapa 1:  Determinar escopo (diff local / worktree do PR / arquivo)
Etapa 2:  Carregar regras de revisão do projeto
Etapa 3:  Executar análise determinística (linter, typecheck)    [custo zero de LLM]
Etapa 4:  9 agentes de revisão em paralelo                       [9 chamadas de LLM]
           |-- Agente 1: Correção
           |-- Agente 2: Segurança
           |-- Agente 3: Qualidade de Código
           |-- Agente 4: Performance e Eficiência
           |-- Agente 5: Cobertura de Testes
           |-- Agente 6: Auditoria Não Direcionada (3 personas: 6a/6b/6c)
           '-- Agente 7: Build e Teste (executa comandos shell)
Etapa 5:  Deduplicação --> Verificação em lote --> Agregação        [1 chamada de LLM]
Etapa 6:  Auditoria reversa iterativa (1-3 rodadas, busca de lacunas) [1-3 chamadas de LLM]
Etapa 7:  Apresentar descobertas + veredito
Etapa 8:  Correção automática (confirmada pelo usuário, opcional)
Etapa 9:  Postar comentários inline no PR (se solicitado)
Etapa 10: Salvar relatório + cache incremental
Etapa 11: Limpeza (remover worktree + arquivos temporários)
```

### Agentes de Revisão

| Agente                             | Foco                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agente 1: Correção                | Erros de lógica, casos de borda, tratamento de nulo, condições de corrida, segurança de tipos |
| Agente 2: Segurança               | Injeção, XSS, SSRF, bypass de autenticação, exposição de dados sensíveis                     |
| Agente 3: Qualidade de Código     | Consistência de estilo, nomenclatura, duplicação, código morto                                |
| Agente 4: Performance e Eficiência | Consultas N+1, vazamentos de memória, re-renderizações desnecessárias, tamanho do bundle      |
| Agente 5: Cobertura de Testes     | Caminhos de código não testados no diff, cobertura de branch ausente, asserções fracas        |
| Agente 6: Auditoria Não Direcionada | 3 personas paralelas (atacante / plantão 3h da manhã / mantenedor) — captura problemas entre dimensões |
| Agente 7: Build e Teste           | Executa comandos de build e teste, reporta falhas                                              |

Todos os agentes executam em paralelo (Agente 6 inicia 3 variantes de persona concorrentemente, totalizando 9 tarefas paralelas para revisões no mesmo repositório). As descobertas dos Agentes 1-6 são verificadas em uma **única passagem de verificação em lote** (um agente revisa todas as descobertas de uma vez, mantendo o custo de verificação fixo independentemente do número de descobertas). Após a verificação, a **auditoria reversa iterativa** executa de 1 a 3 rodadas de busca de lacunas — cada rodada recebe a lista cumulativa de descobertas das rodadas anteriores, então rodadas sucessivas focam no que ainda não foi descoberto. O loop para assim que uma rodada retorna "Nenhum problema encontrado", ou após 3 rodadas (limite máximo). As descobertas da auditoria reversa pulam a verificação (o agente já tem contexto completo) e são incluídas como resultados de alta confiança.

## Análise Determinística

Antes da execução dos agentes LLM, `/review` executa automaticamente os linters e verificadores de tipo existentes no seu projeto:

| Linguagem            | Ferramentas detectadas                                              |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (se `compile_commands.json` disponível)              |
| Outros                | Descoberto automaticamente a partir da config de CI (`.github/workflows/*.yml`, etc.) |

Para projetos que não seguem padrões comuns (ex.: OpenJDK), `/review` lê arquivos de configuração de CI para descobrir quais comandos de lint/check o projeto utiliza. Nenhuma configuração do usuário é necessária.

Descobertas determinísticas são marcadas com `[linter]` ou `[typecheck]` e pulam a verificação LLM — são verdade absoluta.

- **Erros** → Severidade crítica
- **Avisos** → Bom ter (apenas terminal, não postados como comentários no PR)

Se uma ferramenta não estiver instalada ou exceder o tempo limite, ela é ignorada com uma nota informativa.

## Níveis de Severidade

| Severidade       | Significado                                                       | Postado como comentário no PR? |
| ---------------- | ----------------------------------------------------------------- | ------------------------------ |
| **Crítico**      | Deve corrigir antes de mesclar (bugs, segurança, perda de dados, falhas de build) | Sim (apenas alta confiança) |
| **Sugestão**     | Melhoria recomendada                                              | Sim (apenas alta confiança) |
| **Bom ter**      | Otimização opcional                                               | Não (apenas terminal)        |
Descobertas de baixa confiança aparecem em uma seção separada "Requer Revisão Humana" no terminal e nunca são postadas como comentários no PR.

## Autofix

Após apresentar as descobertas, `/review` oferece aplicar automaticamente correções para descobertas Críticas e Sugestões que tenham soluções claras:

```
Encontrados 3 problemas com sugestões auto-corrigíveis. Aplicar correções automáticas? (s/n)
```

- As correções são aplicadas usando a ferramenta `edit` (substituições direcionadas, não reescritas completas de arquivos)
- Verificações de linter por arquivo são executadas após as correções para confirmar que não introduzem novos problemas
- Para revisões de PR, as correções são commitadas e enviadas a partir da worktree automaticamente — sua árvore de trabalho permanece limpa
- Descobertas "nice to have" e de baixa confiança nunca são corrigidas automaticamente
- O envio da revisão do PR sempre usa o **veredito pré-correção** (ex.: "Solicitar alterações") já que o PR remoto não foi atualizado até que o push da correção automática seja concluído

## Isolamento de Worktree

Ao revisar um PR, `/review` cria uma worktree git temporária (`.qwen/tmp/review-pr-<número>`) em vez de mudar sua branch atual. Isso significa:

- Sua árvore de trabalho, alterações em staged e branch atual **nunca são tocados**
- As dependências são instaladas na worktree (`npm ci`, etc.) para que as verificações de lint e build/test funcionem
- Comandos de build e test são executados em isolamento sem poluir seu cache local de build
- Se algo der errado, seu ambiente não é afetado — basta excluir a worktree
- A worktree é automaticamente limpa após a conclusão da revisão
- Se uma revisão for interrompida (Ctrl+C, falha), a próxima execução de `/review` no mesmo PR limpa automaticamente a worktree obsoleta antes de começar do zero
- Relatórios de revisão e cache são salvos no diretório principal do projeto (não na worktree)

## Revisão de PR em Repositórios Cruzados

Você pode revisar PRs de outros repositórios fornecendo a URL completa:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Isso executa em **modo leve** — sem worktree, sem linter, sem build/test, sem autofix. A revisão é baseada apenas no texto do diff (obtido via API do GitHub). Comentários no PR ainda podem ser postados se você tiver acesso de escrita.

| Capacidade                                                | Mesmo repositório | Repositório cruzado                |
| --------------------------------------------------------- | ----------------- | ---------------------------------- |
| Revisão LLM (Agentes 1-6 + verificação + auditoria reversa iterativa) | ✅                | ✅                                 |
| Agente 7: Build & test                                    | ✅                | ❌ (sem codebase local)            |
| Análise determinística (linter/typecheck)                 | ✅                | ❌                                 |
| Análise de impacto entre arquivos                          | ✅                | ❌                                 |
| Autofix                                                   | ✅                | ❌                                 |
| Comentários inline no PR                                  | ✅                | ✅ (se você tiver acesso de escrita) |
| Cache de revisão incremental                              | ✅                | ❌                                 |

## Comentários inline no PR

Use `--comment` para postar as descobertas diretamente no PR:

```bash
/review 123 --comment
```

Ou, após executar `/review 123`, digite `post comments` para publicar as descobertas sem reexecutar a revisão.

**O que é postado:**

- Descobertas Críticas e Sugestões de alta confiança como comentários inline em linhas específicas
- Para vereditos Aprovar/Solicitar alterações: um resumo da revisão com o veredito
- Para veredito Comentar com todos os comentários inline postados: nenhum resumo separado (os comentários inline são suficientes)
- Rodapé de atribuição do modelo em cada comentário (ex.: _— qwen3-coder via Qwen Code /review_)

**O que permanece apenas no terminal:**

- Descobertas "nice to have" (incluindo avisos de linter)
- Descobertas de baixa confiança

**PRs de autoria própria:** O GitHub não permite que você submeta revisões `APPROVE` ou `REQUEST_CHANGES` em seu próprio pull request — ambas falham com HTTP 422. Quando `/review` detecta que o autor do PR corresponde ao usuário autenticado atual, ele automaticamente rebaixa o evento da API para `COMMENT` independentemente do veredito, para que o envio ainda seja bem-sucedido. O terminal ainda mostra o veredito honesto ("Aprovar" / "Solicitar alterações" / "Comentar") — apenas o evento de revisão do lado do GitHub é neutralizado. As descobertas reais ainda aparecem como comentários inline em linhas específicas, então o feedback substancial permanece inalterado.

**Re-revisando um PR com comentários anteriores do Qwen Code:** quando `/review` é executado em um PR que já possui comentários de revisão anteriores do Qwen Code, ele os classifica antes de postar novos. Apenas **sobreposição na mesma linha** (um comentário existente no mesmo `(caminho, linha)` de uma nova descoberta) solicita sua confirmação — esse é o caso em que você veria uma duplicata visual na mesma linha de código. Comentários de commits mais antigos, comentários respondidos (tratados como resolvidos) e comentários que simplesmente não se sobrepõem a nenhuma nova descoberta são ignorados silenciosamente, com uma linha de log no terminal informando o que foi filtrado.

**Verificação de status CI / build antes de APROVAR:** se o veredito for "Aprovar", `/review` consulta as check-runs e status de commit do PR antes de submeter. Se alguma verificação falhou (ou todas as verificações ainda estão pendentes), o evento da API é automaticamente rebaixado de `APPROVE` para `COMMENT`, com o corpo da revisão explicando o motivo. Racional: a revisão LLM lê código estaticamente e não pode ver falhas de teste em runtime; aprovar enquanto o CI está vermelho seria enganoso. As descobertas inline ainda são postadas inalteradas. Se você quiser aprovar de qualquer forma (por exemplo, uma falha de CI conhecidamente instável), submeta a aprovação do GitHub manualmente após verificar.
## Ações de Acompanhamento

Após a revisão, dicas sensíveis ao contexto aparecem como texto fantasma. Pressione Tab para aceitar:

| Estado após a revisão                 | Dica                | O que acontece                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Revisão local com achados não corrigidos | `fix these issues` | O LLM corrige interativamente cada achado    |
| Revisão de PR com achados            | `post comments`    | Envia comentários inline no PR (sem nova revisão) |
| Revisão de PR, zero achados           | `post comments`    | Aprova o PR no GitHub (LGTM)        |
| Revisão local, tudo limpo            | `commit`           | Commita suas alterações                    |

Nota: `fix these issues` está disponível apenas para revisões locais. Para revisões de PR, use o Autofix (Etapa 8) — a árvore de trabalho é limpa após a revisão, portanto a correção interativa pós-revisão não é possível.

## Regras de Revisão do Projeto

Você pode personalizar os critérios de revisão por projeto. `/review` lê regras destes arquivos (em ordem):

1. `.qwen/review-rules.md` (nativo do Qwen Code)
2. `.github/copilot-instructions.md` (preferido) ou `copilot-instructions.md` (fallback — apenas um é carregado, não ambos)
3. `AGENTS.md` — seção `## Code Review`
4. `QWEN.md` — seção `## Code Review`

As regras são injetadas nos agentes de revisão do LLM (1-6) como critérios adicionais. Para revisões de PR, as regras são lidas da **branch base** para evitar que um PR malicioso injete regras de desvio.

Exemplo `.qwen/review-rules.md`:

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

Se você trocar de modelo (via `/model`) e re-revisar o mesmo PR, o `/review` detecta a mudança de modelo e executa uma revisão completa em vez de pular:

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

O cache é armazenado em `.qwen/review-cache/` e rastreia tanto o SHA do commit quanto o ID do modelo. Certifique-se de que este diretório esteja no seu `.gitignore` (uma regra mais ampla como `.qwen/*` também funciona). Se o commit em cache foi removido por um rebase, uma revisão completa é feita como fallback.

## Relatórios de Revisão

Para revisões no mesmo repositório, os resultados são salvos como um arquivo Markdown no diretório `.qwen/reviews/` do seu projeto (revisões leves entre repositórios ignoram a persistência do relatório):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Os relatórios incluem: timestamp, estatísticas do diff, resultados da análise determinística, todos os achados com status de verificação e o veredito.

## Análise de Impacto entre Arquivos

Quando alterações de código modificam funções, classes ou interfaces exportadas, os agentes de revisão automaticamente procuram todos os chamadores e verificam a compatibilidade:

- Alterações no número/tipo de parâmetros
- Alterações no tipo de retorno
- Métodos públicos removidos ou renomeados
- Mudanças na API que quebram compatibilidade

Para diffs grandes (>10 símbolos modificados), a análise prioriza funções com alterações de assinatura.

## Eficiência de Tokens

O pipeline de revisão usa um número limitado de chamadas LLM, independentemente da quantidade de achados produzidos:

| Estágio                            | Chamadas LLM         | Notas                                               |
| -------------------------------- | ----------------- | --------------------------------------------------- |
| Análise determinística (Etapa 3)  | 0                 | Apenas comandos Shell                                 |
| Agentes de revisão (Etapa 4)           | 9 (ou 8)          | Executados em paralelo; Agente 7 ignorado no modo entre repositórios |
| Verificação em lote (Etapa 5)      | 1                 | Agente único verifica todos os achados de uma vez          |
| Auditoria reversa iterativa (Etapa 6) | 1-3               | Repete até "Nenhum problema encontrado" ou limite de 3 rodadas        |
| **Total**                        | **11-13 (10-12)** | Mesmo repositório: 11-13; entre repositórios: 10-12 (sem Agente 7)    |

A maioria dos PRs converge para o limite inferior do intervalo (1 rodada de auditoria reversa); o limite evita custos descontrolados em casos patológicos.

## O que NÃO é Sinalizado

A revisão intencionalmente exclui:

- Problemas pré-existentes em código não alterado (foco apenas no diff)
- Estilo/formatação/nomenclatura que corresponde às convenções do seu código
- Problemas que um linter ou verificador de tipos detectaria (tratados pela análise determinística)
- Sugestões subjetivas do tipo "considere fazer X" sem um problema real
- Refatoração menor que não corrige um bug ou risco
- Documentação ausente, a menos que a lógica seja genuinamente confusa
- Problemas já discutidos em comentários existentes do PR (evita duplicar feedback humano)
## Filosofia de Design

> **Silêncio é melhor que ruído.** Cada comentário deve valer o tempo do leitor.

- Se não tiver certeza se algo é um problema → não reporte
- Problemas de linter/typecheck são tratados por ferramentas, não por palpites do LLM
- Mesmo padrão em N arquivos → agregado em um único achado
- Comentários em PRs são apenas de alta confiança
- Problemas de estilo/formatação que seguem as convenções do código são excluídos
