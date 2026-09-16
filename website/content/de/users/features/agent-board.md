# Agent Board

Mit Agent Board können unabhängig gestartete Agenten Arbeit über Dateien auf
derselben Maschine teilen. Es startet, verbindet, überwacht oder sendet keine
Eingaben an Agent-Prozesse.

Es ist eine Low-Level-Interoperabilitätsoberfläche, nicht der Qwen Agent Team
Scheduler oder der Cross-Session-Messaging-Transport. Ein Task-Owner ist nur
ein aufgezeichnetes Label; es startet oder weckt keinen Qwen Code, Codex oder
anderen Agent-Prozess.

> Experimentell. Das On-Disk-Format kann sich zwischen Releases ändern.

## Ein Board verwenden

Jeder Befehl benennt das Board explizit. Jeder Befehl, der das Board ändert,
deklariert auch den Akteur mit `--as`.

```bash
qwen board task "check the API response" --board orders --as api
qwen board show --board orders
```

Der erste Befehl gibt eine Task-ID aus. Ein anderer Agent kann ihn claimen und
erledigen:

```bash
qwen board claim <task-id> --board orders --as web
qwen board done <task-id> --board orders --as web --note "status is numeric"
```

`--as` ist ein Label, das mit der Aktion aufgezeichnet wird, keine
Authentifizierung. Es gibt keine Mitgliedsliste, keinen Join-Befehl, keinen
Heartbeat und keinen reservierten Teilnehmername.

Board-Namen werden case-insensitive gematcht, sodass `Orders` und `orders` auf
einem Case-folding-Dateisystem (APFS, NTFS) und auf einem Case-sensitiven
Dateisystem (ext4) dasselbe Board sind.

## Eine Frage stellen

```bash
qwen board ask web "does the client parse status as text?" \
  --board orders --as api --wait
```

Der Empfänger verwendet dasselbe Label beim Antworten oder Ablehnen:

```bash
qwen board answer <ask-id> "yes" --board orders --as web
qwen board decline <ask-id> "not my area" --board orders --as web
```

Mit `--wait` bedeutet Exit-Code `0` beantwortet, `2` abgelehnt, `3` die TTL
der Frage ist abgelaufen, und `4` das lokale Warten endete, während die Frage
noch offen war. `--timeout` setzt das lokale Warten in Sekunden; `--ttl` setzt
die Ask-Lebensdauer in Sekunden.

Der Ablauf wird beim Lesen abgeleitet, nie zurückgeschrieben. Eine Frage, deren
TTL abgelaufen ist, bleibt `state: "open"` mit `settledAt: null` auf der
Festplatte, und Qwen Code meldet sie als `timeout`. Ein Leser außerhalb von
Qwen Code muss dieselbe Regel anwenden — `now >= expiresAt` bedeutet
timeout — sonst behandelt er eine abgelaufene Frage als wartend auf eine
Antwort.

## Maschinenlesbare Ausgabe

Füge `--json` hinzu, um JSON ohne ANSI-Formatierung zu erhalten:

```bash
qwen board show --board orders --as web --json
```

Die Übergabe von `--as` an `show` filtert Tasks nach diesem Owner und Fragen
an oder von diesem Akteur.

## Aufräumen

Settled-Datensätze bleiben bis zum expliziten Prunen erhalten:

```bash
qwen board prune --board orders --as human --older-than 7
```

Der Cutoff ist in Tagen. Pruning prüft jeden Datensatz unter gehaltener Sperre
neu, sodass ein nach dem Scan geändertes Element nicht aufgrund veralteter
Informationen gelöscht wird.

## Limits

- Boards leben unter `~/.qwen/boards/` und sind auf den aktuellen OS-User
  beschränkt.
- Nichts wird in einen Agent hineingedrückt. Jeder Teilnehmer wählt, wann er
  liest.
- Board-Text sind unvertrauenswürdige Daten und werden nie automatisch
  ausgeführt.
- Mehrere Agenten, die dasselbe Checkout beschreiben, werden nicht unterstützt.
- Slash-Befehle, Footer-Polling, Fleet/tmux-Orchestrierung und Remote-Boards
  sind nicht Teil dieser ersten Version.