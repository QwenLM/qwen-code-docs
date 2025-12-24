/* eslint-env node */

import type { Metadata } from "next";
import Script from "next/script";
import { Head } from "nextra/components";
import type { FC, ReactNode } from "react";
import "nextra-theme-docs/style.css";
import { FontLoader } from "../src/components/font-loader";

const SITE_NAME = "Qwen Code Docs";
const DEFAULT_TITLE = "Qwen Code: AI Coding Agent Documentation";
const DESCRIPTION =
  "Multilingual documentation for Qwen Code: an open-source AI coding agent. Learn installation, IDE integration, MCP servers, workflows, automation, and best practices.";

const KEYWORDS = [
  "Qwen Code",
  "Qwen",
  "AI coding agent",
  "AI developer tools",
  "documentation",
  "open source",
  "Next.js",
  "Nextra",
  "MCP",
  "Model Context Protocol",
  "IDE integration",
  "workflow automation",
  "Alibaba",
  "阿里巴巴",
  "通义千问",
  "千问",
  "大模型",
];

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
  keywords: KEYWORDS,
  metadataBase: new URL(getSiteUrl()),
  alternates: {
    canonical: "/",
    languages: {
      en: "/en/",
      zh: "/zh/",
      de: "/de/",
      fr: "/fr/",
      ru: "/ru/",
      ja: "/ja/",
      "pt-BR": "/pt-BR/",
    },
  },
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
        url: "/assets/qwen-screenshot.png",
        alt: "Qwen Code Docs",
      },
    ],
  },
  twitter: {
    site: "@qwenLLM",
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DESCRIPTION,
    images: ["/assets/qwen-screenshot.png"],
  },
  appleWebApp: {
    title: "Qwen Code",
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    shortcut: ["/favicon.png"],
    apple: [{ url: "/favicon.png", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
  other: {
    "msapplication-TileColor": "#fff",
  },
};

type LayoutProps = Readonly<{
  children: ReactNode;
}>;

const RootLayout: FC<LayoutProps> = ({ children }) => {
  return (
    <html lang='en' suppressHydrationWarning>
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
        <Script
          src='//g.alicdn.com/aes/??tracker/3.3.14/index.js,tracker-plugin-pv/3.0.6/index.js,tracker-plugin-event/3.0.0/index.js,tracker-plugin-jserror/3.0.3/index.js,tracker-plugin-api/3.2.2/index.js,tracker-plugin-resourceError/3.0.5/index.js,tracker-plugin-perf/3.1.3/index.js,tracker-plugin-eventTiming/3.0.0/index.js'
          strategy='beforeInteractive'
        />
        <Script id='aes-init' strategy='afterInteractive'>
          {`
            const aes = new AES({
              pid: "qwen-code-docs"
            });
            aes.use([AESPluginPV, AESPluginEvent, AESPluginJSError, AESPluginAPI, AESPluginResourceError, AESPluginPerf, AESPluginEventTiming]);
          `}
        </Script>
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
        <FontLoader />
        {children}
      </body>
    </html>
  );
};

export default RootLayout;
