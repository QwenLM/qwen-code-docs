// Remove .next but keep .next/cache so Next.js's persistent webpack
// cache survives between builds. `next build` is a cold ~4-5min compile
// without it (the old `clean` script rm -rf'd the cache too), and CI
// restores the cache directory via actions/cache — together they cut
// the build step roughly in half.
import fs from "node:fs";
import path from "node:path";

const nextDir = path.resolve(process.cwd(), ".next");
const cacheDir = path.join(nextDir, "cache");
const stashDir = path.join(nextDir, ".cache-stash");

if (fs.existsSync(cacheDir)) {
  fs.rmSync(stashDir, { recursive: true, force: true });
  fs.renameSync(cacheDir, stashDir);
}
fs.rmSync(nextDir, { recursive: true, force: true });
if (fs.existsSync(stashDir)) {
  fs.mkdirSync(nextDir, { recursive: true });
  fs.renameSync(stashDir, cacheDir);
}
