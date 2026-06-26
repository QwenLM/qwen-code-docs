# Definições de Agentes Declarativos — Port do Claude Code 2.1.168

Documento de design interno para portar o esquema de agente declarativo (markdown +
frontmatter YAML) do Claude Code para o qwen-code, abordando a issue [#4821][i4821] e
coordenando com o port do workflow na issue [#4721][i4721] / PR [#4732][p4732].

[i4821]: https://github.com/QwenLM/qwen-code/issues/4821
[i4721]: https://github.com/QwenLM/qwen-code/issues/4721
[p4732]: https://github.com/QwenLM/qwen-code/pull/4732

## Status da implementação (fatias verticais)

A PR [#4842][p4842] entregou os campos com um caminho de runtime ponta a ponta na
época. A PR [#4870][p4870] então substituiu o parser YAML para suportar
block scalars. Esta PR de acompanhamento se baseia em ambas: substitui o
**stringifier** YAML (a PR #4870 o deixou manual — veja
`docs/yaml-parser-replacement.md`), expõe `mcpServers` + `hooks` em
`SubagentConfig` e os conecta ao runtime para que servidores MCP e hooks
por agente realmente disparem quando um subagente é executado.

| Campo             | Status                   | Notas                                                                                                                                                             |
| ----------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | **entregue (#4842)**     | faz a ponte para o `approvalMode` existente do qwen no momento da análise                                                                                         |
| `maxTurns`        | **entregue (#4842)**     | conectado ao caminho de runtime `runConfig.max_turns` existente                                                                                                   |
| lista de `color`  | **entregue (#4842)**     | restringe campo existente ao conjunto `_Y` do CC + tratamento do sentinela legado `auto`                                                                          |
| `mcpServers`      | **entregue (follow-up)** | ida e volta YAML aninhado segura via stringify do eemeli/`yaml`; a sobreposição de runtime mescla servidores da sessão + do agente via wrapper Config do subagente + reconstrução forçada do registro de ferramentas             |
| `hooks`           | **entregue (follow-up)** | entradas efêmeras do HookRegistry registradas na criação do subagente, removidas via `onStop`; v1 dispara globalmente (sem filtro de escopo do agente)            |
| `effort`          | adiado                   | ainda não existe nenhum parâmetro `effort` no nível do modelo nos provedores do qwen                                                                              |
| `memory`          | adiado                   | a memória automática do qwen ainda não tem distinção de escopo `user`/`project`/`local`                                                                           |
| `isolation`       | adiado                   | a PR de workflow #4732 é dona do runtime; o padrão por agente chegará quando essa chegar                                                                          |
| `initialPrompt`   | adiado                   | requer a flag CLI `--agent` (não há infraestrutura de agente de sessão principal no qwen)                                                                         |
| `skills`          | adiado                   | requer que o SkillManager consuma `config.skills`                                                                                                                 |

O registro completo de engenharia reversa abaixo é mantido como referência de design
para os campos adiados — as constantes de esquema, as semânticas DL7/Ig5, as mensagens
de erro e a matriz de coordenação com o workflow ainda são relevantes
para esse trabalho.

[p4842]: https://github.com/QwenLM/qwen-code/pull/4842
[p4870]: https://github.com/QwenLM/qwen-code/pull/4870

---

## Fase 0 — Limites

| Item                     | Valor                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Último upstream verificado | Claude Code **2.1.168** (a issue #4821 referencia ≥ 2.1.167, estamos um bump acima)                                                    |
| Binário nativo           | `/private/tmp/cc-2.1.168/package/claude` (220 MB)                                                                                       |
| Extração de strings      | `/private/tmp/cc-2.1.168/claude.strings` (~342 k linhas)                                                                                 |
| Worktree                 | `.claude/worktrees/gifted-hamilton-684741`                                                                                              |
| Branch                   | `lazzy/gifted-hamilton-684741` a partir de `main @ 45efb1d3a`                                                                           |
| Fora do escopo           | Código de workflow da PR #4732 (worktree separada `lazzy/lucid-pare-974192`) — coordenar somente via interface                           |
| Regra de autoria         | Autor é **LaZzyMan**; **nenhum** trailer `Co-Authored-By` ou de ferramentas de IA em commits, PRs, issues ou comentários (de acordo com `~/.claude/CLAUDE.md`) |

---

## Fase 1 — Descobertas da engenharia reversa

Todas as afirmações aqui foram verificadas de forma independente com grep no `claude.strings`
e sobreviveram à refutação adversarial. Níveis de confiança: **C** = Confirmado (evidência
binária direta), **I** = Inferido (sintetizado a partir de múltiplos fatos confirmados),
**O** = Em aberto (ainda incerto).

### Esquema — os 15 campos, refutados e reconfirmados

O esquema de frontmatter de agente é `Ig5`, usado internamente em `ug5.agent` para
telemetria `tengu_frontmatter_shadow_unknown_key` / `_mismatch`. O
**carregador de produção é `DL7`** (`parseAgentFromMarkdown`), que realiza
validação manual campo por campo com mensagens de erro personalizadas. Um esquema
**JSON separado `JL7`** (usado por `fL7` / `parseAgentFromJson`) é mais restrito,
mas é um caminho de código diferente (usado por `--agents <json>` e
`settings.agents`).

| #   | Campo             | Tipo (Ig5 / DL7)                        | Obrigatório | Padrão         | Enum / Restrição                                                                                                                       | Nível                                  |
| --- | ----------------- | --------------------------------------- | ----------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | `name`            | string, não vazia                       | **sim**     | —              | nenhum — DL7: `if(!T\|\|typeof T!=="string")return null`                                                                                 | **C** strings:308120, 309074            |
| 2   | `description`     | string, não vazia                       | **sim**     | —              | JL7: `.min(1, "Description cannot be empty")`                                                                                           | **C** strings:308120, 309074, 309076   |
| 3   | `model`           | string                                  | não         | undefined      | `inherit` (insensível a maiúsculas) normalizado para literal `"inherit"`; caso contrário, passagem direta com trim                        | **C** strings:308120, 309075, 309076   |
| 4   | `tools`           | string\|array (união MDH)               | não         | undefined      | token único `*` → `undefined` (significa "herdar tudo"); duplicado via `AXH`/`FbK`                                                       | **C** strings:308120 (MDH/AXH), 309075 |
| 5   | `disallowedTools` | string\|array (MDH)                     | não         | undefined      | "Ignorado se `tools` estiver definido" (conforme texto de descrição); imposto pelos chamadores                                            | **C** strings:308120, 309075            |
| 6   | `effort`          | string\|inteiro                         | não         | undefined      | enum `GN=["low","medium","high","xhigh","max"]` OU `int`; alias `P37={med:"medium"}`                                                    | **C** strings:308120, 309075, GN/P37   |
| 7   | `permissionMode`  | string                                  | não         | undefined      | enum `$E = Gmq = [...kc]` onde `kc=["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"]` (6 valores)                     | **C** strings:307649 (kc), 308120, 309075 |
| 8   | `mcpServers`      | `z.unknown()` (Ig5); `array(jL7)` (JL7) | não         | undefined      | cada item: string OU `record(string, MCPServerSpec)`; `safeParse` por item no DL7                                                       | **C** strings:308120, 309075, 309076   |
| 9   | `hooks`           | `z.unknown()` (Ig5); `_u()` (JL7)       | não         | undefined      | validado tardiamente em tempo de execução via `TKO` → `_u().safeParse` (formato de hooks do settings.json)                                | **C** strings:308120, 309073 (TKO), 309076 |
| 10  | `maxTurns`        | `union(number, string, null)`           | não         | undefined      | inteiro positivo (analisado por `W46` — aceita string numérica ou número)                                                               | **C** strings:308120, 309075 (W46), 309076 |
| 11  | `skills`          | string\|array (MDH)                     | não         | `[]` (emitido) | normalizado via `ml(q.skills) = FbK(H) ?? []`; sem curinga `*` (diferente de `tools`)                                                   | **C** strings:308120, 309075            |
| 12  | `initialPrompt`   | string                                  | não         | undefined      | apenas espaços em branco → undefined; submetido automaticamente apenas quando o agente é a **sessão principal** (via `--agent` / settings), ignorado como subagente | **C** strings:308120, 309075            |
| 13  | `memory`          | string                                  | não         | undefined      | enum `["user","project","local"]`                                                                                                       | **C** strings:308120, 309075, 309076   |
| 14  | `background`      | string\|bool (eiH=EL8)                  | não         | undefined      | aceita `true` / `false` / `"true"` / `"false"`; apenas truthy normalizado para `true`, senão `undefined`                                 | **C** strings:308120, 309075            |
| 15  | `isolation`       | string                                  | não         | undefined      | enum **apenas** `["worktree"]` (NÃO `["none","worktree"]` — esse é um esquema diferente em strings:313284 para configurações de sessão em background) | **C** strings:308120, 309075, 309076   |

Observação sutil que sobreviveu à refutação: embora `skills` seja "opcional",
a cláusula de emissão do DL7 é `...I !== void 0 && {skills: I}` e `ml(undefined)`
retorna `[]` (não undefined), então o **registro final emitido carregará
`skills: []` mesmo quando o frontmatter omitir o campo**. Isso afeta verificações
de igualdade a jusante — sinalizar para o port do qwen-code.

### Possíveis campos adicionais além dos 15

| #   | Campo       | Tipo   | Padrão   | Enum / Restrição                                                                                                                                                                                                                                                            | Nível                                    |
| --- | ----------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 16  | **`color`** | string | undefined | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; descrito como `"@internal — display color in the agents UI"`; valores fora de `_Y` são silenciosamente descartados na análise (DL7 emite `...z && typeof z === "string" && _Y.includes(z) && {color: z}`) | **C** strings:308120, 309075, \_Y inline |

Este é o **único** novo campo de frontmatter de agente além da lista da #4821. Campos que foram
pesquisados mas **NÃO** encontrados em `Ig5` / `JL7`: `version`, `tags`,
`labels`, `category`, `icon`, `alias` / `aliases`, `experimental`, `deprecated`,
`owner`, `author`, `homepage`, `displayName`, `shortDescription` (todos apareceram
apenas no esquema de skill `bg5` ou em identificadores não relacionados).

### Carregador — mapa de arquivos e funções

| Aspecto                                                      | Função                                                                                                                                                       | Localização          | Nível  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------ |
| Montador do registro de nível superior                       | `QL` (nome exportado `getAgentDefinitionsWithOverrides`)                                                                                                     | strings:309076       | **C**  |
| Caminhador do sistema de arquivos (compartilhado com skills/commands/output-styles) | `Gm` (memoizado via `h6`)                                                                                                                                   | strings:312887       | **C**  |
| Descoberta por `.md`                                         | `d_q` (= `loadMarkdownFiles`, ripgrep com `--files --hidden --follow --no-ignore --glob *.md`, tempo limite `AbortSignal.timeout` de 3 s, fallback `wY3` quando `__("true")`) | strings:312887       | **C**  |
| Analisador por arquivo (markdown)                            | `DL7` (= `parseAgentFromMarkdown`)                                                                                                                          | strings:309074       | **C**  |
| Analisador por arquivo (JSON)                                | `fL7` (= `parseAgentFromJson`), usa esquema `JL7`                                                                                                           | strings:309073       | **C**  |
| Carregador de agente de plugin                               | `b0_` → por diretório `oR7` → por arquivo `sR7`                                                                                                             | strings:308780, 308779| **C**  |
| Embutidos                                                    | `naH()` — emite `[JqH=general-purpose, KL7=statusline-setup, …]` mais `YI=fork` implícito                                                                    | strings:309073, 308663| **C**  |
| Resolvedor de sobreposições                                  | `DS()` (= `getActiveAgentsFromList`) — ver Ordem de Resolução                                                                                                | strings:309073       | **C**  |
| Invalidação de cache                                         | `u0_()` (= `clearAgentDefinitionsCache`) — limpa `QL.cache` + `Gm.cache`                                                                                     | strings:309073       | **C**  |
| Observador de FS (chokidar)                                   | `s_T()` → `Q4_=s_T()` na inicialização do módulo (`WB6`)                                                                                                    | strings:316417       | **C**  |

`Gm("agents", _)` lê três baseDirs (`policySettings`, `userSettings`,
`projectSettings`), cada um marcado no registro, e então deduplica por **inode** (descarta
duplicatas de mesmo inode de symlinks/hardlinks, registra `Skipping duplicate file '<path>' from <source> (same inode already loaded from <firstSource>)`).
Telemetria: `tengu_dir_search` com `managedFilesFound`, `userFilesFound`,
`projectFilesFound`, `projectDirsSearched`, `subdir`.

### Ordem de resolução — precedência definitiva

A função `DS()` filtra sua entrada por `source` e então itera um array de ordem fixa
dentro de um `Map` indexado por `agentType`. Como `Map.set` sobrescreve, o
**último bucket tocado vence**:

```text
[built-in, plugin, userSettings, projectSettings, flagSettings, policySettings]
                                                                       ^
                                                                  maior precedência
```

| Fonte             | Origem                                                                                                                                                                          | Prioridade de sobreposição | Nível                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------- |
| `built-in`        | `naH()` (codificado no binário)                                                                                                                                                  | 1 (menor)                  | **C** strings:309073              |
| `plugin`          | `b0_` → por plugin `agentsPath`/`agentsPaths`                                                                                                                                    | 2                          | **C** strings:308780              |
| `userSettings`    | `~/.claude/agents/` (`CLAUDE_CONFIG_DIR` ou `~/.claude`)                                                                                                                          | 3                          | **C** strings:312887, 307489      |
| `projectSettings` | `<cwd>/.claude/agents/` MAIS `iV_()` sobe até homedir / raiz do git                                                                                                               | 4                          | **C** strings:312887, iV\_ inline |
| `flagSettings`    | flag CLI `--agents <json>` (esquema `qKO = h.record(h.string(), JL7())`)                                                                                                          | 5                          | **C** strings:330190, 309076      |
| `policySettings`  | diretório gerenciado pelo sistema: macOS `/Library/Application Support/ClaudeCode/.claude/agents`, Linux `/etc/claude-code/.claude/agents`, Windows `C:\Program Files\ClaudeCode\.claude\agents` | 6 (maior)                  | **C** strings:307649 (H2), 312887 |

Colisões são resolvidas **silenciosamente** — apenas o evento de telemetria `tengu_plugin_name_collision`
é disparado (`winner_source: T.at(-1)`); não há aviso "X substitui built-in" mostrado ao usuário. (strings:308742 `hMH`.)

Comportamento sutil: `iV_()` percorre **do mais interno para o mais externo** a partir de `cwd`, mas Map.set
último vence, então **`.claude/agents/` da árvore externa vence sobre o da árvore interna**
dentro de projectSettings. Isso é surpreendente — sinalizar em questões em aberto.

### Analisador de frontmatter

| Pergunta                                                  | Resposta                                                                                                                                                                                                                                     | Nível                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Biblioteca utilizada?                                     | **Nenhuma** — divisor manual `lz` chamando `Bun.YAML.parse` (via wrapper `l5H`). Nenhum `gray-matter`, `js-yaml` ou `front-matter` no binário.                                                                                               | **C** strings:307902 (l5H), 307905 (lz), 110303 (erros Bun.YAML) |
| Regex                                                     | `n5H = /^---\s*\n([\s\S]*?)---\s*\n?/`                                                                                                                                                                                                       | **C** strings:307905                                              |
| Tratamento de falhas                                      | Falha na análise YAML → tentativa com normalização de tab para 2 espaços; se ainda falhar, registra `Failed to parse YAML frontmatter in <file>: <err>` como warn e retorna `{frontmatter: {}, content: body}` (NUNCA lança exceção)         | **C** strings:307905, 151839                                      |
| Extração do corpo                                         | Fatia de string simples `H.slice(K[0].length)` após `---` de fechamento; depois normalizado por `v$H` (provavelmente remoção de nova linha inicial)                                                                                           | **C** strings:307905                                              |
| Compartilhado entre agents / skills / commands / output-styles? | **Sim** — o mesmo `lz` reutilizado por `Iq_` (carregador de skill), `f13` (carregador de comandos obsoletos), e o carregador de agentes via `Gm` → `d_q`                                                                                     | **C** strings:312690                                              |
| Validador de esquema                                       | **Zod v4** (empacotado). Marcadores exclusivos da v4: `looseObject`, `treeifyError`, `prettifyError`, `toJSONSchema` presentes                                                                                                               | **C** strings:141270-141395, 141586                               |
| Modo de validação                                          | **Sombra** — `ahH("agent", frontmatter)` executa `ug5.agent().strict().safeParse()` **apenas** para telemetria; o DL7 ignora o resultado e prossegue com sua própria validação campo por campo. O objeto de frontmatter permissivo é a fonte de verdade do runtime. | **C** strings:308120 (ahH/ug5), 309074 (DL7 chama mas ignora)     |
| Eventos de telemetria                                      | `tengu_frontmatter_shadow_unknown_key`, `tengu_frontmatter_shadow_mismatch` (deduplicados via `Set A37` em processo)                                                                                                                          | **C** strings:154634, 154636                                      |
### Ligação — Ferramenta Agent + flag CLI

| Camada                          | O que faz                                                                                                                                                                       | Conf                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Schema da ferramenta Task/Agent (`$_3`) | Declara `subagent_type: string.optional()`; quando omitido, usa `general-purpose` como fallback (ou `fork` se `AI()` retornar true)                                                      | **C** strings:~309220        |
| Busca do Subagent                | `activeAgents.find(a => a.agentType === requestedType)` contra `toolUseContext.options.agentDefinitions.activeAgents`                                                             | **C** strings:~309220        |
| Fallback difuso                 | `MWK(s) = s.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{Pd}_]+/gu, "")`; correspondência ambígua → `AgentTypeError`; reagrupamento limpo → `tengu_subagent_type_normalized`      | **C** strings:~309220        |
| Portão de permissão                | `lV_(toolPermissionContext, "Task", agentType)` — negação → `Agent type '<x>' has been denied by permission rule 'Task(<x>)' from <source>.`                                        | **C** strings:~309220        |
| Fonte do prompt de sistema           | O corpo Markdown vira `getSystemPrompt: () => body + ('\n\n' + UVH(agentType, memoryScope)` quando memória habilitada) — closure capturada no momento da análise sintática                                  | **C** strings:309074-6 (DL7) |
| Renderização na thread principal             | `Pp({mainThreadAgentDefinition, …})` — se o agente tem `appendSystemPrompt: true` (o built-in `claude` que pega tudo), o corpo é anexado ao padrão; caso contrário, **SUBSTITUI** o padrão      | **C** strings:311015         |
| CLI `--agent <nome>`           | Declarada via Commander; handler de ação `if(I) process.env.CLAUDE_CODE_AGENT = I;` — coloca na variável de ambiente, lida em outro lugar em `appState.agent`. Também registrada no arquivo pid.          | **C** strings:330190, 142138 |
| CLI `--agents <json>`          | Flag separada; registro JSON `{name: {description, prompt, …}}` validado por `qKO = h.record(h.string(), JL7())`; junta-se ao mesmo registro `activeAgents` com `source: flagSettings` | **C** strings:330190, 309076 |

### Ciclo de vida — carga a frio + recarga a quente

| Aspecto                          | Comportamento                                                                                                                                                                                                                  | Conf                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Carga a frio                       | Preguiçosa — `QL` é memoizado via `h6` (wrapper de cache); primeiro acesso lê sistema de arquivos + plugins, acessos subsequentes retornam cache                                                                                               | **C** strings:309076         |
| Mecanismo de recarga a quente            | **Watcher chokidar** `s_T()` registrado na inicialização do módulo (`WB6`); observa `.claude/agents` (usuário + projeto) mais diretórios de skills e comandos                                                                                      | **C** strings:316417         |
| Flags do watcher                   | `persistent:true, ignoreInitial:true, depth:2, awaitWriteFinish:{stabilityThreshold,pollInterval}, ignored:(p,s) => s?.isFile() ? !p.endsWith(".md") : false, usePolling:kZ4` (macOS true), eventos `add`/`change`/`unlink` | **C** strings:316417         |
| Debounce                        | 300 ms (`l_T = 300`); handler chama `RIH(), Vv(), u0_(), …` — `u0_()` invalida o cache de agentes                                                                                                                              | **C** strings:316417, 309073 |
| Polling adaptativo                | ativo = `n_T = 2000 ms` de intervalo; ocioso (sem interação por `r_T = 60000 ms`) → `i_T = 30000 ms`; recria instância do chokidar na troca                                                                                   | **C** strings:316417         |
| Comando barra `/agents`         | UI `local-jsx` para gerenciar agentes (Biblioteca/criar/editar/excluir/executar) — **NÃO** é um comando de reescaneamento                                                                                                                             | **C** strings:314593         |
| Comando barra `/reload-plugins` | Reexecuta `QL(W8())`, recontagem de agentes; cobre agentes originados de plugins (que chokidar **NÃO** observa)                                                                                                                         | **C** strings:314595, 190948 |
| Outros caminhos de invalidação        | `clearSessionCaches` (usado por `/clear`) também chama `u0_()`                                                                                                                                                                 | **C** strings:313246         |

### Perguntas em aberto (Fase 1)

| #   | Pergunta                                                                                                                                  | Conf  | Caminho de resolução                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| Q1  | A omissão de `color` no #4821 é intencional (é `@internal`) ou descuido?                                                            | **O** | Tratar como **intencional** — portar o campo, mas marcar como interno/apenas UI  |
| Q2  | O comportamento leniente do DL7 (background aceita strings, maxTurns aceita strings) é uma funcionalidade documentada para o usuário ou um hack de retrocompatibilidade? | **O** | Espelhar para paridade, mas avisar na documentação do port                             |
| Q3  | Por que `isolation` enum `["worktree"]` é apenas para agentes enquanto o schema de configuração de sessão em segundo plano aceita `["none","worktree"]`?        | **O** | Provavelmente "sem isolamento" = campo omitido; documentar explicitamente              |
| Q4  | O `--agents <json>` (flagSettings) intencionalmente fica na precedência 5 (acima de projeto, abaixo de política)?                                    | **O** | qwen-code pode pular a flag na v1, adiar a decisão                   |
| Q5  | Empilhamento do mais interno primeiro por `iV_` + Map.set último vence → **árvore externa vence** para colisões de projectSettings. Armadilha ou intencional?           | **O** | qwen-code deve escolher semântica de **mais interno vence** para evitar a armadilha |

---

## Fase 2 — Plano de implementação para qwen-code

### Estado atual — mapa de um parágrafo

O qwen-code já possui infraestrutura de subagentes considerável:
`SubagentManager` (`packages/core/src/subagents/subagent-manager.ts`) implementa
operações CRUD sobre arquivos Markdown + frontmatter YAML em `.qwen/agents/` (projeto) e
`~/.qwen/agents/` (usuário), utilizando um parser YAML personalizado
(`packages/core/src/utils/yaml-parser.ts` — sem dependência `gray-matter` / `yaml`,
confirmado pelo `package.json`). `SubagentConfig`
(`packages/core/src/subagents/types.ts:41-122`) já possui `name`,
`description`, `tools`, `disallowedTools`, `approvalMode`, `systemPrompt`,
`model`, `runConfig`, `color`, `background`. `SubagentLevel` já suporta cinco
escopos (session, project, user, extension, builtin) com precedência
`session > project > user > extension > builtin`
(`subagent-manager.ts:189-220`). A ferramenta Agent
(`packages/core/src/tools/agent/agent.ts`) declara `subagent_type` e
atualiza dinamicamente o enum de seu schema via `subagentManager.changeListener`.
Uma ponte `convertClaudeAgentConfig()` já existe em
`packages/core/src/extension/claude-converter.ts:162-220` com um mapeamento de
nomes de ferramentas e mapeamento `permissionMode → approvalMode`. A **lacuna**
é: (a) o schema está faltando 8 campos do #4821 (`effort`, `permissionMode` como
cidadão de primeira classe, `mcpServers`, `hooks`, `maxTurns` como nível superior,
`skills`, `initialPrompt`, `memory`, `isolation`); (b) não há flag CLI
`--agent <nome>`; (c) não há recarga a quente estilo chokidar (existe invalidação
por extensão, mas não para agentes do sistema de arquivos); (d) `maxTurns` atualmente
está aninhado sob `runConfig.max_turns` — precisa ser promovido ao nível superior
conforme #2409.

### Decisões arquiteturais

#### D1. Reutilizar o yaml-parser existente para frontmatter

**Decisão:** Reutilizar `packages/core/src/utils/yaml-parser.ts` (já usado por
`SubagentManager.parseSubagentContent` e pelo carregador de skills).
**Justificativa:** O `lz` do Claude Code é o mesmo parser compartilhado usado para skills +
comandos + agentes; qwen-code já espelha esse padrão. Adicionar `gray-matter`
ou `js-yaml` é rotina desnecessária. O parser existente lida com a separação
`--- … ---` e é silencioso em entradas malformadas (corresponde à postura
`warn-and-return-empty` do `lz`).

#### D2. Ordem de resolução / precedência

**Decisão:** Usar `session > projeto (.qwen/agents/) > usuário (~/.qwen/agents/)

> extensão > builtin` — ou seja, **manter a ordem existente do SubagentLevel do qwen-code,
NÃO espelhar os buckets `flagSettings`/`policySettings` do Claude Code na v1**.
**Justificativa:** O `policySettings` do Claude Code (diretório gerenciado) é uma história de
deploy empresarial que o qwen-code não possui. Agentes injetados por flag (`--agents <json>`)
é um recurso de usuário avançado que pode chegar no P4. A precedência existente de cinco níveis
do qwen-code já cobre os casos que #4821 se preocupa: projeto sobrescreve usuário, usuário
sobrescreve builtin. O nível `extension` se encaixa limpidamente entre usuário e builtin.

#### D3. Validação — manter o SubagentValidator existente

**Decisão:** Estender `SubagentValidator`
(`packages/core/src/subagents/`) para validar os oito novos campos. **Não**
introduzir zod a menos que o pipeline do skillManager já o utilize; se o validador
existente for feito manualmente, mantê-lo manualmente.
**Justificativa:** O `Ig5` do Claude Code é apenas de sombra — a validação em tempo de execução
é feita manualmente (`DL7`). Espelhar esse padrão mantém as mensagens de erro legíveis
(por exemplo, `Agent file <path> has invalid permissionMode '<x>'. Valid options: …`)
sem arrastar outra dependência. Se o skillManager já usar zod, seguir essa escolha
para consistência — TBD pela leitura do código de skill na preparação P1.

#### D4. Recarga a quente — adiar; confiar em carga a frio + recarga explícita

**Decisão:** v1 **NÃO** envia um watcher chokidar. Hooks de invalidação de cache
já existem (`subagentManager` tem `changeListener` e atualização explícita orientada a CRUD).
A recarga em nível de projeto acontece no início da sessão; edições na sessão via
interface `/agents` invalidam. Um comando de barra `/reload-agents` (ou aproveitar
`/reload-plugins`) pode chegar no P4 se houver demanda dos usuários.
**Justificativa:** Recarga a quente via watcher de sistema de arquivos é cara (chokidar adiciona
um loop de polling com agendamento adaptativo — a implementação do Claude Code sozinha tem ~150
linhas de contabilidade). Carga a frio na inicialização é suficiente para a v1 e corresponde
a como `SubagentManager` está conectado hoje. Abrir porta para P4.

#### D5. Conectar flag CLI `--agent <nome>` — v1 no escopo

**Decisão:** Adicionar `--agent <nome>` ao `CliArgs` em `packages/cli/src/config/config.ts`.
Comportamento: buscar no registro resolvido, definir o agente como o agente da thread principal,
lançar um erro claro se o nome não resolver. Corresponder às semânticas do Claude Code
(substituir prompt de sistema padrão a menos que o agente tenha `appendSystemPrompt: true`).
**Não** usar uma indireção de variável de ambiente `CLAUDE_CODE_AGENT`
— o objeto `Config` do qwen-code pode carregá-lo diretamente.
**Justificativa:** Este é o punho de interação com o usuário do #4821 — sem ele, agentes declarativos
só são acessíveis através do parâmetro `subagent_type` da ferramenta Agent, o que
é muito indireto para um caso de uso "definir meu agente padrão". `--agents <json>`
(plural) pode ser adiado para o P4.

#### D6. Coordenação Workflow.agentType — contrato de interface

**Decisão:** Expor uma interface de resolução estável que o PR #4732's
`createProductionDispatch` possa chamar quando chegar. Especificamente:

| Contrato                                                                                                                                                                                                                                                                                                     | Dono                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| O campo `name` do frontmatter É a string `agentType` do workflow (igualdade de chave, sensível a maiúsculas/minúsculas)                                                                                                                                                                                         | este PR              |
| O piso `disallowedTools` codificado do workflow (`[SEND_MESSAGE, EXIT_PLAN_MODE]`, espelhado do upstream `Tg8`; verificado no PR #4732 como `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) **UNIÃO** com `disallowedTools` do nível do agente — o piso é sempre aplicado, mesmo quando a definição do agente define `tools` | workflow PR consume |
| `opts.isolation` por chamada sobrescreve o padrão `isolation: 'worktree'` do agente                                                                                                                                                                                                                                | workflow PR consume |
| `model`, `effort`, `permissionMode`, `maxTurns` da definição do agente sobrescrevem os padrões do workflow quando definidos                                                                                                                                                                                                    | workflow PR consume |
| O corpo do agente se torna o `systemPrompt` do subagente; o `WORKFLOW_SUBAGENT_SYSTEM_PROMPT` do workflow é o fallback quando `agentType` não resolve                                                                                                                                                             | workflow PR consume |
| Quando `agentType` não está definido ou falha ao resolver, o workflow recai para o subagente de workflow built-in (gracioso, sem exceção)                                                                                                                                                                                        | workflow PR consume |

**Resolução da contradição #4721 / #4821** (precedência `tools` vs
`disallowedTools`): este port escreve o registro de agente de forma que
`disallowedTools` é **sempre carregado separadamente** de `tools`. A regra "ignorado
se `tools` está definido" da tabela do #4821 é **aplicada pelos chamadores da ferramenta Agent**
(isto é, ao construir o `ToolConfig` do subagente), não no momento da análise sintática.
Isso permite que o workflow sempre faça a união de seu piso com `disallowedTools`
independentemente de o agente definir `tools`. O registro de agente é um
**portador de dados burro**; as regras de precedência vivem no local de despacho. Isso
resolve o aparente conflito entre a regra "ignorado" do #4821 e a regra "união"
do #4721.

**Canonicalização de nomes de ferramentas:** Usar `ToolNames.SEND_MESSAGE` e
`ToolNames.EXIT_PLAN_MODE` (verificado contra o diff do PR #4732), exportados como constantes nomeadas de
`packages/core/src/agents/runtime/workflow-orchestrator.ts` assim que chegar. O
próprio port de agentes declarativos **não** precisa importá-los — eles são o
piso do workflow, aplicado no local de despacho do workflow.

### Layout dos módulos

| Caminho                                                               | Novo / Modificado | Propósito                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/subagents/types.ts`                             | **Modificado**   | Adicionar 8 novos campos ao `SubagentConfig`: `effort`, `permissionMode` (já mapeia via `approvalMode` — manter ambos? ver D7 abaixo), `mcpServers`, `hooks`, `maxTurns` (promover ao nível superior, depreciar `runConfig.max_turns`), `skills`, `initialPrompt`, `memory`, `isolation` |
| `packages/core/src/subagents/subagent-manager.ts`                  | **Modificado**   | Estender `parseSubagentContent` / `serializeSubagent` para fazer round-trip dos novos campos; estender chamadas `SubagentValidator`                                                                                                                                                            |
| `packages/core/src/subagents/subagent-validator.ts` (caminho assumido) | **Modificado**   | Adicionar validação por campo correspondente às mensagens de erro do DL7: `Agent file <path> has invalid permissionMode '<x>'. Valid options: …` etc.                                                                                                                                       |
| `packages/core/src/subagents/agent-frontmatter-schema.ts`          | **Novo**       | Fonte única da verdade para constantes enum: `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES`. Espelhar Claude Code 2.1.168 textualmente.                                                                                           |
| `packages/core/src/subagents/builtin-agents.ts`                    | **Modificado**   | Novos campos com valor padrão undefined; sem mudança de comportamento                                                                                                                                                                                                                      |
| `packages/core/src/tools/agent/agent.ts`                           | **Modificado**   | Ler novos campos do `SubagentConfig` resolvido ao construir opções do subagente (`model`, `maxTurns`, `permissionMode`, `effort`); conectar semântica de sobrescrita por chamada `isolation` para #4721                                                                              |
| `packages/cli/src/config/config.ts`                                | **Modificado**   | Adicionar flag `--agent <nome>`; resolver contra `SubagentManager` na inicialização; erro se o nome não resolver                                                                                                                                                                    |
| `packages/cli/src/config/config.test.ts`                           | **Modificado**   | Testes para resolução da flag `--agent` + caminho de erro                                                                                                                                                                                                                          |
| `packages/core/src/extension/claude-converter.ts`                  | **Modificado**   | Adicionar mapeamento para novos campos ao importar arquivos `.md` do Claude (`mcpServers`, `hooks`, `maxTurns` nível superior, `memory`, `isolation`, etc.)                                                                                                                                   |
| `packages/core/src/subagents/agent-frontmatter-schema.test.ts`     | **Novo**       | Testes de snapshot para listas enum; testes de round-trip parse/serialização                                                                                                                                                                                                           |
| `packages/core/src/subagents/subagent-manager.test.ts`             | **Modificado**   | Testes para validação de novos campos, precedência, mensagens de erro                                                                                                                                                                                                                |
| `packages/core/src/tools/agent/agent.test.ts`                      | **Modificado**   | Testes para conexão de novos campos no runtime do subagente                                                                                                                                                                                                                        |
| `docs/cli/agents.md` (se existir) ou `docs/declarative-agents.md`   | **Novo**       | Referência voltada ao usuário: schema de 16 campos + exemplos
### D7. permissionMode vs approvalMode — faça a ponte, não substitua

**Decisão:** Aceitar TANTO `permissionMode` (compatível com Claude) quanto o
`approvalMode` existente (compatível com qwen) no frontmatter. Durante a análise,
se `permissionMode` estiver definido, mapeie-o para `approvalMode` usando a
tabela existente em `claude-converter.ts:195-208` (`default → default`, `plan → plan`,
`acceptEdits → auto-edit`, `dontAsk → default`, `bypassPermissions → yolo`).
Se ambos estiverem presentes, `approvalMode` vence (mais específico para qwen-code) e
emita um evento de telemetria do estilo `tengu_frontmatter_shadow_*` sinalizando que
ambos foram definidos.
**Justificativa:** Preserva a compatibilidade retroativa com os arquivos
`.qwen/agents/*.md` existentes que usam `approvalMode`, ao mesmo tempo que aceita
`permissionMode` do Claude Code literalmente, permitindo que usuários insiram
arquivos de agente do Claude Code sem alterações.

### Tabela de mapeamento do esquema

| Campo Claude Code 2.1.168  | Campo qwen-code                                    | Adaptação                                                                                                   | Observações                                                                                             |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`                     | `name`                                             | nenhuma                                                                                                     | idêntico, obrigatório                                                                                   |
| `description`              | `description`                                      | nenhuma                                                                                                     | idêntico, obrigatório                                                                                   |
| `model`                    | `model`                                            | aceitar `inherit`, `fast`, `haiku`, `sonnet`, `opus`, ou `authType:model-id`                                | qwen-code já suporta o vocabulário mais amplo; `inherit` é novo                                        |
| `tools`                    | `tools`                                            | aceitar string\|array; `*` → undefined (herdar-tudo)                                                        | já suportado como array; adicionar tratamento para string + `*`                                        |
| `disallowedTools`          | `disallowedTools`                                  | aceitar string\|array; **sempre mantido separado de `tools`**                                               | regra de precedência (#4821 "ignorado se tools estiver definido") é **aplicada pelos chamadores**, não pelo parser |
| `effort`                   | `effort` (novo)                                    | enum `low/medium/high/xhigh/max` + inteiro; alias `med → medium`                                            | efeito em tempo de execução é específico do qwen (mapear para knob de esforço-pensamento existente, se presente; caso contrário, armazenar e ignorar) |
| `permissionMode`           | `permissionMode` (novo) + faz ponte para `approvalMode` | enum `acceptEdits/auto/bypassPermissions/default/dontAsk/plan`; tabela de mapeamento conforme D7            | aceitar formato Claude literalmente                                                                     |
| `mcpServers`               | `mcpServers` (novo)                                | array de (string \| `{name: spec}`); validar por item, descartar entradas inválidas com aviso                 | integração ao runtime MCP no P4                                                                         |
| `hooks`                    | `hooks` (novo)                                     | objeto igual ao formato de hooks do settings.json                                                           | integração ao runtime de hooks no P4                                                                    |
| `maxTurns`                 | `maxTurns` (novo, nível superior)                  | inteiro positivo; aceitar string numérica por paridade                                                      | **promover de `runConfig.max_turns`**; manter forma aninhada como alias obsoleto                       |
| `skills`                   | `skills` (novo)                                    | array de nomes de skills; string separada por vírgula também aceita                                          | runtime: pré-carregar via skillManager quando o agente inicia                                           |
| `initialPrompt`            | `initialPrompt` (novo)                             | string; apenas espaços em branco → undefined; só é disparado quando o agente é a sessão principal           | conectado via caminho da flag `--agent`                                                                 |
| `memory`                   | `memory` (novo)                                    | enum `user/project/local`; carrega de `.qwen/agent-memory/<name>/` etc.                                     | runtime no P4                                                                                           |
| `background`               | `background`                                       | aceitar bool ou string `"true"/"false"`; apenas truthy → true                                               | já suportado; flexibilizar regras de análise                                                            |
| `isolation`                | `isolation` (novo)                                 | enum **apenas** `["worktree"]`                                                                              | runtime pertence ao workflow PR (#4732 P3+); o registro apenas carrega o campo                          |
| `color` (não documentado #16) | `color`                                            | enum `_Y = ["red","blue","green","yellow","purple","orange","pink","cyan"]`; valores fora silenciosamente ignorados | já existe em `SubagentConfig` do qwen; reforçar validação para corresponder à lista permitida do Claude Code |

### Plano de teste TDD

| Trecho                        | Arquivo de teste                                | O que assegura                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constantes do enum do esquema | `agent-frontmatter-schema.test.ts` (novo)       | `EFFORT_VALUES`, `PERMISSION_MODE_VALUES`, `MEMORY_VALUES`, `ISOLATION_VALUES`, `COLOR_VALUES` correspondem ao Claude Code 2.1.168 byte a byte (snapshot)                                          |
| Analisador — caminho feliz    | `subagent-manager.test.ts`                      | Análise de ida e volta do `.qwen/agents/test.md` com todos os 16 campos → o registro emitido tem a forma esperada                                                                                  |
| Analisador — campos obrigatórios | `subagent-manager.test.ts`                   | Faltando `name` retorna null + log de aviso; faltando `description` retorna null + log de aviso                                                                                                    |
| Analisador — validação de enum | `subagent-manager.test.ts`                      | `permissionMode` / `memory` / `isolation` / `effort` / `color` inválidos emitem cada um aviso específico (igual à redação DL7) e o campo é descartado                                               |
| Analisador — tipos de campo flexíveis | `subagent-manager.test.ts`               | `background: "true"` → `true`; `maxTurns: "5"` → `5`; `effort: "med"` → `"medium"`; `tools: "Read,Edit"` → `["Read","Edit"]`; `tools: "*"` → undefined                                             |
| Analisador — lista permitida de color | `subagent-manager.test.ts`               | `color: "magenta"` é silenciosamente ignorado (sem erro), `color: "blue"` é preservado                                                                                                             |
| Idiossincrasia do campo skills | `subagent-manager.test.ts`                      | omitir `skills` resulta em `skills: []` (igual ao comportamento de emissão DL7 do Claude Code)                                                                                                     |
| Precedência de resolução       | `subagent-manager.test.ts`                       | Mesmo `name` no projeto + usuário → projeto vence; no usuário + embutido → usuário vence; na extensão + embutido → extensão vence                                                                    |
| Deduplicação por inode        | `subagent-manager.test.ts`                       | Dois caminhos para o mesmo inode (link simbólico) → apenas um registro, log emitido                                                                                                                |
| Ponte permissionMode          | `subagent-manager.test.ts`                       | `permissionMode: bypassPermissions` → `approvalMode: yolo` resolvido; ambos definidos → `approvalMode` vence + telemetria                                                                          |
| Flag de CLI `--agent`         | `packages/cli/src/config/config.test.ts`         | Flag define agente da thread principal; nome não resolvido lança exceção com `Agent type '<x>' not found. Available agents: …`                                                                      |
| Fallback difuso de ferramenta de agente | `agent.test.ts`                      | `subagent_type: "Test_Engineer"` resolve para um `test-engineer` registrado via normalização NFKC em minúsculas                                                                                     |
| Erro de ferramenta de agente não encontrada | `agent.test.ts`               | `subagent_type` não resolvido → mensagem de erro corresponde a `Agent type '<x>' not found. Available agents: <list>`                                                                              |
| Contrato de workflow          | `agent-frontmatter-schema.test.ts`               | A interface exportada `getAgentByName(name)` retorna o `SubagentConfig` completo, incluindo `isolation`, `disallowedTools`, `model`, `effort`, `permissionMode`, `maxTurns` (consumível pelo workflow PR #4732) |

### Plano de PR por fases

| Fase   | Título                                                                                                                              | Escopo                                                                                                                                                 | Bloqueia                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| **P1** | `feat(core): campos declarativos do esquema de agente (effort, permissionMode, maxTurns nível superior, memory, isolation, lista permitida color)` | Adicionar campos ao `SubagentConfig`; estender analisador + validador + serializador; depreciar `runConfig.max_turns`; adicionar módulo de constantes enum; testes | Nenhum                            |
| **P2** | `feat(core): conectar novos campos de agente ao runtime da ferramenta Agent`                                                        | Integrar `model`, `effort`, `maxTurns`, `permissionMode`/`approvalMode` no `AgentTool.execute()` → ponto de chamada `AgentHeadless.create()`; testes  | P1                                |
| **P3** | `feat(cli): flag --agent para seleção de agente na thread principal`                                                                | Adicionar `--agent <nome>` ao `CliArgs`; resolver na inicialização; caminho de erro; testes                                                            | P1                                |
| **P4** | (opcional, aumento de escopo) `feat(core): runtime de mcpServers + hooks + skills + initialPrompt + memory`                         | Conectar os quatro campos "apenas metadados na v1" a efeitos reais de runtime                                                                          | P1, mais subsistemas skill/MCP/hooks |

Cada PR alvo ≤ 800 LOC de delta (excluindo testes); P1 é o maior com ~600
LOC de validador + testes.

---

## Fase 3 — Matriz de coordenação com a portabilidade do workflow (#4721 / PR #4732)

| Funcionalidade de agentes declarativos                                 | Interação com workflow                                                                                                                                                                   | Responsável                                                        | Bloqueado por                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| Campo `name` como chave do registro                                     | A string de busca `opts.agentType` do workflow ([#4721][i4721] explícito)                                                                                                                | **este PR** define o contrato do registro; **PR do workflow** consome | nenhum — a forma do registro pode estabilizar primeiro |
| Campo `disallowedTools` no agente                                       | Workflow faz UNIÃO com piso fixo `[SEND_MESSAGE, EXIT_PLAN_MODE]` (conforme [#4721][i4721] §2 — verificado em relação ao diff do PR #4732: `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`) | **este PR** carrega o campo; **PR do workflow** faz a união no despacho | PR do workflow #4732 P3 for concluído            |
| Campo `tools` no agente                                                 | Workflow passa literalmente para `ToolConfig.tools` do subagente                                                                                                                         | **este PR** carrega o campo; **PR do workflow** conecta           | PR do workflow #4732 P3                          |
| Campo `model` no agente                                                 | `opts.model` do workflow substitui por chamada; `model` do agente é o padrão                                                                                                             | **este PR** carrega o campo; **PR do workflow** resolve a precedência | PR do workflow #4732 P3                          |
| Campo `effort` no agente                                                | A substituição no local da chamada do workflow vence; fallback padrão do agente                                                                                                          | **este PR** carrega o campo; **PR do workflow** resolve           | PR do workflow #4732 P3                          |
| Campo `permissionMode` no agente                                        | Mapeia para approvalMode do subagente no despacho; substituição do local da chamada do workflow vence                                                                                    | **este PR** carrega o campo via ponte D7; **PR do workflow** conecta | PR do workflow #4732 P3                          |
| Campo `maxTurns` no agente                                              | Substitui o valor fixo `WORKFLOW_SUBAGENT_MAX_TURNS = 50` do workflow quando o agente o define                                                                                          | **este PR** carrega o campo; **PR do workflow** resolve a precedência | PR do workflow #4732 P3                          |
| Campo `isolation: 'worktree'` no agente                                 | Padrão; `opts.isolation` por chamada substitui ([#4721][i4721] §3)                                                                                                                       | **este PR** carrega o campo; **PR do workflow** é dono do runtime | PR do workflow #4732 P3+ (atualmente lança exceção no P1) |
| Campo `initialPrompt` no agente                                         | Workflow **não** o utiliza (só é disparado quando o agente é sessão principal via `--agent`)                                                                                             | **este PR** + **CLI**                                            | nenhum (independente)                            |
| `memory`, `mcpServers`, `hooks`, `skills`                               | Workflow não tem tratamento especial além de passar para o runtime do subagente                                                                                                          | **este PR** carrega os campos; integração no runtime no P4 / futuro | PRs futuros                                      |
| Atualizações de `EXCLUDED_TOOLS_FOR_SUBAGENTS`                          | PR #4732 do workflow adiciona `WORKFLOW` ao conjunto (conforme descoberta da issue/PR-context — embora a refutação adversarial tenha observado que isso AINDA NÃO está em `agent-core.ts` no `main`, apenas na worktree) | **PR do workflow** é dono; este PR não é alterado                | nenhum                                          |
| Forma canônica do nome da ferramenta para piso de workflow (`ToolNames.SEND_MESSAGE`) | Este PR não importa as constantes de piso; ele apenas carrega strings `disallowedTools` como escritas. O PR do workflow é dono da canonicalização.                                              | **PR do workflow**                                                | PR do workflow #4732                             |
| Ordem de entrega                                                         | Este PR (P1+P2+P3) é entregue independentemente do workflow. O PR #4732 do workflow P3 está condicionado a que o resolvedor tipo `getAgentByName()` deste PR seja importável.              | paralelo até P3 do workflow                                       | P3 do workflow lê das exportações deste PR       |

**Sem bloqueio circular:** este PR e o PR do workflow podem ser entregues em paralelo
durante as fases P1/P2. Eles sincronizam no P3 do workflow, que precisa do resolvedor
de registro deste PR. Se este PR for entregue primeiro, o P3 do workflow lê dele. Se
o PR do workflow for entregue primeiro, ele sai com a busca `subagent_type` existente
(retornando padrões do workflow em caso de falta) e troca para o resolvedor mais rico
assim que este PR for entregue.

---

## Fase 4 — Riscos e perguntas em aberto

### Riscos

| #   | Risco                                                                                                                                                                                            | Mitigação                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Deriva de esquema entre versões secundárias do Claude Code (2.1.168 → 2.1.x)                                                                                                                    | Fixar o módulo de constantes enum como "verificado em relação a 2.1.168" com um comentário de documentação; re-executar a busca por strings contra novos lançamentos como parte da skill `feature-reverse` |
| R2  | `runConfig.max_turns` → `maxTurns` no nível superior é uma mudança de esquema que quebra compatibilidade com arquivos `.qwen/agents/*.md` existentes                                            | Manter forma aninhada como alias obsoleto com depreciação de um ciclo; emitir aviso na análise, documentar no CHANGELOG                                           |
| R3  | Perda na ida e volta de `permissionMode` ↔ `approvalMode` (Claude tem 6 modos, qwen tem aproximadamente 4)                                                                                      | Mapear ambas as direções explicitamente conforme D7; emitir telemetria em caso de ambos definidos; NÃO reescrever silenciosamente ao salvar                        |
| R4  | Novos campos (`hooks`, `mcpServers`, `skills`, `memory`) transportados no registro, mas sem runtime na v1 → usuários podem defini-los e não obter efeito silenciosamente                        | Documentar escopo da v1 claramente; emitir um log informativo único por agente quando um campo "carregado mas ainda sem runtime" não estiver vazio                |
| R5  | Verificação adversarial apontou que `EXCLUDED_TOOLS_FOR_SUBAGENTS` NÃO inclui `WORKFLOW` no `main` — pode significar que a portabilidade do workflow ainda não foi mesclada ou que a proteção contra expansão recursiva está faltando | Confirmar com o autor do PR do workflow (LaZzyMan = eu mesmo) que a proteção chega com o PR #4732, não nesta portabilidade                                         |
| R6  | O comportamento "árvore externa vence árvore interna" do projectSettings (Q5) é uma armadilha se espelhado                                                                                      | qwen-code escolhe **a mais interna vence** explicitamente; testado através da fixture R5                                                                          |
| R7  | O campo `color` está documentado como `@internal` no texto descritivo do binário — podemos estar portando algo que a Anthropic explicitamente não suporta                                        | Portá-lo, mas marcar como `@internal` também na documentação do qwen-code; tratar como apenas UI; não aparecer na documentação de referência voltada ao usuário   |
### Perguntas em aberto — resoluções propostas

| #   | Pergunta                                                                                                                                                       | Resolução                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | A omissão de `color` da #4821 é intencional?                                                                                                                  | **Tratar como intencional**. Transportar o campo; NÃO mencionar na documentação voltada ao usuário, exceto como "disponível, interno".                                                                                                                                                                                                                                            |
| Q2  | Comportamento leniente do DL7: documentar ou hackear?                                                                                                                       | **Espelhar**. Aceitar `background: "true"`, `maxTurns: "5"`, `effort: "med"` para paridade, mesmo que não documentado. Adicionar testes.                                                                                                                                                                                                                                |
| Q3  | Por que o enum de isolamento difere entre o esquema de agente e o esquema de sessão em segundo plano?                                                                                 | **Documentar a divergência em comentário de código**; "sem isolamento" = campo omitido, não um valor de enum.                                                                                                                                                                                                                                                          |
| Q4  | O `--agents <json>` (plural, flagSettings) deve ser incluído na v1?                                                                                                    | **Adiar para P4**. Superfície CLI para usuários avançados; v1 só entrega `--agent <nome>` (singular), que é o que #4821 considera.                                                                                                                                                                                                                                 |
| Q5  | Precedência da árvore interna vs externa para `.qwen/agents/` aninhados?                                                                                                | **A mais interna vence**. Substituir o comportamento acidental de "a mais externa vence" do Claude Code. Fixture de teste em P1.                                                                                                                                                                                                                                                          |
| Q6  | Precedência de `tools` vs `disallowedTools`: #4821 diz "ignorado se tools estiver definido"; #4721 diz "união com o piso do workflow"                                          | **O registro são dados burros**. O parser preserva ambos os campos independentemente. As regras de precedência residem no local de despacho (ferramenta do agente / workflow). Resolve a contradição.                                                                                                                                                                                   |
| Q7  | Forma canônica do nome da ferramenta para o piso de disallowedTools do workflow — verificado contra o PR #4732 como `ToolNames.SEND_MESSAGE`, `ToolNames.EXIT_PLAN_MODE`            | **Não é preocupação deste PR** — de responsabilidade do PR do workflow. Documentar apenas na matriz de coordenação.                                                                                                                                                                                                                                                              |
| Q8  | A resolução de fechamento da #2409 afeta algo?                                                                                                                   | **Herdar a orientação da #2409 de "promover model + maxTurns para o nível superior"**. Já incorporado neste plano.                                                                                                                                                                                                                                                      |
| Q9  | Os agentes de nível `extension` na precedência existente de `SubagentLevel` do qwen-code devem permanecer acima de `builtin` (atual) ou abaixo (Claude Code não tem equivalente)? | **Manter `extension > builtin`**. Extensões são instaladas pelo usuário; built-ins são padrão do fornecedor. O instalado pelo usuário vence.                                                                                                                                                                                                                                        |
| Q10 | As issues #4821, #4721, #4732 estão totalmente especificadas para o contrato que este documento propõe?                                                                             | **Publicar um comentário de coordenação na #4821** vinculando este documento, resumindo as decisões campo por campo, e pedindo que os mantenedores confirmem: (a) paridade de esquema com os 16 campos do Claude Code 2.1.168, (b) ponte D7 `permissionMode`/`approvalMode`, (c) ordem de precedência D2, (d) resolução da contradição `tools`/`disallowedTools` como dados burros do registro. |

### Itens de ação de coordenação

| #   | Ação                                                                       | Onde                                                |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Publicar resumo campo por campo + 5 decisões na #4821 para confirmação dos mantenedores        | comentário na #4821                                     |
| A2  | Vincular este documento cruzadamente a partir da #4721 mencionando a matriz da Fase 3                         | comentário na #4721                                     |
| A3  | Assim que o P1 desta portabilidade for entregue, notificar #4732 para migrar para um resolvedor mais rico          | comentário no PR #4732 (quando estiver pronto)                     |
| A4  | Reexecutar strings-grep na próxima versão menor do Claude Code para detecção de desvio de esquema       | trabalho cron da skill `feature-reverse` (manual até então) |