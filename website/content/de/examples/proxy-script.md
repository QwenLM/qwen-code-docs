# Beispiel-Proxy-Script

Das folgende ist ein Beispiel für ein Proxy-Script, das mit der Umgebungsvariable `GEMINI_SANDBOX_PROXY_COMMAND` verwendet werden kann. Dieses Script erlaubt ausschließlich `HTTPS`-Verbindungen zu `example.com:443` und lehnt alle anderen Anfragen ab.

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Beispiel-Proxy-Server, der auf :::8877 lauscht und nur HTTPS-Verbindungen zu example.com erlaubt.
// Setze `GEMINI_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js`, um den Proxy zusammen mit der Sandbox zu starten.
// Teste mit `curl https://example.com` innerhalb der Sandbox (im Shell-Modus oder über das Shell-Tool)

import http from 'http';
import net from 'net';
import { URL } from 'url';
import console from 'console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // Alle Anfragen außer CONNECT für HTTPS ablehnen
  console.log(
    `[PROXY] Nicht-CONNECT-Anfrage abgelehnt für: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', (req, clientSocket, head) => {
  // req.url hat für CONNECT-Anfragen das Format "hostname:port"
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] CONNECT-Anfrage abgefangen für: ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Verbindung zu ${hostname}:${port} erlaubt`);

    // TCP-Verbindung zum ursprünglichen Ziel herstellen
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Tunnel erstellen, indem Daten zwischen Client und Zielserver weitergeleitet werden
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Fehler beim Verbinden zum Ziel: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Verbindung zu ${hostname}:${port} abgelehnt`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // Kann passieren, wenn der Client die Verbindung abbricht
    console.error(`[PROXY] Client-Socket-Fehler: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Proxy hört auf ${address.address}:${address.port}`);
  console.log(
    `[PROXY] HTTPS-Verbindungen erlaubt zu Domains: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```