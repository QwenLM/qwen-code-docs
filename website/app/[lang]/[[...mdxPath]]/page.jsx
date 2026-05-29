import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "../../../mdx-components";
import {
  getBlogPostingStructuredData,
  getBreadcrumbStructuredData,
  stringifyJsonLd,
} from "../../../src/lib/structured-data";
import fs from "node:fs";
import path from "node:path";
import "./index.css";

export const generateStaticParams = async () => {
  const originalGenerateParams = generateStaticParamsFor("mdxPath");
  const params = await originalGenerateParams();
  // 过滤掉图片文件路径
  return params.filter((param) => {
    const path = Array.isArray(param.mdxPath)
      ? param.mdxPath.join("/")
      : param.mdxPath || "";
    return !path.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i);
  });
};

const LOCALES = ["en", "zh", "de", "fr", "ru", "ja", "pt-BR"];

// OG 图片映射
const OG_IMAGE_MAP = {
  blog: "/assets/og-blog.png",
  showcase: "/assets/og-showcase.png",
};

const DEFAULT_OG_DIRS = ["users", "developers", "design", "plans"];
const DEFAULT_OG_IMAGE = "/assets/og-default.png";
const EXCERPT_MAX_LENGTH = 160;

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const ghRepo = process.env.GITHUB_REPOSITORY;
  if (ghRepo && ghRepo.includes("/")) {
    const [owner, repo] = ghRepo.split("/");
    if (owner && repo) return `https://${owner}.github.io/${repo}`;
  }

  return "https://qwenlm.github.io/qwen-code-docs";
}

function getOgImage(mdxPath) {
  const path = Array.isArray(mdxPath) ? mdxPath.join("/") : (mdxPath || "");
  
  // 优先匹配特定目录的图片
  for (const [dir, image] of Object.entries(OG_IMAGE_MAP)) {
    if (path.startsWith(dir)) return image;
  }
  
  // 默认目录使用默认图片，其他目录使用品牌兜底图
  if (DEFAULT_OG_DIRS.some((dir) => path.startsWith(dir))) {
    return DEFAULT_OG_IMAGE;
  }
  
  return "/assets/og-fallback-brand.png";
}

function getContentFile(lang, mdxPath) {
  const segments = Array.isArray(mdxPath) ? mdxPath : mdxPath ? [mdxPath] : [];
  const relativePath = segments.length > 0 ? path.join(...segments) : "index";
  const contentRoot = path.join(process.cwd(), "content", lang);

  for (const extension of [".mdx", ".md"]) {
    const filePath = path.join(contentRoot, `${relativePath}${extension}`);
    if (fs.existsSync(filePath)) return filePath;
  }

  return null;
}

function stripFrontmatter(source) {
  if (!source.startsWith("---")) return source;
  const end = source.indexOf("\n---", 3);
  return end === -1 ? source : source.slice(end + 4);
}

function cleanMarkdownText(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/^#+\s*/g, "")
    .replace(/^[-*+]\s+/g, "")
    .replace(/^\d+\.\s+/g, "")
    .replace(/^>\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateExcerpt(text) {
  if ([...text].length <= EXCERPT_MAX_LENGTH) return text;

  const truncated = [...text].slice(0, EXCERPT_MAX_LENGTH).join("");
  const sentenceEnd = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("。"),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("！"),
    truncated.lastIndexOf("?"),
    truncated.lastIndexOf("？")
  );

  if (sentenceEnd >= 80) return truncated.slice(0, sentenceEnd + 1);
  return `${truncated.replace(/[,.，。;；:：!?！？\s]+$/u, "")}...`;
}

function getExcerptFromContent(lang, mdxPath) {
  const filePath = getContentFile(lang, mdxPath);
  if (!filePath) return undefined;

  const source = stripFrontmatter(fs.readFileSync(filePath, "utf8"))
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "");

  const paragraphs = [];
  let current = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      continue;
    }

    if (
      line.startsWith("#") ||
      line.startsWith("import ") ||
      line.startsWith("export ") ||
      line.startsWith("<") ||
      line.startsWith("|") ||
      line.startsWith("{") ||
      line === "---"
    ) {
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) paragraphs.push(current.join(" "));

  for (const paragraph of paragraphs) {
    const cleaned = cleanMarkdownText(paragraph);
    if ([...cleaned].length >= 40) return truncateExcerpt(cleaned);
  }

  const fallback = paragraphs.map(cleanMarkdownText).find(Boolean);
  return fallback ? truncateExcerpt(fallback) : undefined;
}

