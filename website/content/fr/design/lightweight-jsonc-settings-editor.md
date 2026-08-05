# Éditeur de settings JSONC léger

## Contexte

Le runtime ACP importe statiquement les writers de settings et de dossiers
fiables. Les deux writers dépendent actuellement de `comment-json`, dont le
cluster de parseur contribue à hauteur de 304 770 octets à la fermeture de
démarrage ACP. Ces modules sont parsés et évalués avant que l'enfant ACP ne
puisse répondre à `initialize`, alors que la plupart des démarrages
n'écrivent ni l'un ni l'autre fichier.

Le candidat 6 de l'issue #7264 propose de charger ce parseur de manière
différée ou de le remplacer par un parseur plus léger. Les API d'écriture et
leurs appelants sont synchrones, et les distributions autonomes ne livrent
pas de dépendances JavaScript arbitraires hors du bundle, donc un `require()`
au runtime ou un import dynamique élargirait l'API ou casserait la première
utilisation. `jsonc-parser` est déjà présent dans le graphe de dépendances de
développement, a une petite empreinte dans le bundle et offre des API de
parsing et d'édition par chemin synchrones.

## Objectifs

- Retirer `comment-json` et `esprima` de la fermeture de démarrage statique
  ACP.
- Préserver les API d'écriture synchrones des settings et des dossiers
  fiables.
- Préserver les commentaires ainsi que l'indentation, les fins de ligne, la
  newline finale et le BOM UTF-8 du fichier existant lors des mises à jour
  ordinaires.
- Préserver les comportements de fusion, de synchronisation et de
  remplacement exact de sous-arbre.
- Garder inchangées la limite de verrou des dossiers fiables, la relecture du
  disque, la validation, la permission, l'écriture atomique, la notification
  et la libération du verrou.
- Rejeter un JSONC mal formé ou non objet sans l'écraser.

## Non-objectifs

- Changer les migrations de settings ou les sémantiques des dossiers fiables.
- Rendre asynchrones les écritures de configuration.
- Reformater tous les fichiers de configuration.
- Remplacer le chemin séparé de chargement strict des dossiers fiables.
- Ajouter une abstraction JSONC généraliste pour d'autres paquets.

## Design

Renommer l'utilitaire legacy en camel-case en un module d'éditeur JSONC en
kebab-case. Le module conserve l'API existante de mise à jour au niveau
fichier et le helper `applyUpdates`, et ajoute deux opérations synchrones en
mémoire :

1. Parser le JSONC comme un objet de premier niveau tout en collectant et en
   rejetant chaque erreur du parseur. Un BOM UTF-8 de tête est retiré
   temporairement avant le parsing.
2. Appliquer les mises à jour de fusion, de synchronisation ou de
   remplacement exact de sous-arbre à la valeur parsée, calculer les chemins
   d'objet modifiés et appliquer ces chemins au texte d'origine avec
   `jsonc-parser modify()`.

Les objets sont comparés récursivement afin que les commentaires et la mise
en page inchangés restent intacts. Les tableaux et les valeurs scalaires sont
remplacés atomiquement. Avant la suppression d'une propriété, un commentaire
inline sur la même ligne est supprimé avec cette propriété ; sinon
`jsonc-parser` peut attacher le commentaire à la propriété précédente. La
sortie complète est parsée à nouveau et comparée à la valeur voulue avant que
le moindre appelant ne l'écrive.

Les clés d'objet dupliquées nécessitent une gestion explicite car
`jsonc-parser` évalue la dernière valeur tandis que `modify()` cible la
première propriété correspondante. Avant d'appliquer les mises à jour par
chemin d'objet, les propriétés dupliquées antérieures le long de ces chemins
sont supprimées afin que la dernière propriété effective reste. Les
commentaires possédés par les occurrences dupliquées supprimées sont retirés
avec elles. Cela évite de renvoyer un succès tout en laissant la valeur
effective inchangée.

Les nouveaux fichiers continuent d'utiliser du JSON à deux espaces. Les
fichiers existants conservent les tabulations ou espaces détectés, LF ou
CRLF, l'état de newline finale et un BOM de tête.

`trustedFolders` réutilise le parseur et l'éditeur en mémoire après avoir
pris son verrou existant et relu le fichier. Il valide toujours l'état du
disque et l'état proposé, écrit via `atomicWriteFileSync()` avec le mode
`0o600`, `forceMode: true` et `noFollow: true`, ne met à jour la mémoire
qu'après la réussite de l'écriture et libère le verrou dans un `finally`.

