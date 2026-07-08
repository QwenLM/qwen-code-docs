# Persistance des instantanés de l'historique des fichiers

## Résumé

Cette modification comble les lacunes de persistance A+C pour l'historique des fichiers de `/rewind` sans modifier le schéma JSONL persisté.

Les enregistrements `file_history_snapshot` restent des enregistrements système en ajout uniquement. La reprise reconstruit l'historique des fichiers en lisant tous les enregistrements d'instantanés dans l'historique linéaire et en dédoublonnant par `promptId` avec une sémantique de dernier gagnant. Cela signifie qu'un instantané mis à jour pour le même prompt peut être ajouté ultérieurement sans réécrire les anciens logs.

## Enregistrement des mises à jour d'instantanés

`makeSnapshot(promptId)` crée toujours l'instantané de limite de tour et l'appelant l'enregistre toujours explicitement. Le cas manquant du dernier tour est géré en ajoutant un callback d'enregistrement optionnel à `FileHistoryService`. Lorsque `trackEdit(filePath)` ajoute avec succès une nouvelle sauvegarde au dernier instantané, ou répare une entrée de sauvegarde en échec dans cet instantané, il invoque le callback avec l'instantané mis à jour.

Les appels dupliqués à `trackEdit` pour un fichier déjà capturé et sans échec ne déclenchent pas de nouvel enregistrement, car l'instantané n'a pas changé.

Les erreurs du callback d'enregistrement sont ignorées et journalisées. L'édition de fichiers doit rester en mode best-effort : la persistance de l'historique des fichiers ne doit pas faire échouer les outils d'édition ou d'écriture.

## Structure de persistance

Aucune version de schéma n'est ajoutée. Le payload existant a déjà suffisamment de structure pour une reconstruction rétrocompatible :

```json
{
  "type": "system",
  "subtype": "file_history_snapshot",
  "systemPayload": {
    "snapshots": []
  }
}
```

Les anciens logs sans ces enregistrements reprennent toujours sans état d'historique de fichiers. Les enregistrements d'instantanés malformés sont ignorés avec un avertissement, et les enregistrements valides suivants restent utilisables.

Aucun flag explicite `isSnapshotUpdate` n'est ajouté. L'ajout d'un autre enregistrement `file_history_snapshot` avec le même `promptId` a exactement le même comportement pratique, car `SessionService.loadSession()` applique déjà un dédoublonnement avec sémantique de dernier gagnant par `promptId`.

## Périmètre

Cela concerne uniquement A+C.

La couverture B1 simulée pour `sed -i` est laissée pour une PR séparée. Le suivi générique des modifications shell, la limitation de concurrence de `getDiffStats` et les raisons d'échec par fichier sont également reportés. Claude Code ne prend pas en charge ces comportements aujourd'hui, qwen-code ne doit donc pas les ajouter dans le cadre de cette mise en compatibilité.

Aucune migration n'est requise car la structure de l'enregistrement persisté est inchangée.