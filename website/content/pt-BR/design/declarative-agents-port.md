# Definições Declarativas de Agentes — Porte do Claude Code 2.1.168

Documento de design interno para o porte do schema de agente declarativo (markdown +
frontmatter YAML) do Claude Code para o qwen-code, abordando a issue [#4821][i4821] e
coordenando com o porte de workflow na issue [#4721][i4721] / PR [#4732][p4732].

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## Status de implementação (vertical-sliced)

O PR [#4842][p4842] entregou os campos com um caminho de runtime end-to-end na época. O PR [#4870][p4870] então substituiu o parser YAML para suportar block scalars. Este PR de follow-up constrói sobre ambos: substitui o **stringifier** YAML (o PR #4870 o deixou feito à mão — veja `docs/design/yaml-parser-replacement.md`), expõe `mcpServers` + `hooks` no `SubagentConfig` e os conecta ao runtime para que os servidores MCP e hooks por agente realmente sejam disparados quando um subagente é executado.

| Field             | Status                  | Notes                                                                                                                                                               |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **entregue (#4842)**    | faz ponte para o `approvalMode` existente do qwen no momento do parse                                                                                               |
| `maxTurns`        | **entregue (#4842)**    | conectado ao caminho de runtime existente `runConfig.max_turns`                                                                                                     |
| `color` allowlist | **entregue (#4842)**    | restringe o campo existente para o conjunto `_Y` do CC + tratamento do sentinel legado `auto`                                                                       |
| `mcpServers`      | **entregue (follow-up)**| round-trip de YAML aninhado seguro via eemeli/`yaml` stringify; override de runtime mescla servidores de sessão + agente via wrapper de Config do subagente + reconstrução forçada do tool-registry |
| `hooks`           | **entregue (follow-up)**| entradas efêmeras do HookRegistry registradas no spawn do subagente, removidas via `onStop`; v1 dispara globalmente (sem filtro de escopo de agente)                |
| `effort`          | adiado                  | nenhum parâmetro `effort` na camada de modelo existe ainda nos providers do qwen                                                                                    |
| `memory`          | adiado                  | o auto-memory do qwen ainda não tem distinção de escopo `user`/`project`/`local`                                                                                    |
| `isolation`       | adiado                  | o PR de workflow #4732 é dono do runtime; o padrão por agente chega quando ele chegar                                                                               |
| `initialPrompt`   | adiado                  | requer a flag CLI `--agent` (sem infra de main-session-agent no qwen)                                                                                               |
| `skills`          | adiado                  | requer o consumo de `config.skills` pelo SkillManager                                                                                                               |

O registro completo de engenharia reversa abaixo é mantido como referência de design
para os campos adiados — constantes de schema, semântica DL7/Ig5, mensagens de erro
e a matriz de coordenação com o workflow ainda são fundamentais para esse trabalho.

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## Fase 0 — Limites

| Item                     | Value                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Último upstream verificado | Claude Code **2.1.168** (a issue #4821 referencia >= 2.1.167, estamos um bump acima)                                                  |
| Binário nativo           | `/private/tmp/cc-2.1.168/package/claude` (220 MB)                                                                                       |
| Extração de strings      | `/private/tmp/cc-2.1.168/claude.strings` (~342 k linhas)                                                                                |
| Worktree                 | `.claude/worktrees/gifted-hamilton-684741`                                                                                              |
| Branch                   | `lazzy/gifted-hamilton-684741` a partir de `main @ 45efb1d3a`                                                                           |
| Fora do escopo           | código do workflow do PR #4732 (worktree separado `lazzy/lucid-pare-974192`) — coordenar apenas via interface                           |
| Regra de autoria         | O autor é **LaZzyMan**; **sem** trailers `Co-Authored-By` ou de ferramentas de IA em commits, PRs, issues ou comentários (conforme `~/.claude/CLAUDE.md`) |

---

## Fase 1 — Descobertas da engenharia reversa

Todas as afirmações aqui foram verificadas independentemente via grep no `claude.strings` e
sobreviveram à refutação adversarial. Níveis de confiança: **C** = Confirmado (evidência
direta do binário), **I** = Inferido (sintetizado a partir de múltiplos fatos confirmados),
**O** = Aberto (ainda incerto).

### Schema — os 15 campos, refutados e reconfirmados

O shadow schema do frontmatter do agente é `Ig5`, usado dentro de `ug5.agent` para
a telemetria `tengu_frontmatter_shadow_unknown_key` / `_mismatch`. O
**loader de produção é o `DL7`** (`parseAgentFromMarkdown`), que realiza
validação campo a campo feita à mão com mensagens de erro personalizadas. Um
**schema JSON-form separado `JL7`** (usado por `fL7` / `parseAgentFromJson`) é mais restrito,
mas é um caminho de código diferente (usado por `--agents <json>` e
`settings.agents`).

| #   | Field             | Type (Ig5 / DL7)                        | Required | Default        | Enum / Constraint                                                                                                                       | Conf                                        |
| --- | ----------------- | --------------------------------------- | -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `name`            | string, não vazio                       | **sim**  | —              | nenhum — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                | **C** strings:308120, 309074                |
| 2   | `description`     | string, não vazio                       | **sim**  | —              | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076        |
| 3   | `model`           | string                                  | não      | undefined      | `inherit` (case-insensitive) normalizado para o literal `"inherit"`; caso contrário, repassado com trim                                 | **C** strings:308120, 309075, 309076        |
| 4   | `tools`           | string\|array (MDH union)               | não      | undefined      | token único `*` → `undefined` (significa "herdar todos"); duplicado via `AXH`/`FbK`                                                     | **C** strings:308120 (MDH/AXH), 309075      |
| 5   | `disallowedTools` | string\|array (MDH)                     | não      | undefined      | "Ignorado se `tools` estiver definido" (conforme texto describe); aplicado pelos chamadores                                             | **C** strings:308120, 309075                |
| 6   | `effort`          | string\|integer                         | não      | undefined      | enum `GN=["low","medium","high","xhigh","max"]` OU `int`; alias `P37={med:"medium"}`                                                    | **C** strings:308120, 309075, GN/P37 inline |
| 7   | `permissionMode`  | string                                  | não      | undefined      | enum `$E = Gmq = [...kc]` onde `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 valores)                   | **C** strings:307649 (kc), 308120, 309075   |
| 8   | `mcpServers`      | `z.unknown()` (Ig5); `array(jL7)` (JL7) | não     | undefined      | cada item: string OU `record(string, MCPServerSpec)`; `safeParse` por item no DL7                                                       | **C** strings:308120, 309075, 309076        |
| 9   | `hooks`           | `z.unknown()` (Ig5); `_u()` (JL7)       | não      | undefined      | validado lazy no runtime via `TKO` → `_u().safeParse` (formato de hooks do settings.json)                                               | **C** strings:308120, 309073 (TKO), 309076  |
| 10  | `maxTurns`        | `union(number, string, null)`           | não      | undefined      | inteiro positivo (parseado por `W46` — aceita string numérica ou numérico)                                                              | **C** strings:308120, 309075 (W46), 309076  |
| 11  | `skills`          | string\|array (MDH)                     | não      | `[]` (emitido) | normalizado via `ml(q.skills) = FbK(H) ?? []`; sem wildcard `*` (diferente de `tools`)                                                  | **C** strings:308120, 309075                |
| 12  | `initialPrompt`   | string                                  | não      | undefined      | apenas espaços em branco → undefined; apenas auto-enviado quando o agente é a **main session** (via `--agent` / settings), ignorado como subagente | **C** strings:308120, 309075                |
| 13  | `memory`          | string                                  | não      | undefined      | enum `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076        |
| 14  | `background`      | string\|bool (eiH=EL8)                  | não      | undefined      | aceita `true` / `false` / `"true"` / `"false"`; apenas truthy normalizado para `true`, senão `undefined`                                | **C** strings:308120, 309075                |
| 15  | `isolation`       | string                                  | não      | undefined      | enum **apenas** `["worktree"]` (NÃO `["none","worktree"]` — esse é um schema diferente em strings:313284 para configurações de background-session) | **C** strings:308120, 309075, 309076        |

Observação sutil que sobreviveu à refutação: embora `skills` seja "opcional",
a cláusula de emissão do DL7 é `...I !== void 0 && {skills: I}` e `ml(undefined)`
retorna `[]` (não-undefined), então o **registro final emitido carregará
`skills: []` mesmo quando o frontmatter omitir o campo**. Isso afeta as verificações
de igualdade downstream — sinalizar para o porte do qwen-code.

### Possíveis campos adicionais além dos 15

| #   | Field       | Type   | Default   | Enum / Constraint                                                                                                                                                                                                                                                            | Conf                                     |
| --- | ----------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 16  | **`color`** | string | undefined | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; descrito como `"@internal — display color in the agents UI"`; valores fora de `_Y` são silenciosamente descartados no parse (DL7 emite `...z && typeof z === "string" && _Y.includes(z) && {color: z}`) | **C** strings:308120, 309075, \_Y inline |
Este é o **único** novo campo de agent-frontmatter além da lista do #4821. Campos que foram pesquisados, mas **NÃO** encontrados em `Ig5` / `JL7`: `version`, `tags`, `labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`, `owner`, `author`, `homepage`, `displayName`, `shortDescription` (todos estes apareceram apenas no schema de skill `bg5` ou em identificadores não relacionados).

### Loader — mapa de arquivos e funções

| Responsabilidade                                              | Função                                                                                                                                                       | Localização            | Conf  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----- |
| Montador de registry de nível superior                        | `QL` (nome de exportação `getAgentDefinitionsWithOverrides`)                                                                                                 | strings:309076         | **C** |
| Filesystem walker (compartilhado com skills/commands/output-styles) | `Gm` (memoizado via `h6`)                                                                                                                                    | strings:312887         | **C** |
| Descoberta por `.md`                                          | `d_q` (= `loadMarkdownFiles`, ripgrep com `--files --hidden --follow --no-ignore --glob *.md`, 3 s `AbortSignal.timeout`, fallback `wY3` quando `__("true")`) | strings:312887         | **C** |
| Parser por arquivo (markdown)                                 | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                           | strings:309074         | **C** |
| Parser por arquivo (JSON)                                     | `fL7` (= `parseAgentFromJson`), usa o schema `JL7`                                                                                                           | strings:309073         | **C** |
| Carregador de agent de plugin                                 | `b0_` → por diretório `oR7` → por arquivo `sR7`                                                                                                              | strings:308780, 308779 | **C** |
| Built-ins                                                     | `naH()` — emite `[JqH=general-purpose, KL7=statusline-setup, …]` mais o implícito `YI=fork`                                                                   | strings:309073, 308663 | **C** |
| Resolvedor de overrides                                       | `DS()` (= `getActiveAgentsFromList`) — veja Ordem de Resolução                                                                                               | strings:309073         | **C** |
| Invalidação de cache                                          | `u0_()` (= `clearAgentDefinitionsCache`) — limpa `QL.cache` + `Gm.cache`                                                                                     | strings:309073         | **C** |
| FS watcher (chokidar)                                         | `s_T()` → `Q4_=s_T()` na inicialização do módulo (`WB6`)                                                                                                     | strings:316417         | **C** |

`Gm("agents", _)` lê três baseDirs (`policySettings`, `userSettings`, `projectSettings`), cada um tagueado no registro, e então remove duplicatas por **inode** (descarta duplicatas de mesmo inode de symlinks / hardlinks, logando `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`). Telemetria: `tengu_dir_search` com `managedFilesFound`, `userFilesFound`, `projectFilesFound`, `projectDirsSearched`, `subdir`.

### Ordem de resolução — precedência definitiva

A função `DS()` filtra sua entrada por `source` e então itera um array de ordem fixa em um `Map` chaveado por `agentType`. Como `Map.set` sobrescreve, o **ÚLTIMO bucket tocado vence**:

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  highest precedence
```

| Fonte             | Origem                                                                                                                                                                              | Prioridade de override | Conf                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------- |
| `built-in`        | `naH()` (hardcoded no binário)                                                                                                                                                      | 1 (menor)              | **C** strings:309073              |
| `plugin`          | `b0_` → `agentsPath`/`agentsPaths` por plugin                                                                                                                                       | 2                      | **C** strings:308780              |
| `userSettings`    | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` ou `~/.claude`)                                                                                                                            | 3                      | **C** strings:312887, 307489      |
| `projectSettings` | `<cwd>/.claude/agents/` MAIS `iV_()` caminha até o homedir / git root                                                                                                               | 4                      | **C** strings:312887, iV\_ inline |
| `flagSettings`    | Flag CLI `--agents <json>` (schema `qKO = h.record(h.string(), JL7())`)                                                                                                             | 5                      | **C** strings:330190, 309076      |
| `policySettings`  | Diretório gerenciado pelo sistema: macOS `/Library/Application Support/ClaudeCode/.claude/agents`, Linux `/etc/claude-code/.claude/agents`, Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (maior)              | **C** strings:307649 (H2), 312887 |

Colisões são resolvidas **silenciosamente** — apenas o evento de telemetria `tengu_plugin_name_collision` é disparado (`winner_source: T.at(-1)`); não há nenhum aviso de "X overrides built-in" mostrado ao usuário. (strings:308742 `hMH`.)

Comportamento sutil: `iV_()` percorre **do mais interno para fora** a partir do `cwd`, mas como o Map.set vence no último, o **`.claude/agents/` da árvore externa vence sobre o da árvore interna** dentro de projectSettings. Isso é surpreendente — sinalizar nas questões em aberto.

### Parser de frontmatter

| Pergunta                                                   | Resposta                                                                                                                                                                                                                                         | Conf                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Biblioteca utilizada?                                      | **Nenhuma** — splitter `lz` feito à mão chamando `Bun.YAML.parse` (via wrapper `l5H`). Nenhum `gray-matter`, `js-yaml` ou `front-matter` no binário.                                                                                               | **C** strings:307902 (l5H), 307905 (lz), 110303 (Bun.YAML errors) |
| Regex                                                      | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                         | **C** strings:307905                                              |
| Tratamento de falha                                        | Falha no parse do YAML → tenta novamente com normalização de tab para 2 espaços; se ainda falhar, loga `Failed to parse YAML frontmatter in <file>: <err>` como warn e retorna `{frontmatter: {}, content: body}` (NUNCA lança exceção)                                     | **C** strings:307905, 151839                                      |
| Extração do body                                           | Slice de string simples `H.slice(K[0].length)` após o `---` de fechamento; posteriormente normalizado por `v$H` (provavelmente remoção de newline inicial)                                                                                                                        | **C** strings:307905                                              |
| Compartilhado entre agents / skills / commands / output-styles? | **Sim** — mesmo `lz` reutilizado por `Iq_` (skill loader), `f13` (deprecated commands loader) e o agent loader via `Gm` → `d_q`                                                                                                                  | **C** strings:312690                                              |
| Validador de schema                                        | **Zod v4** (bundled). Marcadores exclusivos da v4 `looseObject`, `treeifyError`, `prettifyError`, `toJSONSchema` presentes                                                                                                                                   | **C** strings:141270-141395, 141586                               |
| Modo de validação                                          | **Shadow** — `ahH("agent", frontmatter)` executa `ug5.agent().strict().safeParse()` **apenas** para telemetria; DL7 ignora o resultado e prossegue com sua própria validação por campo. O objeto de frontmatter leniente é a fonte da verdade em runtime. | **C** strings:308120 (ahH/ug5), 309074 (DL7 calls but ignores)    |
| Eventos de telemetria                                      | `tengu_frontmatter_shadow_unknown_key`, `tengu_frontmatter_shadow_mismatch` (deduplicado via `Set A37` em processo)                                                                                                                                 | **C** strings:154634, 154636                                      |

### Wiring — Ferramenta Agent + flag CLI

| Camada                          | O que faz                                                                                                                                                                       | Conf                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Schema da ferramenta Task/Agent (`$_3`) | Declara `subagent_type: string.optional()`; quando omitido, faz fallback para `general-purpose` (ou `fork` se `AI()` retornar true)                                                      | **C** strings:~309220        |
| Busca de subagent                | `activeAgents.find(a => a.agentType === requestedType)` contra `toolUseContext.options.agentDefinitions.activeAgents`                                                             | **C** strings:~309220        |
| Fallback fuzzy                 | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`; correspondência ambígua → `AgentTypeError`; correspondência limpa → `tengu_subagent_type_normalized`      | **C** strings:~309220        |
| Gate de permissão                | `lV_(toolPermissionContext, "Task", agentType)` — negação → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.`                                        | **C** strings:~309220        |
| Origem do system-prompt           | O body em Markdown se torna `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope) when memory enabled)` — closure capturada no momento do parse                                  | **C** strings:309074-6 (DL7) |
| Render na main-thread             | `Pp({mainThreadAgentDefinition, …})` — se o agent tiver `appendSystemPrompt: true` (o catch-all `claude` built-in), o body é anexado ao padrão; caso contrário, **SUBSTITUI** o padrão      | **C** strings:311015         |
| CLI `--agent <name>`           | Declarado via Commander; action handler `if(I) process.env.CLAUDE_CODE_AGENT = I;` — injeta na env var, lido em outro lugar em `appState.agent`. Também registrado no arquivo pid.          | **C** strings:330190, 142138 |
| CLI `--agents <json>`          | Flag separada; registro JSON `{name: {description, prompt, …}}` validado por `qKO = h.record(h.string(), JL7())`; entra no mesmo registry `activeAgents` com `source: flagSettings` | **C** strings:330190, 309076 |
### Ciclo de vida — cold load + hot reload

| Aspecto | Comportamento | Conf |
| --- | --- | --- |
| Cold load | Lazy — `QL` é memoizado via `h6` (wrapper de cache); o primeiro acesso lê o sistema de arquivos + plugins, os acessos subsequentes retornam o cache | **C** strings:309076 |
| Mecanismo de hot reload | **chokidar watcher** `s_T()` registrado na inicialização do módulo (`WB6`); monitora `.claude/agents` (usuário + projeto) além dos diretórios de skills e commands | **C** strings:316417 |
| Flags do watcher | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (macOS true), eventos `add`/`change`/`unlink` | **C** strings:316417 |
| Debounce | 300 ms (`l_T = 300`); o handler chama `RIH(), Vv(), u0_(), …` — `u0_()` invalida o cache do agent | **C** strings:316417, 309073 |
| Polling adaptativo | ativo = intervalo de `n_T = 2000 ms`; ocioso (sem interação por `r_T = 60000 ms`) → `i_T = 30000 ms`; recria a instância do chokidar na troca | **C** strings:316417 |
| Comando slash `/agents` | UI `local-jsx` para gerenciar agents (Biblioteca/criar/editar/excluir/executar) — **NÃO** é um comando de rescan | **C** strings:314593 |
| Comando slash `/reload-plugins` | Reexecuta `QL(W8())`, reconta agents; cobre agents originados de plugins (que o chokidar **NÃO** monitora) | **C** strings:314595, 190948 |
| Outros caminhos de invalidação | `clearSessionCaches` (usado por `/clear`) também chama `u0_()` | **C** strings:313246 |

### Questões em aberto (Fase 1)

| # | Questão | Conf | Caminho de resolução |
| --- | --- | --- | --- |
| Q1 | A omissão de `color` no #4821 é intencional (é `@internal`) ou um descuido? | **O** | Tratar como **intencional** — portar o campo, mas marcar como internal/UI-only |
| Q2 | O comportamento leniente do DL7 (background aceita strings, maxTurns aceita strings) é um recurso documentado para o usuário ou um hack de retrocompatibilidade? | **O** | Espelhar para manter paridade, mas avisar nos docs do port |
| Q3 | Por que o enum `isolation` `["worktree"]` é apenas para agents, enquanto o schema de configurações de background-session aceita `["none","worktree"]`? | **O** | Provavelmente "sem isolamento" = campo omitido; documentar explicitamente |
| Q4 | O `--agents <json>` (flagSettings) fica intencionalmente na precedência 5 (acima do projeto, abaixo da policy)? | **O** | qwen-code pode pular a flag na v1, adiar a decisão |
| Q5 | Push innermost-first pelo `iV_` + Map.set last-wins → **outer-tree wins** para colisões em projectSettings. Armadilha ou intencional? | **O** | qwen-code deve escolher a semântica **innermost-wins** para evitar a armadilha |

---

## Fase 2 — Plano de implementação para qwen-code

### Estado atual — mapa em um parágrafo

qwen-code já possui uma infraestrutura substancial de subagentes:
`SubagentManager` (`packages/core/src/subagents/subagent-manager.ts`) implementa
CRUD sobre arquivos de frontmatter markdown+YAML em `.qwen/agents/` (projeto) e
`~/.qwen/agents/` (usuário), apoiado por um parser YAML customizado
(`packages/core/src/utils/yaml-parser.ts` — sem dependência de `gray-matter` / `yaml`,
confirmado pelo `package.json`). `SubagentConfig`
(`packages/core/src/subagents/types.ts:41-122`) já possui `name`,
`description`, `tools`, `disallowedTools`, `approvalMode`, `systemPrompt`,
`model`, `runConfig`, `color`, `background`. `SubagentLevel` já suporta
cinco escopos (session, project, user, extension, builtin) com precedência
`session > project > user > extension > builtin`
(`subagent-manager.ts:189-220`). A ferramenta Agent
(`packages/core/src/tools/agent/agent.ts`) declara `subagent_type` e
atualiza dinamicamente seu enum de schema via `subagentManager.changeListener`.
Uma bridge `convertClaudeAgentConfig()` já existe em
`packages/core/src/extension/claude-converter.ts:162-220` com um mapeamento
de tool-name e mapeamento de `permissionMode → approvalMode`. A **lacuna**
é: (a) o schema está sem 8 campos do #4821 (`effort`, `permissionMode` como
first-class, `mcpServers`, `hooks`, `maxTurns` como top-level,
`skills`, `initialPrompt`, `memory`, `isolation`); (b) sem a flag CLI
`--agent <name>`; (c) sem hot reload no estilo chokidar (existe invalidação
no estilo extension, mas não para agents do sistema de arquivos); (d) `maxTurns`
está atualmente aninhado em `runConfig.max_turns` — precisa ser promovido para
top-level conforme #2409.

### Decisões arquiteturais

#### D1. Reutilizar o yaml-parser existente para frontmatter

**Decisão:** Reutilizar `packages/core/src/utils/yaml-parser.ts` (já usado por
`SubagentManager.parseSubagentContent` e pelo skill loader).
**Justificativa:** O `lz` do Claude Code é o mesmo parser compartilhado usado para
skills + commands + agents; qwen-code já espelha esse padrão. Adicionar `gray-matter`
ou `js-yaml` é uma mudança desnecessária. O parser existente lida com a divisão
`--- … ---` e é silencioso em entradas malformadas (corresponde à postura
`warn-and-return-empty` do `lz`).

#### D2. Ordem de resolução / precedência

**Decisão:** Usar `session > project (.qwen/agents/) > user (~/.qwen/agents/)

> extension > builtin` — ou seja, **manter a ordem existente do SubagentLevel
do qwen-code, NÃO espelhar os buckets `flagSettings`/`policySettings` do Claude Code na v1**.
**Justificativa:** O policySettings do Claude Code (diretório gerenciado) é uma
história de deploy enterprise que o qwen-code não tem. Agents injetados via flag
(`--agents <json>`) é um recurso para power-users que pode entrar no P4. A
precedência de cinco níveis existente do qwen-code já cobre os casos que o #4821
se importa: projeto sobrescreve usuário que sobrescreve built-in. O nível
`extension` se encaixa perfeitamente entre user e > builtin.

#### D3. Validação — manter o SubagentValidator existente

**Decisão:** Estender o `SubagentValidator`
(`packages/core/src/subagents/`) para validar os oito novos campos. **NÃO**
introduzir zod a menos que o pipeline do skillManager já o use; se o
validador existente for feito à mão, mantenha-o feito à mão.
**Justificativa:** O `Ig5` do Claude Code é apenas shadow — a validação em
runtime é o `DL7` feito à mão. Seguir esse padrão mantém as mensagens de erro
legíveis (ex.: `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`)
sem arrastar outra dependência. Se o skillManager já usar zod, siga essa
escolha para manter consistência — a definir lendo o código de skill na
preparação do P1.

#### D4. Hot reload — adiar; confiar em cold load + reload explícito

**Decisão:** A v1 **NÃO** terá um watcher chokidar. Hooks de invalidação
de cache já existem (`subagentManager` tem `changeListener` e refresh
explícito orientado por CRUD). O reload no nível do projeto acontece no
início da sessão; edições na sessão via UI `/agents` invalidam. Um
comando slash `/reload-agents` (ou carona no `/reload-plugins`) pode
entrar no P4 se houver demanda dos usuários.
**Justificativa:** Hot reload via watcher de FS é caro (chokidar adiciona
um loop de polling com agendamento adaptativo — só a implementação do
Claude Code tem ~150 linhas de controle). Cold-load-on-startup é mais
que suficiente para a v1 e corresponde a como o `SubagentManager` está
conectado hoje. Deixe a porta aberta para o P4.

#### D5. Conectar a flag CLI `--agent <name>` — v1 no escopo

**Decisão:** Adicionar `--agent <name>` ao CliArgs em
`packages/cli/src/config/config.ts`. Comportamento: buscar no registry
resolvido, definir o agent como o agent da thread principal, lançar um
erro claro se o nome não resolver. Corresponder à semântica do Claude Code
(substituir o system prompt padrão, a menos que o agent tenha
`appendSystemPrompt: true`). NÃO usar uma indireção de env-var
`CLAUDE_CODE_AGENT` — o objeto `Config` do qwen-code pode carregá-lo
diretamente.
**Justificativa:** Esta é a interface voltada para o usuário no #4821 —
sem ela, agents declarativos só são acessíveis via parâmetro
`subagent_type` da ferramenta Agent, o que é muito indireto para um
caso de uso de "definir meu agent padrão". `--agents <json>`
(plural) pode ser adiado para o P4.

#### D6. Coordenação de Workflow.agentType — contrato de interface

**Decisão:** Expor uma interface de resolução estável que o
`createProductionDispatch` do PR #4732 possa chamar quando for
integrado. Especificamente:

| Contrato | Owner |
| --- | --- |
| O `name` do frontmatter É a string `agentType` do workflow (igualdade de chave, case-sensitive) | este PR |
| O piso hardcoded de `disallowedTools` do workflow (`[SEND_MESSAGE, EXIT_PLAN_MODE]`, espelhado do upstream `Tg8`; verificado no PR #4732 como `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) faz **UNION** com o `disallowedTools` no nível do agent — o piso é sempre aplicado, mesmo quando a definição do agent define `tools` | workflow PR consome |
| O `opts.isolation` por chamada sobrescreve o padrão `isolation: 'worktree'` por agent | workflow PR consome |
| `model`, `effort`, `permissionMode`, `maxTurns` da definição do agent sobrescrevem os padrões do workflow quando definidos | workflow PR consome |
| O corpo do agent se torna o `systemPrompt` do subagent; o `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` do workflow é o fallback quando `agentType` não resolve | workflow PR consome |
| Quando `agentType` não está definido ou falha ao resolver, o workflow faz fallback para o subagent de workflow built-in (graceful, sem throw) | workflow PR consome |
**Resolução da contradição #4721 / #4821** (precedência de `tools` vs `disallowedTools`): este port escreve o registro do agente de forma que `disallowedTools` seja **sempre carregado separadamente** de `tools`. A regra "ignorado se tools estiver definido" da tabela do #4821 é **aplicada pelos chamadores da ferramenta do agente** (ou seja, ao construir o `ToolConfig` do subagente), e não no momento do parse. Isso permite que o workflow sempre una seu floor com `disallowedTools` independentemente de o agente definir `tools` ou não. O registro do agente é um **mero transportador de dados**; as regras de precedência ficam no dispatch site. Isso resolve o conflito aparente entre a regra "ignorado" do #4821 e a regra "união" do #4721.

**Canonicalização de nomes de ferramentas:** Use `ToolNames.SEND_MESSAGE` e `ToolNames.EXIT_PLAN_MODE` (verificado em relação ao diff do PR #4732), exportados como constantes nomeadas de `packages/core/src/agents/runtime/workflow-orchestrator.ts` assim que for integrado. O port de declarative-agents em si NÃO precisa importar estes — eles são o floor do workflow, aplicados no dispatch site do workflow.

### Layout do módulo

| Caminho                                                               | Novo / Alterado | Propósito                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **Alterado**   | Adiciona 8 novos campos ao `SubagentConfig`: `effort`, `permissionMode` (já mapeia via `approvalMode` — manter ambos? veja D7 abaixo), `mcpServers`, `hooks`, `maxTurns` (promover para nível superior, deprecar `runConfig.max_turns`), `skills`, `initialPrompt`, `memory`, `isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **Alterado**   | Estende `parseSubagentContent` / `serializeSubagent` para fazer round-trip dos novos campos; estende chamadas de `SubagentValidator`                                                                                                                                                            |
| `packages/core/src/subagents/subagent-validator.ts` (caminho assumido) | **Alterado**   | Adiciona validação por campo correspondendo às mensagens de erro do DL7: `Agent file <path> has invalid permissionMode '<x>'. Valid options: …` etc.                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **Novo**       | Fonte única de verdade para constantes de enum: `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES`. Espelha o Claude Code 2.1.168 literalmente.                                                                                           |
| `packages/core/src/subagents/builtin-agents.ts`                    | **Alterado**   | Novos campos têm padrão undefined; sem alteração de comportamento                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **Alterado**   | Lê novos campos do `SubagentConfig` resolvido ao construir opções do subagente (`model`, `maxTurns`, `permissionMode`, `effort`); conecta a semântica de substituição por chamada de `isolation` para o #4721                                                                              |
| `packages/cli/src/config/config.ts`                                | **Alterado**   | Adiciona flag `--agent <name>`; resolve contra `SubagentManager` na inicialização; erro se o nome não resolver                                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **Alterado**   | Testes para resolução da flag `--agent` + caminho de erro                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **Alterado**   | Adiciona mapeamento para novos campos ao importar arquivos `.md` do Claude (`mcpServers`, `hooks`, `maxTurns` no nível superior, `memory`, `isolation`, etc.)                                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **Novo**       | Testes de snapshot para listas de enum; testes de round-trip de parse/serialise                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **Alterado**   | Testes para validação de novos campos, precedência, mensagens de erro                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **Alterado**   | Testes para conexão de novos campos no runtime do subagente                                                                                                                                                                                                                        |
| `docs/cli/agents.md` (se existir) ou `docs/declarative-agents.md`   | **Novo**       | Referência para o usuário: schema de 16 campos + exemplos                                                                                                                                                                                                                         |

### D7. permissionMode vs approvalMode — faça a ponte, não substitua

**Decisão:** Aceitar AMBOS `permissionMode` (compatível com Claude) e o existente `approvalMode` (compatível com qwen) no frontmatter. No parse, se `permissionMode` estiver definido, mapeie-o para `approvalMode` usando a tabela existente em `claude-converter.ts:195-208` (`default → default`, `plan → plan`, `acceptEdits → auto-edit`, `dontAsk → default`, `bypassPermissions → yolo`). Se ambos estiverem presentes, `approvalMode` vence (mais específico para o qwen-code) e emita um evento de telemetria no estilo `tengu_frontmatter_shadow_*` indicando que ambos foram definidos. **Justificativa:** Preserva a compatibilidade com versões anteriores dos `.qwen/agents/*.md` existentes que usam `approvalMode`, enquanto aceita o `permissionMode` do Claude Code literalmente para que os usuários possam inserir arquivos de agente do Claude Code sem alterações.

### Tabela de mapeamento de schema

| Campo do Claude Code 2.1.168  | Campo do qwen-code                                    | Adaptação                                                                                                   | Notas                                                                                                    |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `name`                     | `name`                                             | nenhuma                                                                                                         | idêntico, obrigatório                                                                                      |
| `description`              | `description`                                      | nenhuma                                                                                                         | idêntico, obrigatório                                                                                      |
| `model`                    | `model`                                            | aceita `inherit`, `fast`, `haiku`, `sonnet`, `opus` ou `authType:model-id`                                  | qwen-code já suporta o vocabulário mais amplo; `inherit` é novo                                      |
| `tools`                    | `tools`                                            | aceita string\|array; `*` → undefined (herda-tudo)                                                          | já suportado como array; adiciona string + tratamento de `*`                                                    |
| `disallowedTools`          | `disallowedTools`                                  | aceita string\|array; **sempre carregado separadamente de `tools`**                                             | regra de precedência (#4821 "ignorado se tools estiver definido") aplicada pelos **chamadores**, não pelo parser                    |
| `effort`                   | `effort` (novo)                                     | enum `low/medium/high/xhigh/max` + inteiro; alias `med → medium`                                             | efeito no runtime é específico do qwen (mapeia para o controle de thinking-effort existente se presente, senão armazena e ignora) |
| `permissionMode`           | `permissionMode` (novo) + faz ponte para `approvalMode` | enum `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`; tabela de mapeamento por D7                         | aceita formato Claude literalmente                                                                            |
| `mcpServers`               | `mcpServers` (novo)                                 | array de (string \| `{name: spec}`); valida por item, descarta entradas ruins com aviso                           | conexão no runtime MCP no P4                                                                            |
| `hooks`                    | `hooks` (novo)                                      | objeto correspondendo ao formato de hooks do settings.json                                                                    | conexão no runtime de hooks no P4                                                                           |
| `maxTurns`                 | `maxTurns` (novo nível superior)                         | inteiro positivo; aceita string numérica para paridade                                                           | **promovido de `runConfig.max_turns`**; mantém formato aninhado como alias depreciado                             |
| `skills`                   | `skills` (novo)                                     | array de nomes de skills; string separada por vírgula também é aceita                                                   | runtime: pré-carrega via skillManager quando o agente inicia                                                      |
| `initialPrompt`            | `initialPrompt` (novo)                              | string; apenas espaços em branco → undefined; só dispara quando o agente é a sessão principal                                   | conectado via caminho da flag `--agent`                                                                            |
| `memory`                   | `memory` (novo)                                     | enum `user/project/local`; carrega de `.qwen/agent-memory/<name>/` etc.                                      | runtime no P4                                                                                            |
| `background`               | `background`                                       | aceita bool ou string `"true"/"false"`; apenas truthy → true                                                   | já suportado; flexibiliza regras de parse                                                                    |
| `isolation`                | `isolation` (novo)                                  | enum **apenas** `["worktree"]`                                                                                 | runtime pertencente ao workflow PR (#4732 P3+); registro apenas carrega o campo                                |
| `color` (não documentado #16) | `color`                                            | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; valores fora da lista descartados silenciosamente | já está no `SubagentConfig` do qwen; aperta validação para corresponder à lista de permissões do Claude Code                      |
### Plano de testes TDD

| Trecho                       | Arquivo de teste                         | O que verifica                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constantes de enum do schema | `agent-frontmatter-schema.test.ts` (novo) | `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES` correspondem ao Claude Code 2.1.168 byte a byte (snapshot)                                             |
| Parser — caminho feliz       | `subagent-manager.test.ts`               | Parse round-trip de `.qwen/agents/test.md` com todos os 16 campos → o registro emitido tem o formato esperado                                                                                         |
| Parser — campos obrigatórios | `subagent-manager.test.ts`               | `name` ausente retorna null + log de aviso; `description` ausente retorna null + log de aviso                                                                                                         |
| Parser — validação de enum   | `subagent-manager.test.ts`               | `permissionMode` / `memory` / `isolation` / `effort` / `color` inválidos emitem avisos específicos (correspondendo ao texto do DL7) e o campo é descartado                                            |
| Parser — tipos de campo flexíveis | `subagent-manager.test.ts`               | `background: "true"` → `true`; `maxTurns: "5"` → `5`; `effort: "med"` → `"medium"`; `tools: "Read,Edit"` → `["Read","Edit"]`; `tools: "*"` → undefined                                                |
| Parser — allowlist de cores  | `subagent-manager.test.ts`               | `color: "magenta"` é descartado silenciosamente (sem erro), `color: "blue"` é preservado                                                                                                              |
| Particularidade do campo skills | `subagent-manager.test.ts`               | omitir `skills` resulta em `skills: []` (corresponde ao comportamento de emissão do Claude Code DL7)                                                                                                  |
| Precedência de resolução     | `subagent-manager.test.ts`               | Mesmo `name` em project + user → project vence; em user + builtin → user vence; em extension + builtin → extension vence                                                                              |
| Deduplicação de inode        | `subagent-manager.test.ts`               | Dois caminhos para o mesmo inode (symlink) → apenas um registro, log emitido                                                                                                                          |
| Bridge de permissionMode     | `subagent-manager.test.ts`               | `permissionMode: bypassPermissions` → `approvalMode: yolo` resolvido; ambos definidos → `approvalMode` vence + telemetria                                                                             |
| Flag CLI `--agent`           | `packages/cli/src/config/config.test.ts` | Flag define o agent da thread principal; nome não resolvido lança erro com `Agent type '<x>' not found. Available agents: …`                                                                          |
| Fallback fuzzy da ferramenta Agent | `agent.test.ts`                          | `subagent_type: "Test_Engineer"` resolve para um `test-engineer` registrado via normalização NFKC-lowercase                                                                                           |
| Erro de not-found da ferramenta Agent | `agent.test.ts`                          | `subagent_type` não resolvido → mensagem de erro corresponde a `Agent type '<x>' not found. Available agents: <list>`                                                                                 |
| Contrato do workflow         | `agent-frontmatter-schema.test.ts`       | Interface exportada `getAgentByName(name)` retorna o `SubagentConfig` completo incluindo `isolation`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns` (consumível pelo workflow PR #4732) |

### Plano de PRs por fases

| Fase   | Título                                                                                                                       | Escopo                                                                                                                                             | Dependências                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **P1** | `feat(core): declarative agent schema fields (effort, permissionMode, maxTurns top-level, memory, isolation, color allowlist)` | Adicionar campos ao `SubagentConfig`; estender parser + validator + serializer; depreciar `runConfig.max_turns`; adicionar módulo de constantes de enum; testes | Nenhuma                          |
| **P2** | `feat(core): wire new agent fields into Agent tool runtime`                                                                  | Integrar `model`, `effort`, `maxTurns`, bridge de `permissionMode`/`approvalMode` no call site de `AgentTool.execute()` → `AgentHeadless.create()`; testes | P1                               |
| **P3** | `feat(cli): --agent flag for main-thread agent selection`                                                                    | Adicionar `--agent <name>` ao `CliArgs`; resolver na inicialização; caminho de erro; testes                                                        | P1                               |
| **P4** | (opcional, scope-creep) `feat(core): mcpServers + hooks + skills + initialPrompt + memory runtime`                           | Integrar os quatro campos "apenas metadados na v1" em efeitos reais de runtime                                                                     | P1, mais subsistemas de skill/MCP/hook |

Cada PR tem como alvo ≤ 800 LOC de delta (excluindo testes); P1 é o maior com ~600 LOC de validator + testes.

---

## Fase 3 — Matriz de coordenação com o port do workflow (#4721 / PR #4732)

| Recurso de declarative-agents                                        | Interação com o workflow                                                                                                                                                             | Responsável                                                         | Bloqueado por                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------- |
| Campo `name` como a chave do registry                                | String de busca `opts.agentType` do workflow ([#4721][i4721] explícito)                                                                                                              | **este PR** define o contrato do registry; **o PR do workflow** consome | nenhum — o formato do registry pode estabilizar primeiro |
| Campo `disallowedTools` no agent                                     | Workflow faz UNION com o floor hardcoded `[SEND_MESSAGE, EXIT_PLAN_MODE]` (conforme [#4721][i4721] §2 — verificado no diff do PR #4732: `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) | **este PR** carrega o campo; **o PR do workflow** faz o union no dispatch | PR #4732 do workflow P3 for integrado          |
| Campo `tools` no agent                                               | Workflow repassa integralmente para o `ToolConfig.tools` do subagent                                                                                                                 | **este PR** carrega o campo; **o PR do workflow** integra           | PR #4732 do workflow P3                        |
| Campo `model` no agent                                               | `opts.model` do workflow sobrescreve por chamada; `model` do agent é o padrão                                                                                                        | **este PR** carrega o campo; **o PR do workflow** resolve a precedência | PR #4732 do workflow P3                        |
| Campo `effort` no agent                                              | Sobrescrita no call-site do workflow vence; fallback para o padrão do agent                                                                                                          | **este PR** carrega o campo; **o PR do workflow** resolve           | PR #4732 do workflow P3                        |
| Campo `permissionMode` no agent                                      | Mapeia para o approvalMode do subagent no dispatch; sobrescrita no call-site do workflow vence                                                                                       | **este PR** carrega o campo via bridge D7; **o PR do workflow** integra | PR #4732 do workflow P3                        |
| Campo `maxTurns` no agent                                            | Substitui o `WORKFLOW_SUBAGENT_MAX_TURNS = 50` hardcoded do workflow quando o agent o define                                                                                         | **este PR** carrega o campo; **o PR do workflow** resolve a precedência | PR #4732 do workflow P3                        |
| Campo `isolation: 'worktree'` no agent                               | Padrão; sobrescrita de `opts.isolation` por chamada ([#4721][i4721] §3)                                                                                                              | **este PR** carrega o campo; **o PR do workflow** é dono do runtime | PR #4732 do workflow P3+ (atualmente lança erro no P1) |
| Campo `initialPrompt` no agent                                       | O workflow **não** o utiliza (só é disparado quando o agent é a sessão principal via `--agent`)                                                                                      | **este PR** + **CLI**                                               | nenhum (independente)                          |
| `memory`, `mcpServers`, `hooks`, `skills`                            | O workflow não tem tratamento especial além de repassar para o runtime do subagent                                                                                                   | **este PR** carrega os campos; integração do runtime no P4 / futuro | PRs futuros                                    |
| Atualizações em `EXCLUDED_TOOLS_FOR_SUBAGENTS`                       | PR #4732 do workflow adiciona `WORKFLOW` ao conjunto (conforme descoberta no contexto da issue/PR — embora refutação adversarial tenha notado que isso AINDA não está em `agent-core.ts` na `main`, apenas no worktree) | **o PR do workflow** é dono; este PR intocado                       | nenhum                                         |
| Forma canônica do nome da ferramenta para o floor do workflow (`ToolNames.SEND_MESSAGE`) | Este PR não importa as constantes do floor; ele apenas carrega as strings de `disallowedTools` como escritas. O PR do workflow é dono da canonicalização.                            | **PR do workflow**                                                  | PR #4732 do workflow                           |
| Ordem de lançamento                                                  | Este PR (P1+P2+P3) é lançado independentemente do workflow. O P3 do PR #4732 do workflow está condicionado ao resolver similar a `getAgentByName()` deste PR ser importável.         | paralelo até o P3 do workflow                                       | P3 do workflow lê das exports deste PR         |
**Sem bloqueio circular:** este PR e o PR de workflow podem ser integrados em paralelo através de suas fases P1/P2. Eles sincronizam no workflow-P3, que precisa do resolvedor de registry deste PR. Se este PR for integrado primeiro, o workflow-P3 lê a partir dele. Se o PR de workflow for integrado primeiro, ele é lançado com a busca existente de `subagent_type` (retornando os padrões de workflow em caso de miss) e muda para o resolvedor mais rico assim que este PR for integrado.

---

## Fase 4 — Riscos e questões em aberto

### Riscos

| #   | Risco                                                                                                                                                                                                | Mitigação                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Schema drift entre minor releases do Claude Code (2.1.168 → 2.1.x)                                                                                                                                   | Fixe o módulo de constantes enum como "verificado contra 2.1.168" com um comentário de doc; reexecute o strings-grep contra novas releases como parte da skill `feature-reverse` |
| R2  | `runConfig.max_turns` → `maxTurns` no nível superior é uma mudança de schema breaking para arquivos `.qwen/agents/*.md` existentes                                                                                     | Mantenha a forma aninhada como um alias depreciado com depreciação de um ciclo; emita um warn no parse, documente no CHANGELOG                                                     |
| R3  | round-trip de `permissionMode` ↔ `approvalMode` com perda (Claude tem 6 modos, qwen tem cerca de 4)                                                                                                            | Mapeie ambas as direções explicitamente conforme D7; emita telemetria no dual-set; NÃO reescreva silenciosamente no save                                                             |
| R4  | Novos campos (`hooks`, `mcpServers`, `skills`, `memory`) carregados no registry, mas sem runtime no v1 → os usuários podem defini-los e silenciosamente não ter efeito                                                     | Documente o escopo do v1 claramente; emita um log de info único por agent quando um campo "carregado, mas ainda sem runtime" não estiver vazio                                          |
| R5  | O adversarial-verify sinalizou que `EXCLUDED_TOOLS_FOR_SUBAGENTS` NÃO inclui `WORKFLOW` na `main` — isso pode significar que o port do workflow ainda não foi merged ou que o guard de recursive-fanout está faltando | Confirme com o autor do PR de workflow (LaZzyMan = eu mesmo) que o guard é integrado com o PR #4732, não neste port                                                     |
| R6  | O comportamento de projectSettings outer-tree-beats-inner-tree (Q5) é uma armadilha se espelhado                                                                                                             | qwen-code escolhe **innermost-wins** explicitamente; testado via fixture R5                                                                                         |
| R7  | O campo `color` é documentado como `@internal` no texto de describe do binário — podemos estar fazendo o port de algo que a Anthropic explicitamente não suporta                                                        | Faça o port, mas marque como `@internal` nos docs do qwen-code também; trate como apenas UI; não exponha em docs de referência voltados ao usuário                                             |

### Questões em aberto — resoluções propostas

| #   | Questão                                                                                                                                                       | Resolução                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | A omissão de `color` no #4821 é intencional?                                                                                                                  | **Trate como intencional**. Faça o port do campo; NÃO mencione em docs voltados ao usuário, exceto como "disponível, internal".                                                                                                                                                                                                                                            |
| Q2  | Comportamento leniente do DL7: documentar ou fazer um hack?                                                                                                                       | **Espelhe isso**. Aceite `background: "true"`, `maxTurns: "5"`, `effort: "med"` para paridade, mesmo que não documentado. Adicione testes.                                                                                                                                                                                                                                |
| Q3  | Por que o enum de isolation difere entre o schema de agent e o schema de background-session?                                                                                 | **Documente a divergência no comentário do código**; "no isolation" = campo omitido, não um valor de enum.                                                                                                                                                                                                                                                          |
| Q4  | O `--agents <json>` (plural, flagSettings) deve ser integrado no v1?                                                                                                    | **Adie para P4**. Superfície de CLI para power users; o v1 lança apenas `--agent <name>` (singular), que é o que o #4821 considera.                                                                                                                                                                                                                                 |
| Q5  | Precedência inner-tree vs outer-tree para `.qwen/agents/` aninhados?                                                                                                | **Innermost-wins**. Sobrescreva o comportamento acidental outer-wins do Claude Code. Test fixture no P1.                                                                                                                                                                                                                                                          |
| Q6  | Precedência de `tools` vs `disallowedTools`: #4821 diz "ignorado se tools estiver definido"; #4721 diz "união com workflow floor"                                          | **Registry são dados simples**. O parser preserva ambos os campos independentemente. As regras de precedência ficam no site de dispatch (Agent tool / workflow). Resolve a contradição.                                                                                                                                                                                   |
| Q7  | Forma canônica do nome da ferramenta para o workflow disallowedTools floor — verificado contra o PR #4732 como `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`            | **Não é preocupação deste PR** — é de responsabilidade do PR de workflow. Documente apenas na matriz de coordenação.                                                                                                                                                                                                                                                              |
| Q8  | A close-resolution do #2409 afeta algo?                                                                                                                   | **Herdar a orientação do #2409 de "promover model + maxTurns para o nível superior"**. Já está incorporado neste plano.                                                                                                                                                                                                                                                      |
| Q9  | Os agents de nível `extension` na precedência existente `SubagentLevel` do qwen-code devem permanecer acima de `builtin` (atual) ou abaixo dele (Claude Code não tem equivalente)? | **Mantenha `extension > builtin`**. Extensions são instalados pelo usuário; built-ins são padrão do vendor. Instalado pelo usuário vence.                                                                                                                                                                                                                                        |
| Q10 | As issues #4821, #4721, #4732 estão totalmente especificadas para o contrato que este doc propõe?                                                                             | **Poste um comentário de coordenação no #4821** linkando este doc, resumindo as decisões campo a campo e pedindo aos maintainers para ack: (a) paridade de schema com os 16 campos do Claude Code 2.1.168, (b) bridge D7 `permissionMode`/`approvalMode`, (c) ordem de precedência D2, (d) resolução registry-as-dumb-data da contradição `tools`/`disallowedTools`. |

### Itens de ação de coordenação

| #   | Ação                                                                       | Onde                                                |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Poste resumo campo a campo + 5 decisões no #4821 para ack do maintainer        | comentário no #4821                                     |
| A2  | Faça cross-link deste doc a partir do #4721 notando a matriz da Fase 3                         | comentário no #4721                                     |
| A3  | Assim que o P1 deste port for integrado, dê um ping no #4732 para mudar para o resolvedor mais rico          | comentário no PR #4732 (quando estiver pronto)                     |
| A4  | Reexecute strings-grep contra a próxima minor do Claude Code para detecção de schema-drift | cron job da skill `feature-reverse` (manual até lá) |