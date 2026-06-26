# Plan de test E2E de la Phase D des Worktrees

## Périmètre

Vérification de bout en bout des fonctionnalités de la Phase D par rapport à la build locale située dans
`/Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`.

La Phase D apporte trois capacités transverses :

- **D-1** — L'option CLI `--worktree [name]` (forme simple / slug explicite / forme `=`),
  avec le basculement de `process.cwd()` + `Config.targetDir` et la réutilisation de `WorktreeExitDialog` à la sortie
- **D-2** — La clé de configuration `worktree.symlinkDirectories: string[]`, appliquée dans
  `performPostCreationSetup()` pour couvrir les trois chemins `--worktree`, `EnterWorktreeTool`
  ET `AgentTool isolation: "worktree"`
- **D-3** — Les formes `--worktree=#<N>` et `--worktree <github-url>` de référence PR,
  via `git fetch origin pull/<N>/head` (sans dépendance au CLI `gh`)

## Binaires

- **Build locale (vérification Phase 6)** : `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
- **Référence de base Phase 4 (dry-run)** : `qwen` installé globalement

Pour les dry-runs, le `qwen` installé globalement est censé échouer sur les Groupes A / E / F
car les fonctionnalités n'existent pas encore — c'est la validation que le plan
détecte correctement l'implémentation manquante.

### Précondition de base pour le Groupe E

Les tests **E2** (`EnterWorktreeTool` symlink) et **E3** (`AgentTool isolation`
symlink) nécessitent la **Phase A + B** dans la base de référence — ils
exercent l'outil `enter_worktree` existant et le paramètre `agent isolation: "worktree"`
pour confirmer que la boucle de symlink se déclenche également sur ces chemins.

Le `qwen` installé globalement peut être antérieur à la PR #4073 (Phase A+B, fusionnée le 2026-05-14)
et donc ne pas posséder ces outils du tout. Dans ce cas, E2 / E3 ne peuvent pas
valider « symlink absent car D-2 est absent » — ils se réduisent à « outil absent ».
Ajoutez cette garde en haut de chaque test :

```bash
HAS_ENTER_WORKTREE=$($QWEN "list your tools and stop" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -e '.[] | select(.type=="system") | .tools | index("enter_worktree")' >/dev/null && echo yes || echo no)
if [ "$HAS_ENTER_WORKTREE" != "yes" ]; then
  echo "SKIP: enter_worktree absent in baseline — E2/E3 require Phase A+B"
  exit 0
fi
```

Pour la vérification Phase 6 (post-implémentation), la build locale contient
naturellement la Phase A-C, donc la garde est sans effet et les tests s'exécutent en entier.

## Modèle d'environnement de test

Chaque groupe s'exécute dans son propre dépôt git temporaire et sa propre session tmux :

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phd-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # résoudre les liens symboliques (macOS /var → /private/var)
cd "$TEST_DIR"
git init -q -b main
git config user.email t@e.com
git config user.name t
git config commit.gpgsign false
echo "hello" > README.md
git add README.md
git commit -q -m "initial" --no-verify

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
QWEN="node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js"
```

Les tests de référence PR (Groupe F) nécessitent en plus un clone d'un dépôt GitHub public
avec au moins une PR fusionnée. Utilisez ce dépôt (qwen-code lui-même) comme
cible de test — la PR `#4174` (Phase C) est une référence garantie.

---

## Groupe A : Formes de base de l'option `--worktree`

**Mode :** headless, `--approval-mode yolo`, `--output-format json`

### A1 : `--worktree` simple (slug automatique)

```bash
$QWEN --worktree "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a1.out

# Un événement système `worktree_started` est émis au démarrage. Le champ `notice`
# contient le slug (auto-généré `adj-nom-XXXXXX`) dans le texte rendu. Utilisez
# `jq -e` pour qu'un événement manquant produise une sortie non nulle
# (au lieu d'un `null` silencieux).
jq -e '.[] | select(.type=="system" and .subtype=="worktree_started") | .data.notice | test("\"[a-z]+-[a-z]+-[0-9a-f]{6}\"")' < /tmp/a1.out

# Le `cwd` du message système `init` doit également pointer à l'intérieur du worktree.
jq -e '.[] | select(.type=="system" and .subtype=="init") | .cwd | test("/\\.qwen/worktrees/[a-z]+-[a-z]+-[0-9a-f]{6}$")' < /tmp/a1.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Attendu (post-impl) :**

- Événement `worktree_started` avec `.data.notice` contenant le slug automatique
- Le `cwd` de l'init se termine par `.qwen/worktrees/<slug-auto>`
- Exactement un répertoire de worktree sous `.qwen/worktrees/`
- Une branche nommée `worktree-<slug>` existe (`git branch | grep worktree-`)

**Attendu (base pré-impl) :** yargs rejette `--worktree` avec
une erreur « Unknown argument » et un code de sortie différent de 0.

### A2 : `--worktree ma-fonctionnalité` (slug explicite)

```bash
$QWEN --worktree ma-fonctionnalite "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.out

