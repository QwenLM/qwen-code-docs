# Feuille de route Qwen Code

> **Objectif** : Rattraper les fonctionnalités du produit Claude Code, perfectionner continuellement les détails et améliorer l'expérience utilisateur.

| Catégorie                        | Phase 1                                                                                                                                                                            | Phase 2                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Expérience utilisateur          | ✅ Interface terminal<br>✅ Prise en charge du protocole OpenAI<br>✅ Paramètres<br>✅ OAuth<br>✅ Contrôle du cache<br>✅ Mémoire<br>✅ Compression<br>✅ Thème              | Meilleure interface<br>Intégration (OnBoarding)<br>Affichage des logs (LogView)<br>✅ Sessions<br>Autorisations<br>🔄 Compatibilité multiplateforme |
| Flux de travail de codage       | ✅ Commandes slash<br>✅ MCP<br>✅ Mode planification<br>✅ Écriture de tâches (TodoWrite)<br>✅ Sous-agent<br>✅ Modèles multiples<br>✅ Gestion des discussions<br>✅ Outils (WebFetch, Bash, Recherche texte, Lecture de fichiers, Modification de fichiers) | 🔄 Crochets (Hooks)<br>Sous-agent (amélioré)<br>✅ Compétences (Skill)<br>✅ Mode sans interface graphique<br>✅ Outils (Recherche Web) |
| Développement de capacités ouvertes | ✅ Commandes personnalisées                                                                                                                                                        | ✅ Kit de développement QwenCode (SDK)<br> Extensions                                              |
| Intégration de l'écosystème communautaire |                                                                                                                                                                                    | ✅ Extension VSCode<br>🔄 ACP/Zed<br>✅ Actions GitHub (GHA)                                      |
| Fonctionnalités administratives   | ✅ Statistiques<br>✅ Retours utilisateurs                                                                                                                                          | Coûts<br>Tableau de bord                                                                           |

> Pour plus de détails, veuillez consulter la liste ci-dessous.

## Fonctionnalités

#### Fonctionnalités terminées

