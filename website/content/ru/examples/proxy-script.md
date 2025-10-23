# Пример Proxy-скрипта

Ниже приведен пример proxy-скрипта, который можно использовать с переменной окружения `GEMINI_SANDBOX_PROXY_COMMAND`. Этот скрипт разрешает только `HTTPS` соединения к `example.com:443` и отклоняет все остальные запросы.

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Пример proxy-сервера, который слушает :::8877 и разрешает только HTTPS соединения к example.com.
// Установите `GEMINI_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js`, чтобы запустить proxy вместе с sandbox
// Проверьте через `curl https://example.com` внутри sandbox (в режиме shell или через shell tool)

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // Отклоняем все запросы, кроме CONNECT для HTTPS
  console.log(
    `[PROXY] Запрещаем не-CONNECT запрос: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', (req, clientSocket, head) => {
  // req.url будет в формате "hostname:port" для CONNECT запроса.
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] Перехват CONNECT запроса для: ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Разрешаем соединение к ${hostname}:${port}`);

    // Устанавливаем TCP соединение с оригинальным адресатом.
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Создаем туннель, перенаправляя данные между клиентом и сервером.
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Ошибка подключения к серверу: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Запрещаем соединение к ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // Это может произойти, если клиент закроет соединение.
    console.error(`[PROXY] Ошибка клиентского сокета: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Proxy слушает на ${address.address}:${address.port}`);
  console.log(
    `[PROXY] Разрешаем HTTPS соединения к доменам: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```