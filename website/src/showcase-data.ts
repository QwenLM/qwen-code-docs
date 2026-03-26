import showcases from "../showcases.json";

export interface ShowcaseItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  link: string;
  category: string;
  feature: string;
}

export const featuredItems: ShowcaseItem[] = showcases.map((item, index) => ({
  id: String(index + 1),
  title: item.title,
  description: item.description,
  thumbnail: item.thumbnail,
  link: item.link,
  category: getCategoryFromSlug(item.category),
  feature: item.features?.[0] || "AI 编程",
}));

function getCategoryFromSlug(slug: string): string {
  const categoryMap: Record<string, string> = {
    setup: "入门指南",
    search: "网络搜索",
    development: "编程开发",
    skills: "Skills",
    data: "数据分析",
    daily: "日常任务",
  };
  return categoryMap[slug] || slug;
}

export const texts = {
  pageTitle: "Qwen Code Showcases",
  pageSubtitle: "从真实项目案例中学习 Qwen Code，掌握 AI 编程最佳实践",
  searchPlaceholder: "搜索案例...",
  emptyState: "未找到匹配的案例，尝试其他搜索词或筛选条件",
  learningPathTitle: "学习路径",
  learningPathSubtitle: "根据你的经验水平选择合适的学习路径",
};

export const learningPaths = [
  {
    id: "beginner",
    title: "新手入门",
    description: "零基础开始使用 Qwen Code",
    icon: "⚡",
    items: [
      { title: "脚本一键安装", link: "/zh/showcase/script-install/" },
      { title: "API 设置", link: "/zh/showcase/api-setup/" },
      { title: "开始第一次对话", link: "/zh/showcase/first-conversation/" },
    ],
  },
  {
    id: "intermediate",
    title: "进阶提升",
    description: "掌握高级功能和技巧",
    icon: "📖",
    items: [
      { title: "Web Search 网络搜索", link: "/zh/showcase/web-search/" },
      { title: "代码学习", link: "/zh/showcase/code-learning/" },
      { title: "解决 issue", link: "/zh/showcase/solve-issue/" },
    ],
  },
  {
    id: "advanced",
    title: "实战应用",
    description: "在真实项目中应用 AI",
    icon: "👥",
    items: [
      { title: "数据可视化仪表盘", link: "/zh/showcase/data-dashboard/" },
      { title: "批量处理文件", link: "/zh/showcase/batch-file-organize/" },
      { title: "搭建个人网站", link: "/zh/showcase/build-portfolio-site/" },
    ],
  },
];
