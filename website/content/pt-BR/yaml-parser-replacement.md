# Substituição do parser YAML — resultados da pesquisa

Documento de design interno para substituir o parser YAML artesanal de 192 linhas em
`packages/core/src/utils/yaml-parser.ts` por uma biblioteca real, para que os campos
deferidos `mcpServers` e `hooks` do esquema de agente declarativo do Claude Code possam
fazer round-trip com segurança através dos caminhos de código de subagente / skill / conversor.

Complementar a [`docs/declarative-agents-port.md`](./declarative-agents-port.md).
Issue: [#4821](https://github.com/QwenLM/qwen-code/issues/4821). Pré-requisito para
o follow-up do [PR #4842](https://github.com/QwenLM/qwen-code/pull/4842).

## Fase 0 — Fontes verificadas

| Fonte                                                   | Versão / Data                         | Por que é autoritativa                                                                                                          |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                  | snapshot CC antigo (pré-2.1.168)      | fonte direta — wrapper de 15 linhas que nomeia a biblioteca                                                                     |
| `~/code/claude-code/src/utils/frontmatterParser.ts`     | mesmo snapshot                        | fonte direta — divisor de frontmatter de 370 linhas + recuperação em 2 passagens                                                |
| `/private/tmp/cc-2.1.168/claude.strings`                | extraído do CC 2.1.168                | autoritativo para o comportamento atual — strings carregam nomes de símbolos ofuscados, mas contêm o esquema JSON e texto de mensagens de erro |
| `packages/core/src/utils/yaml-parser.ts` (este repositório) | HEAD de `lazzy/gifted-hamilton-684741` | o parser sendo substituído                                                                                                      |
| Sondagens `node -e` ao vivo contra `yaml@2.8.1` nesta árvore | 2026-06-08                            | comportamento empírico de segurança — âncoras, chaves de merge, `!!js/function`, billion-laughs, `maxAliasCount` (resultados inline na Fase 4) |

Rótulos de confiança: **C** confirmado por evidência direta; **I** inferido a partir de
múltiplos fatos confirmados; **O** questão em aberto.

## Fase 1 — Qual biblioteca YAML o CC usa?

**Resposta: [`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml), NÃO
`js-yaml`.** Confirmado pela leitura literal de `~/code/claude-code/src/utils/yaml.ts`:

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
- **API**: `.parse(input)` de nível superior. Usa o esquema padrão do pacote (que
  é YAML 1.2 `core` — superset de JSON, sem extensões JS). **C**
- **Atalho do Bun**: quando executado sob Bun, o CC usa `Bun.YAML.parse()` para
  evitar empacotar ~270 KB de parser YAML. **C** Não relevante para o qwen-code
  (não temos como alvo runtime Bun).
- **Modo de esquema**: NÃO definido explicitamente em lugar nenhum no CC. Depende do
  comportamento padrão do pacote `yaml`, mais a validação zod na camada consumidora
  (`DL7`, `gS8`, `TKO`/`_u` conforme `docs/declarative-agents-port.md`). **C**

### Por que `yaml` em vez de `js-yaml`

| Dimensão                | `js-yaml` 4.x                                                                              | `yaml` (eemeli) 2.x                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Esquema padrão          | `DEFAULT_SAFE_SCHEMA` (desde 4.x) — seguro; versões antigas tinham `DEFAULT_FULL_SCHEMA` com JS | `core` (especificação YAML 1.2) — apenas tipos JSON  |
| Tag `!!js/function`     | NÃO suportada no 4.x (existia no 3.x)                                                      | Nunca suportada                                      |
| Proteção billion-laughs | Nenhuma (responsabilidade manual)                                                           | Padrão embutido `maxAliasCount: 100`                 |
| Chaves de merge (`<<`)  | Suportado (deve optar por sair via `MERGE_SCHEMA` ou filtragem)                             | Desabilitado por padrão, opt-in via `{ merge: true }` |
| Já é dependência do qwen-code? | `js-yaml@4.1.1` ✓                                                                          | `yaml@2.8.1` ✓ (já importado por `skill-manager`) |

Ambas são escolhas razoáveis em 2026, mas **o briefing original da tarefa
recomendava `FAILSAFE_SCHEMA` / `CORE_SCHEMA` do `js-yaml`**. Estamos nos desviando
dessa orientação por três motivos concretos:

1. **Paridade com CC**. O objetivo principal de portar o esquema de frontmatter do CC é
   permitir que usuários coloquem um arquivo de agente do CC em `.qwen/agents/` e o vejam
   ser analisado de forma idêntica. Usar o mesmo parser que o CC usa minimiza divergência
   em construções YAML de borda (fluxos com múltiplos documentos, escalares flow vs block,
   tratamento de tags).
2. **`yaml` já é um usuário direto dentro de `skill-manager.ts`** — veja
   `packages/core/src/skills/skill-manager.ts:13` (`import * as yaml from 'yaml'`).
   Padronizar em `yaml` elimina uma das duas pilhas YAML duplicadas no
   mesmo pacote. **C** (resultado de grep documentado na Fase 6).
3. **Padrões mais seguros que `js-yaml`**. O `maxAliasCount` embutido do `yaml` bloqueia
   billion-laughs sem configuração manual; chaves de merge são desabilitadas por
   padrão; tags arbitrárias se tornam strings literais com um `YAMLWarning` em vez
   de acionar resolvedores executáveis. Evidência empírica na Fase 4.

Se um mantenedor futuro quiser remover a dependência `yaml` e unificar em
`js-yaml`, a migração é mecânica: substituir `yaml.parse` / `yaml.stringify`
por `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump`. As
duas bibliotecas concordam na saída para o subconjunto de 100% que CC e qwen-code
realmente usam (pares chave-valor, listas, mapas aninhados, booleanos/números escalares).
Acompanhe essa decisão separadamente se surgir.

## Fase 2 — Pipeline de análise de frontmatter (CC)

`~/code/claude-code/src/utils/frontmatterParser.ts` tem 370 linhas. Principais
descobertas:

| Passo               | Lógica                                                                                                                    | Fonte                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Correspondência do delimitador | Regex `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — abre na coluna 0, corpo é non-greedy, `---` de fechamento deve estar em sua própria linha | `frontmatterParser.ts:~123` (números de linha do snapshot antigo; tratar como aproximados) **C**      |
| Análise Passo 1     | Chamar `parseYaml(body)`. Se sucesso → retornar objeto analisado + resto do conteúdo.                                     | mesmo arquivo, topo do bloco try **C**                                                                |
| Recuperação Passo 2 | Em `YAMLException`, percorrer linhas, adicionar aspas automaticamente em valores que parecem datas/dois-pontos/especiais, tentar `parseYaml` novamente uma vez. | linhas ~85–121 no snapshot antigo **C** (normalização `tab → 2 espaços`, heurística de data ISO, armadilha de dois-pontos) |
| Fallback de falha   | Ambas as passagens falharam → registrar via `logForDebugging`, retornar `{ data: {}, content: text }`. Agente carrega com frontmatter vazio. | final da função **C**                                                                                 |
| Telemetria          | Envolvida mais acima — eventos `tengu_frontmatter_shadow_unknown_key` / `_mismatch` são disparados a partir de `ug5.agent` (esquema Ig5) | `claude.strings:308120`, `309074`, `309076` (referenciado em `docs/declarative-agents-port.md` Fase 1) |

**Implicação para qwen-code**: NÃO precisamos clonar a recuperação de 2 passagens.
O `subagent-manager.ts` do qwen-code já impõe uma semântica mais rigorosa de "lançar erro em frontmatter malformado no nível superior" para seu carregador (veja `parseSubagentContent`),
e a recuperação de 2 passagens existe especificamente para perdoar arquivos de agente CC antigos editados manualmente. Portar uma postura mais restritiva é aceitável; só precisamos **não quebrar todo o carregador** quando campos aninhados estão malformados. Veja a Fase 5 para a postura de alertar-e-ignorar.

## Fase 3 — Validação aninhada via zod (CC)

Os validadores CC relevantes conforme `docs/declarative-agents-port.md` Fase 1 +
verificação cruzada de strings binárias:

### `mcpServers` (símbolo CC `gS8` / shadow JSON `jL7`)

```
mcpServers: z.union([
  z.string(),                                            // referência por nome do servidor
  z.record(z.string(), McpServerConfigSchema()),         // inline { name: spec }
])
```

`McpServerConfigSchema()` (da referência `claude.strings:124–135`) é uma
**união discriminada** sobre `type`:

| `type`             | Campos obrigatórios                 | Notas                                               |
| ------------------ | ----------------------------------- | --------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]` | Mais `env?: Record<string,string>`, `cwd?: string`  |
| `"sse"`            | `url: string`                       | Mais `headers?: Record<string,string>`              |
| `"http"`           | `url: string`                       | Mais `headers?`, `method?`                          |
| `"websocket"`      | `url: string`                       | Paridade qwen-code desconhecida — adiar até necessário |
| `"sdk"`            | varia                               | Uso interno CC; NÃO precisamos suportar             |
| `"claudeai-proxy"` | varia                               | Uso interno CC; NÃO precisamos suportar             |

**Para qwen-code v1**: validar como `Record<string, unknown>` (leniente
estilo DL7), e deixar que a mesclagem downstream em `Config.getMcpServers()` faça a
coerção de forma. O `qwen-code` já tem a classe `MCPServerConfig` com
discriminação por `type` — reutilizamos esse conversor em vez de duplicar o
esquema zod. Veja a Fase 4 do plano de integração em tempo de execução em
`docs/declarative-agents-port.md`.

### `hooks` (símbolo CC `TKO` / `_u`)

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig (união discriminada em `type`):
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

As chaves de evento de hook, conforme verificação cruzada de strings, são o mesmo conjunto
que o qwen-code já suporta: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`,
`Notification` — mais alguns eventos exclusivos do qwen (`TodoCreated`, `TodoCompleted`)
que o CC não possui.

**Para qwen-code v1**: validar como `Record<string, unknown>` (leniente), então
passar para os validadores existentes do `SessionHooksManager` do qwen-code, que
já implementam a forma `HookDefinition[]` por evento (veja
`packages/core/src/hooks/types.ts:207–211` conforme o mapeamento de runtime da Fase 1).

### Por que ambos os validadores são `z.unknown()` no nível shadow `Ig5`

`Ig5` é o **esquema shadow de telemetria** — ele dispara
eventos `tengu_frontmatter_shadow_unknown_key` quando uma chave YAML não está no
conjunto conhecido, e eventos `_mismatch` quando uma chave conhecida tem o tipo errado. Ele
usa deliberadamente `z.unknown()` para `mcpServers` e `hooks` porque
**`Ig5` é executado no momento da ANÁLISE** e emitiria eventos de mismatch espúrios para
cada especificação inline de mcpServers. A validação real é delegada a:

- `gS8` (para `mcpServers`) — chamado **no momento do registro do agente** a partir
  de `DL7` com `safeParse` por item
- `TKO` (para `hooks`) — chamado **no momento da execução do hook** a partir de
  `_u().safeParse`

Essa **validação preguiçosa** é o modelo que o qwen-code deve imitar: manter o parser de
frontmatter permissivo (equivalente a `z.unknown()` em TS), validar no
ponto de uso. Tentar trazer toda a árvore zod para frente dentro de
`SubagentConfig` nos forçaria a também importar a classe `MCPServerConfig` do qwen
e o tipo `HookDefinition` para uma camada onde eles não vivem atualmente, e
exigiria que inventássemos validadores falsos para `type: 'sdk'` /
`type: 'claudeai-proxy'` que não suportamos de fato.

## Fase 4 — Postura de segurança

Verificação empírica dos padrões de `yaml@2.8.1` nesta árvore do qwen-code:

### Resultados das sondagens

```
$ node -e "const y=require('yaml'); console.log(y.parse('a: 1').constructor.name, y.parseDocument('a: 1').schema?.name)"
Object core
```

→ esquema padrão é `'core'` (superset JSON do YAML 1.2). **C**

```
$ node -e "const y=require('yaml'); console.log(y.parse('!!js/function \"function(){}\"'))"
function(){}
(node:18525) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: tag:yaml.org,2002:js/function
```

→ a tag `!!js/function` NÃO executa. O valor é resolvido para a **string literal**
`"function(){}"` (não um objeto de função executável), e emite um
`YAMLWarning` não fatal. Um adversário não pode obter RCE através deste vetor. **C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ expansão de alias / billion-laughs é REJEITADA **por padrão**. A biblioteca
vem com `maxAliasCount: 100` (a análise falhada conta 1+10+100 = 111
aliases). **C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ chave de merge (`<<`) é analisada como uma **chave string literal** por padrão, NÃO
expandida. O parser `<<` é opt-in via `{ merge: true }`. NÃO vamos
ativá-lo. **C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ mcpServers aninhados no formato CC são analisados corretamente em objeto/array
profundamente aninhado. **C**

### Resumo de segurança

| Vetor                          | Padrão `yaml@2.8.1`              | Ação necessária no qwen-code                              |
| ------------------------------ | -------------------------------- | --------------------------------------------------------- |
| Execução arbitrária de JS      | Impossível — sem eval            | Nenhuma                                                   |
| Tag `!!js/function`            | Torna-se string literal + aviso  | Nenhuma                                                   |
| Billion laughs                 | Rejeitado (`maxAliasCount: 100`) | Nenhuma — manter padrão                                   |
| Chaves de merge (`<<`)         | Tratado como chave literal       | Nenhuma — manter padrão (NÃO passar `merge: true`)        |
| Âncoras / aliases (uso normal) | Permitido, útil para dados estilo CC | Nenhuma                                                   |
| Tags arbitrárias desconhecidas | String + `YAMLWarning`            | Opcionalmente redirecionar avisos para um logger (ver Fase 6) |

**Conclusão**: o comportamento padrão do pacote `yaml` já é mais seguro do que
o que o briefing original da tarefa pedia via `FAILSAFE_SCHEMA` do `js-yaml`. Nenhuma
chamada de bloqueio de esquema é necessária.

## Fase 5 — Semântica de recuperação

O CC escolhe **ignorar graciosamente com aviso** em cada camada:

1. Parser YAML lança erro → parser de frontmatter registra + retorna `{}` (dados vazios)
2. Campo tem formato errado (ex.: `mcpServers: "this is a string"`) → `safeParse`
   falha → campo é removido da configuração emitida
3. Campo tem formato _quase_ errado (ex.: item individual de `mcpServers` é uma
   string quando o esquema espera um objeto) → `safeParse` por item remove apenas
   aquele item, mantém o restante

O qwen-code já implementa a postura de ignorar com aviso por campo para
`permissionMode`, `maxTurns`, `color`, `effort` (veja
`packages/core/src/subagents/agent-frontmatter-schema.ts`). Estendemos o mesmo
padrão para `mcpServers` e `hooks`.

O que NÃO clonamos do CC:

- **Recuperação YAML de 2 passagens com auto-aspas**. Isso é peso morto para
  o qwen-code — somos um projeto novo, sem arquivos de frontmatter legados editados manualmente
  para perdoar. Um erro limpo é mais útil que uma reinterpretação adivinhada.
- **Eventos de telemetria `tengu_*`**. Substituídos pelo próprio logger do qwen-code /
  qualquer camada de telemetria que o restante do carregador use.

## Fase 6 — Recomendação para qwen-code

### Escolha da biblioteca

- **Usar `yaml@^2.8.1`** (já é uma dependência transitiva — promover para dependência
  direta em `packages/core/package.json` para não quebrarmos sob modos de resolução
  mais estritos; também permite fixar a major).
- **Usar esquema padrão** (`core`), sem flag de esquema.
- **Não** passar `{ merge: true }`. Não habilitar nenhuma opção não padrão.
- Para saída determinística de stringify (snapshots de teste), passar
  `{ lineWidth: 0, defaultStringType: 'PLAIN' }` para `yaml.stringify` para que a
  biblioteca não quebre linhas longas ou mude arbitrariamente para citação block-scalar
  com base no comprimento do conteúdo.

### Superfície da API a preservar

As exportações atuais de `packages/core/src/utils/yaml-parser.ts`:

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

A substituição mantém ambas as assinaturas **idênticas** para que os 5 chamadores
(`subagent-manager.ts`, `claude-converter.ts`, `rulesDiscovery.ts`,
`skill-manager.ts`, `skill-load.ts`) e a re-exportação em `index.ts` exijam
zero alterações no local de chamada.

Esboço de implementação:

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

**Por que coagir níveis superiores não objeto para `{}`**: todo chamador existente assume um
record. Um arquivo YAML que é analisado para `null` (arquivo vazio), `["foo"]` (uma lista),
ou `"hello"` (um escalar puro) atualmente quebraria a desestruturação downstream.
Retornar `{}` preserva o comportamento do antigo parser artesanal nas mesmas
entradas. Documente isso como uma proteção deliberada em um comentário de uma linha.

### Chamadores que não precisam de alterações

| Arquivo                                              | Uso                                                                | Compatível?                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `packages/core/src/index.ts:360`                     | re-exporta `*` de yaml-parser                                      | sim — mesmos nomes                                                      |
| `packages/core/src/subagents/subagent-manager.ts:15` | `parse`, `stringify`                                               | sim                                                                     |
| `packages/core/src/extension/claude-converter.ts:26` | `parse`, `stringify`                                               | sim — round-trip agora é seguro para `mcpServers` + `hooks` (ver Fase 3)|
| `packages/core/src/utils/rulesDiscovery.ts:20`       | `parse as parseYaml`                                               | sim                                                                     |
| `packages/core/src/skills/skill-manager.ts:13`       | `parse as parseYaml` (e `import * as yaml from 'yaml'` separadamente) | sim — e o `import * as yaml` duplicado pode ser removido em um follow-up |
| `packages/core/src/skills/skill-load.ts:11`          | `parse as parseYaml`                                               | sim                                                                     |
### Test fixtures necessários

Três trechos YAML concretos que o atual parser manual não consegue processar
e que a substituição precisa tratar (um por formato aninhado):

```yaml
# Fixture 1 — mcpServers (registro de registros)
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
# Fixture 2 — hooks (registro de arrays de registros, dois níveis de aninhamento sob o nome do evento)
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
# Fixture 3 — misto raso + profundo, mais tudo que o PR #4842 já suporta
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

### Testes que precisam mudar

`packages/core/src/utils/yaml-parser.test.ts` possui 2 "testes de trava" no
final (linhas 200–227) intitulados `known limitations — nested YAML (pin until
js-yaml lands)`. A substituição DEVE inverter esses testes para asserções
positivas de parsing aninhado:

```ts
it('analisa array-de-registros', () => {
  const yaml =
    'mcpServers:\n  - filesystem:\n      type: stdio\n      command: node';
  expect(parse(yaml)).toEqual({
    mcpServers: [{ filesystem: { type: 'stdio', command: 'node' } }],
  });
});

it('analisa registro-de-registros', () => {
  const yaml = 'hooks:\n  PreToolUse:\n    - matcher: Read';
  expect(parse(yaml)).toEqual({
    hooks: { PreToolUse: [{ matcher: 'Read' }] },
  });
});
```

Essas duas asserções mais as três fixtures acima são o **critério de aceitação**
para a Fase 2 do plano de implementação. Qualquer outra coisa (casos extremos de escape,
booleanos com ou sem aspas, strings numéricas) é cobertura de regressão
da suíte de testes existente e deve passar inalterada.

### Verificação de paridade round-trip

O teste existente `should maintain round-trip integrity for escaped strings`
(linhas 111-129) exercita 7 strings através de `stringify → parse`. O
`stringify` padrão do `yaml` produz uma saída ligeiramente diferente da do
formatador manual (aspas mais agressivas em alguns casos, sequências de escape
diferentes). Dois resultados aceitáveis:

1. **Ajustar as fixtures de teste** para afirmar o comportamento sob o novo parser
   — a propriedade round-trip (`parse(stringify(x)) === x`) é o que importa,
   não uma saída YAML byte a byte idêntica.
2. **Manter as asserções byte a byte idênticas** e deixá-las falhar visivelmente,
   depois atualizá-las para refletir a saída do `yaml` literalmente. Mais fácil de revisar
   o diff.

Recomendação: **opção 1** — alterar as asserções para serem baseadas em propriedade
(`expect(parse(stringify(obj))).toEqual(obj)`) já que saída YAML byte a byte idêntica
não é um contrato documentado do módulo.

### Mudanças que quebram para quem chama — nenhuma esperada, mas verifique

- `subagent-manager.ts` re-serializa o objeto parseado de volta para YAML no
  caminho `saveSubagent`. Com o novo parser, `mcpServers` e `hooks`
  farão round-trip corretamente. Atualize `NESTED_FIELDS_NOT_ROUND_TRIPPABLE` em
  `claude-converter.ts` (Fase 3 da implementação) para remover
  esses dois nomes de campo.
- `skill-manager.ts` já importa `yaml` diretamente (separado do
  parser manual). Uma vez que `yaml-parser.ts` também estiver usando `yaml`, o
  import duplicado pode ser removido como um pequeno follow-up — fora do escopo aqui.

### Risco de migração

Baixo. Os 5 pontos de chamada desestruturam um `Record<string, unknown>` — mesmo tipo
de retorno. Os 2 testes de trava intencionais "garbles" são as únicas falhas esperadas;
eles são conhecidos e nós os invertemos propositalmente. Uma cobertura de regressão
mais ampla vem das suítes de teste existentes em `packages/core/src/subagents/`,
`packages/core/src/skills/`, e `packages/core/src/extension/`.

## Perguntas em aberto

| #   | Pergunta                                                                                                                                                 | Bloqueante?                                                           | Caminho de resolução                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | O `yaml.parse` precisa de um logger explícito para redirecionar `YAMLWarning` (ex.: `Unresolved tag`) para o logger do qwen-code em vez de `process.emitWarning`? | Não — adiar                                                           | Se os logs ficarem barulhentos no CI, passar `{ logLevel: 'silent' }` ou um callback `onWarning` personalizado. Não é crítico para a v1.                                      |
| Q2  | O `parse()` deve continuar retornando `{}` para YAML de string vazia / documento nulo, ou lançar exceção?                                                | Não — preservar comportamento atual                                   | O atual manual retorna `{}`; manter isso. Adicionar um teste de regressão fixando essa escolha.                                                                               |
| Q3  | Quando `mcpServers` estiver malformado no nível superior (ex.: `mcpServers: "string"`), todo o agente deve falhar ao carregar, ou carregar com esse campo descartado? | Sim — orienta a postura de alertar-e-descartar na Fase 3 da implementação | **Resolução**: descartar o campo, emitir um aviso no console (paridade com o padrão CC `DL7` conforme Fase 3 de `docs/declarative-agents-port.md`).                       |
| Q4  | O mesmo que Q3, mas para `hooks`: descartar o campo, o evento ou apenas o matcher individual?                                                             | Sim — orienta a postura de alertar-e-descartar                        | **Resolução**: descartar todo o campo `hooks` em caso de falha de formato no nível superior. Granularidade por evento / matcher é adiada para um PR futuro se um usuário real sinalizar necessidade. |
| Q5  | O atalho `Bun.YAML.parse` do helper do CC se aplica ao qwen-code?                                                                                       | Não                                                                   | O qwen-code não tem como alvo o runtime Bun. Ignorar.                                                                                                                         |

---

**Status**: pesquisa concluída, pronto para implementar a Fase 2 (substituir
`yaml-parser.ts`) e a Fase 3 (re-expor `mcpServers` + `hooks` em
`SubagentConfig`) conforme `docs/declarative-agents-port.md`.