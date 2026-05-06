# Conception du mode compact : analyse concurrentielle et optimisation

> Basculement du mode compact/verbeux via Ctrl+O — analyse concurrentielle avec Claude Code, revue de l'implémentation actuelle et recommandations d'optimisation.
>
> Documentation utilisateur : [Settings — ui.compactMode](../../users/configuration/settings.md).

## 1. Résumé

Qwen Code et Claude Code proposent tous deux un raccourci Ctrl+O pour basculer entre les vues compacte et détaillée des sorties d'outils, mais **la philosophie de conception, l'état par défaut et le modèle d'interaction diffèrent fondamentalement**. Ce document propose une comparaison approfondie au niveau du code source, identifie les lacunes UX et suggère des optimisations pour Qwen Code.

| Dimension            | Claude Code                                 | Qwen Code                                     |
| -------------------- | ------------------------------------------- | --------------------------------------------- |
| Mode par défaut      | Compact (`verbose=false`)                   | Verbeux (`compactMode=false`)                 |
| Sémantique du basculement | Aperçu temporaire des détails           | Changement de préférence persistant           |
| Persistance          | Limitée à la session, réinitialisée au redémarrage | Persistée dans `settings.json`          |
| Portée               | Basculement global d'écran (prompt ↔ transcript) | Basculement de rendu par composant        |
| Capture figée        | Aucune (concept inexistant)                 | Aucune (supprimée)                            |
| Indice d'expansion par outil | Oui (`"ctrl+o to expand"`)          | Oui (`"Press Ctrl+O to show full tool output"`) |

## 2. Analyse de l'implémentation de Claude Code

### 2.1 Architecture

Claude Code utilise une approche **basée sur l'écran** plutôt qu'un basculement de rendu au niveau des composants :

```
┌──────────────────────────────────┐
│         AppState (Zustand)       │
│  verbose: boolean (default: false)│
│  screen: 'prompt' | 'transcript' │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  toggles screen mode
     │  Handler    │  NOT a rendering flag
     └─────┬──────┘
           │
     ┌─────▼──────────────┐
     │    REPL.tsx         │
     │  screen='prompt'  → compact view (default)
     │  screen='transcript'→ detailed view
     └────────────────────────┘
```

### 2.2 Fichiers sources clés

| Composant        | Fichier                                               | Logique clé                                               |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Gestionnaire de basculement | `src/hooks/useGlobalKeybindings.tsx:90-132`        | Bascule `screen` entre `'prompt'` et `'transcript'`       |
| Raccourci clavier | `src/keybindings/defaultBindings.ts:44`              | `app:toggleTranscript`                                    |
| Définition de l'état | `src/state/AppStateStore.ts:472`                   | `verbose: false` (limité à la session)                    |
| Indice d'expansion | `src/components/CtrlOToExpand.tsx:29-46`           | Texte `"(ctrl+o to expand)"` par outil                    |
| Filtre de messages | `src/components/Messages.tsx:93-151`               | `filterForBriefTool()` pour la vue compacte               |
| Autorisation       | `src/components/permissions/PermissionRequest.tsx` | Rendu dans un calque superposé, jamais masqué             |

### 2.3 Décisions de conception

1. **Le mode compact est activé par défaut.** Les utilisateurs voient une interface épurée dès le départ ; les détails sont activés sur demande.
2. **Limité à la session.** `verbose` est réinitialisé à `false` à chaque nouvelle session — Claude Code part du principe que les utilisateurs préfèrent généralement la vue compacte et n'ont besoin des détails que temporairement.
3. **Basculement au niveau de l'écran.** Ctrl+O ne modifie pas le rendu des composants ; il bascule l'affichage entier entre un écran "prompt" (compact) et un écran "transcript" (détaillé).
4. **Aucune capture figée.** Le concept de gel de capture n'existe pas. Lors du basculement, l'affichage se met à jour immédiatement avec l'état actuel.
5. **Les boîtes de dialogue d'autorisation sont séparées.** Les validations d'outils sont rendues dans un calque superposé dédié, jamais affecté par le basculement verbeux/compact.
6. **Indice par outil.** Le composant `CtrlOToExpand` affiche un indice contextuel sur les outils individuels lorsqu'ils produisent une sortie volumineuse, supprimé dans les sous-agents.

### 2.4 Flux utilisateur

