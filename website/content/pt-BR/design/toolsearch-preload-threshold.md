# Limite de pré-carregamento do ToolSearch

## Problema

Ferramentas adiadas (`shouldDefer=true`) são incondicionalmente ocultadas
atrás do ToolSearch: toda ferramenta MCP (codificado rigidamente em
`DiscoveredMCPTool`) mais um conjunto de embutidas incluídas no pacote
(web_search, web_fetch, cron, monitor, worktree, …). O adiamento economiza
tokens de prompt quando o conjunto adiado é grande, mas não é gratuito: cada
revelação no meio da sessão reescreve a lista de declarações de função, que
fica no início do prefixo tools→system→messages, então um único carregamento
do ToolSearch invalida todo o cache KV do prompt. Para um conjunto adiado
pequeno, o adiamento economiza pouco e o dano ao cache mais o round-trip
extra do ToolSearch tornam isso uma perda líquida.

O Claude Code modela esse tradeoff com `ENABLE_TOOL_SEARCH=auto` / `auto:N`:
"ferramentas são carregadas antecipadamente se couberem em 10% da janela de
contexto, caso contrário são adiadas"
(code.claude.com/docs/en/agent-sdk/tool-search). Esta alteração adiciona o
gate equivalente.

## Design

Nova configuração `tools.toolSearch.threshold` (número, porcentagem, padrão
`10`).

No início da sessão (`GeminiClient.startChat`, antes que o lembrete de
ferramentas adiadas seja resolvido), quando o ToolSearch está registrado e o
limite é > 0:

- Estimar a pegada combinada de tokens de todos os schemas de ferramentas
  adiadas — tanto embutidas do pacote quanto MCP
  (`JSON.stringify(tool.schema).length / CHARS_PER_TOKEN`).
- Se o total couber em `threshold`% da janela de contexto
  (`contentGeneratorConfig.contextWindowSize`, com fallback para
  `tokenLimit(model)`), revelar todas por meio do mecanismo existente
  `revealDeferredTool`. Tudo ou nada — uma revelação parcial deixaria um
  subconjunto arbitrário atrás do ToolSearch, e qualquer ferramenta que
  permaneça adiada ainda pode estourar o cache no primeiro uso.
- Caso contrário, tudo permanece adiado (comportamento anterior).
  `threshold: 0` restaura o comportamento antigo incondicionalmente.

As ferramentas pré-carregadas portanto chegam na lista de declarações
inicial, são filtradas para fora do lembrete de ferramentas adiadas da
inicialização, e a lista de declarações permanece estável durante toda a
sessão.

## Decisões

- **Apenas no início da sessão, nunca em `setTools()`.** Revelar uma
  ferramenta que o lembrete de inicialização já anunciou faria
  `queueAddedMcpToolsReminder` marcá-la como "removida", e uma mudança de
  declaração no meio da sessão estoura exatamente o cache que o
  pré-carregamento existe para proteger. Ferramentas de servidores que se
  conectam depois permanecem adiadas (anunciadas pelo lembrete de
  ferramentas adicionadas, acessíveis pelo ToolSearch) até o próximo início
  de sessão. `/clear` limpa o conjunto revelado e refaz a decisão.
- **Um orçamento único para todo o conjunto adiado, incluindo as do pacote.**
  O limite automático do Claude Code cobre apenas ferramentas MCP/SDK (suas
  embutidas são gerenciadas separadamente), mas ele pode se dar ao luxo
  dessa separação: as ferramentas adiadas são removidas do prefixo do prompt
  antes que a chave do cache seja computada, e a definição de uma ferramenta
  descoberta é expandida inline por meio de um bloco `tool_reference` — "O
  prefixo não é tocado, então o caching de prompt é preservado"
  (platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool).
  Aqui, toda revelação — do pacote ou MCP — passa por `setTools()` e
  reescreve a lista de declarações. Excluir as ~14 ferramentas adiadas do
  pacote (web_search, web_fetch, …) deixaria o prefixo a um carregamento de
  ferramenta comum de um estouro completo do cache, abrindo mão exatamente
  da estabilidade que o pré-carregamento compra. Quando a união excede o
  orçamento, tudo permanece adiado, o que corresponde à baseline
  pré-limite para ferramentas do pacote.
- **O padrão do limite é 10 (modo automático ligado), diferente do padrão do
  Claude Code.** O padrão não definido do Claude Code mantém as ferramentas
  MCP sempre adiadas e torna o `auto` opt-in — viável lá porque o primeiro
  uso de uma ferramenta adiada não custa invalidação de cache. Aqui custa uma
  reconstrução completa do prefixo, então o gate estilo automático fica
  ligado por padrão; `threshold: 0` reproduz o padrão de sempre adiar do
  Claude Code.
- **Ferramentas já reveladas contam para o orçamento**, de modo que inícios
  de sessão repetidos (a compactação também passa por `startChat`) não
  possam empurrar o conjunto revelado para além do orçamento à medida que
  servidores vêm e vão.
- **Sem pré-carregamento quando o ToolSearch não está disponível** — o ramo
  existente de revelação imediata em `resolveDeferredToolsForReminder` já
  expõe tudo.
