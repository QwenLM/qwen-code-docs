# Token-Caching und Kostenoptimierung

Qwen Code optimiert automatisch die API-Kosten durch Token-Caching, wenn die Authentifizierung mit einem API-Schlüssel verwendet wird. Diese Funktion speichert häufig verwendete Inhalte wie Systemanweisungen und Konversationsverlauf, um die Anzahl der Tokens zu reduzieren, die bei nachfolgenden Anfragen verarbeitet werden.

## Vorteile für Sie

- **Kostenreduktion**: Weniger Tokens bedeuten niedrigere API-Kosten
- **Schnellere Antworten**: Gecachte Inhalte werden schneller abgerufen
- **Automatische Optimierung**: Keine Konfiguration erforderlich – es funktioniert im Hintergrund

## Token-Caching ist verfügbar für

- API-Schlüssel-Benutzer (Qwen API-Schlüssel, OpenAI-kompatible Anbieter)

## Überwachung Ihrer Einsparungen

Verwenden Sie den Befehl `/stats`, um Ihre zwischengespeicherten Token-Einsparungen einzusehen:

- Wenn aktiv, zeigt die Statistik an, wie viele Tokens aus dem Cache bereitgestellt wurden
- Sie sehen sowohl die absolute Anzahl als auch den Prozentsatz der zwischengespeicherten Tokens
- Beispiel: „10.500 (90,4 %) der Eingabe-Tokens wurden aus dem Cache bereitgestellt, wodurch Kosten reduziert wurden.“

Diese Informationen werden nur angezeigt, wenn zwischengespeicherte Tokens verwendet werden, was bei der Authentifizierung mit API-Schlüssel der Fall ist, jedoch nicht bei OAuth-Authentifizierung.

## Beispiel für eine Statistik-Anzeige

![Qwen Code Stats Display](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

Das obige Bild zeigt ein Beispiel für die Ausgabe des Befehls `/stats` und hebt die Informationen zu den zwischengespeicherten Token-Einsparungen hervor.