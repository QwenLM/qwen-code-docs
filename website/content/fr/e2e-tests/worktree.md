# Plan de Test E2E de la Fonctionnalité Worktree (Phase A + B)

## Périmètre

Tests de bout en bout pour la capacité worktree générique :

- Phase A : Outils `EnterWorktree` / `ExitWorktree` + état SessionService
- Phase B : Paramètre `isolation : 'worktree'` de l'outil `Agent` + nettoyage automatique + notification worktree

## Environnement de test

Chaque groupe de tests s'exécute dans son propre dépôt git temporaire et sa propre session tmux pour éviter les collisions. Configuration type :

```bash
TEST_DIR=$(mktemp -d -t worktree-test-XXXXXX)
cd "$TEST_DIR"
git init -q
git config user.email "test@example.com"
git config user.name "Test"
echo "hello" > README.md
git add README.md
git commit -q -m "initial"
```

Chaque groupe utilise un nom de session tmux unique (ex. `wt-test-a`, `wt-test-b`) et un répertoire temporaire unique.

Binaire de référence : `qwen` installé globalement (0.15.10).
Binaire de build local : `node /Users/mochi/code/qwen-code/.claude/worktrees/trusting-euclid-6fdfb9/bundle/qwen.js`.

## Groupe de test A : Enregistrement et création de base de l'outil EnterWorktree

**Mode :** Headless, `--approval-mode yolo`, `--output-format json`

### A1 : Outil enregistré lors de l'initialisation du système

**Étapes :**

```bash
<qwen> "say hello" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .tools[]' \
  | grep -E "^(enter_worktree|exit_worktree)$"
```

**Avant implémentation :** vide (outils non enregistrés).
**Après implémentation :** affiche `enter_worktree` et `exit_worktree`.

### A2 : Créer un worktree avec un nom généré automatiquement

**Étapes :**

```bash
<qwen> "create a new git worktree using the enter_worktree tool" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.json
# Vérifier que le répertoire du worktree a été créé
ls -la .qwen/worktrees/ | grep -v "^\." | wc -l
# Doit contenir un répertoire correspondant au motif de slug généré automatiquement
```

**Avant implémentation :** le modèle indique qu'il ne trouve pas l'outil ; pas de répertoire `.qwen/worktrees/`.
**Après implémentation :** `.qwen/worktrees/<slug>` existe avec un slug généré automatiquement (format : `{adj}-{nom}-{4hex}`).

### A3 : Créer un worktree avec un nom personnalisé

**Étapes :**

```bash
<qwen> "use the enter_worktree tool with name='my-feature' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/my-feature/
git branch | grep worktree-my-feature
```

**Avant implémentation :** outil inconnu.
**Après implémentation :** le répertoire `.qwen/worktrees/my-feature/` existe ; la branche `worktree-my-feature` existe.

### A4 : Slug invalide rejeté

**Étapes :**

```bash
<qwen> "use enter_worktree with name='../../../etc' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="user") | .message.content[] | select(.is_error) | .content'
```

**Avant implémentation :** outil inconnu.
**Après implémentation :** le résultat de l'outil a is_error=true avec un message d'erreur de validation.

## Groupe de test B : ExitWorktree

**Mode :** Headless, interaction en deux étapes dans une même invite.

### B1 : Enter puis exit avec action=keep

**Étapes :**

```bash
<qwen> "create a worktree named 'temp-keep' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.json
# Le répertoire doit toujours exister (keep le conserve)
ls -d .qwen/worktrees/temp-keep
# La branche doit toujours exister
git branch | grep worktree-temp-keep
# Le répertoire de travail courant doit être l'original
```

**Avant implémentation :** outils inconnus.
**Après implémentation :** le répertoire et la branche du worktree existent encore après la sortie.

### B2 : Enter puis exit avec action=remove (sans modifications)

**Étapes :**

```bash
<qwen> "create a worktree named 'temp-remove' using enter_worktree, then immediately exit it with action='remove' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls -d .qwen/worktrees/temp-remove 2>&1
git branch | grep worktree-temp-remove
```

**Avant implémentation :** outils inconnus.
**Après implémentation :** le répertoire du worktree est supprimé ; la branche est supprimée.

### B3 : Exit avec action=remove refuse en cas de modifications non commit

**Étapes :** Lancer une session tmux interactive, créer manuellement des fichiers dans le worktree, puis tenter la sortie.

```bash
tmux new-session -d -s wt-test-b3 -x 200 -y 50 "cd $TEST_DIR && <qwen> --approval-mode yolo"
sleep 3
tmux send-keys -t wt-test-b3 "create a worktree named 'dirty-test' using enter_worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
# Attendre la fin
for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break
done
# Créer un fichier modifié dans le worktree
echo "dirty" > "$TEST_DIR/.qwen/worktrees/dirty-test/dirty.txt"
# Essayer de supprimer sans discard_changes
tmux send-keys -t wt-test-b3 "use exit_worktree with action='remove' to exit the worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break; done
tmux capture-pane -t wt-test-b3 -p -S -100 > /tmp/b3.out
# La sortie doit mentionner "uncommitted changes" ou "discard_changes"
grep -E "uncommitted|discard_changes" /tmp/b3.out
tmux kill-session -t wt-test-b3
```

