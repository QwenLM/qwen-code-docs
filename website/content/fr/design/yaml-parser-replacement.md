# Remplacement du parser YAML — résultats de la recherche

Document de conception interne visant à remplacer le parser YAML développé à la main de 192 lignes dans
`packages/core/src/utils/yaml-parser.ts` par une véritable librairie, afin que les champs différés
`mcpServers` et `hooks` du schéma declarative-agent de Claude Code puissent assurer le round-trip en toute sécurité à travers les chemins de code subagent / skill / converter.

Complément de [`docs/design/declarative-agents-port.md`](./declarative-agents-port.md).
Issue : [#4821](https://github.com/QwenLM/qwen-code/issues/4821). Prérequis pour le suivi de [PR #4842](https://github.com/QwenLM/qwen-code/pull/4842).

## Phase 0 — Sources vérifiées

| Source                                                  | Version / Date                         | Pourquoi fait autorité                                                                                                          |
| ------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                  | ancien snapshot CC (pré-2.1.168)       | source directe — wrapper de 15 lignes qui nomme la librairie                                                                    |
| `~/code/claude-code/src/utils/frontmatterParser.ts`     | même snapshot                          | source directe — séparateur de frontmatter de 370 lignes + récupération en 2 passes                                             |
| `/private/tmp/cc-2.1.168/claude.strings`                | extrait de CC 2.1.168                  | fait autorité pour le comportement actuel — les strings portent des noms de symboles obfusqués mais contiennent le schéma JSON et le texte des messages d'erreur |
| `packages/core/src/utils/yaml-parser.ts` (ce dépôt)     | HEAD de `lazzy/gifted-hamilton-684741` | le parser en cours de remplacement                                                                                              |
| sondes live `node -e` sur `yaml@2.8.1` dans cet arbre   | 2026-06-08                             | comportement de sécurité empirique — ancres, merge keys, `!!js/function`, billion-laughs, `maxAliasCount` (résultats en ligne dans la Phase 4) |

Labels de confiance : **C** confirmé par des preuves directes ; **I** déduit de plusieurs faits confirmés ; **O** question ouverte.

## Phase 1 — Quelle librairie YAML CC utilise-t-il ?

**Réponse : [`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml), et NON
`js-yaml`.** Confirmé par la lecture de `~/code/claude-code/src/utils/yaml.ts`
mot pour mot :

```ts
export function parseYaml(input: string): unknown {
  if (typeof Bun !== 'undefined') {
    return Bun.YAML.parse(input);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('yaml') as typeof import('yaml')).parse(input);
}
```

- **Librairie** : package npm `yaml`. **C**
- **API** : `.parse(input)` de haut niveau. Utilise le schéma par défaut du package (qui
  est YAML 1.2 `core` — sur-ensemble JSON, sans extensions JS). **C**
- **Raccourci Bun** : lors de l'exécution sous Bun, CC utilise `Bun.YAML.parse()` pour
  éviter d'inclure ~270 Ko de parser YAML. **C** Non pertinent pour qwen-code
  (nous ne ciblons pas le runtime Bun).
- **Mode de schéma** : PAS défini explicitement dans CC. S'appuie sur le comportement par défaut du package
  `yaml`, ainsi que sur la validation zod au niveau du consommateur
  (`DL7`, `gS8`, `TKO`/`_u` selon `docs/design/declarative-agents-port.md`). **C**

### Pourquoi `yaml` plutôt que `js-yaml`

| Dimension                | `js-yaml` 4.x                                                                              | `yaml` (eemeli) 2.x                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Schéma par défaut        | `DEFAULT_SAFE_SCHEMA` (depuis 4.x) — sûr ; les anciennes versions avaient `DEFAULT_FULL_SCHEMA` avec JS | `core` (spécification YAML 1.2) — types JSON uniquement |
| Tag `!!js/function`      | NON supporté en 4.x (présent en 3.x)                                                       | Jamais supporté                                      |
| Protection billion-laughs| Aucune (responsabilité manuelle)                                                           | `maxAliasCount: 100` intégré par défaut              |
| Merge keys (`<<`)        | Supportés (doit être désactivé via `MERGE_SCHEMA` ou filtrage)                             | Désactivés par défaut, activés via `{ merge: true }` |
| Déjà une dépendance de qwen-code ? | `js-yaml@4.1.1` ✓                                                                  | `yaml@2.8.1` ✓ (déjà importé par `skill-manager`)    |

Les deux sont des choix raisonnables en 2026, mais **le brief de la tâche originale
recommandait `FAILSAFE_SCHEMA` / `CORE_SCHEMA` de `js-yaml`**. Nous nous écartons de cette recommandation pour trois raisons concrètes :

1. **Parité avec CC**. Tout l'intérêt de porter le schéma frontmatter de CC est de
   permettre aux utilisateurs de déposer un fichier agent CC dans `.qwen/agents/` et de le voir parsé
   de manière identique. Utiliser le même parser que CC minimise la dérive sur les constructions YAML
   de cas limites (flux multi-documents, scalaires flow vs block, gestion des tags).
2. **`yaml` est déjà utilisé directement dans `skill-manager.ts`** — voir
   `packages/core/src/skills/skill-manager.ts:13` (`import * as yaml from 'yaml'`).
   Standardiser sur `yaml` élimine l'une des deux piles YAML dupliquées dans
   le même package. **C** (résultat de grep documenté dans la Phase 6).
3. **Des valeurs par défaut plus sûres que `js-yaml`**. Le `maxAliasCount` intégré de `yaml` bloque
   les billion-laughs sans configuration manuelle ; les merge keys sont désactivés par défaut ;
   les tags arbitraires deviennent des strings littérales avec un `YAMLWarning` plutôt que
   de déclencher des resolvers appelables. Preuves empiriques dans la Phase 4.

Si un futur mainteneur souhaite supprimer la dépendance `yaml` et unifier sur
`js-yaml`, la migration est mécanique : remplacer `yaml.parse` / `yaml.stringify`
par `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump`. Les
deux librairies s'accordent sur la sortie pour le sous-ensemble à 100 % que CC et qwen-code
utilisent réellement (paires clé-valeur, listes, maps imbriquées, booléens/nombres scalaires).
Suivez cette décision séparément si elle se présente.

## Phase 2 — Pipeline de parsing du frontmatter (CC)

`~/code/claude-code/src/utils/frontmatterParser.ts` fait 370 lignes. Principales découvertes :

| Étape                | Logique                                                                                                                     | Source                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Correspondance du délimiteur | Regex `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — s'ouvre à la colonne 0, le corps est non-greedy, le fermant `---` doit être sur sa propre ligne | `frontmatterParser.ts:~123` (numéros de ligne de l'ancien snapshot ; à considérer comme approximatifs) **C** |
| Parse de la passe 1  | Appelle `parseYaml(body)`. Si succès → retourne l'objet parsé + le reste du contenu.                                      | même fichier, haut du bloc try **C**                                                                          |
| Récupération de la passe 2 | Sur `YAMLException`, parcourt les lignes, met automatiquement entre guillemets les valeurs qui ressemblent à des dates/colons/spéciaux, réessaie `parseYaml` une fois. | lignes ~85–121 dans l'ancien snapshot **C** (normalisation `tab → 2 spaces`, heuristique de date ISO, piège à colons) |
| Propagation en cas d'échec | Les deux passes ont échoué → log via `logForDebugging`, retourne `{ data: {}, content: text }`. L'agent se charge avec un frontmatter vide. | fin de la fonction **C**                                                                                      |
| Télémétrie           | Encapsulé plus en amont — les événements `tengu_frontmatter_shadow_unknown_key` / `_mismatch` se déclenchent depuis `ug5.agent` (schéma Ig5) | `claude.strings:308120`, `309074`, `309076` (cité en croisé dans `docs/design/declarative-agents-port.md` Phase 1) |

**Implication pour qwen-code** : nous n'avons PAS besoin de cloner la récupération en 2 passes.
Le `subagent-manager.ts` de qwen-code applique déjà une sémantique plus stricte de "throw on malformed
frontmatter at top level" (erreur sur frontmatter malformé au niveau supérieur) pour son loader (voir `parseSubagentContent`),
et la récupération en 2 passes est spécifiquement là pour pardonner les anciens fichiers d'agents CC édités à la main. Porter une posture plus stricte est acceptable ; nous devons simplement **ne pas faire planter tout le loader** lorsque des champs imbriqués sont malformés. Voir la Phase 5 pour la posture warn-and-drop.

## Phase 3 — Validation imbriquée via zod (CC)

Les validateurs CC pertinents selon `docs/design/declarative-agents-port.md` Phase 1 +
vérification croisée des strings binaires :

### `mcpServers` (symbole CC `gS8` / JSON-shadow `jL7`)

```
mcpServers: z.union([
  z.string(),                                            // server name reference
  z.record(z.string(), McpServerConfigSchema()),         // inline { name: spec }
])
```

`McpServerConfigSchema()` (de la ref `claude.strings:124–135`) est une
**union discriminée** sur `type` :

| `type`             | Champs requis                          | Notes                                              |
| ------------------ | -------------------------------------- | -------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]`   | Plus `env?: Record<string,string>`, `cwd?: string` |
| `"sse"`            | `url: string`                          | Plus `headers?: Record<string,string>`             |
| `"http"`           | `url: string`                          | Plus `headers?`, `method?`                         |
| `"websocket"`      | `url: string`                          | parité qwen-code inconnue — reporter jusqu'à ce que ce soit nécessaire |
| `"sdk"`            | varie                                  | Usage interne CC ; nous n'avons PAS besoin de le supporter |
| `"claudeai-proxy"` | varie                                  | Usage interne CC ; nous n'avons PAS besoin de le supporter |

**Pour qwen-code v1** : valider en tant que `Record<string, unknown>` (tolérant,
style DL7), et laisser le merge en aval dans `Config.getMcpServers()` faire la coercion de forme. `qwen-code` possède déjà la classe `MCPServerConfig` avec
discrimination de `type` — nous réutilisons ce converter au lieu de dupliquer le
schéma zod. Voir la Phase 4 du plan de runtime-wiring dans
`docs/design/declarative-agents-port.md`.

### `hooks` (symbole CC `TKO` / `_u`)

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig (discriminated union on `type`):
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

Les clés des événements de hook selon la vérification croisée des strings sont le même ensemble que qwen-code
supporte déjà : `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`,
`Notification` — plus quelques événements spécifiques à qwen (`TodoCreated`, `TodoCompleted`)
que CC n'a pas.

**Pour qwen-code v1** : valider en tant que `Record<string, unknown>` (tolérant), puis
passer la main aux validateurs existants `SessionHooksManager` de qwen-code, qui
implémentent déjà la forme `HookDefinition[]` par événement (voir
`packages/core/src/hooks/types.ts:207–211` selon le mapping runtime de la Phase 1).

### Pourquoi les deux validateurs sont `z.unknown()` au niveau du shadow `Ig5`

`Ig5` est le **schéma shadow de télémétrie** — il déclenche des événements
`tengu_frontmatter_shadow_unknown_key` lorsqu'une clé YAML n'est pas dans l'ensemble connu, et des événements `_mismatch` lorsqu'une clé connue a le mauvais type. Il
utilise délibérément `z.unknown()` pour `mcpServers` et `hooks` parce que
**`Ig5` s'exécute au moment du PARSE** et émettrait des événements de mismatch erronés pour chaque spécification mcpServers en ligne. La validation réelle est déléguée à :

- `gS8` (pour `mcpServers`) — appelé **au moment de l'enregistrement de l'agent** depuis
  le `safeParse` par élément de `DL7`
- `TKO` (pour `hooks`) — appelé **au moment du déclenchement du hook** depuis `_u().safeParse`
Cette **validation paresseuse** est le modèle que qwen-code doit imiter : garder le parser de frontmatter permissif (équivalent de `z.unknown()` en TS), et valider au point d'utilisation. Essayer d'importer l'arbre zod complet dans `SubagentConfig` nous obligerait à importer également la classe `MCPServerConfig` de qwen et le type `HookDefinition` dans une couche où ils ne résident pas actuellement, et nous demanderait d'inventer de faux validateurs pour `type: 'sdk'` / `type: 'claudeai-proxy'` que nous ne supportons pas réellement.

## Phase 4 — Posture de sécurité

Vérification empirique des valeurs par défaut de `yaml@2.8.1` dans cet arbre qwen-code :

### Résultats des sondes

```
$ node -e "const y=require('yaml'); console.log(y.parse('a: 1').constructor.name, y.parseDocument('a: 1').schema?.name)"
Object core
```

→ le schéma par défaut est `'core'` (sur-ensemble JSON YAML 1.2). **C**

```
$ node -e "const y=require('yaml'); console.log(y.parse('!!js/function \"function(){}\"'))"
function(){}
(node:18525) [TAG_RESOLVE_FAILED] YAMLWarning: Unresolved tag: tag:yaml.org,2002:js/function
```

→ la balise `!!js/function` ne s'exécute PAS. La valeur est résolue en une **chaîne littérale** `"function(){}"` (et non un objet fonction appelable), et émet un `YAMLWarning` non fatal. Un attaquant ne peut pas obtenir une RCE via ce vecteur. **C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJECTED:', e.message) }"
REJECTED: Excessive alias count indicates a resource exhaustion attack
```

