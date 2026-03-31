"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, PenLine, Tag, Cpu, Layers, Share2, Check } from "lucide-react";

import showcaseDataZh from "../generated/showcase-data-zh.json";
import showcaseDataEn from "../generated/showcase-data-en.json";
import showcaseDataDe from "../generated/showcase-data-de.json";
import showcaseDataFr from "../generated/showcase-data-fr.json";
import showcaseDataJa from "../generated/showcase-data-ja.json";
import showcaseDataPtBR from "../generated/showcase-data-pt-BR.json";
import showcaseDataRu from "../generated/showcase-data-ru.json";

interface ShowcaseDataItem {
  id: string;
  author: string;
  category: string;
  features: string[];
  model: string;
  date: string;
}

type Locale = "zh" | "en" | "de" | "fr" | "ja" | "pt-BR" | "ru";

const SHOWCASE_DATA_MAP: Record<Locale, ShowcaseDataItem[]> = {
  zh: showcaseDataZh as ShowcaseDataItem[],
  en: showcaseDataEn as ShowcaseDataItem[],
  de: showcaseDataDe as ShowcaseDataItem[],
  fr: showcaseDataFr as ShowcaseDataItem[],
  ja: showcaseDataJa as ShowcaseDataItem[],
  "pt-BR": showcaseDataPtBR as ShowcaseDataItem[],
  ru: showcaseDataRu as ShowcaseDataItem[],
};

const DEFAULT_AUTHOR = "Qwen Code Team";
const DEFAULT_MODEL = "qwen3.5-plus";

interface ResolvedMeta {
  category: string;
  features: string[];
  model: string;
  author: string;
}

const DEFAULT_META: ResolvedMeta = {
  category: "",
  features: [],
  model: DEFAULT_MODEL,
  author: DEFAULT_AUTHOR,
};

function resolveShowcaseMeta(pathname: string | null): ResolvedMeta {
  if (!pathname) return DEFAULT_META;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 3 || segments[1] !== "showcase") return DEFAULT_META;

  const locale = segments[0] as Locale;
  const slug = segments[2];
  const data = SHOWCASE_DATA_MAP[locale];
  if (!data) return DEFAULT_META;

  const item = data.find((entry) => entry.id === slug);
  if (!item) return DEFAULT_META;

  return {
    category: item.category || "",
    features: item.features || [],
    model: item.model || DEFAULT_MODEL,
    author: item.author || DEFAULT_AUTHOR,
  };
}

function getLocaleFromPathname(pathname: string | null): string {
  if (!pathname) return "zh";
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return firstSegment && firstSegment in SHOWCASE_DATA_MAP ? firstSegment : "zh";
}

interface ShowcaseDetailMetaProps {
  category?: string;
  features?: string[];
  model?: string;
}

function MetaItem({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-zinc-400 dark:text-zinc-500">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-none">
          {label}
        </span>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
          {children}
        </span>
      </div>
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <button
      onClick={handleCopy}
      className="text-sm font-medium text-zinc-900 dark:text-zinc-100 underline underline-offset-2 decoration-zinc-300 dark:decoration-zinc-700 hover:decoration-zinc-900 dark:hover:decoration-zinc-100 transition-colors inline-flex items-center gap-1 cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
          已复制
        </>
      ) : (
        "Copy link"
      )}
    </button>
  );
}

export function ShowcaseDetailMeta() {
  const pathname = usePathname();
  const { category, features, model, author } = resolveShowcaseMeta(pathname);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-8 mt-10 mb-12 py-7 border-y border-zinc-200 dark:border-zinc-800">
      {/* Author */}
      <MetaItem icon={<PenLine className="w-4 h-4" />} label="Author">
        {author}
      </MetaItem>

      {/* Category */}
      {category && (
        <MetaItem icon={<Tag className="w-4 h-4" />} label="Category">
          {category}
        </MetaItem>
      )}

      {/* Model */}
      <MetaItem icon={<Cpu className="w-4 h-4" />} label="Model">
        <span className="font-mono">{model}</span>
      </MetaItem>

      {/* Features */}
      {features && features.length > 0 && (
        <MetaItem icon={<Layers className="w-4 h-4" />} label="Features">
          {features.join(", ")}
        </MetaItem>
      )}

      {/* Share */}
      <MetaItem icon={<Share2 className="w-4 h-4" />} label="Share">
        <CopyLinkButton />
      </MetaItem>
    </div>
  );
}

const CTA_TEXTS: Record<string, { startUsing: string; backToAll: string }> = {
  zh: { startUsing: "立即开始使用 Qwen Code", backToAll: "返回全部案例" },
  en: { startUsing: "Start Using Qwen Code", backToAll: "Back to all showcases" },
  de: { startUsing: "Qwen Code jetzt nutzen", backToAll: "Zurück zu allen Showcases" },
  fr: { startUsing: "Commencer à utiliser Qwen Code", backToAll: "Retour à tous les showcases" },
  ja: { startUsing: "Qwen Code を使い始める", backToAll: "すべてのショーケースに戻る" },
  "pt-BR": { startUsing: "Comece a usar o Qwen Code", backToAll: "Voltar para todos os showcases" },
  ru: { startUsing: "Начать использовать Qwen Code", backToAll: "Вернуться ко всем витринам" },
};

export function ShowcaseDetailCta() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const texts = CTA_TEXTS[locale] || CTA_TEXTS.zh;

  return (
    <div className="mt-20 mb-8 flex flex-col items-center gap-5">
      <Link
        href={`/${locale}/users/overview`}
        className="inline-flex items-center justify-center px-8 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-semibold no-underline text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors active:scale-[0.98]"
      >
        {texts.startUsing}
      </Link>
      <Link
        href={`/${locale}/showcase`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 no-underline transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {texts.backToAll}
      </Link>
    </div>
  );
}
