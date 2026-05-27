import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "../../../mdx-components";
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

// 移除 TS 类型，仅用 JS 语法
export async function generateMetadata(props) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath, params.lang);

  const mdxPath = Array.isArray(params.mdxPath) ? params.mdxPath.join("/") : (params.mdxPath || "");
  const pagePath = mdxPath ? `/${mdxPath}/` : "/";

  // 动态生成 hreflang，指向当前页面的各语言版本
  const languages = {};
  for (const locale of LOCALES) {
    languages[locale] = `/${locale}${pagePath}`;
  }
  // 无匹配语言时默认展示英文版本
  languages["x-default"] = `/en${pagePath}`;

  // 覆盖 title、openGraph 和 twitter，让分享时显示正确的标题和图片
  return {
    ...metadata,
    title: {
      default: metadata.title,
      template: '%s', // 不添加后缀
    },
    alternates: {
      canonical: `/${params.lang}${pagePath}`,
      languages,
    },
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      ...(metadata.image ? { images: [{ url: metadata.image }] } : {}),
    },
    twitter: {
      title: metadata.title,
      description: metadata.description,
      ...(metadata.image ? { images: [metadata.image] } : {}),
    },
  };
}

// 不再声明 TS 类型
const Wrapper = getMDXComponents().wrapper;

const Page = async (props) => {
  const params = await props.params;
  const result = await importPage(params.mdxPath, params.lang);
  const { default: MDXContent, toc, metadata, sourceCode } = result;

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
};

export default Page;
