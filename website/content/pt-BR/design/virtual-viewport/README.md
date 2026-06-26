# Virtual viewport para conversas longas no ink 7

Status: **implementado**, PR #4146 implementa:
viewport principal, barra de rolagem ASCII com animação de ocultação automática, roda do mouse SGR, comporta `ui.useTerminalBuffer`, teclas de rolagem do teclado.
Arrasto da barra de rolagem / pesquisa no aplicativo / modo buffer alternativo / gravação dupla no scrollback do host estão fora do escopo para V.3+ (ver §7).
Autor: 秦奇
Branch de rastreamento: `feat/virtual-viewport-on-ink7` (base: `main`)

## 1. Problema

Vários problemas de flicker / lag relatados por usuários se resumem ao mesmo fato arquitetural: `<Static>` do ink é **somente anexação** e o `MainContent.tsx` do qwen-code alimenta o `mergedHistory` _inteiro_ através dele a cada renderização. Para uma conversa de 1000 turnos, são 1000 renderizações React de `HistoryItemDisplay` + passes de layout do ink por mudança de estado.

Os sintomas atuais que isso possibilita:

| Problema        | Sintoma                                            | Contribuidor atual                                           |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| #2950           | Sessão longa mostra tempestade contínua de rolagem para cima/baixo | remontagem completa do Static a cada atualização                          |
| #3118           | Voltar para a janela continua piscando          | `clearTerminal` + `historyRemountKey++` aciona remontagem completa |
| #3007           | Flickering genérico da interface                       | mesmo que #3118                                                 |
| #3838 (lado da UI) | Barra de rolagem cresce sem limite        | cada renderização de delta cumulativo adiciona linhas; sem remoção de viewport  |
| #3899 → #3905   | Ctrl+O congelou terminal por segundos            | o caso parcialmente corrigido, selado com chunking `setImmediate` |

PR #3905 observa explicitamente:

> Discussão de alternativas (prefixo selado + tail ao vivo, **virtualização real de viewport**, cache de saída ANSI) foi considerada, mas cada uma altera a UX ou requer uma reescrita arquitetural.

Essa reescrita arquitetural é o que este design propõe.

## 2. Implementações de referência

Examinamos duas CLIs open-source baseadas em ink que já resolveram (ou contornaram) o mesmo problema:

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

Mantém seu **próprio fork do ink** em `src/ink/`:

- `ink.tsx` — 1722 LoC de loop principal personalizado
- `log-update.ts` — 773 LoC de renderizador diff personalizado com otimização de região de rolagem (`DECSTBM`), fallback de quadro completo quando o scrollback seria tocado
- `screen.ts` / `frame.ts` — objetos explícitos de Screen / Frame, diffing em nível de célula `cellAt` / `diffEach`
- `render-to-screen.ts` — expõe `renderToScreen(node)` para renderizar QUALQUER árvore de nós em um objeto `Screen` fora da banda. Esta é a capacidade subjacente para "renderizar uma vez, cachear, reproduzir" — ou seja, virtualização
- `screens/REPL.tsx`:
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` — apenas linhas completas expostas ao renderizador
  - `ScrollBox` com `scrollRef`, `cursorNavRef`
  - `Markdown.tsx` `StreamingMarkdown` divide o conteúdo no último limite de bloco de nível superior, memoiza prefixo estável, apenas reanalisa sufixo instável
- Cache de tokens do `Markdown.tsx` (LRU-500) — sobrevive a desmontagem→remontagem, então as remontagens de rolagem virtual acertam o cache sem re-analisar

**Por que não replicamos essa abordagem**: bifurcar o ink inteiro é uma manutenção insustentável (apenas 1722 LoC `ink.tsx`, mais um reconciler personalizado). Cada correção upstream do ink precisa ser mesclada manualmente. Esse custo é justificado para a escala do claude-code; não para o qwen-code.

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

Usa `@jrichman/ink@6.6.9` (um fork menor que adiciona exportações `ResizeObserver` e `StaticRender`), e entrega **uma lista virtualizada completa como componentes simples**:

| Arquivo                                  | LoC | Função                                                                   |
| --------------------------------------- | --- | ---------------------------------------------------------------------- |
| `components/shared/VirtualizedList.tsx` | 764 | Viewport principal + medição + âncora de rolagem + rastreamento de redimensionamento por item |
| `components/shared/ScrollableList.tsx`  | 278 | Encapsula `VirtualizedList`, adiciona navegação por teclas + rolagem suave + barra de rolagem |
| `contexts/ScrollProvider.tsx`           | 469 | Arrasto do mouse, bloqueio de rolagem, contexto de foco                                     |
| `hooks/useBatchedScroll.ts`             | 35  | Coalesce atualizações de rolagem no mesmo tick                                     |
| `hooks/useAnimatedScrollbar.ts`         | 130 | Animação de fade-in/out da barra de rolagem                                        |

`MainContent.tsx` alterna entre dois caminhos de renderização usando um sinalizador `isAlternateBufferOrTerminalBuffer`:

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` é envolvido em `React.memo` para que itens inalterados não sejam renderizados novamente.
**Esta é a referência de nível de produção.**

