# Workspace-scoped observed channel contacts

## Problem

Vom Daemon verwaltete Channel-Worker erhalten bei eingehenden Nachrichten
Plattform-User-, Gruppen- und Topic-Bezeichner, aber die Bezeichner sind
flüchtig. Authentifizierte Workspace-Clients benötigen eine Lese-API, die
kürzlich beobachtete IM-Kontakte auflistet, damit ein User ein vollständiges
Plattform-Zustellziel auswählen kann, ohne Bezeichner manuell zu suchen oder
erneut einzutippen.

## Umfang

Diese Änderung beobachtet akzeptierte eingehende Nachrichten, persistiert
einen begrenzten Beziehungsgraphen pro Daemon-Workspace und liefert
vollständige Plattform-Bezeichner für DingTalk-, Feishu-, Telegram- und
WeCom-Channels zurück.

Sie ändert weder die Webhook-Konfiguration noch die proaktive Zustellung,
fragt kein Plattform-Verzeichnis ab, behauptet nicht, vollständige
Gruppenmitgliedschaften zurückzugeben, beobachtet keine Bot-Ausgaben und
füllt keinen historischen Verkehr nach. Das eigenständige `qwen channel start`
bleibt unverändert.

## Ownership und Persistenz

Die Daemon-Workspace-Runtime besitzt die Registry:

```text
$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json
```

`QWEN_HOME` ist prozessweit, aber `<workspaceHash>` partitioniert die Daten
nach kanonischem Workspace-Pfad. Die Registry wird nicht im Workspace-Checkout
gespeichert und nicht als ein prozessweiter Graph geteilt. Ihr Verzeichnis
verwendet, wo unterstützt, den Modus `0700`; die atomare JSON-Datei verwendet
den Modus `0600`.

Die Registry speichert höchstens 500 Beziehungsbeobachtungen über alle
Channels und Konversationen im Workspace. Jede Beobachtung enthält
`channelName`, eine User-Identität, eine optionale Gruppen-Identität, eine
optionale Topic-Identität und `lastObservedAt`. Der Deduplizierungsschlüssel
ist `[channelName, user.id, group?.id, topic?.id]`. Eine laute Konversation
kann daher ältere Beobachtungen aus einer anderen Konversation verdrängen.
Beobachtungen, die älter als das maximale 365-Tage-Lesefenster sind, werden
beim nächsten akzeptierten Schreibvorgang entfernt.

## Beobachtungsgrenze

Die Aufzeichnung erfolgt, nachdem der gemeinsame Eingangs-Preflight eine echte
IM-Nachricht akzeptiert hat, und bevor die Befehls- oder Agent-Verarbeitung
beginnt. Direkt-/Gruppen-Policy, Mention-, Sender-Allowlist- und
Pairing-Ablehnung erfolgen daher vor der Persistenz.

Dasselbe `Envelope`-Objekt wird höchstens einmal aufgezeichnet. Eine spätere
Nachricht aktualisiert den Zeitstempel und die Labels der passenden Beziehung.
Die Persistenz ist best-effort: Ein bereinigter Fehler wird ohne Bezeichner
geloggt, und die Verarbeitung der akzeptierten Nachricht läuft weiter.

Die Registry speichert niemals Nachrichtentext, Nachrichten-Ids, Anhänge,
Payloads, Credentials, Webhook-Anfragen, proaktive Sends oder Bot-Ausgaben.

## Beziehungsmodell

```ts
interface ObservedChannelContactObservation {
  user: { id: string; label: string };
  group?: { id: string; label: string };
  topic?: { id: string; label: string };
}
```

- Eine Direktnachricht zeichnet einen Top-Level-User aus der vollständigen
  Plattform-`senderId` auf.
- Eine Gruppennachricht zeichnet die Gruppe aus der vollständigen
  Plattform-`chatId` und den beobachteten User innerhalb dieser Gruppe auf.
- Eine Gruppennachricht mit Thread zeichnet zusätzlich das Topic aus
  `threadId` und den beobachteten User innerhalb dieses Topics auf.
- Ein User, der nur in Gruppen gesehen wurde, erscheint nicht in den
  Top-Level-`users`. Wenn derselbe User auch eine Direktnachricht sendet,
  erscheint er sowohl auf der Top-Level-Ebene als auch unter den relevanten
  Gruppen.
- `groups[].users` und `groups[].topics[].users` bedeuten User, die in diesen
  Konversationen beobachtet wurden. Es sind keine autoritativen
  Plattform-Mitgliedschaftslisten.
