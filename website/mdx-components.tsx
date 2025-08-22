import React from "react";
import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";
import { Pre, withIcons } from "nextra/components";
import { GitHubIcon } from "nextra/icons";
import type { UseMDXComponents } from "nextra/mdx-components";
import type { ImgHTMLAttributes } from "react";

// 自定义 img 组件，动态替换路径
const CustomImg = (props: ImgHTMLAttributes<HTMLImageElement>) => {
  const { src, ...rest } = props;
  // 将 ../assets/ 替换为 /assets/
  const adjustedSrc = src?.replace(/\.\.\/assets\//, "/assets/");
  return <img src={adjustedSrc} {...rest} />;
};

const docsComponents = getDocsMDXComponents({
  pre: withIcons(Pre, { js: GitHubIcon }),
});

export const useMDXComponents: UseMDXComponents<any> = (components = {}) => ({
  ...docsComponents,
  img: CustomImg,
  ...components,
});
