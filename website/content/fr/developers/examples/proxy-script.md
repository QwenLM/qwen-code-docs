# Exemple de script proxy

Voici un exemple de script proxy pouvant être utilisé avec la variable d’environnement `GEMINI_SANDBOX_PROXY_COMMAND`. Ce script autorise uniquement les connexions `HTTPS` vers `example.com:443` et refuse toutes les autres requêtes.

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Exemple de serveur proxy écoutant sur :::8877 et n'autorisant que les connexions HTTPS vers example.com.
// Définir `GEMINI_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` pour exécuter le proxy en parallèle du bac à sable
// Tester via `curl https://example.com` dans le bac à sable (en mode shell ou via l'outil shell)

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // Refuser toutes les requêtes autres que CONNECT pour HTTPS
  console.log(
    `[PROXY] Requête non CONNECT refusée : ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Méthode non autorisée');
});

server.on('connect', (req, clientSocket, head) => {
  // req.url sera au format "hostname:port" pour une requête CONNECT.
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] Requête CONNECT interceptée pour : ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Connexion autorisée vers ${hostname}:${port}`);

    // Établir une connexion TCP vers la destination originale.
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Créer un tunnel en transférant les données entre le client et le serveur de destination.
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Erreur lors de la connexion à la destination : ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Connexion refusée vers ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // Cela peut se produire si le client raccroche.
    console.error(`[PROXY] Erreur socket cliente : ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Proxy en écoute sur ${address.address}:${address.port}`);
  console.log(
    `[PROXY] Connexions HTTPS autorisées vers les domaines : ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```