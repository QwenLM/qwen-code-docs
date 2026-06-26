# Viewport virtuel pour les longues conversations sur ink 7

Statut : **implémenté**, la PR #4146 apporte :
viewport central, barre de défilement ASCII avec animation de masquage automatique, molette SGR, porte `ui.useTerminalBuffer`, touches de défilement au clavier.
Le glissement de la barre de défilement, la recherche dans l'application, le mode tampon alternatif et la double écriture vers le défilement de l'hôte sont exclus pour V.3+ (voir §7).
Auteur : 秦奇
Branche de suivi : `feat/virtual-viewport-on-ink7` (base : `main`)

## 1. Problème

Plusieurs problèmes de scintillement / latence signalés par les utilisateurs découlent tous du même fait architectural : le composant `<Static>` d'ink est **uniquement ajoutable** et `MainContent.tsx` de qwen-code transmet l'_intégralité_ de `mergedHistory` à chaque rendu. Pour une conversation de 1000 tours, cela signifie 1000 rendus React de `HistoryItemDisplay` + passes de mise en page d'ink par changement d'état.

Les symptômes actuels que cela provoque :

| Problème       | Symptôme                                                    | Contributeur actuel                                                   |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| #2950          | Session longue affiche une tempête continue de défilement haut/bas | remontage complet du Static à chaque rafraîchissement                 |
| #3118          | Le retour à la fenêtre continue de scintiller               | `clearTerminal` + `historyRemountKey++` déclenche un remontage complet |
| #3007          | Scintillement générique de l'interface                      | identique à #3118                                                     |
| #3838 (côté UI) | La barre de défilement croît sans limite                   | chaque rendu cumulatif delta ajoute des lignes ; pas d'éviction du viewport |
| #3899 → #3905  | Ctrl+O a gelé le terminal pendant des secondes             | le cas partiellement corrigé, scellé avec le découpage `setImmediate` |

La PR #3905 note explicitement :

> La discussion sur les alternatives (préfixe scellé + queue en direct, **véritable virtualisation du viewport**, mise en cache de la sortie ANSI) a été envisagée mais chacune modifie l'UX ou nécessite une réécriture architecturale.

Cette réécriture architecturale est ce que cette conception propose.

## 2. Implémentations de référence

Deux CLI open-source basées sur ink qui ont déjà résolu (ou contourné) le même problème ont été examinées :

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

Maintient son **propre fork d'ink** dans `src/ink/` :

- `ink.tsx` — 1722 lignes de code de boucle principale personnalisée
- `log-update.ts` — 773 lignes de code de rendu de différences personnalisé avec optimisation de la région de défilement (`DECSTBM`), repli sur trame complète lorsque le défilement serait touché
- `screen.ts` / `frame.ts` — objets Screen / Frame explicites, `cellAt` / `diffEach` pour le diffing au niveau des cellules
- `render-to-screen.ts` — expose `renderToScreen(node)` pour rendre n'importe quel arbre de nœuds sur un objet `Screen` hors bande. C'est la capacité sous-jacente pour « rendu une fois, mise en cache, rejeu » — c'est-à-dire la virtualisation
- `screens/REPL.tsx` :
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` — seules les lignes complètes sont exposées au rendu
  - `ScrollBox` avec `scrollRef`, `cursorNavRef`
  - `Markdown.tsx` `StreamingMarkdown` divise le contenu à la dernière limite de bloc de premier niveau, mémorise le préfixe stable, ne réanalyse que le suffixe instable
- Cache de jetons `Markdown.tsx` (LRU-500) — survit au démontage→remontage, donc les remontages de défilement virtuel frappent le cache sans re-lexing

**Pourquoi nous ne reproduisons pas cette approche** : forker ink en bloc est une maintenance insoutenable (1722 lignes de code pour `ink.tsx` seul, plus un reconciliateur personnalisé). Chaque correctif upstream d'ink doit être fusionné manuellement. Ce coût est justifié pour l'échelle de claude-code ; pas pour qwen-code.

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

Utilise `@jrichman/ink@6.6.9` (un fork plus petit qui ajoute les exportations `ResizeObserver` et `StaticRender`), et livre **une liste virtualisée complète sous forme de composants simples** :

| Fichier                                      | LoC | Rôle                                                                       |
| -------------------------------------------- | --- | -------------------------------------------------------------------------- |
| `components/shared/VirtualizedList.tsx`      | 764 | Viewport central + mesure + ancre de défilement + suivi de redimensionnement par élément |
| `components/shared/ScrollableList.tsx`       | 278 | Enveloppe `VirtualizedList`, ajoute la navigation par touches + défilement fluide + barre de défilement |
| `contexts/ScrollProvider.tsx`                | 469 | Glissement de souris, verrouillage du défilement, contexte de focus        |
| `hooks/useBatchedScroll.ts`                  | 35  | Fusionne les mises à jour de défilement d'une même tique                   |
| `hooks/useAnimatedScrollbar.ts`              | 130 | Animation d'apparition/disparition de la barre de défilement               |

`MainContent.tsx` bascule entre deux chemins de rendu via un indicateur `isAlternateBufferOrTerminalBuffer` :

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` est enveloppé dans `React.memo` afin que les éléments inchangés ne soient pas ré-rendus.
**Ceci est la référence de qualité production.**

