"use client";

import React, { useState } from "react";
import { Play, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface Video {
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration?: string;
  category: string;
  featured?: boolean;
  link?: string;
}

export interface Category {
  id: string;
  label: string;
}

export interface VideoShowcaseTexts {
  title: string;
  subtitle: string;
  featured: string;
  allVideos: string;
  all: string;
  close: string;
  unsupportedVideo: string;
}

interface VideoShowcaseProps {
  videos: Video[];
  categories: Category[];
  texts: VideoShowcaseTexts;
}

export const VideoShowcase = ({ videos, categories, texts }: VideoShowcaseProps) => {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredVideos =
    activeCategory === "all"
      ? videos
      : videos.filter((v) => v.category === activeCategory);

  // Get section title based on active category
  const sectionTitle = activeCategory === "all"
    ? texts.allVideos
    : categories.find(c => c.id === activeCategory)?.label || activeCategory;

  return (
    <div className="min-h-screen pt-4 pb-20">
      <div className="max-w-[90rem] mx-auto px-6 md:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {texts.title}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {texts.subtitle}
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {texts.all}
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === category.id
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>

        {/* Videos Grid */}
        <div>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="inline-block w-1 h-6 bg-primary rounded-full" />
            {sectionTitle}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map((video, index) => (
              <VideoCard
                key={index}
                video={video}
                onClick={() => setSelectedVideo(video)}
              />
            ))}
          </div>
        </div>

        {/* Empty State */}
        {filteredVideos.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              No videos found in this category
            </p>
          </div>
        )}
      </div>

      {/* Video Modal */}
      <Dialog
        open={selectedVideo !== null}
        onOpenChange={() => setSelectedVideo(null)}
      >
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-background">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-lg font-bold">
              {selectedVideo?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-black">
            {selectedVideo && (
              <video
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                className="w-full h-full"
                poster={selectedVideo.thumbnail}
              >
                {texts.unsupportedVideo}
              </video>
            )}
          </div>
          <div className="p-4 pt-2">
            <p className="text-muted-foreground text-sm">
              {selectedVideo?.description}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const VideoCard = ({
  video,
  onClick,
}: {
  video: Video;
  onClick: () => void;
}) => (
  <Card
    className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-300"
    onClick={onClick}
  >
    <div className="relative aspect-video overflow-hidden">
      <img
        src={video.thumbnail}
        alt={video.title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
          <Play className="w-5 h-5 text-primary ml-0.5" fill="currentColor" />
        </div>
      </div>
      {video.duration && (
        <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white font-medium flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {video.duration}
        </div>
      )}
    </div>
    <CardHeader className="pb-2 pt-4">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Badge variant="secondary" className="text-xs">
          {video.category}
        </Badge>
      </div>
      <h3 className="text-base font-bold group-hover:text-primary transition-colors line-clamp-2">
        {video.title}
      </h3>
    </CardHeader>
    <CardContent className="pt-0">
      <p className="text-sm text-muted-foreground line-clamp-2">
        {video.description}
      </p>
    </CardContent>
  </Card>
);

export default VideoShowcase;