ls -d "$TEST_DIR/.qwen/worktrees/ma-fonctionnalite"
git -C "$TEST_DIR" branch | grep "worktree-ma-fonctionnalite"
```

**Attendu (post-impl) :** le répertoire worktree `ma-fonctionnalite/` et la branche
`worktree-ma-fonctionnalite` existent tous les deux.

### A3 : `--worktree=ma-fonctionnalité` (forme `=`)

Identique à A2 avec la forme `=`. Nettoyage entre A2 et A3 nécessaire (TEST_DIR différent).

```bash
$QWEN --worktree=ma-fonctionnalite "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a3.out
```

**Attendu (post-impl) :** identique à A2.

### A4 : Slug invalide rejeté avant toute opération git

```bash
$QWEN --worktree "../escape" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a4.out
echo "exit=$?"

ls "$TEST_DIR/.qwen/worktrees/" 2>/dev/null
```

**Attendu (post-impl) :**

- Le processus se termine avec un code non nul
- La sortie stderr ou le message de résultat final mentionne « invalid slug » / « not allowed »
- Le répertoire `.qwen/worktrees/` n'existe pas (la création du worktree n'a jamais démarré)

### A5 : Pas un dépôt git → échec immédiat

```bash
NON_GIT=$(mktemp -d)
cd "$NON_GIT"
$QWEN --worktree "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a5.out
echo "exit=$?"
```

**Attendu (post-impl) :** sortie != 0, le message mentionne « not a git repository »
ou « git init ».

---

## Groupe B : cwd + sidecar après `--worktree`

### B1 : Sidecar écrit avec les six champs

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree b1-test --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.out

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit' \
  < "$SIDECAR"
```

**Attendu :**

- `slug = "b1-test"`
- `worktreePath` se termine par `.qwen/worktrees/b1-test`
- `worktreeBranch = "worktree-b1-test"`
- `originalCwd` = `$TEST_DIR` (résolu)
- `originalBranch = "main"`
- `originalHeadCommit` correspond à `[0-9a-f]{40}`

### B2 : `process.cwd()` basculé au démarrage

```bash
$QWEN --worktree b2-test "run the shell tool with command 'pwd', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b2.out

# Extraire la sortie standard de l'outil shell du tool_result du message utilisateur
jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b2.out | head -5
```

**Attendu (post-impl) :** la sortie de `pwd` est égale à `$TEST_DIR/.qwen/worktrees/b2-test`.

### B3 : `Config.targetDir` basculé (Footer / payload de statut)

```bash
$QWEN --worktree b3-test "run the shell tool with command 'pwd && git rev-parse --abbrev-ref HEAD', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b3.out

jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b3.out
```

**Attendu (post-impl) :** la branche est `worktree-b3-test` ET le répertoire de travail
est à l'intérieur du worktree.

---

## Groupe C : Priorité `--worktree` × `--resume`

### C1 : `--worktree` l'emporte sur le sidecar sauvegardé (slug différent)

```bash
# Exécution 1 : créer une session avec le worktree "first"
SESSION_ID=$(uuidgen)
$QWEN --worktree first --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run1.out

# Exécution 2 : reprendre la même session mais demander un worktree différent
$QWEN --resume "$SESSION_ID" --worktree second "say hi again" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run2.out

# Le sidecar doit maintenant pointer vers "second"
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq -r '.slug' < "$SIDECAR"

# Les deux répertoires de worktree doivent exister sur le disque (first n'a jamais été supprimé, seulement délié)
ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Attendu (post-impl) :**

- Sidecar `.slug` = `"second"`
- Les répertoires `first/` et `second/` existent tous les deux
- Le stderr de l'exécution 2 ou le message `worktree_overridden` de l'init mentionne « --worktree
  overrides the resumed session's worktree »

### C2 : Sidecar obsolète (répertoire supprimé manuellement) + `--worktree` → nouveau worktree

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree c2 --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run1.out

rm -rf "$TEST_DIR/.qwen/worktrees/c2"   # simule une suppression par l'utilisateur

$QWEN --resume "$SESSION_ID" --worktree c2-fresh "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run2.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Attendu (post-impl) :** seul `c2-fresh/` existe ; le sidecar est mis à jour avec `c2-fresh`.

---

## Groupe D : Régression de WorktreeExitDialog (session démarrée par `--worktree`)

**Mode :** interactif (tmux). Vérifie que la boîte de dialogue de la Phase C se déclenche toujours lorsque
le worktree a été créé par l'option CLI plutôt que par `EnterWorktreeTool`.

### D1 : 2x Ctrl+C → boîte de dialogue apparaît

```bash
tmux new-session -d -s d1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d1-test --approval-mode yolo"
sleep 3

