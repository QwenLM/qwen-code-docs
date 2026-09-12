# Suggestions de suivi

Qwen Code peut prédire ce que vous allez taper ensuite et l'afficher sous forme de texte indicatif dans la zone de saisie. Cette fonctionnalité utilise un appel LLM pour analyser le contexte de la conversation et générer une suggestion naturelle de l'étape suivante.

Cette fonctionnalité fonctionne de bout en bout dans le CLI et le Web Shell. La génération est automatique et côté serveur : après chaque tour terminé proprement (la raison d'arrêt `end_turn` du démon — un tour `cancelled`, `refusal`, `max_tokens` ou `max_turn_requests` n'en génère pas), le démon émet la suggestion sur le flux de session (activé par défaut ; définissez `ui.enableFollowupSuggestions` à `false` pour désactiver), et le composer du Web Shell connecte déjà le hook `useDaemonFollowupSuggestion`, donc les suggestions s'affichent et s'acceptent sans câblage supplémentaire de l'hôte.

## Fonctionnement

Une fois que Qwen Code a fini de répondre, une suggestion apparaît sous forme de texte indicatif atténué dans la zone de saisie après un court délai (~300 ms). Par exemple, après avoir corrigé un bug, vous pourriez voir :

```
> run the tests
```

La suggestion est générée en envoyant l'historique de la conversation au modèle, qui prédit ce que vous taperiez naturellement ensuite. Si la réponse contient un conseil explicite (par exemple, `Tip: type post comments to publish findings`), l'action suggérée est extraite automatiquement.

## Accepter les suggestions

| Touche       | Action                                                |
| ------------ | ----------------------------------------------------- |
| `Tab`        | Accepter la suggestion et la remplir dans la saisie   |
| `Enter`      | Accepter la suggestion et la remplir dans la saisie   |
| `Right Arrow` | Accepter la suggestion et la remplir dans la saisie   |
| Toute saisie | Ignorer la suggestion et taper normalement            |

`Enter` remplit la saisie sans la soumettre, donc accepter une commande slash suggérée (par exemple `/clear`) ne s'exécute jamais automatiquement — vous la soumettez vous-même avec un second `Enter`.

## Quand les suggestions apparaissent

Le CLI interactif et le démon décident séparément, et ils n'appliquent pas les mêmes conditions : le CLI contrôle lui-même la génération, dans chacun de ses renderers, tandis que le démon la contrôle côté serveur pour chaque client attaché à la session.

Les deux côtés exigent toutes les conditions suivantes :

- Au moins 2 tours de modèle ont eu lieu dans la conversation
- Le mode d'approbation n'est pas défini sur `plan`
- La fonctionnalité est activée (activée par défaut — définissez `ui.enableFollowupSuggestions` à `false` pour la désactiver)

Le CLI interactif exige en plus :

- La session est interactive — le CLI ne génère jamais de suggestions en mode non interactif ou SDK
- Le modèle a terminé sa réponse (pas pendant le streaming)
- Il n'y a pas d'erreur dans la réponse la plus récente
- Aucune boîte de dialogue de confirmation n'est en attente (par exemple, confirmation shell, autorisations)

Le démon exige en plus :

- Le tour s'est terminé proprement, c'est-à-dire que sa raison d'arrêt est `end_turn` — un tour annulé, refusé ou tronqué n'obtient pas de suggestion
- Les tours automatiques ne sont pas retenus par le garde d'arrêt todo, et aucun prompt en file d'attente n'attend d'être exécuté
- L'entrée la plus récente dans l'historique de la conversation est une réponse du modèle

Parce que la génération côté démon a lieu pour chaque client attaché à la session, elle a lieu aussi pour les clients qui ne peuvent pas afficher le résultat. Un tel client — un consommateur headless ou SDK d'une session démon, ce qui n'est pas le mode non interactif du CLI mentionné ci-dessus — devrait définir `ui.enableFollowupSuggestions` à `false` pour éviter de payer le coût LLM par tour pour une sortie qu'il rejette.

Les suggestions sont automatiquement ignorées lorsque :

- Vous commencez à taper
- Un nouveau tour de modèle commence
- La suggestion est acceptée

## Modèle rapide

Par défaut, les suggestions utilisent le même modèle que votre conversation principale. Pour des suggestions à plus faible latence, configurez un modèle rapide dédié :

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

Le modèle rapide est utilisé pour les suggestions d'invite et l'exécution spéculative. Lorsqu'il n'est pas configuré, le modèle principal de la conversation est utilisé comme fallback.

> **Note sur le coût :** Un modèle rapide réduit la latence, mais il ne réduit pas toujours le coût. La génération de suggestions réutilise le cache de préfixe de votre conversation (via `ui.enableCacheSharing`, activé par défaut) — mais un cache de préfixe est propre à chaque modèle. Pointer `fastModel` vers un modèle différent crée une bifurcation vers un cache séparé, de sorte que tout l'historique de la conversation est refacturé comme entrée non mise en cache sur le modèle rapide. Pour les longues conversations, la valeur par défaut (modèle principal + cache partagé) peut être **moins chère** qu'un modèle rapide, car la majeure partie de l'historique est facturée au tarif réduit du cache. Définissez `fastModel` lorsque la latence est plus importante que le coût par tour.

Le mode de réflexion/raisonnement est automatiquement désactivé pour toutes les tâches en arrière-plan (génération de suggestions et spéculation), quelle que soit la configuration de réflexion de votre modèle principal. Cela évite de gaspiller des tokens en raisonnement interne inutile pour ces tâches.

## Configuration

Ces paramètres peuvent être configurés dans `settings.json` :

| Réglage                        | Type    | Défaut  | Description                                                               |
| ------------------------------ | ------- | ------- | ------------------------------------------------------------------------- |
| `ui.enableFollowupSuggestions` | boolean | `true`  | Activer ou désactiver les suggestions de suivi                            |
| `ui.enableCacheSharing`        | boolean | `true`  | Utiliser des requêtes forkées aware du cache pour réduire les coûts (expérimental) |
| `ui.enableSpeculation`         | boolean | `false` | Exécuter spéculativement les suggestions avant soumission (expérimental)  |
| `fastModel`                    | string  | `""`    | Modèle pour les suggestions d'invite et l'exécution spéculative           |

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

L'utilisation du modèle de suggestion apparaît dans la sortie `/stats`, montrant les tokens consommés par le modèle rapide pour la génération de suggestions.

Le modèle rapide est également affiché dans la sortie `/about` sous « Fast Model ».

## Qualité des suggestions

Les suggestions passent par des filtres de qualité pour garantir leur utilité :

- Doivent contenir 2 à 12 mots (CJK : 2 à 30 caractères), moins de 100 caractères au total
- Ne peuvent pas être évaluatives (« looks good », « thanks »)
- Ne peuvent pas utiliser le ton d'un assistant vocal (« Let me... », « I'll... »)
- Ne peuvent pas contenir plusieurs phrases ou du formatage (markdown, sauts de ligne)
- Ne peuvent pas être des méta-commentaires (« nothing to suggest », « silence »)
- Ne peuvent pas être des messages d'erreur ou des libellés préfixés (« Suggestion: ... »)
- Les suggestions d'un seul mot ne sont autorisées que pour les commandes courantes (yes, commit, push, etc.)
- Les commandes slash (par exemple `/commit`) sont toujours autorisées comme suggestions d'un seul mot