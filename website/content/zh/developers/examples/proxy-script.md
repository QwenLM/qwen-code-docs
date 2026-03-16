# 示例代理脚本

以下是一个代理脚本示例，可用于 `QWEN_SANDBOX_PROXY_COMMAND` 环境变量。该脚本仅允许对 `example.com:443` 的 HTTPS 连接，拒绝所有其他请求。

```javascript
#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 示例代理服务器，监听 :::8877，且仅允许对 example.com 的 HTTPS 连接。
// 设置 `QWEN_SANDBOX_PROXY_COMMAND=scripts/example-proxy.js` 可在沙箱旁运行该代理。
// 在沙箱内（shell 模式下或通过 shell 工具）执行 `curl https://example.com` 进行测试。

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import console from 'node:console';

const PROXY_PORT = 8877;
const ALLOWED_DOMAINS = ['example.com', 'googleapis.com'];
const ALLOWED_PORT = '443';

const server = http.createServer((req, res) => {
  // 拒绝除 CONNECT 方法外的所有请求（仅 CONNECT 用于 HTTPS）
  console.log(
    `[PROXY] 拒绝非 CONNECT 请求：${req.method} ${req.url}`,
  );
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('方法不被允许');
});

server.on('connect', (req, clientSocket, head) => {
  // 对于 CONNECT 请求，req.url 格式为 "hostname:port"。
  const { port, hostname } = new URL(`http://${req.url}`);

  console.log(`[PROXY] 拦截到 CONNECT 请求：${hostname}:${port}`);

  if (
    ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ) &&
    port === ALLOWED_PORT
  ) {
    console.log(`[PROXY] 允许连接至 ${hostname}:${port}`);

    // 建立到原始目标的 TCP 连接。
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // 通过在客户端与目标服务器之间双向管道传输数据，建立隧道。
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`[PROXY] 连接到目标时出错：${err.message}`);
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
    });
  } else {
    console.log(`[PROXY] 拒绝连接至 ${hostname}:${port}`);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }

  clientSocket.on('error', (err) => {
    // 客户端意外断开连接时可能发生此情况。
    console.error(`[PROXY] 客户端套接字错误：${err.message}`);
  });
});

server.listen(PROXY_PORT, () => {
  const address = server.address();
  console.log(`[PROXY] 代理正在监听 ${address.address}:${address.port}`);
  console.log(
    `[PROXY] 允许对以下域名的 HTTPS 连接：${ALLOWED_DOMAINS.join(', ')}`,
  );
});
```