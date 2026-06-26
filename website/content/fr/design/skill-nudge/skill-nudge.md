# AutoSkill : Document de conception du système de raffinage automatique des compétences

## Aperçu

Ce document décrit le plan d’extension de l’architecture Memory-Dream existante de QwenCode avec la capacité **AutoSkill**.

AutoSkill est un **mécanisme de raffinage automatique de la mémoire procédurale** : lorsqu’un agent termine une tâche intensive en appels d’outils, le système évalue en arrière-plan si le flux d’opérations mérite d’être réutilisé et le sauvegarde automatiquement en tant que skill au niveau du projet.

### Différence de positionnement avec Memory Extract

| Dimension           | Memory Extract                                     | AutoSkill                                          |
| ------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **Type de mémoire** | Mémoire déclarative (qui est l’utilisateur, contexte projet) | Mémoire procédurale (comment faire un type de tâche) |
| **Déclencheur**     | Après chaque session                               | Seuil d’appels d’outils dans la session            |
| **Cible d’écriture**| `${projectRoot}/.qwen/memory/`                     | `${projectRoot}/.qwen/skills/`                     |
| **Nature du contenu**| Préférences utilisateur, contexte projet, règles de feedback | Étapes d’opération réutilisables, meilleures pratiques |
| **Cycle de vie**    | Intégration/taille régulière par Dream             | Mise à jour à la demande, maintenue par review agent |

---

## Principes de conception fondamentaux

1. **Pas d’outil d’écriture dédié** : le skill review agent utilise directement les outils génériques `read_file`, `write_file`, `edit` pour manipuler `.qwen/skills/`, sans introduire d’outil `skill_manage` dédié. De même pour la session principale : si l’utilisateur veut maintenir manuellement un skill, il utilise les mêmes outils génériques.
2. **Détection de modification de skill au lieu de réinitialisation du compteur d’outils** : en s’inspirant de la détection de l’appel à `memory_tool` par memory extract, le système détecte si une opération d’écriture dans la session principale tombe dans le répertoire `.qwen/skills/`. Si oui, cela signifie que l’utilisateur a déjà manipulé un skill dans cette session, et la review automatique est sautée en fin de session.
3. **Marqueur `auto-skill` protégeant les skills créés par l’utilisateur** : les skills créés par le review agent doivent obligatoirement contenir `source: auto-skill` dans leur frontmatter YAML. Le skill review agent ne peut modifier que les skills portant ce marqueur, et ne doit pas toucher aux skills créés manuellement par l’utilisateur.
4. **Déclenchement par densité d’appels d’outils** : ne se déclenche que lorsque le nombre cumulé d’appels d’outils dans la session est ≥ 20, garantissant un raffinage uniquement après des tâches véritablement complexes.
5. **Limites d’écriture clairement définies** : le gestionnaire de permissions du review agent restreint `write_file` et `edit` à `${projectRoot}/.qwen/skills/`, ne peut pas toucher aux couches user / extension / bundled.
6. **Conservation maximale du prompt Hermes core** : le prompt utilisé par le review agent est directement dérivé de `_SKILL_REVIEW_PROMPT` de Hermes, avec seulement une adaptation minimale.

---

## Modifications architecturales

### 1. Compteurs : `toolCallCount` et détection de modification de skill

Deux grandeurs parallèles sont maintenues dans l’état de la session :

**Compteur d’appels d’outils** (détermine si le skill review est déclenché) :

```
Session démarrée
  toolCallCount = 0

Chaque appel d’outil terminé
  toolCallCount += 1

Session terminée
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // par défaut 20
    Vérifier skillsModifiedInSession
    ├─ true  → skip (cette session a déjà manipulé manuellement un skill, pas de review auto)
    └─ false → scheduleSkillReview()
```

**Détection de modification de skill** (remplace la réinitialisation précédente via `skill_manage`) :

