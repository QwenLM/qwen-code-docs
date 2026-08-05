# Vision bridge sur les résultats d'outils

## Contexte

Le Vision Bridge existant convertit les images résolues depuis l'entrée de
l'utilisateur, tandis que `read_file` exclut les images ordinaires des
résultats d'outils texte seul. D'autres outils peuvent renvoyer des images en
`inlineData` ; `convertToFunctionResponse` stocke ces images dans
`functionResponse.parts`, et l'amincisseur de requête les remplace plus tard
par des placeholders MIME pour un modèle texte seul. En conséquence, les
images découvertes par le modèle ou renvoyées par les outils intégrés, MCP et
d'extensions ne sont pas comprises par un modèle primaire texte seul, même
lorsqu'un modèle vision est configuré.

## Conception

`read_file` préserve une image ordinaire uniquement lorsque le modèle cible
actif est texte seul et qu'un modèle Vision Bridge est disponible. Il
n'appelle pas lui-même le modèle vision ; la transcription spécifique aux PDF
reste inchangée.

Un helper partagé du cœur traite les parties de réponse d'outil normalisées
immédiatement avant qu'elles ne deviennent l'entrée du modèle. Lorsque le
modèle cible actif accepte les images, ou qu'aucun Vision Bridge n'est
disponible, le helper renvoie la réponse inchangée. Si le modèle vision
configuré est capable en mode agent et que l'appelant peut basculer le reste
du tour, le helper borne la taille des images inline, préserve les images de
l'outil et sélectionne ce modèle via l'override de tour complet existant.
Sinon, pour chaque `functionResponse` contenant des images inline, il appelle
le Vision Bridge existant avec les images et un indice de focus borné
contenant le nom de l'outil, les labels des images et la sortie textuelle
existante.

Le helper ajoute la transcription machine non fiable à la
`response.output` ou `response.error` existante, préserve le nom de la
fonction, l'ID d'appel, les autres champs de la réponse et les médias non
image, et supprime chaque image inline originale de
`functionResponse.parts`. Les échecs et annulations du bridge remplacent les
images par une note d'indisponibilité explicite plutôt que de laisser des
données d'image brutes atteindre le provider texte seul. Les images dépassant
le budget de comptage ou d'octets du bridge sont aussi supprimées et
signalées par le bloc de transcription.

Le helper partagé est utilisé par le planificateur d'outils du cœur et par
l'exécuteur d'outils direct d'ACP. Le planificateur interactif, l'exécuteur
non interactif et le prompt ACP actif peuvent accepter un override de tour
complet déclenché par un outil, afin que la prochaine requête du modèle et
les continuations d'outils ultérieures restent sur le modèle vision capable
en mode agent. Sur les surfaces qui prennent en charge la sélection inline du
modèle, la sélection explicite reste prioritaire. Les consommateurs sans
canal d'override au niveau du tour conservent le fallback de transcription
plutôt que d'exposer des images brutes à un modèle texte seul. L'exécution
spéculative de suivi est l'exception : comme sa sortie peut être jetée et
n'est utilisée que pour amorcer un cache, elle supprime les images de
résultats d'outils avec une note d'indisponibilité explicite et ne les envoie
jamais à un modèle vision. Les outils intégrés, les outils MCP et les outils
d'extensions entrent tous par l'un de ces chemins.

Chaque tentative réelle de bridge sur un résultat d'outil est divulguée sur
la surface active. La transcription rapporte le modèle vision sélectionné et
l'endpoint en utilisant le formateur existant du Vision Bridge, tandis que la
prise de contrôle du tour complet rapporte le modèle qui possédera le reste
du tour. La TUI et la sortie JSON conservent l'affichage original de l'outil
à côté de la notice, et ACP émet la même notice comme message d'agent.

Seuls les octets d'images inline sont convertis. Les `fileData` d'images,
les URL, le texte de chemin seul, l'audio et la vidéo restent hors de ce
changement car leur résolution introduirait des politiques distinctes de
système de fichiers, de réseau, d'authentification et de modalité.

## Compatibilité et comportement en cas d'échec

Les schémas d'outils publics ne changent pas. Le comportement existant du
Vision Bridge pour l'entrée utilisateur et les PDF reste intact. Les
configurations sans modèle vision conservent leur comportement actuel
d'image non prise en charge ou de placeholder MIME. Un appel d'outil réussi
n'est pas converti en erreur d'outil uniquement parce que le bridge échoue ;
le modèle reçoit le texte original plus une note assainie d'indisponibilité
de l'image. Les détails d'erreur du provider sont journalisés mais jamais
insérés dans la réponse de la fonction. Le budget d'images par tour est
partagé entre tous les chemins de bridge d'un tour : le comptage glissant est
indexé sur le signal d'annulation du tour, de sorte que les bridges d'entrée
utilisateur, de PDF et de résultats d'outils tirent sur le même plafond
plutôt que d'en recevoir chacun un nouveau. Avec un modèle vision configuré
mais non capable en mode agent, un tour qui épuise le plafond tôt laisse les
images d'outils ultérieures transcrites comme budget épuisé ; la prise de
contrôle capable en mode agent n'est pas affectée car elle préserve les
images brutes au lieu de les transcrire.

## Vérification

Des tests ciblés couvrent les lectures d'images ordinaires, les images
d'outils imbriquées, les résultats mixtes texte et image, les réponses de
fonction multiples, les échecs et annulations du bridge, le pass-through vers
une cible multimodale, l'acceptation et le refus de la prise de contrôle du
tour complet, la divulgation visible par l'utilisateur, la suppression des
images spéculatives, et la préservation de l'identité de la fonction et des
champs non image. Des vérifications d'intégration exercent le planificateur
du cœur, le câblage des overrides interactifs et non interactifs,
l'exécuteur ACP et les sites d'appel de l'exécuteur spéculatif. Le build, le
typecheck, le bundle et la vérification CLI locale complètent le changement.
