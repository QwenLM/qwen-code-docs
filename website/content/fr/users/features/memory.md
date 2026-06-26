# Mémoire

Chaque session Qwen Code commence avec une fenêtre de contexte vierge. Deux mécanismes transportent les connaissances d'une session à l'autre pour que vous n'ayez pas à vous répéter à chaque fois :

- **QWEN.md** — des instructions que _vous_ écrivez une fois et que Qwen lit à chaque session
- **Auto-memory** — des notes que Qwen écrit lui-même en fonction de ce qu'il apprend de vous

---

## QWEN.md : vos instructions à Qwen

QWEN.md est un fichier texte simple dans lequel vous écrivez les choses que Qwen doit toujours savoir sur votre projet ou vos préférences. Considérez-le comme un briefing permanent qui se charge au début de chaque conversation.

### Que mettre dans QWEN.md

Ajoutez les choses que vous devriez sinon répéter à chaque session :

- Les commandes de build et de test (`npm run test`, `make build`)
- Les conventions de codage que votre équipe suit ("tous les nouveaux fichiers doivent avoir des commentaires JSDoc")
- Les décisions architecturales ("nous utilisons le pattern repository, ne jamais appeler la base de données directement depuis les controllers")
- Les préférences personnelles ("toujours utiliser pnpm, pas npm")

N'incluez pas les choses que Qwen peut comprendre en lisant votre code. QWEN.md fonctionne mieux quand il est court et spécifique — plus il est long, moins Qwen le suit de manière fiable.

### Où créer QWEN.md

| Fichier                        | À qui cela s'applique                                |
| ----------------------------- | ---------------------------------------------------- |
| `~/.qwen/QWEN.md`             | Vous, sur tous vos projets                           |
| `QWEN.md` à la racine du projet | Toute votre équipe (à commiter dans le contrôle de source) |
| `.qwen/QWEN.local.md`         | Uniquement vous, uniquement dans ce projet (à ne pas inclure dans git) |

Vous pouvez avoir n'importe quelle combinaison de ces fichiers. Qwen les charge tous lorsque vous démarrez une session.

Si votre dépôt a déjà un fichier `AGENTS.md` pour d'autres outils d'IA, Qwen le lit aussi. Pas besoin de dupliquer les instructions.

#### Quand utiliser `.qwen/QWEN.local.md`

Utilisez-le pour des instructions **propres au projet mais personnelles** — des choses qui appartiennent à ce projet mais ne devraient pas être partagées avec l'équipe :

- Votre propre ID de cluster, namespace de registre de conteneurs, ou compte cloud
- Une commande de débogage personnelle qui hardcode votre environnement local
- Des notes que vous voulez que Qwen connaisse sur votre travail en cours, mais pas à commiter

Il se charge **après** le `QWEN.md` partagé du projet, donc vos instructions locales peuvent compléter ou remplacer celles de l'équipe.

**Vous devez l'ajouter vous-même à .gitignore.** Bien que `.qwen/` soit souvent traité comme un répertoire local, qwen-code ne génère pas de `.gitignore` pour vous, et certains projets commitent `.qwen/settings.json`. Ajoutez cette ligne à votre `.gitignore` (ou à votre ignore git global) :

```
.qwen/QWEN.local.md
```

### Générer automatiquement avec `/init`

Exécutez `/init` et Qwen analysera votre codebase pour créer un QWEN.md de démarrage avec les commandes de build, les instructions de test et les conventions qu'il trouve. S'il en existe déjà un, il suggère des ajouts au lieu de l'écraser.

### Référencer d'autres fichiers

Vous pouvez pointer QWEN.md vers d'autres fichiers pour que Qwen les lise aussi :

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Utilisez `@path/to/file` n'importe où dans QWEN.md. Les chemins relatifs se résolvent à partir du fichier QWEN.md lui-même.

---

## Auto-memory : ce que Qwen apprend sur vous

Auto-memory s'exécute en arrière-plan. Après chacune de vos conversations, Qwen sauvegarde discrètement les choses utiles qu'il a apprises — vos préférences, les retours que vous avez donnés, le contexte du projet — afin de pouvoir les utiliser dans les sessions futures sans que vous ayez à vous répéter.

Ceci est différent de QWEN.md : vous ne l'écrivez pas, c'est Qwen qui le fait.