## 3. Verificação de capacidade do ink 7

qwen-code está na branch em desenvolvimento `chore/upgrade-ink-7`. Foram inspecionadas as exportações de `node_modules/ink/build/index.d.ts`:

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — atualiza automaticamente com mudanças de layout. **Equivalente funcional do `ResizeObserver`.**
- ✅ `measureElement(node)` — medição imperativa única
- ✅ `useWindowSize` — redimensionamento do terminal
- ✅ `useAnimation` — para fade da barra de rolagem
- ✅ `Static`, `Box`, `Text`, etc.
- ❌ `ResizeObserver` (componente/classe) — precisa de adaptação
- ❌ `StaticRender` — precisa de implementação personalizada

**Conclusão**: o ink 7 tem todas as primitivas necessárias. Nenhuma troca de fork é necessária.

## 4. Decisão estratégica

**Portar o `ScrollableList` + `VirtualizedList` + hooks/contexts de suporte do gemini-cli para qwen-code, adaptando `ResizeObserver` → `useBoxMetrics` e criando um `StaticRender` personalizado.**

Alternativas rejeitadas:

| Alternative                       | Why rejected                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fork do ink como o claude-code    | Carga de manutenção insustentável                                                                                 |
| Mudar para `@jrichman/ink`        | Reverte a atualização em andamento do ink 7; perde as melhorias do ink 7: React 19.2 + reconciliador 0.33 + novo renderizador de diff |
| Construir virtualização do zero   | Reinventa ~1700 linhas de código de design comprovado; a referência do gemini-cli existe e funciona               |

## 5. Arquitetura

### Mapa de arquivos após o PR #4146

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NOVO] viewport principal + barra de rolagem ASCII
│   ├── ScrollableList.tsx           [NOVO] wrapper de teclado + roda do mouse
│   └── StaticRender.tsx             [NOVO] wrapper React.memo (substitui a exportação do fork do ink do gemini-cli)
├── hooks/
│   ├── useBatchedScroll.ts          [NOVO] coalesce atualizações de rolagem no mesmo tick
│   ├── useMouseEvents.ts            [NOVO] ativa modo mouse SGR + analisa eventos stdin
│   └── useAnimatedScrollbar.ts      [NOVO] flash do polegar na rolagem + ocultação automática em idle
├── utils/
│   └── mouse.ts                     [NOVO] analisador de eventos de mouse SGR + X11 (portado do gemini-cli)
├── components/MainContent.tsx       [MOD] adiciona ramo virtualizado + refs de estabilidade
└── AppContainer.tsx                 [MOD] alimenta estado de UI relacionado à rolagem no contexto + controla refreshStatic
```

Adiado para PRs futuros:

- **Arrastar barra de rolagem + clicar para posicionar** — precisa de coordenadas absolutas do elemento na tela, bloqueado por uma limitação do ink 7 padrão (veja V.4 / V.7).
- **Busca `/` no aplicativo** — padrão `TranscriptSearchBar` do claude-code (V.5).
- **Modo buffer alternativo** — foco/bloqueio no estilo `contexts/ScrollProvider.tsx`, com tomada completa da tela alternativa (V.6).

### Configuração (V.2)

```ts
// settings schema
ui: {
  /**
   * Enables virtualized history rendering for long conversations.
   * When true, only items in the visible viewport are rendered through React;
   * scrolled-out items remain in the terminal scrollback buffer.
   *
   * Default: false. Opt-in until proven stable on long conversations.
   */
  useTerminalBuffer?: boolean;  // alias kept compat with gemini-cli
}
```

`MainContent.tsx` lê a configuração e alterna caminhos:

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // virtualized
}

return <Static .../>; // existing path, untouched
```

