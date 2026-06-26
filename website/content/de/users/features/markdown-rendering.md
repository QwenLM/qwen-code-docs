# Markdown-Rendering

Qwen Code rendert gängige Markdown-Strukturen direkt in der TUI, sodass Modellantworten leichter zu überfliegen sind, ohne das Terminal verlassen zu müssen. Der Renderer ist darauf ausgelegt, die ursprüngliche Quelle erreichbar zu halten – insbesondere bei visuellen Blöcken wie Mermaid-Diagrammen und LaTeX-Mathematik.

## Render- und Raw-Modi

Standardmäßig wird Markdown im `render`-Modus angezeigt. Unterstützte Blöcke werden nach Möglichkeit als visuelle Vorschauen dargestellt:

- Mermaid-Fenced-Codeblöcke
- Markdown-Tabellen
- Aufgabenlisten
- Blockzitate
- Inline- und Block-LaTeX-Mathematik
- Fenced-Codeblöcke mit Syntax-Hervorhebung

Drücke `Alt/Option+M`, um in der aktuellen Sitzung zwischen den Modi umzuschalten. Unter macOS muss das Terminal Option als Meta senden, damit dieses Kürzel funktioniert; andernfalls wird Option+M als normale Texteingabe behandelt.

- `render`: zeigt umfangreiche Terminalvorschauen für unterstütztes Markdown.
- `raw`: zeigt quellorientiertes Markdown für visuelle Blöcke wie Mermaid, Tabellen und LaTeX.

Um Qwen Code standardmäßig im Raw-Modus zu starten, setze `ui.renderMode`:

```json
{
  "ui": {
    "renderMode": "raw"
  }
}
```

Akzeptierte Werte sind `"render"` und `"raw"`. Das Kürzel ändert nur die aktuelle Sitzungsansicht; es überschreibt nicht Deine Einstellungsdatei.

## Mermaid

Fenced-`mermaid`-Codeblöcke werden im `render`-Modus visuell dargestellt. Die TUI verwendet eine mehrschichtige Strategie:

1. Wenn aktiviert und unterstützt, bittet Qwen Code die Mermaid CLI (`mmdc`), das Diagramm als PNG zu rendern und sendet es an das Terminal-Bildprotokoll.
2. Falls Terminalbilder nicht verfügbar sind, aber `chafa` installiert ist, kann dasselbe PNG in ANSI-Blockgrafiken konvertiert werden.
3. Andernfalls greift Qwen Code auf eine Terminal-Drahtgitter- oder kompakte Textvorschau zurück.
4. Wenn ein Mermaid-Diagrammtyp nicht in der Vorschau angezeigt werden kann, zeigt Qwen Code die ursprüngliche Fenced-Quelle an, anstatt sie hinter einem Platzhalter zu verstecken.

Die Bilddarstellung von Mermaid ist standardmäßig deaktiviert, da sie externe Renderer und Terminalbildunterstützung erfordert. Aktiviere sie mit:

```bash
QWEN_CODE_MERMAID_IMAGE_RENDERING=1 qwen
```

Optionale Umgebungsvariablen:

| Variable                                    | Beschreibung                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `QWEN_CODE_MERMAID_IMAGE_RENDERING=1`       | Aktiviert das externe Mermaid-Bildrendering.                                         |
| `QWEN_CODE_DISABLE_MERMAID_IMAGES=1`        | Deaktiviert das Mermaid-Bildrendering, selbst wenn es anderweitig aktiviert ist.     |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=kitty`    | Erzwingt die Kitty-Protokollausgabe. Nützlich für Terminals wie Kitty und Ghostty.  |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=iterm2`   | Fordert iTerm2-Inlinebilder an. Die interaktive TUI-Darstellung fällt auf Text/ANSI zurück. |
| `QWEN_CODE_MERMAID_IMAGE_PROTOCOL=off`      | Deaktiviert Terminal-Bildprotokolle und erlaubt Text- oder `chafa`-Fallback.          |
| `QWEN_CODE_MERMAID_MMD_CLI=/pfad/zu/mmdc`   | Verwendet eine bestimmte Mermaid-CLI-ausführbare Datei.                               |
| `QWEN_CODE_MERMAID_ALLOW_NPX=1`             | Erlaubt Qwen Code, `npx @mermaid-js/mermaid-cli` auszuführen, wenn `mmdc` nicht installiert ist. |
| `QWEN_CODE_MERMAID_ALLOW_LOCAL_RENDERERS=1` | Erlaubt projekteigene Renderer-Binärdateien unter `node_modules/.bin`.                |
| `QWEN_CODE_MERMAID_RENDER_WIDTH=1200`       | Überschreibt die PNG-Renderbreite.                                                   |
| `QWEN_CODE_MERMAID_RENDER_TIMEOUT_MS=10000` | Überschreibt das Timeout für das externe Rendering, begrenzt auf 60000 ms.           |
| `QWEN_CODE_MERMAID_CELL_ASPECT_RATIO=0.5`   | Passt die Bildzeilenanpassung an die Geometrie der Terminal-Schriftzellen an.        |

Das erste Bildrendering kann langsam sein, insbesondere wenn `npx` die Mermaid CLI auflösen oder herunterladen muss. Während des Streamings zeigt Qwen Code eine begrenzte Textvorschau an und versucht das Bildrendering erst, nachdem die Modellantwort vollständig ist.

### Mermaid-Quelltext kopieren

Jeder gerenderte Mermaid-Block enthält einen Quellhinweis wie:

```text
Mermaid flowchart (TD) · source: /copy mermaid 1
```

Verwende diese Befehle, um Mermaid-Quelltext aus der letzten KI-Antwort zu kopieren:

