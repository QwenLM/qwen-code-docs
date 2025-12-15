# Mise en cache des jetons et optimisation des coûts

Qwen Code optimise automatiquement les coûts d'API grâce à la mise en cache des jetons lors de l'utilisation de l'authentification par clé API. Cette fonctionnalité stocke le contenu fréquemment utilisé tel que les instructions système et l'historique des conversations afin de réduire le nombre de jetons traités lors des requêtes suivantes.

## Avantages

- **Réduction des coûts** : Moins de jetons signifie des coûts d'API plus faibles
- **Réponses plus rapides** : Le contenu mis en cache est récupéré plus rapidement
- **Optimisation automatique** : Aucune configuration nécessaire – cela fonctionne en arrière-plan

## La mise en cache des jetons est disponible pour

- Les utilisateurs de clés API (clé API Qwen, fournisseurs compatibles OpenAI)

## Surveillance de vos économies

Utilisez la commande `/stats` pour voir vos économies de jetons mis en cache :

- Lorsqu'elle est active, l'affichage des statistiques montre combien de jetons ont été servis depuis le cache
- Vous verrez à la fois le nombre absolu et le pourcentage de jetons mis en cache
- Exemple : « 10 500 (90,4 %) des jetons d'entrée ont été servis depuis le cache, réduisant les coûts. »

Ces informations ne s'affichent que lorsque des jetons mis en cache sont utilisés, ce qui se produit avec l'authentification par clé API mais pas avec l'authentification OAuth.

## Exemple d'affichage des statistiques

![Affichage des statistiques de Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

L'image ci-dessus montre un exemple de sortie de la commande `/stats`, mettant en évidence les informations sur les économies de jetons mis en cache.