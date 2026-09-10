// Compares the route keys of each locale's navigation file against English.
// Prints one line per locale that disagrees, and nothing at all when they
// all match, so the caller can test with `[ -s report ]`.
//
// Separator entries are skipped: `{ type: 'separator' }` uses its key as a
// display label rather than a route, so a translated one is correct.
//
// Run from website/. FILE is relative to content/en, LANGS is space-separated.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const file = process.env.FILE;
const langs = (process.env.LANGS || "").split(/\s+/).filter(Boolean);

const routeKeys = (p) => {
  const mod = require(p);
  const obj = mod.default || mod;
  return Object.keys(obj).filter((k) => {
    const v = obj[k];
    return !(v && typeof v === "object" && v.type === "separator");
  });
};

const en = routeKeys(`${process.cwd()}/content/en/${file}`);
for (const lang of langs) {
  const p = `${process.cwd()}/content/${lang}/${file}`;
  if (!fs.existsSync(p)) continue;
  let keys;
  try {
    keys = routeKeys(p);
  } catch (err) {
    console.log(`${lang}: cannot be loaded — ${err.message}`);
    continue;
  }
  const missing = en.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !en.includes(k));
  if (missing.length || extra.length)
    console.log(
      `${lang}: missing [${missing.join(", ")}] unexpected [${extra.join(", ")}]`
    );
}
