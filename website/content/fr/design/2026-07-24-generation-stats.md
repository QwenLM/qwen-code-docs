# Métriques de timing de génération dans `/stats`

> Un alignement GenAI ultérieur ajoute l'attribut de Span indépendant
> `gen_ai.response.time_to_first_chunk` à côté du `ttft_ms` privé existant.
> Le flux de données `ApiResponseEvent.ttft_ms` et la sémantique de
> première-sortie-visible-par-l'utilisateur de ce document restent inchangés ;
> `/stats` ne consomme pas l'attribut standard de premier chunk.

## Contexte

L'issue #4252 demande que `/stats` affiche le timing de génération séparément
du temps réel de session et de la latence API de bout en bout. Le timing bas
niveau existe déjà :

- `LoggingContentGenerator` mesure `ttftMs` de l'envoi de la requête jusqu'au
  premier chunk streamé visible par l'utilisateur.
- `endLLMRequestSpan` dérive `sampling_ms` et
  `output_tokens_per_second`.
- `ApiResponseEvent` transporte déjà la durée de la requête, le modèle, l'ID
  du prompt et le nombre de tokens de sortie dans `UiTelemetryService`.

Le chaînon manquant est de rendre la valeur TTFT existante disponible pour les
métriques de session sans contenu utilisées par `/stats`.

## Périmètre

Ce changement ajoute des métriques de génération live, à portée de session, à :

- l'onglet Session de `/stats` interactif ;
- la réponse texte non interactive de `/stats`.

Il n'ajoute pas de second timer, ne persiste pas le timing dans les fichiers
d'utilisation des tokens quotidiens/mensuels, ne modifie pas les exports et ne
modifie pas le schéma des stats du démon/Web Shell.

## Flux de données

```text
LoggingContentGenerator.loggingStreamWrapper
  -> ApiResponseEvent(ttft_ms)
  -> logApiResponse
  -> UiTelemetryService
  -> SessionMetrics.generation
  -> SessionContext
  -> /stats
```

`ttft_ms` est optionnel. Les réponses non streamées et les streams qui se
terminent sans contenu visible par l'utilisateur conservent le comportement
actuel et ne créent pas d'échantillon de génération.

## Métriques et sémantique

Pour chaque réponse streamée réussie avec TTFT :

- **TTFT** est la mesure `ttftMs` existante.
- **Le temps de génération** est `max(0, duration_ms - ttft_ms)`, mesuré du
  premier contenu streamé visible par l'utilisateur jusqu'à la complétion.
- **TPS** est `output_token_count / generation_time_seconds`. Il est
  indisponible quand le temps de génération est nul.

`SessionMetrics.generation` est créé paresseusement et contient :

- le modèle, le TTFT, le temps de génération et le nombre de tokens de sortie
  de la dernière requête terminée ;
- le nombre total de requêtes chronométrées et leur TTFT, plus le temps de
  génération et les tokens de sortie des requêtes éligibles au débit.

Le TTFT moyen de la session est la moyenne arithmétique sur les requêtes
chronométrées. Le TPS de session est un débit pondéré : le total des tokens de
sortie divisé par le temps de génération total. Les requêtes dont le temps de
génération est nul contribuent aux statistiques de TTFT mais à aucun des deux
côtés du calcul du TPS de session. Cela évite les divisions par zéro et la
surpondération des requêtes courtes.

Les prompts d'aide internes sont exclus des métriques de génération. Ils ne
sont pas enregistrés dans la transcription reprenable, et les inclure
surprendrait les utilisateurs et ferait diverger les valeurs des sessions live
et reprises. Les requêtes de la conversation principale et des sous-agents
restent incluses, conformément aux statistiques de modèle au niveau session
existantes.

## Compatibilité

- `ApiResponseEvent.ttft_ms` et `SessionMetrics.generation` sont additifs et
  optionnels.
- Les événements enregistrés et les appelants existants restent valides.
- Les enregistrements quotidiens/mensuels existants continuent de ne contenir
  que les données de tokens et de durée API, préservant la frontière de
  propriété documentée dans
  `issue-4479-token-usage-stats-coordination.md`.
- La logique de clonage/égalité du contexte de Session copie et compare
  l'objet de génération optionnel afin que le tableau de bord interactif se
  mette à jour à chaque requête chronométrée terminée.

## Validation

- Les tests du cœur prouvent l'agrégation, l'exclusion des prompts internes,
  la gestion de la génération nulle, l'isolation des sessions et le
  comportement de reset.
- Les tests de LoggingContentGenerator prouvent que le TTFT capturé atteint
  `ApiResponseEvent` et reste absent pour les streams non visibles.
- Les tests CLI prouvent la sortie non interactive et le rendu de l'onglet
  Session interactif.
- Les tests i18n couvrent chaque locale intégrée pour les nouveaux labels à
  haute visibilité.
