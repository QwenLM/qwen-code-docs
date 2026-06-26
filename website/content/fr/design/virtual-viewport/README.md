# Viewport virtuel pour les longues conversations sur ink 7

Statut : **implémenté**, PR #4144 embarque :
viewport central, barre de défilement ASCII avec animation de masquage automatique, molette de souris SGR, porte `ui.useTerminalBuffer`, touches de défilement clavier.
Le glissement de la barre de défilement, la recherche dans l'application, le mode écran alterné et la double écriture dans le scrollback de l'hôte sont exclus pour V.3+ (voir §7).
Auteur : 秦奇
Branche de suivi : `feat/virtual-viewport-on-ink7` (base : `main`)

## 1. Problème

Plusieurs problèmes de scintillement / latence rapportés par les utilisateurs trouvent tous leur origine dans le même fait architectural : le `<Static>` d'ink est **uniquement ajouté en fin de liste** et qwen-code `MainContent.tsx` alimente l'_intégralité_ de `mergedHistory` à travers lui à chaque rendu. Pour une conversation de 1000 tours, cela signifie 1000 rendus React `HistoryItemDisplay` + passes de mise en page ink par changement d'état.

Les symptômes actuels que cela permet :

| Problème       | Symptôme                                            | Contributeur actuel                                           |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| #2950          | Session longue affiche une tempête de défilement continu haut/bas | remontage complet Static à chaque rafraîchissement             |
| #3118          | Revenir à la fenêtre provoque un scintillement persistant | `clearTerminal` + `historyRemountKey++` déclenche un remontage complet |
| #3007          | Scintillement générique de l'interface               | identique à #3118                                              |
| #3838 (côté UI)| La barre de défilement grandit sans limite           | chaque rendu cumulatif ajoute des lignes ; pas d'éviction du viewport |
| #3899 → #3905  | Ctrl+O fige le terminal pendant plusieurs secondes   | le cas partiellement corrigé, scellé avec le découpage `setImmediate` |

PR #3905 note explicitement :

> La discussion sur les alternatives (préfixe scellé + queue en direct, **véritable virtualisation du viewport**, mise en cache des sorties ANSI) a été envisagée mais chacune change l'UX ou nécessite une réécriture architecturale.

Cette réécriture architecturale est ce que cette conception propose.

## 2. Implémentations de référence

Étude de deux CLIs open source basés sur ink qui ont déjà résolu (ou contourné) le même problème :

### 2.1 claude-code (`/Users/gawain/Documents/codebase/opensource/claude-code`)

Maintient son **propre fork d'ink** dans `src/ink/` :

- `ink.tsx` — 1722 LoC de boucle principale personnalisée
- `log-update.ts` — 773 LoC de rendu diff personnalisé avec optimisation de zone de défilement (`DECSTBM`), repli sur image complète lorsque le scrollback serait touché
- `screen.ts` / `frame.ts` — objets `Screen` / `Frame` explicites, diffing au niveau cellule `cellAt` / `diffEach`
- `render-to-screen.ts` — expose `renderToScreen(node)` pour rendre N'IMPORTE QUEL arbre de nœuds vers un objet `Screen` hors bande. C'est la capacité sous-jacente pour « rendre une fois, mettre en cache, rejouer » — c'est-à-dire la virtualisation
- `screens/REPL.tsx` :
  - `visibleStreamingText = streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null` — seules les lignes complètes sont exposées au rendu
  - `ScrollBox` avec `scrollRef`, `cursorNavRef`
  - `Markdown.tsx` `StreamingMarkdown` divise le contenu à la dernière limite de bloc de premier niveau, mémorise le préfixe stable, ne réanalyse que le suffixe instable
- Cache de jetons `Markdown.tsx` (LRU-500) — survie au démontage→remontage, donc les remontages du défilement virtuel frappent le cache sans re-lexing

**Pourquoi nous ne reproduisons pas cette approche** : forker ink dans son intégralité est une maintenance non soutenable (1722 LoC pour `ink.tsx` seulement, plus un réconciliateur personnalisé). Chaque correctif amont d'ink doit être fusionné manuellement. Ce coût est justifié pour l'échelle de claude-code ; pas pour qwen-code.

### 2.2 gemini-cli (`/Users/gawain/Documents/codebase/opensource/gemini-cli`)

Utilise `@jrichman/ink@6.6.9` (un fork plus petit qui ajoute les exports `ResizeObserver` et `StaticRender`), et embarque **une liste virtualisée complète comme de simples composants** :

