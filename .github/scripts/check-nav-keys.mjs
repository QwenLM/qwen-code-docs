// Compares the route keys of each locale's navigation file against English.
// Prints one line per locale that disagrees, and nothing at all when they
// all match, so the caller can test with `[ -s report ]`.
//
// Structural entries are skipped: a `separator`, `menu`, or `href`-backed
// `page` has no file behind it, and its key is a label rather than a route.
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
      // A separator is not the only entry with nothing behind it: `menu` and
      // `href`-backed `page` entries have no file either.
      return !(v && typeof v === "object" && (v.type || v.href));
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
  const dir = `${process.cwd()}/content/${lang}/${file}`.replace(/\/[^/]+$/, "");
  const hasPage = (k) =>
    fs.existsSync(`${dir}/${k}`) ||
    fs.existsSync(`${dir}/${k}.md`) ||
    fs.existsSync(`${dir}/${k}.mdx`);
  // An English key whose page this locale does not have yet is *correctly*
  // absent from its `_meta`, so it is not a gap. Listing it would be the bug.
  const missing = en.filter((k) => !keys.includes(k) && hasPage(k));
  const extra = keys.filter((k) => !en.includes(k));
  if (missing.length || extra.length)
    console.log(
      `${lang}: missing [${missing.join(", ")}] unexpected [${extra.join(", ")}]`
    );
  // Matching English is not enough. A locale regenerated from English lists
  // every English key, including pages that locale has not been translated
  // yet -- and Nextra refuses to build a `_meta` key with no page behind it,
  // taking the whole site down. That is what `ko` did: its file was created
  // from nothing, listed `extensions`, and the deploy of 2026-09-11 failed
  // with "refers to a page that cannot be found" while the key check said
  // everything matched.
  const orphans = keys.filter((k) => !hasPage(k));
  if (orphans.length)
    console.log(`${lang}: keys with no page [${orphans.join(", ")}]`);
}
