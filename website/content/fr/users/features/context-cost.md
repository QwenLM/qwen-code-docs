# Coût du contexte résident

Chaque requête envoyée par une session transporte le même préfixe avant toute conversation : le prompt système, le schéma de chaque outil déclaré, vos fichiers de contexte (`QWEN.md`) et la liste des skills. Vous payez ce préfixe à **chaque tour**, y compris les tours qui se contentent de répondre à une question. Cette page explique comment le mesurer et le réduire.

[Token caching](./token-caching.md) réduit le _prix_ du préfixe. Cette page réduit le _préfixe_. Les deux se composent — un préfixe plus petit coûte aussi moins cher une fois mis en cache.

## Voir ce que vous payez

```
/context detail
```

`/context` affiche la répartition par catégorie ; `detail` ajoute des lignes par élément — chaque outil intégré, chaque outil MCP, chaque fichier de contexte, chaque skill listé — afin que vous puissiez voir quelle entrée unique est la plus coûteuse. Consultez-le au **premier tour** d'une session, où la conversation est encore vide et tout ce que vous voyez est du préfixe.

Les catégories sont ce que `/context` rapporte, plus deux lignes de comptabilité : `startupContext` (le bloc d'environnement envoyé en premier tour utilisateur) et un résiduel explicite pour tout ce que les catégories n'attribuent pas, afin que les parties totalisent toujours le total.

## Utiliser le coût au repos, pas le pourcentage de la fenêtre

Un pourcentage de la fenêtre de contexte n'est pas une cible tenable, car le dénominateur est arbitraire. La même configuration affiche 6,5 % sur un modèle à 1M de contexte et 37 % sur un modèle à 128k — texte identique, coût identique, chiffres radicalement différents. Utilisez plutôt :

> **Coût au repos** — les tokens d'entrée d'une session qui pose une question et n'appelle aucun outil.

Il est indépendant du modèle et de la fenêtre, et vous ne pouvez pas l'améliorer en déplaçant du texte d'un schéma d'outil vers un fichier de contexte. Une deuxième lecture utile est **combien de tours il faut pour que la conversation dépasse le préfixe** : un préfixe qui met 20 tours à s'amortir n'est jamais amorti dans une session de 5 tours.

## Les leviers, par ordre de rendement

### 1. Désactivez les fonctionnalités que vous n'utilisez pas

Chaque fonctionnalité qui enregistre un outil paye pour le schéma de cet outil à chaque requête. Les plus grosses entrées intégrées appartiennent aux fonctionnalités optionnelles, donc un déploiement qui n'utilise pas les workflows, les objectifs, les tâches planifiées ou les outils de review économise plus en désactivant ces fonctionnalités qu'avec n'importe quelle modification de prompt. Cela supprime aussi l'outil des sous-agents, ce que le levier suivant ne fait pas toujours.

### 2. Limitez la surface d'outils eager à ce que vous utilisez réellement

`tools.eager` est une allowlist d'outils intégrés dont les schémas restent dans la requête initiale. Tout le reste devient **deferred** : toujours enregistré, toujours listé dans `/tools`, toujours appelable — le modèle le charge avec `tool_search` lorsqu'il s'avère en avoir besoin.

```jsonc
{
  "tools": {
    "eager": [
      "read_file",
      "write_file",
      "edit",
      "glob",
      "grep_search",
      "run_shell_command",
      "skill",
    ],
  },
}
```

Quatre choses à savoir avant de l'utiliser :

- **Ce n'est pas une désactivation.** Un outil rétrogradé reste accessible. Si vous vouliez supprimer un outil, utilisez une règle `permissions.deny` globale ou `tools.disabled`.
- **Certains outils sont exemptés** et conservent leur comportement de chargement normal quelle que soit la liste : `tool_search`, `structured_output`, les outils du cycle de vie du mode plan (`enter_plan_mode`, `exit_plan_mode`, `ask_user_question`), `task_stop`, les outils MCP (`mcp__*`) et les outils Computer Use (`computer_use__*`). `task_stop` et la famille Computer Use sont à la demande par défaut, donc les restreindre n'économiserait rien ; les outils MCP sont régis par `tools.toolSearch.*` et les filtres par serveur `includeTools` / `excludeTools`, et la seule façon de retirer l'un des trois premiers est `permissions.deny`.
- **`permissions.allow` n'économise rien.** C'est de l'auto-approbation pure : cela ne rétrograde, ne cache ni ne supprime jamais un outil. Les modes d'approbation non plus.
- **`tool_search` doit rester actif.** Si ToolSearch n'est pas enregistré — `tools.toolSearch.enabled: false`, une règle deny sur `tool_search`, ou l'opt-out automatique pour les modèles DeepSeek — l'allowlist retient toujours les schémas mais rien ne peut les recharger, et les outils rétrogradés sont hors d'atteinte pour cette session.

`tools.visible` est la trappe de sortie pour un outil que vous voulez déclaré d'emblée même s'il est deferred par défaut.

### 3. Déplacez les conseils contextuels des fichiers de contexte vers les skills

Un fichier de contexte est concaténé dans chaque requête de chaque session à laquelle il s'applique, sans filtrage de pertinence. Un [skill](./skills.md) n'est listé que par son nom et sa description — dans un échantillon mesuré, 84 skills totalisaient environ 55 tokens chacun en moyenne — et son corps est chargé lors de l'invocation ; un skill [filtré par `paths:`](./skills.md#optional-gate-a-skill-on-file-paths-paths) n'est même pas listé tant qu'un fichier correspondant n'est pas touché.

Ne gardez dans un fichier de contexte que ce qui est toujours vrai — identité, vocabulaire, contrainte forte — et mettez « pour faire X, faites Y » dans un skill ou une [règle filtrée par `paths:`](./rules.md). `/context detail` nomme chaque fichier de contexte, et pour le fichier d'une [extension](../extension/getting-started-extensions.md), il nomme l'extension qui le possède.

### 4. Le prompt système, en dernier

Le prompt de base est déjà le plus petit des catégories résidentes, et environ un tiers est du texte de sécurité et de permissions qui ne doit pas être modifié. Il ne décrit désormais que les outils réellement déclarés par la session, donc réduire votre surface d'outils le réduit aussi un peu gratuitement. Le remplacer entièrement avec `--system-prompt` est possible et c'est le changement le plus risqué de cette page ; si vous le faites, comparez avec le prompt amont à chaque mise à jour.

## Pièges

- **Les sous-agents récupèrent aussi les outils deferred.** Un sous-agent qui ne déclare pas de liste d'outils explicite reçoit le schéma de chaque outil enregistré, deferred inclus, et ne passe pas par ToolSearch. `tools.eager` et `permissions.deny` sont les seuls knobs qui l'atteignent ; pas le seuil de préchargement.
- **Le sous-agent de mémoire a besoin de six outils** (`read_file`, `grep_search`, `glob`, `run_shell_command`, `write_file`, `edit`). En refuser un le dégrade silencieusement au lieu de générer une erreur.
- **Les tokens peuvent se déplacer plutôt que disparaître.** Retirez `grep_search` et `glob` et le modèle pourrait se tourner vers `grep` et `find` via le shell, dont la sortie atterrit dans la conversation. Les nouvelles sorties ajoutent des tokens d'entrée lors du premier envoi ; l'historique inchangé qui les contient peut atteindre le cache de préfixe du fournisseur lors des requêtes suivantes. Évaluez un changement par le total des tokens d'entrée par tâche, les entrées cachées et non cachées rapportées par le fournisseur, et la facture réelle, pas seulement par le préfixe.
- **Les sessions reprises renvoient ce dont elles ont besoin.** Un outil rétrogradé qui apparaît dans l'historique d'une session reprise récupère son schéma automatiquement ; un outil refusé non.
- **Un outil deferred révélé en cours de session invalide le cache de préfixe.** Les déclarations de fonctions sont tout au début du préfixe, donc une seule révélation le réécrit et l'ensemble du prompt est recalculé pour ce tour. Précharger l'ensemble deferred (`tools.toolSearch.threshold`) évite cela au prix de transporter ces schémas à chaque tour ; `threshold: 0` ne gagne que si la session n'en a genuinely jamais besoin.
- **Les modèles avec cache de préfixe inversent le compromis.** Pour les modèles dont la remise dépend d'un préfixe stable, garder le préfixe identique vaut plus que le rendre petit ; les modèles DeepSeek optent out automatiquement de ToolSearch pour cette raison.
- **Fuites de scope.** Les paramètres s'appliquent à chaque client qui les lit (CLI, Web Shell, serve), donc une surface d'outils par déploiement a besoin de son propre scope de paramètres.

## Vérifier l'économie

1. Notez le coût au repos avant le changement : une session fraîche, une question triviale, `/context` au premier tour.
2. Appliquez un levier à la fois et répétez, en redémarrant la session — la plupart de ces paramètres sont lus au démarrage.
3. Confirmez que la capacité a survécu, sur votre propre jeu de tâches : taux de succès des appels d'outils, fréquence d'appel de `tool_search`, et résultats des tâches. Un outil rétrogradé que le modèle ne pense jamais à chercher ne fait pas de fail loud ; il cesse simplement d'être utilisé.
4. Vérifiez la facture, pas seulement le préfixe — voir le piège sur les tokens qui migrent dans la conversation.

## Voir aussi

- [Token Caching](./token-caching.md) — ce que la mise en cache fait au prix de ce qui reste.
- [Rules](./rules.md) — contexte conditionnel par `paths:`, y compris ce qu'une extension peut contribuer.
- [Skills](./skills.md) — divulgation progressive et filtrage par `paths:`.
- [Settings reference](../configuration/settings.md) — la sémantique exacte de `tools.eager`, `tools.visible`, `tools.disabled`, `tools.toolSearch.*`, `permissions.deny`.