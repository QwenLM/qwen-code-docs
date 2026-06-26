# Remplacement de l’analyseur YAML — résultats de la recherche

Document de conception interne pour remplacer l’analyseur YAML fait main (192 lignes) situé dans
`packages/core/src/utils/yaml-parser.ts` par une véritable bibliothèque, afin que les champs
différés `mcpServers` et `hooks` du schéma d’agent déclaratif de Claude Code puissent
transiter en toute sécurité dans les chemins de code subagent / skill / convertisseur.

Document connexe : [`docs/declarative-agents-port.md`](./declarative-agents-port.md).
Problème : [#4821](https://github.com/QwenLM/qwen-code/issues/4821). Prérequis pour
le suivi de [PR #4842](https://github.com/QwenLM/qwen-code/pull/4842).

## Phase 0 — Sources vérifiées

| Source                                                  | Version / Date                         | Pourquoi c’est une source fiable                                                                                                 |
| ------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `~/code/claude-code/src/utils/yaml.ts`                  | ancien snapshot CC (pre-2.1.168)        | source directe — wrapper de 15 lignes qui nomme la bibliothèque                                                                  |
| `~/code/claude-code/src/utils/frontmatterParser.ts`     | même snapshot                          | source directe — séparateur de frontmatter (370 lignes) + récupération en 2 passes                                                |
| `/private/tmp/cc-2.1.168/claude.strings`                | extrait de CC 2.1.168                  | faisant autorité pour le comportement actuel — les chaînes contiennent des noms de symboles obscurs mais aussi le schéma JSON et le texte des messages d’erreur |
| `packages/core/src/utils/yaml-parser.ts` (ce dépôt)    | HEAD de `lazzy/gifted-hamilton-684741` | l’analyseur à remplacer                                                                                                          |
| sondes `node -e` en direct contre `yaml@2.8.1` dans cette arborescence | 2026-06-08                 | comportement empirique de sécurité — ancres, clés de fusion, `!!js/function`, billion-laughs, `maxAliasCount` (résultats inline dans la Phase 4) |

Étiquettes de confiance : **C** confirmé par preuve directe ; **I** inféré à partir de
plusieurs faits confirmés ; **O** question ouverte.

## Phase 1 — Quelle bibliothèque YAML CC utilise-t-elle ?

**Réponse : [`yaml`](https://www.npmjs.com/package/yaml) (eemeli/yaml), PAS
`js-yaml`.** Confirmé en lisant `~/code/claude-code/src/utils/yaml.ts`
textuellement :

```ts
export function parseYaml(input: string): unknown {
  if (typeof Bun !== 'undefined') {
    return Bun.YAML.parse(input);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('yaml') as typeof import('yaml')).parse(input);
}
```

- **Bibliothèque** : paquet npm `yaml`. **C**
- **API** : `.parse(input)` de premier niveau. Utilise le schéma par défaut du paquet (qui
  est YAML 1.2 `core` — sur-ensemble JSON, pas d’extensions JS). **C**
- **Raccourci Bun** : lorsqu’il s’exécute sous Bun, CC utilise `Bun.YAML.parse()` pour
  éviter de regrouper ~270 Ko d’analyseur YAML. **C** Non pertinent pour qwen-code
  (nous ne ciblons pas l’exécution Bun).
- **Mode de schéma** : PAS défini explicitement dans CC. Repose sur le comportement par défaut
  du paquet `yaml`, plus la validation zod au niveau du consommateur
  (`DL7`, `gS8`, `TKO`/`_u` selon `docs/declarative-agents-port.md`). **C**

### Pourquoi `yaml` plutôt que `js-yaml`

| Dimension                | `js-yaml` 4.x                                                                              | `yaml` (eemeli) 2.x                                  |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Schéma par défaut        | `DEFAULT_SAFE_SCHEMA` (depuis 4.x) — sûr ; les versions antérieures avaient `DEFAULT_FULL_SCHEMA` avec JS | `core` (spécification YAML 1.2) — types JSON uniquement |
| Balise `!!js/function`   | PAS prise en charge en 4.x (l’était en 3.x)                                                | Jamais prise en charge                                |
| Protection billion-laughs | Aucune (responsabilité manuelle)                                                               | Intégrée, `maxAliasCount: 100` par défaut                |
| Clés de fusion (`<<`)    | Prises en charge (doit être désactivé via `MERGE_SCHEMA` ou filtrage)                       | Désactivé par défaut, activation via `{ merge: true }`    |
| Déjà une dépendance de qwen-code ? | `js-yaml@4.1.1` ✓                                                                          | `yaml@2.8.1` ✓ (déjà importé par `skill-manager`) |

Les deux sont des choix raisonnables en 2026, mais **les instructions initiales
recommandait `FAILSAFE_SCHEMA` / `CORE_SCHEMA` de `js-yaml`**. Nous nous écartons
de cette recommandation pour trois raisons concrètes :

1. **Parité avec CC**. Tout l’intérêt du portage du schéma frontmatter de CC est de
   permettre aux utilisateurs de déposer un fichier agent CC dans `.qwen/agents/` et de le voir analyser
   à l’identique. Utiliser le même analyseur que CC minimise les écarts sur les constructions YAML
   de cas limites (flux multi-documents, scalaires flow vs block, gestion des balises).
2. **`yaml` est déjà un utilisateur direct dans `skill-manager.ts`** — voir
   `packages/core/src/skills/skill-manager.ts:13` (`import * as yaml from 'yaml'`).
   Standardiser sur `yaml` élimine l’une des deux piles YAML en double dans
   le même paquet. **C** (résultat grep documenté dans la Phase 6).
3. **Valeurs par défaut plus sûres que `js-yaml`**. `maxAliasCount` intégré dans `yaml` bloque
   billion-laughs sans configuration manuelle ; les clés de fusion sont désactivées par
   défaut ; les balises arbitraires deviennent des chaînes littérales avec un `YAMLWarning` plutôt
   que de déclencher des résolveurs invocables. Preuve empirique dans la Phase 4.

Si un futur mainteneur souhaite supprimer la dépendance `yaml` et uniformiser sur
`js-yaml`, la migration est mécanique : remplacer `yaml.parse` / `yaml.stringify`
par `jsYaml.load(s, { schema: jsYaml.CORE_SCHEMA })` / `jsYaml.dump`. Les
deux bibliothèques sont d’accord sur la sortie pour le sous-ensemble à 100 % que CC et qwen-code
utilisent réellement (paires clé-valeur, listes, cartes imbriquées, scalaires booléens/numériques).
Suivez cette décision séparément si elle se présente.

## Phase 2 — Pipeline d’analyse du frontmatter (CC)

`~/code/claude-code/src/utils/frontmatterParser.ts` fait 370 lignes. Principaux
résultats :

| Étape                | Logique                                                                                                                     | Source                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Correspondance délimiteur | Regex `/^---\s*\n([\s\S]*?)\n---\s*\n?/` — ouvre à la colonne 0, corps non gourmand, `---` de fermeture doit être sur sa propre ligne | `frontmatterParser.ts:~123` (numéros de ligne de l’ancien snapshot ; à prendre comme approximatifs) **C**               |
| Analyse passe 1       | Appel à `parseYaml(body)`. En cas de succès → retourne l’objet analysé + le reste du contenu.                                            | même fichier, début du bloc try **C**                                                                      |
| Récupération passe 2  | En cas de `YAMLException`, parcourir les lignes, auto-citer les valeurs qui ressemblent à des dates/deux-points/spéciaux, réessayer `parseYaml` une fois.           | lignes ~85–121 dans l’ancien snapshot **C** (normalisation `tab → 2 espaces`, heuristique de date ISO, piège des deux-points)   |
| Échec final           | Les deux passes ont échoué → journalisation via `logForDebugging`, retour de `{ data: {}, content: text }`. L’agent se charge avec un frontmatter vide. | fin de la fonction **C**                                                                                  |
| Télémétrie            | Enveloppée plus en amont — événements `tengu_frontmatter_shadow_unknown_key` / `_mismatch` déclenchés depuis `ug5.agent` (schéma Ig5) | `claude.strings:308120`, `309074`, `309076` (cité en croix dans `docs/declarative-agents-port.md` Phase 1) |

**Implication pour qwen-code** : nous n’avons PAS besoin de cloner la récupération en 2 passes.
Le `subagent-manager.ts` de qwen-code impose déjà une sémantique plus stricte de type « lever une erreur
sur un frontmatter mal formé au niveau supérieur » pour son chargeur (voir `parseSubagentContent`),
et la récupération en 2 passes sert spécifiquement à pardonner les anciens fichiers agents CC
édités à la main. Porter une posture plus stricte convient ; nous devons simplement **ne pas planter
tout le chargeur** lorsque des champs imbriqués sont mal formés. Voir Phase 5 pour la posture
avertir-et-ignorer.

## Phase 3 — Validation imbriquée via zod (CC)

Les validateurs CC pertinents selon `docs/declarative-agents-port.md` Phase 1 +
vérification croisée des chaînes binaires :

### `mcpServers` (symbole CC `gS8` / ombre JSON `jL7`)

```
mcpServers: z.union([
  z.string(),                                            // référence de nom de serveur
  z.record(z.string(), McpServerConfigSchema()),         // inline { name: spec }
])
```

`McpServerConfigSchema()` (d’après `claude.strings:124–135` ref) est une
**union discriminée** sur `type` :

| `type`             | Champs obligatoires                    | Notes                                               |
| ------------------ | -------------------------------------- | --------------------------------------------------- |
| `"stdio"`          | `command: string`, `args?: string[]`   | Plus `env?: Record<string,string>`, `cwd?: string`  |
| `"sse"`            | `url: string`                          | Plus `headers?: Record<string,string>`              |
| `"http"`           | `url: string`                          | Plus `headers?`, `method?`                          |
| `"websocket"`      | `url: string`                          | Parité qwen-code inconnue — différer jusqu’à besoin |
| `"sdk"`            | variable                               | Usage interne CC ; nous n’avons PAS besoin de le supporter         |
| `"claudeai-proxy"` | variable                               | Usage interne CC ; nous n’avons PAS besoin de le supporter         |

**Pour qwen-code v1** : valider en tant que `Record<string, unknown>` (souple
style DL7), et laisser la fusion aval dans `Config.getMcpServers()` faire
la coercition de forme. `qwen-code` a déjà une classe `MCPServerConfig` avec
discrimination par `type` — nous réutilisons ce convertisseur au lieu de dupliquer
le schéma zod. Voir Phase 4 du plan de câblage d’exécution dans
`docs/declarative-agents-port.md`.

### `hooks` (symbole CC `TKO` / `_u`)

```
hooks: Partial<Record<HookEvent, HookMatcher[]>>
HookMatcher: { matcher?: string, hooks: HookConfig[] }
HookConfig (union discriminée sur `type`) :
  - { type: 'command', command: string, timeout?: number, ... }
  - { type: 'prompt',  prompt: string, ... }
  - { type: 'agent',   agent: string, ... }
  - { type: 'http',    url: string, headers?, ... }
```

Les clés d’événement de hook selon la vérification croisée des chaînes sont le même ensemble que qwen-code
prend déjà en charge : `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`,
`Notification` — plus quelques événements propres à qwen (`TodoCreated`, `TodoCompleted`)
que CC n’a pas.

**Pour qwen-code v1** : valider en tant que `Record<string, unknown>` (souple), puis
confier aux validateurs existants de `SessionHooksManager` de qwen-code, qui
implémentent déjà la forme `HookDefinition[]` par événement (voir
`packages/core/src/hooks/types.ts:207–211` selon le mappage d’exécution Phase 1).

### Pourquoi les deux validateurs sont `z.unknown()` au niveau de l’ombre `Ig5`

`Ig5` est le **schéma d’ombre de télémétrie** — il déclenche
des événements `tengu_frontmatter_shadow_unknown_key` lorsqu’une clé YAML n’est pas dans l’ensemble
connu, et des événements `_mismatch` lorsqu’une clé connue a un type incorrect. Il
utilise délibérément `z.unknown()` pour `mcpServers` et `hooks` car
**`Ig5` s’exécute au moment de l’ANALYSE** et émettrait des événements mismatch parasites pour
chaque spécification mcpServers inline. La véritable validation est déléguée à :

- `gS8` (pour `mcpServers`) — appelée **au moment de l’enregistrement de l’agent** depuis
  `DL7` avec `safeParse` par élément
- `TKO` (pour `hooks`) — appelée **au moment du déclenchement du hook** depuis `_u().safeParse`

Cette **validation paresseuse** est le modèle que qwen-code devrait imiter : garder l’analyseur
frontmatter permissif (équivalent `z.unknown()` en TS), valider au
point d’utilisation. Essayer d’amener l’arbre zod complet en amont dans
`SubagentConfig` nous forcerait également à importer la classe `MCPServerConfig` de qwen
et le type `HookDefinition` dans une couche où ils ne résident pas actuellement, et
nous obligerait à inventer des validateurs factices pour `type: 'sdk'` /
`type: 'claudeai-proxy'` que nous ne supportons pas réellement.

## Phase 4 — Posture de sécurité

Vérification empirique des valeurs par défaut de `yaml@2.8.1` dans cette arborescence qwen-code :

### Résultats des sondes

```
$ node -e "const y=require('yaml'); console.log(y.parse('a: 1').constructor.name, y.parseDocument('a: 1').schema?.name)"
Object core
```

→ le schéma par défaut est `'core'` (sur-ensemble JSON YAML 1.2). **C**

```
$ node -e "const y=require('yaml'); console.log(y.parse('!!js/function \"function(){}\"'))"
function(){}
(node:18525) [TAG_RESOLVE_FAILED] YAMLWarning: Balise non résolue : tag:yaml.org,2002:js/function
```

→ la balise `!!js/function` ne s’exécute PAS. La valeur se résout en la **chaîne
littérale** `"function(){}"` (pas un objet fonction invocable), et émet un
`YAMLWarning` non fatal. Un adversaire ne peut pas obtenir d’exécution de code via ce vecteur. **C**

```
$ node -e "const y=require('yaml'); const bomb = 'a: &a [hi,hi]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'; try { y.parse(bomb) } catch(e){ console.log('REJETÉ :', e.message) }"
REJETÉ : Le nombre excessif d’alias indique une attaque par épuisement des ressources
```

→ l’expansion d’alias / billion-laughs est REJETÉE **par défaut**. La bibliothèque
est fournie avec `maxAliasCount: 100` (l’analyse échouée compte 1+10+100 = 111
alias). **C**

```
$ node -e "const y=require('yaml'); console.log(JSON.stringify(y.parse('defaults: &d\n  a: 1\nfoo:\n  <<: *d\n  b: 2')))"
{"defaults":{"a":1},"foo":{"<<":{"a":1},"b":2}}
```

→ la clé de fusion (`<<`) est analysée comme une **clé chaîne littérale** par défaut, PAS
développée. L’analyseur `<<` est activé via `{ merge: true }`. Nous n’allons
PAS l’activer. **C**

```
$ node -e "const y=require('yaml'); const yml='mcpServers:\n  filesystem:\n    type: stdio\n    command: node\n    args:\n      - /path/to/server.js'; console.log(JSON.stringify(y.parse(yml), null, 2))"
{
  "mcpServers": {
    "filesystem": { "type": "stdio", "command": "node", "args": ["/path/to/server.js"] }
  }
}
```

→ les mcpServers imbriqués de forme CC s’analysent correctement en objet/tableau
profondément imbriqué. **C**

### Résumé de sécurité

| Vecteur                         | `yaml@2.8.1` par défaut              | Action nécessaire dans qwen-code                             |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| Exécution JS arbitraire         | Impossible — pas d’eval              | Aucune                                                       |
| Balise `!!js/function`          | Devient chaîne littérale + avertissement | Aucune                                                       |
| Billion laughs                  | Rejeté (`maxAliasCount: 100`)        | Aucune — conserver la valeur par défaut                      |
| Clés de fusion (`<<`)           | Traité comme clé littérale           | Aucune — conserver la valeur par défaut (NE PAS passer `merge: true`) |
| Ancres / alias (usage normal)   | Autorisé, utile pour les données de forme CC | Aucune                                                       |
| Balises inconnues arbitraires   | Chaîne + `YAMLWarning`               | Optionnel : rediriger les avertissements vers un journal (voir Phase 6) |

**Conclusion** : le comportement standard du paquet `yaml` est déjà plus sûr que
ce que les instructions initiales demandaient via `FAILSAFE_SCHEMA` de `js-yaml`. Aucun
appel de verrouillage de schéma n’est nécessaire.

## Phase 5 — Sémantique de récupération

CC choisit une **approche gracieuse avertir-et-ignorer** à chaque couche :

1. L’analyseur YAML échoue → l’analyseur frontmatter enregistre + retourne `{}` (données vides)
2. Le champ a une forme incorrecte (par exemple `mcpServers: "ceci est une chaîne"`) → `safeParse`
   échoue → le champ est supprimé de la configuration émise
3. Le champ a une forme _presque_ incorrecte (par exemple un élément `mcpServers` individuel est une
   chaîne alors que le schéma attend un objet) → `safeParse` par élément supprime juste
   cet élément, garde le reste

qwen-code implémente déjà la posture avertir-et-ignorer par champ pour
`permissionMode`, `maxTurns`, `color`, `effort` (voir
`packages/core/src/subagents/agent-frontmatter-schema.ts`). Nous étendons le même
motif à `mcpServers` et `hooks`.

Ce que nous NE CLONONS PAS de CC :

- **Récupération YAML en 2 passes avec auto-citation**. C’est du poids mort pour
  qwen-code — nous sommes un nouveau projet, pas de fichiers frontmatter hérités édités à la main
  à pardonner. Une erreur propre est plus utile qu’une réinterprétation devinée.
- **Événements de télémétrie `tengu_*`**. Remplacés par le propre journal de qwen-code /
  la couche de télémétrie que le reste du chargeur utilise.

## Phase 6 — Recommandation pour qwen-code

### Choix de la bibliothèque

- **Utiliser `yaml@^2.8.1`** (déjà une dépendance transitive — la promouvoir en dépendance
  directe de `packages/core/package.json` pour ne pas casser sous des modes de résolution
  plus stricts ; cela permet aussi de verrouiller la version majeure).
- **Utiliser le schéma par défaut** (`core`), pas de drapeau de schéma.
- **Ne pas** passer `{ merge: true }`. N’activer aucune option non par défaut.
- Pour une sortie stringify déterministe (instantanés de test), passer
  `{ lineWidth: 0, defaultStringType: 'PLAIN' }` à `yaml.stringify` pour que la
  bibliothèque ne coupe pas les longues lignes ni ne bascule arbitrairement vers une citation en bloc-scalaire
  en fonction de la longueur du contenu.

### Surface API à préserver

Les exportations actuelles de `packages/core/src/utils/yaml-parser.ts` :

```ts
export function parse(yamlString: string): Record<string, unknown>;
export function stringify(
  obj: Record<string, unknown>,
  options?: { lineWidth?: number; minContentWidth?: number },
): string;
```

Le remplacement conserve les deux signatures **identiques** pour que les 5 appelants
(`subagent-manager.ts`, `claude-converter.ts`, `rulesDiscovery.ts`,
`skill-manager.ts`, `skill-load.ts`) et la ré-exportation `index.ts` ne nécessitent
aucune modification du site d’appel.

Croquis d’implémentation :

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

**Pourquoi forcer les niveaux supérieurs non-objets à `{}`** : chaque appelant existant suppose un
enregistrement. Un fichier YAML qui s’analyse en `null` (fichier vide), `["foo"]` (une liste),
ou `"hello"` (un scalaire brut) planterait actuellement la déstructuration aval.
Retourner `{}` préserve le comportement de l’ancien analyseur fait main sur les mêmes
entrées. Documenter cela comme une barrière de sécurité intentionnelle dans un commentaire d’une ligne.

### Appelants qui ne nécessitent aucun changement

| Fichier                                                 | Utilisation                                                             | Compatible ?                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/core/src/index.ts:360`                        | ré-exporte `*` depuis yaml-parser                                       | oui — mêmes noms                                                          |
| `packages/core/src/subagents/subagent-manager.ts:15`    | `parse`, `stringify`                                                    | oui                                                                       |
| `packages/core/src/extension/claude-converter.ts:26`    | `parse`, `stringify`                                                    | oui — l’aller-retour est maintenant sûr pour `mcpServers` + `hooks` (voir Phase 3) |
| `packages/core/src/utils/rulesDiscovery.ts:20`          | `parse as parseYaml`                                                    | oui                                                                       |
| `packages/core/src/skills/skill-manager.ts:13`          | `parse as parseYaml` (et `import * as yaml from 'yaml'` séparément)     | oui — et le `import * as yaml` en double peut être supprimé dans un suivi |
| `packages/core/src/skills/skill-load.ts:11`             | `parse as parseYaml`                                                    | oui                                                                       |
### Maquettes de test nécessaires

Trois extraits YAML concrets que l'analyseur syntaxique artisanal actuel ne parvient pas à traiter
et que le remplacement doit gérer (un par forme imbriquée) :

```yaml
# Maquette 1 — mcpServers (enregistrement d'enregistrements)
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
# Maquette 2 — hooks (enregistrement de tableaux d'enregistrements, deux niveaux d'imbrication sous le nom d'événement)
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
# Maquette 3 — mixte superficiel + profond, plus tout ce que la PR #4842 prend déjà en charge
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

`packages/core/src/utils/yaml-parser.test.ts` contient 2 « tests d'ancrage » en
bas (lignes 200–227) intitulés `known limitations — nested YAML (pin until
js-yaml lands)`. Le remplacement DOIT transformer ces tests en assertions
positives d'analyse d'imbrication :

```ts
it('analyse un tableau d'enregistrements', () => {
  const yaml =
    'mcpServers:\n  - filesystem:\n      type: stdio\n      command: node';
  expect(parse(yaml)).toEqual({
    mcpServers: [{ filesystem: { type: 'stdio', command: 'node' } }],
  });
});

it('analyse un enregistrement d'enregistrements', () => {
  const yaml = 'hooks:\n  PreToolUse:\n    - matcher: Read';
  expect(parse(yaml)).toEqual({
    hooks: { PreToolUse: [{ matcher: 'Read' }] },
  });
});
```

Ces deux assertions, ainsi que les trois maquettes ci-dessus, constituent le
**sas d'acceptation** pour la Phase 2 du plan d'implémentation. Tout le reste
(cas limites d'échappement, booléens entre guillemets vs sans guillemets,
chaînes numériques) relève de la couverture de régression de la suite de tests
existante et doit passer sans modification.

### Vérification de la parité aller-retour

Le test existant `should maintain round-trip integrity for escaped strings`
(lignes 111-129) exerce 7 chaînes via `stringify → parse`. `yaml`'s
`stringify` par défaut produit une sortie légèrement différente du formateur
artisanal (guillemets plus agressifs dans certains cas, séquences d'échappement
différentes). Deux résultats acceptables :

1. **Ajuster les maquettes de test** pour affirmer le comportement sous le
   nouvel analyseur — la propriété d'aller-retour (`parse(stringify(x)) === x`)
   est ce qui importe, pas une sortie YAML octet pour octet.
2. **Laisser les assertions octet pour octet** et les laisser échouer
   visiblement, puis les mettre à jour pour refléter la sortie textuelle de
   `yaml`. Plus facile à relire en diff.

Recommandation : **option 1** — transformer les assertions en assertions
basées sur la propriété (`expect(parse(stringify(obj))).toEqual(obj)`) car
une sortie YAML identique octet pour octet n'est pas un contrat documenté du
module.

### Changements cassants pour les appelants — aucun attendu, mais à vérifier

- `subagent-manager.ts` resérialise l'objet analysé en YAML pour le
  chemin `saveSubagent`. Avec le nouvel analyseur, `mcpServers` et `hooks`
  feront proprement l'aller-retour. Mettez à jour `NESTED_FIELDS_NOT_ROUND_TRIPPABLE` dans
  `claude-converter.ts` (Phase 3 de l'implémentation) pour supprimer ces
  deux noms de champs.
- `skill-manager.ts` importe déjà `yaml` directement (séparément de
  l'analyseur artisanal). Une fois que `yaml-parser.ts` utilise aussi `yaml`,
  l'import dupliqué peut être supprimé comme une petite tâche ultérieure —
  hors scope ici.

### Risque de migration

Faible. Les 5 appelants déstructurent tous un `Record<string, unknown>` —
même type de retour. Les 2 tests d'ancrage « garbles » délibérés sont les
seules défaillances attendues ; elles sont connues et nous les transformons
volontairement. Une couverture de régression plus large provient des suites
de tests existantes dans `packages/core/src/subagents/`,
`packages/core/src/skills/`, et `packages/core/src/extension/`.

## Questions ouvertes

| #   | Question                                                                                                                                                                                                        | Bloquant ?                                                           | Chemin de résolution                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Est-ce que `yaml.parse` a besoin d'un enregistreur explicite pour rediriger `YAMLWarning` (ex. `Unresolved tag`) vers le logger de qwen-code au lieu de `process.emitWarning` ?                               | Non — différé                                                        | Si les logs deviennent bruyants en CI, brancher `{ logLevel: 'silent' }` ou un callback `onWarning` personnalisé. Pas critique pour la v1.                                                      |
| Q2  | `parse()` doit-elle continuer à retourner `{}` pour une chaîne vide / un document YAML nul, ou lever une exception ?                                                                                          | Non — conserver le comportement actuel                               | L'analyseur artisanal actuel retourne `{}` ; on garde cela. Ajouter un test de régression qui verrouille ce choix.                                                                               |
| Q3  | Lorsque `mcpServers` est malformé au niveau supérieur (ex. `mcpServers: "string"`), faut-il que tout l'agent échoue au chargement, ou qu'il charge en ignorant ce champ ?                                     | Oui — motive la posture « avertir et ignorer » dans la Phase 3      | **Résolution** : ignorer le champ, émettre un avertissement dans la console (parité avec CC `DL7` selon la Phase 3 de `docs/declarative-agents-port.md`).                                       |
| Q4  | Même question que Q3 mais pour `hooks` : ignorer le champ, l'événement, ou seulement le matcher individuel ?                                                                                                   | Oui — motive la posture « avertir et ignorer »                      | **Résolution** : ignorer tout le champ `hooks` en cas d'échec de forme au niveau supérieur. La granularité par événement / matcher est reportée à une future PR si un utilisateur réel exprime un besoin. |
| Q5  | Est-ce que le raccourci `Bun.YAML.parse` de l'utilitaire CC s'applique à qwen-code ?                                                                                                                           | Non                                                                  | qwen-code ne cible pas le runtime Bun. Ignorer.                                                                                                                                                |

---

**Statut** : recherche terminée, prête à implémenter la Phase 2 (remplacer
`yaml-parser.ts`) et la Phase 3 (refaire surface de `mcpServers` + `hooks` sur
`SubagentConfig`) selon `docs/declarative-agents-port.md`.