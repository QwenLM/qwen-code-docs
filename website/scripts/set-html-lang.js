#!/usr/bin/env node
/**
 * 设置多语言 HTML 的 lang 属性
 * 
 * Next.js App Router 的根 layout 无法根据动态路由设置 html 标签的 lang 属性，
 * 此脚本在构建后为每个语言目录的 HTML 文件设置正确的 lang 属性。
 * 
 * 这对于 Pagefind 正确识别语言索引和 SEO 优化至关重要。
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'out');

const langMap = {
  en: 'en',
  zh: 'zh',
  de: 'de',
  fr: 'fr',
  ru: 'ru',
  ja: 'ja',
  'pt-BR': 'pt-BR',
};

function processDirectory(dirPath, lang) {
  if (!fs.existsSync(dirPath)) return;
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath, lang);
    } else if (entry.name.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      // 替换 <html lang="en"> 为正确的语言
      const newLang = langMap[lang] || lang;
      content = content.replace(
        /<html lang="en"/g,
        `<html lang="${newLang}"`
      );
      
      // 如果没有 lang 属性，添加它
      content = content.replace(
        /<html>/g,
        `<html lang="${newLang}">`
      );
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

console.log('🔧 修复 HTML lang 属性...\n');

for (const lang of Object.keys(langMap)) {
  const langDir = path.join(OUT_DIR, lang);
  if (fs.existsSync(langDir)) {
    processDirectory(langDir, lang);
    console.log(`✅ 已处理 ${lang}/ 目录`);
  }
}

console.log('\n✨ HTML lang 属性修复完成！');