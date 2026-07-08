# Substituição do parser YAML — descobertas da pesquisa

Documento de design interno para substituir o parser YAML implementado manualmente de 192 linhas em
`packages/core/src/utils/yaml-parser.ts` por uma biblioteca real, para que os campos
diferidos `mcpServers` e `hooks` do schema declarative-agent do Claude Code possam
fazer round-trip com segurança pelos caminhos de código de subagent / skill / converter.

Documento complementar ao [`docs/design/declarative-agents-port.md`](./declarative-agents-port.md).
Issue: [#4821](https://github.com/QwenLM/qwen-code/issues/4821). Pré-requisito para
a continuação do [PR #4842](https://github.com/QwenLM/qwen-code/pull/4842).

## Fase 0 — Fontes verificadas

| Fonte                                                  | Versão / Data                         | Por que é autoridade                                                                                                               |
| ------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                  | snapshot mais antigo do CC (pré-2.1.168)        | fonte direta — wrapper de 15 linhas que nomeia a biblioteca                                                                          |
| `~/code/claude-code/src/utils/frontmatterParser.ts`     | mesmo snapshot                          | fonte direta — divisor de frontmatter de 370 linhas + recuperação em 2 passos                                                                 |
| `/private/tmp/cc-2.1.168/claude.strings`                | extraído do CC 2.1.168              | autoridade para o comportamento atual — as strings contêm nomes de símbolos ofuscados, mas carregam o schema JSON e o texto das mensagens de erro   |
| `packages/core/src/utils/yaml-parser.ts` (este repositório)    | HEAD de `lazzy/gifted-hamilton-684741` | o parser que está sendo substituído                                                                                                       |
| probes `node -e` ao vivo contra `yaml@2.8.1` nesta árvore | 2026-06-08                             | comportamento de segurança empírico — âncoras, merge keys, `!!js/function`, billion-laughs, `maxAliasCount` (resultados inline na Fase 4) |

Rótulos de confiança: **C** confirmado por evidência direta; **I** inferido de
múltiplos fatos confirmados; **O** questão em aberto.

## Fase 1 — Qual biblioteca YAML o CC usa?

**Resposta: [`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml), e NÃO
`js-yaml`.** Confirmado pela leitura de `~/code/claude-code/src/utils/yaml.ts`
ipsis litteris:

```ts
export function parseYaml(input: string): unknown {
  if (typeof Bun !== 'undefined') {
    return Bun.YAML.parse(input);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('yaml') as typeof import('yaml')).parse(input);
}
```

- **Biblioteca**: pacote npm `yaml`. **C**
- **API**: `.parse(input)` no nível superior. Usa o schema padrão do pacote (que
  é o `core` do YAML 1.2 — superconjunto de JSON, sem extensões JS). **C**
- **Atalho do Bun**: ao executar no Bun, o CC usa `Bun.YAML.parse()` para
  evitar empacotar ~270 KB de parser YAML. **C** Não relevante para o qwen-code
  (não temos o runtime do Bun como alvo).
- **Modo de schema**: NÃO definido explicitamente em nenhum lugar no CC. Depende do
  comportamento padrão do pacote `yaml`, mais a validação com zod na camada do consumidor
  (`DL7`, `gS8`, `TKO`/`_u` conforme `docs/design/declarative-agents-port.md`). **C**

### Por que `yaml` em vez de `js-yaml`

| Dimensão                | `js-yaml` 4.x                                                                              | `yaml` (eemeli) 2.x                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Schema padrão           | `DEFAULT_SAFE_SCHEMA` (desde a 4.x) — seguro; versões mais antigas tinham `DEFAULT_FULL_SCHEMA` com JS | `core` (especificação YAML 1.2) — apenas tipos JSON             |
| Tag `!!js/function`      | NÃO suportada na 4.x (existia na 3.x)                                                          | Nunca suportada                                      |
| Proteção contra billion-laughs     | Nenhuma (responsabilidade manual)                                                               | Padrão embutido `maxAliasCount: 100`                |
| Merge keys (`<<`)        | Suportadas (é necessário desativar via `MERGE_SCHEMA` ou filtragem)                                   | Desabilitadas por padrão, opt-in via `{ merge: true }`    |
| Já é uma dependência do qwen-code? | `js-yaml@4.1.1` ✓                                                                          | `yaml@2.8.1` ✓ (já importado pelo `skill-manager`) |

Ambas são escolhas razoáveis em 2026, mas **o briefing original da tarefa
recomendava o `FAILSAFE_SCHEMA` / `CORE_SCHEMA` do `js-yaml`**. Estamos nos desviando
dessa orientação por três motivos concretos:

1. **Paridade com o CC**. O objetivo de portar o schema de frontmatter do CC é
   permitir que os usuários coloquem um arquivo de agente do CC em `.qwen/agents/` e
   tenham ele parseado de forma idêntica. Usar o mesmo parser que o CC usa minimiza
   divergências em construções YAML de casos extremos (streams de múltiplos documentos,
   escalares flow vs block, tratamento de tags).
2. **`yaml` já é um usuário direto dentro de `skill-manager.ts`** — veja
   `packages/core/src/skills/skill-manager.ts:13` (`import * as yaml from 'yaml'`).
   Padronizar em `yaml` elimina uma das duas pilhas YAML duplicadas no
   mesmo pacote. **C** (resultado do grep documentado na Fase 6).
3. **Padrões mais seguros que o `js-yaml`**. O `maxAliasCount` embutido do `yaml` bloqueia
   billion-laughs sem configuração manual; merge keys são desabilitadas por padrão;
   tags arbitrárias se tornam strings literais com um `YAMLWarning` em vez de
   acionar resolvedores chamáveis. Evidência empírica na Fase 4.

Se um mantenedor futuro quiser remover a dependência do `yaml` e unificar no
`js-yaml`, a migração é mecânica: substitua `yaml.parse` / `yaml.stringify`
por `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump`. As
duas bibliotecas concordam na saída para o subconjunto de 100% que o CC e o qwen-code
realmente usam (pares chave-valor, listas, mapas aninhados, booleanos/números escalares).
Registre essa decisão separadamente caso surja.

## Fase 2 — Pipeline de parsing de frontmatter (CC)

`~/code/claude-code/src/utils/frontmatterParser.ts` tem 370 linhas. Principais
descobertas:

| Etapa                | Lógica                                                                                                                     | Fonte                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Correspondência do delimitador     | Regex `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — abre na coluna 0, o corpo é non-greedy, o `---` de fechamento deve estar em sua própria linha   | `frontmatterParser.ts:~123` (números de linha do snapshot antigo; trate como aproximado) **C**                      |
| Parse da Passagem 1        | Chama `parseYaml(body)`. Se sucesso → retorna o objeto parseado + o restante do conteúdo.                                            | mesmo arquivo, topo do bloco try **C**                                                                             |
| Recuperação da Passagem 2     | Em `YAMLException`, percorre as linhas, coloca aspas automaticamente em valores que parecem datas/colons/especiais, tenta `parseYaml` mais uma vez.           | linhas ~85–121 no snapshot antigo **C** (normalização de `tab → 2 spaces`, heurística de data ISO, armadilha de colon)          |
| Falha com fallthrough | Ambas as passagens falharam → loga via `logForDebugging`, retorna `{ data: {}, content: text }`. O agente carrega com frontmatter vazio. | fim da função **C**                                                                                         |
| Telemetria           | Encapsulado mais acima no fluxo — os eventos `tengu_frontmatter_shadow_unknown_key` / `_mismatch` são disparados de `ug5.agent` (schema Ig5) | `claude.strings:308120`, `309074`, `309076` (citado cruzadamente em `docs/design/declarative-agents-port.md` Fase 1) |

**Implicação para o qwen-code**: NÃO precisamos clonar a recuperação em 2 passos.
O `subagent-manager.ts` do qwen-code já impõe uma semântica mais estrita de "lançar exceção
em frontmatter malformado no nível superior" para seu carregador (veja `parseSubagentContent`),
e a recuperação em 2 passos está lá especificamente para perdoar arquivos de agente do CC
antigos e editados manualmente. Portar uma postura mais estrita é aceitável; só precisamos
**não travar o carregador inteiro** quando campos aninhados estiverem malformados. Veja a
Fase 5 para a postura warn-and-drop.

## Fase 3 — Validação aninhada via zod (CC)

Os validadores relevantes do CC conforme a Fase 1 de `docs/design/declarative-agents-port.md` +
verificação cruzada de strings binárias:

### `mcpServers` (símbolo do CC `gS8` / JSON-shadow `jL7`)

```
mcpServers: z.union([
  z.string(),                                            // server name reference
  z.record(z.string(), McpServerConfigSchema()),         // inline { name: spec }
])
```

`McpServerConfigSchema()` (da ref `claude.strings:124–135`) é uma
**união discriminada** sobre `type`:

| `type`             | Campos obrigatórios                      | Notas                                              |
| ------------------ | ------------------------------------ | -------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]` | Mais `env?: Record<string,string>`, `cwd?: string` |
| `"sse"`            | `url: string`                        | Mais `headers?: Record<string,string>`             |
| `"http"`           | `url: string`                        | Mais `headers?`, `method?`                         |
| `"websocket"`      | `url: string`                        | paridade com qwen-code desconhecida — adiar até que seja necessário      |
| `"sdk"`            | varia                               | Uso interno do CC; NÃO precisamos dar suporte         |
| `"claudeai-proxy"` | varia                               | Uso interno do CC; NÃO precisamos dar suporte         |

**Para o qwen-code v1**: validar como `Record<string, unknown>` (leniente,
estilo DL7), e deixar o merge downstream em `Config.getMcpServers()` fazer a
coerção de forma. O `qwen-code` já tem a classe `MCPServerConfig` com
discriminação de `type` — reutilizamos esse conversor em vez de duplicar o
schema do zod. Veja a Fase 4 do plano de runtime-wiring em
`docs/design/declarative-agents-port.md`.

### `hooks` (símbolo do CC `TKO` / `_u`)

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig (discriminated union on `type`):
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

As chaves de hook-event, conforme a verificação cruzada das strings, são o mesmo
conjunto que o qwen-code já suporta: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`,
`Notification` — além de alguns eventos exclusivos do qwen (`TodoCreated`, `TodoCompleted`)
que o CC não tem.

**Para o qwen-code v1**: validar como `Record<string, unknown>` (leniente), e
então passar para os validadores existentes do `SessionHooksManager` do qwen-code, que
já implementam a forma `HookDefinition[]` por evento (veja
`packages/core/src/hooks/types.ts:207–211` conforme o mapeamento de runtime da Fase 1).

### Por que ambos os validadores são `z.unknown()` no nível shadow `Ig5`

`Ig5` é o **schema shadow de telemetria** — ele dispara eventos
`tengu_frontmatter_shadow_unknown_key` quando uma chave YAML não está no conjunto
conhecido, e eventos `_mismatch` quando uma chave conhecida tem o tipo errado. Ele
usa deliberadamente `z.unknown()` para `mcpServers` e `hooks` porque
**`Ig5` é executado no momento do PARSE** e emitiria eventos de mismatch espúrios
para cada especificação inline de mcpServers. A validação real é delegada a:

- `gS8` (para `mcpServers`) — chamado **no momento do registro do agente** a partir
  do `safeParse` por item do `DL7`
- `TKO` (para `hooks`) — chamado **no momento do disparo do hook** a partir do `_u().safeParse`
Essa **validação preguiçosa** (lazy validation) é o modelo que o qwen-code deve imitar: manter o parser de frontmatter permissivo (equivalente a `z.unknown()` no TS) e validar no ponto de uso. Tentar trazer a árvore completa do zod para o `SubagentConfig` nos forçaria a importar também a classe `MCPServerConfig` e o tipo `HookDefinition` do qwen para uma camada onde eles não residem atualmente, e nos exigiria inventar validadores falsos para `type: 'sdk'` / `type: 'claudeai-proxy'`, os quais não suportamos de fato.

## Fase 4 — Postura de segurança

Verificação empírica dos padrões do `yaml@2.8.1` nesta árvore do qwen-code:

### Resultados da sondagem

```
$ node -e "const y=require('yaml'); console.log(y.parse('a: 1').constructor.name, y.parseDocument('a: 1').schema?.name)"
Object core
```

→ o schema padrão é `'core'` (superconjunto JSON do YAML 1.2). **C**

```
$ node -e "const y=require('yaml'); console.log(y.parse('!!js/function \"function(){}\"'))"
function(){}
(node:18525) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: tag:yaml.org,2002:js/function
```

→ a tag `!!js/function` NÃO é executada. O valor é resolvido como a **string
literal** `"function(){}"` (não um objeto de função chamável) e emite um
`YAMLWarning` não fatal. Um adversário não pode alcançar RCE por meio desse vetor. **C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ a expansão de alias / billion-laughs é REJEITADA **por padrão**. A biblioteca
vem com `maxAliasCount: 100` (o parse com falha conta 1+10+100 = 111
aliases). **C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ a merge key (`<<`) é interpretada como uma **string de chave literal** por padrão, NÃO
expandida. O parser de `<<` é opt-in via `{ merge: true }`. Nós NÃO
o habilitaremos. **C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ mcpServers aninhados no formato CC são interpretados corretamente em um
objeto/array profundamente aninhado. **C**

### Resumo de segurança

| Vetor                          | Padrão do `yaml@2.8.1`            | Ação necessária no qwen-code                           |
| ------------------------------ | --------------------------------- | ------------------------------------------------------ |
| Execução arbitrária de JS      | Impossível — sem eval             | Nenhuma                                                |
| Tag `!!js/function`            | Vira string literal + warning     | Nenhuma                                                |
| Billion laughs                 | Rejeitado (`maxAliasCount: 100`)  | Nenhuma — manter o padrão                              |
| Merge keys (`<<`)              | Tratada como chave literal        | Nenhuma — manter o padrão (NÃO passar `merge: true`)   |
| Anchors / aliases (uso normal) | Permitido, útil para dados no formato CC | Nenhuma                                           |
| Tags desconhecidas arbitrárias | String + `YAMLWarning`            | Opcionalmente redirecionar warnings para um logger (ver Fase 6) |

**Conclusão**: o comportamento padrão do pacote `yaml` já é mais seguro do que
o que o brief da tarefa original pedia via `FAILSAFE_SCHEMA` do `js-yaml`. Nenhuma
chamada de bloqueio de schema é necessária.

## Fase 5 — Semântica de recuperação

O CC escolhe **aviso e descarte gracioso** (graceful warn-and-drop) em todas as camadas:

1. O parser YAML lança exceção → o parser de frontmatter registra no log + retorna `{}` (dados vazios)
2. O campo tem a forma errada (ex.: `mcpServers: "this is a string"`) → `safeParse`
   falha → o campo é descartado da configuração emitida
3. O campo tem uma forma _quase_ errada (ex.: um item individual de `mcpServers` é uma
   string quando o schema espera um objeto) → o `safeParse` por item descarta apenas
   esse item e mantém o resto

O qwen-code já implementa a postura de aviso e descarte por campo para
`permissionMode`, `maxTurns`, `color`, `effort` (veja
`packages/core/src/subagents/agent-frontmatter-schema.ts`). Estendemos o mesmo
padrão para `mcpServers` e `hooks`.

O que NÃO clonamos do CC:

- **Recuperação YAML em 2 passos com aspas automáticas**. Isso é peso morto para o
  qwen-code — somos um projeto novo, sem arquivos de frontmatter legados editados manualmente
  para perdoar. Um erro limpo é mais útil do que uma reinterpretação suposta.
- **Eventos de telemetria `tengu_*`**. Substituídos pelo próprio logger do qwen-code /
  qualquer camada de telemetria que o restante do loader use.

## Fase 6 — Recomendação para o qwen-code

### Escolha da biblioteca

- **Use `yaml@^2.8.1`** (já é uma dependência transitiva — promova para uma dependência
  direta em `packages/core/package.json` para não quebrarmos sob modos de resolução mais estritos;
  também nos permite fixar a versão major).
- **Use o schema padrão** (`core`), sem flag de schema.
- **Não** passe `{ merge: true }`. Não habilite nenhuma opção fora do padrão.
- Para uma saída de stringify determinística (snapshots de teste), passe
  `{ lineWidth: 0, defaultStringType: 'PLAIN' }` para `yaml.stringify` para que a
  biblioteca não quebre linhas longas ou mude arbitrariamente para aspas de bloco escalar
  com base no comprimento do conteúdo.

### Superfície de API a ser preservada

O atual `packages/core/src/utils/yaml-parser.ts` exporta:

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

A substituição mantém ambas as assinaturas **idênticas**, de modo que os 5 chamadores
(`subagent-manager.ts`, `claude-converter.ts`, `rulesDiscovery.ts`,
`skill-manager.ts`, `skill-load.ts`) e a re-exportação do `index.ts` não exigem
nenhuma alteração no ponto de chamada.

Esboço da implementação:

```ts
import * as yaml from 'yaml';

export function parse(yamlString: string): Record<string, unknown> {
  const parsed = yaml.parse(yamlString);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string {
  return yaml.stringify(obj, {
    lineWidth: options?.lineWidth ?? 0,
    minContentWidth: options?.minContentWidth ?? 20,
  });
}
```

**Por que converter top-levels não-objeto para `{}`**: todo chamador existente assume um
record. Um arquivo YAML que é interpretado como `null` (arquivo vazio), `["foo"]` (uma lista)
ou `"hello"` (um escalar simples) atualmente faria o destructuring downstream falhar.
Retornar `{}` preserva o comportamento do antigo parser feito à mão para as mesmas
entradas. Documente isso como uma salvaguarda deliberada em um comentário de uma linha.

### Chamadores que não precisam de alterações

| Arquivo                                              | Uso                                                                  | Compatível?                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/core/src/index.ts:360`                     | re-exporta `*` de yaml-parser                                        | sim — mesmos nomes                                                       |
| `packages/core/src/subagents/subagent-manager.ts:15` | `parse`, `stringify`                                                 | sim                                                                      |
| `packages/core/src/extension/claude-converter.ts:26` | `parse`, `stringify`                                                 | sim — o round-trip agora é seguro para `mcpServers` + `hooks` (ver Fase 3) |
| `packages/core/src/utils/rulesDiscovery.ts:20`       | `parse as parseYaml`                                                 | sim                                                                      |
| `packages/core/src/skills/skill-manager.ts:13`       | `parse as parseYaml` (e `import * as yaml from 'yaml'` separadamente)| sim — e o `import * as yaml` duplicado pode ser removido em um follow-up |
| `packages/core/src/skills/skill-load.ts:11`          | `parse as parseYaml`                                                 | sim                                                                      |

### Fixtures de teste necessários

Três snippets YAML concretos nos quais o parser feito à mão atual falha
e a substituição deve lidar (um para cada formato aninhado):

```yaml
# Fixture 1 — mcpServers (record de records)
mcpServers:
  filesystem:
    type: stdio
    command: node
    args:
      - /path/to/server.js
    env:
      DEBUG: '1'
  github:
    type: http
    url: https://mcp.example.com/github
    headers:
      Authorization: 'Bearer xxx'
```

```yaml
# Fixture 2 — hooks (record de arrays de records, dois níveis de aninhamento sob o nome do evento)
hooks:
  PreToolUse:
    - matcher: 'Read|Write'
      hooks:
        - type: command
          command: echo before
          timeout: 5000
  PostToolUse:
    - matcher: '*'
      hooks:
        - type: command
          command: echo after
```

```yaml
# Fixture 3 — misto raso + profundo, além de tudo o que o PR #4842 já suporta
name: agent-x
description: test
permissionMode: acceptEdits
maxTurns: 5
color: cyan
tools:
  - Read
  - Write
mcpServers:
  filesystem:
    type: stdio
    command: node
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: log
```

### Testes que devem mudar

O `packages/core/src/utils/yaml-parser.test.ts` tem 2 "pin tests" na
parte inferior (linhas 200–227) intitulados `known limitations — nested YAML (pin until
js-yaml lands)`. A substituição DEVE convertê-los em asserções de parsing aninhado
de forma positiva:

```ts
it('parses array-of-records', () => {
  const yaml =
    'mcpServers:\n  - filesystem:\n      type: stdio\n      command: node';
  expect(parse(yaml)).toEqual({
    mcpServers: [{ filesystem: { type: 'stdio', command: 'node' } }],
  });
});

it('parses record-of-records', () => {
  const yaml = 'hooks:\n  PreToolUse:\n    - matcher: Read';
  expect(parse(yaml)).toEqual({
    hooks: { PreToolUse: [{ matcher: 'Read' }] },
  });
});
```

Essas duas asserções mais os três fixtures acima são o **portão de aceitação**
para a Fase 2 do plano de implementação. Qualquer outra coisa (casos extremos de escape,
booleans com ou sem aspas, strings numéricas) é cobertura de regressão da suite de testes
existente e deve passar inalterada.

### Verificação de paridade de round-trip

O teste existente `should maintain round-trip integrity for escaped strings`
(linhas 111-129) exercita 7 strings através de `stringify → parse`. O `stringify`
padrão do `yaml` produz uma saída ligeiramente diferente do formatador feito à mão
(aspas mais agressivas em alguns casos, sequências de escape diferentes).
Dois resultados aceitáveis:

1. **Ajustar os fixtures de teste** para asserir o comportamento sob o novo parser
   — a propriedade de round-trip (`parse(stringify(x)) === x`) é o que importa,
   não a saída YAML idêntica byte a byte.
2. **Manter as asserções idênticas byte a byte** e deixá-las falhar visivelmente,
   depois atualizá-las para refletir a saída do `yaml` literalmente. Mais fácil de revisar
   o diff.

Recomendação: **opção 1** — mudar as asserções para baseadas em propriedade
(`expect(parse(stringify(obj))).toEqual(obj)`), já que a saída YAML idêntica byte a byte
não é um contrato documentado do módulo.

### Breaking changes para chamadores — nenhum esperado, mas verifique

- O `subagent-manager.ts` serializa novamente o objeto interpretado de volta para YAML para
  o caminho `saveSubagent`. Com o novo parser, `mcpServers` e `hooks`
  farão round-trip de forma limpa. Atualize `NESTED_FIELDS_NOT_ROUND_TRIPPABLE` em
  `claude-converter.ts` (Fase 3 da implementação) para remover esses
  dois nomes de campos.
- O `skill-manager.ts` já importa `yaml` diretamente (separado do
  parser feito à mão). Uma vez que `yaml-parser.ts` também estiver usando `yaml`, a
  importação duplicada pode ser removida como um pequeno follow-up — fora do escopo aqui.
### Risco de migração

Baixo. As 5 funções chamadoras desestruturam um `Record<string, unknown>` — mesmo tipo de retorno. Os 2 testes de pin deliberadamente "corrompidos" (garbles) são as únicas falhas esperadas; eles são conhecidos e os invertemos de propósito. Uma cobertura de regressão mais ampla vem das suites de testes existentes em `packages/core/src/subagents/`, `packages/core/src/skills/` e `packages/core/src/extension/`.

## Questões em aberto

| #   | Questão                                                                                                                                              | Bloqueante?                                                               | Caminho de resolução                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | O `yaml.parse` precisa de um logger explícito para redirecionar `YAMLWarning` (ex.: `Unresolved tag`) para o logger do qwen-code em vez de `process.emitWarning`?  | Não — adiar                                                              | Se os logs ficarem muito verbosos no CI, passe `{ logLevel: 'silent' }` ou um callback `onWarning` personalizado. Não é crítico para a v1.                                                      |
| Q2  | O `parse()` deve continuar retornando `{}` para YAML de string vazia / documento nulo, ou lançar um erro?                                                             | Não — preservar comportamento atual                                          | A implementação manual atual retorna `{}`; mantemos isso. Adicionar um teste de regressão fixando essa escolha.                                                                               |
| Q3  | Quando `mcpServers` estiver malformado no nível superior (ex.: `mcpServers: "string"`), o agente inteiro deve falhar ao carregar ou carregar descartando esse campo? | Sim — direciona a postura de avisar-e-descartar na Fase 3 da implementação | **Resolução**: descartar o campo, emitir um aviso no console (paridade com o CC `DL7` conforme a Fase 3 de `docs/design/declarative-agents-port.md`).                                  |
| Q4  | O mesmo que Q3, mas para `hooks`: descartar o campo, o evento ou apenas o matcher individual?                                                                | Sim — direciona a postura de avisar-e-descartar                                  | **Resolução**: descartar todo o campo `hooks` em caso de falha na estrutura no nível superior. A granularidade por evento / por matcher é adiada para um PR futuro se um usuário real demonstrar necessidade. |
| Q5  | O atalho `Bun.YAML.parse` do helper do CC se aplica ao qwen-code?                                                                               | Não                                                                      | O qwen-code não tem como alvo o runtime Bun. Ignorar.                                                                                                                            |

---

**Status**: pesquisa concluída, pronto para implementar a Fase 2 (substituir
`yaml-parser.ts`) e a Fase 3 (reexpor `mcpServers` + `hooks` em
`SubagentConfig`) conforme `docs/design/declarative-agents-port.md`.