```
Session start → compact mode (default)
     │
     ├─ Tool outputs are summarized in a single line
     ├─ Large tool output shows "(ctrl+o to expand)" hint
     │
     ├─ User presses Ctrl+O
     │     └─→ Screen switches to transcript (detailed view)
     │         └─ User sees all tool output, thinking, etc.
     │
     ├─ User presses Ctrl+O again
     │     └─→ Screen switches back to prompt (compact)
     │
     └─ Session ends → verbose resets to false
```

## 3. Analyse de l'implémentation de Qwen Code

### 3.1 Architecture

Qwen Code utilise un **indicateur de rendu au niveau des composants** que chaque composant UI lit depuis le contexte :

```
┌─────────────────────────────────────┐
│      CompactModeContext             │
│  compactMode: boolean (default: false)│
│  setCompactMode: (v) => void        │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  toggles compactMode
     │  Handler    │  persists to settings
     └─────┬──────┘
           │
     ┌─────▼──────────────────┐
     │  Each component reads  │
     │  compactMode and       │
     │  decides how to render │
     └────────────────────────┘
           │
     ┌─────▼──────────────────────────────┐
     │  ToolGroupMessage                   │
     │    showCompact = compactMode        │
     │      && !hasConfirmingTool          │
     │      && !hasErrorTool               │
     │      && !isEmbeddedShellFocused     │
     │      && !isUserInitiated            │
     └────────────────────────────────────┘
```

### 3.2 Fichiers sources clés

| Composant       | Fichier                                  | Logique clé                                       |
| --------------- | ---------------------------------------- | ------------------------------------------------- |
| Gestionnaire de basculement | `AppContainer.tsx:1684-1690`          | Bascule `compactMode`, persiste dans les paramètres |
| Contexte        | `CompactModeContext.tsx`                 | `compactMode`, `setCompactMode`                   |
| Groupe d'outils | `ToolGroupMessage.tsx:105-110`           | `showCompact` avec 4 conditions d'expansion forcée |
| Message d'outil | `ToolMessage.tsx:346-350`                | Masque `displayRenderer` en mode compact          |
| Affichage compact | `CompactToolGroupDisplay.tsx:49-108`   | Résumé sur une ligne avec statut + indice         |
| Confirmation    | `ToolConfirmationMessage.tsx:113-147`    | Approbation compacte simplifiée à 3 options       |
| Astuces         | `Tips.tsx:14-29`                         | La rotation des astuces au démarrage inclut l'indice du mode compact |
| Synchronisation des paramètres | `SettingsDialog.tsx:189-193`      | Synchronise avec CompactModeContext + refreshStatic |
| MainContent     | `MainContent.tsx:60-76`                  | Rendu des `pendingHistoryItems` en direct         |
| Réflexion       | `HistoryItemDisplay.tsx:123-133`         | Masque `gemini_thought` en mode compact           |

### 3.3 Décisions de conception

