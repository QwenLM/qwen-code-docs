# Lazy undici loading (lazy startup phase 3)

- Status: implementiert
- Issue: QwenLM/qwen-code#7264 (Kandidat 4), Follow-up zu #4748
- Vorgänger: `2026-07-19-lazy-telemetry-sdk-loading.md`,
  `2026-07-19-telemetry-protocol-split.md`

## Problem

Nach den Telemetrie-Phasen ist undici der größte verbleibende
Drittanbieter-Beitrag zum eager ACP-Start-Closure: 2057 KiB über zwei
gebündelte Kopien (cli löst sein eigenes `undici` auf, core löst ein anderes
auf). Jedes statische `import { … } from 'undici'` irgendwo im Closure zieht
eine vollständige Kopie in das Kaltstart-Parsen/-Kompilieren, obwohl undici
nur benötigt wird, wenn tatsächlich ein Request rausgeht — Proxy-Dispatcher,
Preconnect, IDE-Client-Fetch-Optionen, GitHub-Setup, Self-Update.

Das Metafile zeigte acht Value-Import-Stellen (Type-only-Imports sind
kostenlos):

| Paket | Stelle                         | Verwendet                                  |
| ----- | ------------------------------ | ------------------------------------------ |
| core  | `utils/runtimeFetchOptions.ts` | `Agent`, `ProxyAgent`, `EnvHttpProxyAgent` |
| core  | `config/config.ts`             | `EnvHttpProxyAgent`, `setGlobalDispatcher` |
| core  | `ide/ide-client.ts`            | `Agent` (IDE-HTTP-Keep-alive)              |
| cli   | `utils/apiPreconnect.ts`       | `fetch`                                    |
| cli   | `commands/channel/proxy.ts`    | `EnvHttpProxyAgent`, `setGlobalDispatcher` |
| cli   | `utils/gitUtils.ts`            | `ProxyAgent`                               |
| cli   | `services/setup-github.ts`     | `ProxyAgent`                               |
| cli   | `utils/standalone-update.ts`   | `fetch`                                    |

## Design

Alle acht Stellen ziehen zu dynamischem `import('undici')` um, gebündelt durch
zwei paketlokale Single-Flight-Helfer:

- `packages/core/src/utils/runtimeFetchOptions.ts` — `loadUndici()`, plus das
  bestehende `preloadRuntimeFetchModule()` delegiert nun dorthin. Synchrone
  Consumer (`getOrCreateSharedDispatcher`,
  `buildFetchOptionsWithDispatcher`) behalten ihr fail-loud `requireUndici()`;
  asynchrone Einstiegspunkte, die awaiten können (`createContentGenerator`,
  `Config.initialize`, IDE-Client-Verbindung), preladen, bevor eine synchrone
  Konstruktion läuft.
- `packages/cli/src/utils/load-undici.ts` — derselbe Helfer, absichtlich
  dupliziert (siehe „Warum zwei Helfer").

Anmerkungen zu den Aufrufstellen:

- `Config`: Der globale Proxy-Dispatcher wird asynchron installiert; das
  Promise wird gespeichert und oben in `initialize()` awaited, sodass der
  Dispatcher vor jeder Netzwerkaktivität vorhanden ist, entsprechend der
  vorherigen synchronen Reihenfolgegarantie.
- `createContentGenerator` awaitet `preloadRuntimeFetchModule()`, bevor
  Provider-Konstruktoren synchron undici-gestützte Fetch-Optionen bauen.

## esbuild-CJS-Interop (der schwierige Teil)

esbuild kompiliert das CJS-Paket undici zu einem **Default-only**-dynamischen
Chunk: `export default require_undici()`, keine benannten Exporte. Daher
funktioniert `const { Agent } = await import('undici')` in Node und vitest
(die benannte Exporte für CJS synthetisieren), destrukturiert im Bundle aber
`undefined`. Lokale Testläufe können das nicht fangen — nur ein gebündelter
Smoke-Run kann es.

`loadUndici()` normalisiert daher: Wenn `Object.keys(mod)` exakt
`['default']` ist, `mod.default` auspacken; andernfalls den Namespace
unverändert zurückgeben. Der Einzel-Schlüssel-Check (statt `mod.default ?? mod`
oder `'default' in mod`) ist absichtlich:

- vitest-Mock-Proxys **werfen** beim Zugriff auf einen undefinierten
  `default`-Export, daher würde das Sondieren von `mod.default` jeden
  `vi.mock('undici')`-Test brechen;
- Mocks, die als `{ ...actual }` gebaut sind, können einen `default`-Schlüssel
  neben benannten Exporten tragen und dürfen nicht ausgepackt werden.

## Warum zwei Helfer (nicht einer aus core exportiert)

cli und core lösen **unterschiedliche** undici-Kopien auf. Wenn cli-Code ein
core-gehostetes `loadUndici()` aufrufen würde, würde das `import('undici')` im
Paket-Scope von core aufgelöst, was `vi.mock('undici')` in cli-Tests entkommt
— Mocks hören still auf abzufangen (beobachtet: `ProxyAgent`-Mock wurde in
`setup-github.test.ts` nie aufgerufen). Einen Helfer pro Paket zu behalten,
stellt sicher, dass die Tests jedes Pakets ihr eigenes undici mocken können.

## Guard

`scripts/check-serve-fast-path-bundle.js` fügt undici zu
`FORBIDDEN_ACP_PACKAGES` hinzu: Ein statischer Re-Import irgendwo im eager
ACP-Closure lässt CI fehlschlagen. Nach der Änderung sinkt der eager Closure
von 15,42 MiB / 132 Chunks auf 13,39 MiB / 130 Chunks, undici-Bytes
2057 KiB → 0; das Bundle behält exakt zwei dynamische undici-Entry-Chunks
(einen pro Paket-Kopie), beide hinter den normalisierenden Helfern.

## Akzeptanz (2C4G, #4748-Disziplin)

30 gepaarte serielle Kaltstarts, Kontrolle = Phase-2-Build, Kandidat = diese
Änderung: Prozess→erste-Session gepaartes P50 −89,5 ms (1336,8 → 1255,2),
Kandidat in 30/30 Paaren schneller; vorgeheizter Pfad unverändert (P50
80,7 → 78,0); RSS nach der ersten Session −8,1 MB. Funktions-Gates
(Parallelität, Telemetrie deaktiviert, Legacy-Einzel-Session) bestehen alle.
Vollständige Zahlen in
`.qwen/e2e-tests/phase3-lazy-undici-bench-results.md`.

## Abgelehnte Alternativen

- **Ein einzelner geteilter Helfer, exportiert aus core**: Bricht
  cli-Test-Mocks und koppelt clis Kopie von undici an die von core (die beiden
  Kopien sind bei HEAD bereits auf unterschiedlichen Versionen: 7.27.2 vs.
  7.28.0).
- **Eager Top-Level-Preload, beim Start angestoßen**: Hält die Parse-Kosten
  nur dann vom kritischen Pfad fern, wenn nichts darauf wartet, aber der ganze
  Punkt ist, dass die meisten Kaltstarts undici vor der ersten Session nie
  benötigen; Preloading würde die CPU-Konkurrenz auf 2 Kernen wieder
  hinzufügen, die Phase 2 gemessen hat.
- **undici-Verwendung durch globales `fetch` ersetzen**: Nodes globales fetch
  ist undici, aber der Code benötigt
  `Agent`/`ProxyAgent`/`EnvHttpProxyAgent`-Dispatcher-Optionen, die die
  globale Oberfläche nicht bereitstellt.