→ l'expansion d'alias / billion-laughs est REJETÉE **par défaut**. La bibliothèque est livrée avec `maxAliasCount: 100` (le parsing échoué compte 1+10+100 = 111 alias). **C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ la clé de fusion (`<<`) est parsée comme une **chaîne de clé littérale** par défaut, et n'est PAS étendue. Le parser `<<` est optionnel via `{ merge: true }`. Nous ne l'activerons PAS. **C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ les `mcpServers` imbriqués de forme CC sont parsés correctement en objet/tableau profondément imbriqué. **C**

### Résumé de la sécurité

| Vecteur                        | Valeur par défaut `yaml@2.8.1`    | Action requise dans qwen-code                          |
| ------------------------------ | --------------------------------- | ------------------------------------------------------ |
| Exécution JS arbitraire        | Impossible — pas d'eval           | Aucune                                                 |
| Balise `!!js/function`         | Devient chaîne littérale + warning| Aucune                                                 |
| Billion laughs                 | Rejeté (`maxAliasCount: 100`)     | Aucune — garder la valeur par défaut                   |
| Clés de fusion (`<<`)          | Traitées comme clé littérale      | Aucune — garder la valeur par défaut (ne PAS passer `merge: true`) |
| Ancres / alias (usage normal)  | Autorisés, utiles pour les données de forme CC | Aucune                                      |
| Balises inconnues arbitraires  | Chaîne + `YAMLWarning`            | Rediriger optionnellement les warnings vers un logger (voir Phase 6) |

