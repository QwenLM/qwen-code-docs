# Exemplo de Script de Proxy

O código a seguir é um exemplo de script de proxy que pode ser usado com a variável de ambiente `GEMINI_SANDBOX_PROXY_COMMAND`. Este script permite apenas conexões `HTTPS` para `example.com:443` e rejeita todas as outras requisições.

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Exemplo de servidor proxy que escuta em :::8877 e só permite conexões HTTPS para example.com.
// Defina `GEMINI_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` para executar o proxy junto com o sandbox
// Teste usando `curl https://example.com` dentro do sandbox (no modo shell ou através da ferramenta shell)

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // Nega todas as requisições que não sejam CONNECT para HTTPS
  console.log(
    `[PROXY] Negando requisição não CONNECT para: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', (req, clientSocket, head) => {
  // req.url virá no formato "hostname:port" para uma requisição CONNECT.
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] Interceptada requisição CONNECT para: ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Permitindo conexão para ${hostname}:${port}`);

    // Estabelece uma conexão TCP com o destino original.
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Cria um túnel redirecionando dados entre cliente e servidor de destino.
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Erro ao conectar ao destino: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Negando conexão para ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // Isso pode acontecer caso o cliente desconecte abruptamente.
    console.error(`[PROXY] Erro no socket do cliente: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Proxy escutando em ${address.address}:${address.port}`);
  console.log(
    `[PROXY] Permitindo conexões HTTPS para os domínios: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```