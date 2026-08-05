# Chargement différé à la première utilisation pour les dépendances d'encodage, de terminal et Git

## Contexte

L'issue #7264 suit les dépendances présentes dans la fermeture statique des
imports eager du processus enfant ACP alors que la plupart des sessions ne les
utilisent jamais. Le candidat 5 regroupe trois paquets avec des limites de
première utilisation distinctes :

| Paquet | Fermeture ACP de base | Première utilisation |
| ------ | --------------------: | --------------------- |
| `iconv-lite` | 551 713 octets | Lecture ou écriture de texte non-UTF-8 sans BOM |
| `@xterm/headless` | 213 071 octets | Démarrage d'un shell via le chemin PTY |
| `simple-git` | 146 526 octets | Réalisation d'une opération Git de worktree, de nettoyage ou d'extension GitHub |
| **Total direct des paquets** | **911 310 octets** | |

Le total direct est d'environ 890 KiB. La fermeture statique ACP complète
contient aussi des modules qui deviennent inaccessibles lorsque ces paquets
quittent le chemin eager, donc la réduction mesurée au niveau du bundle peut
être plus grande.

## Objectifs

- Retirer les trois paquets de la fermeture d'imports statiques de l'enfant
  ACP.
- Préserver les helpers publics synchrones d'encodage actuels.
- Charger chaque paquet une fois, à sa première utilisation réelle, sans
  nouvelle configuration.
- Préserver le comportement de fallback du shell, le comportement Git, les
  métadonnées d'encodage de fichiers, la gestion du BOM et les écritures
  atomiques.
- Ajouter une garde de bundle afin que de futurs imports ne puissent pas
  restaurer silencieusement ces paquets dans la fermeture eager.
- Valider le changement avec la même discipline d'acceptation 2-vCPU, 4-GiB
  que les autres candidats de #7264.

## Non-objectifs

- Faire passer les API publiques d'encodage de synchrone à asynchrone.
- Remplacer `iconv-lite`, `@xterm/headless` ou `simple-git`.
- Changer la sélection PTY, les sémantiques de worktree, la détection
  d'encodage ou la politique d'erreur.
- Optimiser le code qui s'exécute après que ces dépendances ont déjà été
  chargées.

## Constatations sur la fermeture d'imports

Le bundle de base construit depuis
`febb43bc9266cc7a3363539df87d90d752ad782c` a une fermeture statique ACP de
13 405 027 octets sur 144 sorties. Un parcours du metafile esbuild attribue
551 713 octets à `iconv-lite`, 213 071 octets à `@xterm/headless` et
146 526 octets à `simple-git`.

Les imports différés initiaux au niveau paquet n'étaient pas suffisants. La
CLI contenait des imports dynamiques de namespace de production de la racine
du paquet Core. Dans un build esbuild avec code-splitting, demander le
namespace entier garde chaque export de racine accessible, y compris l'export
de compatibilité d'encodage synchrone. Le design exige donc à la fois des
chargeurs locaux aux dépendances et des modules d'entrée runtime CLI étroits
qui ne réexportent que les symboles consommés par chaque chemin différé.

## Design

### Propriétés partagées des chargeurs

Chaque paquet a un chargeur local au paquet soutenu par une promise à portée
module. Les premiers utilisateurs concurrents partagent le même import, et les
utilisateurs ultérieurs réutilisent le module résolu. Les chargeurs
normalisent les formes d'interop CommonJS émises par Node et esbuild et
n'exposent que les membres runtime dont leurs consommateurs ont besoin.

Les chargeurs utilisent délibérément `import()` plutôt que
`createRequire()`. Le bundle de production est autonome et ne doit pas
dépendre d'une arborescence `node_modules` installée séparément. Les imports
dynamiques permettent à esbuild d'émettre des chunks autonomes tout en gardant
ces chunks hors de la fermeture statique ACP.

### `@xterm/headless`

