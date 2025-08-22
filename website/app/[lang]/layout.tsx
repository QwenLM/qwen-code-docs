/* eslint-env node */

import type { Metadata } from "next";
import { Layout, Link, LocaleSwitch, Navbar } from "nextra-theme-docs";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import type { FC, ReactNode } from "react";

type LayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{
    lang: string;
  }>;
}>;

const LanguageLayout: FC<LayoutProps> = async ({ children, params }) => {
  const { lang } = await params;
  console.log("Language Layout - lang:", lang);

  let sourcePageMap = await getPageMap(`/${lang}`);
  //@ts-ignore
  const { children: pageMap } = sourcePageMap.find((page) => {
    //@ts-ignore
    return page.name === lang;
  });

  console.log("pageMap", pageMap);

  const banner = (
    <Banner storageKey='qwen-code-announce'>
      🚀 Free 2000 requests per day! Qwen Code AI coding agent is now open
      source! <Link href='/'>Learn more →</Link>
    </Banner>
  );

  const navbar = (
    <Navbar
      logo={
        <>
          <span
            className='ms-2 select-none font-extrabold max-md:hidden'
            title={`Qwen Code: AI Coding Agent`}
          >
            Qwen Code
          </span>
        </>
      }
      projectLink='https://github.com/QwenLM/qwen-code'
      chatLink='https://github.com/QwenLM/qwen-code/discussions'
    >
      <LocaleSwitch lite />
    </Navbar>
  );

  return (
    <Layout
      banner={banner}
      navbar={navbar}
      footer={null}
      docsRepositoryBase='https://github.com/QwenLM/qwen-code/blob/main/docs'
      i18n={[
        { locale: "en", name: "English" },
        { locale: "zh", name: "中文" },
        { locale: "de", name: "Deutsch" },
        { locale: "fr", name: "Français" },
        { locale: "ru", name: "Русский" },
        { locale: "ja", name: "日本語" },
      ]}
      sidebar={{
        defaultMenuCollapseLevel: 1,
        autoCollapse: true,
      }}
      pageMap={pageMap}
      nextThemes={{ defaultTheme: "light" }}
    >
      {children}
    </Layout>
  );
};

export default LanguageLayout;