`jsonc-parser` devient une dépendance de production directe de la CLI et
`comment-json` est retiré. Les imports source utilisent l'entrée publique du
paquet afin que la sortie compilée non bundlée reste directement exécutable
par Node. La configuration esbuild aliase cette entrée vers le build ESM du
paquet, car le bundle orienté Node sélectionnerait sinon son entrée UMD, dont
les requires CommonJS relatifs ne survivent pas au bundle ESM splitté. La
garde de bundle du chemin rapide interdit `comment-json`, `esprima` et le
build UMD de `jsonc-parser` dans la fermeture statique ACP.

## Gestion des échecs

- Les erreurs de parseur ou une racine non objet interrompent avant
  l'écriture.
- Les valeurs qui ne peuvent pas être représentées en JSON interrompent avant
  l'écriture.
- Une incohérence entre le document édité et la valeur voulue interrompt
  avant l'écriture.
- Les écritures de settings conservent le renvoi `false` existant et les
  diagnostics stderr en cas d'échec de parsing ou de validation.
- Les écritures des dossiers fiables conservent leur comportement de levée
  d'exception afin que les appelants ne mettent jamais à jour l'état en
  mémoire après une écriture faisant autorité échouée.
- Les échecs de système de fichiers, de verrou, de permission et d'écriture
  atomique conservent leur comportement existant.

## Alternatives envisagées

### `import('comment-json')` dynamique

Rejeté car le chemin d'écriture public est synchrone et a des appelants
synchrones de migration, d'UI, d'ACP et de démon. Convertir le graphe d'appels
en asynchrone est plus large que cette optimisation.

### `createRequire()` différé

Rejeté car esbuild laisserait la dépendance hors du bundle alors que les
archives autonomes n'incluent pas de paquets JavaScript arbitraires dans
`lib/node_modules`. Une première écriture empaquetée pourrait échouer au
runtime.

### Toujours réécrire avec `JSON.stringify()`

Rejeté car cela jetterait les commentaires et le formatage de l'utilisateur
lors des mises à jour normales des settings.

### Tokenizer personnalisé

Rejeté car `jsonc-parser` fournit déjà l'arbre de parsing et les primitives
d'édition requis avec une implémentation substantiellement plus petite et
maintenue.

## Validation

- Les tests unitaires ciblés couvrent le comportement existant plus les
  entrées mal formées, les racines non objet, les virgules de fin, les
  commentaires imbriqués et inline, les commentaires de propriété supprimée,
  les sémantiques de fusion/synchronisation/remplacement, les clés de
  prototype-pollution, les clés dupliquées, CRLF, les tabulations, la newline
  finale, le BOM, les écritures sans effet et la validation de la sortie.
- Les tests des dossiers fiables couvrent la fusion sur disque sous verrou,
  les entrées et sorties invalides, la préservation des commentaires, la
  synchronisation exacte, les écritures atomiques préservant les permissions,
  les écritures échouées et la libération du verrou.
- Les tests de la garde de bundle et un metafile esbuild généré prouvent que
  ni `comment-json` ni `esprima` ne sont dans la fermeture statique ACP.
- Le build CLI, le typecheck, le lint et les tests ciblés doivent passer.
- Les bundles de release de contrôle et candidat ont été exécutés sur l'hôte
  2-vCPU établi avec un warmup écarté, 30 démarrages à froid appariés alternés
  et 30 démarrages préchauffés appariés alternés. Le candidat a réduit le P50
  de `channel.initialize` à froid de 35,39 ms, le P50 du processus à la
  première session de 38,00 ms et le P50 du processus à la première session
  complète de 48,51 ms. Il a gagné 28 paires froides sur 30 pour chaque
  métrique principale, avec des intervalles bootstrap à 95 % de moyenne
  appariée entièrement inférieurs à zéro.
- Le chemin déjà préchauffé du processus à la session complète était
  statistiquement neutre. Les premières sessions concurrentes, le mode legacy
  à session unique, la télémétrie activée et la télémétrie désactivée se sont
  tous terminés avec succès, ont produit la télémétrie attendue et n'ont
  laissé aucun processus résiduel.
- Le pic de RSS de l'arbre de processus du candidat était environ 10,8 MiB
  plus élevé pendant l'initialisation, mais un suivi séparé à 10 paires a
  échantillonné les mêmes processus après une période d'inactivité de
  10 secondes. Le delta médian apparié en régime établi était de 0,55 MiB
  avec un intervalle bootstrap couvrant zéro, montrant que la différence de
  pic était un calendrier transitoire d'initialisation et de ramasse-miettes
  plutôt qu'une augmentation persistante de l'empreinte.
- La fermeture statique ACP exacte est passée de 12 449 869 à 12 145 099
  octets, une réduction de 304 770 octets (2,45 %), sans aucune entrée
  `comment-json`, `esprima` ou UMD de `jsonc-parser`.