- Sender-Labels verwenden den bereinigten Eingangs-Anzeigenamen, mit Fallback
  auf die vollständige User-Id. Gruppen-Labels verwenden einen bereinigten
  Namen, wenn das akzeptierte Eingangs-Envelope einen liefert; DingTalk mappt
  `conversationTitle` und Telegram mappt `chat.title`. Feishu- und
  WeCom-Gruppen-Labels sowie alle Topic-Labels fallen auf ihre vollständigen
  Ids zurück.

Feishu mappt `root_id` auf `threadId`; Telegram mappt `message_thread_id` auf
`threadId`. Aktuelle DingTalk- und WeCom-Envelopes liefern keinen stabilen
Topic-Bezeichner, daher enden ihre Beobachtungen auf Gruppenebene.

## Freshness

Personen, Konversationen und Beziehungen ändern sich. Die Lese-API filtert
Beobachtungen, statt die Registry als dauerhafte Wahrheit zu präsentieren:

- Standard-Freshness: sieben Tage;
- Caller-Override: `freshWithinSeconds`, von 1 Sekunde bis 365 Tage;
- Zeitstempel für User, Gruppen-User, Topic-User, Gruppen und Topics werden
  unabhängig aus den letzten Beobachtungen abgeleitet;
- Passive Beobachtung kann einen Austritt, eine Löschung oder Umbenennung, die
  keine neue Nachricht erzeugt, nicht sofort erkennen, daher verschwinden
  stale Beziehungen erst, wenn sie das angeforderte Fenster überschreiten.

## Lese-API

Primärer Workspace:

```http
GET /workspace/channel/observed-contacts?freshWithinSeconds=604800
Authorization: Bearer <daemon token>
```

Ausgewählter registrierter Workspace:

```http
GET /workspaces/:workspace/channel/observed-contacts?freshWithinSeconds=604800
Authorization: Bearer <daemon token>
```

Beispiel:

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": [
        {
          "label": "om_complete_root_id",
          "id": "om_complete_root_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z",
          "users": [
            {
              "label": "Example User",
              "id": "ou_complete_user_id",
              "lastObservedAt": "2026-07-17T08:05:00.000Z"
            }
          ]
        }
      ]
    }
  ]
}
```

Antworten verwenden `Cache-Control: no-store`. Die primäre Route liest nur die
Partition des primären Workspaces. Die qualifizierte Route erfordert eine exakt
registrierte, vertrauenswürdige Runtime und fällt niemals auf den primären
Workspace zurück, wenn der Workspace unbekannt, nicht vertrauenswürdig, im
Bootstrap, im Drain oder entfernt ist.

Eine fehlende Registry liefert einen leeren Graphen zurück. Fehlerhafte Daten
liefern eine bereinigte `500` mit dem Code
`channel_observed_contacts_unavailable` zurück. Lösche die
`observed-contacts.json`-Datei des Workspaces, um eine fehlerhafte oder nicht
unterstützte Registry zurückzusetzen; akzeptierter Verkehr erstellt sie neu.
Ungültige Freshness liefert `400 invalid_freshness` zurück.

Clients entdecken die Route über die Serve-Capability
`workspace_channel_observed_contacts`. Die Route ist read-only und wird nach
der Daemon-Bearer-Authentifizierung registriert.

## Kompatibilität

Webhook-Parsing, Anfragen, Zielauflösung und Zustellung sind identisch zu
`main`. Diese API stellt nur beobachtete Bezeichner bereit; Caller
entscheiden, wie sie verwendet werden. Die Registry beginnt bei Schema-Version
1, da der frühere Opaque-Reference-Prototyp nie veröffentlicht wurde.

## Teststrategie

- Die Base-Channel-Tests decken die Preflight-Grenze, Topic-Normalisierung,
  Envelope-Deduplizierung und nicht blockierende Persistenzfehler ab.
- Die Store-Tests decken Direkt-vs.-Gruppe-Semantik,
  Gruppen-/Topic-Beziehungen, Freshness, Aktualisierungen, Grenzen,
  Berechtigungen und fehlerhafte Daten ab.
- Die Routen-Tests decken vollständige Bezeichner, no-store-Antworten,
  Freshness-Validierung, exakte Workspace-Ownership und bereinigte Fehler ab.
- Die Server-Tests decken Bearer-Authentifizierung und
  Capability-Ankündigung ab.
- Webhook-Regressions-Tests verifizieren, dass kein Verhalten von `main`
  abweicht.
