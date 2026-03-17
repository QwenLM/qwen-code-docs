# Mise en cache des jetons et optimisation des coûts

Qwen Code optimise automatiquement les coûts liés aux API grâce à la mise en cache des jetons lors de l’authentification par clé API. Cette fonctionnalité stocke les contenus fréquemment utilisés, tels que les instructions système et l’historique des conversations, afin de réduire le nombre de jetons traités dans les requêtes ultérieures.

## Comment cela vous profite

- **Réduction des coûts** : Moins de jetons signifie des coûts API plus faibles  
- **Réponses plus rapides** : Le contenu mis en cache est récupéré plus rapidement  
- **Optimisation automatique** : Aucune configuration n’est nécessaire — cela fonctionne en arrière-plan  

## La mise en cache des jetons est disponible pour

- Les utilisateurs de clé API (clé API Qwen, fournisseurs compatibles avec OpenAI)

## Surveillance de vos économies

Utilisez la commande `/stats` pour afficher les économies réalisées grâce aux jetons mis en cache :

- Lorsqu’elle est activée, l’affichage des statistiques indique combien de jetons ont été fournis depuis le cache.
- Vous y verrez à la fois le nombre absolu et le pourcentage de jetons provenant du cache.
- Exemple : « 10 500 jetons d’entrée (90,4 %) ont été fournis depuis le cache, ce qui réduit les coûts. »

Ces informations ne s’affichent que lorsque des jetons mis en cache sont effectivement utilisés — ce qui se produit avec l’authentification par clé API, mais pas avec l’authentification OAuth.

## Exemple d’affichage des statistiques

![Affichage des statistiques Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

L’image ci-dessus illustre un exemple de sortie de la commande `/stats`, mettant en évidence les économies réalisées grâce aux jetons mis en cache.