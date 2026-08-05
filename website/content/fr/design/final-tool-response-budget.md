# Budget final des réponses d'outils

## Problème

La sortie des outils est actuellement raccourcie à plusieurs couches
indépendantes. La sortie Shell est raccourcie vers 30K caractères et
marquée comme tronquée, la sortie d'outil générique est raccourcie vers 2K
caractères, et un lot du planificateur de Core peut décharger la sortie
lorsque l'agrégat dépasse le budget de lot configuré. Ces couches ne
partagent pas d'état structuré.

Le planificateur traite un marqueur de troncature existant comme une preuve
qu'aucun travail supplémentaire n'est nécessaire. Par conséquent, plusieurs
résultats Shell raccourcis individuellement peuvent encore dépasser le
budget agrégé. Le mode headless élargit le trou car il crée un
planificateur par appel d'outil et concatène leurs réponses en dehors de
ces planificateurs. Le mode interactif ajoute de même des réponses en
double et synthétiques après la finalisation du planificateur. ACP, les
agents et l'exécution spéculative ont leurs propres frontières
d'agrégation.

La requête au modèle, la transcription reprenable et l'enregistrement des
résultats d'outils doivent contenir la même réponse bornée. L'affichage
riche des outils destiné à l'utilisateur est intentionnellement hors du
périmètre et peut continuer à utiliser l'affichage de résultats existant.

## Invariants

1. Chaque lot de réponses d'outils est finalisé à la dernière frontière
   d'agrégation avant d'être envoyé au modèle.
2. Le texte de sortie d'outil sérialisé dans ce lot ne dépasse pas le
   budget de caractères agrégé configuré lorsque le budget est fini et
   positif. Le rappel de cycle de vie `enter_plan_mode` est une entrée de
   politique, pas une sortie d'outil, et reste en ligne hors de ce budget.
3. Si un producteur a déjà persisté des artefacts de sortie, les couches
   ultérieures réutilisent ces chemins au lieu d'écrire à nouveau la même
   sortie du producteur.
4. La finalisation agrégée utilise les métadonnées internes structurées
   pour décider si les artefacts persistés peuvent être réutilisés ; elle
   ne déduit jamais cette décision d'un texte lisible par l'humain. Le
   traitement des sentinelles propre au producteur reste un détail de
   compatibilité des tronqueurs existants.
5. La finalisation préserve l'ordre des réponses et les parties non texte.
   Elle ne peut raccourcir que `functionResponse.response.output`,
   `functionResponse.response.error` et les parties texte de premier niveau
   qui appartiennent au lot de réponses d'outils.
6. Les parties finalisées sont aussi les parties enregistrées pour la
   relecture et la reprise.
7. L'affichage des outils reste indépendant de la réponse au modèle.

## Design

### Métadonnées de persistance

`ToolResult` et `ToolCallResponseInfo` portent un champ interne optionnel
`persistedOutputFiles`.

- `undefined` : aucune décision de persistance n'a été prise par le
  producteur.
- `[]` : une décision a été prise et il n'y a aucun fichier réutilisable.
- un tableau non vide : des artefacts de sortie persistés par le producteur
  sont disponibles à ces chemins.

Le champ n'est pas inclus dans la sérialisation des hooks, les payloads
ACP, la sortie JSON, les attributs de télémétrie ni les métadonnées d'UI
persistées. Une réponse reconstruite par un hook n'hérite pas des
métadonnées sauf si elles sont explicitement copiées par le runtime.

### Aperçu au niveau du producteur

La troncature du producteur contrôle l'aperçu normal du modèle et persiste
la sortie complète une seule fois.

- Shell conserve le déclencheur actuel de 30K mais renvoie un aperçu
  début-et-fin d'environ 4K afin que les informations de sortie restent
  visibles.
- MCP conserve son déclencheur actuel de grande sortie, garde le résultat
  transformé complet pour l'affichage destiné à l'utilisateur et utilise un
  aperçu modèle d'environ 2K.
- La persistance générique renvoie le chemin réellement écrit à la fois
  pour le writer principal et pour le writer de repli.

