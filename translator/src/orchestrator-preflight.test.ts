import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { test } from "node:test";

const orchestrator = path.resolve(__dirname, "../orchestrator/orchestrator.mjs");

test("preflight retries a transient network failure", async () => {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    if (requests === 1) {
      req.socket.destroy();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const child = spawn(
      process.execPath,
      [orchestrator, "preflight", "--model", "test-model"],
      {
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-key",
          OPENAI_BASE_URL: `http://127.0.0.1:${address.port}`,
          // The real first backoff is 15s. The point here is that a retry
          // happens at all, not how long it waits for.
          PREFLIGHT_BACKOFF_MS: "10",
        },
      }
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const status = await new Promise<number | null>((resolve) =>
      child.on("close", resolve)
    );

    assert.equal(status, 0, output);
    assert.equal(requests, 2);
    assert.match(output, /attempt 1\/5 failed.*retrying in/);
    assert.match(output, /credentials OK/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