`ShellExecutionService.execute()` est déjà asynchrone. Le service obtient
d'abord l'implémentation PTY, puis charge `@xterm/headless` juste avant
d'entrer dans le chemin d'exécution PTY. Il revérifie le signal d'annulation
après l'import asynchrone et passe le constructeur `Terminal` résolu aux
helpers PTY et de relecture synchrones existants.

Si le chunk de terminal échoue à charger, l'erreur reste dans la limite
d'échec PTY existante et l'exécution retombe sur `child_process`, conformément
à la politique de fallback actuelle. Aucun chargement de paquet n'a lieu
lorsque la prise en charge PTY est indisponible ou que le chemin
child-process est sélectionné.

### `simple-git`

Toutes les opérations Git réelles des consommateurs audités sont asynchrones.
`GitWorktreeService` garde une construction sans effet de bord et ne résout
une promise `SimpleGit` par instance que lorsque sa première méthode Git est
appelée. Les autres consommateurs Core utilisent directement le même chargeur
local au paquet.

Le nettoyage de démarrage utilise d'abord la découverte légère de racine de
dépôt existante. Il ne charge `simple-git` que lorsqu'un véritable dépôt est
présent et qu'une inspection des worktrees obsolètes est nécessaire. Un import
échoué rejette l'opération à la même limite asynchrone où un échec
d'initialisation Git était déjà rapporté.

### `iconv-lite`

Ce paquet porte la principale contrainte de compatibilité :
`decodeBufferWithEncodingInfo()` et `encodeTextFileContent()` sont des API
publiques synchrones. L'import dynamique JavaScript est asynchrone, donc
rendre ces fonctions directement différées casserait l'API.

Les API synchrones restent disponibles via un module de compatibilité qui
importe statiquement `iconv-lite`. Seule l'arête de réexportation de la
racine Core est marquée sans effet de bord pour le bundle, permettant à
esbuild d'écarter le module de compatibilité lorsqu'une entrée particulière
n'utilise pas ces exports. Les autres imports du module conservent le
traitement normal des effets de bord.

Les chemins internes asynchrones du service de fichiers utilisent des
variantes différées :

- Les écritures vides, marquées BOM, UTF-8 valide, ASCII et UTF-8 se
  terminent sans charger `iconv-lite`.
- Une lecture détectée non-UTF-8 charge le codec avant le décodage.
- Une écriture qui préserve des métadonnées non-UTF-8 charge le codec avant
  l'encodage.
- Un échec de chargement ou de décodage côté lecture conserve
  l'avertissement actuel et le fallback de remplacement UTF-8.
- Un échec de chargement ou d'encodage côté écriture rejette l'écriture au
  lieu de corrompre les octets.

Les imports différés de namespace Core de la CLI sont remplacés par des
modules d'entrée runtime locaux étroits. Cela évite de conserver chaque export
de la racine Core tout en préservant la même instance de Core embarquée et la
même identité de classe.

## Garde de bundle

La garde de chemin rapide ACP traite `iconv-lite`, `@xterm/headless` et
`simple-git` comme des paquets statiques interdits. Un chemin statique depuis
l'entrée ACP fait échouer la vérification ; les chemins uniquement dynamiques
sont autorisés. Les tests couvrent à la fois le rejet et les limites
dynamiques autorisées.

Cette garde évalue le graphe d'imports du metafile plutôt que le texte du
bundle, de sorte qu'un chunk renommé ou un symbole minifié ne puisse pas la
contourner.

## Audit de compatibilité et d'échec

| Domaine | Comportement préservé | Nouvelle limite |
| ------- | --------------------- | --------------- |
| Exécution shell | Gestion de la sortie PTY, relecture, annulation, fallback child-process | Le chunk de terminal est chargé après la sélection PTY |
| Worktrees et extensions GitHub | Options `simple-git` existantes et propagation des erreurs | Le module Git est chargé à la première opération Git asynchrone |
| Lectures de texte | Chemins rapides BOM et UTF-8, métadonnées d'encodage, décodage de fallback | Le codec n'est chargé que pour un fallback non-UTF-8 détecté |
| Écritures de texte | Préservation du BOM, encodage non-UTF-8, comportement d'écriture atomique | Le codec n'est chargé que lorsque les métadonnées non-UTF-8 l'exigent |
| API publique Core | Signatures et comportement des helpers d'encodage synchrones | L'export de compatibilité peut être éliminé par tree-shaking des entrées qui ne l'utilisent pas |

