/* eslint-env node */

import type { Metadata } from "next";
import { Layout, Link, Navbar } from "nextra-theme-docs";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { LanguageDropdown } from "../../src/components/language-dropdown";
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
  // 用fs模块将sourcePageMap保存到本地

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
            className='ms-2 select-none font-extrabold flex items-center'
            title={`Qwen Code: AI Coding Agent`}
          >
            <img
              src='https://assets.alicdn.com/g/qwenweb/qwen-webui-fe/0.0.191/static/favicon.png'
              alt='Qwen Code'
              width={32}
              height={32}
              className='inline-block align-middle mr-2 '
              style={{ verticalAlign: "middle" }}
            />
            <span className='text-[1.3rem]  font-normal align-middle mr-1 max-md:hidden'>
              Qwen
            </span>
            <span className='text-[1.3rem] font-normal align-middle max-md:hidden'>
              Code
            </span>
          </span>
        </>
      }
      projectLink='https://github.com/QwenLM/qwen-code'
    >
      <LanguageDropdown currentLang={lang} />
    </Navbar>
  );

  return (
    <Layout
      // banner={banner}
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
      pageMap={sourcePageMap}
      nextThemes={{ defaultTheme: "light" }}
    >
      {children}
    </Layout>
  );
};

export default LanguageLayout;
