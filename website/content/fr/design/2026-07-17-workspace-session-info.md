# Endpoint agrégé `session-info` de workspace

## Problème

`GET /workspace/:id/sessions` est paginé par curseur et ne renvoie pas de
total. `GET /daemon/status` expose uniquement le `sessionCount` live en
mémoire. Les workspaces avec beaucoup de sessions persistées (par exemple
issues de tâches planifiées) ne peuvent pas connaître la taille du store
local sans paginer toutes les sessions.

## Proposition

Ajouter :

```http
GET /workspace/:id/session-info
GET /workspaces/:workspace/session-info
```

Réponse (illustrative) :

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`live` est omis pour un workspace secondaire non fiable, car ces lectures de
catalogue ne doivent pas interroger le bridge live. Si le scan atteint sa
limite de sécurité ou ne peut pas classifier un fichier JSONL candidat, la
réponse inclut `"truncated": true` ; les comptes persistés sont alors des
bornes inférieures.

## Modèle de coût

Les comptes persistés réutilisent le schéma existant de scan complet du
répertoire déjà utilisé par la recherche de titres de session
(`SessionService.findSessionsByTitle` / `findSessionTitlesByPrefix`) :

1. `readdir` sur le répertoire des chats du projet (et son jumeau d'archive)
2. filtrer les `*.jsonl` UUID
3. plafonner à la même limite de sécurité de traitement de fichiers
4. lire uniquement le premier enregistrement JSONL pour l'appartenance au
   hachage du projet

Aucune hydratation de titre/prompt. C'est O(n) sur disque et **ne doit pas
être appelé en polling**. La réponse définit toujours `expensive: true` et
`cost: "disk_scan"` afin que les clients puissent échouer en fail closed sur
les chemins chauds. La documentation le signale explicitement.

La pagination par défaut des listes reste inchangée et ne calcule pas de
totaux. Ne réutilisez pas `listAllPersistedSummaries` des vues organisées
pour les comptes — ce chemin hydrate les métadonnées complètes de liste
jusqu'à 50 000 sessions.

## Capacité

`session_info` toujours actif sur `/capabilities`, à côté de `session_list`.

## Non-objectifs

- Compteurs en cache / comptabilisation par hook de mutation (suivi possible
  si les sites d'appel ont besoin d'une latence plus faible)
- Bourrer `total` dans chaque page de liste
- Totaux par groupe organisé ou filtrés par parent dans la v1
