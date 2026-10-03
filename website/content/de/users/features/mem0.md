# Mem0

Mem0 verbindet Qwen Code mit einem externen Memory-Service. Es ist im Haupt-CLI-Paket enthalten: installiere nicht `@qwen-code/external-context-mem0` und registriere keinen separaten MCP-Server für diesen Pfad.

## Connect

Füge dies in die User-Settings (`~/.qwen/settings.json`) ein und starte Qwen Code dann in einem vertrauenswürdigen Projekt neu. Wie `modelProviders` benennt `envKey` die Credential-Variable, und das Top-Level-`env`-Feld kann ihren Wert bereitstellen:

```json
{
  "env": {
    "MEM0_API_KEY": "<your-provider-key>"
  },
  "memory": {
    "mem0": {
      "baseUrl": "https://your-mem0-endpoint.example",
      "protocol": "mem0-v2",
      "envKey": "MEM0_API_KEY"
    }
  }
}
```

Dieses Single-File-Setup erfordert keinen Shell-Export. Credentials in JSON sind Klartext: bewahre sie in den User-Settings auf, commite sie nicht in ein Repository und teile die Datei nicht in Berichten. Alternativ kannst du den Top-Level-`env`-Eintrag weglassen und den Key in der startenden Shell oder `~/.qwen/.env` setzen. Nicht-leere Prozess-Umgebungswerte haben Vorrang vor `.env`-Werten, die wiederum Vorrang vor `settings.env` haben.

Verwende den Endpoint-Origin, optional mit einem Reverse-Proxy-Prefix; hänge nicht `/v2/memories/search` oder einen anderen Operationspfad an. Wähle den Vertrag, den dein Service tatsächlich implementiert:

- `mem0-v2` (Standard): PolarDB-Stil `Authorization: Token`, V2-Suche mit `limit`, V1-Schreibvorgang.
- `mem0-v3`: Mem0 Platform V3, `Authorization: Token`, V3-Suche/-Hinzufügung.
- `mem0-oss-2026-08`: angepinnter OSS-REST-Vertrag, `X-API-Key`, `/search` und `/memories`.

Dies sind vollständige Verträge, keine universelle Versionskompatibilität. Unbekannte Versionen und andere Request/Response-Formen benötigen einen verifizierten Adapter, keine umbenannte URL. Historische Preset-IDs werden weiterhin akzeptiert; `aliyun-polardb-mysql-2026-08` behält sein historisches `top_k`-Suchfeld und den rohen Suchinhalt.

Eine vertrauenswürdige PolarDB-Adresse wie `http://your-endpoint:8080` benötigt zusätzlich `"allowInsecureHttp": true`. Plain HTTP sendet die Credential unverschlüsselt. Diese Einstellung macht einen privaten Endpoint nicht erreichbar oder umgeht IP-Whitelists.

Qwen registriert automatisch `external-context` und entdeckt `context_search`. Weise Qwen an, im externen Memory zu suchen; nichts wird automatisch bei jedem Turn abgerufen oder gesendet. Ein gleichnamiger Server in Operator-Settings, Session-Konfiguration oder `--mcp-config` steht in Konflikt; entferne diese manuelle Konfiguration beim Wechsel zum eingebauten Pfad. Workspace-Settings und Projekt-`.mcp.json`-Einträge dieses Namens werden überschrieben. Die bestehende MCP-Priorität überlagert auch einen gleichnamigen Extension-Server, deaktiviere also die erweiterte External-Context-Extension bei Verwendung des gebündelten Pfads. Entferne auch den alten manuellen Write-Confirmation-Hook, um doppelte Bestätigungen zu vermeiden; ein User-Hook mit demselben Matcher ersetzt nicht die eingebaute Bestätigung.

## Scope and writes

Der Standard-User-/Repository-Scope überlebt Neustarts und den Start aus Git-Unterverzeichnissen. Das Verschieben des Repositories oder die Verwendung eines anderen Checkouts ändert ihn, einschließlich temporärer `--worktree`- und Agent-Isolation-Worktrees. Um einen bekannten Scope über Worktrees hinweg wiederzuverwenden, setze `scope.userId` für V2/OSS oder `scope.appId` für V3; optionales `scope.agentId` gilt nur für V2/OSS. Scope-Identifikatoren sind keine providerseitigen Zugriffskontrollen.

Die Suche ist standardmäßig read-only. Um das Speichern zu aktivieren, füge `"enableWrites": true` innerhalb von `memory.mem0` hinzu, starte die interaktive CLI neu und weise Qwen an, bestimmte Inhalte zu speichern. Der automatisch installierte Hook fordert dich auf, den genauen Inhalt zu genehmigen, auch im YOLO-Modus. Bei Ablehnung wird kein Schreibrequest gesendet. Schreibvorgänge verwenden `infer: false`.

PolarDB kann ein Single-User-Message-Array als JSON für diese direkten Importe zurückgeben. `mem0-v2` stellt den exakten Text dieser Nachricht wieder her, wenn das Ergebnis mit `infer: false` markiert ist; das historische `aliyun-polardb-mysql-2026-08`-Preset, gewöhnlicher Text und andere Protokolle bleiben unverändert.

Noninteractive/ACP-Sessions und Sessions mit deaktivierten Hooks behalten nur die Suche. Bare/Safe-Modus, nicht vertrauenswürdige/provisorische Ordner und SSH-Workspaces aktivieren diese lokale Bindung nicht. Workspace-Settings können die Bindung nicht konfigurieren.

`stored` bedeutet, dass gültige synchrone IDs zurückgegeben wurden. `accepted` bedeutet, dass ein asynchroner Request akzeptiert wurde, nicht dass die Persistierung abgeschlossen ist. `failed` bedeutet eine endgültige Ablehnung: behebe die gemeldete Ursache vor einem erneuten Versuch. `unknown` bedeutet, dass der Schreibvorgang erfolgt sein könnte: nicht automatisch wiederholen.

## Options and troubleshooting

`envKey` ist standardmäßig `MEM0_API_KEY`; verwende es, um auf eine andere Credential-Variable zu verweisen und deren Wert über eine der oben genannten Quellen zu definieren. Das historische `credentialEnv`-Feld bleibt ein kompatibler Alias. Wenn beide Felder gesetzt sind, müssen ihre Namen übereinstimmen; widersprüchliche Namen erzeugen einen Fehler, anstatt stillschweigend eine Credential auszuwählen. `timeoutMs` ist standardmäßig 5000, zwischen 1 und 30000.

Prüfe den MCP-Verbindungsstatus bei fehlenden Credentials und Provider-Fehlern. Ein Timeout erfordert die Prüfung von Endpoint-Routing, Source-IP-Whitelists und Service-Verfügbarkeit. Ein 401/403 erfordert die Prüfung der Credential und des ausgewählten Protokolls. Füge keine Credentials in Logs oder Issue-Berichte ein.

Für Source-Checkouts: einmal bauen und bündeln, damit `dist/mem0/main.js` und `dist/mem0/write-confirmation.js` existieren. Installierte Hauptpakete liefern beide mit. Dieses Feature benötigt ein Main-CLI-Release, das die Änderung enthält; die Veröffentlichung eines eigenständigen Mem0-Pakets ist nicht erforderlich.