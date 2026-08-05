# Standalone-Native-Addon für die Zwischenablage

## Problem

Das CLI-Bundle hält `@teddyzhu/clipboard` extern, damit npm-Installationen
das plattformspezifische native Paket zur Laufzeit laden können.
Standalone-Archive halten den Import ebenfalls extern, kopieren derzeit aber
nur das Audio-Capture-Native-Addon nach `lib/node_modules`. Das Einfügen von
Bildern aus der Zwischenablage schlägt daher in jedem Standalone-Archiv
stillschweigend fehl.

## Randbedingungen

- Jedes Archiv muss das JavaScript-Paket `@teddyzhu/clipboard` und genau ein
  natives Paket enthalten, das zum Archiv-Ziel passt.
- Der Release-Job erstellt alle unterstützten Ziele auf einem Ubuntu-Runner.
  Ein normales `npm ci` installiert nur das optionale native Paket des
  Runners, daher kann sich das Packaging für zielübergreifende Artefakte
  nicht auf die `node_modules` des Repositories verlassen.
- Die Clipboard-Paketversionen müssen aus dem Lockfile stammen und mit den
  optionalen Abhängigkeiten des CLI übereinstimmen.
- Lokales Packaging sollte weiterhin funktionieren, wenn ein
  Clipboard-Artefakt für ein Nicht-Host-Ziel nicht verfügbar ist, während
  Release-Packaging fehlschlagen muss, statt ein nur teilweise
  funktionierendes Archiv zu veröffentlichen.

## Design

Vor dem Bau der Release-Archive werden das Clipboard-Meta-Paket und jedes
unterstützte Zielpaket in der gesperrten Version in ein temporäres
Staging-Verzeichnis installiert. Dieses Verzeichnis wird dem
Packaging-Befehl pro Ziel explizit übergeben.

Der Standalone-Packager bildet jedes Ziel auf sein natives Clipboard-Paket
ab und kopiert nur das Meta-Paket plus dieses Zielpaket nach
`lib/node_modules/@teddyzhu`. Wenn kein explizites Staging-Verzeichnis
übergeben wird, verwendet der Packager die `node_modules` des Repositories;
ein fehlendes Host-Artefakt erzeugt bei lokalen Builds eine Warnung.
Fehlende Artefakte in einem expliziten Staging-Verzeichnis sind fatal.

Wenn sich das Runtime-Modul weiterhin nicht laden lässt, meldet der
Input-Prompt beim ersten Versuch, ein Bild aus der Zwischenablage
einzufügen, einen einzelnen nutzersichtbaren Fehler. Bestehende
Linux-`wl-paste`- und `xclip`-Pfade bleiben unverändert.

## Verifikation

- Packaging-Tests decken Zielauswahl, Ausschluss anderer nativer Ziele und
  Fehlschlagen bei unvollständigem explizitem Staging ab.
- Clipboard- und Input-Prompt-Tests decken den Callback für nicht verfügbare
  Module und den einmaligen UI-Fehler ab.
- Ein echtes macOS-arm64-Archiv wird außerhalb des Repositories entpackt,
  mit seiner gebündelten Node.js-Runtime geladen und gegen ein tatsächliches
  PNG in der System-Zwischenablage getestet.

![Zwischenablage-Einfügen im Standalone-Archiv vorher und nachher](./standalone-clipboard-native-addon/assets/before-after.png)
