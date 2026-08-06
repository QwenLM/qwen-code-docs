# Computer Use

Qwen Code verfügt über eingebaute **Computer Use**-Tools, mit denen der Agent deinen Desktop steuern kann — Klicken, Tippen, Scrollen, Apps starten, Fensterinhalte lesen und Screenshots aufnehmen. Dies macht Qwen Code zu einem allgemeinen Desktop-Automationsagenten, nicht nur zu einem Coding-Assistenten, der auf das Terminal beschränkt ist.

Computer Use wird vom nativen Treiber [`cua-driver`](https://github.com/trycua/cua) angetrieben. Die Tools werden als Deferred (lazy-loaded) Built-ins unter dem Präfix `computer_use__` registriert, sodass sie nur dann Prompt-Space beanspruchen, wenn das Modell tatsächlich auf sie zugreift.

> [!warning]
>
> Computer Use gibt dem Agenten die Kontrolle über Maus, Tastatur und Fenster und lässt ihn den Bildschirminhalt lesen. Verwende es nur mit vertrauenswürdigen Prompts und, wo möglich, in einer sandboxed oder disposablen Umgebung. Die Aktionstools (click, type, drag usw.) durchlaufen den normalen [Genehmigungsfluss](./approval-mode.md); schreibgeschützte Tools wie das Auflisten von Fenstern können ohne Aufforderung ausgeführt werden.

## Aktivieren und deaktivieren

Computer Use ist **standardmäßig aktiviert**. Die `computer_use__*`-Tools werden beim Start automatisch registriert.

Um es vollständig zu deaktivieren — was auch verhindert, dass der native Treiber heruntergeladen oder gestartet wird — setze `tools.computerUse.enabled` auf `false` in deiner `settings.json`:

```jsonc
{
  "tools": {
    "computerUse": {
      "enabled": false,
    },
  },
}
```

Diese Einstellung erfordert einen Neustart, um wirksam zu werden.

## Erste Ausführung und der native Treiber

Wenn der Agent zum ersten Mal ein Computer Use-Tool aufruft, lädt Qwen Code ein gepinntes, signiertes `cua-driver`-Binary (~20 MB) nach `~/.qwen/computer-use/` herunter und startet es als lokalen Prozess. Vorgefertigte Binaries sind für macOS (Apple Silicon und Intel), Linux (x86_64) und Windows (x86_64) verfügbar.

### macOS-Berechtigungen

Unter macOS erfordert Desktop-Automation zwei Systemberechtigungen:

- **Accessibility** — zum Lesen von Fenster-/UI-Status und Synthetisieren von Eingaben
- **Screen Recording** — zum Aufnehmen von Screenshots

Bei der ersten Verwendung führt dich der Driver durch das Gewähren dieser Berechtigungen über die Standard-macOS-Systemdialoge. Der Agent kann den Berechtigungsstatus auch bei Bedarf prüfen (das `check_permissions`-Tool). Da macOS Berechtigungen dem _verantwortlichen_ Prozess zuordnet, müssen die Genehmigungen möglicherweise dem Terminal oder der IDE erteilt werden, die Qwen Code gestartet hat.

## Was der Agent tun kann

Die vollständige `cua-driver`-Tool-Oberfläche wird bereitgestellt. Highlights:

| Kategorie      | Tools (Auswahl)                                                                      |
| -------------- | ------------------------------------------------------------------------------------ |
| Maus           | `click`, `double_click`, `right_click`, `drag`, `move_cursor`, `scroll`              |
| Tastatur       | `type_text`, `press_key`, `hotkey`                                                   |
| Fenster / UI   | `list_windows`, `get_window_state`, `get_accessibility_tree`, `set_value`, `zoom`    |
| Apps           | `launch_app`, `list_apps`, `bring_to_front`, `kill_app`                              |
| Browser-Seiten | `page` (JavaScript ausführen, Text lesen, DOM abfragen, Elemente anklicken)          |
| Screenshots    | `get_window_state` (nimmt ein PNG auf), `page`                                       |
| Aufnahme       | `start_recording`, `stop_recording`, `replay_trajectory` (Session aufzeichnen/wiedergeben) |
| Sessions       | `start_session`, `end_session`, Agent-Cursor-Overlay-Steuerungen                     |

Element-adressierte Aktionen werden gegenüber rohen Pixelkoordinaten bevorzugt: `get_window_state` gibt ein Markdown-Rendering des Accessibility-Trees eines Fensters zurück, mit einem stabilen `element_index` für jedes aktionierbare Element, das die Input-Tools direkt ansteuern können.

Die Unterstützung ist auf macOS am vollständigsten; einige Tools sind plattformspezifisch (zum Beispiel ist `bring_to_front` nur unter Windows und `launch_app` zielt auf macOS-Apps ab).

## Konfiguration

Alle Computer Use-Einstellungen befinden sich unter `tools.computerUse` in der `settings.json`. Siehe die [Settings-Referenz](../configuration/settings.md) für die maßgebliche Liste.

| Einstellung                           | Typ     | Standard | Beschreibung                                                                                                                                                                                                                                                |
| ------------------------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.computerUse.enabled`           | boolean | `true`   | Die `computer_use__*`-Tools registrieren. Wenn `false`, wird der Treiber niemals heruntergeladen oder gestartet.                                                                                                                                              |
| `tools.computerUse.maxImageDimension` | number  | `-1`     | Pixel-Obergrenze der längsten Kante für Screenshots. `-1` behält den Standard des Treibers (1568); `0` deaktiviert die Skalierung (volle Auflösung); ein positiver Wert begrenzt die längste Kante. Niedrigere Obergrenzen reduzieren die Vision-Token-Kosten. Env-Override: `QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`. |
| `tools.computerUse.idleTimeoutMs`     | number  | `300000` | Millisekunden, die der Treiberprozess nach dem letzten `computer_use__*`-Aufruf am Leben gehalten wird (Standard 5 Minuten). `0` hält ihn am Laufen bis Qwen Code beendet wird.                                                                             |

Alle drei Einstellungen erfordern einen Neustart, um wirksam zu werden.

## Siehe auch

- [Approval Mode](./approval-mode.md) — wie Tool-Ausführungen gesteuert werden
- [Sandboxing](./sandbox.md) — Isolierung dessen, was Tools berühren können
- [Settings-Referenz](../configuration/settings.md) — das vollständige `tools.computerUse.*`-Schema