```
Chaque appel d’outil terminé
  if (le chemin cible de l’outil est sous ${projectRoot}/.qwen/skills/):
    skillsModifiedInSession = true
```

Logique de détection : analyser les chemins de fichiers impliqués dans les résultats des appels d’outils, déterminer s’ils tombent dans le répertoire skills. L’implémentation suit le modèle de `historyCallsSkillManage()` — parcourir les résultats d’outils dans `history`, extraire les chemins cibles des opérations d’écriture (`write_file`, `edit`) et faire une correspondance de préfixe.

> **Pourquoi utiliser la détection de modification de skill plutôt que la détection par nom d’outil ?**
> Il n’y a plus d’outil `skill_manage` dédié ; la session principale et le review agent utilisent tous deux `write_file`/`edit` génériques. La dimension de détection passe donc de « l’outil dédié a-t-il été appelé ? » à « une opération d’écriture tombe-t-elle sous `.qwen/skills/` ? », ce qui est sémantiquement plus précis : dès que l’utilisateur a activement manipulé un fichier skill dans cette session, la review automatique est sautée.

> **Pourquoi utiliser le nombre d’appels d’outils plutôt que le nombre de tours de conversation ?**
> Le nombre d’appels d’outils reflète la complexité de la tâche — un seul message utilisateur peut déclencher 1 ou 30 appels d’outils. Une densité élevée d’appels signifie plus d’essais, d’ajustements de stratégie, etc., et donc une probabilité plus élevée d’extraire des connaissances réutilisables. Le seuil de 20 est plus conservateur que celui de Hermes (10), car QwenCode a généralement une granularité d’appels d’outils plus fine (par exemple, édition ligne par ligne).

### 2. Point d’orchestration

Le point d’appel existant de `MemoryManager` (fin de session) sert de point d’entrée unifié, étendu pour pouvoir également planifier un skill review.

```
Session terminée
  ├─ scheduleExtract(params)           // logique existante inchangée
  └─ scheduleSkillReview(params)       // nouveau
       Condition : toolCallCount >= AUTO_SKILL_THRESHOLD
                  && !skillsModifiedInSession
```

extract et skill review sont chacun planifiés indépendamment, exécutés en parallèle via `MemoryManager.track()`, sans blocage mutuel.

### 3. Droits d’accès aux outils du Skill Review Agent

Le skill review agent **n’utilise pas** d’outil `skill_manage` dédié, mais directement les outils fichier génériques :

| Outil        | Utilisation                                              | Limites de portée                                                                    |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `read_file`  | Lire le contenu d’un skill existant, vérifier le frontmatter | Aucune limite                                                                        |
| `ls`         | Analyser la structure du répertoire `.qwen/skills/`      | Aucune limite                                                                        |
| `write_file` | Créer un nouveau fichier skill                           | Uniquement dans `${projectRoot}/.qwen/skills/`                                       |
| `edit`       | Modifier le contenu d’un skill existant                  | Uniquement dans `${projectRoot}/.qwen/skills/`, et le fichier cible doit contenir `source: auto-skill` |
| `shell`      | Commandes en lecture seule (ex. `cat`, `find`)           | Commandes en lecture seule uniquement (analyse statique Shell AST)                   |

**Contrainte supplémentaire sur `edit` (protection `auto-skill`)** :

Avant d’exécuter `edit` ou `write_file` (écrasement d’un fichier existant), le gestionnaire de permissions du skill review agent lit le frontmatter YAML du fichier cible et vérifie le champ `source: auto-skill`. Si ce champ est absent, l’écriture est refusée et une erreur est renvoyée :

```
skill_review_agent: edit n'est autorisé que sur les skills avec 'source: auto-skill' dans le frontmatter.
Ce skill semble avoir été créé par l'utilisateur. Modifiez-le manuellement ou demandez à l'utilisateur.
```

