# Conception du mode compact : analyse concurrentielle et optimisation

> Ctrl+O pour basculer entre mode compact et mode verbeux — analyse concurrentielle avec Claude Code, revue de l'implémentation actuelle et recommandations d'optimisation.
>
> Documentation utilisateur : [Settings — ui.compactMode](../../users/configuration/settings.md).

## 1. Résumé exécutif

Qwen Code et Claude Code proposent tous deux un raccourci Ctrl+O pour basculer entre une vue compacte et une vue détaillée des sorties d'outils, mais la **philosophie de conception, l'état par défaut et le modèle d'interaction diffèrent fondamentalement**. Ce document fournit une comparaison approfondie au niveau du code source, identifie les lacunes UX et propose des optimisations pour Qwen Code.

| Dimension          | Claude Code                                 | Qwen Code                                     |
| ------------------ | ------------------------------------------- | --------------------------------------------- |
| Mode par défaut    | Compact (verbose=false)                     | Verbeux (compactMode=false)                   |
| Sémantique du basculement | Affichage temporaire des détails         | Changement de préférence persistant           |
| Persistance        | Limité à la session, réinitialisé au redémarrage | Persisté dans settings.json             |
| Portée             | Bascule globale d'écran (prompt ↔ transcript) | Bascule de rendu par composant            |
| Instantané figé    | Aucun (concept inexistant)                  | Aucun (supprimé)                              |
| Indice d'extension par outil | Oui (« ctrl+o to expand »)           | Oui (« Press Ctrl+O to show full tool output ») |

## 2. Analyse de l'implémentation de Claude Code

### 2.1 Architecture

Claude Code utilise une approche **basée sur l'écran** plutôt qu'un basculement de rendu au niveau composant :

```
┌──────────────────────────────────┐
│         AppState (Zustand)       │
│  verbose: boolean (default: false)│
│  screen: 'prompt' | 'transcript' │
└──────────┬───────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  bascule le mode d'écran
     │  Handler   │  PAS un indicateur de rendu
     └─────┬──────┘
           │
     ┌─────▼──────────────┐
     │    REPL.tsx         │
     │  screen='prompt'  → vue compacte (défaut)
     │  screen='transcript'→ vue détaillée
     └────────────────────┘
```

### 2.2 Fichiers source clés

| Composant          | Fichier                                               | Logique clé                                               |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------------- |
| Gestionnaire de basculement | `src/hooks/useGlobalKeybindings.tsx:90-132`   | Bascule `screen` entre `'prompt'` et `'transcript'`       |
| Raccourci clavier  | `src/keybindings/defaultBindings.ts:44`               | `app:toggleTranscript`                                    |
| Définition d'état  | `src/state/AppStateStore.ts:472`                      | `verbose: false` (session uniquement)                     |
| Indice d'extension | `src/components/CtrlOToExpand.tsx:29-46`              | Texte « (ctrl+o to expand) » par outil                    |
| Filtre de messages | `src/components/Messages.tsx:93-151`                  | `filterForBriefTool()` pour la vue compacte               |
| Permission         | `src/components/permissions/PermissionRequest.tsx`    | Rendu en couche de superposition, jamais masqué           |

### 2.3 Décisions de conception

1. **Le mode compact est le défaut.** Les utilisateurs voient une interface épurée dès le départ ; l'affichage des détails est optionnel.
2. **Limité à la session.** `verbose` est réinitialisé à `false` à chaque nouvelle session — Claude Code part du principe que les utilisateurs préfèrent généralement la vue compacte et n'ont besoin des détails que temporairement.
3. **Basculement au niveau de l'écran.** Ctrl+O ne modifie pas la façon dont les composants s'affichent ; il bascule l'affichage complet entre un écran « prompt » (compact) et un écran « transcript » (détaillé).
4. **Pas d'instantané figé.** Aucun concept de snapshot figé. Lors du basculement, l'affichage se met à jour immédiatement avec l'état actuel.
5. **Les dialogues de permission sont séparés.** Les approbations d'outils sont rendues dans une couche de superposition dédiée qui n'est jamais affectée par le basculement verbeux/compact.
6. **Indice par outil.** Le composant `CtrlOToExpand` affiche un indice contextuel sur les outils individuels lorsqu'ils produisent une sortie volumineuse, masqué dans les sous-agents.

### 2.4 Parcours utilisateur

