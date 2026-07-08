# Espacement et densité du TUI PR1

## Pourquoi

Le TUI actuel consacre souvent des lignes supplémentaires à l'espacement avant la sortie de l'assistant, entre les blocs de statut/outils et à l'intérieur des groupes d'outils développés. Lors des sessions courantes, cela rend plus difficile la lecture des réponses simples, des listes de fichiers, des sorties d'outils, des états d'erreur, des diffs et des longues sorties en streaming, car les utilisateurs doivent faire défiler des espaces vides plutôt que du contenu.

Cette PR est la première étape ciblée pour QwenLM/qwen-code#4588. Elle traite uniquement de l'espacement et de la densité afin que la revue puisse comparer l'utilisation des lignes avant et après, sans avoir à examiner la visibilité de la réflexion, les bordures des outils, la disposition des SubAgent, le branding ou les changements de couleurs du thème.

## Comment

L'implémentation conserve intactes la structure d'information existante et les surfaces de rendu :

- L'espacement des éléments de l'historique est centralisé près de `HistoryItemDisplay`. Les prompts utilisateur et les vues de commandes autonomes commencent toujours par un séparateur de tour, tandis que les continuations de l'assistant, les groupes d'outils, les messages de statut, les résumés d'outils et les sorties associées au sein d'un même tour n'ajoutent plus de ligne d'espacement supplémentaire au début.
- Les groupes d'outils développés conservent leur bordure et leur structure de statut/titre actuelles, mais n'insèrent plus de lignes vides entre les entrées d'outils adjacentes.
- Les résultats des outils s'affichent directement sous la ligne de titre/statut de l'outil. Cela supprime la ligne vide supplémentaire entre l'en-tête de l'outil et sa sortie, sans modifier le contenu de la sortie, la troncature, le focus du shell, les prompts de confirmation ou le comportement du mode compact.

Le comportement des lignes vides en Markdown est intentionnellement laissé inchangé. Le moteur de rendu réduit déjà les lignes vides consécutives à un seul espacement et préserve les blocs complexes tels que les tableaux, les blocs de code et les blocs mathématiques.

## Standard d'espacement

- Les tours utilisateur indépendants conservent un séparateur visuel.
- La sortie de l'assistant et les blocs de suivi au sein d'un même tour n'ajoutent pas de deuxième séparateur.
- L'en-tête de l'outil et le contenu du résultat de l'outil sont adjacents.
- Les groupes multi-outils développés n'insèrent pas de lignes vides entre chaque entrée d'outil.
- Les blocs Markdown complexes conservent leur mise en page interne existante.

## Effet attendu

Avec la même largeur de terminal et le même contenu rendu, les scénarios cibles devraient utiliser moins de lignes visibles :

- Les Q&R simples devraient réduire d'au moins une ligne visible.
- La sortie des outils développés devrait réduire d'au moins une ligne pour chaque résultat d'outil rendu qui possédait auparavant un espacement vide entre l'en-tête et le résultat.
- Les groupes multi-outils devraient réduire d'une ligne l'espace entre chaque entrée d'outil adjacente.
- Les scénarios d'inspection de projet, de diff, de liste de fichiers, d'erreur et de flux long ne devraient pas gagner de lignes, sauf si les changements de retour à la ligne automatique du terminal le rendent inévitable.

## Mesures

Les assertions automatisées d'espacement et les preuves terminaux utilisent des fixtures de 100 colonnes pour les règles modifiées :

| Scénario | Largeur | Lignes de base | Lignes PR1 | Delta | Preuve |
| ----------------------------------------------- | ----: | ------------: | -------: | ----: | ------------------------------------------------------------------------------------------------------------ |
| Réponse simple de l'assistant | 100 | 2 | 1 | -1 | espacement d'historique initial supprimé |
| En-tête d'outil avec résultat sur une ligne | 100 | 3 | 2 | -1 | l'en-tête et le résultat sont adjacents |
| Groupe développé de trois outils avec résultats rendus | 100 | 16 | 11 | -5 | un espacement en-tête/résultat supprimé par résultat d'outil et un séparateur inter-outils supprimé entre les outils adjacents |
| Fixture représentatif complet | 100 | 26 | 19 | -7 | même contenu rendu capturé dans tmux |

Les diffs de snapshots couvrent également les fixtures existantes de 80 colonnes pour confirmer les mêmes deltas de nombre de lignes dans le harnais de test de composants actuel.

## Hors périmètre

- Masquer les traces de réflexion.
- Supprimer les bordures des outils.
- Refondre la sortie des SubAgent.
- Modifier le branding de démarrage ou la bannière.
- Modifier les couleurs du thème.
- Ajouter le temps écoulé de l'assistant par tour.
- Modifier la coloration syntaxique du code inline dans les tableaux.