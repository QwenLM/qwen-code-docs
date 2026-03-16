# Пример прокси-скрипта

Ниже приведён пример прокси-скрипта, который можно использовать с переменной окружения `QWEN_SANDBOX_PROXY_COMMAND`. Этот скрипт разрешает только HTTPS-соединения к `example.com:443` и отклоняет все остальные запросы.

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Пример прокси-сервера, прослушивающего порт :::8877 и разрешающего только HTTPS-соединения с example.com.
// Установите `QWEN_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js`, чтобы запустить прокси параллельно с песочницей.
// Проверьте работу с помощью команды `curl https://example.com` внутри песочницы (в режиме оболочки или через инструмент оболочки).

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
    `[PROXY] Отклонён запрос, не являющийся CONNECT: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Метод не поддерживается');
});

server.on('connect', (req, clientSocket, head) => {
  // В запросе CONNECT req.url будет иметь формат «имя_хоста:порт».
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] Перехвачен запрос CONNECT для: ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Разрешено соединение с ${hostname}:${port}`);

    // Устанавливаем TCP-соединение с исходным целевым хостом.
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Создаём туннель, передавая данные между клиентом и целевым сервером.
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Ошибка подключения к целевому серверу: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Отклонено соединение с ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // Это может произойти, если клиент разорвал соединение.
    console.error(`[PROXY] Ошибка сокета клиента: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Прокси-сервер слушает на ${address.address}:${address.port}`);
  console.log(
    `[PROXY] Разрешены HTTPS-соединения с доменами: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```