| Fichier                                 | LoC | Rôle                                                                   |
| --------------------------------------- | --- | ---------------------------------------------------------------------- |
| `components/shared/VirtualizedList.tsx` | 764 | Viewport central + mesure + ancrage de défilement + suivi de redimensionnement par élément |
| `components/shared/ScrollableList.tsx`  | 278 | Enveloppe `VirtualizedList`, ajoute la navigation par touches + défilement fluide + barre de défilement |
| `contexts/ScrollProvider.tsx`           | 469 | Glissement souris, verrouillage de défilement, contexte de focus       |
| `hooks/useBatchedScroll.ts`             | 35  | Regroupe les mises à jour de défilement dans la même tick              |
| `hooks/useAnimatedScrollbar.ts`         | 130 | Animation d'apparition/disparition de la barre de défilement           |

`MainContent.tsx` bascule entre deux chemins de rendu via un indicateur `isAlternateBufferOrTerminalBuffer` :

```tsx
if (isAlternateBufferOrTerminalBuffer) {
  return <ScrollableList data={virtualizedData} renderItem={renderItem} ... />;
}

return <Static items={[<AppHeader />, ...staticHistoryItems, ...lastResponseHistoryItems]}>...</Static>;
```

`HistoryItemDisplay` est enveloppé dans `React.memo` donc les éléments inchangés ne se re-rendent pas.

**C'est la référence de qualité production.**

## 3. Vérification des capacités d'ink 7

qwen-code est sur la branche en cours `chore/upgrade-ink-7`. Exports inspectés de `node_modules/ink/build/index.d.ts` :

- ✅ `useBoxMetrics(ref): {width, height, left, top, hasMeasured}` — se met à jour automatiquement en cas de changement de mise en page. **Équivalent fonctionnel de `ResizeObserver`.**
- ✅ `measureElement(node)` — mesure impérative ponctuelle
- ✅ `useWindowSize` — redimensionnement du terminal
- ✅ `useAnimation` — pour l'atténuation de la barre de défilement
- ✅ `Static`, `Box`, `Text`, etc.
- ❌ `ResizeObserver` (composant/classe) — nécessite une adaptation
- ❌ `StaticRender` — nécessite une implémentation personnalisée

**Conclusion** : ink 7 possède toutes les primitives nécessaires. Aucun changement de fork requis.

## 4. Décision stratégique

**Porter `ScrollableList` + `VirtualizedList` + hooks/contexts de support de gemini-cli vers qwen-code, en adaptant `ResizeObserver` → `useBoxMetrics` et en concevant un `StaticRender` personnalisé.**

Alternatives rejetées :

| Alternative                       | Raison du rejet                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Forker ink comme claude-code      | Charge de maintenance insoutenable                                                                                 |
| Passer à `@jrichman/ink`          | Inverserait la migration en cours vers ink 7 ; perdrait les améliorations d'ink 7 (React 19.2 + réconciliateur 0.33 + nouveau rendu diff) |
| Construire la virtualisation depuis zéro | Réinventer ~1700 LoC de conception éprouvée ; la référence de gemini-cli existe et fonctionne                      |

## 5. Architecture

### Plan des fichiers après PR #4146

```
packages/cli/src/ui/
├── components/shared/
│   ├── VirtualizedList.tsx          [NOUVEAU] viewport central + barre de défilement ASCII
│   ├── ScrollableList.tsx           [NOUVEAU] enveloppe clavier + molette
│   └── StaticRender.tsx             [NOUVEAU] enveloppe React.memo (remplace l'export du fork ink de gemini-cli)
├── hooks/
│   ├── useBatchedScroll.ts          [NOUVEAU] regroupe les mises à jour de défilement dans la même tick
│   ├── useMouseEvents.ts            [NOUVEAU] active le mode souris SGR + analyse des événements stdin
│   └── useAnimatedScrollbar.ts      [NOUVEAU] flash du curseur au défilement + masquage automatique au repos
├── utils/
│   └── mouse.ts                     [NOUVEAU] analyseur d'événements souris SGR + X11 (port depuis gemini-cli)
├── components/MainContent.tsx       [MODIF] ajout de la branche virtualisée + références de stabilité
└── AppContainer.tsx                 [MODIF] alimente l'état de l'UI lié au défilement dans le contexte + porte refreshStatic
```

Reporté aux PRs suivantes :

- **Glissement de la barre de défilement + clic pour se positionner** — nécessite les coordonnées absolues des éléments à l'écran, bloqué par une limitation du stock ink 7 (voir V.4 / V.7).
- **Recherche `/` dans l'application** — modèle `TranscriptSearchBar` de claude-code (V.5).
- **Mode écran alterné** — style `contexts/ScrollProvider.tsx` pour focus / verrouillage, avec prise en charge complète de l'écran alternatif (V.6).

### Réglage (V.2)

