# Voice qualifié par workspace

## Objectif

Exposer les surfaces existantes de paramètres Voice du démon, de transcription
par lots et de transcription en streaming pour chaque runtime de workspace
fiable, sans modifier les routes historiques réservées au primaire.

## Design

`GET`/`POST /workspaces/:workspace/voice`,
`POST /workspaces/:workspace/voice/transcribe` et
`WS /workspaces/:workspace/voice/stream` résolvent un runtime enregistré
fiable par id ou cwd encodé. Ils utilisent le cwd de ce runtime, son
environnement effectif, son bridge et ses paramètres de workspace. Les
écritures de paramètres Voice via le REST pluriel utilisent toujours le scope
workspace ; les écritures voice ACP secondaires utilisent le même scope afin
qu'elles ne puissent pas muter les paramètres utilisateur partagés.

Un `WorkspaceVoiceCoordinator` à portée de processus possède la limite
existante de huit opérations Voice actives. Il comptabilise à la fois le
travail WebSocket et le travail batch REST à travers les chemins historiques
et qualifiés par workspace. Un drain de retrait rejette les nouvelles
admissions mais laisse le travail Voice existant visible dans le snapshot
d'activité du retrait non forcé. La disposition du runtime interrompt
uniquement les baux Voice du runtime sélectionné avant que son bridge ne soit
arrêté.

## Compatibilité

Les routes historiques `/workspace/voice`, `/workspace/voice/transcribe` et
`/voice/stream` restent liées au workspace primaire. Les noms de méthodes ACP
et le schéma des paramètres Voice sont inchangés. `workspace_qualified_voice`
annonce toutes les modalités Voice qualifiées lorsque le listener WebSocket
ACP/Voice partagé est activé. Les tags de capacité existants des modalités
Voice restent des signaux du workspace primaire et ne sont pas des prérequis
pour un runtime secondaire, dont la configuration est validée par la route
sélectionnée.

Les sélecteurs de workspace inconnus renvoient `400 workspace_mismatch` ; les
runtimes enregistrés mais non fiables renvoient `403 untrusted_workspace`
avant que les paramètres Voice ou l'audio ne soient lus. Le plafond partagé
d'admission de huit opérations couvre le travail batch et streaming à la fois
pour les routes historiques et plurielles. Les échecs de capacité batch
renvoient `503 voice_capacity_exceeded` avec `Retry-After: 5` ; les échecs de
capacité streaming envoient une trame d'erreur et ferment avec le code
`1013`.
