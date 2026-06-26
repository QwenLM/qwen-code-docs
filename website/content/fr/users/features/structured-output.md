# Sortie structurée (`--json-schema`)

Contraindre la réponse finale du modèle à un JSON Schema que vous fournissez. Qwen
Code enregistre un outil terminal synthétique que le modèle est tenu d'appeler,
analyse les arguments de l'appel par rapport à votre schéma et expose
la charge utile validée sur stdout (ou dans l'enveloppe de résultat JSON / stream-json).
Le premier appel valide met fin à l'exécution.

Uniquement en mode sans tête — fonctionne avec `qwen -p`, une invite positionnelle,
ou une invite transmise via stdin.

## Démarrage rapide

```bash
qwen --prompt "Résumez les modifications dans HEAD avec un niveau de risque" \
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

La ligne est exactement la charge utile JSON-stringifiée + un saut de ligne —
pas d'enveloppe, pas de journal d'événements. À diriger directement dans `jq` ou un autre consommateur.

En mode **texte**, stdout est réservé à la charge utile JSON en cas de succès
et est vide en cas d'échec ; les messages d'erreur et les lignes de journal vont vers stderr.
Cela rend les motifs de capture `$(qwen --json-schema …) || exit 1` sûrs
en mode texte — les échecs atterrissent dans stderr, pas mélangés dans la variable capturée.
La prose incidente du modèle pendant la planification **n'est pas non plus**
renvoyée vers stderr — le mode texte la supprime ; utilisez
`--output-format json` ou `stream-json` si vous avez besoin de la voir.

En `--output-format json` et `stream-json`, le message de résultat d'échec
est émis sur **stdout** parallèlement au chemin de succès (en tant que
dernier élément du tableau JSON, ou la ligne `result` terminale sur le flux JSONL).
Tous les modes d'échec n'émettent pas un résultat sur stdout —
`max-session-turns` (code de sortie 53) et les interruptions par signal (code de sortie 130) se terminent avec
une sortie stderr uniquement. Vérifiez d'abord le code de sortie ; `is_error` sur
l'objet résultat lève l'ambiguïté dans le sous-ensemble des échecs qui produisent
un événement de résultat.

> **Schéma vide :** Passer `{}` produit `{}` (un objet JSON vide)
> sur stdout. Le modèle appelle `structured_output` sans arguments ;
> le chemin de normalisation des arguments en amont transforme l'appel de fonction vide
> en une charge utile d'objet vide, qui passe la validation par rapport au schéma vide
> et est émise textuellement.

## Fournir le schéma

Deux formes équivalentes :

```bash
# Littéral JSON en ligne
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# Lecture depuis un fichier
qwen -p "…" --json-schema @./schemas/summary.json
```

La forme `@path` développe `~`, normalise le chemin et lit le fichier
avec l'encodage `utf8`.

> **Remarque sur la latence :** Les exécutions réussies subissent un délai d'arrêt **plafonné
> à environ 500 ms** pendant que les agents d'arrière-plan en vol vident leurs
> notifications finales avant que le résultat ne soit émis. Le délai se termine tôt
> si aucune tâche d'arrière-plan n'est en attente, donc les exécutions simples ne le remarquent presque pas ;
> les pipelines par lots qui lancent des centaines d'invocations `--json-schema`
> contre des agents occupés doivent tenir compte de cette limite supérieure.

> **Remarque de sécurité :** Les schémas peuvent contenir des expressions régulières
> fournies par l'utilisateur dans les mots-clés `pattern`. Ajv compile celles-ci avec le
> moteur d'expressions régulières ECMAScript, qui est vulnérable aux
> retours en arrière catastrophiques. Parce que les arguments d'outil sont toujours des objets,
> le mot-clé `pattern` ne se déclenche qu'à l'intérieur des propriétés de type chaîne — un
> schéma malveillant comme
> `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}`
> peut bloquer l'interface lorsque le modèle fournit une valeur correspondante modérément longue.
> N'utilisez `--json-schema` qu'avec des schémas provenant de sources de confiance.

Validation au moment de l'analyse :

- Le fichier doit être un fichier régulier (pas de FIFO, périphériques de caractères ou
  répertoires).
- La taille du fichier est limitée à 4 MiB. Les schémas JSON réels sont bien en dessous de
  cela ; les fichiers de plusieurs MiB indiquent presque toujours une erreur de chemin.
- Le schéma doit être un JSON valide. Pour une entrée `@path`, l'erreur d'analyse est
  générique (« le contenu de `<path>` n'est pas un JSON valide ») plutôt que de renvoyer
  le détail de SyntaxError, afin qu'un processus englobant qui affiche stderr
  ne puisse pas lire un préfixe du contenu du fichier à partir de l'erreur.
- Le schéma doit se compiler sous la configuration Ajv stricte —
  les fautes de frappe comme `propertees` sont signalées, mais les motifs
  valides selon la spécification (par ex., `required` sans lister chaque clé dans `properties`) sont
  acceptés.
- La racine du schéma doit accepter des valeurs de type objet. Les API
  d'appel de fonction (Gemini, OpenAI, Anthropic) exigent toutes que les arguments d'outil soient
  des objets JSON, donc une racine non-objet enregistrerait un outil inutilisable.

La vérification d'acceptation de racine parcourt `type`, `const`, `enum`, `anyOf`,
`oneOf`, `allOf`, `not` et `if`/`then`/`else` (au mieux pour les cas
décidables). En cas de doute, elle délègue à Ajv à l'exécution.

> **`$ref` à la racine est rejeté** par la vérification au moment de l'analyse. Si votre schéma
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
> `$ref` à l'intérieur de `anyOf` / `oneOf` / `allOf` est différé à Ajv à
> l'exécution, donc la forme encapsulée passe la vérification d'acceptation de racine.

## Forme de sortie par format

| `--output-format` | Ce qui va sur stdout                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (défaut)   | `JSON.stringify(payload) + "\n"` — une ligne, l'objet validé.                                                                                                                                                    |
| `json`            | Un seul **tableau** JSON d'objets message (le journal complet des événements). Le dernier élément est le message `type: "result"`, qui porte à la fois `result` (`JSON.stringify(payload)`) et `structured_result` (l'objet brut). |
| `stream-json`     | Chaque événement sur sa propre ligne en JSONL. La ligne `result` terminale porte `result` (stringifié) et `structured_result` (objet brut).                                                                               |

Dans les deux formats JSON, préférez lire `structured_result` plutôt que `result`
quand vous voulez l'objet ; `result` est la forme stringifiée fournie pour
les consommateurs qui attendent toujours une chaîne dans ce champ. Pour `--output-format
json`, lisez le dernier élément du tableau et récupérez `structured_result`
à partir de là (par ex., `jq '.[-1].structured_result'`) ; pour `stream-json`,
lisez la dernière ligne `type: "result"` sur le flux.

## Restrictions

| Combinaison                                       | Comportement                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-i` / `--prompt-interactive`   | Rejeté au moment de l'analyse. Le message « la session se termine maintenant » de l'outil synthétique n'a pas de terminaison dans la boucle TUI.                                                                                   |
| `--json-schema` + `--input-format stream-json`    | Rejeté au moment de l'analyse. Le contrat terminal à un seul tir est incompatible avec le protocole d'entrée stream-json de longue durée.                                                                                                    |
| `--json-schema` + `--acp` / `--experimental-acp`  | Rejeté au moment de l'analyse. L'ACP exécute sa propre boucle de tour qui n'honore pas le contrat terminal de l'outil synthétique.                                                                                                                  |
| `--json-schema` sans invite ni stdin redirigé | Rejeté au moment de l'analyse. Le mode sans tête a besoin d'une invite — passez `-p`, un argument positionnel, ou redirigez-en une.                                                                                                                     |
| `--bare` + `--json-schema`                        | Pris en charge. L'outil synthétique est enregistré aux côtés des trois outils nus (`read_file`, `edit`, `run_shell_command`).                                                                                                             |
| `--json-schema` à l'intérieur d'un sous-agent                 | L'outil n'est PAS enregistré. Seuls les tours principaux / de vidange de l'exécution de niveau supérieur honorent le contrat terminal ; un sous-agent appelant l'outil recevrait « la session se termine maintenant » puis continuerait car sa boucle n'a pas de terminaison. |