**Conclusion** : le comportement standard du package `yaml` est déjà plus sûr que ce que le brief de la tâche originale demandait via le `FAILSAFE_SCHEMA` de `js-yaml`. Aucun appel de verrouillage de schéma n'est requis.

## Phase 5 — Sémantique de récupération

CC choisit une approche **warn-and-drop gracieuse** à chaque niveau :

1. Le parser YAML lève une exception → le parser de frontmatter loggue + retourne `{}` (données vides)
2. Un champ a une forme incorrecte (ex: `mcpServers: "this is a string"`) → `safeParse` échoue → le champ est retiré de la config émise
3. Un champ a une forme _presque_ incorrecte (ex: un élément individuel de `mcpServers` est une chaîne alors que le schéma attend un objet) → le `safeParse` par élément retire uniquement cet élément, conserve le reste

qwen-code implémente déjà la posture warn-and-drop par champ pour `permissionMode`, `maxTurns`, `color`, `effort` (voir `packages/core/src/subagents/agent-frontmatter-schema.ts`). Nous étendons ce même pattern à `mcpServers` et `hooks`.

Ce que nous ne clonons PAS de CC :

- **Récupération YAML en 2 passes avec auto-quoting**. C'est du poids mort pour qwen-code — nous sommes un nouveau projet, sans fichiers frontmatter hérités et édités à la main à pardonner. Une erreur propre est plus utile qu'une réinterprétation devinée.
- **Événements de télémétrie `tengu_*`**. Remplacés par le propre logger de qwen-code / la couche de télémétrie utilisée par le reste du loader.

