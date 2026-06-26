# Viewport virtual para conversas longas no ink 7

Status: **implementado**, PR #4146 inclui:
viewport principal, scrollbar ASCII com animação de auto-ocultação, mouse-wheel SGR, bloqueio `ui.useTerminalBuffer`, teclas de rolagem do teclado.
Arrasto da scrollbar / pesquisa no aplicativo / modo de buffer alternativo / escrita dupla para o scrollback do host estão fora do escopo para V.3+ (veja §7).
Autor: 秦奇
Branch de rastreamento: `feat/virtual-viewport-on-ink7` (base: `main`)

## 1. Problema

Diversos problemas reportados de flicker / lag convergem no mesmo fato arquitetural: o `<Static>` do ink é **apenas append** e o `MainContent.tsx` do qwen-code alimenta o `mergedHistory` inteiro através dele a cada render. Para uma conversa de 1000 turnos, são 1000 renderizações React de `HistoryItemDisplay` + passes de layout do ink por mudança de estado.

Os sintomas atuais que isso possibilita:

| Issue          | Sintoma                                              | Contribuidor atual                                                    |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| #2950          | Sessão longa mostra tempestade contínua de rolagem   | remontagem completa de Static a cada refresh                          |
| #3118          | Voltar para a janela continua piscando               | `clearTerminal` + `historyRemountKey++` dispara remontagem completa   |
| #3007          | Pisca-pisca genérico da interface                    | igual ao #3118                                                        |
| #3838 (lado UI)| Scrollbar cresce sem limites                         | cada render delta cumulativo adiciona linhas; sem evicção de viewport |
| #3899 → #3905  | Ctrl+O congelou o terminal por segundos              | o caso parcialmente corrigido, selado com chunking `setImmediate`     |

PR #3905 observa explicitamente:

> Discussão de alternativas (prefixo selado + cauda ao vivo, **virtualização real de viewport**, cache de saída ANSI) foi considerada, mas cada uma muda a UX ou requer uma reescrita arquitetural.

Essa reescrita arquitetural é o que este design propõe.

## 2. Implementações de referência

Pesquisadas duas CLIs baseadas em ink open-source que já resolveram (ou contornaram) o mesmo problema:

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

Mantém seu **próprio fork do ink** em `src/ink/`:

- `ink.tsx` — 1722 LoC de loop principal personalizado
- `log-update.ts` — 773 LoC de renderizador diff personalizado com otimização de região de rolagem (`DECSTBM`), fallback de quadro completo quando o scrollback seria tocado
- `screen.ts` / `frame.ts` — objetos Screen / Frame explícitos, `cellAt` / `diffEach` com diff em nível de célula
- `render-to-screen.ts` — expõe `renderToScreen(node)` para renderizar QUALQUER árvore de nós em um objeto `Screen` fora de banda. Esta é a capacidade subjacente para "renderizar uma vez, cache, reproduzir" — ou seja, virtualização
- `screens/REPL.tsx`:
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` — apenas linhas completas expostas ao renderizador
  - `ScrollBox` com `scrollRef`, `cursorNavRef`
  - `Markdown.tsx` `StreamingMarkdown` divide o conteúdo no último limite de bloco de nível superior, memoiza prefixo estável, apenas re-analisa sufixo instável
- Cache de token `Markdown.tsx` (LRU-500) — sobrevive a desmontagem→remontagem, então remontagens de rolagem virtual atingem o cache sem re-lexar

**Por que não replicamos essa abordagem**: forkar o ink por completo é manutenção insustentável (1722 LoC só de `ink.tsx`, mais um reconciler personalizado). Cada correção upstream do ink precisa ser mesclada manualmente. Esse custo é justificado para a escala do claude-code; não para o qwen-code.

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

Usa `@jrichman/ink@6.6.9` (um fork menor que adiciona `ResizeObserver` e exportações `StaticRender`), e entrega **uma lista virtualizada completa como componentes simples**:

| Arquivo                                  | LoC | Função                                                                |
| ---------------------------------------- | --- | --------------------------------------------------------------------- |
| `components/shared/VirtualizedList.tsx`  | 764 | Viewport principal + medição + âncora de rolagem + rastreamento de redimensionamento por item |
| `components/shared/ScrollableList.tsx`   | 278 | Encapsula `VirtualizedList`, adiciona navegação por teclas + rolagem suave + scrollbar |
| `contexts/ScrollProvider.tsx`            | 469 | Arrasto do mouse, bloqueio de rolagem, contexto de foco               |
| `hooks/useBatchedScroll.ts`             | 35  | Coalesce atualizações de rolagem no mesmo tick                        |
| `hooks/useAnimatedScrollbar.ts`         | 130 | Animação de fade-in/out da scrollbar                                  |

`MainContent.tsx` alterna entre dois caminhos de renderização através de uma flag `isAlternateBufferOrTerminalBuffer`:

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` é envolvido em `React.memo` para que itens inalterados não sejam re-renderizados.

