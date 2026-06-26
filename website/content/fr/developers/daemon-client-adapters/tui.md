# Ébauche de l’adaptateur démon TUI

> **Obsolète** : ce document décrit l’ancienne implémentation expérimentale `DaemonTuiAdapter`. L’adaptateur historique existe encore dans `packages/cli/src/ui/daemon/`, mais la direction réutilisable est désormais la couche de transcription partagée de l’interface utilisateur du SDK. Pour l’architecture actuelle, voir [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md).

---

## Objectif (historique)

Ajouter un transport TUI contrôlé par un indicateur (flag) qui communique avec `qwen serve` via `DaemonSessionClient` au lieu de créer un `Config` + moteur d’agent en processus.

Il s’agit d’un chemin de validation interne pour la migration du client Mode B. Il ne doit pas remplacer le chemin TUI par défaut tant que les sorties de sink, les événements typés du démon, les autorisations liées à la session et les diagnostics de cycle de vie ne sont pas stables.

## Point d’entrée proposé

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

Optionnel :

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

Le CLI doit refuser ce mode sauf si les deux conditions suivantes sont remplies :

- `QWEN_DAEMON_URL` ou `--daemon-url` est défini.
- `GET /capabilities` annonce `session_create`, `session_prompt` et `session_events`.

## Flux minimal

1. Créer `DaemonClient` avec l’URL et le jeton du démon.
2. Récupérer `/capabilities`.
3. Créer ou s’attacher avec `DaemonSessionClient.createOrAttach()`.
4. S’abonner à `session.events()`.
5. Soumettre les invites utilisateur via `session.prompt()`.
6. Router l’annulation via `session.cancel()`.
7. Router le changement de modèle via `session.setModel()`.
8. Router les votes d’autorisation via `session.respondToPermission()`.

## Contrat de rendu

La première implémentation ajoute `DaemonTuiAdapter`, un réducteur et un transport expérimental vérifiable localement. Il mappe uniquement ces événements du démon :

| Événement du démon                     | Gestion TUI                                   |
| --------------------------------------- | --------------------------------------------- |
| `session_update` / `agent_message_chunk` | Ajouter le texte de l’assistant              |
| `session_update` / `agent_thought_chunk` | Ajouter le texte de réflexion                |
| `session_update` / `tool_call`           | Afficher le cycle de vie de l’appel d’outil   |
| `permission_request`                     | Afficher l’interface de confirmation existante |
| `permission_resolved`                    | Fermer ou mettre à jour l’interface de confirmation |
| `model_switched`                         | Mettre à jour l’affichage du pied de page/modèle |
| `session_died`                           | Afficher l’état déconnecté et arrêter le flux |

Les événements inconnus doivent être ignorés, non fatals. Les réducteurs d’événements typés arriveront dans une PR de protocole ultérieure.

L’adaptateur n’est pas encore intégré dans l’application Ink par défaut. Le comportement existant du TUI interactif, JSONL, stream-json et double sortie reste inchangé.

## Objectifs explicitement exclus

- Ne pas supprimer le moteur d’exécution TUI en processus actuel.
- Ne pas modifier le comportement de JSONL, stream-json ou double sortie dans cette PR.
- Ne pas exposer les opérations CRUD sur fichiers, la gestion MCP, les opérations CRUD mémoire, ni les mutations de fournisseur/auth via TUI pour l’instant.
- Ne pas faire d’hypothèses de connexion directe navigateur/web au démon ; ceci est réservé au terminal.

## Sécurité de fusion

- Désactivé par défaut.
- Chemin de code additif.
- Aucun indicateur CLI existant ne change de comportement.
- Si le démon est indisponible, le chemin expérimental échoue avant de lancer le TUI et indique à l’utilisateur d’exécuter `qwen serve`.

## Plan de validation

- Tester unitairement le mappage événement → état TUI avec des événements de démon synthétiques.
- Tester unitairement le transfert des actions d’invite, d’annulation, de changement de modèle et de vote d’autorisation.
- Tester unitairement l’analyse des indicateurs et variables d’environnement lors de l’activation du flag de fonctionnalité.
- Effectuer un test de fumée avec un `qwen serve` local :
  - le texte de l’invite s’affiche dans le TUI
  - l’annulation résout l’invite active
  - la demande d’autorisation peut être acceptée ou refusée
  - la reconnexion envoie le `Last-Event-ID` suivi

## Blocages avant la migration par défaut

- Schéma d’événements de démon typés.
- Route d’autorisation liée à la session.
- Refactorisation du sink de sortie pour la parité JSONL / stream-json / double sortie.
- Sémantiques de fermeture/suppression de cycle de vie de session.
- Diagnostics d’exécution pour MCP, compétences, fournisseurs et environnement de l’espace de travail.
