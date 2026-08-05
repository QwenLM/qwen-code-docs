# Fork-Subagent `fork_turns`

## Zusammenfassung

Fügt der bestehenden Detached-`subagent_type: "fork"`-Runtime des
Agent-Tools einen optionalen `fork_turns`-Parameter hinzu. Ein Fork erbt
weiterhin die vollständige Parent-Konversation, wenn der Parameter
weggelassen wird. Caller können explizit verwenden:

- `all` für die vollständige Parent-Konversation, oder
- einen positiven Integer-String wie `"3"` für die letzten drei echten
  User-Turns.

Gewöhnliche Subagents und benannte Teammates akzeptieren `fork_turns` nicht
und starten weiterhin ohne Parent-Konversations-History.

## Ziele

- Das bestehende Voll-History-Verhalten für Fork-Aufrufe bewahren, die den
  Parameter weglassen.
- Callern erlauben, die geerbte History eines Forks zu begrenzen, ohne
  seinen System-Prompt, seine Tools, sein Modell, seinen
  Genehmigungsmodus, sein Arbeitsverzeichnis oder seinen
  Detached-Lebenszyklus zu ändern.
- Echte User-Turns statt roher API-Nachrichten zählen. Tool-Responses und
  reine System-Reminder verbrauchen die angeforderte Turn-Anzahl nicht.
- Die ausgewählte Fork-History von mutierbaren Parent-Nachrichtenteilen
  isoliert halten.

## Nicht-Ziele

- Kontextvererbung für gewöhnliche spezialisierte Subagents oder
  Agent-Team-Teammates hinzufügen.
- Einen Fork-Modus ohne History hinzufügen. Caller, die keinen
  Parent-Kontext wollen, sollten einen gewöhnlichen Subagent starten.
- Fork-Verfügbarkeit, Verschachtelungsregeln, Hintergrundausführung,
  Transkript-Recovery oder Wiederverwendung des Parent-System-Prompts und
  der Tool-Deklarationen ändern.

## Design

### Parameter und Validierung

`AgentParams.fork_turns` ist optional. Das JSON-Schema akzeptiert `all`
oder einen String, der `^[1-9][0-9]*$` matcht. Weglassen normalisiert zu
`all` und bewahrt das bestehende Fork-Verhalten.

Die Angabe von `fork_turns` mit einem Nicht-Fork-Subagent-Typ, ohne
expliziten Subagent-Typ oder beim Spawnen eines benannten Teammate wird
abgelehnt. `none`, Null, negative Zahlen, Dezimalzahlen, Werte mit
umgebendem Whitespace und Nicht-String-Werte werden abgelehnt.

### History-Auswahl

`all` verwendet dieselbe kuratierte Parent-History wie die bestehende
Fork-Runtime.

Für einen numerischen Wert entfernt der Parent-Chat seinen führenden
Startup-Kontext, bevor er die Konversations-History kuratiert. Dies
verhindert, dass die Kuratierung den Startup-Reminder mit dem ersten echten
User-Prompt zusammenführt. Der ursprüngliche Startup-Präfix wird dann vor
das ausgewählte Fenster gestellt, sodass der Fork den
Parent-Umgebungskontext behält.

Ein echter User-Turn ist eine User-Role-Nachricht, die anderen Content als
Funktions-Responses, leeren Text oder reine System-Reminder enthält. Der
ausgewählte Slice beginnt beim N-neuesten echten User-Turn und enthält die
darauffolgenden Modell-Nachrichten, Tool-Calls, Tool-Responses und
Reminder. Wenn weniger als N echte Turns existieren, werden alle
verfügbaren echten Turns ausgewählt.

Die Compaction-Zusammenfassung der History ist ein synthetischer Präfix und
ist in einem numerischen Fenster nicht enthalten; Caller sollten `all`
verwenden, wenn der Fork die Compaction-Zusammenfassung benötigt. Die
final ausgewählte History wird tief geklont, sodass Fork und Parent keine
mutierbaren verschachtelten Nachrichtenteile teilen.

Die bestehende Fork-Konstruktion repariert weiterhin die finale Grenze,
bevor sie die Direktive sendet. Sie verwirft eine unbeantwortete
User-Nachricht am Ende und schließt bei Bedarf einen offenen
Modell-Function-Call mit Platzhalter-Responses.

### Wiederbelebung im Hintergrund

Die ausgewählten initialen Nachrichten verwenden weiterhin den bestehenden
Fork-Bootstrap-Record. Die Transkript-Recovery belebt daher einen Fork mit
begrenzter History mit derselben ausgewählten History, derselben
System-Instruktion zum Launch-Zeitpunkt, denselben Tools und demselben
Task-Prompt wie seine ursprüngliche Ausführung wieder.

## Kompatibilität und Risiken

Bestehende Fork-Aufrufe bleiben Voll-History-Forks, weil Weglassen auf
`all` defaultet. Bestehende Aufrufe gewöhnlicher Subagents und Teammates
bleiben isoliert. Ein numerisches Fenster kann ältere Fakten oder
Compaction-Zusammenfassungen weglassen, daher muss die Direktive jeden
älteren Kontext wiederholen, den der Fork noch benötigt. Es verkürzt
außerdem den wiederverwendbaren Konversations-History-Cache-Präfix, während
Parent-System-Prompt, Tools und Startup-Kontext geteilt bleiben.
