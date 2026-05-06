# Résumés d'utilisation des outils

Qwen Code peut générer un court libellé, au format objet de commit Git, après chaque lot d'outils, résumant ce que le lot a accompli. Le libellé apparaît en ligne dans la transcription et remplace l'en-tête générique `Tool × N` en mode compact.

Cette fonctionnalité améliore l'UX pour les appels d'outils parallèles : lorsque le modèle lance plusieurs appels `Read` + `Grep` + `Bash` simultanément, le résumé indique l'intention en un coup d'œil, sans vous obliger à parcourir la liste des outils.

La fonctionnalité est activée par défaut et s'exécute silencieusement en arrière-plan. Elle nécessite un [modèle rapide](./followup-suggestions#fast-model) configuré.

## Ce que vous voyez

### Mode complet (par défaut)

Le résumé apparaît sous forme de ligne de badge atténuée directement sous le groupe d'outils :

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

Le libellé remplace l'en-tête générique `Tool × N` dans la ligne unique du mode compact :

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

Les appels d'outils individuels restent accessibles en une touche (`Ctrl+O` pour basculer vers le mode complet).

## Fonctionnement

Une fois qu'un lot d'outils est finalisé, Qwen Code lance une requête fire-and-forget vers le modèle rapide configuré avec :

- Les noms des outils, les arguments tronqués et les résultats tronqués (chaque champ limité à 300 caractères).
- La sortie textuelle la plus récente de l'assistant (200 premiers caractères) servant de préfixe d'intention.
- Un prompt système demandant au modèle de renvoyer un libellé de 30 caractères au passé, au format objet de commit Git.

La requête s'exécute en parallèle du streaming API du tour suivant, masquant ainsi sa latence d'environ 1 s derrière la réponse du modèle principal. Une fois le libellé résolu, il est ajouté à la transcription sous forme d'entrée `tool_use_summary`.

Exemples de libellés : `Searched in auth/`, `Fixed NPE in UserService`, `Created signup endpoint`, `Read config.json`, `Ran failing tests`.

## Quand il apparaît

Le résumé est généré lorsque **toutes** les conditions suivantes sont réunies :

- `experimental.emitToolUseSummaries` est défini sur `true` (par défaut).
- Un `fastModel` est configuré (via les paramètres ou `/model --fast`).
- Au moins un outil du lot s'est terminé avec succès.
- Le tour n'a pas été interrompu avant la fin des outils.
- Le modèle rapide a renvoyé une réponse non vide et sans erreur.

Les appels d'outils des sous-agents ne déclenchent pas la génération de résumé : seuls les lots d'outils de la session principale le font.

## Quand il n'apparaît pas

