# Plan de test E2E de la phase C du Worktree

## Périmètre

Vérification de bout en bout des fonctionnalités de la phase C par rapport à la build locale située à
`/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`.

La phase C délivre :

- **Tâches 1, 3, 4** — Fichier JSON sidecar `WorktreeSession` à
  `~/.qwen/tmp/<projectHash>/chats/<sessionId>.worktree.json`
- **Tâche 2** — `core.hooksPath` configuré dans les nouveaux worktrees
- **Tâches 5–6** — Hook `useWorktreeSession`, `UIState.activeWorktree`, indicateur de worktree dans le Footer, champ `StatusLineCommandInput.worktree`
- **Tâche 7** — `--resume` insère un élément d'historique INFO lorsque le worktree actif existe encore ; nettoie le sidecar obsolète sinon
- **Tâche 8** — `WorktreeExitDialog` avec inspection de l'état modifié, intercepte le deuxième Ctrl+C dans un worktree actif

## Binaires

- **Build locale** : `node /Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`
- **Référence (pour comparaison pré-implémentation si nécessaire)** : `qwen` installé globalement

## Modèle d'environnement de test

Chaque groupe s'exécute dans son propre dépôt git temporaire et sa propre session tmux :

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phc-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # résoudre les liens symboliques (macOS /var → /private/var)
cd "$TEST_DIR"
git init -q -b main
git config user.email t@e.com
git config user.name t
git config commit.gpgsign false
echo "hello" > README.md
git add README.md
git commit -q -m "initial" --no-verify
```

`QWEN=/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`

---

## Groupe A : Sidecar WorktreeSession (headless)

**Mode :** headless, `--approval-mode yolo`, `--output-format json`

### A1 : enter_worktree écrit le sidecar avec tous les champs

**Étapes :**

```bash
SESSION=$(node $QWEN "use the enter_worktree tool with name='a1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# Vérifier que tous les champs sont présents
cat "$SIDECAR" | jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit'
```

**Attendu :**

- `slug` = "a1-test"
- `worktreePath` se termine par `.qwen/worktrees/a1-test`
- `worktreeBranch` = "worktree-a1-test"
- `originalCwd` = `$TEST_DIR` (résolu)
- `originalBranch` = "main"
- `originalHeadCommit` correspond à `[0-9a-f]{40}`

### A2 : exit_worktree (keep) supprime le sidecar

**Étapes :**

```bash
SESSION=$(node $QWEN "create a worktree named 'a2-test' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS : sidecar supprimé" || echo "FAIL : le sidecar existe toujours"
```

**Attendu :** le fichier sidecar n'existe pas après l'appel à exit_worktree.

### A3 : exit_worktree (remove) supprime le sidecar

**Étapes :**

```bash
SESSION=$(node $QWEN "create a worktree named 'a3-test' using enter_worktree, then immediately exit it with action='remove' and discard_changes=true using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS : sidecar supprimé" || echo "FAIL : le sidecar existe toujours"
# Vérifier également que le répertoire du worktree a disparu
test ! -d "$TEST_DIR/.qwen/worktrees/a3-test" && echo "PASS : répertoire du worktree supprimé"
```

**Attendu :** le sidecar ET le répertoire du worktree ont disparu.

---

## Groupe B : Configuration de hooksPath (headless)

### B1 : Sans `.husky/`, hooksPath = `<repo>/.git/hooks`

**Étapes :**

```bash
node $QWEN "use enter_worktree with name='b1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b1-test" config --local core.hooksPath)
echo "hooksPath obtenu : $HOOKS_PATH"
test "$HOOKS_PATH" = "$TEST_DIR/.git/hooks" && echo "PASS" || echo "FAIL"
```

**Attendu :** `$TEST_DIR/.git/hooks`

### B2 : Avec `.husky/`, hooksPath = `<repo>/.husky`

**Étapes :**

```bash
mkdir -p "$TEST_DIR/.husky"
echo '#!/bin/sh' > "$TEST_DIR/.husky/pre-commit"
chmod +x "$TEST_DIR/.husky/pre-commit"

node $QWEN "use enter_worktree with name='b2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b2-test" config --local core.hooksPath)
test "$HOOKS_PATH" = "$TEST_DIR/.husky" && echo "PASS" || echo "FAIL obtenu=$HOOKS_PATH"
```

**Attendu :** `$TEST_DIR/.husky`

### B3 : Les hooks du dépôt principal se déclenchent effectivement depuis le worktree

**Étapes :**

```bash
# Configurer un hook qui écrit un fichier marqueur
mkdir -p "$TEST_DIR/.git/hooks"
cat > "$TEST_DIR/.git/hooks/pre-commit" <<'EOF'
#!/bin/sh
echo "hook-fired" > /tmp/qwen-wt-hook-marker
EOF
chmod +x "$TEST_DIR/.git/hooks/pre-commit"

node $QWEN "use enter_worktree with name='b3-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

# Effectuer un commit dans le worktree
WT="$TEST_DIR/.qwen/worktrees/b3-test"
echo "x" > "$WT/file.txt"
git -C "$WT" add file.txt
rm -f /tmp/qwen-wt-hook-marker
git -C "$WT" commit -m "déclencher hook" 2>&1
test -f /tmp/qwen-wt-hook-marker && echo "PASS : hook déclenché" || echo "FAIL : hook non déclenché"
rm -f /tmp/qwen-wt-hook-marker
```

**Attendu :** `/tmp/qwen-wt-hook-marker` existe après le commit.

---

## Groupe C : Restauration du worktree avec --resume (headless)

### C1 : --resume injecte le contexte du worktree lorsque le sidecar est présent et le répertoire toujours actif

**Étapes :**

```bash
# Créer une session initiale avec un worktree
INIT_OUT=$(node $QWEN "use enter_worktree with name='c1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

# Reprendre la session et demander "quel est mon contexte ?"
RESUMED=$(node $QWEN --resume "$SESSION" "say SIDECAR-CONFIRM" \
  --approval-mode yolo --output-format json 2>/dev/null)

# Rechercher le texte du message INFO injecté dans la conversation
echo "$RESUMED" | grep -q "Resumed.*Active worktree.*c1-test" && echo "PASS" || echo "FAIL : aucune injection de contexte"
```

**Attendu :** le flux JSON contient un message INFO faisant référence à `c1-test`.

### C2 : --resume nettoie le sidecar obsolète lorsque le répertoire du worktree n'existe plus

**Étapes :**

```bash
INIT_OUT=$(node $QWEN "use enter_worktree with name='c2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# Supprimer le répertoire du worktree en dehors du flux normal
rm -rf "$TEST_DIR/.qwen/worktrees/c2-test"
test -f "$SIDECAR" || { echo "SKIP : le sidecar était déjà absent"; exit 0; }

# Reprendre — doit nettoyer le sidecar obsolète
node $QWEN --resume "$SESSION" "hello" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
test ! -f "$SIDECAR" && echo "PASS : sidecar obsolète nettoyé" || echo "FAIL : le sidecar obsolète est toujours présent"
```

**Attendu :** le fichier sidecar est supprimé.

---

## Groupe D : Indicateur de worktree dans le Footer (tmux interactif)

### D1 : Le Footer affiche l'indicateur de worktree après enter_worktree

**Étapes :**

```bash
tmux new-session -d -s wt-d1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d1 "use enter_worktree with name='d1-test'"
sleep 0.5
tmux send-keys -t wt-d1 Enter

for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-d1 -p | grep -q "Type your message" && break
done

# Capturer et rechercher la ligne d'indicateur de worktree dans la zone du Footer
tmux capture-pane -t wt-d1 -p -S -100 > /tmp/wt-d1.out
grep -E "⎇.*worktree-d1-test.*\(d1-test\)" /tmp/wt-d1.out && echo "PASS" || \
  { echo "FAIL — sortie capturée :"; cat /tmp/wt-d1.out; }
tmux kill-session -t wt-d1
```

**Attendu :** Le Footer contient une ligne comme `⎇ worktree-d1-test (d1-test)`.

### D2 : L'indicateur du Footer disparaît après exit_worktree (keep)

**Étapes :**

```bash
tmux new-session -d -s wt-d2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d2 "use enter_worktree with name='d2-test'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Type your message" && break; done

# Vérifier que l'indicateur était présent
tmux capture-pane -t wt-d2 -p -S -100 | grep -q "⎇.*d2-test" || { echo "FAIL : indicateur absent avant la sortie"; tmux kill-session -t wt-d2; exit 1; }

# Quitter le worktree (keep)
tmux send-keys -t wt-d2 "use exit_worktree with name='d2-test' action='keep'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Kept worktree" && break; done

sleep 2  # donner un tick au Footer pour se rafraîchir après la suppression du sidecar
tmux capture-pane -t wt-d2 -p -S -100 > /tmp/wt-d2-after.out
# Après la sortie, l'indicateur doit avoir disparu de la zone du panneau inférieur
tail -5 /tmp/wt-d2-after.out | grep -q "⎇.*d2-test" && \
  echo "FAIL : l'indicateur est toujours affiché" || echo "PASS"
tmux kill-session -t wt-d2
```

**Attendu :** l'indicateur de worktree disparaît du Footer dans les ~2s suivant `exit_worktree`.

---

## Groupe E : WorktreeExitDialog (tmux interactif)

### E1 : Deuxième Ctrl+C dans le worktree affiche la boîte de dialogue au lieu de quitter

**Étapes :**

```bash
tmux new-session -d -s wt-e1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e1 "use enter_worktree with name='e1-test'"
sleep 0.5
tmux send-keys -t wt-e1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e1 -p | grep -q "Type your message" && break; done

# Premier Ctrl+C (nettoyage ; doit afficher "Press Ctrl+C again to exit")
tmux send-keys -t wt-e1 C-c
sleep 0.3
tmux capture-pane -t wt-e1 -p | grep -q "Press Ctrl+C again" || \
  { echo "FAIL : le premier Ctrl+C n'a pas affiché l'avertissement"; tmux kill-session -t wt-e1; exit 1; }

# Deuxième Ctrl+C — doit afficher la boîte de dialogue WorktreeExitDialog, NE PAS quitter
tmux send-keys -t wt-e1 C-c
sleep 2

# Vérifier que la boîte de dialogue s'affiche
tmux capture-pane -t wt-e1 -p -S -50 > /tmp/wt-e1.out
grep -q "Active worktree.*e1-test" /tmp/wt-e1.out && \
  grep -q "Keep worktree" /tmp/wt-e1.out && \
  grep -q "Remove worktree" /tmp/wt-e1.out && \
  echo "PASS" || { echo "FAIL — capturé :"; cat /tmp/wt-e1.out; }
tmux kill-session -t wt-e1
```

**Attendu :** la boîte de dialogue affiche trois options (Keep / Remove / Cancel) et le processus est toujours vivant.

### E2 : La boîte de dialogue affiche les compteurs d'état modifié (commits + fichiers)

**Étapes :**

```bash
tmux new-session -d -s wt-e2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e2 "use enter_worktree with name='e2-test'"
sleep 0.5
tmux send-keys -t wt-e2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e2 -p | grep -q "Type your message" && break; done

# Rendre le worktree modifié : 1 nouveau commit + 1 fichier non commit
WT="$TEST_DIR/.qwen/worktrees/e2-test"
echo "new" > "$WT/new.txt"
git -C "$WT" add new.txt
git -C "$WT" commit -q -m "test commit" --no-verify
echo "dirty" > "$WT/uncommitted.txt"

# Déclencher la boîte de dialogue de sortie via une double pression sur Ctrl+C
tmux send-keys -t wt-e2 C-c
sleep 0.3
tmux send-keys -t wt-e2 C-c
sleep 3   # laisser le temps à git status / rev-list

tmux capture-pane -t wt-e2 -p -S -50 > /tmp/wt-e2.out
grep -qE "new commit|uncommitted file" /tmp/wt-e2.out && echo "PASS" || \
  { echo "FAIL — capturé :"; cat /tmp/wt-e2.out; }
tmux kill-session -t wt-e2
```

**Attendu :** le corps de la boîte de dialogue contient à la fois "X new commit(s)" et "Y uncommitted file(s)".

### E3 : L'option Annuler ferme la boîte de dialogue sans quitter

**Étapes :**

```bash
tmux new-session -d -s wt-e3 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e3 "use enter_worktree with name='e3-test'"
sleep 0.5
tmux send-keys -t wt-e3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && break; done

# Déclencher la boîte de dialogue
tmux send-keys -t wt-e3 C-c
sleep 0.3
tmux send-keys -t wt-e3 C-c
sleep 3

# Naviguer vers Annuler (DOWN DOWN) et appuyer sur Entrée
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Enter
sleep 2

# La boîte de dialogue doit avoir disparu ; l'invite de saisie doit être de retour
tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && echo "PASS" || \
  { echo "FAIL — capturé :"; tmux capture-pane -t wt-e3 -p; }

# Vérifier que le worktree n'a PAS été supprimé
test -d "$TEST_DIR/.qwen/worktrees/e3-test" && echo "worktree intact" || echo "FAIL : worktree supprimé"
tmux kill-session -t wt-e3
```

**Attendu :** la boîte de dialogue se ferme, l'invite de saisie revient, le répertoire du worktree existe toujours.

### E4 : L'option Garder quitte la session mais préserve le worktree

**Étapes :**

```bash
tmux new-session -d -s wt-e4 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e4 "use enter_worktree with name='e4-test'"
sleep 0.5
tmux send-keys -t wt-e4 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e4 -p | grep -q "Type your message" && break; done

# Déclencher la boîte de dialogue et choisir Garder (première option, déjà sélectionnée)
tmux send-keys -t wt-e4 C-c
sleep 0.3
tmux send-keys -t wt-e4 C-c
sleep 3
tmux send-keys -t wt-e4 Enter

# Attendre la fin du processus
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e4 2>/dev/null || break
  tmux capture-pane -t wt-e4 -p | grep -q "\$ " && break  # invite shell de retour
done

# Le répertoire du worktree doit toujours exister
test -d "$TEST_DIR/.qwen/worktrees/e4-test" && echo "PASS : worktree conservé" || \
  echo "FAIL : le worktree a été supprimé"
tmux kill-session -t wt-e4 2>/dev/null || true
```

**Attendu :** le processus se termine, le répertoire du worktree reste sur le disque.

### E5 : L'option Supprimer quitte la session et supprime le worktree

**Étapes :**

```bash
tmux new-session -d -s wt-e5 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e5 "use enter_worktree with name='e5-test'"
sleep 0.5
tmux send-keys -t wt-e5 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e5 -p | grep -q "Type your message" && break; done

# Déclencher la boîte de dialogue et choisir Supprimer (DOWN, Enter)
tmux send-keys -t wt-e5 C-c
sleep 0.3
tmux send-keys -t wt-e5 C-c
sleep 3
tmux send-keys -t wt-e5 Down
sleep 0.2
tmux send-keys -t wt-e5 Enter

# Attendre la fin
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e5 2>/dev/null || break
  tmux capture-pane -t wt-e5 -p | grep -q "\$ " && break
done

# Le répertoire du worktree doit avoir DISPARU
test ! -d "$TEST_DIR/.qwen/worktrees/e5-test" && echo "PASS : worktree supprimé" || \
  echo "FAIL : le worktree est toujours sur le disque"
# La branche doit également être supprimée
git -C "$TEST_DIR" branch --list | grep -q "worktree-e5-test" && \
  echo "FAIL : la branche est toujours présente" || echo "PASS : branche supprimée"
tmux kill-session -t wt-e5 2>/dev/null || true
```

**Attendu :** le processus se termine, le répertoire du worktree est supprimé, la branche `worktree-e5-test` est supprimée.

---

## Groupe F : Simulation de workflow utilisateur réel (tmux interactif)

### F1 : Flux complet enter → éditer → commit → reprendre → quitter (garder)

**Étapes :**

```bash
tmux new-session -d -s wt-f1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

# Étape 1 : entrer dans le worktree
tmux send-keys -t wt-f1 "use enter_worktree with name='f1-feature' to create a worktree"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Étape 2 : lire le chemin absolu du worktree pour que le modèle sache où écrire
WT="$TEST_DIR/.qwen/worktrees/f1-feature"
tmux send-keys -t wt-f1 "write the file $WT/hello.txt with content 'hi from worktree'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 60); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Vérifier que le fichier a bien été écrit DANS le worktree
test -f "$WT/hello.txt" && grep -q "hi from worktree" "$WT/hello.txt" && \
  echo "PASS : fichier écrit dans le worktree" || echo "FAIL : fichier pas dans le worktree"

# Étape 3 : Quitter avec garder via l'outil
tmux send-keys -t wt-f1 "use exit_worktree with name='f1-feature' action='keep'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Kept worktree" && break; done

# Étape 4 : Vérifier que le worktree est toujours sur le disque après la sortie
test -d "$WT" && echo "PASS : worktree conservé" || echo "FAIL : worktree supprimé"
test -f "$WT/hello.txt" && echo "PASS : le fichier persiste" || echo "FAIL"

tmux kill-session -t wt-f1
```

**Attendu :**

- Le fichier a été écrit dans le répertoire du worktree (pas dans le dépôt principal)
- Après la sortie avec `keep`, le répertoire du worktree et le fichier persistent

### F2 : La statusline personnalisée reçoit la charge utile `worktree`

**Étapes :**

```bash
# Créer un script statusline qui imprime le JSON reçu via stdin
SETTINGS_DIR=~/.qwen
SETTINGS_FILE=$SETTINGS_DIR/settings.json
cp -f "$SETTINGS_FILE" /tmp/qwen-settings-backup.json 2>/dev/null || true
mkdir -p "$SETTINGS_DIR"
SL_SCRIPT=/tmp/qwen-wt-statusline.sh
cat > $SL_SCRIPT <<'EOF'
#!/bin/sh
INPUT=$(cat)
echo "$INPUT" > /tmp/qwen-wt-statusline-input.json
WT_NAME=$(echo "$INPUT" | jq -r '.worktree.name // "no-worktree"')
echo "WT=$WT_NAME"
EOF
chmod +x $SL_SCRIPT

cat > "$SETTINGS_FILE" <<EOF
{"ui":{"statusLine":{"type":"command","command":"$SL_SCRIPT"}}}
EOF

tmux new-session -d -s wt-f2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 5  # la statusline a besoin d'un tick supplémentaire

tmux send-keys -t wt-f2 "use enter_worktree with name='f2-test'"
sleep 0.5
tmux send-keys -t wt-f2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f2 -p | grep -q "Type your message" && break; done

sleep 3  # laisser la statusline se rafraîchir après le changement de sidecar

# Inspecter la charge utile capturée
cat /tmp/qwen-wt-statusline-input.json | jq '.worktree.name, .worktree.path, .worktree.branch'

# Vérifier que l'indicateur intégré du Footer est MASQUÉ lorsque la statusline personnalisée est active
tmux capture-pane -t wt-f2 -p -S -100 > /tmp/wt-f2.out
grep -q "WT=f2-test" /tmp/wt-f2.out && echo "PASS : statusline personnalisée rendue" || echo "FAIL"
tmux kill-session -t wt-f2

# Restaurer les paramètres
cp -f /tmp/qwen-settings-backup.json "$SETTINGS_FILE" 2>/dev/null || rm -f "$SETTINGS_FILE"
```

**Attendu :**

- `/tmp/qwen-wt-statusline-input.json` a `.worktree.name == "f2-test"`, `.path`, `.branch` définis
- La sortie de la statusline personnalisée `WT=f2-test` apparaît dans le Footer
- La ligne intégrée `⎇ worktree-...` n'est PAS rendue (supprimée par la statusline personnalisée)

---

## Résumé des critères de réussite

| Groupe | Test                              | Attendu                                        |
| ------ | --------------------------------- | ---------------------------------------------- |
| A      | A1 enter écrit le sidecar         | les 6 champs sont remplis                      |
| A      | A2 keep supprime le sidecar       | fichier supprimé                               |
| A      | A3 remove supprime le sidecar     | fichier + répertoire supprimés                 |
| B      | B1 hooksPath par défaut           | `<repo>/.git/hooks`                            |
| B      | B2 hooksPath husky                | `<repo>/.husky`                                |
| B      | B3 le hook se déclenche dans le wt| fichier marqueur écrit                        |
| C      | C1 resume injecte le contexte     | message INFO présent                           |
| C      | C2 nettoyage du sidecar obsolète  | sidecar supprimé                               |
| D      | D1 le footer affiche le wt        | `⎇ worktree-...` rendu                         |
| D      | D2 le footer se masque après sortie| indicateur disparaît                          |
| E      | E1 boîte de dialogue au 2ème Ctrl+C| boîte visible, vivant                         |
| E      | E2 compteurs d'état modifié       | commits + fichiers affichés                    |
| E      | E3 Annuler                        | boîte fermée, session vivante                  |
| E      | E4 Garder                         | session quitte, wt conservé                    |
| E      | E5 Supprimer                      | session quitte, wt supprimé                    |
| F      | F1 workflow complet               | fichier dans wt, persiste après garder         |
| F      | F2 statusline personnalisée       | charge utile worktree reçue, footer masqué     |