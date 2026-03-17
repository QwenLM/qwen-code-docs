# Beispiel-Proxy-Skript

Im Folgenden finden Sie ein Beispiel für ein Proxy-Skript, das mit der Umgebungsvariablen `QWEN_SANDBOX_PROXY_COMMAND` verwendet werden kann. Dieses Skript erlaubt ausschließlich HTTPS-Verbindungen zu `example.com:443` und lehnt alle anderen Anfragen ab.

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Beispiel-Proxy-Server, der auf :::8877 lauscht und ausschließlich HTTPS-Verbindungen zu example.com zulässt.
// Legen Sie `QWEN_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` fest, um den Proxy neben der Sandbox auszuführen.
// Testen Sie ihn mit `curl https://example.com` innerhalb der Sandbox (im Shell-Modus oder über das Shell-Tool).

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // Alle Anfragen außer CONNECT für HTTPS werden abgelehnt.
  console.log(
    `[PROXY] Ablehnung einer Nicht-CONNECT-Anfrage für: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Methode nicht zulässig');
});

server.on('connect', (req, clientSocket, head) => {
  // Bei einer CONNECT-Anfrage hat `req.url` das Format „Hostname:Port“.
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] Abgefangene CONNECT-Anfrage für: ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Zulassung der Verbindung zu ${hostname}:${port}`);

    // Stellen Sie eine TCP-Verbindung zum ursprünglichen Ziel her.
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Verbindung hergestellt\r\n\r\n');
      // Erstellen Sie einen Tunnel, indem Sie Daten zwischen Client und Zielserver weiterleiten.
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Fehler bei der Verbindung zum Ziel: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Gateway-Fehler\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Ablehnung der Verbindung zu ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Verboten\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // Dies kann eintreten, wenn der Client die Verbindung trennt.
    console.error(`[PROXY] Client-Socket-Fehler: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Proxy lauscht auf ${address.address}:${address.port}`);
  console.log(
    `[PROXY] Zulässige HTTPS-Verbindungen zu folgenden Domains: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```