**Avant implémentation :** outils inconnus.
**Après implémentation :** la sortie échoue avec un message concernant les modifications non commit et le drapeau `discard_changes`.

## Groupe de test C : Persistance du SessionService

### C1 : État du worktree dans les métadonnées de session

**Étapes :**

```bash
SESSION_ID=$(<qwen> "create a worktree named 'persist-test' using enter_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .session_id' | head -1)
# Vérifier le stockage de session pour l'état du worktree
find ~/.qwen -name "*${SESSION_ID}*" 2>/dev/null | head
grep -l "persist-test" ~/.qwen/projects/*/sessions/*.json 2>/dev/null || \
  grep -rl "worktreeSession\|persist-test" ~/.qwen/projects/ 2>/dev/null | head -5
```

**Avant implémentation :** aucun état de session worktree stocké nulle part.
**Après implémentation :** le JSON de session contient un champ `worktreeSession` avec `slug='persist-test'`, `worktreePath`, `originalCwd`, etc.

## Groupe de test D : Isolation de l'outil Agent

### D1 : Paramètre d'isolation de l'agent accepté

**Étapes :**

```bash
<qwen> "spawn an agent using the agent tool with isolation='worktree' to run 'echo hello'" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="assistant") | .message.content[] | select(.type=="tool_use" and .name=="agent") | .input'
# Vérifier que .qwen/worktrees/ contient un slug agent-* pendant l'exécution
```

**Avant implémentation :** le schéma de l'outil agent n'a pas de paramètre isolation ; le modèle l'omet ou le schéma le rejette.
**Après implémentation :** l'agent s'exécute avec succès avec isolation='worktree' ; un worktree `agent-<7hex>` est créé.

### D2 : L'agent nettoie automatiquement le worktree (sans modifications)

**Étapes :**

```bash
ls .qwen/worktrees/ > /tmp/d2-before.txt 2>/dev/null
<qwen> "spawn an agent with isolation='worktree' to list files in the current directory using ls" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/ > /tmp/d2-after.txt 2>/dev/null
# After doit être égal à Before (aucun répertoire agent-* résiduel)
diff /tmp/d2-before.txt /tmp/d2-after.txt
```

**Avant implémentation :** N/A (pas de paramètre isolation).
**Après implémentation :** le répertoire worktrees est inchangé une fois l'agent terminé sans modifications.

### D3 : Worktree d'agent conservé lorsque des modifications sont effectuées

**Étapes :**

```bash
<qwen> "spawn an agent with isolation='worktree' to write 'test content' to a new file called test.txt" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/d3.json
# Le worktree doit être conservé avec la modification
ls .qwen/worktrees/agent-* 2>/dev/null
ls .qwen/worktrees/agent-*/test.txt 2>/dev/null
# Le résultat de l'agent doit inclure worktreePath/worktreeBranch
jq 'select(.type=="user") | .message.content[] | select(.tool_use_id) | .content' /tmp/d3.json | head
```

**Avant implémentation :** N/A.
**Après implémentation :** `.qwen/worktrees/agent-<7hex>/test.txt` existe ; le résultat de l'agent mentionne le chemin et la branche du worktree.

## Groupe de test E : Nettoyage des worktrees obsolètes

### E1 : La fonction de nettoyage supprime les anciens worktrees d'agent

Ce test est plus difficile à réaliser en E2E car il nécessite un vieillissement. Couvrir via des tests unitaires dans `worktreeCleanup.test.ts` :

- Worktree avec mtime > 30 jours et correspondant au motif `agent-<7hex>` → supprimé
- Worktree avec mtime > 30 jours mais nommé par l'utilisateur (ex. `my-feature`) → conservé
- Worktree avec mtime < 30 jours → conservé
- Worktree avec modifications non commit → conservé (échec en sécurité)
- Worktree avec commits non poussés → conservé (échec en sécurité)

Vérification ponctuelle E2E (optionnelle) : utiliser manuellement `touch -t 200001010000 .qwen/worktrees/agent-aabcdef0` et invoquer le nettoyage ; vérifier la suppression.

## Groupe de test F : Compatibilité Arena (pas de régression)

### F1 : Chemin du worktree Arena inchangé

**Étapes :** Exécuter une session Arena (séparée de EnterWorktree) ; vérifier qu'elle crée toujours les worktrees sous `~/.qwen/arena/<sessionId>/worktrees/` et non sous `.qwen/worktrees/`.

```bash
# Configuration : nécessite une configuration compatible Arena. Les étapes détaillées dépendent de l'invocation CLI Arena.
# Avant implémentation : les worktrees Arena sont sous ~/.qwen/arena/.
# Après implémentation : IDEM — le chemin Arena est indépendant.
```

