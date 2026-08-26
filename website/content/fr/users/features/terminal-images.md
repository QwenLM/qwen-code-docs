---

# Images terminal

Qwen Code peut afficher les parties d'image des réponses de l'assistant et des résultats d'outils terminés directement dans l'interface terminal interactive. Ce chemin d'affichage est séparé du rendu Markdown et se comporte de la même manière en mode Markdown `render` et `raw`.

## Où les images apparaissent

Dans les réponses de l'assistant, le texte et les images conservent leur ordre d'origine. Les lignes d'outils affichent le texte du résultat suivi des images pour les résultats réussis, échoués et annulés.

Les autres surfaces de sortie, y compris headless, ACP, démon/Web Shell, et les intégrations IDE, n'affichent pas les parties d'image. Les canaux WeChat (weixin), WeCom et DingTalk peuvent toujours distribuer les fichiers image générés par l'agent via leur flux de marqueurs `[IMAGE: ...]` ; les autres canaux IM ne distribuent actuellement pas les images sortantes.

## Support terminal

| Environnement                                                        | Affichage des images                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| TTY Kitty ou Ghostty direct, sans tmux ni SSH                        | Placement natif d'images terminal                                                       |
| Autres terminaux avec `chafa` installé                               | Aperçu ANSI 256 couleurs, y compris dans les sessions iTerm2, Warp, tmux et SSH         |
| Rendu compatible absent, ou mode lecteur d'écran (parties d'image en ligne) | Texte déterministe tel que `[image: 1024x768 png]` au lieu d'une séquence d'images terminal |

## Limites et fallbacks

Les aperçus pixel en ligne nécessitent actuellement des données PNG valides dans les limites d'affichage : 64 mégapixels au total et au plus 1 000 000 pixels par côté. Les autres formats d'image, les PNG invalides et les PNG en ligne dépassant ces limites restent visibles sous forme de marqueurs de texte.

Les payloads d'image en ligne supérieurs à 8 MiB ne sont pas rendus en pixels. La plupart des payloads trop volumineux sont supprimés avant d'entrer dans l'historique TUI, tandis que les payloads légèrement au-dessus de la limite peuvent rester sous forme de marqueurs de texte car l'admission est basée sur la taille encodée. Chaque réponse de l'assistant ou ligne d'outil affiche au plus quatre images et signale le reste avec un marqueur tel que `[+2 more images]`.

## Historique de session et mémoire

Les parties d'image des outils sont sauvegardées avec leurs résultats et peuvent être reconstruites après la reprise de session. Les images de l'assistant s'affichent en direct mais ne sont pas actuellement persistées, donc `--continue` et `--resume` restaurent le texte de l'assistant sans ces images.

Pour limiter la mémoire dans les sessions longues ou chargées d'images, la TUI peut remplacer les images affichées plus anciennes par des marqueurs tels que `[Old assistant image content cleared]` ou `[Old tool result content cleared]`. Cela n'affecte que la vue en direct. Les parties d'image des outils restent dans l'enregistrement de session et réapparaissent après la reprise.
