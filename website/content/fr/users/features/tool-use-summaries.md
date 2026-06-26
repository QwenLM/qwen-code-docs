# Résumés d'utilisation des outils

Qwen Code peut générer une courte étiquette dans le style d'un sujet de commit Git après chaque lot d'outils terminé, résumant ce que le lot a accompli. L'étiquette apparaît en ligne dans le transcript et remplace l'en-tête générique `Tool × N` en mode compact.

C'est une aide UX pour les appels d'outils parallèles : lorsque le modèle se déploie en plusieurs appels `Read` + `Grep` + `Bash` en même temps, le résumé vous indique l'intention en un coup d'œil au lieu de vous obliger à parcourir la liste des outils.

La fonctionnalité est activée par défaut et s'exécute silencieusement en arrière-plan. Elle nécessite un [modèle rapide](./followup-suggestions#fast-model) configuré.

## Ce que vous voyez

### Mode complet (par défaut)

Le résumé apparaît sous forme d'une ligne de badge atténuée directement sous le groupe d'outils :

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Read 4 text files
```

### Mode compact (`Ctrl+O` ou `ui.compactMode: true`)

L'étiquette remplace l'en-tête générique `Tool × N` dans la ligne unique compacte :

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

Les appels d'outils individuels sont toujours à une touche de distance (`Ctrl+O` pour basculer en mode complet).

## Comment ça fonctionne

Une fois qu'un lot d'outils est finalisé, Qwen Code envoie un appel « fire-and-forget » au modèle rapide configuré avec :

- Les noms des outils, les arguments tronqués et les résultats tronqués (chacun limité à 300 caractères).
- La sortie texte la plus récente de l'assistant (200 premiers caractères) comme préfixe d'intention.
- Une invite système demandant au modèle de renvoyer une étiquette au passé, de 30 caractères, dans le style d'un sujet de commit Git.

L'appel s'exécute en parallèle avec le streaming API du tour suivant, de sorte que sa latence d'environ 1 seconde est masquée derrière la réponse du modèle principal.

Lorsque l'étiquette est résolue, elle est ajoutée au transcript en tant qu'entrée `tool_use_summary`.

Exemples d'étiquettes : `Searched in auth/`, `Fixed NPE in UserService`, `Created signup endpoint`, `Read config.json`, `Ran failing tests`.

## Quand cela apparaît

Le résumé est généré lorsque **toutes** les conditions suivantes sont remplies :

- `experimental.emitToolUseSummaries` est `true` (par défaut).
- Un `fastModel` est configuré (via les paramètres ou `/model --fast`).
- Au moins un outil du lot est terminé.
- Le tour n'a pas été interrompu avant la fin de l'outil.
- Le modèle rapide a renvoyé une réponse non vide et sans erreur.

Les appels d'outils des sous-agents ne déclenchent pas la génération de résumé — seuls les lots d'outils de la session principale le font.

## Quand cela n'apparaît pas

Le résumé est silencieusement ignoré (pas d'erreur, pas de changement dans l'interface) lorsque :

- Aucun modèle rapide n'est configuré.
- L'appel au modèle rapide échoue, expire ou renvoie une réponse vide.
- Le modèle a renvoyé une chaîne ressemblant à un message d'erreur évident (par exemple, `Error: ...`, `I cannot ...`) — filtrée par le client pour que l'interface n'affiche pas d'étiquettes trompeuses.
- Le tour a été interrompu (`Ctrl+C`) avant la fin du modèle.

Dans tous ces cas, le groupe d'outils s'affiche comme d'habitude.

## Modèle rapide

L'étiquette est générée à l'aide du [modèle rapide](./followup-suggestions#fast-model) — le même modèle que vous configurez pour les suggestions d'invite et l'exécution spéculative.

Configurez-le via :

### Via la commande

```
/model --fast qwen3-coder-flash
```

### Via `settings.json`

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Lorsqu'aucun modèle rapide n'est configuré, la génération de résumé est complètement ignorée — la fonctionnalité n'a aucun effet jusqu'à ce que vous en configuriez un.

## Configuration

Ces paramètres peuvent être configurés dans `settings.json` :

| Paramètre                           | Type    | Valeur par défaut | Description                                                                                        |
| ----------------------------------- | ------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries` | boolean | `true`            | Interrupteur principal pour la génération de résumé. Désactivez-le pour supprimer l'appel supplémentaire au modèle rapide. |
| `fastModel`                         | string  | `""`              | Modèle rapide utilisé pour la génération de résumé (partagé avec les suggestions d'invite). Obligatoire ; sans effet si vide. |

### Remplacement par variable d'environnement

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` remplace le paramètre `experimental.emitToolUseSummaries` pour la session en cours :

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` ou `=false` — désactive forcément.
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` ou `=true` — active forcément.
- Non défini — utilise le paramètre `experimental.emitToolUseSummaries`.

### Exemple

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

## Portée et cycle de vie

Trois points qui ont tendance à piéger lors d'une première lecture de cette fonctionnalité :

1. **Une génération par lot, partagée par les deux modes d'affichage.** L'appel au modèle rapide a lieu exactement une fois dans `handleCompletedTools` lorsqu'un lot d'outils se finalise. Basculer avec `Ctrl+O` par la suite ne **déclenche pas** un nouvel appel — les deux modes lisent la même entrée historique `tool_use_summary` qui a été capturée la première fois. Vous pouvez activer et désactiver le mode compact librement sans coût supplémentaire.

2. **Aucun rattrapage lors du basculement ou de la reprise de session.** Un `tool_group` qui s'est terminé avant que la fonctionnalité soit activée (ou avant que vous ayez basculé le paramètre, ou dans une session reprise — `ChatRecordingService` ne persiste pas les entrées de résumé) n'aura jamais d'étiquette. Il n'y a pas de passage de « balayage de l'historique existant ». Si vous activez ce paramètre en cours de session, seuls les lots _futurs_ auront une étiquette ; les groupes plus anciens conservent le rendu par défaut sans indicateur qu'une étiquette manque.

3. **Lots de l'agent principal uniquement.** Le déclencheur se trouve dans la boucle de tour de la session principale (`useGeminiStream`), donc :
   - ✅ Les opérations shell, MCP, fichiers, et l'appel à l'outil `Task` / sous-agent _lui-même_ (tel qu'il apparaît dans le lot principal) sont résumés.
   - ❌ Les lots d'outils **internes** d'un sous-agent (exécutés via `packages/core/src/agents/runtime/`) ne sont pas résumés.
Un lot externe qui _contient_ un outil `Task` sera toujours étiqueté, mais le modèle rapide ne voit que l'appel d'outil du sous-agent et sa sortie agrégée — pas les appels d'outil individuels à l'intérieur du sous-agent. Attendez-vous à des étiquettes comme `Recherche effectuée par l'agent de recherche` ou `Délégation effectuée pour la recherche de fichiers` plutôt que `14 fichiers parcourus`. C'est intentionnel — résumer les internes du sous-agent multiplierait le coût du modèle rapide et ferait remonter du bruit qui n'apparaît jamais dans l'interface primaire.

## Appairage recommandé : activer le mode compact

Pour les lots de 3 appels d'outil parallèles ou plus, associer cette fonctionnalité avec `ui.compactMode: true` produit le transcript le plus épuré. La vue compacte condense l'intégralité du lot en une seule ligne étiquetée (`✓  Fichiers txt lus  · 4 outils`) au lieu d'afficher chaque ligne d'outil plus le résumé final. Les détails restent accessibles via `Ctrl+O`.

```json
{
  "fastModel": "qwen3-coder-flash",
  "ui": {
    "compactMode": true
  },
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

En mode complet (par défaut), le résumé s'affiche sous la forme d'une ligne `● <label>` en dessous du groupe d'outils — utile pour les lots volumineux ou hétérogènes, mais pour les petits lots de même type (par ex. `Lecture × 3`), l'étiquette peut faire office de redite des lignes d'outils visibles. Si cela correspond à votre flux de travail habituel, soit activez le mode compact comme ci-dessus, soit désactivez complètement le résumé via `experimental.emitToolUseSummaries: false`.

## Surveillance

L'utilisation du modèle de résumé apparaît dans la sortie `/stats` sous les totaux de jetons du modèle rapide, avec le `prompt_id` `tool_use_summary_generation`, ce qui permet de le distinguer des suggestions d'invites et autres tâches d'arrière-plan.

## Flux de données et confidentialité

L'appel de résumé envoie le nom de chaque outil réussi, ses `args` tronqués et son résultat tronqué (chaque champ est limité à 300 caractères) au **modèle rapide**, plus les 200 premiers caractères du texte le plus récent de l'assistant comme préfixe d'intention.

Si votre modèle rapide est configuré pour le même fournisseur/auth que votre modèle de session principal, les données circulent le long de la même frontière que votre session principale — le périmètre de confiance ne change pas. Si vous avez configuré un modèle rapide auprès d'un **fournisseur différent**, les entrées et sorties des outils (y compris potentiellement le contenu des fichiers lus par `read_file`, la sortie des commandes shell ou les valeurs exposées via les outils MCP) seront envoyées à cet autre fournisseur dans le cadre de l'invite de résumé. Cela représente un périmètre de partage de données strictement plus large que la session seule.

Si cela a de l'importance pour votre flux de travail, vous avez deux options propres :

- Configurez `fastModel` sur un modèle du même fournisseur que votre session principale, afin que l'appel de résumé ne franchisse aucune nouvelle frontière d'authentification/données.
- Désactivez complètement la fonctionnalité avec `experimental.emitToolUseSummaries: false` (ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

La limite de 300 caractères par champ réduit l'exposition mais ne l'élimine pas — des secrets découverts dans la sortie de l'outil pendant la fenêtre de limitation peuvent toujours être envoyés. Traitez la frontière de données du modèle rapide comme vous traitez celle du modèle principal.

## Coût

Un appel au modèle rapide par lot d'outils éligible. L'entrée est un petit prompt système fixe plus les entrées/sorties d'outils tronquées (chaque champ limité à 300 caractères). La sortie est une seule ligne courte (limitée à 100 caractères, généralement 20 tokens ou moins). Sur un modèle rapide typique, cela représente environ 0,001 $ par lot.

Si vous ne souhaitez pas ce coût supplémentaire, désactivez la fonctionnalité via `experimental.emitToolUseSummaries: false` ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`.

## Associé

- [Mode compact](../configuration/settings#ui) — basculez avec `Ctrl+O` ; le résumé remplace l'en-tête générique du groupe d'outils lorsque le mode compact est activé.
- [Suggestions de suivi](./followup-suggestions) — une autre amélioration de l'expérience utilisateur pilotée par le modèle rapide qui partage le même réglage `fastModel`.
