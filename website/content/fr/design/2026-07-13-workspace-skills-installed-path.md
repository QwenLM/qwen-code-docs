# Chemins d'installation des skills de workspace

Date : 2026-07-13

## Contrat

Chaque skill renvoyé par `GET /workspace/skills` et
`GET /workspaces/:workspace/skills` inclut `installedPath`, le champ absolu existant
`SkillConfig.filePath` qui pointe vers son fichier `SKILL.md`. La valeur est
copiée telle que stockée ; la couche de statut ne résout pas les liens symboliques et ne la canonise
pas à nouveau.

## Compatibilité

Il s'agit d'un champ v1 additif. Le démon actuel l'émet toujours, tandis que le bridge ACP
et les types de statut publics du SDK TypeScript le gardent optionnel afin que les clients restent
compatibles avec les anciens démons. La version du protocole et la liste des capacités ne
changent pas.

## Flux de données

`SkillManager.listSkills()` fournit les enregistrements `SkillConfig`. La fonction partagée
`mapSkillConfigToStatus()` copie `filePath` vers `installedPath`. Le
snapshot ACP live et le fallback local au démon utilisent tous deux ce mapper, afin que les skills de projet,
d'utilisateur, bundlés, d'extension, d'extension inactive et désactivés aient la même
forme. Le service de statut du workspace relaie ce résultat partagé aux deux formes de
route.

## Frontière de dissimulation

Le mapper de statut reste une allowlist explicite de métadonnées. Il expose le
chemin de fichier d'installation mais pas le corps du skill, les hooks, `skillRoot`, ni aucune autre
configuration du skill. Cette modification n'ajoute aucun comportement UI.
