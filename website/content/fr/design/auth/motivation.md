# Motivation du registre des fournisseurs d'authentification

Le module d'authentification modélisait auparavant chaque chemin de configuration comme un flux séparé : clé API,
OAuth, plans d'abonnement et fournisseurs personnalisés. En pratique, tous ces chemins
produisent le même type de sortie : des mises à jour de la configuration du fournisseur de l'utilisateur dans
`~/.qwen/settings.json`.

Cette refactorisation fait de la configuration du fournisseur l'abstraction partagée. Un fournisseur décrit
comment il est affiché, comment les identifiants sont collectés, quels modèles il installe, et
quelle modification de paramètres doit être appliquée. Les clés API, OAuth, les plans de codage, les plans de tokens,
et les assistants personnalisés sont des méthodes de configuration pour un fournisseur, et non des architectures d'authentification
séparées.

## Objectifs

- Garder les flux orientés utilisateur dans `/auth` faciles à comprendre :
  - Alibaba ModelStudio pour la configuration Qwen propriétaire.
  - Fournisseurs tiers pour les intégrations intégrées courantes telles que DeepSeek,
    MiniMax et Z.AI.
  - Fournisseurs OAuth tels que OpenRouter.
  - Fournisseurs personnalisés pour les serveurs locaux, les proxies ou les fournisseurs qui ne sont pas intégrés
    en standard.
- Déplacer les données spécifiques au fournisseur dans de petites configurations déclaratives de fournisseur.
- Simplifier les contributions de fournisseurs tiers : ajouter un fournisseur courant
  devrait généralement signifier ajouter une configuration de fournisseur plus des tests.
- Centraliser les écritures de paramètres via `ProviderInstallPlan` et
  `applyProviderInstallPlan`.
- Garder le regroupement de l'interface utilisateur séparé du comportement d'installation. Les groupes aident les utilisateurs à naviguer
  dans `/auth` ; ils ne doivent pas piloter la logique des paramètres.
- Préserver un chemin pour la propriété de la liste des modèles et les métadonnées du fournisseur afin que
  les mises à jour des modèles du fournisseur puissent être détectées et appliquées en toute sécurité.

## Architecture

La nouvelle structure sépare les définitions des fournisseurs, la logique d'installation et l'état de l'interface utilisateur :

```text
packages/cli/src/auth/
├── allProviders.ts
├── providerConfig.ts
├── types.ts
├── install/
│   └── applyProviderInstallPlan.ts
└── providers/
    ├── alibaba/
    ├── custom/
    ├── oauth/
    └── thirdParty/
```

`ProviderConfig` est le contrat déclaratif pour les fournisseurs intégrés. Il contient
le libellé du fournisseur, le protocole, les options d'URL de base, la clé d'environnement, la liste des modèles,
les métadonnées des modèles, le regroupement dans l'interface utilisateur et le comportement de configuration.

`buildInstallPlan` convertit une configuration de fournisseur et des entrées de configuration collectées en un
`ProviderInstallPlan`. Le plan d'installation est le seul objet que le module d'écriture des paramètres
doit comprendre.

`applyProviderInstallPlan` applique ce plan en mettant à jour les paramètres d'environnement,
`modelProviders`, le type d'authentification sélectionné, la sélection facultative des modèles, et les métadonnées
du fournisseur. Cela maintient la persistance des paramètres indépendante du flux d'interface utilisateur qui a
collecté les entrées.

## Flux utilisateur

`/auth` peut toujours présenter différents points d'entrée, mais ils doivent tous converger vers
le même chemin d'installation du fournisseur :

1. **Alibaba ModelStudio**
   - Plan de codage
   - Plan de tokens
   - Clé API standard

2. **Fournisseurs tiers**
   - Fournisseurs courants avec des valeurs par défaut intégrées.
   - Chaque fournisseur doit posséder son URL de base, sa clé d'environnement, ses modèles par défaut et ses métadonnées
     de modèles.
   - Z.AI doit utiliser l'URL de base spécifique à la configuration :
     - Plan de codage : `https://api.z.ai/api/coding/paas/v4`
     - Clé API standard : `https://api.z.ai/api/paas/v4`

3. **OAuth**
   - Autorisation basée sur le navigateur pour les plateformes de routage telles que OpenRouter.
   - Les mécanismes spécifiques à OAuth peuvent résider dans l'implémentation du fournisseur, mais le
     résultat final doit toujours être un plan d'installation du fournisseur.

4. **Fournisseur personnalisé**
   - Configuration manuelle pour les serveurs locaux, les proxies ou les fournisseurs non pris en charge.
   - L'assistant collecte le protocole, l'URL de base, la clé API, les identifiants de modèles et les options
     avancées de modèles telles que le raisonnement, l'entrée multimodale, la fenêtre de contexte et le nombre maximum
     de tokens.

## Propriété et mises à jour des modèles

Les fournisseurs statiques intégrés peuvent conserver les métadonnées du fournisseur sous
`providerMetadata.<providerId>`, y compris la version de la liste des modèles et l'URL de base.
Cela permet à Qwen Code de détecter quand la liste des modèles intégrée d'un fournisseur change et
d'inviter l'utilisateur à mettre à jour les modèles possédés sans écraser les modèles personnalisés non liés.

Les fournisseurs personnalisés sont différents : leur liste de modèles est créée par l'utilisateur et ne doit pas
être traitée comme une liste de modèles intégrée pouvant être mise à jour automatiquement.

## Non-objectifs

- Ne pas faire de la clé API, OAuth, du plan de codage ou du plan de tokens l'architecture de paramètres
  de premier niveau.
- Ne pas coupler les écritures de paramètres aux composants React ou aux gestionnaires de commandes CLI.
- Ne pas faire des groupes d'interface utilisateur un axe de logique métier.
- Ne pas obliger les contributeurs à comprendre l'interface utilisateur d'authentification complète pour ajouter un
  fournisseur tiers simple.