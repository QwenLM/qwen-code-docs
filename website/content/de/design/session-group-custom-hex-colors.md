# Benutzerdefinierte Hex-Farben für benannte Session-Gruppen

## Problem

Benannte Session-Gruppen teilen sich derzeit das Sechs-Werte-Farb-Enum, das
von den Quick-Session-Farb-Tags verwendet wird. Der Daemon lehnt jeden
anderen Wert mit `invalid_group_color` ab, das TypeScript-SDK exponiert
dieselbe geschlossene Union, und der WebShell-Editor bietet nur ein
Preset-Select an. Nutzer können benannte Gruppen weder an eine bestehende
Projektpalette anpassen noch einen größeren Gruppenkatalog visuell
unterscheiden.

Getrackt in [#6744](https://github.com/QwenLM/qwen-code/issues/6744).

## Vorgeschlagene Änderungen

| Layer          | Änderung                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Core           | Trennt Preset-Session-Tag-Farben von den Anzeigefarben benannter Gruppen. Benannte Gruppen akzeptieren Presets oder sechsstelliges `#RRGGBB`; Quick-Tags bleiben Preset-only. Gültige Hex-Werte werden vor der Persistierung in Kleinbuchstaben normalisiert. |
| REST und ACP   | Behält die Preset-only-Validierung der Quick-Tags bei und reicht Farben benannter Gruppen an die Core-Validierung durch.          |
| TypeScript SDK | Exportiert Preset- und Hex-Farbtypen. Gruppen-Input/-Output verwendet ihre Union; die Session-Organisation verwendet weiterhin Preset-Farben. |
| WebShell       | Behält die Preset-Auswahl bei und fügt eine Custom-Option mit nativem Farb-Picker und Hex-Textfeld hinzu. Rendert benutzerdefinierte Gruppenpunkte mit einer Inline-Hintergrundfarbe. |

## Entscheidungen

- Nur sechsstelliges `#RRGGBB` akzeptieren. Drei-, vier- und achtstellige
  Formen werden abgelehnt, damit jeder persistierte Wert eine vorhersagbare
  Form hat.
- Umgebenden Whitespace trimmen und Hex-Werte im Core auf Kleinbuchstaben
  kanonisieren. Clients dürfen für sofortiges Feedback früher normalisieren,
  aber der Core bleibt maßgeblich.
- Quick-Session-Farb-Tags nicht erweitern. Ihr Sechs-Werte-Katalog bleibt
  eine kompakte Ordnungs-/Filterdimension und bleibt abwärtskompatibel.
- Die Sidecar-Schema-Version bei 1 belassen. Das gespeicherte Feld bleibt
  ein String, und ältere Preset-Werte bleiben gültig.
- Bestehende Clients, die eine Hex-Klasse nicht kennen, sollten sicher
  fehlschlagen. Die WebShell rendert Hex-Gruppenpunkte über eine
  Inline-`background-color`.

## Dateien

- `packages/core/src/services/session-organization-service.ts`
- `packages/core/src/services/session-organization-service.test.ts`
- `packages/cli/src/serve/routes/session.ts`
- `packages/cli/src/serve/acp-http/dispatch.ts`
- `packages/cli/src/serve/server/session-list.ts`
- `packages/acp-bridge/src/bridgeTypes.ts`
- `packages/sdk-typescript/src/daemon/types.ts`
- `packages/sdk-typescript/src/daemon/index.ts`
- `packages/sdk-typescript/src/index.ts`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`
- `packages/web-shell/client/components/SessionOverviewPanel.tsx`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.module.css`
- `packages/web-shell/client/components/sidebar/WebShellSidebar.test.tsx`
- `packages/web-shell/client/i18n.tsx`

## Nicht im Scope

- Benutzerdefinierte Farben für Quick-Session-Tags.
- Alpha-Kanäle, Gradienten, benannte CSS-Farben oder kurze Hex-Formen.
- Änderungen am Gruppen-Sidecar-Format oder Migration bestehender Werte.

## Offene Fragen

Keine. Die bestehenden strukturierten Fehler- und Gruppen-Persistenzpfade
lassen sich ohne Protokoll-Versions-Bump erweitern.
