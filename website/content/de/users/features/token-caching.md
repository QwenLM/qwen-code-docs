# Token-Caching und Kostenoptimierung

Qwen Code optimiert automatisch die API-Kosten durch Token-Caching, wenn eine Authentifizierung mit API-Schlüssel verwendet wird. Diese Funktion speichert häufig genutzte Inhalte wie Systemanweisungen und Verlaufsdaten der Konversation, um die Anzahl der bei nachfolgenden Anfragen verarbeiteten Tokens zu reduzieren.

## Vorteile für Sie

- **Kostensenkung**: Weniger Tokens bedeuten niedrigere API-Kosten  
- **Schnellere Antworten**: Gecachter Inhalt wird schneller abgerufen  
- **Automatische Optimierung**: Keine Konfiguration erforderlich – die Funktion arbeitet im Hintergrund  

## Token-Caching ist verfügbar für

- Nutzer mit API-Schlüssel (Qwen-API-Schlüssel, OpenAI-kompatible Anbieter)

## Überwachung Ihrer Einsparungen

Verwenden Sie den Befehl `/stats`, um Ihre zwischengespeicherten Token-Einsparungen anzuzeigen:

- Wenn die Funktion aktiv ist, zeigt die Statistik an, wie viele Token aus dem Cache bereitgestellt wurden.
- Sie sehen sowohl die absolute Anzahl als auch den Prozentsatz der aus dem Cache stammenden Token.
- Beispiel: „10.500 (90,4 %) der Eingabetoken wurden aus dem Cache bereitgestellt, wodurch Kosten gesenkt werden.“

Diese Informationen werden nur angezeigt, wenn zwischengespeicherte Token verwendet werden – dies ist bei der Authentifizierung mit einem API-Schlüssel der Fall, nicht jedoch bei der OAuth-Authentifizierung.

## Beispiel für die Anzeige der Statistik

![Anzeige der Qwen Code-Statistik](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

Das obige Bild zeigt ein Beispiel für die Ausgabe des `/stats`-Befehls mit Hervorhebung der Informationen zu den Einsparungen durch zwischengespeicherte Token.