**Esta é a referência de nível de produção.**

## 3. Verificação de capacidade do ink 7

qwen-code está na branch em andamento `chore/upgrade-ink-7`. Inspecionados as exportações de `node_modules/ink/build/index.d.ts`:

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — atualiza automaticamente em mudanças de layout. **Equivalente funcional do `ResizeObserver`.**
- ✅ `measureElement(node)` — medição imperativa de uso único
- ✅ `useWindowSize` — redimensionamento do terminal
- ✅ `useAnimation` — para fade da scrollbar
- ✅ `Static`, `Box`, `Text`, etc.
- ❌ `ResizeObserver` (componente/classe) — precisa de adaptação
- ❌ `StaticRender` — precisa de implementação personalizada

**Conclusão**: ink 7 tem todos os primitivos necessários. Nenhuma troca de fork necessária.

## 4. Decisão estratégica

**Portar o `ScrollableList` + `VirtualizedList` + hooks/contexts de suporte do gemini-cli para o qwen-code, adaptando `ResizeObserver` → `useBoxMetrics` e criando um `StaticRender` personalizado.**

Alternativas rejeitadas:

| Alternativa                       | Por que rejeitada                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Forkar o ink como o claude-code   | Carga de manutenção insustentável                                                                                |
| Mudar para `@jrichman/ink`       | Reverte o upgrade em andamento do ink 7; perde as melhorias do ink 7 (React 19.2 + reconciler 0.33 + novo renderizador diff) |
| Construir virtualização do zero   | Reinventa ~1700 LoC de design comprovado; a referência do gemini-cli existe e funciona                           |

## 5. Arquitetura

### Mapa de arquivos após PR #4146

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NOVO] viewport principal + scrollbar ASCII
│   ├── ScrollableList.tsx           [NOVO] encapsulador de teclado + mouse-wheel
│   └── StaticRender.tsx             [NOVO] wrapper React.memo (substitui a exportação do fork ink do gemini-cli)
├── hooks/
│   ├── useBatchedScroll.ts          [NOVO] coalesce atualizações de rolagem no mesmo tick
│   ├── useMouseEvents.ts            [NOVO] habilita modo SGR mouse + analisa eventos stdin
│   └── useAnimatedScrollbar.ts      [NOVO] flash do polegar na rolagem + auto-ocultação quando ocioso
├── utils/
│   └── mouse.ts                     [NOVO] analisador de eventos de mouse SGR + X11 (port do gemini-cli)
├── components/MainContent.tsx       [MOD] adiciona ramo virtualizado + refs de estabilidade
└── AppContainer.tsx                 [MOD] alimenta estado relacionado a rolagem para o contexto + bloqueia refreshStatic
```

Adiado para PRs subsequentes:

- **Arrasto da scrollbar + clique para posicionar** — precisa de coordenadas absolutas do elemento na tela, bloqueado por uma limitação do ink 7 padrão (veja V.4 / V.7).
- **Pesquisa `/` no aplicativo** — padrão `TranscriptSearchBar` do claude-code (V.5).
- **Modo de buffer alternativo** — foco/bloqueio estilo `contexts/ScrollProvider.tsx`, com tomada completa da tela alternativa (V.6).

### Configuração (V.2)

```ts
// esquema de configurações
ui: {
  /**
   * Habilita renderização virtualizada do histórico para conversas longas.
   * Quando true, apenas itens no viewport visível são renderizados via React;
   * itens fora do viewport permanecem no buffer de scrollback do terminal.
   *
   * Padrão: false. Opt-in até ser comprovadamente estável em conversas longas.
   */
  useTerminalBuffer?: boolean;  // alias mantido para compatibilidade com gemini-cli
}
```

`MainContent.tsx` lê a configuração e alterna caminhos:

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // virtualizado
}

return <Static .../>; // caminho existente, inalterado
```

