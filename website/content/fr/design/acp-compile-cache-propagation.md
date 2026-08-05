# Propagation du compile-cache ACP

## Contexte

Le wrapper de production `cli-entry.js` active déjà le cache de compilation des modules de Node pour le chemin rapide `serve` en processus. Le démon lance ensuite un enfant ACP via `createSpawnChannelFactory()`, mais `module.enableCompileCache()` n'affecte que le processus courant et ne remplit pas `NODE_COMPILE_CACHE`. L'enfant ACP démarre donc sans le cache, sauf si l'opérateur a défini cette variable d'environnement avant de lancer Qwen Code.

C'est le candidat compile-cache orthogonal enregistré dans #7264. Il ne réduit pas le graphe de modules eager ; il réutilise le cache de code V8 pour le graphe qui subsiste après le travail de chargement différé.

## Objectifs

- Permettre aux descendants ACP de production de réutiliser le répertoire de compile-cache déjà activé par le wrapper d'entrée du démon.
- Préserver un `NODE_COMPILE_CACHE` fourni par l'opérateur.
- Préserver `NODE_DISABLE_COMPILE_CACHE=1`.
- Garder les échecs de cache comme un échec d'optimisation silencieux plutôt qu'un échec d'application.
- Éviter de modifier le bridge ACP, la configuration ou le cycle de vie des sessions.

## Non-objectifs

- Ne pas introduire d'emplacement de cache, de politique d'éviction ou de commande de nettoyage spécifiques à Qwen.
- Ne pas forcer la prise en charge du compile-cache sur les versions de Node où l'API JavaScript est indisponible.
- Ne pas vider le cache depuis le démon ou le cycle de vie ACP.
- Ne pas modifier globalement les environnements de test ou de couverture.

## Topologie de démarrage

Le chemin du démon de production est :

