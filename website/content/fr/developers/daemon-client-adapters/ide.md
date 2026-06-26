# Projet d'adaptateur de démon IDE

## Objectif

Permettre à l’extension compagnon VS Code de tester en interne le mode B en se connectant depuis l’hôte d’extension à `qwen serve` via `DaemonSessionClient`.

La webview ne doit pas appeler le démon directement. L’hôte d’extension possède l’URL, le jeton, l’ID de session et l’état de relecture SSE du démon, puis transmet les événements d’application nettoyés à la webview.

## Point d’entrée proposé

Paramètres VS Code :

```json
{
  "qwen-code.experimentalDaemon.enabled": true,
  "qwen-code.experimentalDaemon.url": "http://127.0.0.1:4170",
  "qwen-code.experimentalDaemon.token": ""
}
```

Solution de repli environnementale pour les tests internes locaux :

```bash
QWEN_IDE_DAEMON_URL=http://127.0.0.1:4170 code .
```

## Flux minimal

1. L’hôte d’extension crée un `DaemonClient`.
2. Récupère les `/capabilities` et vérifie la compatibilité de l’espace de travail.
3. Crée ou attache avec `DaemonSessionClient.createOrAttach()`.
4. S’abonne à `session.events()` dans l’hôte d’extension.
5. Traduit les événements du démon en messages webview existants.
6. Envoie les invites utilisateur via `session.prompt()`.
7. Achemine l’annulation/changement de modèle via `session.cancel()` et `session.setModel()`.
8. Achemine les décisions d’autorisation via `session.respondToPermission()`.

## Relation avec la connexion ACP existante

La première implémentation introduit un chemin de connexion frère, et ne remplace pas `AcpConnection` :

```text
QwenAgentManager
  current default -> AcpConnection -> qwen --acp child
  experimental    -> DaemonIdeConnection -> qwen serve HTTP/SSE
```

Les deux chemins devraient alimenter les mêmes rappels webview de haut niveau lorsque c’est possible. Si un événement ne peut pas encore être mappé fidèlement, le chemin du démon doit afficher un avertissement clair d’état non pris en charge plutôt que de faire semblant silencieusement d’avoir la parité.

Cette PR ajoute `DaemonIdeConnection` comme pic d’adaptateur d’hôte d’extension vérifiable localement. Il n’est pas encore connecté au chemin par défaut de `QwenAgentManager`, donc le comportement existant de VS Code reste basé sur le sous-processus ACP.

## Contrat de mappage d’événements

| Événement du démon                       | Gestion IDE                                        |
| ---------------------------------------- | -------------------------------------------------- |
| `session_update` / `agent_message_chunk` | Rappel de flux d’assistant existant                  |
| `session_update` / `agent_thought_chunk` | Rappel de flux de réflexion existant                  |
| `session_update` / `tool_call`           | Rappel de mise à jour d’appel d’outil existant        |
| `permission_request`                     | Rappel d’interface d’approbation existant              |
| `permission_resolved`                    | Fermer/mettre à jour l’interface d’approbation       |
| `model_switched`                         | Rappel d’état de modèle existant si possible          |
| `session_died`                           | Interface de déconnexion + mécanisme de reconnexion  |

Les événements inconnus doivent être ignorés ou consignés comme métadonnées de débogage.

## UX de localité d’exécution

L’extension doit rendre visible la localité du démon :

- les espaces de travail/fichiers sont des chemins de l’hôte du démon
- les serveurs MCP s’exécutent sur l’hôte du démon
- les compétences sont chargées depuis le système de fichiers du démon
- les credentials du fournisseur sont résolus dans l’environnement du processus du démon

Ne sous-entendez pas que les extensions VS Code locales, le profil du navigateur local, les services localhost locaux ou les credentials SSH/kube locaux sont automatiquement disponibles pour le démon.

## Objectifs explicitement exclus

- Pas de migration par défaut loin de `AcpConnection`.
- Pas de transport webview direct vers le démon.
- Pas de CRUD de fichiers côté démon via l’IDE tant que les limites du service de fichiers ne sont pas en place.
- Pas encore de RPC inverse pour l’éditeur/navigateur/presse-papiers.
- Pas d’intégration complète de contrôle à distance.

## Sécurité de fusion

- Désactivé par défaut via paramètre/variable d’environnement.
- Chemin de connexion frère additif.
- Chemin de sous-processus ACP VS Code existant inchangé.
- Le jeton du démon ne traverse jamais vers le JavaScript de la webview.

## Plan de validation

- Tests unitaires de la connexion à la fabrique de sessions du démon et de la consommation d’événements SSE.
- Tests unitaires du mappage des événements du démon vers les rappels existants de l’hôte d’extension.
- Tests unitaires de la transmission des invites, annulations, changements de modèle et réponses d’autorisation.
- Tests unitaires de la résolution des paramètres/env lorsque le flag de fonctionnalité est connecté.
- Test de fumée de l’hôte d’extension local contre `qwen serve` :
  - le flux d’invite entre dans le chat
  - l’annulation fonctionne
  - l’interface d’autorisation peut résoudre une demande
  - la reconnexion SSE utilise le `Last-Event-ID` suivi

## Bloqueurs avant la migration par défaut

- Schéma d’événement de démon typé.
- Identité client estampillée par le démon.
- Route d’autorisation limitée à la session.
- Diagnostics d’exécution en lecture seule.
- Limite de `FileSystemService` et routes de lecture de fichiers sécurisées.
- Refactorisation du récepteur de sortie pour la parité CLI/TUI.