O caminho legado `<Static>` permanece como está — sem risco de regressão para usuários que não optarem.

## 6. Principais adaptações do código fonte do gemini-cli

### 6.1 `ResizeObserver` → `useBoxMetrics`

Observador de contêiner do gemini-cli (padrão imperativo):

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

`useBoxMetrics` já lida com attach/detach + assinatura de mudança de layout; a contabilidade imperativa desaparece.

### 6.2 Rastreador de redimensionamento por item (`itemsObserver`)

Mais difícil. O gemini-cli observa N nós de item através de um único `ResizeObserver` e roteia a entrada → chave via um `WeakMap`:

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

**Opção A — empurrar medição para baixo para `VirtualizedListItem`**

Cada `VirtualizedListItem` já roda como seu próprio componente (memoizado). Adicionar `useBoxMetrics` dentro dele; relatar altura para cima via prop de callback:

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

O pai armazena refs para itens visíveis, executa um layout-effect após cada render para medi-los. Menos reativo, mas mais simples:

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

**Recomendação: Opção A.** Separação mais limpa, aproveita a detecção de mudança embutida do ink 7. Evita o risco de "tempestade de medições" onde cada render mede tudo.

### 6.3 `StaticRender` — implementação personalizada

O gemini-cli importa `StaticRender` de `@jrichman/ink`. Observando o uso em `VirtualizedList.tsx`:

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

Semântica: renderizar `content` uma vez na largura fornecida; renders subsequentes com a mesma chave + largura retornam o render em cache.

Para o ink 7, o equivalente é `React.memo` simples com um componente estável que o pai garante não re-renderizar. Implementação personalizada:

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

Combinado com a prop `key` estável do pai (`${itemKey}-static-${width}`), mudar children ou width causa uma montagem nova; caso contrário, o React pula a re-renderização.

Esta é a capacidade central: itens que SÃO estáticos (ex.: mensagens Gemini concluídas) são medidos + renderizados uma vez e nunca mais passam pelo React novamente.

### 6.4 Memorizar `HistoryItemDisplay`

O gemini-cli faz:

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

Mesmo padrão no qwen-code. Necessário para que a virtualização realmente pule re-renderizações.

## 7. Sequência de PRs

| PR        | Título (rascunho)                                                                 | Escopo                                                                                                                                                                            | Linhas            | Dependências | Risco                                          |
| --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------ | ---------------------------------------------- |
| **#4146** | feat(cli): viewport virtual para conversas longas no ink 7                        | Primitivos principais + scrollbar ASCII com **animação de auto-ocultação** + **mouse-wheel** SGR + bloqueio `ui.useTerminalBuffer` + conexão `MainContent`/`AppContainer` + testes | ~2800 LoC         | `main`       | ✅ **entregue** — typecheck limpo, vitest verde|
| **V.3**   | test(integração): regressões de suíte de captura para streaming / redimensionamento / shell | portar 3 scripts de captura do PR #3663                                                                                                                                           | ~2000 (só testes) | #4146        | pendente                                       |
| **V.4**   | feat(cli): arrasto da scrollbar + clique para posicionar                          | Hit-test de mouse SGR na coluna da scrollbar. Precisa de coordenadas absolutas na tela — ou `getBoundingBox` upstream para ink 7 ou próprio yoga walker. Animação de auto-ocultação já entregue em #4146. | ~400              | #4146        | adiado — bloqueador de coordenadas            |
| **V.5**   | feat(cli): pesquisa `/` no aplicativo                                             | Destaque limitado ao viewport + navegação n/N (padrão `TranscriptSearchBar` do claude-code)                                                                                       | ~300              | #4146        | adiado                                         |
| **V.6**   | feat(cli): modo de buffer alternativo (tomada completa da tela alternativa)       | Configuração adicional `ui.useAlternateBuffer`                                                                                                                                     | ~500              | #4146        | adiado — decisão UX separada necessária        |
| **V.7**   | pesquisa: preservar scrollback do terminal host (escrita dupla)                   | O `overflowToBackbuffer` do `@jrichman/ink` é exclusivo do fork. Opções: PR upstream para ink 7, própria escrita dupla, ou aceitar perda. Investigação.                            | —                 | #4146        | estruturalmente bloqueado no ink 7 padrão      |

