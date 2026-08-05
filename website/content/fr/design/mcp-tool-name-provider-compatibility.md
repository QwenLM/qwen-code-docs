# Compatibilité des noms d'outils MCP avec les providers

## Problème

Qwen Code accepte actuellement les noms d'outils MCP en utilisant le jeu de
caractères de Gemini. Des noms comme `literature.search_pubmed` deviennent
`mcp__server__literature.search_pubmed`, ce que Gemini accepte mais que des
endpoints compatibles OpenAI et Anthropic plus stricts peuvent rejeter avant
que l'outil ne puisse s'exécuter.

Le même nom brut est reconstruit indépendamment pour l'enregistrement, la
persistance des permissions, la recherche à la reconnexion, la troncature de
sortie et l'historique restauré. Changer uniquement la requête au provider
ferait donc différer le nom visible par le modèle de la clé du registre.

## Design

Utiliser une seule règle de normalisation déterministe sûre pour le provider
pour les noms d'outils MCP :

- Préserver les noms correspondant déjà à `^[A-Za-z][A-Za-z0-9_-]*$` et à au
  plus 63 caractères.
- Remplacer les caractères non pris en charge, garantir un premier caractère
  alphabétique et ajouter un hash court stable chaque fois qu'une
  normalisation ou une troncature est nécessaire.
- Garder le nom final à 63 caractères ou moins, ce qui est accepté par Gemini
  et les providers compatibles OpenAI et Anthropic plus stricts.
- Utiliser le nom enregistré tout au long d'une invocation MCP au lieu de le
  reconstruire depuis les noms bruts de serveur et d'outil.
- Normaliser les noms MCP dans l'historique de requêtes OpenAI et Anthropic
  restauré afin que les sessions créées avant le changement restent
  envoyables.
- Continuer de faire correspondre les entrées legacy de permission MCP et
  d'outil désactivé en portant l'alias exact pré-normalisation dérivé des
  noms bruts de serveur et d'outil. Cela préserve aussi les noms tronqués par
  l'ancien algorithme de troncature au milieu sans élargir les
  correspondances à joker.

Aucune table d'alias spécifique au provider n'est introduite. Les noms
existants légaux restent inchangés octet par octet, donc le comportement de
Gemini et les outils intégrés normaux ne sont pas affectés.

Les noms restaurés produits par l'ancien algorithme de troncature au milieu
sont déjà sûrs pour le provider et restent inchangés dans les messages
historiques. Leur milieu supprimé ne peut pas être reconstruit de manière
fiable, donc les convertisseurs ne devinent pas un nouveau nom basé sur un
hash ; la compatibilité exacte des permissions et des outils désactivés
utilise à la place l'alias du nom brut disponible pendant l'enregistrement
MCP.

## Vérification

- Tests unitaires pour les noms valides, invalides, en collision, longs,
  stables et idempotents.
- Tests d'outils MCP pour l'enregistrement, les règles de permission, la
  recherche à la reconnexion et les outils désactivés.
- Tests des convertisseurs OpenAI et Anthropic pour l'historique restauré
  contenant des noms MCP à points.
- Build et typecheck du paquet core.
