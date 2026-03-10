"use client";

import React, { useState, useCallback } from "react";
import { Play, Clock, ArrowRight, Volume2, VolumeX, Sparkles, Copy, Check, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/* ─── Type Definitions ─── */

export interface Video {
  title: string;
  description: string;
  thumbnail: string;
  videoUrl?: string;
  duration?: string;
  category: string;
  difficulty?: string;
  featured?: boolean;
  link?: string;
  command?: string;
}

export interface Category {
  id: string;
  label: string;
}

export interface DifficultyLevel {
  id: string;
  label: string;
  color: string;
}

export interface ShowcaseTexts {
  pageTitle: string;
  pageSubtitle: string;
  heroSectionTitle: string;
  heroSectionSubtitle: string;
  heroCta: string;
  latestSectionTitle: string;
  latestSectionSubtitle: string;
  featureSectionTitle: string;
  featureSectionSubtitle: string;
  scenarioSectionTitle: string;
  scenarioSectionSubtitle: string;
  featureTabLabel: string;
  scenarioTabLabel: string;
  allFilter: string;
  allDifficulties: string;
  emptyState: string;
  close: string;
  unsupportedVideo: string;
  viewTutorial: string;
  moreComingSoon: string;
  submitCase: string;
}

interface VideoShowcaseProps {
  heroVideo?: Video;
  featureVideos: Video[];
  scenarioVideos: Video[];
  featureCategories: Category[];
  difficultyLevels: DifficultyLevel[];
  texts: ShowcaseTexts;
}

/* ─── Difficulty Badge Component ─── */

const DifficultyBadge = ({
  difficulty,
  levels,
}: {
  difficulty?: string;
  levels: DifficultyLevel[];
}) => {
  if (!difficulty) return null;
  const level = levels.find((levelItem) => levelItem.id === difficulty);
  if (!level) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${level.color}`}
    >
      {level.label}
    </span>
  );
};

/* ─── Copyable Code Block ─── */

const CopyableCodeBlock = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      navigator.clipboard.writeText(command).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [command]
  );

  const isMultiLine = command.includes("\n");

  return (
    <div
      className="mt-3 flex items-start gap-1.5 rounded-md bg-muted/60 dark:bg-muted/30 px-2.5 py-1.5 border border-border/40"
      onClick={(event) => event.stopPropagation()}
    >
      <code
        className={`flex-1 text-[11px] font-mono text-muted-foreground select-all ${isMultiLine ? "whitespace-pre-wrap break-all" : "truncate"}`}
      >
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted active:scale-[0.95] transition-all duration-150"
        aria-label="Copy command"
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );
};

/* ─── Hero Section ─── */

const HeroSection = ({
  video,
  texts,
}: {
  video?: Video;
  texts: ShowcaseTexts;
}) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  if (!video) return null;

  return (
    <section className="relative w-full overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 pt-8 pb-16 md:pb-24">
        {/* Section header - left aligned */}
        <div className="mb-8 md:mb-12 max-w-2xl">
          <p className="text-sm font-medium tracking-wider uppercase text-muted-foreground mb-3">
            {texts.heroSectionTitle}
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tighter leading-none mb-4 text-foreground">
            {texts.pageTitle}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-[55ch]">
            {texts.pageSubtitle}
          </p>
        </div>

        {/* Hero video - asymmetric layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 relative group">
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-zinc-950 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)]">
              {video.videoUrl ? (
                <>
                  <video
                    ref={videoRef}
                    src={video.videoUrl}
                    poster={video.thumbnail}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                  {/* Video controls overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={toggleMute}
                          className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                          aria-label={isMuted ? "Unmute" : "Mute"}
                        >
                          {isMuted ? (
                            <VolumeX className="w-4 h-4 text-white" />
                          ) : (
                            <Volume2 className="w-4 h-4 text-white" />
                          )}
                        </button>
                      </div>
                      {video.duration && (
                        <span className="text-xs text-white/80 font-mono">
                          {video.duration}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </div>

          {/* Side info panel */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-6 lg:py-2">
            <div>
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-3 text-foreground">
                {video.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                {video.description}
              </p>
              {video.link && (
                <a
                  href={video.link}
                  className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors group/link"
                >
                  {texts.heroCta}
                  <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
                </a>
              )}
            </div>

            {/* Quick stats */}
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                {texts.heroSectionSubtitle}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─── Feature Video Card ─── */

const FeatureVideoCard = ({
  video,
  onClick,
  variant = "default",
}: {
  video: Video;
  onClick: () => void;
  variant?: "default" | "wide";
}) => (
  <button
    type="button"
    className={`group cursor-pointer text-left w-full h-full flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card hover:border-border transition-all duration-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.3)] active:scale-[0.99] ${
      variant === "wide" ? "col-span-1 md:col-span-2" : ""
    }`}
    onClick={onClick}
  >
    <div className="relative aspect-video overflow-hidden shrink-0">
      <img
        src={video.thumbnail}
        alt={video.title}
        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
        loading="lazy"
      />
      {video.videoUrl && (
        <div className="absolute inset-0 bg-zinc-950/20 group-hover:bg-zinc-950/10 transition-colors flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/90 dark:bg-white/80 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
            <Play
              className="w-4.5 h-4.5 text-zinc-900 ml-0.5"
              fill="currentColor"
            />
          </div>
        </div>
      )}
      {video.duration && video.videoUrl && (
        <div className="absolute bottom-2.5 right-2.5 bg-zinc-950/70 backdrop-blur-sm px-2 py-0.5 rounded-md text-xs text-white font-mono flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {video.duration}
        </div>
      )}
    </div>
    <div className="p-4 md:p-5 flex flex-col flex-1">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Badge
          variant="secondary"
          className="text-[11px] rounded-md font-medium"
        >
          {video.category}
        </Badge>
      </div>
      <h3 className="text-sm md:text-base font-semibold text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors line-clamp-1 mb-1.5">
        {video.title}
      </h3>
      <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
        {video.description}
      </p>
      {video.command && <CopyableCodeBlock command={video.command} />}
    </div>
  </button>
);

/* ─── Scenario Video Card ─── */

const ScenarioVideoCard = ({
  video,
  onClick,
  difficultyLevels,
  texts,
}: {
  video: Video;
  onClick: () => void;
  difficultyLevels: DifficultyLevel[];
  texts: ShowcaseTexts;
}) => (
  <button
    type="button"
    className="group cursor-pointer text-left w-full h-full flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card hover:border-border transition-all duration-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.3)] active:scale-[0.99]"
    onClick={onClick}
  >
    <div className="relative aspect-video overflow-hidden shrink-0">
      <img
        src={video.thumbnail}
        alt={video.title}
        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
        loading="lazy"
      />
      {video.videoUrl && (
        <div className="absolute inset-0 bg-zinc-950/20 group-hover:bg-zinc-950/10 transition-colors flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/90 dark:bg-white/80 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
            <Play
              className="w-4.5 h-4.5 text-zinc-900 ml-0.5"
              fill="currentColor"
            />
          </div>
        </div>
      )}
      {video.duration && video.videoUrl && (
        <div className="absolute bottom-2.5 right-2.5 bg-zinc-950/70 backdrop-blur-sm px-2 py-0.5 rounded-md text-xs text-white font-mono flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {video.duration}
        </div>
      )}
    </div>
    <div className="p-4 md:p-5 flex flex-col flex-1">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <DifficultyBadge
          difficulty={video.difficulty}
          levels={difficultyLevels}
        />
      </div>
      <h3 className="text-sm md:text-base font-semibold text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors line-clamp-1 mb-1.5">
        {video.title}
      </h3>
      <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
        {video.description}
      </p>
      {video.command && <CopyableCodeBlock command={video.command} />}
      {video.link && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors mt-auto pt-3">
          {texts.viewTutorial}
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </span>
      )}
    </div>
  </button>
);

/* ─── Latest Videos Section ─── */

const LatestVideosSection = ({
  featureVideos,
  scenarioVideos,
  texts,
  difficultyLevels,
  onVideoSelect,
}: {
  featureVideos: Video[];
  scenarioVideos: Video[];
  texts: ShowcaseTexts;
  difficultyLevels: DifficultyLevel[];
  onVideoSelect: (video: Video) => void;
}) => {
  // Take the last 3 videos from the combined list (most recently added)
  const allVideos = [...featureVideos, ...scenarioVideos];
  const latestVideos = allVideos.slice(-3).reverse();

  if (latestVideos.length === 0) return null;

  return (
    <section id="latest-videos" className="w-full border-t border-border/50">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-16 md:py-24">
        {/* Section header */}
        <div className="mb-10 md:mb-14 max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <p className="text-sm font-medium tracking-wider uppercase text-violet-600 dark:text-violet-400">
              {texts.latestSectionTitle}
            </p>
          </div>
          <h2 className="text-2xl md:text-4xl font-bold tracking-tighter leading-none mb-4 text-foreground">
            {texts.latestSectionSubtitle}
          </h2>
        </div>

        {/* Latest videos - 1 wide + 2 standard, same style as feature cards */}
        {latestVideos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {latestVideos.map((video, index) => (
              <FeatureVideoCard
                key={`latest-${video.title}-${index}`}
                video={video}
                onClick={() => onVideoSelect(video)}
                variant={index === 0 ? "wide" : "default"}
              />
            ))}
          </div>
        ) : (
          <EmptyState message={texts.emptyState} />
        )}
      </div>
    </section>
  );
};

/* ─── Feature Tab Content ─── */

const FeatureTabContent = ({
  videos,
  categories,
  texts,
  onVideoSelect,
}: {
  videos: Video[];
  categories: Category[];
  texts: ShowcaseTexts;
  onVideoSelect: (video: Video) => void;
}) => {
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredVideos =
    activeCategory === "all"
      ? videos
      : videos.filter((videoItem) => videoItem.category === activeCategory);

  return (
    <div>
      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-10">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeCategory === "all"
              ? "bg-foreground text-background shadow-sm"
              : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          {texts.allFilter}
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeCategory === category.id
                ? "bg-foreground text-background shadow-sm"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Asymmetric video grid */}
      {filteredVideos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredVideos.map((video, index) => (
            <FeatureVideoCard
              key={`${video.title}-${index}`}
              video={video}
              onClick={() => onVideoSelect(video)}
              variant={
                index === 0 && filteredVideos.length > 2 ? "wide" : "default"
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState message={texts.emptyState} />
      )}
    </div>
  );
};

/* ─── Scenario Tab Content ─── */

const ScenarioTabContent = ({
  videos,
  difficultyLevels,
  texts,
  onVideoSelect,
}: {
  videos: Video[];
  difficultyLevels: DifficultyLevel[];
  texts: ShowcaseTexts;
  onVideoSelect: (video: Video) => void;
}) => {
  const [activeDifficulty, setActiveDifficulty] = useState("all");

  const filteredVideos =
    activeDifficulty === "all"
      ? videos
      : videos.filter(
          (videoItem) => videoItem.difficulty === activeDifficulty
        );

  return (
    <div>
      {/* Difficulty filter */}
      <div className="flex flex-wrap items-center gap-2 mb-10">
        <button
          onClick={() => setActiveDifficulty("all")}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeDifficulty === "all"
              ? "bg-foreground text-background shadow-sm"
              : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          {texts.allDifficulties}
        </button>
        {difficultyLevels.map((level) => (
          <button
            key={level.id}
            onClick={() => setActiveDifficulty(level.id)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeDifficulty === level.id
                ? "bg-foreground text-background shadow-sm"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            {level.label}
          </button>
        ))}
      </div>

      {/* Scenario grid */}
      {filteredVideos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredVideos.map((video, index) => (
            <ScenarioVideoCard
              key={`${video.title}-${index}`}
              video={video}
              onClick={() => onVideoSelect(video)}
              difficultyLevels={difficultyLevels}
              texts={texts}
            />
          ))}
        </div>
      ) : (
        <EmptyState message={texts.emptyState} />
      )}
    </div>
  );
};

/* ─── Tabbed Content Section (Feature Demos + Scenarios) ─── */

const TabbedContentSection = ({
  featureVideos,
  scenarioVideos,
  featureCategories,
  difficultyLevels,
  texts,
  onVideoSelect,
}: {
  featureVideos: Video[];
  scenarioVideos: Video[];
  featureCategories: Category[];
  difficultyLevels: DifficultyLevel[];
  texts: ShowcaseTexts;
  onVideoSelect: (video: Video) => void;
}) => {
  return (
    <section id="all-videos" className="w-full border-t border-border/50">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-16 md:py-24">
        <Tabs defaultValue="features" className="w-full">
          <TabsList className="mb-10 bg-muted/50 p-1 rounded-xl h-auto">
            <TabsTrigger
              value="features"
              className="px-5 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {texts.featureTabLabel}
            </TabsTrigger>
            <TabsTrigger
              value="scenarios"
              className="px-5 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {texts.scenarioTabLabel}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="features">
            {/* Section header for features */}
            <div className="mb-10 md:mb-14 max-w-2xl">
              <p className="text-sm font-medium tracking-wider uppercase text-violet-600 dark:text-violet-400 mb-3">
                {texts.featureSectionTitle}
              </p>
              <h2 className="text-2xl md:text-4xl font-bold tracking-tighter leading-none mb-4 text-foreground">
                {texts.featureSectionSubtitle}
              </h2>
            </div>
            <FeatureTabContent
              videos={featureVideos}
              categories={featureCategories}
              texts={texts}
              onVideoSelect={onVideoSelect}
            />
          </TabsContent>

          <TabsContent value="scenarios">
            {/* Section header for scenarios */}
            <div className="mb-10 md:mb-14 max-w-2xl">
              <p className="text-sm font-medium tracking-wider uppercase text-violet-600 dark:text-violet-400 mb-3">
                {texts.scenarioSectionTitle}
              </p>
              <h2 className="text-2xl md:text-4xl font-bold tracking-tighter leading-none mb-4 text-foreground">
                {texts.scenarioSectionSubtitle}
              </h2>
            </div>
            <ScenarioTabContent
              videos={scenarioVideos}
              difficultyLevels={difficultyLevels}
              texts={texts}
              onVideoSelect={onVideoSelect}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
};

/* ─── Empty State ─── */

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
      <Play className="w-6 h-6 text-muted-foreground" />
    </div>
    <p className="text-sm text-muted-foreground max-w-[40ch]">{message}</p>
  </div>
);

/* ─── Footer CTA ─── */

const FooterCta = ({ texts }: { texts: ShowcaseTexts }) => (
  <section className="w-full border-t border-border/50">
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-16 md:py-20 text-center">
      <p className="text-sm text-muted-foreground mb-2">
        {texts.moreComingSoon}
      </p>
      <p className="text-xs text-muted-foreground/60">{texts.submitCase}</p>
    </div>
  </section>
);

/* ─── Main Component ─── */

export const VideoShowcase = ({
  heroVideo,
  featureVideos,
  scenarioVideos,
  featureCategories,
  difficultyLevels,
  texts,
}: VideoShowcaseProps) => {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  const handleVideoSelect = useCallback((video: Video) => {
    setSelectedVideo(video);
  }, []);

  return (
    <div className="min-h-[100dvh] pb-8">
      {/* Layer 1: Hero / Quick Start */}
      <HeroSection video={heroVideo} texts={texts} />

      {/* Layer 2: Latest Videos */}
      <LatestVideosSection
        featureVideos={featureVideos}
        scenarioVideos={scenarioVideos}
        texts={texts}
        difficultyLevels={difficultyLevels}
        onVideoSelect={handleVideoSelect}
      />

      {/* Layer 3: Tabbed Content (Feature Demos + Scenarios) */}
      <TabbedContentSection
        featureVideos={featureVideos}
        scenarioVideos={scenarioVideos}
        featureCategories={featureCategories}
        difficultyLevels={difficultyLevels}
        texts={texts}
        onVideoSelect={handleVideoSelect}
      />

      {/* Footer */}
      <FooterCta texts={texts} />

      {/* Video Playback Dialog */}
      <Dialog
        open={selectedVideo !== null}
        onOpenChange={() => setSelectedVideo(null)}
      >
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-background rounded-xl">
          <DialogHeader className="p-5 pb-0">
            <DialogTitle className="text-base font-semibold">
              {selectedVideo?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-zinc-950">
            {selectedVideo && selectedVideo.videoUrl ? (
              <video
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                className="w-full h-full"
                poster={selectedVideo.thumbnail}
              >
                {texts.unsupportedVideo}
              </video>
            ) : selectedVideo ? (
              <img
                src={selectedVideo.thumbnail}
                alt={selectedVideo.title}
                className="w-full h-full object-contain"
              />
            ) : null}
          </div>
          <div className="p-5 pt-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {selectedVideo?.description}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VideoShowcase;