## Modes de reprise et d'échec

> **Remarque sur le coût.** Deux choses multiplient la dépense de jetons dans une exécution
> `--json-schema`, toutes deux à prendre en compte dans la conception :
>
> - **Schéma intégré à chaque tour.** Le schéma est envoyé comme
>   bloc `parameters` de la déclaration de fonction `structured_output` sur
>   chaque requête modèle, pas seulement la première. Les grands schémas (jusqu'à
>   4 MiB de limite d'analyse) augmentent proportionnellement les jetons d'entrée par tour
>   pour toute l'exécution.
> - **Chaque nouvelle tentative de validation est un tour de modèle complet.** Un
>   schéma que le modèle rate à plusieurs reprises est multiplié par échec (requête +
>   inférence + réponse). Gardez les schémas suffisamment contraints pour guider
>   le modèle et assez simples pour réussir du premier coup ; augmentez
>   `--max-session-turns` lorsque des nouvelles tentatives sont attendues.

La session se termine sur le premier appel valide. Jusque-là :

- **Les arguments échouent à la validation.** `structured_output` renvoie une erreur de résultat d'outil
  avec le message d'Ajv, le modèle le voit au tour suivant,
  et peut corriger les arguments et rappeler.
- **Le modèle appelle un outil avec effets de bord dans le même tour que
  `structured_output`.** Le pré-analyse supprime l'outil frère —
  il ne s'exécute jamais, que l'appel structuré valide finalement ou non.
  Les deux chemins divergent sur ce que le modèle voit ensuite :
  - **Validation réussie :** l'exécution se termine immédiatement, et le modèle
    n'obtient jamais un autre tour — l'outil frère supprimé est silencieusement ignoré.
  - **Validation échouée :** le modèle obtient un autre tour et voit un
    `tool_result` synthétisé « Ignoré : » pour l'appel supprimé,
    afin qu'il puisse réémettre cet appel dans un **tour séparé** (un
    qui n'inclut pas `structured_output`).
- **Le modèle émet du texte brut au lieu d'appeler
  `structured_output`.** Code de sortie `1`. Le message d'erreur inclut
  le nombre de tours et un aperçu tronqué de la sortie du modèle pour
  voir ce qu'il a réellement dit.
- **L'exécution atteint `maxSessionTurns`.** Code de sortie `53`. Sortie
  standard « Nombre maximal de tours de session atteint », plus un
  indice spécifique à `--json-schema` qui pointe vers les trois causes courantes de blocage : le modèle n'a jamais
  appelé l'outil, `structured_output` est refusé par les règles d'autorisation,
  ou le schéma est insatisfaisable.
- **L'exécution est interrompue (SIGINT / Ctrl-C).** Code de sortie `130`. Le
  résultat structuré n'est normalement pas émis, mais la boucle
  de délai d'arrêt ne vérifie pas le signal d'abandon, donc un SIGINT qui
  arrive après qu'un appel réussi a été capturé mais avant que le résultat
  n'atteigne stdout peut encore atterrir sur stdout. Traitez le code de sortie
  comme source de vérité.

## Confidentialité

Les arguments que vous soumettez via `structured_output` SONT la charge utile
structurée — déjà émise sur stdout. Pour éviter de persister la même charge utile
une seconde fois sur des surfaces locales qui pourraient être exportées hors de la
machine, les arguments sont masqués avec le placeholder
`{ __redacted: 'structured_output payload (see stdout result)' }` sur :

- Le chemin de télémétrie `ToolCallEvent` (exportations OTLP, QwenLogger,
  flux ui-telemetry, miroir d'événements UI d'enregistrement de chat).
- Le fichier JSONL d'enregistrement de chat sur disque dans
  `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl` (réinjecté
  dans le contexte du modèle lors de `--continue` / `--resume`), y compris chaque
  nouvelle tentative d'échec de validation.

Les métriques d'appel d'outil (durée, succès, décision) et les métadonnées d'événements
environnantes sont conservées.

> **Le schéma est envoyé au fournisseur du modèle.** Le masquage couvre
> les _arguments d'appel_ uniquement sur les surfaces locales. Le schéma lui-même
> est transporté sur chaque requête modèle en tant que bloc `parameters` de la
> déclaration de fonction `structured_output` — donc toutes les valeurs littérales que vous mettez
> à l'intérieur (`enum`, `const`, `default`, `examples`, `description`,
> `$comment`, etc.) atteignent le fournisseur en texte clair, tout comme le texte de l'invite.
> Les schémas doivent décrire la forme et les contraintes ; traitez-les
> comme publics vis-à-vis du fournisseur et gardez les secrets, les enregistrements clients
> et autres charges utiles sensibles hors du corps du schéma.

