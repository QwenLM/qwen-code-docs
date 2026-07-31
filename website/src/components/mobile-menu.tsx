"use client";

import React, { useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Github,
  Menu,
  Newspaper,
  Sparkles,
  X,
} from "lucide-react";
import cn from "clsx";
import { ThemeToggle } from "./theme-toggle";
import { languages } from "./language-dropdown";

const LOCALES = languages.map((l) => l.locale);

const NAV_I18N: Record<string, Record<string, string>> = {
  docs: {
    zh: "文档",
    en: "Documentation",
    de: "Dokumentation",
    fr: "Documentation",
    ja: "ドキュメント",
    ru: "Документация",
    "pt-BR": "Documentação",
  },
  blog: {
    zh: "博客",
    en: "Blog",
    de: "Blog",
    fr: "Blog",
    ja: "ブログ",
    ru: "Блог",
    "pt-BR": "Blog",
  },
  showcase: {
    zh: "案例展示",
    en: "Showcase",
    de: "Showcase",
    fr: "Showcase",
    ja: "ショーケース",
    ru: "Витрина",
    "pt-BR": "Showcase",
  },
  language: {
    zh: "语言",
    en: "Language",
    de: "Sprache",
    fr: "Langue",
    ja: "言語",
    ru: "Язык",
    "pt-BR": "Idioma",
  },
  menu: {
    zh: "打开菜单",
    en: "Open menu",
    de: "Menü öffnen",
    fr: "Ouvrir le menu",
    ja: "メニューを開く",
    ru: "Открыть меню",
    "pt-BR": "Abrir menu",
  },
  close: {
    zh: "关闭菜单",
    en: "Close menu",
    de: "Menü schließen",
    fr: "Fermer le menu",
    ja: "メニューを閉じる",
    ru: "Закрыть меню",
    "pt-BR": "Fechar menu",
  },
};

function useT(lang: string) {
  return (key: keyof typeof NAV_I18N) =>
    NAV_I18N[key]?.[lang] || NAV_I18N[key]?.en || key;
}

export function MobileMenu({ lang }: { lang: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT(lang);

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 全站隐藏 Nextra 原生汉堡，移动端导航统一由本抽屉接管（只展开一级目录）
  useEffect(() => {
    document.documentElement.classList.add("qwen-custom-nav");
    return () => {
      document.documentElement.classList.remove("qwen-custom-nav");
    };
  }, []);

  // 路由变化时关闭抽屉（含浏览器返回/手势），同时触发滚动锁 cleanup
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 打开时锁定滚动、聚焦关闭按钮、困住焦点；关闭时归还焦点与滚动
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  // 关闭态把 overlay 设为 inert，使其中的可聚焦元素退出 tab 顺序与无障碍树
  // React 18 不支持 inert 布尔属性，直接操作 DOM attribute
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  const switchLanguage = (newLang: string) => {
    const segs = pathname.split("/").filter(Boolean);
    if (segs[0] && LOCALES.includes(segs[0])) segs[0] = newLang;
    else segs.unshift(newLang);
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    router.push(`/${segs.join("/")}${search}`);
    setOpen(false);
  };

  const links = [
    { href: `/${lang}/users/overview`, label: t("docs"), Icon: BookOpen },
    { href: `/${lang}/blog`, label: t("blog"), Icon: Newspaper },
    { href: `/${lang}/showcase`, label: t("showcase"), Icon: Sparkles },
  ];

  return (
    <div className="qwen-mobile-menu md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("menu")}
        aria-expanded={open}
        aria-controls="qwen-mobile-drawer"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div
        ref={overlayRef}
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          !open && "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          ref={panelRef}
          id="qwen-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={t("menu")}
          className={cn(
            "absolute right-0 top-0 flex h-full w-[min(20rem,85vw)] flex-col border-l border-border bg-background shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">
              Qwen Code
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <ul className="space-y-1">
              {links.map(({ href, label, Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <li key={href}>
                    <NextLink
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2.5 text-base transition-colors",
                        active
                          ? "bg-violet-500/10 font-semibold text-violet-600 dark:text-violet-400"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {label}
                    </NextLink>
                  </li>
                );
              })}
              <li>
                <a
                  href="https://github.com/QwenLM/qwen-code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
                >
                  <Github className="h-5 w-5 shrink-0" />
                  GitHub
                </a>
              </li>
            </ul>

            <div className="my-3 h-px bg-border/60" />

            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <ThemeToggle />
              </span>
            </div>

            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("language")}
            </p>
            <ul className="space-y-0.5">
              {languages.map((language) => {
                const active = language.locale === lang;
                return (
                  <li key={language.locale}>
                    <button
                      type="button"
                      onClick={() => switchLanguage(language.locale)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-accent font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <span className="text-base">{language.flag}</span>
                      {language.name}
                      {active && (
                        <span className="ml-auto text-violet-600 dark:text-violet-400">
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