V.3 (testes de integração) é o item restante de caminho crítico antes de alterar o padrão. V.4–V.6 fecham as lacunas restantes de paridade com gemini-cli; V.7 é pesquisa aberta porque a prop do ink que precisaríamos (`overflowToBackbuffer`) só existe no fork `@jrichman/ink` do gemini-cli.

## 8. Plano de verificação

Por PR (obrigatório antes de "pronto para revisão"):

- `npm run typecheck --workspace=@qwen-code/qwen-code` — limpo
- `npm run lint --workspace=@qwen-code/qwen-code` — limpo
- `cd packages/cli && npx vitest run` — tudo verde
- Auditoria multi-round sem direção por fluxo de trabalho do projeto

Fim a fim (após V.3):

- Benchmark de conversa longa: sessão de 1000 turnos, medir
  - Tempo de primeira pintura (montagem inicial + pintura)
  - Latência de alternância Ctrl+O
  - Latência de redimensionamento
  - Tempo de renderização por quadro durante streaming
- Comparar `useTerminalBuffer: false` (legado) vs `true` (virtualizado)

## 9. Perguntas em aberto / decisões necessárias

1. **Nome da configuração**: `ui.useTerminalBuffer` (compatibilidade com gemini-cli) vs `ui.virtualizedHistory` (mais descritivo)?
2. **Valor padrão**: entregar como `false` (opt-in) ou implementar rollout gradual via env var primeiro?
3. **Heurística de item estático**: o gemini-cli marca apenas `header` como estático. Devemos também marcar mensagens Gemini concluídas, resultados de ferramentas que não estão mais em `pendingHistoryItems`, etc.?
4. **Suporte a mouse**: o `ScrollProvider` do gemini-cli inclui arrasto do mouse para a scrollbar. Vale a pena portar agora ou pular até V.4?
5. **Compatibilidade com #3905**: ~~PR #3905 (correção de congelamento Ctrl+O) está aberto e modifica o mesmo `MainContent.tsx`. Coordenar ordem de merge — provavelmente V.2 rebaseia em cima de #3905.~~ **Resolvido**: a reprodução progressiva de #3905 foi lançada em `main` e preservada no ramo legado `<Static>` de `MainContent.tsx`; o ramo VP o substitui para usuários opt-in porque o gatilho de congelamento (remontagem completa de Static) não se aplica mais.
6. **Compatibilidade com `chore/re-upgrade-ink-7-0-3`**: PR #4146 empilha sobre ela. Após #4119 (o PR de re-upgrade do ink 7.0.3) mesclar em `main`, a base do PR #4146 será redirecionada para `main`.

## 10. Riscos

| Risco                                                                                     | Probabilidade | Mitigação                                                                                            |
| ----------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `useBoxMetrics` por item cria tempestades de medição em listas longas                     | média         | Opção A em §6.2 já memoiza por item; apenas itens na janela de render pagam o custo. Benchmark em V.3.|
| A implementação personalizada de `StaticRender` perde um caso de borda que o fork @jrichman tratava | média         | Auditar o código fonte do StaticRender do gemini-cli se disponível; caso contrário, confiar em testes funcionais + benchmark. |
| O caminho legado `<Static>` se desvia à medida que o novo caminho evolui                  | baixa         | A flag de funcionalidade mantém ambos os caminhos ativos; CI executa ambos via matriz de configuração.|
| O ink 7 ainda tem bugs não corrigidos upstream                                           | baixa         | Já estamos no ink 7 via `chore/upgrade-ink-7`; este PR não introduz risco adicional de ink.          |
| Sessões longas acumulam memória em caches de medição                                     | média         | Adicionar evicção LRU no registro `heights` assim que o tamanho exceder N×viewport (ex.: 5×). V.3 benchmarka isso. |
## 11. Checklist de aprovação

- [x] Direção arquitetural aprovada — port do gemini-cli (§4)
- [x] Nome da configuração + padrão definido — `ui.useTerminalBuffer`, padrão `false` (opt-in)
- [x] Heurística de item estático — `isStaticItem={(item) => item.id > 0}` (itens de histórico concluídos)
- [x] Escopo de suporte a mouse — adiado para V.4; scroll apenas por teclado na #4146
- [x] Ordenação de merge com #3905 (§9.5) — #3905 já está em `main`; #4146 preserva o caminho legado de progressive-replay e o substitui apenas para usuários VP
- [x] Implementação do PR #4146 completa