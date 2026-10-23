# Exécuter des sessions Managed en local


Managed local utilise une base de données H2 intégrée et persistante. Avec Java 21 installé en local,
le premier lancement de Managed télécharge automatiquement le JAR serveur Java correspondant.
Il réutilise l'exécutable Node qui exécute Qwen,
son Hosted Harness, le point d'entrée worker natif et le WebShell de production. Les utilisateurs n'ont pas besoin d'installer
MySQL, Docker, Maven ou systemd. Un runtime groupé préinstallé en option inclut
Java ; le téléchargement par défaut et l'édition légère nécessitent Java 21 en local.

Ce mode est expérimental. L'implémentation supporte nativement macOS et Linux
sur arm64 et x64. Les résultats d'acceptation par plateforme sont enregistrés séparément ; fournir
une cible de packaging n'établit pas que cette plateforme a passé la validation E2E.
Les archives runtime Managed sont construites explicitement comme décrit ci-dessous ; les packages CLI
ordinaires ne contiennent pas la charge utile Java. Une archive Managed standalone complète en option regroupe tous les composants.

## Démarrage et arrêt

Utilisez une version de Qwen qui inclut le support Managed local. Les versions plus anciennes nécessitent une
mise à jour du CLI ; installer le runtime seul ne peut pas ajouter le lanceur. Installez Java 21
et définissez `JAVA_HOME` sur son répertoire, ou ajoutez son exécutable au PATH, puis exécutez :

```sh
qwen serve --managed --open
```

Avant de créer des données d'application ou de démarrer des services, Qwen vérifie Java 21 et
télécharge `qwen-managed-agent-server-<cli-version>.jar` ainsi que sa somme de contrôle depuis
le miroir de release officiel Aliyun OSS, avec la même GitHub Release comme fallback.
Il vérifie la somme de contrôle et installe un runtime complet de manière atomique sous
`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/`. Les lancements ultérieurs
réutilisent ce cache sans réseau. Les commandes Qwen ordinaires ne le téléchargent pas.
Seul le JAR de service est téléchargé ; Qwen n'installe pas Java ni n'exécute Maven.
Si la release correspondante est indisponible ou si un téléchargement échoue, aucune donnée d'application
ni processus enfant n'est créé. Réessayez plus tard ou préinstallez un runtime correspondant.

Pour une utilisation hors ligne ou avec Java groupé, obtenez un
`qwen-code-managed-runtime-<platform>-<arch>.tar.gz` correspondant et son fichier `.sha256` depuis
votre distributeur. Vérifiez et extrayez-le avant de démarrer :

```sh
shasum -a 256 -c qwen-code-managed-runtime-darwin-arm64.tar.gz.sha256
mkdir -p "${QWEN_HOME:-$HOME/.qwen}"
tar -xzf qwen-code-managed-runtime-darwin-arm64.tar.gz -C "${QWEN_HOME:-$HOME/.qwen}"
qwen serve --managed --open
```

L'archive s'installe sous
`<Qwen home>/managed-runtime/<cli-version>/<platform>-<arch>/`. Qwen découvre
le répertoire pour sa version et sa plateforme exactes automatiquement. Le runtime
n'inclut pas d'autre installation Node, CLI, Harness, worker ou WebShell.

Pour une charge utile hors ligne plus petite, choisissez `qwen-code-managed-runtime-lite-<platform>-<arch>.tar.gz`
et vérifiez/extrayez-le de la même manière. Il contient uniquement le JAR serveur et le
manifeste. Installez une édition dans un répertoire version/cible vierge ; ne superposez pas
les archives légère et groupée. Le lanceur léger utilise
`JAVA_HOME/bin/java` quand JAVA_HOME est non vide, sinon le premier exécutable
`java` trouvé sur le PATH. Il nécessite Java 21 spécifiquement et vérifie l'exécutable
avant de créer l'état d'application. Un JAVA_HOME incorrect est une erreur même si
le PATH contient un autre Java fonctionnel. Par exemple :