O caminho legado `<Static>` permanece como está — sem risco de regressão para usuários que não optarem.

## 6. Principais adaptações do código-fonte do gemini-cli

### 6.1 `ResizeObserver` → `useBoxMetrics`

O observer de contêiner do gemini-cli (padrão imperativo):

```ts
const containerObserverRef = useRef<ResizeObserver | null>(null);

const containerRefCallback = useCallback((node: DOMElement | null) => {
  containerObserverRef.current?.disconnect();
  containerRef.current = node;
  if (node) {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const newHeight = Math.round(entry.contentRect.height);
        const newWidth = Math.round(entry.contentRect.width);
        setContainerHeight((prev) => (prev !== newHeight ? newHeight : prev));
        setContainerWidth((prev) => (prev !== newWidth ? newWidth : prev));
      }
    });
    observer.observe(node);
    containerObserverRef.current = observer;
  }
}, []);
```

Nossa adaptação (hook declarativo do ink 7):

```ts
const containerRef = useRef<DOMElement>(null);
const { width: containerWidth, height: containerHeight } =
  useBoxMetrics(containerRef);
```

`useBoxMetrics` já lida com anexar/desanexar + assinatura de mudança de layout; a contabilidade imperativa desaparece.

### 6.2 Rastreador de redimensionamento por item (`itemsObserver`)

Mais difícil. O gemini-cli observa N nós de item através de um único `ResizeObserver` e roteia a entrada → chave através de um `WeakMap`:
```ts
const nodeToKeyRef = useRef(new WeakMap<DOMElement, string>());
const itemsObserver = useMemo(
  () =>
    new ResizeObserver((entries) => {
      setHeights((prev) => {
        let next = null;
        for (const entry of entries) {
          const key = nodeToKeyRef.current.get(entry.target);
          if (key && prev[key] !== Math.round(entry.contentRect.height)) {
            if (!next) next = { ...prev };
            next[key] = Math.round(entry.contentRect.height);
          }
        }
        return next ?? prev;
      });
    }),
  [],
);
```

`useBoxMetrics` é **um ref por hook**, então não podemos substituir 1:1. Duas opções:

**Opção A — empurrar a medição para dentro de `VirtualizedListItem`**

Cada `VirtualizedListItem` já executa como seu próprio componente (memoizado). Adicione `useBoxMetrics` dentro dele; reporte a altura para cima via uma prop de callback:

```tsx
const VirtualizedListItem = memo(({ itemKey, onHeightChange, ...props }) => {
  const ref = useRef<DOMElement>(null);
  const { height, hasMeasured } = useBoxMetrics(ref);
  useEffect(() => {
    if (hasMeasured) onHeightChange(itemKey, height);
  }, [itemKey, height, hasMeasured, onHeightChange]);
  return <Box ref={ref}>{...}</Box>;
});
```

**Opção B — usar `measureElement` + `useLayoutEffect`** no pai

O pai armazena refs para itens visíveis, executa um layout-effect após cada renderização para medi-los. Menos reativo, porém mais simples:

```ts
useLayoutEffect(() => {
  const newHeights: Record<string, number> = { ...heights };
  let changed = false;
  for (const [key, ref] of itemRefs.current) {
    if (ref) {
      const { height } = measureElement(ref);
      if (newHeights[key] !== height) {
        newHeights[key] = height;
        changed = true;
      }
    }
  }
  if (changed) setHeights(newHeights);
});
```