Le design n'introduit pas de configuration mutable globale au processus. Les
promises des chargeurs sont locales au processus et idempotentes. Les imports
rejetés restent rejetés, ce qui est approprié car un chunk embarqué manquant
ou corrompu ne peut pas récupérer pendant la même durée de vie du processus.

## Alternatives envisagées

### Convertir les API d'encodage synchrones en promises

Rejeté car cela casse les appelants publics et élargit ce qui est par ailleurs
une optimisation interne de démarrage.

### Utiliser `createRequire()` à la première utilisation

Rejeté car cela rendrait la CLI embarquée dépendante d'une installation
`node_modules` au runtime et ne produirait pas un artefact de release
autonome.

### Réimplémenter les tables d'encodage ou le comportement du terminal

Rejeté comme substantiellement plus risqué que de différer les paquets
existants.

### Ne faire atterrir que `@xterm/headless` et `simple-git`

Ce serait plus simple, mais cela laisserait le plus gros paquet du groupe sur
le chemin eager et ne satisferait pas le candidat 5. La façade de
compatibilité et les modules d'entrée runtime étroits retirent `iconv-lite`
sans changer son API publique.

## Plan de vérification

1. Construire les artefacts de production CLI seule et les bundler avec le
   code splitting esbuild.
2. Parcourir la fermeture statique du metafile de l'entrée ACP et exiger zéro
   octet attribué pour les trois paquets.
3. Exécuter les tests unitaires ciblés pour les lectures et écritures
   d'encodage, l'exécution shell et le fallback, le comportement Git des
   worktrees, le nettoyage, les opérations d'extension GitHub, chaque chargeur
   et la garde de bundle.
4. Exécuter les tests CLI affectés, le build et le typecheck complet.
5. Sur l'hôte de référence 2-vCPU, 4-GiB, exécuter un smoke test apparié puis
   30 paires froides sérielles alternées et 30 paires préchauffées. Rapporter
   `channel.initialize`, la latence du processus à la première session, le pic
   de RSS de l'arbre de processus, la concurrence, le comportement avec
   télémétrie désactivée, le comportement legacy à session unique et les
   processus résiduels.

## Résultat statique mesuré

| Variante | Sorties ACP | Fermeture statique ACP | `iconv-lite` | `@xterm/headless` | `simple-git` |
| -------- | ----------: | ---------------------: | -----------: | ----------------: | -----------: |
| Base | 144 | 13 405 027 octets | 551 713 octets | 213 071 octets | 146 526 octets |
| Candidat | 142 | 12 314 617 octets | 0 octet | 0 octet | 0 octet |
| Delta | −2 | **−1 090 410 octets** | −551 713 octets | −213 071 octets | −146 526 octets |

Le résultat de performance distant doit être évalué séparément car les octets
du bundle n'impliquent pas une amélioration de latence.

## Résultat mesuré 2C4G

L'hôte distant avait 2 vCPU, 3,5 GiB de RAM au total, pas de swap et Node.js
22.23.1. Un run de smoke séparé à une paire et ses scénarios fonctionnels ont
réussi avant le run formel. Le run formel a ensuite terminé 30 paires froides
sérielles alternées et 30 paires préchauffées alternées, suivies d'un autre
jeu de scénarios fonctionnels, sans session échouée ni processus résiduel.