```sh
JAVA_HOME=/absolute/java-21-home qwen serve --managed --open
```

Sur macOS, JAVA_HOME se termine généralement par `Contents/Home`. Un Java manquant ou incompatible
produit une erreur d'installation/configuration avant le téléchargement du JAR ; Qwen ne télécharge pas Java.
L'édition groupée utilise toujours son propre Java et ne revient pas au
Java de la machine si sa charge utile est endommagée.

Le `qwen-code-managed-local-<platform>-<arch>.tar.gz` complet en option
fonctionne également : extrayez-le et exécutez `./qwen-code/bin/qwen serve --managed --open`.

L'application se lie à `127.0.0.1:4170`. Utilisez `--port 0` pour un port
libre, ou sélectionnez un port fixe. Gardez le terminal ouvert ; Ctrl+C arrête le
démon ordinaire, le service Java et le Harness. systemd est optionnel pour les déploiements
opérés et n'est pas utilisé par cette commande.
Un port public occupé suit la tentative de port proche bornée du démon ordinaire ;
utilisez l'adresse navigateur imprimée par le lanceur.

Cette commande unique démarre à la fois le démon ordinaire et Managed Agent. Le même
WebShell liste les workspaces et sessions ordinaires et Managed ensemble sous Projets, avec un label Managed sur les workspaces Managed et sans onglets de mode d'exécution. Nouvelle tâche suit le workspace ou la conversation sélectionné. Les sessions locales utilisent
le répertoire où vous avez exécuté la commande, tandis que les sessions Managed utilisent leurs
Workspaces créés par l'application ou des projets locaux explicitement importés. Les deux utilisent
la même origine navigateur authentifiée ;
vous n'avez pas besoin d'une deuxième commande démon ou page navigateur.

Dans **Ajouter un workspace**, choisissez **Local (daemon)** ou **Managed (Managed Agent)**
avant de soumettre. Le choix par défaut est le service de la conversation en cours.
Les lignes de workspace et **Nouvelle tâche** affichent ce service, et les nouvelles tâches héritent du
workspace sélectionné. Le support SSH workspace existant du démon reste
disponible ; l'enregistrement SSH Managed n'est pas intégré dans cette boîte de dialogue partagée.

Le terminal affiche une URL navigateur avec un fragment token. Traitez-le comme un
mot de passe local. Le navigateur utilise le token pour authentifier chaque requête API ; les
clés de signature Java et les identifiants internes n'atteignent jamais le navigateur. L'écouteur est
en boucle locale uniquement. Pour une machine headless, omettez `--open` et ouvrez l'URL affichée
sur cette machine, ou utilisez un tunnel authentifié que vous gérez.

L'application unifiée supporte actuellement la page en boucle locale. L'entrée
Mobile access / Local Control existante du shell complet n'est pas intégrée au
démarrage Managed : un écouteur LAN apparié ne peut pas ouvrir cette page unifiée. Le partage
Mobile nécessite une intégration séparée ; le démon ordinaire conserve son comportement
Local Control existant.

Le Harness utilise la configuration de modèle Qwen normale et les identifiants fournisseur.
Configurez un modèle en utilisant la configuration CLI Qwen habituelle avant d'envoyer votre premier
prompt. Files et Shell utilisent le mode d'approbation `default` ; l'UI Managed demande
l'approbation avant une action qui la nécessite.

Après un redémarrage, continuer une Session existante peut attendre que son bail
d'écriture SQL précédent expire (60 secondes par défaut). Conservez le répertoire de données original
et réessayez après cet intervalle ; redémarrer les processus ne efface pas la propriété.

## Workspaces et données persistantes

Le répertoire de données privé par défaut est `<Qwen home>/managed-local`, normalement
`~/.qwen/managed-local`. Override avec :

```sh
qwen serve --managed --managed-data-dir /absolute/private/data --open
```

