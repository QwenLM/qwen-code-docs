# Routage multimodal du tour complet

## Périmètre

Ceci implémente uniquement la phase 1 de #6988 : lorsque le modèle
principal est texte seul, un modèle de vision explicitement doté de la
capacité agent peut prendre en charge le tour complet porteur d'images.

Il n'ajoute ni état de routage persistant, ni récupération de session, ni
résumés visuels durables, ni références d'images stables, ni nettoyage des
médias historiques, ni réinspection ultérieure des images.

## Porte de capacité

Le routage sur tour complet exige à la fois la capacité image et la
capacité agent :

```json
{
  "id": "vision-agent",
  "capabilities": {
    "vision": true,
    "agent": true
  }
}
```

Une capacité `agent` manquante ou fausse conserve le comportement de
transcription Vision Bridge existant.

## Routage

- Si le modèle principal accepte les images, utilise le chemin existant du
  modèle principal.
- Si le modèle de vision sélectionné n'a pas la capacité agent, transcrit
  via Vision Bridge et répond sur le modèle principal.
- Si le modèle de vision sélectionné a la capacité agent, conserve les
  parties image originales et définit un sélecteur de modèle exact local au
  tour.
- Le provider, le modèle et l'endpoint exacts sont réutilisés pour les
  nouvelles tentatives du provider, l'exécution des outils, les
  continuations sur résultat d'outil et les continuations du Stop Hook ACP
  bloquant.
- L'exécution d'outils headless reçoit la même vue runtime que le modèle
  d'image sélectionné ; les drains de notifications en file d'attente et de
  cron restent des tours indépendants et n'en héritent pas.
- Les modèles fallback configurés sont désactivés pour ce tour. Un échec de
  résolution de la route exacte se solde par un fail closed (refus) au lieu
  d'envoyer les données image brutes au modèle principal.
- Le tour utilisateur indépendant suivant efface le sélecteur et revient au
  modèle principal. Chaque requête au modèle, y compris les requêtes
  latérales, ne reçoit que les modalités média prises en charge par sa
  cible exacte.

Le sélecteur de tour complet ajoute un marqueur NUL final à la
représentation `model\0baseUrl` existante. La couche de chat retire ce
marqueur avant la résolution du modèle. Cela conserve le comportement
existant des sélections de modèle ordinaires qualifiées par endpoint.

## Limites de contexte

La compression automatique du chat basée sur le LLM reste sur le chemin du
modèle principal. Une route sur tour complet saute cette compression, car
exécuter la compression du modèle principal pendant qu'un tour d'image est
détenu par un autre provider violerait la garantie de route exacte. La
microcompaction de l'historique local existante et l'allègement des
payloads d'image restent appliqués, et les copies de requête/cache ne
conservent que les modalités média prises en charge par leur modèle cible.
Une requête de tour complet trop volumineuse échoue donc sur le modèle
sélectionné.

## Points d'entrée

La phase 1 couvre la TUI interactive, ACP et la CLI non interactive.

Les chemins textuels `@` sont résolus vers leur cible canonique avant la
détection MIME, les vérifications de workspace, le filtrage d'ignore et les
lectures de fichiers. L'alias fourni par l'utilisateur et la cible
canonique doivent tous deux passer le filtrage d'ignore, afin qu'un lien
symbolique ne puisse pas déguiser un fichier ignoré ou une cible
non-image. Les liens physiques ne sont pas résolus par `realpath` et ne
sont pas couverts par cette vérification.
