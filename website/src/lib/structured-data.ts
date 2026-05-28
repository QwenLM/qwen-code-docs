type JsonLdGraphNode = Record<string, unknown>;

const ORGANIZATION_ID = "#organization";
const WEBSITE_ID = "#website";

export function getSiteStructuredData(siteUrl: string) {
  const organizationId = `${siteUrl}${ORGANIZATION_ID}`;
  const websiteId = `${siteUrl}${WEBSITE_ID}`;

  const graph: JsonLdGraphNode[] = [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "Qwen",
      url: "https://qwen.ai/qwencode",
      sameAs: [
        "https://github.com/QwenLM/qwen-code",
        "https://x.com/Alibaba_Qwen",
      ],
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: "Qwen Code Docs",
      url: "https://qwenlm.github.io/qwen-code-docs/en/users/overview/",
      description:
        "Multilingual documentation for Qwen Code: an open-source AI coding agent.",
      publisher: {
        "@id": organizationId,
      },
      inLanguage: ["en", "zh", "de", "fr", "ru", "ja", "pt-BR"],
    },
  ];

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

function formatBreadcrumbName(segment: string) {
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getBreadcrumbStructuredData(
  siteUrl: string,
  lang: string,
  mdxPath: string[],
  title?: string
) {
  const items = [
    {
      name: "Qwen Code Docs",
      item: `${siteUrl}/`,
    },
    {
      name: lang,
      item: `${siteUrl}/${lang}/`,
    },
  ];

  let currentPath = `/${lang}`;
  mdxPath.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === mdxPath.length - 1;
    items.push({
      name: isLast && title ? title : formatBreadcrumbName(segment),
      item: `${siteUrl}${currentPath}/`,
    });
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

type BlogPostingInput = {
  siteUrl: string;
  lang: string;
  mdxPath: string[];
  title?: string;
  description?: string;
  date?: string;
  author?: string;
  image?: string;
};

export function getBlogPostingStructuredData({
  siteUrl,
  lang,
  mdxPath,
  title,
  description,
  date,
  author,
  image,
}: BlogPostingInput) {
  const url = `${siteUrl}/${lang}/${mdxPath.join("/")}/`;
  const organizationId = `${siteUrl}${ORGANIZATION_ID}`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    ...(date ? { datePublished: date, dateModified: date } : {}),
    author: {
      "@type": "Organization",
      name: author || "Qwen Team",
    },
    publisher: {
      "@id": organizationId,
    },
    ...(image ? { image } : {}),
    inLanguage: lang,
  };
}

export function stringifyJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
