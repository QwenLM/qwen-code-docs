# Garde-fous des prompts de sous-agents

## Motivation

L'outil Agent encourage actuellement une large délégation parallèle et indique que
la sortie des sous-agents doit généralement être fiable. Les prompts intégrés omettent aussi
quelques attentes d'exécution et de vérification, tandis que les prompts Explore et fork
contiennent des directives non sûres ou contradictoires.

## Conception

- Indiquer à l'agent parent de ne déléguer que du travail borné et indépendant, de garder
  localement le travail immédiat du chemin critique, d'éviter le travail dupliqué et de donner aux
  agents parallèles qui écrivent du code des portées d'écriture disjointes.
- Exiger que le parent relise les affirmations et les changements de code avant d'intégrer ou
  de relayer un résultat de sous-agent.
- Simplifier le prompt généraliste et ajouter les attentes de périmètre, de préservation,
  de vérification, d'incertitude et de rapport structuré.
- Réduire la surface d'outils avec état d'Explore en retirant les outils de tâche, de mémoire et de
  question utilisateur de son allowlist. Autoriser les pipelines shell tout en continuant
  à interdire les écritures dans son prompt.
- Ne plus exiger des agents fork qu'ils commitent les changements sauf si la directive demande
  explicitement un commit.

L'héritage de contexte et le comportement d'exécution en arrière-plan par défaut sont hors
du périmètre de ce changement.

## Vérification

Des tests unitaires ciblés assertent les directives au parent, le contenu des prompts intégrés,
l'allowlist d'outils d'Explore et la règle de rapport des forks. Le build du package core et
le typecheck fournissent la vérification plus large à la compilation.
