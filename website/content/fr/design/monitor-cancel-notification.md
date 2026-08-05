# Notifications d'annulation explicite des monitors

## Problème

`task_stop` renvoie déjà un résultat d'outil synchrone confirmant qu'un
monitor a été annulé. Le registre des monitors émet aussi une notification
terminale `cancelled`, que les clients enregistrent comme un message de
notification utilisateur et soumettent comme un nouveau tour de modèle. Un
événement `running` mis en file d'attente juste avant l'annulation peut
provoquer le même tour superflu même si la notification terminale est
supprimée.

## Design

- Annuler silencieusement les monitors lorsque l'annulation provient de
  `task_stop` ; le résultat d'outil reste la confirmation visible pour
  l'utilisateur et le modèle.
- Conserver inchangé le comportement d'annulation par défaut du registre pour
  les autres appelants.
- Au moment du drain, rejeter les notifications `running` de monitor en file
  d'attente dont l'entrée du registre est désormais explicitement
  `cancelled`. Cette vérification s'applique à la file d'attente interactive,
  à la file d'attente stream-json persistante et à la file d'attente headless
  à usage unique.
- Continuer de livrer les notifications naturelles `completed` et `failed`,
  ainsi que les notifications terminales émises par les chemins d'annulation
  autres que `task_stop`.

ACP rejette déjà les notifications `running` de monitor, donc une annulation
explicite silencieuse est suffisante pour ce client.

Les notifications de monitor routées vers l'owner restent dans la file
d'attente d'entrée d'un agent plutôt que dans la conversation de
l'utilisateur. Elles sortent de ce correctif de notification de session ;
dans le chemin courant d'appel d'outil, tout événement en file d'attente est
livré aux côtés du résultat d'outil `task_stop` déjà requis au lieu de créer
un tour de session.

## Vérification

- `task_stop` annule et interrompt un monitor sans invoquer son callback de
  notification.
- Chaque client supprime un événement `running` en file d'attente après que
  le monitor est explicitement annulé.
- Les tests existants de notification terminale continuent de démontrer que
  la complétion et l'échec naturels sont livrés.
- Un run réel piloté par le modèle avec `monitor` puis `task_stop` ne produit
  aucun tour de notification de suivi.