```ts
// schéma des paramètres
ui: {
  /**
   * Active le rendu virtualisé de l'historique pour les longues conversations.
   * Quand cette option est vraie, seuls les éléments dans le viewport visible sont rendus via React ;
   * les éléments défilés hors de l'écran restent dans le buffer de scrollback du terminal.
   *
   * Par défaut : false. Opt-in jusqu'à preuve de stabilité sur les longues conversations.
   */
  useTerminalBuffer?: boolean;  // alias conservé pour la compatibilité avec gemini-cli
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

Le chemin `<Static>` hérité reste tel quel — aucun risque de régression pour les utilisateurs qui n'optent pas.

## 6. Adaptations clés à partir de la source gemini-cli

### 6.1 `ResizeObserver` → `useBoxMetrics`

Observateur de conteneur de gemini-cli (modèle impératif) :

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

Notre adaptation (hook déclaratif ink 7) :

```ts
const containerRef = useRef<DOMElement>(null);
const { width: containerWidth, height: containerHeight } =
  useBoxMetrics(containerRef);
```

`useBoxMetrics` gère déjà l'attachement/détachement + l'abonnement aux changements de mise en page ; la gestion impérative disparaît.

### 6.2 Traqueur de redimensionnement par élément (`itemsObserver`)

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

**Option A — pousser la mesure vers le bas dans `VirtualizedListItem`**

Chaque `VirtualizedListItem` s'exécute déjà comme son propre composant (mémorisé). Ajouter `useBoxMetrics` à l'intérieur ; remonter la hauteur via une prop de callback :

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

Le parent stocke les refs pour les éléments visibles, exécute un effet de mise en page après chaque rendu pour les mesurer. Moins réactif mais plus simple :

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

**Recommandation : Option A.** Séparation plus propre, tire parti de la détection intégrée des changements d'ink 7. Évite le risque de « tempête de mesures » où chaque rendu mesure tout.

### 6.3 `StaticRender` — implémentation personnalisée

gemini-cli importe `StaticRender` depuis `@jrichman/ink`. En regardant l'utilisation dans `VirtualizedList.tsx` :

```tsx
{shouldBeStatic ? (
  <StaticRender width={...} key={`${itemKey}-static-${width}`}>
    {content}
  </StaticRender>
) : (
  content
)}
```

Sémantique : rendre `content` une fois à la largeur donnée ; les rendus suivants avec la même clé + largeur renvoient le rendu mis en cache.

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

Combiné avec la prop `key` stable du parent (`${itemKey}-static-${width}`), un changement de children ou de largeur provoque un nouveau montage ; sinon React saute le re-rendu.

C'est la capacité centrale : les éléments qui SONT statiques (par exemple les messages Gemini terminés) sont mesurés + rendus une fois et ne traversent plus jamais React.

### 6.4 Mémoriser `HistoryItemDisplay`

gemini-cli fait :

```ts
const MemoizedHistoryItemDisplay = memo(HistoryItemDisplay);
```

Même modèle dans qwen-code. Requis pour que la virtualisation saute effectivement les re-rendus.

## 7. Séquence des PR

| PR        | Titre (provisoire)                                                            | Périmètre                                                                                                                                                                             | Lignes            | Dépendances | Risque                                            |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------- | ------------------------------------------------- |
| **#4146** | feat(cli) : viewport virtuel pour les longues conversations sur ink 7        | primitives centrales + barre de défilement ASCII avec **animation de masquage automatique** + **molette** SGR + porte `ui.useTerminalBuffer` + câblage `MainContent`/`AppContainer` + tests | ~2800 LoC         | `main`      | ✅ **livré** — vérification de type propre, vitest vert |
| **V.3**   | test(integration) : suite de captures pour les régressions streaming / redimensionnement / shell | porter 3 scripts de capture de PR #3663                                                                                                                                               | ~2000 (tests uniquement) | #4146       | en attente                                      |
| **V.4**   | feat(cli) : glissement de la barre de défilement + clic pour se positionner   | Test de hit souris SGR sur la colonne de la barre de défilement. Nécessite des coordonnées absolues à l'écran — soit un `getBoundingBox` amont vers ink 7, soit un propre walker yoga. Animation de masquage automatique déjà livrée dans #4146. | ~400              | #4146       | reporté — bloqué par les coordonnées               |
| **V.5**   | feat(cli) : recherche `/` dans l'application                                  | surlignage limité au viewport + navigation n/N (modèle `TranscriptSearchBar` de claude-code)                                                                                         | ~300              | #4146       | reporté                                           |
| **V.6**   | feat(cli) : mode écran alterné (prise en charge complète de l'écran alternatif) | réglage supplémentaire `ui.useAlternateBuffer`                                                                                                                                        | ~500              | #4146       | reporté — décision UX séparée requise              |
| **V.7**   | recherche : préserver le scrollback du terminal hôte (double écriture)        | `overflowToBackbuffer` de `@jrichman/ink` est exclusif au fork. Options : PR amont vers ink 7, propre double écriture, ou accepter la perte. Investigation. | —                 | #4146       | structurellement bloqué sur stock ink 7            |

V.3 (tests d'intégration) est l'élément restant du chemin critique avant de basculer la valeur par défaut. V.4–V.6 comblent les lacunes restantes de parité avec gemini-cli ; V.7 est une recherche ouverte car la propriété ink sous-jacente dont nous aurions besoin (`overflowToBackbuffer`) n'existe que dans le fork `@jrichman/ink` de gemini-cli.

## 8. Plan de vérification

Par PR (obligatoire avant tout « prêt pour la relecture ») :

- `npm run typecheck --workspace=@qwen-code/qwen-code` — propre
- `npm run lint --workspace=@qwen-code/qwen-code` — propre
- `cd packages/cli && npx vitest run` — tout vert
- Audit multidirectionnel sans direction selon le processus du projet

De bout en bout (après V.3) :

- Benchmark de longue conversation : session de 1000 tours, mesurer
  - Temps d'affichage initial (montage initial + peinture)
  - Latence du basculement Ctrl+O
  - Latence du redimensionnement
  - Temps de rendu par cadre pendant le streaming
- Comparer `useTerminalBuffer: false` (héritage) vs `true` (virtualisé)

## 9. Questions ouvertes / décisions nécessaires

1. **Nom du réglage** : `ui.useTerminalBuffer` (compatibilité gemini-cli) vs `ui.virtualizedHistory` (plus descriptif) ?
2. **Valeur par défaut** : livrer avec `false` (opt-in) ou déploiement progressif via une variable d'environnement d'abord ?
3. **Heuristique d'élément statique** : gemini-cli ne marque que `header` comme statique. Devrions-nous aussi marquer les messages Gemini terminés, les résultats d'outils qui ne sont plus dans `pendingHistoryItems`, etc. ?
4. **Support souris** : `ScrollProvider` de gemini-cli inclut le glissement de la souris pour la barre de défilement. Vaut-il la peine de le porter maintenant ou de le sauter jusqu'à V.4 ?
5. **Compatibilité avec #3905** : ~~PR #3905 (correction du blocage Ctrl+O) est ouverte et modifie le même `MainContent.tsx`. Coordonner l'ordre de fusion — probablement V.2 se rebase sur #3905.~~ **Résolu** : le rejeu progressif de #3905 a atterri dans `main` et est préservé dans la branche `<Static>` héritée de `MainContent.tsx` ; la branche VP le remplace pour les utilisateurs opt-in car le déclencheur de blocage (remontage complet de Static) ne s'applique plus.
6. **Compatibilité avec `chore/re-upgrade-ink-7-0-3`** : PR #4146 s'empile dessus. Après la fusion de #4119 (la PR de re-mise à niveau vers ink 7.0.3) dans `main`, la base de PR #4146 sera re-ciblée sur `main`.

## 10. Risques

| Risque                                                                      | Probabilité | Atténuation                                                                                              |
| --------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `useBoxMetrics` par élément crée des tempêtes de mesure sur les longues listes | moyenne     | L'option A du §6.2 mémorise déjà par élément ; seuls les éléments dans la fenêtre de rendu paient le coût. Benchmark dans V.3. |
| L'implémentation personnalisée de `StaticRender` manque un cas limite que le fork @jrichman gérait | moyenne     | Auditer le source `StaticRender` de gemini-cli si disponible ; sinon s'appuyer sur les tests fonctionnels + benchmark. |
| Dérive du chemin `<Static>` hérité au fur et à mesure que le nouveau chemin évolue | faible      | La porte de feature flag maintient les deux chemins actifs ; CI exécute les deux via une matrice de réglages. |
| ink 7 a encore des bugs non résolus en amont                                | faible      | Nous sommes déjà sur ink 7 via `chore/upgrade-ink-7` ; cette PR n'introduit pas de risque ink supplémentaire. |
| Les sessions longues accumulent de la mémoire dans les caches de mesure     | moyenne     | Ajouter une éviction LRU sur l'enregistrement `heights` une fois que la taille dépasse N×viewport (par ex. 5×). V.3 benchmarke cela. |
## 11. Checklist d'approbation

- [x] Orientation architecturale approuvée — portage depuis gemini-cli (§4)
- [x] Nom du paramètre + valeur par défaut décidée — `ui.useTerminalBuffer`, `false` par défaut (opt-in)
- [x] Heuristique des éléments statiques — `isStaticItem={(item) => item.id > 0}` (éléments d'historique terminés)
- [x] Périmètre du support souris — reporté à la V.4 ; défilement clavier uniquement dans #4146
- [x] Ordre de fusion avec #3905 (§9.5) — #3905 déjà dans `main` ; #4146 préserve le chemin historique de rejeu progressif et le remplace uniquement pour les utilisateurs VP
- [x] Implémentation de la PR #4146 terminée