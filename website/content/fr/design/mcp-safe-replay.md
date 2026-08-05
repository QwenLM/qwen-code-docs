# Relecture sûre après une perte de connexion MCP

## Problème

Un outil MCP peut terminer un effet de bord avant que sa connexion de réponse
n'échoue. Se reconnecter et renvoyer le même `tools/call` peut donc répéter
une écriture tandis que l'utilisateur ne voit que le second résultat. Les
annotations d'outil MCP sont optionnelles et correspondent par défaut à un
comportement non idempotent, donc des annotations manquantes ne peuvent pas
justifier une relecture automatique.

## Politique de relecture

Qwen Code rejoue automatiquement une invocation échouée uniquement lorsque
toutes les conditions suivantes sont vraies :

- L'échec est classé comme une perte de connexion par les vérifications de
  connexion MCP existantes.
- Le serveur MCP a `trust: true`.
- Le workspace actuel passe la porte de confiance du workspace.
- L'outil déclare `idempotentHint: true`, ou déclare `readOnlyHint: true`
  sans `destructiveHint: true` ni `idempotentHint: false`.

Les annotations contradictoires ne sont pas traitées comme sûres. En
particulier, un outil qui se déclare en lecture seule tout en déclarant un
comportement destructif ou non idempotent n'est pas rejoué. Une déclaration
d'idempotence explicite peut couvrir une opération mutatrice, mais elle ne
surcharge pas des annotations de lecture seule contradictoires.

La même décision est appliquée aux deux chemins d'exécution : le client MCP
direct utilisé pour les appels conscients de la progression et le fallback
appelable. Les erreurs d'annulation, les erreurs hors connexion et les
résultats de protocole MCP `isError: true` conservent leur comportement
existant.

Après reconnexion, Qwen Code applique les mêmes vérifications de confiance et
d'annotations à l'outil nouvellement découvert avant d'envoyer la relecture.
Il ne transporte pas la confiance ni les annotations d'un processus de
serveur précédent dans la nouvelle invocation.

## Comportement en cas d'échec

Lorsqu'un échec de connexion ne peut pas être rejoué sûrement, l'invocation
courante ne se reconnecte pas et ne construit pas une seconde invocation.
Elle renvoie une erreur stable expliquant que l'opération a pu se terminer et
ne doit pas être retentée automatiquement. L'erreur n'inclut ni les arguments
de l'outil ni l'erreur de transport amont.

La récupération de connexion pour des appels ultérieurs indépendants reste de
la responsabilité du moniteur de santé existant, d'une reconnexion explicite
ou du cycle de vie normal de découverte. Les appels sûrs conservent le
comportement borné de reconnexion existant.

## Compatibilité

Il s'agit d'un changement conservateur intentionnel. Les outils sans
annotations ne reçoivent plus de relecture transparente de perte de
connexion, même lorsqu'une ancienne version de Qwen Code les retentait. Les
serveurs qui veulent la relecture doivent fournir des annotations exactes, et
les administrateurs doivent opter pour la confiance du serveur dans un
workspace fiable.

Les annotations MCP sont des indices de comportement fournis par le serveur,
pas une limite d'autorisation. Qwen Code les utilise pour la relecture
uniquement après que les portes de confiance du serveur et du workspace sont
passées.

## Vérification

Les tests couvrent le client direct et le fallback appelable, les
déclarations sûres idempotentes et en lecture seule, les annotations
manquantes et contradictoires, les deux portes de confiance, les outils
redécouverts qui perdent leur confiance ou leurs annotations, la
classification des erreurs de connexion, les annulations, les erreurs de
protocole, l'échec de reconnexion et la limite de tentatives. Un
enregistrement E2E local séparé exerce un serveur qui valide un effet de bord
avant de couper la connexion de réponse et vérifie qu'un appel non sûr
n'atteint le serveur qu'une seule fois.
