# Memory

Chaque session Qwen Code démarre avec une nouvelle fenêtre de contexte. Deux mécanismes transmettent les connaissances entre sessions pour que vous n'ayez pas à vous répéter à chaque fois :

- **QWEN.md** — des instructions que _vous_ écrivez une fois et que Qwen lit à chaque session
- **Auto-memory** — des notes que Qwen écrit lui-même à partir de ce qu'il apprend de vous

---

## QWEN.md : vos instructions à Qwen

QWEN.md est un fichier texte brut dans lequel vous écrivez ce que Qwen doit toujours savoir sur votre projet ou vos préférences. Considérez-le comme un briefing permanent qui se charge au début de chaque conversation.

### Quoi mettre dans QWEN.md

Ajoutez les choses que vous devriez sinon répéter à chaque session :

- Les commandes de build et de test (`npm run test`, `make build`)
- Les conventions de codage suivies par votre équipe (« tous les nouveaux fichiers doivent avoir des commentaires JSDoc »)
- Les décisions architecturales (« nous utilisons le pattern repository, n'appelez jamais la base de données directement depuis les contrôleurs »)
- Les préférences personnelles (« utilisez toujours pnpm, pas npm »)

N'incluez pas ce que Qwen peut déduire en lisant votre code. QWEN.md est plus efficace quand il est court et précis — plus il s'allonge, moins Qwen le suit fidèlement.

### Où créer QWEN.md

| Fichier                          | À qui cela s'applique                                   |
| -------------------------------- | ------------------------------------------------------- |
| `~/.qwen/QWEN.md`                | Vous-même, sur tous vos projets                         |
| `QWEN.md` à la racine du projet  | Toute votre équipe (à commiter dans le dépôt)           |
| `.qwen/QWEN.local.md`            | Vous uniquement, sur ce projet seulement (hors git)     |

Vous pouvez avoir n'importe quelle combinaison de ces fichiers. Qwen les charge tous au démarrage d'une session.

Si votre dépôt possède déjà un fichier `AGENTS.md` pour d'autres outils IA, Qwen le lit aussi. Pas besoin de dupliquer les instructions.

#### Quand utiliser `.qwen/QWEN.local.md`

Utilisez-le pour des instructions **personnelles mais spécifiques au projet** — des choses qui appartiennent à ce projet mais qui ne devraient pas être partagées avec l'équipe :

- Votre propre ID de cluster, namespace de registre de conteneurs ou compte cloud
- Une commande de débogage personnelle qui encode votre environnement local
- Des notes que Qwen doit connaître sur votre travail en cours, mais que vous ne voulez pas commiter

Il se charge **après** le `QWEN.md` partagé du projet, donc vos instructions locales peuvent compléter ou remplacer celles de l'équipe.

**Vous devez l'ajouter vous-même au .gitignore.** Bien que `.qwen/` soit souvent traité comme un répertoire local, qwen-code ne génère pas de `.gitignore` pour vous, et certains projets committent `.qwen/settings.json`. Ajoutez cette ligne à votre `.gitignore` (ou à votre ignore git global) :

```
.qwen/QWEN.local.md
```

### Générer automatiquement un fichier avec `/init`

Exécutez `/init` et Qwen analysera votre codebase pour créer un QWEN.md de démarrage avec les commandes de build, les instructions de test et les conventions qu'il trouve. S'il en existe déjà un, il suggère des ajouts au lieu de l'écraser.

### Référencer d'autres fichiers

Vous pouvez pointer QWEN.md vers d'autres fichiers pour que Qwen les lise aussi :

```markdown
Voir @README.md pour la présentation du projet.

# Conventions

- Workflow Git : @docs/git-workflow.md
```

Utilisez `@chemin/vers/fichier` n'importe où dans QWEN.md. Les chemins relatifs sont résolus à partir du fichier QWEN.md lui-même.

---

## Auto-memory : ce que Qwen apprend de vous

Auto-memory s'exécute en arrière-plan. Après chacune de vos conversations, Qwen enregistre discrètement les informations utiles qu'il a apprises — vos préférences, les retours que vous avez donnés, le contexte du projet — afin de les utiliser dans les sessions futures sans que vous ayez à vous répéter.

Cela diffère de QWEN.md : ce n'est pas vous qui l'écrivez, c'est Qwen.

### Ce que Qwen enregistre

Qwen cherche quatre types d'éléments dignes d'être mémorisés :

| Quoi                                  | Exemples                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| **À propos de vous**                  | Votre rôle, votre parcours, comment vous aimez travailler               |
| **Vos retours**                       | Les corrections que vous avez apportées, les approches que vous avez validées |
| **Contexte du projet**                | Travail en cours, décisions, objectifs non évidents dans le code         |
| **Références externes**               | Tableaux de bord, trackers de tickets, liens vers des docs que vous avez mentionnés |

Qwen n'enregistre pas tout — seulement ce qui serait réellement utile la prochaine fois.

### Où c'est stocké

Les fichiers d'auto-memory se trouvent dans `~/.qwen/projects/<projet>/memory/`. Toutes les branches et worktrees d'un même dépôt partagent le même dossier mémoire, donc ce que Qwen apprend dans une branche est disponible dans les autres.

Tout ce qui est enregistré est en markdown brut — vous pouvez ouvrir, modifier ou supprimer n'importe quel fichier à tout moment.

### Nettoyage périodique

Qwen parcourt périodiquement ses souvenirs enregistrés pour supprimer les doublons et nettoyer les entrées obsolètes. Cela s'exécute automatiquement en arrière-plan une fois par jour après qu'un nombre suffisant de sessions se soit accumulé. Vous pouvez le déclencher manuellement avec `/dream` si vous souhaitez qu'il s'exécute maintenant.

Pendant le nettoyage, **✦ dreaming** apparaît dans le coin de l'écran. Votre session continue normalement.

### Activer ou désactiver

Auto-memory est activé par défaut. Pour le basculer, ouvrez `/memory` et utilisez les interrupteurs en haut. Vous pouvez désactiver uniquement l'enregistrement automatique, uniquement le nettoyage périodique, ou les deux.
Vous pouvez aussi les définir dans `~/.qwen/settings.json` (s’applique à tous les projets) ou `.qwen/settings.json` (ce projet uniquement) :

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

Ouvre le panneau Mémoire. Depuis celui-ci, vous pouvez :

- Activer ou désactiver la sauvegarde automatique de la mémoire
- Activer ou désactiver le nettoyage périodique (dream)
- Ouvrir votre QWEN.md personnel (`~/.qwen/QWEN.md`)
- Ouvrir le QWEN.md du projet
- Parcourir le dossier de mémoire automatique

### `/init`

Génère un QWEN.md de démarrage pour votre projet. Qwen lit votre codebase et y inscrit les commandes de build, les instructions de test et les conventions qu’il découvre.

### `/remember <texte>`

Enregistre immédiatement quelque chose dans la mémoire automatique sans attendre que Qwen le capte automatiquement :

```
/remember toujours utiliser snake_case pour les noms de variables Python
/remember l’environnement de staging est staging.example.com
```

### `/forget <texte>`

Supprime les entrées de la mémoire automatique qui correspondent à votre description :

```
/forget ancienne solution de contournement pour le bug de connexion
```

### `/dream`

Exécute le nettoyage de la mémoire maintenant, au lieu d’attendre le déclenchement automatique :

```
/dream
```

---

## Dépannage

### Qwen ne suit pas mon QWEN.md

Ouvrez `/memory` pour voir quels fichiers sont chargés. Si votre fichier n’y figure pas, Qwen ne peut pas le voir – assurez‑vous qu’il se trouve à la racine du projet ou dans `~/.qwen/`.

Les instructions fonctionnent mieux quand elles sont spécifiques :

- ✓ `Utiliser une indentation de 2 espaces pour les fichiers TypeScript`
- ✗ `Formater le code proprement`

Si vous avez plusieurs fichiers QWEN.md avec des instructions contradictoires, Qwen peut se comporter de manière incohérente. Passez‑les en revue et supprimez les contradictions.

### Je veux voir ce que Qwen a enregistré

Exécutez `/memory` et sélectionnez **Ouvrir le dossier de mémoire automatique**. Toutes les mémoires enregistrées sont des fichiers markdown lisibles que vous pouvez parcourir, modifier ou supprimer.

### Qwen oublie des choses

Si la mémoire automatique est activée mais que Qwen semble ne pas se souvenir des choses d’une session à l’autre, essayez d’exécuter `/dream` pour forcer un passage de nettoyage. Vérifiez aussi dans `/memory` que les deux bascules sont activées.

Pour les choses que vous voulez que Qwen garde en mémoire en permanence, ajoutez‑les plutôt dans QWEN.md – la mémoire automatique est au mieux, QWEN.md est garanti.
