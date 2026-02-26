# Feuille de route Qwen Code

> **Objectif** : Rattraper la fonctionnalité produit de Claude Code, affiner continuellement les détails et améliorer l'expérience utilisateur.

| Catégorie                       | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expérience utilisateur        | ✅ Interface terminal<br>✅ Prise en charge du protocole OpenAI<br>✅ Paramètres<br>✅ Authentification OAuth<br>✅ Contrôle du cache<br>✅ Mémoire<br>✅ Compression<br>✅ Thème | Interface meilleure<br>Accueil<br>Vue des journaux<br>✅ Sessions<br>Autorisations<br>🔄 Compatibilité multiplateforme<br>✅ Planification du code<br>✅ Fournisseur Anthropic<br>✅ Entrée multimodale<br>✅ Interface web unifiée |
| Flux de travail de codage       | ✅ Commandes slash<br>✅ MCP<br>✅ Mode planification<br>✅ TodoWrite<br>✅ Sous-agents<br>✅ Multi-modèles<br>✅ Gestion des discussions<br>✅ Outils (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Compétences<br>✅ Mode sans interface graphique<br>✅ Outils (WebSearch)<br>✅ Prise en charge LSP<br>✅ Exécution concurrente |
| Développement de capacités ouvertes | ✅ Commandes personnalisées                                                                                                                                                                 | ✅ SDK QwenCode<br>✅ Système d'extensions                                                                                                                                                  |
| Intégration à l'écosystème communautaire |                                                                                                                                                                                    | ✅ Extension VSCode<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Fonctionnalités administratives | ✅ Statistiques<br>✅ Retours utilisateurs                                                                                                                                                            | Coûts<br>Tableau de bord<br>✅ Dialogue de retour utilisateur                                                                                                                                           |

> Pour plus de détails, veuillez consulter la liste ci-dessous.

## Fonctionnalités

#### Fonctionnalités terminées

| Fonctionnalité          | Version   | Description                                             | Catégorie                       | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Plan de codage**      | `V0.10.0` | Authentification et modèles du plan de codage Bailian   | Expérience utilisateur          | 2     |
| Interface Web unifiée   | `V0.9.0`  | Bibliothèque de composants WebUI partagés pour VSCode/CLI | Expérience utilisateur          | 2     |
| Exportation du chat     | `V0.8.0`  | Exporter les sessions en Markdown/HTML/JSON/JSONL       | Expérience utilisateur          | 2     |
| Système d'extensions    | `V0.8.0`  | Gestion complète des extensions avec commandes slash    | Construction de capacités ouvertes | 2     |
| Prise en charge LSP     | `V0.7.0`  | Service LSP expérimental (`--experimental-lsp`)         | Flux de travail de codage       | 2     |
| Fournisseur Anthropic   | `V0.7.0`  | Prise en charge du fournisseur d'API Anthropic          | Expérience utilisateur          | 2     |
| Boîte de dialogue de retour utilisateur | `V0.7.0`  | Collecte de commentaires intégrée avec mécanisme anti-fatigue | Capacités administratives     | 2     |
| Exécuteur concurrent    | `V0.6.0`  | Exécution par lots en CLI avec intégration Git          | Flux de travail de codage       | 2     |
| Entrée multimodale      | `V0.6.0`  | Prise en charge des entrées image, PDF, audio, vidéo    | Expérience utilisateur          | 2     |
| Compétence              | `V0.6.0`  | Compétences personnalisées extensibles (expérimental)   | Flux de travail de codage       | 2     |
| Actions GitHub          | `V0.5.0`  | qwen-code-action et automatisation                      | Intégration de l'écosystème communautaire | 1     |
| Plugin VSCode           | `V0.5.0`  | Extension plugin VSCode                                 | Intégration de l'écosystème communautaire | 1     |
| SDK QwenCode            | `V0.4.0`  | SDK ouvert pour l'intégration tierce                    | Construction de capacités ouvertes | 1     |
| Session                 | `V0.4.0`  | Gestion améliorée des sessions                          | Expérience utilisateur          | 1     |
| i18n                    | `V0.3.0`  | Internationalisation et prise en charge multilingue     | Expérience utilisateur          | 1     |
| Mode sans interface     | `V0.3.0`  | Mode sans interface (non interactif)                    | Flux de travail de codage       | 1     |
| ACP/Zed                 | `V0.2.0`  | Intégration de l'éditeur ACP et Zed                     | Intégration de l'écosystème communautaire | 1     |
| Interface terminal      | `V0.1.0+` | Interface utilisateur interactive en terminal           | Expérience utilisateur          | 1     |
| Paramètres              | `V0.1.0+` | Système de gestion de configuration                     | Expérience utilisateur          | 1     |
| Thème                   | `V0.1.0+` | Prise en charge de thèmes multiples                     | Expérience utilisateur          | 1     |
| Prise en charge du protocole OpenAI | `V0.1.0+` | Prise en charge du protocole API OpenAI               | Expérience utilisateur          | 1     |
| Gestion des discussions | `V0.1.0+` | Gestion des sessions (sauvegarde, restauration, navigation) | Flux de travail de codage       | 1     |
| MCP                     | `V0.1.0+` | Intégration du protocole de contexte de modèle          | Flux de travail de codage       | 1     |
| Multi-modèle            | `V0.1.0+` | Prise en charge et basculement entre plusieurs modèles  | Flux de travail de codage       | 1     |
| Commandes slash         | `V0.1.0+` | Système de commandes slash                              | Flux de travail de codage       | 1     |
| Outil : Bash            | `V0.1.0+` | Outil d'exécution de commandes shell (avec paramètre is_background) | Flux de travail de codage       | 1     |
| Outil : FileRead/EditFile | `V0.1.0+` | Outils de lecture/écriture et édition de fichiers       | Flux de travail de codage       | 1     |
| Commandes personnalisées | `V0.1.0+` | Chargement de commandes personnalisées                  | Construction de capacités ouvertes | 1     |
| Retour                  | `V0.1.0+` | Mécanisme de retour (/commande bug)                     | Capacités administratives       | 1     |
| Statistiques            | `V0.1.0+` | Affichage des statistiques d'utilisation et des quotas  | Capacités administratives       | 1     |
| Mémoire                 | `V0.0.9+` | Gestion de la mémoire au niveau projet et global        | Expérience utilisateur          | 1     |
| Contrôle du cache       | `V0.0.9+` | Contrôle du cache des invites (Anthropic, DashScope)    | Expérience utilisateur          | 1     |
| ModePlan                | `V0.0.14` | Mode de planification des tâches                        | Flux de travail de codage       | 1     |
| Compression             | `V0.0.11` | Mécanisme de compression des discussions                | Expérience utilisateur          | 1     |
| Sous-agent              | `V0.0.11` | Système dédié aux sous-agents                           | Flux de travail de codage       | 1     |
| TodoWrite               | `V0.0.10` | Gestion des tâches et suivi de progression              | Flux de travail de codage       | 1     |
| Outil : TextSearch      | `V0.0.8+` | Outil de recherche de texte (grep, prend en charge .qwenignore) | Flux de travail de codage       | 1     |
| Outil : WebFetch        | `V0.0.7+` | Outil de récupération de contenu web                    | Flux de travail de codage       | 1     |
| Outil : WebSearch       | `V0.0.7+` | Outil de recherche web (utilisant l'API Tavily)         | Flux de travail de codage       | 1     |
| OAuth                   | `V0.0.5+` | Authentification de connexion OAuth (Qwen OAuth)        | Expérience utilisateur          | 1     |

#### Fonctionnalités à développer

| Fonctionnalité               | Priorité | Statut      | Description                                | Catégorie                 |
| ---------------------------- | -------- | ----------- | ------------------------------------------ | ------------------------- |
| Meilleure interface          | P1       | Planifié    | Interaction optimisée avec l'interface du terminal | Expérience utilisateur    |
| Intégration                  | P1       | Planifié    | Flux d'intégration pour les nouveaux utilisateurs | Expérience utilisateur    |
| Permissions                  | P1       | Planifié    | Optimisation du système de permissions     | Expérience utilisateur    |
| Compatibilité multiplateforme| P1       | En cours    | Compatibilité Windows/Linux/macOS          | Expérience utilisateur    |
| Visualiseur de logs          | P2       | Planifié    | Fonctionnalité de visualisation et débogage des logs | Expérience utilisateur    |
| Hooks                        | P2       | En cours    | Système d'extensions par crochets          | Flux de travail de codage |
| Coûts                        | P2       | Planifié    | Suivi et analyse des coûts                 | Fonctionnalités administratives |
| Tableau de bord              | P2       | Planifié    | Tableau de bord de gestion                 | Fonctionnalités administratives |

#### Fonctionnalités distinctives à discuter

| Fonctionnalité   | Statut   | Description                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| Mise en avant accueil | Recherche | Découverte de projets et lancement rapide             |
| Mode compétitif  | Recherche | Mode compétitif                                       |
| Pulse            | Recherche | Analyse de l'activité utilisateur (référence OpenAI Pulse) |
| Code Wiki        | Recherche | Système de wiki/documentation pour le code du projet  |