**Recomendação: Opção A.** Separação mais limpa, aproveita a detecção de mudanças nativa do ink 7. Evita o risco de "tempestade de medições" onde toda renderização mede tudo.

### 6.3 `StaticRender` — implementação personalizada

gemini-cli importa `StaticRender` de `@jrichman/ink`. Observando o uso em `VirtualizedList.tsx`:

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

Semântica: renderizar `content` uma vez com a largura fornecida; renderizações subsequentes com a mesma chave + largura retornam o cache da renderização.

Para o ink 7, o equivalente é usar `React.memo` com um componente estável que o pai garante não re-renderizar. Implementação personalizada:

```tsx
import { memo } from 'react';
import { Box } from 'ink';

interface StaticRenderProps {
  children: React.ReactElement;
  width?: number | string;
}

const StaticRender = memo(
  ({ children, width }: StaticRenderProps) => (
    <Box width={width} flexDirection="column" flexShrink={0}>
      {children}
    </Box>
  ),
  (prev, next) => prev.children === next.children && prev.width === next.width,
);
```

Combinado com a prop `key` estável do pai (`${itemKey}-static-${width}`), mudar `children` ou `width` causa uma nova montagem; caso contrário, o React pula a re-renderização.

Esta é a capacidade central: itens que SÃO estáticos (ex.: mensagens Gemini concluídas) são medidos + renderizados uma vez e nunca mais passam pelo React.

### 6.4 Memoizar `HistoryItemDisplay`

gemini-cli faz:

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

Mesmo padrão no qwen-code. Necessário para que a virtualização realmente pule re-renderizações.

## 7. Sequência de PRs

| PR        | Título (rascunho)                                                           | Escopo                                                                                                                                                                              | Linhas            | Dependências | Risco                                          |
| --------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------ | ---------------------------------------------- |
| **#4146** | feat(cli): viewport virtual para conversas longas no ink 7                  | primitivas principais + barra de rolagem ASCII com **animação de auto-ocultação** + SGR **roda do mouse** + portão `ui.useTerminalBuffer` + `MainContent`/`AppContainer` + testes   | ~2800 LoC         | `main`       | ✅ **enviado** — typecheck limpo, vitest verde |
| **V.3**   | test(integração): regressões do capture-suite para streaming / redimensionamento / shell | portar 3 scripts de captura do PR #3663                                                                                                                                             | ~2000 (só testes) | #4146        | pendente                                       |
| **V.4**   | feat(cli): arrastar barra de rolagem + clique para posicionar               | teste de clique SGR na coluna da barra. Necessita coordenadas absolutas da tela — ou `getBoundingBox` upstream para ink 7 ou próprio walker yoga. Animação auto-ocultação já enviada em #4146. | ~400              | #4146        | adiado — bloqueio de coordenadas              |
| **V.5**   | feat(cli): busca `/` no aplicativo                                          | destaque limitado ao viewport + navegação n/N (padrão `TranscriptSearchBar` do claude-code)                                                                                          | ~300              | #4146        | adiado                                         |
| **V.6**   | feat(cli): modo de buffer alternativo (tomada total da tela alternativa)    | configuração adicional `ui.useAlternateBuffer`                                                                                                                                      | ~500              | #4146        | adiado — requer decisão UX separada            |
| **V.7**   | pesquisa: preservar histórico de rolagem do terminal hospedeiro (escrita dupla) | `overflowToBackbuffer` do `@jrichman/ink` é apenas fork. Opções: PR upstream para ink 7, própria escrita dupla ou aceitar perda. Investigação.                                       | —                 | #4146        | estruturalmente bloqueado no ink 7 original    |
V.3 (testes de integração) é o item de caminho crítico restante antes de alterar o padrão. V.4–V.6 fecham as lacunas restantes de paridade com o gemini-cli; V.7 é pesquisa aberta porque a prop do ink que precisaríamos (`overflowToBackbuffer`) só existe no fork `@jrichman/ink` do gemini-cli.

## 8. Plano de verificação

