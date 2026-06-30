# Mémoire

Chaque session Qwen Code démarre avec une fenêtre de contexte vierge. Deux mécanismes transmettent les connaissances d'une session à l'autre pour que vous n'ayez pas à tout réexpliquer à chaque fois :

- **QWEN.md** — des instructions que _vous_ rédigez une seule fois et que Qwen lit à chaque session
- **Auto-memory** — des notes que Qwen rédige lui-même en fonction de ce qu'il apprend de vous

---

## QWEN.md : vos instructions pour Qwen

QWEN.md est un fichier texte brut dans lequel vous indiquez ce que Qwen doit toujours savoir sur votre projet ou vos préférences. Considérez-le comme un briefing permanent qui se charge au début de chaque conversation.

### Que mettre dans QWEN.md

Ajoutez les éléments que vous seriez autrement obligé de répéter à chaque session :

- Les commandes de build et de test (`npm run test`, `make build`)
- Les conventions de code suivies par votre équipe (« tous les nouveaux fichiers doivent avoir des commentaires JSDoc »)
- Les décisions architecturales (« nous utilisons le pattern repository, ne jamais appeler la base de données directement depuis les contrôleurs »)
- Les préférences personnelles (« toujours utiliser pnpm, pas npm »)

N'incluez pas les choses que Qwen peut déduire en lisant votre code. QWEN.md fonctionne mieux lorsqu'il est court et précis : plus il devient long, moins Qwen le suit de manière fiable.

### Où créer QWEN.md

| Fichier | S'applique à |
| --- | --- |
| `~/.qwen/QWEN.md` | Vous, sur tous vos projets |
| `QWEN.md` à la racine du projet | Toute votre équipe (à commiter dans le gestionnaire de versions) |
| `.qwen/QWEN.local.md` | Vous uniquement, pour ce projet seulement (à exclure de git) |

Vous pouvez utiliser n'importe quelle combinaison de ces fichiers. Qwen les charge tous au démarrage d'une session.

Si votre dépôt contient déjà un fichier `AGENTS.md` pour d'autres outils d'IA, Qwen le lira également. Inutile de dupliquer les instructions.

#### Quand utiliser `.qwen/QWEN.local.md`

Utilisez-le pour des instructions **spécifiques au projet mais personnelles** — des éléments qui appartiennent à ce projet mais ne doivent pas être partagés avec l'équipe :

- Votre propre ID de cluster, namespace de registre de conteneurs ou compte cloud
- Une commande de debug personnelle qui hardcode votre environnement local
- Des notes que vous voulez que Qwen connaisse sur votre travail en cours, mais sans les commiter

Il est chargé **après** le `QWEN.md` partagé du projet, vos instructions locales peuvent donc compléter ou écraser celles de l'équipe.

**Vous devez l'ajouter vous-même au `.gitignore`.** Bien que `.qwen/` soit souvent traité comme un répertoire local, qwen-code ne génère pas de `.gitignore` pour vous, et certains projets committent `.qwen/settings.json`. Ajoutez cette ligne à votre `.gitignore` (ou à votre git ignore global) :

```
.qwen/QWEN.local.md
```

### En générer un automatiquement avec `/init`

Exécutez `/init` et Qwen analysera votre codebase pour créer un QWEN.md de démarrage avec les commandes de build, les instructions de test et les conventions qu'il trouve. Si un fichier existe déjà, il suggère des ajouts au lieu de l'écraser.

### Référencer d'autres fichiers

Vous pouvez pointer QWEN.md vers d'autres fichiers pour que Qwen les lise également :

```markdown
Voir @README.md pour un aperçu du projet.

# Conventions

- Workflow Git : @docs/git-workflow.md
```

Utilisez `@path/to/file` n'importe où dans QWEN.md. Les chemins relatifs sont résolus depuis le fichier QWEN.md lui-même.

---

## Auto-memory : ce que Qwen apprend sur vous

L'Auto-memory s'exécute en arrière-plan. Après chacune de vos conversations, Qwen enregistre discrètement les informations utiles qu'il a apprises — vos préférences, les retours que vous avez donnés, le contexte du projet — afin de pouvoir les utiliser dans les sessions futures sans que vous ayez à vous répéter.

C'est différent de QWEN.md : ce n'est pas vous qui le rédigez, c'est Qwen.

### Ce que Qwen enregistre

Qwen recherche quatre types d'informations qu'il vaut la peine de mémoriser :

