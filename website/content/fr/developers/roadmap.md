# Feuille de route Qwen Code

> **Objectif** : Rattraper les fonctionnalités de Claude Code, affiner continuellement les détails et améliorer l'expérience utilisateur.

| Catégorie                        | Phase 1                                                                                                                                                                                  | Phase 2                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expérience utilisateur           | ✅ Terminal UI<br>✅ Support du protocole OpenAI<br>✅ Paramètres<br>✅ OAuth<br>✅ Contrôle du cache<br>✅ Mémoire<br>✅ Compression<br>✅ Thème                                                | Meilleure UI<br>Onboarding<br>LogView<br>✅ Session<br>Permissions<br>🔄 Compatibilité multiplateforme<br>✅ Plan de codage<br>✅ Fournisseur Anthropic<br>✅ Entrée multimodale<br>✅ WebUI unifié |
| Workflow de codage               | ✅ Commandes slash<br>✅ MCP<br>✅ PlanMode<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi-modèle<br>✅ Gestion des conversations<br>✅ Outils (WebFetch, Bash, TextSearch, FileRead/EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Mode headless<br>✅ Outils (WebSearch)<br>✅ Support LSP<br>✅ Exécuteur concurrent                                                                                |
| Construction de capacités ouvertes | ✅ Commandes personnalisées                                                                                                                                                               | ✅ SDK QwenCode<br>✅ Système d'extensions                                                                                                                                                    |
| Intégration de l'écosystème communautaire |                                                                                                                                                                                          | ✅ Plugin VSCode<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                      |
| Capacités administratives        | ✅ Statistiques<br>✅ Feedback                                                                                                                                                            | Coûts<br>Tableau de bord<br>✅ Boîte de dialogue de feedback utilisateur                                                                                                                       |

> Pour plus de détails, veuillez consulter la liste ci-dessous.

## Fonctionnalités

#### Fonctionnalités terminées

| Fonctionnalité           | Version    | Description                                                 | Catégorie                     | Phase |
| ------------------------ | ---------- | ----------------------------------------------------------- | ----------------------------- | ----- |
| **Coding Plan**          | `V0.10.0`  | Authentification et modèles du plan de codage Alibaba Cloud | Expérience utilisateur        | 2     |
| Unified WebUI            | `V0.9.0`   | Bibliothèque de composants WebUI partagée pour VSCode/CLI   | Expérience utilisateur        | 2     |
| Export Chat              | `V0.8.0`   | Exporter les sessions au format Markdown/HTML/JSON/JSONL    | Expérience utilisateur        | 2     |
| Extension System         | `V0.8.0`   | Gestion complète des extensions avec commandes slash        | Construction de capacités ouvertes | 2 |
| LSP Support              | `V0.7.0`   | Service LSP expérimental (`--experimental-lsp`)             | Workflow de codage            | 2     |
| Anthropic Provider       | `V0.7.0`   | Support du fournisseur d'API Anthropic                      | Expérience utilisateur        | 2     |
| User Feedback Dialog     | `V0.7.0`   | Collecte de feedback intégrée avec mécanisme de fatigue     | Capacités administratives     | 2     |
| Concurrent Runner        | `V0.6.0`   | Exécution batch en CLI avec intégration Git                 | Workflow de codage            | 2     |
| Multimodal Input         | `V0.6.0`   | Support d'entrée image, PDF, audio, vidéo                   | Expérience utilisateur        | 2     |
| Skill                    | `V0.6.0`   | Compétences IA personnalisées extensibles (expérimental)    | Workflow de codage            | 2     |
| Github Actions           | `V0.5.0`   | qwen-code-action et automatisation                          | Intégration de l'écosystème communautaire | 1 |
| VSCode Plugin            | `V0.5.0`   | Extension VSCode                                            | Intégration de l'écosystème communautaire | 1 |
| QwenCode SDK             | `V0.4.0`   | SDK ouvert pour intégration tierce                          | Construction de capacités ouvertes | 1 |
| Session                  | `V0.4.0`   | Gestion améliorée des sessions                              | Expérience utilisateur        | 1     |
| i18n                     | `V0.3.0`   | Internationalisation et support multilingue                 | Expérience utilisateur        | 1     |
| Headless Mode            | `V0.3.0`   | Mode headless (non interactif)                              | Workflow de codage            | 1     |
| ACP/Zed                  | `V0.2.0`   | Intégration avec les éditeurs ACP et Zed                    | Intégration de l'écosystème communautaire | 1 |
| Terminal UI              | `V0.1.0+`  | Interface utilisateur terminal interactive                  | Expérience utilisateur        | 1     |
| Settings                 | `V0.1.0+`  | Système de gestion de configuration                        | Expérience utilisateur        | 1     |
| Theme                    | `V0.1.0+`  | Support multi-thème                                         | Expérience utilisateur        | 1     |
| Support OpenAI Protocol  | `V0.1.0+`  | Support du protocole OpenAI API                             | Expérience utilisateur        | 1     |
| Chat Management          | `V0.1.0+`  | Gestion des sessions (sauvegarde, restauration, navigation) | Workflow de codage            | 1     |
| MCP                      | `V0.1.0+`  | Intégration du protocole de contexte de modèle              | Workflow de codage            | 1     |
| Multi Model              | `V0.1.0+`  | Support multi-modèle et commutation                         | Workflow de codage            | 1     |
| Slash Commands           | `V0.1.0+`  | Système de commandes slash                                  | Workflow de codage            | 1     |
| Tool: Bash               | `V0.1.0+`  | Outil d'exécution de commandes shell (avec paramètre is_background) | Workflow de codage      | 1     |
| Tool: FileRead/EditFile  | `V0.1.0+`  | Outils de lecture/écriture et édition de fichiers           | Workflow de codage            | 1     |
| Custom Commands          | `V0.1.0+`  | Chargement de commandes personnalisées                      | Construction de capacités ouvertes | 1 |
| Feedback                 | `V0.1.0+`  | Mécanisme de feedback (commande /bug)                       | Capacités administratives     | 1     |
| Stats                    | `V0.1.0+`  | Statistiques d'utilisation et affichage du quota            | Capacités administratives     | 1     |
| Memory                   | `V0.0.9+`  | Gestion de la mémoire au niveau projet et global            | Expérience utilisateur        | 1     |
| Cache Control            | `V0.0.9+`  | Contrôle du cache de prompt (Anthropic, DashScope)          | Expérience utilisateur        | 1     |
| PlanMode                 | `V0.0.14`  | Mode de planification des tâches                            | Workflow de codage            | 1     |
| Compress                 | `V0.0.11`  | Mécanisme de compression des conversations                  | Expérience utilisateur        | 1     |
| SubAgent                 | `V0.0.11`  | Système de sous-agent dédié                                 | Workflow de codage            | 1     |
| TodoWrite                | `V0.0.10`  | Gestion des tâches et suivi de progression                  | Workflow de codage            | 1     |
| Tool: TextSearch         | `V0.0.8+`  | Outil de recherche textuelle (grep, supporte .qwenignore)   | Workflow de codage            | 1     |
| Tool: WebFetch           | `V0.0.7+`  | Outil de récupération de contenu web                        | Workflow de codage            | 1     |
| Tool: WebSearch          | `V0.0.7+`  | Outil de recherche web (utilise l'API Tavily)               | Workflow de codage            | 1     |
| OAuth                    | `V0.0.5+`  | Authentification OAuth (Qwen OAuth)                         | Expérience utilisateur        | 1     |

#### Fonctionnalités à développer

| Fonctionnalité                 | Priorité | Statut     | Description                          | Catégorie                     |
| ------------------------------ | -------- | ---------- | ------------------------------------ | ----------------------------- |
| Better UI                      | P1       | Planifié   | Interaction UI terminal optimisée    | Expérience utilisateur        |
| OnBoarding                     | P1       | Planifié   | Parcours d'intégration des nouveaux utilisateurs | Expérience utilisateur |
| Permission                     | P1       | Planifié   | Optimisation du système de permissions | Expérience utilisateur      |
| Cross-platform Compatibility   | P1       | En cours   | Compatibilité Windows/Linux/macOS    | Expérience utilisateur        |
| LogView                        | P2       | Planifié   | Fonctionnalité de visualisation et débogage des logs | Expérience utilisateur |
| Hooks                          | P2       | En cours   | Système de hooks d'extension         | Workflow de codage            |
| Costs                          | P2       | Planifié   | Suivi et analyse des coûts           | Capacités administratives     |
| Dashboard                      | P2       | Planifié   | Tableau de bord de gestion           | Capacités administratives     |

#### Fonctionnalités distinctives à discuter

| Fonctionnalité    | Statut   | Description                                           |
| ----------------- | -------- | ----------------------------------------------------- |
| Home Spotlight    | Recherche | Découverte de projets et lancement rapide             |
| Competitive Mode  | Recherche | Mode compétitif                                       |
| Pulse             | Recherche | Analyse du pouls d'activité utilisateur (réf. OpenAI Pulse) |
| Code Wiki         | Recherche | Wiki/documentation du code source du projet          |