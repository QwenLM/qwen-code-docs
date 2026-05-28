/* eslint-env node */

import type { Metadata } from "next";
import Script from "next/script";
import { Head } from "nextra/components";
import type { FC, ReactNode } from "react";
import "nextra-theme-docs/style.css";
import "../src/styles/globals.css";
import { FontLoader } from "../src/components/font-loader";
import { ThemeProvider } from "../src/components/theme-provider";
import { getSiteStructuredData, stringifyJsonLd } from "../src/lib/structured-data";
import { withBasePath } from "../src/lib/utils";

const SITE_NAME = "Qwen Code Docs";
const DEFAULT_TITLE = "Qwen Code: AI Coding Agent Documentation";
const DESCRIPTION =
  "Multilingual documentation for Qwen Code: an open-source AI coding agent. Learn installation, IDE integration, MCP servers, workflows, automation, and best practices.";


function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const ghRepo = process.env.GITHUB_REPOSITORY; // e.g. owner/repo
  if (ghRepo && ghRepo.includes("/")) {
    const [owner, repo] = ghRepo.split("/");
    if (owner && repo) return `https://${owner}.github.io/${repo}`;
  }

  return "https://qwenlm.github.io/qwen-code-docs";
}

export const metadata: Metadata = {
  applicationName: SITE_NAME,
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  metadataBase: new URL(getSiteUrl()),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [
      {
        url: "https://img.alicdn.com/imgextra/i2/O1CN01lEez1C1UXsNllvx1A_!!6000000002528-2-tps-1600-900.png",
        alt: "Qwen Code Docs",
      },
    ],
  },
  twitter: {
    site: "@qwenLLM",
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DESCRIPTION,
    images: ["https://img.alicdn.com/imgextra/i2/O1CN01lEez1C1UXsNllvx1A_!!6000000002528-2-tps-1600-900.png"],
  },
  appleWebApp: {
    title: "Qwen Code",
  },
  icons: {
    icon: [{ url: withBasePath("/favicon.png"), type: "image/png" }],
    shortcut: [withBasePath("/favicon.png")],
    apple: [{ url: withBasePath("/favicon.png"), type: "image/png" }],
  },
  manifest: withBasePath("/site.webmanifest"),
  other: {
    "msapplication-TileColor": "#fff",
  },
};

type LayoutProps = Readonly<{
  children: ReactNode;
}>;

const RootLayout: FC<LayoutProps> = ({ children }) => {
  const siteUrl = getSiteUrl();

  return (
    <html suppressHydrationWarning>
      <Head
        // backgroundColor={{
        //   dark: "rgb(15,23,42)",
        //   light: "rgb(254, 252, 232)",
        // }}
        color={{
          hue: { dark: 248, light: 248 },
          saturation: { dark: 74, light: 74 },
        }}
      />
      <body>
        {/* Google Analytics */}
        <Script
          src='https://www.googletagmanager.com/gtag/js?id=G-RVBGJ3Q97S'
          strategy='afterInteractive'
        />
        <Script id='google-analytics' strategy='afterInteractive'>
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-RVBGJ3Q97S');
          `}
        </Script>
        <Script
          id='site-structured-data'
          type='application/ld+json'
          strategy='beforeInteractive'
          dangerouslySetInnerHTML={{
            __html: stringifyJsonLd(getSiteStructuredData(siteUrl)),
          }}
        />
        <FontLoader />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
