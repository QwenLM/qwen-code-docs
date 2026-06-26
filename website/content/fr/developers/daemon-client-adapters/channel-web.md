# Projet d’adaptateur pour le démon des canaux et du backend web

## Objectif

Permettre aux adaptateurs de canal et aux backends de chat web de consommer `qwen serve` via `DaemonSessionClient`, tout en conservant le comportement par défaut actuel du sous-processus ACP pour les canaux.

Ce projet couvre uniquement les clients côté serveur :

- Backend de bot de canal -> `qwen serve`
- Navigateur web -> backend web / BFF -> `qwen serve`

Il n’autorise explicitement pas le JavaScript du navigateur à appeler le démon directement. Le démon refuse actuellement les requêtes provenant de navigateurs (`Origin`) par conception.

## Points d’entrée proposés

Backend de canal :

```bash
QWEN_CHANNEL_DAEMON_URL=http://127.0.0.1:4170 qwen channel start telegram
```

Backend web :

```bash
QWEN_WEB_DAEMON_URL=http://127.0.0.1:4170 qwen web-chat-backend
```

Variables optionnelles partagées :

```bash
QWEN_DAEMON_TOKEN=...
QWEN_DAEMON_WORKSPACE=/repo
```

## Flux minimal pour un canal

Cette PR ajoute `DaemonChannelBridge`, un pont côté serveur vérifiable localement pour les adaptateurs de canal et de backend web. Elle conserve le pont ACP existant comme comportement par défaut et gère l’état de session du démon dans le processus backend.

1. Résoudre l’expéditeur/fil de discussion du canal en une clé de session de canal.
2. Utiliser `DaemonClient` + `DaemonSessionClient.createOrAttach()`.
3. Soumettre le texte entrant de l’utilisateur avec `session.prompt()`.
4. S’abonner à `session.events()` et collecter les morceaux de texte de l’assistant.
5. Renvoyer le texte final via l’adaptateur de plateforme.
6. Envoyer les votes d’autorisation via `session.respondToPermission()`.
7. Annuler le travail en cours via `session.cancel()`.

## Flux minimal pour un backend web

1. Le navigateur ouvre un websocket ou un flux HTTP vers le backend web.
2. Le backend possède `DaemonSessionClient`.
3. Le backend traduit les messages du navigateur en requêtes au démon.
4. Le backend traduit les événements SSE du démon en événements d’application compatibles navigateur.
5. Le backend stocke le `sessionId` du démon et le dernier identifiant d’événement vu côté serveur.

Les clients navigateur ne doivent pas recevoir les jetons porteurs du démon.

## Contrainte d’isolation des sessions

Le comportement actuel du démon (étape 1) est effectivement `sessionScope: single` au niveau des paramètres du démon. Tant que le `sessionScope` par requête n’est pas disponible, les déploiements multi-utilisateurs (canaux ou web) doivent choisir l’une de ces formes sécurisées :

- un démon par fil de discussion de canal / salle web
- un démon par espace de travail utilisateur
- démonstration mono-utilisateur uniquement

Ne pas multiplexer silencieusement des fils de discussion non liés dans une même session de démon.

## Contrat de mappage des événements

| Événement du démon                        | Traitement par le backend canal/web         |
| ----------------------------------------- | ------------------------------------------- |
| `session_update` / `agent_message_chunk`  | Ajouter le texte de l’assistant             |
| `session_update` / `agent_thought_chunk`  | Flux optionnel masqué/de débogage           |
| `session_update` / `tool_call`            | Émettre une carte/message d’état d’outil    |
| `permission_request`                      | Interaction d’approbation spécifique à la plateforme |
| `permission_resolved`                     | Fermer/mettre à jour l’interaction d’approbation |
| `model_switched`                          | Mettre à jour les métadonnées de session du backend |
| `session_died`                            | Notifier l’utilisateur et arrêter le flux   |

Les événements inconnus du démon doivent être ignorés ou transmis comme métadonnées de débogage, sans être fatals.

Le pont n’est pas encore intégré dans `qwen channel start`. Le comportement existant de Telegram, Weixin, Dingtalk, des canaux de plugins et du navigateur reste inchangé.

## Objectifs explicitement exclus

- Pas d’appel direct du navigateur au démon (fetch ou EventSource).
- Pas d’assouplissement de CORS dans cette PR d’adaptateur.
- Pas de migration par défaut des canaux Telegram, Weixin, Dingtalk ou plugins.
- Pas de CRUD de fichiers, pas de CRUD de mémoire, pas de redémarrage MCP ni de modification de fournisseur.
- Pas d’émulation de `sessionScope` dans le client lorsque le démon ne le supporte pas.

## Sécurité du merge

- Désactivé par défaut.
- Le pont ACP existant reste le comportement par défaut pour les canaux.
- Le backend web est une couche BFF explicite, pas un changement de sécurité du démon.
- Aucun adaptateur de canal ne doit importer les jetons du démon dans le code frontend/navigateur.

## Plan de validation

- Tester unitairement la liaison clé de session de canal → session du démon.
- Tester unitairement le mappage des événements du démon vers les messages du canal/web.
- Tester unitairement le transfert des requêtes (prompt, annulation, changement de modèle, réponse d’autorisation).
- Tester en conditions réelles un backend de canal mono-utilisateur contre un `qwen serve` local.
- Tester le flux navigateur → BFF → démon sans exposer le jeton du démon.

## Blocages avant la migration par défaut

- `sessionScope` par requête.
- Métadonnées de session + cycle de vie (fermeture/suppression).
- Identité client estampillée par le démon.
- Route d’autorisation limitée à la session.
- Diagnostics en lecture seule pour MCP, compétences, fournisseurs et environnement.
