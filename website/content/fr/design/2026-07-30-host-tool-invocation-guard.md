# Garde d'invocation d'outil de l'hôte

## Statut

Design préliminaire pour l'issue [#8102](https://github.com/QwenLM/qwen-code/issues/8102)
et la PR [#8032](https://github.com/QwenLM/qwen-code/pull/8032).

## Problème

Un hôte d'intégration dans le processus peut évaluer un appel d'outil proposé
par le modèle à travers les permissions et hooks existants, mais ces
vérifications peuvent s'exécuter avant que Qwen Code ait résolu le nom
d'outil canonique ou construit les paramètres d'invocation finaux. Un hôte qui
applique une politique d'organisation ne peut donc pas prouver qu'il a évalué
le même appel que celui qui a atteint `invocation.execute()`.

La primitive manquante est une décision de frontière d'exécution finale sur
l'appel d'outil effectif. L'état de tâche spécifique au produit, les workflows
d'approbation, le stockage de politique et le transport d'audit n'ont pas leur
place dans Qwen Code.

## Objectifs

- Permettre à un hôte dans le processus de fournir une fonction allow/deny via
  `ConfigParameters`.
- Évaluer le nom d'outil canonique et les paramètres d'invocation finaux
  clonés immédiatement avant l'exécution.
- Couvrir l'ordonnanceur du cœur, le runtime de session ACP et les chemins
  d'exécution spéculative.
- Échouer en mode fermé (fail closed) quand une garde configurée refuse, lève
  une exception, retourne une décision malformée ou ne peut pas recevoir les
  arguments clonés.
- Préserver le chemin d'exécution existant quand aucune garde n'est
  configurée.
- Empêcher l'exécution si une annulation survient avant ou pendant l'attente
  de la garde.

## Non-objectifs

- Pas de flag CLI, de clé de réglage, de variable d'environnement, de route du
  démon, de client réseau ou de transport de politique externe.
- Pas de tâche, de plan, d'octroi, d'autorisation métier ou de schéma d'audit.
- Pas de changement de sémantique des permissions, hooks, sandbox ou modes
  d'approbation.
- Pas d'affirmation que la planification du modèle ou les implémentations
  d'outils deviennent déterministes.
- Pas de callback de résultat ni de protocole parallèle de résultat d'outil.
- Pas d'interception d'un consommateur SDK qui appelle manuellement
  `ToolInvocation.execute()` ou `Tool.buildAndExecute()` en dehors d'un
  runtime possédé par Config.

## Contrat

L'hôte fournit un `ToolInvocationGuard` dans `ConfigParameters`. La garde
reçoit :

- l'identifiant de corrélation d'appel d'outil accepté par le runtime ;
- le nom d'outil canonique ;
- un clone structuré des paramètres d'invocation finaux ; et
- le signal d'abandon de l'invocation.

La décision est soit `{ allowed: true }`, soit `{ allowed: false, reason? }`.
Une raison de refus manquante ou vide utilise un message générique stable. Les
exceptions, décisions malformées et échecs de clonage utilisent un message
d'échec stable séparé et refusent l'exécution. Une raison de refus fournie est
visible par l'utilisateur et peut entrer dans les surfaces existantes de
résultat d'outil et de télémétrie ; elle ne doit donc pas contenir de secrets
ni d'erreurs brutes de provider.

Les arguments clonés empêchent une garde de modifier l'invocation que Qwen
Code exécutera. Le contrat ne rend pas secrets les arguments d'outil
arbitraires ; un hôte d'intégration doit les traiter comme des données
applicatives sensibles.

L'identifiant d'appel d'outil peut provenir d'une réponse du modèle. Il est
utile pour corréler la décision de la garde avec les événements de cycle de
vie existants, mais ce n'est ni un sujet authentifié ni une clé d'idempotence
autonome. Un hôte managé qui a besoin d'une identité forte doit le lier à une
identité de session et de prompt possédée par l'hôte.

## Placement de l'exécution

L'ordonnanceur du cœur évalue la garde après la construction de l'outil, la
gestion des permissions, la normalisation des chemins et `PreToolUse`, mais
avant que l'appel passe à `executing` et avant `invocation.execute()`.

La session ACP évalue le même contrat après la construction de l'outil, la
gestion des permissions et `PreToolUse`, mais avant son chemin direct
`invocation.execute()`.

Le moteur de spéculation expérimental exécute aussi les invocations
directement au lieu d'utiliser l'ordonnanceur du cœur. Il évalue la même garde
après la construction de l'invocation et convertit un refus ou une annulation
en frontière de spéculation avec zéro appel d'exécuteur. Un futur mode de
provider externe managé doit désactiver l'apply spéculatif car copier un
overlay dans le système de fichiers réel est une frontière d'effet séparée, en
dehors de `invocation.execute()`.

Les trois chemins utilisent les paramètres d'invocation construits plutôt que
les arguments de brouillon fournis par le modèle. Dans les chemins du cœur et
ACP, un refus produit zéro appel d'exécuteur et un résultat d'outil structuré
`execution_denied`.

Tout futur runtime possédé par Config qui exécute directement un
`ToolInvocation` doit évaluer la même garde ou passer par un ordonnanceur déjà
gardé. C'est un invariant de revue de code, pas une affirmation que des
appelants externes arbitraires peuvent être interceptés.

Deux points d'appel de dispatch d'agent — le slash command `/fork` et le
gestionnaire de fork d'agent ACP — construisent et exécutent directement une
invocation d'outil agent sans consulter la garde. Le sous-agent lancé partage
le `Config` de l'appelant, donc chaque outil que le sous-agent appelle
lui-même est gardé ; seul l'appel de dispatch lui-même n'est pas gardé. Un
changement futur pourra étendre la garde à ces points d'appel.

## Compatibilité par défaut désactivé

Qwen Code ne renseigne pas `toolInvocationGuard` dans son bootstrap CLI ou
démon. Le champ est uniquement une API d'intégration dans le processus.

Chaque chemin d'exécution lit le callback optionnel et n'entre dans
l'évaluateur asynchrone que si le callback existe. En son absence, Qwen Code
n'effectue aucune allocation de promesse de garde, aucun clonage d'arguments,
aucun appel de provider, aucune annonce de capacité ni aucun yield asynchrone
supplémentaire. Les déploiements CLI et démon existants conservent donc leur
chemin d'exécution antérieur.

Le setter de production intentionnellement absent dans le dépôt signifie que
ce changement nécessite un accord des maintainers sur la couture
d'intégration publique avant le merge. Un futur changement de provider externe
doit rester une PR séparée et ne peut pas être considéré comme inclus dans
l'approbation de cette PR.

## Sémantique d'annulation et d'échec

L'évaluateur vérifie l'annulation à la fois avant d'invoquer la garde et après
que sa promesse est réglée. Chaque chemin d'exécution vérifie aussi son signal
actif immédiatement après l'await et avant tout appel d'exécuteur.

- annulation avant l'évaluation : ne pas appeler la garde ni l'exécuteur ;
- annulation pendant l'attente d'une garde : enregistrer l'annulation et ne
  pas appeler l'exécuteur ;
- refus explicite : enregistrer `execution_denied` et ne pas appeler
  l'exécuteur ;
- exception de garde, réponse malformée ou échec de clonage : échouer en mode
  fermé et ne pas appeler l'exécuteur.

Il n'y a pas de retry automatique. Le callback de garde possède toute
politique de retry spécifique au provider, mais un hôte d'intégration ne doit
pas retenter ni exécuter un effet de bord ambigu via cette API.

## Preuves

Les tests unitaires et d'intégration couvrent :

- les décisions allow et deny configurées ;
- la raison de refus par défaut ;
- l'exception de garde, la réponse malformée et l'échec de clonage ;
- l'isolation de mutation des arguments ;
- l'annulation avant et pendant l'évaluation de la garde ;
- les arguments finaux normalisés dans les chemins du cœur et ACP ;
- l'exécution spéculative s'arrête à une frontière en cas de refus ;
- zéro appel d'exécuteur en cas de refus et d'annulation ;
- la parité d'`execution_denied` entre les enregistrements de résultat d'outil
  du cœur et d'ACP ; et
- l'exécution existante non configurée à travers les suites environnantes de
  l'ordonnanceur et d'ACP.

Aucun plan E2E n'est requis pour cette PR car elle n'ajoute aucun comportement
activable par l'utilisateur via CLI, réglage, route du démon ou autre. Le CI
multiplateforme reste requis avant le merge.

## Frontière de suivi

Un futur provider de politique externe pourra étendre le contexte avec une
identité de session et de prompt fiable possédée par le runtime et adapter le
callback dans le processus à travers la frontière de `qwen serve` vers
l'enfant ACP. Ce suivi doit être désactivé par défaut, revu indépendamment,
et prouver qu'un CLI et un démon non configurés n'initialisent pas de provider
ni ne modifient l'environnement de leur processus enfant.

L'observation des résultats doit réutiliser les événements structurés de cycle
de vie d'outil existants, à moins qu'une issue séparée démontre un manque de
corrélation concret. L'orchestration et la politique spécifiques au produit
restent en dehors de Qwen Code.
