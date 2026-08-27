# Token-Caching und Kostenoptimierung

Qwen Code optimiert automatisch die API-Kosten durch Token-Caching bei Verwendung der API-Key-Authentifizierung. Diese Funktion speichert häufig verwendete Inhalte wie Systemanweisungen und Gesprächsverläufe zwischen, um die Anzahl der in nachfolgenden Anfragen verarbeiteten Tokens zu reduzieren.

## Ihre Vorteile

- **Kostensenkung**: Weniger Tokens bedeuten niedrigere API-Kosten
- **Schnellere Antworten**: Zwischengespeicherte Inhalte werden schneller abgerufen
- **Automatische Optimierung**: Keine Konfiguration erforderlich – sie arbeitet im Hintergrund

## Token-Caching ist verfügbar für

- API-Key-Benutzer (Qwen API-Key, OpenAI-kompatible Anbieter)

## Überwachung Ihrer Einsparungen

Verwenden Sie den Befehl `/stats`, um Ihre eingesparten gecachten Tokens zu sehen:

- Wenn aktiv, zeigt die Statistik an, wie viele Tokens aus dem Cache bereitgestellt wurden
- Sie sehen sowohl die absolute Anzahl als auch den Prozentsatz der gecachten Tokens
- Beispiel: „10.500 (90,4 %) der Eingabe-Tokens wurden aus dem Cache bereitgestellt, was die Kosten senkt."

Diese Informationen werden nur angezeigt, wenn gecachte Tokens verwendet werden, was bei API-Key-Authentifizierung der Fall ist, nicht jedoch bei OAuth-Authentifizierung.

## Beispiel einer Statistik-Anzeige

![Statistikanzeige von Qwen Code](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

Das obige Bild zeigt ein Beispiel der Ausgabe des Befehls `/stats` und hebt die Informationen zu den eingesparten gecachten Tokens hervor.