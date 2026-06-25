# Markdown-Rendering

Qwen Code rendert gängige Markdown-Strukturen direkt in der TUI, so dass Modellantworten leichter zu überfliegen sind, ohne das Terminal verlassen zu müssen. Der Renderer ist so konzipiert, dass die ursprüngliche Quelle erreichbar bleibt, insbesondere für visuelle Blöcke wie Mermaid-Diagramme und LaTeX-Mathematik.

## Render- und Raw-Modi

Standardmäßig wird Markdown im `render`-Modus angezeigt. Unterstützte Blöcke werden nach Möglichkeit als visuelle Vorschauen gerendert:

- Mermaid-Code-Blöcke (fenced)
- Markdown-Tabellen
- Aufgabenlisten
- Blockzitate
- Inline- und Block-LaTeX-Mathematik
- Code-Blöcke (fenced) mit Syntaxhervorhebung

Drücken Sie `Alt/Option+M`, um in der aktuellen Sitzung zwischen den Modi umzuschalten. Unter macOS muss das Terminal Option als Meta senden, damit diese Tastenkombination funktioniert; andernfalls wird Option+M als normale Texteingabe behandelt.

- `render`: Zeigt umfangreiche Terminalvorschauen für unterstütztes Markdown an.
- `raw`: Zeigt quellorientiertes Markdown für visuelle Blöcke wie Mermaid, Tabellen und LaTeX an.

Um Qwen Code standardmäßig im Raw-Modus zu starten, setzen Sie `ui.renderMode`:

```json
{
  "ui": {
    "renderMode": "raw"
  }
}
```

Akzeptierte Werte sind `"render"` und `"raw"`. Die Tastenkombination ändert nur die aktuelle Sitzungsansicht; sie überschreibt Ihre Einstellungsdatei nicht.

## Mermaid

Fenced `mermaid`-Code-Blöcke werden im `render`-Modus visuell gerendert. Die TUI verwendet eine gestufte Strategie:

1. Wenn aktiviert und unterstützt, bittet Qwen Code die Mermaid CLI (`mmdc`), das Diagramm als PNG zu rendern und sendet es an das Terminal-Bildprotokoll.
2. Wenn Terminalbilder nicht verfügbar sind, aber `chafa` installiert ist, kann dasselbe PNG in ANSI-Blockgrafiken konvertiert werden.
3. Ansonsten fällt Qwen Code auf eine Terminal-Drahtgittermansicht oder kompakte Textvorschau zurück.
4. Wenn ein Mermaid-Diagrammtyp nicht in der Vorschau angezeigt werden kann, zeigt Qwen Code die ursprüngliche fenced-Quelle an, anstatt sie hinter einem Platzhalter zu verstecken.

Das Mermaid-Bildrendering ist standardmäßig deaktiviert, da es externe Renderer und Terminal-Bildunterstützung erfordert. Aktivieren Sie es mit:

```bash
QWEN_CODE_MERMAID_IMAGE_RENDERING=1 qwen
```

Optionale Umgebungsvariablen:

| Variable                                    | Beschreibung                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `QWEN_CODE_MERMAID_IMAGE_RENDERING=1`       | Aktiviert das externe Mermaid-Bildrendering.                                         |
| `QWEN_CODE_DISABLE_MERMAID_IMAGES=1`        | Deaktiviert das Mermaid-Bildrendering, auch wenn es anderswo aktiviert ist.          |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=kitty`    | Erzwingt Kitty-Protokollausgabe. Nützlich für Terminals wie Kitty und Ghostty.       |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=iterm2`   | Fordert iTerm2-Inline-Bilder an. Interaktives TUI-Rendering fällt auf Text/ANSI zurück. |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=off`      | Deaktiviert Terminal-Bildprotokolle und erlaubt Text- oder `chafa`-Fallback.         |
| `QWEN_CODE_MERMAID_MMD_CLI=/path/to/mmdc`   | Verwendet eine bestimmte Mermaid CLI ausführbare Datei.                              |
| `QWEN_CODE_MERMAID_ALLOW_NPX=1`             | Erlaubt Qwen Code, `npx @mermaid-js/mermaid-cli` auszuführen, wenn `mmdc` nicht installiert ist. |
| `QWEN_CODE_MERMAID_ALLOW_LOCAL_RENDERERS=1` | Erlaubt projektspezifische Renderer-Binärdateien unter `node_modules/.bin`.          |
| `QWEN_CODE_MERMAID_RENDER_WIDTH=1200`       | Überschreibt die PNG-Renderbreite.                                                   |
| `QWEN_CODE_MERMAID_RENDER_TIMEOUT_MS=10000` | Überschreibt das externe Render-Timeout, maximal 60000 ms.                           |
| `QWEN_CODE_MERMAID_CELL_ASPECT_RATIO=0.5`   | Passt die Bildzeilenanpassung für die Geometrie der Terminal-Schriftzellen an.       |

Das erste Bildrendering kann langsam sein, insbesondere wenn `npx` die Mermaid CLI auflösen oder herunterladen muss. Während des Streamings zeigt Qwen Code eine begrenzte Textvorschau an und versucht das Bildrendering erst, nachdem die Modellantwort vollständig ist.

### Mermaid-Quelltext kopieren

Jeder gerenderte Mermaid-Block enthält einen Quellhinweis wie:

```text
Mermaid flowchart (TD) · source: /copy mermaid 1
```

Verwenden Sie diese Befehle, um den Mermaid-Quelltext aus der letzten KI-Antwort zu kopieren:

| Befehl                | Verhalten                                      |
| --------------------- | ---------------------------------------------- |
| `/copy mermaid`       | Kopiert den letzten Mermaid-Block.             |
| `/copy mermaid 1`     | Kopiert den ersten Mermaid-Block.              |
| `/copy code mermaid`   | Kopiert den letzten fenced `mermaid`-Code-Block. |
| `/copy code mermaid 1` | Kopiert den ersten fenced `mermaid`-Code-Block. |

`/copy code 1` zählt alle fenced Code-Blöcke, nicht nur Mermaid-Blöcke. Verwenden Sie `/copy mermaid N`, wenn Sie die Mermaid-spezifische Sequenz aus dem gerenderten Titel verwenden möchten.

## LaTeX-Mathematik

Qwen Code unterstützt grundlegendes Inline- und Block-LaTeX-Rendering im Terminal:

```markdown
Inline math: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

