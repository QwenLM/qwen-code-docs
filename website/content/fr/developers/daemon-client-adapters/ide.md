# Ébauche de l'adaptateur du démon IDE

## Objectif

Permettre à l'extension compagnon VS Code de tester le Mode B en interne en connectant
l'hôte d'extension à `qwen serve` via `DaemonSessionClient`.

La webview ne doit pas appeler le démon directement. C'est l'hôte d'extension qui gère
l'URL du démon, le jeton, l'ID de session et l'état de rejeu SSE, puis transmet les
événements d'application nettoyés à la webview.

## Point d’entrée proposé

Paramètres VS Code :

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

Recours aux variables d’environnement pour le test local :

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## Flux minimal

1. L’hôte d’extension crée un `DaemonClient`.
2. Récupération de `/capabilities` et vérification de la compatibilité de l’espace de travail.
3. Création ou attachement via `DaemonSessionClient.createOrAttach()`.
4. Abonnement aux `session.events()` dans l’hôte d’extension.
5. Traduction des événements du démon en messages existants de la webview.
6. Envoi des invites utilisateur via `session.prompt()`.
7. Routage de l’annulation/du changement de modèle via `session.cancel()` et `session.setModel()`.
8. Routage des décisions d’autorisation via `session.respondToPermission()`.

## Relation avec la connexion ACP existante

La première implémentation introduit un chemin de connexion parallèle, sans remplacer
`AcpConnection` :

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

Les deux chemins doivent, dans la mesure du possible, alimenter les mêmes callbacks
de haut niveau de la webview. Si un événement ne peut pas encore être fidèlement
traduit, le chemin du démon doit afficher un avertissement clair d’état non pris
en charge plutôt que de simuler silencieusement une parité.

Cette PR ajoute `DaemonIdeConnection` en tant qu’adaptateur d’hôte d’extension
vérifiable localement. Il n’est pas encore connecté au chemin par défaut de
`QwenAgentManager`, donc le comportement VS Code existant reste basé sur le
sous-processus ACP.

## Contrat de correspondance des événements

| Événement du démon                         | Gestion IDE                                     |
| ------------------------------------------ | ----------------------------------------------- |
| `session_update` / `agent_message_chunk`   | Callback existant du flux d'assistant           |
| `session_update` / `agent_thought_chunk`   | Callback existant du flux de réflexion          |
| `session_update` / `tool_call`             | Callback existant de mise à jour d'outil        |
| `permission_request`                       | Callback existant de l'interface d'approbation  |
| `permission_resolved`                      | Fermeture/mise à jour de l'interface d'approbation |
| `model_switched`                           | Callback existant de l'état du modèle (si possible) |
| `session_died`                             | Interface de déconnexion + possibilité de reconnexion |

Les événements inconnus doivent être ignorés ou consignés en tant que métadonnées
de débogage.

## UX de localisation du runtime

L’extension doit rendre visible la localisation du démon :

- l’espace de travail/les fichiers sont des chemins de l’hôte du démon
- les serveurs MCP s’exécutent sur l’hôte du démon
- les compétences sont chargées depuis le système de fichiers du démon
- les identifiants du fournisseur sont résolus dans l’environnement du processus du démon

Ne pas sous-entendre que les extensions VS Code locales, le profil navigateur local,
les services localhost locaux ou les identifiants SSH/kube locaux sont automatiquement
disponibles pour le démon.

## Objectifs explicitement exclus

- Pas de migration par défaut depuis `AcpConnection`.
- Pas de transport direct de la webview vers le démon.
- Pas d’opérations CRUD sur les fichiers côté démon via l’IDE tant que les limites
  du service de fichiers ne sont pas définies.
- Pas de RPC inverse pour l’éditeur/navigateur/presse-papiers pour l’instant.
- Pas d’intégration complète de contrôle à distance.

## Sécurité de fusion

- Désactivé par défaut, derrière un paramètre/une variable d’environnement.
- Chemin de connexion parallèle additionnel.
- Chemin de sous-processus ACP VS Code existant inchangé.
- Le jeton du démon ne traverse jamais la frontière pour entrer dans le JavaScript
  de la webview.

## Plan de validation

- Test unitaire de la fabrique de connexion de session du démon et de la
  consommation d’événements SSE.
- Test unitaire du mappage des événements du démon vers les callbacks existants
  de l’hôte d’extension.
- Test unitaire du relais de l’invite, de l’annulation, du changement de modèle
  et de la réponse d’autorisation.
- Test unitaire de la résolution des paramètres/variables d’environnement lorsque
  le fanion de fonctionnalité est branché.
- Test en situation réelle de l’hôte d’extension local contre `qwen serve` :
  - les invites se déversent dans le chat
  - l’annulation fonctionne
  - l’interface d’autorisation peut résoudre une demande
  - la reconnexion SSE utilise `Last-Event-ID` suivi

## Blocages avant la migration par défaut

- Schéma typé des événements du démon.
- Identité du client estampillée par le démon.
- Route d’autorisation liée à la session.
- Diagnostics runtime en lecture seule.
- Limite `FileSystemService` et routes sécurisées de lecture de fichiers.
- Refactorisation du tube de sortie pour la parité CLI/TUI.