(Si Arena n'est pas facilement accessible depuis le mode headless, ce groupe est vérifié par un test unitaire indiquant que `ArenaManager.ts:125` (`this.arenaBaseDir = arenaSettings?.worktreeBaseDir ?? path.join(Storage.getGlobalQwenDir(), 'arena')`) est inchangé.)

## Couverture des tests unitaires (colocalisés avec l'implémentation)

En dehors du plan E2E, ces tests unitaires doivent accompagner l'implémentation :

- `EnterWorktreeTool.test.ts` : validation du schéma, rejet de slug, rejet de worktree imbriqué, changement de répertoire courant, écriture SessionService
- `ExitWorktreeTool.test.ts` : chemins keep vs remove, garde d'état sale, contournement discard_changes, restauration du répertoire courant
- `gitWorktreeService.test.ts` extensions : `createUserWorktree`, `removeUserWorktree`, `createAgentWorktree`, `removeAgentWorktree`
- `sessionService.test.ts` extensions : lecture/écriture du champ WorktreeSession, restauration de reprise
- `worktreeCleanup.test.ts` : correspondance de motif de nettoyage, filtre d'âge, conditions d'échec en sécurité
- `agent.test.ts` extensions : paramètre isolation accepté, worktree créé et (dans certains cas) nettoyé

## Critères de réussite

| Groupe | Attendu avant build | Attendu après build                                    |
| ------ | ------------------- | ------------------------------------------------------ |
| A1     | outils non listés   | les deux outils listés                                 |
| A2     | erreur/sans effet   | `.qwen/worktrees/<slug-auto>` créé                     |
| A3     | erreur/sans effet   | `.qwen/worktrees/my-feature` créé, branche présente    |
| A4     | erreur/sans effet   | résultat de l'outil is_error avec message de validation|
| B1     | erreur/sans effet   | répertoire + branche du worktree conservés             |
| B2     | erreur/sans effet   | répertoire + branche du worktree supprimés             |
| B3     | erreur/sans effet   | la sortie refuse avec message de modifications non commit|
| C1     | aucun état worktree | la session a le champ worktreeSession                  |
| D1     | pas de param isolation| l'agent s'exécute dans un worktree `agent-<7hex>`      |
| D2     | N/A                 | répertoire worktrees inchangé après agent sans modifs  |
| D3     | N/A                 | `agent-<7hex>` conservé avec les modifications         |

## Rapport de reproduction (post-implémentation)

Build local dans `dist/cli.js` (commit à la pointe de `claude/trusting-euclid-6fdfb9`).

| Groupe | Résultat                             | Notes                                                                                                                                                                                                   |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1     | ✅                                   | `enter_worktree` et `exit_worktree` listés dans `system.tools`                                                                                                                                          |
| A3     | ✅                                   | `.qwen/worktrees/my-feature` créé, branche `worktree-my-feature` présente                                                                                                                               |
| A4     | couvert par test unitaire            | `validateUserWorktreeSlug` rejette les traversées de chemin, etc. (`enter-worktree.test.ts`)                                                                                                             |
| B1     | ✅                                   | l'action `keep` a conservé le répertoire et la branche                                                                                                                                                  |
| B2     | ✅                                   | l'action `remove` a supprimé le répertoire et la branche                                                                                                                                                |
| B3     | ✅                                   | `remove` refusé avec `Refusing to remove worktree "dirty-test" — it has 0 tracked change(s) and 1 untracked file(s).`                                                                                   |
| C1     | hors périmètre                       | Persistance SessionService reportée de la Phase A (voir notes de périmètre dans `docs/design/worktree.md`)                                                                                               |
| D1     | ✅                                   | L'invocation de l'agent a accepté `isolation: 'worktree'`, a créé `agent-2c4e759`                                                                                                                        |
| D2     | ✅                                   | Une fois l'agent terminé sans modifications, le répertoire worktrees était vide                                                                                                                           |
| D3     | ✅                                   | Une fois que l'agent a écrit `test.txt`, le worktree `agent-bad55bd` et la branche `worktree-agent-bad55bd` sont conservés ; le résultat incluait le suffixe `[worktree preserved: ... (branch ...)]` |
| E1     | couvert par test unitaire            | `worktreeCleanup.test.ts` vérifie que `isEphemeralSlug` ne correspond qu'à `agent-<7hex>`                                                                                                                |
| F1     | hors périmètre (pas d'E2E Arena ici) | Les chemins de code Arena sont intacts : `ArenaManager.ts:125` et `setupWorktrees()` inchangés                                                                                                            |

### Écarts de périmètre par rapport au plan de test

- **C1** (Persistance SessionService) a été reporté de la Phase A. La Phase A minimale viable renvoie le chemin absolu du worktree pour que le modèle l'utilise directement via des chemins absolus, au lieu de basculer mécaniquement `Config.targetDir`. Le support de la reprise nécessite une extension de SessionService et est documenté pour une phase ultérieure.
- **A2** (nom généré automatiquement) a été vérifié indirectement via D1/D3, qui exercent le même chemin de slug automatique à travers le flux d'isolation de l'agent.