## 3. Vérification des capacités d'ink 7

qwen-code se trouve sur la branche en cours `chore/upgrade-ink-7`. Exportations inspectées dans `node_modules/ink/build/index.d.ts` :

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — se met à jour automatiquement lors des changements de disposition. **Équivalent fonctionnel de `ResizeObserver`.**
- ✅ `measureElement(node)` — mesure impérative ponctuelle
- ✅ `useWindowSize` — redimensionnement du terminal
- ✅ `useAnimation` — pour l'estompage de la barre de défilement
- ✅ `Static`, `Box`, `Text`, etc.
- ❌ `ResizeObserver` (composant/classe) — nécessite une adaptation
- ❌ `StaticRender` — nécessite une implémentation personnalisée

**Conclusion** : ink 7 dispose de toutes les primitives nécessaires. Aucun changement de fork requis.

## 4. Décision stratégique

**Porter les `ScrollableList` + `VirtualizedList` de gemini-cli ainsi que les hooks/contextes associés vers qwen-code, en adaptant `ResizeObserver` → `useBoxMetrics` et en créant un `StaticRender` personnalisé.**

Alternatives rejetées :

| Alternative                       | Raison du rejet                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fork d'ink comme claude-code         | Charge de maintenance insoutenable                                                                                  |
| Passer à `@jrichman/ink`         | Inverse la mise à niveau en cours d'ink 7 ; perd les améliorations d'ink 7 (React 19.2 + réconciliateur 0.33 + nouveau moteur de rendu diff) |
| Créer la virtualisation à partir de zéro | Réinvente ~1700 lignes de code d'une conception éprouvée ; la référence de gemini-cli existe et fonctionne                                     |

## 5. Architecture