### Ce que Qwen sauvegarde

Qwen recherche quatre types de choses qui méritent d'être retenues :

| Ce qui est sauvegardé         | Exemples                                                 |
| ----------------------------- | -------------------------------------------------------- |
| **À propos de vous**          | Votre rôle, votre parcours, comment vous aimez travailler |
| **Vos retours**               | Les corrections que vous avez apportées, les approches que vous avez confirmées |
| **Contexte du projet**        | Travail en cours, décisions, objectifs non évidents dans le code |
| **Références externes**       | Tableaux de bord, trackers de tickets, liens de documentation que vous avez mentionnés |

Qwen ne sauvegarde pas tout — seulement les choses qui seraient réellement utiles la prochaine fois.

### Où c'est stocké

Les fichiers d'Auto-memory se trouvent dans `~/.qwen/projects/<project>/memory/`. Toutes les branches et worktrees du même dépôt partagent le même dossier de mémoire, donc ce que Qwen apprend dans une branche est disponible dans les autres.

Tout ce qui est sauvegardé est en markdown simple — vous pouvez ouvrir, modifier ou supprimer n'importe quel fichier à tout moment.

### Nettoyage périodique

Qwen parcourt périodiquement ses mémoires sauvegardées pour supprimer les doublons et nettoyer les entrées obsolètes. Cela s'exécute automatiquement en arrière-plan une fois par jour après que suffisamment de sessions se soient accumulées. Vous pouvez le déclencher manuellement avec `/dream` si vous voulez qu'il s'exécute maintenant.

Pendant le nettoyage, **✦ dreaming** apparaît dans le coin de l'écran. Votre session continue normalement.

### Activer ou désactiver

Auto-memory est activé par défaut. Pour le basculer, ouvrez `/memory` et utilisez les interrupteurs en haut. Vous pouvez désactiver uniquement la sauvegarde automatique, uniquement le nettoyage périodique, ou les deux.

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

- Activer ou désactiver la sauvegarde d'Auto-memory
- Activer ou désactiver le nettoyage périodique (dream)
- Ouvrir votre QWEN.md personnel (`~/.qwen/QWEN.md`)
- Ouvrir le QWEN.md du projet
- Parcourir le dossier d'Auto-memory

### `/init`

Génère un QWEN.md de démarrage pour votre projet. Qwen lit votre codebase et remplit les commandes de build, les instructions de test et les conventions qu'il découvre.

### `/remember <text>`

Sauvegarde immédiatement quelque chose dans Auto-memory sans attendre que Qwen le récupère automatiquement :

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

Supprime les entrées d'Auto-memory qui correspondent à votre description :

```
/forget old workaround for the login bug
```

### `/dream`

Exécute le nettoyage de la mémoire maintenant au lieu d'attendre le planning automatique :

```
/dream
```

---

## Dépannage

### Qwen ne suit pas mon QWEN.md

Ouvrez `/memory` pour voir quels fichiers sont chargés. Si votre fichier n'est pas listé, Qwen ne peut pas le voir — assurez-vous qu'il est à la racine du projet ou dans `~/.qwen/`.

Les instructions fonctionnent mieux quand elles sont spécifiques :

- ✓ `Utilisez une indentation de 2 espaces pour les fichiers TypeScript`
- ✗ `Formatez le code joliment`

Si vous avez plusieurs fichiers QWEN.md avec des instructions contradictoires, Qwen peut se comporter de manière incohérente. Passez-les en revue et supprimez toute contradiction.

### Je veux voir ce que Qwen a sauvegardé

Exécutez `/memory` et sélectionnez **Ouvrir le dossier d'Auto-memory**. Toutes les mémoires sauvegardées sont des fichiers markdown lisibles que vous pouvez parcourir, modifier ou supprimer.

### Qwen oublie des choses

Si Auto-memory est activé mais que Qwen ne semble pas se souvenir des choses entre les sessions, essayez d'exécuter `/dream` pour forcer un passage de nettoyage. Vérifiez également `/memory` pour confirmer que les deux interrupteurs sont activés.

Pour les choses que vous voulez toujours que Qwen se rappelle, ajoutez-les plutôt à QWEN.md — Auto-memory est au mieux, QWEN.md est garanti.