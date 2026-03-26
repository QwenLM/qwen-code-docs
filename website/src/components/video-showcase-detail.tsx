"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Play, Clock, BookOpen, Zap, Layers, Code, ExternalLink } from "lucide-react";
import {
  featureCategories,
  difficultyLevels,
  type VideoShowcaseItem,
} from "../showcase-videos-data";

interface VideoShowcaseDetailProps {
  video: VideoShowcaseItem;
  relatedVideos?: VideoShowcaseItem[];
}

export function VideoShowcaseDetail({ video, relatedVideos = [] }: VideoShowcaseDetailProps) {
  const difficultyConfig = difficultyLevels.find((d) => d.id === video.difficulty);
  const categoryConfig = featureCategories.find((c) => c.id === video.category);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back Link */}
      <Link
        href="/zh/showcase"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回 showcase 列表
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Category Badge */}
          {categoryConfig && (
            <span className="px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-sm font-medium">
              {categoryConfig.label}
            </span>
          )}

          {/* Difficulty Badge */}
          {difficultyConfig && (
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${difficultyConfig.color}`}>
              {difficultyConfig.label}
            </span>
          )}
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          {video.title}
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed">
          {video.description}
        </p>
      </div>

      {/* Video Section */}
      {video.videoUrl && (
        <div className="mb-10 rounded-2xl overflow-hidden shadow-2xl border border-border">
          <video
            src={video.videoUrl}
            poster={video.thumbnail}
            controls
            className="w-full max-h-[600px] object-cover"
          />
        </div>
      )}

      {/* Command Section */}
      {video.command && (
        <div className="mb-10 bg-muted/50 rounded-xl p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            快速命令
          </h2>
          <pre className="bg-background rounded-lg p-4 overflow-x-auto border border-border">
            <code className="text-sm font-mono text-foreground">{video.command}</code>
          </pre>
        </div>
      )}

      {/* Steps Section - Using Nextra Steps style */}
      {video.steps && video.steps.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            操作步骤
          </h2>

          <div className="space-y-4">
            {video.steps.map((step, index) => (
              <div
                key={index}
                className="relative pl-12 py-2"
              >
                {/* Step Number */}
                <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
                    {index + 1}
                  </span>
                </div>

                {/* Step Content */}
                <div className="bg-muted/30 rounded-xl p-5 border border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground mb-3 leading-relaxed">
                    {step.description}
                  </p>
                  {step.command && (
                    <pre className="bg-background rounded-lg p-3 overflow-x-auto border border-border">
                      <code className="text-sm font-mono text-foreground">{step.command}</code>
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Videos */}
      {relatedVideos.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Layers className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            相关视频
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relatedVideos.map((related) => (
              <Link
                key={related.id}
                href={`/zh/showcase/${related.id}`}
                className="group block border border-border rounded-xl overflow-hidden hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-lg transition-all"
              >
                <div className="aspect-video relative overflow-hidden">
                  <img
                    src={related.thumbnail}
                    alt={related.title}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  {related.videoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="w-5 h-5 text-violet-600 ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors line-clamp-1">
                    {related.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {related.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* CTA Section */}
      <div className="text-center py-10 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-2xl border border-border">
        <h3 className="text-xl font-bold text-foreground mb-3">
          准备好开始了吗？
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          安装 Qwen Code，立即体验 AI 编程的强大能力
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="https://github.com/QwenLM/qwen-code"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
          >
            <ExternalLink className="w-4 h-4" />
            GitHub 仓库
          </a>
          <Link
            href="/zh/docs/getting-started/installation"
            className="inline-flex items-center gap-2 px-6 py-3 bg-foreground hover:bg-foreground/90 text-background rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
          >
            <BookOpen className="w-4 h-4" />
            安装文档
          </Link>
        </div>
      </div>
    </div>
  );
}