Le répertoire doit être en dehors de chaque worktree Git. Un seul lanceur peut l'utiliser à
la fois ; Java détient également un verrou de fichier de base de données exclusif. Les ports de service privés
et les identifiants restent stables à travers les redémarrages. Un port privé occupé par
une autre application provoque l'échec du démarrage ; choisissez un répertoire de données frais différent
ou arrêtez le service en conflit plutôt que de modifier les faits persistés.

Le démarrage crée un Workspace par défaut possédé par l'application et son OWNER grant
via l'API Workspace idempotente existante. Pour utiliser un projet local existant,
ouvrez **Workspace → Choisir un répertoire existant**, parcourez ou entrez son chemin
absolu, puis ajoutez le dossier. Le service enregistre son parent et accorde l'accès OWNER
automatiquement, en conservant les fichiers existants. Les nouvelles tâches démarrent dans le
projet sélectionné. Vous pouvez également créer un Workspace vide.

Le répertoire de lancement reste disponible pour les sessions Local et n'est pas importé
automatiquement. `--workspace` reste non supporté en mode Managed local ; sélectionnez
le projet dans l'UI. Le marqueur de maintenance `.qwen-managed-storage.json` est
conservé en dehors des worktrees Git ; ne le modifiez pas, supprimez, stash ou commitez pas. Les fichiers
de projet importés restent en dehors du répertoire de données Managed privé et nécessitent leur
propre sauvegarde.

L'historique de session Local continue d'utiliser le stockage Qwen ordinaire. Il est séparé
du répertoire de données Managed et n'est pas inclus dans une sauvegarde Managed uniquement.

Préservez le répertoire de données complet ensemble, y compris `state.json`,
`database/`, `runtime/`, `worker-home/` et `workspaces/`. Soldez ou annulez
le travail actif, fermez ses Sessions, puis arrêtez l'application avant de faire une
sauvegarde du système de fichiers. Les workers durables originaux peuvent survivre à une sortie du plan de contrôle ;
confirmez que tous les writers de Workspace se sont arrêtés. Une exécution inconnue nécessite
la procédure de récupération original-owner existante avant une sauvegarde hors ligne.
Les identifiants, la base de données, l'historique worker et l'identité Workspace appartiennent à la même
installation. Restaurer uniquement un sous-ensemble
peut fermer l'admission de récupération. Le démarrage ne recrée pas un marqueur manquant ni
ne remplace des identifiants corrompus. Les diagnostics de service sont dans `logs/`.

macOS supporte les workers natifs et l'adoption durable au même boot. La récupération de reboot
whole-host de confiance reste désactivée dans le lanceur local. Les résultats d'outils inconnus
conservent les règles de récupération original-owner existantes et ne sont jamais rejoués aveuglément.
Ce mode n'ajoute pas de démarrage automatique au login ni n'empêche la mise en veille du portable.

## Construire une distribution

Ces commandes sont pour les builders de release, pas les utilisateurs finaux. Construisez le CLI et le serveur Java
depuis le même checkout avec Node 22+, Java 21 et Maven 3.8.9+ :

```sh
corepack pnpm install --frozen-lockfile
npm run build
npm run typecheck
npm run bundle
npm run prepare:package
mvn -f packages/sdk-java/qwencode/pom.xml -DskipTests -Dgpg.skip=true install
mvn -f packages/managed-agent-server/pom.xml verify
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --jre-home /verified/java-21-home \
  --out-dir /output/managed-runtime
```

Le builder de runtime a uniquement besoin du JAR serveur correspondant, du runtime Java et de la version CLI
de ce checkout. Il ne nécessite pas d'assets CLI construits ni d'archive Node.
Par défaut il écrit dans
`packages/managed-agent-server/target/managed-runtime`, en dehors des assets CLI
`dist/`. Il émet l'archive runtime et un fichier `.sha256` par archive. Le
CLI normal est construit/publié séparément.

Construisez le runtime léger en utilisant le même JAR serveur avec `--without-jre`
au lieu de `--jre-home` :

```sh
npm run package:managed-runtime -- \
  --target darwin-arm64 \
  --server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --without-jre \
  --out-dir /output/managed-runtime
```

