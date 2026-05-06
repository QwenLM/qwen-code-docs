# Mémoire

Chaque session Qwen Code démarre avec une fenêtre de contexte vierge. Deux mécanismes permettent de conserver les connaissances d'une session à l'autre, pour éviter d'avoir à tout réexpliquer à chaque fois :

- **QWEN.md** — des instructions que _vous_ rédigez une fois et que Qwen lit à chaque session
- **Auto-memory** — des notes que Qwen rédige lui-même en fonction de ce qu'il apprend de vous

---

## QWEN.md : vos instructions pour Qwen

QWEN.md est un fichier texte brut dans lequel vous notez tout ce que Qwen doit toujours savoir sur votre projet ou vos préférences. Considérez-le comme un briefing permanent qui se charge au début de chaque conversation.

### Que mettre dans QWEN.md

Ajoutez les éléments que vous seriez sinon obligé de répéter à chaque session :

- Les commandes de build et de test (`npm run test`, `make build`)
- Les conventions de code suivies par votre équipe (« tous les nouveaux fichiers doivent inclure des commentaires JSDoc »)
- Les décisions architecturales (« nous utilisons le pattern repository, n'appelez jamais la base de données directement depuis les contrôleurs »)
- Les préférences personnelles (« utilisez toujours pnpm, pas npm »)

N'incluez pas ce que Qwen peut déduire en lisant votre code. QWEN.md est plus efficace lorsqu'il est court et précis : plus il s'allonge, moins Qwen a de chances de le suivre fidèlement.

### Où créer QWEN.md

| Fichier                       | À qui il s'applique                           |
| ----------------------------- | --------------------------------------------- |
| `~/.qwen/QWEN.md`             | Vous, sur tous vos projets                    |
| `QWEN.md` à la racine du projet | Toute votre équipe (commitez-le dans le contrôle de source) |

Vous pouvez avoir les deux. Qwen charge tous les fichiers QWEN.md qu'il trouve au démarrage d'une session : votre fichier personnel ainsi que ceux présents dans le projet.

Si votre dépôt contient déjà un fichier `AGENTS.md` pour d'autres outils IA, Qwen le lit également. Inutile de dupliquer les instructions.

### Générer un fichier automatiquement avec `/init`

Exécutez `/init` et Qwen analysera votre base de code pour créer un QWEN.md de base contenant les commandes de build, les instructions de test et les conventions qu'il détecte. Si un fichier existe déjà, il suggère des ajouts au lieu de l'écraser.

### Référencer d'autres fichiers

Vous pouvez pointer QWEN.md vers d'autres fichiers pour que Qwen les lise également :

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Utilisez `@path/to/file` n'importe où dans QWEN.md. Les chemins relatifs sont résolus à partir du fichier QWEN.md lui-même.

---

## Auto-memory : ce que Qwen apprend sur vous

L'Auto-memory s'exécute en arrière-plan. Après chaque conversation, Qwen enregistre discrètement les informations utiles qu'il a apprises — vos préférences, les retours que vous avez donnés, le contexte du projet — afin de pouvoir les réutiliser lors des sessions futures sans que vous ayez à vous répéter.

Cela diffère de QWEN.md : vous ne le rédigez pas, c'est Qwen qui s'en charge.

### Ce que Qwen enregistre

Qwen recherche quatre types d'informations utiles à mémoriser :

| Élément                 | Exemples                                                 |
| ----------------------- | -------------------------------------------------------- |
| **À propos de vous**    | Votre rôle, votre expérience, votre façon de travailler  |
| **Vos retours**         | Corrections apportées, approches validées                |
| **Contexte du projet**  | Travaux en cours, décisions, objectifs non évidents dans le code |
| **Références externes** | Tableaux de bord, trackers de tickets, liens vers la documentation que vous avez mentionnés |

Qwen ne sauvegarde pas tout : uniquement les éléments qui seront réellement utiles la prochaine fois.

### Où sont-ils stockés

Les fichiers Auto-memory se trouvent dans `~/.qwen/projects/<project>/memory/`. Toutes les branches et worktrees d'un même dépôt partagent le même dossier de mémoire, ainsi ce que Qwen apprend dans une branche est disponible dans les autres.

Tout ce qui est enregistré est au format Markdown brut : vous pouvez ouvrir, modifier ou supprimer n'importe quel fichier à tout moment.

### Nettoyage périodique

Qwen parcourt périodiquement ses mémoires enregistrées pour supprimer les doublons et nettoyer les entrées obsolètes. Ce processus s'exécute automatiquement en arrière-plan une fois par jour, une fois qu'un nombre suffisant de sessions a été accumulé. Vous pouvez le déclencher manuellement avec `/dream` si vous souhaitez l'exécuter immédiatement.

Pendant le nettoyage, **✦ dreaming** s'affiche dans le coin de l'écran. Votre session se poursuit normalement.

### Activer ou désactiver

L'Auto-memory est activée par défaut. Pour la basculer, ouvrez `/memory` et utilisez les interrupteurs en haut. Vous pouvez désactiver uniquement la sauvegarde automatique, uniquement le nettoyage périodique, ou les deux.

Vous pouvez également les configurer dans `~/.qwen/settings.json` (s'applique à tous les projets) ou `.qwen/settings.json` (ce projet uniquement) :

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

---

## Commandes

### `/memory`

Ouvre le panneau Mémoire. Depuis ici, vous pouvez :

- Activer ou désactiver la sauvegarde Auto-memory
- Activer ou désactiver le nettoyage périodique (dream)
- Ouvrir votre QWEN.md personnel (`~/.qwen/QWEN.md`)
- Ouvrir le QWEN.md du projet
- Parcourir le dossier auto-memory

### `/init`

Génère un QWEN.md de base pour votre projet. Qwen analyse votre base de code et y renseigne les commandes de build, les instructions de test et les conventions qu'il découvre.

### `/remember <text>`

Enregistre immédiatement un élément dans l'auto-memory sans attendre que Qwen le détecte automatiquement :

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

Supprime les entrées auto-memory correspondant à votre description :

```
/forget old workaround for the login bug
```

### `/dream`

Exécute le nettoyage de la mémoire immédiatement au lieu d'attendre la planification automatique :

```
/dream
```

---

## Dépannage

### Qwen ne suit pas mon QWEN.md

Ouvrez `/memory` pour voir quels fichiers sont chargés. Si votre fichier n'apparaît pas dans la liste, Qwen ne peut pas le voir : assurez-vous qu'il se trouve à la racine du projet ou dans `~/.qwen/`.

Les instructions fonctionnent mieux lorsqu'elles sont précises :

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

Si vous disposez de plusieurs fichiers QWEN.md avec des instructions contradictoires, le comportement de Qwen peut devenir incohérent. Vérifiez-les et supprimez les contradictions.

### Je veux voir ce que Qwen a enregistré

Exécutez `/memory` et sélectionnez **Open auto-memory folder**. Toutes les mémoires enregistrées sont des fichiers Markdown lisibles que vous pouvez parcourir, modifier ou supprimer.

### Qwen continue d'oublier des éléments

Si l'auto-memory est activée mais que Qwen ne semble pas se souvenir des éléments d'une session à l'autre, essayez d'exécuter `/dream` pour forcer un passage de nettoyage. Vérifiez également `/memory` pour confirmer que les deux interrupteurs sont activés.

Pour les éléments que vous souhaitez absolument que Qwen retienne, ajoutez-les plutôt à QWEN.md : l'auto-memory fonctionne en mode best-effort, tandis que QWEN.md est garanti.