Cette vérification est implémentée au niveau des permissions de `createSkillScopedAgentConfig`, et non uniquement dans le system prompt, pour garantir que même si le modèle se trompe, il n’écrasera pas les skills créés manuellement.

**Accès aux outils dans la session principale** : L’agent principal n’a pas de restriction sur les lectures/écritures dans `.qwen/skills/` — l’utilisateur peut gérer ses skills via les instructions normales `write_file`/`edit`. Ces opérations déclenchent `skillsModifiedInSession = true`, ce qui empêche le déclenchement automatique du skill review en fin de session.

### 4. Bac à sable de permissions : `SkillScopedPermissionManager`

En s’inspirant de `createMemoryScopedAgentConfig` dans `extractionAgentPlanner.ts`, on crée un périmètre de permissions dédié pour le skill review agent :

```typescript
// Opérations autorisées pour le skill review agent
read_file:    aucune restriction de chemin (besoin de lire des fichiers arbitraires pour comprendre le contexte du projet)
ls:           aucune restriction de chemin
shell:        commandes en lecture seule (analyse statique Shell AST, réutilisation de isShellCommandReadOnlyAST existante)
write_file:   uniquement les fichiers sous ${projectRoot}/.qwen/skills/ (création de nouveaux skills)
edit:         uniquement dans ${projectRoot}/.qwen/skills/, et le fichier cible doit contenir source: auto-skill
```

**Niveaux d’implémentation de la protection `auto-skill`** :

1. **Couche gestionnaire de permissions** (contrainte dure) : avant `edit`, lire le frontmatter ; refuser si `source: auto-skill` absent
2. **Couche system prompt** (contrainte souple) : indiquer explicitement à l’agent qu’il ne peut modifier que les skills marqués `source: auto-skill`
3. **Double sécurité** : même si la contrainte du system prompt est contournée, le gestionnaire de permissions l’interceptera

---

## Conception du Skill Review Agent

### Prompt de déclenchement (porté depuis Hermes, adaptation minimale)

```
Review the conversation above and consider saving or updating a skill if appropriate.

Focus on: was a non-trivial approach used to complete a task that required trial
and error, or changing course due to experiential findings along the way, or did
the user expect or desire a different method or outcome? If a relevant skill
already exists and has 'source: auto-skill' in its frontmatter, update it with
what you learned. Otherwise, create a new skill if the approach is reusable.

IMPORTANT constraints:
- You may ONLY modify skill files that contain 'source: auto-skill' in their
  YAML frontmatter. Always read a skill file before editing it.
- Do NOT touch skills that lack this marker — they were created by the user.
- When creating a new skill, you MUST include 'source: auto-skill' in the
  frontmatter so future review agents can safely update it.
- Do NOT delete any skill. Only create or update.

If nothing is worth saving, just say 'Nothing to save.' and stop.

Skills are saved to the current project (.qwen/skills/).
Use write_file to create a new skill, edit to update an existing auto-skill.
Each skill lives at .qwen/skills/<name>/SKILL.md with YAML frontmatter:

---
name: <skill-name>
description: <one-line description>
metadata:
  source: auto-skill
  extracted_at: '<ISO-8601 timestamp>'
---

<markdown body with the procedure/approach>
```

### Configuration de l’agent

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // lire le contenu d’un skill existant, vérifier source: auto-skill
    "ls",          // analyser le répertoire .qwen/skills/
    "write_file",  // créer un nouveau fichier skill (gestionnaire de permissions limitant le chemin)
    "edit",        // modifier un auto-skill existant (gestionnaire de permissions vérifiant le frontmatter)
    "shell",       // commandes en lecture seule (ex. find, cat)
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // transmettre un snapshot complet de l’historique de la session
}
```

---

## Intégration avec le MemoryManager existant

### `ScheduleSkillReviewParams` (nouveau type)

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // snapshot complet de l’historique de la session
  toolCallCount: number; // nombre d’appels d’outils dans cette session
  skillsModified: boolean; // une opération d’écriture est-elle tombée dans .qwen/skills/ dans cette session ?
  config?: Config;
  enabled?: boolean;
  threshold?: number;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface SkillReviewScheduleResult {
  status: 'scheduled' | 'skipped';
  taskId?: string;
  skippedReason?: 'below_threshold' | 'skills_modified_in_session' | 'disabled';
}
```

