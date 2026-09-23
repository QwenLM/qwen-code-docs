# Browser Use

Mit Browser Use kann Qwen Code mit Seiten in deinem Chrome-Browser arbeiten und
dabei deine vorhandenen Tabs und angemeldeten Sessions nutzen.

## Verwendung

Verwende macOS oder Linux mit Chrome 125 oder neuer und Qwen Code 0.24.2 oder neuer
(prüfe mit `qwen --version`). **Installiere die
[Qwen Code-Erweiterung aus dem Chrome Web Store](https://chromewebstore.google.com/detail/qwen-code/hdhmmjclhibojdddmancfgbkleahfaph)
in dem Chrome-Profil, das du verwenden möchtest.** Die Erweiterung ist erforderlich und wird nicht
vom Qwen Code-Paket installiert. Chrome hält sie nach der Installation automatisch aktuell.

**Verwende jeweils nur eine Kopie der Erweiterung pro Profil.** Wenn du sie zuvor
unpacked geladen hast, entferne oder deaktiviere diese Kopie in `chrome://extensions`, bevor du
die Store-Version verwendest. Wenn beide aktiviert sind, sieht Qwen zwei Browser für dasselbe Profil
und verbindet sich möglicherweise mit einem von beiden.

Wenn der Chrome Web Store meldet, dass die Erweiterung in deiner Region nicht verfügbar ist,
erstelle sie stattdessen aus dem Quellcode: Folge der
[README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme)
des Verzeichnisses `packages/chrome-extension` im Qwen Code-Repository, öffne dann
`chrome://extensions`, aktiviere den Entwicklermodus, wähle **Nicht paketiertes Element laden** und
wähle das erstellte Verzeichnis `dist/extension`.

Beschreibe deine Browser-Aufgabe direkt, zum Beispiel:

> Lies mein geöffnetes Dashboard und fasse die heutigen Bestellungen zusammen.

Qwen wählt bei Bedarf den Browser-Use-Skill aus. Die erste Browser-Aufgabe
registriert automatisch ein kleines lokales Verbindungsprogramm in deinem
Benutzerverzeichnis; spätere Aufgaben verwenden es wieder. Qwen bestätigt die
Verbindung mit der Erweiterung, bevor es Seiten bedient. Wenn keine Verbindung hergestellt werden kann, öffne Chrome und prüfe, dass Qwen Code
0.24.2 oder neuer ist und dass die Erweiterung im gewünschten Profil aktiviert ist, und
versuche es dann erneut. Wenn eine Laufzeitabhängigkeit
bei der ersten Verwendung konfiguriert werden muss, leitet Qwen dich an und fordert
dich gegebenenfalls zum Neustart auf.
Es wird keine separate Browser-Use-Qwen-Erweiterung und kein `qwen serve`-Prozess benötigt.

## Deaktivieren

Verwende `/skills`, um **browser-use** zu deaktivieren. Dadurch wird der Skill vor
dem Modell ausgeblendet, eine bestehende Browser-Session wird jedoch nicht getrennt
und bereits in einer Konversation geladene Anweisungen werden nicht entfernt.