$$
\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6
$$
```
Der Renderer konzentriert sich auf gängige Symbole und lesbare Terminalausgabe. Es handelt sich nicht um eine vollständige TeX-Engine; komplexe Layouts wie Matrizen, alignierte Gleichungen und große verschachtelte Ausdrücke können vereinfacht werden.

Inline-Ausdrücke `$...$` sind absichtlich auf 1024 Zeichen pro Zeile begrenzt, sodass fehlerhaftes oder sehr großes generiertes Markdown die Terminaldarstellung nicht blockieren kann. Längere Formeln bleiben als Quelltext sichtbar und können weiterhin aus dem Raw-Modus oder der ursprünglichen Antwort kopiert werden.

### LaTeX-Quelltext kopieren

Verwenden Sie diese Befehle, um LaTeX-Quelltext aus der letzten KI-Antwort zu kopieren:

| Befehl                 | Verhalten                                        |
| ---------------------- | ------------------------------------------------ |
| `/copy latex`          | Kopiert den letzten Block-LaTeX-Ausdruck.        |
| `/copy latex 2`        | Kopiert den zweiten Block-Ausdruck.              |
| `/copy latex inline`   | Kopiert den letzten Inline-Ausdruck.             |
| `/copy latex inline 2` | Kopiert den zweiten Inline-Ausdruck.             |
| `/copy inline-latex 2` | Alias für `/copy latex inline 2`.               |

Inline-LaTeX zeigt keinen pro Ausdruck eingeblendeten Kopierhinweis im gerenderten Text, um den Lesefluss nicht zu stören. Wechseln Sie mit `Alt/Option+M` in den Raw-Modus, um Inline-Quelltext direkt zu prüfen; unter macOS erfordert dies die Option-als-Meta-Terminal-Eingabe.

## Allgemeines Kopieren von Code

Der Befehl `/copy code` liest Code-Blöcke aus der letzten KI-Markdown-Antwort:

| Befehl                   | Verhalten                                           |
| ------------------------- | --------------------------------------------------- |
| `/copy code`              | Kopiert den letzten Code-Block.                     |
| `/copy code 2`            | Kopiert den zweiten Code-Block.                     |
| `/copy code typescript`   | Kopiert den letzten `typescript`-Code-Block.        |
| `/copy code mermaid 1`    | Kopiert den ersten `mermaid`-Code-Block.            |

## Auswählen einer früheren KI-Nachricht

Standardmäßig zielt `/copy` auf die neueste KI-Nachricht ab. Stellen Sie dem Befehl eine positive ganze Zahl voran, um stattdessen aus der N-ten letzten KI-Nachricht zu kopieren – praktisch, wenn die letzte Antwort etwas wenig Gehaltvolles ist (z. B. ein TODO-Update) und die substanzielle Ausgabe ein oder zwei Durchgänge zurückliegt.

| Befehl                 | Verhalten                                                           |
| --------------------- | ------------------------------------------------------------------- |
| `/copy 2`             | Kopiert die vollständige vorletzte KI-Nachricht.                    |
| `/copy 3`             | Kopiert die vollständige drittletzte KI-Nachricht.                  |
| `/copy 2 code python` | Kopiert den letzten `python`-Code-Block aus der vorletzten Nachricht. |
| `/copy 3 latex`       | Kopiert den letzten LaTeX-Block aus der drittletzten Nachricht.     |

`/copy 1` ist gleichbedeutend mit `/copy`. Falls `N` die Anzahl der KI-Nachrichten in der Sitzung übersteigt, meldet `/copy` stattdessen die tatsächliche Anzahl, ohne etwas zu kopieren. Ohne eine führende ganze Zahl behalten Unterauswahlen wie `/copy code python 2` ihre bisherige Bedeutung (der zweite `python`-Block in der letzten Nachricht).

## Aktuelle Einschränkungen

- Die Mermaid-Bilddarstellung hängt von Mermaid CLI plus Bildunterstützung im Terminal ab.
- Die asynchrone iTerm2-Inline-Bildplatzierung ist in der TUI deaktiviert, da das Protokoll an die Cursorposition gebunden ist; verwenden Sie Kitty/Ghostty oder ANSI-Fallback für interaktive Bildvorschauen.
- Das Wireframe-Mermaid-Rendering ist eine lesbare Terminalvorschau, keine vollständige Mermaid-Layout-Engine.
- Der Raw-Modus ist global für gerenderte Markdown-Blöcke; er ist kein pro Block umschaltbarer Modus.
- Die LaTeX-Darstellung deckt gängige Symbole und Ausdrücke ab, nicht das vollständige TeX-Layout.
- Quelltext-Kopierbefehle zielen standardmäßig auf die letzte KI-Antwort ab, oder auf die N-te letzte, wenn sie als `/copy N ...` aufgerufen werden.