### `MemoryManager.scheduleSkillReview()` (nouvelle méthode)

```typescript
scheduleSkillReview(params: ScheduleSkillReviewParams): SkillReviewScheduleResult {
  // 1. Barrière de configuration
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. Vérification du seuil
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. Si un skill a été activement manipulé dans cette session, sauter la review auto
  if (params.skillsModified) {
    return { status: 'skipped', skippedReason: 'skills_modified_in_session' };
  }

  // 4. Planification indépendante
  const record = makeTaskRecord('skill-review', params.projectRoot, params.sessionId);
  const promise = this.track(record.id, this.runSkillReview(record, params));
  return { status: 'scheduled', taskId: record.id, promise };
}
```

### Extension du type de tâche

```typescript
// Extension de MemoryTaskRecord.taskType
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// Constante
export const AUTO_SKILL_THRESHOLD = 20; // seuil du nombre d’appels d’outils
```

---

## Flux de données

```
Session en cours
  Boucle principale de l’agent
    ├─ chaque appel d’outil → toolCallCount += 1
    └─ si le chemin cible de l’opération d’écriture est sous ${projectRoot}/.qwen/skills/
         → skillsModifiedInSession = true

Session terminée (événement sessionEnd)
  ├─ scheduleExtract(params)
  │     └─ [logique existante : fork de l’extraction agent → écriture dans .qwen/memory/]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ non → skip (densité insuffisante OU skill manipulé manuellement dans cette session)
       └─ oui → scheduleSkillReview(params)
                  └─ fork indépendant du skill review agent
                         ↓
                  Skill review agent (max 8 tours, 2 min, permissions en bac à sable)
                   Outils : read_file, ls, write_file, edit, shell
                   sessionHistory complète transmise
                         ↓
                  Le modèle détermine s’il existe une approche réutilisable
                  ├─ oui → lire le skill existant (vérifier source: auto-skill)
                  │         → write_file pour créer un nouveau skill (avec source: auto-skill)
                  │         → edit pour mettre à jour un auto-skill existant
                  │         → Invalidation du cache de SkillManager (notifyChangeListeners)
                  └─ non → "Nothing to save." fin

Session suivante
  SkillManager.listSkills({ level: 'project' })
  → Scanner .qwen/skills/ pour découvrir les nouveaux skills
  → Injection dans le bloc <available_skills> du system prompt (Tier 1)
```

---

## Convention de format SKILL.md (niveau projet)

Les skills raffinés automatiquement sont écrits dans `${projectRoot}/.qwen/skills/<name>/SKILL.md`, au format totalement compatible avec le SkillManager existant :

```yaml
---
name: <skill-name> # obligatoire, minuscules + traits d’union
description: <description> # obligatoire, ≤ 1024 caractères
version: 1.0.0
metadata:
  source: auto-skill # obligatoire (forcé à l’écriture lors de la création par le review agent)
  extracted_at: '2026-04-24T12:00:00Z'
---
# <titre du skill>

<étapes d’opération / meilleures pratiques / notes importantes>
```

**Sémantique de contrainte de `source: auto-skill`** :

| Valeur du marqueur | Créateur                    | Modifiable par le skill review agent ? | Modifiable par l’utilisateur ? |
| ------------------ | --------------------------- | -------------------------------------- | ------------------------------ |
| `auto-skill`       | review agent                | ✅ Oui                                 | ✅ Oui                         |
| Absent             | Utilisateur (création manuelle) | ❌ Non (interception par le gestionnaire de permissions) | ✅ Oui |

