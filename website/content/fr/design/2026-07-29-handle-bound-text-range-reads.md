# Lectures de plages de texte liées à un handle

## Contexte

La PR #7947 a permis au système de fichiers du workspace Serve de retourner
des fenêtres de lignes bornées depuis des fichiers texte au-delà de
`MAX_READ_BYTES` (256 KiB). Pour maintenir ces lectures épinglées à un seul
inode à travers la validation, la détection de binarité et le streaming, elle
a fait descendre un `FileHandle` possédé par l'appelant comme champ optionnel
dans `readTextRange`, et a ajouté un second champ optionnel, `forceStreaming`,
pour supprimer le fast path de mise en mémoire tampon qui aurait autrement
déjoué la limite mémoire.

Deux champs optionnels sur un point d'entrée produisaient quatre combinaisons,
dont une a du sens, une est inatteignable et une est dangereuse :

| `fileHandle` | `forceStreaming` | Résultat                                                                 |
| ------------ | ---------------- | ---------------------------------------------------------------------- |
| non défini        | non défini            | lecture de chemin ordinaire                                                     |
| non défini        | défini              | streame un petit fichier — utilisé par un test                                |
| défini          | défini              | la lecture de la frontière Serve                                              |
| défini          | non défini            | met en mémoire tampon tout le fichier via le handle — **aucun appelant ne peut l'atteindre** |

La combinaison inatteignable portait un helper dédié,
`readFileHandleBuffer`, sans couverture de test. Séparément,
`readFileWithLineAndLimit` acceptait le même `fileHandle` mais ne pouvait
l'honorer que sur sa branche de plage : une lecture non bornée retombait sur
un `readFileWithEncodingInfo` par chemin, retournant silencieusement les
octets de ce que le chemin résolvait à ce moment-là plutôt que ceux de
l'inode épinglé. Le commit de suivi de la PR #7947 gardait cela avec un
`RangeError` runtime, ce qui documentait le piège sans le supprimer.

La détection d'encodage avait fourché pour la même raison.
`detectFileEncoding` prend un chemin et ouvre son propre descripteur, de sorte
que le chemin par handle ne pouvait pas l'utiliser ; un
`detectFileHandleEncoding` privé a été ajouté à côté, dérivant le nom
d'encodage de `decodeBufferWithEncodingInfoAsync(...).encoding` au lieu de
chardet directement. Les deux divergent quand chardet nomme un encodage que
`iconv-lite` ne peut pas charger : la variante par chemin retourne ce nom, la
variante par handle retourne `'utf-8'` et s'en remet à l'échec `fatal: true`
du décodeur de streaming. Les deux refusent le fichier, avec des messages
différents.

## Objectifs

- Un seul détecteur d'encodage, utilisable depuis un chemin ou un descripteur
  emprunté.
- Pas de flags de mode sur le lecteur de plage ; rendre la combinaison
  inatteignable irréprésentable plutôt que simplement inutilisée.
- Rendre le fallthrough par chemin structurellement impossible au lieu de le
  garder.
- Aucun changement observable à la frontière Serve ni dans l'outil
  `read_file`.

## Non-objectifs

- Fusionner `decodeBufferWithEncodingInfo` (synchrone) dans son jumeau
  asynchrone. La variante synchrone est un shim de compatibilité d'API
  publique délibéré
  ([`lazy-first-use-dependencies.md`](./lazy-first-use-dependencies.md))
  épinglé par un test de parité.
- Tout changement de ce que la frontière Serve retourne. C'est une
  préparation pour la pagination par curseur d'octets, pas cette
  fonctionnalité.

## Design

### Un seul détecteur

`detectFileEncoding(source: string | FileHandle)`. Un handle fourni est
_emprunté_ : les lectures utilisent des positions explicites afin que la
position de fichier de l'appelant ne soit pas touchée, et le bloc `finally`
ne ferme qu'un descripteur que cette fonction a elle-même ouvert.
`detectFileHandleEncoding` est supprimé, et le switch BOM-vers-nom codé en
clair est remplacé par le `bomEncodingToName` existant.

