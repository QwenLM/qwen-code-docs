# Sélection de grade de modèle des sous-agents

## Objectif

Permettre au modèle de choisir un grade de modèle défini par l'utilisateur
lors du lancement d'un sous-agent régulier, sans exposer les ID de modèle
spécifiques au fournisseur dans le schéma de l'outil Agent.

```json
{
  "agents": {
    "modelGrades": {
      "small": "fast",
      "high": "qwen-max"
    },
    "allowedGrades": ["small", "high"]
  }
}
```

L'outil Agent annonce `model: "small" | "high"` et résout le grade
sélectionné immédiatement après le chargement de la configuration du
sous-agent.

## Résolution

Le sélecteur de modèle effectif utilise cette priorité :

1. Le modèle explicite, non `inherit`, d'un agent non intégré
2. Un grade autorisé mappé par `agents.modelGrades`
3. Le paramètre de modèle intégré d'Explore
4. Le modèle parent hérité

Les grades inconnus ou non autorisés sont rejetés. Les forks rejettent le
paramètre car ils doivent hériter du modèle et du cache de prompt du parent.
Les coéquipiers d'équipe nommés le rejettent également car leur override de
modèle backend accepte des ID de modèle concrets plutôt que des sélecteurs de
grade.

Seuls les noms de grade configurés et autorisés sont inclus dans le schéma
dynamique de l'outil. Les sélecteurs de modèle concrets restent privés dans
les paramètres utilisateur.

## Vérification

- Schéma des paramètres et transfert de configuration du CLI vers le core
- Résolution de grade, filtrage par liste d'autorisation et priorité des
  agents personnalisés
- Schéma dynamique de l'outil Agent sans ID de modèle concrets
- Dispatch régulier au premier plan et en arrière-plan utilisant le modèle
  résolu
- Validation des forks
