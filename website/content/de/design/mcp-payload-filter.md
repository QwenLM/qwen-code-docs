# MCP-Modell-Payload-Filterung

## Ziel

Verhindere, dass `packages/cua-driver` und `packages/mobile-mcp` bekannte
Herstellerbegriffe in textuellen MCP-Payloads zurückgeben, während die echten
lokalen Werte erhalten bleiben, die zum Bedienen von Apps, Fenstern, Geräten
und Paketen benötigt werden.

Die Filterung ist Opt-in und standardmäßig deaktiviert. Setze
`MCP_MODEL_PAYLOAD_FILTER=1` in der MCP-Server-Umgebung für API-Routen, die
diese Begriffe ablehnen. Nutzer auf anderen Routen behalten die originalen
Payloads.

Die anfänglichen Case-insensitiven ASCII-Begriffe sind `qwen`, `dashscope`,
`alibaba`, `aliyun`, `aliyuncs`, `alicloud`, `tongyi`, `qianwen`, `antgroup`,
`bailian`, `modelscope`, `damo`, `lingma`, `wanx`, `alipay`, `antfin`,
`yuque`, `dingtalk`, `taobao`, `tmall`, `qoder` und `maxcompute`. Chinesische
Begriffe werden exakt gematcht: `通义`, `千问`, `阿里`, `百炼`, `魔搭`,
`达摩`, `灵码`, `万相`, `支付宝`, `蚂蚁`, `语雀`, `钉钉`, `淘宝` und
`天猫`. Trennzeichen-Varianten werden für mehrteilige Namen ebenfalls
gematcht, etwa `q-wen`, `dash_scope`, `ali cloud`, `qian-wen` und
`ant_group`.

## Encoding

Jeder gematchte Substring wird durch einen zustandslosen Token ersetzt, der
seine UTF-8-Hex-Bytes enthält. Zum Beispiel bleibt ein gefilterter App-Name
rund um den Token lesbar, und die Rückgabe dieses Werts an denselben
MCP-Server stellt den exakten Original-Substring vor Tool-Validierung und
-Ausführung wieder her. Dies vermeidet eine Session-Map und lässt
App/Paket/Pfad-Roundtrips auch nach Prozess-Restarts funktionieren.

JSON-RPC-IDs und -Methoden werden niemals transformiert. Objekt-Keys und
textuelle Werte innerhalb von Result-, Error- und Notification-Payloads
werden rekursiv transformiert. Bild- und Audio-`data`-Felder bleiben
Byte-für-Byte erhalten.

## Komponentengrenzen

In cua-driver sind `Response::ok` und `Response::error` die geteilte
modell-zugewandte Grenze für direkte stdio-, HTTP- und Daemon-Proxy-
MCP-Responses. Tool-Aufruf-Namen und -Argumente werden in
`Request::tool_call` vor dem Dispatch decodiert. Beide Richtungen wenden die
Transformation nur an, wenn `MCP_MODEL_PAYLOAD_FILTER=1` gesetzt ist.

In mobile-mcp encodiert ein Transport-Wrapper ausgehende JSON-RPC-Payloads
und decodiert eingehende Payloads, bevor das SDK die Schema-Validierung
durchführt. Eine kleine `McpServer`-Subklasse wendet den Wrapper auf stdio,
SSE, In-Memory-Tests und zukünftige Transports an, wenn
`MCP_MODEL_PAYLOAD_FILTER=1` gesetzt ist; andernfalls verbindet sie den
originalen Transport unverändert.

## Nicht-Ziele

Dies benennt keine installierten Apps, Prozesse, Bundles, npm-Pakete,
Signing-Identitäten, Repositories oder Distributions-URLs um. Es
transformiert kein Stderr, keine Telemetrie und keine Build-Logs. Bild-Bytes
bleiben erhalten, sodass OCR-basierte Filterung außerhalb dieser
Text-Payload-Garantie liegt.

Aliase werden nur decodiert, wenn sie an dieselbe MCP-Komponente
zurückgegeben werden. Die Übergabe eines Alias an eine Shell oder einen
anderen Server stellt den lokalen Wert nicht wieder her.

## Verifikation

- Unit-teste jeden Begriff, gemischte Groß-/Kleinschreibung, chinesischen
  Text, verschachtelte Objekte und Keys, ungültige Tokens, exakte
  Roundtrips und die Bewahrung von Binärinhalten.
- Verifiziere, dass die modell-zugewandte Grenze standardmäßig unverändert
  ist und nur filtert, wenn `MCP_MODEL_PAYLOAD_FILTER=1` vorhanden ist.
- Übe echtes MCP-Initialize, tools/list, Erfolgs-, strukturierte Erfolgs-
  und Error-Responses für beide Komponenten.
- Führe die beobachteten Cua-Permission-, Health-, App- und Window-Payloads
  sowie den deterministischen Mobile-Error-Echo erneut aus.
