# Cross-Session-Protokoll

Diese Seite ist der Vertrag für ein Programm, das an Cross-Session-Messaging teilnehmen möchte, ohne eine Qwen-Code-Session zu sein: ein Voice-Frontend, ein Relay-Daemon, ein Skript, das einen Build beobachtet. Sie beschreibt, was eine Session in die Registry schreibt, was ihre Inbox aus einer Verbindung liest und was sie zurücksendet. Alles hier beschreibt, was der Code heute bei Schema-Version 1 und Frame-Version 1 tut; der letzte Abschnitt sagt, was sich ändern kann und woran man es erkennt.

Für ein Node-Programm implementiert `@qwen-code/sdk/peer` die beitretende Seite dieser Seite — den Datensatz, die Inbox, die Auth-Zeile, Frames und Receipts — mit nichts als Node, und seine Tests führen es gegen Qwen Codes eigene Implementierung in beide Richtungen aus. Es wendet keinen Teil von §6 auf seine eigene Inbox an: ein Programm, das Rate Limits, Holds oder ein Duplicate-Fenster benötigt, wendet diese selbst an. Verwende es, oder lies weiter, um dein eigenes zu schreiben.

Jeder Wert, der eine Prozessgrenze überschreitet, ist bei Ankunft nicht vertrauenswürdig und wird vom Leser validiert. Wo diese Seite sagt, dass ein Feld eine bestimmte Form „haben muss“, wird ein abweichender Wert verworfen, nie mit einem Fehler zurückgewiesen.

## 1. Die Session-Registry

Eine laufende Session veröffentlicht einen Datensatz:

```
$QWEN_HOME/sessions/<pid>.json            (Verzeichnis 0700, Datei 0600)
$QWEN_HOME/sessions/<pid>-<8 hex>.json    (ein Prozess, der mehrere Sessions hostet)
```

