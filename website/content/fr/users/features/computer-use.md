# Computer Use

Qwen Code inclut des outils **Computer Use** intégrés qui permettent à l'agent de piloter votre bureau — cliquer, taper, défiler, lancer des applications, lire le contenu des fenêtres et prendre des captures d'écran. Cela transforme Qwen Code en un agent d'automatisation de bureau général, pas seulement un assistant de programmation confiné au terminal.

Computer Use est propulsé par le driver natif [`cua-driver`](https://github.com/trycua/cua). Les outils sont enregistrés comme des built-ins différés (chargés paresseusement) sous le préfixe `computer_use__`, de sorte qu'ils ne consomment de l'espace dans le prompt que lorsque le modèle les utilise effectivement.

> [!warning]
>
> Computer Use donne à l'agent le contrôle de votre souris, clavier et fenêtres, et lui permet de lire le contenu de votre écran. Ne l'utilisez qu'avec des prompts fiables et, dans la mesure du possible, dans un environnement sandbox ou jetetable. Les outils d'action (click, type, drag, etc.) suivent le [flux d'approbation](./approval-mode.md) normal ; les outils en lecture seule comme le listage des fenêtres peuvent s'exécuter sans invite.

## Activer et désactiver

Computer Use est **activé par défaut**. Les outils `computer_use__*` sont enregistrés automatiquement au démarrage.

Pour le désactiver entièrement — ce qui empêche également le driver natif d'être téléchargé ou lancé — définissez `tools.computerUse.enabled` à `false` dans votre `settings.json` :

```jsonc
{
  "tools": {
    "computerUse": {
      "enabled": false,
    },
  },
}
```

Ce paramètre nécessite un redémarrage pour prendre effet.

## Premier lancement et le driver natif

La première fois que l'agent invoque un outil Computer Use, Qwen Code télécharge un binaire `cua-driver` épinglé et signé (~20 Mo) dans `~/.qwen/computer-use/` et le lance comme un processus local. Des binaires préconstruits sont publiés pour macOS (Apple Silicon et Intel), Linux (x86_64) et Windows (x86_64).

### Permissions macOS

Sur macOS, l'automatisation du bureau nécessite deux permissions système :

- **Accessibility** — pour lire l'état des fenêtres/UI et synthétiser des entrées
- **Screen Recording** — pour capturer des captures d'écran

Lors de la première utilisation, le driver vous guide pour accorder ces permissions via les dialogues système macOS standard. L'agent peut également vérifier le statut des permissions à la demande (l'outil `check_permissions`). Comme macOS attribue les octrois de permission au processus _responsable_, les octrois peuvent devoir être donnés au terminal ou à l'IDE qui a lancé Qwen Code.

## Ce que l'agent peut faire

La surface complète des outils `cua-driver` est exposée. Points forts :

| Catégorie       | Outils (sélection)                                                                     |
| --------------- | -------------------------------------------------------------------------------------- |
| Souris          | `click`, `double_click`, `right_click`, `drag`, `move_cursor`, `scroll`                |
| Clavier         | `type_text`, `press_key`, `hotkey`                                                     |
| Fenêtres / UI   | `list_windows`, `get_window_state`, `get_accessibility_tree`, `set_value`, `zoom`      |
| Applications    | `launch_app`, `list_apps`, `bring_to_front`, `kill_app`                                |
| Pages navigateur| `page` (exécuter du JavaScript, lire du texte, interroger le DOM, cliquer des éléments)|
| Captures d'écran| `get_window_state` (capture un PNG), `page`                                            |
| Enregistrement  | `start_recording`, `stop_recording`, `replay_trajectory` (enregistrer/rejouer une session) |
| Sessions        | `start_session`, `end_session`, contrôles de l'overlay curseur agent                    |

Les actions adressées par élément sont préférées aux coordonnées pixel brutes : `get_window_state` renvoie un rendu Markdown de l'arbre d'accessibilité d'une fenêtre avec un `element_index` stable pour chaque élément actionnable, que les outils d'entrée peuvent cibler directement.

Le support est plus complet sur macOS ; certains outils sont spécifiques à une plateforme (par exemple, `bring_to_front` est Windows-only, et `launch_app` cible les applications macOS).

## Configuration

Tous les paramètres de Computer Use se trouvent sous `tools.computerUse` dans `settings.json`. Consultez la [référence des paramètres](../configuration/settings.md) pour la liste complète.

| Paramètre                             | Type    | Défaut   | Description                                                                                                                                                                                                                                               |
| ------------------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.computerUse.enabled`           | boolean | `true`   | Enregistrer les outils `computer_use__*`. Quand `false`, le driver n'est jamais téléchargé ni lancé.                                                                                                                                                       |
| `tools.computerUse.maxImageDimension` | number  | `-1`     | Limite en pixels du côté le plus long pour les captures d'écran. `-1` conserve la valeur par défaut du driver (1568) ; `0` désactive le redimensionnement (pleine résolution) ; une valeur positive limite le côté le plus long. Des limites plus basses réduisent le coût en tokens vision. Remplacement par env : `QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`. |
| `tools.computerUse.idleTimeoutMs`     | number  | `300000` | Millisecondes pendant lesquelles le processus driver reste en vie après le dernier appel `computer_use__*` (par défaut 5 minutes). `0` le maintient en cours d'exécution jusqu'à la sortie de Qwen Code.                                                   |

Les trois paramètres nécessitent un redémarrage pour prendre effet.

## Voir aussi

- [Mode d'approbation](./approval-mode.md) — comment les exécutions d'outils sont contrôlées
- [Sandboxing](./sandbox.md) — isoler ce que les outils peuvent toucher
- [Référence des paramètres](../configuration/settings.md) — le schéma complet `tools.computerUse.*`
