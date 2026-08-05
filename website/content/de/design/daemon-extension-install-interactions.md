# Daemon-Extension-Installations-Interaktionen

## Kontext

Der Daemon installiert Extensions als asynchrone Workspace-Operationen. Manche
Extensions erfordern, dass der Nutzer während der laufenden Installation ein
Claude-Marketplace-Plugin auswählt oder Konfigurationswerte angibt.

## Design

Eine Extension-Operation kann in `waiting_for_input` übergehen. Ihr Status
exponiert jeweils eine nicht sensible Interaktion:

- `marketplace_plugin` enthält den Marketplace-Namen und auswählbare Plugins.
- `setting` enthält Name, Beschreibung, Umgebungsvariable eines Settings und
  ob der Wert sensibel ist.

Der Client pollt den bestehenden Operation-Status-Endpunkt und sendet dann die
Antwort an
`POST /workspace/extensions/operations/:operationId/interactions/:interactionId`.
Der In-Memory-Callback der Operation setzt fort, nachdem die Antwort
validiert wurde.

Setting-Werte werden niemals in Operationsstatus, Ergebnissen oder Logs
aufgenommen. Der bestehende Extension-Settings-Mechanismus bleibt für ihre
Speicherung verantwortlich.

## Lebensdauer

Installations- und Update-Operationen haben eine gemeinsame
Zwanzig-Minuten-Lebensdauer. Jede Interaktion darf bis zu zehn Minuten der
verbleibenden Lebensdauer der Operation nutzen. Andere Extension-Mutationen
behalten ihren bestehenden Timeout. Eine wartende Operation verbleibt in der
bestehenden serialisierten Mutations-Queue, sodass keine andere
Extension-Mutation einen teilweise installierten Zustand beobachten kann.