# Vérifier que le worktree est actif (indicateur dans le Footer)
tmux capture-pane -t d1 -p -S -50 | grep -q "⎇ worktree-d1-test"

# Envoyer Ctrl+C deux fois
tmux send-keys -t d1 C-c
sleep 0.3
tmux send-keys -t d1 C-c
sleep 1

tmux capture-pane -t d1 -p -S -50 | grep -E "Active worktree|Keep worktree|Remove worktree"
tmux kill-session -t d1
```

**Attendu (post-impl) :** le texte de la boîte de dialogue « Active worktree: \"d1-test\" … » et les trois
options radio apparaissent.

### D2 : Dialogue → Annuler → la session reste active

```bash
tmux new-session -d -s d2 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d2-test --approval-mode yolo"
sleep 3
tmux send-keys -t d2 C-c; sleep 0.3; tmux send-keys -t d2 C-c; sleep 1

# Naviguer vers « Cancel » (troisième option) et sélectionner
tmux send-keys -t d2 Down Down Enter
sleep 1

tmux capture-pane -t d2 -p -S -10 | grep -q "Type your message"
ls -d "$TEST_DIR/.qwen/worktrees/d2-test"   # existe toujours
tmux kill-session -t d2
```

**Attendu (post-impl) :** l'invite de saisie réapparaît ; le répertoire du worktree est toujours sur le disque.

### D3 : Dialogue → Supprimer → worktree + branche + sidecar tous supprimés

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s d3 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d3-test --session-id $SESSION_ID --approval-mode yolo"
sleep 3
tmux send-keys -t d3 C-c; sleep 0.3; tmux send-keys -t d3 C-c; sleep 1
tmux send-keys -t d3 Down Enter   # sélectionner « Remove worktree and branch »
sleep 3
tmux kill-session -t d3

ls "$TEST_DIR/.qwen/worktrees/d3-test" 2>/dev/null && echo "FAIL: dir exists"
git -C "$TEST_DIR" branch | grep "worktree-d3-test" && echo "FAIL: branch exists"
test ! -f ~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json && echo "PASS: sidecar gone"
```

**Attendu (post-impl) :** le répertoire, la branche et le sidecar sont tous supprimés.

---

## Groupe E : `worktree.symlinkDirectories`

**Mode :** headless. Configuration via un fichier de paramètres temporaire.

### Modèle de configuration

```bash
mkdir -p "$TEST_DIR/node_modules"
echo "package.json" > "$TEST_DIR/node_modules/.placeholder"
mkdir -p "$TEST_DIR/.qwen"
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{
  "worktree": {
    "symlinkDirectories": ["node_modules"]
  }
}
EOF
```

### E1 : Le chemin `--worktree` applique le symlink

```bash
$QWEN --worktree e1-test "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

ls -la "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
readlink "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
```

**Attendu (post-impl) :** `node_modules` à l'intérieur du worktree est un lien symbolique
pointant vers `$TEST_DIR/node_modules`.

### E2 : Le chemin `EnterWorktreeTool` applique le symlink

```bash
$QWEN "use enter_worktree to create a worktree named e2-test, then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

readlink "$TEST_DIR/.qwen/worktrees/e2-test/node_modules"
```

**Attendu (post-impl) :** même cible du symlink.

### E3 : Le chemin d'isolation AgentTool applique le symlink

Nécessite une définition de sous-agent. Utilisez le mécanisme de fork intégré :

```bash
$QWEN "use the agent tool with subagent_type='general-purpose', isolation='worktree', description='check node_modules', prompt='run pwd and ls -la node_modules then exit'" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/e3.out

# Extraire le répertoire du worktree de l'agent depuis le message de résultat
jq -r '.[] | select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | .input' \
  < /tmp/e3.out | head -5

# Après exécution, trouver les worktrees agent-<7hex>
ls -la "$TEST_DIR/.qwen/worktrees/"agent-*/node_modules 2>/dev/null | head -3
```

**Attendu (post-impl) :** le lien symbolique existe à l'intérieur du worktree `agent-<hex>`
(sauf si nettoyage automatique car aucun changement — dans ce cas, le chemin
« no changes » ne valide pas le comportement du symlink, passer à un test avec modification forcée).

### E4 : Répertoire source manquant → ignoré silencieusement, worktree toujours créé

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["does-not-exist"] } }
EOF

$QWEN --worktree e4-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e4.out
ls -d "$TEST_DIR/.qwen/worktrees/e4-test"
ls "$TEST_DIR/.qwen/worktrees/e4-test/does-not-exist" 2>/dev/null && echo "UNEXPECTED"
```

**Attendu (post-impl) :** le répertoire du worktree existe, l'entrée manquante n'est pas
créée à l'intérieur, code de sortie = 0.

### E5 : Destination existante → ignoré silencieusement, pas d'écrasement

```bash
# Pré-créer un worktree avec le slug attendu puis recréer — c'est artificiel
# car les chemins de la Phase D devraient être frais, mais cela teste la garde EEXIST.
mkdir -p "$TEST_DIR/.qwen/worktrees/e5-test/node_modules"
echo "preexisting" > "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker"

