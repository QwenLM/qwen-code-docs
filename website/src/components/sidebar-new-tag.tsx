"use client";

import { useEffect } from "react";
import { isWithinDays, normalizeHref, NEW_BADGE_DAYS } from "../lib/blog-utils";

const BADGE_ATTR = "data-sidebar-new";
const STYLE_ID = "sidebar-enhancer-style";
const LIST_ATTR = "data-updates-list";
const EXPANDED_ATTR = "data-updates-expanded";
const TOGGLE_ATTR = "data-updates-toggle";
const COLLAPSE_COUNT = 3;

const CSS = `
[data-sidebar-new] {
  display: inline-flex;
  align-items: center;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  color: #16a34a;
  background: #dcfce7;
  padding: 2px 5px;
  border-radius: 9999px;
  margin-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  flex-shrink: 0;
  pointer-events: none;
}
html.dark [data-sidebar-new] {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.15);
}
[data-updates-list]:not([data-updates-expanded]) > li:nth-child(n+${COLLAPSE_COUNT + 1}):not([data-updates-toggle]) {
  display: none !important;
}
[data-updates-toggle] {
  list-style: none;
}
[data-updates-toggle] button {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 12px 6px 28px;
  font-size: 13px;
  color: var(--nx-muted, #71717a);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: color 0.15s;
}
[data-updates-toggle] button:hover {
  color: var(--nx-fg, #18181b);
}
[data-updates-toggle] button svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  transition: transform 0.15s;
}
[data-updates-expanded] [data-updates-toggle] button svg {
  transform: rotate(180deg);
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

const DOWN_CHEVRON =
  '<svg viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function addNewBadges(blogDates: Record<string, string>) {
  const newRoutes = new Set(
    Object.entries(blogDates)
      .filter(([, date]) => isWithinDays(date, NEW_BADGE_DAYS))
      .map(([route]) => route.replace(/\/$/, ""))
  );
  if (newRoutes.size === 0) return;

  const links = Array.from(
    document.querySelectorAll<HTMLElement>('a[href*="/blog/"]')
  );

  for (const link of links) {
    const href = link.getAttribute("href") || "";
    if (!href.includes("/blog/")) continue;
    const route = normalizeHref(href);

    const existing = link.querySelector(`[${BADGE_ATTR}]`);
    if (existing) existing.remove();

    if (newRoutes.has(route)) {
      const badge = document.createElement("span");
      badge.setAttribute(BADGE_ATTR, "true");
      badge.textContent = "NEW";
      link.appendChild(badge);
    }
  }
}

function setupUpdatesCollapse() {
  const updateLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/blog/updates/weekly-update"]'
    )
  );
  if (updateLinks.length === 0) return;

  const firstLi = updateLinks[0]?.closest("li");
  if (!firstLi) return;

  const ul = firstLi.parentElement;
  if (!ul || ul.hasAttribute(LIST_ATTR)) return;

  ul.setAttribute(LIST_ATTR, "true");

  if (updateLinks.length <= COLLAPSE_COUNT) return;

  const toggleLi = document.createElement("li");
  toggleLi.setAttribute(TOGGLE_ATTR, "true");

  const btn = document.createElement("button");
  btn.innerHTML = "查看更多 " + DOWN_CHEVRON;
  btn.addEventListener("click", () => {
    if (ul.hasAttribute(EXPANDED_ATTR)) {
      ul.removeAttribute(EXPANDED_ATTR);
      btn.innerHTML = "查看更多 " + DOWN_CHEVRON;
    } else {
      ul.setAttribute(EXPANDED_ATTR, "true");
      btn.innerHTML = "收起 " + DOWN_CHEVRON;
    }
  });

  toggleLi.appendChild(btn);
  ul.appendChild(toggleLi);
}

let isProcessing = false;

function enhanceSidebar(blogDates: Record<string, string>) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    addNewBadges(blogDates);
    setupUpdatesCollapse();
  } finally {
    isProcessing = false;
  }
}

export default function SidebarNewTag() {
  useEffect(() => {
    let observer: MutationObserver | undefined;
    let blogDates: Record<string, string> | undefined;
    let raf: number | undefined;

    injectStyle();

    async function init() {
      try {
        const basePath = "/qwen-code-docs";
        const res = await fetch(basePath + "/blog-dates.json");
        if (!res.ok) throw new Error("fetch failed");
        blogDates = await res.json();
      } catch {
        try {
          const res = await fetch("/blog-dates.json");
          blogDates = await res.json();
        } catch {
          return;
        }
      }
      if (!blogDates) return;

      const run = () => {
        if (isProcessing) return;
        cancelAnimationFrame(raf!);
        raf = requestAnimationFrame(() => enhanceSidebar(blogDates!));
      };

      enhanceSidebar(blogDates);

      const sidebar = document.querySelector("aside") || document.body;
      observer = new MutationObserver(run);
      observer.observe(sidebar, { childList: true, subtree: true });
    }

    const timer = setTimeout(init, 300);

    return () => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