| Fonctionnalité          | Version   | Description                                             | Catégorie                        |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- |
| Compétence              | `V0.6.0`  | Compétences IA personnalisées extensibles               | Flux de travail de codage        |
| Github Actions          | `V0.5.0`  | qwen-code-action et automatisation                      | Intégration de l'écosystème communautaire |
| Plugin VSCode           | `V0.5.0`  | Extension pour VSCode                                   | Intégration de l'écosystème communautaire |
| SDK QwenCode            | `V0.4.0`  | SDK ouvert pour intégration tierce                      | Construction de capacités ouvertes |
| Session                 | `V0.4.0`  | Gestion améliorée des sessions                          | Expérience utilisateur           |
| i18n                    | `V0.3.0`  | Internationalisation et support multilingue             | Expérience utilisateur           |
| Mode sans interface     | `V0.3.0`  | Mode sans interface (non interactif)                    | Flux de travail de codage        |
| ACP/Zed                 | `V0.2.0`  | Intégration des éditeurs ACP et Zed                     | Intégration de l'écosystème communautaire |
| Interface en terminal   | `V0.1.0+` | Interface utilisateur interactive en terminal           | Expérience utilisateur           |
| Paramètres              | `V0.1.0+` | Système de gestion de configuration                     | Expérience utilisateur           |
| Thème                   | `V0.1.0+` | Prise en charge de plusieurs thèmes                     | Expérience utilisateur           |
| Prise en charge du protocole OpenAI | `V0.1.0+` | Prise en charge du protocole d'API OpenAI         | Expérience utilisateur           |
| Gestion des discussions | `V0.1.0+` | Gestion des sessions (sauvegarde, restauration, navigation) | Flux de travail de codage        |
| MCP                     | `V0.1.0+` | Intégration du protocole Model Context Protocol         | Flux de travail de codage        |
| Multi-modèles           | `V0.1.0+` | Prise en charge et bascule entre plusieurs modèles      | Flux de travail de codage        |
| Commandes slash         | `V0.1.0+` | Système de commandes slash                              | Flux de travail de codage        |
| Outil : Bash            | `V0.1.0+` | Exécution de commandes shell (avec paramètre is_background) | Flux de travail de codage        |
| Outil : FileRead/EditFile | `V0.1.0+` | Outils de lecture/écriture et d'édition de fichiers   | Flux de travail de codage        |
| Commandes personnalisées | `V0.1.0+` | Chargement de commandes personnalisées                 | Construction de capacités ouvertes |
| Retours                 | `V0.1.0+` | Mécanisme de retours (/commande bug)                    | Capacités administratives        |
| Statistiques            | `V0.1.0+` | Affichage des statistiques d'utilisation et des quotas  | Capacités administratives        |
| Mémoire                 | `V0.0.9+` | Gestion de la mémoire au niveau projet et global        | Expérience utilisateur           |
| Contrôle du cache       | `V0.0.9+` | Contrôle du cache DashScope                             | Expérience utilisateur           |
| PlanMode                | `V0.0.14` | Mode de planification des tâches                        | Flux de travail de codage        |
| Compression             | `V0.0.11` | Mécanisme de compression des discussions               | Expérience utilisateur           |
| Sous-agent              | `V0.0.11` | Système de sous-agents dédiés                          | Flux de travail de codage        |
| TodoWrite               | `V0.0.10` | Gestion des tâches et suivi de progression              | Flux de travail de codage        |
| Outil : TextSearch      | `V0.0.8+` | Outil de recherche de texte (grep, prend en charge .qwenignore) | Flux de travail de codage        |
| Outil : WebFetch        | `V0.0.7+` | Outil de récupération de contenu web                    | Flux de travail de codage        |
| Outil : WebSearch       | `V0.0.7+` | Outil de recherche web (utilisant l'API Tavily)         | Flux de travail de codage        |
| OAuth                   | `V0.0.5+` | Authentification par connexion OAuth (Qwen OAuth)       | Expérience utilisateur           |

#### Fonctionnalités à développer

| Fonctionnalité               | Priorité | Statut      | Description                             | Catégorie                   |
| ---------------------------- | -------- | ----------- | --------------------------------------- | --------------------------- |
| Meilleure interface utilisateur | P1       | Planifié    | Interaction optimisée avec l'interface en terminal | Expérience utilisateur      |
| Intégration                  | P1       | Planifié    | Parcours d'intégration pour les nouveaux utilisateurs | Expérience utilisateur      |
| Permissions                  | P1       | Planifié    | Optimisation du système de permissions  | Expérience utilisateur      |
| Compatibilité multiplateforme | P1       | En cours    | Compatibilité Windows/Linux/macOS       | Expérience utilisateur      |
| Visualisation des logs       | P2       | Planifié    | Fonctionnalité de visualisation et débogage des logs | Expérience utilisateur      |
| Hooks                        | P2       | En cours    | Système de hooks d'extension            | Workflow de développement   |
| Extensions                   | P2       | Planifié    | Système d'extensions                    | Construction de capacités ouvertes |
| Coûts                        | P2       | Planifié    | Suivi et analyse des coûts              | Capacités administratives   |
| Tableau de bord              | P2       | Planifié    | Tableau de bord de gestion              | Capacités administratives   |

#### Fonctionnalités distinctives à discuter

| Fonctionnalité   | Statut   | Description                                               |
| ---------------- | -------- | --------------------------------------------------------- |
| Home Spotlight   | Recherche | Découverte de projets et lancement rapide                 |
| Mode Compétitif  | Recherche | Mode compétitif                                           |
| Pulse            | Recherche | Analyse du pulse d'activité utilisateur (référence OpenAI Pulse) |
| Code Wiki        | Recherche | Système de wiki/documentation pour la base de code du projet |