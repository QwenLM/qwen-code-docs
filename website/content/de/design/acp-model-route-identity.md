# ACP-Model-Route-Identität

## Problem

Qwen Code stellt ACP-Model-IDs aktuell als `modelId(authType)` bereit. Zwei konfigurierte Modelle mit derselben Model-ID und demselben Auth-Type, aber unterschiedlichen `baseUrl`-Werten, kollabieren daher zu einem ACP-Selector. Clients können die aktive Zeile nicht identifizieren und eine Auswahl nicht zum beabsichtigten Endpoint hin- und zurücksenden.

Core behandelt `(authType, modelId, configured baseUrl)` bereits als Registry-Identität. Der Verlust passiert nur, wenn diese Identität die ACP-Grenze überquert. Der konfigurierte Wert muss vom aufgelösten Endpoint getrennt bleiben, weil Provider-Defaults `baseUrl` nach der Registrierung auffüllen können.

## Design

ACP-Model-Optionen werden aus der bestehenden Configured-Model-Liste gebaut:

- `modelId(authType)` bleibt erhalten, wenn es eindeutig ist. Das bewahrt bestehende IDs für den Normalfall.
- Wenn mehrere Optionen diese ID teilen würden, wird jede durch einen deterministischen `qwen-route:v1:<digest>`-Selector ersetzt, der aus nicht geheimen Modell-Metadaten und der öffentlichen Endpoint-Identität abgeleitet wird (Credentials, Query und Fragment entfernt).
- Routen, die nach der Sanitisierung ununterscheidbar bleiben, werden abgelehnt, statt die Array-Reihenfolge zu nutzen, die nach einer Konfigurations-Neusortierung einen alten Selector neu mappen könnte.
- `ModelInfo.name` und Provider-Metadaten werden weiter für die Anzeige genutzt. Die Routen-ID ist ein opaker maschineller Selector.

Core stellt das ursprüngliche optionale Registry-`baseUrl` neben dem aufgelösten Display-Endpoint bereit. Derselbe Options-Builder liefert ACP-Session-Modelle, Konfigurationsoptionen, Live-Provider-Status und Daemon-Workspace-Provider-Status, sodass jeder Client dieselbe ID sieht, während der Server den exakten Registry-Diskriminator behält.

Bei `session/set_model` löst Qwen Code den Selector gegen die aktuelle Configured-Model-Liste auf, bevor gewechselt wird. Es übergibt das aufgelöste `baseUrl` an Core und persistiert dann nur die kanonischen Settings-Werte:

- `model.name`: tatsächliche Model-ID
- `model.baseUrl`: konfigurierter Registry-Endpoint oder ein leerer Tombstone für einen impliziten Default
- `security.auth.selectedType`: tatsächlicher Auth-Type

Der opake Selector wird nie in `settings.json` geschrieben.

## Kompatibilität

- Das ACP-Schema bleibt unverändert; `modelId` bleibt ein String.
- Eindeutige bestehende Model-IDs behalten die aktuelle Wire-Repräsentation.
- Legacy-`modelId(authType)`-Requests bleiben akzeptiert. Wenn eine solche ID mehrdeutig ist, bleibt das bestehende First-Match-Verhalten aus Kompatibilitätsgründen erhalten; neu bekanntgemachte Selectors sind exakt.
- Unbekannte oder veraltete opake Selectors werden abgelehnt, statt als literale Model-IDs behandelt zu werden.
- Generische ACP-Clients, einschließlich Zed, müssen nur den opaken Selector zurücksenden.
- CLI-TUI-Settings und Auswahlverhalten bleiben unverändert.

## Verifikation

- Doppelte Routen erhalten unterschiedliche, stabile Selectors, ohne ihre URLs zu leaken.
- Session-Model-State und Konfigurationsoptionen veröffentlichen dieselben Selectors und die exakte aktuelle Route.
- Die Auswahl der zweiten Route wechselt mit ihrem `baseUrl`, persistiert die kanonischen Settings und benachrichtigt Clients mit ihrem opaken Selector.
- Der Daemon-Provider-Status identifiziert die exakte aktuelle Route für Web Shell.
- Eindeutige und Legacy-Modellauswahlen funktionieren weiter.
