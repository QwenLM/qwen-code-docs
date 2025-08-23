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
    site: "@qwenLLM",
  },
  appleWebApp: {
    title: "Qwen Code",
  },
  other: {
    "msapplication-TileColor": "#fff",
  },
};

type LayoutProps = Readonly<{
  children: ReactNode;
}>;

const RootLayout: FC<LayoutProps> = ({ children }) => {
  // 根据环境设置字体路径前缀
  const isProduction = process.env.NODE_ENV === "production";
  const fontPrefix = isProduction ? "/qwen-code-docs" : "";

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
      <body style={{ "--font-prefix": fontPrefix } as React.CSSProperties}>
        {children}
      </body>
    </html>
  );
};

export default RootLayout;
