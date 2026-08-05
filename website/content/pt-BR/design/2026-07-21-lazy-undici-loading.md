# Carregamento lazy do undici (fase 3 do startup lazy)

- Status: implementado
- Issue: QwenLM/qwen-code#7264 (candidato 4), acompanhamento do #4748
- Predecessores: `2026-07-19-lazy-telemetry-sdk-loading.md`,
  `2026-07-19-telemetry-protocol-split.md`

## Problema

Após as fases da telemetria, o undici é o maior contribuidor terceiro restante
para a closure de inicialização eager do ACP: 2057 KiB em duas cópias
empacotadas (o cli resolve seu próprio `undici`, o core resolve outro). Todo
`import { … } from 'undici'` estático em qualquer lugar da closure puxa uma
cópia completa para o parse/compilação do cold start, mesmo que o undici só
seja necessário quando uma requisição realmente sai — dispatchers de proxy,
preconnect, opções de fetch do cliente IDE, setup do GitHub, self-update.

O metafile mostrou oito pontos de import de valor (imports apenas de tipo são
gratuitos):

| Pacote | Ponto                          | Usos                                       |
| ------ | ------------------------------ | ------------------------------------------ |
| core   | `utils/runtimeFetchOptions.ts` | `Agent`, `ProxyAgent`, `EnvHttpProxyAgent` |
| core   | `config/config.ts`             | `EnvHttpProxyAgent`, `setGlobalDispatcher` |
| core   | `ide/ide-client.ts`            | `Agent` (keep-alive HTTP da IDE)           |
| cli    | `utils/apiPreconnect.ts`       | `fetch`                                    |
| cli    | `commands/channel/proxy.ts`    | `EnvHttpProxyAgent`, `setGlobalDispatcher` |
| cli    | `utils/gitUtils.ts`            | `ProxyAgent`                               |
| cli    | `services/setup-github.ts`     | `ProxyAgent`                               |
| cli    | `utils/standalone-update.ts`   | `fetch`                                    |

## Design

Todos os oito pontos se movem para `import('undici')` dinâmico, canalizados por
dois helpers single-flight locais de pacote:

- `packages/core/src/utils/runtimeFetchOptions.ts` — `loadUndici()`, e o
  `preloadRuntimeFetchModule()` existente agora delega para ele. Consumidores
  síncronos (`getOrCreateSharedDispatcher`,
  `buildFetchOptionsWithDispatcher`) mantêm seu `requireUndici()` que falha
  alto; pontos de entrada assíncronos que podem aguardar
  (`createContentGenerator`, `Config.initialize`, conexão do cliente IDE)
  pré-carregam antes que qualquer construção síncrona rode.
- `packages/cli/src/utils/load-undici.ts` — o mesmo helper, duplicado de
  propósito (ver "Por que dois helpers").

Notas dos pontos de chamada:

- `Config`: o dispatcher de proxy global é instalado assincronamente; a promise
  é armazenada e aguardada no topo de `initialize()`, então o dispatcher está
  no lugar antes de qualquer atividade de rede, correspondendo à garantia
  anterior de ordenação síncrona.
- `createContentGenerator` aguarda `preloadRuntimeFetchModule()` antes que os
  construtores de provider construam sincronicamente opções de fetch baseadas
  em undici.

## Interop CJS do esbuild (a parte difícil)

O esbuild compila o pacote CJS do undici em um chunk dinâmico **apenas com
default**: `export default require_undici()`, sem exports nomeados. Então
`const { Agent } = await import('undici')` funciona no Node e no vitest (que
sintetizam exports nomeados para CJS), mas desestrutura `undefined` no bundle.
Execuções de teste locais não conseguem capturar isso — apenas uma execução
smoke empacotada consegue.

`loadUndici()`, portanto, normaliza: se `Object.keys(mod)` for exatamente
`['default']`, desembrulha `mod.default`; caso contrário, retorna o namespace
como está. A verificação de chave única (em vez de `mod.default ?? mod` ou
`'default' in mod`) é deliberada:

- proxies de mock do vitest **lançam erro** ao acessar um export `default`
  indefinido, então sondar `mod.default` quebra todo teste
  `vi.mock('undici')`;
- mocks construídos como `{ ...actual }` podem carregar uma chave `default` ao
  lado de exports nomeados e não devem ser desembrulhados.

## Por que dois helpers (e não um exportado do core)

cli e core resolvem cópias **diferentes** do undici. Se o código do cli
chamasse um `loadUndici()` hospedado no core, o `import('undici')` se
resolveria dentro do escopo de pacote do core, escapando do
`vi.mock('undici')` nos testes do cli — os mocks silenciosamente param de
interceptar (observado: mock de `ProxyAgent` nunca chamado em
`setup-github.test.ts`). Manter um helper por pacote mantém os testes de cada
pacote capazes de mockar seu próprio undici.

## Guarda

`scripts/check-serve-fast-path-bundle.js` adiciona o undici a
`FORBIDDEN_ACP_PACKAGES`: um re-import estático em qualquer lugar da closure
eager do ACP falha o CI. Após a mudança, a closure eager cai de 15,42 MiB /
132 chunks para 13,39 MiB / 130 chunks, bytes do undici 2057 KiB → 0; o bundle
retém exatamente dois chunks de entrada dinâmicos do undici (um por cópia de
pacote), ambos atrás dos helpers normalizadores.

## Aceitação (2C4G, disciplina #4748)

30 cold starts seriais pareados, controle = build da fase 2, candidato = esta
mudança: P50 pareado de processo→primeira sessão −89,5 ms (1336,8 → 1255,2),
candidato mais rápido em 30/30 pares; caminho pré-aquecido inalterado (P50
80,7 → 78,0); RSS após a primeira sessão −8,1 MB. Os gates funcionais
(concorrência, telemetria desabilitada, sessão única legada) todos passam.
Números completos em `.qwen/e2e-tests/phase3-lazy-undici-bench-results.md`.

## Alternativas rejeitadas

- **Um único helper compartilhado exportado do core**: quebra os mocks de teste
  do cli e acopla a cópia do undici do cli à do core (as duas cópias já estão
  em versões diferentes no HEAD: 7.27.2 vs 7.28.0).
- **Preload eager de nível superior iniciado no startup**: mantém o custo de
  parse fora do caminho crítico apenas se nada o aguardar, mas o ponto central
  é que a maioria dos cold starts nunca precisa do undici antes da primeira
  sessão; o preload readicionaria a contenção de CPU em 2 núcleos que a fase 2
  mediu.
- **Substituir o uso do undici pelo `fetch` global**: o fetch global do Node é
  o undici, mas o código precisa das opções de dispatcher
  `Agent`/`ProxyAgent`/`EnvHttpProxyAgent` que a superfície global não expõe.