`$QWEN_HOME` ist standardmäßig `~/.qwen`. Der Dateiname ist nach der PID des Schreibers keyed — entweder die bloße PID oder die PID, ein Bindestrich und acht klein geschriebene Hex-Zeichen, die bei der Registrierung geprägt werden (siehe „Mehrere Datensätze von einem Prozess" unten). Ein Datensatz, dessen `pid`-Feld nicht mit dem PID-Präfix seines Dateinamens übereinstimmt — verglichen in kanonischer Dezimalform, sodass ein nullgepolsterter Name mit nichts übereinstimmt — wird ignoriert.

```json
{
  "schemaVersion": 1,
  "pid": 41337,
  "procStart": "a1b2c3d4-…-boot-uuid:8895124",
  "pidNs": 4026531836,
  "sessionId": "8e016be8-5b48-4c13-ad22-1f5326ae64ac",
  "cwd": "/home/me/project",
  "name": "project-3f",
  "startedAt": 1788959000000,
  "qwenVersion": "0.23.0",
  "kind": "tui",
  "ipcPath": "/run/user/1000/qwen-socks/41337.sock",
  "ipcToken": "c0ffee…64 hex…"
}
```

| Feld            | Bedeutung                                                                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | Immer `1`. Ein Leser überspringt einen Datensatz mit einer höheren Version und löscht ihn nie.                                                                                                                                                                                                                    |
| `pid`           | Die Prozess-ID des Schreibers. Muss der PID entsprechen, nach der der Dateiname benannt ist: der ganze Name für die bloße Form, die Ziffern vor dem `-<8 hex>`-Suffix für die geprägte.                                                                                                                                  |
| `procStart`     | `<boot id>:<process start ticks>` unter Linux (`/proc/sys/kernel/random/boot_id` und Feld 22 von `/proc/<pid>/stat`); `null` andernorts. Schützt vor PID-Wiederverwendung und vor Datensätzen, die auf einem anderen Rechner geschrieben wurden, der dieses Home-Verzeichnis teilt.                              |
| `pidNs`         | Inode-Nummer von `/proc/self/ns/pid` unter Linux; `null` andernorts. Ein Leser listet und bereinigt nur Datensätze aus seinem eigenen Namespace.                                                                                                                                                                  |
| `sessionId`     | Die ID der Session. `/clear` und `/resume` tauschen sie unter derselben PID aus, also den Datensatz vor jedem Senden erneut lesen.                                                                                                                                                                                |
| `cwd`           | Arbeitsverzeichnis bei der Registrierung.                                                                                                                                                                                                                                                                         |
| `name`          | Anzeigename. Abgeleitet aus dem cwd-Basisnamen (Unicode-Buchstaben, Zeichen, Ziffern, `.`, `_`, `-`; bis zu 32 Codepoints) plus `-` und den ersten beiden Hex-Zeichen von `sha256(sessionId)`, außer der Schreiber hat einen gewählt. Nicht eindeutig.                                                          |
| `startedAt`     | Epoch-Millisekunden. Neueste zuerst ist die Reihenfolge der Auflistung und das Tie-Break-Kriterium zwischen Zwillingen.                                                                                                                                                                                           |
| `qwenVersion`   | Freitext oder `null`.                                                                                                                                                                                                                                                                                             |
| `kind`          | Was sich registriert hat: `tui` (jemand an einem Terminal), `headless`, `serve`, `external`. Kleinbuchstaben-ASCII, Ziffern und Bindestriche, höchstens 16 Zeichen; alles andere wird beim Lesen verworfen. Fehlend bedeutet, dass der Schreiber älter als das Feld ist, was als `tui` gelesen wird. Ein Label für Auflistungen — nie eine Berechtigung; siehe unten.          |
| `ipcPath`       | Der Inbox-Socket, nur vorhanden solange er gebunden ist. Fehlend bedeutet auffindbar, aber nicht adressierbar.                                                                                                                                                                                                    |
| `ipcToken`      | 64 Hex-Zeichen. Was eine Verbindung zu `ipcPath` auf seiner Auth-Zeile präsentiert. Fehlend bedeutet, dass die Inbox keine verlangt (Datensätze von älteren Builds).                                                                                                                                             |

**Ein Datensatz ist ein Selbstbericht.** Jedes Feld darin wurde vom beschriebenen Prozess geschrieben, also sind `name`, `cwd` und `kind` Behauptungen, keine Fakten, auf die sich ein Leser verlassen kann. Nichts, was entscheidet, was ein Sender tun darf, liest sie — das wird durch das, was eine Verbindung präsentiert (§3), und durch die eigene Policy der empfangenden Session (§6) geregelt. Setze `kind`, damit eine Auflistung Sessions ehrlich gruppieren kann; erwarte nicht, dass dir das etwas bringt.

**Einen eigenen Datensatz schreiben.** Ein externer Prozess, der gefunden werden möchte — aufgelistet von `qwen sessions ps`, adressierbar von `send_message`, fähig Receipts zu empfangen — schreibt denselben Datensatz für sich selbst: seine eigene `pid`, `procStart` und `pidNs` auf dieselbe Weise berechnet, eine `sessionId`, die er selbst erzeugt (beliebige UUID), `kind: "external"`, einen `name` (eigener oder auf dieselbe Weise abgeleitet; er wird auf eine Zeile reduziert und bei der Anzeige begrenzt), sowie `ipcPath` + `ipcToken` für eine Inbox, die er selbst bindet (§2). Unter Linux ist `pidNs` erforderlich: jeder Leser vergleicht es mit seinem eigenen, sodass ein Datensatz ohne einen nie aufgelistet — und nie bereinigt — wird. `procStart` ist ebenfalls erforderlich, aus einem anderen Grund: ohne es fällt ein Leser auf einfache PID-Liveness zurück und kann eine recycelte PID nicht von dem Prozess unterscheiden, der den Datensatz geschrieben hat. Schreibe in eine Temp-Datei im selben Verzeichnis und `rename` über das Ziel; erstelle die Datei mit 0600; verweigere das Schreiben durch einen Symlink. Wenn `<pid>.json` bereits etwas enthält, von dem du nicht beweisen kannst, dass es von einem früheren Prozess mit deiner PID hinterlassen wurde — dieselbe `pidNs`, dieselbe Boot-ID, andere Start-Ticks — schreibe stattdessen `<pid>-<8 hex>.json`, anstatt es zu ersetzen: Leser akzeptieren beide Namen, und der Datensatz dort könnte zu einem lebenden Prozess in einem anderen Namespace oder auf einem anderen Rechner gehören. Entferne den Datensatz beim Beenden. Ein Datensatz, dessen Prozess nicht mehr existiert, wird von der nächsten Session bereinigt, die listet, aber nur wenn `procStart` beweist, dass die PID nicht lediglich wiederverwendet wurde. `PeerEndpoint.start()` in `@qwen-code/sdk/peer` erledigt all dies und entfernt den Datensatz wieder bei `close()`.

**Lesen.** Alles, was das Verzeichnis lesen kann, kann jeden Datensatz lesen, einschließlich Token: Eine Session entdecken zu können und sich bei ihr authentifizieren zu können, sind absichtlich dieselbe Fähigkeit. Gib `ipcToken` nirgends aus, wo ein Modell oder ein Log es sehen kann.

**Liveness.** Ein Datensatz ist live, wenn alle folgenden Bedingungen erfüllt sind: der Dateiname `<pid>.json` oder `<pid>-<8 hex>.json` ist und sein PID-Präfix `pid` entspricht; `pidNs` entspricht dem des Lesers; die Boot-ID in `procStart` entspricht der des Lesers (oder `procStart` ist `null`); und die PID ist lebendig mit denselben Start-Ticks. Ein live Datensatz mit einem `ipcPath` muss noch immer angewählt werden, bevor er als erreichbar angekündigt wird — eine Socket-Datei überlebt einen Crash.

**Refs.** Angezeigte Handles verwenden `ref = sha256(sessionId)[0:6]`. Zwei Sessions dürfen denselben `name` teilen; die Adressgrammatik, die ein Sender tippt, ist `name`, `name [ref]`, `[ref]` oder das bloße `ref`, und ein mehrdeutiger `name` ist ein Fehler statt einer Vermutung.

**Mehrere Datensätze von einem Prozess.** Jedes `qwen --acp`-Kind — vom Daemon erzeugt oder direkt von einem Editor oder einem anderen Client gesteuert — schreibt einen Datensatz pro Session, benannt als `<pid>-<8 hex>.json`, ab seiner ersten Session. Das Suffix wird bei der Registrierung geprägt und ändert sich nie; eine darunter ausgetauschte Session-ID ist ein Patch des Datensatzes, keine Umbenennung. Jeder von ihnen trägt denselben `ipcPath`, da der Prozess eine Inbox für alle seine Sessions bindet und sie durch die `toSessionId` auf jedem Frame unterscheidet — also **immer `toSessionId` mitsenden**: ein Frame ohne eine, der einen solchen Prozess erreicht, wird mit `misaddressed` beantwortet, da es keine einzelne Session gibt, die gemeint sein könnte. Liveness, Sweeping und die Namespace- und Boot-Guards lesen den Datensatz genau wie beim bloßen Namen; nur die PID/Dateiname-Übereinstimmungsprüfung unterscheidet sich, und nur indem `pid` mit den Ziffern vor dem Suffix verglichen wird statt mit dem ganzen Namen.

## 2. Der Inbox-Socket

Ein UNIX-Domain-Socket pro Session, am ersten der folgenden Pfade, der bindet:

1. `$XDG_RUNTIME_DIR/qwen-socks/<pid>.sock`
2. `$TMPDIR/qwen-socks-<16 hex>/<pid>.sock`
3. `/tmp/qwen-socks-<16 hex>/<pid>.sock`

Das Verzeichnis ist 0700 und der Socket 0600. Ein Pfad länger als 103 Byte wird übersprungen. Wenn der PID-basierte Name bereits von einem live Listener gehalten wird (zwei PID-Namespaces, die ein Runtime-Verzeichnis teilen), bindet die Session stattdessen `<pid>-<8 hex>.sock` daneben. Peers leiten einen Socket-Pfad nie ab; sie lesen `ipcPath` aus dem Datensatz.

Eine Verbindung transportiert Newline-getrenntes JSON, ein Objekt pro Zeile, UTF-8. Eine einzelne Zeile länger als 1 MiB (gemessen in UTF-16 Code Units) trennt die Verbindung. Eine Verbindung, die 30 Sekunden vergehen lässt, ohne eine parsebare Zeile abzuschließen, wird getrennt; Junk-Zeilen verlängern die Frist nicht. Der Listener akzeptiert höchstens 64 Verbindungen gleichzeitig.

Der erwartete Austausch ist eine Nachricht pro Verbindung: verbinden, die Auth-Zeile und den Frame in einem Schreibvorgang schreiben, half-close, warten bis der Peer schließt. Der Empfänger schreibt nie auf derselben Verbindung; was er zu sagen hat, kommt als separate Verbindung zu deinem eigenen `ipcPath` zurück.

## 3. Die Auth-Zeile

Wenn der Ziel-Datensatz ein `ipcToken` hat, muss die erste Zeile lauten:

```json
{ "msgV": 1, "type": "auth", "token": "<token>" }
```

Drei Arten von Token werden akzeptiert, und die Inbox merkt sich, welches sie gesehen hat:

| Präsentiert                                                                   | Die Inbox folgert               | Effekt                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| Das `ipcToken` aus dem Registry-Datensatz des Ziels                           | einen gewöhnlichen Peer         | unterliegt Policy und Mode-Parität (§6)                                           |
| `QWEN_CODE_MESSAGING_TOKEN` aus der eigenen Umgebung des Ziels                | einen Prozess, den die Session gestartet hat | wird unter der Paritäts-Voreinstellung zugestellt; `origin="own-process"`                       |
| Ein Controller-Token `qpc_<64 hex>`, erzeugt mit `qwen sessions controllers add` | ein Programm, dem der Benutzer vertraut      | wird unter der Paritäts-Voreinstellung zugestellt; `origin="controller"` mit dem Label des Grants |

Eine erste Zeile, die keine Auth-Zeile ist oder ein Token präsentiert, das auf keines der drei passt, trennt die Verbindung still. Wenn der Datensatz kein `ipcToken` hat, sende keine Auth-Zeile; eine ältere Inbox liest sie als unbekannten Frame-Typ und überspringt sie, daher ist es immer sicher, mit einer zu beginnen.

Nichts hier authentifiziert den _Sender_: Ein Token beweist, dass die Verbindung erlaubt ist, nicht wer sie geöffnet hat. `from`, `fromName`, `fromMode` und jedes Feld des Datensatzes sind Behauptungen.

Das ist auch das gesamte Vertrauensmodell. Ein Programm, von dem der Benutzer möchte, dass es seine Sessions antreibt, bekommt ein Controller-Token, von Hand erzeugt und nur diesem einen Programm gegeben; das ist der Unterschied zwischen einer Nachricht, die zugestellt wird, und einer, die auf Review wartet. `kind: "external"` oder ein vertraut aussehender `name` zu schreiben bringt nichts.

## 4. Der User-Frame

```json
{
  "msgV": 1,
  "msgId": "5f1d0c9e-3b2a-4e8f-9c7d-1a2b3c4d5e6f",
  "type": "user",
  "from": "/run/user/1000/qwen-socks/40011.sock",
  "replyToken": "<mein eigenes ipcToken>",
  "fromName": "project-3f",
  "fromMode": "prompting",
  "toSessionId": "8e016be8-…",
  "priority": "next",
  "message": { "role": "user", "content": "build finished, 0 failures" }
}
```

| Feld          | Regel                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `msgV`        | Zahl. Muss ≤ 1 sein; höhere werden verworfen.                                                                                                                                                                                                                          |
| `msgId`       | `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}`, und darf nicht kanonalisiert (Bindestriche entfernt, kleingeschrieben) zu `all` werden. Verwende eine frische UUID pro Nachricht: der Empfänger merkt sich IDs, die er entschieden hat, und wiederholt das alte Urteil für eine erneut gesendete. |
| `type`        | `"user"`.                                                                                                                                                                                                                                                               |
| `from`        | Dein `ipcPath`, falls vorhanden. Wohin Receipts gehen. Fehlend bedeutet keine Receipts.                                                                                                                                                                                 |
| `replyToken`  | Dein `ipcToken`, damit der Empfänger seine Receipts dir gegenüber authentifizieren kann.                                                                                                                                                                                |
| `fromName`    | Anzeigename; auf eine Zeile reduziert, höchstens 200 Zeichen.                                                                                                                                                                                                           |
| `fromMode`    | `"prompting"` (eine Person prüft jede Aktion) oder `"bypass"` (einige Aktionen werden ohne Prüfung angewendet). Fehlend bedeutet „behauptet nichts“, was zur Prüfung zurückgehalten wird (§6).                                                                          |
| `toSessionId` | Die `sessionId`, die du aus dem Datensatz gelesen hast. Ein Empfänger, der eine andere ID hält, antwortet mit `misaddressed`. Immer mitsenden.                                                                                                                          |
| `priority`    | `"now"` oder `"next"`; alles andere wird als `"next"` gelesen. Wird für einen zukünftigen Interrupt-Pfad mitgeführt; heute queue der Empfänger beide für den nächsten Turn.                                                                                             |
| `message`     | `role` muss `"user"` sein; `content` ein nicht-leerer String.                                                                                                                                                                                                           |

Unbekannte Felder werden ignoriert.

## 5. Der Delivery-Status-Frame

Der Empfänger berichtet, was aus einer Nachricht geworden ist, mit einem Control-Frame pro Ergebnis, gesendet an das `from` der Nachricht und authentifiziert mit ihrem `replyToken`:

```json
{
  "msgV": 1,
  "msgId": "<frische id>",
  "type": "control",
  "action": "delivery_status",
  "status": "held",
  "origMsgId": "5f1d0c9e-…",
  "from": "/run/user/1000/qwen-socks/41337.sock",
  "reason": "Your message is held for the recipient user to review …"
}
```

| `status`       | Wann                                                                                                                                                     | Was zu tun ist                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `held`         | Zurückgestellt zur Prüfung durch den Benutzer. Wird bei einem Retry wiederholt, und bei einem Release, das nicht gequeuet werden konnte.                  | Warten; eine Entscheidung oder ein Expiry folgt.                                    |
| `delivered`    | Für das Modell gequeuet.                                                                                                                                 | Nichts. Kein Beweis, dass es gelesen wurde.                                         |
| `denied`       | Eine Person hat es geprüft und abgelehnt.                                                                                                                | Nicht erneut senden.                                                                |
| `refused`      | Die Policy der Session weist Peer-Nachrichten ab; niemand hat sie gesehen. Immer nur das erste Receipt.                                                  | Stoppen; diesen Benutzer auf einem anderen Weg erreichen.                           |
| `expired`      | Eine zurückgehaltene Nachricht hat ihre Wartezeit überschritten, die Session wurde beendet ohne sie zu lesen, oder sie kam während des Herunterfahrens an. Kann auf `held` oder `delivered` folgen. | Später erneut senden, wenn es noch relevant ist.                                    |
| `misaddressed` | `toSessionId` stimmt nicht mit der Session an dieser Adresse überein.                                                                                    | Registry erneut lesen.                                                              |
| `dropped`      | Die Inbox hat sie abgewiesen bevor irgendeine Policy lief (§6).                                                                                          | Als ungesendet behandeln. Nicht in einer Schleife wiederholen; Wichtiges in eine spätere Nachricht zusammenfassen. |

Ein `dropped`-Receipt trägt zwei weitere Felder. `dropReason` ist `rate-limited`, `duplicate` oder `queue-full`. `droppedMsgIds` listet bis zu 256 weitere IDs, die dasselbe Receipt entscheidet: ein Burst wird mit einem Receipt beantwortet statt mit einem pro Nachricht, sodass ein Sender jede verlorene Nachricht aus einem einzigen Frame in einen Terminalzustand überführt. Beide sind bei jedem anderen Status bedeutungslos und werden dort ignoriert.

`reason` ist Freitext für einen Menschen. Die Reihenfolge der Receipts ist über Verbindungen hinweg nicht garantiert; wende sie als Zustandsübergänge an:

```
pending   → held | delivered | denied | refused | expired | misaddressed | dropped
held      → delivered | denied | expired | misaddressed
delivered → expired | misaddressed
```

Alles andere ist ein Duplikat und sollte ignoriert werden. Ein Receipt für eine ID, die du nie gesendet hast, ist Rauschen; ignoriere es. Receipts sind best-effort auf Seiten des Empfängers: ein volles Outbound-Limit oder ein totes `from` verliert sie still, sodass ein Sender damit umgehen muss, nie eine Antwort zu erhalten.

Deine eigene Inbox empfängt diese Frames von den Sessions, die du benachrichtigt hast. Wenn du nur sendest, binde trotzdem eine Inbox und gib `from` an: ohne eine bist du blind für jedes der obigen Ergebnisse.

## 6. Was der Empfänger mit einer Nachricht tut

In Reihenfolge:

1. **Admission.** Pro Sender: ein Burst von 30, dann eine Nachricht alle zwei Sekunden. Alle Sender zusammen: ein Burst von 32, dann eine pro Sekunde — ein Sender benennt sich selbst auf dem Frame, daher bringt ein Rotieren dieses Namens eine frische Erlaubnis vom ersten Limit, aber nicht vom zweiten. Derselbe Body von einer anderen Session innerhalb von 30 Sekunden ist ein `duplicate`; ein Prozess, den die Session gestartet hat, und ein vertrauenswürdiger Controller sind von dieser Prüfung ausgenommen, und werden wie alle anderen rate-limitiert. Eine verworfene Nachricht wird nie zurückgehalten, nie zugestellt und hinterlässt keine Aufzeichnung, sodass ein Sender, der seinen Burst abwartet und erneut versucht, immer noch ankommt.
2. **Settled IDs.** Eine `msgId`, die das Gate bereits entschieden hat, wiederholt ihr früheres Urteil.
3. **Policy.** `agents.crossSessionInbound` auf `accept`, `hold` oder `refuse` gesetzt gewinnt. Nicht gesetzt: ein Prozess, den die Session gestartet hat, oder ein vertrauenswürdiger Controller wird akzeptiert; andernfalls wird eine Nachricht nur akzeptiert, wenn `fromMode` dieselbe Review-Klasse benennt, in der sich der Empfänger befindet, und in jedem anderen Fall zurückgehalten, einschließlich wenn `fromMode` fehlt.
4. **Hold.** Bis zu 50 Nachrichten warten. Eine Nachricht, die an einem vollen Puffer ankommt, wird mit `queue-full` `dropped` statt eine bereits parkende zu verdrängen. Eine zurückgehaltene Nachricht läuft nach `agents.crossSessionHeldExpiry` ab (`1m`, `5m`, `10m`, `never`; Standard `5m`). Der Benutzer gibt frei oder lehnt ab von `/peers`; ein Mode-Wechsel evaluiert den Rückstau neu.
5. **Queue.** Eine akzeptierte Nachricht tritt in die Input-Queue der Session ein, die höchstens 50 von Peers fasst. Eine volle Queue wird ebenfalls mit `queue-full` `dropped`.

Ein Sender muss die Limits nicht auf die harte Tour herausfinden: eine Qwen-Code-Session spiegelt sie pro Adresse und verweigert ihr eigenes Senden vor dem Schreiben, wobei sie ihrem Modell sagt, es soll stattdessen batchen.

Das Modell sieht eine zugestellte Nachricht als:

```
<cross_session_message from="/run/user/1000/qwen-socks/40011.sock" name="project-3f">
build finished, 0 failures
</cross_session_message>
```

gefolgt von einem Hinweis, der die Autorität des Senders angibt. `origin="own-process"` oder `origin="controller" controller="<label>"` wird vom Empfänger aus dem, was die Verbindung präsentiert hat, hinzugefügt, nie aus dem Frame; das Label eines Controllers kommt vom Grant, den der Benutzer erzeugt hat, nicht von `fromName`. Tags, die wie der Envelope aussehen, werden in `content` entschärft.

## 7. Kompatibilität

- Ein Leser ignoriert Felder, die er nicht kennt. Ein Feld zu einem Datensatz oder einem Frame hinzuzufügen ist kein Breaking Change.
- `schemaVersion` und `msgV` werden nur bei einer Änderung der Form bestehender Felder erhöht. Ein Leser verwirft einen Frame oder überspringt einen Datensatz mit einer Version über der, die er kennt, und löscht einen solchen Datensatz nie.
- Neue `status`-Werte können erscheinen; behandle einen unbekannten als „kein Übergang" und warte weiter. Dasselbe gilt für ein `kind`, das du nicht erkennst: zeige es, korrigiere es nicht.
- Konstanten, die sich ohne Vorankündigung ändern können: die Burst- und Rate-Zahlen, die Hold-Obergrenze und Expiry-Auswahlen, das 1-MiB-Zeilenlimit, die 30-Sekunden-Zeilenfrist, das 64-Verbindungs-Limit.

## 8. Noch nicht festgelegt

- **Name Yielding.** Zwei Sessions in einem Verzeichnis können denselben `name` registrieren; heute werden sie nur durch `ref` unterschieden. Eine Registrierung, die einem live Namen nachgibt, und ein Control-Frame, der Peers mitteilt, dass eine Session sich umbenannt hat, stehen beide noch aus.
- **Gleiche-Namen-Reporting.** `qwen sessions ps` und `list_agents` markieren Datensätze, die noch kollidieren, nicht.
- **Eingehende Nachrichten an ACP-gesteuerte Sessions.** Eine Session, die ein Programm über ACP steuert — vom Daemon erzeugt oder nicht — registriert sich und kann senden, beantwortet aber alles, was an sie gesendet wird, mit `refused`: ein Hold ist eine Frage an eine Person, und niemand beobachtet eine Hold-Liste in ihrem Namen. Wo eine zurückgehaltene Nachricht für diese Sessions auftauchen sollte — bei ihrem Client oder der eigenen API des Daemon — ist noch offen.
- **Sessions hinter einer Inbox sind ein einziger Sender für jeden Peer.** Ein Prozess, der mehrere Sessions hostet, sendet mit einer einzigen `from`-Adresse, sodass das Pro-Sender-Budget und das Duplicate-Fenster (§6) des Empfängers von allen Sessions dieses Prozesses gemeinsam genutzt werden: eine beschäftigte Geschwister-Session kann das Kontingent einer anderen aufbrauchen, und ein Body, der gerade an eine gesendet wurde, kann innerhalb des Fensters nicht an ihre Geschwister-Session wiederholt werden. Eine Pro-Session-Abrechnung müsste einem vom Frame behaupteten Feld vertrauen, was das Vertrauensmodell von §3 ausschließt.