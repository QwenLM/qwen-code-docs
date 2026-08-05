# Protection de la mémoire managée épinglée

## Problème

L'auto-mémoire managée découvre récursivement les sujets markdown valides sous
les racines de mémoire de projet et d'utilisateur, dans la limite des limites
d'index existantes. Les agents d'extraction automatique et de consolidation
Dream peuvent écrire ou modifier des chemins à l'intérieur de leurs racines de
mémoire autorisées, de sorte qu'un fichier organisé à la main peut être écrasé
ou consolidé comme une mémoire générée automatiquement.

Le scanner récursif découvre déjà les fichiers valides sous `pinned/` ; le
comportement manquant est une protection déterministe contre les mutations
pendant la maintenance automatique de la mémoire.

## Design retenu

Traiter un répertoire `pinned/` de premier niveau à l'intérieur d'une racine
de mémoire managée comme protégé contre les mutations par extraction
automatique et exclu de la consolidation Dream :

- Garder les documents épinglés valides lisibles par le rappel de mémoire
  normal et découvrables par l'indexeur existant dans la limite de ses limites
  normales.
- Refuser les opérations `write_file` et `edit` de l'extraction automatique et
  du Dream forké quand le chemin demandé est lexicalement sous `pinned/`.
- Comparer le nom du répertoire réservé de premier niveau sans tenir compte de
  la casse afin que la liste de refus ne puisse pas échouer en mode ouvert sur
  les systèmes de fichiers insensibles à la casse.
- Refuser aussi les alias qui se résolvent via un lien symbolique dans
  `pinned/`.
- Conserver la gate shell en lecture seule existante, qui rejette déjà `rm` et
  toute autre commande shell mutatrice.
- Apprendre aux prompts d'extraction automatique et de Dream à laisser les
  documents épinglés inchangés et à éviter de supprimer intentionnellement
  leurs entrées d'index existantes, dans la limite des limites d'index
  normales.

La vérification de chemin compare les chemins littéraux et résolus sans tenir
compte de la casse. Le containment littéral protège `pinned/` même quand ce
répertoire est lui-même un lien symbolique. Le containment résolu empêche un
chemin d'apparence accessible en écriture ailleurs dans la mémoire de pointer
par lien symbolique vers `pinned/`.

La protection est une option explicite de la configuration d'agent à portée de
mémoire existante et est activée par les planificateurs d'extraction
automatique et de Dream forké. Cela couvre l'extraction post-session, le Dream
planifié et les appelants de l'endpoint Dream de mémoire de workspace. Les
opérations remember explicites conservent leur comportement actuel.

## Limites du périmètre

- Pas de changement de production du scanner ou de l'indexeur : la découverte
  récursive gère déjà les documents `pinned/` de projet et d'utilisateur avec
  le schéma de frontmatter existant.
- Pas de nouveau champ de frontmatter et pas de création automatique du
  répertoire.
- Pas d'indicateur dans l'UI de `/memory`.
- Les requêtes `/forget` explicites conservent leur comportement actuel.
- Cette frontière basée sur le chemin ne détecte pas les alias de liens
  physiques (hard-link) préexistants vers des fichiers épinglés. Les workers
  de mémoire automatiques ne peuvent pas en créer avec `write_file` ou `edit`,
  et leur politique shell en lecture seule bloque `ln` ; un modèle de menace
  plus fort nécessiterait une politique distincte basée sur les inodes.
- Le tour visible du slash command `/dream` reçoit la règle partagée de prompt
  de saut, mais n'obtient pas de gate d'outil déterministe dans ce changement.
  Le slash command s'exécute sur l'Agent principal, qui n'a pas d'override de
  permission par tour existant ; en ajouter un serait un design de permission
  cross-surface séparé.
- Le Dream forké reste limité à la mémoire de projet car sa configuration à
  portée existante exclut la racine de mémoire d'utilisateur globale.
- L'extraction automatique continue de couvrir les racines de mémoire de
  projet et d'utilisateur globale, de sorte que les deux répertoires `pinned/`
  de premier niveau reçoivent la même protection.

## Fichiers affectés

- `packages/core/src/memory/paths.ts`
- `packages/core/src/memory/memory-scoped-agent-config.ts`
- `packages/core/src/memory/dreamAgentPlanner.ts`
- `packages/core/src/memory/extractionAgentPlanner.ts`
- Tests de permission, de prompt et d'index de mémoire colocalisés
- `docs/users/features/memory.md`

## Question ouverte

La question de savoir si le slash command `/dream` visible doit recevoir la
même gate déterministe reste une décision de périmètre des maintainers. Si
nécessaire, elle doit être implémentée comme un override de permission par
tour général plutôt qu'en modifiant le gestionnaire de permissions à l'échelle
de la session autour d'une seule boucle d'outil asynchrone.
