# Résumés d'utilisation d'outils

Qwen Code peut générer une brève étiquette, dans le style d'un sujet de commit git, après chaque lot d'outils terminé, résumant ce que le lot a accompli. L'étiquette apparaît en ligne dans la transcription et remplace l'en-tête générique `Tool × N` en mode compact.

Il s'agit d'une aide UX pour les appels d'outils parallèles : lorsque le modèle se déploie en plusieurs appels `Read` + `Grep` + `Bash` à la fois, le résumé vous indique l'intention en un coup d'œil, sans vous obliger à parcourir la liste des outils.

Cette fonctionnalité est activée par défaut et s'exécute silencieusement en arrière-plan. Elle nécessite un [fast model](./followup-suggestions#fast-model) configuré.

## Ce que vous voyez

### Mode complet (par défaut)

Le résumé apparaît sous la forme d'une ligne de badge atténuée directement sous le groupe d'outils :

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Lecture de 4 fichiers texte
```

### Mode compact (`Ctrl+O` ou `ui.compactMode: true`)

L'étiquette remplace l'en-tête générique `Tool × N` dans la ligne unique compacte :

```
╭──────────────────────────────────────────────╮
│✓  Lecture de fichiers txt  · 4 outils        │
│Appuyez sur Ctrl+O pour afficher le détail    │
╰──────────────────────────────────────────────╯
```

Les appels d'outils individuels restent accessibles d'une simple touche (`Ctrl+O` pour basculer en mode complet).

## Fonctionnement

Une fois qu'un lot d'outils est finalisé, Qwen Code déclenche un appel de type *fire-and-forget* vers le fast model configuré avec :

- Les noms des outils, les arguments tronqués et les résultats tronqués (chacun limité à 300 caractères).
- Le texte le plus récent de l'assistant (200 premiers caractères) comme préfixe d'intention.
- Une invite système demandant au modèle de renvoyer une étiquette de 30 caractères au passé, dans le style d'un sujet de commit git.

L'appel s'exécute en parallèle du streaming API du tour suivant, de sorte que sa latence d'environ 1 s est masquée par la réponse du modèle principal. Lorsque l'étiquette est résolue, elle est ajoutée à la transcription en tant qu'entrée `tool_use_summary`.

Exemples d'étiquettes : `Recherche dans auth/`, `Correction NPE dans UserService`, `Création endpoint signup`, `Lecture config.json`, `Exécution tests en échec`.

## Quand cela apparaît

Le résumé est généré lorsque **toutes** les conditions suivantes sont remplies :

- `experimental.emitToolUseSummaries` est `true` (par défaut).
- Un `fastModel` est configuré (via les paramètres ou `/model --fast`).
- Au moins un outil a été exécuté dans le lot.
- Le tour n'a pas été interrompu avant la fin des outils.
- Le fast model a renvoyé une réponse non vide et sans erreur.

Les appels d'outils des sous-agents ne déclenchent pas la génération de résumé — seuls les lots d'outils de la session principale le font.

## Quand cela n'apparaît pas

Le résumé est silencieusement ignoré (pas d'erreur, pas de changement dans l'interface) lorsque :

- Aucun fast model n'est configuré.
- L'appel au fast model échoue, expire ou renvoie une réponse vide.
- Le modèle a renvoyé une chaîne de caractères ressemblant à un message d'erreur évident (par exemple, `Error: ...`, `Je ne peux pas ...`) — filtrée par le client pour que l'interface n'affiche pas d'étiquettes trompeuses.
- Le tour a été interrompu (`Ctrl+C`) avant la fin du modèle.

Dans tous ces cas, le groupe d'outils s'affiche comme d'habitude.

## Fast Model

L'étiquette est générée à l'aide du [fast model](./followup-suggestions#fast-model) — le même modèle que vous configurez pour les suggestions d'invite et l'exécution spéculative. Configurez-le via :

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

Lorsqu'aucun fast model n'est configuré, la génération de résumé est complètement ignorée — la fonctionnalité reste inactive jusqu'à ce que vous en configuriez un.

## Configuration

Ces paramètres peuvent être configurés dans `settings.json` :

| Paramètre                           | Type    | Défaut  | Description                                                                                          |
| ----------------------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries` | boolean | `true`  | Interrupteur général pour la génération de résumé. Désactivez pour éviter l'appel supplémentaire au fast model. |
| `fastModel`                         | string  | `""`    | Fast model utilisé pour la génération de résumé (partagé avec les suggestions d'invite). Obligatoire ; sans effet si vide. |

### Surcharge via variable d'environnement

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

Trois points qui peuvent surprendre à la première lecture de cette fonctionnalité :

1. **Une seule génération par lot, partagée par les deux modes d'affichage.** L'appel au fast model a lieu exactement une fois dans `handleCompletedTools` lorsqu'un lot d'outils se finalise. Basculer avec `Ctrl+O` par la suite ne déclenche **pas** un nouvel appel — les deux modes lisent la même entrée d'historique `tool_use_summary` qui a été capturée la première fois. Vous pouvez activer/désactiver le mode compact librement sans coût supplémentaire.
2. **Pas de backfill lors du basculement ou de la reprise de session.** Un `tool_group` qui s'est terminé avant que la fonctionnalité ne soit activée (ou avant que vous n'ayez activé le paramètre, ou dans une session reprise — `ChatRecordingService` ne persiste pas les entrées de résumé) n'obtiendra jamais d'étiquette. Il n'y a pas de « parcours de l'historique existant ». Si vous activez ce paramètre en milieu de session, seuls les lots *futurs* afficheront une étiquette ; les groupes plus anciens conservent le rendu par défaut sans indication qu'une étiquette manque.
3. **Uniquement les lots de l'agent principal.** Le déclencheur se trouve dans la boucle de tour de la session principale (`useGeminiStream`), donc :
   - ✅ Les opérations Shell, MCP, les opérations sur fichiers et *l'appel lui-même* à l'outil `Task` / sous-agent (tel qu'il apparaît dans le lot principal) sont résumés.
   - ❌ Les lots d'outils **internes** d'un sous-agent (exécutés via `packages/core/src/agents/runtime/`) ne sont pas résumés.

   Un lot externe qui *contient* un outil `Task` sera quand même étiqueté, mais le fast model ne voit que l'appel à l'outil sous-agent et son résultat agrégé — pas les appels d'outils individuels à l'intérieur du sous-agent. Attendez-vous à des étiquettes comme `Exécution de research-agent` ou `Délégation de recherche de fichiers` plutôt que `14 fichiers parcourus`. C'est intentionnel — résumer les internes des sous-agents multiplierait le coût du fast model et ferait apparaître du bruit qui n'apparaît jamais dans l'interface utilisateur principale.

## Association recommandée : activer le mode compact

Pour les lots de 3 appels d'outils parallèles ou plus, associer cette fonctionnalité avec `ui.compactMode: true` produit la transcription la plus propre. La vue compacte plie tout le lot en une seule ligne étiquetée (`✓  Lecture de fichiers txt  · 4 outils`) au lieu d'afficher chaque ligne d'outil plus le résumé final. Les détails restent accessibles en une touche via `Ctrl+O`.

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
En mode complet (par défaut), le résumé s'affiche sous la forme d'une ligne `● <étiquette>` finale sous le groupe d'outils — utile pour les lots volumineux ou hétérogènes, mais pour les petits lots de même type (par exemple `Read × 3`), l'étiquette peut sembler redondante par rapport aux lignes d'outils visibles. Si cela correspond à votre flux de travail habituel, activez le mode compact comme ci-dessus, ou désactivez complètement le résumé via `experimental.emitToolUseSummaries: false`.

## Surveillance

L'utilisation du modèle de résumé apparaît dans la sortie `/stats` sous les totaux de jetons du fast model, avec le `prompt_id` `tool_use_summary_generation` afin qu'il puisse être distingué des suggestions d'invite et autres tâches d'arrière-plan.

## Flux de données et confidentialité

L'appel de résumé envoie le nom, les `args` tronqués et le résultat tronqué de chaque outil réussi (chaque champ limité à 300 caractères) au **fast model**, ainsi que les 200 premiers caractères du texte le plus récent de l'assistant comme préfixe d'intention.

Si votre fast model est configuré pour le même fournisseur/auth que le modèle de votre session principale, les données transitent par la même limite que votre session principale utilise déjà — aucun changement dans le périmètre de confiance. Si vous avez configuré un fast model auprès d'un **fournisseur différent**, les entrées et sorties des outils (pouvant inclure le contenu des fichiers lus par `read_file`, les sorties de commandes des appels shell, ou les valeurs exposées via les outils MCP) seront envoyées à cet autre fournisseur dans le cadre de l'invite de résumé. Cela représente un périmètre de partage de données strictement plus large que la session principale seule.

Si cela est important pour votre flux de travail, vous avez deux options propres :

- Configurez `fastModel` avec un modèle sous le même fournisseur que votre session principale, afin que l'appel de résumé ne franchisse aucune nouvelle limite d'auth/données.
- Désactivez complètement la fonctionnalité avec `experimental.emitToolUseSummaries: false` (ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

La limite de 300 caractères par champ réduit l'exposition mais ne l'élimine pas — les secrets découverts dans la sortie des outils pendant la fenêtre de limite peuvent toujours être envoyés. Traitez la limite de données du fast model de la même manière que celle du modèle principal.

## Coût

Un appel au fast model par lot d'outils éligible. L'entrée est une petite invite système fixe plus les entrées/sorties d'outils tronquées (chaque champ limité à 300 caractères). La sortie est une seule ligne courte (limitée à 100 caractères, typiquement 20 jetons ou moins). Sur un fast model typique, cela coûte environ 0,001 $ par lot.

Si vous ne voulez pas ce coût supplémentaire, désactivez la fonctionnalité via `experimental.emitToolUseSummaries: false` ou `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`.

## Rubriques connexes

- [Mode Compact](../configuration/settings#ui) — basculez avec `Ctrl+O` ; le résumé remplace l'en-tête générique du groupe d'outils lorsque le mode compact est activé.
- [Suggestions de suites](./followup-suggestions) — une autre amélioration UX pilotée par le fast model qui partage le même paramètre `fastModel`.