// 移除 TS 类型，仅用 JS 语法
export async function generateMetadata(props) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath, params.lang);

  const mdxPath = Array.isArray(params.mdxPath) ? params.mdxPath.join("/") : (params.mdxPath || "");
  const pagePath = mdxPath ? `/${mdxPath}/` : "/";
  const canonicalPath =
    pagePath === "/" ? `/${params.lang}/users/overview/` : `/${params.lang}${pagePath}`;

  // 动态生成 hreflang，指向当前页面的各语言版本
  const languages = {};
  for (const locale of LOCALES) {
    languages[locale] =
      pagePath === "/" ? `/${locale}/users/overview/` : `/${locale}${pagePath}`;
  }
  // 无匹配语言时默认展示英文版本
  languages["x-default"] = pagePath === "/" ? "/en/users/overview/" : `/en${pagePath}`;

  // 获取 OG 图片（优先使用页面自定义图片，否则根据目录映射）
  const ogImage = metadata.image || getOgImage(mdxPath) || undefined;
  const description =
    metadata.description || getExcerptFromContent(params.lang, params.mdxPath);

  // 覆盖 title、openGraph 和 twitter，让分享时显示正确的标题和图片
  return {
    ...metadata,
    ...(description ? { description } : {}),
    title: {
      default: metadata.title,
      template: '%s', // 不添加后缀
    },
    alternates: {
      canonical: canonicalPath,
      languages,
    },
    openGraph: {
      title: metadata.title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      title: metadata.title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

// 不再声明 TS 类型
const Wrapper = getMDXComponents().wrapper;

const Page = async (props) => {
  const params = await props.params;
  const result = await importPage(params.mdxPath, params.lang);
  const { default: MDXContent, toc, metadata, sourceCode } = result;
  const mdxPath = Array.isArray(params.mdxPath) ? params.mdxPath : [];
  const isLanguageIndex = mdxPath.length === 0;
  const siteUrl = getSiteUrl();
  const description =
    metadata.description || getExcerptFromContent(params.lang, params.mdxPath);

  if (isLanguageIndex) {
    return (
      <>
        <meta httpEquiv="refresh" content="0;url=./users/overview/" />
        <script
          dangerouslySetInnerHTML={{
            __html: 'window.location.replace("./users/overview/");',
          }}
        />
        <a href="./users/overview/">Continue to Qwen Code documentation</a>
      </>
    );
  }

  const breadcrumbStructuredData = getBreadcrumbStructuredData(
    siteUrl,
    params.lang,
    mdxPath,
    metadata.title
  );
  const isBlogIndex = mdxPath[0] === "blog" && mdxPath.length === 1;
  const isBlogPost = mdxPath[0] === "blog" && mdxPath.length > 1;
  const blogPostingStructuredData = isBlogPost
    ? getBlogPostingStructuredData({
        siteUrl,
        lang: params.lang,
        mdxPath,
        title: metadata.title,
        description,
        date: metadata.date,
        author: metadata.author,
        image: metadata.image,
      })
    : null;

  return (
    <div className={isBlogIndex ? "blog-index-page" : undefined}>
      <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: stringifyJsonLd(breadcrumbStructuredData),
          }}
        />
        {blogPostingStructuredData ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: stringifyJsonLd(blogPostingStructuredData),
            }}
          />
        ) : null}
        <MDXContent {...props} params={params} />
      </Wrapper>
    </div>
  );
};

export default Page;
