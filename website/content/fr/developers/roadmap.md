# Feuille de route de Qwen Code

> **Objectif** : Rattraper les fonctionnalités produit de Claude Code, affiner continuellement les détails et améliorer l’expérience utilisateur.

| Catégorie                       | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expérience utilisateur          | ✅ Interface terminal<br>✅ Prise en charge du protocole OpenAI<br>✅ Paramètres<br>✅ Authentification OAuth<br>✅ Contrôle du cache<br>✅ Mémoire<br>✅ Compression<br>✅ Thème         | Interface utilisateur améliorée<br>Tutoriel de prise en main (OnBoarding)<br>Visualiseur de journaux (LogView)<br>✅ Sessions<br>Gestion des autorisations<br>🔄 Compatibilité multiplateforme<br>✅ Planification de développement (Coding Plan)<br>✅ Fournisseur Anthropic<br>✅ Entrées multimodales<br>✅ Interface web unifiée (Unified WebUI) |
| Flux de travail de développement | ✅ Commandes slash<br>✅ Protocole MCP<br>✅ Mode planification (PlanMode)<br>✅ Gestion des tâches (TodoWrite)<br>✅ Sous-agents (SubAgent)<br>✅ Prise en charge de plusieurs modèles<br>✅ Gestion des discussions<br>✅ Outils (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks (points d’extension)<br>✅ Compétences (Skills)<br>✅ Mode sans interface (Headless Mode)<br>✅ Outils (WebSearch)<br>✅ Prise en charge du protocole LSP<br>✅ Exécution concurrente |
| Développement de fonctionnalités ouvertes | ✅ Commandes personnalisées                                                                                                                                                          | ✅ SDK QwenCode<br>✅ Système d’extensions                                                                                                                                              |
| Intégration de l’écosystème communautaire |                                                                                                                                                                                    | ✅ Extension VS Code<br>✅ Support ACP/Zed<br>✅ Intégration GitHub Actions (GHA)                                                                                                      |
| Fonctionnalités administratives | ✅ Statistiques<br>✅ Retours utilisateurs                                                                                                                                              | Coûts<br>Tableau de bord<br>✅ Dialogue de collecte des retours utilisateurs                                                                                                             |

> Pour plus de détails, veuillez consulter la liste ci-dessous.

## Fonctionnalités

#### Fonctionnalités terminées

| Fonctionnalité                     | Version   | Description                                                                 | Catégorie                           | Phase |
| ---------------------------------- | --------- | --------------------------------------------------------------------------- | ----------------------------------- | ----- |
| **Plan de codage**                 | `V0.10.0` | Authentification et modèles du plan de codage Alibaba Cloud                 | Expérience utilisateur              | 2     |
| Interface utilisateur web unifiée  | `V0.9.0`  | Bibliothèque partagée de composants d’interface web pour VSCode/CLI         | Expérience utilisateur              | 2     |
| Exportation des discussions        | `V0.8.0`  | Exportation des sessions au format Markdown/HTML/JSON/JSONL                 | Expérience utilisateur              | 2     |
| Système d’extensions               | `V0.8.0`  | Gestion complète des extensions avec les commandes slash                    | Développement de capacités ouvertes | 2     |
| Prise en charge du protocole LSP  | `V0.7.0`  | Service LSP expérimental (`--experimental-lsp`)                              | Flux de travail de codage           | 2     |
| Fournisseur Anthropic              | `V0.7.0`  | Prise en charge du fournisseur d’API Anthropic                               | Expérience utilisateur              | 2     |
| Dialogue de rétroaction utilisateur | `V0.7.0`  | Collecte de rétroactions intégrée à l’application, avec mécanisme anti-fatigue | Capacités administratives           | 2     |
| Exécuteur concurrent               | `V0.6.0`  | Exécution par lots en ligne de commande avec intégration Git                | Flux de travail de codage           | 2     |
| Entrée multimodale                 | `V0.6.0`  | Prise en charge des entrées image, PDF, audio et vidéo                       | Expérience utilisateur              | 2     |
| Compétence                         | `V0.6.0`  | Compétences IA personnalisables et extensibles (version expérimentale)      | Flux de travail de codage           | 2     |
| Actions GitHub                     | `V0.5.0`  | `qwen-code-action` et automatisation                                        | Intégration de l’écosystème communautaire | 1     |
| Extension VSCode                   | `V0.5.0`  | Extension VSCode                                                            | Intégration de l’écosystème communautaire | 1     |
| SDK QwenCode                       | `V0.4.0`  | SDK ouvert pour l’intégration tierce                                         | Développement de capacités ouvertes | 1     |
| Session                            | `V0.4.0`  | Gestion améliorée des sessions                                                | Expérience utilisateur              | 1     |
| Internationalisation (i18n)        | `V0.3.0`  | Prise en charge de l’internationalisation et du multilinguisme               | Expérience utilisateur              | 1     |
| Mode sans interface graphique      | `V0.3.0`  | Mode sans interface graphique (non interactif)                              | Flux de travail de codage           | 1     |
| Intégration ACP/Zed                | `V0.2.0`  | Intégration des éditeurs ACP et Zed                                          | Intégration de l’écosystème communautaire | 1     |
| Interface utilisateur en terminal  | `V0.1.0+` | Interface utilisateur interactive en terminal                               | Expérience utilisateur              | 1     |
| Paramètres                         | `V0.1.0+` | Système de gestion de la configuration                                       | Expérience utilisateur              | 1     |
| Thèmes                             | `V0.1.0+` | Prise en charge de plusieurs thèmes                                           | Expérience utilisateur              | 1     |
| Prise en charge du protocole OpenAI | `V0.1.0+` | Prise en charge du protocole d’API OpenAI                                   | Expérience utilisateur              | 1     |
| Gestion des discussions            | `V0.1.0+` | Gestion des sessions (enregistrement, restauration, navigation)             | Flux de travail de codage           | 1     |
| Protocole de contexte de modèle (MCP) | `V0.1.0+` | Intégration du protocole de contexte de modèle (MCP)                        | Flux de travail de codage           | 1     |
| Prise en charge de plusieurs modèles | `V0.1.0+` | Prise en charge et commutation entre plusieurs modèles                       | Flux de travail de codage           | 1     |
| Commandes slash                    | `V0.1.0+` | Système de commandes slash                                                   | Flux de travail de codage           | 1     |
| Outil : Bash                       | `V0.1.0+` | Exécution de commandes shell (avec le paramètre `is_background`)            | Flux de travail de codage           | 1     |
| Outil : Lecture/Édition de fichiers | `V0.1.0+` | Outils de lecture/écriture et d’édition de fichiers                         | Flux de travail de codage           | 1     |
| Commandes personnalisées           | `V0.1.0+` | Chargement de commandes personnalisées                                       | Développement de capacités ouvertes | 1     |
| Rétroaction                        | `V0.1.0+` | Mécanisme de rétroaction (commande `/bug`)                                   | Capacités administratives           | 1     |
| Statistiques                         | `V0.1.0+` | Affichage des statistiques d’utilisation et des quotas                      | Capacités administratives           | 1     |
| Mémoire                            | `V0.0.9+` | Gestion de la mémoire au niveau du projet et globale                         | Expérience utilisateur              | 1     |
| Contrôle du cache                  | `V0.0.9+` | Contrôle de la mise en cache des prompts (Anthropic, DashScope)              | Expérience utilisateur              | 1     |
| Mode planification                 | `V0.0.14` | Mode de planification des tâches                                            | Flux de travail de codage           | 1     |
| Compression                        | `V0.0.11` | Mécanisme de compression des discussions                                    | Expérience utilisateur              | 1     |
| Sous-agent                         | `V0.0.11` | Système dédié de sous-agents                                                 | Flux de travail de codage           | 1     |
| Gestion des tâches (TodoWrite)     | `V0.0.10` | Gestion des tâches et suivi de leur progression                             | Flux de travail de codage           | 1     |
| Outil : Recherche textuelle         | `V0.0.8+` | Outil de recherche textuelle (grep, prend en charge `.qwenignore`)          | Flux de travail de codage           | 1     |
| Outil : Récupération web            | `V0.0.7+` | Outil de récupération de contenu web                                         | Flux de travail de codage           | 1     |
| Outil : Recherche web               | `V0.0.7+` | Outil de recherche web (utilisant l’API Tavily)                               | Flux de travail de codage           | 1     |
| Authentification OAuth             | `V0.0.5+` | Authentification OAuth (OAuth Qwen)                                          | Expérience utilisateur              | 1     |

#### Fonctionnalités à développer

| Fonctionnalité                      | Priorité | Statut        | Description                                 | Catégorie                     |
| ----------------------------------- | -------- | ------------- | ------------------------------------------- | ----------------------------- |
| Interface utilisateur améliorée     | P1       | Prévu         | Interaction optimisée avec l’interface du terminal | Expérience utilisateur        |
| Processus d’intégration            | P1       | Prévu         | Parcours d’intégration pour les nouveaux utilisateurs | Expérience utilisateur        |
| Gestion des autorisations          | P1       | Prévu         | Optimisation du système de permissions      | Expérience utilisateur        |
| Compatibilité multiplateforme      | P1       | En cours      | Compatibilité avec Windows/Linux/macOS      | Expérience utilisateur        |
| Visionneuse de journaux (LogView)  | P2       | Prévu         | Fonctionnalité de visualisation et de débogage des journaux | Expérience utilisateur        |
| Hooks                              | P2       | En cours      | Système de hooks pour les extensions        | Flux de travail de développement |
| Coûts                              | P2       | Prévu         | Suivi et analyse des coûts                   | Fonctionnalités administratives |
| Tableau de bord                    | P2       | Prévu         | Tableau de bord de gestion                  | Fonctionnalités administratives |

#### Fonctionnalités distinctives à aborder

| Fonctionnalité     | Statut   | Description                                           |
| ------------------ | -------- | ----------------------------------------------------- |
| Mise en avant sur la page d’accueil | Recherche | Découverte de projets et lancement rapide             |
| Mode compétitif    | Recherche | Mode compétitif                                       |
| Pulse              | Recherche | Analyse du rythme d’activité des utilisateurs (référence OpenAI Pulse) |
| Wiki du code       | Recherche | Système de wiki/documentation pour la base de code du projet |