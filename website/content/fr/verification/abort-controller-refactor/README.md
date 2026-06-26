# Refactorisation d'AbortController — plan de vérification

Scénarios utilisés pour valider manuellement le changement avant d'ouvrir la PR. Chaque scénario capture son panneau tmux via `tmux pipe-pane -o 'cat >> <log>'`.

## Configuration unique

```sh
# Point WT at your local checkout of the branch under review.
WT=/path/to/qwen-code/worktree
LOGDIR=$WT/docs/verification/abort-controller-refactor/logs
mkdir -p "$LOGDIR"

# Build the CLI once (skip sandbox image, skip vscode).
( cd "$WT" && npm run build:packages )
```

## Scénarios

Pour chaque scénario :

```sh
tmux new-session -d -s qwen-verify-XX
tmux pipe-pane -t qwen-verify-XX -o "cat >> $LOGDIR/XX-name.log"
tmux send-keys -t qwen-verify-XX "cd /path/to/your/test/workspace && exec node $WT/packages/cli/dist/index.js" C-m
tmux attach -t qwen-verify-XX
```

Ensuite, pilotez la session manuellement selon la matrice ci-dessous. Appuyez sur `C-b d` pour détacher lorsque c'est terminé ; `tmux kill-session -t qwen-verify-XX` pour arrêter le panneau.

### 00 — Référence (avant correction)

- **Setup:** basculer sur la branche `main`, construire, exécuter avec `NODE_OPTIONS=--trace-warnings`.
- **Input:** longue session mixte d'outils de 50 tours (shell + edit + grep + agent).
- **Expected:** après environ 30–40 tours, `MaxListenersExceededWarning: ... 1500+ abort listeners added to [AbortSignal]` affiché sur stderr.
- **Log:** `00-baseline-reproduction.log`.

### 01 — Session longue, mode DEBUG (cette branche)

- **Setup:** `NODE_OPTIONS=--trace-warnings DEBUG=1 qwen`.
- **Input:** même script de 50 tours que #00.
- **Expected:** aucun `MaxListenersExceededWarning` affiché ; les autres avertissements s'affichent toujours.
- **Log:** `01-long-session-debug.log`.

### 02 — Session longue, mode production (cette branche)

- **Setup:** `qwen` (pas de variable d'environnement debug).
- **Input:** même script de 50 tours.
- **Expected:** sortie propre ; une sonde `console.error` temporaire dans le handler (ajoutée puis retirée) confirme que le filtre se déclenche.
- **Log:** `02-long-session-prod.log`.

### 03 — Annulation Ctrl-C en cours de flux

- **Setup:** cette branche, interactif.
- **Input:** demander une longue génération (>30s) ; appuyer sur Ctrl-C en cours de flux.
- **Expected:** le flux s'arrête en ~200ms, la bannière "Cancelled" s'affiche, l'invite suivante accepte la saisie. Le compte `process._getActiveHandles()` revient à la ligne de base (utiliser `:debug handles`).
- **Log:** `03-ctrlc-streaming.log`.

### 04 — Annulation d'un shell longue durée

- **Setup:** cette branche.
- **Input:** exécuter `sleep 60` via l'outil shell ; annuler en cours d'exécution.
- **Expected:** le processus enfant est tué (vérifier avec `pgrep -f sleep` qui retourne vide), le résultat de l'outil montre l'annulation, l'agent accepte l'invite suivante.
- **Log:** `04-shell-cancel.log`.

### 05 — Annulation d'un sous-agent

- **Setup:** cette branche.
- **Input:** lancer une longue tâche d'agent via l'outil agent ; annuler depuis le parent.
- **Expected:** les appels d'outil en cours du sous-agent s'annulent, le flux du modèle du sous-agent s'arrête, le parent reçoit l'événement d'annulation.
- **Log:** `05-subagent-cancel.log`.

### 06 — Annulation headless / non interactive

- **Setup:** `qwen --prompt "do a long task"` ; envoyer `SIGINT` depuis l'extérieur via `kill -INT <pid>`.
- **Expected:** arrêt propre, code de sortie 130, aucun avertissement.
- **Log:** `06-headless-abort.log`.

### 07 — Flux d'agent en arrière-plan

- **Setup:** interactif.
- **Input:** lancer un agent en arrière-plan (`run_in_background: true`) ; le laisser se terminer ; lancer un second ; annuler le second en cours de vol.
- **Expected:** le premier agent se termine normalement ; le second s'annule proprement ; aucune fuite d'écouteur entre les deux.
- **Log:** `07-background-agent.log`.

### 08 — Référence mémoire

- **Setup:** `qwen --inspect`, attacher les devtools Chrome.
- **Input:** session de 100 tours.
- **Expected:** instantanés du tas aux tours 0/50/100. Le nombre d'instances `AbortSignal` et le nombre d'écouteurs par signal stables (pas de croissance monotone).
- **Log:** `08-memory-snapshots/`.

### 09 — Consommateur existant de combinedAbortSignal

- **Setup:** déclencher un hook HTTP avec à la fois un signal externe et un timeout.
- **Input:** (a) annuler le signal externe en cours de hook ; (b) laisser le timeout se déclencher dans une exécution séparée.
- **Expected:** le hook s'annule proprement dans les deux cas ; le chemin de shim de dépréciation est exercé.
- **Log:** `09-http-hook-shim.log`.

## Vérifications automatisées (non interactives)

Les vérifications automatisées ci-dessous ont été exécutées pendant le développement et enregistrées dans `automated-results.md` :

- Tous les tests unitaires abortController passent (`abortController.test.ts`, 26 tests ; 1 test GC ignoré sans `--expose-gc`).
- Tous les tests warningHandler passent (`warningHandler.test.ts`, 13 tests incluant un test d'intégration stderr d'un enfant créé).
- Tous les tests consommateurs `combineAbortSignals` passent (`httpHookRunner.test.ts`) ; le shim obsolète `createCombinedAbortSignal` ainsi que son propre fichier de test ont été supprimés une fois le seul appelant migré.
- Tous les tests agent runtime / followup / openaiContentGenerator / hooks passent.
- Périmètre de migration (intentionnel) : seule la chaîne parent→enfant du runtime agent (`agent-interactive.ts`, `agent-core.ts`, `agent-headless.ts`) plus `promptHookRunner.ts` (véritable fuite de nettoyage) a été basculée vers l'assistant. Les contrôleurs indépendants à courte durée de vie (par commande shell, par fetch, par rappel, etc.) restent sur le `new AbortController()` brut — ils sont rapidement récupérés par le GC et n'accumulent pas d'écouteurs sur un parent à longue durée de vie. Voir `migration-completeness.txt` pour le grep capturé et la justification.
- La vérification de type en mode strict TypeScript passe pour `packages/core` et `packages/cli`.
- La vérification Prettier passe sur tous les fichiers modifiés.

Voir `automated-results.md` pour la sortie réelle des commandes.

## Comment capturer les artefacts pour le corps de la PR

Après avoir exécuté chaque scénario, attachez le fichier de transcription (ou un extrait pertinent) à la PR. Pour #08 (mémoire), exportez les instantanés du tas et incluez le delta du nombre d'écouteurs entre les instantanés.