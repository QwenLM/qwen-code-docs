# Cohérence des plages du texte volumineux de Serve

## Contexte

Serve streame désormais des fenêtres de texte à limite finie depuis des
fichiers plus grands que `MAX_READ_BYTES`. Une requête lignes-seules ou
maxBytes-seul n'ouvre pas ce chemin. La limite de workspace ouvre le fichier
une fois, lit via ce handle et renvoie des métadonnées partielles sans hash du
fichier complet.

Un descripteur de fichier ouvert fixe l'inode, mais ne fige pas les octets de
l'inode. Node ne synchronise pas non plus les opérations de système de
fichiers qui modifient le même fichier simultanément. Un lecteur peut donc
observer des octets écrits après `open`, y compris une réécriture sur place
avec le même inode et la même taille.

L'issue #7946 exige que les fichiers modifiés ou remplacés pendant une
lecture restent rejetés. Les lectures tolérantes aux ajouts ne font pas
partie de ce contrat.

## Décision

Les grandes fenêtres streamées utilisent le stat du fichier au moment de
l'ouverture comme base de leur snapshot :

1. Le `lstat` initial et le `fstat` au moment de l'ouverture doivent
   identifier le même fichier régulier avec les mêmes device, inode, taille,
   date de modification et date de changement.
2. Après le streaming, le `fstat` et le `lstat` du chemin doivent tous deux
   conserver cette identité et cette version, et le chemin ne doit pas être
   un lien symbolique.
3. L'appelant ferme le handle dans un `finally`, après toutes les lectures et
   vérifications de stabilité.
4. Une incohérence détectée par ces vérifications de stabilité renvoie
   `hash_mismatch`.

Les erreurs de validation de contenu sont capturées jusqu'à ce que les
vérifications post-lecture se terminent, de sorte qu'une mutation concurrente
qui fait aussi échouer le décodage renvoie toujours `hash_mismatch`. Sans
mutation, le contenu binaire reste `binary_file` et un grand texte non-UTF-8
reste `file_too_large` avec une indication de conversion.

Cela correspond à la politique de stabilité existante des snapshots complets.
Elle rejette intentionnellement les ajouts concurrents : la croissance de la
taille prouve que le snapshot au moment de l'ouverture n'était pas stable,
tandis que l'identité de l'inode seule ne peut pas prouver que le préfixe
d'origine était inchangé.

Une tolérance fiable aux ajouts exigerait un mécanisme de snapshot séparé ou
une seconde lecture bornée qui vérifie chaque octet utilisé pour localiser et
produire la fenêtre de lignes demandée. Cet I/O supplémentaire et cette
politique de protocole sortent de ce correctif.

## Nettoyage du lecteur de plages

Un handle de fichier possédé par l'appelant sélectionne toujours le chemin de
streaming. Le commutateur séparé `forceStreaming` et le chemin rapide de mise
en mémoire tampon du handle sont donc supprimés. Le lecteur de chunks du
handle limite les lectures positionnelles à la taille de fichier capturée par
l'appelant, de sorte qu'une lecture ne puisse pas dépasser l'EOF au moment de
l'ouverture, et réutilise un seul tampon de 512 KiB car chaque chunk est
décodé de manière synchrone avant que le générateur n'avance.

Il n'y a pas de budget fixe d'octets de scan : les offsets de lignes exigent
de scanner depuis l'octet zéro, donc les fenêtres profondes restent en
O(taille du fichier). La limite finie de lignes et le plafond
`MAX_READ_BYTES` bornent le contenu renvoyé et la mémoire, tandis que
l'annulation est vérifiée entre les lectures. Une future politique de coût de
scan nécessite un curseur ou un contrat de continuation équivalent au lieu de
rendre silencieusement inatteignables des offsets profonds valides.

Les lectures par snapshot complet de Serve dérivent `lineEnding` du fichier
décodé entier. Les chemins de fenêtre des gros fichiers continuent de le
dériver de la fenêtre renvoyée, sauf qu'une page à curseur d'octets compte
aussi un terminateur hors de sa tranche renvoyée — celui après lequel elle
reprend et, lorsque sa première ligne est coupée par le budget d'octets,
celui que le re-snapshot parcourt — de sorte qu'une page de queue non
terminée concorde avec la page précédente, et une page tronquée aux octets
avec la page suivante, dans un fichier à fins de ligne uniformes (les
fichiers à fins mixtes peuvent encore basculer entre les pages, et une
fenêtre de lignes de gros fichier d'un fichier uniforme peut diverger d'une
page à curseur d'octets des mêmes octets ; l'unification des chemins est un
suivi candidat — aucune issue de suivi n'existe encore). Le core peut
continuer de rapporter les métadonnées au niveau fichier pour ses autres
consommateurs.

Chaque fenêtre de gros fichier conserve `truncated: true`, même lorsque le
scan atteint par hasard l'EOF. Cette limite utilise le drapeau pour
distinguer une fenêtre sans hash du fichier complet d'un snapshot complet
qu'il est sûr de traiter comme le contenu du fichier entier ; cela ne
signifie pas uniquement que des caractères décodés ont été omis.

## Consommateurs

Tous les appelants de Serve résolvent via le runtime de workspace sélectionné
avant d'atteindre cette limite :

- `GET /file`
- ACP HTTP `_qwen/file/read`
- l'adaptateur ACP injecté `readTextFile`

Les lectures sans fenêtre utilisées par la mise en place du workspace
conservent le refus existant de snapshot complet de 256 KiB.

## Vérification

- Une fenêtre de lignes d'un gros fichier à EOL mixtes rapporte le style de
  fin présent dans la tranche renvoyée ; une page à curseur d'octets peut
  aussi rapporter un terminateur hors de sa tranche renvoyée (voir
  Décision).
- L'ajout concurrent, la troncature, le remplacement du chemin et le
  remplacement par lien symbolique sont rejetés. Une réécriture sur place de
  même taille est rejetée chaque fois que le changement tombe dans un quantum
  d'horodatage ultérieur : les vérifications comparent la date de
  modification et la date de changement, donc une réécriture qui restaure
  aussi la date de modification n'est attrapée que par l'avancée de la date
  de changement, ce qui est best-effort à la résolution d'horloge grossière
  du noyau plutôt qu'une garantie absolue, bien que toujours strictement
  plus fort que la comparaison antérieure de snapshot complet par taille et
  date de modification.
- Les lectures de plages liées à un handle n'utilisent jamais le chemin
  rapide du tampon complet et réutilisent leur tampon de streaming.
- Un offset profond au-delà de 10 MiB réussit avec une limite finie de
  lignes.
- Les requêtes sans limite, lignes-seules et maxBytes-seul restent derrière
  la porte de snapshot complet de 256 KiB.
- Les limites existantes de sortie, d'encodage, de binaire, de hash et de
  nombre de lignes restent inchangées.