Por PR (obrigatório antes de qualquer "pronto para revisão"):

- `npm run typecheck --workspace=@qwen-code/qwen-code` — limpo
- `npm run lint --workspace=@qwen-code/qwen-code` — limpo
- `cd packages/cli && npx vitest run` — tudo verde
- Auditoria sem direção em várias rodadas conforme fluxo de trabalho do projeto

Fim a fim (após V.3):

- Benchmark de conversa longa: sessão de 1000 turnos, medir
  - Tempo de primeira pintura (montagem inicial + pintura)
  - Latência de alternância Ctrl+O
  - Latência de redimensionamento
  - Tempo de renderização por quadro durante streaming
- Comparar `useTerminalBuffer: false` (legado) vs `true` (virtualizado)

## 9. Perguntas em aberto / decisões necessárias

1. **Nome da configuração**: `ui.useTerminalBuffer` (compatível com gemini-cli) vs `ui.virtualizedHistory` (mais descritivo)?
2. **Valor padrão**: enviar como `false` (opt-in) ou lançamento em etapas via variável de ambiente primeiro?
3. **Heurística de item estático**: gemini-cli marca apenas `header` como estático. Devemos também marcar mensagens Gemini concluídas, resultados de ferramentas que não estão mais em `pendingHistoryItems`, etc.?
4. **Suporte a mouse**: `ScrollProvider` do gemini-cli inclui arrastar com mouse para barra de rolagem. Vale a pena portar agora ou pular até V.4?
5. **Compatibilidade com #3905**: ~~PR #3905 (correção de congelamento Ctrl+O) está aberto e modifica o mesmo `MainContent.tsx`. Coordenar ordem de merge — provavelmente V.2 baseado em cima de #3905.~~ **Resolvido**: o replay progressivo de #3905 foi para `main` e está preservado no branch `<Static>` legado de `MainContent.tsx`; o branch VP o substitui para usuários opt-in porque o gatilho de congelamento (remontagem completa de Static) não se aplica mais.
6. **Compatibilidade com `chore/re-upgrade-ink-7-0-3`**: PR #4146 se baseia nele. Após #4119 (PR de re-upgrade do ink 7.0.3) ser mesclado em `main`, a base do PR #4146 será redirecionada para `main`.

## 10. Riscos

| Risco                                                                      | Probabilidade | Mitigação                                                                                              |
| ------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| `useBoxMetrics` por item cria tempestades de medição em listas longas     | média         | A opção A na §6.2 já memoiza por item; apenas os itens na janela de renderização pagam o custo. Benchmark em V.3. |
| A implementação customizada de `StaticRender` perde um caso extremo que o fork @jrichman tratava | média         | Auditar o fonte do StaticRender do gemini-cli se disponível; caso contrário, confiar em testes funcionais + benchmark. |
| Deriva do caminho legado `<Static>` à medida que o novo caminho evolui    | baixa         | O gate de feature-flag mantém ambos os caminhos ativos; CI executa ambos via matriz de configuração. |
| ink 7 ainda tem bugs não preenchidos upstream                             | baixa         | Já estamos no ink 7 via `chore/upgrade-ink-7`; este PR não introduz risco adicional do ink.           |
| Sessões longas acumulam memória em caches de medição                      | média         | Adicionar evicção LRU no Record `heights` quando o tamanho exceder N×viewport (ex. 5×). V.3 faz benchmark disso. |

## 11. Lista de verificação de aprovação

- [x] Direção arquitetural aprovada — port do gemini-cli (§4)
- [x] Nome da configuração + padrão decididos — `ui.useTerminalBuffer`, padrão `false` (opt-in)
- [x] Heurística de item estático — `isStaticItem={(item) => item.id > 0}` (itens de histórico concluídos)
- [x] Escopo de suporte a mouse — adiado para V.4; rolagem apenas por teclado em #4146
- [x] Ordem de merge com #3905 (§9.5) — #3905 já está em `main`; #4146 preserva o caminho legado de replay progressivo e o substitui apenas para usuários VP
- [x] Implementação do PR #4146 completa
