# Electron-zu-Tauri-Desktop-Update-Bridge

## Kontext

Der letzte veröffentlichte Release, `desktop-v0.0.5`, ist eine Electron-App namens `Qwen Code Desktop` mit dem Bundle-Identifier `com.alibaba.qwen-code`. Ihr macOS-Updater liest `latest-mac.yml` vom festen `desktop-latest`-Release und installiert ein ZIP-Archiv.

Die neue Desktop-Shell ist eine Tauri-App. Sie verwendet derzeit einen anderen Produktnamen und Bundle-Identifier und veröffentlicht `desktop-latest.json`, sodass die bestehende Electron-App sie nicht finden oder ersetzen kann.

## Ziele

- Signierte macOS-Electron-`0.0.5`-Installationen können direkt auf den ersten stabilen Tauri-Release updaten.
- Die bestehende macOS-Anwendungsidentität bleibt erhalten, damit der Updater das installierte App-Bundle ersetzt.
- Der signierte Updater-Feed von Tauri bleibt für alle Releases nach der Migration erhalten.
- Die Bridge ist Opt-in und einmalig; spätere Releases dürfen kein Electron-Build-Tooling mehr benötigen.

## Non-Goals

- Migration von Electron-Einstellungen, Sessions oder Workspace-Zustand. Die Tauri-App darf beim ersten Start nach einem Workspace fragen.
- Überbrückung von Windows- oder Linux-Electron-Installationen.
- Erzeugung von Electron-Differential-Blockmaps. Der Electron-Updater fällt auf das checksummenverifizierte vollständige ZIP zurück.

## Kompatibilitätsvertrag

Das Tauri-Bundle nutzt die Legacy-macOS-Identität:

- Produktname: `Qwen Code Desktop`
- Bundle-Identifier: `com.alibaba.qwen-code`
- Artefakt-Präfix: `Qwen-Code-Desktop`
- Signaturidentität: das bestehende Developer-ID-Application-Zertifikat

Der Bridge-Release muss neuer als `0.0.5` sein. Er veröffentlicht zwei Updater-Ansichten über denselben signierten App-Bundles:

1. `latest-mac.yml` verweist Legacy-Electron-Clients auf `Qwen-Code-Desktop-arm64.zip` oder `Qwen-Code-Desktop-x64.zip`.
2. `desktop-latest.json` verweist Tauri-Clients auf die signierten Tauri-Updater-Archive.

Das ZIP wird aus der bereits signierten und notarierten `.app` erstellt; es wird nicht vom Electron-Tooling neu gebaut.

## Release-Flow

`Desktop Release` erhält einen `electron_bridge`-Input, standardmäßig deaktiviert.

- Alle macOS-Builds erzeugen weiterhin die Tauri-App, das DMG, das Updater-Archiv und die Updater-Signatur.
- Wenn `electron_bridge` aktiviert ist, erzeugt jeder macOS-Build zusätzlich ein Legacy-kompatibles ZIP.
- Der Publish-Job erzeugt `latest-mac.yml` aus den beiden ZIPs und DMGs.
- Ein stabiler Bridge-Release lädt die Legacy-Metadaten und Payloads zusammen mit `desktop-latest.json` in `desktop-latest` hoch.
- Spätere stabile Releases lassen `electron_bridge` deaktiviert. Die Aktualisierung von `desktop-latest.json` entfernt die Bridge-Dateien nicht, sodass Electron-Installationen, die später zurückkehren, weiterhin zu Tauri wechseln können.

Draft- und Prerelease-Läufe dürfen Bridge-Artefakte zur Begutachtung bauen und veröffentlichen, aber sie aktualisieren nie den stabilen Feed.

## Signatur-Credentials

Das Repository speichert bereits das Apple-Zertifikat aus der Electron-Ära und den App-Store-Connect-API-Key unter den Secret-Namen `MAC_CSC_*` und `APPLE_NOTARY_*`. Der Workflow akzeptiert diese Namen als Fallbacks für die neueren Tauri-Namen, sodass die Developer-ID-Identität unverändert bleibt.

Tauri-Updater-Artefakte benötigen zusätzlich `TAURI_SIGNING_PRIVATE_KEY`; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` wird nur für einen verschlüsselten Private Key benötigt. Der Private Key muss vor dem ersten veröffentlichten Tauri-Release zum Public Key in der Tauri-Konfiguration passen.

## Validierung

Automatisierte Release-Helper-Tests verifizieren:

- die Legacy-Anwendungsidentität,
- die exakte Bridge-Artefakt-Auswahl,
- SHA-512- und Größenwerte in `latest-mac.yml`,
- einen Fehlschlag, wenn ein benötigtes Bridge-Artefakt fehlt,
- das bestehende Verhalten von Tauri-Updater-Manifest und Versionssynchronisation.

Vor dem stabilen Release die signierten `desktop-v0.0.5`-Builds (arm64 und x64) installieren, sie auf einen isolierten Bridge-Feed ausrichten und sowohl `0.0.5 -> Tauri bridge`- als auch `Tauri bridge -> neueres Tauri`-Updates verifizieren.
