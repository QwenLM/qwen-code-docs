# Continuation à chaud des agents en arrière-plan

## Contexte

Un sous-agent en arrière-plan terminé perd actuellement son runtime
in-process. Un `send_message` ultérieur reconstruit un nouvel `AgentHeadless`
à partir de la transcription JSONL. Cela préserve l'essentiel de l'historique
de conversation visible, mais recrée le chat, la surface d'outils, les
registres par agent et l'état de cache côté provider.

Le chemin de lancement construit aussi deux fois les agents en arrière-plan
ordinaires : une fois avec l'émetteur du parent et une fois avec l'émetteur
dédié de l'arrière-plan. La première instance n'est jamais exécutée ni
détruite.

Cette conception traite le cycle de vie intra-session. La découverte logique
et la continuation après restauration de la session parent sont traitées
séparément par la conception de restauration du roster d'agents en
arrière-plan.

La distinction est comportementale, pas seulement un détail d'implémentation.
À l'intérieur d'une session, la résurrection par transcription préserve déjà
la conversation visible par le modèle, donc la continuation à chaud évite
principalement la reconstruction du runtime et préserve l'état du
provider/des outils. À travers une restauration de session parent, le runtime
en mémoire original ne peut pas survivre au démantèlement du processus. La
continuité logique provient donc de la restauration de l'identité de la tâche
et de la transcription dans la nouvelle session, suivie d'une reconstruction
à froid.

## Objectifs

- Créer un seul runtime pour un nouvel agent ordinaire en arrière-plan.
- Garder ce runtime résident après un tour réussi.
- Continuer une tâche terminée sur le même chat et la même surface d'outils
  préparée.
- Préserver la ligne de tâche actuelle, l'ID de tâche, les événements de
  début/fin par tour et les notifications terminales.
- Garder la résurrection par transcription comme fallback lorsqu'aucun
  runtime résident compatible n'existe.
- Libérer les ressources résidentes en cas d'échec, d'annulation,
  d'arrêt/reset de session, d'éviction d'entrée terminale, de changement de
  répertoire de travail, de changement de branche et de
  fermeture/destruction de session ACP.
- Revendiquer atomiquement les entrées mises en file pendant la fenêtre de
  finalisation avant de publier une complétion réussie.

## Non-objectifs

- Persister un runtime live à travers des processus ou la restauration de la
  session parent.
- Ajouter une valeur `idle` à l'union partagée des statuts de tâche.
- Modifier la façon dont les messages envoyés à un agent activement en cours
  d'exécution sont injectés entre les tours d'outils.
- Rendre les agents fork persistants.
- Étendre la durée de vie des worktrees temporaires au-delà des tours
  terminés.
- Rendre sûrs les hooks de frontmatter enregistrés globalement lorsqu'un
  agent est idle, en les laissant installés.

## Conception

### Runtime headless réutilisable

`AgentHeadless` garde son `GeminiChat` et ses déclarations d'outils préparées
comme état d'instance. Son `execute()` public reste une opération par tour :

- un seul appel peut s'exécuter à la fois ;
- le texte final et le mode de terminaison sont réinitialisés au départ ; les
  statistiques sont réinitialisées pour une nouvelle instruction du parent
  mais restent cumulatives à travers les retries internes du stop-hook de
  cette instruction ;
- le premier appel crée le chat et prépare les outils ;
- les appels suivants ajoutent un nouveau tour utilisateur au même chat et
  émettent un événement de message externe afin que la transcription JSONL
  reste complète.

Cela conserve les hooks existants d'`AgentHeadless`, la télémétrie, le drain
des messages externes et le contrat de résultat terminal. `AgentInteractive`
n'est pas utilisé car son API de file ne fournit pas le résultat de
complétion par tour et la sémantique de notification requis par les tâches en
arrière-plan.

### Contrôleur résident

`BackgroundTaskRegistry` possède une table de contrôleurs en mémoire indexée
par ID de tâche. Le contrôleur est intentionnellement séparé de `AgentTask`,
qui reste un enregistrement sérialisable d'UI/statut.

Un contrôleur peut :

- démarrer une continuation depuis une ligne terminée ;
- annuler et détruire son runtime.

Sur un `send_message` terminé, l'outil demande d'abord au registre une
continuation résidente. Un succès change de manière synchrone la ligne
existante vers `running`, revendique un créneau d'exécution en arrière-plan
normal et planifie le nouveau tour après que le tour précédent s'est
entièrement stabilisé. Un échec utilise le service existant de résurrection
par transcription.

`completed` continue de signifier « le dernier tour s'est terminé ». La
résidence du runtime est un fait d'implémentation interne, donc le statut de
tâche partagé et l'UI ne gagnent pas de nouvel état idle.

