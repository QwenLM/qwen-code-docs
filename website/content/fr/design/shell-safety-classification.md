# Classification de sécurité du shell

## Contexte et périmètre

L'issue [#6949](https://github.com/QwenLM/qwen-code/issues/6949) exige que le mode Plan distingue les commandes dont le caractère lecture seule est prouvé des commandes dont le comportement ne peut pas être établi statiquement. Un booléen ne peut pas conserver cette distinction, donc ce changement introduit une couche de faits à trois états dans `shellAstParser.ts` sans modifier le routage des permissions.

Ce changement ne modifie ni le routage ni la logique des sites d'appel dans Shell, Monitor, PermissionManager, la spéculation, les agents à portée mémoire, ACP, les prompts du mode Plan ou le comportement de sortie de Plan. Les consommateurs booléens existants peuvent devenir plus conservateurs là où le classifieur est renforcé. Un changement ultérieur pourra router les commandes `unknown` vers une approbation à usage unique en utilisant le nouveau fait, sans modifier ce classifieur.

## Contrat

`classifyShellCommandSafety(command)` est une API de module interne avec ces résultats :

| Résultat    | Signification                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `read-only` | Chaque chemin exécutable est prouvé par les règles actuelles comme ne modifiant ni l'état persistant ni l'état externe.          |
| `write`     | La syntaxe contient une preuve positive d'une mutation de fichier, Git, processus ou autre état. La commande n'a pas besoin de réussir in fine. |
| `unknown`   | La commande ne peut pas être prouvée sûre ou mutante par les règles statiques prises en charge.                                  |

Pour un AST valide, les résultats se combinent dans l'ordre `write > unknown > read-only`. Un arbre contenant `ERROR` est classé `unknown` avant l'évaluation de la syntaxe partielle. Les substitutions de commande et de processus imposent un plancher `unknown` pendant que leur contenu exécutable est analysé, de sorte qu'un writer connu imbriqué promeut le résultat en `write`. L'analyse des redirections possède les substitutions à l'intérieur des nœuds de redirection tandis que les évaluateurs de commande et d'instruction excluent ces nœuds de leurs scans de substitution, évitant le parcours répété des substitutions imbriquées. Le flot de contrôle utilise le même plancher unknown et scanne les branches possibles. Une définition de fonction n'est pas une exécution et reste donc `unknown` sans classifier son corps comme une écriture exécutée.

Une affectation pure autonome et `cd` conservent le comportement de compatibilité existant. Une affectation qui préfixe une commande ou partage une séquence composée avec une autre instruction impose un plancher `unknown`, car des variables comme `LD_PRELOAD`, `PATH`, `PAGER` ou une configuration spécifique à un outil peuvent changer le comportement ; une preuve d'écriture explicite gagne toujours. Les sous-shells et groupes de commandes agrègent leur contenu exécuté. L'API analyse uniquement la chaîne source fournie ; elle ne déplie pas `sudo` ni les interpréteurs, ne résout ni PATH ni les alias, et ne charge pas la configuration du shell.

## Échec du parseur et API de compatibilité

Le classifieur privé peut lever une exception lors du chargement ou de l'exécution de tree-sitter. L'API publique à trois états mappe ces échecs vers `unknown` et ne substitue jamais une certitude par regex. Un parseur qui lève une exception pendant le parsing est jeté et reconstruit à partir du langage Bash déjà chargé, car l'instance en échec peut rester empoisonnée ; cela ne recharge ni le runtime ni le langage. L'API de compatibilité existante `isShellCommandReadOnlyAST()` renvoie `true` uniquement pour `read-only`, mais conserve le fallback regex existant lorsque tree-sitter ne peut pas se charger ou lève une exception à l'exécution. Un arbre syntaxiquement invalide est un résultat `unknown` normal, pas un échec de parseur, donc il n'entre jamais dans ce fallback. Chaque arbre renvoyé avec succès est libéré une fois dans un bloc `finally`.

Cette asymétrie est intentionnelle : les nouveaux consommateurs ont besoin d'un fait d'incertitude honnête, tandis que les consommateurs booléens existants conservent leur comportement de disponibilité du parseur jusqu'à ce qu'ils migrent explicitement.

## Preuves prises en charge