Ces aperçus ne sont pas une application du budget agrégé. Une réponse déjà
raccourcie peut être raccourcie à nouveau par la finalisation.

### Finaliseur partagé

Un finaliseur partagé accepte les réponses dans l'ordre original ainsi que
le budget agrégé configuré. Il mesure tous les champs de texte bornés,
puis réduit le texte jusqu'à ce que l'agrégat tienne. Les chemins persistés
existants sont réutilisés. Une réponse sans chemin réutilisable est
persistée au plus une fois avant qu'une référence de chemin ne remplace ou
n'accompagne son aperçu raccourci.

La réduction est déterministe. Une allocation max-min de type water-fill
partage le budget entre les champs de texte destinés au modèle tout en
permettant aux petits champs de conserver leur contenu complet. Les champs
réduits conservent un petit aperçu début-et-fin et listent les chemins
d'artefacts persistés disponibles lorsque l'allocation le permet. Les
paires de substitution Unicode ne sont jamais coupées. La passe finale de
plafond dur raccourcit le texte sans E/S afin qu'un échec de persistance ne
puisse pas violer l'invariant de taille de requête.

Le finaliseur recalcule `contentLength` depuis les parties renvoyées. Les
budgets infinis ou désactivés sont un no-op.

`enter_plan_mode` est la seule exception sémantique. Sa sortie de réponse
de fonction réussie installe la politique de planification active, donc la
tronquer changerait les règles d'exécution plutôt que de raccourcir une
sortie de diagnostic. Le finaliseur et la garde d'envoi de dernière chance
identifient cette sortie par nom d'outil et l'excluent de l'allocation ; le
texte d'échec et toutes les sorties ordinaires du même lot restent bornés.

### Frontières runtime

- Le planificateur de Core finalise avant les hooks `PostToolBatch` pour
  borner l'entrée des hooks, puis à nouveau après le hook pour borner la
  sortie des hooks.
- Le mode interactif fusionne les réponses exécutables, en double et
  synthétiques dans l'ordre ordinal original, puis effectue la finalisation
  externe avant l'enregistrement et la soumission.
- Le mode headless collecte le tour entier, y compris les appels en double,
  ignorés, annulés et exécutés, puis finalise une seule fois avant
  l'enregistrement et la soumission.
- ACP collecte le tour complet d'appels d'outils, le finalise avant
  l'enregistrement de la transcription et renvoie les mêmes parties pour le
  message suivant. Les événements d'affichage ACP immédiats restent
  inchangés.
- Le runtime d'agent et le suivi spéculatif finalisent leur agrégat avant
  d'émettre les résultats destinés au modèle ou d'ajouter l'historique.
- La frontière d'envoi du chat applique un plafond de sécurité sans E/S aux
  champs de réponses d'outils uniquement. Elle devrait normalement être un
  no-op et protège les futurs appelants qui manqueraient une frontière
  d'agrégation externe.

## Gestion des échecs

Un échec de persistance est signalé via la journalisation existante et
n'empêche jamais la troncature finale. La réponse au modèle renvoyée tient
toujours dans le budget, mais peut omettre une référence de fichier si
aucune sortie complète n'a été persistée avec succès. Les parties média
restent intactes et ne sont pas comptées dans ce budget de caractères.

L'annulation et les réponses d'arrêt par hook sont finalisées exactement
comme les réponses d'outils réussies et échouées. Les champs de sortie vide
et d'erreur restent valides. Une réponse unique plus grande que tout le
budget du lot est réduite seule ; plusieurs grandes réponses partagent la
capacité d'aperçu restante de manière déterministe.

## Compatibilité et non-objectifs

Le schéma public de réponse de fonction destiné au modèle ne change pas. Le
texte de troncature existant reste lisible, mais la finalisation agrégée
n'en dépend plus. Les sessions existantes peuvent encore être rejouées ;
seuls les résultats d'outils nouvellement enregistrés gagnent l'invariant
plus strict.

Ce changement n'ajoute ni hachages d'octets de wire, ni comptabilité exacte
de tokens, ni budgétisation des médias, ni changements de cycle de vie du
stockage, ni migration de transcription, ni nouvelle organisation de
fichiers temporaires. Ce sont des suivis indépendants.