1. **Le mode verbeux est activé par défaut.** Les utilisateurs voient toutes les sorties d'outils et la réflexion par défaut.
2. **Préférence persistante.** `compactMode` est enregistré dans `settings.json` et survit aux sessions.
3. **Rendu au niveau des composants.** Chaque composant lit `compactMode` depuis le contexte et ajuste son propre rendu.
4. **Protection par expansion forcée.** Quatre conditions remplacent le mode compact pour garantir que les éléments UI critiques restent toujours visibles (confirmations, erreurs, shell, actions initiées par l'utilisateur).
5. **Aucune capture figée.** Le basculement affiche toujours la sortie en direct — pas de captures figées.
6. **Synchronisation avec la boîte de dialogue des paramètres.** Le basculement du mode compact depuis les paramètres met à jour l'état React immédiatement via `setCompactMode`.
7. **Découverte non intrusive.** Le mode compact est présenté via la rotation des astuces au démarrage plutôt que par un indicateur persistant en pied de page, évitant ainsi la surcharge visuelle.

### 3.4 Flux utilisateur

```
Session start → verbose mode (default)
     │
     ├─ All tool outputs, thinking, details visible
     │
     ├─ User presses Ctrl+O (or toggles in Settings)
     │     └─→ compactMode = true, persisted
     │         ├─ Tool groups show single-line summary
     │         ├─ Thinking/thought content hidden
     │         └─ Confirmations, errors, shell still expanded
     │
     ├─ User presses Ctrl+O again
     │     └─→ compactMode = false, persisted
     │         └─ All details visible again
     │
     └─ Next session → same mode as last session
```

## 4. Analyse approfondie des différences clés

### 4.1 Philosophie du mode par défaut

| Aspect               | Claude Code (compact par défaut)         | Qwen Code (verbeux par défaut)                   |
| -------------------- | ---------------------------------------- | ------------------------------------------------ |
| Première impression  | Épuré, minimal — aspect professionnel    | Riche en informations — transparence totale      |
| Courbe d'apprentissage | L'utilisateur doit apprendre Ctrl+O pour voir les détails | L'utilisateur peut tout voir immédiatement |
| Public cible         | Utilisateurs expérimentés qui font confiance à l'outil | Utilisateurs souhaitant comprendre ce qui se passe |
| Surcharge d'information | Évitée par défaut                      | Possible pour les nouveaux utilisateurs          |
| Découvrabilité       | Indices `"(ctrl+o to expand)"` par outil | Rotation des astuces au démarrage + raccourcis ? + /help |

**Analyse :** Le mode compact par défaut de Claude Code fonctionne car sa base d'utilisateurs est généralement composée de développeurs expérimentés qui font confiance à l'outil et n'ont pas besoin de voir chaque invocation. Le mode verbeux par défaut de Qwen Code est adapté à son stade actuel, où la transparence est essentielle pour instaurer la confiance des utilisateurs.

### 4.2 Modèle de persistance

| Aspect           | Claude Code               | Qwen Code                  |
| ---------------- | ------------------------- | -------------------------- |
| Persisté ?       | Non — limité à la session | Oui — dans `settings.json` |
| Justification    | Le mode verbeux est un aperçu temporaire | Le mode est une préférence utilisateur |
| Comportement au redémarrage | Commence toujours en mode compact | Commence avec le dernier mode utilisé |

**Analyse :** Claude Code considère la consultation des détails comme un besoin ponctuel — on regarde, puis on revient en arrière. Qwen Code le traite comme une préférence stable — certains utilisateurs veulent toujours les détails, d'autres toujours le mode compact. Les deux approches sont valides ; celle de Qwen Code est plus flexible.

### 4.3 Protection des confirmations

| Aspect                  | Claude Code                                 | Qwen Code                                            |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Mécanisme               | Calque superposé/modal (structurellement séparé) | Conditions d'expansion forcée dans `showCompact`     |
| Couverture              | Totale — les validations ne peuvent jamais être masquées | Totale — 4 conditions couvrent tous les états interactifs |
| UI de confirmation compacte | N/A (la superposition est toujours complète) | `RadioButtonSelect` simplifié à 3 options            |

**Analyse :** La séparation architecturale de Claude Code (calque superposé) est plus robuste. L'approche par expansion forcée de Qwen Code est efficace, mais nécessite d'ajouter explicitement chaque nouvel état interactif à la liste des conditions.

### 4.4 Approche de rendu

| Aspect       | Claude Code                         | Qwen Code                                  |
| ------------ | ----------------------------------- | ------------------------------------------ |
| Portée du basculement | Niveau écran (prompt ↔ transcript) | Niveau composant (chaque composant décide) |
| Granularité  | Tout ou rien                        | Fine, par composant                        |
| Flexibilité  | Faible — commutateur global         | Haute — les composants peuvent remplacer   |
| Cohérence    | Garantie                            | Dépend de l'implémentation de chaque composant |

**Analyse :** L'approche au niveau des composants de Qwen Code est plus flexible (ex. : expansion forcée pour des conditions spécifiques) mais exige plus de rigueur pour maintenir la cohérence. L'approche au niveau de l'écran de Claude Code est plus simple et garantit un comportement uniforme.

## 5. Recommandations d'optimisation

### 5.1 [P0] Conserver le mode verbeux par défaut — Aucun changement nécessaire

Le mode verbeux par défaut de Qwen Code est la bonne décision pour son stade actuel. Les nouveaux utilisateurs ont besoin de transparence pour instaurer la confiance. À mesure que le produit mûrit, envisagez de passer au mode compact par défaut (comme Claude Code).

### 5.2 [P1] Expansion par outil pour les sorties volumineuses

Claude Code affiche `"(ctrl+o to expand)"` sur les outils individuels produisant une sortie volumineuse. Qwen Code ne dispose actuellement que d'un basculement global. Envisagez :

- Lorsqu'un outil produit une sortie dépassant N lignes, afficher un indice "expand" par outil en mode compact.
- Portée : amélioration future, non prioritaire actuellement.

### 5.3 [P2] Envisager un remplacement limité à la session

Certains utilisateurs peuvent souhaiter le mode compact par défaut, mais avoir occasionnellement besoin du mode verbeux pour une session spécifique. Envisagez de prendre en charge les deux :

- `settings.json` → valeur par défaut persistante (comportement actuel)
- Ctrl+O pendant la session → remplacement temporaire pour la session en cours uniquement (comportement de Claude Code)
- Au redémarrage de la session → retour à la valeur de `settings.json`

Cela offre aux utilisateurs le meilleur des deux mondes. L'implémentation nécessiterait de séparer l'état "valeur par défaut des paramètres" de l'état "remplacement de session".

### 5.4 [P2] Séparation structurelle pour les confirmations

Actuellement, la protection des confirmations repose sur les conditions `showCompact` dans `ToolGroupMessage`. Envisagez une approche plus robuste :

- Rendre les confirmations dans un calque séparé (comme l'approche par superposition de Claude Code).
- Cela rendrait architecturalement impossible l'impact du mode compact sur les confirmations.
- Priorité plus faible car l'approche actuelle par expansion forcée fonctionne correctement.

## 6. État actuel de l'implémentation

Après les modifications de la branche `feat/compact-mode-optimization` :

| Fonctionnalité                          | Statut | Notes                                             |
| --------------------------------------- | ------ | ------------------------------------------------- |
| Astuce au démarrage                     | Terminé | Astuce du mode compact dans la rotation Tips (non intrusive) |
| Ctrl+O dans les raccourcis clavier (?)  | Terminé | Ajouté au composant KeyboardShortcuts             |
| Ctrl+O dans /help                       | Terminé | Ajouté au composant Help                          |
| Synchronisation des paramètres          | Terminé | Synchronise compactMode avec CompactModeContext   |
| Aucune capture figée                    | Terminé | Le basculement affiche toujours la sortie en direct |
| Protection des confirmations            | Terminé | Expansion forcée + garde `WaitingForConfirmation` |
| Protection du shell                     | Terminé | Expansion forcée `!isEmbeddedShellFocused`        |
| Protection des erreurs                  | Terminé | Expansion forcée `!hasErrorTool`                  |
| Documentation utilisateur mise à jour   | Terminé | `settings.md`, `keyboard-shortcuts.md`            |

## 7. Référence des fichiers

### Qwen Code

| Fichier                                                                  | Objectif                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `packages/cli/src/ui/AppContainer.tsx`                                   | Gestionnaire de basculement, initialisation de l'état, fournisseur de contexte |
| `packages/cli/src/ui/contexts/CompactModeContext.tsx`                    | Définition du contexte                                  |
| `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`           | Logique d'expansion forcée                              |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`                | Masquage de la sortie par outil                         |
| `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx`    | Rendu de la vue compacte                                |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx`    | UI de confirmation compacte                             |
| `packages/cli/src/ui/components/MainContent.tsx`                         | Rendu des éléments d'historique en attente              |
| `packages/cli/src/ui/components/Tips.tsx`                                | Astuce au démarrage avec indice du mode compact         |
| `packages/cli/src/ui/components/Help.tsx`                                | Entrée de raccourci /help                               |
| `packages/cli/src/ui/components/KeyboardShortcuts.tsx`                   | Entrée de raccourci ?                                   |
| `packages/cli/src/ui/components/SettingsDialog.tsx`                      | Synchronisation des paramètres                          |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`                  | Masquage du contenu de réflexion                        |
| `packages/cli/src/config/settingsSchema.ts`                              | Définition du paramètre                                 |
| `packages/cli/src/config/keyBindings.ts`                                 | Raccourci Ctrl+O                                        |

### Claude Code (Référence)

| Fichier                                               | Objectif                           |
| ----------------------------------------------------- | ---------------------------------- |
| `src/hooks/useGlobalKeybindings.tsx`                  | Gestionnaire de basculement        |
| `src/state/AppStateStore.ts`                          | Définition de l'état (`verbose: false`) |
| `src/components/CtrlOToExpand.tsx`                    | Indice d'expansion par outil       |
| `src/components/Messages.tsx`                         | Filtre de messages brefs           |
| `src/screens/REPL.tsx`                                | Basculement de mode au niveau de l'écran |
| `src/components/permissions/PermissionRequest.tsx`    | Confirmation basée sur une superposition |