Si un utilisateur ajoute lui-même `source: auto-skill` à un skill qu’il a créé, cela signifie qu’il autorise le review agent à le mettre à jour automatiquement ultérieurement.

---

## Considérations de sécurité

| Risque                                                    | Mesure d’atténuation                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Le raffinage automatique écrase un skill soigneusement écrit par l’utilisateur | Le gestionnaire de permissions lit le frontmatter, refuse `edit` si `source: auto-skill` absent ; le system prompt précise également que seuls les auto-skill peuvent être modifiés |
| Croissance infinie des skills                             | Le prompt de review demande explicitement de « mettre à jour un skill existant en priorité » ; mettre à jour plutôt que créer            |
| Écriture en dehors du chemin du projet                    | Les permissions `write_file`/`edit` sont limitées à `${projectRoot}/.qwen/skills/` ; `assertRealProjectSkillPath` rejette les traversées de symlink |
| Raffinage de contenu à risque d’injection                 | Réutilisation de la logique existante de vérification de sécurité du contenu                                                             |
| Le review agent supprime un skill                         | L’ensemble d’outils du review agent ne contient pas d’opération de suppression (pas de `rm`, pas d’opération d’écriture `shell`) ; le system prompt interdit explicitement la suppression |
| Le review agent se déclenche après une manipulation manuelle de skill dans la session principale | Détection `skillsModifiedInSession` : si une opération d’écriture dans la session principale tombe sous `.qwen/skills/`, la review est sautée |
| Traversée de symlink pour écrire hors du répertoire skills | `assertRealProjectSkillPath` (async) : utilise `fs.realpath()` pour résoudre le chemin réel, n’autorise l’écriture que si le chemin réel est dans la racine skills réelle |

---

## Options de configuration

Ajout des options suivantes dans la configuration de QwenCode (optionnelles, avec valeurs par défaut) :

```typescript
// Nouveau dans le schéma de config (sous memory)
memory?: {
  enableAutoSkill?: boolean;   // par défaut true
}
```

Exemple de configuration dans QWEN.md / `~/.qwen/config.json` :

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## Liste de tests E2E

Une fois la fonctionnalité implémentée, suivre la procédure de `.qwen/skills/e2e-testing/SKILL.md`, d’abord exécuter `npm run build && npm run bundle`, puis utiliser le build local `node dist/cli.js` pour une validation de bout en bout.

### 1. Faible densité d’appels d’outils ne déclenche pas

- Utiliser un répertoire de projet temporaire en mode headless.
- Configurer `memory.enableAutoSkill: true`.
- Exécuter une tâche simple nécessitant peu d’appels d’outils et terminer la session normalement.
- Vérifier qu’aucun nouveau skill avec `source: auto-skill` n’a été créé dans `.qwen/skills/` ; qu’aucune opération d’écriture dans `.qwen/skills/` n’apparaît dans le flux JSON.

### 2. Déclenchement après atteinte du seuil de skill review

- Utiliser un répertoire de projet temporaire en mode headless (`AUTO_SKILL_THRESHOLD` codé en dur à 20, peut être abaissé dans un dispositif de test).
- Envoyer une tâche nécessitant de nombreux appels d’outils et contenant un flux réutilisable.
- Vérifier que le skill review a été planifié après la fin de la session ; si le modèle juge utile de sauvegarder, `.qwen/skills/<name>/SKILL.md` est créé avec `source: auto-skill` dans le frontmatter.
- Si le modèle répond « Nothing to save. », vérifier que le processus se termine normalement sans erreur de permissions.

### 3. Session principale manipule un skill : review sautée

- Construire une session où, tout en atteignant le seuil d’appels d’outils, un `write_file` ou `edit` écrit dans un fichier sous `.qwen/skills/` (simuler une gestion manuelle par l’utilisateur).
- Vérifier qu’en fin de session `skillsModifiedInSession = true` et que `scheduleSkillReview` retourne `skippedReason: 'skills_modified_in_session'`.
- Vérifier qu’aucun review agent n’est lancé, évitant une double écriture.

