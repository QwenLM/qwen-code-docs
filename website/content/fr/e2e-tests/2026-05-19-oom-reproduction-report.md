# OOM 压力测试与长任务 Replay 报告

**日期** : 2026-05-19
**Branche** : `codex/memory-diagnostics-local-run`
**Testeur** : yiliang114
**Conclusion** : Réplication réussie et identification de la cause racine. L'auto-compaction introduite dans v0.15.7 (#3735) double la fréquence d'appel de `structuredClone`, formant une boucle de rétroaction positive sous forte pression heap, conduisant à l'OOM. Les logs de debug réels corroborent ce mécanisme.

---

## 一、Contexte

Plusieurs issues (#4309, #4276, #4185, #4315, #4322, #2868) rapportent des crashs V8 heap OOM sur qwen-code lors de sessions longues :

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

Caractéristiques des crashs rapportés :
| Issue | Heap au crash | Durée d'exécution | Plateforme |
|-------|---------------|-------------------|------------|
| #4276 | 4014 MB | ~110 minutes | Linux x64 |
| #4315 | 2027 MB | ~19,6 heures | macOS (limite par défaut 2 GB) |
| #4322 | 4023 MB | ~7 heures | Windows |
| #2868 | 2035 MB | ~1,7 minute | Linux |
| #4309 | 7020 MB | Inconnue | Windows (limite 8 GB définie, crash quand même) |

---

## 二、Correction méthodologique

Ce rapport distingue deux types de tests :

1. **Tests sous faible pression heap** : en réduisant `--max-old-space-size` pour amplifier le problème, permettant d'identifier rapidement le chemin de code où « la copie intégrale du history, lorsqu'il est très grand, crée un pic instantané ». C'est un outil de diagnostic, pas équivalent à la reproduction de l'OOM réel 4G/8G de l'utilisateur.
2. **Replay de longues tâches avec heap par défaut** : sans définir `NODE_OPTIONS`, restauration à partir d'un vrai JSONL history et poursuite de tâches de review, tout en échantillonnant le RSS du process-tree depuis l'extérieur. Seuls ces résultats sont utilisés pour évaluer l'empreinte mémoire réelle côté utilisateur.

Par conséquent, les résultats sous faible heap ne peuvent pas à eux seuls prouver que « l'OOM réel est corrigé ». Ils indiquent seulement qu'un certain chemin produit une amplification de pic lorsque le history est suffisamment grand, nécessitant une validation avec le replay de longues tâches sous heap par défaut.

## 三、Conditions du test sous faible pression heap

| Paramètre | Valeur |
| ------------------------ | ------------------------------------------------------------ |
| Version CLI | 0.15.11 (build depuis la branche `codex/memory-diagnostics-local-run`) |
| Modèle | `qwen3.6-plus` (fenêtre contextuelle de 128K) |
| Limite Heap | `--max-old-space-size=512` |
| Filet de sécurité pression heap | **Désactivé** (HEAP_PRESSURE_COMPRESSION_RATIO défini à 99.0) |
| Mode opératoire | YOLO + tâches automatisées de lecture de fichiers multi-tours |
| Répertoire de travail | qwen-code monorepo (3538 fichiers .ts, 1,26M lignes) |

### Modification clé de la configuration

Dans `packages/core/src/core/geminiChat.ts`, le seuil de compaction heap-pressure est passé de 0.7 à 99.0 (pour qu'il ne soit jamais déclenché), simulant l'état avant la correction #4186.

---

## 四、Résultats du test sous faible pression heap

### Chronologie du crash

```
[21:26:59] #1 RSS:193.6MB Ctx:0%   → Read geminiChat.ts (1500 lignes)
[21:27:46] #2 RSS:270.4MB Ctx:4.2% → Read agent.ts
[21:28:32] #3 RSS:397.5MB Ctx:4.3% → grep + Read 3 fichiers
[21:29:18] #4 RSS:452.7MB Ctx:5.7% → Read slashCommandProcessor.ts
[21:30:04] #5 RSS:515.0MB Ctx:5.9% → Read chatCompressionService.ts
[21:30:50] #6 RSS:649.1MB Ctx:4.0% ← TOKEN COMPACTION déclenché (5.9%→4.0%)
                                       RSS augmente de 134MB (pic structuredClone)
[21:31:36] #7 RSS:666.7MB Ctx:3.2% ← Nouvelle compaction, RSS continue d'augmenter
[21:32:22] CRASH — FATAL ERROR: Ineffective mark-compacts near heap limit
```

**Temps total** : ~5,5 minutes, crash après 7 tours de tâches.

Cela prouve qu'avec un heap limité, un long history combiné à une compaction/history clone peut déclencher un V8 heap OOM. Cependant, ce résultat ne signifie pas que l'OOM réel de l'utilisateur sous heap par défaut est entièrement reproduit.

### Reproduction synthétique avec heap plus grand

Pour ne pas se fier uniquement aux résultats avec 512 MiB de heap, un test synthétique de pression runtime avec un heap plus grand a été ajouté. Ce test n'appelle pas le modèle mais construit un history simulant de longues tâches de review/subagent :

- tours de review racine : 10
- appels subagent : 30
- enregistrements de transcript subagent : 780
- octets de résultat d'outil retenus : 193 986 560
- octets d'history sérialisé : 195 620 061
- mode pression : copies retenues de `structuredClone(history)`

| Limite Heap | Pression Clone | Résultat | GC / stack clé |
| ---------- | -----------------: | ---------------------------------------- | ------------------------------------------------------------ |
| 2 GiB | 8 clones retenus | Pas de crash, RSS 2,42 GiB, heap utilisé 1,87 GiB | Proche de la limite heap |
| 2 GiB | 10 clones retenus | OOM | `Reached heap limit`, `ValueDeserializer`, `StructuredClone` |
| 4 GiB | 20 clones retenus | OOM | `Reached heap limit`, `ValueDeserializer`, `StructuredClone` |

Résumé GC pour la reproduction 2 GiB :

```
Mark-Compact 2042.9 (2081.9) -> 2042.9 (2081.1) MB
Mark-Compact 2048.9 (2087.2) -> 2048.9 (2087.2) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
...
node::worker::(anonymous namespace)::StructuredClone
```

Résumé GC pour la reproduction 4 GiB :

```
Mark-Compact 4082.5 (4126.8) -> 4082.5 (4126.3) MB
Mark-Compact 4095.1 (4139.0) -> 4095.1 (4139.0) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
...
node::worker::(anonymous namespace)::StructuredClone
```

Ces résultats sont plus proches des OOM heap 2 GiB / 4 GiB rapportés par les utilisateurs que le test avec 512 MiB : dès que le history contient suffisamment de gros résultats d'outils / transcripts subagent, un clone retenu ou instantané de l'intégralité du history peut déclencher un V8 OOM sous 2-4 GiB de heap. Il s'agit toujours d'une reproduction synthétique, non équivalente au replay complet des longues tâches métier, mais elle prouve directement que le problème n'est pas « fabriqué artificiellement avec un petit heap ».

### État GC au moment du crash

```
[41381:0x130008000] 342468 ms: Mark-Compact 508.6 (526.7) -> 507.0 (526.9) MB,
  pooled: 1 MB, 86.42 / 0.00 ms  (average mu = 0.175, current mu = 0.150)
  task; scavenge might not succeed

[41381:0x130008000] 342568 ms: Mark-Compact 509.1 (526.9) -> 507.1 (528.2) MB,
  pooled: 0 MB, 93.79 / 0.12 ms  (average mu = 0.121, current mu = 0.068)
  allocation failure; scavenge might not succeed

FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

Mark-Compact ne peut libérer que 1-2 MB (presque tous les objets sont reachables), prouvant que la mémoire est effectivement remplie par des objets légitimement détenus.

---

## 五、Replay de longues tâches avec heap par défaut

Pour éviter une généralisation excessive des conclusions sous faible heap, un replay réel JSONL avec heap par défaut a été ajouté :

- Pas de définition de `NODE_OPTIONS`
- Pas d'activation du profiler runtime interne, pour éviter que l'échantillonneur n'affecte le heap
- Chaque CLI crée une session fraîche à partir de la même rewound JSONL
- Utilisation d'un `QWEN_HOME` temporaire, désactivation de MCP et hooks, pour éviter les pollutions de configuration globale locale
- Utilisation uniquement de l'échantillonnage externe pour le RSS du process-tree

| CLI | Résultat | Durée | Pic Tree RSS | Pic Root RSS | Pic Worker RSS | Remarques |
| -------------------- | ---- | -----: | ------------: | ------------: | --------------: | ----------------------------------------------------------- |
| `qwen` installé | Succès | 167,3s | 838,0 MiB | 230,2 MiB | 566,3 MiB | Première exécution fraîche a rencontré une erreur serveur du modèle, non retenue ; réessai réussi |
| Bundle local reconstruit | Succès | 106,3s | 527,5 MiB | 182,1 MiB | 345,4 MiB | Inclut la correction du chemin critique du clone local |

Conclusions du replay avec heap par défaut :

1. Ce JSONL de review peut produire de manière stable plusieurs centaines de MiB à environ 0,8 GiB de RSS process-tree, mais ne reproduit pas d'OOM 4G/8G.
2. Le bundle local reconstruit a un pic inférieur au CLI installé sur le même replay, montrant que la réduction du chemin critique du history clone apporte un bénéfice réel.
3. Cela ne prouve pas que tous les OOM utilisateurs sont résolus. Les OOM réels 4G/8G nécessitent encore des tâches plus longues, une accumulation plus grande de tool-result, ou un replay avec pression MCP/tool schema.

## 六、Analyse de la cause racine

### Mécanisme à trois couches de l'OOM

```
┌─────────────────────────────────────────────────────────┐
│ Couche 3 : Limite V8 Heap (512MB/2GB/4GB)               │ ← L'utilisateur finit par heurter cela
├─────────────────────────────────────────────────────────┤
│ Couche 2 : Pic dû à structuredClone() (instantané ~2x)  │ ← Déclencheur direct
├─────────────────────────────────────────────────────────┤
│ Couche 1 : Accumulation des tool results dans le history (croissance linéaire) │ ← Croissance de base
├─────────────────────────────────────────────────────────┤
│ Couche 0 : Moment du déclenchement de la token compaction │ ← Point de contrôle
└─────────────────────────────────────────────────────────┘
```

### Chemin de crash précis

```
sendMessage()
  → tryCompress()
    → heapPressureRatio < threshold (safety net désactivé)
    → ChatCompressionService.compress()
      → chat.getHistory(true)
        → structuredClone(this._history)   ← Allocation pic !
          → V8 nécessite N Mo supplémentaires pour le clone
          → Si existing heap + N > limit → OOM
```

### Preuves clés

| Observation | Signification |
| --------------------------------------- | ---------------------------------------------- |
| Tâche #5→#6 : Context 5,9%→4,0% (baisse) | La token compaction **a réussi** |
| Tâche #5→#6 : RSS 515→649 Mo (hausse de 134 Mo) | Le `structuredClone` du processus de compaction a créé un pic |
| GC ne peut libérer que 1-2 Mo | Tous les objets sont live (history + clone présents) |
| #4309 : limite 8 Go définie, crash quand même | Quand le history est assez grand, le pic du clone peut dépasser n'importe quelle limite |

À noter : ces preuves proviennent d'une combinaison de tests sous faible pression heap et d'observations des issues. Le replay sous heap par défaut soutient actuellement que « le chemin critique du clone a un impact significatif sur le pic RSS », mais n'a pas encore reproduit indépendamment un OOM 4G/8G.

### Pourquoi une fenêtre contextuelle de 128K est plus susceptible de déclencher

- 128K × 70% = ~90K tokens déclenchent la compaction
- Une grande fenêtre contextuelle (1M) à 70% = 700K tokens, presque jamais déclenchée
- **Plus la compaction est fréquente → plus structuredClone est fréquent → plus le risque d'OOM est élevé**
- Les modèles comme DeepSeek qui n'ont pas configuré contextWindowSize utilisent par défaut 128K, donc plus susceptibles de déclencher

---

## 六.5、Preuves issues des logs d'exécution réels

Les logs suivants sont extraits de la sortie debug d'une session de crash locale. Pour éviter de divulguer les chemins locaux et l'ID de session, le rapport ne conserve que la chronologie et le contenu clé des logs.

La session a démarré à `2026-05-19T13:26:35Z` (locale 21:26:35), et a crashé à `2026-05-19T13:32:10Z` (locale 21:32:10).

### Chronologie des événements de pression heap et d'auto-compaction

```
13:29:43 [WARN]  Heap pressure at 74.9%; attempting auto-compaction before token threshold.
13:30:06 [DEBUG] [FILE_READ_CACHE] clear after auto tryCompress    ← compaction #1 exécutée avec succès
13:30:13 [WARN]  Heap pressure at 70.7%; attempting auto-compaction before token threshold.
                 ← Heap vient de passer de 74,9% à seulement 70,7% après compaction, toujours au-dessus du seuil, nouvelle tentative immédiate
13:30:52 [DEBUG] Heap pressure at 86.0%; skipping heap-pressure auto-compaction during cooldown.
                 ← Refusée pendant le cooldown de 30s
13:30:56 [WARN]  Heap pressure at 85.3%; attempting auto-compaction before token threshold.
                 ← Cooldown expiré, heap monté à 85,3%
13:31:21 [DEBUG] [FILE_READ_CACHE] clear after auto tryCompress    ← compaction #2 exécutée avec succès
13:31:37 [WARN]  Heap pressure at 88.8%; attempting auto-compaction before token threshold.
                 ← Après compaction, le heap rebondit à 88,8%
13:32:09 [DEBUG] Heap pressure at 90.2%; skipping heap-pressure auto-compaction during cooldown.
                 ← Heap atteint 90,2%, impossible d'exécuter pendant le cooldown
13:32:10 ← Logs terminés (processus crashé par OOM)
```

### Interprétation des logs

| Observation des logs | Signification |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 4 tentatives d'auto-compaction heap-pressure en 2,5 minutes (2 refusées pour cooldown) | `tryCompress` introduit par #3735 se déclenche fréquemment en haute pression |
| Le ratio heap reste >70% après chaque compaction | Le pic temporaire créé par `structuredClone()` annule le bénéfice de la compression |
| 74,9% → 70,7% → 86% → 85,3% → 88,8% → 90,2% → crash | Boucle de rétroaction positive : compression → pic clone → heap plus haut → recompression → encore plus haut |
| Les logs s'arrêtent 1 seconde après 90,2% | Le `structuredClone()` de la prochaine `getHistory(true)` dépasse instantanément la limite |
| `[FILE_READ_CACHE] clear after auto tryCompress` apparaît 2 fois | Confirme que la compaction a bien suivi le chemin complet compress → setHistory |

### Mécanisme de la boucle de rétroaction positive

```
ratio heap élevé (>70%)
  → déclenche l'auto-compaction heap-pressure
    → tryCompress() appelle getHistory(true) en interne
      → structuredClone(this._history)  ← pic instantané heap +30~40%
        → compaction réussie, libère l'ancien history
          → mais le pic clone a déjà poussé le heap à un niveau plus dangereux
            → le prochain send continue d'accumuler
              → ratio heap encore plus élevé → déclenchement plus fréquent → crash
```

---

## 六.6、Attribution de version : pourquoi les rapports d'OOM ont augmenté entre 0.15.7 et 0.15.11

### Chronologie des commits clés

| Version | PR | Changement | Impact sur la fréquence d'appel de `structuredClone` |
| ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------- |
| **v0.15.6** | — | `getHistory(true)` appelé 1 fois seulement à l'entrée de `sendMessage` | Base : 1 clone par send |
| **v0.15.7** | **#3735** `auto-compact subagent context` | Abaissement de `tryCompress()` dans `GeminiChat`, **avant chaque send**, exécute une vérification de compaction | **+1 fois** : vérification compress avant send |
| **v0.15.10** | **#3879** `reactive compression on context overflow` | Quand le provider retourne un context overflow, déclenche à nouveau `tryCompress()` + `getHistory(true)` | **+1~2 fois** : chemin de retry overflow |
| **v0.15.10** | **#3985** `harden reactive compression` | Renforcement de la logique de retry de compression réactive | Idem |

### Comparaison des points d'appel de `getHistory(true)` entre v0.15.6 et v0.15.11

**v0.15.6** (2 emplacements) :

```
L367: const requestContents = this.getHistory(true);          ← send construit la requête
L618: const recoveryContents = self.getHistory(true);         ← escalation MAX_TOKENS (très rare)
```

**v0.15.11** (5 emplacements) :

```
L467: Appel interne à ChatCompressionService.compress()       ← #3735: auto-compact avant chaque send
L574: requestContents = this.getHistory(true);                ← send construit la requête
L724: Appel interne à reactive tryCompress()                  ← #3879: retry après context overflow
L739: requestContents = self.getHistory(true);                ← #3879: retry construit la nouvelle requête
L943: const recoveryContents = self.getHistory(true);         ← escalation MAX_TOKENS
```

### Pire chemin : un seul send peut déclencher 4 `structuredClone`

```
sendMessage()
  → tryCompress()              ← #3735: getHistory(true) [clone #1]
  → getHistory(true)           ← construction requête [clone #2]
  → API retourne context overflow
    → reactive tryCompress()   ← #3879: getHistory(true) [clone #3]
    → getHistory(true)         ← retry requête [clone #4]
```

### Conclusion

**#3735 (v0.15.7)** est le déclencheur le plus probable de l'augmentation significative de la fréquence des OOM (pas la seule cause racine) – il fait en sorte que chaque `sendMessage` exécute d'abord un `tryCompress()`, et `tryCompress` appelle `ChatCompressionService.compress()` → `chat.getHistory(true)` pour un clone complet de l'history. Lorsque l'history est volumineux, cette conception « clone d'abord, puis vérifie si la compression est nécessaire » fait passer le pic mémoire de ~1.3x à ~2x+. Note : l'historique des issues montre que les rapports d'OOM existaient avant #3735, mais #3735 a considérablement augmenté la fréquence d'appel de structuredClone, augmentant ainsi significativement la probabilité d'OOM.

**#3879 (v0.15.10)** a aggravé le problème – alors que le heap est déjà à la limite (provider retourne context overflow), un clone complet supplémentaire est déclenché, rendant les sessions déjà dangereuses encore plus susceptibles de crasher.

---

## 七、Validation de l'efficacité de la correction #4186 (test comparatif)

Test comparatif après activation du filet de sécurité heap-pressure (HEAP_PRESSURE_COMPRESSION_RATIO = 0.7) :

| Indicateur | Safety net désactivé | Safety net activé |
| --------------- | ------------------ | ------------------------- |
| Occurrence OOM | Oui (crash après 7 tours) | Non (fonctionnement continu >10 minutes) |
| Pic RSS | 666 MB → crash | 555 MB → GC libère à 280 MB |
| Déclenchement compaction | Seulement au seuil token | Déclenché à 70% heap |
| Comportement Context | 5.9%→4.0%→crash | 22.7%→17.0% (retour sécurisé) |

**Conclusion** : Le filet de sécurité heap-pressure de #4186 prévient efficacement l'OOM, mais c'est une **atténuation**, pas une correction définitive :

- Si l'history occupe déjà 60%+ du heap, même une compaction anticipée peut ne pas suffire à éviter que le pic du clone ne dépasse la limite
- Cela explique pourquoi l'utilisateur de #4309, même avec une limite de 8 Go, crashait encore

---

## 八、Répartition de l'utilisation mémoire

Estimation basée sur les schémas de croissance RSS observés dans les tests :

| Emplacement mémoire | Pourcentage | Caractéristique de croissance |
| -------------------------------- | ------ | --------------------------- |
| `this._history[]` (tool results) | 40-50% | Accumulation linéaire, +30-100MB par tour |
| Copie temporaire `structuredClone()` | 30-40% | Pic instantané, apparaît lors de la compaction |
| Runtime V8 (métadonnées GC, code) | ~15% | Quasi constant |
| Buffers UI/logging/stream | ~5% | Croissance lente |

---

## 九、Script de reproduction et environnement

### Script de pilotage automatisé

```bash
#!/bin/bash
# /tmp/oom-simple-driver.sh <nom-session-tmux>
SESSION="$1"

TASKS=(
  "Lire intégralement packages/core/src/core/geminiChat.ts avec l'outil Read"
  "Lire intégralement packages/core/src/tools/agent/agent.ts avec l'outil Read"
  "Exécuter grep -rn structuredClone packages/core/src puis Read les 3 premiers fichiers"
  "Lire intégralement packages/cli/src/ui/hooks/slashCommandProcessor.ts avec Read"
  "Lire intégralement packages/core/src/services/chatCompressionService.ts avec Read"
  "Exécuter find packages/cli/src/ui/commands -name '*.ts' puis Read un par un"
  "Lire intégralement packages/core/src/core/turn.ts avec Read"
  # ... plus de tâches
)

i=0
while true; do
  TASK="${TASKS[$((i % ${#TASKS[@]}))]}"
  i=$((i + 1))

  QWEN_PID=$(ps aux | grep "dist/index.js" | grep -v grep | awk '{print $2}' | sort -rn | head -1)
  RSS=$(ps -o rss= -p $QWEN_PID 2>/dev/null)
  [ -z "$RSS" ] && { echo "CRASH après $((i-1)) tâches !"; exit 0; }

  RSS_MB=$(echo "scale=1; $RSS/1024" | bc)
  CTX=$(tmux capture-pane -t "$SESSION:1" -p 2>/dev/null | grep -oE "[0-9]+\.[0-9]+% utilisé" | tail -1)
  echo "[$(date +%H:%M:%S)] #$i RSS:${RSS_MB}MB Ctx:$CTX | ${TASK:0:55}"

  tmux send-keys -t "$SESSION:1" C-u
  sleep 0.2
  tmux send-keys -t "$SESSION:1" "$TASK" Enter
  sleep 0.5
  tmux send-keys -t "$SESSION:1" Enter
  sleep 45
done
```

### Commande de lancement

```bash
# 1. Désactiver le filet de sécurité heap-pressure
# geminiChat.ts : HEAP_PRESSURE_COMPRESSION_RATIO = 99.0

# 2. Construire
npm run build --workspace=packages/core && npm run build --workspace=packages/cli

# 3. Lancer qwen (modèle 128K context, 512MB heap)
SESSION="oom-test"
tmux new-session -d -s "$SESSION" -c "$REPO_DIR"
tmux send-keys -t "$SESSION" \
  "NODE_OPTIONS='--max-old-space-size=512' node packages/cli/dist/index.js --model 'qwen3.6-plus'" Enter

# 4. Attendre le lancement puis exécuter le pilote
sleep 10
bash /tmp/oom-simple-driver.sh "$SESSION"
```

---

## 十、Recommandations ultérieures

### Atténuation à court terme (existante)

- [x] #4186 : filet de sécurité auto-compaction heap-pressure (seuil 0.7)
- [x] #4188 : limite supérieure de fileReadCache / crawlCache

### Correction à moyen terme (suggestion)

- [ ] Réduire les appels à `structuredClone()` — `nextSpeakerChecker` n'a besoin que du dernier message, pas du clone complet
- [ ] Utiliser slice + référence dans la compaction au lieu du deep clone complet
- [ ] Écrire les gros tool results (>100KB) dans des fichiers temporaires, ne conserver dans l'history qu'une référence résumée

### Direction à long terme

- [ ] Déchargement des tool results sur disque + chargement paresseux (#4184)
- [ ] Stratégie de compression hiérarchique basée sur RSS (pas seulement le nombre de tokens)
- [ ] Stockage segmenté de l'history, éviter les opérations complètes uniques