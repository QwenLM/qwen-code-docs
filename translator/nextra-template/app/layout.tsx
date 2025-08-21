/* eslint-env node */

import type { Metadata } from "next";
import { Head } from "nextra/components";
import type { FC, ReactNode } from "react";
import "nextra-theme-docs/style.css";

export const metadata: Metadata = {
  description: "x",
  title: {
    absolute: "",
    template: "%s | ",
  },
  metadataBase: new URL("https://swr.vercel.app"),
  openGraph: {
    images:
      "https://assets.vercel.com/image/upload/v1572282926/swr/twitter-card.jpg",
  },
  twitter: {
    site: "@vercel",
  },
  appleWebApp: {
    title: "SWR",
  },
  other: {
    "msapplication-TileColor": "#fff",
  },
};

type LayoutProps = Readonly<{
  children: ReactNode;
}>;

const RootLayout: FC<LayoutProps> = ({ children }) => {
  return (
    <html suppressHydrationWarning>
      <Head
        backgroundColor={{
          dark: "rgb(15,23,42)",
          light: "rgb(254, 252, 232)",
        }}
        color={{
          hue: { dark: 120, light: 0 },
          saturation: { dark: 100, light: 100 },
        }}
      />
      <body>{children}</body>
    </html>
  );
};

export default RootLayout;
