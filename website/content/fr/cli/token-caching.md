# Mise en cache des tokens et optimisation des coûts

Qwen Code optimise automatiquement les coûts d'API grâce à la mise en cache des tokens lorsque vous utilisez l'authentification par clé API (par exemple, les fournisseurs compatibles OpenAI). Cette fonctionnalité réutilise les instructions système et le contexte précédents pour réduire le nombre de tokens traités dans les requêtes suivantes.

**La mise en cache des tokens est disponible pour :**

- Les utilisateurs de clé API (Qwen API key)
- Les utilisateurs de Vertex AI (avec configuration du projet et de la région)

**La mise en cache des tokens n'est pas disponible pour :**

- Les utilisateurs OAuth (comptes Google Personnel/Entreprise) - l'API Code Assist ne prend pas en charge la création de contenu mis en cache pour le moment

Vous pouvez consulter votre utilisation de tokens et les économies de tokens mis en cache en utilisant la commande `/stats`. Lorsque des tokens mis en cache sont disponibles, ils seront affichés dans la sortie des statistiques.