# Conseils contextuels

Qwen Code inclut un système de conseils contextuels qui vous aide à découvrir les fonctionnalités et à rester informé de l'état de votre session.

## Conseils au démarrage

Chaque fois que vous lancez Qwen Code, un conseil s'affiche dans la zone d'en-tête. Les conseils sont d'abord sélectionnés par priorité, puis alternés entre les sessions selon un ordonnancement LRU (moins récemment utilisé) parmi les conseils de même priorité, afin que vous voyiez un conseil différent à chaque fois.

Les nouveaux utilisateurs voient des conseils axés sur la prise en main lors de leurs premières sessions :

| Sessions | Exemples de conseils                                 |
| -------- | ---------------------------------------------------- |
| < 5      | Commandes slash (`/`), Auto-complétion par Tab       |
| < 10     | Contexte projet `QWEN.md`, `--continue` / `--resume` |
| < 15     | Commandes shell avec le préfixe `!`                  |

Ensuite, les conseils alternent entre les fonctionnalités générales comme `/compress`, `/approval-mode`, `/insight`, `/btw`, et plus encore.

## Conseils post-réponse

Pendant une conversation, Qwen Code surveille l'utilisation de votre fenêtre de contexte et affiche des conseils lorsqu'une action peut être nécessaire :

| Utilisation du contexte | Condition                      | Conseil                                           |
| ----------------------- | ------------------------------ | ------------------------------------------------- |
| 50-80 %                 | Après quelques invites dans la session | Suggère `/compress` pour libérer du contexte      |
| 80-95 %                 | —                              | Préviens que le contexte devient plein             |
| >= 95 %                 | —                              | Urgent : exécutez `/compress` maintenant ou `/new` pour continuer |

Les conseils post-réponse ont des temps de recharge par conseil pour éviter les répétitions.

## Historique des conseils

L'historique d'affichage des conseils est conservé dans `~/.qwen/tip_history.json`. Ce fichier suit :

- Le nombre de sessions (utilisé pour la sélection des conseils pour les nouveaux utilisateurs)
- Quels conseils ont été affichés et quand (utilisé pour la rotation LRU et le temps de recharge)

Vous pouvez supprimer ce fichier en toute sécurité pour réinitialiser l'historique des conseils.

## Désactiver les conseils

Pour masquer tous les conseils (au démarrage et après les réponses), définissez `ui.hideTips` sur `true` dans `~/.qwen/settings.json` :

```json
{
  "ui": {
    "hideTips": true
  }
}
```

Vous pouvez également basculer cette option dans la boîte de dialogue des paramètres via la commande `/settings`.

Les conseils sont également automatiquement masqués lorsque le mode lecteur d'écran est activé.