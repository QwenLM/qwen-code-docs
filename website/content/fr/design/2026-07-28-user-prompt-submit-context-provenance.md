# Provenance du contexte du hook UserPromptSubmit

Issue : https://github.com/QwenLM/qwen-code/issues/7940

## Problème

Les hooks `UserPromptSubmit` peuvent retourner `additionalContext`, que le
client ajoute à la requête sortante comme une part de texte nue. Parce que
`recordUserMessage` persiste la requête augmentée, le texte injecté atterrit
dans `message.parts` de l'enregistrement utilisateur, impossible à distinguer
du texte écrit par l'utilisateur.

Conséquences :

- **Reprise** : la projection UI concatène toutes les parts de texte, de sorte
  que les sessions reprises affichent le contexte injecté par le hook comme si
  l'utilisateur l'avait tapé.
- **Analyse hors ligne / consommateurs en aval** : la transcription JSONL ne
  peut pas séparer le texte utilisateur de l'injection ; les consommateurs ont
  recours à des heuristiques fragiles de retrait de marqueurs personnalisés.
- **Télémétrie & rappel d'auto-mémoire** : les deux consommaient
  `partToString(request)` après l'injection, polluant l'attribut de prompt et
  la requête de rappel.

La TUI live n'est pas affectée (elle construit son élément d'historique à
partir de l'entrée pré-hook), ce qui est exactement l'asymétrie qui rendait la
transcription polluée facile à manquer.

## Design

Isomorphe à deux motifs existants : le contexte de `SessionStart` est injecté
comme un bloc taggé dans l'instruction système, et les enregistrements de
milieu de tour/notification séparent le `message` à destination du modèle
d'une projection `systemPayload.displayText`.

### Chemin d'écriture

1. **Injection taggée** (`client.ts`) : le `additionalContext` assaini est
   ajouté comme sa propre part enveloppée dans
   `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>`.
   `getAdditionalContext()` échappe `<`/`>` dans la sortie du hook, de sorte
   que l'enveloppe ne peut pas être fermée ni falsifiée de l'intérieur. Le
   texte écrit par l'utilisateur n'est jamais réécrit ni échappé. `promptText`
   doit être déclaré avant l'assignation d'injection qui le capture dans
   `preInjectionPromptText` (évite une TDZ si le try/catch Goal environnant
   est réorganisé plus tard).
2. **Provenance d'affichage** (`chatRecordingService.ts`) :
   `recordUserMessage` accepte un `UserPromptRecordPayload { displayText? }`
   optionnel stocké comme `systemPayload`. `message` conserve le Content exact
   destiné au modèle — la reprise doit rejouer ce que le modèle a réellement
   vu — tandis que `displayText` préserve la projection utilisateur
   pré-injection. Le texte injecté par le hook reste dans l'entrée taggée de
   `message.parts` (parsable mécaniquement). Le payload n'est écrit que quand
   un hook a réellement injecté du contexte.
3. **Télémétrie & rappel** (`client.ts`) : `addUserPromptAttributes` et
   `MemoryManager.recall` utilisent le texte de prompt pré-injection quand une
   injection a eu lieu.

### Chemin de lecture (projection de reprise)

`resumeHistoryUtils` projette les enregistrements utilisateur simples via un
fallback à trois formes :

- (a) nouveaux enregistrements : préférer `systemPayload.displayText` ;
- (b) enregistrements à tag seul (sans payload) : retirer une part finale qui
  est, dans son intégralité, un bloc taggé — correspondance stricte de part
  entière uniquement, de sorte que la prose utilisateur qui contient simplement
  le tag n'est jamais retirée. Une part unique correspondant à la forme du tag
  est aussi conservée (l'injection ajoute toujours après la ou les parts de
  l'utilisateur, donc un enregistrement à une seule part ne peut être que de
  l'utilisateur) ;
- (c) enregistrements legacy à injection nue : concaténation inchangée.

La branche de reprise de la commande `@` préfère toujours
`AtCommandRecordPayload.userText` quand il est présent ; seul le fallback en
`userText` absent passe par `extractUserRecordDisplayText`, de sorte qu'une
part finale taggée ne remplace pas le texte d'affichage de la commande `@`.

## Notes de périmètre

- Concentré sur le chemin `UserPromptSubmit` interactif. Le chemin de session
  ACP enregistre déjà le texte de prompt pré-injection, il n'avait donc besoin
  que du même enveloppement par tag sur son injection destinée au modèle
  (inclus ici). L'injection de contexte des sous-agents (`SubagentStart` via
  `contextState`) nécessite sa propre investigation et constitue un suivi.
- Les autres consommateurs de transcription (desktop, web UI) peuvent adopter
  `displayText` dans des suivis ; en attendant, ils voient la forme taggée,
  qui est au moins identifiable mécaniquement.

Les consommateurs ACP/export/démon qui passent par `projectUserRecord` de
`transcript-replay` préfèrent aussi `displayText` et retirent une part finale
taggée pour les enregistrements utilisateur sans sous-type (le même fallback à
trois formes que le chemin de reprise TUI).