## Phase 6 — Recommandation pour qwen-code

### Choix de la bibliothèque

- **Utiliser `yaml@^2.8.1`** (déjà une dépendance transitive — la promouvoir en dépendance directe dans `packages/core/package.json` pour ne pas casser sous des modes de résolution plus stricts ; permet également de pinner la version majeure).
- **Utiliser le schéma par défaut** (`core`), pas de flag de schéma.
- **Ne pas** passer `{ merge: true }`. Ne pas activer d'option non par défaut.
- Pour une sortie stringify déterministe (snapshots de tests), passer `{ lineWidth: 0, defaultStringType: 'PLAIN' }` à `yaml.stringify` afin que la bibliothèque ne coupe pas les lignes longues ou ne passe pas arbitrairement à un quoting block-scalar basé sur la longueur du contenu.

### Surface d'API à préserver

L'actuel `packages/core/src/utils/yaml-parser.ts` exporte :

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

Le remplacement garde les deux signatures **identiques** afin que les 5 appelants (`subagent-manager.ts`, `claude-converter.ts`, `rulesDiscovery.ts`, `skill-manager.ts`, `skill-load.ts`) et la ré-exportation `index.ts` ne nécessitent aucune modification au niveau des sites d'appel.

Esquisse d'implémentation :

```ts
import * as yaml from 'yaml';

export function parse(yamlString: string): Record<string, unknown> {
  const parsed = yaml.parse(yamlString);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string {
  return yaml.stringify(obj, {
    lineWidth: options?.lineWidth ?? 0,
    minContentWidth: options?.minContentWidth ?? 20,
  });
}
```