```
Début de session → mode compact (défaut)
     │
     ├─ Les sorties d'outils sont résumées en une seule ligne
     ├─ Les sorties volumineuses affichent l'indice « (ctrl+o to expand) »
     │
     ├─ L'utilisateur appuie sur Ctrl+O
     │     └─→ L'écran passe en mode transcript (vue détaillée)
     │         └─ L'utilisateur voit toutes les sorties, réflexions, etc.
     │
     ├─ L'utilisateur appuie à nouveau sur Ctrl+O
     │     └─→ L'écran revient en mode prompt (compact)
     │
     └─ Fin de session → verbose repasse à false
```

## 3. Analyse de l'implémentation de Qwen Code

### 3.1 Architecture

Qwen Code utilise un **indicateur de rendu au niveau composant** que chaque composant UI lit depuis le contexte :

```
┌─────────────────────────────────────┐
│      CompactModeContext             │
│  compactMode: boolean (default: false)│
│  setCompactMode: (v) => void        │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     │  Ctrl+O    │  bascule compactMode
     │  Handler   │  persisté dans settings
     └─────┬──────┘
           │
     ┌─────▼──────────────────┐
     │  Chaque composant lit  │
     │  compactMode et        │
     │  décide du rendu       │
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

### 3.2 Fichiers source clés

| Composant       | Fichier                                  | Logique clé                                       |
| --------------- | ---------------------------------------- | ------------------------------------------------- |
| Gestionnaire de basculement | `AppContainer.tsx:1684-1690`  | Bascule `compactMode`, persisté dans settings     |
| Contexte        | `CompactModeContext.tsx`                 | `compactMode`, `setCompactMode`                   |
| Groupe d'outils | `ToolGroupMessage.tsx:105-110`           | `showCompact` avec 4 conditions de force-expand   |
| Message d'outil  | `ToolMessage.tsx:346-350`               | Masque `displayRenderer` en mode compact          |
| Affichage compact | `CompactToolGroupDisplay.tsx:49-108`   | Résumé sur une ligne avec statut + indice         |
| Confirmation    | `ToolConfirmationMessage.tsx:113-147`    | Approbation compacte simplifiée à 3 options       |
| Astuces         | `Tips.tsx:14-29`                         | La rotation d'astuces au démarrage inclut l'indice du mode compact |
| Synchronisation des paramètres | `SettingsDialog.tsx:189-193` | Synchronisation avec CompactModeContext + refreshStatic |
| Contenu principal | `MainContent.tsx:60-76`               | Affiche les pendingHistoryItems en direct         |
| Réflexion       | `HistoryItemDisplay.tsx:123-133`         | Masque `gemini_thought` en mode compact           |

### 3.3 Décisions de conception

1. **Le mode verbeux est le défaut.** Les utilisateurs voient toutes les sorties d'outils et réflexions par défaut.
2. **Préférence persistante.** `compactMode` est sauvegardé dans `settings.json` et survit aux sessions.
3. **Rendu au niveau composant.** Chaque composant lit `compactMode` depuis le contexte et ajuste son propre rendu.
4. **Protection Force-expand.** Quatre conditions annulent le mode compact pour garantir que les éléments UI critiques sont toujours visibles (confirmations, erreurs, shell, actions initiées par l'utilisateur).
5. **Pas d'instantané figé.** Le basculement affiche toujours la sortie en direct — pas d'instantanés figés.
6. **Synchronisation avec la boîte de dialogue des paramètres.** Basculer le mode compact depuis les paramètres met à jour l'état React immédiatement via `setCompactMode`.
7. **Découverte non intrusive.** Le mode compact est introduit via la rotation d'astuces au démarrage plutôt qu'un indicateur persistant en bas de page, évitant l'encombrement de l'interface.

### 3.4 Parcours utilisateur

```
Début de session → mode verbeux (défaut)
     │
     ├─ Toutes les sorties d'outils, réflexions, détails visibles
     │
     ├─ L'utilisateur appuie sur Ctrl+O (ou bascule dans les paramètres)
     │     └─→ compactMode = true, persisté
     │         ├─ Les groupes d'outils affichent un résumé sur une ligne
     │         ├─ Le contenu de réflexion/pensée est masqué
     │         └─ Les confirmations, erreurs, shell restent développés
     │
     ├─ L'utilisateur appuie à nouveau sur Ctrl+O
     │     └─→ compactMode = false, persisté
     │         └─ Tous les détails sont à nouveau visibles
     │
     └─ Session suivante → même mode que la dernière session
