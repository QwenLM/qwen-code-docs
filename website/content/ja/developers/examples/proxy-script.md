# プロキシスクリプトの例

以下のプロキシスクリプトは、`QWEN_SANDBOX_PROXY_COMMAND` 環境変数とともに使用できる例です。このスクリプトでは、`example.com:443` への HTTPS 接続のみを許可し、それ以外のすべてのリクエストを拒否します。

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// example.com への HTTPS 接続のみを許可し、:::8877 でリッスンするプロキシサーバーの例。
// サンドボックス内でプロキシを実行するには `QWEN_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` を設定してください。
// サンドボックス内（シェルモードまたはシェルツール経由）で `curl https://example.com` を実行してテストできます。

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // HTTPS の CONNECT リクエスト以外はすべて拒否
  console.log(
    `[PROXY] 拒否: ${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.on('connect', (req, clientSocket, head) => {
  // CONNECT リクエストでは、req.url は「ホスト名:ポート番号」の形式になります。
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] 検出: CONNECT リクエスト ${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname == domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] 許可: ${hostname}:${port} への接続`);

    // 元の宛先への TCP 接続を確立します。
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // クライアントと宛先サーバー間でデータをパイプすることでトンネルを作成します。
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] 宛先への接続エラー: ${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] 拒否: ${hostname}:${port} への接続`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // クライアントが切断した場合などに発生します。
    console.error(`[PROXY] クライアントソケットエラー: ${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] プロキシが ${address.address}:${address.port} でリッスン中`);
  console.log(
    `[PROXY] 許可される HTTPS 接続先ドメイン: ${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```