# Beispiel-Proxy-Skript

Das folgende ist ein Beispiel für ein Proxy-Skript, das mit der Umgebungsvariablen `GEMINI_SANDBOX_PROXY_COMMAND` verwendet werden kann. Dieses Skript erlaubt nur `HTTPS`-Verbindungen zu `example.com:443` und lehnt alle anderen Anfragen ab.

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Beispiel-Proxy-Server, der auf :::8877 lauscht und nur HTTPS-Verbindungen zu example.com erlaubt.
// Setze `GEMINI_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js`, um den Proxy neben dem Sandbox-Modus auszuführen.
// Teste über `curl https://example.com` innerhalb der Sandbox (im Shell-Modus oder über das Shell-Tool)

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // Alle Anfragen außer CONNECT für HTTPS ablehnen
  console.log(
    `[PROXY] Ablehnen einer Nicht-CONNECT-Anfrage für: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', (req, clientSocket, head) => {
  // req.url hat für eine CONNECT-Anfrage das Format "hostname:port".
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] Abgefangene CONNECT-Anfrage für: ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Erlaube Verbindung zu ${hostname}:${port}`);

    // Stelle eine TCP-Verbindung zum ursprünglichen Ziel her.
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Erstelle einen Tunnel durch Weiterleiten der Daten zwischen Client und Zielserver.
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Fehler beim Verbinden zum Ziel: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Verbiete Verbindung zu ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // Dies kann passieren, wenn der Client die Verbindung trennt.
    console.error(`[PROXY] Client-Socket-Fehler: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Proxy hört auf ${address.address}:${address.port}`);
  console.log(
    `[PROXY] Erlaubte HTTPS-Verbindungen zu Domains: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```