> **Les hooks voient les arguments bruts.** Le masquage décrit ci-dessus s'applique
> uniquement à la télémétrie et à l'enregistrement de chat. `PreToolUse`, `PostToolUse`, et
> `PostToolUseFailure` (y compris les hooks HTTP qui peuvent transmettre des charges utiles
> hors de l'appareil) reçoivent le `tool_input` non masqué pour
> `structured_output`, car le contrat du hook est « voir ce que l'outil voit. »
> Si vous exploitez des hooks de type audit globaux, désactivez-les
> pour `structured_output` (filtrez sur `tool_name`) ou ajoutez
> un masquage côté hook avant d'exécuter `--json-schema` contre
> des données sensibles.

## Reprise de session (`--continue` / `--resume`)

`--json-schema` est un indicateur par exécution, pas une propriété par session.
L'outil synthétique est enregistré lorsque l'interface analyse ses arguments, donc :

- Repassez `--json-schema` à chaque `--continue` / `--resume` auquel vous voulez
  que le contrat terminal s'applique. Le même schéma que l'exécution
  d'origine est la valeur par défaut sûre — un changement de schéma en milieu de session est autorisé mais
  modifie le contrat auquel le modèle est tenu.
- Si vous faites `--continue` sans `--json-schema`, la session reprise est une
  session sans tête ordinaire : `structured_output` n'existe tout simplement
  pas en tant qu'outil, et le modèle répondra en texte libre.
- Le placeholder `__redacted` dans l'enregistrement de chat repris n'affecte
  pas la reprenabilité en pratique. Un appel réussi `structured_output`
  termine la session immédiatement, donc les seuls arguments masqués
  qu'une session reprise pourrait voir proviennent de tentatives échouées. Le modèle a encore
  l'erreur de validation Ajv de chaque tentative dans le `tool_result` enregistré
  et le schéma de paramètre en direct (réenregistré à partir de `--json-schema`),
  ce qui est suffisant pour réessayer.

## Contrôle des autorisations

`structured_output` contourne délibérément la liste blanche `--core-tools` :
l'outil n'existe que lorsque `--json-schema` est défini, donc l'exclure
laisserait l'exécution sans contrat terminal.

Les règles explicites `permissions.deny` et les paramètres `--exclude-tools`
PRENNENT effet — les deux utilisent le même mécanisme de refus et empêchent
`structured_output` d'être enregistré, donc le modèle ne voit jamais
la déclaration d'outil. Le résultat typique est que le modèle répond en
texte brut (code de sortie 1). Si le modèle boucle à travers d'autres outils sans
jamais produire de texte, il finira par atteindre `maxSessionTurns`
(code de sortie 53) et l'indice `--json-schema` dans le message d'erreur vous indique
où chercher.

> **Mise en garde `--bare`.** Le mode nu ignore la plupart des entrées dérivées des paramètres,
> y compris `permissions.deny` au niveau des paramètres et `tools.exclude`. L'outil
> synthétique reste enregistré, donc un refus uniquement dans les paramètres de
> `structured_output` sera silencieusement sans effet sous `--bare`. Les
> `--exclude-tools structured_output` au niveau de la ligne de commande s'appliquent toujours en mode nu — utilisez
> l'indicateur plutôt que les paramètres si vous devez verrouiller une exécution nue.

## Conflit avec les outils MCP

Si un serveur MCP enregistre un outil littéralement nommé `structured_output`,
la vérification de collision du registre d'outils renomme l'outil MCP en
`mcp__<nom-du-serveur>__structured_output` afin que l'outil synthétique conserve
le nom nu. Le schéma fourni par l'utilisateur est toujours celui que le modèle voit.

## Exemple : conditionner une exécution en plusieurs étapes à la sortie structurée

```bash
RESULT=$(qwen --prompt "Auditez ce diff et évaluez son risque." \
  --json-schema @./schemas/audit.json) || exit 1

risk=$(jq -r '.risk_level' <<<"$RESULT")
if [ "$risk" = "high" ]; then
  echo "Diff à haut risque ; pause du pipeline." >&2
  exit 2
fi
```

## Voir aussi

- [Mode sans tête](headless.md) — le flux basé sur `-p` sur lequel `--json-schema`
  s'appuie.
- [Sortie double](dual-output.md) — enregistre un fichier latéral d'événements JSON
  parallèlement au TUI (une approche différente de la sortie lisible par machine ;
  ne nécessite pas `--json-schema`).