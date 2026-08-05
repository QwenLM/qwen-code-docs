# Synchronisation upstream CUA Driver 0.17.0

## Objectif

Faire passer la source vendored de CUA Driver de l'upstream
`cua-driver-rs-v0.7.0` au tag publié `cua-driver-rs-v0.17.0` tout en
préservant le runtime et le contrat de distribution spécifiques à Qwen.

Le tag de release, commit `10279552e2bbe479e367a082f78b1b98ee85a697`, est la
source de vérité. Le checkout local `/Users/mochi/code/cua`, les anciennes
notes de conception et les artefacts générés sont uniquement des entrées de
comparaison.

## Périmètre

L'import upstream est limité à `trycua/cua:libs/cua-driver`, mappé vers
`packages/cua-driver`. Les workflows du monorepo upstream, les scripts
racines, la documentation et les bibliothèques sans rapport ne sont pas
importés automatiquement. Toute nouvelle dépendance à ces fichiers doit être
rendue locale au paquet ou explicitement mappée vers une installation
existante de Qwen Code.

Le workflow de release appartenant à Qwen reste
`.github/workflows/cd-cua-driver.yml`. Il peut recevoir les changements
minimum requis par le nouveau contrat de build et de release du driver, mais
il doit continuer à publier des artefacts appartenant à Qwen.

## Deltas Qwen requis

La synchronisation est incomplète tant que tout ceci ne reste pas effectif :

1. L'exécutable installé, le processus, l'app bundle, l'identifiant de
   bundle, les chemins, les services planifiés, la documentation et les
   assets de release utilisent l'identité appartenant à Qwen attendue par la
   ligne de release actuelle de Qwen. Le répertoire d'état de release reste
   `~/.cua-driver` pour la compatibilité de mise à niveau ; le répertoire
   isolé de build local reste `~/.qwen-cua-driver-local`.
2. `CUA_DRIVER_RS_COORDINATE_SPACE=1` continue de fournir le contrat de
   coordonnées 0-1000 en opt-in à la frontière d'invocation partagée. Il doit
   couvrir chaque nouvel outil portant des coordonnées, de bureau et adjacent
   au navigateur, ou fail closed.
3. `MCP_MODEL_PAYLOAD_FILTER=1` continue de filtrer le branding visible par
   le modèle à la fois dans le contenu texte MCP et le contenu structuré sans
   altérer les médias binaires.
4. Le comportement des fenêtres de premier niveau à titre vide/nul sous
   Windows, toujours non fusionné, issu de trycua/cua#2021 reste présent et
   est adapté au modèle de fenêtres actuel.
5. Le patch d'écriture socket EAGAIN issu de trycua/cua#2036 est retiré de
   l'inventaire local des patches car il fait partie de la base 0.17.0.

## Changements de contrat upstream

L'import inclut le runtime appartenant au SDK, les SDK UniFFI Python et
TypeScript, l'automatisation typée du navigateur, les modes de permission du
runtime, la portée de capture par session, les tokens d'éléments liés au
snapshot, le contrat fermé `ActionResult`, `verify_state`, l'invocation des
menus natifs, les outils presse-papiers, l'encadrement des fenêtres et les
thèmes de curseur sémantiques.

Ce sont des remplacements architecturaux plutôt que des fonctionnalités
feuilles indépendantes. Les transformations de coordonnées et de payload de
Qwen doivent être rattachées à la frontière canonique SDK/outil afin que
l'exécution CLI, MCP, SDK direct, worker privé et démon ne puissent pas
diverger.

## Stratégie d'import

1. Exécuter le script upstream-delta pris en charge par le dépôt depuis la ref
   `.vendored-from` actuelle vers `cua-driver-rs-v0.17.0`.
2. Inventorier chaque rejet, suppression, nouveau fichier généré, chemin
   relatif à la racine, identité de paquet, version de release et dépendance
   de build externe.
3. Résoudre les chevauchements upstream/local en préservant l'architecture
   upstream et en réexprimant chaque delta Qwen à sa nouvelle frontière
   canonique.
4. Mettre à jour ensemble `.vendored-from`, `.vendored-patches.md`, les
   références de version, les installeurs Qwen et le workflow de release Qwen.
5. Auditer la source, les tests, la documentation, les bindings générés, les
   installeurs, les métadonnées de bundle, les noms de processus, les noms de
   service et les archives de release pour la cohérence d'identité.

## Vérification

La vérification est stratifiée afin qu'un test unitaire étroit au vert ne
puisse pas masquer une distribution ou une frontière de confiance cassée :

- Formatage Rust, vérifications de paquets, tests unitaires
  core/contrat/SDK et cohérence des contrats générés.
- Tests ciblés de normalisation des coordonnées, de filtre de payload,
  d'énumération des fenêtres Windows, d'installeur et de version.
- Vérifications de génération/paquet des SDK Python et TypeScript lorsque
  leur chaîne d'outils locale au paquet est disponible.
- Vérifications statiques du workflow de release Qwen pour les noms
  d'exécutables, l'agencement de l'app bundle, les identifiants de bundle,
  les assets et les versions intégrées.
- `npm run build && npm run typecheck` pour le dépôt englobant.
- Audit complet du diff et des fichiers non suivis, répété jusqu'à ce que deux
  passages consécutifs soient propres.

La production de releases signées/notarisées et la certification physique des
GUI Windows/Linux/macOS sont hors de la vérification locale et doivent rester
des gates de release explicites.
