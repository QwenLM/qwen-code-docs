# Rendu unifié des sorties d'outils

## Contexte

La TUI avait auparavant deux modes de rendu pour les résultats d’outils :

- **Mode compact** (Ctrl+O) : réduisait les résultats d’outils terminés en un résumé d’une ligne
- **Mode normal** : affichait les résultats complets en ligne, provoquant un bruit vertical excessif

Les utilisateurs devaient basculer manuellement entre les modes. La plupart du temps, les résultats d’outils terminés (contenus de fichiers, résultats de recherche, etc.) n’apportaient aucune valeur ajoutée au flux de la conversation.

## Conception

### Principe fondamental

**Un mode unique** : le rendu des outils est déterminé par leur catégorie, et non par un mode activé par l’utilisateur. Les outils de collecte d’informations (lire/rechercher/lister) sont réduits en un résumé ; les outils de mutation (éditer/écrire/commande/agent) sont toujours rendus individuellement avec leurs résultats complets.

### Résumé sémantique (`buildToolSummary`)

Au lieu d’afficher les noms bruts des outils et leurs compteurs (`ReadFile x 3`), générez des résumés lisibles par un humain en utilisant un format basé sur le nombre :

| Scénario                    | Sortie                                                  |
| -------------------------- | ------------------------------------------------------- |
| Outil unique               | `Lu 1 fichier` / `Exécuté 1 commande`                   |
| Plusieurs outils de même type | `Lu 3 fichiers`                                      |
| Types mixtes               | `Exécuté 1 commande, lu 3 fichiers, modifié 2 fichiers` |
| En cours d’exécution       | `Lecture de 1 fichier` (présent progressif)             |
| Terminé                    | `Lu 1 fichier` (passé)                                  |

### Catégories d’outils

| Catégorie | Noms affichés                        | Verbe passé | Verbe actif | Réductible |
| --------- | ------------------------------------ | ----------- | ----------- | ---------- |
| read      | ReadFile, Read File(s)               | Lu          | Lit         | Oui        |
| edit      | Edit, NotebookEdit                   | Modifié     | Modifie     | Non        |
| write     | WriteFile                            | Écrit       | Écrit       | Non        |
| search    | Grep, Glob                           | Recherché   | Recherche   | Oui        |
| list      | ListFiles, Read Directory            | Listé       | Liste       | Oui        |
| command   | Shell                                | Exécuté     | Exécute     | Non        |
| agent     | Agent, Workflow, SendMessage         | Exécuté     | Exécute     | Non        |
| other     | (tout le reste)                      | Utilisé     | Utilise     | Non        |

### Règles de rendu

1. **Partition par type** : les outils sont répartis via `isCollapsibleTool()` — les outils réductibles (read/search/list) sont affichés sous forme de ligne de résumé `CompactToolGroupDisplay` ; les outils non réductibles (edit/write/command/agent/other) sont rendus individuellement via `ToolMessage`
2. **Groupes mémoire uniquement** : un chemin de rendu dédié (badge de compteurs de lectures/écritures) a priorité, mais seulement quand toutes les opérations réussissent (`!hasErrorTool && every status === Success`)
3. **Réduction des résultats** : seuls les outils réductibles avec un statut `Success` voient leur texte/sortie ANSI réduit. Les outils non réductibles (y compris MCP, WebFetch, etc.) affichent toujours leurs résultats. Les outils annulés conservent une sortie partielle visible
4. **Noms d’outils** : rendus en gras quel que soit le statut, offrant une mise en forme cohérente pour `CompactToolGroupDisplay` et `ToolMessage`
5. **Conditions de force-développement** : lorsqu’un outil d’un groupe est en confirmation, en erreur, initié par l’utilisateur, dans un shell ciblé, ou un sous-agent terminal, TOUS les outils sont rendus individuellement (pas de partition) avec des résultats forcés visibles uniquement pour les outils déclencheurs (erreur, confirmation, sous-agent terminal) — les outils frères réussis conservent le comportement de réduction normal
6. **Éléments `tool_use_summary`** (résumés sémantiques générés par LLM) : rendus inconditionnellement aux côtés du compteur mécanique de `CompactToolGroupDisplay` — ils servent des objectifs différents (contexte sémantique vs compteur d’outils)
7. **Badge mémoire** : rendu à la fois dans le chemin tout-réductible et dans le chemin mixte lorsque des opérations mémoire sont présentes dans un groupe non exclusivement mémoire

### Changements clés

| Fichier                          | Changement                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CompactToolGroupDisplay.tsx`    | Ajout de `buildToolSummary()` avec format de compteur, `isCollapsibleTool()`, suppression des styles de bordure                                               |
| `ToolMessage.tsx`                | `shouldCollapseResult` conditionné uniquement sur `isCollapsibleTool()` et `Success` ; `isDim` supprimé                                                      |
| `ToolGroupMessage.tsx`           | Partition par type remplace `showCompact` ; `forceShowResult` simplifié en `forceExpandAll` ; budget de hauteur tient compte de la ligne de résumé réductible |
| `MainContent.tsx`                | Suppression de l’alias `mergedHistory`, de `absorbedCallIds`, `summaryByCallId`, du fondu inter-groupes                                                       |
| `HistoryItemDisplay.tsx`         | `tool_use_summary` rendu inconditionnellement (suppression de la porte `summaryAbsorbed`)                                                                     |
| `mergeCompactToolGroups.ts`      | `compactToggleHasVisualEffect` ne se déclenche plus sur `tool_group` (le mode compact n’a aucun effet sur le rendu des outils)                                 |

## Alternatives envisagées

1. **Conserver deux modes avec des résumés améliorés** : refusé — surcharge cognitive inutile pour les utilisateurs
2. **Résumé par outil (style Gemini CLI)** : chaque outil obtient sa propre flèche de résumé. Refusé — encore trop verbeux pour de grands lots d’outils
3. **Déploiement progressif** : refusé — l’utilisateur préfère un passage unique en production