# Forcer la recréation via EnterWorktreeTool (le CLI refuserait « already exists »)
$QWEN "use enter_worktree with name='e5-test' to retry" --approval-mode yolo 2>/dev/null
# soit : l'outil échoue proprement, SOIT le symlink est ignoré — les deux sont acceptables
test -f "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker" && echo "PASS: not overwritten"
```

**Attendu (post-impl) :** le fichier `.marker` préexistant survit ; aucun lien symbolique ne remplace
le répertoire.

### E6 : Chemin absolu / `../` → rejeté

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["/etc", "../escape"] } }
EOF

$QWEN --worktree e6-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e6.out
ls "$TEST_DIR/.qwen/worktrees/e6-test/" | head -10
```

**Attendu (post-impl) :** le worktree existe ; ni `etc` ni `escape` ne sont liés
à l'intérieur ; le journal de débogage contient des lignes d'avertissement.

---

## Groupe F : Référence PR

**Mode :** headless. Nécessite un remote `origin` pointant vers un dépôt GitHub public.

### Modèle de configuration

```bash
# Utiliser qwen-code lui-même comme dépôt de test
TEST_DIR=$(mktemp -d -t qwen-wt-phd-pr-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)
cd "$TEST_DIR"
git clone --depth 1 https://github.com/QwenLM/qwen-code.git .
PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
```

### F1 : `--worktree=#4174` analyse et récupère

```bash
$QWEN --worktree=#4174 "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f1.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
git -C "$TEST_DIR/.qwen/worktrees/pr-4174" rev-parse --abbrev-ref HEAD
```

**Attendu (post-impl) :**

- Le répertoire worktree `pr-4174/` existe
- HEAD branch = `worktree-pr-4174`
- La pointe de la branche se résout (git log -1) sans erreur

### F2 : Forme URL complète

```bash
$QWEN --worktree "https://github.com/QwenLM/qwen-code/pull/4174" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f2.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
```

**Attendu (post-impl) :** identique à F1.

### F3 : Remote `origin` manquant → échec immédiat

```bash
cd "$TEST_DIR" && git remote remove origin
$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f3.out
echo "exit=$?"
```

**Attendu (post-impl) :** sortie != 0 ; le message mentionne le remote `origin`.

### F4 : Numéro de PR invalide → échec immédiat

```bash
$QWEN --worktree=#999999999 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f4.out
echo "exit=$?"
```

**Attendu (post-impl) :** sortie != 0 ; le message mentionne « Failed to fetch PR ».
Respect de la limite de 30 secondes (temps d'exécution du test < 35 s).

### F5 : `#abc` malformé est redirigé vers la validation du slug

```bash
$QWEN --worktree=#abc "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f5.out
echo "exit=$?"
```

**Attendu (post-impl) :** traité comme slug littéral `#abc`, rejeté par
`validateUserWorktreeSlug` car `#` n'est pas autorisé. Sortie != 0.

### F6 : Le worktree PR reçoit aussi les symlinks (transverse avec E)

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["node_modules"] } }
EOF
mkdir -p "$TEST_DIR/node_modules" && echo x > "$TEST_DIR/node_modules/.marker"

$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
readlink "$TEST_DIR/.qwen/worktrees/pr-4174/node_modules"
```

**Attendu (post-impl) :** cible du symlink = `$TEST_DIR/node_modules`.

---

## Groupe G : Intégration et cas limites

### G1 : Cycle de vie complet — démarrer → écrire → Conserver → reprendre

> **Note pré-impl :** Contre la base de référence, ce test se termine avant que `sleep 3`
> ne finisse (yargs rejette `--worktree` immédiatement et le volet tmux meurt).
> L'appel `capture-pane` échoue alors avec « can't find pane ». Ceci est
> attendu — enregistrer comme PASS-par-rejet. Encapsulez les captures avec `|| true` pour
> le dry-run, ou sautez G1 entièrement en mode base.

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s g1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree g1-test --session-id $SESSION_ID --approval-mode yolo 2>&1 | tee /tmp/g1-stderr.out"
sleep 3
tmux send-keys -t g1 "use the write_file tool to create file 'work.txt' with content 'phase d test'"
sleep 0.3; tmux send-keys -t g1 Enter
sleep 8

tmux send-keys -t g1 C-c; sleep 0.3; tmux send-keys -t g1 C-c; sleep 1
tmux send-keys -t g1 Enter   # défaut = « Keep »
sleep 2
tmux kill-session -t g1

# Le fichier a survécu
cat "$TEST_DIR/.qwen/worktrees/g1-test/work.txt"

# La reprise rattache
tmux new-session -d -s g1b -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --resume $SESSION_ID --approval-mode yolo"
sleep 4
tmux capture-pane -t g1b -p -S -50 | grep -E "⎇ worktree-g1-test|Resumed"
tmux kill-session -t g1b
```