### Plan des fichiers après la PR #4146

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NOUVEAU] zone de visualisation principale + barre de défilement ASCII
│   ├── ScrollableList.tsx           [NOUVEAU] wrapper pour clavier et molette
│   └── StaticRender.tsx             [NOUVEAU] wrapper React.memo (remplace l'export du fork ink de gemini-cli)
├── hooks/
│   ├── useBatchedScroll.ts          [NOUVEAU] regroupe les mises à jour de défilement dans le même tick
│   ├── useMouseEvents.ts            [NOUVEAU] active le mode souris SGR + analyse les événements stdin
│   └── useAnimatedScrollbar.ts      [NOUVEAU] flash du pouce lors du défilement + masquage automatique en inactivité
├── utils/
│   └── mouse.ts                     [NOUVEAU] analyseur d'événements souris SGR + X11 (portage depuis gemini-cli)
├── components/MainContent.tsx       [MODIFIÉ] ajout de la branche virtualisée + références de stabilité
└── AppContainer.tsx                 [MODIFIÉ] alimenter le contexte avec l'état UI lié au défilement + contrôler refreshStatic
```

Reporté aux PRs suivantes :

- **Glisser la barre de défilement + clic pour positionner** — nécessite les coordonnées absolues de l'élément à l'écran, bloqué par une limitation de stock-ink-7 (voir V.4 / V.7).
- **Recherche `/` dans l'application** — motif `TranscriptSearchBar` de claude-code (V.5).
- **Mode tampon alternatif** — focus/verrouillage de style `contexts/ScrollProvider.tsx`, avec prise de contrôle complète de l'écran alternatif (V.6).

### Réglage (V.2)

```ts
// settings schema
ui: {
  /**
   * Active le rendu virtualisé de l'historique pour les longues conversations.
   * Lorsque vrai, seuls les éléments dans la zone de visualisation visible sont rendus via React ;
   * les éléments défilés hors de l'écran restent dans le tampon de défilement du terminal.
   *
   * Défaut : false. Option activable jusqu'à preuve de stabilité sur les longues conversations.
   */
  useTerminalBuffer?: boolean;  // alias conservé pour compatibilité avec gemini-cli
}
```

`MainContent.tsx` lit le réglage et bascule les chemins :

```tsx
const useTerminalBuffer = uiState.settings?.ui?.useTerminalBuffer ?? false;

if (useTerminalBuffer) {
  return <ScrollableList .../>; // virtualisé
}

return <Static .../>; // chemin existant, inchangé
```

Le chemin hérité `<Static>` reste tel quel — aucun risque de régression pour les utilisateurs qui ne l'activent pas.

## 6. Adaptations clés depuis le code source de gemini-cli

### 6.1 `ResizeObserver` → `useBoxMetrics`

L'observateur de conteneur de gemini-cli (motif impératif) :

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

Notre adaptation (hook déclaratif d'ink 7) :

```ts
const containerRef = useRef<DOMElement>(null);
const { width: containerWidth, height: containerHeight } =
  useBoxMetrics(containerRef);
```

`useBoxMetrics` gère déjà l'attachement/détachement + l'abonnement aux changements de disposition ; la comptabilité impérative disparaît.

### 6.2 Suivi de redimensionnement par élément (`itemsObserver`)

Plus difficile. gemini-cli observe N nœuds d'éléments via un seul `ResizeObserver` et achemine l'entrée → clé via une `WeakMap` :
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

`useBoxMetrics` est **un seul ref par hook**, donc nous ne pouvons pas le remplacer 1:1. Deux options :

**Option A — descendre la mesure dans `VirtualizedListItem`**

Chaque `VirtualizedListItem` est déjà son propre composant (mémorisé). Ajoutez `useBoxMetrics` à l'intérieur ; remontez la hauteur via une prop callback :

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

**Option B — utiliser `measureElement` + `useLayoutEffect`** dans le parent

Le parent stocke les refs des éléments visibles, exécute un layout-effect après chaque rendu pour les mesurer. Moins réactif mais plus simple :

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

**Recommandation : Option A.** Séparation plus propre, exploite la détection de changement intégrée d'ink 7. Évite le risque de « tempête de mesures » où chaque rendu mesure tout.

### 6.3 `StaticRender` — implémentation personnalisée

gemini-cli importe `StaticRender` depuis `@jrichman/ink`. En regardant son utilisation dans `VirtualizedList.tsx` :

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

Sémantique : afficher `content` une fois à la largeur donnée ; les rendus ultérieurs avec la même clé + largeur retournent le rendu mis en cache.

Pour ink 7, l'équivalent est un simple `React.memo` avec un composant stable que le parent garantit de ne pas re-rendre. Implémentation personnalisée :

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

Combiné avec la prop `key` stable du parent (`${itemKey}-static-${width}`), changer les enfants ou la largeur provoque un nouveau montage ; sinon React évite le re-rendu.

C'est la capacité clé : les éléments qui sont statiques (ex. messages Gemini terminés) sont mesurés + rendus une fois et ne repassent jamais par React.

### 6.4 Mémoriser `HistoryItemDisplay`

gemini-cli fait :

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

Même modèle dans qwen-code. Nécessaire pour que la virtualisation saute vraiment les re-rendus.

## 7. Séquence des PR

| PR        | Titre (brouillon)                                                                                                                           | Portée                                                                                                                                                                              | Lignes            | Dépendances   | Risque                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------- | ---------------------------------------------- |
| **#4146** | feat(cli): viewport virtuel pour les longues conversations sur ink 7                                                                        | primitives de base + barre de défilement ASCII avec **animation de masquage automatique** + **molette de souris** SGR + porte `ui.useTerminalBuffer` + câblage `MainContent`/`AppContainer` + tests | ~2800 LoC         | `main`        | ✅ **livrée** — vérification de type propre, vitest vert |
| **V.3**   | test(integration): régressions de la suite de captures pour le streaming / redimensionnement / shell                                        | portage de 3 scripts de capture de la PR #3663                                                                                                                                      | ~2000 (tests uniquement) | #4146         | en attente                                     |
| **V.4**   | feat(cli): glisser de la barre de défilement + clic pour positionner                                                                        | Test de hit de souris SGR sur la colonne de la barre de défilement. Nécessite des coordonnées absolues à l'écran — soit `getBoundingBox` en amont vers ink 7 soit un propre parcours yoga. L'animation de masquage automatique est déjà livrée dans #4146. | ~400              | #4146         | reporté — blocage des coordonnées              |
| **V.5**   | feat(cli): recherche `/` dans l'application                                                                                                 | surlignage limité au viewport + navigation n/N (modèle `TranscriptSearchBar` de claude-code)                                                                                        | ~300              | #4146         | reporté                                        |
| **V.6**   | feat(cli): mode de tampon alternatif (prise de contrôle complète de l'écran alt)                                                            | paramètre supplémentaire `ui.useAlternateBuffer`                                                                                                                                    | ~500              | #4146         | reporté — décision UX séparée requise          |
| **V.7**   | recherche: préserver le défilement arrière du terminal hôte (double écriture)                                                               | `overflowToBackbuffer` de `@jrichman/ink` est réservé au fork. Options : PR en amont vers ink 7, propre double écriture, ou accepter la perte. Investigation.                       | —                 | #4146         | structurellement bloqué sur ink 7 standard     |
V.3 (tests d'intégration) est le dernier élément critique avant de changer la valeur par défaut. V.4–V.6 ferment les lacunes restantes de parité avec gemini-cli ; V.7 est une recherche ouverte car la propriété ink sous-jacente dont nous avons besoin (`overflowToBackbuffer`) n'existe que dans le fork `@jrichman/ink` de gemini-cli.

## 8. Plan de vérification

Par PR (obligatoire avant tout « prêt pour la relecture ») :

- `npm run typecheck --workspace=@qwen-code/qwen-code` — propre
- `npm run lint --workspace=@qwen-code/qwen-code` — propre
- `cd packages/cli && npx vitest run` — tout vert
- Audit sans direction en plusieurs passes selon le workflow du projet

De bout en bout (après V.3) :

- Benchmark de longue conversation : session de 1000 tours, mesurer
  - Temps d'affichage initial (montage initial + peinture)
  - Latence de la bascule Ctrl+O
  - Latence de redimensionnement
  - Temps de rendu par image pendant le streaming
- Comparer `useTerminalBuffer: false` (héritage) vs `true` (virtualisé)

## 9. Questions ouvertes / décisions nécessaires

1. **Nom du réglage** : `ui.useTerminalBuffer` (compatibilité gemini-cli) vs `ui.virtualizedHistory` (plus descriptif) ?
2. **Valeur par défaut** : livrer en tant que `false` (opt-in) ou déployer progressivement via une variable d'environnement d'abord ?
3. **Heuristique d'élément statique** : gemini-cli marque seulement `header` comme statique. Devrions-nous également marquer les messages Gemini terminés, les résultats d'outils qui ne sont plus dans `pendingHistoryItems`, etc. ?
4. **Support souris** : le `ScrollProvider` de gemini-cli inclut le glissement de la souris pour la barre de défilement. Vaut-il la peine de le porter maintenant ou de le reporter à V.4 ?
5. **Compatibilité avec #3905** : ~~La PR #3905 (correction du gel Ctrl+O) est ouverte et modifie le même `MainContent.tsx`. Coordonner l'ordre de fusion — probablement V.2 se rebase sur #3905.~~ **Résolu** : le replay progressif de #3905 a atterri dans `main` et est conservé dans la branche héritée `<Static>` de `MainContent.tsx` ; la branche VP le remplace pour les utilisateurs opt-in car le déclencheur de gel (remontage complet de Static) ne s'applique plus.
6. **Compatibilité avec `chore/re-upgrade-ink-7-0-3`** : La PR #4146 s'empile dessus. Après que #4119 (la PR de re-mise à niveau ink 7.0.3) fusionne dans `main`, la base de #4146 sera recentrée sur `main`.

## 10. Risques

| Risque                                                                                       | Probabilité | Atténuation                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `useBoxMetrics` par élément crée des tempêtes de mesure sur les longues listes               | moyenne     | L'option A du §6.2 mémorise déjà par élément ; seuls les éléments dans la fenêtre de rendu paient le coût. Benchmarké dans V.3. |
| L'implémentation personnalisée de `StaticRender` manque un cas limite géré par le fork @jrichman | moyenne     | Auditer le source de StaticRender de gemini-cli si disponible ; sinon se fier aux tests fonctionnels + benchmark.       |
| Dérive du chemin hérité `<Static>` à mesure que le nouveau chemin évolue                      | faible      | La barrière de fonctionnalité garde les deux chemins actifs ; CI exécute les deux via une matrice de réglage.          |
| ink 7 a toujours des bugs non résolus en amont                                               | faible      | Nous sommes déjà sur ink 7 via `chore/upgrade-ink-7` ; cette PR n'introduit pas de risque ink supplémentaire.          |
| Les sessions longues accumulent de la mémoire dans les caches de mesure                      | moyenne     | Ajouter une éviction LRU sur l'enregistrement `heights` une fois que la taille dépasse N×viewport (ex. 5×). Benchmarké dans V.3. |

## 11. Liste de contrôle d'approbation

- [x] Direction architecturale approuvée — port depuis gemini-cli (§4)
- [x] Nom du réglage + valeur par défaut décidée — `ui.useTerminalBuffer`, par défaut `false` (opt-in)
- [x] Heuristique d'élément statique — `isStaticItem={(item) => item.id > 0}` (éléments d'historique terminés)
- [x] Périmètre du support souris — reporté à V.4 ; défilement clavier uniquement dans #4146
- [x] Ordre de fusion avec #3905 (§9.5) — #3905 déjà dans `main` ; #4146 préserve le chemin hérité de replay progressif et le remplace seulement pour les utilisateurs VP
- [x] Implémentation de la PR #4146 terminée