Le classifieur reconnaît un ensemble borné, sensible à la casse, de writers de système de fichiers directs, de commandes de signalisation de processus, de redirections de sortie, de familles de mutations Git, et de modes d'écriture explicites dans `find`, `sed`, `awk`, `sort`, `tree`, `uniq`, `tee` et `dd`. Sed et AWK utilisent des scanners linéaires partagés qui distinguent les programmes inline des valeurs d'option et des arguments de fichier, de sorte qu'une entrée échappée, malformée ou fortement répétitive ne peut pas déclencher de backtracking de regex ni fabriquer une preuve d'écriture à partir d'un nom de fichier. Les fichiers de sortie Git pour `diff`, `log` et `show` sont des écritures. Les formes `printf -v` avec état sont unknown. Les helpers Git explicites et la vérification de signature, y compris les options d'environnement pager/config, les helpers de diff/conversion de texte, le pager externe de grep et les espaces réservés de signature, sont unknown ; les options globales Git non prises en charge et les chemins d'aide des sous-commandes échouent également en fail closed car l'aide peut lancer un visionneur externe. L'exécution dynamique, les scripts externes, les cibles de sortie ambiguës, les interpréteurs et wrappers, `sort --compress-program`, les préprocesseurs ripgrep, les helpers de nom d'hôte et la recherche d'archives (`--pre`, `--hostname-bin`, `--search-zip` et `-z`), ainsi que les commandes pager ordinaires restent `unknown`. Les terminateurs d'options et l'arité des valeurs des options prises en charge sont interprétés afin qu'un nom de fichier ou un message littéralement nommé `--help` ne soit pas confondu avec une invocation d'aide. Les noms de commande avec des casses différentes, les gestionnaires de paquets non listés, les services et les exécutables personnalisés restent également `unknown` ; le classifieur n'est pas un sandbox.

Le vérificateur synchrone déprécié reflète chaque motif nouvellement rejeté requis par la planification synchrone. Il préserve les expansions de paramètres avec des sentinelles au lieu de laisser `shell-quote` les effacer, rejette les pipelines finaux malformés et les composés portant des affectations, et évalue les wrappers à partir de la commande d'origine. Il reste intentionnellement booléen et est plus conservateur que le classifieur AST : `printf`, `sort` riche en options, `tree`, `uniq`, `rg` et les commandes `ripgrep`, ainsi que les formes de branche Git au-delà des modes de listing les plus simples, s'exécutent séquentiellement.

## Consommateurs et frontière de migration

Les consommateurs booléens actuels sont Shell, Monitor, PermissionManager, le gate de spéculation et la configuration des agents à portée mémoire ; leurs sites d'appel ne changent pas dans ce refactoring. Le vérificateur synchrone est également utilisé par le planificateur d'outils du core et l'utilitaire legacy de permission shell. Le planificateur passe désormais la commande d'origine au vérificateur afin que les wrappers restent unknown au lieu d'être dépliés en une commande apparemment en lecture seule. `extractCommandRules()` reste indépendant de la classification de sécurité.

Le changement ultérieur `fix(core): Route unknown Plan shell commands to one-off approval` ne doit consommer `classifyShellCommandSafety()` qu'à la frontière de permission de Plan. Il doit définir séparément la provenance de l'approbation, sa durée de vie, le comportement ACP et l'interaction avec la sortie de Plan ; ces politiques n'appartiennent pas à la couche de faits.

## Référence Claude Code

L'analyse Bash de Claude Code est utile comme preuve de deux principes de design : l'incertitude de parsing doit être représentée explicitement, et les décisions de permission doivent échouer en fail closed lorsque le parsing est indisponible ou trop complexe. Son parseur Bash et son moteur de politique plus volumineux ne sont pas copiés car Qwen Code n'a besoin que d'un petit classifieur à la frontière actuelle.

## Vérification

La couverture unitaire utilise des matrices pilotées par des tables pour les trois états, la précédence composée, les substitutions, les erreurs de syntaxe, l'initialisation du parseur et les échecs à l'exécution, le comportement borné pour les entrées imbriquées et échappées adverses, et la monotonie de compatibilité. Les tests du vérificateur synchrone et du planificateur empêchent des commandes nouvellement connues comme non sûres de rejoindre des lots Shell concurrents.
