# Browser Use

Mit Browser Use kann Qwen Code mit Seiten in deinem Chrome-Browser arbeiten und
dabei deine vorhandenen Tabs und angemeldeten Sessions nutzen.

## Verwendung

Verwende macOS oder Linux mit Chrome 125 oder neuer. **Installiere und aktiviere
die Qwen Chrome-Erweiterung in dem Chrome-Profil, das du verwenden möchtest.**
Die Erweiterung ist erforderlich und wird nicht vom Qwen Code-Paket installiert.
Es gibt noch keinen Eintrag im Chrome Web Store. Erstelle sie aus dem Verzeichnis
`packages/chrome-extension` des Qwen Code-Repositorys, indem du der
[README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme)
folgst. Öffne dann `chrome://extensions`, aktiviere den Entwicklermodus, wähle
**Nicht paketiertes Element laden** und wähle das erstellte Verzeichnis `dist/extension`.

Beschreibe deine Browser-Aufgabe direkt, zum Beispiel:

> Lies mein geöffnetes Dashboard und fasse die heutigen Bestellungen zusammen.

Qwen wählt bei Bedarf den Browser-Use-Skill aus. Wenn eine Laufzeitabhängigkeit
bei der ersten Verwendung konfiguriert werden muss, leitet Qwen dich an und fordert
dich gegebenenfalls zum Neustart auf.
Es wird keine separate Browser-Use-Qwen-Erweiterung und kein `qwen serve`-Prozess benötigt.

## Deaktivieren

Verwende `/skills`, um **browser-use** zu deaktivieren. Dadurch wird der Skill vor
dem Modell ausgeblendet, eine bestehende Browser-Session wird jedoch nicht getrennt
und bereits in einer Konversation geladene Anweisungen werden nicht entfernt.
