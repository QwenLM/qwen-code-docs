# Ébauche d'adaptateur démon pour canaux et backend web

## Objectif

Permettre aux adaptateurs de canaux et aux backends de chat web d'utiliser `qwen serve` via `DaemonSessionClient` tout en conservant le comportement existant du sous-processus ACP des canaux par défaut.

Cette ébauche ne couvre que les clients côté serveur :

- Backend de bot canal -> `qwen serve`
- Navigateur web -> backend web / BFF -> `qwen serve`

Elle n'autorise explicitement pas le JavaScript du navigateur à appeler le démon directement. Le démon rejette actuellement les requêtes `Origin` des navigateurs par conception.

## Points d'entrée proposés

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

## Flux minimal pour les canaux

Cette PR ajoute `DaemonChannelBridge`, un pont côté serveur vérifiable localement pour les adaptateurs de canaux et de backend web. Il conserve le pont ACP existant comme valeur par défaut et gère l'état de la session du démon à l'intérieur du processus backend.

1. Résoudre l'expéditeur/thread du canal en une clé de session de canal.
2. Utiliser `DaemonClient` + `DaemonSessionClient.createOrAttach()`.
3. Soumettre le texte utilisateur entrant avec `session.prompt()`.
4. S'abonner à `session.events()` et collecter les morceaux de texte de l'assistant.
5. Renvoyer le texte final via l'adaptateur de plateforme.
6. Voter sur les permissions via `session.respondToPermission()`.
7. Annuler le travail actif via `session.cancel()`.

## Flux minimal pour le backend web

1. Le navigateur ouvre un websocket ou un flux HTTP vers le backend web.
2. Le backend possède `DaemonSessionClient`.
3. Le backend traduit les messages du navigateur en invites du démon.
4. Le backend traduit les événements SSE du démon en événements d'application sécurisés pour le navigateur.
5. Le backend stocke le `sessionId` du démon et le dernier identifiant d'événement vu côté serveur.

Les clients navigateur ne doivent pas recevoir les tokens porteurs du démon.

## Contrainte d'isolation de session

Le comportement actuel du démon en phase 1 est effectivement `sessionScope: single` au niveau du paramètre du démon. Jusqu'à ce que le `sessionScope` par requête soit implémenté, les déploiements multi-utilisateurs de canaux ou web doivent choisir l'une de ces configurations sûres :

- un démon par thread de canal / salon web
- un démon par espace de travail utilisateur
- démo mono-utilisateur uniquement

Ne pas multiplexer silencieusement des threads de canaux non liés en une seule session du démon.

## Contrat de mappage des événements

| Événement du démon                       | Gestion par le backend canal/web                |
| ---------------------------------------- | ----------------------------------------------- |
| `session_update` / `agent_message_chunk` | Ajouter le texte de l'assistant                 |
| `session_update` / `agent_thought_chunk` | Flux optionnel masqué/de débogage               |
| `session_update` / `tool_call`           | Émettre une carte/message d'état d'outil        |
| `permission_request`                     | Interaction d'approbation spécifique à la plateforme |
| `permission_resolved`                    | Fermer/mettre à jour l'interaction d'approbation|
| `model_switched`                         | Mettre à jour les métadonnées de session du backend |
| `session_died`                           | Notifier l'utilisateur et arrêter le flux       |

Les événements inconnus du démon doivent être ignorés ou transmis comme métadonnées de débogage, sans être fatals.

Le pont n'est pas encore connecté à `qwen channel start`. Le comportement existant de Telegram, Weixin, Dingtalk, des canaux plugins et du navigateur reste inchangé.

## Objectifs explicitement exclus

- Pas d'appel fetch ou EventSource direct du navigateur vers le démon.
- Pas d'assouplissement CORS dans cette PR d'adaptateur.
- Pas de migration par défaut des canaux Telegram, Weixin, Dingtalk ou plugins.
- Pas de CRUD de fichiers, de mémoire, de redémarrage MCP ou de mutation de fournisseur.
- Pas d'émulation de sessionScope dans le client en l'absence de support côté démon.

## Sécurité de la fusion

- Désactivé par défaut.
- Le pont ACP existant des canaux reste la valeur par défaut.
- Le backend web est une couche BFF explicite, pas un changement de sécurité du démon.
- Aucun adaptateur de canal ne doit importer les tokens du démon dans le code du frontend/navigateur.

## Plan de validation

- Test unitaire de la liaison clé de session canal à session démon.
- Test unitaire du mappage événement démon vers message canal/web.
- Test unitaire du forwarding de prompt, annulation, changement de modèle et réponse de permission.
- Test de fumée d'un backend canal mono-utilisateur contre `qwen serve` local.
- Test de fumée du flux navigateur -> BFF -> démon sans exposer le token du démon.

## Blocages avant la migration par défaut

- `sessionScope` par requête.
- Métadonnées de session + cycle de vie fermeture/suppression.
- Identité client estampillée par le démon.
- Route de permission avec portée de session.
- Diagnostics en lecture seule pour MCP, skills, providers et environnement.