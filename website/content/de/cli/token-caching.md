# Token Caching und Kostenoptimierung

Qwen Code optimiert automatisch die API-Kosten durch Token Caching, wenn du API-Key-Authentifizierung verwendest (z. B. OpenAI-kompatible Anbieter). Dieses Feature nutzt vorherige Systemanweisungen und Kontexte wieder, um die Anzahl der verarbeiteten Tokens in nachfolgenden Requests zu reduzieren.

**Token Caching ist verfügbar für:**

- API-Key-Nutzer (Qwen API key)  
- Vertex AI-Nutzer (mit Projekt- und Standortkonfiguration)

**Token Caching ist nicht verfügbar für:**

- OAuth-Nutzer (Google Personal/Enterprise Accounts) – die Code Assist API unterstützt derzeit keine Erstellung gecachter Inhalte

Du kannst deinen Tokenverbrauch und die Einsparungen durch gecachte Tokens mit dem Befehl `/stats` einsehen. Wenn gecachte Tokens verfügbar sind, werden sie in der Statistik angezeigt.