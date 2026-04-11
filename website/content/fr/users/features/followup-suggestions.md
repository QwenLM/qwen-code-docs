# Suggestions de suivi

Qwen Code peut prédire ce que vous souhaitez taper ensuite et l'afficher sous forme de texte fantôme dans la zone de saisie. Cette fonctionnalité utilise un appel LLM pour analyser le contexte de la conversation et générer une suggestion d'étape suivante naturelle.

Cette fonctionnalité fonctionne de bout en bout dans le CLI. Dans la WebUI, le hook et l'infrastructure UI sont disponibles, mais les applications hôtes doivent déclencher la génération des suggestions et connecter l'état de suivi pour que les suggestions s'affichent.

## Fonctionnement

Une fois que Qwen Code a terminé sa réponse, une suggestion apparaît sous forme de texte estompé dans la zone de saisie après un court délai (~300 ms). Par exemple, après avoir corrigé un bug, vous pourriez voir :

```
> run the tests
```

La suggestion est générée en envoyant l'historique de la conversation au modèle, qui prédit ce que vous taperiez naturellement ensuite. Si la réponse contient une astuce explicite (par ex. `Tip: type post comments to publish findings`), l'action suggérée est extraite automatiquement.

## Accepter les suggestions

| Touche        | Action                                           |
| ------------- | ------------------------------------------------ |
| `Tab`         | Accepte la suggestion et la complète dans la zone de saisie |
| `Enter`       | Accepte la suggestion et la soumet immédiatement |
| `Flèche droite` | Accepte la suggestion et la complète dans la zone de saisie |
| Toute saisie  | Masque la suggestion et permet de taper normalement |

## Affichage des suggestions

Les suggestions sont générées lorsque toutes les conditions suivantes sont réunies :

- Le modèle a terminé sa réponse (pas pendant le streaming)
- Au moins 2 tours du modèle ont eu lieu dans la conversation
- Aucune erreur n'est présente dans la réponse la plus récente
- Aucune boîte de dialogue de confirmation n'est en attente (par ex. confirmation shell, autorisations)
- Le mode d'approbation n'est pas défini sur `plan`
- La fonctionnalité est activée dans les paramètres (activée par défaut)

Les suggestions ne s'afficheront pas en mode non interactif (par ex. mode headless/SDK).

Les suggestions sont automatiquement masquées lorsque :

- Vous commencez à taper
- Un nouveau tour du modèle commence
- La suggestion est acceptée

## Modèle rapide

Par défaut, les suggestions utilisent le même modèle que votre conversation principale. Pour des suggestions plus rapides et moins coûteuses, configurez un modèle rapide dédié :

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

Le modèle rapide est utilisé pour les suggestions de prompt et l'exécution spéculative. Lorsqu'il n'est pas configuré, le modèle de conversation principal est utilisé en fallback.

Le mode thinking/reasoning est automatiquement désactivé pour toutes les tâches en arrière-plan (génération de suggestions et spéculation), quelle que soit la configuration thinking de votre modèle principal. Cela évite de gaspiller des tokens sur un raisonnement interne inutile pour ces tâches.

## Configuration

Ces paramètres peuvent être configurés dans `settings.json` :

| Paramètre                      | Type    | Valeur par défaut | Description                                                        |
| ------------------------------ | ------- | ----------------- | ------------------------------------------------------------------ |
| `ui.enableFollowupSuggestions` | boolean | `true`            | Active ou désactive les suggestions de suivi                       |
| `ui.enableCacheSharing`        | boolean | `true`            | Utilise des requêtes forkées optimisées pour le cache afin de réduire les coûts (expérimental) |
| `ui.enableSpeculation`         | boolean | `false`           | Exécute les suggestions de manière spéculative avant soumission (expérimental) |
| `fastModel`                    | string  | `""`              | Modèle pour les suggestions de prompt et l'exécution spéculative   |

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

## Monitoring

L'utilisation du modèle de suggestions apparaît dans la sortie de `/stats`, affichant les tokens consommés par le modèle rapide pour la génération des suggestions.

Le modèle rapide est également affiché dans la sortie de `/about` sous "Fast Model".

## Qualité des suggestions

Les suggestions passent par des filtres de qualité pour garantir leur utilité :

- Doivent contenir 2 à 12 mots (CJK : 2 à 30 caractères), pour un total inférieur à 100 caractères
- Ne peuvent pas être évaluatives ("looks good", "thanks")
- Ne peuvent pas utiliser la voix IA ("Let me...", "I'll...")
- Ne peuvent pas contenir plusieurs phrases ou de formatage (markdown, sauts de ligne)
- Ne peuvent pas être des méta-commentaires ("nothing to suggest", "silence")
- Ne peuvent pas être des messages d'erreur ou des préfixes ("Suggestion: ...")
- Les suggestions d'un seul mot sont uniquement autorisées pour les commandes courantes (yes, commit, push, etc.)
- Les slash commands (par ex. `/commit`) sont toujours autorisées en tant que suggestions d'un seul mot