| Befehl                    | Verhalten                                      |
| ------------------------- | ---------------------------------------------- |
| `/copy mermaid`           | Kopiert den letzten Mermaid-Block.             |
| `/copy mermaid 1`         | Kopiert den ersten Mermaid-Block.              |
| `/copy code mermaid`      | Kopiert den letzten Fenced-`mermaid`-Codeblock. |
| `/copy code mermaid 1`    | Kopiert den ersten Fenced-`mermaid`-Codeblock. |

`/copy code 1` zählt alle Fenced-Codeblöcke, nicht nur Mermaid-Blöcke. Verwende `/copy mermaid N`, wenn Du die Mermaid-spezifische Sequenz aus dem gerenderten Titel verwenden möchtest.

## LaTeX-Mathematik

Qwen Code unterstützt grundlegendes Inline- und Block-LaTeX-Rendering im Terminal:

```markdown
Inline-Mathe: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$

$$
\sum_{n=1}^{\infty} 1/n^2 = \pi^2/6
$$
```

Der Renderer konzentriert sich auf gängige Symbole und lesbare Terminalausgabe. Es ist keine vollständige TeX-Engine; komplexe Layouts wie Matrizen, ausgerichtete Gleichungen und große verschachtelte Ausdrücke können vereinfacht werden.

Inline-`$...$`-Ausdrücke sind absichtlich auf 1024 Zeichen pro Zeile begrenzt, damit fehlerhaftes oder sehr großes generiertes Markdown das Terminal-Rendering nicht blockieren kann. Längere Formeln bleiben als Quelltext sichtbar und können weiterhin aus dem Raw-Modus oder der ursprünglichen Antwort kopiert werden.

### LaTeX-Quelltext kopieren

Verwende diese Befehle, um LaTeX-Quelltext aus der letzten KI-Antwort zu kopieren:

| Befehl                     | Verhalten                                |
| -------------------------- | ---------------------------------------- |
| `/copy latex`              | Kopiert den letzten Block-LaTeX-Ausdruck. |
| `/copy latex 2`            | Kopiert den zweiten Block-Ausdruck.      |
| `/copy latex inline`       | Kopiert den letzten Inline-Ausdruck.     |
| `/copy latex inline 2`     | Kopiert den zweiten Inline-Ausdruck.     |
| `/copy inline-latex 2`     | Alias für `/copy latex inline 2`.        |

Inline-LaTeX zeigt keinen Kopierhinweis pro Ausdruck im gerenderten Text an, um den Fließtext nicht zu überladen. Wechsle mit `Alt/Option+M` in den Raw-Modus, wenn Du die Inline-Quelle direkt inspizieren möchtest; unter macOS erfordert dies, dass Option als Meta an das Terminal gesendet wird.

## Allgemeines Kopieren von Code

Der Befehl `/copy code` liest Fenced-Codeblöcke aus der letzten KI-Markdown-Antwort:

| Befehl                    | Verhalten                                 |
| ------------------------- | ----------------------------------------- |
| `/copy code`              | Kopiert den letzten Fenced-Codeblock.     |
| `/copy code 2`            | Kopiert den zweiten Fenced-Codeblock.     |
| `/copy code typescript`   | Kopiert den letzten `typescript`-Codeblock. |
| `/copy code mermaid 1`    | Kopiert den ersten `mermaid`-Codeblock.   |

## Auswählen einer früheren KI-Nachricht

Standardmäßig zielt `/copy` auf die neueste KI-Nachricht ab. Stelle dem Befehl eine positive ganze Zahl voran, um stattdessen aus der N-letzten KI-Nachricht zu kopieren – praktisch, wenn die letzte Antwort wenig Substanz hat (z. B. ein TODO-Update) und die aussagekräftige Ausgabe eine oder zwei Runden zurückliegt.

| Befehl                | Verhalten                                               |
| --------------------- | ------------------------------------------------------- |
| `/copy 2`             | Kopiert die vorletzte KI-Nachricht vollständig.         |
| `/copy 3`             | Kopiert die drittletzte KI-Nachricht vollständig.       |
| `/copy 2 code python` | Kopiert den letzten `python`-Codeblock aus der Vorletzten. |
| `/copy 3 latex`       | Kopiert den letzten LaTeX-Block aus der Drittletzten.   |

`/copy 1` ist gleichbedeutend mit `/copy`. Falls `N` die Anzahl der KI-Nachrichten in der Sitzung überschreitet, meldet `/copy` die tatsächliche Anzahl, anstatt etwas zu kopieren. Ohne eine vorangestellte ganze Zahl behalten Teilauswahlen wie `/copy code python 2` ihre bestehende Bedeutung (der 2. `python`-Block in der letzten Nachricht).

## Aktuelle Einschränkungen

- Das Rendern von Mermaid-Bildern hängt von der Mermaid CLI und der Terminalbildunterstützung ab.
- Die asynchrone Einbettung von iTerm2-Inlinebildern ist in der TUI deaktiviert, da das Protokoll an die Cursorposition gebunden ist; verwende Kitty/Ghostty oder den ANSI-Fallback für interaktive Bildvorschauen.
- Das Drahtgitter-Rendering von Mermaid ist eine lesbare Terminalvorschau, keine vollständige Mermaid-Layout-Engine.
- Der Raw-Modus gilt global für gerenderte Markdown-Blöcke; es ist kein Umschalter pro Block.
- Das LaTeX-Rendering deckt gängige Symbole und Ausdrücke ab, nicht das vollständige TeX-Layout.
- Befehle zum Kopieren von Quelltext zielen standardmäßig auf die letzte KI-Antwort oder die N-letzte, wenn sie als `/copy N ...` aufgerufen werden.