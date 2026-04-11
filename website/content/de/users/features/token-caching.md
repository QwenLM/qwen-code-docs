# Token-Caching und Kostenoptimierung

Qwen Code optimiert API-Kosten automatisch durch Token-Caching, wenn die Authentifizierung über einen API-Key erfolgt. Diese Funktion speichert häufig genutzte Inhalte wie Systemanweisungen und den Gesprächsverlauf, um die Anzahl der bei nachfolgenden Anfragen verarbeiteten Tokens zu reduzieren.

## Deine Vorteile

- **Kostenreduzierung**: Weniger Tokens bedeuten niedrigere API-Kosten
- **Schnellere Antworten**: Gecachte Inhalte werden schneller abgerufen
- **Automatische Optimierung**: Keine Konfiguration erforderlich – die Funktion läuft im Hintergrund

## Token-Caching ist verfügbar für

- API-Key-Nutzer (Qwen API-Key, OpenAI-kompatible Anbieter)

## Überwachung der Einsparungen

Verwende den `/stats`-Befehl, um deine Einsparungen durch gecachte Tokens einzusehen:

- Wenn aktiv, zeigt die Statistik an, wie viele Tokens aus dem Cache bereitgestellt wurden
- Du siehst sowohl die absolute Anzahl als auch den Prozentsatz der gecachten Tokens
- Beispiel: „10.500 (90,4 %) der Input-Tokens wurden aus dem Cache bereitgestellt, wodurch die Kosten gesenkt werden.“

Diese Informationen werden nur angezeigt, wenn gecachte Tokens verwendet werden. Dies ist bei der Authentifizierung per API-Key der Fall, nicht jedoch bei der OAuth-Authentifizierung.

## Beispiel für die Statistik-Anzeige

![Qwen Code Stats Display](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

Das obige Bild zeigt ein Beispiel für die Ausgabe des `/stats`-Befehls und hebt die Informationen zu den Einsparungen durch gecachte Tokens hervor.