Cela rend le chemin par handle légèrement plus strict, ce qui est la
direction voulue : un encodage que `iconv-lite` ne peut pas charger lève
désormais `LargeNonUtf8TextError(detected)` nommant cet encodage, au lieu
d'atteindre le décodeur et de lever la variante générique `'invalid-utf8'`.
Le refus est inchangé ; le message s'améliore. La frontière Serve mappe les
deux vers `binary_file`, donc rien ne bouge en aval.

Un second delta, plus petit, vient avec la fusion : `detectFileEncoding`
attrape toutes les erreurs et retombe sur `'utf-8'`, alors que
`detectFileHandleEncoding` n'avait pas de gestionnaire et laissait un échec
d'E/S se propager. L'échec n'est pas perdu — un handle assez mauvais pour
échouer à la sonde de 8 KiB échoue à la lecture de streaming immédiatement
après, et un fichier qui n'est pas réellement UTF-8 est toujours refusé par
le décodeur `fatal: true` — de sorte que l'erreur remonte d'un appel
différent au lieu de disparaître. Accepté pour la politique de fallback
unique ; noté car c'est un réel changement de quel appel rapporte le
problème.

### Deux points d'entrée

```ts
readTextRange(request: ReadTextRangeRequest)                    // path
readTextRangeFromHandle(fh, request: ReadTextRangeFromHandleRequest)
```

La variante par handle streame toujours — il n'y a pas de flag, car un
appelant saisit un handle précisément quand il a besoin que la lecture soit
bornée, et le fast path de mise en mémoire tampon lirait tout le fichier. Son
type de requête n'a pas de `path` (rien à désambiguïser), conserve le
`fileSize` numérique capturé depuis le `fstat` d'ouverture, et rend les deux
bornes d'octets requises plutôt qu'optionnelles. `maxOutputBytes` plafonne ce
que la lecture retourne, `maxScanBytes` plafonne ce qu'elle coûte, et
`fileSize` empêche un ajout d'élargir le snapshot du descripteur pendant que
la lecture est en cours. Une lecture liée à un handle existe parce qu'une
frontière de sécurité a besoin des trois bornes.

`maxScanBytes` reste optionnel sur la variante par chemin, où il vaut
`Infinity` par défaut afin que l'outil `read_file` soit inchangé.

Les deux délèguent à la même implémentation de streaming, qui prend désormais
`source: string | FileHandle` et choisit `createReadStream` ou
`chunksFromHandle` en conséquence. `readFileHandleBuffer` et la branche qui
l'appelait sont supprimés.

### Le fallthrough disparaît

`readFileWithLineAndLimit` perd `fileHandle`, `forceStreaming` et
`maxScanBytes` — son unique appelant de production n'en passe aucun.
`StandardFileSystemService.readTextFileFromHandle` appelle désormais
`readTextRangeFromHandle` directement, et les deux chemins de lecture
partagent un helper `toReadTextFileResponse` afin que leur mise en forme des
métadonnées ne puisse pas diverger. Sans paramètre `fileHandle` restant à
ignorer, la garde `RangeError` est supprimée : le piège qu'elle décrivait ne
peut plus être exprimé.

`readTextFileFromHandle` reste hors de l'interface `FileSystemService`, donc
`AcpFileSystemService` et le mock de fallback typé dans
`filesystem.test.ts` ne sont pas touchés.

## Rayon d'impact

- `readTextRange` n'est pas exporté depuis `packages/core/src/index.ts` ; les
  trois classes d'erreur exposées à la frontière le sont. La surface du
  lecteur remodelée est interne au cœur.
- `readTextRange` et `readFileWithLineAndLimit` ont exactement un appelant de
  production chacun (`fileUtils.ts`, `fileSystemService.ts`).
- `detectFileEncoding` est public via
  `export * from './utils/fileUtils.js'`. Élargir un paramètre est compatible
  au niveau source.
