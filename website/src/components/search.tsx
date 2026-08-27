"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import cn from "clsx";
import { addBasePath } from "next/dist/client/add-base-path";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue } from "react";
import { Search as SearchIcon } from "lucide-react";

// Declare pagefind on window for TypeScript
declare global {
  interface Window {
    pagefind?: {
      options: (opts: { baseUrl: string; ranking?: Record<string, number> }) => Promise<void>;
      init: () => Promise<void>;
      destroy: () => void;
    };
  }
}

interface SearchResult {
  url: string;
  title: string;
  excerpt: string;
  meta: {
    title: string;
  };
  sub_results: Array<{
    url: string;
    title: string;
    excerpt: string;
  }>;
}

interface SearchProps {
  placeholder?: string;
  className?: string;
  emptyResult?: string;
  loading?: string;
  errorText?: string;
  lang?: string; // 当前语言
}

// 初始化 Pagefind 并设置语言
let _pagefindInitialized = false;
let _currentLang: string | null = null;
const PAGEFIND_ENABLED = process.env.NODE_ENV === "production";

async function importPagefind() {
  if (typeof window === "undefined") return;
  if (!PAGEFIND_ENABLED) return;

  try {
    // @ts-ignore
    window.pagefind = await import(
      /* webpackIgnore: true */
      addBasePath("/_pagefind/pagefind.js")
    );
  } catch (error) {
    // Pagefind is only available after building the site
    console.warn("Pagefind not available in dev mode:", error);
  }
}

// 初始化 Pagefind 并设置语言
async function initPagefind(lang: string) {
  if (typeof window === "undefined") return;
  if (!PAGEFIND_ENABLED) return;

  // 重要！！！动态路由切换时，需要手动同步 html 的 lang 属性
  // 因为 pagefind 强依赖 document.querySelector("html").getAttribute("lang") 来决定加载哪个语言的索引
  document.documentElement.lang = lang;

  
  // @ts-ignore
  if (window.pagefind && _pagefindInitialized && _currentLang !== lang) {
    // @ts-ignore
    await window.pagefind.destroy();
    _pagefindInitialized = false;
  }

  // @ts-ignore
  if (!window.pagefind) {
    await importPagefind();
  } else {
  }

  // 只在首次初始化时（或 destroy 后重建时）设置 options 并加载对应语言
  if (!_pagefindInitialized && window.pagefind) {
    // @ts-ignore
    await window.pagefind.options({
      baseUrl: "/",
      // 优化搜索排名权重
      ranking: {
        pageLength: 0.1,
        termFrequency: 0.7,
        termSimilarity: 0.5,
      },
    });

    // @ts-ignore
    await window.pagefind.init();
    
    _pagefindInitialized = true;
    _currentLang = lang;
  }

}

