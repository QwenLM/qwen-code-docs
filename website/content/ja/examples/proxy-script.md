# プロキシスクリプトの例

以下は、`GEMINI_SANDBOX_PROXY_COMMAND` 環境変数で使用できるプロキシスクリプトの例です。このスクリプトは `example.com:443` への `HTTPS` 接続のみを許可し、それ以外のリクエストはすべて拒否します。

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// :::8877 を listen するプロキシサーバーの例。example.com への HTTPS 接続のみを許可します。
// `GEMINI_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` を設定して、sandbox と一緒にプロキシを起動します。
// sandbox 内で（shell モードまたは shell tool 経由で）`curl https://example.com` を実行してテストできます。

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // HTTPS の CONNECT 以外のリクエストはすべて拒否
  console.log(
    `[PROXY] Denying non-CONNECT request for: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', (req, clientSocket, head) => {
  // req.url は CONNECT リクエストの場合 "hostname:port" 形式になります。
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] Intercepted CONNECT request for: ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] Allowing connection to ${hostname}:${port}`);

    // 宛先サーバーへの TCP 接続を確立します。
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // クライアントと宛先サーバー間でデータをパイプしてトンネルを作成します。
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] Error connecting to destination: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] Denying connection to ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // クライアントが接続を切った場合などに発生します。
    console.error(`[PROXY] Client socket error: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] Proxy listening on ${address.address}:${address.port}`);
  console.log(
    `[PROXY] Allowing HTTPS connections to domains: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```