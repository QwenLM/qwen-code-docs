import fs from "node:fs";
import path from "node:path";
import { normalizeHref, type BlogPost } from "./blog-utils";

/**
 * 服务端专用：frontmatter 缺少 date 时，回退到文件创建日期。
 * 依赖 node:fs，只能被 server component 引用（不要进客户端 bundle）。
 */
export function fileCreationDate(route: string): string {
  try {
    const rel = normalizeHref(route).replace(/^\//, "");
    for (const ext of [".mdx", ".md"]) {
      const filePath = path.join(process.cwd(), "content", `${rel}${ext}`);
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      const created =
        stat.birthtime.getFullYear() >= 2000 ? stat.birthtime : stat.mtime;
      return created.toISOString().slice(0, 10);
    }
  } catch {
    // 解析失败时返回空字符串，交由调用方兜底
  }
  return "";
}

export function withFileDates(posts: BlogPost[]): BlogPost[] {
  return posts.map((p) => (p.date ? p : { ...p, date: fileCreationDate(p.route) }));
}