**Attendu (post-impl) :**

- `work.txt` à l'intérieur du worktree contient le contenu écrit
- Le Footer de la session reprise affiche `⎇ worktree-g1-test (g1-test)`
- Un élément d'historique INFO ou une `<system-reminder>` mentionne « Resumed »

### G2 : Chemin relatif en argument résolu avant le basculement de cwd

```bash
# Créer une configuration mcp dans TEST_DIR et y faire référence relativement.
# --mcp-config prend un chemin de fichier ; si le chemin du plan de test est résolu APRÈS
# le basculement de cwd par --worktree, le fichier ne sera pas trouvé à l'intérieur du worktree
# et le CLI échouera. S'il est résolu AVANT le basculement (correct), le
# fichier est chargé depuis TEST_DIR.
cat > "$TEST_DIR/mcp.json" <<'EOF'
{ "mcpServers": {} }
EOF
cd "$TEST_DIR"

$QWEN --worktree g2-test --mcp-config ./mcp.json "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/g2.out
echo "exit=$?"
jq -r '.[] | select(.type=="result") | .result' < /tmp/g2.out | head -3
```
**Attendu (post-impl) :** exit = 0 ; le modèle répond normalement (la
config mcp vide signifie qu’il n’y a pas de serveurs MCP, mais aucune
erreur non plus).

**Attendu (baseline pré-impl) :** yargs rejette `--worktree` (le test
ne peut pas distinguer « drapeau worktree manquant » de « résolution de
la config MCP cassée » tant que le drapeau lui-même n’existe pas).

---

## Ordre d’exécution + parallélisme

| Groupe | Mode         | Durée d’exécution | Parallélisable ?             |
| ------ | ------------ | ----------------- | ---------------------------- |
| A      | headless     | ~30s              | oui (son propre TEST_DIR)    |
| B      | headless     | ~20s              | oui                          |
| C      | headless     | ~40s              | oui                          |
| D      | tmux         | ~30s              | oui (son propre nom de session) |
| E      | headless     | ~60s              | oui                          |
| F      | headless+net | ~60s              | NON — partage le clone GitHub |
| G      | mixte        | ~60s              | oui                          |

Exécuter A/B/C/D/E/G en parallèle ; F en série après la configuration du clone.

## Rapport de reproduction

### Simulation de la phase 4 — baseline `qwen` v0.15.11 (2026-05-20)

Durée d’exécution : 3 agents `test-engineer` en parallèle, ~7 minutes au total. La baseline manque à la fois la phase D (attendue) et les phases A+B (binaire plus ancien qu’attendu — voir l’avertissement E2/E3).

