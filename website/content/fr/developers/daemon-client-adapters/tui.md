# Projet d'adaptateur TUI pour le daemon (brouillon)

> **Obsolète**: ce document décrit le premier prototype de `DaemonTuiAdapter`. L'adaptateur hérité existe toujours dans `packages/cli/src/ui/daemon/`, mais la direction réutilisable est désormais la couche de transcription partagée de l'interface utilisateur SDK. Pour l'architecture actuelle, voir [`../daemon/14-cli-tui-adapter.md`](../daemon/14-cli-tui-adapter.md).

---

## Objectif (historique)

Ajouter un transport TUI contrôlé par un indicateur qui communique avec `qwen serve` via `DaemonSessionClient` au lieu de créer une exécution `Config` + agent en cours de processus.

Il s'agit d'un chemin de validation interne pour la migration du client Mode B. Il ne doit pas remplacer le chemin TUI par défaut tant que les sorties, les événements typés du daemon, les autorisations de session et les diagnostics de cycle de vie ne sont pas stables.

## Point d'entrée proposé

```bash
QWEN_DAEMON_URL=http://127.0.0.1:4170 qwen --experimental-daemon-tui
```

Optionnel:

```bash
QWEN_DAEMON_TOKEN=... QWEN_DAEMON_WORKSPACE=/repo qwen --experimental-daemon-tui
```

La CLI doit refuser ce mode sauf si les deux conditions suivantes sont remplies :

- `QWEN_DAEMON_URL` ou `--daemon-url` est défini.
- `GET /capabilities` annonce `session_create`, `session_prompt` et `session_events`.

## Flux minimal

1. Créer `DaemonClient` avec l'URL et le jeton du daemon.
2. Récupérer `/capabilities`.
3. Créer ou s'attacher avec `DaemonSessionClient.createOrAttach()`.
4. S'abonner à `session.events()`.
5. Soumettre les invites utilisateur via `session.prompt()`.
6. Router l'annulation via `session.cancel()`.
7. Router le changement de modèle via `session.setModel()`.
8. Router les votes d'autorisation via `session.respondToPermission()`.

## Contrat de rendu

La première implémentation ajoute `DaemonTuiAdapter`, un réducteur et un prototype de transport localement vérifiables. Il ne mappe que ces événements du daemon :

| Événement du daemon                        | Gestion TUI                                              |
| ------------------------------------------ | -------------------------------------------------------- |
| `session_update` / `agent_message_chunk`   | Ajouter le texte de l'assistant                         |
| `session_update` / `agent_thought_chunk`   | Ajouter le texte de réflexion                           |
| `session_update` / `tool_call`             | Afficher le cycle de vie de l'appel d'outil              |
| `permission_request`                       | Afficher l'interface de confirmation existante si possible |
| `permission_resolved`                      | Fermer ou mettre à jour l'interface de confirmation      |
| `model_switched`                           | Mettre à jour l'affichage du pied de page/modèle         |
| `session_died`                             | Afficher l'état de déconnexion et arrêter le streaming   |

Les événements inconnus doivent être ignorés, sans être fatals. Les réducteurs d'événements typés arriveront dans un futur PR de protocole.

L'adaptateur n'est pas encore connecté à l'application Ink par défaut. Le comportement existant de la TUI interactive, JSONL, stream-json et double sortie reste inchangé.

## Objectifs explicitement exclus

- Ne pas supprimer l'exécution TUI en cours de processus.
- Ne pas modifier le comportement JSONL, stream-json ou double sortie dans ce PR.
- Ne pas exposer la gestion CRUD de fichiers, la gestion MCP, la gestion CRUD de mémoire, ou les mutations de fournisseur/auth via la TUI pour l'instant.
- Ne pas faire d'hypothèses de navigateur/web direct vers le daemon ; ceci est uniquement pour le terminal.

## Sécurité de fusion

- Désactivé par défaut.
- Chemin de code additif.
- Aucun indicateur CLI existant ne change de comportement.
- Si le daemon est indisponible, le chemin expérimental échoue avant de démarrer la TUI et indique à l'utilisateur d'exécuter `qwen serve`.

## Plan de validation

- Tester unitairement le mappage événement-à-état-TUI avec des événements synthétiques du daemon.
- Tester unitairement le transfert des invites, annulations, changements de modèle et votes d'autorisation.
- Tester unitairement l'analyse des indicateurs/env lorsque l'indicateur de fonctionnalité est connecté.
- Test de fumée contre un `qwen serve` local :
  - le texte de l'invite est diffusé dans la TUI
  - l'annulation résout l'invite active
  - la demande d'autorisation peut être acceptée ou rejetée
  - la reconnexion envoie le `Last-Event-ID` suivi

## Blocages avant la migration par défaut

- Schéma d'événement typé du daemon.
- Route d'autorisation de session.
- Refactorisation des sorties pour la parité JSONL / stream-json / double sortie.
- Sémantique de fermeture/suppression du cycle de vie de la session.
- Diagnostics d'exécution pour MCP, compétences, fournisseurs et environnement de l'espace de travail.