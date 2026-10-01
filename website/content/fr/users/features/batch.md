# Mode Batch (DashScope)

L'API Batch DashScope exécute les requêtes de manière asynchrone à la moitié du
prix temps réel, avec une fenêtre d'exécution d'au moins 24 heures. Qwen Code
l'utilise via `/batch-api` : vous décrivez une tâche en lot, l'agent prépare un
plan, et `qwen batch` le soumet, le suit et écrit les résultats dans des
fichiers.

## Configurer un modèle Batch

Déclarez le point de terminaison et l'identifiant une seule fois dans
`settings.json`, puis sélectionnez-le avec `batch.model`. Votre modèle de
conversation habituel et votre authentification restent inchangés, y compris
lorsque la conversation utilise Qwen OAuth ou un autre fournisseur.

```json
{
  "env": { "DASHSCOPE_API_KEY": "your-key" },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "batch": { "authType": "openai", "model": "qwen3.7-plus" }
}
```

Fusionnez ces champs dans vos paramètres existants, en conservant vos autres
entrées de fournisseur. `envKey` désigne la clé dans `settings.env` (ou une
variable d'environnement) ; aucune exportation shell séparée n'est nécessaire.
Le `generationConfig` du fournisseur contrôle la génération Batch. `wireApi`
est le protocole de requête, pas un interrupteur Batch : omettez-le ou
utilisez `"chat-completions"` ; `"responses"` n'est pas pris en charge par cet
exécuteur.

`batch.authType` vaut `openai` par défaut. Le modèle doit correspondre à
exactement une entrée chat-completions compatible OpenAI avec un `baseUrl` et
un `envKey` renseigné. Si des ID se répètent, définissez `batch.baseUrl` sur
l'URL configurée exacte. Les sélections explicites invalides échouent avant
tout envoi ; elles ne reviennent jamais aux identifiants de conversation.
Redémarrez la session interactive après avoir modifié cette sélection afin que
son collecteur en arrière-plan utilise les mêmes paramètres que les commandes
enfants.

Sans sélection Batch, le comportement précédent reste en vigueur : Batch
réutilise la configuration du modèle principal et requiert une authentification
par clé API compatible OpenAI. Les identifiants Qwen OAuth n'ont pas de route
Batch. Exécutez `qwen batch check` pour vérifier l'état de préparation sans
soumettre de requête payante.

## Quand batch est le bon outil

- **Moitié prix, pas de cache.** Batch facture les requêtes réussies à 50 % du
  prix temps réel, mais le cache de préfixe n'atteint jamais l'intérieur d'un
  lot (`cached_tokens: 0` mesuré). Le temps réel facture l'entrée en cache à
  20 % du prix, donc batch ne gagne que lorsque peu de chaque requête est
  partagée : avec un taux de succès de cache `h`, le temps réel coûte environ
  `1 − 0.8h` du prix sur l'entrée, et batch perd dès que `h` dépasse 0,625.
- **Bon cas d'usage :** de nombreuses requêtes single-turn indépendantes,
  chacune dominée par son propre contenu — traduire ou résumer un ensemble de
  documents, extraire des données par fichier. Les sorties longues favorisent
  encore davantage batch.
- **Mauvais cas d'usage :** un long recueil de règles partagé ou un préfixe
  few-shot avec des éléments courts, une poignée d'éléments, tout ce qui
  nécessite plus d'un tour. Router les propres tours d'un agent via Batch a
  été mesuré à 1,03× le temps réel et des heures plus lent.
- **Latence :** de quelques secondes à plusieurs heures, principalement de la
  mise en file, et cela varie selon le modèle. Comptez sur le fait que c'est
  bon marché, pas rapide.

Pour vérifier un job avant de s'y engager, envoyez une requête en temps réel
et comparez `usage.prompt_tokens_details.cached_tokens` avec
`usage.prompt_tokens`.

## `/batch-api`

```text
/batch-api translate the Markdown docs in docs/zh into English,
writing them to docs/en with the same file names
```

L'agent exécute `qwen batch check`, confirme que la tâche convient, lit un
petit échantillon, écrit un plan dans `.qwen/batch/plans/`, et le prévisualise
— rien n'est envoyé ni facturé :

```bash
qwen batch run .qwen/batch/plans/<slug>.json --dry-run
# preview: 42 item(s), window 24h — nothing uploaded, nothing billed
# model qwen-plus, thinking off, max output 8192 tokens (frozen from your current settings; retries reuse them)
# writes new files to: docs/en/ (42)
# ~180,000 in / ~190,000 out tokens (rough estimate); ...
# snapshot 3f9c2a7e5d10b884; submit exactly this batch with: qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
```

Il soumet ensuite ce snapshot. Le prompt d'approbation pour cette commande est
l'endroit où vous décidez de dépenser, avec la prévisualisation au-dessus ; si
le plan, un fichier source ou vos paramètres ont changé entre-temps, la
soumission est refusée.

```bash
qwen batch run .qwen/batch/plans/<slug>.json --expect 3f9c2a7e5d10b884
# task translate-docs-20260923103000: 42 item(s), window 24h
# ...
# batch job: batch_abc123
```

`run` retourne immédiatement et **vous n'avez pas besoin de collecter à la
main**. L'agent démarre `qwen batch collect <task-id> --wait` comme tâche en
arrière-plan (visible dans `/tasks`) et termine son tour, vous pouvez donc
continuer à travailler. Ce processus fait du polling du fournisseur via HTTP —
aucun appel modèle pendant l'attente — et lorsque le batch se termine, il
écrit les résultats et sort. L'agent est alors réveillé une fois : il vous
indique ce qui a été livré, retenu ou échoué, et effectue tout suivi que vous
avez demandé dans la requête initiale. Les éléments échoués ne sont jamais
retentés automatiquement, car une retente facture à nouveau.

Si la session se ferme d'abord, rien n'est perdu : une session interactive
collecte les tâches terminées du projet au démarrage et pendant qu'elle est
ouverte, et publie une notification. Définissez `general.batchAutoCollect` à
`false` pour désactiver cela. Les exécutions headless (`qwen -p`),
`qwen serve` et les clients IDE/ACP ne collectent pas automatiquement.

Les commandes fonctionnent depuis n'importe quel répertoire, et à l'intérieur
d'une session avec le préfixe `!` (par ex. `!qwen batch collect <task-id>`)
ainsi aucun tour modèle n'est dépensé :

```bash
qwen batch check                         # verify setup; nothing is billed
qwen batch collect <task-id> [--wait [--timeout <s>]]   # validate + write target files
qwen batch retry <task-id>               # resubmit only the failed items
qwen batch retry <task-id> --max-output-tokens 8192  # include truncated ones
qwen batch list                          # every recorded task, with its project
qwen batch cancel <task-id>              # partial results are still billed
qwen batch clean <task-id>               # delete the local record (cancels nothing)
```

`collect` rapporte chaque élément comme :

- **delivered** — écrit dans sa cible ;
- **held** — la source a changé après la soumission (`retry` le resoumet par
  rapport à la nouvelle source), ou la cible existe déjà avec un contenu
  différent (résolvez-le et relancez `collect` ; aucune nouvelle requête n'est
  faite) ;
- **failed** — tronqué, vide, un appel d'outil, ou une erreur fournisseur ;
  `retry` resoumet ceux-ci, les éléments tronqués uniquement avec un
  `--max-output-tokens` plus grand.

Relancer `collect` est toujours sans danger : les éléments livrés ne sont
jamais refaits et l'utilisation n'est jamais comptée deux fois. Une fois les
résultats sur le disque, les fichiers d'entrée et de sortie distants sont
supprimés.

## Enregistrements, sécurité et coût

- Les enregistrements de tâches vivent dans
  `~/.qwen/batch/tasks/<task-id>/` (`QWEN_BATCH_HOME` remplace) avec des
  permissions propriétaire uniquement, car ils contiennent des copies
  complètes de vos sources et sorties. Les fichiers de plan sous le
  `.qwen/batch/` du projet reçoivent un `.gitignore`.
- Une tâche est liée au point de terminaison et à la clé API avec laquelle
  elle a été soumise (seul un court hash de la clé est stocké) ; après avoir
  changé de compte ou de région, les commandes refusent jusqu'à ce que vous
  reveniez.
- Si la réponse de l'appel de création est perdue, `run` échoue, la tâche est
  marquée `submit-unknown`, et `collect` réconcilie avec la liste batch du
  fournisseur au lieu de resoumettre — un doublon facturerait deux fois.
- Une seule commande `qwen batch` travaille sur une tâche à la fois.
- Une exécution gèle vos paramètres d'échantillonnage actuels, votre limite
  de sortie et votre mode de réflexion ; les retentes les réutilisent.
- Les estimations sont basées sur les tokens sauf si vous définissez
  `QWEN_BATCH_INPUT_PRICE_PER_1M_USD` et
  `QWEN_BATCH_OUTPUT_PRICE_PER_1M_USD`. L'estimation approximative ne tient
  pas compte des tokens de réflexion, qui peuvent être plusieurs fois la
  sortie. Le `maxCostUsd` d'un plan est appliqué face au pire cas aux
  plafonds de requête : il nécessite ces prix, un `maxOutputTokens`, et la
  réflexion désactivée ou un `thinking_budget`, sinon l'exécution est
  refusée. Aucun des deux chiffres n'inclut ce que votre session a dépensé
  pour préparer le plan.
- Un nettoyage distant qui échoue ne bloque jamais `retry`, `cancel` ou
  `clean` ; un `collect` ultérieur le retente. Un fichier de résultat que le
  fournisseur ne peut pas servir en entier (après un nouveau téléchargement)
  ou qu'il n'a plus fait échouer les éléments affectés au lieu de laisser la
  tâche bloquée.
- `clean` refuse tant qu'un batch peut encore être en cours d'exécution ou
  détient des résultats non collectés, sauf si vous passez `--force`.
- Les cibles doivent rester à l'intérieur du projet et en dehors de tout
  chemin caché (`.git/`, `.github/`, `.qwen/`, … à n'importe quelle
  profondeur) : les résultats sont écrits des heures après que vous avez
  approuvé le plan. La prévisualisation liste les répertoires cibles.

Conception : [`docs/design/2026-09-23-batch-api-design.md`](../../design/2026-09-23-batch-api-design.md).
Une vérification bout-en-bout hors-ligne (fausse API Batch, vrai CLI compilé)
se trouve dans
[`docs/verification/batch-api/`](../../verification/batch-api/README.md).