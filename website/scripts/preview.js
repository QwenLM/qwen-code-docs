#!/usr/bin/env node
/**
 * 本地预览脚本 - 支持 basePath 的静态服务器
 * 用于测试带有 basePath 配置的静态导出站点
 * 
 * 使用方法: node scripts/preview.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_PATH = '/qwen-code-docs';
const PORT = 3001;
const OUT_DIR = path.join(__dirname, '..', 'out');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  
  // URL 解码（处理 %5Blang%5D -> [lang] 等）
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch (e) {
    // 如果解码失败，保持原样
  }
  
  // 处理 basePath：移除前缀以匹配实际文件路径
  if (urlPath.startsWith(BASE_PATH)) {
    urlPath = urlPath.slice(BASE_PATH.length) || '/';
  }
  
  // 默认首页
  if (urlPath === '/') {
    urlPath = '/index.html';
  }
  
  const filePath = path.join(OUT_DIR, urlPath);
  
  // 尝试查找文件
  let finalPath = null;
  
  // 如果是目录，查找 index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      finalPath = indexPath;
    }
  }
  
  // 如果还没找到，尝试其他方式
  if (!finalPath) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      finalPath = filePath;
    }
    // 尝试添加 .html
    else if (fs.existsSync(filePath + '.html')) {
      finalPath = filePath + '.html';
    }
    else {
      console.log('404:', req.url, '->', filePath);
      res.statusCode = 404;
      res.end('Not Found: ' + req.url);
      return;
    }
  }
  
  const ext = path.extname(finalPath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  res.setHeader('Content-Type', contentType);
  
  // 添加 CORS 头以支持本地开发
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  fs.createReadStream(finalPath).pipe(res);
  console.log('200:', req.url, '->', finalPath.replace(OUT_DIR, ''));
});

server.listen(PORT, () => {
  console.log('\n✅ 服务器已启动!\n');
  console.log('📍 本地预览地址:');
  console.log(`   http://localhost:${PORT}${BASE_PATH}/en/\n`);
  console.log('🔍 测试搜索功能:');
  console.log(`   打开上述链接，点击搜索框输入关键词\n`);
  console.log('按 Ctrl+C 停止服务器\n');
});