// 防抖函数
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function Search({
  placeholder = "Search documentation…",
  className,
  emptyResult = "No results found.",
  loading = "Loading…",
  errorText = "Failed to load search index.",
  lang = "en",
}: SearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false); // IME 组合状态
  const [focused, setFocused] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  
  // 延迟搜索值
  const deferredQuery = useDeferredValue(query) || "";
  
  // 实际用于搜索的值（IME 组合时不搜索）
  const searchQuery = isComposing ? "" : deferredQuery;
  
  // 组件挂载
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 当语言变化时，重新初始化 Pagefind
  useEffect(() => {
    const reinitPagefind = async () => {
      
      // 同步 DOM lang，重新初始化 Pagefind
      await initPagefind(lang);
    };

    if (lang) {
      reinitPagefind();
    }
  }, [lang]);
  
  // 搜索函数
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // @ts-ignore
      if (!window.pagefind) {
        await initPagefind(lang);
      }

      // Check if pagefind is available (might not be in dev mode)
      // @ts-ignore
      if (!window.pagefind) {
        setIsLoading(false);
        return;
      }

        // 使用 search 方法而不是 debouncedSearch，以便更好地控制
        // @ts-ignore
        const response = await window.pagefind.search(searchQuery, {
          filters: {},
          sort: {},
          verbose: false,
        });

        if (!response) {
          setIsLoading(false);
          return;        }

        const data = await Promise.all(
          response.results.map((r: { data: () => Promise<SearchResult> }) => r.data())
        );
      // 处理 URL
      const processedResults = data.map((item: SearchResult) => ({
        ...item,
        sub_results: (item.sub_results || []).map((sub) => ({
          ...sub,
          url: sub.url.replace(/\.html$/, "").replace(/\.html#/, "#"),
        })),
      }));

      setResults(processedResults);
      setIsLoading(false);
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  }, [lang]);
  
  // 防抖搜索
  const debouncedSearch = useCallback(
    debounce((q: string) => performSearch(q), 300),
    [performSearch]
  );
  
  // 当 searchQuery 变化时触发搜索
  useEffect(() => {
    if (searchQuery) {
      debouncedSearch(searchQuery);
    } else {
      setResults([]);
      setError(null);
      setIsLoading(false);
    }
  }, [searchQuery, debouncedSearch]);
  
  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const isInput = el?.tagName === "INPUT" || 
                      el?.tagName === "TEXTAREA" || 
                      el?.tagName === "SELECT" ||
                      (el as HTMLElement)?.isContentEditable;
      
      if (isInput) return;
      
      if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  
  // IME 组合事件处理
  const handleCompositionStart = () => {
    setIsComposing(true);
  };
  
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    setIsComposing(false);
    // 组合结束后，使用最终值触发搜索
    const target = e.target as HTMLInputElement;
    setQuery(target.value);
  };
  
  // 输入处理
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    // 如果不在 IME 组合中，直接更新
    if (!isComposing) {
      // React 的 useDeferredValue 会处理防抖
    }
  };
  
  // 选择结果
  const handleSelect = (result: SearchResult | null) => {
    if (!result) return;
    
    inputRef.current?.blur();
    
    const [url, hash] = result.url.split("#");
    const isSamePathname = typeof window !== "undefined" && 
                           window.location.pathname === url;
    
    if (isSamePathname && hash) {
      window.location.href = `#${hash}`;
    } else {
      router.push(result.url);
    }
    
    setQuery("");
    setResults([]);
  };
  
  // 快捷键提示
  const shortcut = mounted ? (
    navigator.userAgent.includes("Mac") ? (
      <>
        <span className="x:text-xs">⌘</span>K
      </>
    ) : (
      "CTRL K"
    )
  ) : null;
  
  return (
    <Combobox onChange={handleSelect}>
      <div className={cn("nextra-search x:relative x:flex x:items-center max-md:!w-9 max-md:shrink-0", className)}>
        <SearchIcon
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-10 h-4 w-4 text-gray-500 dark:text-gray-400",
            focused
              ? "left-3 top-1/2 -translate-y-1/2 max-md:!fixed max-md:!left-7 max-md:!top-[30px] max-md:!z-[51] max-md:!-translate-y-1/2"
              : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:left-3 md:translate-x-0 max-md:!left-1/2 max-md:!top-1/2 max-md:!-translate-x-1/2 max-md:!-translate-y-1/2"
          )}
        />
        <ComboboxInput
          ref={inputRef}
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "x:rounded-lg x:py-2 x:transition-all",
            "x:pl-9 x:pr-3",
            "x:w-full x:md:w-56 x:lg:w-64 x:xl:w-72",
            "max-md:!h-9 max-md:!w-9 max-md:!px-0",
            focused && "max-md:!fixed max-md:!left-4 max-md:!right-4 max-md:!top-3 max-md:!z-50 max-md:!w-[calc(100vw-2rem)] max-md:!pl-9 max-md:!pr-3 max-md:!shadow-lg",
            "x:text-base x:leading-tight x:md:text-sm",
            focused ? "x:bg-transparent x:nextra-focus" : "x:bg-black/[.05] x:dark:bg-gray-50/10",
            "x:placeholder:text-gray-600 x:dark:placeholder:text-gray-400",
            !focused && "max-md:!text-transparent max-md:!placeholder:text-transparent",
            "x:contrast-more:border x:contrast-more:border-current",
            "x:appearance-none",
            "x:[&::-webkit-search-cancel-button]:appearance-none"
          )}
          spellCheck={false}
          autoComplete="off"
        />
        <kbd
          className={cn(
            "x:absolute x:my-1.5 x:select-none x:pointer-events-none x:end-1.5 x:transition-all",
            "x:h-5 x:rounded x:bg-nextra-bg x:px-1.5 x:font-mono x:text-[11px] x:font-medium x:text-gray-600 x:dark:text-gray-400",
            "x:border nextra-border",
            "x:contrast-more:text-current",
            "x:items-center x:gap-1 x:flex",
            "x:max-xl:hidden not-prose",
            (!mounted || focused) && "x:invisible x:opacity-0"
          )}
        >
          {shortcut}
        </kbd>
      </div>
      
      <ComboboxOptions
        anchor={{ to: "top end", gap: 10, padding: 16 }}
        transition
        className={cn(
          "nextra-search-results nextra-scrollbar x:max-md:h-full",
          "x:border x:border-gray-200 x:text-gray-100 x:dark:border-neutral-800",
          "x:z-30 x:rounded-xl x:py-2.5 x:shadow-xl",
          "x:contrast-more:border x:contrast-more:border-gray-900 x:contrast-more:dark:border-gray-50",
          "x:backdrop-blur-md x:bg-nextra-bg/70",
          "x:motion-reduce:transition-none",
          "x:origin-top x:transition x:duration-200 x:ease-out x:data-closed:scale-95 x:data-closed:opacity-0 x:empty:invisible",
          error || isLoading || !results.length
            ? "x:md:min-h-28 x:grow x:flex x:justify-center x:text-sm x:gap-2 x:px-8"
            : "x:md:max-h-[min(calc(100vh-5rem),400px)]!",
          "x:w-full x:md:w-[576px]"
        )}
      >
        {error ? (
          <div className="x:flex x:items-center x:gap-2 x:text-red-500">
            <span>⚠️</span>
            <div className="x:grid">
              <b className="x:mb-2">{errorText}</b>
              <span>{error}</span>
            </div>
          </div>
        ) : isLoading ? (
          <div className="x:flex x:items-center x:gap-2 x:text-gray-400">
            <span className="x:animate-spin">⏳</span>
            {loading}
          </div>
        ) : results.length > 0 ? (
          results.map((result) => (
            <div key={result.url}>
              <div className="x:mx-2.5 x:mb-2 x:not-first:mt-6 x:select-none x:border-b x:border-black/10 x:px-2.5 x:pb-1.5 x:text-xs x:font-semibold x:uppercase x:text-gray-600 x:dark:border-white/20 x:dark:text-gray-300">
                {result.meta?.title || ""}
              </div>
              {(result.sub_results || []).map((sub) => (
                <ComboboxOption
                  key={sub.url}
                  value={sub}
                  as={NextLink}
                  href={sub.url}
                  className={({ focus }: { focus: boolean }) =>
                    cn(
                      "x:mx-2.5 x:break-words x:rounded-md x:block x:scroll-m-12 x:px-2.5 x:py-2",
                      "x:contrast-more:border",
                      focus
                        ? "x:text-primary-600 x:contrast-more:border-current x:bg-primary-500/10"
                        : "x:text-gray-800 x:dark:text-gray-300 x:contrast-more:border-transparent"
                    )
                  }
                >
                  <div className="x:text-base x:font-semibold x:leading-5">
                    {sub.title}
                  </div>
                  <div
                    className="x:mt-1 x:text-sm x:leading-[1.35rem] x:text-gray-600 x:dark:text-gray-400 x:contrast-more:dark:text-gray-50 x:[&_mark]:bg-primary-600/80 x:[&_mark]:text-white"
                    dangerouslySetInnerHTML={{ __html: sub.excerpt }}
                  />
                </ComboboxOption>
              ))}
            </div>
          ))
        ) : searchQuery ? (
          <div className="x:text-gray-400">{emptyResult}</div>
        ) : null}
      </ComboboxOptions>
    </Combobox>
  );
}