### Ressources par tour et résidentes

Chaque continuation reçoit un nouvel abort controller, une paire de hooks
SubagentStart/Stop, un span de trace, un événement de démarrage de tâche, une
notification de complétion et une transition de statut du sidecar. Un runtime
qui nécessiterait un bail de permission AUTO enfant seul n'est pas conservé
car ces baux ne sont pas comptés par référence à travers les sous-agents
concurrents.

Le chat, les outils préparés, le writer JSONL, les écouteurs d'événements,
le registre d'outils à portée d'agent et les ressources MCP par agent restent
vivants pendant que le contrôleur est résident. La destruction est
idempotente.

La limite existante de rétention des entrées terminales borne aussi les
contrôleurs résidents. Élaguer une ligne détruit son contrôleur. Le reset et
l'arrêt du registre détruisent tous les contrôleurs, y compris ceux déjà
terminés.

### Exclusions de compatibilité

La première version ne conserve que les agents nommés ordinaires en
arrière-plan qui :

- se sont terminés normalement ;
- n'utilisent pas `isolation: "worktree"` ;
- ne déclarent pas de hooks de frontmatter ;
- ne nécessitent pas de bail de permission AUTO enfant seul.

Les worktrees temporaires sont actuellement finalisés après chaque tour, donc
conserver un runtime laisserait son Config pointer vers un répertoire
supprimé. Les hooks de frontmatter sont actuellement enregistrés globalement
pour leur durée de vie, donc les conserver pendant l'idle pourrait affecter
un travail sans rapport. Les baux AUTO enfant seul mutent le gestionnaire de
permissions du parent et ne sont pas comptés par référence à travers les
sous-agents concurrents, donc les réacquérir à chaque tour à chaud serait
peu sûr. Les agents avec hooks, isolés par worktree et AUTO enfant seul
continuent via le flux existant de résurrection JSONL. L'agent worktree
reconstruit s'exécute depuis le répertoire de travail courant du parent car
son worktree de lancement temporaire a déjà été finalisé.

## Courses et gestion des échecs

- Immédiatement avant qu'un runtime compatible publie une complétion réussie,
  le tour actif draine la file du registre sans céder la main. S'il
  revendique une entrée, le même runtime headless exécute cette entrée et la
  tâche reste en cours d'exécution. Si la file est vide, la persistance de la
  transcription et la transition de en-cours vers terminé se font de manière
  synchrone, afin qu'un `send_message` ultérieur observe la ligne terminée et
  utilise le chemin de continuation résidente au lieu de recevoir un accusé
  de mise en file trompeur. Les tours isolés par worktree effectuent leur
  drain final avant le démantèlement car leur runtime n'est
  intentionnellement pas continuable ensuite.
- Le registre effectue la transition de terminé vers en-cours de manière
  synchrone avant que la promesse de continuation soit planifiée. Un second
  `send_message` concurrent observe donc `running` et utilise la file de
  messages en cours de tour existante.
- Le tour suivant est chaîné après la promesse du tour précédent, couvrant la
  fenêtre dans laquelle la notification de complétion est émise avant que le
  bloc `finally` précédent ait fini.
- Les tours échoués et annulés suppriment et détruisent le contrôleur
  résident.
- Si la revendication d'un créneau en arrière-plan échoue, la ligne reste
  terminée et l'appelant peut utiliser le chemin d'erreur existant de
  résurrection à froid.
- Une destruction pendant un tour actif annule son contrôleur et reporte le
  nettoyage destructif des ressources au finaliseur du tour.

## Validation

Les tests unitaires doivent prouver :

- qu'un nouveau lancement en arrière-plan crée exactement un `AgentHeadless` ;
- que deux tours séquentiels utilisent un seul `GeminiChat` et une seule
  liste d'outils préparée ;
- qu'un `send_message` terminé préfère le contrôleur résident ;
- que l'absence de contrôleur résident invoque quand même la résurrection
  par transcription ;
- que la seconde instruction utilisateur est présente dans le JSONL ;
- que le reset, l'arrêt/l'annulation et l'élagage terminal détruisent
  exactement une fois.
- que `/branch` refuse le travail en arrière-plan en cours d'exécution et ne
  détruit les résidents terminaux qu'après l'initialisation réussie de la
  branche ;
- que les changements de répertoire de travail et la destruction de session
  ACP libèrent les runtimes résidents.

Le scénario E2E utilise un seul ID de tâche pour deux phases terminées et
vérifie que la seconde phase se souvient d'un nonce de la première.
L'identité physique du runtime est vérifiée par les tests unitaires car le
stream JSON n'expose pas les comptes de constructeurs.
