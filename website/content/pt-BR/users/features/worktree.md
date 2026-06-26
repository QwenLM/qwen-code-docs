# Worktrees

> Isole o trabalho experimental em uma [git worktree](https://git-scm.com/docs/git-worktree) temporária sem sair da sua sessão atual. Útil quando o modelo está prestes a fazer edições de grande alcance que você deseja manter separadas do seu checkout principal, ou quando você quer que um subagente trabalhe em uma sandbox própria.

## Início Rápido

### Iniciar a sessão dentro de uma worktree (flag `--worktree`)

Se você já sabe de antemão que a sessão inteira deve rodar dentro de uma worktree, passe `--worktree` na inicialização:

```bash
# Slug gerado automaticamente (ex.: tender-jemison-037f0a)
qwen --worktree

# Nome explícito
qwen --worktree my-feature

# Forma com `=` (recomendada ao passar também um prompt posicional — veja dica abaixo)
qwen --worktree=my-feature

# Referência de PR — busca refs/pull/<N>/head do `origin`
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# Continuar uma sessão anterior com --worktree — reconecta ao diretório existente
qwen --resume <session-id> --worktree=my-feature
```

> **Dica — `--worktree` puro seguido de um prompt posicional é ambíguo.** Como `--worktree` aceita um valor opcional, `qwen --worktree "diga oi"` faz o yargs consumir `"diga oi"` como o slug (e rejeitá-lo por causa do espaço). Use uma das alternativas:
>
> - `qwen --worktree=my-feature "diga oi"` (sempre funciona — slug explícito via `=`)
> - `qwen "diga oi" --worktree` (posicional primeiro, flag no final → slug automático)
> - `qwen --worktree --approval-mode yolo "diga oi"` (qualquer flag entre eles ancora a forma simples)

> **Dica — `qwen --resume --worktree foo` (sem ID de sessão) mostra um seletor vazio na primeira vez.** O seletor é escopado ao armazenamento de sessões da worktree escolhida; sessões iniciadas fora dessa worktree não são listadas. Para retomar uma sessão que foi iniciada dentro de `foo`, use `qwen --resume <id> --worktree foo` diretamente — a CLI reconecta ao diretório `foo/` existente em vez de recriá-lo.

`process.cwd()` e o workspace do modelo são alterados para a worktree antes da primeira rodada de interação. Saia com `Ctrl+C` duas vezes e o [Diálogo de Saída](#diálogo-de-saída-ctrlc--ctrld) pergunta se deseja manter ou remover a worktree.

A flag `--worktree` não pode ser combinada com `--acp`/`--experimental-acp` — para hosts ACP (como Zed), passe o caminho da worktree como o `cwd` da requisição `loadSession`/`newSession`.

### Ou peça no meio da sessão

Alternativamente, peça ao Qwen Code em linguagem natural para criar uma worktree de dentro de uma sessão existente:

```text
> crie uma worktree chamada experimento-a
Worktree experimento-a criada no branch worktree-experimento-a
.qwen/worktrees/experimento-a
```

A partir deste ponto, o modelo roteia toda edição de arquivo e comando de shell através de `.qwen/worktrees/experimento-a/`. Seu diretório de trabalho original não é tocado.

Quando terminar:

```text
> saia da worktree e remova-a
Worktree experimento-a removida (branch worktree-experimento-a)
```

Se quiser voltar depois, peça para sair mantendo a worktree no disco:

```text
> saia da worktree mas mantenha-a
Worktree experimento-a mantida em .qwen/worktrees/experimento-a
```

## Quando as Worktrees São Usadas

As worktrees são ativadas em quatro caminhos independentes:

| Gatilho                                                | O que acontece                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Você inicia com `--worktree`                           | A CLI cria a worktree antes de qualquer rodada do modelo e muda o diretório da sessão para ela. Formulários de PR (`#N`, URL completa) fazem fetch primeiro. |
| Você pede explicitamente uma worktree no meio da sessão| O modelo chama `enter_worktree`; edições subsequentes de arquivos vão para dentro dela.                                   |
| Você pede explicitamente para sair                     | O modelo chama `exit_worktree` com `keep` ou `remove`.                                                                      |
| Modelo inicia um subagente com isolamento ativado      | Uma worktree descartável (`agent-<hex>`) é criada automaticamente e limpa se o agente não tiver diffs.                     |

As duas ferramentas de meio de sessão (`enter_worktree` / `exit_worktree`) são deliberadamente protegidas por frases explícitas — dizer "corrija este bug" ou "crie um branch" **não** as acionará. Você deve dizer algo como "use uma worktree", "inicie uma worktree" ou "em uma worktree". A flag de CLI `--worktree` não tem essa proteção; ela sempre cria uma quando presente.

## O Que É Criado

Cada worktree gerenciada pelo Qwen é colocada sob o diretório `.qwen` do seu projeto:

```
<raizDoRepo>/.qwen/worktrees/<slug>/         # Diretório de trabalho
                          ↳ branch worktree-<slug>   # Criado a partir do seu branch atual
```

- **Slug** — letras, dígitos, ponto, sublinhado, hífen; máximo de 64 caracteres. Se você não especificar um nome, um slug `<adjetivo>-<substantivo>-<6hex>` é gerado automaticamente (ex.: `tender-jemison-037f0a`). Referências de PR produzem `pr-<N>`.
- **Branch** — sempre `worktree-<slug>`, ramificado a partir do branch que você tem checkout no momento em que pede a worktree (não necessariamente o `HEAD` da árvore de trabalho principal). Para worktrees de PR o branch é `worktree-pr-<N>` e é baseado em `FETCH_HEAD` (a ponta do PR no lado do GitHub) em vez do seu branch local.
- **Hooks** — o `core.hooksPath` da worktree é automaticamente apontado para o `.husky/` do repositório principal (preferido) ou `.git/hooks/` para que commits dentro da worktree ainda acionem seus hooks de pre-commit / commit-msg existentes.
- **Links simbólicos opcionais** — diretórios listados em `worktree.symlinkDirectories` (veja [Configurações](#configurações)) são linkados simbolicamente do repositório principal para a nova worktree, para que diretórios pesados como `node_modules` possam ser reutilizados sem reinstalação.

O caminho da worktree de propósito geral **não é configurável** — ele deve ficar em `<raizDoRepo>/.qwen/worktrees/` para que a CLI possa encontrá-lo na reinicialização e nas varreduras de limpeza de worktrees obsoletas. (A configuração não relacionada `agents.arena.worktreeBaseDir` controla apenas worktrees da [Agent Arena](./arena.md), que usam uma árvore de caminhos separada em `~/.qwen/arena/`.)

## Rodapé e Linha de Status

Quando uma worktree está ativa, o Rodapé mostra um indicador esmaecido em sua própria linha:

```
⎇ worktree-experimento-a (experimento-a)
```

Se você usa um [script de linha de status personalizado](./status-line.md), ele também recebe um objeto `worktree` no payload JSON enviado para stdin:

```json
{
  "worktree": {
    "name": "experimento-a",
    "path": "/caminho/para/repo/.qwen/worktrees/experimento-a",
    "branch": "worktree-experimento-a",
    "original_cwd": "/caminho/para/repo",
    "original_branch": "main"
  }
}
```

O campo do payload está presente **apenas** quando uma worktree está ativa, então uma verificação de `null` (`input.worktree?.name`) é suficiente.

Se sua linha de status personalizada já renderiza informações da worktree, você pode ocultar a linha do Rodapé embutida para evitar duplicação — veja [Configurações](#configurações) abaixo.

## Diálogo de Saída (Ctrl+C / Ctrl+D)

Pressionar o atalho de sair duas vezes enquanto uma worktree está ativa abre o **Diálogo de Saída de Worktree** em vez de fechar a CLI:

```
⎇ Worktree ativa: "experimento-a" (worktree-experimento-a)

  • 2 novo(s) commit(s) em worktree-experimento-a
  • 3 arquivo(s) não comitado(s)
  Remover a worktree descartará tudo acima.

O que você gostaria de fazer?
  ○ Manter worktree (sair sem deletar)
  ○ Remover worktree e branch (descarta 2 commit(s), 3 arquivo(s))
  ○ Cancelar (permanecer na sessão)
```

O diálogo inspeciona a worktree na abertura (`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`) e exibe ambas as contagens para que você saiba exatamente o que estaria descartando. `ESC` cancela.

Se `git status` falhar (ex.: índice corrompido, diretório da worktree foi removido sob a CLI), o diálogo mostra um aviso `⚠ Não foi possível medir o estado da worktree` e as contagens podem não ser confiáveis — escolha **Manter** ou **Cancelar** até diagnosticar o problema subjacente do repositório.

## Restauração com `--resume`

O vínculo da worktree ativa é persistido em um arquivo auxiliar junto com o transcript da sessão:

```
<chatsDir>/<sessionId>.worktree.json
```

Quando você inicia a CLI com `--resume <sessionId>` (ou escolhe a sessão em `/resume`), três coisas acontecem consistentemente nos modos **TUI interativo**, **headless `-p`** e **ACP/Zed**:

1. O arquivo auxiliar é carregado e o diretório da worktree é verificado se ainda existe no disco.
2. Se estiver vivo, o modelo recebe um lembrete único no seu próximo prompt:
   ```
   [Retomado] Worktree ativa: "<slug>" em <path> (branch: <branch>). Continue usando este caminho para todas as operações de arquivo.
   ```
3. Se o diretório da worktree foi deletado entre as sessões, o arquivo auxiliar obsoleto é limpo automaticamente — sem erro, a retomada apenas continua sem contexto de worktree.

Cada modo escolhe seu próprio mecanismo de injeção, mas o comportamento visível ao usuário é idêntico:

| Modo              | Mecanismo                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Interativo (TUI)  | Item de histórico `INFO` + prefixo de lembrete do sistema no próximo prompt do usuário.                          |
| Headless (`-p`)   | Prefixo `<system-reminder>` no prompt + evento de sistema JSON `worktree_restored` no fluxo de saída.            |
| ACP (ex.: Zed)    | Aviso pendente anexado à próxima chamada de `prompt()`.                                                          |

O modelo **não** tem seu diretório automaticamente alterado para a worktree — o lembrete é o que o mantém roteando edições através do caminho da worktree.

## Isolamento de Subagente

A ferramenta `agent` aceita um parâmetro opcional `isolation: "worktree"`. Quando definido, o Qwen Code cria uma worktree efêmera em `<raizDoRepo>/.qwen/worktrees/agent-<7hex>/` antes do subagente iniciar, e:

- **Sem alterações** → a worktree é automaticamente removida quando o agente termina.
- **Com alterações** → a worktree é preservada; seu caminho e branch são anexados ao resultado do agente, ex.:
  ```
  …saída do agente…
  [worktree preservada: /caminho/para/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  Revise o diff e faça merge ou delete manualmente.

Duas restrições:

- `isolation: "worktree"` requer um `subagent_type` — subagentes bifurcados (sem `subagent_type`) reutilizam o contexto completo da conversa do pai, então isolá-los dividiria a intenção da árvore de trabalho.
- Agentes em segundo plano (`run_in_background: true`) funcionam bem com isolamento; a limpeza ocorre quando o agente reporta conclusão.

### Limpeza Automática de Worktrees Obsoletas

Worktrees de agente efêmeras que sobreviveram a uma falha ou desligamento com `--no-cleanup` são removidas em toda inicialização da CLI, com regras conservadoras de fechamento em falha:

| Proteção                             | Comportamento                                  |
| ------------------------------------ | ---------------------------------------------- |
| Slug deve corresponder ao padrão `agent-<7hex>` | Worktrees nomeadas que você criou nunca são tocadas. |
| `mtime` do diretório > 30 dias       | Entradas mais recentes são ignoradas.          |
| Qualquer alteração monitorada não comitada | Ignora a entrada (não deleta).                  |
| Qualquer commit não alcançável de um remoto | Ignora a entrada (não deleta).                  |
| Qualquer erro ao ler o estado do git | Ignora a entrada (não deleta).                  |

Worktrees nomeadas de usuário (slugs do `enter_worktree`) **nunca** são limpas automaticamente — você as mantém até pedir para removê-las.

## Proteções de Segurança em `exit_worktree action="remove"`

Três proteções independentes são acionadas antes que o diretório e o branch sejam deletados:

1. **Propriedade da sessão** — cada worktree carrega um marcador auxiliar com o ID da sessão que a criou. Uma sessão diferente tentando removê-la é recusada com um erro claro apontando para `git worktree remove` como saída de escape manual.
2. **Árvore de trabalho suja** — alterações monitoradas não comitadas ou não rastreadas bloqueiam a remoção. Passe `discard_changes: true` para sobrescrever. (A bypass exige confirmação explícita do usuário — `action: "remove"` nunca é aprovado automaticamente no modo AUTO_EDIT.)
3. **Commits não mesclados** — commits em `worktree-<slug>` que nenhum outro branch local ou ref remoto aponta bloqueiam a remoção incondicionalmente; não há flag "descartar commits" porque perder trabalho comitado raramente é o que os usuários desejam. Faça merge, push ou renomeie o branch em outro lugar primeiro.

As mesmas três proteções se aplicam ao botão `WorktreeExitDialog → Remove`.

## Configurações

Duas configurações moldam a experiência de worktree de propósito geral:

| Chave                            | Tipo       | Padrão      | Efeito                                                                                                                                                                                                                                            |
| -------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.hideBuiltinWorktreeIndicator`| boolean    | `false`     | Oculta a linha do Rodapé embutida `⎇ worktree-… (…)`. O campo `worktree` ainda é entregue aos scripts de linha de status personalizados. Defina como `true` apenas se sua linha de status já renderizar a worktree — caso contrário, você perde toda a affordance da interface. |
| `worktree.symlinkDirectories`    | `string[]` | `undefined` | Diretórios sob o repositório principal a serem linkados simbolicamente em cada worktree de propósito geral na criação. Caminhos são relativos à raiz do repo; caminhos absolutos e qualquer entrada contendo `..` são rejeitados. Origens ausentes e destinos existentes são silenciosamente ignorados (sem sobrescrita). |

Exemplo:

```jsonc
// ~/.qwen/settings.json ou <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

Aplica-se a TODOS os caminhos de criação de worktree: flag `--worktree`, ferramenta `enter_worktree` e `agent isolation: "worktree"`.

Configurações não relacionadas a worktrees gerais, mas que vale a pena conhecer:

- `agents.arena.worktreeBaseDir` — controla o posicionamento de worktrees da **Agent Arena** (padrão `~/.qwen/arena`). Não afeta worktrees de propósito geral, que sempre ficam em `<raizDoRepo>/.qwen/worktrees/`.

Ainda não há esquema para `worktree.sparsePaths` — isso é um item do roadmap (veja [Limitações](#limitações)).

## Referência de Ferramentas

### `enter_worktree`

```json
{ "name": "experimento-a" }
```

| Campo  | Tipo   | Obrigatório | Notas                                                                                   |
| ------ | ------ | ----------- | --------------------------------------------------------------------------------------- |
| `name` | string | não         | Slug. Letras, dígitos, ponto, sublinhado, hífen; máximo de 64 caracteres. Gerado automaticamente quando omitido. |

Recusa-se a executar quando:

- A CLI não está em um repositório git.
- O diretório de trabalho atual já está dentro de `.qwen/worktrees/` (sem worktrees aninhadas).

### `exit_worktree`

```json
{ "name": "experimento-a", "action": "remove", "discard_changes": false }
```

| Campo             | Tipo                   | Obrigatório                          | Notas                                                             |
| ----------------- | ---------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `name`            | string                 | sim                                  | Deve corresponder ao slug usado em `enter_worktree`.               |
| `action`          | `"keep"` \| `"remove"` | sim                                  | `keep` preserva diretório + branch; `remove` deleta ambos.         |
| `discard_changes` | boolean                | apenas quando `action="remove"` e sujo| Sobrescreve a proteção de árvore suja. Não tem efeito para `action="keep"`. |

`action: "remove"` sempre pede confirmação, inclusive sob modo de aprovação `AUTO_EDIT` — é tratado como uma operação destrutiva de shell, não uma ferramenta apenas informativa.

### `agent` — parâmetro `isolation`

```json
{
  "subagent_type": "meu-agente",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| Campo       | Tipo         | Obrigatório | Notas                                                                                       |
| ----------- | ------------ | ----------- | ------------------------------------------------------------------------------------------- |
| `isolation` | `"worktree"` | não         | Executa o agente em uma worktree nova `agent-<7hex>`. Requer que `subagent_type` esteja definido (sem bifurcações). |

Veja [Subagentes](./sub-agents.md) para o restante da referência da ferramenta agent.

## Referência da CLI

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # gerar slug automaticamente
qwen --worktree my-feature                                    # slug explícito
qwen --worktree=my-feature                                    # forma com =
qwen --worktree=#123                                          # referência de PR
qwen --worktree https://github.com/owner/repo/pull/123        # URL do PR
```

| Entrada                         | Resultado                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Flag simples (sem valor)        | Slug automático `<adjetivo>-<substantivo>-<6hex>`, branch `worktree-<slug>`, base = branch atual.                        |
| Slug simples                    | Branch `worktree-<slug>`, base = branch atual. Validação do slug: letras/dígitos/ponto/sublinhado/hífen, máx. 64 caracteres. |
| `#N` ou `<github-url>/pull/N`   | Slug `pr-<N>`, branch `worktree-pr-<N>`, base = `FETCH_HEAD` após `git fetch origin pull/<N>/head` (timeout de 30s).    |

`--worktree` não pode ser combinado com `--acp` / `--experimental-acp`.

Quando `--worktree` é combinado com `--resume <session-id>`, a worktree vence: a worktree salva na sessão retomada (se houver) é sobrescrita e uma linha em stderr + lembrete no primeiro prompt reportam a sobrescrita.

Para modos interativo (TUI) e headless (`-p`), a worktree é automaticamente criada e a sessão muda para ela antes da primeira rodada.

Modos de falha no fetch de PR (código de saída != 0, nenhuma worktree criada):

| Causa                         | Trecho da mensagem                                          |
| ----------------------------- | ----------------------------------------------------------- |
| Remote `origin` ausente       | `requer um remote "origin" que aponte para o GitHub`        |
| PR não existe no origin       | `Falha ao buscar PR #<N>: o PR não existe no origin`       |
| Timeout de rede de 30s        | `Falha ao buscar PR #<N>: tempo limite excedido após 30s`   |
| Número do PR fora do intervalo / zero | `Número de PR inválido`                               |

## Limitações

Os itens a seguir não foram implementados intencionalmente na fase atual:

- **Sem checkout esparso.** Monorepos grandes fazem checkout da árvore completa. (`worktree.sparsePaths` é um item do roadmap.)
- **Sem integração com tmux.** A CLI não inicia sessões de worktree em novas janelas do tmux.
- **Worktrees são "projetos" separados para armazenamento de sessões.** Sessões iniciadas com `--worktree foo` são salvas sob o diretório de chats dessa worktree; para retomá-las depois você deve passar `--worktree foo` novamente. Sessões iniciadas sem `--worktree` são salvas sob o checkout principal e não aparecerão no seletor de retomada da worktree.
- **Sem sobrescrita de sessão entre slugs.** `qwen --resume <sid> --worktree segundo` onde `<sid>` foi criado com `--worktree primeiro` falhará ao encontrar a sessão — sessões e worktrees estão fortemente vinculadas por `projectHash(cwd)`. Para trocar de worktree em uma sessão existente, você deve sair e reiniciar com a nova `--worktree` e um prompt novo. Uma futura mudança arquitetural (ancorando o armazenamento na raiz do repo em vez de `cwd`) removeria essa restrição.
- **`enter_worktree` no meio da sessão NÃO altera `process.cwd()` nem `Config.targetDir`.** Essa ferramenta usa a convenção de apenas contexto do modelo (veja [Subagentes](./sub-agents.md)). Apenas a flag de inicialização `--worktree` altera o diretório de trabalho do processo.
- **Caminhos relativos em outros campos de argumento são resolvidos ANTES da mudança de diretório da worktree.** Flags que recebem caminhos (`--mcp-config`, `--openai-logging-dir`, `--json-file`, `--input-file`, `--telemetry-outfile`, `--include-directories`) são normalizados para caminhos absolutos em relação ao cwd de inicialização quando `--worktree` está definido. Outros campos de argv com formato de caminho não listados aqui ainda resolvem contra o cwd da worktree — use caminhos absolutos para ter segurança.
Acompanhe o roadmap em `docs/design/worktree.md`.

## Solução de Problemas

**O Footer não mostra o indicador de worktree mesmo após eu ter acabado de criar um.**
Verifique se `ui.hideBuiltinWorktreeIndicator` não está definido como `true`. Confirme também que o slug não está vazio na mensagem de sucesso da ferramenta.

**`--resume` não restaura meu worktree.**
Verifique se `<chatsDir>/<sessionId>.worktree.json` existe. O CLI exclui automaticamente o sidecar quando o diretório do worktree é removido, então um sidecar ausente combinado com um diretório ausente é o estado normal de "nenhum worktree para restaurar" — não é um bug. Execute com `--debug` e procure por `restoreWorktreeContext` para ver o motivo.

**`exit_worktree` diz "criado por uma sessão diferente".**
Isso é a proteção de propriedade da sessão. Retome a sessão original e saia de lá, ou execute o comando `git worktree remove …` sugerido manualmente.

**Worktrees obsoletos `agent-<hex>` continuam se acumulando.**
O limite de 30 dias é conservador; limpe manualmente com `git worktree list && git worktree remove <path>`, ou aguarde — a próxima inicialização do CLI após o marco de 30 dias irá removê-los, desde que estejam limpos e enviados.