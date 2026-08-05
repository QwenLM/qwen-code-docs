# Profileur de démarrage de session

## Résumé

Cette modification ajoute un profileur interne et optionnel pour `GeminiClient.startChat()`, afin que le travail de suivi de #6312 puisse identifier les points chauds restants de l'initialisation par session avant de choisir une optimisation.

Cela ne modifie pas le comportement des sessions, les champs de protocole publics, le comportement du SDK, les flags CLI, le schéma de configuration, le schéma de télémétrie, ni la sémantique du profileur de démarrage.

## Structure des mesures

Le profileur est activé uniquement lorsque `QWEN_CODE_PROFILE_SESSION_START=1`.

Lorsqu'il est activé, le core écrit des enregistrements JSONL sous `Storage.getRuntimeBaseDir()/session-start-perf/`. Les noms de fichiers JSONL quotidiens utilisent la date UTC de l'horodatage de l'enregistrement. Chaque enregistrement inclut un horodatage, `SessionStartSource`, un indicateur de succès, la durée totale, les durées limitées des étapes, et de petits compteurs agrégés tels que la longueur de l'historique et le nombre de snapshots rendus. Le suivi du profilage du démon #4748 ajoute un Session ID opaque optionnel lorsque l'appelant en fournit un, afin que cet enregistrement détaillé puisse être joint à la trace inter-processus.

Les étapes mesurées suivent la séquence existante de `startChat()` : préchauffage du registre des outils, scan de révélation des outils différés repris, configuration des rappels différés, construction de l'historique de chat initial, amorçage de la déduplication des rappels de skill, amorçage de la déduplication des rappels d'agent, construction de l'instruction système, instanciation de `GeminiChat`, réparation des tool-use orphelins, hook SessionStart, application optionnelle du contexte SessionStart, et `setTools()`.

## Périmètre de sécurité

La sortie exclut intentionnellement les prompts, les réponses du modèle, la sortie des hooks, les noms des outils, les chemins de fichiers et les répertoires de travail. Son seul identifiant optionnel est le Session ID opaque utilisé pour corréler un enregistrement opt-in avec la télémétrie du démon ; il n'ajoute aucune identité d'utilisateur, de tenant ou de workspace. Les noms des étapes sont des chaînes statiques appartenant au code.

Toutes les écritures du profileur sont effectuées en best-effort. Les erreurs du système de fichiers sont silencieusement ignorées afin que le profilage ne puisse pas interrompre ou ralentir une session via la gestion des erreurs.

Le writer JSONL utilise des permissions restrictives et `O_NOFOLLOW` sur le fichier de profil. Le remplacement du répertoire parent reste en best-effort car Node n'expose pas de chemin d'ajout relatif au fd portable ici ; le répertoire d'exécution est traité comme un stockage de diagnostic pour le même utilisateur, et non comme une limite contre un attaquant local du même utilisateur.

Lorsqu'il est désactivé, le helper n'effectue aucune écriture de fichier et ne lit pas l'horloge haute résolution.

`failedStage` enregistre uniquement les étapes qui lèvent des exceptions via le wrapper du profileur. Les étapes dont les helpers sous-jacents interceptent et suppriment leurs propres erreurs, telles que l'amorçage de la déduplication des rappels d'agent et le hook SessionStart, restent considérées comme réussies du point de vue du profileur.

## Non-objectifs

Cette modification n'optimise pas `GeminiClient.initialize()` ni `startChat()`.

Elle n'implémente pas la mise en cache des extensions de la partie B, le lazy-loading du corps des skills de la partie C, la mise en cache des snapshots de commandes, ni aucune modification du protocole du daemon.

La prochaine optimisation ne devrait être choisie qu'après avoir collecté les détails des étapes via ce profileur et les avoir comparés avec des fixtures lourdes en extensions ou en skills, le cas échéant.