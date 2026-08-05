# Restauration du roster d'agents en arrière-plan

## Contexte

Les sidecars des agents en arrière-plan et les transcriptions JSONL
persistent l'identité logique et l'historique, tandis que la
`BackgroundTaskRegistry` indexe les tâches adressables de la session
courante. Le chargeur de reprise ne restaure actuellement que les sidecars
laissés en état `running`. Les agents terminés disparaissent donc du registre
après la restauration de leur session parent, même si leurs transcriptions
restent disponibles. Le modèle n'a pas non plus d'outil pour interroger le
registre.

## Objectifs

- Restaurer les agents récents terminés en arrière-plan avec leurs IDs de
  tâche originaux.
- Ajouter un outil `list_agents` appelable par le modèle pour la découverte
  à la demande.
- Garder `send_message(task_id)` comme opération de continuation.
- Donner au modèle un unique rappel court, one-shot, après la restauration.
- Appliquer le même comportement de restauration aux points d'entrée TUI,
  headless et ACP.

## Non-objectifs

- Persister un runtime JavaScript live à travers le démantèlement du
  processus.
- Remplacer l'outil `task_list` des Agent Teams.
- Restaurer les agents échoués ou annulés.
- Reconstruire l'isolation par worktree temporaire.

## Conception

Le scan du répertoire de session accepte les sidecars `running` et
`completed`. Les entrées en cours d'exécution deviennent en pause, en
préservant le comportement existant de travail interrompu. Les entrées
terminées restent terminées, sont marquées comme déjà notifiées, et
conservent les chemins de transcription et de métadonnées nécessaires à la
résurrection par `send_message`.

Les nouveaux sidecars persistent si le lancement original était en
arrière-plan. Les entrées terminées ne sont restaurées que lorsque ce
marqueur est explicitement vrai, afin que les sidecars terminés au premier
plan et legacy non marqués ne soient pas exposés comme des agents en
arrière-plan réutilisables. Les sidecars legacy en cours d'exécution
conservent le comportement de récupération existant.

Le chargeur vérifie le nom de fichier du sidecar et le propriétaire de la
session parent avant l'enregistrement. Une ligne conservée avec une
transcription manquante, une identité de transcription divergente, une
isolation incompatible ou un répertoire de travail conflictuel reste visible
mais est marquée non continuable. Les lignes isolées par worktree sont
traitées de la même façon car leur contexte de propriété temporaire ne peut
pas être reconstruit en sécurité. Seules les entrées terminées conservées les
plus récentes sont restaurées ; les entrées en cours d'exécution ne sont pas
soumises à cette limite.

`list_agents` lit le registre live et renvoie les agents en arrière-plan avec
un `task_id` stable, la description, le type, le statut, la capacité de
continuation et toute raison de blocage. Il ne scanne pas le disque. L'outil
appartient à l'appelant et est exclu des sous-agents et des teammates.

Après la restauration, le prochain prompt utilisateur ordinaire au premier
niveau reçoit un unique rappel système d'appeler `list_agents` puis
`send_message`. Les slash commands et les continuations de tour interrompu ne
consomment pas ce rappel. Le mode bare ne le reçoit pas.

Les changements de session vident le registre en mémoire avant de charger un
nouveau roster. Le rollback de reprise échouée efface les entrées
partiellement restaurées avant de restaurer l'ancienne session, et le
branchement est bloqué tant qu'un travail en arrière-plan est encore actif.

## Validation

- Les sidecars en cours d'exécution et terminés se restaurent avec des IDs
  stables et des états corrects.
- Les sidecars au premier plan et au mauvais propriétaire sont exclus.
- L'état conservé non sûr est visible mais ne peut pas être continué.
- Les entrées terminées restaurées n'émettent pas de notifications de
  complétion dupliquées.
- `send_message` peut ressusciter une entrée terminée restaurée compatible.
- La TUI, le headless et ACP restaurent le roster et délivrent le rappel une
  seule fois.
- Les chemins de nouveau, d'effacement, de branchement et de reprise échouée
  ne fuient pas un roster antérieur.
