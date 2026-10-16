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

Chaque outil déclaré au modèle ajoute son schéma à chaque requête. Désactiver des fonctionnalités optionnelles avec des outils résidents volumineux peut donc économiser des tokens de requête. Les outils deferred contribuent à la place de courtes entrées de catalogue et le coût d'une découverte ou invocation ultérieure. Désactiver une fonctionnalité supprime aussi ses outils des sous-agents, ce que le levier suivant ne fait pas toujours.

### 2. Limitez la surface d'outils eager à ce que vous utilisez réellement

`tools.eager` est une allowlist d'outils intégrés dont les schémas restent dans la requête initiale. Tout le reste devient **deferred** : toujours enregistré, toujours listé dans `/tools`, toujours appelable — le modèle y accède via le bridge `tool_search` → `tool_call` lorsqu'il s'avère en avoir besoin.

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

- **Ce n'est pas une désactivation.** Un outil rétrogradé reste accessible. Si vous vouliez supprimer un outil, utilisez une règle `permissions.deny` sur l'outil entier ou `tools.disabled`.
- **Certains outils sont exemptés** et conservent leur comportement de chargement normal quelle que soit la liste : `tool_search` et `tool_call` (les deux moitiés du bridge qui atteint un outil retenu), `structured_output`, les outils du cycle de vie du mode plan (`enter_plan_mode`, `exit_plan_mode`, `ask_user_question`), `task_stop`, les outils MCP (`mcp__*`) et les outils Computer Use (`computer_use__*`). `task_stop` et la famille Computer Use sont à la demande par défaut, donc les restreindre n'économiserait rien ; les outils MCP sont régis par `tools.toolSearch.*` et les filtres par serveur `includeTools` / `excludeTools` ; et rien dans `tools.eager` ne peut retirer l'un des autres : il faut une règle `permissions.deny` sur l'outil entier, une entrée `tools.disabled` ou `--exclude-tools` — et pour la paire du bridge, `tools.toolSearch.enabled: false` supprime les deux moitiés d'un coup. Retirer une moitié du bridge n'est pas une sortie neutre de l'allowlist : chaque outil deferred ordinaire (tous les outils MCP, la famille Computer Use deferred) est alors déclaré de force dans chaque requête, tandis qu'un outil retenu n'est pas proposé au modèle et ne peut pas être rechargé via le bridge — il reste enregistré, donc un appel direct par nom passe toujours par l'approbation normale.
- **`permissions.allow` n'économise rien.** C'est de l'auto-approbation pure : cela ne rétrograde, ne cache ni ne supprime jamais un outil. Les modes d'approbation non plus.
- **Il faut les deux moitiés du bridge.** Un outil retenu est examiné avec `tool_search` et invoqué via `tool_call` ; `tool_search` seul peut lire un schéma qu'il ne peut pas appeler. Si l'un des deux n'est pas enregistré — `tools.toolSearch.enabled: false` les refuse tous les deux ; une règle deny sur `tool_search`/`tool_call`, une entrée `--exclude-tools` ou une entrée `tools.disabled` en supprime un — l'allowlist retient toujours les schémas, rien ne peut les recharger, et les outils rétrogradés ne sont pas proposés au modèle pour cette session (un avertissement est journalisé) ; ils restent enregistrés, donc un appel direct par nom passe toujours par l'approbation normale. Les outils deferred ordinaires font fallback pour être déclarés eager dans ce cas ; les outils que vous avez rétrogradés avec `tools.eager` non.

`tools.visible` est la trappe de sortie pour un outil que vous voulez déclarer d'emblée même s'il est deferred par défaut.

La coordination Agent et Goal (`agent`, `list_agents`, `get_goal`, `update_goal` et `propose_goal`) est deferred par défaut ; aucune configuration `tools.eager` n'est nécessaire. Le modèle voit de courtes entrées de découverte au lieu des schémas complets. Leur première utilisation nécessite une découverte via le bridge, donc comparez le coût global de la tâche et la réussite de la délégation/complétion de Goal ainsi que la première requête. Ce sont des outils deferred ordinaires : `tools.visible`, le préchargement et le fallback eager de bridge incomplet décrit ci-dessus s'appliquent toujours. Le préchargement est tout ou rien sur l'ensemble du pool de candidats deferred, et ces cinq déclarations sont volumineuses, donc un `tools.toolSearch.threshold` qui révélait auparavant tous les outils deferred au démarrage de la session peut maintenant n'en révéler aucun. Reprenez une lecture `/context` après avoir modifié l'un ou l'autre.

### 3. Déplacez les conseils contextuels des fichiers de contexte vers les skills

Un fichier de contexte est concaténé dans chaque requête de chaque session à laquelle il s'applique, sans filtrage de pertinence. Un [skill](./skills.md) n'est listé que par son nom et sa description — dans un échantillon mesuré, 84 skills totalisaient environ 55 tokens chacun en moyenne — et son corps est chargé lors de l'invocation ; un skill [filtré par `paths:`](./skills.md#optional-gate-a-skill-on-file-paths-paths) n'est même pas listé tant qu'un fichier correspondant n'est pas touché.