**Pourquoi coercer les top-levels non-objets en `{}`** : chaque appelant existant suppose un record. Un fichier YAML qui parse en `null` (fichier vide), `["foo"]` (une liste) ou `"hello"` (un scalaire nu) ferait actuellement planter la déstructuration en aval. Retourner `{}` préserve le comportement de l'ancien parser fait à la main sur les mêmes entrées. Documentez cela comme un garde-fou délibéré dans un commentaire sur une ligne.

### Appelants ne nécessitant aucun changement

| Fichier                                              | Utilisation                                                          | Compatible ?                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/core/src/index.ts:360`                     | ré-exporte `*` depuis yaml-parser                                    | oui — mêmes noms                                                         |
| `packages/core/src/subagents/subagent-manager.ts:15` | `parse`, `stringify`                                                 | oui                                                                      |
| `packages/core/src/extension/claude-converter.ts:26` | `parse`, `stringify`                                                 | oui — le round-trip est maintenant sûr pour `mcpServers` + `hooks` (voir Phase 3) |
| `packages/core/src/utils/rulesDiscovery.ts:20`       | `parse as parseYaml`                                                 | oui                                                                      |
| `packages/core/src/skills/skill-manager.ts:13`       | `parse as parseYaml` (et `import * as yaml from 'yaml'` séparément)  | oui — et le `import * as yaml` dupliqué peut être retiré dans un suivi   |
| `packages/core/src/skills/skill-load.ts:11`          | `parse as parseYaml`                                                 | oui                                                                      |

### Fixtures de test nécessaires

Trois extraits YAML concrets sur lesquels le parser fait à la main actuel échoue et que le remplacement doit gérer (un par forme imbriquée) :

```yaml
# Fixture 1 — mcpServers (record de records)
mcpServers:
  filesystem:
    type: stdio
    command: node
    args:
      - /path/to/server.js
    env:
      DEBUG: '1'
  github:
    type: http
    url: https://mcp.example.com/github
    headers:
      Authorization: 'Bearer xxx'
```

```yaml
# Fixture 2 — hooks (record de tableaux de records, deux niveaux d'imbrication sous le nom de l'événement)
hooks:
  PreToolUse:
    - matcher: 'Read|Write'
      hooks:
        - type: command
          command: echo before
          timeout: 5000
  PostToolUse:
    - matcher: '*'
      hooks:
        - type: command
          command: echo after
```

```yaml
# Fixture 3 — mélange shallow + deep, plus tout ce que la PR #4842 supporte déjà
name: agent-x
description: test
permissionMode: acceptEdits
maxTurns: 5
color: cyan
tools:
  - Read
  - Write
mcpServers:
  filesystem:
    type: stdio
    command: node
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: log
```

### Tests qui doivent changer

`packages/core/src/utils/yaml-parser.test.ts` contient 2 "pin tests" en bas (lignes 200–227) intitulés `known limitations — nested YAML (pin until js-yaml lands)`. Le remplacement DOIT les transformer en assertions de parsing imbriqué sous forme positive :

```ts
it('parses array-of-records', () => {
  const yaml =
    'mcpServers:\n  - filesystem:\n      type: stdio\n      command: node';
  expect(parse(yaml)).toEqual({
    mcpServers: [{ filesystem: { type: 'stdio', command: 'node' } }],
  });
});

