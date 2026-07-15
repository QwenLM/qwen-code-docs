import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLocaleFromPathname } from "./locale-path";

describe("getLocaleFromPathname", () => {
  it("finds a locale after the production base path", () => {
    assert.equal(
      getLocaleFromPathname(
        "/qwen-code-docs/fr/users/overview/",
        "/qwen-code-docs"
      ),
      "fr"
    );
  });

  it("finds a locale when the site runs without a base path", () => {
    assert.equal(getLocaleFromPathname("/pt-BR/blog/"), "pt-BR");
  });

  it("returns undefined when the path has no supported locale", () => {
    assert.equal(getLocaleFromPathname("/qwen-code-docs/"), undefined);
  });
});