Ne gardez dans un fichier de contexte que ce qui est toujours vrai — identité, vocabulaire, contrainte forte — et mettez « pour faire X, faites Y » dans un skill ou une [règle filtrée par `paths:`](./rules.md). `/context detail` nomme chaque fichier de contexte, et pour le fichier d'une [extension](../extension/getting-started-extensions.md), il nomme l'extension qui le possède.

### 4. Le prompt système, en dernier

Le prompt de base est déjà le plus petit des catégories résidentes, et environ un tiers est du texte de sécurité et de permissions qui ne doit pas être modifié. Son guidage sur les outils filtrés suit l'ensemble déclaré, avec une exception pour Agent accessible par le bridge ; les autres outils nommés par ces entrées ont encore besoin de déclarations. Réduire votre surface d'outils peut donc réduire également ce guidage. Le remplacer entièrement avec `--system-prompt` est possible et c'est le changement le plus risqué de cette page ; si vous le faites, faites un diff du prompt amont à chaque mise à jour.

## Pièges

- **Les sous-agents récupèrent aussi les outils deferred.** Un sous-agent qui ne déclare pas de liste d'outils explicite reçoit le schéma de chaque outil enregistré, deferred inclus, et ne passe pas par ToolSearch. `tools.eager` et `permissions.deny` sont les seuls knobs qui l'atteignent ; pas le seuil de préchargement.
- **Les agents de mémoire en arrière-plan ont besoin de leurs listes d'outils complètes, et les deux listes diffèrent.** Le worker Dream de projet a besoin de six outils (`read_file`, `grep_search`, `glob`, `run_shell_command`, `write_file`, `edit`) ; l'extraction automatique en a besoin de cinq — le même ensemble sans `run_shell_command`, qu'elle refuse par conception. Refuser un outil que l'un des deux agents détient effectivement le dégrade silencieusement au lieu de générer une erreur. Donc ne refusez pas `run_shell_command` globalement juste pour supprimer sa déclaration : Dream en a encore besoin.
- **Les tokens peuvent se déplacer plutôt que disparaître.** Retirez `grep_search` et `glob` et le modèle pourrait se tourner vers `grep` et `find` via le shell, dont la sortie atterrit dans la conversation. Les nouvelles sorties ajoutent des tokens d'entrée lors du premier envoi ; l'historique inchangé qui les contient peut atteindre le cache de préfixe du fournisseur lors des requêtes suivantes. Évaluez un changement par le total des tokens d'entrée par tâche, les entrées cachées et non cachées rapportées par le fournisseur, et la facture réelle, pas seulement par le préfixe.
- **Les sessions reprises renvoient ce dont elles ont besoin.** Un outil rétrogradé qui apparaît dans l'historique d'une session reprise récupère son schéma automatiquement ; un outil refusé non.
- **Atteindre un outil retenu ne réécrit plus le préfixe — mais c'était le cas avant, et les anciens conseils supposent que oui.** La découverte passe par le bridge `tool_search` → `tool_call`, qui laisse la liste d'outils déclarée stable au byte près, donc le préfixe du cache de prompt survit à une découverte en cours de session ; le coût est un aller-retour supplémentaire avant la première utilisation d'un outil retenu. C'est pourquoi `tools.toolSearch.threshold` vaut maintenant `0` par défaut : transporter l'ensemble deferred à chaque tour n'est plus le côté le moins cher du compromis. N'augmentez le seuil que pour récupérer cet aller-retour pour les outils deferred _ordinaires_ (outils MCP et intégrés à la demande) dans une session qui en aura certainement besoin — il ne précharge jamais un outil que vous avez rétrogradé avec `tools.eager` ; ceux-ci restent derrière le bridge à n'importe quel seuil. Le préchargement s'exécute aussi au démarrage de la session, et les serveurs MCP se connectent généralement après, donc un lancement frais ne déclare aucun outil MCP quel que soit le seuil ; ils atteignent le préchargement au prochain démarrage de session (dans le CLI, après `/clear`), ou immédiatement sous `QWEN_CODE_LEGACY_MCP_BLOCKING=1`.
- **Les modèles avec cache de préfixe inversaient ce compromis ; pour les outils deferred, ils ne le font plus.** Pour un modèle dont la remise dépend d'un préfixe inchangé, garder la liste de déclarations identique importait autrefois plus que de la garder petite — c'est pourquoi certains déploiements désactivaient ToolSearch manuellement. Atteindre un outil retenu laisse maintenant cette liste stable au byte près, donc cette raison particulière a expiré — avec une exception, énoncée dans la description de `tool_search` elle-même : un rafraîchissement de l'ensemble d'outils peut encore re-déclarer un outil retenu lorsque l'historique live contient un appel direct vers lui, et cela déplace le préfixe. La stabilité du préfixe plaide toujours contre tout ce qui réécrit le préfixe en cours de session, comme modifier un fichier de contexte entre les tours.
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