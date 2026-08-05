# Contrôle des entrées de la boucle de goal

## Problème

Un `/goal` actif est implémenté comme un hook Stop bloquant. Pendant que le
modèle s'exécute, la file d'attente interactive reporte normalement les slash
commands jusqu'à ce que le stream devienne inactif. Une boucle de goal peut ne
jamais atteindre cette limite d'inactivité, donc `/goal clear` et les
commandes `/goal` de remplacement ne peuvent pas prendre effet.

La réponse Stop peut aussi agréger le hook de goal avec des hooks configurés
sans rapport. Effacer un goal ne doit pas rejeter une décision bloquante
détenue par un autre hook.

## Design

Pendant un tour actif, la file d'attente des messages draine les commandes
`/goal` aux côtés des messages de guidage en texte brut. Les autres slash
commands restent en file d'attente pour un traitement inactif normal.

La CLI exécute les commandes de goal drainées via le processeur de slash
commands existant :

- Les commandes clear appliquent leur effet de bord sans produire d'entrée
  pour le modèle.
- Les commandes de remplacement remplacent l'instruction de goal en attente.
- Lorsque plusieurs commandes de goal sont drainées ensemble, seule
  l'instruction du dernier goal actif est envoyée.
- L'instruction survivante conserve sa position par rapport aux messages de
  guidage en texte brut.
- Les commandes de goal exécutées ne sont pas restaurées si une préparation de
  guidage ultérieure est annulée ; les messages en texte brut non exécutés
  sont restaurés.

Le core échantillonne la file d'attente avant les hooks Stop et à nouveau
après le retour d'un hook Stop bloquant. Une sortie de goal bloquante porte
son ID de hook de goal et garde sa raison de continuation séparée des raisons
de hook ordinaires. Le bridge de hook rapporte aussi si une autre sortie Stop
est bloquante. Si le goal change à la seconde limite, le core supprime
uniquement l'ancienne continuation de goal ; il suit toujours une raison
bloquante indépendante. Les sorties de hook non bloquantes ne forcent pas une
itération de goal supplémentaire.

## Vérification

- Les tests de file d'attente couvrent le drainage des goals en tour actif et
  le report à la limite d'inactivité.
- Les tests de stream de la CLI couvrent le clear, le remplacement, les
  commandes par lots, l'ordre et le comportement de restauration.
- Les tests du core couvrent le clear et le remplacement pendant l'évaluation
  du hook Stop, y compris un bloqueur indépendant agrégé.
- Une session tmux locale exerce le clear et le remplacement sur la CLI
  interactive compilée.
