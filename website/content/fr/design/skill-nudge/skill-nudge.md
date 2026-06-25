# AutoSkill : Conception du système de distillation automatique de compétences

## Aperçu

Ce document décrit la conception de l'ajout de la capacité **AutoSkill** dans l'architecture Memory-Dream existante de QwenCode.

AutoSkill est un **mécanisme de distillation automatique de la mémoire procédurale** : lorsqu'un agent termine une tâche intensive en appels d'outils, le système évalue en arrière-plan si le flux d'opérations de cette session mérite d'être réutilisé et l'enregistre automatiquement en tant que skill au niveau du projet.

### Différences de positionnement avec Memory Extract

| Dimension        | Memory Extract                          | AutoSkill                                      |
| ---------------- | --------------------------------------- | ---------------------------------------------- |
| **Type de mémoire** | Mémoire déclarative (qui est l'utilisateur, contexte du projet) | Mémoire procédurale (comment faire un type de tâche) |
| **Déclenchement**   | Après chaque session                    | Seuil d'appels d'outils dans la session        |
| **Destination**     | `${projectRoot}/.qwen/memory/`         | `${projectRoot}/.qwen/skills/`                 |
| **Nature du contenu** | Préférences utilisateur, contexte projet, règles de feedback | Étapes d'opération réutilisables, bonnes pratiques |
| **Cycle de vie**    | Consolidation/élagage réguliers par Dream | Mise à jour à la demande, maintenu par l'agent de revue |

---

## Principes de conception fondamentaux

1. **Pas d'outil dédié à l'écriture** : l'agent de revue des skills utilise directement les outils génériques `read_file`, `write_file` et `edit` pour opérer dans `.qwen/skills/`, sans introduire d'outil `skill_manage` dédié. Idem pour la session principale — si l'utilisateur souhaite gérer manuellement les skills, il utilise les mêmes outils génériques.
2. **Détection des modifications de skills au lieu d'un compteur de reset d'outil** : comme Memory Extract détecte les appels à `memory_tool`, le système détecte si une opération d'écriture dans la session principale tombe dans `.qwen/skills/`. Si c'est le cas, cela signifie que l'utilisateur a déjà manipulé les skills activement dans cette session, et la revue automatique est ignorée à la fin de la session.
3. **Marquage `auto-skill` protégeant les skills créés par l'utilisateur** : tout skill créé par l'agent de revue doit contenir `source: auto-skill` dans son frontmatter YAML. L'agent de revue ne peut modifier que les skills portant ce marquage, et ne doit pas toucher aux skills créés manuellement par l'utilisateur.
4. **Déclenchement par densité d'appels d'outils** : ne se déclenche que si le nombre total d'appels d'outils dans la session atteint ≥ 20, garantissant que la distillation ne se produit qu'après des tâches réellement complexes.
5. **Limites de protection d'écriture claires** : le gestionnaire de permissions de l'agent de revue restreint `write_file` et `edit` à `${projectRoot}/.qwen/skills/`, sans pouvoir toucher aux couches utilisateur / extension / bundle.
6. **Conservation maximale du prompt Hermes central** : le prompt utilisé par l'agent de revue provient directement de `_SKILL_REVIEW_PROMPT` d'Hermes, avec une adaptation minimale.

---

## Changements architecturaux

### 1. Compteurs : `toolCallCount` et détection des modifications de skills

Maintenir deux métriques parallèles dans l'état de session :

**Compteur d'appels d'outils** (détermine s'il faut déclencher la revue) :

```
Début de session
  toolCallCount = 0

Chaque appel d'outil terminé
  toolCallCount += 1

Fin de session
  if (toolCallCount >= AUTO_SKILL_THRESHOLD):  // défaut 20
    Vérifier skillsModifiedInSession
    ├─ true → ignorer (skills déjà manipulés manuellement, pas de revue auto)
    └─ false → scheduleSkillReview()
```

**Détection de modifications de skills** (remplace l'ancien reset par appel à `skill_manage`) :

```
Chaque appel d'outil terminé
  si (le chemin cible de l'outil est sous ${projectRoot}/.qwen/skills/) :
    skillsModifiedInSession = true
```

Logique de détection : analyser les chemins de fichiers dans les résultats d'appels d'outils, déterminer s'ils se trouvent sous le répertoire skills. Implémentation : se référer au modèle `historyCallsSkillManage()` — parcourir les résultats d'outils dans l'historique, extraire les chemins cibles des opérations d'écriture (`write_file`, `edit`) et effectuer une correspondance de préfixe.

> **Pourquoi utiliser la détection de modifications de skills plutôt que la détection de noms d'outils ?**
> Il n'y a plus d'outil dédié `skill_manage` ; la session principale et l'agent de revue utilisent tous les deux `write_file`/`edit` génériques. La dimension de détection passe donc de « un outil spécifique a-t-il été appelé ? » à « une opération d'écriture a-t-elle eu lieu dans `.qwen/skills/` ? », ce qui est sémantiquement plus précis : si l'utilisateur a déjà manipulé un fichier de skills au cours de cette session, la revue automatique est ignorée.

> **Pourquoi utiliser le nombre d'appels d'outils plutôt que le nombre de tours de dialogue ?**
> Le nombre d'appels d'outils reflète la complexité de la tâche — un message utilisateur peut déclencher 1 ou 30 appels d'outils. Une densité d'appels élevée signifie davantage d'essais/erreurs, d'ajustements de stratégie, etc., donc une probabilité plus élevée de produire une expérience réutilisable. Le seuil de 20 est plus conservateur que les 10 d'Hermes, car QwenCode a généralement une granularité d'appels d'outils plus fine (par exemple, des `edit` ligne par ligne).

### 2. Point d'ordonnancement

Le point d'appel existant de `MemoryManager` (fin de session) sert de point d'entrée unifié, étendu pour pouvoir également ordonnancer la revue de skills.

```
Fin de session
  ├─ scheduleExtract(params)           // logique existante inchangée
  └─ scheduleSkillReview(params)       // nouveau
       Condition : toolCallCount >= AUTO_SKILL_THRESHOLD
                  && !skillsModifiedInSession
```

L'extraction et la revue de skills sont ordonnancées indépendamment, exécutées en parallèle via `MemoryManager.track()`, sans blocage mutuel.

### 3. Droits d'accès aux outils de l'agent Skill Review

L'agent de revue **n'utilise pas** l'outil dédié `skill_manage`, mais directement les outils génériques de fichiers :

| Outil        | Usage                                        | Restriction de portée                                                    |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------ |
| `read_file`  | Lire le contenu d'un skill existant, vérifier le frontmatter | Aucune restriction                                                       |
| `ls`         | Scanner la structure du répertoire `.qwen/skills/` | Aucune restriction                                                       |
| `write_file` | Créer un nouveau fichier de skill            | Uniquement dans `${projectRoot}/.qwen/skills/`                           |
| `edit`       | Modifier le contenu d'un skill existant      | Uniquement dans `${projectRoot}/.qwen/skills/`, et le fichier cible doit contenir `source: auto-skill` |
| `shell`      | Commandes en lecture seule (ex: `cat`, `find`) | Uniquement commandes en lecture seule (analyse statique Shell AST)       |

**Contrainte supplémentaire sur `edit` (protection `auto-skill`)** :

Avant d'exécuter `edit` ou `write_file` (écrasement d'un fichier existant), le gestionnaire de permissions de l'agent de revue lit le frontmatter YAML du fichier cible et vérifie la présence du champ `source: auto-skill`. Si ce champ est absent, l'écriture est refusée et une erreur est renvoyée :

```
skill_review_agent : edit n'est autorisé que sur les skills avec 'source: auto-skill' dans le frontmatter.
Ce skill semble avoir été créé par l'utilisateur. Modifiez-le manuellement ou demandez à l'utilisateur.
```

Cette vérification est effectuée au niveau des permissions de `createSkillScopedAgentConfig`, pas seulement par un prompt système, garantissant que même si le modèle commet une erreur, les skills créés manuellement ne seront pas écrasés.

**Accès aux outils dans la session principale** : la session principale n'impose aucune restriction de lecture/écriture sur `.qwen/skills/` — l'utilisateur peut gérer les skills via les instructions normales `write_file`/`edit`. De telles opérations déclenchent `skillsModifiedInSession = true`, ce qui entraîne l'ignorance de la revue automatique en fin de session.

### 4. Bac à sable de permissions : `SkillScopedPermissionManager`

Sur le modèle de `createMemoryScopedAgentConfig` dans `extractionAgentPlanner.ts`, créer une portée de permissions dédiée pour l'agent de revue de skills :

```typescript
// Opérations autorisées pour l'agent de revue
read_file :    pas de restriction de chemin (doit lire des fichiers arbitraires pour comprendre le contexte du projet)
ls :           pas de restriction de chemin
shell :        commandes en lecture seule (analyse statique Shell AST, réutilisation de isShellCommandReadOnlyAST existant)
write_file :   uniquement sous ${projectRoot}/.qwen/skills/ (créer un nouveau skill)
edit :         uniquement sous ${projectRoot}/.qwen/skills/, et le fichier cible doit contenir source: auto-skill
```

**Implémentation de la protection `auto-skill`** :

1. **Couche gestionnaire de permissions** (contrainte dure) : avant `edit`, lire le frontmatter, refuser si `source: auto-skill` manquant
2. **Couche prompt système** (contrainte souple) : informer explicitement l'agent qu'il ne peut modifier que les skills marqués `source: auto-skill`
3. **Double protection** : même si la contrainte du prompt système est contournée, le gestionnaire de permissions l'intercepte.
---

## Conception de l'Agent de Révision de Compétences

### Prompt déclencheur (porté depuis Hermes, adaptation minimale)

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

### Configuration de l'Agent

```typescript
{
  name: "managed-skill-extractor",
  tools: [
    "read_file",   // Lire le contenu d'une compétence existante, vérifier source: auto-skill
    "ls",          // Scanner le répertoire .qwen/skills/
    "write_file",  // Créer un nouveau fichier de compétence (le gestionnaire de permissions limite le chemin)
    "edit",        // Modifier une compétence auto existante (le gestionnaire de permissions vérifie le frontmatter)
    "shell",       // Commandes en lecture seule (ex: find, cat)
  ],
  permissionManager: createSkillScopedAgentConfig(config, projectRoot),
  history: sessionHistory,  // Transmettre l'instantané complet de l'historique de la session
}
```

---

## Intégration avec le MemoryManager existant

### `ScheduleSkillReviewParams` (nouveau type)

```typescript
export interface ScheduleSkillReviewParams {
  projectRoot: string;
  sessionId: string;
  history: Content[]; // Instantané complet de l'historique de la session
  toolCallCount: number; // Nombre d'appels d'outils dans cette session
  skillsModified: boolean; // Indique si une opération d'écriture a été effectuée dans .qwen/skills/ au cours de cette session
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
  // 1. Contrôle de la configuration
  if (params.enabled === false) {
    return { status: 'skipped', skippedReason: 'disabled' };
  }

  // 2. Vérification du seuil
  const threshold = params.threshold ?? AUTO_SKILL_THRESHOLD;
  if (params.toolCallCount < threshold) {
    return { status: 'skipped', skippedReason: 'below_threshold' };
  }

  // 3. Si une compétence a été activement modifiée dans cette session, ignorer la révision automatique
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
// Étendre le MemoryTaskRecord.taskType existant
export type MemoryTaskType = 'extract' | 'dream' | 'skill-review';

// Constante
export const AUTO_SKILL_THRESHOLD = 20; // Seuil du nombre d'appels d'outils
```

---

## Flux de données

```
Session en cours
  Boucle principale de l'agent
    ├─ Chaque appel d'outil → toolCallCount += 1
    └─ Si le chemin cible de l'opération d'écriture est sous ${projectRoot}/.qwen/skills/
         → skillsModifiedInSession = true

Fin de session (événement sessionEnd)
  ├─ scheduleExtract(params)
  │     └─ [Logique existante : fork extraction agent → écriture dans .qwen/memory/]
  │
  └─ toolCallCount >= 20 && !skillsModifiedInSession ?
       ├─ Non → ignorer (densité insuffisante ou compétence déjà modifiée manuellement dans cette session)
       └─ Oui → scheduleSkillReview(params)
                  └─ fork indépendant de skill review agent
                         ↓
                  Agent de révision de compétences (max 8 tours, 2 min, permissions sandbox)
                  Outils : read_file, ls, write_file, edit, shell
                  Transfert de l'instantané complet de l'historique de session
                         ↓
                  Le modèle détermine s'il existe une méthode réutilisable
                  ├─ Oui → Lire la compétence existante (vérifier source: auto-skill)
                  │         → write_file pour créer une nouvelle compétence (avec source: auto-skill)
                  │         → edit pour mettre à jour une compétence auto existante
                  │         → Invalidation du cache de SkillManager (notifyChangeListeners)
                  └─ Non → Terminer avec "Nothing to save."

Session suivante
  SkillManager.listSkills({ level: 'project' })
  → Scanner .qwen/skills/ pour détecter les nouvelles compétences créées
  → Injecter le bloc <available_skills> dans le prompt système (Tier 1)
```

---

## Conventions de format SKILL.md (project-level)

Les compétences extraites automatiquement sont écrites dans `${projectRoot}/.qwen/skills/<name>/SKILL.md`, au format totalement compatible avec le SkillManager existant :

```yaml
---
name: <skill-name> # Obligatoire, minuscules + tirets
description: <description> # Obligatoire, ≤ 1024 caractères
version: 1.0.0
metadata:
  source: auto-skill # Obligatoire (forcé lors de la création par l'agent de révision)
  extracted_at: '2026-04-24T12:00:00Z'
---
# <Titre de la compétence>

<Étapes de procédure / Bonnes pratiques / Notes importantes>
```
**Sémantique de contrainte de `source: auto-skill`** :

| Valeur du champ | Créé par                | Modifiable par l'agent de révision de skill ? | Modifiable par l'utilisateur ? |
| --------------- | ----------------------- | --------------------------------------------- | ------------------------------ |
| `auto-skill`    | agent de révision       | ✅ Oui                                        | ✅ Oui                         |
| Absent          | Utilisateur créé manuellement | ❌ Non (intercepté par le gestionnaire de permissions) | ✅ Oui                         |

Si un utilisateur ajoute `source: auto-skill` à un skill qu'il a créé lui-même, cela signifie qu'il autorise l'agent de révision à le mettre à jour automatiquement par la suite.

---

## Considérations de sécurité

| Risque                                              | Mesure d'atténuation                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| L'extraction automatique écrase un skill soigneusement écrit par l'utilisateur | Le gestionnaire de permissions lit le frontmatter ; si `source: auto-skill` est absent, il refuse l'`edit` ; le system prompt indique clairement que seuls les auto-skill peuvent être modifiés. |
| Croissance infinie des skills                       | Le prompt de révision demande explicitement de « donner la priorité à la mise à jour des skills existants » ; la mise à jour d'un skill existant est préférée à la création d'un nouveau. |
| Écriture en dehors du chemin du projet              | Les permissions `write_file` / `edit` sont limitées à `${projectRoot}/.qwen/skills/` ; `assertRealProjectSkillPath` refuse les traversées de liens symboliques. |
| Extraction de contenu à risque d'injection          | Réutilisation de la logique existante de scan de sécurité du contenu.                                                                        |
| L'agent de révision supprime un skill               | L'ensemble d'outils de l'agent de révision ne contient pas d'opération de suppression (pas de `rm`, pas d'écriture `shell`) ; le system prompt interdit explicitement la suppression. |
| Révision déclenchée après une manipulation manuelle de skill dans la session principale | `skillsModifiedInSession` détecte : si la session principale a effectué des écritures dans `.qwen/skills/`, la révision est ignorée. |
| Écriture via un lien symbolique traversant hors du répertoire skills | `assertRealProjectSkillPath` (async) : utilise `fs.realpath()` pour résoudre le chemin réel et n'autorise l'écriture que s'il se trouve dans la racine réelle des skills. |

---

## Configuration

Ajouter les options suivantes dans la configuration de QwenCode (optionnelles, valeurs par défaut) :

```typescript
// config schema ajouté (sous memory)
memory?: {
  enableAutoSkill?: boolean;   // true par défaut
}
```

Exemple de configuration correspondante dans QWEN.md / `~/.qwen/config.json` :

```json
{
  "memory": {
    "enableAutoSkill": true
  }
}
```

---

## Liste des tests E2E

Une fois l'implémentation terminée, suivre le processus décrit dans `.qwen/skills/e2e-testing/SKILL.md` : d'abord exécuter `npm run build && npm run bundle`, puis utiliser l'artefact de build local `node dist/cli.js` pour la validation de bout en bout.

### 1. Pas de déclenchement en cas de faible densité d'appels d'outils

- Utiliser un répertoire de projet temporaire en mode headless.
- Configurer `memory.enableAutoSkill: true`.
- Exécuter une tâche simple nécessitant peu d'appels d'outils et terminer la session normalement.
- Vérifier qu'aucun skill avec `source: auto-skill` n'a été ajouté dans `.qwen/skills/` ; aucun flux JSON ne doit contenir d'opération d'écriture dans `.qwen/skills/`.

### 2. Déclenchement de la révision de skill après avoir atteint le seuil

- Utiliser un répertoire de projet temporaire en mode headless (`AUTO_SKILL_THRESHOLD` codé en dur à 20, peut être réduit dans le jeu de test).
- Envoyer une tâche nécessitant de nombreux appels d'outils et contenant un flux réutilisable.
- Vérifier qu'à la fin de la session, une révision de skill est programmée ; si le modèle juge la sauvegarde utile, `.qwen/skills/<name>/SKILL.md` est créé avec le frontmatter contenant `source: auto-skill`.
- Si le modèle juge « Rien à sauvegarder. », vérifier que le processus se termine normalement sans erreur de permission.

### 3. Révision ignorée si la session principale a modifié un skill

- Construire une session durant laquelle, lorsque le nombre d'appels d'outils atteint le seuil, un fichier sous `.qwen/skills/` est écrit via `write_file` ou `edit` (simulant une gestion manuelle de skill par l'utilisateur).
- Vérifier qu'à la fin de la session, `skillsModifiedInSession = true` et `scheduleSkillReview` retourne `skippedReason: 'skills_modified_in_session'`.
- Vérifier qu'aucun agent de révision n'est lancé, évitant toute écriture redondante.

### 4. Protection en écriture limitée aux skills au niveau du projet

- Tenter, via l'agent de révision de skill, d'écrire en dehors du chemin du projet, dans le chemin des skills utilisateur ou dans le chemin des skills groupés.
- Vérifier que l'écriture est refusée avec un message d'erreur indiquant que seuls les chemins `${projectRoot}/.qwen/skills/` sont autorisés.
- Vérifier que l'écriture dans `${projectRoot}/.qwen/skills/<name>/SKILL.md` est autorisée.

### 5. Le marqueur `auto-skill` protège les skills créés par l'utilisateur

- Prépositionner dans `.qwen/skills/` un skill créé par l'utilisateur sans `source: auto-skill`.
- Déclencher l'agent de révision de skill et guider le modèle pour tenter de modifier ce skill.
- Vérifier que l'écriture est refusée par le gestionnaire de permissions avec un message d'erreur indiquant que ce skill n'est pas un auto-skill.
- Vérifier qu'un skill du même répertoire portant `source: auto-skill` peut être mis à jour normalement.

### 6. Traversée de lien symbolique refusée

- Créer sous `.qwen/skills/` un lien symbolique pointant vers un répertoire en dehors du projet.
- Déclencher l'agent de révision de skill et tenter d'écrire sur le chemin du lien symbolique.
- Vérifier que `assertRealProjectSkillPath` rejette l'écriture avec une erreur `symlink traversal detected`.

### 7. L'interrupteur de configuration fonctionne

- Configurer `memory.enableAutoSkill: false` ; même si le nombre d'appels d'outils dépasse le seuil, la révision ne doit pas être déclenchée.
- Vérifier que, par défaut (`enableAutoSkill` non configuré ou `true`), la révision se déclenche normalement après avoir atteint le seuil d'appels d'outils.

### 8. Validation de l'artefact de construction locale

- Selon le skill e2e-testing, utiliser la sortie JSON headless :
  `node dist/cli.js "<prompt>" --approval-mode yolo --output-format json 2>/dev/null`.
- Si nécessaire, ajouter `--openai-logging --openai-logging-dir <tmp-dir>` pour inspecter le schéma des outils, le prompt et la configuration des permissions dans le corps de la requête.
- Pour les scénarios impliquant l'interface TUI ou l'état visible de sessionEnd, utiliser un processus interactif tmux pour capturer la sortie finale.

## Relations avec les systèmes existants

```
MemoryManager existant
  ├─ scheduleExtract()       ← inchangé
  ├─ scheduleDream()         ← inchangé
  ├─ recall()                ← inchangé
  ├─ forget()                ← inchangé
  └─ scheduleSkillReview()   ← nouveau (ce document)

SkillManager existant
  ├─ listSkills()            ← inchangé (découverte automatique des nouveaux fichiers dans .qwen/skills/)
  └─ loadSkill()             ← inchangé

Outils de fichiers existants (read_file / write_file / edit)
  ├─ Session principale : l'utilisateur peut gérer manuellement les skills via ces outils
  │   └─ Écritures dans .qwen/skills/ → skillsModifiedInSession = true
  └─ Agent de révision de skill : utilisé directement pour créer/mettre à jour des auto-skill
      └─ Le gestionnaire de permissions restreint le chemin + vérifie source: auto-skill

Point de déclenchement (hook sessionEnd existant)
  └─ Appels simultanés à scheduleExtract + scheduleSkillReview (lorsque les conditions sont remplies)
```

Le côté lecture de SkillManager (`listSkills`, `loadSkill`) ne nécessite aucune modification – une fois que l'agent de révision a écrit dans `${projectRoot}/.qwen/skills/`, `SkillManager` détecte automatiquement les changements via la surveillance de fichiers `chokidar` existante, appelle `notifyChangeListeners()` pour déclencher un rafraîchissement du cache, et la prochaine conversation verra naturellement le nouveau skill dans le system prompt.