1. `cli-entry.js serve`
2. `module.enableCompileCache()` dans le processus du démon
3. import en processus du CLI embarqué
4. `createSpawnChannelFactory()` copie `process.env`
5. un nouveau processus Node lit `NODE_COMPILE_CACHE` pendant le démarrage
6. l'enfant exécute l'entrée CLI sélectionnée avec `--acp` (`cli.js` par défaut, ou `QWEN_CLI_ENTRY` lorsqu'il est explicitement configuré)

Aujourd'hui, l'étape 2 ne bénéficie qu'au démon. L'environnement copié à l'étape 4 n'a pas de répertoire de compile-cache, donc l'enfant des étapes 5 et 6 n'y opte pas.

## Changement proposé

Capturer le résultat de l'appel `module.enableCompileCache()` existant. Lorsqu'il signale un cache nouvellement activé, expose un répertoire et que l'opérateur n'a pas fourni `NODE_COMPILE_CACHE`, publier ce répertoire dans `process.env`. La construction des processus enfants copie déjà l'environnement, donc aucun changement de la couche ACP n'est nécessaire.

Ne pas écraser une valeur d'environnement existante. Lorsque Node a activé le cache depuis une variable d'environnement préexistante, il signale un état déjà activé et le répertoire de base d'origine doit rester intact. Le remplacer par `getCompileCacheDir()` ou le résultat déjà activé peut créer un répertoire de version imbriqué chez les descendants.

Ne pas synthétiser de répertoire lorsque l'activation échoue, est désactivée ou que l'API est indisponible. Ces cas conservent le comportement actuel.

## Alternatives considérées

### Définir la variable d'environnement dans `spawnChannel`

Rejeté. La propriété du compile-cache est un comportement d'entrée global au processus, tandis que `spawnChannel` est une infrastructure ACP partagée utilisée par les hôtes embarqués. Y déplacer la politique élargit la surface architecturale et duplique le comportement de bootstrap de Node.

### Définir un cache versionné Qwen sous `QWEN_HOME`

Rejeté. Node sépare déjà les versions de Node incompatibles et indexe les entrées par contenu de module. Node recommande son défaut de répertoire temporaire pour éviter d'accumuler du cache obsolète. Un cache persistant spécifique à Qwen nécessiterait une nouvelle politique de nettoyage, de permissions et de cycle de vie sans preuve qu'il améliore le chemin mesuré.

### Exporter `getCompileCacheDir()` inconditionnellement

Rejeté. Lorsque le cache a été activé depuis une variable d'environnement existante, le répertoire signalé est déjà spécifique à la version de Node. Le réutiliser comme base du processus suivant crée un autre répertoire de version imbriqué et empêche le partage prévu.

## Comportement en échec et compatibilité

- Node sans `enableCompileCache()` : aucune mutation d'environnement ni changement de comportement.
- `NODE_DISABLE_COMPILE_CACHE=1` : Node signale désactivé ; aucun répertoire n'est propagé.
- `NODE_COMPILE_CACHE` fourni par l'opérateur : préservé tel quel et hérité normalement.
- Répertoire de cache non inscriptible ou autrement invalide : Node signale l'échec sans lever d'exception ; Qwen Code continue sans cache.
- Mise à niveau de Node ou de Qwen : Node isole les versions de runtime incompatibles et les changements de contenu source produisent des entrées de cache différentes.
- Couverture : le chemin rapide de production est le seul point de mutation. Les runners de tests unitaires n'optent pas globalement pour le cache de compilation.
- Arrêt : Node écrit le cache de code accumulé lors de la sortie normale du processus. Une terminaison forcée peut perdre des entrées nouvellement générées mais ne peut pas affecter la correction.

## Vérification

La faisabilité est soumise à gate avant l'implémentation en utilisant un bundle de release identique pour les deux variantes. Les deux variantes du démon reçoivent le même cache chaud du processus parent. Le témoin supprime l'environnement de cache avant d'importer le bundle, de sorte que les descendants ACP restent sans cache ; le candidat publie le même répertoire de base avant l'import, de sorte que les descendants ACP l'héritent.

La gate sur l'hôte de référence 2-vCPU couvre :

- 30 démarrages à froid du démon appariés et alternés
- 30 démarrages préchauffés appariés et alternés
- `channel.initialize`, process-to-first-session, la disponibilité du listener et le RSS de pointe
- une seconde session chaude
- des premières sessions concurrentes
- la télémétrie activée et désactivée
- le comportement legacy à session unique
- la première utilisation à cache vide, la réutilisation à cache chaud, l'empreinte du cache et les processus résiduels

L'implémentation ne progresse que si la comparaison du cache chaud spécifique à l'enfant montre un bénéfice répétable d'initialisation ou de process-to-session sans régression fonctionnelle.

## Résultats de validation

La gate s'est exécutée sur un hôte Linux x64 2-vCPU et 4 Go avec Node.js 22.23.1. Le témoin et le candidat utilisaient le même bundle de `77af061e` et ne différaient que par l'héritage ou non du répertoire de compile-cache parent par l'enfant ACP.

Sur 30 exécutions appariées à cache chaud, le candidat a gagné chaque comparaison de `channel.initialize`. Son amélioration médiane appariée était de 176,6 ms, avec un intervalle de confiance à 95 % par bootstrap de 167,7 à 186,2 ms. L'amélioration médiane appariée de process-to-first-session était de 199,0 ms, avec un intervalle de confiance à 95 % de 177,6 à 226,5 ms. Le RSS de pointe médian de l'arbre de processus du candidat était supérieur de 8,6 Mo.

Une confirmation supplémentaire sur 10 paires a utilisé l'entrée de production non modifiée d'`origin/main` comme témoin et l'entrée de production patchée comme candidat. Elle a reproduit une amélioration médiane de 181,6 ms de `channel.initialize` et une amélioration médiane de 189,4 ms de process-to-first-session.

Sur 20 paires indépendantes à cache vide, la première exécution process-to-session était plus lente de 117,2 ms en médiane, avec un intervalle de confiance à 95 % de 69,3 à 130,9 ms. Le second démarrage ACP récupère donc le coût de génération unique sous la charge de travail mesurée. Le cache stable contenait 362 fichiers et utilisait 9,4 Mo.

Toutes les exécutions mesurées se sont terminées avec succès sans processus résiduels. Le candidat a également passé la création de première session concurrente, le démarrage avec télémétrie désactivée et le comportement legacy à session unique.
