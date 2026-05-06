# Conseils contextuels

Qwen Code inclut un système de conseils contextuels qui vous aide à découvrir des fonctionnalités et à rester informé de l'état de la session.

## Conseils au démarrage

Chaque fois que vous lancez Qwen Code, un conseil s'affiche dans la zone d'en-tête. Les conseils sont d'abord sélectionnés par priorité, puis alternés entre les sessions via une rotation LRU (Least Recently Used) parmi les conseils de même priorité, afin que vous en voyiez un différent à chaque fois.

Les nouveaux utilisateurs voient des conseils axés sur la prise en main lors de leurs premières sessions :

| Sessions | Exemples de conseils                                 |
| -------- | ---------------------------------------------------- |
| < 5      | Commandes slash (`/`), autocomplétion avec Tab       |
| < 10     | Contexte projet `QWEN.md`, `--continue` / `--resume` |
| < 15     | Commandes shell avec le préfixe `!`                  |

Par la suite, les conseils alternent entre des fonctionnalités générales telles que `/compress`, `/approval-mode`, `/insight`, `/btw`, etc.

## Conseils après réponse

Pendant une conversation, Qwen Code surveille l'utilisation de votre fenêtre de contexte et affiche des conseils lorsqu'une action peut être nécessaire :

| Utilisation du contexte | Condition                              | Conseil                                           |
| ----------------------- | -------------------------------------- | ------------------------------------------------- |
| 50-80%                  | Après quelques prompts dans la session | Suggère `/compress` pour libérer du contexte      |
| 80-95%                  | —                                      | Avertit que le contexte est presque plein         |
| >= 95%                  | —                                      | Urgent : exécutez `/compress` maintenant ou `/new` pour continuer |

Les conseils après réponse disposent d'un cooldown individuel pour éviter les répétitions.

## Historique des conseils

L'historique d'affichage des conseils est stocké dans `~/.qwen/tip_history.json`. Ce fichier suit :

- Le nombre de sessions (utilisé pour la sélection des conseils destinés aux nouveaux utilisateurs)
- Les conseils affichés et leur date d'affichage (utilisé pour la rotation LRU et les cooldowns)

Vous pouvez supprimer ce fichier en toute sécurité pour réinitialiser l'historique des conseils.

## Désactiver les conseils

Pour masquer tous les conseils (au démarrage et après réponse), définissez `ui.hideTips` sur `true` dans `~/.qwen/settings.json` :

```json
{
  "ui": {
    "hideTips": true
  }
}
```

Vous pouvez également basculer cette option dans la boîte de dialogue des paramètres via la commande `/settings`.

Les conseils sont également masqués automatiquement lorsque le mode lecteur d'écran est activé.