# Sortie structurée (`--json-schema`)

Contraignez la réponse finale du modèle à un schéma JSON que vous fournissez. Qwen
Code enregistre un outil terminal synthétique que le modèle doit appeler,
analyse les arguments de l'appel par rapport à votre schéma, et expose
la charge utile validée sur stdout (ou dans l'enveloppe de résultat JSON / stream-json).
Le premier appel valide termine l'exécution.

Mode sans tête uniquement — fonctionne avec `qwen -p`, une invite positionnelle,
ou une invite redirigée via l'entrée standard.

## Démarrage rapide

```bash
qwen --prompt "Résumez les modifications dans HEAD avec risk_level" \
  --json-schema '{
    "type": "object",
    "properties": {
      "summary":    { "type": "string" },
      "risk_level": { "type": "string", "enum": ["low", "medium", "high"] }
    },
    "required": ["summary", "risk_level"],
    "additionalProperties": false
  }'
```

Sortie sur stdout (par défaut `--output-format text`) :

```json
{ "summary": "…", "risk_level": "low" }
```

La ligne est exactement la charge utile sérialisée en JSON + saut de ligne — pas
d'enveloppe, pas de journal d'événements. Dirigez-la directement dans `jq` ou un autre consommateur.

En mode **texte**, stdout est réservé à la charge utile JSON en cas de succès
et vide en cas d'échec ; les messages d'erreur et les lignes de journal vont sur stderr.
Cela rend les motifs de capture `$(qwen --json-schema …) || exit 1` sûrs
en mode texte — les échecs atterrissent sur stderr, non mélangés à la variable capturée.
La prose incidente du modèle pendant la planification n'est **pas** non plus renvoyée
sur stderr — le mode texte l'ignore ; utilisez
`--output-format json` ou `stream-json` si vous devez la voir.

Avec `--output-format json` et `stream-json`, le message de résultat d'échec est émis
sur **stdout** en parallèle du chemin de succès (comme dernier élément du tableau JSON,
ou la ligne `result` de terminaison sur le flux JSONL). Tous les modes d'échec
n'émettent pas un résultat sur stdout — max-session-turns (code de sortie 53) et interruptions
de signal (code de sortie 130) se terminent avec une sortie stderr uniquement. Vérifiez d'abord
le code de sortie ; `is_error` sur l'objet résultat lève l'ambiguïté dans le sous-ensemble
d'échecs qui produisent effectivement un événement résultat.

> **Schéma vide :** Passer `{}` produit `{}` (un objet JSON vide)
> sur stdout. Le modèle appelle `structured_output` avec aucun argument ;
> le chemin de normalisation des arguments en amont transforme l'appel de fonction vide
> en une charge utile d'objet vide, qui passe la validation contre le schéma vide
> et est émise textuellement.

## Fournir le schéma

Deux formes équivalentes :

```bash
# Littéral JSON en ligne
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# Lecture depuis un fichier
qwen -p "…" --json-schema @./schemas/summary.json
```

La forme `@path` développe `~`, normalise le chemin, et lit le fichier
avec l'encodage `utf8`.

> **Note sur la latence :** Les exécutions réussies entraînent un délai d'arrêt **plafonné
> à ~500 ms** pendant que les agents en arrière-plan en cours vident leurs
> notifications finales avant que le résultat soit émis. Le délai se termine tôt
> si aucune tâche en arrière-plan n'est en attente, donc les exécutions simples le remarquent à peine ;
> les pipelines par lots qui déploient des centaines d'invocations `--json-schema`
> avec des agents occupés doivent tenir compte de cette limite supérieure.

> **Note de sécurité :** Les schémas peuvent contenir des expressions régulières fournies
> par l'utilisateur dans les mots-clés `pattern`. Ajv compile celles-ci avec le moteur
> regex ECMAScript, qui est vulnérable au retour en arrière catastrophique.
> Comme les arguments d'outil sont toujours des objets, le mot-clé `pattern` ne
> se déclenche qu'à l'intérieur des propriétés de chaîne — un schéma malveillant comme
> `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}`
> peut bloquer l'interface CLI lorsque le modèle fournit une valeur correspondante
> modérément longue. N'exécutez `--json-schema` qu'avec des schémas provenant de sources
> auxquelles vous faites confiance.

Validation lors de l'analyse :

- Le fichier doit être un fichier régulier (pas de FIFO, périphériques de caractères ou répertoires).
- La taille du fichier est plafonnée à 4 Mio. Les schémas JSON concrets sont bien en dessous de cette limite ; les fichiers de plusieurs Mio indiquent presque toujours une erreur de chemin.
- Le schéma doit être un JSON valide. Pour une entrée `@path`, l'erreur d'analyse est générique (« le contenu de `<path>` n'est pas un JSON valide ») plutôt que de renvoyer le détail SyntaxError, afin qu'un processus englobant qui affiche stderr ne puisse pas lire un préfixe du contenu du fichier à partir de l'erreur.
- Le schéma doit compiler sous la configuration stricte d'Ajv — les fautes de frappe comme `propertees` sont signalées, mais les motifs valides selon la spécification (par ex. `required` sans lister chaque clé dans `properties`) sont acceptés.
- La racine du schéma doit accepter des valeurs de type objet. Les API d'appel de fonction (Gemini, OpenAI, Anthropic) exigent toutes que les arguments d'outil soient des objets JSON, donc une racine non-objet enregistrerait un outil inutilisable.

La vérification d'acceptation de la racine parcourt `type`, `const`, `enum`, `anyOf`,
`oneOf`, `allOf`, `not`, et `if`/`then`/`else` (au mieux pour les cas décidables).
En cas de doute, elle délègue à Ajv lors de l'exécution.

> **`$ref` à la racine est rejeté** par la vérification lors de l'analyse. Si votre schéma
> réutilise une définition via `$ref`, enveloppez-la dans `allOf` :
>
> ```jsonc
> // Rejeté :
> { "$ref": "#/$defs/MyObj", "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
>
> // Accepté (la racine accepte les objets via la branche allOf) :
> { "allOf": [{ "$ref": "#/$defs/MyObj" }], "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
> ```
>
> `$ref` à l'intérieur de `anyOf` / `oneOf` / `allOf` est différé à Ajv lors de
> l'exécution, donc la forme encapsulée passe la vérification d'acceptation de la racine.
## Forme de sortie selon le format

| `--output-format` | Ce qui va vers stdout                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (défaut)   | `JSON.stringify(payload) + "\n"` — une ligne, l'objet validé.                                                                                                                                                           |
| `json`            | Un seul **tableau** JSON d'objets message (le journal complet des événements). Le dernier élément est le message `type: "result"`, qui contient à la fois `result` (`JSON.stringify(payload)`) et `structured_result` (l'objet brut). |
| `stream-json`     | Chaque événement sur sa propre ligne en JSONL. La ligne `result` terminale contient `result` (sérialisé) et `structured_result` (objet brut).                                                                            |

Dans les deux formats JSON, préférez lire `structured_result` plutôt que `result`
lorsque vous voulez l'objet ; `result` est la forme sérialisée fournie pour
les consommateurs qui attendent toujours une chaîne dans ce champ. Pour `--output-format
json`, lisez le dernier élément du tableau et extrayez `structured_result`
depuis celui-ci (par exemple `jq '.[-1].structured_result'`) ; pour `stream-json`,
lisez la dernière ligne `type: "result"` sur le flux.

## Restrictions

| Combinaison                                       | Comportement                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-schema` + `-i` / `--prompt-interactive`   | Rejeté lors du parsing. Le message "la session se termine maintenant" de l'outil synthétique n'a pas de terminaison dans la boucle TUI.                                                                                              |
| `--json-schema` + `--input-format stream-json`    | Rejeté lors du parsing. Le contrat terminal en un seul appel est incompatible avec le protocole d'entrée stream-json de longue durée.                                                                                                |
| `--json-schema` + `--acp` / `--experimental-acp`  | Rejeté lors du parsing. L'ACP gère sa propre boucle de tours qui ne respecte pas le contrat terminal de l'outil synthétique.                                                                                                        |
| `--json-schema` sans prompt et sans stdin redirigé | Rejeté lors du parsing. Le mode sans tête nécessite un prompt — passez `-p`, un argument positionnel, ou redirigez-en un.                                                                                                            |
| `--bare` + `--json-schema`                        | Pris en charge. L'outil synthétique est enregistré aux côtés des trois outils nus (`read_file`, `edit`, `run_shell_command`).                                                                                                        |
| `--json-schema` à l'intérieur d'un sous-agent      | L'outil n'est PAS enregistré. Seuls les tours principal / de drainage de l'exécution de niveau supérieur respectent le contrat terminal ; un sous-agent appelant l'outil recevrait "la session se termine maintenant" puis continuerait car sa boucle n'a pas de terminaison. |

## Nouveaux essais et modes d'échec

> **Note sur le coût.** Deux choses multiplient la dépense de tokens dans une exécution
> `--json-schema`, toutes deux à anticiper dans la conception :
>
> - **Schéma intégré à chaque tour.** Le schéma est envoyé comme
>   bloc `parameters` de la déclaration de fonction `structured_output` dans
>   chaque requête au modèle, pas seulement la première. Les grands schémas (jusqu'à la
>   limite de parsing de 4 Mio) augmentent proportionnellement les tokens d'entrée par tour
>   pour toute l'exécution.
> - **Chaque nouvelle tentative de validation est un tour complet du modèle.** Un schéma que le
>   modèle manque à plusieurs reprises est multiplié par échec (requête +
>   inférence + réponse). Gardez les schémas suffisamment contraints pour guider le
>   modèle et assez simples à réussir du premier coup ; augmentez
>   `--max-session-turns` lorsque des tentatives sont attendues.

La session se termine dès le premier appel valide. Jusque-là :

- **Les arguments échouent à la validation.** `structured_output` renvoie une erreur de résultat d'outil
  avec le message d'Ajv, le modèle le voit au tour suivant,
  et peut corriger les arguments et rappeler.
- **Le modèle appelle un outil avec effet de bord dans le même tour que
  `structured_output`.** La pré-analyse supprime l'outil frère —
  il ne s'exécute jamais, que l'appel structuré se valide ou non
  finalement. Les deux chemins divergent sur ce que le modèle voit ensuite :
  - **Validation réussie :** l'exécution se termine immédiatement, et le modèle
    n'obtient jamais un autre tour — l'outil frère supprimé est silencieusement
    ignoré.
  - **Validation échouée :** le modèle obtient un autre tour et voit un
    `tool_result` synthétisé "Ignoré :" pour l'appel supprimé,
    afin qu'il puisse relancer cet appel dans un **tour séparé** (un
    qui n'inclut pas `structured_output`).
- **Le modèle émet du texte brut au lieu d'appeler
  `structured_output`.** Code de sortie `1`. Le message d'erreur inclut
  le nombre de tours et un aperçu tronqué de la sortie du modèle pour
  que vous puissiez voir ce qu'il a réellement dit.
- **L'exécution atteint `maxSessionTurns`.** Code de sortie `53`. Standard
  "Nombre maximal de tours de session atteint", plus un indice spécifique à
  `--json-schema` qui pointe vers les trois causes courantes de blocage : le modèle n'a jamais
  appelé l'outil, `structured_output` est refusé par les règles d'autorisation,
  ou le schéma est insatisfaisable.
- **L'exécution est interrompue (SIGINT / Ctrl-C).** Code de sortie `130`. Le
  résultat structuré n'est normalement pas émis, mais la boucle
  d'attente d'arrêt ne vérifie pas le signal d'abandon, donc un SIGINT qui
  arrive après qu'un appel réussi a été capturé mais avant que le résultat
  n'atteigne stdout peut tout de même arriver sur stdout. Considérez le code de sortie
  comme la source de vérité.
## Confidentialité

Les arguments que vous soumettez via `structured_output` SONT la charge utile structurée — déjà émise sur stdout. Pour éviter de persister la même charge utile une seconde fois dans les surfaces locales qui pourraient être exportées hors de la machine, les arguments sont masqués avec le placeholder `{ __redacted: 'structured_output payload (see stdout result)' }` sur :

- Le chemin de télémétrie `ToolCallEvent` (exports OTLP, QwenLogger, flux ui-telemetry, miroir d'événements UI de l'enregistrement de chat).
- Le fichier JSONL d'enregistrement de chat sur disque dans `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl` (réinjecté dans le contexte du modèle lors de `--continue` / `--resume`), y compris chaque tentative de validation échouée.

Les métriques d'appel d'outil (durée, succès, décision) et les métadonnées d'événement environnantes sont préservées.

> **Le schéma est envoyé au fournisseur du modèle.** Le masquage ne concerne que les _arguments d'appel_ sur les surfaces locales. Le schéma lui-même est transmis sur chaque requête au modèle dans le bloc `parameters` de la déclaration de la fonction `structured_output` — donc toutes les valeurs littérales que vous y mettez (`enum`, `const`, `default`, `examples`, `description`, `$comment`, etc.) atteignent le fournisseur en clair, tout comme le texte du prompt. Les schémas doivent décrire la forme et les contraintes ; traitez-les comme publics vis-à-vis du fournisseur et gardez les secrets, les enregistrements clients et autres charges utiles sensibles en dehors du corps du schéma.

> **Les hooks voient les arguments bruts.** Le masquage décrit ci-dessus s'applique uniquement à la télémétrie et à l'enregistrement de chat. Les hooks `PreToolUse`, `PostToolUse` et `PostToolUseFailure` (y compris les hooks HTTP qui peuvent transmettre des charges utiles hors de l'appareil) reçoivent le `tool_input` non masqué pour `structured_output`, car le contrat du hook est « voir ce que l'outil voit ». Si vous utilisez des hooks de type audit, désactivez-les pour `structured_output` (filtrez sur `tool_name`) ou ajoutez un masquage côté hook avant d'exécuter `--json-schema` sur des données sensibles.

## Reprise de session (`--continue` / `--resume`)

`--json-schema` est un indicateur par exécution, pas une propriété par session. L'outil synthétique est enregistré lorsque le CLI analyse ses arguments, donc :

- Repassez `--json-schema` sur chaque `--continue` / `--resume` pour lequel vous voulez que le contrat terminal s'applique. Le même schéma que l'exécution d'origine est la valeur par défaut sûre — un changement de schéma en cours de session est autorisé mais modifie le contrat auquel le modèle est soumis.
- Si vous faites `--continue` sans `--json-schema`, l'exécution reprise est une session headless ordinaire : `structured_output` n'existe tout simplement pas en tant qu'outil, et le modèle répondra en texte libre.
- Le placeholder `__redacted` dans l'enregistrement de chat repris n'affecte pas la reprise en pratique. Un appel réussi à `structured_output` termine la session immédiatement, donc les seuls arguments masqués qu'une exécution reprise pourrait voir proviennent de tentatives échouées. Le modèle a toujours l'erreur de validation Ajv de chaque tentative dans le `tool_result` enregistré et le schéma de paramètres en direct (réenregistré depuis `--json-schema`), ce qui est suffisant pour réessayer.

## Contrôle des permissions

`structured_output` contourne délibérément la liste blanche `--core-tools` : l'outil n'existe que lorsque `--json-schema` est défini, donc l'exclure laisserait l'exécution sans contrat terminal.

Les règles explicites `permissions.deny` et les paramètres `--exclude-tools` PRENNENT effet — les deux utilisent le même mécanisme de refus et empêchent `structured_output` d'être enregistré, donc le modèle ne voit jamais la déclaration de l'outil. Le résultat typique est que le modèle répond en texte brut (exit 1). Si le modèle boucle sur d'autres outils sans jamais produire de texte, il finira par atteindre `maxSessionTurns` (exit 53) et l'indice `--json-schema` dans le message d'erreur vous indique où chercher.

> **Mise en garde `--bare`.** Le mode bare ignore la plupart des entrées dérivées des paramètres, y compris `permissions.deny` et `tools.exclude` au niveau des paramètres. L'outil synthétique reste enregistré, donc un refus uniquement basé sur les paramètres de `structured_output` sera silencieusement sans effet sous `--bare`. L'option au niveau des arguments `--exclude-tools structured_output` s'applique toujours en mode bare — utilisez l'option plutôt que les paramètres si vous devez verrouiller une exécution bare.

## Conflit avec les outils MCP

Si un serveur MCP enregistre un outil littéralement nommé `structured_output`, la vérification des collisions du registre d'outils renomme l'outil MCP en `mcp__<server-name>__structured_output` afin que l'outil synthétique conserve le nom nu. Le schéma fourni par l'utilisateur est toujours celui que le modèle voit.

## Exemple : conditionner une exécution multi-étapes sur la sortie structurée

```bash
RESULT=$(qwen --prompt "Audit this diff and rate its risk." \
  --json-schema @./schemas/audit.json) || exit 1

risk=$(jq -r '.risk_level' <<<"$RESULT")
if [ "$risk" = "high" ]; then
  echo "High-risk diff; pausing pipeline." >&2
  exit 2
fi
```

## Voir aussi

- [Mode Headless](headless.md) — le flux basé sur `-p` sur lequel `--json-schema` s'appuie.
- [Sortie double](dual-output.md) — enregistre un sidecar d'événements JSON aux côtés du TUI (une approche différente pour la sortie lisible par machine ; ne nécessite pas `--json-schema`).