Cela émet `qwen-code-managed-runtime-lite-darwin-arm64.tar.gz` et sa somme de contrôle.
Le builder léger n'a besoin d'aucune entrée Java. Pour une distribution complète en option :

```sh
npm run package:standalone -- \
  --target darwin-arm64 \
  --node-archive /verified/node-v22-darwin-arm64.tar.gz \
  --managed-server-jar packages/managed-agent-server/target/qwen-managed-agent-server-0.1.0-alpha.jar \
  --managed-jre-home /verified/java-21-home \
  --out-dir /output/managed-local
```

Utilisez le runtime home extrait complet contenant `bin/java`, `lib/modules`,
`release` et `legal/`. Un JRE macOS peut placer cela sous `Contents/Home`.
Le builder vérifie la version majeure Java, l'OS et l'architecture, inclut ses
licences, et enregistre le SHA-256 du serveur et la version CLI correspondante dans
le manifeste de charge utile. Le standalone complet utilise `lib/managed-runtime/` et
émet `SHA256SUMS`. Vérifiez les sommes de contrôle de l'éditeur des entrées runtime avant de construire.
L'exécution managed Windows et Bun est refusée ; le lanceur nécessite Node 22+.

Pour un emplacement de runtime explicite,
`QWEN_MANAGED_LOCAL_RUNTIME_DIR=/absolute/managed-runtime` pointe le CLI local
directement vers un répertoire contenant `manifest.json` et `server.jar`
(plus `jre/` pour l'édition groupée).
Il prend le pas sur la charge utile colocalisée et l'installation Qwen-home versionnée.
Une charge utile colocalisée existante prend le pas sur l'installation Qwen-home.
Une charge utile sélectionnée invalide ou incomplète n'est jamais remplacée par une autre.
Une charge utile explicitement sélectionnée manquante, une mauvaise version CLI, cible,
version majeure Java ou somme de contrôle serveur échoue avant que les enfants ne démarrent. Seul un cache
par défaut manquant déclenche l'installation du JAR ; les charges utiles endommagées existantes ne sont pas remplacées.
Maven n'est jamais exécuté pendant le démarrage de l'application.

## Publier le JAR de première utilisation

Le workflow `Release Managed server runtime` construit depuis un tag de release CLI
déjà publié, en utilisant le SDK et le serveur depuis cette révision source exacte. Une
exécution manuelle doit être dispatchée depuis `main` et par défaut en dry run. Il vérifie
le module CLI et Java, construit le profil `central-release`, et conserve le
JAR et la somme de contrôle comme artifacts de workflow sans modifier les dépôts publics.

Après avoir vérifié le dry run, les opérateurs de release peuvent exécuter le même tag avec
`dry_run=false` via l'environnement protégé `production-release`. Le
workflow définit la version d'artifact serveur à la version CLI, publie
`com.alibaba:qwen-managed-agent-server:<cli-version>` sur Maven Central avec
les sources, Javadoc et signatures, et distribue le même JAR principal plus son
`.sha256` via cette GitHub Release et le miroir OSS versionné existant.
Les JARs auxiliaires d'opérateur ne sont pas attachés à la publication Central. Les assets
existants sont comparés octet par octet et ne sont jamais remplacés par du contenu différent.
Les événements de release CLI publiés exécutent également ce workflow automatiquement.

Le CLI télécharge depuis OSS/GitHub, pas Maven Central. Il ne résout pas le
SDK comme une dépendance utilisateur séparée : le JAR serveur exécutable inclut ses dépendances
Java. Les assets runtime doivent exister pour la release CLI exacte avant que le
téléchargement de première utilisation ne réussisse. La validation locale de cette PR ne publie pas ces
assets ni ne contourne l'environnement de release de production.

Voir le [design](../design/2026-10-20-managed-local-serve.md) bilingue pour
les limites de propriété et les critères de validation, et la
[référence serveur Java](../../packages/managed-agent-server/README.md) pour
les déploiements MySQL orientés opérateur.