it('parses record-of-records', () => {
  const yaml = 'hooks:\n  PreToolUse:\n    - matcher: Read';
  expect(parse(yaml)).toEqual({
    hooks: { PreToolUse: [{ matcher: 'Read' }] },
  });
});
```

Ces deux assertions plus les trois fixtures ci-dessus constituent la **porte d'acceptation** pour la Phase 2 du plan d'implémentation. Tout le reste (cas limites d'échappement, booléens avec ou sans guillemets, chaînes numériques) est une couverture de régression de la suite de tests existante et devrait passer sans changement.

### Vérification de la parité round-trip

Le test existant `should maintain round-trip integrity for escaped strings` (lignes 111-129) fait passer 7 chaînes par `stringify → parse`. Le `stringify` par défaut de `yaml` produit une sortie légèrement différente du formateur fait à la main (quoting plus agressif dans certains cas, séquences d'échappement différentes). Deux issues acceptables :

1. **Ajuster les fixtures de test** pour assert le comportement sous le nouveau parser — c'est la propriété round-trip (`parse(stringify(x)) === x`) qui compte, pas une sortie YAML identique au byte près.
2. **Laisser les assertions identiques au byte près** et les laisser échouer visiblement, puis les mettre à jour pour refléter la sortie de `yaml` verbatim. Plus facile pour reviewer le diff.

Recommandation : **option 1** — changer les assertions pour qu'elles soient basées sur les propriétés (`expect(parse(stringify(obj))).toEqual(obj)`) puisque la sortie YAML identique au byte près n'est pas un contrat documenté du module.

### Breaking changes pour les appelants — aucun attendu, mais à vérifier

- `subagent-manager.ts` resérialise l'objet parsé en YAML pour le chemin `saveSubagent`. Avec le nouveau parser, `mcpServers` et `hooks` feront un round-trip propre. Mettre à jour `NESTED_FIELDS_NOT_ROUND_TRIPPABLE` dans `claude-converter.ts` (Phase 3 de l'implémentation) pour retirer ces deux noms de champs.
- `skill-manager.ts` importe déjà `yaml` directement (séparément du parser fait à la main). Une fois que `yaml-parser.ts` utilisera également `yaml`, l'import dupliqué pourra être retiré dans un petit suivi — hors sujet ici.
### Risque de migration

Faible. Les 5 appelants déstructurent tous un `Record<string, unknown>` — même type
de retour. Les 2 tests de verrouillage des « brouillages » intentionnels sont les seuls
échecs attendus ; ils sont connus et nous les activons exprès. Une couverture de
régression plus large provient des suites de tests existantes dans
`packages/core/src/subagents/`, `packages/core/src/skills/`, et
`packages/core/src/extension/`.

## Questions ouvertes

| #   | Question                                                                                                                                              | Bloquant ?                                                              | Pistes de résolution                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `yaml.parse` a-t-il besoin d'un logger explicite pour rediriger les `YAMLWarning` (ex. : `Unresolved tag`) vers le logger de qwen-code au lieu de `process.emitWarning` ? | Non — reporter                                                          | Si les logs deviennent trop verbeux en CI, injecter `{ logLevel: 'silent' }` ou un callback `onWarning` personnalisé. Non critique pour la v1.                            |
| Q2  | `parse()` doit-il continuer à retourner `{}` pour un YAML vide / document null, ou lever une erreur ?                                                 | Non — conserver le comportement actuel                                  | L'implémentation manuelle actuelle retourne `{}` ; nous conservons cela. Ajouter un test de régression pour verrouiller ce choix.                                       |
| Q3  | Lorsque `mcpServers` est malformé au niveau racine (ex. : `mcpServers: "string"`), l'agent entier doit-il échouer au chargement, ou charger en ignorant ce champ ? | Oui — détermine la posture "avertir et ignorer" dans la phase 3 de l'implémentation | **Résolution** : ignorer le champ, émettre un avertissement dans la console (parité avec CC `DL7` selon la phase 3 de `docs/design/declarative-agents-port.md`).          |
| Q4  | Même chose que Q3 mais pour `hooks` : ignorer le champ, l'événement, ou juste le matcher individuel ?                                                  | Oui — détermine la posture "avertir et ignorer"                         | **Résolution** : ignorer tout le champ `hooks` en cas d'erreur de structure au niveau racine. La granularité par événement / par matcher est reportée à une future PR si un utilisateur réel en exprime le besoin. |
| Q5  | Le raccourci `Bun.YAML.parse` du helper de CC s'applique-t-il à qwen-code ?                                                                           | Non                                                                     | qwen-code ne cible pas le runtime Bun. À ignorer.                                                                                                                       |

---

**Statut** : recherche terminée, prêt à implémenter la phase 2 (remplacer
`yaml-parser.ts`) et la phase 3 (re-exposer `mcpServers` + `hooks` sur
`SubagentConfig`) conformément à `docs/design/declarative-agents-port.md`.