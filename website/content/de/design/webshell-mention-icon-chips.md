# Web Shell Mention-Icon-Chips

## Problem

Das benutzerdefinierte @-Mention-Menü kann Erweiterungs-, Datei- und MCP-Referenzen einfügen, aber akzeptierte Elemente wurden im Composer als reiner Text gerendert. Ein früherer Composer-Pfad hat diese Referenzen als Icon-Chips gerendert. Die aktuelle benutzerdefinierte Mention-Architektur benötigt außerdem eine Möglichkeit, damit vom Host definierte Mention-Elemente, wie z. B. Tabellen, dasselbe Chip-Rendering verwenden können.

## Design

- Das @-Mention-Menü bleibt für die Auswahl und das Einfügen von Text verantwortlich.
- Mention-Elemente können optional einen `composerTag` bereitstellen, der die eingefügte Referenz beschreibt.
- Composer-Tags für integrierte Datei-, Erweiterungs- und MCP-Provider weiterhin automatisch erstellen, damit bestehende integrierte Mentions ohne Host-Änderungen wieder Icon-Chips erhalten.
- Eine `composerTagIcons`-Prop zu `WebShell` hinzufügen, damit Hosts Icon-URLs nach `composerTag.kind` registrieren können.
- Icons zur Composer-Rendering-Zeit über einen einzigen Helper auflösen, der zuerst benutzerdefinierte Icons prüft und auf integrierte Icons zurückfällt.
- Aufgelöste Icon-URLs nur in den internen Inline-Dekorationsdaten speichern und aus den öffentlichen Composer-Tag-Werten entfernen.

## Umfang

Diese Änderung umfasst die Registrierung und das Rendering von Composer-Tag-Icons für akzeptierte @-Mention-Elemente und programmatisch eingefügte Inline-Tags. Sie ändert nicht die sichtbaren @-Mention-Picker-Zeilen und fügt keine neue Provider-Registrierungs-API über die bestehende `atProviders`-Oberfläche hinaus hinzu.

## Risiken

- Benutzerdefinierte Icon-URLs werden über CSS-Masken angewendet, daher müssen URL-Werte vor dem Schreiben von CSS-Custom-Properties escaped werden.
- Bestehende Inline-Dekorationen müssen aktualisiert werden, wenn sich `composerTagIcons` ändert, während sich noch Text im Editor befindet.