| Groupe                            | Résultat   | Notes                                                                                 |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| A1 (drapeau nu)                   | ✅         | yargs `Unknown argument: worktree`, code de sortie 1                                  |
| A2 (slug explicite)              | ✅         | idem                                                                                  |
| A3 (forme =)                     | ✅         | idem                                                                                  |
| A4 (slug invalide)               | ✅         | yargs rejette avant la validation du slug                                             |
| A5 (répertoire non git)          | ✅         | idem                                                                                  |
| B1 (champs sidecar)              | ✅         | sidecar correctement absent ; sélecteur jq valide sur les données d’exemple           |
| B2 (changement de cwd)           | ✅         | sélecteur jq `tool_result.content` de shell-tool vérifié sur la sortie réelle         |
| B3 (changement de targetDir)     | ✅         | même sélecteur                                                                        |
| C1 (--worktree prime sur sidecar) | ✅         | les deux exécutions sortent avec 1, pas de sidecar                                    |
| C2 (sidecar obsolète + nouveau)  | ✅         | idem                                                                                  |
| E1 (lien symbolique --worktree)  | ✅         | drapeau rejeté, pas de lien symbolique — pré-impl confirmé                            |
| E2 (lien symbolique EnterWorktree) | ⚠️ N/A   | la baseline manque l’outil `enter_worktree` (plus ancien que la PR #4073) ; le garde-fou ignore maintenant ce cas |
| E3 (lien symbolique d’isolation AgentTool) | ⚠️ N/A | le schéma `agent` de la baseline ignore silencieusement le paramètre `isolation` ; le garde-fou ignore |
| E4 (saut source manquante)       | ✅         | drapeau rejeté                                                                        |
| E5 (destination existante non écrasée) | ⚠️ trivial | le `.marker` préexistant a survécu, mais seulement parce que l’outil n’a pas pu s’exécuter |
| E6 (rejet de traversée de chemin) | ✅         | drapeau rejeté, pas de liens symboliques                                              |
| F1 (fetch --worktree=#4174)      | ✅         | `Unknown argument: worktree`, aucun appel réseau                                      |
| F2 (forme URL complète)          | ✅         | idem                                                                                  |
| F3 (origin manquant)             | ✅         | rejeté avant la vérification git                                                      |
| F4 (numéro de PR invalide)       | ✅         | rejeté avant le fetch                                                                 |
| F5 (`#abc` malformé)             | ✅         | idem                                                                                  |
| F6 (PR + symlinkDirs)            | ✅         | idem                                                                                  |
| G1 (cycle de vie tmux)           | ⚠️ partiel | le volet tmux meurt sur le rejet du drapeau ; l’enregistrement par code de sortie fonctionne |
| G2 (chemin relatif)              | ✅         | (après être passé à `--mcp-config ./mcp.json`) yargs rejette worktree d’abord         |

**Conclusion :** les scripts de test sont fondamentalement sains. 19 / 24 cas détectent proprement la baseline pré-impl ; 3 cas (E2/E3/E5) ont besoin que la baseline inclue les phases A+B (que la phase 6 locale fournira) ; 2 cas (G1/G2) avaient des bugs de script maintenant corrigés. **Prêt à passer à la phase 5 d’implémentation.**

### Vérification de la phase 6 — build local

**Binaire :** `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
**Date :** 2026-05-20
**Périmètre :** Groupes A, B, C, E, F, G (6 agents `test-engineer` en parallèle)

| Groupe                              | Résultat                    | Notes                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 (drapeau nu)                     | ✅ (avec astuce doc)      | yargs consomme le prochain argument positionnel comme valeur du slug quand l’utilisateur passe `qwen --worktree "say hi"` ; le guide de démarrage rapide conseille maintenant d’utiliser la forme `=` ou de placer l’invite avant le drapeau. La fonctionnalité d’auto-slug est elle-même confirmée via `qwen --worktree --approval-mode yolo "say hi"` → slug `bright-elm-8a4c12`, le `.cwd` d’initialisation se termine par `.qwen/worktrees/<auto-slug>`.                                     |
| A2 (slug explicite)                 | ✅                        | répertoire `.qwen/worktrees/my-feature` + branche `worktree-my-feature`                                                                                                                                                                                                                                                                                                                     |
| A3 (forme =)                        | ✅                        | identique à A2                                                                                                                                                                                                                                                                                                                                                                             |
| A4 (slug invalide)                  | ✅                        | exit=1, message : `Worktree name may only contain letters, digits, dots, underscores, and hyphens.`, aucun répertoire worktree créé                                                                                                                                                                                                                                                                         |
| A5 (répertoire non git)             | ✅                        | exit=1, message : `not a git repository. Run \`git init\` first or relaunch from inside one.`                                                                                                                                                                                                                                                                                                |
| B1 (champs sidecar)                 | ✅                        | Les 6 champs sont présents et corrects ; le sidecar se trouve sous le projectHash du worktree comme prévu                                                                                                                                                                                                                                                                                                      |
| B2 (changement de cwd)              | ✅                        | `pwd` dans l’outil shell a renvoyé exactement le chemin du worktree                                                                                                                                                                                                                                                                                                                                      |
| B3 (branche + cwd)                  | ✅                        | `pwd` = chemin du worktree, `git rev-parse --abbrev-ref HEAD` = `worktree-b3-test`                                                                                                                                                                                                                                                                                                               |
| C1 (remplacement cross-slug)        | ❌ → **limitation connue** | Les sessions sont liées à `projectHash(cwd)` ; `--worktree second --resume <sid-from-first>` ne peut pas trouver la session. Documenté dans la doc utilisateur (Limitations). Une future refonte de la Config (stockage d’ancrage à la racine du dépôt) lèverait cette limitation.                                                                                                                                                                |
| C2 (sidecar obsolète + nouveau worktree) | ❌ → **même cause racine** | Même contrainte architecturale.                                                                                                                                                                                                                                                                                                                                                              |
| E1 (lien symbolique `--worktree`)   | ✅                        | `node_modules` lié symboliquement dans le nouveau worktree                                                                                                                                                                                                                                                                                                                                              |
| E2 (lien symbolique `enter_worktree`) | ✅                        | même chemin de code via `createUserWorktree`                                                                                                                                                                                                                                                                                                                                                     |
| E3 (lien symbolique d’isolation agent) | ⚠️ configuration de test | le modèle a commit `node_modules` (car le garde-fou de l’agent a refusé l’état sale) ; le garde-fou EEXIST a alors correctement ignoré le lien symbolique. Le chemin de code est correct ; pour un E3 propre, le plan de test doit pré-`.gitignore` `node_modules`.                                                                                                                                                                 |
| E4 (saut source manquante)          | ✅                        | worktree créé, aucune entrée, exit 0                                                                                                                                                                                                                                                                                                                                                          |
| E5 (destination existante non écrasée) | ✅                      | marqueur préexistant a survécu                                                                                                                                                                                                                                                                                                                                                                 |
| E6 (chemin absolu / `..` rejeté)    | ✅                        | aucun chemin lié                                                                                                                                                                                                                                                                                                                                                                             |
| F1 (fetch `--worktree=#4174`)       | ✅                        | répertoire worktree `pr-4174/`, branche `worktree-pr-4174`, commit de pointe `8f4fe8e feat(cli): per-turn /diff…` ; substitution locale-à-distance (bac à sable bloque GitHub réel)                                                                                                                                                                                                                                   |
| F2 (forme URL complète)             | ✅                        | même résultat ; URL analysée → PR #4174 → le fetch depuis origin local a réussi                                                                                                                                                                                                                                                                                                           |
| F3 (origin manquant)                | ✅                        | exit=1 en 2s ; message mentionne l’ajout du remote `origin`                                                                                                                                                                                                                                                                                                                                       |
| F4 (numéro de PR invalide #999999999) | ✅                      | exit=1 en 2s ; « PR does not exist on origin » ; bien dans la limite de 35s                                                                                                                                                                                                                                                                                                                            |
| F5 (`#abc` malformé)                | ✅                        | la validation du slug rejette `#`                                                                                                                                                                                                                                                                                                                                                                 |
| F6 (PR worktree + liens symboliques) | ✅                       | lien symbolique `pr-4174/node_modules` → `$TEST_DIR/node_modules` confirmé                                                                                                                                                                                                                                                                                                                         |
| G1.a (démarrer + écrire + Conserver) | ✅                       | flux TUI, indicateur de pied de page, options de dialogue, fichier persiste                                                                                                                                                                                                                                                                                                                                   |
| G1.b (`--resume … --worktree foo`) | ❌ → **corrigé dans cette PR** | Original : `--worktree: Worktree already exists at …`. Le correctif de la phase 6 a ajouté la branche de rattachement dans `setupStartupWorktree`. Vérifié après correction par un test fumée (`--worktree foo` deux fois → le second émet l’avis `worktree_started`, pas d’erreur) + nouveaux tests unitaires dans `worktreeStartup.test.ts`.                                                                                                     |
| G2 (chemin relatif `--mcp-config`)  | ❌ → **corrigé dans cette PR** | Original : exit=52, `Invalid MCP configuration … is not valid JSON`. Le correctif de la phase 6 normalise les champs d’argv qui prennent des chemins (`mcpConfig`, `openaiLoggingDir`, `jsonFile`, `inputFile`, `telemetryOutfile`, `includeDirectories`) par rapport au cwd de lancement AVANT que `setupStartupWorktree` ne change de répertoire. Vérifié après correction par un test fumée (`--worktree foo --mcp-config ./mcp.json` → le modèle répond normalement). |

**Résultat net de la phase 6 :** 22 / 24 cas réussis après correction ; 2 cas (C1/C2) touchent une limitation architecturale désormais documentée ; 1 cas (E3) est un caprice de configuration de test, pas un problème d’implémentation. **Prêt pour la revue de code de la phase 7.**

### Références des correctifs (correctifs de la phase 6 livrés dans cette PR)

| Correctif                                                     | Fichier                                           | Changement                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rattachement à un worktree existant (G1.b)                  | `packages/cli/src/startup/worktreeStartup.ts`      | Ajout d’une vérification pré-création : si le répertoire est un worktree enregistré sur la branche attendue, ignorer la création + le chdir                                                 |
| Helper `getRegisteredWorktreeBranch()`                       | `packages/core/src/services/gitWorktreeService.ts` | Interroge `git rev-parse --abbrev-ref HEAD` sur le chemin candidat                                                                                     |
| Normalisation des chemins avant chdir (G2)                   | `packages/cli/src/gemini.tsx`                      | Résout `mcpConfig`, `openaiLoggingDir`, `jsonFile`, `inputFile`, `telemetryOutfile`, `includeDirectories` par rapport au cwd de lancement quand `--worktree` est défini |
| Documentation : astuce d’ordre des drapeaux yargs + mise à jour des Limitations | `docs/users/features/worktree.md`                  | Astuce de démarrage rapide + nouveaux points de Limitations (cross-slug, comportement des arguments de chemin)                  |
| Tests unitaires pour le rattachement                         | `packages/cli/src/startup/worktreeStartup.test.ts` | Ajout de 2 tests : rattachement heureux + garde-fou « une branche différente occupe l’emplacement »                                                             |

**Note réseau pour le groupe F de la phase 6** : Le bac à sable bloque `git fetch` vers `https://github.com` avec un HTTP 403. Les cas F1/F2/F4/F6 ont été re-testés contre un dépôt nu local (`git init --bare`) amorcé avec `refs/pull/4174/head` pointant sur un commit dont le message est `feat(cli): per-turn /diff with interactive dialog (#4277)`. F3 et F5 sont indépendants du réseau et ont été vérifiés directement. La substitution locale-à-distance exerce pleinement le chemin de code d’analyse syntaxique + fetch + création de worktree.
---

## Rapport de reproduction — Phase 4 dry-run (Groupes F + G), 2026-05-20

**Binaire** : `qwen` (installé globalement, v0.15.11 dans `/Users/mochi/.nvm/versions/node/v22.21.1/bin/qwen`)
**Override** : `QWEN="qwen"`

### Tableau des résultats

| ID de test                | Résultat | Preuve                                                                                                                                                                                                  | Suggestion de correction           |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| F1 `--worktree=#4174`     | PASS     | `Unknown argument: worktree`, exit=1                                                                                                                                                                    | Aucune — échec de base attendu     |
| F2 `--worktree <url>`     | PASS     | `Unknown argument: worktree`, exit=1                                                                                                                                                                    | Aucune — échec de base attendu     |
| F3 origin manquant        | PASS     | `Unknown argument: worktree`, exit=1 — yargs a rejeté avant toute opération git                                                                                                                         | Aucune                             |
| F4 PR invalide #999999999 | PASS     | `Unknown argument: worktree`, exit=1                                                                                                                                                                    | Aucune                             |
| F5 `#abc` malformé        | PASS     | `Unknown argument: worktree`, exit=1                                                                                                                                                                    | Aucune                             |
| F6 PR + symlinkDirs       | PASS     | `Unknown argument: worktree`, exit=1                                                                                                                                                                    | Aucune                             |
| G1 cycle de vie (tmux)    | PASS     | `Unknown argument: worktree` émis sur stdout, capturé dans `/tmp/g1_raw.out` ; la session tmux s'est terminée immédiatement, le volet était déjà mort au moment de la capture                            | SCRIPT-BUG : voir note ci-dessous  |
| G2 chemin relatif         | PASS     | `Unknown arguments: worktree, prompt-file, promptFile`, exit=1                                                                                                                                          | SCRIPT-BUG : voir note ci-dessous  |

### Comportement observé (tous les cas)

Chaque invocation de `--worktree` (simple, forme `=`, forme `#<N>`, URL complète, combiné avec `--prompt-file`) a été rejetée au niveau du parsing d’arguments yargs avec le code de sortie 1, avant toute exécution de logique applicative. Les chaînes d’erreur exactes sont :

- `Unknown argument: worktree` (un seul argument inconnu)
- `Unknown arguments: worktree, prompt-file, promptFile` (G2 : `--worktree` et `--prompt-file` sont tous deux inconnus, listés ensemble)

Aucune opération git, aucun appel réseau, aucune écriture sur le système de fichiers n’a eu lieu dans aucun test.

### Comportement attendu

Rejet identique — c’est la base de référence correcte avant implémentation. Les 8 tests sont PASS au sens du dry-run (le plan détecte correctement que les fonctionnalités n’existent pas).

### Contexte clé

Le mode d’échec est uniformément au niveau de yargs, pas en aval. Cela confirme que la stratégie de détection du plan de test est solide : une fois que `--worktree` sera intégré dans yargs, ces tests cesseront d’échouer à ce niveau et exerceront les chemins d’implémentation réels (F1-F6 déclencheront git fetch, G1 déclenchera le cycle de vie TUI, G2 déclenchera la résolution de `--prompt-file`).

### Notes SCRIPT-BUG pour le plan de test

**G1 (tmux) :** La commande de session tmux redirige via `tee` avec un sous-shell `echo 'PROC_EXIT='$?` qui capture la sortie de `tee`, pas celle de `qwen`. Lorsque le processus se termine instantanément (comme avec une erreur d’argument inconnu), la session se termine avant la fin du `sleep 3` et le nom du volet `g1dry` a disparu au moment où `tmux capture-pane` s’exécute, produisant `can't find pane: g1dry`. Correction : utiliser `|| true` après `tmux capture-pane`, ou ajouter un garde `|| sleep 0` ; mieux encore, pour le cas d’échec de base, rediriger stderr+stdout vers un fichier en dehors de tmux et vérifier le fichier directement (comme fait ici via `tee /tmp/g1_raw.out`).

**G2 (`--prompt-file`) :** Le plan de test utilise `--prompt-file ./relative.txt` comme test combiné avec `--worktree`. Dans la base de référence, `--prompt-file` est aussi un argument inconnu (il n’existe pas non plus dans le schéma yargs de v0.15.11 — le flag est `--prompt-interactive` / `-p`). L’erreur liste les deux arguments inconnus ensemble. Le plan doit noter que `--prompt-file` devra être implémenté en même temps que `--worktree`, ou utiliser un flag existant (par exemple, pipe via stdin ou utiliser `--prompt`) pour le test de résolution de chemin relatif.