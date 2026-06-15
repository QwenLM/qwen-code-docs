"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDownIcon, GlobeIcon } from "lucide-react";
import cn from "clsx";

// 语言配置
const languages = [
  { locale: "en", name: "English", flag: "🇺🇸" },
  { locale: "zh", name: "中文", flag: "🇨🇳" },
  { locale: "de", name: "Deutsch", flag: "🇩🇪" },
  { locale: "fr", name: "Français", flag: "🇫🇷" },
  { locale: "ru", name: "Русский", flag: "🇷🇺" },
  { locale: "ja", name: "日本語", flag: "🇯🇵" },
  { locale: "pt-BR", name: "Português (BR)", flag: "🇧🇷" },
];

interface LanguageDropdownProps {
  currentLang: string;
  className?: string;
  compactOnTablet?: boolean;
}

export const LanguageDropdown: React.FC<LanguageDropdownProps> = (props) => {
  return (
    <Suspense
      fallback={
        <div className={cn('inline-flex min-w-max flex-nowrap items-center gap-2 whitespace-nowrap px-3 py-1.5 text-sm text-muted-foreground bg-secondary/50 rounded-md border border-border', props.className)}>
          <GlobeIcon className='w-4 h-4 shrink-0' />
          <span className={props.compactOnTablet ? "max-xl:hidden" : undefined}>
            {languages.find((l) => l.locale === props.currentLang)?.name || props.currentLang}
          </span>
        </div>
      }
    >
      <LanguageDropdownInner {...props} />
    </Suspense>
  );
};

const LanguageDropdownInner: React.FC<LanguageDropdownProps> = ({
  currentLang,
  className,
  compactOnTablet = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 客户端渲染标记
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 获取当前语言信息
  const currentLanguage = languages.find((lang) => lang.locale === currentLang);

  // 处理语言切换
  const handleLanguageChange = (newLang: string) => {
    if (!isMounted) return;

    // 构建新的路径
    const pathSegments = pathname.split("/").filter(Boolean);

    // 如果当前路径包含语言代码，替换它
    if (
      pathSegments[0] &&
      languages.some((lang) => lang.locale === pathSegments[0])
    ) {
      pathSegments[0] = newLang;
    } else {
      // 如果没有语言代码，添加到开头
      pathSegments.unshift(newLang);
    }

    const newPath = "/" + pathSegments.join("/");
    const queryString = searchParams.toString();
    router.push(queryString ? `${newPath}?${queryString}` : newPath);
    setIsOpen(false);
  };

  // 服务端渲染时返回简单版本
  if (!isMounted) {
    return (
      <div className={cn('inline-flex min-w-max flex-nowrap items-center gap-2 whitespace-nowrap px-3 py-1.5 text-sm text-muted-foreground bg-secondary/50 rounded-md border border-border', className)}>
        <GlobeIcon className='w-4 h-4 shrink-0' />
        <span className={compactOnTablet ? "max-xl:hidden" : undefined}>
          {currentLanguage?.name || currentLang}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='inline-flex min-w-max flex-nowrap items-center gap-2 whitespace-nowrap px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent bg-secondary/50 rounded-md transition-colors duration-200 border border-border'
        aria-label='选择语言'
      >
        <span className='inline-flex items-center gap-1.5 whitespace-nowrap font-medium'>
          <span className='shrink-0'>{currentLanguage?.flag}</span>
          <span className={compactOnTablet ? "max-xl:hidden" : undefined}>
            {currentLanguage?.name || currentLang}
          </span>
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className='absolute top-full right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 min-w-[160px]'>
          <div className='py-1'>
            {languages.map((language) => (
              <button
                key={language.locale}
                onClick={() => handleLanguageChange(language.locale)}
                className={`w-full whitespace-nowrap text-left px-3 py-2 text-sm hover:bg-accent transition-colors duration-150 flex items-center gap-2 ${
                  language.locale === currentLang
                    ? "bg-accent/50 text-primary font-semibold"
                    : "text-popover-foreground"
                }`}
              >
                <span className='text-base'>{language.flag}</span>
                <span className='font-medium'>{language.name}</span>
                {language.locale === currentLang && (
                  <span className='ml-auto text-primary'>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
