import MarkdownIt from "markdown-it";

/**
 * Markdown文档解析器
 * 解析Markdown文档结构，提取可翻译内容，保留格式信息
 */

export interface DocumentSection {
  type:
    | "paragraph"
    | "heading"
    | "code"
    | "blockquote"
    | "list"
    | "table"
    | "html"
    | "link";
  content: string;
  metadata: Record<string, any>;
  startLine: number;
  endLine: number;
  level?: number; // for headings
}

export interface DocumentStructure {
  frontmatter: string | null;
  toc: Array<{
    level: number;
    title: string;
    anchor: string;
  }>;
  metadata: Record<string, any>;
}

export interface ParsedContent {
  sections: DocumentSection[];
  structure: DocumentStructure;
  originalContent: string;
}

export interface LinkInfo {
  text: string;
  url: string;
  full: string;
}

export interface ImageInfo {
  alt: string;
  src: string;
  full: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 解析Markdown文档
 */
export function parseMarkdown(content: string): ParsedContent {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  const tokens = md.parse(content, {});
  const sections: DocumentSection[] = [];
  const structure: DocumentStructure = {
    frontmatter: null,
    toc: [],
    metadata: {},
  };

  let currentSection: DocumentSection = {
    type: "paragraph",
    content: "",
    metadata: {},
    startLine: 0,
    endLine: 0,
  };

  // 提取frontmatter
  if (content.startsWith("---")) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      structure.frontmatter = frontmatterMatch[1];
      content = content.replace(frontmatterMatch[0], "").trim();
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case "heading_open":
        // 保存之前的section
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }

        // 开始新的标题section
        const level = parseInt(token.tag.replace("h", ""));
        const nextToken = tokens[i + 1];
        const headingContent =
          nextToken && nextToken.type === "inline" ? nextToken.content : "";

        currentSection = {
          type: "heading",
          level: level,
          content: headingContent,
          metadata: {
            tag: token.tag,
            anchor: generateAnchor(headingContent),
          },
          startLine: token.map ? token.map[0] : 0,
          endLine: token.map ? token.map[1] : 0,
        };

        // 添加到目录结构
        structure.toc.push({
          level,
          title: headingContent,
          anchor: generateAnchor(headingContent),
        });

        i++; // 跳过inline token
        break;

      case "paragraph_open":
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }

        currentSection = {
          type: "paragraph",
          content: "",
          metadata: {},
          startLine: token.map ? token.map[0] : 0,
          endLine: token.map ? token.map[1] : 0,
        };
        break;

      case "fence":
      case "code_block":
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }

        sections.push({
          type: "code",
          content: token.content,
          metadata: {
            language: token.info || "",
            fence: token.markup || "```",
          },
          startLine: token.map ? token.map[0] : 0,
          endLine: token.map ? token.map[1] : 0,
        });

        currentSection = {
          type: "paragraph",
          content: "",
          metadata: {},
          startLine: 0,
          endLine: 0,
        };
        break;

      case "blockquote_open":
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }

        currentSection = {
          type: "blockquote",
          content: "",
          metadata: {},
          startLine: token.map ? token.map[0] : 0,
          endLine: token.map ? token.map[1] : 0,
        };
        break;

      case "inline":
        if (token.content) {
          currentSection.content += token.content;
        }
        break;

      case "list_item_open":
        if (currentSection.type !== "list") {
          if (currentSection.content.trim()) {
            sections.push({ ...currentSection });
          }

          currentSection = {
            type: "list",
            content: "",
            metadata: {
              ordered:
                tokens[i - 1] && tokens[i - 1].type === "ordered_list_open",
            },
            startLine: token.map ? token.map[0] : 0,
            endLine: token.map ? token.map[1] : 0,
          };
        }
        break;

      case "table_open":
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }

        currentSection = {
          type: "table",
          content: "",
          metadata: {},
          startLine: token.map ? token.map[0] : 0,
          endLine: token.map ? token.map[1] : 0,
        };
        break;

      case "html_block":
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }

        sections.push({
          type: "html",
          content: token.content,
          metadata: {},
          startLine: token.map ? token.map[0] : 0,
          endLine: token.map ? token.map[1] : 0,
        });

        currentSection = {
          type: "paragraph",
          content: "",
          metadata: {},
          startLine: 0,
          endLine: 0,
        };
        break;

      default:
        // 处理其他token类型
        if (token.content) {
          currentSection.content += token.content;
        }
        break;
    }
  }

  // 添加最后一个section
  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return {
    sections: sections.filter(
      (section) => section.content.trim() || section.type === "code"
    ),
    structure,
    originalContent: content,
  };
}

/**
 * 重构翻译后的文档
 */
export function reconstructDocument(
  translatedSections: DocumentSection[],
  structure: DocumentStructure
): string {
  let result = "";

  // 添加frontmatter
  if (structure.frontmatter) {
    result += `---\n${structure.frontmatter}\n---\n\n`;
  }

  for (const section of translatedSections) {
    switch (section.type) {
      case "heading":
        result += `${"#".repeat(section.level || 1)} ${section.content}\n\n`;
        break;

      case "paragraph":
        result += `${section.content}\n\n`;
        break;

      case "code":
        const language = section.metadata.language || "";
        const fence = section.metadata.fence || "```";
        result += `${fence}${language}\n${section.content}\n${fence}\n\n`;
        break;

      case "blockquote":
        const quotedLines = section.content
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        result += `${quotedLines}\n\n`;
        break;

      case "list":
        const listLines = section.content
          .split("\n")
          .filter((line) => line.trim());
        const listPrefix = section.metadata.ordered ? "1. " : "- ";
        const formattedList = listLines
          .map((line) => `${listPrefix}${line}`)
          .join("\n");
        result += `${formattedList}\n\n`;
        break;

      case "table":
        result += `${section.content}\n\n`;
        break;

      case "html":
        result += `${section.content}\n\n`;
        break;

      default:
        result += `${section.content}\n\n`;
        break;
    }
  }

  return result.trim();
}

/**
 * 生成锚点链接
 */
export function generateAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff-]/g, "") // 保留中文字符
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 提取文档中的链接
 */
export function extractLinks(content: string): LinkInfo[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: LinkInfo[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
      full: match[0],
    });
  }

  return links;
}

/**
 * 提取文档中的图片
 */
export function extractImages(content: string): ImageInfo[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: ImageInfo[] = [];
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    images.push({
      alt: match[1],
      src: match[2],
      full: match[0],
    });
  }

  return images;
}

/**
 * 验证Markdown语法
 */
export function validateMarkdown(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查未闭合的代码块
  const codeBlockMatches = content.match(/```/g);
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    errors.push("发现未闭合的代码块");
  }

  // 检查未闭合的链接
  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    warnings.push("链接括号数量不匹配");
  }

  // 检查空的标题
  const emptyHeaders = content.match(/^#+\s*$/gm);
  if (emptyHeaders) {
    warnings.push("发现空标题");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