```

## 4. Analyse approfondie des différences clés

### 4.1 Philosophie du mode par défaut

| Aspect              | Claude Code (compact par défaut)          | Qwen Code (verbeux par défaut)                     |
| ------------------- | ----------------------------------------- | -------------------------------------------------- |
| Première impression | Propre, minimal — aspect professionnel    | Riche en informations — transparence totale        |
| Courbe d'apprentissage | L'utilisateur doit apprendre Ctrl+O pour voir les détails | L'utilisateur voit immédiatement tout      |
| Public cible        | Utilisateurs expérimentés qui font confiance à l'outil | Utilisateurs qui veulent comprendre ce qui se passe |
| Surcharge d'informations | Évitée par défaut                      | Possible pour les nouveaux utilisateurs            |
| Découverte          | Indices par outil « (ctrl+o to expand) »   | Rotation d'astuces au démarrage + ? raccourcis + /help |

**Analyse :** Le mode compact par défaut de Claude Code fonctionne parce que sa base d'utilisateurs est généralement composée de développeurs expérimentés qui font confiance à l'outil et n'ont pas besoin de voir chaque invocation d'outil. Le mode verbeux par défaut de Qwen Code est approprié à son stade plus précoce où l'instauration de la confiance par la transparence est importante.

### 4.2 Modèle de persistance

| Aspect          | Claude Code               | Qwen Code                  |
| --------------- | ------------------------- | -------------------------- |
| Persisté ?      | Non — session uniquement  | Oui — dans settings.json   |
| Justification   | Le mode verbeux est un aperçu temporaire | Le mode est une préférence utilisateur |
| Comportement au redémarrage | Toujours en mode compact | Démarre avec le dernier mode utilisé |

**Analyse :** Claude Code traite la visualisation des détails comme un besoin momentané — on regarde, puis on revient. Qwen Code la traite comme une préférence stable — certains utilisateurs veulent toujours les détails, d'autres toujours le mode compact. Les deux approches sont valables ; celle de Qwen Code est plus flexible.

### 4.3 Protection des confirmations

| Aspect                | Claude Code                                 | Qwen Code                                            |
| --------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Mécanisme             | Couche de superposition/modal (structurellement séparée) | Conditions Force-expand dans `showCompact`          |
| Couverture            | Complète — les approbations ne peuvent jamais être masquées | Complète — 4 conditions couvrent tous les états interactifs |
| UI de confirmation compacte | N/A (la superposition est toujours pleine) | Sélection simplifiée à 3 options avec RadioButtonSelect |

**Analyse :** La séparation architecturale de Claude Code (couche de superposition) est plus robuste. L'approche Force-expand de Qwen Code est efficace mais nécessite que chaque nouvel état interactif soit explicitement ajouté à la liste des conditions.

### 4.4 Approche de rendu

| Aspect       | Claude Code                         | Qwen Code                                  |
| ------------ | ----------------------------------- | ------------------------------------------ |
| Portée du basculement | Niveau écran (prompt ↔ transcript) | Niveau composant (chaque composant décide) |
| Granularité  | Tout ou rien                        | Fine, par composant                        |
| Flexibilité  | Faible — bascule globale            | Élevée — les composants peuvent outrepasser |
| Cohérence    | Garantie                            | Dépend de l'implémentation de chaque composant |

**Analyse :** L'approche au niveau composant de Qwen Code est plus flexible (par exemple, le force-expand pour des conditions spécifiques) mais nécessite plus de discipline pour maintenir la cohérence. L'approche au niveau écran de Claude Code est plus simple et garantit un comportement cohérent.

## 5. Recommandations d'optimisation

### 5.1 [P0] Conserver le mode verbeux par défaut — Pas de changement nécessaire

Le mode verbeux par défaut de Qwen Code est le bon choix pour son stade actuel. Les utilisateurs novices ont besoin de transparence pour établir la confiance. À mesure que le produit mature, envisagez de faire du mode compact le défaut (comme Claude Code).

### 5.2 [P1] Extension par outil pour les sorties volumineuses

Claude Code affiche « (ctrl+o to expand) » sur les outils individuels qui produisent une sortie volumineuse. Qwen Code n'a actuellement qu'un basculement global. Envisagez :

- Lorsqu'un seul outil produit une sortie dépassant N lignes, afficher un indice d'extension par outil en mode compact.
- Portée : amélioration future, pas une priorité actuelle.

### 5.3 [P2] Envisager un remplacement limité à la session

Certains utilisateurs peuvent préférer le mode compact par défaut mais avoir besoin occasionnellement du mode verbeux pour une session spécifique. Envisagez de supporter les deux :

- `settings.json` → défaut persistant (comportement actuel)
- Ctrl+O pendant la session → remplacement temporaire pour la session en cours (comportement de Claude Code)
- Au redémarrage de la session → revenir à la valeur de settings.json

Cela offre le meilleur des deux mondes. L'implémentation nécessiterait de séparer l'état « défaut des paramètres » de l'état « remplacement de session ».

### 5.4 [P2] Séparation structurelle pour les confirmations

Actuellement, la protection des confirmations repose sur les conditions `showCompact` dans `ToolGroupMessage`. Envisagez une approche plus robuste :

- Afficher les confirmations dans une couche séparée (comme l'approche de superposition de Claude Code).
- Cela rendrait architecturalement impossible pour le mode compact d'affecter les confirmations.
- Priorité plus faible car l'approche actuelle de force-expand fonctionne correctement.

## 6. État actuel de l'implémentation

Après les modifications de la branche `feat/compact-mode-optimization` :

| Fonctionnalité                        | Statut | Remarques                                          |
| ------------------------------------- | ------ | -------------------------------------------------- |
| Indice dans les astuces de démarrage  | Fait   | Astuce du mode compact dans la rotation Tips (non intrusive) |
| Ctrl+O dans les raccourcis clavier (?) | Fait | Ajouté au composant KeyboardShortcuts              |
| Ctrl+O dans /help                     | Fait   | Ajouté au composant Help                           |
| Synchronisation avec les paramètres   | Fait   | Synchronise compactMode avec CompactModeContext     |
| Pas d'instantané figé                | Fait   | Le basculement affiche toujours la sortie en direct |
| Protection des confirmations          | Fait   | Force-expand + garde WaitingForConfirmation         |
| Protection du shell                   | Fait   | Force-expand via `!isEmbeddedShellFocused`          |
| Protection des erreurs                | Fait   | Force-expand via `!hasErrorTool`                    |
| Documentation utilisateur mise à jour | Fait   | settings.md, keyboard-shortcuts.md                  |

## 7. Référence des fichiers

### Qwen Code

| Fichier                                                              | Objectif                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/cli/src/ui/AppContainer.tsx`                                | Gestionnaire de basculement, initialisation d'état, fournisseur de contexte |
| `packages/cli/src/ui/contexts/CompactModeContext.tsx`                 | Définition du contexte                                  |
| `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`        | Logique Force-expand                                    |
| `packages/cli/src/ui/components/messages/ToolMessage.tsx`             | Masquage de la sortie par outil                         |
| `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | Rendu de la vue compacte                                |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` | UI de confirmation compacte                             |
| `packages/cli/src/ui/components/MainContent.tsx`                      | Rendu des éléments d'historique en attente              |
| `packages/cli/src/ui/components/Tips.tsx`                             | Astuce de démarrage avec indice du mode compact         |
| `packages/cli/src/ui/components/Help.tsx`                             | Entrée du raccourci /help                               |
| `packages/cli/src/ui/components/KeyboardShortcuts.tsx`                | Entrée du raccourci ?                                   |
| `packages/cli/src/ui/components/SettingsDialog.tsx`                   | Synchronisation des paramètres                          |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | Masquage du contenu de réflexion                        |
| `packages/cli/src/config/settingsSchema.ts`                           | Définition du paramètre                                 |
| `packages/cli/src/config/keyBindings.ts`                              | Liaison Ctrl+O                                          |

### Claude Code (Référence)

| Fichier                                             | Objectif                           |
| --------------------------------------------------- | ---------------------------------- |
| `src/hooks/useGlobalKeybindings.tsx`                | Gestionnaire de basculement        |
| `src/state/AppStateStore.ts`                        | Définition d'état (verbose: false) |
| `src/components/CtrlOToExpand.tsx`                  | Indice d'extension par outil       |
| `src/components/Messages.tsx`                       | Filtre de messages brefs           |
| `src/screens/REPL.tsx`                              | Changement de mode au niveau écran |
| `src/components/permissions/PermissionRequest.tsx`  | Confirmation basée sur superposition |