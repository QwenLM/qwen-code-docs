/* eslint-env node */

import type { Metadata } from "next";
import { Layout, Link, Navbar } from "nextra-theme-docs";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { LanguageDropdown } from "../../src/components/language-dropdown";
import { ThemeToggle } from "../../src/components/theme-toggle";
import { GitHubStarLink } from "../../src/components/github-star-link";
import { Search } from "../../src/components/search";
import NextLink from "next/link";
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
  // 用 fs 模块将 sourcePageMap 保存到本地

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
            className='ms-2 select-none font-extrabold flex shrink-0 items-center whitespace-nowrap'
            title={`Qwen Code: AI Coding Agent`}
          >
            <img
              src='/favicon.png'
              alt='Qwen Code'
              width={32}
              height={32}
              className='inline-block align-middle mr-2'
              style={{ verticalAlign: "middle" }}
            />
            <span className='text-[1.3rem]  font-normal align-middle mr-1 max-xl:hidden'>
              Qwen
            </span>
            <span className='text-[1.3rem] font-normal align-middle max-xl:hidden'>
              Code
            </span>
          </span>
        </>
      }
      className='qwen-docs-navbar'
    >
      <Search placeholder={
    lang === "zh" ? "搜索文档..." :
    lang === "ja" ? "ドキュメントを検索..." :
    lang === "de" ? "Dokumentation durchsuchen..." :
    lang === "fr" ? "Rechercher dans la documentation..." :
    lang === "ru" ? "Поиск в документации..." :
    lang === "pt-BR" ? "Pesquisar documentação..." :
    "Search documentation..."
  } lang={lang} className='shrink-0' />
      <LanguageDropdown currentLang={lang} compactOnTablet className='max-md:hidden shrink-0' />
      <GitHubStarLink projectLink='https://github.com/QwenLM/qwen-code' className='max-md:hidden shrink-0' />
      <ThemeToggle />
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
        { locale: "pt-BR", name: "Português (BR)" },
      ]}
      search={false}
      sidebar={{ defaultMenuCollapseLevel: 1 }}
      pageMap={sourcePageMap}
      nextThemes={{ defaultTheme: "light" }}
    >
      {children}
    </Layout>
  );
};

export default LanguageLayout;
