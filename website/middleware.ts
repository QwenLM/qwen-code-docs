export { middleware } from "nextra/locales";

export const config = {
  // Matcher ignoring `/_next/` and `/api/`
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|favicon.png|icon.svg|apple-icon.png|manifest|robots.txt|sitemap.xml|_pagefind).*)",
  ],
};