### 4. Protection d’écriture : seuls les skills au niveau projet sont autorisés

- Tenter d’écrire via le skill review agent dans un chemin hors projet, un chemin de skill au niveau utilisateur ou un chemin de skill bundled.
- Vérifier que l’écriture est refusée avec un message d’erreur indiquant que seuls les chemins sous `${projectRoot}/.qwen/skills/` sont autorisés.
- Vérifier que l’écriture dans `${projectRoot}/.qwen/skills/<name>/SKILL.md` est autorisée.

### 5. Le marqueur `auto-skill` protège les skills créés par l’utilisateur

- Prépositionner dans `.qwen/skills/` un skill créé par l’utilisateur sans `source: auto-skill`.
- Déclencher le skill review agent et l’inciter à tenter de modifier ce skill.
- Vérifier que l’écriture est refusée par le gestionnaire de permissions avec un message indiquant que le skill n’est pas un auto-skill.
- Vérifier qu’un skill avec `source: auto-skill` dans le même répertoire peut être mis à jour normalement.

### 6. Traversée de symlink refusée

- Créer un symlink sous `.qwen/skills/` pointant vers un répertoire hors projet.
- Déclencher le skill review agent en tentant d’écrire dans ce chemin de symlink.
- Vérifier que `assertRealProjectSkillPath` refuse l’écriture avec une erreur « symlink traversal detected ».

### 7. Activation/désactivation par configuration

- Configurer `memory.enableAutoSkill: false` : même si le nombre d’appels d’outils dépasse le seuil, aucun déclenchement.
- Vérifier que l’activation par défaut ( `enableAutoSkill` non configuré ou `true` ) déclenche normalement lorsque le seuil est atteint.

### 8. Validation avec le build local

- Utiliser le skill e2e-testing avec une sortie JSON headless :
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`.
- Si nécessaire, ajouter `--openai-logging --openai-logging-dir <tmp-dir>` pour vérifier le schéma des outils, le prompt et la configuration des permissions dans le corps de la requête.
- Pour les scénarios impliquant l’état visible de TUI ou sessionEnd, utiliser un flux interactif tmux pour capturer la sortie finale.

## Relations avec le système existant

```
MemoryManager existant
  ├─ scheduleExtract()       ← inchangé
  ├─ scheduleDream()         ← inchangé
  ├─ recall()                ← inchangé
  ├─ forget()                ← inchangé
  └─ scheduleSkillReview()   ← nouveau (ce document)

SkillManager existant
  ├─ listSkills()            ← inchangé (découverte automatique des nouveaux fichiers sous .qwen/skills/)
  └─ loadSkill()             ← inchangé

Outils fichier existants (read_file / write_file / edit)
  ├─ Dans la session principale : l’utilisateur peut gérer manuellement les skills via ces outils
  │   └─ opération d’écriture sous .qwen/skills/ → skillsModifiedInSession = true
  └─ Dans le skill review agent : utilisés directement pour créer/mettre à jour des auto-skill
      └─ gestionnaire de permissions limitant le chemin + vérification source: auto-skill

Point de déclenchement (hook sessionEnd existant)
  └─ Appelle simultanément scheduleExtract + scheduleSkillReview (si condition remplie)
```

Le côté lecture de SkillManager (`listSkills`, `loadSkill`) ne nécessite aucune modification — une fois que le review agent a écrit dans `${projectRoot}/.qwen/skills/`, `SkillManager` détecte automatiquement le changement via le watcher de fichiers `chokidar` existant, appelle `notifyChangeListeners()` pour déclencher un rafraîchissement du cache, et le nouveau skill sera naturellement visible dans le system prompt de la session suivante.