Le candidat formel était l'artefact prototype copié avec le SHA-256
`f0ac7edc7665752efac7b7bfbb4fb055ce2d8ef1a8ae5dd1af630305a2c84d28`, étiqueté
`febb43bc9266cc7a3363539df87d90d752ad782c+candidate5` par le harnais. Le
résultat s'applique à cet artefact exact, pas à un futur SHA de commit ; une
PR doit conserver le hash de l'artefact ou relancer la porte si son code de
production change.

| Scénario | Métrique | Base P50 / P95 | Candidat P50 / P95 | Delta P50 | Médiane appariée | Victoires candidat |
| -------- | -------- | -------------: | -----------------: | --------: | ---------------: | -----------------: |
| Froid | `channel.initialize` | 896,2 / 915,5 ms | 831,5 / 848,5 ms | **−64,7 ms** | −60,1 ms | 30/30 |
| Froid | `POST /session` | 1273,8 / 1305,3 ms | 1156,5 / 1181,1 ms | **−117,4 ms** | −105,1 ms | 30/30 |
| Froid | processus → première session | 1877,7 / 1921,0 ms | 1733,3 / 1763,8 ms | **−144,4 ms** | −136,2 ms | 30/30 |
| Froid | pic de RSS de l'arbre de processus | 417,0 / 451,4 MB | 408,1 / 419,2 MB | **−8,9 MB** | −8,5 MB | 18/30 |
| Préchauffé | `channel.initialize` | 895,3 / 926,3 ms | 837,2 / 861,6 ms | **−58,1 ms** | −49,2 ms | 30/30 |
| Préchauffé | `POST /session` | 90,0 / 94,2 ms | 83,3 / 86,7 ms | **−6,7 ms** | −6,5 ms | 28/30 |
| Préchauffé | processus → première session | 3697,3 / 3723,0 ms | 3666,0 / 3676,6 ms | **−31,3 ms** | −29,6 ms | 30/30 |
| Préchauffé | pic de RSS de l'arbre de processus | 430,5 / 433,1 MB | 403,0 / 419,3 MB | **−27,5 MB** | −13,9 MB | 19/30 |

Le candidat a aussi réussi les premières sessions concurrentes, le démarrage
avec télémétrie désactivée et le démarrage legacy à session unique. Une sonde
de première utilisation en configuration de production a réussi l'encodage et
le décodage GBK, la construction et l'écriture d'un terminal headless,
l'identité single-flight des chargeurs et une initialisation réelle de dépôt
`simple-git` local. L'hôte distant n'a pas d'exécutable `git`, donc la sonde
`simple-git` distante a vérifié le chargement du module et la construction de
la fabrique mais n'a pas pu exécuter une véritable commande Git ; les suites
complètes locales du service Git couvrent ces opérations.

La porte d'acceptation est satisfaite : les victoires sur le chemin à froid
sont cohérentes sur les 30 paires de latence, restent visibles dans la
métrique d'initialisation de canal préchauffée et n'échangent pas de la
latence contre plus de mémoire.

## Risques et déploiement

Le risque principal est un échec uniquement à la première utilisation que les
imports eager exposaient auparavant au démarrage. Les tests ciblés exercent
les chemins de première utilisation, et la garde de bundle de production
vérifie que les imports restent dynamiques. Les runs de smoke et d'acceptation
distants exercent de véritables sessions ACP bundlées et vérifient l'absence
de processus résiduels.

Ce candidat doit rester une PR séparée, comme l'exige #7264, afin que sa
surface de régression et son effet de performance restent attribuables. Si la
porte 2C4G ne montre aucun bénéfice de démarrage reproductible ou une
régression significative à la première utilisation, l'implémentation ne doit
pas atterrir uniquement pour la réduction de taille du bundle.

## Références

- [Code splitting esbuild](https://esbuild.github.io/api/#splitting)
- [Analyse du metafile esbuild](https://esbuild.github.io/api/#metafile)
- [Expressions d'import dynamique Node.js](https://nodejs.org/api/esm.html#import-expressions)
- [Interopérabilité CommonJS de Node.js](https://nodejs.org/api/esm.html#interoperability-with-commonjs)
