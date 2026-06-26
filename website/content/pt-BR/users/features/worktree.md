# Worktrees

> Isole o trabalho experimental em uma [git worktree](https://git-scm.com/docs/git-worktree) temporária sem sair da sua sessão atual. Útil quando o modelo está prestes a fazer edições abrangentes que você deseja manter separadas do seu checkout principal, ou quando você quer que um subagente trabalhe em uma sandbox própria.

## Início Rápido

### Iniciar a sessão dentro de uma worktree (flag `--worktree`)

Se você sabe de antemão que a sessão inteira deve rodar dentro de uma worktree, passe `--worktree` na inicialização:

```bash
# Slug gerado automaticamente (ex.: tender-jemison-037f0a)
qwen --worktree

# Nome explícito
qwen --worktree my-feature

# Forma `=` (recomendada ao passar também um prompt posicional — veja dica abaixo)
qwen --worktree=my-feature

# Referência a PR — busca refs/pull/<N>/head de `origin`
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# Continuar uma sessão --worktree anterior — reanexa ao diretório existente
qwen --resume <session-id> --worktree=my-feature
```

> **Dica — `--worktree` simples seguido de um prompt posicional é ambíguo.** Como `--worktree` aceita um valor opcional, `qwen --worktree "diga oi"` faz com que o yargs consuma `"diga oi"` como slug (e o rejeite por causa do espaço). Use uma das alternativas:
>
> - `qwen --worktree=my-feature "diga oi"` (sempre funciona — slug explícito via `=`)
> - `qwen "diga oi" --worktree` (posicional primeiro, flag no final → slug automático)
> - `qwen --worktree --approval-mode yolo "diga oi"` (qualquer flag entre eles ancora a forma simples)

> **Dica — `qwen --resume --worktree foo` (sem ID de sessão) mostra um seletor vazio no primeiro uso.** O seletor restringe ao armazenamento da worktree escolhida; sessões iniciadas fora dessa worktree não são listadas. Para retomar uma sessão que foi iniciada dentro de `foo`, use `qwen --resume <id> --worktree foo` diretamente — a CLI reanexa ao diretório `foo/` existente em vez de recriá-lo.

`process.cwd()` e o workspace do modelo são alterados para a worktree antes da primeira rodada executar. Saia com `Ctrl+C` duas vezes e o [Diálogo de Saída](#exit-dialog-ctrlc--ctrld) pergunta se você quer manter ou remover a worktree.

A flag `--worktree` não pode ser combinada com `--acp`/`--experimental-acp` — para hosts ACP (como Zed), passe o caminho da worktree como `cwd` da requisição `loadSession`/`newSession`.

### Ou peça durante a sessão

Alternativamente, peça ao Qwen Code em linguagem natural para criar uma worktree dentro de uma sessão existente:

```text
> start a worktree called experiment-a
Worktree experiment-a created on branch worktree-experiment-a
.qwen/worktrees/experiment-a
```

A partir deste ponto, o modelo roteia toda edição de arquivo e comando shell através de `.qwen/worktrees/experiment-a/`. Seu diretório de trabalho original não é tocado.

Quando terminar:

```text
> exit the worktree and remove it
Removed worktree experiment-a (branch worktree-experiment-a)
```

Se quiser voltar mais tarde, peça para sair mantendo a worktree no disco:

```text
> exit the worktree but keep it
Kept worktree experiment-a at .qwen/worktrees/experiment-a
```

## Quando Worktrees São Usadas

Worktrees são ativadas em quatro caminhos independentes:

| Gatilho                                          | O que acontece                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Você inicia com `--worktree`                     | A CLI cria a worktree antes de qualquer rodada do modelo e muda o diretório da sessão para ela. Formulários de PR (`#N`, URL completa) fazem fetch primeiro. |
| Você explicitamente pede uma worktree durante a sessão   | O modelo chama `enter_worktree`; edições de arquivos subsequentes vão para dentro dela.                                           |
| Você explicitamente pede para sair                     | O modelo chama `exit_worktree` com `keep` ou `remove`.                                                                            |
| O modelo cria um subagente com isolamento ativado | Uma worktree descartável (`agent-<hex>`) é criada automaticamente e limpa se o agente não tiver diffs.                            |

As duas ferramentas de meio de sessão (`enter_worktree` / `exit_worktree`) são intencionalmente protegidas por frases explícitas — dizer "conserta esse bug" ou "cria um branch" **não** as acionará. Você precisa dizer algo como "use uma worktree", "inicie uma worktree" ou "em uma worktree". A flag `--worktree` da CLI não tem essa proteção; ela sempre cria uma quando presente.

## O que é Criado

Toda worktree gerenciada pelo Qwen é colocada dentro do diretório `.qwen` do seu projeto:

```
<raizDoRepo>/.qwen/worktrees/<slug>/         # Diretório de trabalho
                          ↳ branch worktree-<slug>   # Criado a partir do branch atual
```

- **Slug** — letras, dígitos, ponto, sublinhado, hífen; no máximo 64 caracteres. Se você não especificar um nome, um slug `<adjetivo>-<substantivo>-<6hex>` é gerado automaticamente (ex.: `tender-jemison-037f0a`). Referências a PR produzem `pr-<N>`.
- **Branch** — sempre `worktree-<slug>`, ramificado a partir do branch que você tem checkout no momento em que pede a worktree (não necessariamente o `HEAD` da árvore de trabalho principal). Para worktrees de PR, o branch é `worktree-pr-<N>` e é baseado em `FETCH_HEAD` (a ponta do PR no lado do GitHub) em vez do seu branch local.
- **Hooks** — o `core.hooksPath` da worktree é automaticamente apontado para o `.husky/` do repositório principal (preferido) ou `.git/hooks/`, para que commits dentro da worktree ainda acionem seus hooks de pre-commit / commit-msg existentes.
- **Symlinks opcionais** — diretórios listados em `worktree.symlinkDirectories` (veja [Configurações](#settings)) são linkados simbolicamente do repositório principal para a nova worktree, para que diretórios pesados como `node_modules` possam ser reutilizados sem reinstalação.
O caminho do worktree de uso geral **não é configurável** — ele deve estar em `<repoRoot>/.qwen/worktrees/` para que a CLI possa encontrá-lo na reinicialização e nas varreduras de limpeza de obsoletos. (A configuração não relacionada `agents.arena.worktreeBaseDir` controla apenas os worktrees do [Agent Arena](./arena.md), que usam uma árvore de caminho separada em `~/.qwen/arena/`.)

## Footer and Status Line

Quando um worktree está ativo, o Rodapé mostra um indicador atenuado em sua própria linha:

```
⎇ worktree-experiment-a (experiment-a)
```

Se você usa um [script de linha de status personalizado](./status-line.md), ele também recebe um objeto `worktree` no payload JSON canalizado para o stdin:

```json
{
  "worktree": {
    "name": "experiment-a",
    "path": "/path/to/repo/.qwen/worktrees/experiment-a",
    "branch": "worktree-experiment-a",
    "original_cwd": "/path/to/repo",
    "original_branch": "main"
  }
}
```

O campo payload está presente **apenas** quando um worktree está ativo, então uma verificação de `null` (`input.worktree?.name`) é suficiente.

Se a sua linha de status personalizada já renderiza informações do worktree, você pode ocultar a linha do Rodapé embutida para evitar duplicação — veja [Configurações](#settings) abaixo.

## Exit Dialog (Ctrl+C / Ctrl+D)

Pressionar o atalho de saída duas vezes enquanto um worktree está ativo abre o **Diálogo de Saída do Worktree** em vez de fechar a CLI:

```
⎇ Active worktree: "experiment-a" (worktree-experiment-a)

  • 2 new commit(s) on worktree-experiment-a
  • 3 uncommitted file(s)
  Removing the worktree will discard everything above.

What would you like to do?
  ○ Keep worktree (exit without deleting)
  ○ Remove worktree and branch (discards 2 commit(s), 3 file(s))
  ○ Cancel (stay in session)
```

O diálogo inspeciona o worktree ao abrir (`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`) e exibe ambas as contagens para que você saiba exatamente o que estaria descartando. `ESC` cancela.

Se o próprio `git status` falhar (por exemplo, índice corrompido, diretório do worktree removido durante a execução da CLI), o diálogo mostra um aviso `⚠ Could not measure worktree state` e as contagens podem não ser confiáveis — escolha **Manter** ou **Cancelar** até que você tenha diagnosticado o problema subjacente do repositório.

## `--resume` Restore

O vínculo do worktree ativo é persistido em um arquivo sidecar junto com a transcrição da sessão:

```
<chatsDir>/<sessionId>.worktree.json
```

Ao iniciar a CLI com `--resume <sessionId>` (ou escolher a sessão de `/resume`), três coisas acontecem de forma consistente nos modos **TUI interativo**, **headless `-p`** e **ACP/Zed**:

1. O sidecar é carregado e o diretório do worktree é verificado para garantir que ainda existe no disco.
2. Se estiver ativo, o modelo recebe um lembrete único no próximo prompt:
   ```
   [Resumed] Active worktree: "<slug>" at <path> (branch: <branch>). Continue using this path for all file operations.
   ```
3. Se o diretório do worktree foi excluído entre as sessões, o sidecar obsoleto é limpo automaticamente — nenhum erro, a retomada apenas continua sem o contexto do worktree.

Cada modo escolhe seu próprio mecanismo de injeção, mas o comportamento visível ao usuário é idêntico:

| Modo              | Mecanismo                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Interativo (TUI)  | `INFO` item de histórico + prefixo de lembrete do sistema no próximo prompt do usuário.                |
| Headless (`-p`)   | Prefixo `<system-reminder>` no prompt + evento de sistema JSON `worktree_restored` no fluxo de saída.  |
| ACP (ex.: Zed)    | Aviso pendente anexado à próxima chamada `prompt()`.                                                    |

O modelo **não** é automaticamente redirecionado para o worktree com `chdir` — o lembrete é o que o mantém roteando as edições através do caminho do worktree.

## Sub-Agent Isolation

A ferramenta `agent` aceita um parâmetro opcional `isolation: "worktree"`. Quando definido, o Qwen Code cria um worktree efêmero em `<repoRoot>/.qwen/worktrees/agent-<7hex>/` antes que o sub-agente inicie, e:

- **Sem alterações** → o worktree é removido automaticamente quando o agente termina.
- **Com alterações** → o worktree é preservado; seu caminho e branch são anexados ao resultado do agente, por exemplo,
  ```
  …agent output…
  [worktree preserved: /path/to/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  Revise o diff e faça o merge ou exclua manualmente.

Duas restrições:

- `isolation: "worktree"` requer um `subagent_type` — sub-agentes bifurcados (sem `subagent_type`) reutilizam o contexto completo da conversa do pai, então isolá-los dividiria a intenção da árvore de trabalho.
- Agentes em segundo plano (`run_in_background: true`) funcionam bem com isolamento; a limpeza é executada quando o agente reporta conclusão.

### Automatic Stale Cleanup

Worktrees de agente efêmeros que sobreviveram a uma falha ou desligamento com `--no-cleanup` são removidos em cada inicialização da CLI, com regras conservadoras de falha fechada:

| Guarda                                   | Comportamento                                |
| ---------------------------------------- | -------------------------------------------- |
| Slug deve corresponder ao padrão `agent-<7hex>` | Worktrees nomeados que você criou nunca são tocados. |
| Diretório `mtime` > 30 dias              | Entradas mais novas são ignoradas.           |
| Qualquer alteração rastreada não commitada | Pular a entrada (não excluir).               |
| Qualquer commit não alcançável a partir de um remoto | Pular a entrada (não excluir).               |
| Qualquer erro ao ler o estado do git     | Pular a entrada (não excluir).               |
Worktrees de usuário nomeado (`enter_worktree` slugs) **nunca** são limpos automaticamente — você os mantém até pedir para removê-los.

## Salvaguardas no `exit_worktree action="remove"`

Três guardas independentes são acionadas antes que o diretório e o branch sejam excluídos:

1. **Propriedade da sessão** — cada worktree carrega um marcador com o ID da sessão que o criou. Uma sessão diferente tentando removê-lo é recusada com um erro claro apontando para `git worktree remove` como saída de emergência manual.
2. **Árvore de trabalho suja** — alterações não commitadas (rastreadas ou não rastreadas) bloqueiam a remoção. Passe `discard_changes: true` para sobrescrever. (A bypass exige confirmação explícita do usuário — `action: "remove"` nunca é aprovado automaticamente no modo AUTO_EDIT.)
3. **Commits não mesclados** — commits em `worktree-<slug>` que nenhum outro branch local ou referência remota aponta bloqueiam a remoção incondicionalmente; não há uma flag "descartar commits" porque perder trabalho commitado raramente é o que os usuários querem. Primeiro faça merge, push ou renomeie o branch em outro lugar.

As mesmas três guardas se aplicam ao botão `WorktreeExitDialog → Remove`.

## Configurações

Duas configurações moldam a experiência geral de worktree:

| Chave                              | Tipo       | Padrão      | Efeito                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.hideBuiltinWorktreeIndicator`  | booleano   | `false`     | Oculta a linha de rodapé `⎇ worktree-… (…)` embutida. O campo `worktree` ainda é entregue a scripts de status line personalizados. Defina como `true` apenas se sua status line já renderizar o worktree — caso contrário, você perde toda a affordance da interface.                                                                       |
| `worktree.symlinkDirectories`      | `string[]` | `undefined` | Diretórios sob o repositório principal para fazer symlink em todo worktree de uso geral na criação. Caminhos são relativos à raiz do repositório; caminhos absolutos e qualquer entrada contendo `..` são rejeitados. Origens ausentes e destinos existentes são ignorados silenciosamente (sem sobrescrita). |

Exemplo:

```jsonc
// ~/.qwen/settings.json or <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

Aplica-se a TODOS os caminhos de criação de worktree: flag `--worktree`, ferramenta `enter_worktree` e `agent isolation: "worktree"`.

Configurações não relacionadas a worktrees gerais, mas que vale a pena conhecer:

- `agents.arena.worktreeBaseDir` — controla a localização do worktree do **Agent Arena** (padrão `~/.qwen/arena`). Não afeta os worktrees de uso geral, que sempre ficam em `<repoRoot>/.qwen/worktrees/`.

Ainda não há esquema para `worktree.sparsePaths` — isso está no roadmap (veja [Limitações](#limitações)).

## Referência de Ferramentas

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| Campo  | Tipo   | Obrigatório | Notas                                                                                              |
| ------ | ------ | ----------- | -------------------------------------------------------------------------------------------------- |
| `name` | string | não         | Slug. Letras, dígitos, ponto, sublinhado, hífen; máximo 64 caracteres. Gerado automaticamente quando omitido. |

Recusa-se a executar quando:

- A CLI não está em um repositório git.
- O diretório de trabalho atual já está dentro de `.qwen/worktrees/` (sem worktrees aninhados).

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| Campo             | Tipo                    | Obrigatório                            | Notas                                                                    |
| ----------------- | ----------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `name`            | string                  | sim                                    | Deve corresponder ao slug usado em `enter_worktree`.                     |
| `action`          | `"keep"` \| `"remove"` | sim                                    | `keep` preserva dir + branch; `remove` exclui ambos.                     |
| `discard_changes` | booleano                | apenas quando `action="remove"` e sujo | Sobrescreve a guarda de árvore suja. Não tem efeito para `action="keep"`. |

`action: "remove"` sempre pede confirmação, inclusive no modo de aprovação `AUTO_EDIT` — é tratado como uma operação destrutiva de shell, não uma ferramenta apenas informativa.

### `agent` — parâmetro `isolation`

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| Campo       | Tipo         | Obrigatório | Notas                                                                                              |
| ----------- | ------------ | ----------- | -------------------------------------------------------------------------------------------------- |
| `isolation` | `"worktree"` | não         | Executa o agente em um novo worktree `agent-<7hex>`. Requer que `subagent_type` seja definido (sem forks). |
Veja [Sub-Agents](./sub-agents.md) para o restante da referência de ferramentas do agente.

## Referência da CLI

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # auto-generate slug
qwen --worktree my-feature                                    # explicit slug
qwen --worktree=my-feature                                    # = form
qwen --worktree=#123                                          # PR reference
qwen --worktree https://github.com/owner/repo/pull/123        # PR URL
```

| Entrada                       | Resultado                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Flag simples (sem valor)      | Slug automático `<adjective>-<noun>-<6hex>`, branch `worktree-<slug>`, base = branch atual.                            |
| Slug simples                  | Branch `worktree-<slug>`, base = branch atual. Validação do slug: letras/dígitos/ponto/underline/hífen, máximo 64 caracteres. |
| `#N` ou `<github-url>/pull/N`| Slug `pr-<N>`, branch `worktree-pr-<N>`, base = `FETCH_HEAD` após `git fetch origin pull/<N>/head` (timeout de 30s).    |

`--worktree` não pode ser combinado com `--acp` / `--experimental-acp`.

Quando `--worktree` é combinado com `--resume <session-id>`, o worktree vence: o worktree salvo da sessão retomada (se houver) é substituído e uma linha no stderr + um lembrete no primeiro prompt informam a substituição.

Para modos interativo (TUI) e headless (`-p`), o worktree é criado automaticamente e a sessão muda para ele antes do primeiro turno.

Modos de falha ao buscar PR (código de saída != 0, nenhum worktree criado):

| Causa                          | Trecho da mensagem                                         |
| ------------------------------ | ---------------------------------------------------------- |
| Remoto `origin` ausente        | `requires an "origin" remote that points at GitHub`        |
| PR não existe no origin        | `Failed to fetch PR #<N>: the PR does not exist on origin` |
| Timeout de rede de 30s         | `Failed to fetch PR #<N>: timed out after 30s`             |
| Número do PR fora do intervalo / zero | `Invalid PR number`                                        |

## Limitações

Os itens a seguir não foram implementados intencionalmente na fase atual:

- **Sem sparse checkout.** Monorepos grandes fazem o checkout da árvore completa. (`worktree.sparsePaths` é um item no roadmap.)
- **Sem integração com tmux.** A CLI não inicia sessões worktree em novas janelas tmux.
- **Worktrees são "projetos" separados para armazenamento de sessões.** Sessões iniciadas com `--worktree foo` são salvas no diretório de chats desse worktree; para retomá-las depois, você deve passar `--worktree foo` novamente. Sessões iniciadas sem `--worktree` são salvas no checkout principal e não aparecerão no seletor de retomada do worktree.
- **Sem substituição de sessão entre slugs.** `qwen --resume <sid> --worktree second` onde `<sid>` foi criado com `--worktree first` falhará ao encontrar a sessão — sessões e worktrees estão fortemente vinculados por `projectHash(cwd)`. Para alternar worktrees em uma sessão existente, você deve sair e reiniciar com o novo `--worktree` e um prompt novo. Uma futura mudança arquitetural (ancorando o armazenamento na raiz do repositório em vez de `cwd`) removeria essa restrição.
- **`enter_worktree` no meio da sessão NÃO altera `process.cwd()` nem `Config.targetDir`.** Essa ferramenta usa a convenção de apenas contexto do modelo (veja [Sub-Agents](./sub-agents.md)). Apenas a flag `--worktree` na inicialização altera o diretório de trabalho do processo.
- **Caminhos relativos em outros campos de argumento são resolvidos ANTES do chdir do worktree.** Flags que aceitam caminhos (`--mcp-config`, `--openai-logging-dir`, `--json-file`, `--input-file`, `--telemetry-outfile`, `--include-directories`) são normalizadas para caminhos absolutos em relação ao cwd de lançamento quando `--worktree` está definido. Outros campos argv em forma de caminho que não estão nesta lista ainda são resolvidos em relação ao cwd do worktree — use caminhos absolutos para segurança.

Acompanhe o roadmap em `docs/design/worktree.md`.

## Solução de problemas

**O rodapé não mostra o indicador de worktree mesmo que eu tenha acabado de criar um.**
Verifique se `ui.hideBuiltinWorktreeIndicator` não está definido como `true`. Confirme também que o slug não está vazio na mensagem de sucesso da ferramenta.

**`--resume` não restaura meu worktree.**
Verifique se `<chatsDir>/<sessionId>.worktree.json` existe. A CLI exclui o sidecar automaticamente quando o diretório do worktree não existe mais, então sidecar ausente mais diretório ausente é o estado normal de "nenhum worktree para restaurar" — não é um bug. Execute com `--debug` e grep por `restoreWorktreeContext` para ver o motivo.

**`exit_worktree` diz "criado por uma sessão diferente".**
Isso é uma proteção de propriedade da sessão. Retome a sessão original e saia de lá, ou execute manualmente o comando sugerido `git worktree remove …`.

**Worktrees obsoletos `agent-<hex>` continuam se acumulando.**
O limite de 30 dias é conservador; limpe manualmente com `git worktree list && git worktree remove <path>`, ou aguarde — a próxima inicialização da CLI após o marco de 30 dias os removerá desde que estejam limpos e enviados.