| Élément | Exemples |
| --- | --- |
| **À propos de vous** | Votre rôle, votre background, votre façon de travailler |
| **Vos retours** | Les corrections apportées, les approches confirmées |
| **Contexte du projet** | Travaux en cours, décisions, objectifs non évidents dans le code |
| **Références externes** | Dashboards, trackers de tickets, liens de documentation mentionnés |

Qwen n'enregistre pas tout — uniquement les éléments qui seront réellement utiles la prochaine fois.

### Où c'est stocké

Les fichiers de l'Auto-memory se trouvent dans `~/.qwen/projects/<project>/memory/`. Toutes les branches et worktrees d'un même dépôt partagent le même dossier de mémoire, ainsi ce que Qwen apprend dans une branche est disponible dans les autres.

Tout ce qui est enregistré l'est au format markdown brut — vous pouvez ouvrir, modifier ou supprimer n'importe quel fichier à tout moment.

### Nettoyage périodique

Qwen parcourt périodiquement ses mémoires enregistrées pour supprimer les doublons et nettoyer les entrées obsolètes. Cela s'exécute automatiquement en arrière-plan une fois par jour après qu'un nombre suffisant de sessions a été accumulé. Vous pouvez le déclencher manuellement avec `/dream` si vous souhaitez l'exécuter immédiatement.

Pendant que le nettoyage s'exécute, **✦ dreaming** apparaît dans le coin de l'écran. Votre session continue normalement.

### L'activer ou la désactiver

L'Auto-memory est activée par défaut. Pour la basculer, ouvrez `/memory` et utilisez les interrupteurs en haut. Vous pouvez désactiver uniquement l'enregistrement automatique, uniquement le nettoyage périodique, ou les deux.