- Le seul importateur inter-packages des modules touchés est
  `packages/cli/src/serve/fs/workspace-file-system.ts`. Son seul changement
  est le retrait de deux arguments que le chemin par handle n'accepte plus —
  voir ci-dessous ; l'import `decodeBufferWithEncodingInfoAsync` qu'il porte
  aussi n'est pas touché.

### `CoreReadTextFileHandleRequest` devient autonome

C'était `Omit<CoreReadTextFileRequest, 'limit' | 'stats' | 'maxOutputBytes'> &
{...}`, ce qui laissait deux champs que le chemin par handle ne lit jamais :

- **`stats`** était documenté comme requis — « doit passer les Stats capturés
  depuis ce handle » — et rien en aval ne lisait l'objet. L'API finale ne
  conserve que son `fileSize` numérique : le chemin par handle n'a pas besoin
  de métadonnées pour choisir une stratégie, mais il a besoin de la taille
  d'ouverture pour garder les lectures bornées quand le fichier est ajouté en
  parallèle.
- **`path`** est devenu mort quand `readTextRangeFromHandle` a remplacé
  l'appel chemin-plus-handle : la lecture est liée au descripteur, et les
  erreurs sont étiquetées avec le chemin par la frontière Serve qui le
  possède.

Aucun des deux n'était attrapé par le compilateur. Le `ReadTextFileRequest`
ACP dont ce type dérivait autorise les propriétés supplémentaires, de sorte
que passer un champ que le type avait supprimé ne levait rien. C'est
l'argument pour déclarer le type autonome plutôt que dérivé : la chaîne
`Omit` retirait quatre des six champs hérités et réadmettait silencieusement
le reste.

Au commit de refactor, 282 lignes de logique de production ont changé dans
`packages/core` ; le suivi ultérieur de curseur ajoute du comportement et des
tests sur cette base.

## Tests

Au commit de refactor, les suites existantes étaient la spécification : tout
l'enjeu était que la frontière Serve ne puisse pas faire la différence. Le
suivi ultérieur de curseur ajoute un comportement de frontière et ses propres
tests.

Trois tests de `read-text-range.test.ts` ont migré vers
`readTextRangeFromHandle`. Deux utilisaient `fileHandle` directement. Le
troisième utilisait un _chemin_ avec `forceStreaming: true` pour forcer le
streaming sur un fichier trop petit pour quitter le fast path, afin de pouvoir
exercer la frontière de budget à EOF ; le flag disparu, la variante par handle
est la seule chose qui streame toujours.

Un des tests migrés a changé de sens. Il passait auparavant un handle pour un
fichier et un chemin nommant un fichier différent, en affirmant que le handle
gagnait — un test pour la confusion que l'ancienne signature permettait. La
variante par handle n'a pas de `path`, donc cette confusion est désormais
irreprésentable et le test n'affirmerait rien. Il a été réécrit pour couvrir
la propriété qui a réellement motivé l'API : ouvrir un handle, renommer un
autre fichier par-dessus le chemin, et confirmer que la lecture suit toujours
l'inode.

Deux tests de `fileSystemService.test.ts` ont été supprimés plutôt que
réparés. Ils mockaient `readFileWithLineAndLimit` et assertaient l'objet
d'arguments qu'il recevait ; puisque `readTextFileFromHandle` ne l'appelle
plus, ils n'auraient pu être conservés qu'en les pointant vers un nouveau
mock, ce qui n'aurait à nouveau affirmé qu'une fonction passant des arguments
à une autre. Le comportement qu'ils couvraient nominalement est testé contre
de vrais fichiers dans `read-text-range.test.ts` et à la vraie frontière dans
`workspace-file-system.test.ts`. Les tests de validation d'arguments à côté
sont conservés — ils n'ont pas besoin de mock.

## Suivi

`chunksFromHandle` a gagné un paramètre `from` comme unique point de couture
dont la pagination de texte par curseur d'octets avait besoin. Le suivi
l'utilise désormais pour reprendre depuis un offset d'octets non nul.
