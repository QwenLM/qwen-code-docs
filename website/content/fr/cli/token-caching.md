# Mise en cache des tokens et optimisation des coûts

Qwen Code optimise automatiquement les coûts API par le biais de la mise en cache des tokens lorsque vous utilisez l'authentification par clé API (par exemple, les fournisseurs compatibles OpenAI). Cette fonctionnalité réutilise les instructions système et le contexte précédents pour réduire le nombre de tokens traités lors des requêtes suivantes.

**La mise en cache des tokens est disponible pour :**

- Les utilisateurs de clés API (clé API Gemini)
- Les utilisateurs de Vertex AI (avec configuration du projet et de la région)

**La mise en cache des tokens n'est pas disponible pour :**

- Les utilisateurs OAuth (comptes Google personnels/entreprise) - l'API Code Assist ne prend pas en charge la création de contenu mis en cache pour le moment

Vous pouvez consulter votre utilisation des tokens et les économies de tokens mis en cache à l'aide de la commande `/stats`. Lorsque des tokens mis en cache sont disponibles, ils seront affichés dans la sortie des statistiques.