Vous pouvez également les configurer dans `~/.qwen/settings.json` (s'applique à tous les projets) ou `.qwen/settings.json` (ce projet uniquement) :

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

### Team memory (partagée avec les collaborateurs)

Par défaut, l'auto-memory est **privée** — elle se trouve dans votre répertoire personnel et n'est jamais partagée. La Team memory est un niveau optionnel que toute l'équipe partage **via git**.

Une fois activée, Qwen dispose d'un troisième répertoire de mémoire dans `.qwen/team-memory/` **à l'intérieur du dépôt**. Il utilise la même structure d'un fichier par mémoire et le même index `MEMORY.md` que les niveaux privés. Étant donné qu'elle est committée dans le dépôt, elle est partagée avec chaque collaborateur de manière classique : vous faites un `git pull` pour recevoir les mémoires de vos coéquipiers et un commit/push pour partager les vôtres. Qwen y route les connaissances durables et transversales au projet — les conventions que chaque contributeur doit suivre, les pointeurs de référence partagés (trackers, dashboards) — tandis que les notes personnelles et éphémères restent privées.

Activez-la par projet (ou globalement) dans `settings.json` :

```json
{
  "memory": {
    "enableTeamMemory": true
  }
}
```

Elle est **désactivée par défaut**. Gardez ces mises en garde à l'esprit :

- **Elle est versionnée et visible par toute personne ayant accès au dépôt.** Traitez la team memory comme un commit dans le dépôt.
- **Les secrets sont bloqués.** Les écritures dans `.qwen/team-memory/` sont analysées à la recherche d'identifiants (clés API, tokens, clés privées) ; un secret détecté est rejeté et jamais écrit. L'analyse est une sécurité supplémentaire, pas une garantie — n'y mettez pas de données sensibles.
- **Les modifications sont vérifiables.** Les écritures de la team memory apparaissent dans `git status` / le diff de la PR comme n'importe quel autre fichier, elles peuvent donc être vérifiées avant d'être committées. En mode d'approbation par défaut, Qwen demande également une confirmation avant chaque écriture d'équipe ; en mode `AUTO_EDIT`/YOLO (où vous avez opté pour l'auto-approbation), elles sont appliquées sans invite mais apparaissent tout de même dans le diff.
- **Le répertoire doit être suivi par git.** Si le `.gitignore` de votre projet exclut `.qwen/*`, réincluez le chemin pour qu'il puisse être partagé :

  ```gitignore
  !.qwen/team-memory/
  !.qwen/team-memory/**
  ```

  Mise en garde : utilisez la forme d'ignore par glob de fichiers (`.qwen/*`), et non une forme de répertoire avec un slash final (`.qwen/`). Un ignore sous forme de répertoire fait que git ignore complètement le dossier, donc une réinclusion avec `!` en dessous est une opération nulle et le niveau équipe reste silencieusement vide dans git. Qwen avertit une fois au démarrage lorsque le niveau est activé mais que son répertoire est ignoré par git ou en dehors de tout dépôt git, cette mauvaise configuration ne passe donc pas inaperçue.

`QWEN_CODE_MEMORY_TEAM=1` / `=0` écrase le paramètre pour une seule exécution.

### Synchronisation git automatique (optionnel)

Par défaut, vous partagez la team memory avec le workflow git normal (`pull` pour recevoir, `commit`/`push` pour partager). Pour que Qwen le fasse pour vous, activez la synchronisation :

```json
{
  "memory": {
    "enableTeamMemory": true,
    "enableTeamMemorySync": true
  }
}
```

Une fois activée, au démarrage de la session, Qwen synchronise au mieux le répertoire `.qwen/team-memory/` : il reconstruit l'index partagé `MEMORY.md`, récupère en fast-forward les mises à jour des collaborateurs **d'abord**, puis committe vos modifications de team memory par-dessus, et push **uniquement ce commit de synchronisation** (via un refspec de branche unique explicite) — ainsi l'index que vous chargez reflète les dernières données. Il **stage** uniquement le répertoire de l'équipe (vos autres modifications en cours ne sont jamais committées), et ne bloque jamais la session en cas d'échec git. Désactivé par défaut. `QWEN_CODE_MEMORY_TEAM_SYNC=1` / `=0` écrase le paramètre pour une seule exécution.

Deux choses à savoir avant de l'activer :

- **Le pull en fast-forward agit sur l'ensemble de votre branche actuelle, pas seulement sur `.qwen/team-memory/`** (git n'a pas de pull limité à un chemin). La synchronisation va donc faire un fast-forward de votre branche vers le tip distant. Le push, en revanche, est limité : il publie **uniquement le commit que cette synchronisation vient de créer**, il ne push donc jamais les autres commits non pushés que vous avez — si votre branche est déjà en avance sur l'upstream, la synchronisation commit en local et skip le push. Activez-la sur les branches où le pull en fast-forward est acceptable — ou exécutez-la sur un checkout dédié.
- **Une branche divergente est laissée intacte** (`--ff-only` ne merge jamais). Lorsque cela se produit, la synchronisation ne fait simplement rien pour cette session ; résolvez la divergence (`git pull`) et elle reprend. Une branche sans upstream (pas de configuration de tracking) commit tout de même en local mais skip le push — il n'y a nulle part où pusher.

---

## Commandes

### `/memory`

Ouvre le panneau Memory. De là, vous pouvez :

- Activer ou désactiver l'enregistrement de l'auto-memory
- Activer ou désactiver le nettoyage périodique (dream)
- Ouvrir votre QWEN.md personnel (`~/.qwen/QWEN.md`)
- Ouvrir le QWEN.md du projet
- Parcourir le dossier de l'auto-memory

### `/init`

Génère un QWEN.md de démarrage pour votre projet. Qwen lit votre codebase et remplit les commandes de build, les instructions de test et les conventions qu'il découvre.

### `/remember <text>`

Enregistre immédiatement quelque chose dans l'auto-memory sans attendre que Qwen le récupère automatiquement :

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

Supprime les entrées de l'auto-memory qui correspondent à votre description :

```
/forget old workaround for the login bug
```

### `/dream`

Exécute le nettoyage de la mémoire maintenant au lieu d'attendre la planification automatique :

```
/dream
```

---

## Dépannage

### Qwen ne suit pas mon QWEN.md

Ouvrez `/memory` pour voir quels fichiers sont chargés. Si votre fichier n'est pas listé, Qwen ne peut pas le voir — assurez-vous qu'il se trouve à la racine du projet ou dans `~/.qwen/`.

Les instructions fonctionnent mieux lorsqu'elles sont spécifiques :

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

Si vous avez plusieurs fichiers QWEN.md avec des instructions contradictoires, Qwen peut avoir un comportement incohérent. Vérifiez-les et supprimez toute contradiction.

### Je veux voir ce que Qwen a enregistré

Exécutez `/memory` et sélectionnez **Ouvrir le dossier auto-memory**. Toutes les mémoires enregistrées sont des fichiers markdown lisibles que vous pouvez parcourir, modifier ou supprimer.

### Qwen continue d'oublier des choses

Si l'auto-memory est activée mais que Qwen ne semble pas se souvenir des choses d'une session à l'autre, essayez d'exécuter `/dream` pour forcer un passage de nettoyage. Vérifiez également `/memory` pour confirmer que les deux interrupteurs sont activés.

Pour les choses dont vous voulez toujours que Qwen se souvienne, ajoutez-les plutôt à QWEN.md — l'auto-memory fait au mieux, QWEN.md est garanti.