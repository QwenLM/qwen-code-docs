# Mémoire

Chaque session Qwen Code démarre avec une fenêtre de contexte vierge. Trois mécanismes transmettent les connaissances d'une session à l'autre pour que vous n'ayez pas à tout réexpliquer à chaque fois :

- **QWEN.md** — des instructions que _vous_ rédigez une seule fois et que Qwen lit à chaque session
- **Auto-memory** — des notes que Qwen rédige lui-même en fonction de ce qu'il apprend de vous
- **External memory (`context_search`)** — un outil MCP optionnel que Qwen appelle à la demande pour rechercher dans Mem0 ou un index de session local

---

## QWEN.md : vos instructions pour Qwen

QWEN.md est un fichier texte brut dans lequel vous indiquez ce que Qwen doit toujours savoir sur votre projet ou vos préférences. Considérez-le comme un briefing permanent qui se charge au début de chaque conversation.

### Que mettre dans QWEN.md

Ajoutez les éléments que vous seriez autrement obligé de répéter à chaque session :

- Les commandes de build et de test (`npm run test`, `make build`)
- Les conventions de code suivies par votre équipe (« tous les nouveaux fichiers doivent avoir des commentaires JSDoc »)
- Les décisions architecturales (« nous utilisons le pattern repository, ne jamais appeler la base de données directement depuis les contrôleurs »)
- Les préférences personnelles (« toujours utiliser pnpm, pas npm »)
- Une politique de vérification pour les travaux à enjeux élevés — par exemple « vérifier dans la base de données avant de conclure » (voir [Enforce evidence-based conclusions](../common-workflow.md#enforce-evidence-based-conclusions) pour un modèle prêt à l'emploi)

N'incluez pas les choses que Qwen peut déduire en lisant votre code. QWEN.md fonctionne mieux lorsqu'il est court et précis : plus il est long, moins Qwen le suit de manière fiable.

### Où créer QWEN.md

| Fichier | À qui il s'applique |
| ----------------------------- | ------------------------------------------------ |
| `~/.qwen/QWEN.md`             | Vous, pour tous vos projets                    |
| `QWEN.md` à la racine du projet | Toute votre équipe (à commiter dans le dépôt)    |
| `.qwen/QWEN.local.md`         | Vous uniquement, pour ce projet seulement (à exclure de git) |

Vous pouvez utiliser n'importe quelle combinaison de ces fichiers. Qwen les charge tous au démarrage d'une session.

Si votre dépôt contient déjà un fichier `AGENTS.md` pour d'autres outils d'IA, Qwen le lira également. Inutile de dupliquer les instructions.

#### Quand utiliser `.qwen/QWEN.local.md`

Utilisez-le pour des instructions **spécifiques au projet mais personnelles** — des choses qui appartiennent à ce projet mais ne doivent pas être partagées avec l'équipe :

- Votre propre ID de cluster, namespace de registre de conteneurs ou compte cloud
- Une commande de debug personnelle qui hardcode votre environnement local
- Des notes que vous voulez que Qwen connaisse sur votre travail en cours, mais sans les commiter

Il est chargé **après** le `QWEN.md` partagé du projet, ainsi vos instructions locales peuvent compléter ou écraser celles de l'équipe.

**Vous devez l'ajouter vous-même au `.gitignore`.** Bien que `.qwen/` soit souvent traité comme un répertoire local, qwen-code ne génère pas de `.gitignore` pour vous, et certains projets committent `.qwen/settings.json`. Ajoutez cette ligne à votre `.gitignore` (ou à votre git ignore global) :

```
.qwen/QWEN.local.md
```

### En générer un automatiquement avec `/init`

Exécutez `/init` et Qwen analysera votre codebase pour créer un QWEN.md de base avec les commandes de build, les instructions de test et les conventions qu'il trouve. Si un fichier existe déjà, il suggère des ajouts au lieu de l'écraser.

### Référencer d'autres fichiers

Vous pouvez pointer QWEN.md vers d'autres fichiers afin que Qwen les lise également :

```markdown
Voir @README.md pour une vue d'ensemble du projet.

# Conventions

- Workflow Git : @docs/git-workflow.md
```

Utilisez `@path/to/file` n'importe où dans QWEN.md. Les chemins relatifs sont résolus depuis le fichier QWEN.md lui-même.

---

## Auto-memory : ce que Qwen apprend sur vous

L'Auto-memory s'exécute en arrière-plan. Après chacune de vos conversations, Qwen enregistre discrètement les informations utiles qu'il a apprises — vos préférences, les retours que vous avez donnés, le contexte du projet — afin de pouvoir les utiliser dans les sessions futures sans que vous ayez à vous répéter.

C'est différent de QWEN.md : vous ne le rédigez pas, c'est Qwen qui le fait.

Lorsqu'un tour qui répond à un message relayé par un [channel](./channels/overview) — GitHub, Telegram, DingTalk et les autres — se termine, Qwen n'exécute aucune extraction et ne planifie aucun [nettoyage périodique](#nettoyage-périodique) : l'expéditeur n'est souvent pas vous, et extraire après chaque message relayé ajouterait des appels de modèle à chacun. Dans une session qui prend également vos propres prompts, comme celle liée à une pull request, l'extraction après votre prochain prompt lit toujours la conversation récente, donc les messages relayés qui s'y trouvent encore peuvent être appris. Le rappel de mémoire n'est pas affecté : une réponse à un message de channel peut s'appuyer sur ce qui est déjà enregistré. Un chat de channel conserve le contexte durable dans [channel memory](./channels/overview#channel-memory) à la place.

### Ce que Qwen enregistre

Qwen recherche quatre types d'informations qu'il vaut la peine de mémoriser :

| Quoi                    | Exemples                                                 |
| ----------------------- | -------------------------------------------------------- |
| **À propos de vous**           | Votre rôle, votre background, votre façon de travailler              |
| **Vos retours**       | Les corrections que vous avez apportées, les approches que vous avez validées           |
| **Contexte du projet**     | Le travail en cours, les décisions, les objectifs qui ne sont pas évidents dans le code |
| **Références externes** | Les dashboards, les trackers de tickets, les liens de documentation que vous avez mentionnés    |

Qwen n'enregistre pas tout — seulement les choses qui seront réellement utiles la prochaine fois.

### Où ces données sont stockées

Les fichiers de l'Auto-memory se trouvent dans `~/.qwen/projects/<project>/memory/`. Toutes les branches d'un même checkout partagent le même dossier de mémoire, ainsi ce que Qwen apprend dans une branche est disponible dans les autres. Chaque worktree git lié obtient son propre dossier de mémoire, ce qui correspond à l'isolation par worktree des chats et des autres états de session — les conventions à l'échelle du dépôt que vous voulez dans chaque worktree appartiennent dans la [mémoire d'équipe](#mémoire-déquipe-partagée-avec-les-collaborateurs).

Tout ce qui est enregistré l'est en markdown brut — vous pouvez ouvrir, modifier ou supprimer n'importe quel fichier à tout moment.

`MEMORY.md` est un index compact, plutôt que le store de mémoire complet. Son corps généré et la portion chargée dans les prompts partagent une limite de 200 lignes et 25 000 unités de code UTF-16 ; les avis de troncature sont ajoutés séparément. Les fins de ligne sont normalisées avant le budgétisation du prompt. Sous pression de taille, les entrées ordinaires complètes (jusqu'à 150 unités de code) obtiennent de l'espace avant les entrées plus longues, et les entrées conservées gardent leur ordre original. Une entrée qui ne peut pas tenir est sautée entièrement, donc son lien Markdown n'est jamais coupé au milieu. Gardez les détails dans les fichiers de sujet liés.

Lorsqu'une reconstruction omet des entrées, l'avertissement sauvegardé rapporte le nombre supprimé et jusqu'à trois noms pour chaque limite : la limite de scan de fichiers de sujet et le budget du corps d'index. Les comptes restent séparés car une entrée d'équipe groupée peut représenter plusieurs fichiers. L'avertissement reste visible lorsque l'index est chargé dans un prompt tant qu'il est le dernier paragraphe du fichier. Insérez les nouveaux pointeurs d'index au-dessus de l'avertissement final pour le préserver. L'omission de l'index ne supprime pas les fichiers de sujet liés. Pour la pression du corps d'index, fusionnez les fichiers de sujet ou supprimez les obsolètes, ou raccourcissez leurs noms et descriptions de frontmatter. Un lien trop long n'a déjà pas de description : raccourcissez plutôt le chemin de son fichier de sujet ou son nom de frontmatter. Modifier uniquement l'index généré ne survit pas à la prochaine reconstruction. Pour la limite de scan de nombre de fichiers, fusionnez les fichiers de sujet ou supprimez les obsolètes ; modifier uniquement l'index généré ne réduit pas le nombre de fichiers scannés.

L'avertissement pour un index partiellement chargé distingue les budgets de lignes et de caractères. Raccourcir les descriptions peut aider avec le budget total de caractères même lorsqu'aucune entrée ne dépasse la longueur de ligne ordinaire. Pour les entrées correspondant au format généré, ce conseil prend en compte les noms et les liens, y compris les liens groupés ; supprimez ou fusionnez les entrées lorsque ces liens seuls consomment le budget. Les formats édités manuellement ou les suffixes groupés qui pourraient plutôt être du texte de description reçoivent des remèdes possibles sans promesse que le raccourcissement tiendra. Si la limite du nombre d'entrées est dépassée, les entrées doivent quand même être supprimées ou fusionnées : raccourcir une description ne réduit pas le nombre d'entrées. Lorsque les deux budgets sont dépassés, réduire l'index à 200 entrées peut encore nécessiter des descriptions plus courtes ou moins d'entrées pour respecter le budget de caractères ; l'avertissement rapporte le nombre réel de candidats. Raccourcir à 150 unités par entrée n'est pas toujours suffisant pour respecter le total de 25 000 unités.

Un avis final de writer borné et en un seul paragraphe est exclu du budgétisation du prompt. Lorsque toutes les entrées sauvegardées tiennent, Qwen préserve cet avis sans affirmer que plus d'entrées ont été omises lors du chargement. Régénérer un index saturé peut remplir l'espace libéré par des descriptions plus courtes, donc la taille du fichier sauvegardé n'a pas besoin de rétrécir immédiatement. Pour la mémoire de projet, utilisateur et d'équipe, modifiez le frontmatter `description` des fichiers de sujet et vérifiez l'index régénéré. Une description vide peut revenir au type de mémoire, donc raccourcir le frontmatter ne garantit pas que chaque entrée tiendra. Les modifications directes de lignes d'index peuvent être remplacées par la prochaine écriture gérée. Gardez les cibles de lien complètes intactes même lorsqu'un lien dépasse 150 unités ; raccourcissez plutôt les métadonnées d'affichage ou supprimez/fusionnez les fichiers de sujet au lieu de couper les liens.

#### Mémoire épinglée

Placez les documents rédigés manuellement que la maintenance automatique de la mémoire
doit préserver dans `pinned/` sous un répertoire de mémoire gérée, par exemple
`~/.qwen/projects/<project>/memory/pinned/architecture.md` ou
`~/.qwen/memories/pinned/preferences.md`. Utilisez le même frontmatter que les
autres documents de mémoire. Les fichiers épinglés valides sont lisibles par Qwen
et sont inclus lors de la prochaine reconstruction de `MEMORY.md`, dans les mêmes
limites de taille et de nombre de fichiers que les autres documents de mémoire.

Seul le répertoire `pinned/` de premier niveau directement à l'intérieur d'une
racine de mémoire gérée est protégé ; les répertoires imbriqués tels que
`memory/project/pinned/` sont de la mémoire writable ordinaire. L'extraction
automatique et les workers Dream correspondent au nom de répertoire réservé de
manière insensible à la casse.

L'extraction automatique est instruite de laisser les enregistrements épinglés
et leurs entrées d'index valides inchangés, tandis que Dream est instruit de
passer `pinned/` lors de la consolidation. L'extraction automatique et les
workers Dream forkés, y compris le nettoyage en arrière-plan, appliquent la
limite des fichiers épinglés sur leurs outils d'écriture et de modification,
y compris les chemins qui se résolvent via un lien symbolique vers `pinned/` ;
leur politique shell existante en lecture seule bloque la suppression en ligne
de commande. Vous contrôlez toujours ces fichiers directement et pouvez les
supprimer avec une requête `/forget` explicite.

> **Note :** La slash command visible `/dream` s'exécute sur l'Agent principal.
> Elle reçoit la même instruction de skip, mais ne reçoit pas encore la porte
> déterministe par tour du worker forké.

### Nettoyage périodique

Qwen parcourt périodiquement ses mémoires enregistrées pour supprimer les doublons et nettoyer les entrées obsolètes. Cela s'exécute automatiquement en arrière-plan une fois par jour après qu'un nombre suffisant de sessions a été accumulé. Vous pouvez le déclencher manuellement avec `/dream` si vous souhaitez l'exécuter maintenant.

Votre session continue normalement pendant que le nettoyage s'exécute en arrière-plan.

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

### Rappel structuré (opt-in)

Par défaut, Qwen lit la mémoire comme un index `MEMORY.md` plat. Le protocole structuré remplace cela par un arbre de mémoire hiérarchique, injecte uniquement le sous-arbre pertinent à votre demande actuelle, et donne à Qwen un outil `search_memory` pour extraire les entrées complètes à la demande — ce qui coûte moins de tokens une fois qu'une collection de mémoire dépasse une poignée de fichiers.

Il est désactivé par défaut. Activez-le dans `settings.json` (redémarrage requis) :

```json
{
  "memory": {
    "enableStructuredRecall": true
  }
}
```

ou pour une seule exécution avec `QWEN_CODE_MEMORY_STRUCTURED_RECALL=1`.

L'activer démarre une migration de métadonnées en arrière-plan : chaque fichier de mémoire gagne le frontmatter (catégorie, mots-clés, scénarios d'utilisation) dont le rappel a besoin. Il s'exécute par petits lots d'au plus 10 fichiers par tour et ne réécrit que le frontmatter, jamais le corps d'une note. Tant que le paramètre est désactivé, la migration n'est jamais planifiée, donc rien n'est réécrit et aucun appel de modèle en arrière-plan n'est effectué.

### Mémoire d'équipe (partagée avec les collaborateurs)

Par défaut, l'auto-memory est **privée pour vous** — elle se trouve dans votre répertoire home et n'est jamais partagée. La mémoire d'équipe est un niveau optionnel que toute l'équipe partage **via git**.

Lorsqu'elle est activée, Qwen dispose d'un troisième répertoire de mémoire dans `.qwen/team-memory/` **à l'intérieur du dépôt**. Il utilise la même structure d'un fichier par mémoire et le même index `MEMORY.md` que les niveaux privés. Étant donné qu'il est committé dans le dépôt, il est partagé avec chaque collaborateur de manière normale : vous faites un `git pull` pour recevoir les mémoires de vos coéquipiers et un commit/push pour partager les vôtres. Qwen y achemine les connaissances durables et globales au projet — les conventions que chaque contributeur doit suivre, les pointeurs de référence partagés (trackers, dashboards) — tandis que les notes personnelles et éphémères restent privées.

Activez-la par projet (ou globalement) dans `settings.json` :

```json
{
  "memory": {
    "enableTeamMemory": true
  }
}
```

Elle est **désactivée par défaut**. Gardez ces mises en garde à l'esprit :

- **Elle est sous contrôle de source et visible par toute personne ayant accès au dépôt.** Traitez la mémoire d'équipe comme un commit dans le dépôt.
- **Les secrets sont bloqués.** Les écritures dans `.qwen/team-memory/` sont analysées pour détecter les identifiants (clés API, tokens, clés privées) ; un secret détecté est rejeté et jamais écrit. L'analyse est une sécurité supplémentaire, pas une garantie — n'y mettez pas de données sensibles.
- **Les modifications sont vérifiables.** Les écritures de la mémoire d'équipe apparaissent dans `git status` / le diff de la PR comme n'importe quel autre fichier, elles peuvent donc être vérifiées avant d'être committées. En mode d'approbation par défaut, Qwen demande également une confirmation avant chaque écriture d'équipe ; en mode `AUTO_EDIT`/YOLO (où vous avez opté pour l'approbation automatique), elles sont appliquées sans invite mais apparaissent toujours dans le diff.
- **Le répertoire doit être suivi par git.** Si le `.gitignore` de votre projet exclut `.qwen/*`, réincluez le chemin pour qu'il puisse être partagé :

  ```gitignore
  !.qwen/team-memory/
  !.qwen/team-memory/**
  ```

  Mise en garde : utilisez la forme d'ignore par glob de fichier (`.qwen/*`), et non une forme de répertoire avec un slash final (`.qwen/`). Un ignore sous forme de répertoire fait que git ignore complètement le dossier, donc une réinclusion avec `!` en dessous est une opération nulle et le niveau d'équipe reste silencieusement vide dans git. Qwen avertit une fois au démarrage lorsque le niveau est activé mais que son répertoire est ignoré par git ou en dehors de tout dépôt git, afin que cette mauvaise configuration ne passe pas inaperçue.

`QWEN_CODE_MEMORY_TEAM=1` / `=0` remplace le paramètre pour une seule exécution.

### Synchronisation git automatique (optionnelle)

Par défaut, vous partagez la mémoire d'équipe avec le workflow git normal (`pull` pour recevoir, `commit`/`push` pour partager). Pour que Qwen le fasse pour vous, activez la synchronisation :

```json
{
  "memory": {
    "enableTeamMemory": true,
    "enableTeamMemorySync": true
  }
}
```

Lorsqu'elle est activée, au démarrage de la session, Qwen synchronise au mieux le répertoire `.qwen/team-memory/` : il reconstruit l'index partagé `MEMORY.md`, récupère en fast-forward les mises à jour des collaborateurs **en premier**, puis commite vos modifications de mémoire d'équipe par-dessus, et push **uniquement ce commit de synchronisation** (via un refspec de branche unique explicite) — ainsi l'index que vous chargez reflète le dernier état. Il **stage** uniquement le répertoire d'équipe (vos autres modifications en cours ne sont jamais committées), et ne bloque jamais la session en cas d'échec git. Désactivé par défaut. `QWEN_CODE_MEMORY_TEAM_SYNC=1` / `=0` remplace le paramètre pour une seule exécution.

Deux choses à savoir avant de l'activer :

- **Le pull en fast-forward agit sur l'ensemble de votre branche actuelle, pas seulement sur `.qwen/team-memory/`** (git n'a pas de pull limité à un chemin). La synchronisation va donc faire avancer votre branche en fast-forward jusqu'au tip distant. Le push, en revanche, est limité : il publie **uniquement le commit que cette synchronisation vient de créer**, il ne push donc jamais les autres commits non pushés que vous avez — si votre branche est déjà en avance sur l'upstream, la synchronisation commite localement et ignore le push. Activez-la sur les branches où le pull en fast-forward est acceptable — ou exécutez-la sur un checkout dédié.
- **Une branche divergente est laissée intacte** (`--ff-only` ne fusionne jamais). Lorsque cela se produit, la synchronisation ne fait simplement rien pour cette session ; résolvez la divergence (`git pull`) et elle reprend. Une branche sans upstream (pas de configuration de tracking) commite toujours localement mais ignore le push — il n'y a nulle part où pusher.

---

## Commandes

### `/memory`

Ouvre le panneau Memory. Dans Web Shell, les fichiers restent en lecture seule lorsque leur texte complet n'est pas disponible, y compris les fichiers qui dépassent la limite de contenu, les fichiers qui changent pendant une lecture, et les fichiers avec un byte-order mark ou un UTF-8 invalide. Si un fichier a changé pendant une lecture, sélectionnez à nouveau son onglet de mémoire pour réessayer.

De là, vous pouvez :

- Activer ou désactiver l'enregistrement de l'auto-memory
- Activer ou désactiver le nettoyage périodique (dream)
- Ouvrir votre QWEN.md personnel (`~/.qwen/QWEN.md`)
- Ouvrir le QWEN.md du projet
- Parcourir le dossier de l'auto-memory

### `/memory migrate-team`

Migre le niveau **mémoire d'équipe** (`.qwen/team-memory/`) vers le format de métadonnées structuré : chaque fichier gagne le frontmatter (nom, description, catégorie, mots-clés, scénarios d'utilisation) dont le rappel de mémoire a besoin. La mémoire personnelle et de projet est migrée automatiquement en arrière-plan une fois le [rappel structuré](#rappel-structuré-opt-in) activé ; la mémoire d'équipe est partagée via git, donc la réécriture s'exécute uniquement sur demande explicite et apparaît comme un commit vérifiable. Exécutez-le une fois par dépôt dans un workspace de confiance avec la mémoire d'équipe activée.

### `/init`

Génère un QWEN.md de base pour votre projet. Qwen lit votre codebase et remplit les commandes de build, les instructions de test et les conventions qu'il découvre.

### `/remember <text>`

Enregistre immédiatement quelque chose dans l'auto-memory sans attendre que Qwen le récupère automatiquement :

```
/remember toujours utiliser snake_case pour les noms de variables Python
/remember l'environnement de staging est sur staging.example.com
```

### `/forget <text>`

Supprime les entrées de l'auto-memory qui correspondent à votre description :

```
/forget ancien workaround pour le bug de login
```

### `/dream`

Exécute le nettoyage de la mémoire maintenant au lieu d'attendre la planification automatique :

```
/dream
```

---

## External Memory (`context_search`)

En plus de `QWEN.md` et de l'auto-memory, Qwen Code peut interroger des services de mémoire externes et des index de session locaux via l'outil MCP `context_search`. Contrairement à `QWEN.md` et à l'auto-memory, `context_search` est appelé par le modèle à la demande — rien n'est rappelé ou envoyé automatiquement à chaque tour :

- **Mem0 (adaptateur intégré) :** Configurez `memory.mem0` dans `~/.qwen/settings.json` pour vous connecter à Mem0 Platform V3, PolarDB, ou Mem0 OSS auto-hébergé. Voir [Mem0](./mem0.md) pour la configuration et la confirmation d'écriture optionnelle.
- **Serveurs External Context MCP Profile v1 :** Tout serveur MCP stdio ou HTTP implémentant le contrat `context_search({ query })` peut être enregistré avec `qwen mcp add` ou `mcpServers` dans `settings.json` (définissez `"includeTools": ["context_search"]` pour que seul `context_search` soit exposé pour un serveur Profile v1).

Chaque entrée enregistre son propre serveur, et plus d'un peut être actif à la fois — Qwen expose le `context_search` de chaque serveur séparément (par exemple, `mcp__external-context__context_search` et `mcp__deja-context__context_search`) et le modèle choisit entre eux, donc activez uniquement le corpus que vous voulez voir recherché, ou nommez le backend dans votre requête.

Quel que soit le backend que vous utilisez, les correspondances que `context_search` retourne sont ajoutées au contexte de Qwen et envoyées au fournisseur de modèle configuré pour la session, et les appels sont soumis à l'approbation sauf si vous les autorisez — un index local maintient la recherche locale, pas les résultats. En Auto Mode, la requête et une copie bornée des arguments vont également au modèle classifieur.

### deja-vu

Un CLI local et serveur MCP qui indexe les transcriptions de session que les agents de codage (Qwen Code, Claude Code, Codex, Cursor, et d'autres) écrivent déjà sur disque en utilisant la recherche BM25 locale, sans appels de modèle ni clés API requis pour construire ou interroger l'index.

- **Dépôt :** https://github.com/vshulcz/deja-vu
- **Coût :** Gratuit et open source (MIT)
- **Idéal pour :** Rechercher les sessions passées à travers Qwen Code et d'autres agents de codage locaux sur la même machine

#### Outils disponibles

- `context_search` — Rechercher les transcriptions de session locales indexées (`deja mcp --context-search`)

#### Configuration

1. Installez le binaire `deja` (par exemple, `brew install deja-vu`, `npm install -g @vshulcz/deja-vu`, ou depuis les [releases GitHub](https://github.com/vshulcz/deja-vu/releases)) et construisez l'index initial (`deja index`).
2. Enregistrez le serveur en utilisant l'une des méthodes ci-dessous :

**Méthode 1 : Commande CLI**

```bash
qwen mcp add deja-context deja mcp --context-search --timeout 8000 --include-tools context_search
```

**Méthode 2 : `settings.json`**

```json
{
  "mcpServers": {
    "deja-context": {
      "command": "deja",
      "args": ["mcp", "--context-search"],
      "timeout": 8000,
      "includeTools": ["context_search"]
    }
  }
}
```

3. Redémarrez Qwen Code pour que le nouveau serveur MCP soit chargé au démarrage de la session, puis exécutez `/mcp` pour confirmer que `deja-context` est connecté (voir [MCP Servers](./mcp.md)).

Pour supprimer le serveur plus tard, exécutez `qwen mcp remove deja-context` (ou supprimez l'entrée `deja-context` de `mcpServers` dans `~/.qwen/settings.json`) et redémarrez Qwen Code.

---

## Dépannage

### Qwen ne suit pas mon QWEN.md

Ouvrez `/memory` pour voir quels fichiers sont chargés. Si votre fichier n'est pas listé, Qwen ne peut pas le voir — assurez-vous qu'il se trouve à la racine du projet ou dans `~/.qwen/`.

Les instructions fonctionnent mieux lorsqu'elles sont spécifiques :

- ✓ `Utiliser une indentation de 2 espaces pour les fichiers TypeScript`
- ✗ `Formater le code correctement`

Si vous avez plusieurs fichiers QWEN.md avec des instructions contradictoires, Qwen peut avoir un comportement incohérent. Vérifiez-les et supprimez toute contradiction.

### Je veux voir ce que Qwen a enregistré

Exécutez `/memory` et sélectionnez **Open auto-memory folder**. Toutes les mémoires enregistrées sont des fichiers markdown lisibles que vous pouvez parcourir, modifier ou supprimer.

### Qwen continue d'oublier des choses

Si l'auto-memory est activée mais que Qwen ne semble pas se souvenir des choses d'une session à l'autre, essayez d'exécuter `/dream` pour forcer un passage de nettoyage. Vérifiez également `/memory` pour confirmer que les deux interrupteurs sont activés.

Pour les choses dont vous voulez toujours que Qwen se souvienne, ajoutez-les plutôt à QWEN.md — l'auto-memory fait au mieux, QWEN.md est garanti.