# Mise en cache des tokens et optimisation des coûts

Qwen Code optimise automatiquement les coûts de l'API grâce à la mise en cache des tokens lors de l'utilisation de l'authentification par clé API. Cette fonctionnalité stocke le contenu fréquemment utilisé, comme les instructions système et l'historique des conversations, afin de réduire le nombre de tokens traités lors des requêtes suivantes.

## Avantages

- **Réduction des coûts** : Un nombre réduit de tokens entraîne une baisse des coûts API
- **Réponses plus rapides** : Le contenu mis en cache est récupéré plus rapidement
- **Optimisation automatique** : Aucune configuration requise, cela fonctionne en arrière-plan

## La mise en cache des tokens est disponible pour

- Les utilisateurs de clés API (clé API Qwen, fournisseurs compatibles OpenAI)

## Suivi de vos économies

Utilisez la commande `/stats` pour consulter vos économies de tokens mis en cache :

- Lorsqu'elle est active, l'affichage des statistiques indique le nombre de tokens servis depuis le cache
- Vous verrez à la fois le nombre absolu et le pourcentage de tokens mis en cache
- Exemple : "10 500 (90,4 %) des tokens d'entrée ont été servis depuis le cache, réduisant ainsi les coûts."

Ces informations ne s'affichent que lorsque des tokens mis en cache sont utilisés, ce qui se produit avec l'authentification par clé API, mais pas avec l'authentification OAuth.

## Exemple d'affichage des statistiques

![Qwen Code Stats Display](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

L'image ci-dessus montre un exemple de sortie de la commande `/stats`, mettant en évidence les informations sur les économies de tokens mis en cache.