# Roadmap Qwen Code

> **Objectif** : Rattraper les fonctionnalités produit de Claude Code, affiner continuellement les détails et améliorer l'expérience utilisateur.

| Catégorie                        | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expérience utilisateur                 | ✅ Terminal UI<br>✅ Support du protocole OpenAI<br>✅ Paramètres<br>✅ OAuth<br>✅ Contrôle du cache<br>✅ Mémoire<br>✅ Compression<br>✅ Thème                                                | Meilleure UI<br>Onboarding<br>LogView<br>✅ Session<br>Permissions<br>🔄 Compatibilité multiplateforme<br>✅ Coding Plan<br>✅ Fournisseur Anthropic<br>✅ Entrée multimodale<br>✅ WebUI unifiée |
| Workflow de codage                 | ✅ Commandes slash<br>✅ MCP<br>✅ PlanMode<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi-modèles<br>✅ Gestion du chat<br>✅ Outils (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Mode headless<br>✅ Outils (WebSearch)<br>✅ Support LSP<br>✅ Concurrent Runner                                                                              |
| Fonctionnalités ouvertes      | ✅ Commandes personnalisées                                                                                                                                                                 | ✅ SDK QwenCode<br>✅ Système d'extensions                                                                                                                                                  |
| Intégration de l'écosystème communautaire |                                                                                                                                                                                    | ✅ Plugin VSCode<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Fonctionnalités d'administration     | ✅ Statistiques<br>✅ Retours utilisateurs                                                                                                                                                            | Coûts<br>Tableau de bord<br>✅ Boîte de dialogue de retour utilisateur                                                                                                                                           |

> Pour plus de détails, consultez la liste ci-dessous.

## Fonctionnalités

#### Fonctionnalités terminées

| Fonctionnalité                 | Version   | Description                                             | Catégorie                        | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Coding Plan**         | `V0.10.0` | Authentification et modèles Alibaba Cloud Coding Plan       | Expérience utilisateur                 | 2     |
| WebUI unifiée           | `V0.9.0`  | Bibliothèque de composants WebUI partagée pour VSCode/CLI           | Expérience utilisateur                 | 2     |
| Export du chat             | `V0.8.0`  | Export des sessions en Markdown/HTML/JSON/JSONL             | Expérience utilisateur                 | 2     |
| Système d'extensions        | `V0.8.0`  | Gestion complète des extensions avec commandes slash           | Fonctionnalités ouvertes      | 2     |
| Support LSP             | `V0.7.0`  | Service LSP expérimental (`--experimental-lsp`)         | Workflow de codage                 | 2     |
| Fournisseur Anthropic      | `V0.7.0`  | Support du fournisseur d'API Anthropic                          | Expérience utilisateur                 | 2     |
| Boîte de dialogue de retour utilisateur    | `V0.7.0`  | Collecte de retours dans l'application avec mécanisme anti-fatigue       | Fonctionnalités d'administration     | 2     |
| Concurrent Runner       | `V0.6.0`  | Exécution CLI par lots avec intégration Git                | Workflow de codage                 | 2     |
| Entrée multimodale        | `V0.6.0`  | Support des entrées image, PDF, audio, vidéo                  | Expérience utilisateur                 | 2     |
| Skill                   | `V0.6.0`  | Compétences IA personnalisées extensibles (expérimental)              | Workflow de codage                 | 2     |
| GitHub Actions          | `V0.5.0`  | qwen-code-action et automatisation                         | Intégration de l'écosystème communautaire | 1     |
| Plugin VSCode           | `V0.5.0`  | Plugin d'extension VSCode                                 | Intégration de l'écosystème communautaire | 1     |
| SDK QwenCode            | `V0.4.0`  | SDK ouvert pour l'intégration tierce                    | Fonctionnalités ouvertes      | 1     |
| Session                 | `V0.4.0`  | Gestion améliorée des sessions                             | Expérience utilisateur                 | 1     |
| i18n                    | `V0.3.0`  | Internationalisation et support multilingue           | Expérience utilisateur                 | 1     |
| Mode headless           | `V0.3.0`  | Mode headless (non interactif)                         | Workflow de codage                 | 1     |
| ACP/Zed                 | `V0.2.0`  | Intégration des éditeurs ACP et Zed                          | Intégration de l'écosystème communautaire | 1     |
| Terminal UI             | `V0.1.0+` | Interface utilisateur interactive en terminal                     | Expérience utilisateur                 | 1     |
| Paramètres                | `V0.1.0+` | Système de gestion de la configuration                         | Expérience utilisateur                 | 1     |
| Thème                   | `V0.1.0+` | Support multi-thèmes                                     | Expérience utilisateur                 | 1     |
| Support du protocole OpenAI | `V0.1.0+` | Support du protocole API OpenAI                         | Expérience utilisateur                 | 1     |
| Gestion du chat         | `V0.1.0+` | Gestion des sessions (sauvegarde, restauration, navigation)              | Workflow de codage                 | 1     |
| MCP                     | `V0.1.0+` | Intégration du Model Context Protocol                      | Workflow de codage                 | 1     |
| Multi-modèles             | `V0.1.0+` | Support et basculement multi-modèles                       | Workflow de codage                 | 1     |
| Commandes slash          | `V0.1.0+` | Système de commandes slash                                    | Workflow de codage                 | 1     |
| Outil : Bash              | `V0.1.0+` | Outil d'exécution de commandes shell (avec paramètre is_background) | Workflow de codage                 | 1     |
| Outil : FileRead/EditFile | `V0.1.0+` | Outils de lecture/écriture et d'édition de fichiers                          | Workflow de codage                 | 1     |
| Commandes personnalisées         | `V0.1.0+` | Chargement de commandes personnalisées                                  | Fonctionnalités ouvertes      | 1     |
| Retours utilisateurs                | `V0.1.0+` | Mécanisme de retours (commande /bug)                       | Fonctionnalités d'administration     | 1     |
| Statistiques                   | `V0.1.0+` | Statistiques d'utilisation et affichage des quotas                      | Fonctionnalités d'administration     | 1     |
| Mémoire                  | `V0.0.9+` | Gestion de la mémoire au niveau projet et globale              | Expérience utilisateur                 | 1     |
| Contrôle du cache           | `V0.0.9+` | Contrôle du cache de prompts (Anthropic, DashScope)           | Expérience utilisateur                 | 1     |
| PlanMode                | `V0.0.14` | Mode de planification des tâches                                      | Workflow de codage                 | 1     |
| Compression                | `V0.0.11` | Mécanisme de compression du chat                              | Expérience utilisateur                 | 1     |
| SubAgent                | `V0.0.11` | Système dédié de sous-agents                              | Workflow de codage                 | 1     |
| TodoWrite               | `V0.0.10` | Gestion des tâches et suivi de la progression                   | Workflow de codage                 | 1     |
| Outil : TextSearch        | `V0.0.8+` | Outil de recherche de texte (grep, prend en charge .qwenignore)           | Workflow de codage                 | 1     |
| Outil : WebFetch          | `V0.0.7+` | Outil de récupération de contenu web                               | Workflow de codage                 | 1     |
| Outil : WebSearch         | `V0.0.7+` | Outil de recherche web (via l'API Tavily)                      | Workflow de codage                 | 1     |
| OAuth                   | `V0.0.5+` | Authentification de connexion OAuth (Qwen OAuth)                 | Expérience utilisateur                 | 1     |

#### Fonctionnalités à développer

| Fonctionnalité                      | Priorité | Statut      | Description                       | Catégorie                    |
| ---------------------------- | -------- | ----------- | --------------------------------- | --------------------------- |
| Meilleure UI                    | P1       | Planifié     | Interaction optimisée avec l'interface terminal | Expérience utilisateur             |
| Onboarding                   | P1       | Planifié     | Parcours d'intégration des nouveaux utilisateurs          | Expérience utilisateur             |
| Permissions                   | P1       | Planifié     | Optimisation du système de permissions    | Expérience utilisateur             |
| Compatibilité multiplateforme | P1       | En cours | Compatibilité Windows/Linux/macOS | Expérience utilisateur             |
| LogView                      | P2       | Planifié     | Fonctionnalité de visualisation et de débogage des logs | Expérience utilisateur             |
| Hooks                        | P2       | En cours | Système de hooks d'extensions            | Workflow de codage             |
| Coûts                        | P2       | Planifié     | Suivi et analyse des coûts        | Fonctionnalités d'administration |
| Tableau de bord                    | P2       | Planifié     | Tableau de bord de gestion              | Fonctionnalités d'administration |

#### Fonctionnalités distinctives à discuter

| Fonctionnalité          | Statut   | Description                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Recherche | Découverte de projets et lancement rapide                    |
| Mode compétitif | Recherche | Mode compétitif                                      |
| Pulse            | Recherche | Analyse du pouls d'activité utilisateur (référence OpenAI Pulse) |
| Code Wiki        | Recherche | Système de wiki/documentation pour le codebase du projet            |