Le résumé est ignoré silencieusement (aucune erreur, aucun changement d'interface) lorsque :

- Aucun modèle rapide n'est configuré.
- La requête vers le modèle rapide échoue, expire ou renvoie une réponse vide.
- Le modèle renvoie une chaîne ressemblant à un message d'erreur (ex. `Error: ...`, `I cannot ...`) — filtrée par le client pour éviter d'afficher des libellés trompeurs dans l'interface.
- Le tour a été interrompu (`Ctrl+C`) avant la fin du modèle.

Dans tous ces cas, le groupe d'outils s'affiche comme d'habitude.

## Modèle rapide

Le libellé est généré à l'aide du [modèle rapide](./followup-suggestions#fast-model) — le même que celui configuré pour les suggestions de prompt et l'exécution spéculative. Configurez-le via :

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

Si aucun modèle rapide n'est configuré, la génération de résumé est entièrement ignorée : la fonctionnalité reste inactive tant que vous n'en avez pas défini un.

## Configuration

Ces paramètres peuvent être configurés dans `settings.json` :

| Paramètre                           | Type    | Valeur par défaut | Description                                                                                        |
| ----------------------------------- | ------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries` | boolean | `true`            | Interrupteur principal pour la génération de résumé. Désactivez-le pour éviter la requête supplémentaire vers le modèle rapide. |
| `fastModel`                         | string  | `""`              | Modèle rapide utilisé pour la génération de résumé (partagé avec les suggestions de prompt). Requis ; sans effet si vide. |

### Remplacement par variable d'environnement

La variable `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` remplace le paramètre `experimental.emitToolUseSummaries` pour la session en cours :

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` ou `=false` — force la désactivation.
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` ou `=true` — force l'activation.
- Non définie — utilise le paramètre `experimental.emitToolUseSummaries`.

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

Trois points qui prêtent souvent à confusion lors d'une première lecture de cette fonctionnalité :

1. **Une seule génération par lot, partagée par les deux modes d'affichage.** La requête vers le modèle rapide s'exécute exactement une fois dans `handleCompletedTools` lors de la finalisation d'un lot d'outils. Basculer avec `Ctrl+O` par la suite ne déclenche **pas** une nouvelle requête : les deux modes lisent la même entrée d'historique `tool_use_summary` capturée initialement. Vous pouvez activer ou désactiver le mode compact librement, sans coût supplémentaire.
2. **Aucun remplissage rétroactif lors du basculement ou de la reprise de session.** Un `tool_group` terminé avant l'activation de la fonctionnalité (ou avant l'activation du paramètre, ou dans une session reprise — `ChatRecordingService` ne persiste pas les entrées de résumé) n'obtiendra jamais de libellé. Il n'y a pas de passe d'analyse de l'historique existant. Si vous activez ce paramètre en cours de session, seuls les lots _futurs_ afficheront un libellé ; les groupes plus anciens conservent le rendu par défaut, sans indication qu'un libellé manque.
3. **Uniquement les lots de l'agent principal.** Le déclencheur réside dans la boucle de tour de la session principale (`useGeminiStream`), donc :
   - ✅ Les appels Shell, MCP, les opérations sur les fichiers et l'appel à l'outil `Task` / sous-agent _lui-même_ (tel qu'il apparaît dans le lot principal) sont résumés.
   - ❌ Les lots d'outils **internes** d'un sous-agent (exécutés via `packages/core/src/agents/runtime/`) ne sont pas résumés.

   Un lot externe _contenant_ un outil `Task` sera tout de même étiqueté, mais le modèle rapide ne voit que l'appel au sous-agent et sa sortie agrégée — pas les appels d'outils individuels à l'intérieur du sous-agent. Attendez-vous à des libellés comme `Ran research-agent` ou `Delegated file search` plutôt que `Searched 14 files`. C'est intentionnel : résumer les détails internes des sous-agents multiplierait le coût du modèle rapide et ferait remonter du bruit qui n'apparaît jamais dans l'interface principale.

## Combinaison recommandée : activer le mode compact

Pour les lots de 3 appels d'outils parallèles ou plus, combiner cette fonctionnalité avec `ui.compactMode: true` produit la transcription la plus lisible. La vue compacte regroupe l'ensemble du lot en une seule ligne étiquetée (`✓  Read txt files  · 4 tools`) au lieu d'afficher chaque ligne d'outil suivie du résumé. Les détails restent accessibles en une touche via `Ctrl+O`.

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

En mode complet (par défaut), le résumé s'affiche sous forme de ligne `● <label>` en dessous du groupe d'outils — utile pour les lots volumineux ou hétérogènes, mais pour les petits lots de même type (ex. `Read × 3`), le libellé peut sembler répéter les lignes d'outils visibles. Si cela correspond à votre flux de travail habituel, activez le mode compact comme indiqué ci-dessus, ou désactivez complètement le résumé via `experimental.emitToolUseSummaries: false`.

## Suivi

L'utilisation du modèle pour les résumés apparaît dans la sortie de `/stats` sous les totaux de tokens du modèle rapide, avec le `prompt_id` `tool_use_summary_generation` afin de pouvoir la distinguer des suggestions de prompt et des autres tâches en arrière-plan.

## Flux de données et confidentialité

La requête de résumé envoie le nom de chaque outil réussi, ses `args` tronqués et son résultat tronqué (chaque champ limité à 300 caractères) au **modèle rapide**, ainsi que les 200 premiers caractères du texte le plus récent de l'assistant comme préfixe d'intention.

Si votre modèle rapide est configuré avec le même fournisseur/authentification que le modèle de votre session principale, les données transitent par la même frontière que celle déjà utilisée par votre session principale — aucune modification du périmètre de confiance. Si vous avez configuré un modèle rapide provenant d'un **fournisseur différent**, les entrées et sorties des outils (pouvant inclure le contenu de fichiers lus par `read_file`, la sortie de commandes shell ou des valeurs exposées via des outils MCP) seront envoyées à cet autre fournisseur dans le cadre du prompt de résumé. Cela élargit strictement le périmètre de partage de données par rapport à la session principale seule.

Si cela a de l'importance pour votre flux de travail, vous disposez de deux options claires :

- Configurez `fastModel` sur un modèle du même fournisseur que votre session principale, afin que la requête de résumé ne traverse aucune nouvelle frontière d'authentification ou de données.
- Désactivez complètement la fonctionnalité avec `experimental.emitToolUseSummaries: false` (ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

La limite de 300 caractères par champ réduit l'exposition mais ne l'élimine pas : des secrets découverts dans la sortie d'un outil pendant cette fenêtre peuvent toujours être envoyés. Traitez la frontière de données du modèle rapide avec la même rigueur que celle du modèle principal.

## Coût

Une requête vers le modèle rapide par lot d'outils éligible. L'entrée se compose d'un petit prompt système fixe, plus les entrées/sorties tronquées des outils (limitées à 300 caractères par champ). La sortie est une seule ligne courte (limitée à 100 caractères, généralement 20 tokens ou moins). Sur un modèle rapide standard, cela représente environ 0,001 $ par lot.

Si vous souhaitez éviter ce coût supplémentaire, désactivez la fonctionnalité via `experimental.emitToolUseSummaries: false` ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`.

## Voir aussi

- [Mode compact](../configuration/settings#ui.compactMode) — bascule avec `Ctrl+O` ; le résumé remplace l'en-tête générique du groupe d'outils lorsque le mode compact est activé.
- [Suggestions de suivi](./followup-suggestions) — une autre amélioration UX pilotée par le modèle rapide, qui partage le même paramètre `fastModel`.