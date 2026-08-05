# Récupération de troncature du journal live

## Contexte

Le démon conserve un journal live borné en mémoire pour un tour non terminé.
Lorsque le journal dépasse 10 000 événements ou 8 MiB, il rejette les plus
anciens événements de relecture et ajoute en tête un marqueur
`history_truncated`. La transcription persistée et la compaction aux limites
de tour restent faisant autorité, de sorte que le tour complet redevient
disponible après un événement terminal formel.

Le marqueur n'avait auparavant aucune propriété de prompt, le SDK affichait
un message générique, et la WebUI soit cachait le marqueur derrière la
pagination de l'historique, soit laissait la queue conservée visible en
permanence. Ce design conserve les limites de ressources et la politique
d'éviction existantes tout en rendant la perte précise et en réparant la queue
visible sans nouvelle requête au modèle.

## Protocole et SDK

Pour un marqueur de journal live renvoyé par `session/load`, le bridge copie
l'`activePromptId` faisant autorité de la session vers l'enveloppe du marqueur
comme `promptId` optionnel. L'événement persisté et la version du schéma
d'événement ne changent pas. Un démon plus ancien dépourvu de ce champ n'est
réparable que si les événements live conservés ont exactement un ID de
prompt.

`DaemonHistoryTruncatedData` expose les champs optionnels existants `scope`
et `maxEvents`. La validation rejette les valeurs optionnelles mal formées.
Les données de statut normalisées conservent le payload complet du démon. Le
texte distingue la troncature de l'historique de relecture de la troncature
du tour live, indique que les événements les plus récents ont été conservés
et les événements de relecture plus anciens rejetés, et ne promet une
récupération après le terminal que lorsque `fullTranscriptAvailable` est
vrai.

## Épisode de récupération de la WebUI

Pendant la relecture de snapshot, un marqueur live récupérable crée un
checkpoint d'épisode juste avant le marqueur. Le checkpoint réutilise les
blocs de transcription immuables et conserve l'ID de session, l'ID de prompt
cible, le watermark d'événement du snapshot, l'ID du bloc marqueur et une
signature d'épisode déterministe. Les pages d'historique plus anciennes et les
blocs de statut locaux au provider sont reflétés dans le checkpoint tant que
le marqueur est actif.

Seul un `turn_complete` ou `turn_error` correspondant arme la récupération.
L'annulation est représentée par un événement terminal formel avec une raison
d'arrêt annulée et suit le même chemin. Les événements de transcription mis
en mémoire tampon sont purgés et l'état du prompt est stabilisé avant que la
récupération ne soit tentée. Un chargement de session en cours, une requête
de page d'historique, une navigation ou un prompt local retarde la tentative
jusqu'au prochain point d'inactivité.

La récupération effectue un unique `session/load` dans la même session avec
relecture en mémoire et sans taille de page d'historique configurée. La
transcription actuelle reste attachée et visible jusqu'à ce que la validation
réussisse. Le nouveau snapshot ne doit pas être dégradé et doit contenir à la
fois l'entrée utilisateur du prompt cible et un terminal formel
correspondant. Un échec de validation ou de transport retentable rejette le
remplacement, reprend la session précédente depuis son curseur SSE, préserve
la transcription et émet une unique notification récupérable
`daemon.live_journal_repair.failed`. Les échecs d'authentification et une
session manquante préservent aussi la transcription et émettent la
notification, mais conservent l'état déconnecté ou de réauthentification
existant du provider car ce stream SSE ne peut pas reprendre en toute
sécurité.

En cas de succès, la WebUI reconstruit le suffixe cible depuis la plus
ancienne entrée utilisateur correspondante jusqu'à la queue du nouveau
snapshot. Elle part du checkpoint lorsque le bloc marqueur est encore
conservé ; sinon elle reconstruit un snapshot complet borné. Les événements
rejoués reconstruisent l'état de la transcription, y compris
`assistant.done`, mais les événements inférieurs ou égaux au watermark de
l'épisode ne répètent pas les notifications, les signaux de workspace, les
publications de prompt en attente, les publications de suivi ni les autres
effets de bord. Les ID d'événement plus récents conservent leurs effets
normaux.

L'état résultant est validé en un seul reset du store. Lorsque le suffixe
complet tient dans le `maxBlocks` du checkpoint, les ID de blocs
d'historique conservés, le curseur de pagination, la profondeur chargée et
l'état de capacité restent stables. S'il dépasse cette limite, la politique
existante du store peut rogner les plus anciens blocs chargés plutôt que de
créer une exception de réparation non bornée. Un nouveau suffixe qui se
termine par un autre marqueur live récupérable crée un épisode séparé pour ce
prompt.

## Concurrence et cycle de vie

Un épisode est tenté automatiquement au plus une fois. Un rechargement
configuré, un changement de session, un démontage de page ou un effacement
explicite de session l'interrompt et le supprime. Un rechargement de
réparation le conserve jusqu'au succès ou à l'échec. Le rechargement met en
pause l'ancien abonnement SSE sans détacher son enregistrement de session. Un
candidat rejeté est détaché et le handle précédent reprend depuis son curseur
existant ; un candidat validé devient le nouvel owner de l'abonnement.

Le checkpoint hérite du `maxBlocks` effectif du store de transcription
actuel, tandis que le fallback rogné par le marqueur utilise le `maxBlocks`
configuré. Cela préserve le comportement existant de relecture initiale trop
volumineuse sans créer de nouvelle exception pour la réparation. Les blocs
sont partagés plutôt que copiés pour les payloads de texte, et aucun journal
non borné ni second cache de transcription n'est introduit.

## Compatibilité

- Les champs `promptId`, `scope` et `maxEvents` du marqueur sont optionnels.
- Les anciens clients ignorent l'extension d'enveloppe du marqueur.
- Les nouveaux clients acceptent les anciens payloads et refusent en toute
  sécurité la réparation automatique ambiguë.
- Le comportement par défaut de `reloadSession` reste la relecture configurée
  ; seul le chemin de réparation interne demande la relecture en mémoire.
- La persistance du démon, les API de transcription, les limites du journal
  et l'éviction du plus ancien d'abord sont inchangées.

## Vérification

La couverture unitaire exerce la propriété du marqueur, la compaction après
le terminal, la validation des payloads, le texte de statut précis, la
correspondance des prompts, la validation de la relecture, le remplacement
atomique du suffixe, la suppression des effets de bord dupliqués, la
préservation de l'historique, le fallback en cas d'échec et la propagation de
la source de rechargement. Les tests d'intégration du démon utilisent un
agent ACP simulé déterministe et un journal à trois événements pour observer
le marqueur live depuis un second client, vérifier le tour compacté complet
après le terminal, et monter le véritable provider WebUI pour prouver que la
récupération ajoute un seul chargement et aucune requête au modèle.
