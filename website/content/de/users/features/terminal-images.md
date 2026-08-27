# Terminal-Bilder

Qwen Code kann Bildteile aus Assistant-Antworten und abgeschlossenen Tool-Ergebnissen
direktiv in der interaktiven Terminal-UI anzeigen. Dieser Anzeigepfad ist getrennt
vom Markdown-Rendering und verhält sich in den Markdown-Modi `render` und `raw`
gleich.

## Wo Bilder erscheinen

In Assistant-Antworten behalten Text und Bilder ihre ursprüngliche Reihenfolge. Tool-Zeilen
zeigen den Ergebnistext gefolgt von Bildern für erfolgreiche, fehlgeschlagene und
abgebrochene Ergebnisse.

Andere Ausgabeoberflächen, einschließlich Headless, ACP, Daemon/Web Shell und
IDE-Integrationen, rendern keine Bildteile. Die WeChat- (weixin), WeCom- und
DingTalk-Channels können agentenerzeugte Bilddateien weiterhin über ihren
`[IMAGE: ...]`-Marker-Flow zustellen; andere IM-Channels liefern derzeit keine
ausgehenden Bilder.

## Terminalunterstützung

| Umgebung                                                       | Bildanzeige                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Direktes Kitty- oder Ghostty-TTY, ohne tmux oder SSH           | Native Terminal-Bildplatzierung                                                         |
| Andere Terminals mit installiertem `chafa`                     | 256-Farben-ANSI-Vorschau, einschließlich in iTerm2, Warp, tmux und SSH-Sessions           |
| Kein kompatibler Renderer oder Screenreader-Modus (Inline-Bildteile) | Deterministischer Text wie `[image: 1024x768 png]` anstelle einer Terminal-Bildsequenz |

## Limits und Fallbacks

Inline-Pixel-Vorschauen erfordern derzeit gültige PNG-Daten innerhalb der
Anzeigegrenzen: 64 Megapixel insgesamt und höchstens 1.000.000 Pixel pro Seite. Andere Bildformate,
ungültige PNGs und Inline-PNGs, die diese Grenzen überschreiten, bleiben als
Textplatzhalter sichtbar.

Inline-Bild-Payloads, die größer als 8 MiB sind, werden nicht als Pixel gerendert. Die meisten
übergroßen Payloads werden verworfen, bevor sie in den TUI-Verlauf gelangen, während Payloads
knapp über dem Limit als Textplatzhalter verbleiben können, da die Zulassung auf der
codierten Größe basiert. Jede Assistant-Antwort oder Tool-Zeile zeigt höchstens vier Bilder
an und meldet den Rest mit einem Marker wie `[+2 more images]`.

## Sitzungsverlauf und Memory

Tool-Bildteile werden mit ihren Ergebnissen gespeichert und können nach der
Sitzungswiederherstellung rekonstruiert werden. Assistant-Bilder werden live gerendert, aber derzeit
nicht persistiert, sodass `--continue` und `--resume` den Assistant-Text ohne diese Bilder
wiederherstellen.

Um den Speicherverbrauch in langen oder bildlastigen Sitzungen zu begrenzen, kann die TUI ältere
angezeigte Bilder durch Marker wie `[Old assistant image content cleared]`
oder `[Old tool result content cleared]` ersetzen. Dies betrifft nur die Live-Ansicht. Tool-Bildteile
bleiben im Sitzungsdatensatz erhalten und erscheinen nach der Wiederherstellung erneut.
