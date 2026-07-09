# Feuille de route de Qwen Code

> **Objectif** : Rattraper les fonctionnalités produit de Claude Code, affiner continuellement les détails et améliorer l'expérience utilisateur.

| Catégorie                        | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expérience utilisateur                 | ✅ UI Terminal<br>✅ Support du protocole OpenAI<br>✅ Paramètres<br>✅ OAuth<br>✅ Contrôle du cache<br>✅ Mémoire<br>✅ Compression<br>✅ Thème                                                | Meilleure UI<br>Onboarding<br>LogView<br>✅ Session<br>Permissions<br>🔄 Compatibilité multiplateforme<br>✅ Plan de codage<br>✅ Fournisseur Anthropic<br>✅ Entrée multimodale<br>✅ WebUI unifiée |
| Flux de travail de codage                 | ✅ Commandes slash<br>✅ MCP<br>✅ Mode Plan<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi-modèle<br>✅ Gestion du chat<br>✅ Outils (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Mode headless<br>✅ Outils (WebSearch)<br>✅ Support LSP<br>✅ Exécuteur concurrent                                                                              |
| Développement de capacités ouvertes      | ✅ Commandes personnalisées                                                                                                                                                                 | ✅ SDK QwenCode<br>✅ Système d'extension                                                                                                                                                  |
| Intégration de l'écosystème communautaire |                                                                                                                                                                                    | ✅ Plugin VSCode<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Fonctionnalités d'administration     | ✅ Statistiques<br>✅ Feedback                                                                                                                                                            | Coûts<br>Tableau de bord<br>✅ Boîte de dialogue de feedback utilisateur                                                                                                                                           |

> Pour plus de détails, veuillez consulter la liste ci-dessous.

## Fonctionnalités

#### Fonctionnalités implémentées

| Fonctionnalité                 | Version   | Description                                             | Catégorie                        | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Plan de codage**         | `V0.10.0` | Authentification et modèles pour le plan de codage Alibaba Cloud       | Expérience utilisateur                 | 2     |
| WebUI unifiée           | `V0.9.0`  | Bibliothèque de composants WebUI partagée pour VSCode/CLI           | Expérience utilisateur                 | 2     |
| Export de chat             | `V0.8.0`  | Export des sessions en Markdown/HTML/JSON/JSONL             | Expérience utilisateur                 | 2     |
| Système d'extension        | `V0.8.0`  | Gestion complète des extensions avec commandes slash           | Développement de capacités ouvertes      | 2     |
| Support LSP             | `V0.7.0`  | Service LSP expérimental (`--experimental-lsp`)         | Flux de travail de codage                 | 2     |
| Fournisseur Anthropic      | `V0.7.0`  | Support du fournisseur d'API Anthropic                          | Expérience utilisateur                 | 2     |
| Boîte de dialogue de feedback utilisateur    | `V0.7.0`  | Collecte de feedback in-app avec mécanisme de fatigue       | Fonctionnalités d'administration     | 2     |
| Exécuteur concurrent       | `V0.6.0`  | Exécution CLI par lots avec intégration Git                | Flux de travail de codage                 | 2     |
| Entrée multimodale        | `V0.6.0`  | Support des entrées image, PDF, audio, vidéo                  | Expérience utilisateur                 | 2     |
| Skill                   | `V0.6.0`  | Skills IA personnalisées et extensibles (expérimental)              | Flux de travail de codage                 | 2     |
| GitHub Actions          | `V0.5.0`  | qwen-code-action et automatisation                         | Intégration de l'écosystème communautaire | 1     |
| Plugin VSCode           | `V0.5.0`  | Plugin d'extension VSCode                                 | Intégration de l'écosystème communautaire | 1     |
| SDK QwenCode            | `V0.4.0`  | SDK ouvert pour l'intégration tierce                    | Développement de capacités ouvertes      | 1     |
| Session                 | `V0.4.0`  | Gestion améliorée des sessions                             | Expérience utilisateur                 | 1     |
| i18n                    | `V0.3.0`  | Internationalisation et support multilingue           | Expérience utilisateur                 | 1     |
| Mode headless           | `V0.3.0`  | Mode headless (non interactif)                         | Flux de travail de codage                 | 1     |
| ACP/Zed                 | `V0.2.0`  | Intégration de l'éditeur ACP et Zed                          | Intégration de l'écosystème communautaire | 1     |
| UI Terminal             | `V0.1.0+` | Interface utilisateur terminal interactive                     | Expérience utilisateur                 | 1     |
| Paramètres                | `V0.1.0+` | Système de gestion de la configuration                         | Expérience utilisateur                 | 1     |
| Thème                   | `V0.1.0+` | Support multi-thèmes                                     | Expérience utilisateur                 | 1     |
| Support du protocole OpenAI | `V0.1.0+` | Support du protocole API OpenAI                         | Expérience utilisateur                 | 1     |
| Gestion du chat         | `V0.1.0+` | Gestion des sessions (sauvegarder, restaurer, parcourir)              | Flux de travail de codage                 | 1     |
| MCP                     | `V0.1.0+` | Intégration du Model Context Protocol                      | Flux de travail de codage                 | 1     |
| Multi-modèle             | `V0.1.0+` | Support et basculement multi-modèles                       | Flux de travail de codage                 | 1     |
| Commandes slash          | `V0.1.0+` | Système de commandes slash                                    | Flux de travail de codage                 | 1     |
| Outil : Bash              | `V0.1.0+` | Outil d'exécution de commandes shell (avec paramètre is_background) | Flux de travail de codage                 | 1     |
| Outil : FileRead/EditFile | `V0.1.0+` | Outils de lecture/écriture et de modification de fichiers                          | Flux de travail de codage                 | 1     |
| Commandes personnalisées         | `V0.1.0+` | Chargement de commandes personnalisées                                  | Développement de capacités ouvertes      | 1     |
| Feedback                | `V0.1.0+` | Mécanisme de feedback (commande /bug)                       | Fonctionnalités d'administration     | 1     |
| Statistiques                   | `V0.1.0+` | Statistiques d'utilisation et affichage des quotas                      | Fonctionnalités d'administration     | 1     |
| Mémoire                  | `V0.0.9+` | Gestion de la mémoire au niveau du projet et global              | Expérience utilisateur                 | 1     |
| Contrôle du cache           | `V0.0.9+` | Contrôle du cache de prompt (Anthropic, DashScope)           | Expérience utilisateur                 | 1     |
| Mode Plan                | `V0.0.14` | Mode de planification des tâches                                      | Flux de travail de codage                 | 1     |
| Compression                | `V0.0.11` | Mécanisme de compression du chat                              | Expérience utilisateur                 | 1     |
| SubAgent                | `V0.0.11` | Système de sous-agents dédié                              | Flux de travail de codage                 | 1     |
| TodoWrite               | `V0.0.10` | Gestion des tâches et suivi de la progression                   | Flux de travail de codage                 | 1     |
| Outil : TextSearch        | `V0.0.8+` | Outil de recherche de texte (grep, supporte .qwenignore)           | Flux de travail de codage                 | 1     |
| Outil : WebFetch          | `V0.0.7+` | Outil de récupération de contenu web                               | Flux de travail de codage                 | 1     |
| Outil : WebSearch         | `V0.0.7+` | Outil de recherche web (utilisant l'API Tavily)                      | Flux de travail de codage                 | 1     |
| OAuth                   | `V0.0.5+` | Authentification de connexion OAuth (Qwen OAuth)                 | Expérience utilisateur                 | 1     |

#### Fonctionnalités à développer

| Fonctionnalité                      | Priorité | Statut      | Description                       | Catégorie                    |
| ---------------------------- | -------- | ----------- | --------------------------------- | --------------------------- |
| Meilleure UI                    | P1       | Planifié     | Interaction UI terminal optimisée | Expérience utilisateur             |
| Onboarding                   | P1       | Planifié     | Flux d'intégration pour les nouveaux utilisateurs          | Expérience utilisateur             |
| Permissions                   | P1       | Planifié     | Optimisation du système de permissions    | Expérience utilisateur             |
| Compatibilité multiplateforme | P1       | En cours | Compatibilité Windows/Linux/macOS | Expérience utilisateur             |
| LogView                      | P2       | Planifié     | Fonctionnalité de visualisation et de débogage des logs | Expérience utilisateur             |
| Hooks                        | P2       | En cours | Système de hooks d'extension            | Flux de travail de codage             |
| Coûts                        | P2       | Planifié     | Suivi et analyse des coûts        | Fonctionnalités d'administration |
| Tableau de bord                    | P2       | Planifié     | Tableau de bord de gestion              | Fonctionnalités d'administration |

#### Fonctionnalités distinctives à discuter

| Fonctionnalité          | Statut   | Description                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Recherche | Découverte de projet et lancement rapide                    |
| Mode Compétitif | Recherche | Mode compétitif                                      |
| Pulse            | Recherche | Analyse des pulsations de l'activité utilisateur (référence OpenAI Pulse) |
| Code Wiki        | Recherche | Système de wiki/documentation pour la base de code du projet            |