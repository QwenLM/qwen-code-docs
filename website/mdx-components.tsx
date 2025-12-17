import React from "react";
import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";
import { Pre, withIcons } from "nextra/components";
import { GitHubIcon } from "nextra/icons";
import type { UseMDXComponents } from "nextra/mdx-components";
import type { ImgHTMLAttributes } from "react";
import { LocaleAnchor } from "./src/components/locale-anchor";

// 自定义 img 组件，动态替换路径
const CustomImg = (props: ImgHTMLAttributes<HTMLImageElement>) => {
  const { src, ...rest } = props;
  // 根据环境设置资源前缀
  const isProduction = process.env.NODE_ENV === "production";
  const assetPrefix = isProduction ? "/qwen-code-docs" : "";
  // 将 ../assets/ 替换为带前缀的 /assets/
  const adjustedSrc = src?.replace(/\.\.\/assets\//, `${assetPrefix}/assets/`);
  return <img src={adjustedSrc} {...rest} />;
};

const docsComponents = getDocsMDXComponents({
  pre: withIcons(Pre, { js: GitHubIcon }),
});

export const useMDXComponents: UseMDXComponents<any> = (components = {}) => ({
  ...docsComponents,
  a: LocaleAnchor,
  img: CustomImg,
  ...components,
});
