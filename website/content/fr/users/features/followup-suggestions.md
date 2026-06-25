# Suggestions de suivi

Qwen Code peut prédire ce que vous voulez taper ensuite et l'afficher comme texte d'espace réservé dans la zone de saisie. Cette fonctionnalité utilise un appel LLM pour analyser le contexte de la conversation et générer une suggestion naturelle pour l'étape suivante.

Cette fonctionnalité fonctionne de bout en bout dans la CLI. Dans la WebUI, le hook et la plomberie UI sont disponibles, mais les applications hôtes doivent déclencher la génération des suggestions et câbler l'état de suivi pour que les suggestions apparaissent.

## Comment ça fonctionne

Une fois que Qwen Code a fini de répondre, une suggestion apparaît sous forme de texte d'espace réservé atténué dans la zone de saisie après un court délai (~300 ms). Par exemple, après avoir corrigé un bug, vous pourriez voir :

```
> run the tests
```

La suggestion est générée en envoyant l'historique de la conversation au modèle, qui prédit ce que vous taperiez naturellement ensuite. Si la réponse contient un conseil explicite (par exemple, `Tip: type post comments to publish findings`), l'action suggérée est extraite automatiquement.

## Accepter les suggestions

| Key           | Action                                           |
| ------------- | ------------------------------------------------ |
| `Tab`         | Accepter la suggestion et la remplir dans la saisie |
| `Enter`       | Accepter la suggestion et la remplir dans la saisie |
| `Right Arrow` | Accepter la suggestion et la remplir dans la saisie |
| Toute saisie  | Ignorer la suggestion et taper normalement         |

`Enter` remplit la saisie plutôt que de soumettre, donc accepter une commande oblique suggérée (par exemple `/clear`) ne s'exécute jamais automatiquement — vous la soumettez vous-même avec un second `Enter`.

## Quand les suggestions apparaissent

Les suggestions sont générées lorsque toutes les conditions suivantes sont remplies :

- Le modèle a terminé sa réponse (pas pendant le streaming)
- Au moins 2 tours de modèle ont eu lieu dans la conversation
- Il n'y a pas d'erreur dans la réponse la plus récente
- Aucune boîte de dialogue de confirmation en attente (par exemple, confirmation shell, permissions)
- Le mode d'approbation n'est pas défini sur `plan`
- La fonctionnalité est activée (activée par défaut — définissez `ui.enableFollowupSuggestions` sur `false` pour la désactiver)

Les suggestions n'apparaissent pas en mode non interactif (par exemple, mode headless/SDK).

Les suggestions sont automatiquement ignorées lorsque :

- Vous commencez à taper
- Un nouveau tour de modèle commence
- La suggestion est acceptée

## Modèle rapide

Par défaut, les suggestions utilisent le même modèle que votre conversation principale. Pour des suggestions à latence plus faible, configurez un modèle rapide dédié :

### Via la commande

```
/model --fast qwen3-coder-flash
```

Ou utilisez `/model --fast` (sans nom de modèle) pour ouvrir une boîte de dialogue de sélection.

### Via settings.json

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Le modèle rapide est utilisé pour les suggestions d'invite et l'exécution spéculative. Lorsqu'il n'est pas configuré, le modèle de conversation principal est utilisé comme solution de repli.

> **Note sur le coût :** Un modèle rapide réduit la latence, mais ne réduit pas toujours le coût. La génération de suggestions réutilise le cache de préfixe de votre conversation (via `ui.enableCacheSharing`, activé par défaut) — mais un cache de préfixe est par modèle. Pointer `fastModel` vers un modèle différent bifurque vers un cache séparé, donc tout l'historique de la conversation est refacturé comme entrée non mise en cache sur le modèle rapide. Sur les longues conversations, la valeur par défaut (modèle principal + cache partagé) peut être **moins chère** qu'un modèle rapide, car la majeure partie de l'historique est facturée au tarif réduit du cache. Définissez `fastModel` lorsque la latence prime sur le coût par tour.

Le mode réflexion/raisonnement est automatiquement désactivé pour toutes les tâches d'arrière-plan (génération de suggestions et spéculation), indépendamment de la configuration de réflexion de votre modèle principal. Cela évite de gaspiller des jetons sur un raisonnement interne qui n'est pas nécessaire pour ces tâches.

## Configuration

Ces paramètres peuvent être configurés dans `settings.json` :

| Paramètre                     | Type    | Valeur par défaut | Description                                                          |
| ----------------------------- | ------- | ----------------- | -------------------------------------------------------------------- |
| `ui.enableFollowupSuggestions`| boolean | `true`            | Activer ou désactiver les suggestions de suivi                       |
| `ui.enableCacheSharing`       | boolean | `true`            | Utiliser des requêtes bifurquées avec cache pour réduire le coût (expérimental) |
| `ui.enableSpeculation`        | boolean | `false`           | Exécuter spéculativement les suggestions avant soumission (expérimental) |
| `fastModel`                   | string  | `""`              | Modèle pour les suggestions d'invite et l'exécution spéculative      |

### Exemple

```json
{
  "fastModel": "qwen3-coder-flash",
  "ui": {
    "enableFollowupSuggestions": true,
    "enableCacheSharing": true
  }
}
```

## Surveillance

L'utilisation du modèle de suggestion apparaît dans la sortie de `/stats`, affichant les jetons consommés par le modèle rapide pour la génération de suggestions.

Le modèle rapide est également affiché dans la sortie de `/about` sous 'Fast Model'.

## Qualité des suggestions

Les suggestions passent par des filtres de qualité pour garantir leur utilité :

- Doivent comporter 2 à 12 mots (CJC : 2 à 30 caractères), moins de 100 caractères au total
- Ne peuvent pas être évaluatives ('looks good', 'thanks')
- Ne peuvent pas utiliser la voix IA ('Let me...', 'I'll...')
- Ne peuvent pas être des phrases multiples ou contenir du formatage (markdown, nouvelles lignes)
- Ne peuvent pas être des méta-commentaires ('nothing to suggest', 'silence')
- Ne peuvent pas être des messages d'erreur ou des étiquettes préfixées ('Suggestion: ...')
- Les suggestions d'un seul mot ne sont autorisées que pour les commandes courantes (yes, commit, push, etc.)
- Les commandes obliques (par exemple `/commit`) sont toujours autorisées comme suggestions d'un seul mot
